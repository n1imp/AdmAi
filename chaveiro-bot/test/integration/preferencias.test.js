/**
 * Teste de integração — preferências de dashboard do usuário (F9/M5).
 * Persistência server-side (cross-device) da ordem/visibilidade dos widgets. Cobre:
 * default (sem prefs → null), round-trip PUT/GET, merge preservando outros namespaces,
 * validação Zod (400), isolamento por usuário e exigência de autenticação.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

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

describe('Preferências de dashboard (F9/M5)', () => {
  it('GET sem prefs salvas → dashboard: null (painel usa os defaults locais)', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'P1');
    const res = await request(app)
      .get('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.dashboard).toBeNull();
  });

  it('PUT persiste e GET devolve (round-trip)', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'P2');
    const prefs = { ordem: ['receita', 'ranking', 'meta'], ocultos: ['meta'] };
    const put = await request(app)
      .put('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .send(prefs);
    expect(put.status).toBe(200);
    expect(put.body.dashboard).toEqual(prefs);

    const get = await request(app)
      .get('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${token}`);
    expect(get.body.dashboard).toEqual(prefs);
  });

  it('PUT preserva outros namespaces de preferencias (merge, só mexe em .dashboard)', async () => {
    const { token, userId } = await criarEmpresaComAdmin(request, app, 'P3');
    // Semeia um namespace alheio direto no banco.
    await prisma.usuario.update({
      where: { id: userId },
      data: { preferencias: { tema: 'escuro' } },
    });

    await request(app)
      .put('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .send({ ordem: ['a'], ocultos: [] });

    const u = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { preferencias: true },
    });
    expect(u.preferencias.tema).toBe('escuro'); // preservado
    expect(u.preferencias.dashboard).toEqual({ ordem: ['a'], ocultos: [] });
  });

  it('valida o corpo (ordem não-array → 400)', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'P4');
    const res = await request(app)
      .put('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .send({ ordem: 'nao-array', ocultos: [] });
    expect(res.status).toBe(400);
  });

  it('isolamento por usuário: as prefs de um não vazam para outro', async () => {
    const a = await criarEmpresaComAdmin(request, app, 'PA');
    const b = await criarEmpresaComAdmin(request, app, 'PB');
    await request(app)
      .put('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ ordem: ['x'], ocultos: [] });

    const getB = await request(app)
      .get('/api/me/preferencias/dashboard')
      .set('Authorization', `Bearer ${b.token}`);
    expect(getB.body.dashboard).toBeNull();
  });

  it('exige autenticação (401 sem token)', async () => {
    const res = await request(app).get('/api/me/preferencias/dashboard');
    expect(res.status).toBe(401);
  });
});
