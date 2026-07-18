/**
 * Teste de integração — equivalência de valor após F3.2.
 *
 * F3.2 trocou os 3 sites de agregação PURA restantes (findMany take:10000 + reduce)
 * por `aggregate` (SUM/COUNT) no Postgres:
 *   - GET /api/tecnicos/:id/perfil  → todosServicos (SUM comissão + COUNT) e
 *                                     servicosMesAtual (SUM valorLiquido);
 *   - GET /api/dashboard            → servicosAnterior (SUM valorLiquido + COUNT),
 *                                     usado no `comparativo`.
 * Os findMany que RETORNAM linhas ao cliente (servicosPeriodo, pagamentos, servicos)
 * permanecem — são alvo de keyset/groupBy nas fatias seguintes, não desta.
 *
 * Valores inteiros de propósito: isola a equivalência do somatório da dívida de Float (F4).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

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

const sBase = {
  local: 'Local',
  descricao: 'S',
  msgOriginal: 'm',
  remetenteWpp: 'w',
  status: 'ativo',
};

describe('F3.2 — aggregate no banco (equivalência de valor)', () => {
  it('/tecnicos/:id/perfil: totais e receita do mês vêm do SUM/COUNT do banco', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Perfil');
    const tec = await prisma.tecnico.create({
      data: { empresaId, nome: 'Tec P', comissao: 20, metaMensal: 1000 },
    });
    const agora = new Date();
    const antigo = new Date('2020-01-15T12:00:00.000Z');
    await prisma.servico.createMany({
      data: [
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 100,
          valorLiquido: 100,
          comissaoGerada: 20,
          criadoEm: agora,
        },
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 50,
          valorLiquido: 50,
          comissaoGerada: 10,
          criadoEm: agora,
        },
        // Ativo em mês antigo → conta em "todos", NÃO em receita do mês.
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 200,
          valorLiquido: 200,
          comissaoGerada: 40,
          criadoEm: antigo,
        },
        // Pendente → fora de toda agregação de ativos.
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 999,
          valorLiquido: 999,
          comissaoGerada: 999,
          status: 'pendente',
          criadoEm: agora,
        },
      ],
    });
    await prisma.pagamento.createMany({
      data: [
        { empresaId, tecnicoId: tec.id, valor: 30 },
        { empresaId, tecnicoId: tec.id, valor: 15 },
      ],
    });

    const res = await request(app)
      .get(`/api/tecnicos/${tec.id}/perfil`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.tecnico.totalServicos).toBe(3); // aggTodos._count (ativos; pendente fora)
    expect(res.body.tecnico.totalComissaoGanha).toBe(70); // 20 + 10 + 40
    expect(res.body.tecnico.totalRecebido).toBe(45); // 30 + 15
    expect(res.body.tecnico.saldoPendente).toBe(25); // 70 - 45
    expect(res.body.meta.receitaMes).toBe(150); // aggMesAtual._sum.valorLiquido (mês corrente: 100 + 50)
    expect(res.body.meta.progresso).toBe(15); // 150 / 1000 * 100
  });

  it('/dashboard: período anterior somado no banco (comparativo)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Dash');
    const tec = await prisma.tecnico.create({ data: { empresaId, nome: 'Tec D', comissao: 20 } });
    await prisma.servico.createMany({
      data: [
        // Atual (junho/2024)
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 100,
          valorLiquido: 100,
          comissaoGerada: 20,
          criadoEm: new Date('2024-06-10T12:00:00.000Z'),
        },
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 200,
          valorLiquido: 200,
          comissaoGerada: 40,
          criadoEm: new Date('2024-06-20T12:00:00.000Z'),
        },
        // Anterior (maio/2024)
        {
          ...sBase,
          empresaId,
          tecnicoId: tec.id,
          valorCobrado: 150,
          valorLiquido: 150,
          comissaoGerada: 30,
          criadoEm: new Date('2024-05-15T12:00:00.000Z'),
        },
      ],
    });

    const res = await request(app)
      .get('/api/dashboard?periodo=custom&inicio=2024-06-01&fim=2024-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalServicos).toBe(2); // atual
    expect(res.body.receitaLiquida).toBe(300); // 100 + 200
    // comparativo usa receitaLiquidaAnterior (aggAnterior._sum) e totalServicosAnterior (aggAnterior._count)
    expect(res.body.comparativo.receitaLiquida).toBe(100); // variacao(300, 150)
    expect(res.body.comparativo.totalServicos).toBe(100); // variacao(2, 1)
  });

  it('/dashboard: período anterior vazio → _sum null vira 0 (comparativo null)', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'DashVazio');
    const tec = await prisma.tecnico.create({ data: { empresaId, nome: 'Tec DV', comissao: 20 } });
    await prisma.servico.create({
      data: {
        ...sBase,
        empresaId,
        tecnicoId: tec.id,
        valorCobrado: 100,
        valorLiquido: 100,
        comissaoGerada: 20,
        criadoEm: new Date('2024-06-10T12:00:00.000Z'),
      },
    });

    const res = await request(app)
      .get('/api/dashboard?periodo=custom&inicio=2024-06-01&fim=2024-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.receitaLiquida).toBe(100);
    // Anterior vazio: receitaLiquidaAnterior=0 e totalServicosAnterior=0 → variacao(atual>0, 0) === null.
    expect(res.body.comparativo.receitaLiquida).toBeNull();
    expect(res.body.comparativo.totalServicos).toBeNull();
  });
});
