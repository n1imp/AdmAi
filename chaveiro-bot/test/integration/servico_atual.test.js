/**
 * Teste de integração — serviço em andamento / "serviço atual" (F9/M3).
 * Transições ADITIVAS sobre um serviço já existente do próprio técnico:
 *   ativo → em_andamento (POST /servicos/:id/iniciar) → ativo (POST /servicos/:id/concluir),
 * com GET /me/servico-atual devolvendo o serviço em andamento (ou null).
 * Cobre: happy path, único "atual" por técnico (409), posse (não inicia serviço de outro),
 * multi-tenant, RBAC (só funcionário com tecnicoId) e o gate da flag (off → 404).
 * A flag SERVICO_ANDAMENTO_ENABLED é ligada globalmente no vitest.integration.config.js.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

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

/** Registra um serviço (status 'ativo') pelo próprio funcionário e devolve seu id. */
async function registrarServico(token, valorCobrado = 120) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ local: 'Casa do cliente', descricao: 'Serviço de teste', valorCobrado });
  expect(res.status).toBe(201);
  expect(res.body.status).toBe('ativo');
  return res.body.id;
}

describe('Serviço em andamento / servico-atual (F9/M3)', () => {
  it('iniciar → servico-atual → concluir (ciclo feliz)', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'SA');
    const { token: func, tecnicoId } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990110000',
    });
    const servicoId = await registrarServico(func);

    // Sem nada iniciado, o atual é null.
    const antes = await request(app)
      .get('/api/me/servico-atual')
      .set('Authorization', `Bearer ${func}`);
    expect(antes.status).toBe(200);
    expect(antes.body.servico).toBeNull();

    // Inicia → em_andamento + iniciadoEm.
    const ini = await request(app)
      .post(`/api/servicos/${servicoId}/iniciar`)
      .set('Authorization', `Bearer ${func}`);
    expect(ini.status).toBe(200);
    expect(ini.body.servico.status).toBe('em_andamento');
    expect(ini.body.servico.iniciadoEm).toBeTruthy();

    // servico-atual passa a devolvê-lo.
    const atual = await request(app)
      .get('/api/me/servico-atual')
      .set('Authorization', `Bearer ${func}`);
    expect(atual.status).toBe(200);
    expect(atual.body.servico.id).toBe(servicoId);
    expect(atual.body.servico.tecnico.id).toBe(tecnicoId);

    // Conclui → volta a 'ativo' + finalizadoEm.
    const fim = await request(app)
      .post(`/api/servicos/${servicoId}/concluir`)
      .set('Authorization', `Bearer ${func}`);
    expect(fim.status).toBe(200);
    expect(fim.body.servico.status).toBe('ativo');
    expect(fim.body.servico.finalizadoEm).toBeTruthy();

    // Sem em andamento novamente → null.
    const depois = await request(app)
      .get('/api/me/servico-atual')
      .set('Authorization', `Bearer ${func}`);
    expect(depois.body.servico).toBeNull();
  });

  it('um único "atual" por técnico: iniciar um segundo → 409', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'SA2');
    const { token: func } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990120000',
    });
    const s1 = await registrarServico(func);
    const s2 = await registrarServico(func);

    expect(
      (
        await request(app)
          .post(`/api/servicos/${s1}/iniciar`)
          .set('Authorization', `Bearer ${func}`)
      ).status
    ).toBe(200);
    const dup = await request(app)
      .post(`/api/servicos/${s2}/iniciar`)
      .set('Authorization', `Bearer ${func}`);
    expect(dup.status).toBe(409);
    expect(dup.body.servicoId).toBe(s1);

    // Reiniciar o MESMO em andamento é idempotente (200, sem 409).
    const mesmo = await request(app)
      .post(`/api/servicos/${s1}/iniciar`)
      .set('Authorization', `Bearer ${func}`);
    expect(mesmo.status).toBe(200);
  });

  it('posse: técnico não inicia serviço de outro técnico (mesma empresa) → 404', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'SA3');
    const { token: funcA } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990130000',
    });
    const { token: funcB } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990140000',
    });
    const servicoDeB = await registrarServico(funcB);

    const res = await request(app)
      .post(`/api/servicos/${servicoDeB}/iniciar`)
      .set('Authorization', `Bearer ${funcA}`);
    expect(res.status).toBe(404);
    // O serviço de B continua intacto.
    const s = await prisma.servico.findUnique({ where: { id: servicoDeB } });
    expect(s.status).toBe('ativo');
  });

  it('multi-tenant: empresa B não enxerga/inicia serviço da empresa A', async () => {
    const { token: donoA } = await criarEmpresaComAdmin(request, app, 'SAa');
    const { token: funcA } = await criarFuncionarioComAcesso(request, app, donoA, {
      telefone: '5521990150000',
    });
    const servicoA = await registrarServico(funcA);
    const { token: donoB } = await criarEmpresaComAdmin(request, app, 'SAb');
    const { token: funcB } = await criarFuncionarioComAcesso(request, app, donoB, {
      telefone: '5521990160000',
    });

    const res = await request(app)
      .post(`/api/servicos/${servicoA}/iniciar`)
      .set('Authorization', `Bearer ${funcB}`);
    expect(res.status).toBe(404);
    // servico-atual de B segue vazio.
    const atualB = await request(app)
      .get('/api/me/servico-atual')
      .set('Authorization', `Bearer ${funcB}`);
    expect(atualB.body.servico).toBeNull();
  });

  it('RBAC: dono/gestor (sem tecnicoId) não acessa o servico-atual → 403', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'SA4');
    const res = await request(app)
      .get('/api/me/servico-atual')
      .set('Authorization', `Bearer ${dono}`);
    expect(res.status).toBe(403);
  });

  it('flag off: mesmo autenticado, os endpoints respondem 404', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'SA5');
    const { token: func } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990170000',
    });

    // Re-importa o app com a flag DESLIGADA (env é lido no boot do módulo).
    vi.resetModules();
    vi.stubEnv('SERVICO_ANDAMENTO_ENABLED', '');
    const { criarApp: criarAppOff } = await import('../../src/app.js');
    const { app: appOff } = criarAppOff();
    try {
      const res = await request(appOff)
        .get('/api/me/servico-atual')
        .set('Authorization', `Bearer ${func}`);
      expect(res.status).toBe(404);
      const ini = await request(appOff)
        .post('/api/servicos/1/iniciar')
        .set('Authorization', `Bearer ${func}`);
      expect(ini.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
