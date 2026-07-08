// Regenera prisma/schema.sqlite.prisma a partir de schema.prisma (dev local zero-infra).
// Rode após qualquer migration:  npm run prisma:sqlite
// SQLite não suporta `directUrl`, `Json` nem tipos nativos `@db.*` — removemos/convertemos.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./schema.prisma', import.meta.url), 'utf8');
const out = src
  .replace('provider = "postgresql"', 'provider = "sqlite"')
  .replace(/^\s*directUrl\s*=.*\r?\n/m, '')     // pooler do Supabase — não existe em SQLite
  .replace(/\bJson\b/g, 'String')               // Json -> String (SQLite guarda como TEXT)
  .replace(/ *@db\.\w+(\([^)]*\))?/g, '');       // tipos nativos Postgres (@db.Date, @db.VarChar…)

writeFileSync(new URL('./schema.sqlite.prisma', import.meta.url),
  '// GERADO por prisma/sqlite-schema.mjs a partir de schema.prisma — NÃO edite à mão.\n' +
  '// Rode `npm run prisma:sqlite` após cada migration para não driftar.\n' + out);

console.log('schema.sqlite.prisma regenerado a partir de schema.prisma.');
