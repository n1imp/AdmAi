import { describe, it, expect, vi, afterEach } from 'vitest';
import { comTimeout, criarBreaker } from '../resiliencia.js';

describe('comTimeout (F5)', () => {
  it('resolve com o valor quando a promise termina antes do prazo', async () => {
    await expect(comTimeout(Promise.resolve('ok'), 1000, 'x')).resolves.toBe('ok');
  });

  it('rejeita com erro de timeout quando estoura o prazo', async () => {
    const lenta = new Promise((r) => setTimeout(() => r('tarde'), 60));
    await expect(comTimeout(lenta, 10, 'chamada')).rejects.toThrow(/Timeout de 10ms em chamada/);
  });

  it('propaga a rejeição original da promise (não mascara o erro real)', async () => {
    await expect(comTimeout(Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow('boom');
  });
});

describe('criarBreaker (F5)', () => {
  afterEach(() => vi.useRealTimers());

  it('deixa passar e devolve o resultado quando fechado', async () => {
    const b = criarBreaker({ limiar: 2 });
    await expect(b(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('abre após `limiar` falhas e passa a falhar rápido SEM chamar fn', async () => {
    const b = criarBreaker({ limiar: 3, resetMs: 1000, rotulo: 'dep' });
    const fn = vi.fn(() => Promise.reject(new Error('down')));
    for (let i = 0; i < 3; i++) await expect(b(fn)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
    // circuito aberto: rejeita rápido e NÃO invoca fn de novo
    await expect(b(fn)).rejects.toThrow(/Circuito aberto para dep/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('meio-aberto após resetMs: sucesso fecha o circuito', async () => {
    vi.useFakeTimers();
    const b = criarBreaker({ limiar: 2, resetMs: 1000 });
    const falha = vi.fn(() => Promise.reject(new Error('down')));
    await expect(b(falha)).rejects.toThrow('down');
    await expect(b(falha)).rejects.toThrow('down'); // abre
    await expect(b(falha)).rejects.toThrow(/Circuito aberto/); // fail-fast
    vi.advanceTimersByTime(1001); // passa a janela → meio-aberto
    await expect(b(() => Promise.resolve('recuperado'))).resolves.toBe('recuperado'); // fecha
    await expect(b(() => Promise.resolve('ok'))).resolves.toBe('ok'); // segue fechado
  });

  it('meio-aberto: se a tentativa falha, REABRE imediatamente', async () => {
    vi.useFakeTimers();
    const b = criarBreaker({ limiar: 1, resetMs: 1000 });
    await expect(b(() => Promise.reject(new Error('down')))).rejects.toThrow('down'); // abre (limiar 1)
    vi.advanceTimersByTime(1001);
    await expect(b(() => Promise.reject(new Error('ainda down')))).rejects.toThrow('ainda down'); // meio-aberto falha → reabre
    await expect(b(() => Promise.resolve('x'))).rejects.toThrow(/Circuito aberto/); // reaberto: fail-fast
  });
});
