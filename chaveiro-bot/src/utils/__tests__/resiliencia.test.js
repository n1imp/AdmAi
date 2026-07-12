import { describe, it, expect } from 'vitest';
import { comTimeout } from '../resiliencia.js';

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
