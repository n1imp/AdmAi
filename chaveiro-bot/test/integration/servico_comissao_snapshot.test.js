/**
 * A taxa de comissão vira SNAPSHOT no serviço — e o passado para de ser irreconstituível.
 * [FIX-COMISSAO-SNAPSHOT · achado 2 da revisão independente, thread 01a02cf7]
 *
 * O DEFEITO: `comissaoGerada` grava o VALOR; a taxa vigente era "recuperável por divisão" —
 * mentira aritmética: `toFixed(2)` sobre líquido 1,01 a 5% grava 0,05, e a divisão devolve
 * 4,95%; líquido zero nem divide. Mudar `Tecnico.comissao` não reescreve o passado (certo),
 * mas também o tornava indecifrável.
 *
 * O CONTRATO NOVO: todo serviço criado grava `comissaoTaxaAplicada` — a taxa NO MOMENTO da
 * escrita, imutável dali em diante. Histórico anterior fica NULL: lacuna honesta, nunca taxa
 * inventada retroativamente.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

let app;

beforeAll(async () => {
  ({ app } = await criarApp());
  await limparBanco();
});

describe('snapshot da taxa de comissão', () => {
  it('grava a taxa vigente na criação; mudar a taxa depois NÃO reescreve o serviço', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Snap');
    const tecnico = await prisma.tecnico.create({
      data: { empresaId, nome: 'Snapshot Tester', telefone: '5511977770001', comissao: 5 },
    });

    // O caso EXATO do achado: líquido 1,01 a 5% → comissaoGerada 0,05 → divisão daria 4,95%.
    const criacao = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        local: 'Casa do cliente',
        descricao: 'Snapshot da taxa',
        valorCobrado: 1.01,
        valorMaterial: 0,
        tecnico: 'Snapshot Tester',
      });
    expect(criacao.status).toBe(201);

    const servico = await prisma.servico.findFirst({
      where: { empresaId, descricao: 'Snapshot da taxa' },
    });
    expect(servico.comissaoGerada).toBe(0.05);
    expect(servico.comissaoTaxaAplicada).toBe(5); // a divisão diria 4,9504…%

    // A taxa muda; o snapshot não.
    await prisma.tecnico.update({ where: { id: tecnico.id }, data: { comissao: 12 } });
    const depois = await prisma.servico.findUnique({ where: { id: servico.id } });
    expect(depois.comissaoTaxaAplicada).toBe(5);

    // E o próximo serviço nasce com a taxa NOVA — o snapshot é por escrita, não por técnico.
    const segunda = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        local: 'Casa do cliente',
        descricao: 'Segunda taxa',
        valorCobrado: 100,
        valorMaterial: 0,
        tecnico: 'Snapshot Tester',
      });
    expect(segunda.status).toBe(201);
    const servico2 = await prisma.servico.findFirst({ where: { empresaId, descricao: 'Segunda taxa' } });
    expect(servico2.comissaoTaxaAplicada).toBe(12);
    expect(servico2.comissaoGerada).toBe(12);
  });

  it('líquido ZERO: o valor não diz nada, o snapshot diz tudo', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Zero');
    await prisma.tecnico.create({
      data: { empresaId, nome: 'Zero Tester', telefone: '5511977770002', comissao: 7.5 },
    });
    const r = await request(app)
      .post('/api/servicos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        local: 'Contrato',
        descricao: 'Cortesia',
        valorCobrado: 50,
        valorMaterial: 50, // líquido 0 → comissão 0 → divisão impossível
        tecnico: 'Zero Tester',
      });
    expect(r.status).toBe(201);
    const servico = await prisma.servico.findFirst({ where: { empresaId, descricao: 'Cortesia' } });
    expect(servico.comissaoGerada).toBe(0);
    expect(servico.comissaoTaxaAplicada).toBe(7.5);
  });
});
