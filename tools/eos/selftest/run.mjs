/**
 * EOS V2 — Self-test mestre (ST-01 a ST-15).
 *
 * Sucessor de `domain-routing-smoke.mjs` do legado: verifica COMPORTAMENTO,
 * nao configuracao. Cada ST declara o que espera e falha quando nao obtem.
 *
 * EOS-P: nenhuma fase se autocertifica. Os ST de risco confrontam o
 * classificador com fixtures escritas antes dele; os ST negativos tentam
 * ativamente furar as protecoes.
 */

import { classify } from '../risk/classify.mjs';
import { routeTool } from '../router/tools.mjs';
import { canPromote, validateLedger } from '../proof/validate.mjs';
import { routeFinding, applyCorrectionAction, recordAttempt,
         detectTestOverfitting, verificationMayFix } from '../verification/findings.mjs';
import { route as execRoute } from '../engineering/router.mjs';
import { resolveOwnership, validateSlice, transition } from '../engineering/slice.mjs';
import { escalateConflict, validateResponse } from '../engineering/contract-bus.mjs';
import { resolveResponsibility } from '../engineering/responsibility.mjs';
import { slice as kslice, fullSize } from '../knowledge/loader.mjs';
import { evaluateGate } from '../baseline/classify.mjs';
import { fingerprint } from '../baseline/fingerprint.mjs';
import { decisionReadiness } from '../knowledge/readiness.mjs';
import { metric, estimated, toolOutputRef } from '../accounting/measure.mjs';
import { accountProvider } from '../accounting/run.mjs';

const tests = [];
const T = (id, desc, fn, negative = false) => tests.push({ id, desc, fn, negative });

const eq = (got, want, what) => got === want ? null : `${what}: obtido ${JSON.stringify(got)}, esperado ${JSON.stringify(want)}`;
const has = (arr, v, what) => arr.includes(v) ? null : `${what}: '${v}' ausente em [${arr}]`;
const hasnt = (arr, v, what) => !arr.includes(v) ? null : `${what}: '${v}' presente indevidamente`;

/* ---------------- ST-01 a ST-05 — roteamento por risco ---------------- */

T('ST-01', 'tarefa trivial -> L0, sem especialista, sem Codex', () => {
  const r = classify('Troque o texto do botao de salvar para "Gravar".');
  return [eq(r.level, 'L0', 'nivel'), eq(r.requiresCodex, false, 'requiresCodex'),
          hasnt(r.specialists, 'security', 'especialistas'), hasnt(r.specialists, 'data', 'especialistas')];
});

T('ST-02', 'tarefa local -> L1, frontend, sem especialista sem impacto', () => {
  const r = classify('Adicione um filtro visual local na lista de servicos, sem alterar a consulta ao backend.');
  return [eq(r.level, 'L1', 'nivel'), has(r.specialists, 'frontend', 'especialistas'),
          hasnt(r.specialists, 'security', 'especialistas')];
});

T('ST-03', 'tarefa transversal -> L2 com backend, frontend e integracao', () => {
  const r = classify('Altere o contrato JSON entre o painel e a API na rota de listagem de tecnicos.');
  return [eq(r.level, 'L2', 'nivel'), has(r.specialists, 'integration', 'especialistas'),
          has(r.specialists, 'backend', 'especialistas')];
});

T('ST-04', 'RBAC -> L3 com Codex e seguranca', () => {
  const r = classify('Permita que o papel Gestor altere autorizacoes de outros usuarios.');
  return [eq(r.level, 'L3', 'nivel'), eq(r.requiresCodex, true, 'requiresCodex'),
          has(r.specialists, 'security', 'especialistas')];
});

T('ST-05', 'isolamento de tenant -> L3 com seguranca e dado', () => {
  const r = classify('Ajuste o escopo de tenant nas consultas de estoque para incluir filiais.');
  return [eq(r.level, 'L3', 'nivel'), eq(r.requiresCodex, true, 'requiresCodex'),
          has(r.specialists, 'security', 'especialistas'), has(r.specialists, 'data', 'especialistas')];
});

/* ---------------- ST-06 a ST-08 — roteamento de ferramenta ---------------- */

T('ST-06', 'usos de simbolo distintivo -> Grep (481 B, 0% ruido)', () => {
  const r = routeTool({ need: 'symbolUsages', symbol: 'MODELOS_ESCOPADOS' });
  return [eq(r.tool, 'grep', 'ferramenta')];
});

T('ST-07', 'usos de simbolo curto/comum -> Serena (Grep tem 84-93% de ruido)', () => {
  const r = routeTool({ need: 'symbolUsages', symbol: 'pode' });
  return [eq(r.tool, 'serena', 'ferramenta'), eq(r.serenaTool, 'find_referencing_symbols', 'ferramenta Serena')];
});

T('ST-07b', 'definicao de simbolo -> Serena mesmo quando distintivo (240 B < 481 B)', () => {
  const r = routeTool({ need: 'symbolDefinition', symbol: 'MODELOS_ESCOPADOS' });
  return [eq(r.tool, 'serena', 'ferramenta'), eq(r.serenaTool, 'find_symbol', 'ferramenta Serena')];
});

T('ST-08', 'documentacao externa -> Context7, sem Serena', () => {
  const r = routeTool({ need: 'externalLibraryBehavior', library: 'prisma' });
  return [eq(r.tool, 'context7', 'ferramenta'),
          r.rejected?.some((x) => x.tool === 'serena') ? null : 'Serena deveria constar como rejeitado com motivo'];
});

/* ---------------- ST-09 a ST-15 — NEGATIVOS ---------------- */

T('ST-09', 'Finding injetado e roteado ao owner correto', () => {
  const sec = routeFinding({ category: 'SECURITY_DEFECT', sliceOwner: 'backend' });
  const code = routeFinding({ category: 'CODE_DEFECT', sliceOwner: 'frontend' });
  const prod = routeFinding({ category: 'PRODUCT_DECISION_REQUIRED' });
  return [eq(sec.primary, 'security', 'owner de SECURITY_DEFECT'),
          has(sec.collaborators, 'backend', 'colaboradores de SECURITY_DEFECT'),
          eq(code.primary, 'frontend', 'CODE_DEFECT herda o dono do slice'),
          eq(prod.primary, 'userDecisionGate', 'decisao de produto vai ao gate do usuario')];
}, true);

T('ST-16', 'Engineer NAO fecha o proprio Finding', () => {
  const r = applyCorrectionAction({ actor: 'backend', action: 'closeFinding', finding: { retestEvidence: {} } });
  return [eq(r.allowed, false, 'permissao')];
}, true);

T('ST-17', 'Verification nao fecha sem evidencia de reteste', () => {
  const semProva = applyCorrectionAction({ actor: 'verification', action: 'closeFinding', finding: {} });
  const comProva = applyCorrectionAction({ actor: 'verification', action: 'closeFinding', finding: { retestEvidence: { kind: 'test', ref: 'npm test -> pass' } } });
  return [eq(semProva.allowed, false, 'sem prova'), eq(comProva.allowed, true, 'com prova')];
}, true);

T('ST-18', 'criterio de aceite nao pode ser enfraquecido por ninguem', () => {
  const eng = applyCorrectionAction({ actor: 'backend', action: 'changeAcceptanceCriterion', finding: {} });
  const ver = applyCorrectionAction({ actor: 'verification', action: 'weakenTestContract', finding: {} });
  return [eq(eng.allowed, false, 'engineer'), eq(ver.allowed, false, 'verification')];
}, true);

T('ST-19', 'reincidencia escala em vez de duplicar Finding', () => {
  let f = { id: 'F-1', owner: 'backend', attempt: 0 };
  for (let i = 0; i < 4; i++) f = recordAttempt(f, 3);
  return [eq(f.id, 'F-1', 'mesmo Finding'), eq(f.attempt, 4, 'contador'), eq(f.escalated, true, 'escalado')];
}, true);

T('ST-10', 'prova ausente impede VERIFIED', () => {
  const ledger = {
    eosRun: 'X', changeId: 'C', sliceId: 'S', primaryOwner: 'backend',
    changedFiles: ['a.js'], changedSymbols: [], testsExecuted: [{ command: 'npm test', result: 'PASS' }],
    applicableInvariants: [], invariantResults: [], securityResult: { result: 'NOT_APPLICABLE' },
    integrationResult: { result: 'NOT_APPLICABLE' }, knownLimitations: [], unexpectedDependencies: [],
    evidenceRefs: [], status: 'VERIFIED'
  };
  return [eq(canPromote(ledger, {}), false, 'promocao'),
          eq(validateLedger(ledger, {}).effectiveStatus, 'BLOCKED', 'status efetivo')];
}, true);

T('ST-11', 'criterio enfraquecido nao produz PASS (teste falho bloqueia)', () => {
  const ledger = {
    eosRun: 'X', changeId: 'C', sliceId: 'S', primaryOwner: 'backend',
    changedFiles: ['a.js'], changedSymbols: [], testsExecuted: [{ command: 'npm test', result: 'FAIL' }],
    applicableInvariants: [], invariantResults: [], securityResult: { result: 'NOT_APPLICABLE' },
    integrationResult: { result: 'NOT_APPLICABLE' }, knownLimitations: [], unexpectedDependencies: [],
    evidenceRefs: [{ kind: 'test', ref: 'npm test -> 1 failed' }], status: 'VERIFIED'
  };
  return [eq(canPromote(ledger, {}), false, 'promocao')];
}, true);

T('ST-12', 'narrativa sem evidencia nao vira PASS', () => {
  const ledger = {
    eosRun: 'X', changeId: 'C', sliceId: 'S', primaryOwner: 'backend',
    changedFiles: ['a.js'], changedSymbols: [], testsExecuted: [{ command: 'npm test', result: 'PASS' }],
    applicableInvariants: [], invariantResults: [], securityResult: { result: 'NOT_APPLICABLE' },
    integrationResult: { result: 'NOT_APPLICABLE' }, knownLimitations: [], unexpectedDependencies: [],
    evidenceRefs: [{ kind: 'log', ref: 'funciona' }], status: 'VERIFIED'
  };
  return [eq(canPromote(ledger, {}), false, 'promocao')];
}, true);

T('ST-13', 'palavra-chave isolada nao decide profundidade (super e sub)', () => {
  const sub = classify('Altere o texto do aviso de consentimento de coleta de dados pessoais exibido no cadastro.');
  const sup = classify("Corrija o erro de digitacao na palavra 'autenticacao' no titulo da pagina de ajuda.");
  return [sub.level === 'L0' ? "subclassificacao: 'texto' rebaixou conteudo juridico a L0" : null,
          eq(sup.level, 'L0', 'mencao entre aspas nao deve escalar')];
}, true);

T('ST-14', 'incerteza escala, nunca reduz', () => {
  const r = classify('Faca aquele ajuste que conversamos no modulo de comissoes.');
  return [r.level === 'L0' || r.level === 'L1' ? `incerteza rebaixou para ${r.level}` : null,
          eq(r.requiresClarification, true, 'requiresClarification')];
}, true);

T('ST-15', 'producao exige decisao do usuario e satura ambiente', () => {
  const r = classify('Rode a migration pendente no banco de producao.');
  return [eq(r.level, 'L3', 'nivel'), eq(r.requiresUserDecision, true, 'requiresUserDecision'),
          r.vector.environment >= 3 ? null : `environment=${r.vector.environment}, esperado 3`];
}, true);

/* ---------------- ST-20 a ST-31 — Engineering e Knowledge ---------------- */

T('ST-20', 'roteamento de engenharia: mudanca transversal aciona 4 papeis', () => {
  const r = execRoute('Adicione o campo prioridade na tabela de servicos, exponha na API e mostre na tela.');
  return [r.engineers.length >= 4 ? null : `${r.engineers.length} Engineers [${r.engineers}], esperado >= 4`,
          has(r.engineers, 'integration', 'Engineers'),
          eq(r.writesCode, false, 'Execution Router nao escreve codigo')];
});

T('ST-21', 'L0 nao carrega roster: um Engineer, verificacao minima', () => {
  const r = execRoute('Corrija o erro de digitacao no rotulo do botao Cancelar.');
  return [eq(r.engineers.length, 1, 'quantidade de Engineers'),
          eq(r.verificationLevel, 'MINIMAL', 'nivel de verificacao'),
          eq(r.architectureGuardian, null, 'Architecture Guardian nao deve ser acionado')];
}, true);

T('ST-22', 'colisao de ownership em superficie critica devolve OWNERSHIP_CONFLICT', () => {
  const r = resolveOwnership({ surface: 'chaveiro-bot/src/middleware/auth.js',
                               contenders: ['security', 'performance'] });
  return [eq(r.status, 'OWNERSHIP_CONFLICT', 'status'),
          eq(r.primaryOwner, 'security', 'dono da superficie critica'),
          has(r.collaborators, 'performance', 'colaboradores'),
          eq(r.concurrentEditAllowed, false, 'edicao concorrente')];
}, true);

T('ST-23', 'conflito de contrato nao vira ping-pong: escala apos o limite', () => {
  const dentro = escalateConflict({ from: 'frontend', to: 'backend', rounds: 1 });
  const fora   = escalateConflict({ from: 'frontend', to: 'backend', rounds: 3 });
  return [eq(dentro.escalatesTo, null, 'dentro do limite'),
          eq(fora.escalatesTo, 'integration', 'apos o limite')];
}, true);

T('ST-24', 'conflito estrutural escala ao Architecture Guardian', () => {
  const r = escalateConflict({ from: 'backend', to: 'data', rounds: 3, structural: true });
  const p = escalateConflict({ from: 'backend', to: 'frontend', rounds: 1, productDecision: true });
  return [eq(r.escalatesTo, 'architectureGuardian', 'estrutural'),
          eq(p.escalatesTo, 'userDecisionGate', 'decisao de produto')];
}, true);

T('ST-25', 'CONTRACT_RES breaking aceito sem nota ao consumidor e rejeitado', () => {
  const errs = validateResponse({ contractId: 'C1', status: 'ACCEPTED', providedContract: {},
    breakingImpact: true, dependencies: [], consumerNotes: '', evidenceRef: { kind: 'diff', ref: 'x' } });
  return [errs.length > 0 ? null : 'deveria rejeitar breaking sem nota ao consumidor'];
}, true);

T('ST-26', 'Slice sem criterio de aceite ou sem dono e invalido', () => {
  const base = { sliceId: 'S', eosRun: 'R', changeId: 'C', goal: 'g', primaryOwner: 'backend',
    collaborators: [], consumers: [], dependencies: [], blockingDependencies: [], affectedFiles: [],
    affectedSymbols: [], allowedChanges: [], forbiddenChanges: [], acceptanceCriteria: ['x'],
    applicableInvariants: [], requiredEvidence: [], requiredTools: [], verificationRequirements: [],
    status: 'PLANNED' };
  return [eq(validateSlice(base).length, 0, 'slice valido'),
          validateSlice({ ...base, acceptanceCriteria: [] }).length > 0 ? null : 'sem criterio deveria falhar',
          validateSlice({ ...base, primaryOwner: null }).length > 0 ? null : 'sem dono deveria falhar'];
}, true);

T('ST-27', 'Slice nao chega a VERIFIED sem Proof Ledger sustentado', () => {
  const s = { status: 'IN_VERIFICATION' };
  return [eq(transition(s, 'VERIFIED', { proofSustains: false }).ok, false, 'sem prova'),
          eq(transition(s, 'VERIFIED', { proofSustains: true }).ok, true, 'com prova'),
          eq(transition({ status: 'PLANNED' }, 'VERIFIED', { proofSustains: true }).ok, false, 'pulo de estado')];
}, true);

T('ST-28', 'Knowledge slicing: L0 carrega fracao minima do registro', () => {
  const s0 = kslice({ level: 'L0', surfaces: ['frontend'], signals: [] });
  const s3 = kslice({ level: 'L3', surfaces: ['backend', 'data'], signals: ['rbac', 'tenant', 'schema'] });
  return [eq(s0._meta.slicingEffective, true, 'fatia L0 menor que o todo'),
          s0._meta.bytes < s3._meta.bytes ? null : `L0 (${s0._meta.bytes} B) deveria ser menor que L3 (${s3._meta.bytes} B)`,
          s0._meta.fraction < 0.25 ? null : `fatia L0 = ${s0._meta.fraction} do registro; esperado < 0.25`];
}, true);

T('ST-29', 'Knowledge: invariante sempre-aplicavel nunca e podado', () => {
  const s = kslice({ level: 'L0', surfaces: [], signals: [] });
  return [s.invariants.some((i) => i.id === 'INV-PROOF-01') ? null : 'INV-PROOF-01 foi podado indevidamente'];
}, true);

T('ST-30', 'Test Registry devolve o teste certo por gate', () => {
  const sec = kslice({ level: 'L3', surfaces: ['backend'], signals: ['rbac'] });
  const triv = kslice({ level: 'L0', surfaces: ['frontend'], signals: [] });
  return [sec.tests.some((t) => t.id === 'T-SAST') ? null : 'T-SAST ausente em mudanca de seguranca',
          triv.tests.some((t) => t.id === 'T-SAST') ? 'T-SAST acionado indevidamente em L0' : null];
});

T('ST-31', 'test overfitting: alterar so o teste devolve VERIFICATION_POLICY_VIOLATION', () => {
  const fuga = detectTestOverfitting({
    finding: { category: 'CODE_DEFECT' },
    changedFiles: ['chaveiro-bot/tests/servico.test.js'], actor: 'backend' });
  const legitimo = detectTestOverfitting({
    finding: { category: 'TEST_DEFECT' },
    changedFiles: ['chaveiro-bot/tests/servico.test.js'], actor: 'verification' });
  const correcaoReal = detectTestOverfitting({
    finding: { category: 'CODE_DEFECT' },
    changedFiles: ['chaveiro-bot/src/services/servico.js', 'chaveiro-bot/tests/servico.test.js'], actor: 'backend' });
  return [eq(fuga.violation, true, 'fuga detectada'),
          eq(fuga.code, 'VERIFICATION_POLICY_VIOLATION', 'codigo'),
          eq(legitimo.violation, false, 'TEST_DEFECT pelo Verification e legitimo'),
          eq(correcaoReal.violation, false, 'correcao real com teste junto e legitima')];
}, true);

T('ST-32', 'Verification corrige teste, nunca produto', () => {
  return [eq(verificationMayFix('backend').allowed, false, 'superficie de produto'),
          eq(verificationMayFix('security').allowed, false, 'seguranca'),
          eq(verificationMayFix('testHarness').allowed, true, 'harness de teste')];
}, true);

// Exigido pelo Codex DECISOR na ratificacao de EOS-V2-D04 (thread
// 019fdf77, RESULTADO: CONCORDO, CONFIANCA: ALTA):
// "Um TEST_DEFECT deve permitir corrigir o teste, mas continuar negando
//  changeAcceptanceCriterion e weakenTestContract."
T('ST-33', 'TEST_DEFECT corrige o teste, mas nao o criterio que o teste prova', () => {
  const corrigeTeste = detectTestOverfitting({
    finding: { category: 'TEST_DEFECT' },
    changedFiles: ['tools/eos/risk/fixtures.json'], actor: 'verification' });
  const mudaCriterio = applyCorrectionAction({
    actor: 'verification', action: 'changeAcceptanceCriterion', finding: { category: 'TEST_DEFECT' } });
  const enfraquece = applyCorrectionAction({
    actor: 'verification', action: 'weakenTestContract', finding: { category: 'TEST_DEFECT' } });
  return [eq(corrigeTeste.violation, false, 'corrigir o artefato de teste e legitimo'),
          eq(mudaCriterio.allowed, false, 'alterar criterio permanece negado'),
          eq(enfraquece.allowed, false, 'enfraquecer contrato permanece negado')];
}, true);

// Regressoes dos dois Findings do dogfooding EOS-sobre-EOS. Nenhum dos 34
// testes anteriores os pegou, porque nenhum cobria mudanca no proprio EOS.
T('ST-34', 'F-001: fatia nao entrega decisao fora do escopo da tarefa', () => {
  const front = kslice({ level: 'L1', surfaces: ['frontend'], signals: [] });
  const infra = kslice({ level: 'L3', surfaces: ['infra'], signals: ['deploy'] });
  return [front.decisions.some((d) => d.id === 'DEC-ADM-002')
            ? 'decisao de promocao vazou para tarefa de frontend' : null,
          infra.decisions.some((d) => d.id === 'DEC-ADM-002')
            ? null : 'decisao de promocao ausente em tarefa de ambiente'];
}, true);

T('ST-35', 'F-002: mudanca no proprio EOS nao recebe Engineer de produto', () => {
  const r = execRoute('Restrinja o filtro de decisoes do Knowledge Loader para nao entregar decisao fora do escopo.');
  return [eq(r.primaryOwner, 'eosMaintainer', 'dono'),
          hasnt(r.engineers, 'frontend', 'Engineers'),
          hasnt(r.engineers, 'backend', 'Engineers')];
}, true);

T('ST-36', 'F-003: L0 e conquistado, nunca herdado por falta de sinal', () => {
  const semgrep = classify('Achado Semgrep: res.sendFile monta caminho a partir de doc.storageKey em routes/documentos.js');
  const desconhecido = classify('Reescreva o mecanismo de expurgo do lote noturno conforme combinado com a operacao.');
  const cosmetico = classify('Troque o texto do botao de salvar para "Gravar".');
  return [semgrep.level === 'L0' ? 'achado de path traversal classificado L0' : null,
          desconhecido.level === 'L0' ? 'tarefa nao reconhecida classificada L0 por ausencia de sinal' : null,
          eq(cosmetico.level, 'L0', 'trivialidade provada continua L0')];
}, true);

/* -------- ST-37 a ST-41 — Execution Responsibility Vector (F-004) -------- */

T('ST-37', 'F-004: risco em seguranca gera review, nao autoria', () => {
  const r = resolveResponsibility({ surface: 'backend', concern: 'applicationLogic',
                                    changeIntent: 'testability', riskDomains: ['security'] });
  return [eq(r.primaryOwner, 'backend', 'Primary'),
          eq(r.roles.security, 'REQUIRED_REVIEWER', 'papel de security')];
}, true);

T('ST-38', 'arquivo nao e ownership: mesmo alvo, donos diferentes por intencao', () => {
  const autorizacao = resolveResponsibility({ surface: 'securityControl', concern: 'authorization',
                                              changeIntent: 'securityRemediation', riskDomains: ['security'] });
  const tracing = resolveResponsibility({ surface: 'backend', concern: 'instrumentation',
                                          changeIntent: 'observabilityImprovement', riskDomains: [] });
  const refator = resolveResponsibility({ surface: 'backend', concern: 'applicationLogic',
                                          changeIntent: 'refactor', riskDomains: [] });
  return [eq(autorizacao.primaryOwner, 'security', 'mudanca de autorizacao'),
          eq(tracing.primaryOwner, 'observability', 'instrumentacao'),
          eq(refator.primaryOwner, 'backend', 'refatoracao de aplicacao')];
}, true);

// Entrada corrigida em F-005: antes usava {riskDomains, sem surface/concern},
// que e ZERO candidatos e nao ambiguidade. Assercoes preservadas na integra;
// o caso de zero candidatos e coberto por ST-46, que exige o oposto.
T('ST-39', 'fallback e declarado, nunca silencioso, e escala em L2', () => {
  const amb = resolveResponsibility({ ambiguousCandidates: ['security', 'data'], level: 'L2' });
  return [eq(amb.fallbackUsed, true, 'fallback'),
          eq(amb.fallbackCode, 'OWNERSHIP_FALLBACK_USED', 'codigo'),
          eq(amb.confidence, 'BAIXA', 'confianca'),
          eq(amb.escalates, true, 'escalada em L2'),
          eq(amb.ownershipState, 'OWNERSHIP_AMBIGUOUS', 'estado')];
}, true);

T('ST-46', 'F-005: zero candidatos e CAPABILITY_GAP, nunca fallback', () => {
  const gap = resolveResponsibility({ surface: 'quantumTeleporter', concern: 'warpDrive',
                                      changeIntent: 'bugFix', level: 'L1' });
  return [eq(gap.ownershipState, 'CAPABILITY_GAP', 'estado'),
          eq(gap.fallbackUsed, false, 'fallback PROIBIDO com zero candidatos'),
          eq(gap.primaryOwner, null, 'nenhum Primary artificial'),
          gap.missingMapping?.length ? null : 'missingMapping deve declarar o que falta',
          eq(gap.escalationTarget, 'eosMaintainer', 'alvo de escalada')];
}, true);

T('ST-47', 'F-005: superficie exclusiva do EOS domina o concern', () => {
  const harness = resolveResponsibility({ surface: 'eos', concern: 'testHarness', changeIntent: 'testability' });
  const infra = resolveResponsibility({ surface: 'testInfrastructure', concern: 'testHarness', changeIntent: 'testability' });
  return [eq(harness.primaryOwner, 'eosMaintainer', 'harness dentro de tools/eos'),
          eq(infra.primaryOwner, 'testInfrastructure', 'harness compartilhado do produto')];
}, true);

T('ST-40', 'Required Reviewer pendente impede VERIFIED', () => {
  const base = {
    eosRun: 'X', changeId: 'C', sliceId: 'S', primaryOwner: 'backend',
    changedFiles: ['a.js'], changedSymbols: [], testsExecuted: [{ command: 'npm test', result: 'PASS' }],
    applicableInvariants: [], invariantResults: [], securityResult: { result: 'NOT_APPLICABLE' },
    integrationResult: { result: 'NOT_APPLICABLE' }, knownLimitations: [], unexpectedDependencies: [],
    evidenceRefs: [{ kind: 'test', ref: 'npm test -> 3 passed' }], status: 'VERIFIED'
  };
  const opts = { requiredReviewers: ['security'] };
  const sem = validateLedger(base, opts);
  const achado = validateLedger({ ...base, reviews: [{ reviewer: 'security', result: 'REVIEW_FINDING' }] }, opts);
  const ok = validateLedger({ ...base, reviews: [{ reviewer: 'security', result: 'REVIEW_PASS',
    evidenceRef: { kind: 'diff', ref: 'git diff -> invariantes preservados' } }] }, opts);
  return [eq(sem.effectiveStatus, 'BLOCKED', 'sem review'),
          eq(achado.effectiveStatus, 'BLOCKED', 'com REVIEW_FINDING'),
          eq(ok.effectiveStatus, 'VERIFIED', 'com REVIEW_PASS')];
}, true);

T('ST-41', 'Contract Bus so com contrato material', () => {
  const semContrato = resolveResponsibility({ surface: 'backend', concern: 'applicationLogic',
                                              changeIntent: 'testability', riskDomains: ['security'] });
  const comContrato = resolveResponsibility({ surface: 'integrationContract', concern: 'apiContract',
                                              changeIntent: 'contractChange', apiContract: true,
                                              surfacesTouched: ['backend', 'frontend'] });
  return [eq(semContrato.contractRequests, 0, 'sem contrato material'),
          eq(semContrato.contractOwner, null, 'sem Contract Owner'),
          eq(comContrato.contractOwner, 'integration', 'com contrato material')];
}, true);

/* -------- ST-42 a ST-45 — Baseline-Aware Verification -------- */

T('ST-42', '"ja falhava" sem baseline nao libera o gate', () => {
  const r = evaluateGate({
    baseline: { recorded: false },
    current: { failures: [{ file: 'a.test.js', test: 'x', errorType: 'AssertionError',
                            message: 'expected 1', engineerClaim: 'ja falhava antes' }] },
    targetedTestsPass: true, requiredRegressionPass: true, invariantsPass: true });
  return [eq(r.gateMode, 'LOCAL_GATE_BLOCKED', 'gate'), eq(r.claimRejected, true, 'afirmacao rejeitada')];
}, true);

T('ST-43', '"ja falhava" contradito pelo baseline tambem e rejeitado', () => {
  // Forma exata do erro cometido no relatorio do DOG-002.
  const r = evaluateGate({
    baseline: { recorded: true, failures: [] },
    current: { failures: [{ file: 'a.test.js', test: 'x', errorType: 'AssertionError',
                            message: 'expected 1', engineerClaim: 'ja falhava',
                            isolatedPass: true, couplingZero: true }] },
    targetedTestsPass: true, requiredRegressionPass: true, invariantsPass: true });
  return [eq(r.claimRejected, true, 'afirmacao rejeitada'),
          eq(r.classifications['a.test.js::x'], 'NEW_FAILURE', 'classificacao'),
          eq(r.gateMode, 'LOCAL_GATE_BLOCKED', 'gate')];
}, true);

T('ST-44', 'fingerprint nem frouxo nem estrito demais', () => {
  const a = fingerprint({ file: 'j.test.js', test: 'a', errorType: 'AssertionError', message: 'expected 1 received 2' });
  const b = fingerprint({ file: 'j.test.js', test: 'b', errorType: 'AssertionError', message: 'expected 9 received 8' });
  const v1 = fingerprint({ file: 'k.test.js', test: 'a', errorType: 'Error', message: 'timeout after 5123ms at C:\\tmp\\x' });
  const v2 = fingerprint({ file: 'k.test.js', test: 'a', errorType: 'Error', message: 'timeout after 7440ms at C:\\tmp\\y' });
  return [a.id === b.id ? 'falhas distintas colidiram no mesmo fingerprint' : null,
          v1.id !== v2.id ? 'valores volateis quebraram o fingerprint da mesma falha' : null];
}, true);

T('ST-45', 'preexistente critico nao vira ignoravel por ser antigo', () => {
  const f = { file: 'h.test.js', test: 's', errorType: 'AssertionError', message: 'tenant leak' };
  const r = evaluateGate({
    baseline: { recorded: true, failures: [f] }, current: { failures: [f] },
    findings: [{ fingerprint: 'auto', id: 'F-5', severity: 'CRITICAL', status: 'OPEN', characterized: false }],
    targetedTestsPass: true, requiredRegressionPass: true, invariantsPass: true, verificationApproved: true });
  return [eq(r.classifications['h.test.js::s'], 'PRE_EXISTING_FAILURE', 'classificacao'),
          eq(r.gateMode, 'LOCAL_GATE_BLOCKED', 'gate — severidade preservada')];
}, true);

/* -------- ST-48 a ST-51 — Decision Readiness e Resource Accounting -------- */

T('ST-48', 'F-006: decisao adiada bloqueia execucao sem alterar o risco', () => {
  const r = decisionReadiness({ changeId: 'X', dependsOn: ['C1'], riskLevel: 'L2' },
                              [{ id: 'C1', decisionStatus: 'DEFERRED', deferredTo: 'Lote 12' }]);
  return [eq(r.readiness, 'BLOCKED_BY_DEFERRED_DECISION', 'readiness'),
          eq(r.decisionRequirement, 'DEFERRED_DECISION', 'requisito'),
          eq(r.executionAllowed, false, 'execucao'),
          eq(r.riskLevel, 'L2', 'risco preservado')];
}, true);

T('ST-49', 'F-006: APPROVED_FROZEN e DEFERRED tem efeito oposto', () => {
  const aprovada = decisionReadiness({ changeId: 'A', dependsOn: ['X'] },
                                     [{ id: 'X', decisionStatus: 'APPROVED_FROZEN' }]);
  const adiada = decisionReadiness({ changeId: 'B', dependsOn: ['Y'] },
                                   [{ id: 'Y', decisionStatus: 'DEFERRED' }]);
  const ausente = decisionReadiness({ changeId: 'C', dependsOn: ['Z'] }, []);
  return [eq(aprovada.readiness, 'READY', 'aprovada libera'),
          eq(adiada.readiness, 'BLOCKED_BY_DEFERRED_DECISION', 'adiada bloqueia'),
          eq(ausente.readiness, 'BLOCKED_BY_MISSING_DECISION', 'ausente nao vira READY')];
}, true);

T('ST-50', 'Accounting: ausencia de dado nunca vira zero', () => {
  const semToken = metric({ name: 'inputTokens', observed: false });
  const zeroReal = metric({ name: 'findings', value: 0, observed: true });
  const codex = accountProvider({ id: 'codex', calls: 2, creditsObserved: false });
  return [eq(semToken.status, 'UNAVAILABLE', 'token ausente'),
          eq(semToken.value, null, 'valor nulo, nao zero'),
          eq(zeroReal.status, 'MEASURED', 'zero medido continua medido'),
          eq(codex.credits.status, 'UNAVAILABLE', 'credito do Codex'),
          codex.credits.value === 0 ? 'credito ausente virou zero' : null];
}, true);

T('ST-51', 'Accounting: estimativa nao se passa por medida e segredo nao entra', () => {
  const est = estimated('approxTokens', 4000, 'bytes/4');
  const ref = toolOutputRef('gh', 'token=ghp_AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH1234 ok');
  return [eq(est.status, 'ESTIMATED', 'status'),
          est.method ? null : 'estimativa sem metodo',
          JSON.stringify(ref).includes('ghp_AAAABBBB') ? 'segredo vazou para o accounting' : null,
          eq(ref.redacted, true, 'redacao aplicada')];
}, true);

/* ---------------- execucao ---------------- */

console.log('EOS V2 — Self-test (ST-01 a ST-15)\n');
let pass = 0, fail = 0, na = 0;
const rows = [];
for (const t of tests) {
  let problems;
  try { problems = (t.fn() || []).filter(Boolean); }
  catch (e) { problems = [`excecao: ${e.message}`]; }
  const notImpl = problems.some((p) => /nao implementada|ausente:/.test(p));
  const status = problems.length === 0 ? 'PASS' : notImpl ? 'N/A' : 'FAIL';
  if (status === 'PASS') pass++; else if (status === 'N/A') na++; else fail++;
  rows.push({ ...t, status, problems });
  const mark = t.negative ? ' [NEG]' : '     ';
  console.log(`  [${status.padEnd(4)}]${mark} ${t.id}  ${t.desc}`);
  problems.forEach((p) => console.log(`                 ${p}`));
}

console.log(`\n  total=${tests.length}  pass=${pass}  fail=${fail}  nao-implementado=${na}`);
console.log(`  negativos: ${rows.filter((r) => r.negative).length} (dos quais PASS: ${rows.filter((r) => r.negative && r.status === 'PASS').length})`);
console.log(fail === 0
  ? (na === 0 ? '\nRESULTADO: PASS — todos os ST implementados passaram.'
              : `\nRESULTADO: PASS PARCIAL — ${na} ST dependem de fase ainda nao implementada.`)
  : '\nRESULTADO: FAIL');
process.exit(fail === 0 ? 0 : 1);
