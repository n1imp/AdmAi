import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { encrypt, decrypt, gerarSegredo, verificarHmac, compararToken } from '../crypto.js';

/**
 * Testes de COMPORTAMENTO da cifra em repouso (AES-256-GCM).
 *
 * O foco é a propriedade de segurança, não a linha executada: o que precisa
 * valer é que ciphertext adulterado NÃO decifra e que uma auth tag truncada é
 * rejeitada — a mitigação de CWE-310 que motivou fixar authTagLength.
 */

const PARTES = 3; // iv:tag:ciphertext

describe('encrypt/decrypt', () => {
  it('faz round-trip preservando o texto', () => {
    const claro = 'chave-da-instancia-evolution-123';
    expect(decrypt(encrypt(claro))).toBe(claro);
  });

  it('preserva unicode e texto longo', () => {
    const claro = 'çãõ ñ 日本語 🔑 '.repeat(200);
    expect(decrypt(encrypt(claro))).toBe(claro);
  });

  it('trata vazio e nulo como ausência de segredo', () => {
    for (const entrada of [null, undefined, '']) {
      expect(encrypt(entrada)).toBeNull();
      expect(decrypt(entrada)).toBeNull();
    }
  });

  it('usa IV novo a cada chamada — mesmo texto não gera mesmo ciphertext', () => {
    const a = encrypt('mesmo-segredo');
    const b = encrypt('mesmo-segredo');
    expect(a).not.toBe(b);
    // Mas ambos decifram para o mesmo valor.
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('produz o formato iv:tag:ciphertext em base64', () => {
    const partes = encrypt('x').split(':');
    expect(partes).toHaveLength(PARTES);
    for (const p of partes) expect(p).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('resistência a adulteração', () => {
  const trocarUmByte = (b64) => {
    const buf = Buffer.from(b64, 'base64');
    buf[0] ^= 0xff;
    return buf.toString('base64');
  };

  it('rejeita ciphertext adulterado', () => {
    const [iv, tag, ct] = encrypt('segredo-real').split(':');
    expect(decrypt([iv, tag, trocarUmByte(ct)].join(':'))).toBeNull();
  });

  it('rejeita auth tag adulterada', () => {
    const [iv, tag, ct] = encrypt('segredo-real').split(':');
    expect(decrypt([iv, trocarUmByte(tag), ct].join(':'))).toBeNull();
  });

  it('rejeita IV adulterado', () => {
    const [iv, tag, ct] = encrypt('segredo-real').split(':');
    expect(decrypt([trocarUmByte(iv), tag, ct].join(':'))).toBeNull();
  });

  it('rejeita auth tag TRUNCADA (mitigação de CWE-310)', () => {
    // Quem rejeita aqui é o guard explícito `tag.length !== TAG_BYTES` em
    // crypto.js. O `authTagLength` passado ao decipher é defesa em profundidade
    // e NÃO é observável por fora enquanto o guard existir — um teste de
    // mutação confirma que remover só o authTagLength não faz este teste falhar.
    // Portanto: este caso protege o guard, não o parâmetro.
    const [iv, tag, ct] = encrypt('segredo-real').split(':');
    const bruta = Buffer.from(tag, 'base64');
    for (const tamanho of [4, 8, 12, 15]) {
      const curta = bruta.subarray(0, tamanho).toString('base64');
      expect(decrypt([iv, curta, ct].join(':'))).toBeNull();
    }
  });

  // Nota honesta: o Node já rejeita tag > 16 bytes por conta própria, então
  // este caso não distingue implementações com e sem o guard. Fica porque
  // pegaria uma regressão que trocasse o guard por `tag.length < TAG_BYTES`.
  it('rejeita auth tag mais longa que 16 bytes', () => {
    const [iv, tag, ct] = encrypt('segredo-real').split(':');
    const longa = Buffer.concat([Buffer.from(tag, 'base64'), Buffer.alloc(4)]).toString('base64');
    expect(decrypt([iv, longa, ct].join(':'))).toBeNull();
  });

  it('rejeita blob mal formado sem lançar', () => {
    for (const ruim of ['', 'sem-separador', 'a:b', 'a:b:c:d', ':::', 'não-base64:!!:??']) {
      expect(() => decrypt(ruim)).not.toThrow();
      expect(decrypt(ruim)).toBeNull();
    }
  });
});

describe('gerarSegredo', () => {
  it('gera hex do tamanho pedido e não repete', () => {
    expect(gerarSegredo(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(gerarSegredo()).toMatch(/^[0-9a-f]{64}$/);
    expect(gerarSegredo()).not.toBe(gerarSegredo());
  });
});

describe('verificarHmac', () => {
  const segredo = 'webhook-secret-de-teste';
  const corpo = JSON.stringify({ evento: 'mensagem', id: 42 });
  const assinar = (payload, chave) =>
    crypto.createHmac('sha256', chave).update(payload).digest('hex');

  it('aceita assinatura correta', () => {
    expect(verificarHmac(corpo, assinar(corpo, segredo), segredo)).toBe(true);
  });

  it('rejeita assinatura de outro segredo', () => {
    expect(verificarHmac(corpo, assinar(corpo, 'outro-segredo'), segredo)).toBe(false);
  });

  it('rejeita quando o corpo mudou (replay/adulteração)', () => {
    const assinatura = assinar(corpo, segredo);
    expect(verificarHmac(corpo + ' ', assinatura, segredo)).toBe(false);
  });

  it('rejeita assinatura de tamanho diferente sem lançar', () => {
    // timingSafeEqual lança se os buffers tiverem tamanhos distintos; o guard
    // de comprimento precisa vir antes.
    expect(() => verificarHmac(corpo, 'abc', segredo)).not.toThrow();
    expect(verificarHmac(corpo, 'abc', segredo)).toBe(false);
  });

  it('rejeita quando falta assinatura ou segredo', () => {
    expect(verificarHmac(corpo, '', segredo)).toBe(false);
    expect(verificarHmac(corpo, assinar(corpo, segredo), '')).toBe(false);
  });
});

describe('compararToken', () => {
  it('aceita apenas o token idêntico', () => {
    expect(compararToken('token-abc', 'token-abc')).toBe(true);
    expect(compararToken('token-abd', 'token-abc')).toBe(false);
  });

  it('rejeita prefixo e sufixo sem lançar', () => {
    expect(() => compararToken('token', 'token-abc')).not.toThrow();
    expect(compararToken('token', 'token-abc')).toBe(false);
    expect(compararToken('token-abc-extra', 'token-abc')).toBe(false);
  });

  it('rejeita vazio dos dois lados', () => {
    expect(compararToken('', 'x')).toBe(false);
    expect(compararToken('x', '')).toBe(false);
    expect(compararToken('', '')).toBe(false);
  });
});
