/**
 * EOS V2 — verificacao do Capability Gap (F-005).
 * Confronta responsibility.mjs com capability-fixtures.json, escrito antes.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveResponsibility, SURFACE_OWNERSHIP, CONCERN_CAPABILITY } from './responsibility.mjs';
import { ROSTER } from './roster.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'capability-fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Capability Gap — verificacao (F-005)\n');

for (const c of fx.cases) {
  const r = resolveResponsibility(c.input);
  const e = c.expect;
  const p = [];

  const state = r.ownershipState ?? 'OWNED';
  if (e.ownershipState && state !== e.ownershipState) p.push(`ownershipState='${state}', esperado '${e.ownershipState}'`);
  if (e.primaryOwner !== undefined && r.primaryOwner !== e.primaryOwner) {
    p.push(`primaryOwner='${r.primaryOwner}', esperado '${e.primaryOwner}'`);
  }
  for (const np of e.notPrimary || []) {
    if (r.primaryOwner === np) p.push(`'${np}' NAO deveria ser Primary`);
  }
  if (e.fallbackUsed !== undefined && Boolean(r.fallbackUsed) !== e.fallbackUsed) {
    p.push(`fallbackUsed=${Boolean(r.fallbackUsed)}, esperado ${e.fallbackUsed}` +
           (e.fallbackUsed === false && state === 'CAPABILITY_GAP' ? ' — lacuna mascarada por fallback' : ''));
  }
  if (e.hasMissingMapping && !(r.missingMapping || []).length) p.push('missingMapping ausente');
  if (e.hasEscalationTarget && !r.escalationTarget) p.push('escalationTarget ausente');
  if (e.confidence && r.confidence !== e.confidence) p.push(`confidence='${r.confidence}', esperado '${e.confidence}'`);
  if (e.escalates !== undefined && Boolean(r.escalates) !== e.escalates) p.push(`escalates=${r.escalates}, esperado ${e.escalates}`);
  for (const [eng, aceitos] of Object.entries(e.roles || {})) {
    if (!aceitos.includes(r.roles?.[eng])) p.push(`${eng}='${r.roles?.[eng]}', esperado um de [${aceitos}]`);
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 116)); }
  else { fail++; console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 116)); p.forEach((x) => console.log(`         ${x}`)); }
}

// --- matriz de nao sobreposicao ---
console.log('\n  matriz de nao sobreposicao:');
const seen = new Map();
let overlap = 0;
for (const row of fx.nonOverlapMatrix) {
  const known = row.owner === 'featureEngineer' || row.owner === 'verification' || row.owner in ROSTER;
  if (!known) { overlap++; console.log(`    [FAIL] '${row.task}' -> dono inexistente '${row.owner}'`); continue; }
  console.log(`    [PASS] ${row.task.padEnd(32)} -> ${row.owner}`);
  seen.set(row.task, row.owner);
}
if (seen.size !== fx.nonOverlapMatrix.length) { overlap++; console.log('    [FAIL] tarefa duplicada na matriz'); }

const neg = fx.cases.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${fx.cases.length}  (negativos=${neg})  pass=${pass}  fail=${fail}  matriz: ${overlap ? 'FAIL' : 'OK'}`);
console.log(fail === 0 && overlap === 0
  ? '\nRESULTADO: PASS — ausencia de owner e declarada, nao mascarada.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 && overlap === 0 ? 0 : 1);
