/**
 * Regressão do D-FE-STRUCT-LIMITER-2FA (Codex DECISOR thread 01a0346e).  [FE-STRUCT]
 *
 * `app.use('/api/auth/login', authIpLimiter, authLimiter)` casava TAMBÉM /login/2fa,
 * /login/2fa-telefone e /login/2fa/recuperar por prefix-match do Express — e nessas subrotas
 * o authLimiter não acha identidade (CAMPOS_POR_ROTA não as mapeia) e degradava para um balde
 * POR IP de 5 falhas/15min COMPARTILHADO entre login e 2FA: a falha de senha de uma pessoa
 * bloqueava o 2FA do escritório inteiro (cross-flow lockout via NAT), contra os dois designs
 * documentados (twoFactorLimiter por DESAFIO; authIpLimiter folgado p/ NAT).
 *
 * O fix monta os limiters de credencial EXATAMENTE em POST /api/auth/login. Estes testes
 * MORDEM: revertendo o mount para app.use(prefixo), o caso "desafios distintos" recebe 429
 * (balde IP compartilhado) e falha.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

let app;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco(); // inclui flushdb do Redis: baldes de limiter zerados por teste
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('limiters de credencial NÃO governam as etapas 2FA (mount exato)', () => {
  it('desafios DISTINTOS em /auth/login/2fa nunca compartilham balde (sem 429 do authLimiter)', async () => {
    // 8 > 5 (teto do authLimiter que ANTES capturava a rota por prefixo + IP).
    for (let i = 1; i <= 8; i++) {
      const r = await request(app)
        .post('/api/auth/login/2fa')
        .send({ desafio: `desafio-distinto-${i}`, codigo: '000000' });
      // Desafio inválido → 400/401 do handler; JAMAIS 429 (cada desafio tem balde próprio).
      expect(r.status, `tentativa ${i} não pode ser 429 (cross-flow lockout regressa)`).not.toBe(
        429
      );
    }
  });

  it('o MESMO desafio ainda esbarra no teto do twoFactorLimiter (5/15min por desafio)', async () => {
    let vi429 = null;
    for (let i = 1; i <= 6; i++) {
      const r = await request(app)
        .post('/api/auth/login/2fa')
        .send({ desafio: 'desafio-repetido-x', codigo: '000000' });
      if (r.status === 429) {
        vi429 = { em: i, corpo: r.body };
        break;
      }
    }
    expect(vi429, 'o teto por desafio precisa continuar existindo').not.toBeNull();
    expect(vi429.em).toBe(6); // 5 admitidas, 6ª barrada
    expect(vi429.corpo.erro).toMatch(/verificação/i); // mensagem do twoFactorLimiter, não a do authLimiter
  });

  it('falhas de SENHA no /auth/login não contaminam o 2FA do mesmo IP', async () => {
    await request(app).post('/api/setup').send({
      nome: 'Dona Limiter',
      nomeEmpresa: 'Chaveiro Limiter',
      username: 'donalimiter',
      senha: 'SenhaForte1!',
    });
    // Esgota falhas de senha (identidade fixa → authLimiter conta 5).
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'donalimiter', password: 'senha-errada' });
    }
    // 2FA com desafio novo do MESMO IP: não pode herdar o balde de login.
    const r = await request(app)
      .post('/api/auth/login/2fa')
      .send({ desafio: 'desafio-pos-senhas-erradas', codigo: '000000' });
    expect(r.status, '2FA não pode ser bloqueado por falhas de senha alheias').not.toBe(429);
  });

  it('/auth/login EXATO continua protegido: 429 por identidade após 5 falhas', async () => {
    await request(app).post('/api/setup').send({
      nome: 'Dona Exata',
      nomeEmpresa: 'Chaveiro Exato',
      username: 'donaexata',
      senha: 'SenhaForte1!',
    });
    let ultimo;
    for (let i = 0; i < 6; i++) {
      ultimo = await request(app)
        .post('/api/auth/login')
        .send({ username: 'donaexata', password: 'senha-errada' });
    }
    expect(ultimo.status).toBe(429);
  });

  it('/auth/login/2fa/recuperar: desafios distintos também não compartilham balde de credencial', async () => {
    for (let i = 1; i <= 8; i++) {
      const r = await request(app)
        .post('/api/auth/login/2fa/recuperar')
        .send({ desafio: `rec-distinto-${i}`, codigo: 'AAAA-BBBB' });
      expect(r.status, `recuperar tentativa ${i}`).not.toBe(429);
    }
  });
});
