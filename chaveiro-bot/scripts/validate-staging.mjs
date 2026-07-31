#!/usr/bin/env node
// =============================================================================
// validate-staging.mjs — valida o Prisma 7 (driver adapter + pooler pgbouncer)
// contra um Supabase de STAGING, com trava anti-produção.
//
// Uso:   node scripts/validate-staging.mjs
//        npm run validate:staging
//
// Lê chaveiro-bot/.env.staging (NUNCA versionado). Roda, em sequência:
//   1. prisma migrate deploy   (via DIRECT_URL, conexão direta 5432)
//   2. prisma generate
//   3. test:integration        (via DATABASE_URL, o POOLER 6543 — o que valida o P7)
//
// Segurança: ABORTA se ALLOW_STAGING_WRITES!=true, se as URLs ainda tiverem
// placeholders, ou se o host casar com PROD_HOST_BLOCKLIST. Zero risco de tocar prod.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';

const BACKEND = dirname(dirname(fileURLToPath(import.meta.url))); // .../chaveiro-bot
const ENV_PATH = join(BACKEND, '.env.staging');

function abortar(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
function ok(msg) {
  console.log(`✅ ${msg}`);
}
function info(msg) {
  console.log(`   ${msg}`);
}

// Esconde a senha ao imprimir uma connection string.
function mascarar(url) {
  return String(url).replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
}
function hostDe(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}
function portaDe(url) {
  try {
    return new URL(url).port;
  } catch {
    return '';
  }
}

// ── 1. Carregar .env.staging ────────────────────────────────────────────────
if (!existsSync(ENV_PATH)) {
  abortar(
    `Não achei ${ENV_PATH}.\n` +
      `   Copie o modelo:  cp chaveiro-bot/.env.staging.example chaveiro-bot/.env.staging\n` +
      `   e preencha com o projeto Supabase de STAGING (ver docs/db/STAGING_VALIDATION.md).`
  );
}
const cfg = dotenv.parse(readFileSync(ENV_PATH));

const { DATABASE_URL, DIRECT_URL, ALLOW_STAGING_WRITES, PROD_HOST_BLOCKLIST, STAGING_REF } = cfg;

// ── 2. Travas de segurança ──────────────────────────────────────────────────
if (!DATABASE_URL || !DIRECT_URL) {
  abortar('DATABASE_URL e DIRECT_URL são obrigatórios em .env.staging.');
}
for (const [k, v] of [
  ['DATABASE_URL', DATABASE_URL],
  ['DIRECT_URL', DIRECT_URL],
]) {
  if (/SEU_REF|SUA_SENHA|SEU_REF_STAGING/.test(v)) {
    abortar(`${k} ainda tem placeholder do exemplo — preencha com o staging real.`);
  }
}
if (ALLOW_STAGING_WRITES !== 'true') {
  abortar(
    'ALLOW_STAGING_WRITES não é "true". Esta é a confirmação explícita de que o alvo\n' +
      '   NÃO é produção. Confira as URLs abaixo e, se forem de STAGING, defina\n' +
      '   ALLOW_STAGING_WRITES=true no .env.staging.\n' +
      `     DATABASE_URL (pooler): ${mascarar(DATABASE_URL)}\n` +
      `     DIRECT_URL   (direta): ${mascarar(DIRECT_URL)}`
  );
}
// Allowlist POSITIVA: as duas URLs DEVEM conter o ref do staging declarado. Como staging e
// prod compartilham o host do pooler (só o `postgres.<ref>` difere), o ref é o discriminador
// confiável — prod jamais casaria com o STAGING_REF que você declarou.
if (!STAGING_REF) {
  abortar(
    'STAGING_REF não definido em .env.staging (o ref do projeto de staging, ex.: qsuufuulxfkkeasgxhcv).'
  );
}
for (const [k, v] of [
  ['DATABASE_URL', DATABASE_URL],
  ['DIRECT_URL', DIRECT_URL],
]) {
  if (!v.includes(STAGING_REF)) {
    abortar(
      `${k} não contém STAGING_REF="${STAGING_REF}". Alvo suspeito — a URL não é do projeto de staging declarado. Abortado.`
    );
  }
}
// Blocklist NEGATIVA: substring na URL inteira (não só no host — o host do pooler é
// compartilhado). Coloque o REF do projeto de PRODUÇÃO em PROD_HOST_BLOCKLIST.
const bloqueados = (PROD_HOST_BLOCKLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
for (const url of [DATABASE_URL, DIRECT_URL]) {
  const achado = bloqueados.find((b) => url.includes(b));
  if (achado) {
    abortar(
      `ABORTADO: uma URL casa com PROD_HOST_BLOCKLIST ("${achado}"). Isso é produção — jamais migrar aqui.`
    );
  }
}
// Migrations NÃO podem passar pelo pooler transaction (6543): quebram nos locks.
if (portaDe(DIRECT_URL) === '6543') {
  abortar(
    'DIRECT_URL aponta para a porta 6543 (pooler transaction). Migrations exigem a conexão DIRETA (5432).'
  );
}
if (portaDe(DATABASE_URL) !== '6543') {
  info(
    `⚠️  DATABASE_URL não está na porta 6543 — você NÃO estará testando o pooler transaction ` +
      `(que é o ponto do Prisma 7). Host atual: ${hostDe(DATABASE_URL)}:${portaDe(DATABASE_URL)}`
  );
}

ok('Travas de segurança passaram. Alvo confirmado como STAGING:');
info(`runtime  (pooler 6543): ${mascarar(DATABASE_URL)}`);
info(`migrate  (direta 5432): ${mascarar(DIRECT_URL)}`);

// Env para os filhos: o .env.staging inteiro + o process.env atual.
const childEnv = { ...process.env, ...cfg };

function passo(titulo, cmd, args) {
  console.log(`\n── ${titulo} ─────────────────────────────────────────────`);
  const r = spawnSync(cmd, args, { cwd: BACKEND, env: childEnv, stdio: 'inherit', shell: true });
  if (r.status !== 0) abortar(`Falhou: ${titulo} (exit ${r.status}). Veja o output acima.`);
  ok(`${titulo} — ok`);
}

// ── 3. Sequência de validação ───────────────────────────────────────────────
passo('1/3  prisma migrate deploy (conexão direta)', 'npx', ['prisma', 'migrate', 'deploy']);
passo('2/3  prisma generate', 'npx', ['prisma', 'generate']);
passo('3/3  test:integration contra o pooler (IDOR/auth via Prisma 7)', 'npm', [
  'run',
  'test:integration',
]);

console.log(`
============================================================================
✅ VALIDAÇÃO PRISMA 7 EM STAGING: PASSOU
   - migrate deploy aplicou o schema pela conexão direta (5432)
   - a suíte de integração exercitou as queries pelo POOLER (6543) via
     @prisma/adapter-pg — prepared statements sob transaction pooling OK
   Próximo: Fase 2 (RLS) — ver docs/db/STAGING_VALIDATION.md.
============================================================================
`);
