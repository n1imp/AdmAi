/**
 * EOS V2 — Finding System, Finding Router e Correction Loop.  [FASE 4 · L3]
 *
 * Regra que define o subsistema: quem implementa NAO fecha o proprio achado.
 * O Engineer corrige; somente o Verification Engineer fecha. Isso e EOS-P04
 * expresso em codigo, nao em recomendacao.
 */

/** As 14 categorias exatas do contrato. */
export const FINDING_CATEGORIES = [
  'CODE_DEFECT', 'INTEGRATION_DEFECT', 'DATA_DEFECT', 'SECURITY_DEFECT',
  'UI_UX_DEFECT', 'MOBILE_OFFLINE_DEFECT', 'ACCESSIBILITY_DEFECT',
  'PERFORMANCE_DEFECT', 'ENVIRONMENT_DEFECT', 'OBSERVABILITY_DEFECT',
  'TEST_DEFECT', 'PLAN_DEFECT', 'SPEC_DEFECT', 'PRODUCT_DECISION_REQUIRED'
];

/**
 * Roteamento determinístico. `primary` e dono unico; `collaborators` entram
 * junto. `owner: fromSlice` significa que o dono vem do Execution Slice que
 * produziu o defeito — nao ha dono fixo por categoria.
 */
const ROUTES = {
  CODE_DEFECT:              { primary: 'fromSlice', collaborators: [] },
  INTEGRATION_DEFECT:       { primary: 'integration', collaborators: ['fromSlice'] },
  DATA_DEFECT:              { primary: 'data', collaborators: [] },
  SECURITY_DEFECT:          { primary: 'security', collaborators: ['fromSlice'] },
  UI_UX_DEFECT:             { primary: 'frontend', collaborators: [] },
  MOBILE_OFFLINE_DEFECT:    { primary: 'mobile', collaborators: [] },
  ACCESSIBILITY_DEFECT:     { primary: 'accessibility', collaborators: ['frontend'] },
  PERFORMANCE_DEFECT:       { primary: 'performance', collaborators: ['fromSlice'] },
  ENVIRONMENT_DEFECT:       { primary: 'release', collaborators: [] },
  OBSERVABILITY_DEFECT:     { primary: 'observability', collaborators: [] },
  TEST_DEFECT:              { primary: 'verification', collaborators: [] },
  PLAN_DEFECT:              { primary: 'executionGraph', collaborators: [] },
  SPEC_DEFECT:              { primary: 'specDelta', collaborators: [] },
  PRODUCT_DECISION_REQUIRED:{ primary: 'userDecisionGate', collaborators: [] }
};

export function routeFinding(finding) {
  const route = ROUTES[finding.category];
  if (!route) throw new Error(`categoria desconhecida: ${finding.category}`);
  const resolve = (r) => (r === 'fromSlice' ? (finding.sliceOwner || 'unassigned') : r);
  return {
    primary: resolve(route.primary),
    collaborators: route.collaborators.map(resolve).filter((c) => c !== resolve(route.primary)),
    category: finding.category
  };
}

export const FINDING_FIELDS = [
  'id', 'eosRun', 'environment', 'changeContract', 'testContract', 'acceptanceCriterion',
  'invariant', 'expected', 'observed', 'reproduction', 'severity', 'category',
  'owner', 'collaborators', 'promotionStatus', 'attempt', 'evidence'
];

export function validateFinding(f) {
  const errs = [];
  for (const k of FINDING_FIELDS) if (!(k in f)) errs.push(`campo ausente: ${k}`);
  if (!FINDING_CATEGORIES.includes(f.category)) errs.push(`categoria invalida: ${f.category}`);
  if (!f.reproduction) errs.push('achado sem reproducao nao e acionavel');
  if (!f.evidence) errs.push('achado sem evidencia e narrativa');
  return errs;
}

/* ------------------------------------------------------------------ *
 * Correction Loop — o que cada papel PODE e NAO PODE fazer.
 * ------------------------------------------------------------------ */

export const ENGINEER_FORBIDDEN = [
  'closeFinding', 'changeAcceptanceCriterion', 'weakenTestContract',
  'changeProductDecision', 'ignoreInvariant'
];

/**
 * Porteiro do loop de correcao. Rejeita as cinco tentativas que a secao 21
 * do contrato manda impedir explicitamente.
 */
export function applyCorrectionAction({ actor, action, finding }) {
  const deny = (reason) => ({ allowed: false, reason });

  if (action === 'closeFinding') {
    if (actor !== 'verification') return deny('somente o Verification Engineer fecha Finding');
    if (!finding?.retestEvidence) return deny('fechamento exige evidencia de reteste independente');
    return { allowed: true, newStatus: 'CLOSED' };
  }

  if (ENGINEER_FORBIDDEN.includes(action) && actor !== 'verification') {
    return deny(`acao '${action}' proibida ao papel '${actor}'`);
  }
  if (action === 'changeAcceptanceCriterion' || action === 'weakenTestContract') {
    return deny('criterio de aceite e contrato de teste nao sao alteraveis pelo loop de correcao');
  }
  if (action === 'changeProductDecision') {
    return deny('decisao de produto e reservada ao usuario');
  }
  if (action === 'implementCorrection') {
    return { allowed: true, newStatus: 'IN_CORRECTION' };
  }
  return deny(`acao desconhecida: ${action}`);
}

/**
 * Deteccao de test overfitting (secao 30 do contrato).
 *
 * O caminho de fuga mais tentador: o produto viola o contrato, e em vez de
 * corrigir o produto o Engineer ajusta o teste ate ficar verde. Detectavel
 * estruturalmente — o diff toca teste e nao toca a superficie do defeito.
 */
export function detectTestOverfitting({ finding, changedFiles = [], actor }) {
  const isTest = (f) => /(\.test\.|\.spec\.|[\\/]tests?[\\/]|[\\/]e2e[\\/]|fixtures?\.json$)/i.test(f);
  const testFiles = changedFiles.filter(isTest);
  const productFiles = changedFiles.filter((f) => !isTest(f));

  // Verification pode e deve corrigir TEST_DEFECT — e o defeito dele.
  if (finding?.category === 'TEST_DEFECT' && actor === 'verification') {
    return { violation: false, reason: 'TEST_DEFECT e responsabilidade do Verification Engineer' };
  }

  if (testFiles.length > 0 && productFiles.length === 0 && finding?.category !== 'TEST_DEFECT') {
    return {
      violation: true,
      code: 'VERIFICATION_POLICY_VIOLATION',
      reason: `Finding '${finding?.category}' aponta defeito de produto, mas o diff altera somente teste`,
      changedTests: testFiles
    };
  }
  return { violation: false };
}

/**
 * Verification Engineer corrige teste, nunca produto (secao 29).
 */
const PRODUCT_SURFACES = ['backend', 'frontend', 'data', 'mobile', 'integration', 'security'];
export function verificationMayFix(surface) {
  if (PRODUCT_SURFACES.includes(surface)) {
    return { allowed: false, reason: `superficie de produto '${surface}' volta ao Engineer correspondente` };
  }
  return { allowed: true };
}

/** Reincidencia: mesmo Finding, contador sobe; nunca duplicar. */
export function recordAttempt(finding, maxAttempts = 3) {
  const attempt = (finding.attempt || 0) + 1;
  const escalate = attempt > maxAttempts;
  return {
    ...finding,
    attempt,
    escalated: escalate,
    escalateTo: escalate
      ? ['architectureGuardian', finding.owner, 'integration'].filter(Boolean)
      : null
  };
}
