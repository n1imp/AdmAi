/**
 * EOS V2 — Resource Accounting: registro agregador por Run.
 *
 * Complementa o TOOL_COST_REGISTRY sem duplica-lo (secao 36):
 *   Tool Cost Registry -> caracteristicas CONHECIDAS da ferramenta
 *   Resource Accounting -> consumo OBSERVADO numa execucao real
 */

import { metric, unavailable, measured, toolOutputRef, advisoryTarget } from './measure.mjs';

export const OUTCOMES = ['BLOCKED', 'FAIL', 'LOCAL_VERIFIED', 'STAGING_VERIFIED', 'PRODUCTION_VERIFIED'];

/** Contabiliza chamadas de ferramenta, com retry e falha separados da contagem. */
export function accountTools(calls = []) {
  const byTool = {};
  let retries = 0, failures = 0;
  for (const c of calls) {
    const t = (byTool[c.tool] ||= { tool: c.tool, calls: 0, ok: 0, failed: 0, retries: 0, bytes: 0 });
    t.calls++;
    if (c.ok) t.ok++; else { t.failed++; failures++; }
    if (c.retry) { t.retries++; retries++; }
    if (typeof c.bytes === 'number') t.bytes += c.bytes;
  }
  return { byTool, totalCalls: calls.length, retries, failures,
           count: Object.fromEntries(Object.entries(byTool).map(([k, v]) => [k, v.calls])) };
}

/** Contexto: bytes e razao da fatia. */
export function accountContext({ knowledgeTotalBytes, knowledgeSliceBytes, ...rest } = {}) {
  const ratio = knowledgeTotalBytes ? +(knowledgeSliceBytes / knowledgeTotalBytes).toFixed(3) : null;
  return {
    knowledgeTotalBytes: metric({ name: 'knowledgeTotalBytes', value: knowledgeTotalBytes, observed: knowledgeTotalBytes != null }),
    knowledgeSliceBytes: metric({ name: 'knowledgeSliceBytes', value: knowledgeSliceBytes, observed: knowledgeSliceBytes != null }),
    sliceRatio: ratio,
    ...rest
  };
}

/**
 * Evidencia. `tokenSavings` fica UNAVAILABLE de proposito: reuso reduz trabalho,
 * mas sem contagem de token nao se sabe QUANTO — e inventar seria o erro que a
 * secao 28 proibe.
 */
export function accountEvidence({ packsCreated = 0, reusedReferences = 0, repeatedSearches = 0 } = {}) {
  const total = packsCreated + reusedReferences;
  return {
    packsCreated: measured('packsCreated', packsCreated),
    reusedReferences: measured('reusedReferences', reusedReferences),
    repeatedSearches: measured('repeatedSearches', repeatedSearches),
    reuseRate: total ? +(reusedReferences / total).toFixed(2) : 0,
    tokenSavings: unavailable('tokenSavings', 'sem contagem de token nao se mede economia')
  };
}

/** Tokens nao atribuiveis por agente nao sao rateados (secao 24). */
export function accountAgents(agents = [], totalTokens = null) {
  const attribution = totalTokens == null ? 'TOKEN_ATTRIBUTION_UNAVAILABLE' : 'ATTRIBUTED';
  return {
    attribution,
    noProration: attribution === 'TOKEN_ATTRIBUTION_UNAVAILABLE',
    agents: agents.map((a) => ({
      ...a,
      tokens: totalTokens == null
        ? unavailable('tokens', 'runtime nao expoe atribuicao por agente')
        : measured('tokens', a.tokens)
    }))
  };
}

/** Provedor: chamadas podem ser medidas mesmo quando credito nao e exposto. */
export function accountProvider({ id, calls, creditsObserved, credits, costObserved, cost } = {}) {
  return {
    id,
    calls: metric({ name: 'calls', value: calls, observed: calls != null }),
    credits: creditsObserved
      ? measured('credits', credits)
      : unavailable('credits', `${id} nao expoe creditos`),
    monetaryCost: costObserved
      ? measured('monetaryCost', cost)
      : unavailable('monetaryCost', `${id} nao expoe custo monetario`),
    note: 'creditos NUNCA sao derivados de tokens'
  };
}

/** Anomalias: sinalizam, nunca bloqueiam (secao 33). */
export function detectAnomalies({ context = {}, evidence = {}, tools = {}, verification = {} } = {}) {
  const found = [];
  if (context.sliceRatio != null && context.level && ['L0', 'L1'].includes(context.level) && context.sliceRatio > 0.8) {
    found.push(`fatia de ${context.level} carregou ${(context.sliceRatio * 100).toFixed(0)}% do Knowledge`);
  }
  if ((evidence.repeatedSearches?.value ?? evidence.repeatedSearches ?? 0) > 0) {
    found.push(`pesquisa repetida: ${evidence.repeatedSearches?.value ?? evidence.repeatedSearches}`);
  }
  if ((tools.retries ?? 0) >= 3) found.push(`retry loop de ferramenta: ${tools.retries}`);
  if (verification.runsWithoutNewFinding >= 2) found.push('verificacao repetida sem Finding novo');
  if (verification.specialistsWithoutOutput > 0) found.push('especialista acionado sem output material');
  return found.length ? { anomaly: 'RESOURCE_ANOMALY', kinds: found, blocks: false } : { anomaly: null, blocks: false };
}

/**
 * Completude: reflete o que foi observavel. Com token ausente NUNCA e COMPLETE —
 * chamar de completo um registro com lacuna conhecida seria arredondar.
 */
export function accountingCompleteness({ contextObserved, toolsObserved, tokensObserved }) {
  if (contextObserved && toolsObserved && tokensObserved) return 'COMPLETE';
  if (contextObserved || toolsObserved) return 'PARTIAL';
  return 'MINIMAL';
}

/** Registro agregador do Run. */
export function buildRunAccounting(input = {}) {
  const tools = accountTools(input.toolCalls || []);
  const context = accountContext(input.context || {});
  const evidence = accountEvidence(input.evidence || {});
  const agents = accountAgents(input.agents || [], input.totalTokens ?? null);

  return {
    eosRun: input.eosRun,
    changeId: input.changeId ?? null,
    level: input.level ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
    environments: input.environments ?? ['local'],
    outcome: input.outcome ?? null,
    gateOutcome: input.gateOutcome ?? null,
    context, tools, evidence, agents,
    providers: (input.providers || []).map(accountProvider),
    tokens: {
      input: unavailable('inputTokens', 'runtime nao expoe contagem'),
      output: unavailable('outputTokens', 'runtime nao expoe contagem'),
      cacheRead: unavailable('cacheReadTokens', 'runtime nao expoe contagem'),
      cacheWrite: unavailable('cacheWriteTokens', 'runtime nao expoe contagem')
    },
    verification: input.verification ?? {},
    findings: input.findings ?? [],
    corrections: input.corrections ?? [],
    contracts: input.contracts ?? { requests: 0, responses: 0, rounds: 0, drift: 0, breaking: 0 },
    toolOutputs: (input.toolOutputs || []).map((o) => toolOutputRef(o.tool, o.raw)),
    budgets: (input.budgets || []).map(advisoryTarget),
    anomalies: detectAnomalies({ context: { ...context, level: input.level }, evidence, tools,
                                verification: input.verification || {} }),
    completeness: accountingCompleteness({
      contextObserved: input.context != null,
      toolsObserved: (input.toolCalls || []).length > 0,
      tokensObserved: input.totalTokens != null
    })
  };
}

/**
 * Dados retroativos (secao 39): SOMENTE o que foi realmente medido em DOG-001 e
 * DOG-002. Nenhum token reconstruido — nao havia fonte entao e nao ha agora.
 */
export const RETROACTIVE = [
  { eosRun: 'EOS-RUN-20260808T030320Z', changeId: 'DOG-001', level: 'L2',
    knowledgeSliceBytes: 3465, knowledgeTotalBytes: 9125,
    engineers: ['security', 'backend'], tools: ['grep', 'read', 'semgrep', 'vitest'],
    findings: ['F-DOG-001'], outcome: 'LOCAL_VERIFIED',
    completeness: 'RETROACTIVE_PARTIAL', tokens: 'UNAVAILABLE' },
  { eosRun: 'EOS-RUN-20260808T030320Z', changeId: 'DOG-002', level: 'L1',
    knowledgeSliceBytes: 1582, knowledgeTotalBytes: 9125,
    engineers: ['frontend'], tools: ['grep', 'read', 'vitest', 'eslint', 'prettier'],
    findings: ['F-DOG-002'], outcome: 'LOCAL_VERIFIED',
    completeness: 'RETROACTIVE_PARTIAL', tokens: 'UNAVAILABLE' }
];
