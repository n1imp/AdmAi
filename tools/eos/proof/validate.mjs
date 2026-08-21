/**
 * EOS V2 — Artifact Registry e validador do Proof Ledger.
 *
 * REGRA CENTRAL: texto livre nao e prova.
 *
 * "funciona", "testei", "esta correto" sao narrativa. Prova e uma referencia
 * verificavel a um comando, teste, log, diff, scanner, evidencia de ambiente
 * ou artefato — com o que a produziu registrado junto.
 *
 * O validador e deliberadamente pessimista: na ausencia de prova ele NEGA
 * VERIFIED. Nenhuma regra aqui converte silencio em aprovacao.
 */

/** Os 13 tipos de artefato do EOS V2. */
export const ARTIFACT_TYPES = [
  'Decision', 'EvidencePack', 'SpecDelta', 'ChangeContract', 'TestContract',
  'ExecutionSlice', 'ContractRequest', 'ContractResponse', 'ProofLedger',
  'Finding', 'CorrectionRequest', 'ReleaseContract', 'BaselineEvidence'
];

/** Origens aceitas de prova. Qualquer outra e narrativa. */
export const EVIDENCE_KINDS = ['command', 'test', 'log', 'diff', 'scanner', 'environment', 'artifact'];

export const LEDGER_STATUS = ['DRAFT', 'BLOCKED', 'VERIFIED'];

/** Campos minimos obrigatorios do Proof Ledger. */
export const LEDGER_FIELDS = [
  'eosRun', 'changeId', 'sliceId', 'primaryOwner', 'changedFiles', 'changedSymbols',
  'testsExecuted', 'applicableInvariants', 'invariantResults', 'securityResult',
  'integrationResult', 'knownLimitations', 'unexpectedDependencies',
  'evidenceRefs', 'status'
];

/** Frases que agentes usam como se fossem prova, e nao sao. */
const NARRATIVE_ONLY = /^(funciona|testei|esta (ok|correto|certo)|deve funcionar|parece (ok|certo)|validado|conferi|tudo certo|sem problemas)\.?$/i;

const isNonEmptyArray = (v) => Array.isArray(v) && v.length > 0;

/**
 * Uma referencia de evidencia so vale se apontar para algo reexecutavel
 * ou reinspecionavel. `kind` fora do catalogo, ou `ref` que e apenas uma
 * frase, sao rejeitados.
 */
export function validateEvidenceRef(ref, path = 'evidenceRef') {
  const errs = [];
  if (typeof ref !== 'object' || ref === null) { errs.push(`${path}: deve ser objeto`); return errs; }
  if (!EVIDENCE_KINDS.includes(ref.kind)) {
    errs.push(`${path}.kind='${ref.kind}' invalido; aceitos: ${EVIDENCE_KINDS.join(', ')}`);
  }
  if (typeof ref.ref !== 'string' || ref.ref.trim().length === 0) {
    errs.push(`${path}.ref ausente`);
  } else if (NARRATIVE_ONLY.test(ref.ref.trim())) {
    errs.push(`${path}.ref e narrativa, nao prova: "${ref.ref}"`);
  }
  if (ref.kind === 'command' && !ref.producedBy) {
    errs.push(`${path}: prova do tipo 'command' exige 'producedBy' com o comando exato`);
  }
  return errs;
}

/**
 * Valida um Proof Ledger e decide se o status pretendido e sustentavel.
 * Retorna { ok, effectiveStatus, errors, blockers }.
 *
 * `effectiveStatus` nunca e mais permissivo que o pretendido: se o ledger
 * pede VERIFIED sem sustentacao, volta BLOCKED.
 */
export function validateLedger(ledger, opts = {}) {
  const errors = [];
  const blockers = [];
  const openFindings = opts.openFindings || [];

  if (typeof ledger !== 'object' || ledger === null) {
    return { ok: false, effectiveStatus: 'BLOCKED', errors: ['ledger nao e objeto'], blockers: ['ledger invalido'] };
  }

  for (const f of LEDGER_FIELDS) {
    if (!(f in ledger)) errors.push(`campo obrigatorio ausente: ${f}`);
  }
  if (!LEDGER_STATUS.includes(ledger.status)) {
    errors.push(`status='${ledger.status}' invalido; aceitos: ${LEDGER_STATUS.join(', ')}`);
  }

  // --- provas ---
  if (!isNonEmptyArray(ledger.evidenceRefs)) {
    blockers.push('nenhuma prova anexada');
  } else {
    ledger.evidenceRefs.forEach((r, i) => errors.push(...validateEvidenceRef(r, `evidenceRefs[${i}]`)));
  }

  // --- testes ---
  if (!Array.isArray(ledger.testsExecuted)) {
    errors.push('testsExecuted deve ser array');
  } else {
    if (ledger.testsExecuted.length === 0) blockers.push('nenhum teste executado');
    ledger.testsExecuted.forEach((t, i) => {
      if (!t || typeof t !== 'object') { errors.push(`testsExecuted[${i}] invalido`); return; }
      if (!t.command) errors.push(`testsExecuted[${i}] sem 'command'`);
      if (t.result !== 'PASS') blockers.push(`teste '${t.name || t.command}' com resultado ${t.result}`);
    });
  }

  // --- invariantes ---
  const applicable = Array.isArray(ledger.applicableInvariants) ? ledger.applicableInvariants : [];
  const results = Array.isArray(ledger.invariantResults) ? ledger.invariantResults : [];
  for (const inv of applicable) {
    const id = typeof inv === 'string' ? inv : inv?.id;
    const r = results.find((x) => x?.id === id);
    if (!r) { blockers.push(`invariante '${id}' aplicavel sem resultado registrado`); continue; }
    if (r.result !== 'PASS') blockers.push(`invariante '${id}' com resultado ${r.result}`);
    if (!r.evidenceRef) blockers.push(`invariante '${id}' aprovado sem referencia de prova`);
    else errors.push(...validateEvidenceRef(r.evidenceRef, `invariantResults['${id}'].evidenceRef`));
  }

  // --- resultados obrigatorios por dominio ---
  for (const key of ['securityResult', 'integrationResult']) {
    const v = ledger[key];
    if (v === null || v === undefined) continue;              // nao aplicavel e legitimo
    if (v.result === 'NOT_APPLICABLE') continue;
    if (v.result !== 'PASS') blockers.push(`${key} com resultado ${v.result}`);
    else if (!v.evidenceRef) blockers.push(`${key}=PASS sem referencia de prova`);
    else errors.push(...validateEvidenceRef(v.evidenceRef, `${key}.evidenceRef`));
  }

  // --- findings bloqueantes ---
  for (const f of openFindings) {
    if (f.blocking && f.status !== 'CLOSED') blockers.push(`Finding bloqueante aberto: ${f.id}`);
  }

  // --- Required Reviewer e bloqueante de verdade [F-004, secao 13] ---
  // Um Slice com Required Reviewer precisa do review REGISTRADO antes de o
  // Ledger ser elegivel a VERIFIED. O reviewer nao certifica — apenas libera o
  // Ledger para a Verification independente, que e quem decide.
  for (const rev of opts.requiredReviewers || []) {
    const r = (ledger.reviews || []).find((x) => x?.reviewer === rev);
    if (!r) { blockers.push(`Required Reviewer '${rev}' sem review registrado`); continue; }
    if (r.result === 'REVIEW_FINDING') blockers.push(`Required Reviewer '${rev}' abriu REVIEW_FINDING`);
    else if (r.result !== 'REVIEW_PASS') blockers.push(`Required Reviewer '${rev}' com resultado '${r.result}'`);
    else if (!r.evidenceRef) blockers.push(`Required Reviewer '${rev}' aprovou sem referencia de prova`);
    else errors.push(...validateEvidenceRef(r.evidenceRef, `reviews['${rev}'].evidenceRef`));
  }

  // --- escopo declarado ---
  if (!isNonEmptyArray(ledger.changedFiles)) blockers.push('changedFiles vazio: escopo nao declarado');

  const wantsVerified = ledger.status === 'VERIFIED';
  const sustainable = blockers.length === 0 && errors.length === 0;
  const effectiveStatus = wantsVerified && !sustainable ? 'BLOCKED' : ledger.status;

  return { ok: sustainable, effectiveStatus, errors, blockers };
}

/** Atalho: o ledger sustenta VERIFIED? */
export function canPromote(ledger, opts) {
  const v = validateLedger(ledger, opts);
  return v.ok && v.effectiveStatus === 'VERIFIED';
}
