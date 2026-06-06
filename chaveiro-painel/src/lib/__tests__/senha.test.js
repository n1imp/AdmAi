import { describe, it, expect } from 'vitest';
import { avaliarForcaSenha } from '../senha.js';

// Espelha o backend (src/services/senha.js) — a UI deve concordar com o servidor.
describe('avaliarForcaSenha (cliente)', () => {
  it('senha curta é inválida', () => {
    expect(avaliarForcaSenha('Ab1!').valida).toBe(false);
  });
  it('senha forte completa', () => {
    const r = avaliarForcaSenha('Abcdef1!');
    expect(r.valida).toBe(true);
    expect(r.nivel).toBe('forte');
    expect(r.score).toBe(5);
  });
  it('tamanho + 2 critérios = média válida', () => {
    const r = avaliarForcaSenha('abcdefg1');
    expect(r.valida).toBe(true);
    expect(r.nivel).toBe('media');
  });
  it('só minúsculas longa é fraca/ inválida', () => {
    const r = avaliarForcaSenha('abcdefghij');
    expect(r.valida).toBe(false);
    expect(r.nivel).toBe('fraca');
  });
});
