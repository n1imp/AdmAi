import { describe, it, expect } from 'vitest';
import { validarFotoPerfil } from '../tecnicos.js';

// 1x1 PNG transparente válido (mesmo fixture usado em test/integration/e2e_rbac_ponto.test.js).
const PNG_VALIDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('validarFotoPerfil (F2 — POST /tecnicos aceitava fotoPerfil sem validação)', () => {
  it('aceita null (foto opcional)', () => {
    expect(validarFotoPerfil(null)).toEqual({ ok: true, valor: null });
    expect(validarFotoPerfil(undefined)).toEqual({ ok: true, valor: null });
  });

  it('aceita um PNG válido dentro do limite de tamanho', () => {
    const r = validarFotoPerfil(PNG_VALIDO);
    expect(r.ok).toBe(true);
    expect(r.valor).toBe(PNG_VALIDO);
  });

  it('CVE-like: rejeita payload cujos bytes reais não batem com o MIME declarado (PDF disfarçado de PNG)', () => {
    // Antes do fix, isso era aceito e gravado direto na coluna sem qualquer checagem.
    const pdfDisfarcado = `data:image/png;base64,${Buffer.from('%PDF-1.4 conteúdo malicioso').toString('base64')}`;
    const r = validarFotoPerfil(pdfDisfarcado);
    expect(r.ok).toBe(false);
  });

  it('rejeita payload maior que o limite de 2MB', () => {
    const grande = Buffer.alloc(3 * 1024 * 1024, 0x41).toString('base64');
    const r = validarFotoPerfil(`data:image/png;base64,${grande}`);
    expect(r.ok).toBe(false);
  });

  it('rejeita string que não é um data URI de imagem suportada', () => {
    expect(validarFotoPerfil('http://exemplo.com/foto.png').ok).toBe(false);
    expect(validarFotoPerfil('javascript:alert(1)').ok).toBe(false);
    expect(validarFotoPerfil('data:text/html;base64,PHNjcmlwdD4=').ok).toBe(false);
  });

  it('rejeita data URI vazia', () => {
    expect(validarFotoPerfil('data:image/png;base64,').ok).toBe(false);
  });
});
