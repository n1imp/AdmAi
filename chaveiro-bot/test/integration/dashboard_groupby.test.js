/**
 * Teste de integração — equivalência de valor do GET /api/dashboard após F3.3.
 *
 * F3.3 trocou o findMany(take:10000) que alimentava 6 saídas em JS por:
 *   - escalares       → aggregate (SUM/COUNT)
 *   - porTecnico      → groupBy(tecnicoId) + resolve nome + RE-COLAPSA por nome
 *   - porLocal        → groupBy(local)
 *   - evolucaoDiaria  → findMany de 2 colunas (criadoEm, valorLiquido) + bucket dia em JS
 * Tudo via req.db → auto-escopado por empresaId (tenant.js), sem SQL cru.
 *
 * O seed exercita: 2 locais, 2 dias, e DOIS técnicos homônimos ("Ana") para provar
 * que o re-colapso por nome preserva o comportamento atual (uma linha só por nome).
 * Serviço pendente e serviço fora da janela devem ficar de fora de tudo.
 * Valores inteiros de propósito (isola a dívida de Float — F4).
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

const sBase = { descricao: 'S', msgOriginal: 'm', remetenteWpp: 'w', status: 'ativo' };
const dia10 = new Date('2024-06-10T12:00:00.000Z');
const dia11 = new Date('2024-06-11T12:00:00.000Z');
const foraJanela = new Date('2024-05-15T12:00:00.000Z');

describe('GET /api/dashboard — equivalência de valor (aggregate + groupBy, F3.3)', () => {
  it('escalares, porTecnico (colapso por nome), porLocal e evolucaoDiaria idênticos', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Dash33');
    const ana1 = await prisma.tecnico.create({ data: { empresaId, nome: 'Ana', comissao: 10 } });
    const bruno = await prisma.tecnico.create({ data: { empresaId, nome: 'Bruno', comissao: 20 } });
    const ana2 = await prisma.tecnico.create({ data: { empresaId, nome: 'Ana', comissao: 10 } }); // homônima de ana1

    await prisma.servico.createMany({
      data: [
        { ...sBase, empresaId, tecnicoId: ana1.id, local: 'Centro', valorCobrado: 120, valorMaterial: 20, valorLiquido: 100, comissaoGerada: 10, criadoEm: dia10 },
        { ...sBase, empresaId, tecnicoId: bruno.id, local: 'Centro', valorCobrado: 250, valorMaterial: 50, valorLiquido: 200, comissaoGerada: 40, criadoEm: dia10 },
        { ...sBase, empresaId, tecnicoId: bruno.id, local: 'Zona Sul', valorCobrado: 60, valorMaterial: 10, valorLiquido: 50, comissaoGerada: 5, criadoEm: dia11 },
        { ...sBase, empresaId, tecnicoId: ana2.id, local: 'Zona Sul', valorCobrado: 40, valorMaterial: 10, valorLiquido: 30, comissaoGerada: 3, criadoEm: dia11 },
        // Excluídos: pendente e fora da janela.
        { ...sBase, empresaId, tecnicoId: bruno.id, local: 'Centro', valorCobrado: 999, valorMaterial: 0, valorLiquido: 999, comissaoGerada: 999, status: 'pendente', criadoEm: dia10 },
        { ...sBase, empresaId, tecnicoId: ana1.id, local: 'Centro', valorCobrado: 500, valorMaterial: 0, valorLiquido: 500, comissaoGerada: 50, criadoEm: foraJanela },
      ],
    });

    const res = await request(app)
      .get('/api/dashboard?periodo=custom&inicio=2024-06-01&fim=2024-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    // Escalares (só ativos na janela: 100+200+50+30).
    expect(res.body.totalServicos).toBe(4);
    expect(res.body.receitaBruta).toBe(470); // 120+250+60+40
    expect(res.body.totalMaterial).toBe(90); // 20+50+10+10
    expect(res.body.receitaLiquida).toBe(380); // 100+200+50+30
    expect(res.body.totalComissao).toBe(58); // 10+40+5+3
    expect(res.body.ticketMedio).toBe(95); // 380/4
    expect(res.body.lucro).toBe(322); // 380-58
    expect(res.body.margemLucro).toBe(68.5); // 322/470*100

    // porTecnico: "Ana" colapsa ana1+ana2; ordenado por receitaLiquida desc.
    expect(res.body.porTecnico).toEqual([
      { tecnico: 'Bruno', servicos: 2, receitaBruta: 310, receitaLiquida: 250, comissao: 45, percentualReceita: 65.8, ticketMedio: 125 },
      { tecnico: 'Ana', servicos: 2, receitaBruta: 160, receitaLiquida: 130, comissao: 13, percentualReceita: 34.2, ticketMedio: 65 },
    ]);

    // porLocal: ordenado por receita desc.
    expect(res.body.porLocal).toEqual([
      { local: 'Centro', quantidade: 2, receita: 300 },
      { local: 'Zona Sul', quantidade: 2, receita: 80 },
    ]);

    // evolucaoDiaria: bucket por dia UTC, ordenado asc.
    expect(res.body.evolucaoDiaria).toEqual([
      { data: '2024-06-10', receita: 300, servicos: 2 },
      { data: '2024-06-11', receita: 80, servicos: 2 },
    ]);
  });

  it('sem serviços no período: escalares zerados e listas vazias', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'Dash33Vazio');
    const res = await request(app)
      .get('/api/dashboard?periodo=custom&inicio=2024-06-01&fim=2024-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalServicos).toBe(0);
    expect(res.body.receitaLiquida).toBe(0); // _sum null → 0
    expect(res.body.porTecnico).toEqual([]);
    expect(res.body.porLocal).toEqual([]);
    expect(res.body.evolucaoDiaria).toEqual([]);
  });
});
