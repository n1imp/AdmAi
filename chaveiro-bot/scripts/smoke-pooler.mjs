#!/usr/bin/env node
// =============================================================================
// smoke-pooler.mjs — valida o Prisma 7 (driver adapter @prisma/adapter-pg) contra o
// POOLER TRANSACTION (6543) do Supabase, SEM depender de Redis/BullMQ.
//
// É o teste do RISCO central: prepared statements do `pg` sob transaction pooling.
// Roda queries parametrizadas repetidas + uma transação interativa (create/read/delete)
// pelo DATABASE_URL (6543). Se passar, o Prisma 7 é seguro no pooler transaction.
//
// Uso: node scripts/smoke-pooler.mjs   (lê chaveiro-bot/.env.staging)
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const BACKEND = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(BACKEND, '.env.staging');
if (!existsSync(ENV_PATH)) {
  console.error('❌ Falta .env.staging');
  process.exit(1);
}
const cfg = dotenv.parse(readFileSync(ENV_PATH));

const { DATABASE_URL, STAGING_REF } = cfg;
if (!DATABASE_URL || /SUA_SENHA/.test(DATABASE_URL)) {
  console.error('❌ DATABASE_URL sem senha real');
  process.exit(1);
}
if (!STAGING_REF || !DATABASE_URL.includes(STAGING_REF)) {
  console.error('❌ DATABASE_URL não bate com STAGING_REF (alvo suspeito)');
  process.exit(1);
}
try {
  if (new URL(DATABASE_URL).port !== '6543')
    console.warn('⚠️  DATABASE_URL não é 6543 — não está testando o pooler transaction.');
} catch {}

// Mesma construção do runtime real (src/db/prisma.js): adapter pg apontando pro pooler.
const adapter = new PrismaPg({ connectionString: DATABASE_URL });
const prisma = new PrismaClient({ adapter });

let ok = true;
async function passo(nome, fn) {
  try {
    const r = await fn();
    console.log(`✅ ${nome}`, r === undefined ? '' : `→ ${r}`);
  } catch (e) {
    ok = false;
    console.error(`❌ ${nome}: ${e.code || ''} ${e.message}`);
  }
}

console.log(`Alvo: pooler transaction do ${STAGING_REF} (6543)\n`);

await passo('SELECT 1 (raw parametrizado)', async () => {
  const r = await prisma.$queryRaw`SELECT ${1}::int AS ok`;
  return JSON.stringify(r);
});

await passo('count Empresa', () => prisma.empresa.count());

// Estressa prepared statements: MESMA query parametrizada N vezes (cada uma pode cair num
// backend diferente sob transaction pooling — é aqui que prepared statement nomeado quebraria).
await passo('10x findMany parametrizado (stress prepared stmt)', async () => {
  for (let i = 0; i < 10; i++) await prisma.empresa.findMany({ where: { ativo: true }, take: 3 });
  return '10 rodadas sem erro';
});

// Transação interativa: create → findFirst → delete (write+read+prepared no mesmo backend).
await passo('transação interativa (create/read/delete)', async () => {
  return prisma.$transaction(async (tx) => {
    const e = await tx.empresa.create({ data: { nome: 'smoke-p7', slug: `smoke-${Date.now()}` } });
    const got = await tx.empresa.findFirst({ where: { id: e.id } });
    await tx.empresa.delete({ where: { id: e.id } });
    return `criou/leu/apagou id=${got?.id}`;
  });
});

await prisma.$disconnect();
console.log(
  `\n${ok ? '✅ SMOKE POOLER: PASSOU — Prisma 7 OK no transaction pooler (6543)' : '❌ SMOKE POOLER: FALHOU — ver erros acima'}`
);
process.exit(ok ? 0 : 1);
