/**
 * T-BILL-06 — toda empresa nova precisa nascer com um registro de `Assinatura`
 * (status `trialing`, `trialFimEm` = cadastro + 14 dias), sem nenhuma interação
 * com o Stripe. Antes desta correção, o registro só nascia (lazy) na primeira
 * vez que a empresa tocasse o Stripe (EV-032) — ficando "ausente" até lá, o que
 * o paywall (T-BILL-04) trata como estado indeterminado (503).
 *
 * Cobre os dois fluxos reais de criação de empresa self-service: POST
 * /auth/register (formulário) e POST /auth/oauth/:provedor (login social, 1º
 * acesso). NÃO cobre POST /setup — é o bootstrap único da plataforma antes de
 * existir qualquer usuário, um fluxo diferente, fora do escopo desta tarefa.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

// verificarIdToken mockado: o fluxo OAuth real exige GOOGLE_CLIENT_ID configurado
// (services/oauth.js:121, provedor "desabilitado" sem isso) e um JWKS de verdade —
// nenhum dos dois é o alvo deste teste (T-BILL-06 é sobre a Assinatura nascer
// junto com a empresa, não sobre a verificação de ID token em si, já coberta por
// src/services/__tests__/oauth.test.js). Mockar aqui pula essa dependência.
const { verificarIdTokenMock } = vi.hoisted(() => ({ verificarIdTokenMock: vi.fn() }));
vi.mock('../../src/services/oauth.js', async (orig) => ({
  ...(await orig()),
  verificarIdToken: verificarIdTokenMock,
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
  verificarIdTokenMock.mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function esperaTrialFimEmProximoDe14Dias(trialFimEm, referencia) {
  const dias = (new Date(trialFimEm) - referencia) / (24 * 60 * 60 * 1000);
  // Margem de alguns segundos pro tempo de execução do teste em si.
  expect(dias).toBeGreaterThan(13.999);
  expect(dias).toBeLessThan(14.01);
}

describe('Assinatura criada no cadastro (T-BILL-06)', () => {
  it('POST /api/auth/register cria Assinatura(trialing, trialFimEm=+14d) junto com a empresa', async () => {
    const antes = new Date();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        nome: 'Dono Trial',
        nomeEmpresa: 'Chaveiro Trial Ltda',
        username: `donoTrial${Date.now()}`,
        email: `dono.trial.${Date.now()}@example.com`,
        telefone: '5511988880002',
        senha: 'SenhaForte1!',
      });
    expect(res.status).toBe(201);

    const usuario = await prisma.usuario.findUnique({ where: { id: res.body.id } });
    const assinatura = await prisma.assinatura.findUnique({
      where: { empresaId: usuario.empresaId },
    });

    expect(assinatura).not.toBeNull();
    expect(assinatura.status).toBe('trialing');
    expect(assinatura.trialFimEm).not.toBeNull();
    expect(assinatura.stripeCustomerId).toBeNull();
    expect(assinatura.stripeSubId).toBeNull();
    esperaTrialFimEmProximoDe14Dias(assinatura.trialFimEm, antes);
  });

  it('POST /api/auth/oauth/:provedor (1º acesso) cria Assinatura(trialing, trialFimEm=+14d) junto com a empresa', async () => {
    const email = `oauth.${Date.now()}@example.com`;
    verificarIdTokenMock.mockResolvedValue({
      sub: `oauth-sub-${Date.now()}`,
      email,
      emailVerificado: true,
      nome: 'Dono OAuth',
    });

    const antes = new Date();
    const res = await request(app)
      .post('/api/auth/oauth/google')
      .send({ idToken: 'token-fake-mockado', nonce: 'nonce-fake' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');

    // payloadSessao() não devolve o id do usuário — busca por email, que é
    // único e controlado por este teste (via mock de verificarIdToken acima).
    const usuario = await prisma.usuario.findUnique({ where: { email } });
    expect(usuario).not.toBeNull();
    const assinatura = await prisma.assinatura.findUnique({
      where: { empresaId: usuario.empresaId },
    });

    expect(assinatura).not.toBeNull();
    expect(assinatura.status).toBe('trialing');
    esperaTrialFimEmProximoDe14Dias(assinatura.trialFimEm, antes);
  });
});
