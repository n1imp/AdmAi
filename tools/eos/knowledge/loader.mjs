/**
 * EOS V2 — Knowledge Loader (context slicing).
 *
 * O agente NAO recebe o Knowledge System inteiro. Recebe a fatia relevante
 * para a tarefa, as superficies, o Risk Vector e o Engineer.
 *
 * Isto nao e refinamento: e o mecanismo que impede o Knowledge System de virar
 * o proprio problema que veio resolver. Um registro que cresce e sempre
 * carregado inteiro consome mais contexto do que economiza.
 */

import {
  DECISION_INDEX, INVARIANTS, DEPENDENCY_GRAPH, IMPACT_GRAPH,
  ARCHITECTURE_MAP, TEST_REGISTRY, RESEARCH_CACHE, KNOWN_RISKS
} from './registries.mjs';

const bytes = (o) => Buffer.byteLength(JSON.stringify(o), 'utf8');

/** Tamanho do registro completo — a linha de base contra a qual a fatia e medida. */
export function fullSize() {
  return bytes({ DECISION_INDEX, INVARIANTS, DEPENDENCY_GRAPH, IMPACT_GRAPH,
                 ARCHITECTURE_MAP, TEST_REGISTRY, RESEARCH_CACHE, KNOWN_RISKS });
}

/**
 * @param {object} q
 *   q.level      — L0..L3
 *   q.surfaces   — ['backend','frontend',...]
 *   q.signals    — nomes de sinal detectados pelo classificador
 *   q.engineer   — id do Engineer que vai consumir
 */
export function slice(q = {}) {
  const level = q.level || 'L1';
  const surfaces = q.surfaces || [];
  const signals = q.signals || [];
  const inScope = (scopes) => !scopes || scopes.length === 0 || scopes.some((s) => surfaces.includes(s));

  // L0: profundidade minima. So o que vale sempre, em qualquer tarefa.
  if (level === 'L0') {
    return finish({
      level,
      decisions: [],
      invariants: INVARIANTS.filter((i) => i.alwaysApplicable),
      dependencyGraph: [],
      impactGraph: [],
      architectureMap: null,
      tests: TEST_REGISTRY.filter((t) => t.gate === 'always' && inScope([t.module === 'chaveiro-bot' ? 'backend' : 'frontend'])),
      research: [],
      risks: []
    });
  }

  const invariants = INVARIANTS.filter((i) =>
    i.alwaysApplicable ||
    (inScope(i.scope) && (i.applicabilitySignals.length === 0 || i.applicabilitySignals.some((s) => signals.includes(s))))
  );

  // Finding F-001 (dogfooding EOS-sobre-EOS): a versao anterior deixava passar
  // TODA decisao de escopo nao-eos, independentemente da superficie. Uma tarefa
  // L1 de frontend recebia DEC-ADM-002 (gate de staging), irrelevante para ela.
  // Agora o escopo da decisao precisa intersectar a superficie da tarefa.
  const SCOPE_SURFACES = {
    eos: ['eos'],
    tools: ['eos', 'backend', 'frontend', 'data', 'mobile', 'infra'],
    admai: ['backend', 'frontend', 'data', 'mobile'],
    infra: ['infra']
  };
  const decisions = DECISION_INDEX.filter((d) => {
    if (d.status !== 'ACTIVE') return false;
    const allowed = SCOPE_SURFACES[d.scope];
    if (!allowed) return true;                        // escopo desconhecido: nao podar
    // Decisao de ambiente/promocao so entra quando a tarefa toca ambiente.
    if (d.scope === 'admai' && !surfaces.some((s) => allowed.includes(s))) return false;
    return surfaces.some((s) => allowed.includes(s));
  });

  const impactGraph = level === 'L0' || level === 'L1'
    ? []
    : IMPACT_GRAPH.filter((e) => surfaces.some((s) => e.source.includes(s) || e.target.includes(s)) || e.confidence === 'HIGH');

  const tests = TEST_REGISTRY.filter((t) => {
    if (t.gate === 'always') return true;
    if (t.gate === 'securityChange') return signals.some((s) => ['rbac', 'authn', 'tenant', 'secret'].includes(s));
    if (t.gate === 'schemaChange') return signals.some((s) => ['schema', 'migration'].includes(s));
    if (t.gate === 'crossSurface') return surfaces.length >= 2;
    if (t.gate === 'eosChange') return surfaces.includes('eos');
    return false;
  });

  return finish({
    level,
    decisions,
    invariants,
    dependencyGraph: level === 'L3' ? DEPENDENCY_GRAPH : [],
    impactGraph,
    architectureMap: (level === 'L3' || level === 'L2') ? ARCHITECTURE_MAP : null,
    tests,
    research: RESEARCH_CACHE.filter((r) => inScope(r.scope)),
    risks: KNOWN_RISKS.filter((r) => r.status === 'OPEN' && (surfaces.includes(r.surface) || r.severity === 'HIGH'))
  });
}

function finish(s) {
  const size = bytes(s);
  const full = fullSize();
  return {
    ...s,
    _meta: {
      bytes: size,
      fullRegistryBytes: full,
      fraction: +(size / full).toFixed(3),
      // Regra do subsistema: a fatia so vale se for menor que o todo.
      slicingEffective: size < full
    }
  };
}

/** Carrega o registro completo de uma decisao — sob demanda, nunca por padrao. */
export function expandDecision(id) {
  const d = DECISION_INDEX.find((x) => x.id === id);
  if (!d) return null;
  return { ...d, note: `corpo completo em ${d.sourceRef}` };
}
