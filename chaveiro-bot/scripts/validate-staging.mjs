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

/* ── Env HERMÉTICO da suíte de integração [D-STG-K-SUITE-VS-STAGING-01 · Codex 01a040e7] ──
   A suíte valida o Prisma 7 contra o POOLER (o ponto do K) — e nada além disso. Passar o
   .env.staging inteiro deu à suíte credenciais reais que não são objeto do K: Storage real
   virou 302 nos testes de documentos (contrato deles é o fallback local) e o onboarding
   disparou e-mails REAIS no Resend. O passo de integração recebe um env mínimo: o DB de
   staging (já validado pelas travas acima), APP_ENV/NODE_ENV=test e NENHUM serviço externo.
   Migrate/generate continuam com o env staging completo. */
export const CHAVES_PROIBIDAS_NA_INTEGRACAO = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STORAGE_STRICT',
  'RESEND_API_KEY',
  'DATABASE_URL_APP',
];

/* Predicado ESTRUTURAL de pooler Supabase (Supavisor): hostname termina em
   `pooler.supabase.com` de verdade — sufixo com fronteira de label, não substring
   (um `pooler.supabase.com.evil.com` forjado NÃO casa). Usado pelo skip do
   rls.test.js; APP_ENV não participa de propósito (Codex 01a040e7). */
export function ehHostDePooler(hostname) {
  return /(^|\.)pooler\.supabase\.com$/.test(String(hostname ?? ''));
}

export function montarEnvDeIntegracao(processEnv, cfgStaging) {
  const env = { ...processEnv };
  for (const k of CHAVES_PROIBIDAS_NA_INTEGRACAO) delete env[k];
  // O Redis de staging é interno ao Railway (inalcançável daqui); o .env.test aponta o local.
  delete env.REDIS_URL;
  env.DATABASE_URL = cfgStaging.DATABASE_URL;
  env.DIRECT_URL = cfgStaging.DIRECT_URL;
  env.NODE_ENV = 'test';
  env.APP_ENV = 'test';
  // RTT do pooler remoto: só o maxWait de INICIAR transação sobe (knob Zod; default Prisma
  // fica intacto sem ele). 10s ≤ timeout de teste do vitest (20s), com margem para o corpo.
  env.PRISMA_TX_MAX_WAIT_MS = '10000';
  return env;
}

// Modo import (testes): nada abaixo executa.
const EXECUTANDO_COMO_CLI = Boolean(
  process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('validate-staging.mjs')
);

// ── 1. Carregar .env.staging ────────────────────────────────────────────────
if (EXECUTANDO_COMO_CLI && !existsSync(ENV_PATH)) {
  abortar(
    `Não achei ${ENV_PATH}.\n` +
      `   Copie o modelo:  cp chaveiro-bot/.env.staging.example chaveiro-bot/.env.staging\n` +
      `   e preencha com o projeto Supabase de STAGING (ver docs/db/STAGING_VALIDATION.md).`
  );
}
if (EXECUTANDO_COMO_CLI) {
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

  // Env dos passos de MIGRATE/GENERATE/RLS: o .env.staging inteiro + o process.env atual.
  const childEnv = { ...process.env, ...cfg };

  function passo(titulo, cmd, args, envDoPasso = childEnv) {
    console.log(`\n── ${titulo} ─────────────────────────────────────────────`);
    const r = spawnSync(cmd, args, {
      cwd: BACKEND,
      env: envDoPasso,
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) abortar(`Falhou: ${titulo} (exit ${r.status}). Veja o output acima.`);
    ok(`${titulo} — ok`);
  }

  // Guard anti-repovoamento [Codex 01a040e7]: o vitest carrega o .env.test DENTRO do filho e
  // o dotenv preenche chaves AUSENTES — que é exatamente o que o env hermético cria. Se um
  // dia o .env.test definir uma chave proibida, ela voltaria pela porta dos fundos: recusa
  // ALTO aqui, antes de rodar qualquer teste.
  {
    const envTestPath = join(BACKEND, '.env.test');
    const envTest = existsSync(envTestPath) ? dotenv.parse(readFileSync(envTestPath)) : {};
    const vazando = CHAVES_PROIBIDAS_NA_INTEGRACAO.filter((k) => k in envTest);
    if (vazando.length) {
      abortar(
        `.env.test define chave(s) proibida(s) para a integração hermética: ${vazando.join(', ')}.\n` +
          '   Remova-as do .env.test — serviços externos não são objeto da suíte de integração.'
      );
    }
  }
  const envDeIntegracao = montarEnvDeIntegracao(process.env, cfg);

  // ── 3. Sequência de validação ───────────────────────────────────────────────
  passo('1/4  prisma migrate deploy (conexão direta)', 'npx', ['prisma', 'migrate', 'deploy']);
  passo('2/4  prisma generate', 'npx', ['prisma', 'generate']);
  passo(
    '3/4  test:integration contra o pooler (IDOR/auth via Prisma 7; env HERMÉTICO)',
    'npm',
    ['run', 'test:integration'],
    envDeIntegracao
  );
  // O rls.test.js pula estruturalmente via pooler (roles próprios são impossíveis pelo
  // Supavisor); o equivalente staging NÃO fica de fora: roda aqui, sempre.
  passo('4/4  validate-rls-staging (GUC/RLS via pooler, não destrutivo)', 'node', [
    'scripts/validate-rls-staging.mjs',
  ]);

  console.log(`
============================================================================
✅ VALIDAÇÃO PRISMA 7 EM STAGING: PASSOU
   - migrate deploy aplicou o schema pela conexão direta (5432)
   - a suíte de integração exercitou as queries pelo POOLER (6543) via
     @prisma/adapter-pg — prepared statements sob transaction pooling OK
     (env HERMÉTICO: sem Storage/Resend reais; rls.test.js SKIP via pooler)
   - validate-rls-staging provou o GUC/RLS através do pooler
============================================================================
`);
} // fim EXECUTANDO_COMO_CLI
