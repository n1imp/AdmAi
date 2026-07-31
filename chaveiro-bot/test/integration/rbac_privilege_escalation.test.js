import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock parcial do gateway WhatsApp: evita envio real de OTP/mensagem (padrão de
// e2e_rbac_ponto.test.js).
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * F1 — teto de autoridade no RBAC. Cobre os 3 pontos de escrita de `Usuario.permissoes`/
 * `papel` sob `requirePermissao('usuarios','editar')`: PATCH /usuarios/:id (coberto no
 * commit original), POST /usuarios e POST /usuarios/convidar (gaps achados na revisão
 * independente — o ceiling/bloqueio de promoção a dono valia só para o PATCH).
 */
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

async function criarGestorComUsuariosEditar(request_, app_, tokenDono, sufixo) {
  const res = await request_(app_)
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${tokenDono}`)
    .send({
      nome: `Gestor${sufixo}`,
      username: `gestor${sufixo}${Date.now()}`,
      senha: 'SenhaForte1!',
      papel: 'gestor',
      permissoes: { usuarios: { editar: true } },
    });
  expect(res.status).toBe(201);
  const login = await request_(app_)
    .post('/api/auth/login')
    .send({ username: res.body.username, password: 'SenhaForte1!' });
  expect(login.status).toBe(200);
  return { userId: res.body.id, token: login.body.token };
}

describe('F1-BYPASS — POST /usuarios escapava do teto de autoridade', () => {
  it('gestor com só usuarios.editar NÃO consegue criar outro usuário como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1Post');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PostDono');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({
        nome: 'Invasor',
        username: `invasor${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'dono',
      });

    expect(res.status).toBe(403);
  });

  it('gestor com só usuarios.editar NÃO consegue criar usuário com permissoes.financeiro.editar (que não possui)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1PostPerm');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PostPerm');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({
        nome: 'Novo Func',
        username: `novofunc${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
        permissoes: { financeiro: { editar: true } },
      });

    expect(res.status).toBe(201);
    expect(res.body.permissoesEfetivas?.financeiro?.editar).not.toBe(true);
  });

  it('regressão: dono continua podendo criar outro dono e conceder qualquer permissão', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1PostRegressao');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Segundo Dono',
        username: `segundodono${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'dono',
      });

    expect(res.status).toBe(201);
    expect(res.body.papel).toBe('dono');
  });
});

describe('F1-BYPASS — POST /usuarios/convidar escapava do teto de autoridade', () => {
  it('gestor com só usuarios.editar NÃO consegue convidar alguém como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1Convite');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'Convite');

    const res = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ email: `convidado${Date.now()}@teste.com`, papel: 'dono' });

    expect(res.status).toBe(403);
  });

  it('regressão: dono continua podendo convidar alguém como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1ConviteRegressao');

    const res = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ email: `convidado${Date.now()}@teste.com`, papel: 'dono' });

    expect(res.status).toBe(200);
    expect(res.body.enviado).toBe(true);
  });
});
