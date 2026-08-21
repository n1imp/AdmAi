/**
 * EOS V2 — verificacao do Engineering System contra o oraculo ENG-01..ENG-10.
 *
 * Duas gravidades:
 *   ENGINEER FALTANDO -> GRAVE (superficie sem dono)
 *   ENGINEER SOBRANDO -> GRAVE (custo sem impacto material, secao 26)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { route } from './router.mjs';
import { resolveOwnership } from './slice.mjs';
import { escalateConflict } from './contract-bus.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

let grave = 0, pass = 0;
console.log('EOS Engineering System — verificacao contra oraculo externo\n');

for (const c of fixtures.cases) {
  const problems = [];
  const e = c.expect;

  if (c.contractConflict) {
    const r = escalateConflict({ ...c.contractConflict });
    if (r.escalatesTo !== e.escalatesTo) problems.push(`escalou para '${r.escalatesTo}', esperado '${e.escalatesTo}'`);
  } else if (c.forceContenders) {
    const r = resolveOwnership({ surface: c.forceSurface, contenders: c.forceContenders });
    if (r.status !== e.status) problems.push(`status '${r.status}', esperado '${e.status}'`);
    if (e.resolvedPrimary && r.primaryOwner !== e.resolvedPrimary) {
      problems.push(`primary '${r.primaryOwner}', esperado '${e.resolvedPrimary}'`);
    }
    for (const d of e.demotedToCollaborator || []) {
      if (!r.collaborators.includes(d)) problems.push(`'${d}' deveria virar colaborador`);
    }
    if (r.concurrentEditAllowed) problems.push('edicao concorrente permitida — deveria ser negada');
  } else {
    const r = route(c.request);
    for (const req of e.required || []) {
      if (!r.engineers.includes(req)) problems.push(`Engineer FALTANDO: ${req}`);
    }
    for (const f of e.forbidden || []) {
      if (r.engineers.includes(f)) problems.push(`Engineer SOBRANDO: ${f}`);
    }
    if (e.primaryOwner && r.primaryOwner !== e.primaryOwner) {
      problems.push(`primaryOwner '${r.primaryOwner}', esperado '${e.primaryOwner}'`);
    }
    if (e.primaryOwnerOneOf && !e.primaryOwnerOneOf.includes(r.primaryOwner)) {
      problems.push(`primaryOwner '${r.primaryOwner}' fora de [${e.primaryOwnerOneOf}]`);
    }
    if (e.minEngineers && r.engineers.length < e.minEngineers) {
      problems.push(`${r.engineers.length} Engineers, minimo ${e.minEngineers}`);
    }
    if (e.maxEngineers && r.engineers.length > e.maxEngineers) {
      problems.push(`${r.engineers.length} Engineers [${r.engineers}], maximo ${e.maxEngineers}`);
    }
    if (e.verificationLevel && r.verificationLevel !== e.verificationLevel) {
      problems.push(`verificacao '${r.verificationLevel}', esperado '${e.verificationLevel}'`);
    }
  }

  if (problems.length === 0) { pass++; console.log(`  [PASS ] ${c.id}`); }
  else {
    grave++;
    console.log(`  [GRAVE] ${c.id}  ${c.kind === 'NEGATIVO' ? '[NEG] ' : ''}${c.request || '(conflito)'}`.slice(0, 120));
    problems.forEach((p) => console.log(`           ${p}`));
  }
}

console.log(`\n  total=${fixtures.cases.length}  pass=${pass}  grave=${grave}`);
console.log(grave === 0
  ? '\nRESULTADO: PASS — roteamento de engenharia confere com o oraculo.'
  : '\nRESULTADO: FAIL');
process.exit(grave === 0 ? 0 : 1);
