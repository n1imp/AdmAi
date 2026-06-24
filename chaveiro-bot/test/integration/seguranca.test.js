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

// Cria o primeiro dono + empresa e devolve { token, id }.
async function setupDono() {
  const res = await request(app).post('/api/setup').send({
    nome: 'Dono', nomeEmpresa: 'Empresa X', username: 'dono', senha: 'Segredo#123',
  });
  return { token: res.body.token, id: res.body.id };
}

describe('Segurança — RBAC e força de senha (admin)', () => {
  it('rejeita senha fraca quando o admin redefine a senha de um usuário (400)', async () => {
    const dono = await setupDono();
    const criado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ nome: 'Gestor', username: 'gestor1', senha: 'Forte#123', papel: 'gestor' });
    expect(criado.status).toBe(201);

    const res = await request(app)
      .patch(`/api/usuarios/${criado.body.id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ senha: '123456' });
    expect(res.status).toBe(400);
  });

  it('impede o usuário de alterar o PRÓPRIO papel (escalonamento de privilégio) (400)', async () => {
    const dono = await setupDono();
    const res = await request(app)
      .patch(`/api/usuarios/${dono.id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ papel: 'funcionario' });
    expect(res.status).toBe(400);
  });

  it('impede o usuário de desativar a própria conta (400)', async () => {
    const dono = await setupDono();
    const res = await request(app)
      .patch(`/api/usuarios/${dono.id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ ativo: false });
    expect(res.status).toBe(400);
  });

  it('não vaza usuário de outra empresa no PATCH (404, anti-IDOR cross-tenant)', async () => {
    const dono = await setupDono();
    // Cria uma SEGUNDA empresa + usuário direto no banco (o /setup só roda em banco vazio).
    const outra = await prisma.empresa.create({ data: { nome: 'Empresa Y', slug: 'empresa-y' } });
    const alvo = await prisma.usuario.create({
      data: { nome: 'Outro', username: 'outro_y', senhaHash: 'x', papel: 'gestor', empresaId: outra.id },
      select: { id: true },
    });

    const res = await request(app)
      .patch(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${dono.token}`)
      .send({ nome: 'Hackeado' });
    expect(res.status).toBe(404);
  });
});
