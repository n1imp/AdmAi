/**
 * IDOR cross-tenant nas rotas de LEITURA por id.  [Feature PRODUCT_INTEGRITY · P1]
 *
 * COMO ESTAS ROTAS FORAM ESCOLHIDAS
 *   `tools/admai-delivery/tenant-coverage.mjs` deixou de tratar toda lacuna como igual. Ele passou
 *   a classificar a EXPOSIÇÃO: uma rota só sofre IDOR se o atacante fornecer o identificador do
 *   recurso. As auto-escopadas (`/me/*` sem `:id`) derivam o alvo do token, e escrever "negativo
 *   cross-tenant" para elas produziria teste que passa sempre sem medir nada.
 *
 *   Sobraram estas, com `:id` na URL e sem negativo que as nomeie:
 *
 *     GET /servicos/:id                  detalhe de serviço alheio
 *     DELETE /servicos/:id               apagar serviço alheio — escrita, e destrutiva
 *     GET /materiais/:id/movimentacoes   histórico de estoque alheio
 *     GET /tecnicos/:id/perfil           dados pessoais de técnico de outra empresa
 *     GET /tecnicos/:id/ponto            jornada de técnico de outra empresa
 *
 *   As duas últimas são as mais sensíveis por conteúdo: perfil e ponto carregam dado pessoal e
 *   trabalhista. Vazamento ali não é só quebra de isolamento, é exposição de PII de terceiro.
 *
 * O CONTRATO ESPERADO
 *   404, não 403 — o padrão de `idor.test.js`. 403 confirmaria a existência do id para quem sonda.
 *
 * O QUE ESTE ARQUIVO NÃO PROVA
 *   Isolamento das rotas que não exercita, nem das auto-escopadas por token, cuja ameaça é outra
 *   (autenticação/sessão) e pede outro instrumento.
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

async function duasEmpresas() {
  const a = await criarEmpresaComAdmin(request, app, `LA${Date.now() % 10000}`);
  const b = await criarEmpresaComAdmin(request, app, `LB${(Date.now() + 7) % 10000}`);
  return { a, b };
}

/** Técnico SEM acesso ao painel — `criarAcesso: false`, senão a rota cria credencial junto. */
async function criarTecnico(token, nome) {
  const telefone = '5551' + String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9);
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, telefone, comissao: 15, criarAcesso: false });
  expect(res.status, `pré-condição: criar técnico devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarServico(token, tecnicoNome, local) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      tecnico: tecnicoNome,
      local,
      descricao: 'Servico para teste de isolamento',
      valorCobrado: 200,
      valorMaterial: 0,
    });
  expect(res.status, `pré-condição: criar serviço devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

async function criarMaterial(token, nome) {
  const res = await request(app)
    .post('/api/materiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, precoUnit: 30 });
  expect(res.status, `pré-condição: criar material devia dar 201, deu ${res.status}`).toBe(201);
  return res.body;
}

describe('IDOR cross-tenant — LEITURA por id (PRODUCT_INTEGRITY)', () => {
  it('empresa A não lê o serviço da empresa B → 404, e nada do conteúdo vaza', async () => {
    const { a, b } = await duasEmpresas();
    const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');
    const servicoDeB = await criarServico(b.token, tecnicoDeB.nome, 'Rua Secreta de B, 42');

    const res = await request(app)
      .get(`/api/servicos/${servicoDeB.id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);

    /* Não basta o status: o corpo do 404 não pode carregar o dado por descuido — um handler que
       busca primeiro e responde 404 depois pode acabar serializando o que encontrou. */
    const corpo = JSON.stringify(res.body ?? {});
    expect(corpo, 'o local do serviço de B não pode aparecer na resposta dada a A').not.toContain(
      'Rua Secreta de B'
    );
  });

  it('empresa A não apaga o serviço da empresa B → 404, e o serviço continua existindo', async () => {
    const { a, b } = await duasEmpresas();
    const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');
    const servicoDeB = await criarServico(b.token, tecnicoDeB.nome, 'Rua de B, 10');

    const res = await request(app)
      .delete(`/api/servicos/${servicoDeB.id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);

    const aindaExiste = await prisma.servico.findUnique({ where: { id: servicoDeB.id } });
    expect(aindaExiste, 'o serviço de B não pode ter sido apagado por A').not.toBeNull();
  });

  it('empresa A não lê as movimentações de estoque da empresa B → 404', async () => {
    const { a, b } = await duasEmpresas();
    const materialDeB = await criarMaterial(b.token, 'Material de B');

    await request(app)
      .post(`/api/materiais/${materialDeB.id}/movimentacao`)
      .set('Authorization', `Bearer ${b.token}`)
      .send({ tipo: 'entrada', quantidade: 10 });

    const res = await request(app)
      .get(`/api/materiais/${materialDeB.id}/movimentacoes`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
  });

  it('empresa A não lê o perfil do técnico da empresa B → 404 (dado pessoal de terceiro)', async () => {
    const { a, b } = await duasEmpresas();
    const tecnicoDeB = await criarTecnico(b.token, 'Fulano Sobrenome de B');

    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoDeB.id}/perfil`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body ?? {}), 'o nome do técnico de B não pode vazar').not.toContain(
      'Fulano Sobrenome de B'
    );
  });

  it('empresa A não lê o ponto do técnico da empresa B → 404 (dado trabalhista de terceiro)', async () => {
    const { a, b } = await duasEmpresas();
    const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

    /* `?mes=YYYY-MM` é obrigatório e validado ANTES da checagem de tenant. Sem ele a rota devolve
       400 e o teste não teria chegado perto do isolamento — mediria a validação de entrada, não a
       fronteira. Um 404 só significa isolamento quando a requisição é, de resto, válida. */
    const res = await request(app)
      .get(`/api/tecnicos/${tecnicoDeB.id}/ponto?mes=2026-08`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
  });

  /**
   * O relatório de ponto é o vetor de IDOR que faltava cobrir — e é o mais sensível dos que
   * restavam: devolve arquivo (PDF ou CSV) com jornada nominal de uma pessoa.
   *
   * A checagem de existência da rota é `req.db.tecnico.findUnique({ where: { id } })`. Se a
   * extensão de tenant não alcançar `findUnique`, A passa do 404 e o relatório é gerado — com
   * `empresaId` de A e `tecnicoId` de B. O conteúdo provavelmente sairia vazio, e é justamente
   * isso que torna o caso traiçoeiro: resposta 200 com arquivo válido e vazio parece sucesso.
   * Por isso o teste exige 404, e não "corpo sem dado".
   *
   * `?mes=YYYY-MM` é validado ANTES do tenant: sem ele a rota devolve 400 e o teste mediria a
   * validação de entrada, não a fronteira.
   */
  it('empresa A não baixa o relatório de ponto do técnico da empresa B → 404 (jornada nominal)', async () => {
    const { a, b } = await duasEmpresas();
    const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');

    for (const formato of ['pdf', 'csv']) {
      const res = await request(app)
        .get(`/api/tecnicos/${tecnicoDeB.id}/ponto/relatorio?mes=2026-08&formato=${formato}`)
        .set('Authorization', `Bearer ${a.token}`);
      expect(
        res.status,
        `formato ${formato}: relatório de jornada de terceiro precisa dar 404`
      ).toBe(404);
      expect(
        String(res.headers['content-disposition'] ?? ''),
        `formato ${formato}: nenhum anexo pode ser oferecido`
      ).not.toContain('attachment');
    }
  });

  /* CONTROLE POSITIVO — sem ele, um servidor que respondesse 404 a tudo passaria em todos os
     casos acima. Cada 404 só significa isolamento porque o dono legítimo obtém 200 no MESMO
     endpoint com o MESMO id. */
  describe('controle positivo: o dono legítimo lê os próprios recursos', () => {
    it('empresa B lê o próprio serviço, o próprio perfil e as próprias movimentações', async () => {
      const { b } = await duasEmpresas();
      const tecnicoDeB = await criarTecnico(b.token, 'Tecnico de B');
      const servicoDeB = await criarServico(b.token, tecnicoDeB.nome, 'Rua de B, 99');
      const materialDeB = await criarMaterial(b.token, 'Material de B');

      const servico = await request(app)
        .get(`/api/servicos/${servicoDeB.id}`)
        .set('Authorization', `Bearer ${b.token}`);
      expect(
        servico.status,
        'o dono precisa conseguir — senão os 404 acima não provam isolamento'
      ).toBe(200);

      const perfil = await request(app)
        .get(`/api/tecnicos/${tecnicoDeB.id}/perfil`)
        .set('Authorization', `Bearer ${b.token}`);
      expect(perfil.status).toBe(200);

      const movs = await request(app)
        .get(`/api/materiais/${materialDeB.id}/movimentacoes`)
        .set('Authorization', `Bearer ${b.token}`);
      expect(movs.status).toBe(200);

      /* O 404 do relatório de ponto só prova isolamento porque o dono obtém o arquivo no MESMO
         endpoint com o MESMO id — senão bastaria a rota estar quebrada para "passar". */
      const relatorio = await request(app)
        .get(`/api/tecnicos/${tecnicoDeB.id}/ponto/relatorio?mes=2026-08&formato=csv`)
        .set('Authorization', `Bearer ${b.token}`);
      expect(
        relatorio.status,
        'o dono precisa baixar o próprio relatório — senão o 404 acima é vácuo'
      ).toBe(200);
    });
  });
});
