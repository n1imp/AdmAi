import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

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

describe('POST /api/setup', () => {
  it('cria o primeiro admin + empresa em banco vazio', async () => {
    const res = await request(app).post('/api/setup').send({
      nome: 'Dono', nomeEmpresa: 'Chaveiro X', username: 'dono', senha: 'segredo',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.admin).toBe(true);
  });

  it('bloqueia segundo setup (409) quando já existe usuário', async () => {
    await request(app).post('/api/setup').send({
      nome: 'Dono', nomeEmpresa: 'X', username: 'dono', senha: 'segredo',
    });
    const res = await request(app).post('/api/setup').send({
      nome: 'Outro', nomeEmpresa: 'Y', username: 'outro', senha: 'segredo',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/setup').send({
      nome: 'Dono', nomeEmpresa: 'X', username: 'dono', senha: 'segredo',
    });
  });

  it('200 + token com credenciais válidas', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'dono', password: 'segredo' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('401 com senha errada', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'dono', password: 'errada' });
    expect(res.status).toBe(401);
  });

  it('429 após exceder o limite de tentativas (brute force)', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: 'dono', password: 'errada' });
    }
    const res = await request(app).post('/api/auth/login').send({ username: 'dono', password: 'errada' });
    expect(res.status).toBe(429);
  });
});

describe('requireAuth', () => {
  it('401 sem token', async () => {
    const res = await request(app).get('/api/servicos');
    expect(res.status).toBe(401);
  });

  it('401 com token inválido', async () => {
    const res = await request(app).get('/api/servicos').set('Authorization', 'Bearer xxx');
    expect(res.status).toBe(401);
  });
});
