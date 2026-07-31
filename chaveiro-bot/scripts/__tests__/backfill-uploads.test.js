/**
 * Unit — helpers puros do backfill de mídia (scripts/backfill-uploads.mjs).
 * Cobre o mapeamento de content-type e, sobretudo, a extração de nome de objeto com
 * guarda contra path traversal (o nome vem do banco e alimenta um path.join no disco).
 */
import { describe, it, expect } from 'vitest';
// Importa do módulo de helpers (sem shebang): o CLI `backfill-uploads.mjs` começa com
// `#!/usr/bin/env node`, que o transform do Vitest rejeita — era por isso que este
// arquivo falhava com SyntaxError antes mesmo de rodar qualquer caso.
import { tipoConteudo, nomeObjeto } from '../backfill-uploads-helpers.mjs';

describe('tipoConteudo', () => {
  it('mapeia extensões conhecidas (case-insensitive)', () => {
    expect(tipoConteudo('a.jpg')).toBe('image/jpeg');
    expect(tipoConteudo('a.jpeg')).toBe('image/jpeg');
    expect(tipoConteudo('produto-1.PNG')).toBe('image/png');
    expect(tipoConteudo('x.webp')).toBe('image/webp');
    expect(tipoConteudo('x.gif')).toBe('image/gif');
  });

  it('cai para binário genérico em extensão desconhecida ou ausente', () => {
    expect(tipoConteudo('arquivo.bin')).toBe('application/octet-stream');
    expect(tipoConteudo('semextensao')).toBe('application/octet-stream');
  });
});

describe('nomeObjeto', () => {
  it('extrai o basename quando o prefixo casa', () => {
    expect(nomeObjeto('/uploads/produto-abc.png', '/uploads/')).toBe('produto-abc.png');
    expect(nomeObjeto('/uploads-ponto/ponto-abc.jpg', '/uploads-ponto/')).toBe('ponto-abc.jpg');
  });

  it('devolve null quando o prefixo não casa', () => {
    expect(nomeObjeto('https://x.supabase.co/estoque/p.png', '/uploads/')).toBeNull();
    expect(nomeObjeto('/uploads-ponto/p.jpg', '/uploads/')).toBeNull();
  });

  it('barra path traversal e nomes com separador (anti-escape do diretório)', () => {
    expect(nomeObjeto('/uploads/../../etc/passwd', '/uploads/')).toBeNull();
    expect(nomeObjeto('/uploads/sub/dir.png', '/uploads/')).toBeNull();
    expect(nomeObjeto('/uploads/..\\win.png', '/uploads/')).toBeNull();
  });

  it('devolve null para vazio após o prefixo ou entrada não-string', () => {
    expect(nomeObjeto('/uploads/', '/uploads/')).toBeNull();
    expect(nomeObjeto(null, '/uploads/')).toBeNull();
    expect(nomeObjeto(undefined, '/uploads/')).toBeNull();
  });
});
