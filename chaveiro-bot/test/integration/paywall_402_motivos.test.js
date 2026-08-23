/**
 * F4-05 — a matriz do paywall, motivo a motivo, contra a API real.  [GAP-BILL-01 · aceitação]
 *
 * `assinaturaDaAcesso` é pura e cada ramo dela vira uma linha aqui: semeia-se a Assinatura no
 * estado exato e bate-se numa rota de PRODUTO (GET /api/tecnicos). O contrato: 402 com o
 * MOTIVO específico — nunca um "sem acesso" genérico, porque o painel renderiza a explicação
 * e a ação a partir do motivo.
 *
 * E a ALLOWLIST VIVA: com assinatura morta, auth/billing/me continuam respondendo — barrar o
 * pagamento de quem quer pagar seria o único erro fatal deste desenho (nota do middleware).
 *
 * Nota de conformidade (F0-07/T-BILL-04): o D-12 original previa 503; a decisão registrada
 * ficou em 402 fail-closed. Esta matriz fixa o comportamento DECIDIDO.
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

const DIA = 24 * 60 * 60 * 1000;
const futuro = () => new Date(Date.now() + 7 * DIA);
const passado = () => new Date(Date.now() - 7 * DIA);

async function empresaComAssinatura(estado) {
  const { token, empresaId } = await criarEmpresaComAdmin(request, app, `Pay${Math.random().toString(36).slice(2, 6)}`);
  if (estado === null) {
    await prisma.assinatura.deleteMany({ where: { empresaId } });
  } else {
    await prisma.assinatura.update({ where: { empresaId }, data: estado });
  }
  return { token, empresaId };
}

const rotaProduto = (token) =>
  request(app).get('/api/tecnicos').set('Authorization', `Bearer ${token}`);

describe('paywall — 402 por motivo (assinaturaDaAcesso ramo a ramo)', () => {
  it.each([
    ['SEM_ASSINATURA', null],
    ['TRIAL_VENCIDO', { status: 'trialing', trialFimEm: passado() }],
    ['TRIAL_SEM_PRAZO', { status: 'trialing', trialFimEm: null }],
    ['PAST_DUE', { status: 'past_due' }],
    ['UNPAID', { status: 'unpaid' }],
    ['INCOMPLETE', { status: 'incomplete' }],
    ['CANCELED', { status: 'canceled', periodoFimEm: null }],
    ['CANCELED', { status: 'canceled', periodoFimEm: passado() }],
    ['PERIODO_ENCERRADO', { status: 'active', periodoFimEm: passado() }],
    ['STATUS_NAO_CLASSIFICADO_paused', { status: 'paused' }],
  ])('barra com motivo %s', async (motivo, estado) => {
    const { token } = await empresaComAssinatura(estado);
    const r = await rotaProduto(token);
    expect(r.status).toBe(402);
    expect(r.body.motivo).toBe(motivo);
    expect(r.body.acao).toBeTruthy(); // o painel mostra a saída, não só o muro
  });

  it.each([
    ['TRIAL_EM_CURSO', { status: 'trialing', trialFimEm: futuro() }],
    ['ATIVA', { status: 'active', periodoFimEm: futuro() }],
    ['ATIVA sem período registrado', { status: 'active', periodoFimEm: null }],
    ['PERIODO_PAGO_EM_CURSO (cancelada, mas paga)', { status: 'canceled', periodoFimEm: futuro() }],
  ])('libera: %s', async (_nome, estado) => {
    const { token } = await empresaComAssinatura(estado);
    const r = await rotaProduto(token);
    expect(r.status).toBe(200);
  });
});

describe('paywall — allowlist viva com assinatura morta', () => {
  it('auth, billing e /me respondem; produto barra — na MESMA sessão', async () => {
    const { token } = await empresaComAssinatura({ status: 'canceled', periodoFimEm: null });

    // Produto: barrado.
    expect((await rotaProduto(token)).status).toBe(402);

    // /me: o painel precisa saber quem é o usuário para RENDERIZAR o paywall.
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);

    // /billing/status: quem quer pagar consegue ver o estado…
    const status = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${token}`);
    expect(status.status).toBe(200);
    expect(status.body.status).toBe('canceled');

    // …e /auth/login continua aberto (sem login não há como chegar ao checkout).
    const relogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'x', password: 'y' });
    expect([400, 401]).toContain(relogin.status); // credencial errada, nunca 402
  });

  it('2FA continua administrável com assinatura morta — segurança não depende de cobrança', async () => {
    const { token } = await empresaComAssinatura({ status: 'unpaid' });
    const setup = await request(app)
      .post('/api/me/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(setup.status).toBe(200);
  });
});
