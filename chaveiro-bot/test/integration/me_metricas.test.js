/**
 * Teste de integração — GET /api/me/metricas (F9/M1: período selecionável + série diária).
 * Confirma que o contrato atual (mesAtual, comissaoGanha, etc.) é preservado e que os campos
 * novos (`periodo`, `serie`) são corretos, filtram por período e respeitam o multi-tenant.
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

async function registrarServico(token, valorCobrado) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ local: 'Casa do cliente', descricao: 'Serviço', valorCobrado });
  expect(res.status).toBe(201);
  return res.body;
}

describe('GET /api/me/metricas — período + série (F9/M1)', () => {
  it('preserva o contrato atual e adiciona os blocos periodo + serie', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'Met');
    const { token: func, tecnicoId } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990001000',
      comissao: 20,
    });
    // aprovacaoServico OFF (default) → serviços do funcionário entram 'ativo'.
    await registrarServico(func, 200);
    await registrarServico(func, 300);

    const res = await request(app)
      .get('/api/me/metricas?periodo=mes')
      .set('Authorization', `Bearer ${func}`);
    expect(res.status).toBe(200);
    // Contrato atual preservado.
    expect(res.body.tecnico.id).toBe(tecnicoId);
    expect(res.body.comissaoGanha).toBe(100); // 20% de 500
    expect(res.body.servicosPendentes).toBe(0);
    expect(res.body.mesAtual).toBeDefined();
    // Aditivo: bloco do período.
    expect(res.body.periodo.chave).toBe('mes');
    expect(res.body.periodo.servicos).toBe(2);
    expect(res.body.periodo.receitaLiquida).toBe(500);
    expect(res.body.periodo.comissao).toBe(100);
    // Aditivo: série diária (tudo hoje → 1 bucket).
    expect(Array.isArray(res.body.serie)).toBe(true);
    expect(res.body.serie.length).toBe(1);
    expect(res.body.serie[0].receita).toBe(500);
    expect(res.body.serie[0].comissao).toBe(100);
  });

  it('filtra por período: custom no passado exclui os serviços de hoje', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'Met2');
    const { token: func } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990002000',
    });
    await registrarServico(func, 100);

    const hoje = await request(app)
      .get('/api/me/metricas?periodo=hoje')
      .set('Authorization', `Bearer ${func}`);
    expect(hoje.body.periodo.servicos).toBe(1);

    const passado = await request(app)
      .get('/api/me/metricas?periodo=custom&inicio=2020-01-01&fim=2020-12-31')
      .set('Authorization', `Bearer ${func}`);
    expect(passado.body.periodo.servicos).toBe(0);
    expect(passado.body.serie).toEqual([]);
  });

  it('rejeita período inválido (400)', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'Met3');
    const { token: func } = await criarFuncionarioComAcesso(request, app, dono, {
      telefone: '5521990003000',
    });
    const res = await request(app)
      .get('/api/me/metricas?periodo=xyz')
      .set('Authorization', `Bearer ${func}`);
    expect(res.status).toBe(400);
  });

  it('multi-tenant: conta apenas os serviços do próprio técnico/empresa', async () => {
    const { token: donoA } = await criarEmpresaComAdmin(request, app, 'MetA');
    const { token: funcA } = await criarFuncionarioComAcesso(request, app, donoA, {
      telefone: '5521990004000',
    });
    await registrarServico(funcA, 100);

    const { token: donoB } = await criarEmpresaComAdmin(request, app, 'MetB');
    const { token: funcB } = await criarFuncionarioComAcesso(request, app, donoB, {
      telefone: '5521990005000',
    });
    await registrarServico(funcB, 999);

    const resA = await request(app)
      .get('/api/me/metricas?periodo=mes')
      .set('Authorization', `Bearer ${funcA}`);
    expect(resA.body.periodo.receitaLiquida).toBe(100);
    expect(resA.body.periodo.servicos).toBe(1);
  });
});
