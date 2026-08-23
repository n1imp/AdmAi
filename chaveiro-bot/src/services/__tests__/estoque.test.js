import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma cru é o default de `tx`/`client` nessas funções — mockado para exercitar a
// checagem de tenant sem banco.
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    material: { findFirst: vi.fn(), update: vi.fn() },
    movimentacaoEstoque: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((fn) => fn(globalThis.__clienteMock)),
  },
}));

vi.mock('../notificacao.js', () => ({ alertarEstoqueBaixo: vi.fn().mockResolvedValue(null) }));

import { movimentarEstoque, darBaixaPorServico } from '../estoque.js';

function clienteFake({ material }) {
  return {
    /* [FIX-ESTOQUE-CORRIDA] A leitura virou `$queryRaw ... FOR UPDATE` (lock de linha): o mock
       devolve ARRAY, como o queryRaw real — vazio quando o material nao pertence ao tenant. */
    $queryRaw: vi.fn().mockResolvedValue(material ? [material] : []),
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

    // O empresaId precisa estar na CONSULTA — sem isso o material vazaria entre tenants.
    // Template taggeado: chamada = (strings, ...valores); os valores interpolados carregam
    // materialId e empresaId, e e isso que o isolamento exige.
    const valores = client.$queryRaw.mock.calls[0].slice(1);
    expect(valores).toContain(99);
    expect(valores).toContain(7);
    expect(client.material.update).not.toHaveBeenCalled();
  });

  it('movimenta normalmente quando o material pertence à empresa', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 10, empresaId: 7 } });
    const r = await movimentarEstoque(
      { materialId: 5, empresaId: 7, tipo: 'saida', quantidade: 4 },
      client
    );
    // [FIX-ESTOQUE-CORRIDA] O contrato mudou DE NOVO, e desta vez a forma da escrita deixou de
    // ser o guard: a leitura agora e FOR UPDATE (lock de linha), entao gravar o valor absoluto
    // computado sob o lock e correto — o increment da versao anterior fechava lost-update do
    // saldo, mas o piso e o saldoApos continuavam contra leitura stale (duas saidas de 7 sobre
    // 10 davam saldo real -4 com dois ledgers dizendo 3). O guard REAL de concorrencia mora em
    // test/integration/estoque_concorrencia.test.js, que exercita duas saidas paralelas de
    // verdade; aqui se assere o calculo sob o valor travado.
    expect(client.material.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantidadeAtual: 6 },
    });
    expect(r.material.quantidadeAtual).toBe(6);
  });

  it('limita a baixa ao disponível com delta atômico (não zera o que outro gravou)', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 2, empresaId: 7 } });
    await movimentarEstoque(
      { materialId: 5, empresaId: 7, tipo: 'saida', quantidade: 100 },
      client
    );
    // Saldo 2 e pedido de 100 → clamp no zero, computado sob o lock.
    expect(client.material.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantidadeAtual: 0 },
    });
  });

  it('entrada usa delta positivo', async () => {
    const client = clienteFake({ material: { id: 5, quantidadeAtual: 10, empresaId: 7 } });
    await movimentarEstoque(
      { materialId: 5, empresaId: 7, tipo: 'entrada', quantidade: 3 },
      client
    );
    expect(client.material.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantidadeAtual: 13 },
    });
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
    const valores = client.$queryRaw.mock.calls[0].slice(1);
    expect(valores).toContain(5);
    expect(valores).toContain(7);
  });

  it('é tolerante a falha por item (não derruba o registro do serviço)', async () => {
    const client = clienteFake({ material: null }); // material inexistente/de outro tenant
    await expect(
      darBaixaPorServico(42, [{ materialId: 99, quantidade: 1 }], 7, client)
    ).resolves.toBeUndefined();
  });
});
