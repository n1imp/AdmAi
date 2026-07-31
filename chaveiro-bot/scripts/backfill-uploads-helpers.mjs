/**
 * Helpers PUROS do backfill de mídia, separados de `backfill-uploads.mjs`.
 *
 * Por que num arquivo próprio: o script principal é um executável com shebang
 * (`#!/usr/bin/env node`), e o transform do Vitest não aceita shebang num módulo
 * importado — falha com "Invalid or unexpected token" antes de rodar qualquer teste.
 * Como `scripts/` também estava fora de todos os globs de teste, o
 * `backfill-uploads.test.js` nunca executou e ninguém percebeu que ele nem compilava.
 * Mantendo a lógica pura aqui, o CLI segue com shebang e os testes conseguem importar.
 */
import path from 'node:path';

const MIME_POR_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** content-type a partir da extensão do nome do objeto (fallback binário genérico). */
export function tipoConteudo(nome) {
  const ext = path.extname(nome).slice(1).toLowerCase();
  return MIME_POR_EXT[ext] ?? 'application/octet-stream';
}

/**
 * Extrai o nome do objeto a partir da URL legada, validando o prefixo e barrando path
 * traversal — o nome vem do banco e nunca deve conter separador de caminho ou `..`.
 * @returns {string|null} basename seguro, ou null se a URL não casa/é suspeita.
 */
export function nomeObjeto(url, prefixo) {
  if (typeof url !== 'string' || !url.startsWith(prefixo)) return null;
  const nome = url.slice(prefixo.length);
  if (!nome || nome.includes('/') || nome.includes('\\') || nome.includes('..')) return null;
  return nome;
}
