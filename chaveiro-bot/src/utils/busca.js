/**
 * Filtros de busca textual case-insensitive compatíveis com Postgres e SQLite.
 *
 * Postgres suporta `mode: 'insensitive'` no Prisma; SQLite (usado só em dev local)
 * NÃO suporta — e nesse caso o `LIKE`/`contains` já é case-insensitive para ASCII.
 * Detectamos o provider pelo prefixo de DATABASE_URL (`file:` = SQLite) a cada chamada,
 * para não capturar o valor no import (e refletir mudanças em testes).
 *
 * Em produção/CI (Postgres) o comportamento é exatamente o de antes; em SQLite a flag
 * é omitida para a query não quebrar. Evita a regressão de busca case-sensitive em prod.
 */

function modoInsensivel() {
  const url = process.env.DATABASE_URL || '';
  return url.startsWith('file:') ? {} : { mode: 'insensitive' };
}

/** `{ contains: valor }` com case-insensitive quando o provider suporta. */
export function contemInsensivel(valor) {
  return { contains: valor, ...modoInsensivel() };
}

/** `{ equals: valor }` com case-insensitive quando o provider suporta. */
export function igualInsensivel(valor) {
  return { equals: valor, ...modoInsensivel() };
}
