import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock parcial do gateway WhatsApp: evita envio real de OTP/mensagem (padrão já
// usado em outros testes deste projeto).
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

/**
 * Security Closure Final — Categoria B: `billing.js` e `google.js` não tinham
 * NENHUM teste de integração, positivo ou negativo (achado do relatório anterior).
 * Este arquivo valida EXCLUSIVAMENTE a execução real dos middlewares (requireAuth,
 * adminOnly, requirePermissao) via HTTP — não audita regra de negócio (Stripe/Google
 * Business API não são chamados: os testes 401/403 nunca alcançam o handler, e o
 * único teste "autorizado" de billing/portal e google/status são endpoints que só
 * leem o próprio banco, sem tocar APIs externas).
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

describe('billing.js — requireAuth/adminOnly executam de verdade', () => {
  it('POST /api/billing/checkout sem token → 401', async () => {
    const res = await request(app).post('/api/billing/checkout').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/billing/checkout com funcionário (sem admin) → 403', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'BillingCheckoutFunc');
    const func = await criarFuncionarioComAcesso(request, app, A.token, {
      nome: 'FuncBillingCheckout',
    });

    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${func.token}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('POST /api/billing/checkout com dono → passa pelo guard (nunca 401/403)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'BillingCheckoutDono');

    const res = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${A.token}`)
      .send({});

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('POST /api/billing/portal sem token → 401', async () => {
    const res = await request(app).post('/api/billing/portal').send({});
    expect(res.status).toBe(401);
  });

  it('POST /api/billing/portal com funcionário (sem admin) → 403', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'BillingPortalFunc');
    const func = await criarFuncionarioComAcesso(request, app, A.token, {
      nome: 'FuncBillingPortal',
    });

    const res = await request(app)
      .post('/api/billing/portal')
      .set('Authorization', `Bearer ${func.token}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('POST /api/billing/portal com dono, sem assinatura Stripe ativa → 400 (passou do guard, parou na regra de negócio)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'BillingPortalDono');

    const res = await request(app)
      .post('/api/billing/portal')
      .set('Authorization', `Bearer ${A.token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.erro).toBe('Sem assinatura ativa');
  });

  it('GET /api/billing/status sem token → 401', async () => {
    const res = await request(app).get('/api/billing/status');
    expect(res.status).toBe(401);
  });

  it('GET /api/billing/status com qualquer usuário autenticado (sem exigir admin) → 200', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'BillingStatusFunc');
    const func = await criarFuncionarioComAcesso(request, app, A.token, {
      nome: 'FuncBillingStatus',
    });

    const res = await request(app)
      .get('/api/billing/status')
      .set('Authorization', `Bearer ${func.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });
});

describe('google.js — requireAuth/requirePermissao executam de verdade', () => {
  it('GET /api/google/status sem token → 401', async () => {
    const res = await request(app).get('/api/google/status');
    expect(res.status).toBe(401);
  });

  it('GET /api/google/status com funcionário (sem avaliacoes.ver) → 403', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'GoogleStatusFunc');
    const func = await criarFuncionarioComAcesso(request, app, A.token, {
      nome: 'FuncGoogleStatus',
    });

    const res = await request(app)
      .get('/api/google/status')
      .set('Authorization', `Bearer ${func.token}`);

    expect(res.status).toBe(403);
  });

  it('GET /api/google/status com dono (avaliacoes.ver via preset total) → 200, isolado por tenant', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'GoogleStatusDono');

    const res = await request(app)
      .get('/api/google/status')
      .set('Authorization', `Bearer ${A.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('modo');
    expect(res.body.conectado).toBe(false);
  });
});
