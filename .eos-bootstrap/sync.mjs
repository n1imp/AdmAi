/**
 * Sincronizacao do Planning Freeze para os workspaces dos workers — secoes 4 e 6.
 *
 * REGRA: `git clone` traz somente arquivos rastreados no HEAD. Os planos A-G e o
 * `tools/eos/` inteiro estao untracked, e as mudancas de produto do DOG-001/002
 * estao dirty. Sem esta copia explicita, os workers construiriam sobre um
 * baseline que nao e o da integration lane.
 *
 * NUNCA copia `.claude/`, `.codex/`, `.serena/` — launcher, politica MCP e estado
 * de provider (secao 6). A ausencia deles e verificada depois.
 */

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const SRC = 'C:/Users/n1iag/dev/admai-worktrees/agent-environment';
const TARGETS = [
  'C:/Users/n1iag/dev/admai-worktrees/EOS_BUILD_CLAUDE',
  'C:/Users/n1iag/dev/admai-worktrees/EOS_BUILD_CODEX'
];

/** Diretorios inteiros que precisam existir nos workers. */
const DIRS = [
  'docs/eos-v2',
  'docs/agent-environment',
  'docs/functionality-discovery',
  'tools/eos'
];

/** Arquivos soltos: estado dirty da integration lane que define o baseline real. */
const FILES = [
  '.gitignore',
  'chaveiro-bot/src/routes/documentos.js',
  'chaveiro-bot/src/routes/__tests__/documentos-storage-key.test.js',
  'chaveiro-painel/src/pages/Tecnicos.jsx',
  'chaveiro-painel/src/pages/__tests__/Tecnicos.test.jsx'
];

/** Nunca sai da integration lane. */
const FORBIDDEN = ['.claude', '.codex', '.serena', '.credentials.json', '.env'];

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
};

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// monta a lista relativa
const rel = [];
for (const d of DIRS) {
  if (!existsSync(`${SRC}/${d}`)) continue;
  for (const f of walk(`${SRC}/${d}`)) rel.push(f.slice(SRC.length + 1));
}
for (const f of FILES) if (existsSync(`${SRC}/${f}`)) rel.push(f);

// guarda: nada proibido na lista
const leaks = rel.filter((r) => FORBIDDEN.some((x) => r.split('/').includes(x) || r.endsWith(x)));
if (leaks.length) {
  console.error(`  ABORTADO: caminho proibido na lista de copia: ${leaks.join(', ')}`);
  process.exit(1);
}

let copied = 0;
for (const t of TARGETS) {
  for (const r of rel) {
    const dst = `${t}/${r}`;
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(`${SRC}/${r}`, dst);
    copied++;
  }
}

// verificacao de fingerprint nos tres lados (secao 6)
let mismatch = 0;
const report = [];
for (const r of rel) {
  const h = sha(`${SRC}/${r}`);
  for (const t of TARGETS) {
    const th = existsSync(`${t}/${r}`) ? sha(`${t}/${r}`) : 'AUSENTE';
    if (th !== h) { mismatch++; report.push(`${r} @ ${t.split('/').pop()}`); }
  }
}

console.log(`  arquivos sincronizados : ${rel.length} x ${TARGETS.length} = ${copied}`);
console.log(`  divergencias de fingerprint : ${mismatch}`);
if (mismatch) { report.slice(0, 10).forEach((x) => console.log(`    ! ${x}`)); process.exit(1); }

// confirma ausencia dos proibidos nos alvos
let present = 0;
for (const t of TARGETS) {
  for (const f of FORBIDDEN) if (existsSync(`${t}/${f}`)) { console.log(`  ! ${f} PRESENTE em ${t}`); present++; }
}
console.log(`  artefatos proibidos nos clones : ${present}`);

const g = 'docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md';
console.log(`  PLAN-G identico nos 3 lados : ${[SRC, ...TARGETS].map((p) => sha(`${p}/${g}`).slice(0, 12)).join(' == ')}`);
