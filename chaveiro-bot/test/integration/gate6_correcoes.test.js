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
    // Rota REAL de google.js (/api/google/status) — a inexistente pegaria 402 do curinga do
    // apiRouter e passaria mesmo sem a guarda em google.js (não morderia).
    const r = await request(app).get('/api/google/status').set('Authorization', `Bearer ${token}`);
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

    // O refresh funciona ANTES do reset — e rotaciona; o cookie novo é o que a vítima teria.
    const antes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(antes.status).toBe(200);
    const cookieRot = antes.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
    expect(cookieRot).toBeTruthy();

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

    // O cookie ROTACIONADO (o vivo no momento do reset) deixa de valer — a árvore foi apagada.
    const depois = await request(app).post('/api/auth/refresh').set('Cookie', cookieRot);
    expect(depois.status).toBe(401);
    const restantes = await prisma.refreshToken.count({ where: { usuarioId: usuario.id } });
    expect(restantes).toBe(0);
  });
});

describe('#3b revogação de RAIZ: /me/senha invalida refresh via /auth/refresh', () => {
  it('trocar a senha logado mata o refresh anterior (corte em tokenValidoApos)', async () => {
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Corte',
      nomeEmpresa: 'Chaveiro Corte',
      username: 'donacorte',
      senha: 'SenhaForte1!',
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'donacorte', password: 'SenhaForte1!' });
    const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
    const troca = await request(app)
      .patch('/api/me/senha')
      .set('Authorization', `Bearer ${setup.body.token}`)
      .send({ senhaAtual: 'SenhaForte1!', novaSenha: 'NovaForte1!' });
    expect(troca.status).toBe(200);
    // O refresh anterior à troca não rotaciona mais — SEM depender de janela temporal: o corte
    // é exato e o guard compara criadoEm <= corte.
    const depois = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(depois.status).toBe(401);
  });

  it('BOUNDARY determinístico: refresh com criadoEm == corte é rejeitado (<=, não <)', async () => {
    const { prisma: db } = await import('./helpers.js');
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Boundary',
      nomeEmpresa: 'Chaveiro Boundary',
      username: 'donaboundary',
      senha: 'SenhaForte1!',
    });
    const usuario = await db.usuario.findFirst({ where: { username: 'donaboundary' } });
    // Cria um refresh e crava criadoEm EXATAMENTE igual ao corte — a corrida de 1ms materializada.
    const jwt = (await import('jsonwebtoken')).default;
    void jwt;
    const instante = new Date();
    const crypto = await import('node:crypto');
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await db.refreshToken.create({
      data: {
        tokenHash,
        usuarioId: usuario.id,
        criadoEm: instante,
        expiraEm: new Date(Date.now() + 7 * 864e5),
      },
    });
    await db.usuario.update({ where: { id: usuario.id }, data: { tokenValidoApos: instante } });
    const cookie = `refresh_token=${raw}`;
    const r = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    // Sob `<` (a versão R2), criadoEm==corte passava; sob `<=` morre.
    expect(r.status).toBe(401);
  });
});

describe('#2b responderSessao cobre 2FA por telefone (OAuth)', () => {
  it('usuário com phone2faAtivo logando por magic-link recebe desafio, não sessão', async () => {
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Fone',
      nomeEmpresa: 'Chaveiro Fone',
      username: 'donafone',
      senha: 'SenhaForte1!',
    });
    const usuario = await prisma.usuario.findFirst({ where: { username: 'donafone' } });
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        email: 'donafone@teste.com',
        emailVerificado: true,
        phone2faAtivo: true,
        telefone: '5511999998888',
      },
    });
    const jwt = (await import('jsonwebtoken')).default;
    const magic = jwt.sign({ sub: usuario.id, tipo: 'magic_link' }, process.env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });
    const r = await request(app).get(`/api/auth/magic-link/verificar?token=${magic}`);
    expect(r.status).toBe(200);
    expect(r.body.twoFactorRequerido).toBe(true);
    expect(r.body.metodo).toBe('telefone');
    expect(r.body.token).toBeUndefined();
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

describe('#3c revogação — JWT com corte exato (iatMs) e concorrência com lock', () => {
  it('JWT emitido ANTES do corte é rejeitado de imediato (não sobrevive até exp)', async () => {
    const { prisma: db } = await import('./helpers.js');
    const { gerarJWT } = await import('../../src/services/auth.js');
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Exato',
      nomeEmpresa: 'Chaveiro Exato',
      username: 'donaexato',
      senha: 'SenhaForte1!',
    });
    const usuario = await db.usuario.findFirst({ where: { username: 'donaexato' } });
    // JWT emitido AGORA (iatMs = agora).
    const jwtAntigo = gerarJWT(usuario);
    // Avança o corte para DEPOIS da emissão (10ms à frente) — sob a tolerância de 1s da R3, este
    // token sobreviveria; com iatMs exato, morre.
    await db.usuario.update({
      where: { id: usuario.id },
      data: { tokenValidoApos: new Date(Date.now() + 10) },
    });
    const r = await request(app).get('/api/me').set('Authorization', `Bearer ${jwtAntigo}`);
    expect(r.status).toBe(401);
  });

  it('SMOKE dupla rotação do mesmo refresh: um vencedor (o harness serializa, não isola concorrência)', async () => {
    // NOTA DE HONESTIDADE: supertest + Promise.all + pool do Prisma serializam as transações
    // neste harness — removi o `count===1` da rotação e este teste continuou passando. Ele NÃO
    // isola o delete condicional nem o lock; é smoke. A garantia de concorrência (FOR UPDATE +
    // count) é por CONSTRUÇÃO. O que MORDE de verdade aqui é o corte: iatMs exato e criadoEm<=corte.
    const { limparBanco } = await import('./helpers.js');
    await limparBanco();
    await request(app).post('/api/setup').send({
      nome: 'Dona Dupla',
      nomeEmpresa: 'Chaveiro Dupla',
      username: 'donadupla',
      senha: 'SenhaForte1!',
    });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'donadupla', password: 'SenhaForte1!' });
    const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
    const [a, b] = await Promise.all([
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
      request(app).post('/api/auth/refresh').set('Cookie', cookie),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it('SMOKE (não-determinístico) rotação × troca de senha: estado final revoga tudo o que precede o corte', async () => {
    const { prisma: db } = await import('./helpers.js');
    for (let i = 0; i < 5; i++) {
      const setup = await request(app)
        .post('/api/setup')
        .send({
          nome: `Corrida ${i}`,
          nomeEmpresa: `Chaveiro Corrida ${i}`,
          username: `corrida${i}`,
          senha: 'SenhaForte1!',
        });
      // limpa para o próximo setup (setup exige zero usuários)
      const login = await request(app)
        .post('/api/auth/login')
        .send({ username: `corrida${i}`, password: 'SenhaForte1!' });
      const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
      const uid = (await db.usuario.findFirst({ where: { username: `corrida${i}` } })).id;
      // Dispara rotação e troca de senha ao mesmo tempo.
      const [rot] = await Promise.all([
        request(app).post('/api/auth/refresh').set('Cookie', cookie),
        request(app)
          .patch('/api/me/senha')
          .set('Authorization', `Bearer ${setup.body.token}`)
          .send({ senhaAtual: 'SenhaForte1!', novaSenha: 'NovaForte1!' }),
      ]);
      // Se a rotação venceu, o refresh que ela emitiu deve ser posterior ao corte da troca; se
      // perdeu, deu 401. Em nenhum caso um refresh ANTERIOR ao corte pode continuar rotacionando:
      if (rot.status === 200) {
        const novoCookie = rot.headers['set-cookie']?.find((c) => c.startsWith('refresh_token='));
        // Após o Promise.all a troca de senha JÁ terminou (avançou o corte e apagou a árvore).
        // Logo, o refresh que a rotação emitiu — mesmo que a rotação tenha vencido a corrida —
        // NÃO pode mais rotacionar: tem de ser 401. Aceitar 200 aqui seria o token sobrevivente.
        const seg = await request(app).post('/api/auth/refresh').set('Cookie', novoCookie);
        expect(seg.status).toBe(401);
      }
      // o cookie ORIGINAL (anterior ao corte) jamais rotaciona depois da troca:
      const orig = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
      expect(orig.status).toBe(401);
      const { limparBanco } = await import('./helpers.js');
      await limparBanco();
    }
    /* 180s [D-STG-K-SUITE-VS-STAGING-01 §7]: 5 iterações × (setup + login + corrida + 2
       refreshes + TRUNCATE) medem 17,9s CONTRA O POOLER REMOTO de staging — na borda do
       teto global de 20s, que foi calibrado para o Postgres local. O orçamento maior é
       FINITO e não muda a invariante: cada iteração continua exigindo 401 para todo
       refresh anterior ao corte. */
  }, 180_000);
});
