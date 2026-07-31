import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma cru é o default de `tx`/`client` nessas funções — mockado para exercitar a
// checagem de tenant sem banco.
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    material: { findFirst: vi.fn(), update: vi.fn() },
    movimentacaoEstoque: { create: vi.fn() },
    $transaction: vi.fn((fn) => fn(globalThis.__clienteMock)),
  },
}));

vi.mock('../notificacao.js', () => ({ alertarEstoqueBaixo: vi.fn().mockResolvedValue(null) }));

import { movimentarEstoque, darBaixaPorServico } from '../estoque.js';

function clienteFake({ material }) {
  return {
    material: {
      findFirst: vi.fn().mockResolvedValue(material),
      update: vi.fn().mockResolvedValue({}),
    },
    movimentacaoEstoque: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * F6 — o parâmetro `tx`/`client` cai no prisma CRU (sem escopo de tenant) quando omitido,
 * então a leitura do material precisa filtrar por empresaId localmente. Antes, a função
 * dependia inteiramente de o chamador ter validado a posse.
 */
describe('movimentarEstoque — isolamento por empresaId (F6)', () => {
  it('exige empresaId explicitamente', async () => {
    await expect(
      movimentarEstoque({ materialId: 1, tipo: 'saida', quantidade: 1 }, clienteFake({}))
    ).rejects.toThrow(/empresaId obrigat/i);
  });

  it('filtra o material por empresaId (material de outro tenant = inexistente)', async () => {
    // findFirst devolve null: é o que o Prisma faria para um material de OUTRA empresa.
    const client = clienteFake({ material: null });
    await expect(
      movimentarEstoque({ materialId: 99, empresaId: 7, tipo: 'saida', quantidade: 1 }, client)
    ).rejects.toThrow('Material não encontrado');

    // O empresaId precisa estar no where — sem isso o material vazaria entre tenants.
    expect(client.material.findFirst).toHaveBeenCalledWith({
      where: { id: 99, empresaId: 7 },
    });
    expect(client.material.update).not.toHaveBeenCalled();
  });

  it('movimenta normalmente quando o material pertence à empresa', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 10, empresaId: 7 } });
    const r = await movimentarEstoque(
      { materialId: 5, empresaId: 7, tipo: 'saida', quantidade: 4 },
      client
    );
    expect(client.material.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantidadeAtual: 6 },
    });
    expect(r.material.quantidadeAtual).toBe(6);
  });

  it('nunca deixa o saldo negativo (limita a baixa ao disponível)', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 2, empresaId: 7 } });
    const r = await movimentarEstoque(
      { materialId: 5, empresaId: 7, tipo: 'saida', quantidade: 100 },
      client
    );
    expect(r.material.quantidadeAtual).toBe(0);
  });

  it('rejeita quantidade não positiva', async () => {
    await expect(
      movimentarEstoque({ materialId: 1, empresaId: 7, tipo: 'saida', quantidade: 0 }, {})
    ).rejects.toThrow(/positiva/i);
  });
});

describe('darBaixaPorServico — propaga o tenant (F6)', () => {
  it('exige empresaId', async () => {
    await expect(
      darBaixaPorServico(1, [{ materialId: 1, quantidade: 1 }], undefined, {})
    ).rejects.toThrow(/empresaId obrigat/i);
  });

  it('repassa o empresaId na leitura de cada material', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 10, empresaId: 7 } });
    await darBaixaPorServico(42, [{ materialId: 5, quantidade: 1 }], 7, client);
    expect(client.material.findFirst).toHaveBeenCalledWith({ where: { id: 5, empresaId: 7 } });
  });

  it('é tolerante a falha por item (não derruba o registro do serviço)', async () => {
    const client = clienteFake({ material: null }); // material inexistente/de outro tenant
    await expect(
      darBaixaPorServico(42, [{ materialId: 99, quantidade: 1 }], 7, client)
    ).resolves.toBeUndefined();
  });
});
