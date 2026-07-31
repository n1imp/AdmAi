import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../app.js';

/**
 * F10 — diretivas de CSP do backend. Usa uma rota inexistente (404): o helmet aplica os
 * headers antes do roteamento, então não precisa de banco nem passa por rate limiter
 * (os limiters vivem em /api e /webhook).
 */
let app;

beforeAll(() => {
  ({ app } = criarApp());
});

async function csp() {
  const res = await request(app).get('/rota-inexistente-so-para-headers');
  return res.headers['content-security-policy'] ?? '';
}

describe('headers de segurança (helmet)', () => {
  it('define frame-ancestors none (anti-clickjacking moderno)', async () => {
    expect(await csp()).toMatch(/frame-ancestors 'none'/);
  });

  it('define object-src none (fecha plugins legados)', async () => {
    expect(await csp()).toMatch(/object-src 'none'/);
  });

  it('define upgrade-insecure-requests', async () => {
    expect(await csp()).toMatch(/upgrade-insecure-requests/);
  });

  it('mantém as diretivas base já existentes (sem regressão)', async () => {
    const politica = await csp();
    expect(politica).toMatch(/default-src 'self'/);
    expect(politica).toMatch(/script-src 'self'/);
    expect(politica).toMatch(/connect-src 'self'/);
  });

  it('envia HSTS com includeSubDomains e preload', async () => {
    const res = await request(app).get('/rota-inexistente-so-para-headers');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=31536000/);
    expect(res.headers['strict-transport-security']).toMatch(/includeSubDomains/);
  });

  it('não vaza o X-Powered-By do Express', async () => {
    const res = await request(app).get('/rota-inexistente-so-para-headers');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
