#!/usr/bin/env node
/**
 * DRENADOR OPACO DE SECRET VIA CLIPBOARD — STG-APP-OPAQUE-SECRETS-01.
 *
 * Princípio: OPAQUE_TRANSFER != MODEL_READ. O usuário (ou um click-copy em UI
 * MASCARADA) coloca UM valor no clipboard; este script o drena DIRETO para os
 * destinos sem que o valor jamais seja impresso, logado, passado em argv ou
 * retornado ao agente. O agente só vê: VALID/INVALID (motivo de FORMA) e
 * CONFIGURED/FAILED por destino.
 *
 *   node tools/drenar-clipboard-secret.mjs <NOME> [--pooler-host=<host>] [--dry-run]
 *
 * NOMES e destinos:
 *   DATABASE_URL | DIRECT_URL | SUPABASE_SERVICE_ROLE_KEY | RESEND_API_KEY
 *       → chaveiro-bot/.env.staging (campo já existente) E
 *         gh secret set <NOME>_STAGING --env staging (stdin; p/ fase external-secrets)
 *   DB_PASSWORD  (senha nova do reset no dashboard Supabase)
 *       → compõe DATABASE_URL (porta 6543) e DIRECT_URL (5432) com --pooler-host
 *         e distribui AMBAS como acima. A senha isolada não é gravada em lugar nenhum.
 *   STAGING_SUPABASE_ANON_KEY | STAGING_AUTHENTICATED_JWT
 *       → só chaveiro-bot/.env.staging (subgates locais H-mut/I).
 *
 * Garantias (requisitos 1-8 da diretiva de transferência opaca):
 *   - valor nunca em stdout/stderr/argv/artifact; vive só na memória do processo;
 *   - validação de FORMA reporta apenas nome+motivo (inclui guard anti-produção);
 *   - .env.staging é reescrito atomicamente preservando o resto; nunca cria campo novo;
 *   - gh recebe o valor por STDIN (nunca em linha de comando);
 *   - clipboard é LIMPO ao final (sucesso ou falha pós-leitura);
 *   - nenhum arquivo temporário com o valor é criado.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validarFormaExterna, SECRETOS_EXTERNOS } from './railway-staging-bootstrap.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_STAGING = join(RAIZ, 'chaveiro-bot', '.env.staging');
const REPO = 'n1imp/AdmAi';
const REF_STAGING = 'qsuufuulxfkkeasgxhcv';
const SO_ENV_LOCAL = ['STAGING_SUPABASE_ANON_KEY', 'STAGING_AUTHENTICATED_JWT'];

/** Forma dos nomes extras (os 4 externos usam validarFormaExterna do bootstrap). */
function validarFormaExtra(nome, v) {
  if (!v) return 'vazio';
  if (/\r|\n/.test(v)) return 'contem quebra de linha';
  if (/disljhkypaxpyzvbooge/i.test(v)) return 'casa padrao de PRODUCAO';
  switch (nome) {
    case 'DB_PASSWORD':
      if (v.length < 12) return 'curta demais para senha de DB (min 12)';
      // Só o conjunto URL-unreserved: entra na URL SEM percent-encoding (o aviso do
      // dashboard sobre "special characters" deixa de existir por construção).
      if (!/^[A-Za-z0-9._~-]+$/.test(v)) return 'contem caractere fora de [A-Za-z0-9._~-] que exigiria percent-encoding na URL — gere outra';
      return null;
    case 'STAGING_SUPABASE_ANON_KEY':
      return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v) || /^sb_publishable_[A-Za-z0-9_-]+$/.test(v)
        ? null : 'nao tem forma de anon key (JWT eyJ... ou sb_publishable_...)';
    case 'STAGING_AUTHENTICATED_JWT':
      return /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(v) ? null : 'nao tem forma de JWT (eyJ...)';
    default:
      return 'nome desconhecido';
  }
}

const lerClipboard = () => {
  const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], {
    encoding: 'utf8', windowsHide: true,
  });
  if (r.status !== 0) return null;
  return (r.stdout ?? '').trim();
};
const limparClipboard = () => {
  spawnSync('powershell.exe', ['-NoProfile', '-Command', "Set-Clipboard -Value ' '"], {
    encoding: 'utf8', windowsHide: true,
  });
};

/** Substitui `NOME=` (campo já scaffoldado VAZIO) por `NOME=<valor>` — nunca cria
 *  campo novo nem sobrescreve campo já preenchido (rotação exige decisão). */
function gravarEnvStaging(nome, valor) {
  if (!existsSync(ENV_STAGING)) return 'FAILED (arquivo .env.staging ausente)';
  const texto = readFileSync(ENV_STAGING, 'utf8');
  const re = new RegExp(`^${nome}=(.*)$`, 'm');
  const m = texto.match(re);
  if (!m) return `FAILED (campo ${nome}= nao existe no scaffold)`;
  if (m[1] !== '') return 'SKIPPED (campo ja preenchido — nao sobrescrevo)';
  const novo = texto.replace(re, () => `${nome}=${valor}`); // fn: valor com $ não vira grupo
  const tmp = `${ENV_STAGING}.tmp-atomico`;
  writeFileSync(tmp, novo, { mode: 0o600 });
  renameSync(tmp, ENV_STAGING);
  return 'CONFIGURED';
}

/** gh secret set — valor por STDIN, nunca em argv. */
function gravarGhSecret(nome, valor) {
  const r = spawnSync('gh', ['secret', 'set', `${nome}_STAGING`, '--repo', REPO, '--env', 'staging'], {
    input: valor, encoding: 'utf8', windowsHide: true,
  });
  return r.status === 0 ? 'CONFIGURED' : `FAILED (gh exit ${r.status})`;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => (argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] || null;
const nome = argv.find((a) => !a.startsWith('--'));
const dryRun = argv.includes('--dry-run');
const VALIDOS = [...SECRETOS_EXTERNOS, 'DB_PASSWORD', ...SO_ENV_LOCAL];

if (!nome || !VALIDOS.includes(nome)) {
  console.error(`uso: node tools/drenar-clipboard-secret.mjs <${VALIDOS.join('|')}> [--pooler-host=..] [--dry-run]`);
  process.exit(2);
}

const bruto = lerClipboard();
if (bruto === null) {
  console.log(`${nome}: FAILED (nao consegui ler o clipboard)`);
  process.exit(1);
}
if (!bruto) {
  console.log(`${nome}: INVALID (clipboard vazio — copie o valor e re-rode)`);
  process.exit(1);
}

/* IMPORTANTE: nada de process.exit dentro do try — exit pula o finally e o
   clipboard ficaria SUJO com o secret nos caminhos INVALID/FAILED. */
let saida = 0;
try {
  // Validação de FORMA (nunca imprime o valor).
  const motivo = SECRETOS_EXTERNOS.includes(nome)
    ? validarFormaExterna(nome, bruto)
    : validarFormaExtra(nome, bruto);
  if (motivo) {
    console.log(`${nome}: INVALID (${motivo})`);
    saida = 1;
  } else {
    // Alvos: nome→valor a distribuir.
    const alvos = {};
    if (nome === 'DB_PASSWORD') {
      const host = flag('pooler-host');
      if (!host || !/(^|\.)pooler\.supabase\.com$/.test(host)) {
        console.log('DB_PASSWORD: FAILED (--pooler-host=<aws-N-regiao>.pooler.supabase.com obrigatorio e nao-secreto)');
        saida = 1;
      } else {
        const base = (porta) => `postgresql://postgres.${REF_STAGING}:${bruto}@${host}:${porta}/postgres`;
        alvos.DATABASE_URL = base(6543);
        alvos.DIRECT_URL = base(5432);
      }
    } else {
      alvos[nome] = bruto;
    }

    if (saida === 0) {
      console.log(`${nome}: VALID (forma ok; valor nunca exibido)`);
      for (const [n, v] of Object.entries(alvos)) {
        if (dryRun) {
          console.log(`  ${n}: DRY_RUN (nada gravado)`);
          continue;
        }
        const env = gravarEnvStaging(n, v);
        console.log(`  ${n} -> .env.staging: ${env}`);
        if (env.startsWith('FAILED')) saida = 1;
        if (!SO_ENV_LOCAL.includes(n)) {
          const gh = gravarGhSecret(n, v);
          console.log(`  ${n} -> gh secret ${n}_STAGING (env staging): ${gh}`);
          if (gh.startsWith('FAILED')) saida = 1;
        }
      }
    }
  }
} finally {
  limparClipboard();
  console.log('clipboard: LIMPO');
}
process.exit(saida);
