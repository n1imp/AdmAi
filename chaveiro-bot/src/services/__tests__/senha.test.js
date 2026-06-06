import { describe, it, expect } from 'vitest';
import { avaliarForcaSenha, SENHA_MIN_LEN } from '../senha.js';

describe('avaliarForcaSenha', () => {
  it('rejeita senha curta mesmo com variedade', () => {
    const r = avaliarForcaSenha('Ab1!');
    expect(r.valida).toBe(false);
    expect(r.requisitos.tamanho).toBe(false);
  });

  it('rejeita senha longa mas pobre (só minúsculas)', () => {
    const r = avaliarForcaSenha('abcdefghij');
    expect(r.valida).toBe(false);
    expect(r.nivel).toBe('fraca');
  });

  it('aceita senha com tamanho + 2 critérios extras', () => {
    const r = avaliarForcaSenha('abcdefgh1'); // tamanho + minúscula + número = score 3
    expect(r.valida).toBe(true);
    expect(r.nivel).toBe('media');
  });

  it('classifica senha completa como forte', () => {
    const r = avaliarForcaSenha('Abcdef1!');
    expect(r.valida).toBe(true);
    expect(r.nivel).toBe('forte');
    expect(r.score).toBe(5);
  });

  it('exporta o tamanho mínimo', () => {
    expect(SENHA_MIN_LEN).toBe(8);
  });

  it('trata entrada vazia/default sem quebrar', () => {
    const r = avaliarForcaSenha();
    expect(r.valida).toBe(false);
  });
});
