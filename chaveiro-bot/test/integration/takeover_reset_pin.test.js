import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * C1 — tomada da conta do dono por reset de PIN.
 *
 * Cadeia do achado, reproduzida de ponta a ponta:
 *   1. a conta do dono fica vinculada a um `Tecnico` (acontece de verdade quando
 *      o dono verifica o telefone — aqui o vínculo é montado direto);
 *   2. `POST /tecnicos/:id/acesso/reset` exigia apenas `tecnicos.editar`, que o
 *      preset de gestor possui;
 *   3. a rota não olhava o papel do usuário-alvo;
 *   4. o PIN voltava EM CLARO na resposta.
 *
 * Resultado antes da correção: o gestor lia o PIN do dono e logava como ele.
 *
 * Os casos asseguram o EFEITO NO BANCO (`senhaHash`, `tokenValidoApos`), não só
 * o status HTTP — status sozinho não distingue "negado" de "falhou por outro
 * motivo e não escreveu".
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

/** Cria um gestor (o preset de gestor já inclui `tecnicos.editar`) e loga. */
async function criarGestor(tokenDono, sufixo) {
  const criado = await request(app)
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${tokenDono}`)
    .send({
      nome: `Gestor${sufixo}`,
      username: `gestor${sufixo}${Date.now().toString().slice(-6)}`,
      senha: 'SenhaForte1!',
      papel: 'gestor',
    });
  expect(criado.status).toBe(201);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: criado.body.username, password: 'SenhaForte1!' });
  expect(login.status).toBe(200);
  return { userId: criado.body.id, token: login.body.token };
}

/** Vincula um `Tecnico` a um `Usuario` — é o que o fluxo de verificação de telefone faz. */
let _tel = 0;
async function vincularTecnico(usuarioId, empresaId, nome) {
  return prisma.tecnico.create({
    data: {
      nome,
      telefone: '5599' + String(++_tel).padStart(9, '0'),
      empresaId,
      usuarioId,
      ativo: true,
    },
  });
}

describe('C1 — reset de PIN contra conta de maior privilégio', () => {
  it('gestor NÃO reseta o PIN do dono, e o hash do dono fica intacto', async () => {
    const { token: tokenDono, userId: donoId, empresaId } = await criarEmpresaComAdmin(
      request,
      app,
      'c1a'
    );
    const gestor = await criarGestor(tokenDono, 'A');
    const tecnicoDoDono = await vincularTecnico(donoId, empresaId, 'Dono Tec');

    const antes = await prisma.usuario.findUnique({
      where: { id: donoId },
      select: { senhaHash: true, senhaProvisoria: true, tokenValidoApos: true },
    });

    const res = await request(app)
      .post(`/api/tecnicos/${tecnicoDoDono.id}/acesso/reset`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.pin).toBeUndefined();

    const depois = await prisma.usuario.findUnique({
      where: { id: donoId },
      select: { senhaHash: true, senhaProvisoria: true, tokenValidoApos: true },
    });
    expect(depois.senhaHash).toBe(antes.senhaHash);
    expect(depois.senhaProvisoria).toBe(antes.senhaProvisoria);
    expect(depois.tokenValidoApos).toEqual(antes.tokenValidoApos);
  });

  it('o token do dono continua válido depois da tentativa negada', async () => {
    const { token: tokenDono, userId: donoId, empresaId } = await criarEmpresaComAdmin(
      request,
      app,
      'c1b'
    );
    const gestor = await criarGestor(tokenDono, 'B');
    const tecnicoDoDono = await vincularTecnico(donoId, empresaId, 'Dono Tec');

    await request(app)
      .post(`/api/tecnicos/${tecnicoDoDono.id}/acesso/reset`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({});

    // `resetarPin` recua `tokenValidoApos`; se tivesse rodado, o dono seria deslogado.
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${tokenDono}`);
    expect(me.status).toBe(200);
  });

  it('gestor NÃO reseta o PIN de outro gestor (papel igual)', async () => {
    const { token: tokenDono, empresaId } = await criarEmpresaComAdmin(request, app, 'c1c');
    const gestorA = await criarGestor(tokenDono, 'C');
    const gestorB = await criarGestor(tokenDono, 'D');
    const tecnicoDeB = await vincularTecnico(gestorB.userId, empresaId, 'Ges B');

    const antes = await prisma.usuario.findUnique({
      where: { id: gestorB.userId },
      select: { senhaHash: true },
    });

    const res = await request(app)
      .post(`/api/tecnicos/${tecnicoDeB.id}/acesso/reset`)
      .set('Authorization', `Bearer ${gestorA.token}`)
      .send({});

    expect(res.status).toBe(403);
    const depois = await prisma.usuario.findUnique({
      where: { id: gestorB.userId },
      select: { senhaHash: true },
    });
    expect(depois.senhaHash).toBe(antes.senhaHash);
  });

  it('CONTROLE POSITIVO: gestor ainda reseta o PIN de um funcionário', async () => {
    const { token: tokenDono, empresaId } = await criarEmpresaComAdmin(request, app, 'c1d');
    const gestor = await criarGestor(tokenDono, 'E');

    const tecnico = await prisma.tecnico.create({
      data: { nome: 'Func', telefone: '5598' + String(++_tel).padStart(9, '0'), empresaId, ativo: true },
    });
    const acesso = await request(app)
      .post(`/api/tecnicos/${tecnico.id}/acesso`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({});
    expect(acesso.status).toBe(201);

    const antes = await prisma.usuario.findUnique({
      where: { id: acesso.body.usuarioId },
      select: { senhaHash: true },
    });

    const reset = await request(app)
      .post(`/api/tecnicos/${tecnico.id}/acesso/reset`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({});

    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{6}$/);
    const depois = await prisma.usuario.findUnique({
      where: { id: acesso.body.usuarioId },
      select: { senhaHash: true },
    });
    expect(depois.senhaHash).not.toBe(antes.senhaHash);
  });

  it('CONTROLE POSITIVO: dono ainda reseta o PIN de um gestor', async () => {
    const { token: tokenDono, empresaId } = await criarEmpresaComAdmin(request, app, 'c1e');
    const gestor = await criarGestor(tokenDono, 'F');
    const tecnicoDoGestor = await vincularTecnico(gestor.userId, empresaId, 'Ges');

    const res = await request(app)
      .post(`/api/tecnicos/${tecnicoDoGestor.id}/acesso/reset`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.pin).toMatch(/^\d{6}$/);
  });

  it('dono NÃO reseta o PIN da própria conta por esta via', async () => {
    const { token: tokenDono, userId: donoId, empresaId } = await criarEmpresaComAdmin(
      request,
      app,
      'c1f'
    );
    const tecnicoDoDono = await vincularTecnico(donoId, empresaId, 'Dono');

    const res = await request(app)
      .post(`/api/tecnicos/${tecnicoDoDono.id}/acesso/reset`)
      .set('Authorization', `Bearer ${tokenDono}`)
      .send({});

    expect(res.status).toBe(403);
  });
});
