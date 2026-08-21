/**
 * EOS V2 — verificacao do Decision Readiness Gate (F-006).
 * Confronta readiness.mjs com decision-fixtures.json, escrito antes.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionReadiness } from './readiness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'decision-fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Decision Readiness Gate — verificacao (F-006)\n');

for (const c of fx.cases) {
  const e = c.expect;
  const p = [];

  if (c.pair) {
    const rs = c.pair.map((x) => decisionReadiness(x.input, x.decisions));
    c.pair.forEach((x, i) => {
      if (rs[i].readiness !== x.expectReadiness) {
        p.push(`par[${i}]: readiness='${rs[i].readiness}', esperado '${x.expectReadiness}'`);
      }
    });
    if (e.oppositeEffect && rs[0].readiness === rs[1].readiness) {
      p.push('APPROVED_FROZEN e DEFERRED produziram o MESMO efeito — sao opostos');
    }
    if (e.recalculated && rs[0].readiness === rs[1].readiness) {
      p.push('mudanca de estado da decisao nao recalculou readiness');
    }
  } else {
    const r = decisionReadiness(c.input, c.decisions || []);
    if (e.readiness && r.readiness !== e.readiness) p.push(`readiness='${r.readiness}', esperado '${e.readiness}'`);
    if (e.notReadiness && r.readiness === e.notReadiness) p.push(`readiness proibido '${e.notReadiness}' atribuido`);
    if (e.decisionRequirement && r.decisionRequirement !== e.decisionRequirement) {
      p.push(`decisionRequirement='${r.decisionRequirement}', esperado '${e.decisionRequirement}'`);
    }
    if (e.requiresUserDecision !== undefined && r.requiresUserDecision !== e.requiresUserDecision) {
      p.push(`requiresUserDecision=${r.requiresUserDecision}, esperado ${e.requiresUserDecision}`);
    }
    if (e.effectiveDecision && r.effectiveDecision !== e.effectiveDecision) {
      p.push(`effectiveDecision='${r.effectiveDecision}', esperado '${e.effectiveDecision}'`);
    }
    if (e.reasonContains && !(r.reason || '').includes(e.reasonContains)) {
      p.push(`motivo nao menciona '${e.reasonContains}': ${r.reason}`);
    }
    if (e.riskLevelPreserved && r.riskLevel !== e.riskLevelPreserved) {
      p.push(`riskLevel='${r.riskLevel}', esperado '${e.riskLevelPreserved}' — readiness nao pode alterar risco`);
    }
    if (e.executionAllowed !== undefined && r.executionAllowed !== e.executionAllowed) {
      p.push(`executionAllowed=${r.executionAllowed}, esperado ${e.executionAllowed}`);
    }
    if (e.findingCategory && r.findingCategory !== e.findingCategory) {
      p.push(`findingCategory='${r.findingCategory}', esperado '${e.findingCategory}'`);
    }
    if (e.notFindingCategory && r.findingCategory === e.notFindingCategory) {
      p.push(`categoria indevida '${e.notFindingCategory}'`);
    }
    if (e.routesTo && r.routesTo !== e.routesTo) p.push(`routesTo='${r.routesTo}', esperado '${e.routesTo}'`);
    if (e.reAsksUser !== undefined && r.reAsksUser !== e.reAsksUser) p.push(`reAsksUser=${r.reAsksUser}`);
    if (e.fullRecordLoaded !== undefined && r.fullRecordLoaded !== e.fullRecordLoaded) {
      p.push(`fullRecordLoaded=${r.fullRecordLoaded}, esperado ${e.fullRecordLoaded}`);
    }
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 118)); }
  else { fail++; console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 118)); p.forEach((x) => console.log(`         ${x}`)); }
}

const neg = fx.cases.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${fx.cases.length}  (negativos=${neg})  pass=${pass}  fail=${fail}`);
console.log(fail === 0
  ? '\nRESULTADO: PASS — decisao adiada bloqueia execucao sem alterar o risco.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
