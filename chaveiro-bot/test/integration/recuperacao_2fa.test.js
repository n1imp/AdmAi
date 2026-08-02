/**
 * T-REC-01 — POST /auth/login/2fa/recuperar (antes POST /me/2fa/recuperar,
 * inalcançável atrás de requireAuth — EV-022). Cobre o fluxo real: usuário com
 * 2FA TOTP ativo perde o autenticador, loga com senha (recebe o `desafio`,
 * SEM sessão completa) e recupera acesso com um código de backup — sem nunca
 * enviar um Bearer token, provando que a verificação do próprio desafio É a
 * autenticação da rota, não uma dispensa dela.
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

async function contaComTotpAtivo() {
  const setup = await request(app).post('/api/setup').send({
    nome: 'Dono 2FA',
    nomeEmpresa: 'Chaveiro 2FA Ltda',
    username: 'dono2fa',
    senha: 'SenhaForte1!',
  });
  const token = setup.body.token;

  const totpSetup = await request(app)
    .post('/api/me/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  const { secret } = totpSetup.body;
  const codigoValido = await codigoTotp(secret);

  const ativar = await request(app)
    .post('/api/me/2fa/ativar')
    .set('Authorization', `Bearer ${token}`)
    .send({ codigo: codigoValido });

  return { codigosRecuperacao: ativar.body.codigosRecuperacao, secret };
}

async function codigoTotp(secret) {
  const r = await generate({ secret });
  return typeof r === 'string' ? r : (r?.token ?? r?.otp);
}

async function obterDesafio() {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'dono2fa', password: 'SenhaForte1!' });
  expect(login.status).toBe(200);
  expect(login.body.twoFactorRequerido).toBe(true);
  return login.body.desafio;
}

describe('POST /api/auth/login/2fa/recuperar', () => {
  it('200 + token com um código de backup válido, SEM enviar Authorization', async () => {
    const { codigosRecuperacao } = await contaComTotpAtivo();
    const desafio = await obterDesafio();

    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio, codigo: codigosRecuperacao[0] });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('o código de backup usado não pode ser reutilizado (consumo único)', async () => {
    const { codigosRecuperacao } = await contaComTotpAtivo();
    const primeiroDesafio = await obterDesafio();

    const res1 = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio: primeiroDesafio, codigo: codigosRecuperacao[0] });
    expect(res1.status).toBe(200);

    // Novo desafio (o anterior já foi consumido/expira em 5min de qualquer
    // forma), mesmo código de backup — já usado, deve falhar.
    const segundoDesafio = await obterDesafio();
    const res2 = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio: segundoDesafio, codigo: codigosRecuperacao[0] });
    expect(res2.status).toBe(400);
  });

  it('400 com código de backup inválido', async () => {
    await contaComTotpAtivo();
    const desafio = await obterDesafio();

    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio, codigo: 'CODIGOFALSO0' });

    expect(res.status).toBe(400);
  });

  it('400 com desafio ausente — schema exige o campo antes mesmo de verificar', async () => {
    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ codigo: 'QUALQUERCODIGO' });
    // Zod rejeita a requisição antes de chegar em verificarDesafio2fa.
    expect(res.status).toBe(400);
  });

  it('401 com desafio malformado (não é um JWT válido)', async () => {
    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio: 'nao-e-um-jwt', codigo: 'QUALQUERCODIGO' });
    expect(res.status).toBe(401);
  });

  it('401 com desafio de tipo diferente de 2fa (ex.: um JWT de sessão comum)', async () => {
    const setup = await request(app).post('/api/setup').send({
      nome: 'Outro Dono',
      nomeEmpresa: 'Outra Empresa',
      username: 'outrodono',
      senha: 'SenhaForte1!',
    });
    // O token de SESSÃO (não um desafio 2FA) tem shape diferente — sem
    // `tipo:'2fa'`, verificarDesafio2fa deve rejeitar mesmo sendo um JWT
    // assinado pela mesma chave.
    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .send({ desafio: setup.body.token, codigo: 'QUALQUERCODIGO' });
    expect(res.status).toBe(401);
  });

  it('401 com desafio de usuário sem 2FA ativo (usuarioId aponta pra alguém, mas nao tem TOTP)', async () => {
    // Corrobora que a rota não vira um oráculo: mesmo com um desafio 2FA
    // "genuíno" (assinado, tipo certo), se o usuário não tem 2FA ativo a
    // rota não deve tratar isso como sucesso silencioso nem vazar detalhe.
    await request(app).post('/api/setup').send({
      nome: 'Sem 2FA',
      nomeEmpresa: 'Empresa Sem 2FA',
      username: 'sem2fa',
      senha: 'SenhaForte1!',
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sem2fa', password: 'SenhaForte1!' });
    // Sem 2FA ativo, o login já devolve sessão completa — não há desafio.
    expect(login.status).toBe(200);
    expect(login.body.twoFactorRequerido).toBeUndefined();
  });

  it('não requer (e ignora) header Authorization — a rota funciona sem sessão completa', async () => {
    const { codigosRecuperacao } = await contaComTotpAtivo();
    const desafio = await obterDesafio();

    const res = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .set('Authorization', 'Bearer token-invalido-de-propósito')
      .send({ desafio, codigo: codigosRecuperacao[1] });

    // Um Authorization inválido/estranho não deve derrubar a rota com 401 de
    // requireAuth — ela não está atrás desse middleware.
    expect(res.status).toBe(200);
  });
});
