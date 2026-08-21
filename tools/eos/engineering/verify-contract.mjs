/**
 * EOS V2 — verificacao dos guards do Contract Bus (CB-REAL-01..10).
 *
 * LIMITE DECLARADO: passar aqui prova que os guards funcionam. NAO prova que o
 * Contract Bus foi exercitado numa boundary real — DOG-003 ficou BLOQUEADO por
 * ausencia de candidato, e a secao 45 exige uso real.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escalateConflict, detectBreakingChange, detectContractDrift,
         checkConsumerAcceptance, findRedundantRequests,
         checkContractOwnerAction } from './contract-bus.mjs';
import { hasMaterialContract } from './responsibility.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'contract-fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Contract Bus — guards CB-REAL-01..10\n');

for (const c of fx.cases) {
  const e = c.expect;
  const p = [];

  if (c.contractPair) {
    const r = detectBreakingChange(c.contractPair.previous, c.contractPair.next,
                                  { breakingChangeAllowed: c.contractPair.breakingChangeAllowed });
    if (e.breaking !== undefined && r.breaking !== e.breaking) p.push(`breaking=${r.breaking}, esperado ${e.breaking}`);
    if (e.code && r.code !== e.code) p.push(`code='${r.code}', esperado '${e.code}'`);
    if (e.gate && r.gate !== e.gate) p.push(`gate='${r.gate}', esperado '${e.gate}'`);
    if (e.reasonContains && !r.reasons.join(' ').includes(e.reasonContains)) {
      p.push(`motivo nao menciona '${e.reasonContains}': ${r.reasons.join('; ')}`);
    }
  } else if (c.drift) {
    const r = detectContractDrift(c.drift);
    if (r.drift !== e.drift) p.push(`drift=${r.drift}, esperado ${e.drift}`);
    if (e.code && r.code !== e.code) p.push(`code='${r.code}'`);
    if (e.findingOwner && r.findingOwner !== e.findingOwner) p.push(`findingOwner='${r.findingOwner}'`);
    if (e.blocksVerification !== undefined && r.blocksVerification !== e.blocksVerification) {
      p.push(`blocksVerification=${r.blocksVerification}`);
    }
  } else if (c.acceptance) {
    const r = checkConsumerAcceptance(c.acceptance);
    if (e.gate && r.gate !== e.gate) p.push(`gate='${r.gate}', esperado '${e.gate}'`);
    if (e.reasonContains && !(r.reason || '').includes(e.reasonContains)) p.push(`motivo: '${r.reason}'`);
  } else if (c.redundancy) {
    const r = findRedundantRequests(c.redundancy.requests);
    if (e.redundantCount !== undefined && r.redundantCount !== e.redundantCount) {
      p.push(`redundantCount=${r.redundantCount}, esperado ${e.redundantCount}`);
    }
    for (const id of e.redundant || []) if (!r.redundant.includes(id)) p.push(`'${id}' deveria ser redundante`);
  } else if (c.ownershipAttempt) {
    const r = checkContractOwnerAction(c.ownershipAttempt);
    if (r.allowed !== e.allowed) p.push(`allowed=${r.allowed}, esperado ${e.allowed}`);
    if (e.code && r.code !== e.code) p.push(`code='${r.code}', esperado '${e.code}'`);
  } else if (e.escalatesTo !== undefined) {
    const r = escalateConflict(c.input);
    if (r.escalatesTo !== e.escalatesTo) p.push(`escalatesTo='${r.escalatesTo}', esperado '${e.escalatesTo}'`);
    if (e.action && r.action !== e.action) p.push(`action='${r.action}', esperado '${e.action}'`);
  } else {
    const required = hasMaterialContract(c.input);
    if (e.contractRequired !== undefined && required !== e.contractRequired) {
      p.push(`contractRequired=${required}, esperado ${e.contractRequired}` +
             (e.contractRequired === false ? ' — Contract Bus forcado sem boundary' : ' — boundary material sem contrato'));
    }
    if (e.contractRequests !== undefined && (required ? 1 : 0) !== e.contractRequests) {
      p.push(`contractRequests=${required ? 1 : 0}, esperado ${e.contractRequests}`);
    }
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 116)); }
  else { fail++; console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 116)); p.forEach((x) => console.log(`         ${x}`)); }
}

const neg = fx.cases.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${fx.cases.length}  (negativos=${neg})  pass=${pass}  fail=${fail}`);
console.log(fail === 0
  ? '\nRESULTADO: PASS — guards prontos. NAO equivale a Contract Bus exercitado em boundary real.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
