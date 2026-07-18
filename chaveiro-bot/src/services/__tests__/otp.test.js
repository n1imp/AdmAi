/**
 * Testes unitários para services/otp.js
 *
 * Estratégia London School: totp.js é mockado com cifra determinística simples
 * para testar o comportamento de otp.js de forma isolada. prisma também mockado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do totp.js com cifra determinística: enc:<valor>
// Caminho relativo ao teste em __tests__/: ../totp.js → src/services/totp.js
vi.mock('../totp.js', () => ({
  cifrarSegredo: (s) => 'enc:' + s,
  decifrarSegredo: (b) => {
    if (typeof b === 'string' && b.startsWith('enc:')) return b.slice(4);
    return null;
  },
}));

// Mock do prisma — caminho relativo ao arquivo de teste:
// __tests__/ → ../../db/prisma.js = src/db/prisma.js
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    usuario: {
      update: vi.fn(),
    },
  },
}));

import { prisma } from '../../db/prisma.js';
import {
  gerarCodigoOtp,
  definirOtpTelefone,
  validarOtpTelefone,
  limparOtpTelefone,
} from '../otp.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('gerarCodigoOtp', () => {
  it('retorna uma string de exatamente 6 caracteres numéricos', () => {
    const codigo = gerarCodigoOtp();
    expect(typeof codigo).toBe('string');
    expect(codigo).toHaveLength(6);
    expect(/^\d{6}$/.test(codigo)).toBe(true);
  });

  it('preenche com zeros à esquerda (zero-padded)', () => {
    // Chama várias vezes para garantir que eventualmente um código com zero à esquerda seria gerado
    // e que a formatação está correta em todos os casos
    for (let i = 0; i < 20; i++) {
      const c = gerarCodigoOtp();
      expect(c).toHaveLength(6);
      expect(/^\d{6}$/.test(c)).toBe(true);
    }
  });
});

describe('definirOtpTelefone', () => {
  it('chama prisma.usuario.update com telefoneOtpHash cifrado e telefoneOtpExpira no futuro', async () => {
    prisma.usuario.update.mockResolvedValue({});
    const antes = Date.now();

    const codigo = await definirOtpTelefone(42);

    expect(typeof codigo).toBe('string');
    expect(codigo).toHaveLength(6);

    const chamada = prisma.usuario.update.mock.calls[0][0];
    expect(chamada.where).toEqual({ id: 42 });
    // Hash deve ser a cifra determinística do código
    expect(chamada.data.telefoneOtpHash).toBe('enc:' + codigo);
    // Expira em ~10 min no futuro (tolerância de alguns segundos para o teste)
    const expira = new Date(chamada.data.telefoneOtpExpira).getTime();
    expect(expira).toBeGreaterThan(antes + 9 * 60 * 1000);
    expect(expira).toBeLessThan(antes + 11 * 60 * 1000);
  });

  it('retorna o código em claro para envio', async () => {
    prisma.usuario.update.mockResolvedValue({});
    const codigo = await definirOtpTelefone(1);
    expect(/^\d{6}$/.test(codigo)).toBe(true);
  });
});

describe('validarOtpTelefone', () => {
  const futuro = new Date(Date.now() + 5 * 60 * 1000);
  const passado = new Date(Date.now() - 60 * 1000);

  it('retorna true quando o código está correto e não expirou', () => {
    const usuario = {
      telefoneOtpHash: 'enc:123456',
      telefoneOtpExpira: futuro,
    };
    expect(validarOtpTelefone(usuario, '123456')).toBe(true);
  });

  it('retorna false quando o código está errado', () => {
    const usuario = {
      telefoneOtpHash: 'enc:123456',
      telefoneOtpExpira: futuro,
    };
    expect(validarOtpTelefone(usuario, '999999')).toBe(false);
  });

  it('retorna false quando o OTP expirou (telefoneOtpExpira no passado)', () => {
    const usuario = {
      telefoneOtpHash: 'enc:123456',
      telefoneOtpExpira: passado,
    };
    expect(validarOtpTelefone(usuario, '123456')).toBe(false);
  });

  it('retorna false quando telefoneOtpHash é null (OTP não definido)', () => {
    const usuario = {
      telefoneOtpHash: null,
      telefoneOtpExpira: futuro,
    };
    expect(validarOtpTelefone(usuario, '123456')).toBe(false);
  });

  it('retorna false quando telefoneOtpExpira é null', () => {
    const usuario = {
      telefoneOtpHash: 'enc:123456',
      telefoneOtpExpira: null,
    };
    expect(validarOtpTelefone(usuario, '123456')).toBe(false);
  });

  it('retorna false quando o usuario é null/undefined', () => {
    expect(validarOtpTelefone(null, '123456')).toBe(false);
    expect(validarOtpTelefone(undefined, '123456')).toBe(false);
  });

  it('retorna false por mismatch de comprimento (comparação timing-safe exige mesmo tamanho)', () => {
    const usuario = {
      telefoneOtpHash: 'enc:123456',
      telefoneOtpExpira: futuro,
    };
    // código de comprimento diferente → buffer de tamanhos distintos → false
    expect(validarOtpTelefone(usuario, '12345')).toBe(false);
    expect(validarOtpTelefone(usuario, '1234567')).toBe(false);
  });
});

describe('limparOtpTelefone', () => {
  it('chama prisma.usuario.update limpando os campos de OTP', async () => {
    prisma.usuario.update.mockResolvedValue({});
    await limparOtpTelefone(7);

    const chamada = prisma.usuario.update.mock.calls[0][0];
    expect(chamada.where).toEqual({ id: 7 });
    expect(chamada.data.telefoneOtpHash).toBeNull();
    expect(chamada.data.telefoneOtpExpira).toBeNull();
  });
});
