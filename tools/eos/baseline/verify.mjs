/**
 * EOS V2 — verificacao do Baseline-Aware Verification.
 * Confronta classify.mjs/fingerprint.mjs com fixtures.json, escrito antes deles.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGate } from './classify.mjs';
import { fingerprint } from './fingerprint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Baseline-Aware Verification — verificacao\n');

for (const c of fx.cases) {
  const p = [];
  const e = c.expect;

  if (c.fingerprintPair) {
    const [a, b] = c.fingerprintPair.map(fingerprint);
    const equal = a.id === b.id;
    if (equal !== e.fingerprintsEqual) {
      p.push(`fingerprintsEqual=${equal}, esperado ${e.fingerprintsEqual}` +
             (equal ? ` (colisao: ${a.id})` : ` (${a.id} vs ${b.id})`));
    }
  } else {
    const r = evaluateGate(c.input);
    if (e.gateMode && r.gateMode !== e.gateMode) p.push(`gateMode='${r.gateMode}', esperado '${e.gateMode}'`);
    if (e.notAllowed && r.gateMode === e.notAllowed) p.push(`modo proibido '${e.notAllowed}' atribuido`);
    if (e.newFailures !== undefined && r.newFailures !== e.newFailures) p.push(`newFailures=${r.newFailures}, esperado ${e.newFailures}`);
    if (e.regressions !== undefined && r.regressions !== e.regressions) p.push(`regressions=${r.regressions}, esperado ${e.regressions}`);
    if (e.baselineSufficient !== undefined && r.baselineSufficient !== e.baselineSufficient) {
      p.push(`baselineSufficient=${r.baselineSufficient}, esperado ${e.baselineSufficient}`);
    }
    if (e.claimRejected !== undefined && r.claimRejected !== e.claimRejected) {
      p.push(`claimRejected=${r.claimRejected}, esperado ${e.claimRejected}`);
    }
    for (const [k, v] of Object.entries(e.classifications || {})) {
      if (r.classifications[k] !== v) p.push(`${k}: '${r.classifications[k]}', esperado '${v}'`);
    }
    for (const k of e.requiresReclassification || []) {
      if (!r.requiresReclassification.includes(k)) p.push(`${k} deveria exigir reclassificacao`);
    }
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 116)); }
  else {
    fail++;
    console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 116));
    p.forEach((x) => console.log(`         ${x}`));
  }
}

const neg = fx.cases.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${fx.cases.length}  (negativos=${neg})  pass=${pass}  fail=${fail}`);
console.log(fail === 0
  ? '\nRESULTADO: PASS — "ja falhava" sem baseline nao libera gate.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
