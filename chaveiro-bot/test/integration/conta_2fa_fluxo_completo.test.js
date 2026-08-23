/**
 * F4-01 — o LOOP inteiro do 2FA, pela porta da frente.  [GAP-2FA-RT]
 *
 * O que já existia de cobertura: recuperação por backup code (recuperacao_2fa) e brute-force
 * (conta_2fa_bruteforce). O que NUNCA tinha sido exercitado de ponta a ponta: o caminho feliz
 * completo — setup → ativar (TOTP real do otplib) → login vira DESAFIO (não sessão) →
 * /auth/login/2fa fecha a sessão → a sessão funciona → desativar → login volta a ser direto.
 *
 * E a corrida de EV-056: o mesmo código de backup disparado DUAS vezes em paralelo tem que
 * eleger exatamente UM vencedor (updateMany condicional em usado:false). Sem o teste, a
 * atomicidade é um comentário; com ele, é um contrato.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { generate } from 'otplib';
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

const codigoTotp = async (secret) => {
  const r = await generate({ secret });
  return typeof r === 'string' ? r : (r?.token ?? r?.otp);
};

async function contaNova() {
  const setup = await request(app).post('/api/setup').send({
    nome: 'Dona Loop',
    nomeEmpresa: 'Chaveiro Loop',
    username: 'donaloop',
    senha: 'SenhaForte1!',
  });
  expect(setup.status).toBe(201);
  return setup.body.token;
}

const login = () =>
  request(app).post('/api/auth/login').send({ username: 'donaloop', password: 'SenhaForte1!' });

describe('2FA — fluxo completo pela API real', () => {
  it('setup → ativar → desafio no login → TOTP fecha sessão → sessão usável → desativar → login direto', async () => {
    const token = await contaNova();

    // ANTES do 2FA: login entrega sessão direto (o contrapositivo que dá sentido ao desafio).
    const antes = await login();
    expect(antes.body.token).toBeTruthy();
    expect(antes.body.twoFactorRequerido).toBeUndefined();

    // Setup: segredo pendente + otpauth + QR. Nada muda no login ainda (pendente != ativo).
    const setup2fa = await request(app)
      .post('/api/me/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(setup2fa.status).toBe(200);
    const { secret, otpauthUrl, qrDataUrl } = setup2fa.body;
    expect(otpauthUrl).toContain('otpauth://');
    expect(qrDataUrl).toMatch(/^data:image/);
    const pendente = await login();
    expect(pendente.body.token).toBeTruthy(); // pendente NÃO tranca a porta

    // Ativar com um TOTP REAL do segredo — e receber os 10 códigos de backup.
    const ativar = await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: await codigoTotp(secret) });
    expect(ativar.status).toBe(200);
    expect(ativar.body.twoFactorAtivo).toBe(true);
    expect(ativar.body.codigosRecuperacao).toHaveLength(10);

    // Login agora responde DESAFIO, sem token de sessão.
    const desafiado = await login();
    expect(desafiado.status).toBe(200);
    expect(desafiado.body.twoFactorRequerido).toBe(true);
    expect(desafiado.body.metodo).toBe('totp');
    expect(desafiado.body.token).toBeUndefined();

    // Código ERRADO não fecha sessão (400 no contrato da rota; 401 é desafio inválido).
    const errado = await request(app)
      .post('/api/auth/login/2fa')
      .send({ desafio: desafiado.body.desafio, codigo: '000000' });
    expect(errado.status).toBe(400);
    expect(errado.body.token).toBeUndefined();

    // TOTP certo fecha a sessão — e a sessão FUNCIONA (não só existe).
    const fechada = await request(app)
      .post('/api/auth/login/2fa')
      .send({ desafio: desafiado.body.desafio, codigo: await codigoTotp(secret) });
    expect(fechada.status).toBe(200);
    expect(fechada.body.token).toBeTruthy();
    const me = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${fechada.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.twoFactorAtivo).toBe(true);

    // Desativar exige TOTP; depois disso o login volta a ser direto.
    const desativar = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${fechada.body.token}`)
      .send({ codigo: await codigoTotp(secret) });
    expect(desativar.status).toBe(200);
    const depois = await login();
    expect(depois.body.token).toBeTruthy();
    expect(depois.body.twoFactorRequerido).toBeUndefined();
  });

  it('CORRIDA (EV-056): o mesmo backup code em duas requisições paralelas elege UM vencedor', async () => {
    const token = await contaNova();
    const { body: s } = await request(app)
      .post('/api/me/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const ativar = await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: await codigoTotp(s.secret) });
    const codigo = ativar.body.codigosRecuperacao[0];

    // Dois desafios independentes (dois "dispositivos" tentando recuperar ao mesmo tempo).
    const [d1, d2] = [await login(), await login()].map((r) => r.body.desafio);
    const [r1, r2] = await Promise.all([
      request(app).post('/api/auth/login/2fa/recuperar').send({ desafio: d1, codigo }),
      request(app).post('/api/auth/login/2fa/recuperar').send({ desafio: d2, codigo }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // Sob o bug TOCTOU, ambos seriam 200 (o mesmo código consumido duas vezes).
    expect(statuses).toEqual([200, 400]);

    // E o registro no banco confirma: exatamente UM código consumido.
    const usados = await prisma.codigoRecuperacaoTotp.count({ where: { usado: true } });
    expect(usados).toBe(1);
  });
});
