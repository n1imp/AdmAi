/**
 * EOS V2 — verificacao do Risk Classifier contra o oraculo externo.
 *
 * EOS-P: nenhuma fase se autocertifica. fixtures.json foi escrito ANTES de
 * classify.mjs e e a autoridade. Este runner nao "ajusta" expectativa: ele
 * reporta divergencia.
 *
 * Distingue duas gravidades:
 *   SUBCLASSIFICACAO -> falha GRAVE  (menos escrutinio do que o risco exige)
 *   SUPERCLASSIFICACAO -> falha LEVE (custo, nao risco)
 *
 * Saida: exit 0 somente se nao houver falha grave nem divergencia exata.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './classify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));
const ORDER = fixtures.levels;
const rank = (l) => ORDER.indexOf(l);

const results = [];
let grave = 0, leve = 0, pass = 0;

for (const c of fixtures.cases) {
  const got = classify(c.request);
  const problems = [];
  let severity = null;

  if (c.exactLevel && got.level !== c.exactLevel) {
    const under = rank(got.level) < rank(c.exactLevel);
    problems.push(`nivel ${got.level}, esperado exatamente ${c.exactLevel}`);
    severity = under ? 'GRAVE' : 'LEVE';
  }
  if (c.minLevel && rank(got.level) < rank(c.minLevel)) {
    problems.push(`nivel ${got.level} abaixo do minimo ${c.minLevel}`);
    severity = 'GRAVE';
  }

  const e = c.expect || {};
  const chk = (cond, msg, sev = 'GRAVE') => { if (cond) { problems.push(msg); severity = severity === 'GRAVE' ? 'GRAVE' : sev; } };

  if (e.notLevel && got.level === e.notLevel) chk(true, `nivel proibido ${e.notLevel} atribuido`);
  for (const [k, dim] of [['minSecurity','security'],['minData','data'],['minReversibility','reversibility'],
                          ['minEnvironment','environment'],['minExternalIntegration','externalIntegration'],
                          ['minUncertainty','uncertainty']]) {
    if (e[k] !== undefined) chk(got.vector[dim] < e[k], `${dim}=${got.vector[dim]}, esperado >= ${e[k]}`);
  }
  for (const [k, dim] of [['maxSecurity','security'],['maxData','data']]) {
    if (e[k] !== undefined) chk(got.vector[dim] > e[k], `${dim}=${got.vector[dim]}, esperado <= ${e[k]}`, 'LEVE');
  }
  if (e.requiresCodex !== undefined) chk(got.requiresCodex !== e.requiresCodex,
    `requiresCodex=${got.requiresCodex}, esperado ${e.requiresCodex}`, e.requiresCodex ? 'GRAVE' : 'LEVE');
  if (e.requiresUserDecision !== undefined) chk(got.requiresUserDecision !== e.requiresUserDecision,
    `requiresUserDecision=${got.requiresUserDecision}, esperado ${e.requiresUserDecision}`);
  if (e.requiresClarification !== undefined) chk(got.requiresClarification !== e.requiresClarification,
    `requiresClarification=${got.requiresClarification}, esperado ${e.requiresClarification}`);
  for (const s of e.expectedSpecialists || []) {
    chk(!got.specialists.includes(s), `especialista ausente: ${s}`, 'LEVE');
  }
  for (const s of e.forbiddenSpecialists || []) {
    chk(got.specialists.includes(s), `especialista indevido acionado: ${s}`);
  }

  if (problems.length === 0) { pass++; results.push({ id: c.id, status: 'PASS', level: got.level }); }
  else {
    if (severity === 'GRAVE') grave++; else leve++;
    results.push({ id: c.id, status: severity, level: got.level, problems, request: c.request });
  }
}

console.log('EOS Risk Classifier — verificacao contra oraculo externo\n');
for (const r of results) {
  const tag = r.status === 'PASS' ? 'PASS ' : r.status === 'GRAVE' ? 'GRAVE' : 'LEVE ';
  console.log(`  [${tag}] ${r.id}  -> ${r.level}`);
  for (const p of r.problems || []) console.log(`           ${p}`);
}
console.log(`\n  total=${fixtures.cases.length}  pass=${pass}  grave=${grave}  leve=${leve}`);
console.log(grave === 0 && leve === 0
  ? '\nRESULTADO: PASS — classificador confere com o oraculo em todos os casos.'
  : grave === 0
    ? '\nRESULTADO: PASS COM RESSALVA — apenas superclassificacao (falha leve).'
    : '\nRESULTADO: FAIL — ha subclassificacao. Corrigir antes de prosseguir.');

process.exit(grave === 0 && leve === 0 ? 0 : 1);
