/**
 * EOS V2 — Engineering Roster.
 *
 * FORMA: dados, nao arquivos de Skill.
 * Cada Skill somaria sua `description` ao custo permanente de TODA sessao.
 * Doze Skills destruiriam os 0 B de custo permanente medidos. Aqui os Engineers
 * sao consumidos sob demanda pelo Execution Router.
 *
 * NATUREZA: papeis com contrato, ownership e acoes proibidas — nao subagentes.
 * CLAUDE.md proibe swarm e multiplos writers neste fluxo. O writer unico adota
 * o papel; o Execution Router impoe o limite; os testes verificam.
 *
 * Estado de ferramenta: 'available' somente para o que foi realmente instalado
 * e exercitado. O resto e NOT_INSTALLED — declarar disponivel o que nao existe
 * e mentir no inventario.
 */

export const TOOL_STATE = {
  serena:      'AVAILABLE',      // sonda JSON-RPC PASS, 6/6 da allowlist
  context7:    'AVAILABLE',      // medido: 5.332 B dirigidos
  semgrep:     'AVAILABLE',      // medido: 2.679 B, mesmos rulesets do CI
  playwright:  'AVAILABLE',      // channel:'chrome', fora do package.json do produto
  gh:          'AVAILABLE',      // 2.96.0 autenticado
  prismaCli:   'AVAILABLE',      // no modulo chaveiro-bot
  e2eHarness:  'AVAILABLE',      // chaveiro-painel/e2e/run.mjs
  nativeTools: 'AVAILABLE',
  codex:       'RATE_LIMITED',   // L3_INDEPENDENT_REVIEW_PENDING
  supabase:    'PENDING_EXTERNAL_CREDENTIAL',
  axe:         'NOT_INSTALLED',
  k6:          'NOT_INSTALLED',
  lighthouse:  'NOT_INSTALLED',
  cloudflare:  'NOT_INSTALLED'
};

/** Acoes proibidas a todo Engineer, sem excecao. Espelha o Correction Loop. */
const UNIVERSAL_FORBIDDEN = [
  'closeOwnFinding', 'changeAcceptanceCriterion', 'weakenTestContract',
  'changeProductDecision', 'ignoreInvariant', 'selfCertify',
  'push', 'merge', 'deploy', 'productionWrite'
];

const E = (o) => ({ ...o, forbiddenActions: [...UNIVERSAL_FORBIDDEN, ...(o.forbiddenActions || [])] });

export const ROSTER = {
  /**
   * Dono da propria infraestrutura do EOS. Existe porque o dogfooding
   * EOS-sobre-EOS revelou que uma mudanca no Knowledge Loader recebia
   * ownership de 'frontend' — nao ha Engineer de produto para tooling
   * (Finding F-002). Fingir que ha seria atribuir dono errado.
   */
  eosMaintainer: E({
    id: 'eosMaintainer',
    mission: 'Manter a infraestrutura do proprio EOS sem tocar o produto.',
    ownership: ['riskClassifier', 'proofLedger', 'executionRouter', 'contractBus',
                'findingRouter', 'knowledgeRegistries', 'knowledgeLoader', 'selfTests'],
    activation: { surfaces: ['eos'], signals: [] },
    inputs: ['ChangeContract', 'TestContract', 'fixtures'],
    outputs: ['implementation', 'ProofLedger'],
    preferredTools: ['nativeTools', 'serena'],
    forbiddenActions: ['editProductCode', 'weakenOwnFixtures'],
    escalation: 'mudanca de politica L3 -> Codex DECISOR; alteracao de protecao -> usuario',
    verificationResponsibilities: [
      'oraculo escrito antes da implementacao',
      'suites anteriores reexecutadas: regressao e falha'
    ],
    nonResponsibilities: ['qualquer superficie do AdmAi']
  }),

  /**
   * Dono do INSTRUMENTO de teste — nunca do veredito.  [F-005]
   *
   * Criado porque nenhum papel existente cobria runner, pool, isolamento,
   * fixtures e harness, e porque atribuir isso ao Verification Engineer o
   * tornaria autor do instrumento que ele proprio certifica.
   *
   * Fronteiras que o definem por exclusao:
   *   workflow de CI            -> release
   *   tools/eos/**              -> eosMaintainer
   *   politica de PASS/FAIL     -> eosMaintainer / governanca de Verification
   *   teste de uma feature      -> Engineer da feature
   */
  testInfrastructure: E({
    id: 'testInfrastructure',
    mission: 'Manter o instrumento de teste deterministico e confiavel, sem opinar sobre o veredito.',
    ownership: ['testRunnerConfig', 'globalTestSetup', 'teardown', 'fixturesInfrastructure',
                'mocksInfrastructure', 'workerConfiguration', 'testIsolation', 'coverageTooling',
                'sharedTestUtilities', 'localTestHarnesses', 'deterministicExecution',
                'e2eHarnessInfrastructure', 'testEnvironmentConfiguration'],
    activation: { surfaces: ['testInfrastructure'], signals: [] },
    inputs: ['ChangeContract', 'relatorio de determinismo', 'evidencia de ambiente'],
    outputs: ['configuracao de teste', 'harness', 'ProofLedger'],
    preferredTools: ['nativeTools', 'serena'],
    forbiddenActions: ['defineAcceptanceCriteria', 'certifyFeature', 'declareFinalPassFail',
                       'implementProductFeature', 'controlDeploy', 'editEosInternals'],
    escalation: 'politica de verificacao -> eosMaintainer; CI -> release; causa em produto -> Engineer da superficie',
    verificationResponsibilities: ['provar determinismo com repeticoes reais, nao com uma execucao verde'],
    nonResponsibilities: ['criterio de aceite', 'veredito PASS/FAIL', 'feature de produto',
                          'deploy', 'internals do EOS nao relacionados a teste']
  }),

  backend: E({
    id: 'backend',
    mission: 'Comportamento do servidor: contrato cumprido, entrada validada, efeito colateral controlado.',
    ownership: ['api', 'controllers', 'services', 'middleware', 'serverValidation', 'authIntegration',
                'authorizationImplementation', 'transactions', 'events', 'queues', 'retries',
                'idempotency', 'serverSideIntegrations', 'backendInstrumentation', 'errorHandling'],
    activation: { surfaces: ['backend'], signals: ['contract', 'authn', 'rbac', 'payments'] },
    inputs: ['ChangeContract', 'TestContract', 'invariants'],
    outputs: ['implementation', 'ProofLedger', 'ContractResponse'],
    preferredTools: ['serena', 'context7', 'nativeTools', 'prismaCli', 'semgrep'],
    forbiddenActions: ['editFrontendComponents', 'editMigrations'],
    escalation: 'schema -> data; contrato entre camadas -> integration; autorizacao -> security',
    verificationResponsibilities: ['self-check antes de entregar', 'declarar validacao nao executada'],
    nonResponsibilities: ['certificar a propria mudanca', 'decidir regra de negocio']
  }),

  frontend: E({
    id: 'frontend',
    mission: 'A interface reflete o estado real do sistema, inclusive quando ele falha.',
    ownership: ['react', 'pages', 'components', 'forms', 'navigation', 'state', 'loadingStates',
                'errorStates', 'emptyStates', 'responsive', 'designSystem', 'frontendApiIntegration',
                'interactionBehavior'],
    activation: { surfaces: ['frontend'], signals: ['ui'] },
    inputs: ['ChangeContract', 'TestContract', 'apiContract'],
    outputs: ['implementation', 'ProofLedger', 'ContractRequest'],
    preferredTools: ['serena', 'context7', 'playwright', 'e2eHarness', 'nativeTools'],
    forbiddenActions: ['editBackendRoutes', 'editSchema'],
    escalation: 'contrato da API -> integration; a11y -> accessibility',
    verificationResponsibilities: ['estados de carga, erro e vazio cobertos'],
    nonResponsibilities: ['definir contrato da API sozinho']
  }),

  data: E({
    id: 'data',
    mission: 'Integridade do dado ao longo do tempo, inclusive sob concorrencia e migracao.',
    ownership: ['prisma', 'postgresql', 'schema', 'relations', 'constraints', 'indexes', 'migrations',
                'transactionBoundaries', 'integrity', 'concurrency', 'queries', 'retention',
                'historicalConsistency'],
    activation: { surfaces: ['data'], signals: ['schema', 'migration', 'retention'] },
    inputs: ['ChangeContract', 'TestContract', 'invariants'],
    outputs: ['migration', 'ProofLedger', 'ContractResponse'],
    preferredTools: ['prismaCli', 'serena', 'context7', 'supabase', 'nativeTools'],
    forbiddenActions: ['runProductionMigration', 'dropWithoutUserDecision'],
    escalation: 'migration destrutiva -> usuario; isolamento de tenant -> security',
    verificationResponsibilities: ['reversibilidade declarada antes de aplicar'],
    nonResponsibilities: ['decidir retencao de negocio']
  }),

  mobile: E({
    id: 'mobile',
    mission: 'O app funciona com rede ruim e nao perde trabalho ja feito pelo usuario.',
    ownership: ['mobileFirst', 'localStorage', 'offlineQueue', 'synchronization', 'reconnect', 'retry',
                'clientIdempotency', 'conflictResolution', 'camera', 'photoCapture', 'videoCapture',
                'gps', 'unreliableConnectivity', 'localStateCrashRecovery'],
    activation: { surfaces: ['mobile'], signals: ['offline', 'mobile'] },
    inputs: ['ChangeContract', 'TestContract', 'syncContract'],
    outputs: ['implementation', 'ProofLedger'],
    preferredTools: ['serena', 'context7', 'playwright', 'nativeTools'],
    forbiddenActions: ['editServerSyncEndpointAlone'],
    escalation: 'conflito de sync -> data + integration; GPS -> security',
    verificationResponsibilities: ['cenario offline e de reconexao provados'],
    nonResponsibilities: ['definir politica de retencao de dado local']
  }),

  security: E({
    id: 'security',
    mission: 'Implementar o controle. Nao e quem prova que ele funciona.',
    ownership: ['authentication', 'authorization', 'rbac', 'tenantIsolation', 'validation', 'sessions',
                'cookies', 'secrets', 'securityHeaders', 'rateLimiting', 'injectionDefenses',
                'privilegeProtections', 'hardening', 'auditControls'],
    activation: { surfaces: ['backend', 'data'], signals: ['rbac', 'tenant', 'authn', 'secret', 'personalData'] },
    inputs: ['ChangeContract', 'TestContract', 'threatNotes'],
    outputs: ['implementation', 'ProofLedger'],
    preferredTools: ['serena', 'semgrep', 'context7', 'supabase', 'nativeTools'],
    forbiddenActions: ['certifyOwnSecurityFix', 'logSecrets'],
    escalation: 'sempre exige Verification independente; L3 exige Codex',
    verificationResponsibilities: ['teste negativo obrigatorio: acesso indevido deve falhar'],
    nonResponsibilities: ['aprovar a propria correcao', 'aceitar risco em nome do usuario']
  }),

  integration: E({
    id: 'integration',
    mission: 'O que atravessa fronteira continua compatível dos dois lados.',
    ownership: ['frontendBackendContracts', 'backendDataContracts', 'events', 'stateTransitions',
                'payloads', 'identifiers', 'crossModuleIntegration', 'apiCompatibility',
                'versionCompatibility', 'integrationTests', 'retryInteractions', 'boundaryIdempotency'],
    activation: { surfaces: ['backend', 'frontend', 'data'], signals: ['contract', 'crossLayer'], minSurfaces: 2 },
    inputs: ['ContractRequest', 'ChangeContract'],
    outputs: ['ContractResponse', 'integrationTests', 'ProofLedger'],
    preferredTools: ['serena', 'e2eHarness', 'nativeTools'],
    forbiddenActions: [],
    escalation: 'conflito estrutural -> architectureGuardian',
    verificationResponsibilities: ['compatibilidade dos dois lados provada'],
    nonResponsibilities: ['implementar a feature de cada lado'],
    isConflictArbiter: true
  }),

  performance: E({
    id: 'performance',
    mission: 'Custo de execucao medido, nao suposto.',
    ownership: ['latency', 'throughput', 'cpu', 'memory', 'queryPerformance', 'nPlusOne', 'payloadSize',
                'caching', 'bundleSize', 'coreWebVitals', 'loadTesting', 'stressTesting',
                'spikeTesting', 'soakTesting'],
    activation: { signals: ['performance'] },
    inputs: ['ChangeContract', 'baseline'],
    outputs: ['measurement', 'ProofLedger'],
    preferredTools: ['nativeTools', 'playwright', 'serena'],
    unavailableTools: ['k6', 'lighthouse'],
    forbiddenActions: ['claimImprovementWithoutBaseline'],
    escalation: 'causa em outra superficie -> owner correspondente',
    verificationResponsibilities: ['antes e depois medidos, nunca estimados'],
    nonResponsibilities: ['otimizar sem numero']
  }),

  accessibility: E({
    id: 'accessibility',
    mission: 'A interface e operavel por quem nao usa mouse nem enxerga a tela.',
    ownership: ['keyboardNavigation', 'focusManagement', 'semanticHtml', 'labels', 'aria', 'contrast',
                'forms', 'errors', 'touchTargets', 'screenReaderBehavior'],
    activation: { signals: ['a11y'] },
    inputs: ['ChangeContract', 'TestContract'],
    outputs: ['implementation', 'ProofLedger'],
    preferredTools: ['playwright', 'e2eHarness', 'nativeTools'],
    unavailableTools: ['axe'],
    forbiddenActions: [],
    escalation: 'estrutura de componente -> frontend',
    verificationResponsibilities: ['verificacao manual declarada onde a automacao nao cobre'],
    nonResponsibilities: ['redesenhar a interface']
  }),

  externalIntegrations: E({
    id: 'externalIntegrations',
    mission: 'Depender de terceiro sem confiar cegamente nele.',
    ownership: ['googleApis', 'googleMaps', 'navigation', 'reviews', 'messagingProviders',
                'paymentProviders', 'emailProviders', 'smsProviders', 'thirdPartyWebhooks',
                'externalApiContracts'],
    activation: { signals: ['externalProvider'] },
    inputs: ['ChangeContract', 'providerDocs'],
    outputs: ['implementation', 'ProofLedger'],
    preferredTools: ['context7', 'serena', 'nativeTools'],
    forbiddenActions: ['storeProviderSecretInRepo'],
    escalation: 'contrato interno afetado -> integration',
    verificationResponsibilities: ['falha e timeout do provedor cobertos'],
    nonResponsibilities: ['escolher provedor'],
    conditional: true
  }),

  observability: E({
    id: 'observability',
    mission: 'Deixar rastro suficiente para diagnosticar sem adivinhar.',
    ownership: ['structuredLogs', 'metrics', 'traces', 'alerts', 'releaseCorrelation',
                'healthIndicators', 'incidentEvidence'],
    activation: { signals: ['deploy'], surfaces: ['infra'] },
    inputs: ['ChangeContract'],
    outputs: ['instrumentation', 'ProofLedger'],
    preferredTools: ['gh', 'nativeTools'],
    forbiddenActions: ['logPersonalData', 'adoptNewPlatformWithoutDecision'],
    escalation: 'nova plataforma -> usuario',
    verificationResponsibilities: ['sinal util verificado, nao so emitido'],
    nonResponsibilities: ['escolher stack de observabilidade'],
    conditional: true
  }),

  aiAutomation: E({
    id: 'aiAutomation',
    mission: 'Comportamento de IA com guardrail e fallback deterministico.',
    ownership: ['aiInstructor', 'aiFeedbackAnalysis', 'aiInventory', 'aiReports', 'aiCustomerService',
                'modelEvaluation', 'guardrails', 'deterministicFallback', 'inferenceCostControls'],
    activation: { signals: [] },
    inputs: [], outputs: [],
    preferredTools: [],
    forbiddenActions: ['activateWithoutUserDecision'],
    escalation: 'qualquer ativacao -> usuario',
    verificationResponsibilities: [],
    nonResponsibilities: ['tudo, no ciclo atual'],
    active: false,
    inactiveReason: 'contrato definido; desativado para desenvolvimento funcional atual'
  }),

  release: E({
    id: 'release',
    mission: 'O artefato que passou e o artefato que vai. Nao certifica funcionalidade.',
    ownership: ['ci', 'build', 'environmentConfiguration', 'artifactIdentity', 'deployment',
                'migrationPromotion', 'rollout', 'rollback', 'featureFlags', 'releaseEvidence'],
    activation: { signals: ['deploy', 'staging', 'production'], surfaces: ['infra'] },
    inputs: ['ReleaseContract', 'ProofLedger'],
    outputs: ['releaseEvidence'],
    preferredTools: ['gh', 'nativeTools'],
    forbiddenActions: ['certifyFunctionality', 'deployWithoutUserAuthorization'],
    escalation: 'qualquer promocao -> usuario',
    verificationResponsibilities: ['identidade do artefato registrada: hash, commit, build'],
    nonResponsibilities: ['aprovar comportamento funcional']
  })
};

/** Papel condicional, fora do roster de implementacao: nao escreve a implementacao principal. */
export const ARCHITECTURE_GUARDIAN = {
  id: 'architectureGuardian',
  mission: 'Preservar fronteiras e direcao de dependencia quando a mudanca pressiona a arquitetura.',
  activation: ['L3', 'L2Transversal', 'contractConflictStructural', 'boundaryChange',
               'dependencyCycle', 'architecturalDrift', 'findingRecurrence'],
  ownership: ['coupling', 'boundaries', 'dependencyDirection', 'abstractions', 'duplication',
              'contractQuality', 'architectureDrift'],
  forbiddenActions: ['writeMainImplementation', ...UNIVERSAL_FORBIDDEN],
  nonResponsibilities: ['implementar a mudanca que arbitra']
};

export const ACTIVE_ENGINEERS = Object.values(ROSTER).filter((e) => e.active !== false).map((e) => e.id);

export function engineer(id) {
  const e = ROSTER[id];
  if (!e) throw new Error(`Engineer desconhecido: ${id}`);
  return e;
}

/** Ferramentas realmente utilizaveis por um Engineer, filtrando o nao instalado. */
export function usableTools(id) {
  const e = engineer(id);
  return (e.preferredTools || []).filter((t) => TOOL_STATE[t] === 'AVAILABLE');
}
