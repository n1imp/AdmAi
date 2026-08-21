import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { gerarStorageKey } from '../documentos.js';

/**
 * Origem: achado Semgrep `javascript.express.security.audit.express-res-sendfile`
 * em documentos.js:158 (`res.sendFile(caminho)`), severidade WARNING.
 *
 * A investigação concluiu FALSO POSITIVO quanto a path traversal: a regra assume
 * que "the application processes user-input", e aqui nenhum trecho da chave vem
 * do cliente. O que faltava não era correção — era prova.
 *
 * Estes testes travam a garantia. Se alguém passar a compor storageKey com
 * entrada do usuário, o falso positivo vira verdadeiro; sem eles, isso
 * aconteceria em silêncio.
 */

const DOCS_DIR = path.resolve('./uploads-docs');
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

describe('gerarStorageKey — confinamento do caminho servido por res.sendFile', () => {
  it('produz doc-<uuid>.<ext> para cada MIME aceito', () => {
    const esperado = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
    for (const mime of MIMES) {
      const chave = gerarStorageKey(mime);
      expect(chave).toMatch(
        /^doc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/
      );
      expect(chave.endsWith(`.${esperado[mime]}`)).toBe(true);
    }
  });

  it('nunca contém sequência de travessia nem separador de caminho', () => {
    for (const mime of MIMES) {
      const chave = gerarStorageKey(mime);
      expect(chave).not.toContain('..');
      expect(chave).not.toContain('/');
      expect(chave).not.toContain('\\');
      expect(chave).not.toContain(':');
      // Um único ponto: o separador da extensão.
      expect(chave.split('.').length).toBe(2);
    }
  });

  it('mantém o caminho resolvido dentro de DOCS_DIR', () => {
    for (const mime of MIMES) {
      const caminho = path.resolve(path.join(DOCS_DIR, gerarStorageKey(mime)));
      expect(caminho.startsWith(DOCS_DIR + path.sep)).toBe(true);
    }
  });

  it('gera chave distinta a cada chamada', () => {
    const chaves = new Set(Array.from({ length: 50 }, () => gerarStorageKey('application/pdf')));
    expect(chaves.size).toBe(50);
  });

  it('MIME fora da tabela não injeta extensão controlável', () => {
    // DOC_MIME é fechado; um MIME desconhecido vira `undefined`, nunca um valor
    // vindo do cliente. Na rota isso é inalcançável: DATA_URI_RE já barrou antes.
    const chave = gerarStorageKey('text/html');
    expect(chave).toBe(`doc-${chave.slice(4, 40)}.undefined`);
    expect(chave).not.toContain('/');
    expect(chave).not.toContain('..');
  });

  /**
   * Guarda de regressão — o teste que explica POR QUE o código é seguro.
   *
   * `path.join` neutraliza caminho absoluto, mas NÃO neutraliza `..`. Portanto o
   * confinamento não vem do join: vem de a chave ser gerada no servidor. Se este
   * teste um dia falhar, a premissa mudou e a rota precisa de validação explícita.
   */
  it('demonstra que o confinamento depende da geração, não de path.join', () => {
    const hostil = path.resolve(path.join(DOCS_DIR, '../../etc/passwd'));
    expect(hostil.startsWith(DOCS_DIR + path.sep)).toBe(false);

    const absoluta = path.resolve(path.join(DOCS_DIR, '/etc/passwd'));
    expect(absoluta.startsWith(DOCS_DIR + path.sep)).toBe(true);

    // Nenhuma chave real se parece com as hostis acima.
    expect(gerarStorageKey('application/pdf')).not.toMatch(/[\\/]|\.\./);
  });
});
