/**
 * Concorrência REAL de estoque — o guard que a forma da escrita não dá.  [FIX-ESTOQUE-CORRIDA]
 *
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA NUNCA DEIXAR VOLTAR
 *   A versão com `increment` fechava o lost-update do SALDO, mas o piso (`Math.max(0, …)`) e o
 *   `saldoApos` do ledger eram computados contra leitura STALE: duas saídas concorrentes de 7
 *   sobre saldo 10 liam 10 as duas, cada uma aplicava −7, e o saldo real terminava em **−4**
 *   com AMBAS as linhas do histórico afirmando `saldoApos = 3`. O comentário do código prometia
 *   atomicidade que o código não entregava — achado da revisão independente (thread 01a02cf7),
 *   verificado linha a linha antes da correção.
 *
 * POR QUE UNIT NÃO BASTA
 *   O teste unitário assere o CÁLCULO sob um valor mockado; corrida só existe com banco de
 *   verdade e transações de verdade. Aqui as duas saídas disputam o `FOR UPDATE` no Postgres
 *   real — é a única prova que morde.
 *
 * PROPRIEDADES (valem para QUALQUER intercalação):
 *   1. saldo final nunca negativo;
 *   2. a cadeia do ledger é consistente consigo: cada `saldoApos` = saldo anterior − quantidade
 *      aplicada, na ordem de criação;
 *   3. a soma das quantidades aplicadas = saldo inicial − saldo final (nada some, nada dobra).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';
import { movimentarEstoque } from '../../src/services/estoque.js';

let app;

beforeAll(async () => {
  ({ app } = await criarApp());
  await limparBanco();
});

async function novoMaterial(empresaId, saldo) {
  return prisma.material.create({
    data: {
      empresaId,
      nome: `Concorrente ${Date.now()}-${Math.random()}`,
      unidade: 'un',
      precoUnit: 10,
      quantidadeAtual: saldo,
    },
  });
}

async function cadeiaConsistente(materialId, saldoInicial) {
  const movs = await prisma.movimentacaoEstoque.findMany({
    where: { materialId },
    orderBy: { id: 'asc' },
  });
  let saldo = saldoInicial;
  for (const m of movs) {
    const delta = m.tipo === 'saida' ? -m.quantidade : m.quantidade;
    saldo = saldo + delta;
    if (m.saldoApos !== saldo) return { ok: false, movs, esperado: saldo, gravado: m.saldoApos };
  }
  return { ok: true, movs, saldoFinal: saldo };
}

describe('movimentarEstoque sob concorrência real', () => {
  it('duas saídas de 7 sobre saldo 10: nunca −4, ledger consistente, nada some nem dobra', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'Corrida');
    const material = await novoMaterial(empresaId, 10);

    const sair = () =>
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 7 });
    await Promise.all([sair(), sair()]);

    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    // O bug antigo dava exatamente −4 aqui, com dois ledgers dizendo 3.
    expect(depois.quantidadeAtual).toBeGreaterThanOrEqual(0);
    expect(depois.quantidadeAtual).toBe(0); // 10 → −7 → clamp: 3 → −7 → clamp: 0

    const cadeia = await cadeiaConsistente(material.id, 10);
    expect(cadeia.ok, JSON.stringify(cadeia)).toBe(true);
    expect(cadeia.saldoFinal).toBe(depois.quantidadeAtual);

    const aplicado = cadeia.movs.reduce((t, m) => t + m.quantidade, 0);
    expect(aplicado).toBe(10 - depois.quantidadeAtual);
  });

  it('rajada mista (4 saídas × 3 + 2 entradas × 5) termina com saldo exato e cadeia íntegra', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'Rajada');
    const material = await novoMaterial(empresaId, 6);

    await Promise.all([
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 3 }),
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 3 }),
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'entrada', quantidade: 5 }),
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 3 }),
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'entrada', quantidade: 5 }),
      movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 3 }),
    ]);

    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    const cadeia = await cadeiaConsistente(material.id, 6);
    expect(cadeia.ok, JSON.stringify(cadeia)).toBe(true);
    expect(cadeia.saldoFinal).toBe(depois.quantidadeAtual);
    expect(depois.quantidadeAtual).toBeGreaterThanOrEqual(0);
    /* A primeira versão asseria `=== 4`, assumindo que nenhuma saída seria clampada — FALSO sob
       concorrência: se o escalonador ordenar as três primeiras saídas antes de qualquer entrada
       (6→3→0→clamp), uma saída aplica menos, e o final legítimo é 7. O clamp contra o valor
       VERDADEIRO é exatamente a semântica correta; era o TESTE que sobre-especificava a ordem
       (flakou 2 em 5 execuções). As propriedades certas independem da intercalação:
       conservação exata + clamp só quando o disponível travado era menor que o pedido. */
    const entradas = cadeia.movs
      .filter((m) => m.tipo === 'entrada')
      .reduce((t, m) => t + m.quantidade, 0);
    const saidas = cadeia.movs
      .filter((m) => m.tipo === 'saida')
      .reduce((t, m) => t + m.quantidade, 0);
    expect(entradas).toBe(10); // entradas nunca clampam
    expect(saidas).toBeLessThanOrEqual(12); // saídas aplicam no máximo o pedido
    expect(6 + entradas - saidas).toBe(depois.quantidadeAtual); // conservação exata
    // Toda saída clampada precisa coincidir com saldoApos === 0 (só se clampa no chão).
    for (const m of cadeia.movs.filter((x) => x.tipo === 'saida' && x.quantidade < 3)) {
      expect(m.saldoApos).toBe(0);
    }
  });

  it('CONTRAPROVA de que o teste morde: a soma aplicada nunca excede o disponível', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'Prova');
    const material = await novoMaterial(empresaId, 5);
    await Promise.all(
      Array.from({ length: 4 }, () =>
        movimentarEstoque({ materialId: material.id, empresaId, tipo: 'saida', quantidade: 4 })
      )
    );
    const depois = await prisma.material.findUnique({ where: { id: material.id } });
    expect(depois.quantidadeAtual).toBe(0);
    const movs = await prisma.movimentacaoEstoque.findMany({ where: { materialId: material.id } });
    const aplicado = movs.reduce((t, m) => t + m.quantidade, 0);
    // Sob o bug antigo: 4 × 4 = 16 aplicados sobre saldo 5 (saldo real −11).
    expect(aplicado).toBe(5);
  });
});
