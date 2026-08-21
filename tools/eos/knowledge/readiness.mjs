/**
 * EOS V2 — Decision Readiness Gate.  [correcao de F-006]
 *
 * F-006: o EOS sabia avaliar a mudanca tecnicamente, mas nao sabia verificar se
 * estava AUTORIZADO a executa-la pelas decisoes vigentes. No DOG-003 ele deu
 * `requiresUserDecision: false` para um candidato que depende de C1, adiada.
 *
 * SEPARACAO DE RESPONSABILIDADE — preservada de proposito:
 *   Risk Classifier -> "qual o risco tecnico desta mudanca?"
 *   Readiness Gate  -> "existe decisao suficiente para ela ser executavel?"
 *
 * O backlog NAO entra no Risk Classifier. Sao perguntas diferentes, respondidas
 * por componentes diferentes, e uma nao contamina a outra (DEC-11).
 *
 * POSICAO:
 *   Intent -> Decision Dependency Resolution -> READINESS GATE -> Risk
 *          -> Evidence -> Engineering
 *
 * O gate nao impede classificar risco (util para priorizacao). Impede o
 * Execution Graph quando a decisao necessaria nao esta pronta.
 */

/**
 * Estados de decisao. `ACTIVE` do indice legado mapeia para `APPROVED_FROZEN` —
 * reuso da taxonomia existente, sem duplicar (secao 5 do contrato).
 */
export const DECISION_STATUSES = [
  'APPROVED_FROZEN', 'PENDING', 'DEFERRED', 'SUPERSEDED', 'CONFLICTING', 'NOT_FOUND'
];

const LEGACY_STATUS = { ACTIVE: 'APPROVED_FROZEN', SUPERSEDED: 'SUPERSEDED' };
export const normalizeStatus = (d = {}) =>
  d.decisionStatus ?? LEGACY_STATUS[d.status] ?? 'NOT_FOUND';

/**
 * Requisito de decisao. Substitui o booleano `requiresUserDecision` como fonte
 * de verdade — o booleano passa a ser DERIVADO daqui.
 *
 * O booleano nao conseguia distinguir "nenhuma decisao necessaria" de "decisao
 * necessaria que ninguem registrou". Era essa indistincao que produzia F-006.
 */
export const DECISION_REQUIREMENTS = [
  'NONE', 'EXISTING_DECISION_APPLIES', 'PENDING_DECISION',
  'DEFERRED_DECISION', 'CONFLICTING_DECISIONS', 'MISSING_DECISION'
];

export const READINESS_STATES = [
  'READY', 'BLOCKED_BY_PENDING_DECISION', 'BLOCKED_BY_DEFERRED_DECISION',
  'BLOCKED_BY_CONFLICTING_DECISIONS', 'BLOCKED_BY_MISSING_DECISION',
  'BLOCKED_BY_INVALID_DECISION_REFERENCE'
];

/** Requisitos que exigem intervencao do usuario. Origem unica do booleano. */
const NEEDS_USER = new Set(['PENDING_DECISION', 'DEFERRED_DECISION',
                            'CONFLICTING_DECISIONS', 'MISSING_DECISION']);

/** Compatibilidade: o booleano antigo vira derivado, nunca fonte de verdade. */
export const deriveRequiresUserDecision = (requirement) => NEEDS_USER.has(requirement);

/**
 * Resolve as decisoes das quais a mudanca depende.
 * Segue `supersededBy` ate a vigente (DEC-05) e detecta conflito declarado.
 */
export function resolveDecisionDependencies(change = {}, index = []) {
  const byId = new Map(index.map((d) => [d.id, d]));
  const resolved = [];

  // Dependencia indeterminavel nao e "sem dependencia". EOS-P12.
  if (change.dependencyResolvable === false || change.dependsOn === null) {
    return { indeterminate: true, resolved: [],
             reason: 'dependencias de decisao nao puderam ser determinadas' };
  }

  for (const id of change.dependsOn || []) {
    let d = byId.get(id);
    if (!d) { resolved.push({ id, status: 'NOT_FOUND', effective: null }); continue; }

    // Segue a cadeia de substituicao ate a decisao vigente.
    const seen = new Set([d.id]);
    while (normalizeStatus(d) === 'SUPERSEDED' && d.supersededBy && !seen.has(d.supersededBy)) {
      seen.add(d.supersededBy);
      const next = byId.get(d.supersededBy);
      if (!next) break;
      d = next;
    }

    const conflicts = (change.dependsOn || [])
      .map((x) => byId.get(x))
      .filter((o) => o && o.id !== d.id &&
                     ((d.conflictsWith || []).includes(o.id) || (o.conflictsWith || []).includes(d.id)));

    resolved.push({
      id,
      effective: d.id,
      status: conflicts.length ? 'CONFLICTING' : normalizeStatus(d),
      kind: d.kind ?? null,
      deferredTo: d.deferredTo ?? null,
      sourceRef: d.sourceRef ?? null,
      conflictsWith: conflicts.map((c) => c.id),
      // Indice basta; corpo completo so sob demanda (DEC-14).
      fullRecordLoaded: false
    });
  }
  return { indeterminate: false, resolved };
}

/**
 * O gate. Retorna estado explicito — ausencia de informacao NUNCA vira READY.
 *
 * Readiness e DERIVADO do estado atual das decisoes, nunca gravado como verdade
 * permanente: quando a decisao muda, o resultado muda junto (DEC-10).
 */
export function decisionReadiness(change = {}, index = []) {
  const dep = resolveDecisionDependencies(change, index);

  if (dep.indeterminate) {
    return {
      readiness: 'BLOCKED_BY_INVALID_DECISION_REFERENCE',
      decisionRequirement: 'MISSING_DECISION',
      requiresUserDecision: true,
      executionAllowed: false,
      dependencies: [],
      reason: dep.reason,
      // Risco continua sendo assunto do Risk Classifier.
      riskLevel: change.riskLevel ?? null
    };
  }

  const st = (s) => dep.resolved.filter((r) => r.status === s);
  let requirement, readiness, reason;

  if (dep.resolved.length === 0) {
    requirement = 'NONE'; readiness = 'READY'; reason = 'nenhuma decisao necessaria';
  } else if (st('CONFLICTING').length) {
    requirement = 'CONFLICTING_DECISIONS'; readiness = 'BLOCKED_BY_CONFLICTING_DECISIONS';
    reason = `decisoes vigentes incompativeis: ${st('CONFLICTING').map((r) => r.effective).join(', ')}`;
  } else if (st('NOT_FOUND').length) {
    requirement = 'MISSING_DECISION'; readiness = 'BLOCKED_BY_MISSING_DECISION';
    reason = `decisao exigida e nao registrada: ${st('NOT_FOUND').map((r) => r.id).join(', ')}`;
  } else if (st('DEFERRED').length) {
    const d = st('DEFERRED')[0];
    requirement = 'DEFERRED_DECISION'; readiness = 'BLOCKED_BY_DEFERRED_DECISION';
    reason = `decisao '${d.effective}' adiada${d.deferredTo ? ` para ${d.deferredTo}` : ''}`;
  } else if (st('PENDING').length) {
    requirement = 'PENDING_DECISION'; readiness = 'BLOCKED_BY_PENDING_DECISION';
    reason = `decisao pendente: ${st('PENDING').map((r) => r.effective).join(', ')}`;
  } else {
    requirement = 'EXISTING_DECISION_APPLIES'; readiness = 'READY';
    reason = `decisao vigente aplica: ${dep.resolved.map((r) => r.effective).join(', ')}`;
  }

  const productPending = dep.resolved.some((r) => r.kind === 'product' && r.status !== 'APPROVED_FROZEN');

  return {
    readiness,
    decisionRequirement: requirement,
    requiresUserDecision: deriveRequiresUserDecision(requirement),
    // O gate bloqueia o Execution Graph, nao a classificacao de risco.
    executionAllowed: readiness === 'READY',
    riskLevel: change.riskLevel ?? null,
    dependencies: dep.resolved,
    effectiveDecision: dep.resolved[0]?.effective ?? null,
    // Decisao de produto vai ao gate do usuario — nao e defeito de engenharia.
    findingCategory: productPending ? 'PRODUCT_DECISION_REQUIRED' : null,
    routesTo: productPending ? 'userDecisionGate' : null,
    reAsksUser: false,
    fullRecordLoaded: false,
    reason
  };
}

/** Registro compacto de dependencia, reavaliavel quando a decisao mudar. */
export function decisionDependencyRecord(change, index, verifiedAt = new Date().toISOString()) {
  const r = decisionReadiness(change, index);
  return r.dependencies.map((d) => ({
    changeId: change.changeId,
    decisionId: d.id,
    dependencyType: d.kind ?? 'technical',
    status: d.status,
    source: d.sourceRef,
    effectiveDecision: d.effective,
    blocking: r.readiness !== 'READY',
    reason: r.reason,
    lastVerified: verifiedAt
  }));
}
