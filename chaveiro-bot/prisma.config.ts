import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Config das ferramentas Prisma CLI (Prisma 7). No Prisma 7 a conexão não fica mais no
// schema. As migrations/introspect usam `datasource.url` — a conexão DIRETA (DIRECT_URL,
// 5432): o pooler pgbouncer (transaction mode) não suporta os locks das migrations.
// O RUNTIME usa o driver adapter em src/db/prisma.js (pode ser o pooler).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
