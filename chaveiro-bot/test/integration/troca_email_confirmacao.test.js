import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

let tokenCapturado = null;
vi.mock('../../src/services/email.js', async (orig) => ({
  ...(await orig()),
  enviarEmailConfirmarMudancaEmail: vi.fn((_usuarioAntigo, _novoEmail, token) => {
    tokenCapturado = token;
    return Promise.resolve();
  }),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * F-BYPASS (revisão independente): troca de e-mail via PATCH /me não pode ser aplicada
 * imediatamente quando já existe um e-mail atual verificado — precisa de confirmação no
 * endereço ANTIGO antes de aplicar. Sem isso, um atacante com JWT roubado redireciona
 * recuperação de senha (tomada de conta permanente) ou o código de exclusão de conta
 * (F3) para um e-mail próprio.
 */
let app;

beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
  tokenCapturado = null;
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('PATCH /me — troca de e-mail exige confirmação no endereço antigo', () => {
  it('não aplica a troca imediatamente quando o e-mail atual já está verificado', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'TrocaEmail');
    await prisma.usuario.update({ where: { id: A.userId }, data: { emailVerificado: true } });

    const emailAntigo = (await prisma.usuario.findUnique({ where: { id: A.userId } })).email;
    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ email: 'atacante@evil.com' });

    expect(res.status).toBe(200);
    expect(res.body.emailPendente).toBe('atacante@evil.com');
    expect(res.body.email).toBe(emailAntigo); // e-mail NÃO mudou ainda
    expect(tokenCapturado).toBeTruthy();

    const noBanco = await prisma.usuario.findUnique({ where: { id: A.userId } });
    expect(noBanco.email).toBe(emailAntigo);
  });

  it('aplica a troca só depois de confirmar o token enviado ao endereço antigo', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'TrocaEmailConfirma');
    await prisma.usuario.update({ where: { id: A.userId }, data: { emailVerificado: true } });

    await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ email: 'novo@legitimo.com' });
    expect(tokenCapturado).toBeTruthy();

    const confirmar = await request(app).get(
      `/api/auth/email/confirmar-mudanca?token=${tokenCapturado}`
    );
    expect(confirmar.status).toBe(200);
    expect(confirmar.body.confirmado).toBe(true);

    const atualizado = await prisma.usuario.findUnique({ where: { id: A.userId } });
    expect(atualizado.email).toBe('novo@legitimo.com');
    // Exige prova de posse do NOVO endereço também (reusa o fluxo padrão de verificação).
    expect(atualizado.emailVerificado).toBe(false);
  });

  it('token de confirmação de outro usuário não pode ser reaproveitado (sub embutido)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'TrocaEmailA');
    const B = await criarEmpresaComAdmin(request, app, 'TrocaEmailB');

    const tokenForjado = jwt.sign(
      { sub: B.userId, tipo: 'confirmar_email', novoEmail: 'invasor@evil.com' },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
    const res = await request(app).get(`/api/auth/email/confirmar-mudanca?token=${tokenForjado}`);
    expect(res.status).toBe(200); // o token é legítimo para B — mas só altera a conta B, não A
    const contaA = await prisma.usuario.findUnique({ where: { id: A.userId } });
    expect(contaA.email).not.toBe('invasor@evil.com');
  });

  it('regressão: definir e-mail pela primeira vez (conta sem e-mail atual) aplica direto', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'PrimeiroEmail');
    await prisma.usuario.update({ where: { id: A.userId }, data: { email: null } });

    const res = await request(app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ email: 'primeiro@teste.com' });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('primeiro@teste.com');
    expect(res.body.emailPendente).toBeUndefined();
  });
});

describe('F3 — codigo-exclusao exige e-mail VERIFICADO (defesa em profundidade)', () => {
  it('rejeita solicitação de código quando o e-mail não está verificado', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'ExclusaoSemVerificar');
    await prisma.usuario.update({
      where: { id: A.userId },
      data: { senhaHash: null, twoFactorAtivo: false, emailVerificado: false },
    });

    const res = await request(app)
      .post('/api/me/conta/codigo-exclusao')
      .set('Authorization', `Bearer ${A.token}`)
      .send();

    expect(res.status).toBe(400);
  });
});
