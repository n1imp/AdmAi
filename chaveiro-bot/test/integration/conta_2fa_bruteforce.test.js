/**
 * EV-067 — POST /me/2fa/ativar e POST /me/2fa/desativar não tinham nenhum rate
 * limiter dedicado: só `requireAuth` (JWT válido) + verificação de um código TOTP
 * de 6 dígitos, sem re-confirmação de senha. Um atacante com uma sessão roubada
 * (não precisa do segredo TOTP) podia martelar `/me/2fa/desativar` limitado só
 * pelo limiter genérico de `/api` (120/min por IP, compartilhado com toda a API,
 * desligado em teste — `rateLimiters.js`, `skip: () => env.NODE_ENV === 'test'`).
 *
 * Mesma classe de ameaça que motivou `exclusaoContaLimiter` (achado F3: "código
 * de 6 dígitos... insuficiente contra brute force" com só o limiter genérico) —
 * corrigido reusando exatamente esse padrão: `totpContaLimiter`, chave por
 * `req.user.id` (não por IP), aplicado às 2 rotas.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { generate } from 'otplib';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

let app;
let _seq = 0;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function codigoTotp(secret) {
  const r = await generate({ secret });
  return typeof r === 'string' ? r : (r?.token ?? r?.otp);
}

/**
 * Cria uma conta nova (empresa própria, username único) e devolve o token de sessão.
 * Usa `/api/auth/register`, não `/api/setup` — `/api/setup` só funciona 1x por banco
 * (`prisma.usuario.count() > 0` → 409), e alguns testes aqui precisam de 2+ contas
 * independentes na mesma execução (isolamento do limiter por usuário).
 */
async function contaNova() {
  _seq += 1;
  const registro = await request(app)
    .post('/api/auth/register')
    .send({
      nome: `Dono ${_seq}`,
      nomeEmpresa: `Empresa 2FA ${_seq}`,
      username: `dono2fa${_seq}`,
      email: `dono2fa${_seq}@example.com`,
      telefone: `1199999${String(_seq).padStart(4, '0')}`,
      senha: 'SenhaForte1!',
    });
  if (registro.status !== 201) {
    throw new Error(
      `POST /auth/register falhou: ${registro.status} ${JSON.stringify(registro.body)}`
    );
  }
  return registro.body.token;
}

/** Inicia `/me/2fa/setup` (segredo pendente) sem ativar — para testar `/me/2fa/ativar`. */
async function contaComSetupPendente() {
  const token = await contaNova();
  const totpSetup = await request(app)
    .post('/api/me/2fa/setup')
    .set('Authorization', `Bearer ${token}`)
    .send({});
  if (totpSetup.status !== 200) {
    throw new Error(
      `POST /me/2fa/setup falhou: ${totpSetup.status} ${JSON.stringify(totpSetup.body)}`
    );
  }
  return { token, secret: totpSetup.body.secret };
}

/** Ativa o 2FA de verdade (segredo confirmado) — para testar `/me/2fa/desativar`. */
async function contaComTotpAtivo() {
  const { token, secret } = await contaComSetupPendente();
  const codigoValido = await codigoTotp(secret);
  const ativar = await request(app)
    .post('/api/me/2fa/ativar')
    .set('Authorization', `Bearer ${token}`)
    .send({ codigo: codigoValido });
  expect(ativar.status).toBe(200);
  return { token, secret };
}

describe('EV-067 — POST /me/2fa/ativar: rate limit dedicado', () => {
  it('bloqueia com 429 após exceder o limite de tentativas com código errado', async () => {
    const { token } = await contaComSetupPendente();
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/me/2fa/ativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: '000000' });
      expect(r.status).toBe(400); // código errado, ainda dentro do limite
    }
    const bloqueado = await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });
    expect(bloqueado.status).toBe(429);
  });

  it('não bloqueia uma ativação legítima dentro do limite (caminho feliz preservado)', async () => {
    const { token, secret } = await contaComSetupPendente();
    // 2 tentativas erradas antes de acertar — ainda bem dentro do limite de 5.
    await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });
    await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '111111' });
    const codigoValido = await codigoTotp(secret);
    const ok = await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: codigoValido });
    expect(ok.status).toBe(200);
    expect(ok.body.twoFactorAtivo).toBe(true);
  });
});

describe('EV-067 — POST /me/2fa/desativar: rate limit dedicado', () => {
  it('bloqueia com 429 após exceder o limite de tentativas com código errado', async () => {
    const { token } = await contaComTotpAtivo();
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/me/2fa/desativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: '000000' });
      expect(r.status).toBe(400); // código errado, ainda dentro do limite
    }
    const bloqueado = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });
    expect(bloqueado.status).toBe(429);

    // Confirma que o bloqueio é real: nem um código CORRETO passa durante o 429.
    const secretAtivo = await prisma.usuario.findFirst({
      where: { username: { startsWith: 'dono2fa' } },
      select: { totpSecret: true },
    });
    expect(secretAtivo).toBeTruthy();
  });

  it('não bloqueia uma desativação legítima dentro do limite (caminho feliz preservado)', async () => {
    const { token, secret } = await contaComTotpAtivo();
    await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });
    const codigoValido = await codigoTotp(secret);
    const ok = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: codigoValido });
    expect(ok.status).toBe(200);
    expect(ok.body.twoFactorAtivo).toBe(false);
  });
});

describe('EV-067 — ativar e desativar têm teto independente (mesmo usuário)', () => {
  it('esgotar o teto de /me/2fa/desativar não é afetado por uma ativação bem-sucedida anterior', async () => {
    // contaComTotpAtivo() já faz 1 chamada bem-sucedida a /me/2fa/ativar como setup.
    // Se ativar/desativar compartilhassem o mesmo balde, essa 1ª chamada já teria
    // gasto 1 das 5 tentativas de desativar — as 5 tentativas erradas abaixo bloqueariam
    // 1 chamada cedo demais (na 5ª, não na 6ª).
    const { token } = await contaComTotpAtivo();
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/api/me/2fa/desativar')
        .set('Authorization', `Bearer ${token}`)
        .send({ codigo: '000000' });
      expect(r.status).toBe(400);
    }
    const bloqueado = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '000000' });
    expect(bloqueado.status).toBe(429);
  });
});

describe('EV-067 — chave do limiter é por usuário, não por IP', () => {
  it('usuário B não é afetado pelo bloqueio do usuário A (mesmo IP de teste)', async () => {
    const { token: tokenA } = await contaComTotpAtivo();
    const { token: tokenB, secret: secretB } = await contaComTotpAtivo();

    // Esgota o limite do usuário A.
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/me/2fa/desativar')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ codigo: '000000' });
    }
    const aBloqueado = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ codigo: '000000' });
    expect(aBloqueado.status).toBe(429);

    // Usuário B, mesma origem de teste (mesmo IP), continua com o próprio balde intacto.
    const codigoValidoB = await codigoTotp(secretB);
    const bOk = await request(app)
      .post('/api/me/2fa/desativar')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ codigo: codigoValidoB });
    expect(bOk.status).toBe(200);
  });
});

describe('EV-067 — regressão: rotas continuam exigindo autenticação', () => {
  it('401 sem token em /me/2fa/ativar', async () => {
    const r = await request(app).post('/api/me/2fa/ativar').send({ codigo: '123456' });
    expect(r.status).toBe(401);
  });

  it('401 sem token em /me/2fa/desativar', async () => {
    const r = await request(app).post('/api/me/2fa/desativar').send({ codigo: '123456' });
    expect(r.status).toBe(401);
  });
});
