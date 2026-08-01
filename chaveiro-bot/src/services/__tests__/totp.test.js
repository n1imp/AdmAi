import { describe, it, expect } from 'vitest';
import { generate } from 'otplib';
import {
  gerarSegredoTotp,
  montarOtpauthUrl,
  verificarCodigo,
  cifrarSegredo,
  decifrarSegredo,
} from '../totp.js';

/**
 * Testes de COMPORTAMENTO do 2FA TOTP.
 *
 * O caminho positivo é exercitado de verdade: geramos um código válido para o
 * segredo e conferimos que ele passa. Sem isso, um módulo que rejeitasse tudo
 * ainda "passaria" nos testes negativos.
 */

const codigoValido = async (secret) => {
  const r = await generate({ secret });
  return typeof r === 'string' ? r : (r?.token ?? r?.otp);
};

describe('gerarSegredoTotp', () => {
  it('gera Base32 compatível com apps autenticadores', () => {
    const segredo = gerarSegredoTotp();
    expect(segredo).toMatch(/^[A-Z2-7]+=*$/);
    expect(segredo.length).toBeGreaterThanOrEqual(16);
  });

  it('não repete entre chamadas', () => {
    expect(gerarSegredoTotp()).not.toBe(gerarSegredoTotp());
  });
});

describe('montarOtpauthUrl', () => {
  it('monta URI otpauth com emissor e segredo', () => {
    const segredo = gerarSegredoTotp();
    const uri = montarOtpauthUrl(segredo, 'joao');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('AdmAi');
    expect(uri).toContain(segredo);
    expect(uri).toContain('joao');
  });
});

describe('verificarCodigo', () => {
  it('aceita um código realmente válido para o segredo', async () => {
    const segredo = gerarSegredoTotp();
    expect(await verificarCodigo(segredo, await codigoValido(segredo))).toBe(true);
  });

  it('tolera espaços no código digitado', async () => {
    const segredo = gerarSegredoTotp();
    const codigo = await codigoValido(segredo);
    expect(await verificarCodigo(segredo, `${codigo.slice(0, 3)} ${codigo.slice(3)}`)).toBe(true);
  });

  it('rejeita código válido de OUTRO segredo', async () => {
    const a = gerarSegredoTotp();
    const b = gerarSegredoTotp();
    expect(await verificarCodigo(a, await codigoValido(b))).toBe(false);
  });

  it('rejeita formatos que não são 6 dígitos', async () => {
    const segredo = gerarSegredoTotp();
    for (const codigo of ['', '123', '1234567', 'abcdef', '12345a', '  ', '12 34 5']) {
      expect(await verificarCodigo(segredo, codigo)).toBe(false);
    }
  });

  it('rejeita quando falta segredo ou código', async () => {
    expect(await verificarCodigo('', '123456')).toBe(false);
    expect(await verificarCodigo(gerarSegredoTotp(), '')).toBe(false);
    expect(await verificarCodigo(null, null)).toBe(false);
  });

  it('não lança com segredo inválido — devolve false', async () => {
    await expect(verificarCodigo('não-é-base32!', '123456')).resolves.toBe(false);
  });
});

describe('cifra do segredo em repouso', () => {
  it('faz round-trip do segredo', () => {
    const segredo = gerarSegredoTotp();
    const cifrado = cifrarSegredo(segredo);
    expect(cifrado).not.toBe(segredo);
    expect(cifrado).toContain(':');
    expect(decifrarSegredo(cifrado)).toBe(segredo);
  });

  it('o segredo cifrado ainda valida um código (não corrompe)', async () => {
    const segredo = gerarSegredoTotp();
    const recuperado = decifrarSegredo(cifrarSegredo(segredo));
    // Sem esta asserção o teste seria tautológico: gerar o código a partir de
    // `recuperado` e validar contra `recuperado` passa mesmo que a cifra
    // descarte a entrada e devolva outro segredo qualquer.
    expect(recuperado).toBe(segredo);
    expect(await verificarCodigo(recuperado, await codigoValido(segredo))).toBe(true);
  });

  it('trata vazio/nulo sem quebrar', () => {
    for (const entrada of [null, undefined, '']) {
      expect(cifrarSegredo(entrada)).toBeNull();
      expect(decifrarSegredo(entrada)).toBeNull();
    }
  });

  it('devolve null para blob corrompido em vez de lançar', () => {
    const cifrado = cifrarSegredo(gerarSegredoTotp());
    const [iv, tag, ct] = cifrado.split(':');
    const adulterado = Buffer.from(ct, 'base64');
    adulterado[0] ^= 0xff;
    expect(decifrarSegredo([iv, tag, adulterado.toString('base64')].join(':'))).toBeNull();
  });
});
