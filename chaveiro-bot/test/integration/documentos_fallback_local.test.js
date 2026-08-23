/**
 * F4-03 — o que faltava na matriz de documentos: SEM autenticação e a integridade do
 * fallback local byte a byte.
 *
 * O resto da matriz já tem dono: CRUD own-only, posse (404), multi-tenant (404), RBAC (403),
 * flag off (404 inerte) e magic-byte em documentos.test.js; o ramo de storage (bucket ausente,
 * chave server-side, sem fallback silencioso) em documentos_storage.test.js. Aqui: os quatro
 * endpoints respondem 401 SEM token — a porta não depende de flag nem de vínculo para negar —
 * e o arquivo baixado do fallback local é IDÊNTICO ao enviado (integridade, não só status).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app;

beforeAll(() => {
  vi.stubEnv('DOCUMENTOS_ENABLED', 'true');
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await prisma.$disconnect();
});

describe('documentos — negação sem autenticação', () => {
  it('os 4 endpoints respondem 401 sem token, antes de qualquer outra decisão', async () => {
    expect((await request(app).get('/api/me/documentos')).status).toBe(401);
    expect((await request(app).post('/api/me/documentos').send({})).status).toBe(401);
    expect((await request(app).get('/api/me/documentos/1/arquivo')).status).toBe(401);
    expect((await request(app).delete('/api/me/documentos/1')).status).toBe(401);
  });
});

describe('documentos — integridade do fallback local', () => {
  it('o arquivo baixado é byte a byte o que foi enviado', async () => {
    const { token: tokenDono } = await criarEmpresaComAdmin(request, app, 'DocInt');
    const { token } = await criarFuncionarioComAcesso(request, app, tokenDono, {
      nome: 'Func Docs',
    });

    const enviado = Buffer.from(PNG_DATA_URI.split(',')[1], 'base64');
    const up = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo: 'rg', nome: 'rg.png', arquivo: PNG_DATA_URI });
    expect(up.status).toBe(201);

    const id = up.body.documento.id;

    const baixado = await request(app)
      .get(`/api/me/documentos/${id}/arquivo`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const pedacos = [];
        res.on('data', (d) => pedacos.push(d));
        res.on('end', () => cb(null, Buffer.concat(pedacos)));
      });
    expect(baixado.status).toBe(200);
    expect(Buffer.compare(baixado.body, enviado)).toBe(0);
  });
});
