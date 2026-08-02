import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * Regressão dos bugs achados no ciclo de caça a bugs. Cada um destes estava 100% quebrado
 * em produção e nenhum teste existente falhava — é essa a lacuna que este arquivo fecha.
 */
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

describe('B1 — POST /api/whatsapp/cloud/credenciais', () => {
  // Gravava `estadoConexao`, coluna removida de EmpresaWhatsapp na migration
  // 20260616000000. O Prisma rejeita argumento desconhecido na validação, então TODA
  // chamada estourava PrismaClientValidationError → 500. O provider Cloud era
  // impossível de configurar e nada apontava para a causa.
  it('salva as credenciais e cifra o token em repouso', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B1');

    const res = await request(app)
      .post('/api/whatsapp/cloud/credenciais')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ phoneNumberId: '123456789', wabaId: 'waba-1', accessToken: 'segredo-meta' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const salvo = await prisma.empresaWhatsapp.findUnique({ where: { empresaId: A.empresaId } });
    expect(salvo).not.toBeNull();
    expect(salvo.provider).toBe('cloud');
    expect(salvo.phoneNumberId).toBe('123456789');
    // O token nunca pode ficar em claro no banco.
    expect(salvo.accessTokenEnc).toBeTruthy();
    expect(salvo.accessTokenEnc).not.toContain('segredo-meta');
  });

  it('é idempotente: salvar duas vezes atualiza em vez de duplicar', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B1b');
    const enviar = (phoneNumberId) =>
      request(app)
        .post('/api/whatsapp/cloud/credenciais')
        .set('Authorization', `Bearer ${A.token}`)
        .send({ phoneNumberId, accessToken: 'tok' });

    expect((await enviar('111')).status).toBe(200);
    expect((await enviar('222')).status).toBe(200);

    const linhas = await prisma.empresaWhatsapp.findMany({ where: { empresaId: A.empresaId } });
    expect(linhas).toHaveLength(1);
    expect(linhas[0].phoneNumberId).toBe('222');
  });
});

describe('B2 — DELETE /me/conta com assinatura existente', () => {
  // Assinatura tem FK obrigatória para Empresa sem onDelete (= RESTRICT) e ficou de fora
  // do $transaction do cascade. Resultado: a exclusão de conta (LGPD / requisito da Play
  // Store) falhava com 500 para todo cliente que já tivesse iniciado um checkout —
  // exatamente a base pagante — e a mensagem não dava nenhuma pista da causa.
  it('apaga a empresa mesmo quando existe Assinatura vinculada', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B2');
    // T-BILL-06: o registro já cria a Assinatura(trialing) da empresa — upsert
    // simula "assinatura ativa vinculada" sem colidir com a unique de empresaId.
    await prisma.assinatura.upsert({
      where: { empresaId: A.empresaId },
      create: { empresaId: A.empresaId, status: 'ativa', stripeCustomerId: 'cus_teste_123' },
      update: { status: 'ativa', stripeCustomerId: 'cus_teste_123' },
    });

    const res = await request(app)
      .delete('/api/me/conta')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ senha: 'SenhaForte1!' });

    expect(res.status).toBe(200);
    expect(res.body.escopo).toBe('empresa');
    expect(await prisma.empresa.findUnique({ where: { id: A.empresaId } })).toBeNull();
    expect(await prisma.assinatura.count({ where: { empresaId: A.empresaId } })).toBe(0);
  });
});

describe('B8 — PATCH /tecnicos/:id canoniza o telefone', () => {
  // O POST canonizava e o PATCH gravava o valor cru. Como o bot resolve o remetente por
  // dígitos, editar o número pelo painel fazia o técnico deixar de ser reconhecido no
  // WhatsApp (ponto e serviço passavam a cair em "número não reconhecido").
  it('grava o telefone canônico e preserva o formatado para exibição', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B8');
    const criado = await request(app)
      .post('/api/tecnicos')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ nome: 'Téc B8', comissao: 10, criarAcesso: false });
    expect(criado.status).toBe(201);

    const res = await request(app)
      .patch(`/api/tecnicos/${criado.body.id}`)
      .set('Authorization', `Bearer ${A.token}`)
      .send({ telefone: '(21) 99876-5432' });
    expect(res.status).toBe(200);

    const tec = await prisma.tecnico.findUnique({ where: { id: criado.body.id } });
    expect(tec.telefone).toMatch(/^\d+$/); // só dígitos — casável por variantesTelefone
    expect(tec.telefone).toContain('998765432');
    expect(tec.telefoneDisplay).toBe('(21) 99876-5432');
  });
});

describe('B10 — paginação com parâmetro inválido', () => {
  // `Math.max(1, parseInt('abc'))` é NaN, que ia como take/skip para o Prisma e virava
  // 500, com totalPages serializado como null.
  it('cai no padrão em vez de estourar 500', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B10');
    const res = await request(app)
      .get('/api/servicos?limit=abc&page=xyz')
      .set('Authorization', `Bearer ${A.token}`);

    expect(res.status).toBe(200);
    expect(Number.isFinite(res.body.totalPages ?? 0)).toBe(true);
  });
});

describe('B6 — funcionário não descarta materiais em silêncio', () => {
  // Antes: `materiais = []` zerava a lista sem avisar. O app recebia 201, o técnico via
  // sucesso, e os itens não existiam — sem vínculo, sem baixa, com o estoque divergindo
  // do real e nenhum sinal de que algo se perdeu.
  it('recusa explicitamente em vez de aceitar e ignorar', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'B6');
    const tec = await request(app)
      .post('/api/tecnicos')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ nome: 'Func B6', telefone: '5521998887766', comissao: 20, criarAcesso: true });
    expect(tec.status).toBe(201);

    const pin = tec.body.acesso.pin;
    const login = await request(app)
      .post('/api/auth/login')
      .send({ telefone: '5521998887766', password: pin });
    const troca = await request(app)
      .patch('/api/me/senha')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ senhaAtual: pin, novaSenha: 'NovaSenhaForte1!' });

    const mat = await request(app)
      .post('/api/materiais')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ nome: 'Fechadura B6', quantidadeAtual: 10, precoUnit: 50 });

    const res = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${troca.body.token}`)
      .send({
        local: 'Casa',
        descricao: 'Troca',
        valorCobrado: 200,
        valorMaterial: 50,
        materiais: [{ materialId: mat.body.id, quantidade: 1 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('materiais_nao_permitidos');
  });
});
