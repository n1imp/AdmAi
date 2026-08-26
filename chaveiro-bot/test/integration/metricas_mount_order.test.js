/**
 * F4-06 — canário do mount-order.  [fragilidade registrada em F0]
 *
 * `metricas.js` NÃO tem requireAuth local: ele depende da POSIÇÃO em que é montado em
 * api.js (depois do auth global, depois da guarda de assinatura). Se alguém reordenar os
 * mounts, a rota nasce aberta — e nenhum teste unitário veria, porque o defeito é do
 * arranjo, não do arquivo. Este canário morre primeiro:
 *   sem token → 401 (o auth global cobre a rota);
 *   com token e assinatura morta → 402 (a guarda de assinatura cobre a rota).
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

describe('métricas — proteção por posição de mount', () => {
  it('sem token: 401 — o auth global alcança as rotas', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
    expect((await request(app).get('/api/metricas')).status).toBe(401);
  });

  it('com token e assinatura morta: 402 — a guarda de assinatura alcança a rota', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Canario');
    await prisma.assinatura.update({
      where: { empresaId },
      data: { status: 'canceled', periodoFimEm: null },
    });
    expect(
      (await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`)).status
    ).toBe(402);
    expect(
      (await request(app).get('/api/metricas').set('Authorization', `Bearer ${token}`)).status
    ).toBe(402);
  });

  it('com token e trial vivo: 200 — o canário não é falso-positivo', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'CanarioOk');
    const r = await request(app).get('/api/dashboard').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
  });
});
