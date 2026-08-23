/**
 * Gate 6 adversarial — as 4 correções, cada uma com a prova que morde.  [thread 01a02fb6]
 *
 *   #1 paywall: Google/WhatsApp montados na raiz pulavam a guarda do apiRouter → 402 com
 *      assinatura morta, preservando os isentos por desenho (status/webhook/callback);
 *   #2 2FA: responderSessao cobre phone2fa; magic-link exige o 2º fator (não emite sessão);
 *   #3 reset de senha revoga TODOS os refresh (refresh pré-reset deixa de rotacionar);
 *   #4 checkout recusa 2ª assinatura viva (sem Stripe real: cai antes, no guard, com 409).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { generate } from 'otplib';
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

async function matarAssinatura(empresaId) {
  await prisma.assinatura.update({
    where: { empresaId },
    data: { status: 'canceled', periodoFimEm: null, trialFimEm: null },
  });
}

describe('#1 paywall cobre Google/WhatsApp (mounts na raiz)', () => {
  it('assinatura morta: rota de Google Business responde 402', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'G1');
    await matarAssinatura(empresaId);
    const r = await request(app)
      .get('/api/google/avaliacoes')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(402);
  });

  it('assinatura morta: credenciais WhatsApp Cloud respondem 402', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'W1');
    await matarAssinatura(empresaId);
    const r = await request(app)
      .post('/api/whatsapp/cloud/credenciais')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r.status).toBe(402);
  });

  it('ISENTO por desenho: status do bot NÃO é gateado (não vira 402 por assinatura)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'W2');
    await matarAssinatura(empresaId);
    const r = await request(app)
      .get('/api/bot/whatsapp/status')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).not.toBe(402);
  });
});

describe('#2 magic-link não contorna 2FA', () => {
  it('usuário com TOTP ativo: magic-link/verificar devolve desafio, NÃO sessão', async () => {
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona ML',
      nomeEmpresa: 'Chaveiro ML',
      username: 'donaml',
      senha: 'SenhaForte1!',
    });
    const token = setup.body.token;
    const { body: s } = await request(app)
      .post('/api/me/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const codigo = await generate({ secret: s.secret }).then((r) =>
      typeof r === 'string' ? r : (r?.token ?? r?.otp)
    );
    await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo });
    // Garante um e-mail para o usuário (magic-link busca por email).
    const usuario = await prisma.usuario.findFirst({ where: { username: 'donaml' } });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { email: 'donaml@teste.com', emailVerificado: true },
    });

    // Minta um magic token válido pelo próprio endpoint e verifica.
    await request(app).post('/api/auth/magic-link').send({ email: 'donaml@teste.com' });
    // O token vai por e-mail (não retornado); forjamos um com o mesmo contrato para exercitar
    // o /verificar — o segredo é o do ambiente de teste, o caminho é o real.
    const jwt = (await import('jsonwebtoken')).default;
    const magic = jwt.sign({ sub: usuario.id, tipo: 'magic_link' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    const r = await request(app).get(`/api/auth/magic-link/verificar?token=${magic}`);
    expect(r.status).toBe(200);
    expect(r.body.twoFactorRequerido).toBe(true);
    expect(r.body.token).toBeUndefined(); // NÃO emitiu sessão
  });
});

describe('#3 reset de senha revoga refresh tokens', () => {
  it('após redefinir a senha, um refresh pré-reset não rotaciona mais', async () => {
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Reset',
      nomeEmpresa: 'Chaveiro Reset',
      username: 'donareset',
      senha: 'SenhaForte1!',
    });
    const usuario = await prisma.usuario.findFirst({ where: { username: 'donareset' } });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { email: 'donareset@teste.com', emailVerificado: true },
    });

    // Login gera um refresh cookie (o "roubado").
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'donareset', password: 'SenhaForte1!' });
    const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
    expect(cookie).toBeTruthy();

    // O refresh funciona ANTES do reset.
    const antes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(antes.status).toBe(200);

    // Reset de senha por token de e-mail.
    const jwt = (await import('jsonwebtoken')).default;
    const resetToken = jwt.sign(
      { sub: usuario.id, tipo: 'password_reset' },
      process.env.JWT_SECRET,
      {
        algorithm: 'HS256',
        expiresIn: '1h',
      }
    );
    const reset = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token: resetToken, novaSenha: 'OutraForte1!' });
    expect(reset.status).toBe(200);

    // O refresh original (mesmo cookie de antes; o de 'antes' já rotacionou, mas o reset
    // apaga TODA a árvore) não vale mais.
    const depois = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(depois.status).toBe(401);
    const restantes = await prisma.refreshToken.count({ where: { usuarioId: usuario.id } });
    expect(restantes).toBe(0);
  });
});

describe('#4 checkout recusa segunda assinatura viva', () => {
  it('com stripeSubId ativo, POST /billing/checkout responde 409 (não abre 2ª subscription)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Chk');
    await prisma.assinatura.update({
      where: { empresaId },
      data: { status: 'active', stripeSubId: 'sub_ja_viva', stripeCustomerId: 'cus_x' },
    });
    const r = await request(app)
      .post('/api/billing/checkout')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(r.status).toBe(409);
    expect(r.body.codigo).toBe('assinatura_ja_ativa');
  });
});
