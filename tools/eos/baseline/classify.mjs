/**
 * EOS V2 — Baseline-Aware Verification.
 *
 * Responde uma pergunta e apenas uma: ESTA MUDANCA introduziu regressao?
 *
 * NAO existe para ignorar divida. Uma falha preexistente pode ser critica e
 * continuar bloqueando (BASE-10). O que a classificacao de baseline descreve e
 * a relacao TEMPORAL/CAUSAL com a mudanca — nao a gravidade nem a natureza do
 * defeito, que continuam sendo FindingCategory e severity.
 *
 * REGRA QUE ORIGINOU ESTE MODULO: no DOG-002 uma falha foi declarada
 * "preexistente" com base em passar isolada e nao ter acoplamento. Nenhuma das
 * duas coisas prova preexistencia — so baseline prova. Ver BASE-NEG-01.
 */

import { fingerprint, sameTestDifferentFailure } from './fingerprint.mjs';

export const CLASSIFICATIONS = [
  'NEW_FAILURE', 'REGRESSION', 'PRE_EXISTING_FAILURE',
  'FLAKY_FAILURE', 'ENVIRONMENT_FAILURE', 'UNRELATED_FAILURE'
];

export const GATE_MODES = [
  'STRICT_GREEN_PASS', 'BASELINE_EQUIVALENT_PASS',
  'LOCAL_GATE_BLOCKED', 'REQUIRES_RECLASSIFICATION'
];

export const VERIFICATION_HEALTH = [
  'HEALTHY', 'DEGRADED_BY_KNOWN_BASELINE_FINDINGS', 'UNRELIABLE', 'BLOCKED'
];

const HIGH_SEVERITY = new Set(['CRITICAL', 'HIGH']);

/** Baseline so e suficiente se foi REGISTRADO. Ausencia nao e evidencia. */
export function baselineSufficient(baseline) {
  return Boolean(baseline && baseline.recorded === true && Array.isArray(baseline.failures));
}

/**
 * Classifica UMA falha. A ordem das regras importa e e deliberada:
 * evidencia de ambiente e de flakiness vem antes da comparacao com baseline,
 * porque descrevem por que o resultado nao e estavel — nao quando surgiu.
 */
export function classifyFailure(failure, baseline, opts = {}) {
  const fp = fingerprint(failure);

  // 1. Ambiente: precisa de evidencia explicita, nao de suposicao.
  if (failure.environmentEvidence?.evidenceRef) {
    return { classification: 'ENVIRONMENT_FAILURE', fingerprint: fp,
             reason: 'evidencia de ambiente anexada' };
  }

  // 2. Flakiness: exige observacoes que variem sob o MESMO codigo.
  const obs = failure.observations || [];
  if (obs.length >= 3 && obs.includes('PASS') && obs.includes('FAIL')) {
    return { classification: 'FLAKY_FAILURE', fingerprint: fp,
             reason: `resultado alterna sob o mesmo codigo: ${obs.join(',')}` };
  }

  // 3. Sem baseline nao existe afirmacao de preexistencia. Ponto.
  if (!baselineSufficient(baseline)) {
    return { classification: 'NEW_FAILURE', fingerprint: fp,
             reason: 'baseline ausente ou insuficiente: preexistencia nao pode ser afirmada',
             baselineMissing: true };
  }

  const match = baseline.failures.find((b) => fingerprint(b).id === fp.id);
  if (match) {
    return { classification: 'PRE_EXISTING_FAILURE', fingerprint: fp,
             reason: 'fingerprint identico no baseline' };
  }

  // 4. Mesmo teste, defeito diferente -> nunca reaproveitar o Finding antigo.
  const drifted = baseline.failures.find((b) => sameTestDifferentFailure(b, failure));
  if (drifted) {
    return { classification: 'NEW_FAILURE', fingerprint: fp,
             requiresReclassification: true,
             reason: 'mesmo teste, fingerprint materialmente diferente do baseline' };
  }

  // 5. Causalidade refutada com evidencia -> nao relacionada.
  if (failure.causalityRefuted?.evidenceRef) {
    return { classification: 'UNRELATED_FAILURE', fingerprint: fp,
             reason: 'causalidade com a mudanca refutada por evidencia' };
  }

  // 6. Passou antes, falha agora, e ha relacao material -> regressao.
  if (opts.causalRelation === true) {
    return { classification: 'REGRESSION', fingerprint: fp,
             reason: 'passava no baseline e ha relacao causal material com a mudanca' };
  }

  return { classification: 'NEW_FAILURE', fingerprint: fp,
           reason: 'ausente do baseline e sem causalidade refutada' };
}

/**
 * Decide o modo do Local Gate.
 *
 * `BASELINE_EQUIVALENT_PASS` e deliberadamente dificil: exige que TODAS as
 * condicoes se sustentem. Qualquer buraco cai em LOCAL_GATE_BLOCKED.
 */
export function evaluateGate(input = {}) {
  const { baseline, current = {}, findings = [], targetedTestsPass,
          requiredRegressionPass, invariantsPass, verificationApproved } = input;
  const failures = current.failures || [];
  const blockers = [];
  const results = {};

  // Afirmacao de preexistencia e rejeitada ANTES de qualquer analise, nos DOIS
  // casos em que nao se sustenta:
  //   a) nao ha baseline — nao existe do que afirmar preexistencia;
  //   b) ha baseline e ele NAO contem a falha — a afirmacao e contradita.
  //
  // (b) e a forma exata do erro cometido no DOG-002: "passa isolado" e
  // "acoplamento zero" foram tomados como prova de preexistencia, e o baseline,
  // quando obtido, mostrou a suite verde. Nenhum sinal indireto substitui o
  // baseline — inclusive os que parecem convincentes.
  let claimRejected = false;
  for (const f of failures) {
    if (!f.engineerClaim) continue;
    const semBaseline = !baselineSufficient(baseline);
    const contradito = !semBaseline &&
      !baseline.failures.some((b) => fingerprint(b).id === fingerprint(f).id);
    if (semBaseline || contradito) {
      claimRejected = true;
      blockers.push(semBaseline
        ? `afirmacao "${f.engineerClaim}" sem baseline evidence: rejeitada`
        : `afirmacao "${f.engineerClaim}" contradita pelo baseline: a falha nao consta nele`);
    }
  }

  for (const f of failures) {
    const r = classifyFailure(f, baseline, { causalRelation: f.causalRelation });
    results[r.fingerprint.key] = r;
  }

  const list = Object.values(results);
  const newFailures = list.filter((r) => r.classification === 'NEW_FAILURE').length;
  const regressions = list.filter((r) => r.classification === 'REGRESSION').length;
  const requiresReclassification = list.filter((r) => r.requiresReclassification).map((r) => r.fingerprint.key);

  if (!targetedTestsPass) blockers.push('targeted tests da mudanca nao passaram');
  if (!requiredRegressionPass) blockers.push('regressao obrigatoria nao passou');
  if (!invariantsPass) blockers.push('invariante aplicavel falhou');
  if (newFailures > 0) blockers.push(`${newFailures} NEW_FAILURE`);
  if (regressions > 0) blockers.push(`${regressions} REGRESSION`);

  // Toda falha remanescente precisa de Finding persistente.
  for (const r of list) {
    if (r.classification === 'NEW_FAILURE' || r.classification === 'REGRESSION') continue;
    const finding = findings.find((x) => x.fingerprint === 'auto' || x.fingerprint === r.fingerprint.id);
    if (!finding) { blockers.push(`falha ${r.fingerprint.key} sem Finding persistente`); continue; }
    // Preexistente NAO significa sem importancia.
    if (HIGH_SEVERITY.has(finding.severity) && finding.characterized === false) {
      blockers.push(`Finding ${finding.id} severidade ${finding.severity} nao caracterizado`);
    }
  }

  let gateMode;
  if (requiresReclassification.length > 0) gateMode = 'REQUIRES_RECLASSIFICATION';
  else if (blockers.length > 0) gateMode = 'LOCAL_GATE_BLOCKED';
  else if (failures.length === 0) gateMode = 'STRICT_GREEN_PASS';
  else if (verificationApproved === true) gateMode = 'BASELINE_EQUIVALENT_PASS';
  else { gateMode = 'LOCAL_GATE_BLOCKED'; blockers.push('equivalencia de baseline sem aprovacao do Verification Engineer'); }

  return {
    gateMode,
    classifications: Object.fromEntries(list.map((r) => [r.fingerprint.key, r.classification])),
    newFailures, regressions, requiresReclassification,
    baselineSufficient: baselineSufficient(baseline),
    claimRejected,
    blockers,
    details: results
  };
}

/** Saude da infraestrutura de verificacao — separada do estado do EOS. */
export function verificationHealth({ openDebt = [], unreproducible = false, cannotRun = false } = {}) {
  if (cannotRun) return { state: 'BLOCKED', reason: 'a suite nao executa' };
  if (unreproducible) return { state: 'UNRELIABLE', reason: 'resultados nao reproduziveis' };
  if (openDebt.length > 0) {
    return { state: 'DEGRADED_BY_KNOWN_BASELINE_FINDINGS',
             reason: `${openDebt.length} Finding(s) de verificacao em aberto: ${openDebt.join(', ')}` };
  }
  return { state: 'HEALTHY', reason: 'suite verde e reproduzivel, sem divida de verificacao aberta' };
}
