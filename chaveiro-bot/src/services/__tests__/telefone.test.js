import { describe, it, expect } from 'vitest';
import { normalizarTelefone, canonizarTelefone, variantesTelefone } from '../parser.js';

describe('normalizarTelefone', () => {
  it('extrai dígitos de JID e remove sufixo de dispositivo', () => {
    expect(normalizarTelefone('5511994089030:12@s.whatsapp.net')).toBe('5511994089030');
  });
  it('tolera null/undefined', () => {
    expect(normalizarTelefone(null)).toBe('');
  });
});

describe('canonizarTelefone', () => {
  it('mantém número que já tem DDI 55', () => {
    expect(canonizarTelefone('5511994089030@s.whatsapp.net')).toBe('5511994089030');
  });
  it('adiciona DDI 55 quando vem só com DDD+número', () => {
    expect(canonizarTelefone('11994089030')).toBe('5511994089030'); // 11 dígitos
    expect(canonizarTelefone('(11) 3322-4455')).toBe('551133224455'); // 10 dígitos
  });
  it('best-effort: sem DDD identificável, devolve só dígitos', () => {
    expect(canonizarTelefone('99408-9030')).toBe('994089030');
  });
});

describe('variantesTelefone (tolerância ao 9º dígito)', () => {
  it('celular com 9 → inclui a forma sem o 9', () => {
    const v = variantesTelefone('5511994089030');
    expect(v).toContain('5511994089030');
    expect(v).toContain('551194089030');
  });
  it('número de 8 dígitos → inclui a forma com o 9', () => {
    const v = variantesTelefone('551133224455');
    expect(v).toContain('551133224455');
    expect(v).toContain('5511933224455');
  });
  it('aceita entrada formatada e normaliza antes de variar', () => {
    const v = variantesTelefone('+55 (11) 9 9408-9030');
    expect(v).toContain('5511994089030');
    expect(v).toContain('551194089030');
  });
  it('entrada vazia → lista vazia', () => {
    expect(variantesTelefone('')).toEqual([]);
  });
});
