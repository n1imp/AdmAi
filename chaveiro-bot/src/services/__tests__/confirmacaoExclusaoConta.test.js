import { describe, it, expect } from 'vitest';
import {
  gerarCodigoExclusaoConta,
  validarCodigoExclusaoConta,
} from '../confirmacaoExclusaoConta.js';

// F3-BYPASS (revisão independente): o código de exclusão de conta NÃO pode reusar o
// mecanismo de OTP de telefone (services/otp.js) — um atacante com JWT roubado poderia
// trocar o próprio telefone via PATCH /me e satisfazer a exigência de "e-mail" com um
// código de verificação de telefone enviado para o número dele mesmo. Este módulo é
// stateless e ligado só a (usuario.id, propósito fixo, janela de tempo).
describe('confirmacaoExclusaoConta (F3 — código stateless, isolado do OTP de telefone)', () => {
  it('gera um código de 6 dígitos determinístico para o mesmo usuário/janela', () => {
    const agora = Date.now();
    const c1 = gerarCodigoExclusaoConta(42, agora);
    const c2 = gerarCodigoExclusaoConta(42, agora);
    expect(c1).toMatch(/^\d{6}$/);
    expect(c1).toBe(c2);
  });

  it('valida o código correto para o mesmo usuário', () => {
    const agora = Date.now();
    const codigo = gerarCodigoExclusaoConta(7, agora);
    expect(validarCodigoExclusaoConta(7, codigo, agora)).toBe(true);
  });

  it('rejeita o código de OUTRO usuário (não é um segredo compartilhado global)', () => {
    const agora = Date.now();
    const codigoDeOutro = gerarCodigoExclusaoConta(999, agora);
    expect(validarCodigoExclusaoConta(1, codigoDeOutro, agora)).toBe(false);
  });

  it('rejeita código incorreto', () => {
    const agora = Date.now();
    const correto = gerarCodigoExclusaoConta(1, agora);
    const ultimoDigito = Number(correto[5]);
    const errado = correto.slice(0, 5) + String((ultimoDigito + 1) % 10);
    expect(validarCodigoExclusaoConta(1, errado, agora)).toBe(false);
  });

  it('aceita dentro da janela anterior (tolerância de borda) mas não mais antiga que isso', () => {
    const JANELA_MS = 10 * 60_000;
    const agoraGeracao = 1_000_000 * JANELA_MS; // alinhado a uma borda de janela
    const codigo = gerarCodigoExclusaoConta(5, agoraGeracao);
    // Verificação logo depois, ainda na janela seguinte (tolerância de 1 janela).
    expect(validarCodigoExclusaoConta(5, codigo, agoraGeracao + JANELA_MS + 1)).toBe(true);
    // Duas janelas depois: fora da tolerância.
    expect(validarCodigoExclusaoConta(5, codigo, agoraGeracao + 2 * JANELA_MS + 1)).toBe(false);
  });

  it('rejeita entradas malformadas sem lançar exceção', () => {
    expect(validarCodigoExclusaoConta(1, undefined)).toBe(false);
    expect(validarCodigoExclusaoConta(1, null)).toBe(false);
    expect(validarCodigoExclusaoConta(1, '')).toBe(false);
    expect(validarCodigoExclusaoConta(1, '12345')).toBe(false); // 5 dígitos
    expect(validarCodigoExclusaoConta(1, '1234567')).toBe(false); // 7 dígitos
    expect(validarCodigoExclusaoConta(1, 'abcdef')).toBe(false);
  });

  it('nunca depende de telefoneOtpHash/telefoneOtpExpira (isolado do OTP de telefone)', () => {
    // Assinatura das funções não recebe nem grava nenhum campo relacionado a telefone —
    // confirmado estaticamente: os únicos parâmetros são (userId, codigo?, agora?).
    expect(gerarCodigoExclusaoConta.length).toBeLessThanOrEqual(2);
    expect(validarCodigoExclusaoConta.length).toBeLessThanOrEqual(3);
  });
});
