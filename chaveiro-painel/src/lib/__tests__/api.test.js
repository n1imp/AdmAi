import { describe, it, expect } from 'vitest';
import { formatarMoeda, formatarData, formatarDataCurta } from '../api.js';

describe('formatarMoeda', () => {
  it('formata em BRL', () => {
    // NBSP entre R$ e o número — normalizamos para comparar de forma estável.
    expect(formatarMoeda(1234.5).replace(/ /g, ' ')).toBe('R$ 1.234,50');
  });
  it('trata null/undefined como zero', () => {
    expect(formatarMoeda(null).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatarMoeda(undefined).replace(/ /g, ' ')).toBe('R$ 0,00');
  });
});

describe('formatarData / formatarDataCurta', () => {
  it('retorna travessão para data ausente', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarDataCurta('')).toBe('—');
  });
  it('formata data curta como dd/mm', () => {
    expect(formatarDataCurta('2026-06-05T12:00:00Z')).toMatch(/^\d{2}\/\d{2}$/);
  });
  it('formata data completa com hora', () => {
    expect(formatarData('2026-06-05T12:00:00Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
