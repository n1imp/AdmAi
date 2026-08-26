/**
 * IDOR cross-tenant nas rotas de ESCRITA por id.  [Feature PRODUCT_INTEGRITY · P1]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   `tools/admai-delivery/tenant-coverage.mjs` mediu a cobertura: das 60 rotas escopadas por
 *   empresa, 37 não eram nomeadas por nenhum teste cross-tenant. `idor.test.js` já cobre três
 *   casos — PATCH em técnico, listagem de técnicos e DELETE de material.
 *
 *   As lacunas escolhidas aqui não foram as primeiras da lista: foram as de maior consequência
 *   segundo o critério que o próprio achado registrou — **escrita, com `:id` de outra empresa
 *   alcançável, e efeito que não se desfaz sozinho**:
 *
 *     POST /tecnicos/:id/acesso          cria CREDENCIAL de acesso ao painel
 *     POST /tecnicos/:id/acesso/reset    redefine PIN de acesso
 *     POST /servicos/:id/aprovar         muda estado de serviço de outra empresa
 *     POST /servicos/:id/rejeitar        idem
 *     PATCH /materiais/:id               altera preço/nome de material alheio
 *     POST /materiais/:id/movimentacao   move estoque alheio
 *
 *   As duas primeiras são a pior classe: se vazassem, uma empresa criaria credencial de acesso
 *   dentro de outra. Um teste de leitura não pega isso.
 *
 * O CONTRATO ESPERADO
 *   404, não 403. O padrão do repositório (`idor.test.js`) é não vazar existência: 403 diria
 *   "existe, mas você não pode", que confirma o id para quem está sondando.
 *
 * O QUE ESTE ARQUIVO NÃO PROVA
 *   Isolamento das rotas que ele não exercita. A lista acima é o escopo, e o veredito de cobertura
 *   continua sendo do instrumento, não desta suíte.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
});
afterAll(async () => {
  await prisma.$disconnect();
});

/** Duas empresas independentes, cada uma com seu admin. */
async function duasEmpresas() {
  const a = await criarEmpresaComAdmin(request, app, `A${Date.now() % 10000}`);
  const b = await criarEmpresaComAdmin(request, app, `B${(Date.now() + 1) % 10000}`);
  return { a, b };
}

/**
 * Cria técnico SEM acesso ao painel.
 *
 * O telefone é necessário porque `criarAcessoTecnico` o usa como identidade de login — mas
 * `POST /tecnicos` tem `if (d.criarAcesso !== false && canonico)`, ou seja: telefone presente e
 * `criarAcesso` omitido já cria a credencial junto. Sem `criarAcesso: false` o técnico nasceria
 * com acesso, e os testes de `/acesso` mediriam 409 ("já tem acesso") em vez do isolamento.
 */
async function criarTecnico(token, nome) {
  const telefone = '5541' + String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9);
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, telefone, comissao: 10, criarAcesso: false });
  expect(res.status, `pré-condição: criar técnico devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarMaterial(token, nome) {
  const res = await request(app)
    .post('/api/materiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, precoUnit: 25 });
  expect(res.status, `pré-condição: criar material devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

describe('IDOR cross-tenant — ESCRITA por id (PRODUCT_INTEGRITY)', () => {
  describe('credenciais de acesso: a classe de maior consequência', () => {
    it('empresa A não cria acesso para o técnico da empresa B → 404', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      const res = await request(app)
        .post(`/api/tecnicos/${tecnicoDeB.id}/acesso`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({});

      expect(
        res.status,
        'criar credencial dentro de outra empresa é a pior falha desta família'
      ).toBe(404);

      /* Não basta a resposta: o efeito não pode ter acontecido. Uma rota que responde 404 DEPOIS
         de gravar continua sendo vazamento — e é um erro plausível de ordem de operações. */
      const tecnico = await prisma.tecnico.findUnique({
        where: { id: tecnicoDeB.id },
        select: { usuarioId: true },
      });
      expect(
        tecnico?.usuarioId,
        'o técnico de B não pode ter ganhado usuário por ação de A'
      ).toBeFalsy();
    });

    it('empresa A não reseta o acesso do técnico da empresa B → 404', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      await request(app)
        .post(`/api/tecnicos/${tecnicoDeB.id}/acesso`)
        .set('Authorization', `Bearer ${b.token}`)
        .send({});

      const res = await request(app)
        .post(`/api/tecnicos/${tecnicoDeB.id}/acesso/reset`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({});

      expect(res.status).toBe(404);
    });
  });

  describe('estado de serviço', () => {
    it('empresa A não aprova serviço da empresa B → 404', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      const criado = await request(app)
        .post('/api/servicos')
        .set('Authorization', `Bearer ${b.token}`)
        .send({
          // Como DONO, a rota exige `tecnico` por NOME (string), nao tecnicoId:
          // `buscarOuCriarTecnico(dados.tecnico, empresaId)` resolve dentro do tenant.
          tecnico: tecnicoDeB.nome,
          local: 'Rua B, 100',
          descricao: 'Servico da empresa B',
          valorCobrado: 100,
          valorMaterial: 0,
          clienteNome: 'Cliente de B',
        });
      expect(
        criado.status,
        `pré-condição: criar serviço em B devia dar 201, deu ${criado.status}`
      ).toBe(201);

      const res = await request(app)
        .post(`/api/servicos/${criado.body.id}/aprovar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({});

      expect(res.status).toBe(404);
    });

    it('empresa A não rejeita serviço da empresa B → 404', async () => {
      const { a, b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      const criado = await request(app)
        .post('/api/servicos')
        .set('Authorization', `Bearer ${b.token}`)
        .send({
          // Como DONO, a rota exige `tecnico` por NOME (string), nao tecnicoId:
          // `buscarOuCriarTecnico(dados.tecnico, empresaId)` resolve dentro do tenant.
          tecnico: tecnicoDeB.nome,
          local: 'Rua B, 100',
          descricao: 'Servico da empresa B',
          valorCobrado: 100,
          valorMaterial: 0,
          clienteNome: 'Cliente de B',
        });
      expect(criado.status).toBe(201);

      const res = await request(app)
        .post(`/api/servicos/${criado.body.id}/rejeitar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ motivo: 'tentativa cross-tenant' });

      expect(res.status).toBe(404);
    });
  });

  describe('estoque alheio', () => {
    it('empresa A não altera material da empresa B → 404, e o dado não muda', async () => {
      const { a, b } = await duasEmpresas();
      const materialDeB = await criarMaterial(b.token, 'Material de B');

      const res = await request(app)
        .patch(`/api/materiais/${materialDeB.id}`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ nome: 'Renomeado por A', precoUnit: 9999 });

      expect(res.status).toBe(404);

      const depois = await prisma.material.findUnique({ where: { id: materialDeB.id } });
      expect(depois.nome, 'o material de B não pode ter sido renomeado por A').toBe(
        'Material de B'
      );
    });

    it('empresa A não movimenta estoque da empresa B → 404, e o saldo não muda', async () => {
      const { a, b } = await duasEmpresas();
      const materialDeB = await criarMaterial(b.token, 'Material de B');

      const antes = await prisma.material.findUnique({
        where: { id: materialDeB.id },
        select: { quantidadeAtual: true },
      });

      const res = await request(app)
        .post(`/api/materiais/${materialDeB.id}/movimentacao`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ tipo: 'entrada', quantidade: 50 });

      expect(res.status).toBe(404);

      const depois = await prisma.material.findUnique({
        where: { id: materialDeB.id },
        select: { quantidadeAtual: true },
      });
      expect(depois.quantidadeAtual, 'o saldo de B não pode ter mudado por ação de A').toBe(
        antes.quantidadeAtual
      );

      const movimentacoes = await prisma.movimentacaoEstoque.count({
        where: { materialId: materialDeB.id },
      });
      expect(movimentacoes, 'nenhuma movimentação deve ter sido registrada').toBe(0);
    });
  });

  /* CONTROLE POSITIVO — sem ele, a suíte inteira passaria com um servidor que respondesse 404 a
     tudo. Cada 404 acima só significa isolamento porque o dono legítimo obtém sucesso no MESMO
     endpoint com o MESMO id. */
  describe('controle positivo: o dono legítimo consegue', () => {
    it('empresa B altera o próprio material e cria acesso ao próprio técnico', async () => {
      const { b } = await duasEmpresas();
      const materialDeB = await criarMaterial(b.token, 'Material de B');
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

      const patch = await request(app)
        .patch(`/api/materiais/${materialDeB.id}`)
        .set('Authorization', `Bearer ${b.token}`)
        .send({ nome: 'Renomeado pelo dono' });
      expect(
        patch.status,
        'o dono precisa conseguir — senão os 404 acima não provam isolamento'
      ).toBe(200);

      const acesso = await request(app)
        .post(`/api/tecnicos/${tecnicoDeB.id}/acesso`)
        .set('Authorization', `Bearer ${b.token}`)
        .send({});
      expect([200, 201]).toContain(acesso.status);
    });
  });
});
