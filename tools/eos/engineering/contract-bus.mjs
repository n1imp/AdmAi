/**
 * EOS V2 — Contract Bus.
 *
 * Comunicacao entre Engineers com campos fixos, nao conversa contínua.
 * A razao e concreta: conversa longa custa contexto e nao deixa rastro
 * auditavel. Um contrato tem campos, estado e evidencia.
 *
 * REGRA ANTI-PING-PONG: a discordancia tem numero maximo de rodadas. Depois
 * dele, escala — estrutural vai ao Architecture Guardian, o resto a Integration.
 */

export const CONTRACT_STATES = ['OPEN', 'ACCEPTED', 'REJECTED', 'NEEDS_DECISION', 'FULFILLED'];

export const REQ_FIELDS = ['contractId', 'run', 'from', 'to', 'slice', 'need', 'reason',
                           'input', 'expectedOutput', 'blocking', 'breakingChangeAllowed', 'evidenceRef'];
export const RES_FIELDS = ['contractId', 'status', 'providedContract', 'breakingImpact',
                           'dependencies', 'consumerNotes', 'evidenceRef'];

export const MAX_ROUNDS = 2;

export function validateRequest(req) {
  const errs = [];
  for (const f of REQ_FIELDS) if (!(f in req)) errs.push(`CONTRACT_REQ sem campo: ${f}`);
  if (req.from === req.to) errs.push('CONTRACT_REQ de um Engineer para ele mesmo');
  return errs;
}

export function validateResponse(res) {
  const errs = [];
  for (const f of RES_FIELDS) if (!(f in res)) errs.push(`CONTRACT_RES sem campo: ${f}`);
  if (!CONTRACT_STATES.includes(res.status)) errs.push(`status invalido: ${res.status}`);
  if (res.status === 'ACCEPTED' && !res.evidenceRef) {
    errs.push('ACCEPTED sem referencia de evidencia');
  }
  if (res.breakingImpact === true && res.status === 'ACCEPTED' && !res.consumerNotes) {
    errs.push('mudanca breaking aceita sem nota para os consumidores');
  }
  return errs;
}

/**
 * Escalada de conflito. Nao existe "continuar discutindo".
 *
 *   estrutural  -> Architecture Guardian
 *   funcional   -> usuario (decisao de produto nao e tecnica)
 *   demais      -> Integration Engineer
 */
export function escalateConflict({ from, to, rounds, structural = false, productDecision = false }) {
  if (rounds <= MAX_ROUNDS && !structural && !productDecision) {
    return { escalatesTo: null, action: 'CONTINUE', roundsRemaining: MAX_ROUNDS - rounds };
  }
  if (productDecision) {
    return { escalatesTo: 'userDecisionGate', action: 'ESCALATE',
             reason: 'decisao funcional nao se resolve entre Engineers' };
  }
  if (structural) {
    return { escalatesTo: 'architectureGuardian', action: 'ESCALATE',
             reason: 'conflito estrutural: fronteira ou direcao de dependencia' };
  }
  return { escalatesTo: 'integration', action: 'ESCALATE',
           reason: `limite de ${MAX_ROUNDS} rodadas atingido entre '${from}' e '${to}'` };
}

/* ------------------------------------------------------------------ *
 * Freeze, drift e breaking change.  [DOG-003]
 *
 * O Contract Bus so vale se conseguir provar tres coisas:
 *   1. Producer e Consumer implementaram contra o MESMO contrato;
 *   2. remocao/alteracao incompativel nao passa em silencio;
 *   3. quem coordena o contrato nao certifica o resultado.
 * ------------------------------------------------------------------ */

import { createHash } from 'node:crypto';

/**
 * Fingerprint do contrato — o "freeze" da secao 16.
 * Normaliza a ordem das chaves para que o mesmo contrato produza sempre o mesmo
 * hash, independentemente de como foi escrito.
 */
export function contractFingerprint(contract = {}) {
  const norm = (o) => {
    if (Array.isArray(o)) return o.map(norm).sort();
    if (o && typeof o === 'object') {
      return Object.keys(o).sort().reduce((a, k) => { a[k] = norm(o[k]); return a; }, {});
    }
    return o;
  };
  return createHash('sha256').update(JSON.stringify(norm(contract))).digest('hex').slice(0, 16);
}

/**
 * Deteccao de breaking change (secao 17).
 * Campo removido, tipo alterado, enum reduzido, status code removido e campo
 * obrigatorio adicionado sao todos incompativeis para o consumidor existente.
 */
export function detectBreakingChange(previous = {}, next = {}, { breakingChangeAllowed = false } = {}) {
  const reasons = [];
  const pf = previous.fields || {}, nf = next.fields || {};

  for (const [k, t] of Object.entries(pf)) {
    if (!(k in nf)) reasons.push(`campo removido: '${k}'`);
    else if (nf[k] !== t) reasons.push(`tipo alterado em '${k}': ${t} -> ${nf[k]}`);
  }
  for (const [k] of Object.entries(nf)) {
    if (!(k in pf) && (next.required || []).includes(k)) reasons.push(`campo obrigatorio adicionado: '${k}'`);
  }
  for (const sc of previous.statusCodes || []) {
    if (!(next.statusCodes || []).includes(sc)) reasons.push(`status code removido: ${sc}`);
  }
  for (const [k, vals] of Object.entries(previous.enums || {})) {
    const now = (next.enums || {})[k] || [];
    for (const v of vals) if (!now.includes(v)) reasons.push(`valor de enum removido em '${k}': ${v}`);
  }

  const breaking = reasons.length > 0;
  return {
    breaking,
    reasons,
    code: breaking && !breakingChangeAllowed ? 'CONTRACT_BREAKING_CHANGE' : null,
    gate: breaking && !breakingChangeAllowed ? 'BLOCKED' : 'OK'
  };
}

/**
 * Drift: os dois lados implementaram contra contratos diferentes.
 * Nao e divergencia de opiniao — e divergencia de FATO, e bloqueia Verification.
 */
export function detectContractDrift({ producer, consumer }) {
  const pf = contractFingerprint(producer?.contract);
  const cf = contractFingerprint(consumer?.contract);
  const drift = pf !== cf;
  return {
    drift,
    producerFingerprint: pf,
    consumerFingerprint: cf,
    code: drift ? 'CONTRACT_DRIFT' : null,
    findingOwner: drift ? 'integration' : null,
    blocksVerification: drift,
    reason: drift
      ? `'${producer?.side}' implementou ${pf} e '${consumer?.side}' implementou ${cf}`
      : null
  };
}

/** Aceite do consumidor (secao 19): confirmacao estrutural, nao aprovacao humana. */
export function checkConsumerAcceptance({ contractId, producerFrozen, consumerAccepted }) {
  if (!producerFrozen) return { gate: 'BLOCKED', reason: `contrato '${contractId}' nao foi congelado pelo producer` };
  if (!consumerAccepted) return { gate: 'BLOCKED', reason: `contrato '${contractId}' sem aceite (CONTRACT_ACCEPTED) do consumidor` };
  return { gate: 'OK', status: 'CONTRACT_ACCEPTED' };
}

/** Requests que nao mudaram entendimento nem execucao sao overhead (secao 21). */
export function findRedundantRequests(requests = []) {
  const redundant = requests.filter((r) => r.changedUnderstanding === false).map((r) => r.id);
  return { redundant, redundantCount: redundant.length,
           precision: requests.length ? +((requests.length - redundant.length) / requests.length).toFixed(2) : 1 };
}

/**
 * Limites do Contract Owner. Ele coordena o contrato; nao escreve os dois lados
 * e nao certifica o resultado.
 */
export function checkContractOwnerAction({ actor, action, sides = [] }) {
  if (actor !== 'integration') return { allowed: true };
  if (action === 'implementBothSides' || sides.length > 1) {
    return { allowed: false, code: 'OWNERSHIP_VIOLATION',
             reason: 'Contract Owner coordena o contrato; cada lado tem seu proprio Primary Owner' };
  }
  if (action === 'certifyFeature' || action === 'declareFinalPassFail') {
    return { allowed: false, code: 'SELF_CERTIFICATION_VIOLATION',
             reason: 'quem coordena o contrato nao certifica o resultado' };
  }
  return { allowed: true };
}

/** Registro de resolucao — a decisao fica rastreavel, nao so aplicada. */
export function recordResolution({ contractId, escalatedTo, decision, rationale, evidenceRef }) {
  return {
    contractId, escalatedTo, decision, rationale, evidenceRef,
    recordedAt: new Date().toISOString(),
    binding: true
  };
}
