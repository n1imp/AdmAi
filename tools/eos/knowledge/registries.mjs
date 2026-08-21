/**
 * EOS V2 — Knowledge System (registros).
 *
 * NAO e MCP de memoria. Decisao tomada tres vezes de forma independente:
 * TARGET_ARCHITECTURE.md, TOOL_DECISIONS.md e TOOL_ROUTING_MATRIX.md. Estado
 * duravel vive versionado e auditavel.
 *
 * Formato compacto por desenho: o agente recebe o INDICE, nao o registro
 * inteiro. O corpo completo so e carregado quando a fatia exigir.
 */

/* --------------------------- Decision Index --------------------------- */
/** Compacto. `sourceRef` aponta para o registro completo; nao o duplica aqui. */
export const DECISION_INDEX = [
  { id: 'DEC-EOS-001', decision: 'EOS V2 nao usa hooks nem plugins', scope: 'eos',
    status: 'ACTIVE', supersedes: null, sourceRef: 'docs/eos-v2/06_IMPLEMENTATION_STATE.md#1' },
  { id: 'DEC-EOS-002', decision: 'Engineers sao papeis com contrato, nao subagentes writers', scope: 'eos',
    status: 'ACTIVE', supersedes: null, sourceRef: 'CLAUDE.md' },
  { id: 'DEC-EOS-003', decision: 'Knowledge System e Markdown/JSON versionado, nao memoria externa', scope: 'eos',
    status: 'ACTIVE', supersedes: null, sourceRef: 'docs/eos-v2/03_SYSTEM_INTERFACE_MAP.md#6' },
  { id: 'DEC-EOS-004', decision: 'Ferramenta escolhida pela natureza da evidencia, depois por custo', scope: 'tools',
    status: 'ACTIVE', supersedes: 'DEC-EOS-004-a', sourceRef: 'docs/eos-v2/06_IMPLEMENTATION_STATE.md#3' },
  { id: 'DEC-EOS-004-a', decision: 'Grep para simbolo distintivo, Serena para comum', scope: 'tools',
    status: 'SUPERSEDED', supersedes: null, sourceRef: 'medicao 2026-08-08 refutou a premissa' },
  // EOS-P11: duas instancias no mesmo dia. (1) DOG-002 — a leitura estatica
  // concluiu que o tratamento de erro estava correto; o Test Contract provou
  // que erro e vazio apareciam juntos. (2) O relatorio do DOG-002 declarou uma
  // falha como preexistente com base em "passa isolado" e "acoplamento zero";
  // o baseline, quando obtido, mostrou a suite verde.
  { id: 'EOS-P11', decision: 'Plan assumptions are falsifiable: nenhuma premissa de plano, discovery, Evidence Pack ou leitura estatica substitui observacao executavel do comportamento atual',
    scope: 'eos', status: 'ACTIVE', supersedes: null,
    sourceRef: 'docs/eos-v2/06_IMPLEMENTATION_STATE.md — DOG-002 e a correcao de atribuicao' },
  // Tres instancias reais ja vividas: F-004 (dono plausivel errado), F-005 (dono
  // onde nao havia nenhum) e a atribuicao "preexistente" do DOG-002 (plausivel,
  // sem baseline). Nas tres, o conserto foi ensinar o sistema a dizer que nao sabe.
  { id: 'EOS-P12', decision: 'Explicit Uncertainty Before Plausible Guessing: sem evidencia ou capacidade suficiente, retornar incerteza, CAPABILITY_GAP, ambiguidade ou bloqueio — nunca fabricar resposta plausivel',
    scope: 'eos', status: 'ACTIVE', supersedes: null,
    sourceRef: 'F-004, F-005 e a correcao de atribuicao do DOG-002' },
  // C1 no Decision Index. Sem este registro o Readiness Gate nao tem como saber
  // que o candidato do DOG-003 depende de politica adiada — foi essa ausencia,
  // e nao um defeito de algoritmo, que deixou F-006 invisivel ate a investigacao
  // humana. `decisionStatus: DEFERRED` e o dado que faz o gate funcionar.
  { id: 'C1', decision: 'Politica de produto para funcionalidade indisponivel, desativada, em teste ou parcial',
    scope: 'admai', kind: 'product', status: 'PENDING', decisionStatus: 'DEFERRED',
    deferredTo: 'Rodada 1, Lote 12', supersedes: null,
    sourceRef: 'docs/functionality-discovery/00_CANDIDATE_BACKLOG.md#C1' },
  // scope 'infra', nao 'admai': e decisao de PROMOCAO entre ambientes, nao de
  // comportamento de produto. Com scope 'admai' vazava para qualquer tarefa de
  // frontend ou backend. Finding F-001 do dogfooding EOS-sobre-EOS.
  { id: 'DEC-ADM-002', decision: 'Staging real e gate obrigatorio de promocao', scope: 'infra',
    status: 'ACTIVE', supersedes: null, sourceRef: 'docs/functionality-discovery/00_DECISION_LOG.md#DEC-002' }
];

/* -------------------------- Invariant Registry ------------------------- */
/**
 * Invariantes REAIS do AdmAi, migrados das 12 skills legadas e do AGENTS.md.
 * Skills e Engineers referenciam por ID — nunca reescrevem o texto, para que
 * a regra tenha um dono unico e nao se bifurque.
 */
export const INVARIANTS = [
  { id: 'INV-TENANT-01', statement: 'Query multi-tenant usa req.db e IDs validados; nunca Prisma global',
    scope: ['backend', 'data'], severity: 'CRITICAL',
    applicabilitySignals: ['tenant', 'schema', 'contract'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-AUTH-01', statement: 'Rota autenticada reutiliza requireAuth e requirePermissao',
    scope: ['backend'], severity: 'CRITICAL',
    applicabilitySignals: ['authn', 'rbac'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-AUTH-02', statement: 'Self-scope e contratos de 2FA/OAuth sao preservados',
    scope: ['backend'], severity: 'CRITICAL',
    applicabilitySignals: ['authn'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-ZOD-01', statement: 'Entrada e validada com Zod no boundary',
    scope: ['backend'], severity: 'HIGH',
    applicabilitySignals: ['contract', 'authn'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-SECRET-01', statement: 'Secret, PII, .env, chave e credencial nunca sao lidos, expostos, logados ou versionados',
    scope: ['backend', 'frontend', 'data', 'infra'], severity: 'CRITICAL',
    applicabilitySignals: ['secret', 'personalData'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-GATE-01', statement: 'Schema, auth, API, dependencias, lockfiles e CI exigem gate especifico e trabalho sequencial',
    scope: ['backend', 'data', 'infra'], severity: 'HIGH',
    applicabilitySignals: ['schema', 'migration', 'deploy'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-HIST-01', statement: 'Sem reset destrutivo, clean, stash automatico, rebase ou reescrita de historico',
    scope: ['infra'], severity: 'CRITICAL',
    applicabilitySignals: ['deploy'], source: 'AGENTS.md', status: 'ACTIVE' },
  { id: 'INV-MIN-01', statement: 'Corrigir a causa no helper compartilhado quando todos os chamadores passam por ele',
    scope: ['backend', 'frontend'], severity: 'MEDIUM',
    applicabilitySignals: ['contract'], source: 'skill legada backend-api', status: 'ACTIVE' },
  // Deriva direto dos defeitos de F-004: 'operational' (dimensao de risco) foi
  // tratado como Engineer, e 'security' (dominio de risco) como dono de escrita.
  // A protecao equivalente ja existe em responsibility.mjs — RISK_DOMAIN_ENGINEER,
  // CONCERN_CAPABILITY e SURFACE_OWNERSHIP sao registries distintos. O invariante
  // registra a regra; nao pede refatoracao de tipos.
  { id: 'EOS-INV-TYPE-001', statement: 'RiskDimension != EngineerId != Surface != Concern != ParticipationRole != FindingCategory: cada um tem registry proprio',
    scope: ['eos'], severity: 'HIGH',
    applicabilitySignals: [], source: 'F-004', status: 'ACTIVE' },
  // F-004 ensinou: risco nao e ownership. F-005 ensina: ausencia de owner nao
  // e ambiguidade. Escolher alguem por precedencia quando nao ha candidato
  // mascara lacuna estrutural de registry/roster.
  { id: 'EOS-INV-OWN-002', statement: 'OWNERSHIP_FALLBACK so resolve ambiguidade entre candidatos validos. Zero candidatos produz CAPABILITY_GAP, nunca selecao artificial por precedencia',
    scope: ['eos'], severity: 'HIGH',
    applicabilitySignals: [], source: 'F-005', status: 'ACTIVE' },
  // Ausencia de causalidade com a mudanca atual nao e evidencia de existencia
  // anterior. Sao eixos distintos: UNRELATED fala de causa, PRE_EXISTING fala de
  // tempo — e so baseline prova tempo.
  { id: 'EOS-INV-VERIFY-001', statement: 'UNRELATED_FAILURE != PRE_EXISTING_FAILURE: refutar causalidade nao prova preexistencia',
    scope: ['eos'], severity: 'HIGH',
    applicabilitySignals: [], source: 'DOG-003', status: 'ACTIVE' },
  { id: 'INV-UX-01', statement: 'Falha de carregamento nao e evidencia de lista vazia: estado de erro nao afirma ausencia de dados',
    scope: ['frontend', 'mobile'], severity: 'MEDIUM',
    applicabilitySignals: ['ui'], source: 'F-DOG-002', status: 'ACTIVE' },
  { id: 'INV-PROOF-01', statement: 'Validacao nao executada e declarada; limitacao ambiental nunca equivale a teste aprovado',
    scope: ['backend', 'frontend', 'data', 'mobile', 'infra'], severity: 'CRITICAL',
    applicabilitySignals: [], source: 'AGENTS.md', status: 'ACTIVE', alwaysApplicable: true }
];

/* --------------------------- Dependency Graph -------------------------- */
export const DEPENDENCY_GRAPH = [
  { from: 'chaveiro-painel', to: 'chaveiro-bot', relation: 'consumesApi' },
  { from: 'chaveiro-bot', to: 'postgresql', relation: 'persists' },
  { from: 'chaveiro-bot', to: 'redis', relation: 'queues' },
  { from: 'chaveiro-bot/src/routes', to: 'chaveiro-bot/src/services', relation: 'calls' },
  { from: 'chaveiro-bot/src/services', to: 'chaveiro-bot/src/db', relation: 'calls' }
];

/* ----------------------------- Impact Graph ---------------------------- */
/**
 * Responde: "se X mudar, o que precisa acordar?"
 * Toda aresta declara confianca e evidencia. Aresta sem evidencia direta e
 * marcada HYPOTHESIS — hipotese nao vira fato por estar num grafo.
 */
export const IMPACT_GRAPH = [
  { source: 'chaveiro-bot/src/db/tenant.js', target: 'todas as queries multi-tenant',
    relation: 'enforcesInvariant', confidence: 'HIGH',
    evidence: 'MODELOS_ESCOPADOS definido em tenant.js:23-33 (Serena find_symbol)',
    lastVerified: '2026-08-08' },
  { source: 'chaveiro-bot/src/services/permissoes.js', target: 'rotas com requirePermissao',
    relation: 'enforcesInvariant', confidence: 'HIGH',
    evidence: 'pode() definido em permissoes.js:131-135 (Serena find_symbol)',
    lastVerified: '2026-08-08' },
  { source: 'chaveiro-bot/src/services/auditoria.js', target: 'trilha de auditoria',
    relation: 'writes', confidence: 'HIGH',
    evidence: 'registrar() definido em auditoria.js:3-29 (Serena find_symbol)',
    lastVerified: '2026-08-08' },
  { source: 'contrato da API', target: 'chaveiro-painel',
    relation: 'breaksOnChange', confidence: 'MEDIUM',
    evidence: 'HYPOTHESIS — nao verificado chamador a chamador nesta execucao',
    lastVerified: null }
];

/* --------------------------- Architecture Map -------------------------- */
export const ARCHITECTURE_MAP = {
  application: { modules: ['chaveiro-bot', 'chaveiro-painel'], manifestAtRoot: false },
  frontend: { stack: 'React + Vite + Capacitor', boundary: 'chaveiro-painel/src' },
  backend: { stack: 'Express', boundary: 'chaveiro-bot/src' },
  data: { stack: 'Prisma + PostgreSQL', boundary: 'chaveiro-bot/prisma', truth: 'schema.prisma versionado' },
  auth: { boundary: 'requireAuth + requirePermissao no backend', clientSideEnforcement: false },
  tenant: { boundary: 'req.db', globalPrismaForbidden: true },
  integration: { boundary: 'contrato JSON entre painel e API' },
  environment: { order: ['local', 'staging', 'production'], skipAllowed: false }
};

/* ----------------------------- Test Registry --------------------------- */
export const TEST_REGISTRY = [
  { id: 'T-BOT-UNIT', behavior: 'unidades do backend', module: 'chaveiro-bot', level: 'unit',
    environment: 'local', command: 'npm test', gate: 'always', invariant: null, decision: null },
  { id: 'T-BOT-INT', behavior: 'integracao com banco', module: 'chaveiro-bot', level: 'integration',
    environment: 'local', command: 'npm run test:integration', gate: 'schemaChange',
    invariant: 'INV-TENANT-01', decision: null },
  { id: 'T-PAINEL-UNIT', behavior: 'unidades do painel', module: 'chaveiro-painel', level: 'unit',
    environment: 'local', command: 'npm test', gate: 'always', invariant: null, decision: null },
  { id: 'T-E2E', behavior: 'fluxos M1-M4 com papeis', module: 'chaveiro-painel', level: 'e2e',
    environment: 'local', command: 'node e2e/run.mjs', gate: 'crossSurface', invariant: null, decision: null },
  { id: 'T-SAST', behavior: 'padroes de seguranca', module: 'ambos', level: 'static',
    environment: 'local', command: 'semgrep --severity ERROR --error', gate: 'securityChange',
    invariant: 'INV-SECRET-01', decision: null },
  { id: 'T-EOS-RISK', behavior: 'classificacao de risco', module: 'tools/eos', level: 'unit',
    environment: 'local', command: 'node tools/eos/risk/verify.mjs', gate: 'eosChange',
    invariant: null, decision: 'DEC-EOS-001' },
  { id: 'T-EOS-PROOF', behavior: 'recusa de trabalho nao provado', module: 'tools/eos', level: 'unit',
    environment: 'local', command: 'node tools/eos/proof/verify.mjs', gate: 'eosChange',
    invariant: 'INV-PROOF-01', decision: null },
  { id: 'T-EOS-ENG', behavior: 'roteamento de engenharia e ownership', module: 'tools/eos', level: 'unit',
    environment: 'local', command: 'node tools/eos/engineering/verify.mjs', gate: 'eosChange',
    invariant: null, decision: 'DEC-EOS-002' }
];

/* ---------------------------- Research Cache --------------------------- */
export const RESEARCH_CACHE = [
  { id: 'RC-001', topic: 'API de transacoes interativas do Prisma',
    source: 'context7 /prisma/prisma', sourceAuthority: 'OFFICIAL', version: 'consultada 2026-08-07',
    researchDate: '2026-08-07', conclusion: 'resposta dirigida de 5.332 B obtida',
    scope: ['data', 'backend'], invalidationCondition: 'major do Prisma no package.json muda' },
  { id: 'RC-002', topic: 'proveniencia de binario npm com dependencia opcional por plataforma',
    source: 'registro npm', sourceAuthority: 'OFFICIAL', version: '2.1.225',
    researchDate: '2026-08-08',
    conclusion: 'bin/claude.exe e o binario real; verificar dist.integrity do pacote de plataforma e comparar bit a bit',
    scope: ['infra'], invalidationCondition: 'estrutura de empacotamento do Claude Code muda' }
];

/* ----------------------------- Known Risks ----------------------------- */
export const KNOWN_RISKS = [
  { id: 'KR-001', description: 'Pin exato de versao disputa com o auto-update do Claude Code',
    severity: 'MEDIUM', surface: 'infra', status: 'OPEN',
    mitigation: 're-baseline manual com proveniencia verificada; correcao estrutural pendente de decisao',
    evidence: 'tres quebras: 2.1.222 -> 223 -> 224 -> 225', reviewCondition: 'proxima quebra' },
  { id: 'KR-002', description: 'Teste negativo de allowlist MCP nao executado em sessao real',
    severity: 'MEDIUM', surface: 'infra', status: 'OPEN',
    mitigation: 'sonda JSON-RPC cobre o lado positivo',
    evidence: 'MCP_NEGATIVE_RUNTIME_TEST_PENDING', reviewCondition: 'sessao limpa disponivel' },
  { id: 'KR-003', description: 'Ratificacao independente L3 nao obtida',
    severity: 'HIGH', surface: 'eos', status: 'OPEN',
    mitigation: 'politica conservadora ativa: ninguem altera criterio de aceite',
    evidence: 'L3_INDEPENDENT_REVIEW_PENDING; Codex recusou por limite de uso',
    reviewCondition: 'Codex disponivel' },
  // --- Verification Debt (secao 22: representado aqui, sem registry novo) ---
  { id: 'KR-005', description: 'Pool `forks` do vitest expira no painel: init do jsdom neste ambiente excede o timeout de resposta do worker',
    severity: 'MEDIUM', surface: 'infra', status: 'OPEN',
    mitigation: 'executar com --pool=threads; NAO alterar vite.config.js — a causa e do ambiente, nao do repo',
    evidence: 'EstadoVazio (leve) passa em forks; Servicos e Tecnicos (React+jsdom) expiram. setup 45s / environment 53s para 5 testes; environment 344s na suite completa',
    workaroundLimitations: 'o CI e a maquina do usuario podem nao reproduzir; o pool oficial permanece forks e nao foi validado aqui',
    reviewCondition: 'ambiente com jsdom mais rapido, ou upgrade de vitest/node' },
  { id: 'KR-006', description: 'Contaminacao entre arquivos de teste sob --no-file-parallelism: mocks concorrentes de lib/api.js colidem no registro de modulos',
    severity: 'LOW', surface: 'infra', status: 'CLOSED',
    mitigation: 'nao usar --no-file-parallelism; o paralelismo padrao isola os arquivos',
    evidence: 'suite completa 29/29 e 135/135 com paralelismo padrao; 1 falha com a flag',
    reviewCondition: 'reabrir se a falha ocorrer com a configuracao oficial' },
  // F-006, achado no DOG-003: o classificador deu requiresUserDecision=false para
  // uma mudanca que depende de politica de produto formalmente adiada (C1, Lote
  // 12). Ele nao enxerga o backlog do discovery, entao nao sabe distinguir "nao
  // exige decisao" de "exige uma decisao que ja foi congelada".
  { id: 'KR-007', description: 'F-006: Risk Classifier nao detecta dependencia de decisao de produto adiada',
    severity: 'MEDIUM', surface: 'eos', status: 'OPEN',
    mitigation: 'investigacao humana confrontou o candidato com o backlog do discovery antes de executar',
    evidence: 'candidato de contrato de capacidades classificado com requiresUserDecision=false, sendo que C1 congela a politica para o Lote 12',
    reviewCondition: 'ciclo dedicado a F-006; possivel sinal derivado do 00_CANDIDATE_BACKLOG' },
  { id: 'KR-004', description: 'Classificador de risco e lexico e nao entende o codigo',
    severity: 'MEDIUM', surface: 'eos', status: 'MITIGATED',
    mitigation: 'direcao de falha e escalar; requiresClarification e confidence expostos; Impact Graph confirma',
    evidence: 'RF-09 e RF-10 no oraculo', reviewCondition: 'subclassificacao observada em uso real' }
];
