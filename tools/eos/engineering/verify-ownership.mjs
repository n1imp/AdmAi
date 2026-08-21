/**
 * EOS V2 — verificacao do Execution Responsibility Vector (F-004).
 *
 * Confronta responsibility.mjs com ownership-fixtures.json, escrito antes dele.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveResponsibility } from './responsibility.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'ownership-fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Execution Responsibility Vector — verificacao (F-004)\n');

for (const c of fx.cases) {
  const r = resolveResponsibility(c.input);
  const e = c.expect;
  const p = [];

  if (e.primaryOwner && r.primaryOwner !== e.primaryOwner) {
    p.push(`primaryOwner='${r.primaryOwner}', esperado '${e.primaryOwner}'`);
  }
  if (e.primaryOwnerOneOf && !e.primaryOwnerOneOf.includes(r.primaryOwner)) {
    p.push(`primaryOwner='${r.primaryOwner}' fora de [${e.primaryOwnerOneOf}]`);
  }
  for (const np of e.notPrimary || []) {
    if (r.primaryOwner === np) p.push(`'${np}' NAO deveria ser Primary (risco nao e autoria)`);
  }
  for (const [eng, aceitos] of Object.entries(e.roles || {})) {
    if (!aceitos.includes(r.roles[eng])) {
      p.push(`${eng} recebeu '${r.roles[eng]}', esperado um de [${aceitos}]`);
    }
  }
  for (const ni of e.notInvolved || []) {
    if (r.roles[ni] && r.roles[ni] !== 'NOT_INVOLVED') {
      p.push(`'${ni}' foi acionado indevidamente como ${r.roles[ni]}`);
    }
  }
  if (e.contractOwner !== undefined && r.contractOwner !== e.contractOwner) {
    p.push(`contractOwner='${r.contractOwner}', esperado '${e.contractOwner}'`);
  }
  if (e.sliceOwners) {
    for (const [surf, owner] of Object.entries(e.sliceOwners)) {
      if (r.sliceOwners?.[surf] !== owner) p.push(`slice '${surf}' -> '${r.sliceOwners?.[surf]}', esperado '${owner}'`);
    }
  }
  if (e.integrationNotPrimaryOfImplementation && r.primaryOwner === 'integration') {
    p.push('integration nao deve ser Primary de implementacao em contrato transversal');
  }
  if (e.securityHasNoImplementationSlice && r.roles.security === 'PRIMARY_OWNER') {
    p.push('security recebeu slice de implementacao sem precisar escrever');
  }
  if (e.exactlyOnePrimary && !r.exactlyOnePrimary) p.push('mais de um Primary Owner');
  if (e.concurrentEditAllowed === false && r.concurrentEditAllowed) p.push('edicao concorrente permitida');
  if (e.fallbackUsed !== undefined && r.fallbackUsed !== e.fallbackUsed) {
    p.push(`fallbackUsed=${r.fallbackUsed}, esperado ${e.fallbackUsed}`);
  }
  if (e.fallbackCode && r.fallbackCode !== e.fallbackCode) p.push(`fallbackCode='${r.fallbackCode}'`);
  if (e.confidence && r.confidence !== e.confidence) p.push(`confidence='${r.confidence}', esperado '${e.confidence}'`);
  if (e.escalates !== undefined && r.escalates !== e.escalates) p.push(`escalates=${r.escalates}, esperado ${e.escalates}`);
  if (e.contractRequests !== undefined && r.contractRequests !== e.contractRequests) {
    p.push(`contractRequests=${r.contractRequests}, esperado ${e.contractRequests}`);
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 118)); }
  else {
    fail++;
    console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 118));
    p.forEach((x) => console.log(`         ${x}`));
  }
}

console.log(`\n  total=${fx.cases.length}  pass=${pass}  fail=${fail}`);
console.log(fail === 0
  ? '\nRESULTADO: PASS — ownership deriva de responsabilidade, nao de precedencia.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
