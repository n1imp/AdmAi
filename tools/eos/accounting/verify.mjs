/**
 * EOS V2 — verificacao do Resource Accounting (RES-01..15).
 * Confronta measure.mjs/run.mjs com fixtures.json, escrito antes.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metric, toolOutputRef, advisoryTarget } from './measure.mjs';
import { accountTools, accountContext, accountEvidence, accountAgents,
         accountProvider, detectAnomalies, accountingCompleteness,
         buildRunAccounting } from './run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'fixtures.json'), 'utf8'));

let fail = 0, pass = 0;
console.log('EOS Resource Accounting — verificacao\n');

for (const c of fx.cases) {
  const e = c.expect;
  const p = [];

  if (c.metric) {
    const r = metric(c.metric);
    if (e.status && r.status !== e.status) p.push(`status='${r.status}', esperado '${e.status}'`);
    if (e.notStatus && r.status === e.notStatus) p.push(`status proibido '${e.notStatus}'`);
    if (e.value !== undefined && r.value !== e.value) p.push(`value=${r.value}, esperado ${e.value}`);
    if (e.valueIsNull && r.value !== null) p.push(`value=${r.value}, esperado null`);
    if (e.notValue !== undefined && r.value === e.notValue) {
      p.push(`value=${r.value} — ausencia virou valor medido`);
    }
    if (e.hasMethod && !r.method) p.push('estimativa sem metodo declarado');
  } else if (c.toolCalls) {
    const r = accountTools(c.toolCalls);
    for (const [t, n] of Object.entries(e.toolCount || {})) {
      if (r.count[t] !== n) p.push(`${t}: ${r.count[t]} chamadas, esperado ${n}`);
    }
    if (e.retries !== undefined && r.retries !== e.retries) p.push(`retries=${r.retries}, esperado ${e.retries}`);
    if (e.failures !== undefined && r.failures !== e.failures) p.push(`failures=${r.failures}, esperado ${e.failures}`);
  } else if (c.context) {
    const r = accountContext(c.context);
    if (e.sliceRatio !== undefined && Math.abs(r.sliceRatio - e.sliceRatio) > 0.001) {
      p.push(`sliceRatio=${r.sliceRatio}, esperado ${e.sliceRatio}`);
    }
  } else if (c.evidence) {
    const r = accountEvidence(c.evidence);
    if (e.reuseRate !== undefined && Math.abs(r.reuseRate - e.reuseRate) > 0.01) {
      p.push(`reuseRate=${r.reuseRate}, esperado ${e.reuseRate}`);
    }
    if (e.tokenSavingsStatus && r.tokenSavings.status !== e.tokenSavingsStatus) {
      p.push(`tokenSavings='${r.tokenSavings.status}', esperado '${e.tokenSavingsStatus}'`);
    }
    if (e.anomaly) {
      const a = detectAnomalies({ evidence: c.evidence });
      if (a.anomaly !== e.anomaly) p.push(`anomaly='${a.anomaly}', esperado '${e.anomaly}'`);
      if (e.anomalyKindContains && !a.kinds.join(' ').includes(e.anomalyKindContains)) {
        p.push(`anomalia nao menciona '${e.anomalyKindContains}': ${a.kinds.join('; ')}`);
      }
    }
  } else if (c.agents) {
    const r = accountAgents(c.agents, c.totalTokens);
    if (e.attribution && r.attribution !== e.attribution) p.push(`attribution='${r.attribution}'`);
    if (e.noProration && !r.noProration) p.push('total foi rateado entre agentes');
    for (const a of r.agents) if (a.tokens.value !== null) p.push(`${a.id} recebeu token rateado`);
  } else if (c.provider) {
    const r = accountProvider(c.provider);
    if (e.callsStatus && r.calls.status !== e.callsStatus) p.push(`calls='${r.calls.status}'`);
    if (e.creditsStatus && r.credits.status !== e.creditsStatus) p.push(`credits='${r.credits.status}'`);
    if (e.notCredits !== undefined && r.credits.value === e.notCredits) {
      p.push(`credits=${r.credits.value} — ausencia virou zero`);
    }
  } else if (c.toolOutput) {
    const r = toolOutputRef(c.toolOutput.tool, c.toolOutput.raw);
    const leaked = JSON.stringify(r).includes('ghp_AAAABBBB');
    if (leaked) p.push('SEGREDO vazou para o registro de accounting');
    if (e.hasHash && !r.hash) p.push('sem hash');
    if (e.hasByteCount && typeof r.bytes !== 'number') p.push('sem contagem de bytes');
  } else if (c.budget) {
    const r = advisoryTarget(c.budget);
    if (e.kind && r.kind !== e.kind) p.push(`kind='${r.kind}'`);
    if (e.blocks !== undefined && r.blocks !== e.blocks) p.push(`blocks=${r.blocks} — alvo consultivo nao bloqueia`);
    if (e.exceeded !== undefined && r.exceeded !== e.exceeded) p.push(`exceeded=${r.exceeded}`);
  } else if (c.run) {
    if (e.completeness) {
      const comp = accountingCompleteness(c.run);
      if (comp !== e.completeness) p.push(`completeness='${comp}', esperado '${e.completeness}'`);
      if (e.notCompleteness && comp === e.notCompleteness) p.push(`completeness proibido '${e.notCompleteness}'`);
    } else {
      const r = buildRunAccounting({ eosRun: 'X', outcome: c.run.outcome });
      if (e.recordProduced && !r.eosRun) p.push('registro nao produzido');
      if (e.outcome && r.outcome !== e.outcome) p.push(`outcome='${r.outcome}'`);
    }
  }

  if (p.length === 0) { pass++; console.log(`  [PASS] ${c.id}  ${c.title}`.slice(0, 118)); }
  else { fail++; console.log(`  [FAIL] ${c.id}  ${c.title}`.slice(0, 118)); p.forEach((x) => console.log(`         ${x}`)); }
}

const neg = fx.cases.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${fx.cases.length}  (negativos=${neg})  pass=${pass}  fail=${fail}`);
console.log(fail === 0
  ? '\nRESULTADO: PASS — ausencia de dado nunca vira zero, nem estimativa vira medida.'
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
