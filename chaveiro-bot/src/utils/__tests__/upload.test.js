import { describe, it, expect } from 'vitest';
import { conferirMagicBytes } from '../upload.js';

// 1x1 PNG transparente (mesma fixture do e2e) — assinatura PNG real.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

describe('conferirMagicBytes', () => {
  it('aceita um PNG real declarado como image/png', () => {
    expect(conferirMagicBytes(PNG_1x1, 'image/png')).toBe(true);
  });

  it('rejeita conteúdo que não bate com o MIME declarado', () => {
    // "ABCDEFGHIJKL" não é PNG, mesmo declarado como tal.
    const falso = Buffer.from('ABCDEFGHIJKL', 'ascii');
    expect(conferirMagicBytes(falso, 'image/png')).toBe(false);
    expect(conferirMagicBytes(PNG_1x1, 'image/jpeg')).toBe(false);
  });

  it('rejeita buffer curto, não-buffer ou MIME desconhecido', () => {
    expect(conferirMagicBytes(Buffer.from([0x89, 0x50]), 'image/png')).toBe(false);
    expect(conferirMagicBytes('nope', 'image/png')).toBe(false);
    expect(conferirMagicBytes(PNG_1x1, 'application/zip')).toBe(false);
  });

  it('aceita PDF real (%PDF-) e rejeita não-PDF declarado como pdf (F9/M4)', () => {
    const pdf = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    expect(conferirMagicBytes(pdf, 'application/pdf')).toBe(true);
    expect(conferirMagicBytes(PNG_1x1, 'application/pdf')).toBe(false);
  });
});
