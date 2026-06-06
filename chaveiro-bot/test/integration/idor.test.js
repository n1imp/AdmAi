import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * O teste de maior valor: isolamento multi-tenant (anti-IDOR).
 * Empresa A NÃO pode ler, editar ou apagar recursos da Empresa B — mesmo sabendo
 * o id exato. O comportamento esperado é 404 (não 403), não vazando existência.
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

async function criarTecnico(token, nome) {
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, comissao: 10 });
  expect(res.status).toBe(201);
  return res.body;
}

async function criarMaterial(token, nome) {
  const res = await request(app)
    .post('/api/materiais')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, precoUnit: 10 });
  expect(res.status).toBe(201);
  return res.body;
}

describe('IDOR cross-tenant', () => {
  it('Empresa A não vê o técnico da Empresa B (404 no PATCH por id)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const B = await criarEmpresaComAdmin(request, app, 'B');

    const tecnicoB = await criarTecnico(B.token, 'Técnico da B');

    // A tenta desativar o técnico de B usando o id real → deve dar 404
    const res = await request(app)
      .patch(`/api/tecnicos/${tecnicoB.id}`)
      .set('Authorization', `Bearer ${A.token}`)
      .send({ ativo: false });
    expect(res.status).toBe(404);

    // E o técnico de B continua ativo
    const tecnicoNoBanco = await prisma.tecnico.findUnique({ where: { id: tecnicoB.id } });
    expect(tecnicoNoBanco.ativo).toBe(true);
  });

  it('A lista de técnicos de A não inclui técnicos de B', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const B = await criarEmpresaComAdmin(request, app, 'B');
    await criarTecnico(A.token, 'Só da A');
    await criarTecnico(B.token, 'Só da B');

    const res = await request(app).get('/api/tecnicos').set('Authorization', `Bearer ${A.token}`);
    expect(res.status).toBe(200);
    const nomes = res.body.map((t) => t.nome);
    expect(nomes).toContain('Só da A');
    expect(nomes).not.toContain('Só da B');
  });

  it('Empresa A não apaga o material da Empresa B (404 no DELETE por id)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const B = await criarEmpresaComAdmin(request, app, 'B');
    const materialB = await criarMaterial(B.token, 'Fechadura B');

    const res = await request(app)
      .delete(`/api/materiais/${materialB.id}`)
      .set('Authorization', `Bearer ${A.token}`);
    expect(res.status).toBe(404);

    const aindaExiste = await prisma.material.findUnique({ where: { id: materialB.id } });
    expect(aindaExiste).not.toBeNull();
  });
});

describe('GET /api/servicos — paginação', () => {
  it('respeita limit e devolve metadados de paginação', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const tecnico = await criarTecnico(A.token, 'Técnico Pag');
    // cria 3 serviços
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/servicos')
        .set('Authorization', `Bearer ${A.token}`)
        .send({ tecnico: 'Técnico Pag', local: 'Casa', descricao: `Serviço ${i}`, valorCobrado: 100 });
    }
    const res = await request(app)
      .get('/api/servicos?limit=2&page=1')
      .set('Authorization', `Bearer ${A.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(2);
  });
});
