/**
 * EOS V2 — verificacao do Proof System.
 *
 * Os casos NEGATIVOS sao o objeto principal do teste. Um validador que so
 * aprova o caso feliz nao foi verificado: ele so foi exercitado.
 *
 * Cada caso declara se `canPromote` deve ser verdadeiro. Um negativo que
 * passa e falha GRAVE — significa que o sistema aceitaria trabalho nao provado.
 */

import { validateLedger, canPromote } from './validate.mjs';

const RUN = 'EOS-RUN-TEST';

/** Ledger integro, usado como base. Cada caso negativo corrompe UM aspecto. */
const base = () => ({
  eosRun: RUN,
  changeId: 'CH-001',
  sliceId: 'SL-001',
  primaryOwner: 'backend',
  changedFiles: ['chaveiro-bot/src/routes/exemplo.js'],
  changedSymbols: ['listarExemplos'],
  testsExecuted: [
    { name: 'unit', command: 'npm test -- exemplo', result: 'PASS' }
  ],
  applicableInvariants: [{ id: 'INV-TENANT', description: 'queries usam req.db' }],
  invariantResults: [
    { id: 'INV-TENANT', result: 'PASS', evidenceRef: { kind: 'command', ref: 'rg "req.db" src/routes/exemplo.js', producedBy: 'rg' } }
  ],
  securityResult: { result: 'PASS', evidenceRef: { kind: 'scanner', ref: 'semgrep --severity ERROR -> exit 0' } },
  integrationResult: { result: 'NOT_APPLICABLE' },
  knownLimitations: [],
  unexpectedDependencies: [],
  evidenceRefs: [
    { kind: 'test', ref: 'npm test -- exemplo -> 12 passed' },
    { kind: 'diff', ref: 'git diff --stat -> 1 file changed' }
  ],
  status: 'VERIFIED'
});

const mutate = (fn) => { const l = base(); fn(l); return l; };

const CASES = [
  {
    id: 'PF-00', kind: 'POSITIVO',
    desc: 'ledger integro sustenta VERIFIED',
    ledger: base(), opts: {}, shouldPromote: true
  },
  {
    id: 'PF-01', kind: 'NEGATIVO',
    desc: 'prova ausente impede VERIFIED',
    ledger: mutate((l) => { l.evidenceRefs = []; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-02', kind: 'NEGATIVO',
    desc: 'teste falho impede VERIFIED',
    ledger: mutate((l) => { l.testsExecuted[0].result = 'FAIL'; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-03', kind: 'NEGATIVO',
    desc: 'invariante falho impede VERIFIED',
    ledger: mutate((l) => { l.invariantResults[0].result = 'FAIL'; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-04', kind: 'NEGATIVO',
    desc: 'Finding bloqueante aberto impede promocao',
    ledger: base(), opts: { openFindings: [{ id: 'F-9', blocking: true, status: 'OPEN' }] }, shouldPromote: false
  },
  {
    id: 'PF-05', kind: 'NEGATIVO',
    desc: 'texto livre "funciona" nao conta como prova',
    ledger: mutate((l) => { l.evidenceRefs = [{ kind: 'log', ref: 'funciona' }]; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-06', kind: 'NEGATIVO',
    desc: 'invariante aplicavel sem resultado registrado impede VERIFIED',
    ledger: mutate((l) => { l.invariantResults = []; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-07', kind: 'NEGATIVO',
    desc: 'invariante aprovado sem referencia de prova impede VERIFIED',
    ledger: mutate((l) => { delete l.invariantResults[0].evidenceRef; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-08', kind: 'NEGATIVO',
    desc: 'nenhum teste executado impede VERIFIED',
    ledger: mutate((l) => { l.testsExecuted = []; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-09', kind: 'NEGATIVO',
    desc: 'escopo nao declarado (changedFiles vazio) impede VERIFIED',
    ledger: mutate((l) => { l.changedFiles = []; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-10', kind: 'NEGATIVO',
    desc: 'origem de prova fora do catalogo e rejeitada',
    ledger: mutate((l) => { l.evidenceRefs = [{ kind: 'narrative', ref: 'revisei o codigo com atencao' }]; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-11', kind: 'NEGATIVO',
    desc: 'securityResult=PASS sem prova impede VERIFIED',
    ledger: mutate((l) => { l.securityResult = { result: 'PASS' }; }), opts: {}, shouldPromote: false
  },
  {
    id: 'PF-12', kind: 'NEGATIVO',
    desc: 'campo obrigatorio ausente impede VERIFIED',
    ledger: mutate((l) => { delete l.primaryOwner; }), opts: {}, shouldPromote: false
  }
];

console.log('EOS Proof System — verificacao\n');
let grave = 0, pass = 0;
for (const c of CASES) {
  const got = canPromote(c.ledger, c.opts);
  const ok = got === c.shouldPromote;
  if (ok) pass++; else grave++;
  const tag = ok ? 'PASS ' : 'GRAVE';
  console.log(`  [${tag}] ${c.id} (${c.kind})  ${c.desc}`);
  if (!ok) {
    const v = validateLedger(c.ledger, c.opts);
    console.log(`           esperado promover=${c.shouldPromote}, obtido=${got}`);
    console.log(`           status efetivo=${v.effectiveStatus}`);
    [...v.blockers, ...v.errors].slice(0, 4).forEach((m) => console.log(`           - ${m}`));
  }
}

const negativos = CASES.filter((c) => c.kind === 'NEGATIVO').length;
console.log(`\n  total=${CASES.length}  (negativos=${negativos})  pass=${pass}  grave=${grave}`);
console.log(grave === 0
  ? '\nRESULTADO: PASS — nenhum caminho aceita trabalho nao provado.'
  : '\nRESULTADO: FAIL — o validador aceitaria trabalho sem prova.');
process.exit(grave === 0 ? 0 : 1);
