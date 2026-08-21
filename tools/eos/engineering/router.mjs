/**
 * EOS V2 — Execution Router.
 *
 * NAO escreve codigo. Distribui responsabilidade.
 *
 * Entrada: pedido (ou Change Contract) + Risk Vector.
 * Saida:   Execution Graph — slices, donos, dependencias, paralelizaveis,
 *          bloqueados, ferramentas e nivel de verificacao.
 *
 * REGRA DE ECONOMIA (secao 26 do contrato): Engineer sem impacto material NAO
 * e acionado. Um roster amplo numa tarefa L0 nao e zelo, e desperdicio — e
 * dilui ownership.
 */

import { classify } from '../risk/classify.mjs';
import { ROSTER, ARCHITECTURE_GUARDIAN, usableTools } from './roster.mjs';
import { resolveOwnership } from './slice.mjs';
import { deriveVector, resolveResponsibility } from './responsibility.mjs';

/** Superficie -> Engineer naturalmente dono dela. */
const SURFACE_OWNER = {
  eos: 'eosMaintainer',
  backend: 'backend',
  frontend: 'frontend',
  data: 'data',
  mobile: 'mobile',
  infra: 'release'
};

/** Nivel de verificacao proporcional ao risco (EOS-P01). */
const VERIFICATION_BY_LEVEL = {
  L0: 'MINIMAL',
  L1: 'TARGETED',
  L2: 'CROSS_SURFACE',
  L3: 'FULL_INDEPENDENT'
};

/**
 * Seleciona os Engineers. Duas fontes, unidas e depois PODADAS:
 *   1. especialistas que o Risk Classifier apontou (sinais de dominio)
 *   2. donos naturais das superficies afetadas
 */
export function selectEngineers(risk) {
  const set = new Set();

  // Mudanca na propria infraestrutura do EOS nao e mudanca de produto e nao
  // tem Engineer de produto. Sinais lexicais fracos ('filtro' casando 'ui')
  // atribuiam ownership de frontend a uma alteracao do Knowledge Loader.
  // Finding F-002 do dogfooding EOS-sobre-EOS.
  if (risk.affectedSurfaces.length === 1 && risk.affectedSurfaces[0] === 'eos') {
    return ['eosMaintainer'];
  }

  for (const s of risk.specialists) if (ROSTER[s]) set.add(s);
  for (const surf of risk.affectedSurfaces) {
    const owner = SURFACE_OWNER[surf];
    if (owner && ROSTER[owner]) set.add(owner);
  }

  // Integration entra quando ha fronteira real entre camadas, nao por precaucao.
  const appSurfaces = risk.affectedSurfaces.filter((s) => ['backend', 'frontend', 'data'].includes(s));
  const crossLayer = appSurfaces.length >= 2 || risk.reasons.some((r) => /'contract'|'crossLayer'/.test(r));
  if (crossLayer && risk.level !== 'L0') set.add('integration');

  // Engineers inativos nunca entram automaticamente.
  for (const id of [...set]) if (ROSTER[id]?.active === false) set.delete(id);

  // PODA L0: profundidade minima. Um dono, nada mais.
  if (risk.level === 'L0') {
    const primary = pickPrimary([...set], risk) || 'frontend';
    return [primary];
  }

  return [...set];
}

/**
 * ULTIMO DESEMPATE, nao autoridade.  [F-004]
 *
 * Ate a correcao de F-004 esta funcao decidia ownership por precedencia fixa —
 * e por isso `security` vencia sempre que estava presente, mesmo quando a
 * implementacao era backend puro. Agora ela so roda quando o Execution
 * Responsibility Vector nao consegue derivar dono, e o uso e MARCADO.
 *
 * A saturacao de dimensao critica tambem saiu: risco alto exige revisao
 * independente, nao transferencia de autoria.
 */
function fallbackPrimary(engineers) {
  if (engineers.length === 0) return null;
  const order = ['eosMaintainer', 'security', 'data', 'backend', 'mobile', 'frontend', 'integration',
                 'externalIntegrations', 'performance', 'accessibility', 'observability', 'release'];
  return [...engineers].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}

/** Mantido para o `selectEngineers` de L0, que escolhe um dono unico por superficie. */
function pickPrimary(engineers, risk) {
  return fallbackPrimary(engineers);
}

/** Slices dependem uns dos outros na direcao do dado: data -> backend -> frontend. */
const DEPENDS_ON = {
  backend: ['data'],
  frontend: ['backend'],
  integration: ['backend', 'frontend', 'data'],
  mobile: ['backend'],
  release: ['backend', 'frontend', 'data']
};

export function route(request, opts = {}) {
  const risk = opts.risk || classify(request);
  const engineers = selectEngineers(risk);

  const present = new Set(engineers);
  const slices = engineers.map((id) => {
    const deps = (DEPENDS_ON[id] || []).filter((d) => present.has(d));
    return {
      sliceId: `SL-${id}`,
      owner: id,
      dependencies: deps,
      blockingDependencies: deps,
      requiredTools: usableTools(id),
      unavailableTools: (ROSTER[id].unavailableTools || []),
      status: deps.length ? 'BLOCKED' : 'READY'
    };
  });

  const parallelizable = slices.filter((s) => s.dependencies.length === 0).map((s) => s.sliceId);
  const blocked = slices.filter((s) => s.dependencies.length > 0).map((s) => s.sliceId);

  // --- OWNERSHIP pelo Execution Responsibility Vector [F-004] ---
  // Precedencia fixa deixou de ser autoridade. Aqui a decisao vem de
  // Surface + Concern + Change Intent + Required Capability.
  const rv = opts.responsibilityVector || deriveVector(request, risk);
  const resp = resolveResponsibility(rv);

  const derivedPrimary = resp.primaryOwner && engineers.includes(resp.primaryOwner)
    ? resp.primaryOwner
    : null;

  let ownershipFallback = null;
  let responsibilityPrimary = derivedPrimary;
  if (!responsibilityPrimary) {
    responsibilityPrimary = fallbackPrimary(engineers);
    ownershipFallback = {
      code: 'OWNERSHIP_FALLBACK_USED',
      reason: resp.primaryOwner
        ? `vetor derivou '${resp.primaryOwner}', que nao esta entre os Engineers selecionados [${engineers}]`
        : 'vetor nao derivou dono: superficie, concern e intencao insuficientes',
      confidence: 'BAIXA',
      // L2/L3 nao decidem em silencio pela precedencia antiga.
      escalates: risk.level === 'L2' || risk.level === 'L3'
    };
  }

  // Papeis de participacao: exatamente um por Engineer.
  const participation = {};
  for (const e of engineers) {
    participation[e] = e === responsibilityPrimary
      ? 'PRIMARY_OWNER'
      : (resp.roles[e] ?? 'COLLABORATOR');
  }
  participation.verification = 'VERIFICATION_OWNER';

  const requiredReviewers = Object.entries(participation)
    .filter(([, r]) => r === 'REQUIRED_REVIEWER').map(([e]) => e);

  // Ownership de superficie critica: preservado, e agora informado pelo vetor.
  let ownership = {
    status: 'OK',
    primaryOwner: responsibilityPrimary,
    collaborators: engineers.filter((e) => e !== responsibilityPrimary)
  };
  if (opts.surface && (opts.contenders?.length > 1)) {
    ownership = resolveOwnership({ surface: opts.surface, contenders: opts.contenders });
  }
  const primary = responsibilityPrimary;

  const guardianNeeded =
    risk.level === 'L3' ||
    (risk.level === 'L2' && engineers.length >= 4) ||
    ownership.status === 'OWNERSHIP_CONFLICT';

  return {
    request,
    level: risk.level,
    riskVector: risk.vector,
    engineers,
    primaryOwner: ownership.primaryOwner ?? primary,
    collaborators: ownership.collaborators ?? [],
    consumers: engineers.filter((e) => e === 'frontend' || e === 'mobile'),
    slices,
    parallelizable,
    blocked,
    ownershipStatus: ownership.status,
    ownership,
    participation,
    requiredReviewers,
    contractOwner: resp.contractOwner,
    verificationOwner: resp.verificationOwner,
    responsibilityVector: rv,
    ownershipFallback,
    contractRequests: resp.contractRequests,
    verificationLevel: VERIFICATION_BY_LEVEL[risk.level],
    requiresCodex: risk.requiresCodex,
    requiresUserDecision: risk.requiresUserDecision,
    architectureGuardian: guardianNeeded ? ARCHITECTURE_GUARDIAN.id : null,
    // Reafirmacao explicita do limite deste componente.
    writesCode: false
  };
}
