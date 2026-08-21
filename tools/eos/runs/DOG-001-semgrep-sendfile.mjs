/**
 * EOS V2 — artefatos do primeiro dogfooding real no AdmAi.
 *
 * Run: EOS-RUN-20260808T030320Z (sem child-run)
 * Origem: achado Semgrep javascript.express.security.audit.express-res-sendfile
 *         em chaveiro-bot/src/routes/documentos.js
 *
 * Executar: node tools/eos/runs/DOG-001-semgrep-sendfile.mjs
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { classify } from '../risk/classify.mjs';
import { route } from '../engineering/router.mjs';
import { slice as kslice } from '../knowledge/loader.mjs';
import { validateLedger } from '../proof/validate.mjs';
import { routeFinding, validateFinding, detectTestOverfitting } from '../verification/findings.mjs';
import { validateSlice, transition } from '../engineering/slice.mjs';

export const RUN = 'EOS-RUN-20260808T030320Z';
const CHANGE = 'CH-DOG-001';

const REQUEST =
  'Investigar o achado Semgrep: res.sendFile monta caminho de arquivo a partir de ' +
  'doc.storageKey na rota de documentos do backend, com risco de path traversal entre tenants.';

/* --------------------------- Change Contract --------------------------- */
export const CHANGE_CONTRACT = {
  changeId: CHANGE,
  eosRun: RUN,
  goal: 'Determinar se o achado e defeito real e, se nao for, tornar a garantia verificavel.',
  origin: { tool: 'semgrep', rule: 'javascript.express.security.audit.express-res-sendfile',
            file: 'chaveiro-bot/src/routes/documentos.js', severity: 'WARNING' },
  allowedChanges: ['extrair geracao da chave para funcao exportada', 'adicionar teste de unidade'],
  forbiddenChanges: ['alterar comportamento', 'suprimir regra do Semgrep', 'tocar autorizacao',
                     'tocar escopo de tenant', 'tocar schema', 'tocar storage', 'promover a staging'],
  acceptanceCriteria: [
    'A origem de storageKey esta provada por evidencia citavel',
    'Nenhuma alteracao de comportamento e introduzida',
    'A garantia de confinamento fica travada por teste',
    'O WARNING do Semgrep permanece, sem supressao'
  ]
};

/* ---------------------------- Test Contract ---------------------------- */
// Derivado ANTES de qualquer alteracao funcional. Cenarios limitados ao que a
// arquitetura real permite: os de rota (401/403/cross-tenant) exigem banco e
// ficam declarados como NAO EXECUTADOS, nao inventados como executados.
export const TEST_CONTRACT = {
  changeId: CHANGE,
  executed: [
    { id: 'TC-01', scenario: 'formato doc-<uuid>.<ext> para os 3 MIMEs aceitos' },
    { id: 'TC-02', scenario: 'chave nunca contem .. / \\ :' },
    { id: 'TC-03', scenario: 'path.join(DOCS_DIR, chave) permanece dentro de DOCS_DIR' },
    { id: 'TC-04', scenario: 'unicidade em 50 chamadas' },
    { id: 'TC-05', scenario: 'MIME fora da tabela nao injeta extensao controlavel' },
    { id: 'TC-06', scenario: 'guarda: chave hostil escaparia — confinamento vem da geracao' }
  ],
  notExecuted: [
    { id: 'TC-07', scenario: 'acesso sem autenticacao -> 401', reason: 'exige app + banco (test:integration)' },
    { id: 'TC-08', scenario: 'acesso sem permissao -> 403', reason: 'idem' },
    { id: 'TC-09', scenario: 'documento de outro tecnico -> 404', reason: 'idem' },
    { id: 'TC-10', scenario: 'documento de outro tenant -> 404', reason: 'idem' },
    { id: 'TC-11', scenario: 'arquivo inexistente -> 404', reason: 'idem' }
  ],
  // Cenario deliberadamente ausente: "storageKey malicioso vindo do cliente".
  // Inalcancavel — o cliente nunca fornece storageKey. Inventa-lo inflaria a
  // contagem sem provar nada.
  unreachable: [{ scenario: 'storageKey controlado pelo cliente', why: 'gerado no servidor em :111' }]
};

/* -------------------------------- Finding ------------------------------ */
export const FINDING = {
  id: 'F-DOG-001',
  eosRun: RUN,
  environment: 'local',
  changeContract: CHANGE,
  testContract: 'TC-01..TC-06',
  acceptanceCriterion: 'A garantia de confinamento deve estar travada por teste',
  invariant: 'INV-PROOF-01',
  expected: 'comportamento seguro demonstrado por teste',
  observed: 'comportamento seguro, mas sem nenhum teste cobrindo a rota',
  reproduction: 'find chaveiro-bot/src -name "*.test.js" -path "*routes*" | xargs grep -l documento  ->  vazio',
  severity: 'MEDIUM',
  // NAO e SECURITY_DEFECT: nao ha vulnerabilidade. E ausencia de prova.
  category: 'TEST_DEFECT',
  owner: 'verification',
  collaborators: ['backend'],
  promotionStatus: 'BLOCKS_LOCAL_GATE',
  attempt: 1,
  evidence: { kind: 'command', ref: 'semgrep --config=p/owasp-top-ten src/routes/documentos.js',
              producedBy: 'semgrep 1.172.0' }
};

/* ------------------------------ Proof Ledger --------------------------- */
export const LEDGER = {
  eosRun: RUN,
  changeId: CHANGE,
  sliceId: 'SL-backend',
  primaryOwner: 'backend',
  changedFiles: [
    'chaveiro-bot/src/routes/documentos.js',
    'chaveiro-bot/src/routes/__tests__/documentos-storage-key.test.js'
  ],
  changedSymbols: ['gerarStorageKey'],
  testsExecuted: [
    { name: 'documentos-storage-key', command: 'npx vitest run src/routes/__tests__/documentos-storage-key.test.js', result: 'PASS' }
  ],
  applicableInvariants: [
    { id: 'INV-TENANT-01', description: 'query multi-tenant usa req.db' },
    { id: 'INV-PROOF-01', description: 'validacao nao executada e declarada' }
  ],
  invariantResults: [
    { id: 'INV-TENANT-01', result: 'PASS',
      evidenceRef: { kind: 'command', ref: 'documentos.js:143 req.db.documentoTecnico.findFirst({where:{id,tecnicoId}})', producedBy: 'leitura direta do codigo' } },
    { id: 'INV-PROOF-01', result: 'PASS',
      evidenceRef: { kind: 'artifact', ref: 'TEST_CONTRACT.notExecuted lista 5 cenarios declarados como nao executados' } }
  ],
  securityResult: { result: 'PASS',
    evidenceRef: { kind: 'scanner', ref: 'semgrep -> 1 WARNING, mantido sem supressao; premissa da regra refutada por documentos.js:111' } },
  integrationResult: { result: 'NOT_APPLICABLE' },
  knownLimitations: [
    'Cenarios de rota (401/403/cross-tenant/cross-user/arquivo ausente) exigem banco e NAO foram executados',
    'A prova cobre a geracao da chave, nao o handler HTTP ponta a ponta'
  ],
  unexpectedDependencies: [],
  evidenceRefs: [
    { kind: 'command', ref: 'grep -rn storageKey chaveiro-bot/src -> 9 ocorrencias, unico ponto de escrita em :111', producedBy: 'grep' },
    { kind: 'test', ref: 'vitest -> Test Files 1 passed, Tests 6 passed' },
    { kind: 'scanner', ref: 'semgrep -> express-res-sendfile WARNING linha 174, sem supressao' },
    { kind: 'diff', ref: 'git diff --stat -> documentos.js +17 -1, mais 1 arquivo de teste novo' }
  ],
  status: 'VERIFIED'
};

/* -------------------------------- execucao ----------------------------- */
// Comparacao por caminho resolvido: no Windows import.meta.url usa file:///C:/...
// enquanto `file://` + argv[1] gera file://C:/... — nunca casariam.
const invocadoDireto = process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invocadoDireto) {
  const risk = classify(REQUEST);
  const exec = route(REQUEST, { risk });
  const ks = kslice({ level: risk.level, surfaces: risk.affectedSurfaces, signals: ['fileAccess', 'tenant'] });

  console.log(`EOS dogfooding DOG-001 — ${RUN}\n`);
  console.log(`Risk      : ${risk.level} (security=${risk.vector.security} functional=${risk.vector.functional}) conf=${risk.confidence}`);
  console.log(`Engineers : ${exec.engineers.join(', ')} | primary=${exec.primaryOwner} | verif=${exec.verificationLevel}`);
  console.log(`Knowledge : ${ks._meta.bytes} B (${(ks._meta.fraction * 100).toFixed(1)}% do registro)`);

  const fErrs = validateFinding(FINDING);
  const fRoute = routeFinding(FINDING);
  console.log(`\nFinding   : ${FINDING.id} ${FINDING.category} -> owner=${fRoute.primary}` +
              `${fErrs.length ? ' | ERROS: ' + fErrs.join('; ') : ' | schema OK'}`);

  const overfit = detectTestOverfitting({ finding: FINDING, changedFiles: LEDGER.changedFiles, actor: 'backend' });
  console.log(`Overfit   : ${overfit.violation ? 'VIOLACAO ' + overfit.code : 'nao — diff toca produto e teste'}`);

  const v = validateLedger(LEDGER, { openFindings: [{ ...FINDING, blocking: true, status: 'CLOSED' }] });
  console.log(`\nProof Ledger: ok=${v.ok} status=${v.effectiveStatus}`);
  v.blockers.forEach((b) => console.log(`  BLOQUEIO: ${b}`));
  v.errors.forEach((e) => console.log(`  ERRO: ${e}`));

  const gate = v.ok && v.effectiveStatus === 'VERIFIED';
  console.log(`\nLOCAL GATE: ${gate ? 'PASS' : 'FAIL'}`);
  process.exit(gate ? 0 : 1);
}
