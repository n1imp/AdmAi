/**
 * EOS V2 — Execution Responsibility Vector.  [correcao de F-004]
 *
 * F-004 nao era um bug de roteamento; era um erro de modelo. O Router tratava
 * a maior dimensao do Risk Vector como autoridade de escrita. Risco em
 * seguranca significa que seguranca precisa OLHAR — nao que precisa ESCREVER.
 *
 * Regra nova:
 *   PRIMARY_OWNER     = Surface + Concern + Change Intent + Required Capability
 *   COLLABORATOR      = participacao direta de escrita necessaria
 *   REQUIRED_REVIEWER = Risk Domain sem necessidade de escrever
 *   CONSUMER          = depende do resultado, nao implementa
 *   CONTRACT_OWNER    = Integration, so quando ha contrato material
 *   VERIFICATION_OWNER= Verification Engineer, sempre e nunca confundido com Primary
 *
 * DUAS REGRAS QUE O MODELO IMPOE, e que sao o coracao da correcao:
 *   1. ARQUIVO NAO E OWNERSHIP  — o mesmo arquivo muda de dono conforme a intencao.
 *   2. RISCO NAO E OWNERSHIP    — Risk Domain gera review, nao autoria.
 */

export const PARTICIPATION_ROLES = [
  'PRIMARY_OWNER', 'COLLABORATOR', 'REQUIRED_REVIEWER', 'CONSUMER', 'NOT_INVOLVED'
];

/**
 * OwnershipState e registry PROPRIO (EOS-INV-TYPE-001): nao e ParticipationRole,
 * nao e Surface, nao e Concern. Descreve o resultado da RESOLUCAO, nao o papel.
 */
export const OWNERSHIP_STATES = ['OWNED', 'OWNERSHIP_AMBIGUOUS', 'CAPABILITY_GAP'];

/** Desempate — usado SOMENTE em OWNERSHIP_AMBIGUOUS, nunca com zero candidatos. */
const PRECEDENCE_TIEBREAK = [
  'eosMaintainer', 'security', 'data', 'backend', 'mobile', 'frontend', 'integration',
  'testInfrastructure', 'externalIntegrations', 'performance', 'accessibility',
  'observability', 'release'
];

/**
 * Surface Ownership Registry — dono-BASE por superficie.
 * E ponto de partida, nao veredito: Concern e Change Intent podem deslocar.
 */
export const SURFACE_OWNERSHIP = {
  backend:             'backend',
  frontend:            'frontend',
  data:                'data',
  mobile:              'mobile',
  securityControl:     'security',
  integrationContract: 'integration',
  release:             'release',
  performance:         'performance',
  accessibility:       'accessibility',
  observability:       'observability',
  externalIntegration: 'externalIntegrations',
  // Infraestrutura de teste e superficie propria, distinta de `eos` (interno do
  // EOS) e de `release` (CI/deploy). Ausencia dela foi uma das causas de F-005.
  testInfrastructure:  'testInfrastructure',
  testInfra:           'testInfrastructure',
  eos:                 'eosMaintainer'
};

/**
 * Concern -> capacidade necessaria para ESCREVER a mudanca.
 * Esta tabela e a que impede seguranca de virar dona de codigo de aplicacao.
 */
export const CONCERN_CAPABILITY = {
  // controles de seguranca: aqui seguranca escreve mesmo
  authorization:    'security',
  authentication:   'security',
  tenantIsolation:  'security',
  securityHardening:'security',
  // aplicacao
  applicationLogic: 'backend',
  businessLogic:    'backend',
  validation:       'backend',
  caching:          'backend',
  persistence:      'backend',
  // dados
  schema:           'data',
  migration:        'data',
  queryPerformance: 'data',
  retention:        'data',
  // interface
  frontendBehavior: 'frontend',
  stateManagement:  'frontend',
  reactComponent:   'frontend',
  // demais especialidades
  offlineSync:      'mobile',
  apiContract:      'integration',
  accessibility:    'accessibility',
  performance:      'performance',
  instrumentation:  'observability',
  deployment:       'release',
  infrastructure:   'release',
  integration:      'externalIntegrations',
  // Instrumento de teste — quem o constroi nao e quem certifica com ele.
  testRunnerConfig: 'testInfrastructure',
  testIsolation:    'testInfrastructure',
  testFixtures:     'testInfrastructure',
  testHarness:      'testInfrastructure',
  // Politica de PASS/FAIL e governanca do EOS, nunca do dono do instrumento.
  verificationPolicy: 'eosMaintainer'
};

/**
 * Change Intent que PERTENCE a uma especialidade. Quando a intencao e a propria
 * especialidade, ela e Primary e o dono da superficie colabora.
 *
 * CONVENCAO DOCUMENTADA (secao 8 do contrato pediu escolha explicita): vale
 * uniformemente. A alternativa — "execucao de UI e sempre do Frontend" —
 * contradiria OWN-03, onde data e Primary de uma migration pedida por seguranca.
 */
export const INTENT_SPECIALTY = {
  accessibilityCorrection:  'accessibility',
  observabilityImprovement: 'observability',
  securityRemediation:      'security',
  releaseChange:            'release',
  contractChange:           'integration'
};

/** Intencoes que NAO deslocam ownership: quem manda e a superficie/concern. */
const INTENT_NEUTRAL = new Set([
  'testability', 'refactor', 'bugFix', 'featureImplementation', 'hardening',
  'performanceOptimization', 'migration'
]);

/**
 * Especialidade INTERESSADA pela intencao: revisa quando nao e a dona.
 *
 * Detectado por OWN-06a: um indice criado para resolver query lenta pertence a
 * Data (quem escreve SQL), mas Performance nao pode ficar de fora — foi ela que
 * motivou a mudanca e e ela quem sabe dizer se o problema foi resolvido.
 */
const INTENT_INTERESTED = {
  performanceOptimization:  'performance',
  accessibilityCorrection:  'accessibility',
  observabilityImprovement: 'observability',
  securityRemediation:      'security'
};

/**
 * Dimensoes do Risk Vector NAO sao Engineers. 'operational' e nome de dimensao;
 * atribuir papel a ele criaria um participante inexistente.
 */
const RISK_DOMAIN_ENGINEER = {
  security: 'security',
  data: 'data',
  ux: 'frontend',
  externalIntegration: 'externalIntegrations',
  environment: 'release'
  // 'operational', 'functional', 'reversibility', 'uncertainty' nao mapeiam para
  // um Engineer: quem responde por elas ja e o Primary da superficie.
};

/* ------------------------------------------------------------------ *
 * Derivacao do vetor a partir do pedido + Risk Vector.
 * Deterministica: mesmas entradas, mesma saida.
 * ------------------------------------------------------------------ */

const norm = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Change Intent por verbo/objeto. Ordem importa: o mais especifico primeiro.
 *
 * DEFEITO CORRIGIDO EM F-005: estes padroes usavam `\b` no FIM de radicais de
 * verbo. Em portugues a flexao vem colada — `implementar`, `adicione`,
 * `corrigir` — e `\bimplement\b` nao casa "implementar", porque nao ha borda
 * entre "implement" e "ar". Na pratica quase nenhum verbo era detectado, e o
 * Change Intent saia `null`. Radicais agora terminam sem `\b`; so palavras
 * completas o mantem.
 */
const INTENT_PATTERNS = [
  ['accessibilityCorrection',  /\b(acessibilidade|foco\b|focus\b|aria\b|leitor de tela|contraste|teclado)/],
  ['observabilityImprovement', /\b(tracing|trace\b|instrumenta|telemetria|metrica|log estruturado)/],
  ['securityRemediation',      /\b(vulnerabilidade|corrigir (a )?(autoriza|autentica)|remediar|hardening de seguranca|escalonamento de privilegio)/],
  ['contractChange',           /\b(contrato (json|da api)|payload|versionamento de api)/],
  ['migration',                /\b(migration|migracao de (banco|schema))/],
  ['releaseChange',            /\b(deploy|release|rollout|pipeline|ci\b)/],
  ['performanceOptimization',  /\b(performance|lentid|latencia|otimiz|n\+1|cache\b)/],
  ['testability',              /\b(testavel|testabilidade|cobertura de teste|tornar .* verificavel|adicionar teste|deterministic|isolamento de teste)/],
  ['bugFix',                   /\b(corrig|conserta|bug\b|defeito|erro)/],
  ['refactor',                 /\b(refator|extrair|renomear|reorganiz|substituir a precedencia|configura)/],
  ['featureImplementation',    /\b(adicion|criar|implement|permitir que)/]
];

/** Concern pelo objeto tocado. */
const CONCERN_PATTERNS = [
  ['authorization',    /\b(autoriza|rbac|permissao|papel|controle de acesso)\b/],
  ['authentication',   /\b(autentica|login|sessao|token|2fa|oauth)\b/],
  ['tenantIsolation',  /\b(tenant|isolamento|filial)\b/],
  ['schema',           /\b(schema|tabela|coluna|indice|constraint|migration)\b/],
  ['queryPerformance', /\b(query|consulta) (lenta|pesada)|\bindice\b/],
  ['caching',          /\b(cache|memoiz)\b/],
  ['apiContract',      /\b(contrato|payload|endpoint da api)\b/],
  ['instrumentation',  /\b(tracing|trace|log|metrica|telemetria)\b/],
  ['accessibility',    /\b(acessibilidade|foco|focus|aria|contraste)\b/],
  ['offlineSync',      /\b(offline|sincroniza|conflito de sincroniza)\b/],
  ['frontendBehavior', /\b(componente|tela|formulario|botao|estado vazio|react)\b/],
  ['deployment',       /\b(deploy|release|pipeline)\b/],
  ['applicationLogic', /\b(service|rota|middleware|handler|chave de armazenamento|storagekey|arquivo)\b/]
];

const first = (patterns, text) => (patterns.find(([, re]) => re.test(text)) || [])[0] ?? null;

/**
 * Constroi o Execution Responsibility Vector.
 * Risk Domains saem do Risk Vector — e ficam como REVIEW, nunca como autoria.
 */
export function deriveVector(request, risk = {}) {
  const t = norm(request);
  const v = risk.vector || {};

  const surfaceFromRisk = (risk.affectedSurfaces || [])[0] ?? null;
  const concern = first(CONCERN_PATTERNS, t);
  const changeIntent = first(INTENT_PATTERNS, t);

  // Superficie: se o concern e um controle de seguranca, a superficie alterada
  // e o proprio controle — nao o arquivo onde ele mora. ARQUIVO NAO E OWNERSHIP.
  let surface = surfaceFromRisk;
  if (['authorization', 'authentication', 'tenantIsolation'].includes(concern)) surface = 'securityControl';
  else if (concern === 'schema') surface = 'data';
  else if (concern === 'apiContract') surface = 'integrationContract';

  const riskDomains = Object.entries(v)
    .filter(([dim, score]) => score >= 2 && RISK_DOMAIN_ENGINEER[dim])
    .map(([dim]) => dim);

  return {
    surface, concern, changeIntent, riskDomains,
    consumers: [],
    level: risk.level,
    // Contract Bus so com contrato material. Pluralidade de Engineers nao basta.
    apiContract: concern === 'apiContract',
    schemaContract: concern === 'schema' && (risk.affectedSurfaces || []).length >= 2
  };
}

/** Contrato material — e so isto que autoriza acionar o Contract Bus. */
export function hasMaterialContract(v = {}) {
  return Boolean(
    v.outputDependency || v.apiContract || v.schemaContract ||
    v.eventContract || v.blockingInput || v.breakingChange || v.boundary
  );
}

/**
 * Resolve os papeis de participacao.
 * Deterministico e auditavel: cada papel vem acompanhado do motivo.
 */
export function resolveResponsibility(v = {}) {
  const reasons = [];
  const roles = {};
  const assign = (eng, role, why) => {
    if (!eng) return;
    // Um Engineer recebe exatamente UM papel. O primeiro vence; papeis
    // posteriores nao rebaixam nem promovem silenciosamente.
    if (roles[eng]) return;
    roles[eng] = role;
    reasons.push(`${eng} = ${role}: ${why}`);
  };

  const { surface, concern, changeIntent, riskDomains = [], consumers = [] } = v;

  // --- AMBIGUIDADE: mais de um candidato valido, sem vencedor semantico ---
  // Unico lugar onde fallback e legitimo. [F-005]
  if (Array.isArray(v.ambiguousCandidates) && v.ambiguousCandidates.length > 1) {
    const cands = [...v.ambiguousCandidates].sort(
      (a, b) => PRECEDENCE_TIEBREAK.indexOf(a) - PRECEDENCE_TIEBREAK.indexOf(b));
    return {
      ownershipState: 'OWNERSHIP_AMBIGUOUS',
      primaryOwner: cands[0],
      roles: Object.fromEntries(cands.map((c, i) => [c, i === 0 ? 'PRIMARY_OWNER' : 'COLLABORATOR'])),
      candidates: cands,
      contractOwner: null,
      verificationOwner: 'verification',
      fallbackUsed: true,
      fallbackCode: 'OWNERSHIP_FALLBACK_USED',
      confidence: 'BAIXA',
      escalates: v.level === 'L2' || v.level === 'L3',
      contractRequests: 0,
      reasons: [`${cands.length} candidatos igualmente validos: desempate por precedencia, declarado`]
    };
  }

  // --- CAPABILITY GAP: zero candidatos ---
  //
  // Este e o conserto de F-005. Antes, zero candidatos caia no mesmo caminho da
  // ambiguidade e um Engineer era escolhido por precedencia — mascarando uma
  // lacuna estrutural de registry/roster como se fosse dificuldade de desempate.
  //
  // Ausencia de owner NAO e ambiguidade. Nao ha o que desempatar quando nao ha
  // candidato: ha mapeamento faltando, e ele precisa ser declarado.
  const missing = [];
  if (!surface || !(surface in SURFACE_OWNERSHIP)) missing.push(`Surface '${surface}' sem registro`);
  if (!concern || !(concern in CONCERN_CAPABILITY)) missing.push(`Concern '${concern}' sem capability`);
  if (!changeIntent) missing.push('Change Intent nao derivado');

  const semCandidato = (!surface || !(surface in SURFACE_OWNERSHIP)) &&
                       (!concern || !(concern in CONCERN_CAPABILITY));
  if (semCandidato) {
    return {
      ownershipState: 'CAPABILITY_GAP',
      primaryOwner: null,
      roles: {},
      candidateEngineers: [],
      missingMapping: missing,
      surface: surface ?? null,
      concern: concern ?? null,
      changeIntent: changeIntent ?? null,
      requiredCapability: null,
      level: v.level ?? null,
      escalationTarget: 'eosMaintainer',
      contractOwner: null,
      verificationOwner: 'verification',
      // Fallback e PROIBIDO aqui. A lacuna e declarada, nao contornada.
      fallbackUsed: false,
      confidence: 'BAIXA',
      escalates: true,
      contractRequests: 0,
      reasons: ['nenhum Engineer do roster possui capacidade para esta mudanca: ' + missing.join('; ')]
    };
  }

  // --- 1. capacidade exigida para escrever ---
  const byConcern = CONCERN_CAPABILITY[concern];
  const bySurface = SURFACE_OWNERSHIP[surface];
  const bySpecialtyIntent = INTENT_SPECIALTY[changeIntent];

  /**
   * Superficies EXCLUSIVAS: o territorio define o dono, independentemente do
   * concern. `tools/eos/**` e do eosMaintainer mesmo quando o concern e um
   * harness de teste — senao o testInfrastructure viraria dono de partes do
   * proprio EOS. Detectado por CAP-09.
   */
  const EXCLUSIVE_SURFACES = { eos: 'eosMaintainer' };
  if (EXCLUSIVE_SURFACES[surface]) {
    const dono = EXCLUSIVE_SURFACES[surface];
    assign(dono, 'PRIMARY_OWNER', `superficie '${surface}' e territorio exclusivo`);
    for (const rd of riskDomains) {
      const eng = RISK_DOMAIN_ENGINEER[rd];
      if (eng && eng !== dono) assign(eng, 'REQUIRED_REVIEWER', 'dominio de risco: revisa sem assumir autoria');
    }
    return {
      ownershipState: 'OWNED', primaryOwner: dono, roles,
      contractOwner: null, verificationOwner: 'verification',
      fallbackUsed: false, confidence: 'ALTA', escalates: false,
      concurrentEditAllowed: false, exactlyOnePrimary: true, contractRequests: 0, reasons
    };
  }

  let primary;
  if (bySpecialtyIntent && !INTENT_NEUTRAL.has(changeIntent)) {
    // A intencao E a especialidade. Mas se o concern tambem aponta para a mesma
    // especialidade, nao ha deslocamento — e o caso normal dela.
    //
    // Excecao deliberada: securityRemediation so torna security Primary quando
    // o CONCERN alterado tambem e um controle de seguranca. Sem isso, F-004
    // voltaria por outra porta: "remediar seguranca" em codigo de aplicacao
    // continuaria roubando a autoria do backend.
    if (bySpecialtyIntent === 'security') {
      primary = byConcern === 'security' ? 'security' : byConcern || bySurface;
      reasons.push(byConcern === 'security'
        ? 'intencao e concern sao ambos controle de seguranca'
        : `intencao e securityRemediation, mas o concern alterado ('${concern}') e de aplicacao: seguranca revisa, nao escreve`);
    } else {
      primary = bySpecialtyIntent;
      reasons.push(`Change Intent '${changeIntent}' pertence a especialidade '${bySpecialtyIntent}'`);
    }
  } else {
    primary = byConcern || bySurface;
    reasons.push(`capacidade exigida pelo concern '${concern}' -> ${byConcern || '(nenhuma)'}` +
                 (byConcern ? '' : `; dono-base da superficie '${surface}' -> ${bySurface}`));
  }

  // Contrato transversal: Integration cuida da coerencia, nao da implementacao.
  const contractOwner = (concern === 'apiContract' || surface === 'integrationContract' ||
                         hasMaterialContract(v)) ? 'integration' : null;
  if (contractOwner && primary === 'integration' && (v.surfacesTouched || []).length >= 2) {
    // Integration nao edita os dois lados: cada superficie tem seu Primary.
    primary = null;
    reasons.push('contrato transversal: implementacao dividida em slices por superficie');
  }

  if (primary) assign(primary, 'PRIMARY_OWNER', 'capacidade exigida para escrever a mudanca');

  // --- 2. dono da superficie, quando nao e o Primary, colabora ---
  if (bySurface && bySurface !== primary) {
    assign(bySurface, 'COLLABORATOR', `dono-base da superficie '${surface}'`);
  }

  // --- 3. especialidade interessada pela intencao revisa, quando nao e a dona ---
  const interested = INTENT_INTERESTED[changeIntent];
  if (interested && interested !== primary) {
    assign(interested, 'REQUIRED_REVIEWER',
           `motivou a mudanca via Change Intent '${changeIntent}', mas a capacidade de escrita e de '${primary}'`);
  }

  // --- 4. Risk Domains -> review, NUNCA autoria ---
  for (const rd of riskDomains) {
    const eng = RISK_DOMAIN_ENGINEER[rd];
    if (!eng) { reasons.push(`dominio de risco '${rd}' nao mapeia para Engineer: coberto pelo Primary`); continue; }
    if (eng === primary) continue;
    const needsWrite = v.securityRequiresWrite === true && eng === 'security';
    assign(eng, needsWrite ? 'COLLABORATOR' : 'REQUIRED_REVIEWER',
           needsWrite ? 'dominio de risco com escrita necessaria'
                      : 'dominio de risco: revisa sem assumir autoria');
  }

  // --- 5. consumidores ---
  for (const c of consumers) assign(c, 'CONSUMER', 'depende do resultado, nao implementa');

  // --- 6. exclusoes explicitas por evidencia ---
  for (const n of v.notInvolved || []) assign(n, 'NOT_INVOLVED', 'excluido pela evidencia');

  const primaries = Object.entries(roles).filter(([, r]) => r === 'PRIMARY_OWNER');

  return {
    // Estado explicito tambem no caminho normal: sem ele, o consumidor nao
    // distingue "resolvido" de "nao avaliado". [F-005]
    ownershipState: 'OWNED',
    primaryOwner: primaries[0]?.[0] ?? null,
    roles,
    contractOwner,
    verificationOwner: 'verification',
    sliceOwners: contractOwner && (v.surfacesTouched || []).length >= 2
      ? Object.fromEntries((v.surfacesTouched || []).map((s) => [s, SURFACE_OWNERSHIP[s]]))
      : null,
    fallbackUsed: false,
    confidence: byConcern ? 'ALTA' : 'MEDIA',
    escalates: false,
    concurrentEditAllowed: false,
    exactlyOnePrimary: primaries.length <= 1,
    contractRequests: hasMaterialContract(v) ? 1 : 0,
    reasons
  };
}
