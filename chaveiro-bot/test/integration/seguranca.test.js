import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma, criarEmpresaComAdmin } from './helpers.js';

const PONTO_SELFIES_DIR = path.resolve('./uploads-ponto');

// Cria uma batida de ponto com selfie (arquivo real em disco) numa empresa.
// Devolve o nome do arquivo (basename) para montar a URL do endpoint.
async function criarBatidaComSelfie(empresaId) {
  const tecnico = await prisma.tecnico.create({ data: { nome: 'Func', empresaId } });
  const registro = await prisma.registroPonto.create({
    data: { empresaId, tecnicoId: tecnico.id, data: new Date('2026-06-20'), entradaEm: new Date() },
  });
  const arquivo = `ponto-${randomUUID()}.jpg`;
  await mkdir(PONTO_SELFIES_DIR, { recursive: true });
  await writeFile(path.join(PONTO_SELFIES_DIR, arquivo), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
  await prisma.batidaPonto.create({
    data: { registroId: registro.id, tipo: 'entrada', em: new Date(), selfieUrl: `/uploads-ponto/${arquivo}` },
  });
  return arquivo;
}

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

describe('Segurança — selfie de ponto (biometria/LGPD) servida só via API autenticada', () => {
  it('exige autenticação para acessar a selfie (401 sem token)', async () => {
    const res = await request(app).get('/api/ponto/selfie/ponto-aaa.jpg');
    expect(res.status).toBe(401);
  });

  it('rejeita nome de arquivo inválido / path traversal (400)', async () => {
    const dono = await setupDono();
    const res = await request(app)
      .get('/api/ponto/selfie/naoehvalido.txt')
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(400);
  });

  it('não serve a selfie de OUTRA empresa (404, anti-IDOR cross-tenant)', async () => {
    const dono = await setupDono();
    const empresaId = (await prisma.usuario.findUnique({ where: { id: dono.id }, select: { empresaId: true } })).empresaId;
    const arquivo = await criarBatidaComSelfie(empresaId);

    // Segundo dono, de outra empresa, tenta baixar a selfie da primeira.
    const outro = await criarEmpresaComAdmin(request, app, 'Z');
    const res = await request(app)
      .get(`/api/ponto/selfie/${arquivo}`)
      .set('Authorization', `Bearer ${outro.token}`);
    expect(res.status).toBe(404);

    await unlink(path.join(PONTO_SELFIES_DIR, arquivo)).catch(() => {});
  });

  it('serve a selfie para quem tem permissão de ver ponto na MESMA empresa (200)', async () => {
    const dono = await setupDono();
    const empresaId = (await prisma.usuario.findUnique({ where: { id: dono.id }, select: { empresaId: true } })).empresaId;
    const arquivo = await criarBatidaComSelfie(empresaId);

    const res = await request(app)
      .get(`/api/ponto/selfie/${arquivo}`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);

    await unlink(path.join(PONTO_SELFIES_DIR, arquivo)).catch(() => {});
  });
});
