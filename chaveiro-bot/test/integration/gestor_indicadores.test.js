/**
 * Teste de integração — GET /api/gestor/indicadores (F9/M2).
 * Indicadores operacionais do gestor num único round-trip: contagem de pendentes,
 * presença do time HOJE (agregado de ponto) e resumo de avaliações. Cobre RBAC e multi-tenant.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

const SELFIE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

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

describe('GET /api/gestor/indicadores (F9/M2)', () => {
  it('retorna pendentes, presença do time (trabalhando) e avaliações num único request', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'Ind');
    await request(app)
      .patch('/api/config/empresa')
      .set('Authorization', `Bearer ${dono}`)
      .send({ aprovacaoServico: true });

    const { token: func, tecnicoId } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990010000',
      nome: 'Ana',
    });
    // Bate ponto (entrada) → presença HOJE.
    const rp = await request(app)
      .post('/api/ponto/bater')
      .set('Authorization', `Bearer ${func}`)
      .send({ lat: -22.9, lng: -43.1, precisao: 10, selfie: SELFIE_PNG });
    expect(rp.status).toBe(201);
    // Registra serviço → entra pendente (aprovacaoServico ON).
    const rs = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${func}`)
      .send({
        local: 'Casa do cliente',
        descricao: 'Serviço de teste',
        valorCobrado: 100,
        clienteTelefone: '5521990009999',
      });
    expect(rs.status).toBe(201);
    expect(rs.body.status).toBe('pendente');

    const res = await request(app)
      .get('/api/gestor/indicadores')
      .set('Authorization', `Bearer ${dono}`);
    expect(res.status).toBe(200);
    expect(res.body.pendentes).toBe(1);
    expect(res.body.totalTecnicos).toBe(1);
    const ana = res.body.presencaHoje.find((p) => p.tecnicoId === tecnicoId);
    expect(ana).toBeDefined();
    expect(ana.status).toBe('trabalhando');
    expect(res.body.presentes).toBe(1);
    expect(res.body.avaliacoes).toHaveProperty('total');
  });

  it('nega acesso ao funcionário (sem dashboard.ver) → 403', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'Ind2');
    const { token: func } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990020000',
    });
    const res = await request(app)
      .get('/api/gestor/indicadores')
      .set('Authorization', `Bearer ${func}`);
    expect(res.status).toBe(403);
  });

  it('multi-tenant: só enxerga os técnicos da própria empresa', async () => {
    const { token: donoA } = await criarEmpresaComAdmin(request, app, 'IndA');
    const { tecnicoId: tecA } = await criarFuncionarioComAcesso(request, app, donoA, {
      telefone: '5521990030000',
    });
    const { token: donoB } = await criarEmpresaComAdmin(request, app, 'IndB');
    await criarFuncionarioComAcesso(request, app, donoB, { telefone: '5521990040000' });

    const resA = await request(app)
      .get('/api/gestor/indicadores')
      .set('Authorization', `Bearer ${donoA}`);
    expect(resA.status).toBe(200);
    expect(resA.body.totalTecnicos).toBe(1);
    expect(resA.body.presencaHoje.every((p) => p.tecnicoId === tecA)).toBe(true);
  });
});
