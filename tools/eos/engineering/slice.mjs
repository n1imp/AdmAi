/**
 * EOS V2 — Execution Slice + proteção de ownership.
 *
 * Um Slice e a unidade de responsabilidade: uma superficie, um dono, um
 * criterio de aceite, uma prova. Slice sem dono e trabalho sem responsavel.
 */

export const SLICE_STATES = [
  'PLANNED', 'READY', 'BLOCKED', 'IN_PROGRESS',
  'ENGINEER_COMPLETE', 'IN_VERIFICATION', 'FAILED', 'VERIFIED'
];

/** Transicoes legitimas. Qualquer outra e rejeitada. */
const TRANSITIONS = {
  PLANNED:            ['READY', 'BLOCKED'],
  READY:              ['IN_PROGRESS', 'BLOCKED'],
  BLOCKED:            ['READY', 'PLANNED'],
  IN_PROGRESS:        ['ENGINEER_COMPLETE', 'BLOCKED', 'FAILED'],
  ENGINEER_COMPLETE:  ['IN_VERIFICATION'],
  IN_VERIFICATION:    ['VERIFIED', 'FAILED'],
  FAILED:             ['IN_PROGRESS'],
  VERIFIED:           []
};

export const SLICE_FIELDS = [
  'sliceId', 'eosRun', 'changeId', 'goal', 'primaryOwner', 'collaborators', 'consumers',
  'dependencies', 'blockingDependencies', 'affectedFiles', 'affectedSymbols',
  'allowedChanges', 'forbiddenChanges', 'acceptanceCriteria', 'applicableInvariants',
  'requiredEvidence', 'requiredTools', 'verificationRequirements', 'status'
];

export function validateSlice(slice) {
  const errs = [];
  for (const f of SLICE_FIELDS) if (!(f in slice)) errs.push(`campo ausente: ${f}`);
  if (!SLICE_STATES.includes(slice.status)) errs.push(`status invalido: ${slice.status}`);
  if (!slice.primaryOwner) errs.push('slice sem Primary Owner');
  if (Array.isArray(slice.collaborators) && slice.collaborators.includes(slice.primaryOwner)) {
    errs.push('Primary Owner nao pode constar tambem como colaborador');
  }
  if (!Array.isArray(slice.acceptanceCriteria) || slice.acceptanceCriteria.length === 0) {
    errs.push('slice sem criterio de aceite nao e verificavel');
  }
  return errs;
}

export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

/**
 * Promocao a VERIFIED exige prova sustentada. O Slice nao decide sozinho:
 * quem decide e o Proof Ledger, via `proofSustains`.
 */
export function transition(slice, to, { proofSustains = false } = {}) {
  if (!canTransition(slice.status, to)) {
    return { ok: false, reason: `transicao ilegal: ${slice.status} -> ${to}` };
  }
  if (to === 'VERIFIED' && !proofSustains) {
    return { ok: false, reason: 'VERIFIED exige Proof Ledger sustentado' };
  }
  return { ok: true, slice: { ...slice, status: to } };
}

/* ------------------------------------------------------------------ *
 * Ownership
 * ------------------------------------------------------------------ */

/**
 * Superficies criticas: quando duas especialidades disputam uma delas, o
 * desempate NAO e negociado — e resolvido por precedencia fixa, para que
 * nunca haja edicao concorrente no mesmo simbolo.
 */
export const CRITICAL_SURFACE_PATTERNS = [
  { re: /middleware\/auth|\/auth\.|rbac|permissoes|autorizacao/i, owner: 'security' },
  { re: /tenant|multi-?tenant/i,                                  owner: 'security' },
  { re: /prisma\/schema|migrations?\//i,                          owner: 'data' },
  { re: /billing|pagamento|stripe/i,                              owner: 'backend' }
];

/** Precedencia de desempate quando a superficie e critica. */
const PRECEDENCE = ['security', 'data', 'backend', 'integration', 'mobile', 'frontend',
                    'externalIntegrations', 'performance', 'accessibility', 'observability', 'release'];

export function resolveOwnership({ surface, contenders }) {
  const uniq = [...new Set(contenders)];
  if (uniq.length <= 1) {
    return { status: 'OK', primaryOwner: uniq[0] || null, collaborators: [] };
  }

  const critical = CRITICAL_SURFACE_PATTERNS.find((p) => p.re.test(surface || ''));

  // Dono natural da superficie critica vence, mesmo que outro tenha chegado antes.
  let primary;
  if (critical && uniq.includes(critical.owner)) primary = critical.owner;
  else primary = [...uniq].sort((a, b) => PRECEDENCE.indexOf(a) - PRECEDENCE.indexOf(b))[0];

  const collaborators = uniq.filter((c) => c !== primary);

  return {
    // Disputa em superficie critica e reportada como conflito ainda que
    // resolvida: o registro importa tanto quanto a resolucao.
    status: critical ? 'OWNERSHIP_CONFLICT' : 'OK',
    primaryOwner: primary,
    collaborators,
    demotedToCollaborator: collaborators,
    surface,
    resolution: critical
      ? `superficie critica: '${critical.owner}' tem precedencia; demais viram colaboradores via Contract Bus`
      : `precedencia por ordem de responsabilidade`,
    concurrentEditAllowed: false
  };
}
