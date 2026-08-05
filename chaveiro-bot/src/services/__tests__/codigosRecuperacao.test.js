import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

/**
 * EV-056 — `verificarCodigo` tinha uma janela TOCTOU: `findMany` trazia os
 * candidatos pendentes, `bcrypt.compare` validava em memória e só então um
 * `update` isolado marcava `usado: true`. Duas requisições concorrentes com
 * o MESMO código válido podiam ambas passar pelo `bcrypt.compare` antes de
 * qualquer `update` ser observado pela outra, permitindo reuso do código.
 *
 * O fix troca o `update` isolado por um `updateMany({ where: { id, usado:
 * false }, data: { usado: true } })` condicional e só considera a chamada
 * vencedora quando `count === 1`. Este teste simula a corrida de verdade
 * (duas chamadas concorrentes via `Promise.all`, com latência artificial no
 * mock de `updateMany` para forçar interleaving real, não sequencial) e
 * afirma que exatamente uma das duas obtém `true`.
 */
const { findManyMock, updateManyMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateManyMock: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    codigoRecuperacaoTotp: {
      findMany: findManyMock,
      updateMany: updateManyMock,
    },
  },
}));

const CODIGO_VALIDO = 'ABC1234567';
let codigoHash;
// Estado simulado da linha no "banco" — usado pelo mock de updateMany para
// decidir, de forma atômica (síncrona dentro do callback do setTimeout), qual
// das duas chamadas concorrentes vence a corrida.
let usadoNoBanco;

beforeEach(async () => {
  findManyMock.mockReset();
  updateManyMock.mockReset();
  usadoNoBanco = false;
  codigoHash = await bcrypt.hash(CODIGO_VALIDO, 4);

  findManyMock.mockImplementation(async () => {
    if (usadoNoBanco) return [];
    return [{ id: 1, usuarioId: 1, codigoHash, usado: false }];
  });

  // Simula um UPDATE ... WHERE id = ? AND usado = false atômico no Postgres,
  // com latência artificial para forçar as duas chamadas concorrentes a
  // realmente interlear antes de qualquer uma delas "commitar".
  updateManyMock.mockImplementation(({ where }) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (where.usado === false && !usadoNoBanco) {
          usadoNoBanco = true;
          resolve({ count: 1 });
        } else {
          resolve({ count: 0 });
        }
      }, 15);
    });
  });
});

describe('verificarCodigo (concorrência real — EV-056)', () => {
  it('exatamente uma de duas chamadas concorrentes com o mesmo código vence a corrida', async () => {
    const { verificarCodigo } = await import('../codigosRecuperacao.js');

    const [resultadoA, resultadoB] = await Promise.all([
      verificarCodigo(1, CODIGO_VALIDO),
      verificarCodigo(1, CODIGO_VALIDO),
    ]);

    const vitorias = [resultadoA, resultadoB].filter((r) => r === true);
    expect(vitorias).toHaveLength(1);
    expect([resultadoA, resultadoB]).toContain(false);
    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  it('retorna true e marca usado:true=>where quando não há concorrência', async () => {
    const { verificarCodigo } = await import('../codigosRecuperacao.js');

    const ok = await verificarCodigo(1, CODIGO_VALIDO);

    expect(ok).toBe(true);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: 1, usado: false },
      data: { usado: true },
    });
  });

  it('retorna false para código incorreto', async () => {
    const { verificarCodigo } = await import('../codigosRecuperacao.js');

    const ok = await verificarCodigo(1, 'CODIGO-ERRADO');

    expect(ok).toBe(false);
    expect(updateManyMock).not.toHaveBeenCalled();
  });
});
