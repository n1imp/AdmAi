import { describe, it, expect } from 'vitest';
import { converterValor, normalizarTelefone } from '../parser.js';

describe('converterValor', () => {
  it('converte valores em formato pt-BR (milhar com ponto, decimal com vírgula)', () => {
    expect(converterValor('R$ 1.234,56')).toBe(1234.56);
    expect(converterValor('150,00')).toBe(150);
    expect(converterValor('R$80')).toBe(80);
  });

  it('trata "nenhum", "n/a" e "0" como zero', () => {
    expect(converterValor('Nenhum')).toBe(0);
    expect(converterValor('N/A')).toBe(0);
    expect(converterValor('0')).toBe(0);
  });

  it('retorna 0 para entradas vazias ou inválidas', () => {
    expect(converterValor('')).toBe(0);
    expect(converterValor(null)).toBe(0);
    expect(converterValor('abc')).toBe(0);
  });
});

describe('normalizarTelefone', () => {
  it('extrai só os dígitos do JID', () => {
    expect(normalizarTelefone('5511994089030@s.whatsapp.net')).toBe('5511994089030');
  });

  it('remove o sufixo de dispositivo multi-device (:N)', () => {
    expect(normalizarTelefone('5511994089030:12@s.whatsapp.net')).toBe('5511994089030');
  });

  it('remove símbolos e espaços', () => {
    expect(normalizarTelefone('+55 (11) 9 9408-9030@s.whatsapp.net')).toBe('5511994089030');
  });
});
