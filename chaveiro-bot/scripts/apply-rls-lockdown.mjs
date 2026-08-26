#!/usr/bin/env node
// =============================================================================
// apply-rls-lockdown.mjs — STG-SEC-RLS-01: aplica o lockdown no admai-staging com
// guard ANTI-PRODUCAO vinculado a CONEXAO REAL (não a um literal do operador).
// [REVISOR F4] Reusa o padrão de validate-staging.mjs (ALLOW_STAGING_WRITES +
// STAGING_REF allowlist + PROD_HOST_BLOCKLIST) e fixa o ref do admai-staging.
//
// Fluxo: valida .env.staging -> conecta via DIRECT_URL -> aplica
// lockdown_public_access.sql (COMMIT) -> roda verify_lockdown.sql (BEGIN...ROLLBACK).
// NÃO roda migrate deploy (isso é a reconciliação, item separado). NUNCA ecoa secret.
//
//   node scripts/apply-rls-lockdown.mjs            # aplica + verifica
//   node scripts/apply-rls-lockdown.mjs --verify-only
//
// Requer chaveiro-bot/.env.staging (fora do git) com DATABASE_URL/DIRECT_URL +
// STAGING_REF=qsuufuulxfkkeasgxhcv + ALLOW_STAGING_WRITES=true.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

const BACKEND = dirname(dirname(fileURLToPath(import.meta.url)));
const ENV_PATH = join(BACKEND, '.env.staging');
const RLS_DIR = join(BACKEND, 'prisma', 'rls');
const REF_ADMAI_STAGING = 'qsuufuulxfkkeasgxhcv';
const VERIFY_ONLY = process.argv.includes('--verify-only');

const abortar = (m) => {
  console.error(`\n❌ ${m}\n`);
  process.exit(1);
};
const portaDe = (u) => {
  try {
    return new URL(u).port;
  } catch {
    return '';
  }
};

// ── 1. Guards anti-produção (vinculados às URLs REAIS que serão usadas) ────────
if (!existsSync(ENV_PATH))
  abortar(`Não achei ${ENV_PATH}. Copie de .env.staging.example e preencha (staging admai).`);
const cfg = dotenv.parse(readFileSync(ENV_PATH));
const { DATABASE_URL, DIRECT_URL, ALLOW_STAGING_WRITES, PROD_HOST_BLOCKLIST, STAGING_REF } = cfg;

if (!DIRECT_URL)
  abortar('DIRECT_URL é obrigatório em .env.staging (conexão direta 5432 para aplicar SQL).');
for (const [k, v] of [
  ['DATABASE_URL', DATABASE_URL],
  ['DIRECT_URL', DIRECT_URL],
]) {
  if (v && /SEU_REF|SUA_SENHA|SEU_REF_STAGING/.test(v))
    abortar(`${k} ainda tem placeholder — preencha com o staging real.`);
}
if (ALLOW_STAGING_WRITES !== 'true')
  abortar('ALLOW_STAGING_WRITES != "true" (confirmação explícita de que NÃO é produção).');
if (STAGING_REF !== REF_ADMAI_STAGING)
  abortar(
    `STAGING_REF="${STAGING_REF}" != admai-staging esperado (${REF_ADMAI_STAGING}). Abortado.`
  );
for (const [k, v] of [
  ['DATABASE_URL', DATABASE_URL],
  ['DIRECT_URL', DIRECT_URL],
]) {
  if (v && !v.includes(REF_ADMAI_STAGING))
    abortar(
      `${k} não contém o ref do admai-staging (${REF_ADMAI_STAGING}). Alvo suspeito. Abortado.`
    );
}
for (const b of (PROD_HOST_BLOCKLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)) {
  for (const v of [DATABASE_URL, DIRECT_URL])
    if (v && v.includes(b))
      abortar(`Uma URL casa com PROD_HOST_BLOCKLIST ("${b}") — isso é produção. Abortado.`);
}
if (portaDe(DIRECT_URL) === '6543')
  abortar('DIRECT_URL na porta 6543 (pooler transaction). Use a conexão direta (5432) para DDL.');
console.log(
  `✅ Guards passaram. Alvo confirmado: admai-staging (${REF_ADMAI_STAGING}), aplicação via conexão direta.`
);

// ── 2. Carregar os artefatos SQL versionados (fonte de verdade) ───────────────
// Remove meta-comandos do psql e delimitadores de tx (a transação é gerida aqui).
function corpoSql(nome) {
  return readFileSync(join(RLS_DIR, nome), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (t.startsWith('\\')) return false;
      if (/^SELECT :'staging_ref'/.test(t)) return false;
      if (/^(BEGIN|COMMIT|ROLLBACK);$/.test(t)) return false;
      if (/^NOTIFY pgrst/.test(t)) return false;
      return true;
    })
    .join('\n');
}
const lockdown = corpoSql('lockdown_public_access.sql');
const verify = corpoSql('verify_lockdown.sql');

// ── 3. Aplicar (DIRECT_URL) ───────────────────────────────────────────────────
const client = new pg.Client({ connectionString: DIRECT_URL });
client.on('notice', (n) => console.log('  [notice]', n.message));

async function main() {
  await client.connect();
  if (!VERIFY_ONLY) {
    console.log('\n── Aplicando lockdown_public_access.sql ──');
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(lockdown);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
    await client.query(`NOTIFY pgrst, 'reload schema'`).catch(() => {});
    console.log('✅ lockdown aplicado (COMMIT).');
  }
  console.log('\n── Verificando (verify_lockdown.sql; BEGIN...ROLLBACK) ──');
  await client.query('BEGIN');
  try {
    await client.query(verify);
  } finally {
    await client.query('ROLLBACK');
  }
  console.log(
    '\n✅ STG-SEC-RLS-01: verify PASS. Rode agora scripts/staging-rls-negative-control.mjs (anon key) e re-rode o Security Advisor.'
  );
}

main()
  .then(() => client.end())
  .catch((e) => {
    console.error('\n❌ FALHOU:', e.message);
    client.end?.();
    process.exit(1);
  });
