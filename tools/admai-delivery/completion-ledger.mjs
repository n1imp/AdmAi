/**
 * ADMAI_COMPLETION_LEDGER — o estado durável do PROGRAMA, item a item.  [F0-04]
 *
 * POR QUE EXISTE
 *   O programa de release atravessa fases, sessões e compactações de contexto. Os registries
 *   dizem o que o produto É (superfícies, features, achados); o WRITE_SET_HISTORY diz o que foi
 *   ESCRITO; nada dizia o que ainda há PARA FAZER, com que estado, bloqueado por quê e revisitado
 *   quando. Sem isso, compactação transforma SKIP em FORGET — exatamente o que a taxonomia proíbe.
 *
 * O QUE ELE NÃO É
 *   Não é observação: `run-state.mjs` deriva estado do git/filesystem; este ledger é JULGAMENTO
 *   DECLARADO (status de trabalho, bloqueios, condições de revisita). Fundir os dois faria a
 *   observação herdar opinião — a mesma separação declarado/observado que o run-state defende.
 *
 * REGRAS DE SCHEMA QUE SÃO POLÍTICA
 *   - `BLOCKED_*` exige `blockerRefs` + `revisitCondition` + `nextAction`: bloqueio sem condição
 *     de revisita é esquecimento com carimbo.
 *   - `DEFERRED_BY_SCOPE` exige `revisitCondition`: diferir sem porta de volta é descartar.
 *   - `DONE` exige `evidenceRefs`: feito sem evidência é declarado, não provado.
 *   - `findingRefs` de achado compartilhado (GAP-UX-…, GAP-LEGAL-…) precisam existir no
 *     surface-registry: referência a
 *     achado inexistente é o registry envelhecendo em silêncio.
 *
 * Dado em `docs/eos-v2/ADMAI_COMPLETION_LEDGER.json` (padrão dos irmãos RUN_STATE/WRITE_SET).
 * O JSON está em `ARTEFATOS_DO_GATE`: toda fatia o toca, e isenção que se vê é auditável.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
export const CAMINHO_LEDGER = path.join(RAIZ, 'docs/eos-v2/ADMAI_COMPLETION_LEDGER.json');

export const ESTADOS = Object.freeze([
  'NOT_READY',
  'READY',
  'IN_PROGRESS',
  'AWAITING_REVIEW',
  'CORRECTION_REQUIRED',
  'VERIFICATION_REQUIRED',
  'BLOCKED_EXTERNAL',
  'BLOCKED_D2',
  'BLOCKED_CAPABILITY',
  'BLOCKED_DEPENDENCY',
  'READY_BUT_REVIEW_BACKPRESSURED',
  'DONE',
  'DEFERRED_BY_SCOPE',
  // [D2 amendment 2026-08-23] diferido POR decisão D2 do usuário — preserva o finding, exige
  // revisitCondition, e NUNCA equivale a PASS/aceite.
  'DEFERRED_BY_D2',
]);
export const FASES = Object.freeze([
  'F0',
  'F0.5',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'SWEEP',
  'D2',
]);
export const AUTORIDADES = Object.freeze(['CLAUDE', 'CODEX_D1', 'USER_D2', 'EXTERNAL']);

/* Prefixos de referência com dono conhecido. Referência de prefixo desconhecido é violação:
   melhor uma recusa barulhenta agora que um id órfão descoberto no sweep final. */
const PREFIXOS_DE_REF = Object.freeze([
  'GAP-',
  'F-MAR-',
  'EV-',
  'Q-',
  'SEC-HB-',
  'D-',
  'SL-',
  'T-',
  'MVP-',
  'GATE-',
  // [STG-SEC amendment 2026-08-24] Classe de finding de seguranca descoberto no ambiente de
  // staging (ex.: STG-SEC-RLS-01 — RLS desabilitada + grants anon/authenticated). Dono: Claude.
  'STG-SEC-',
  // [STG-MIG-RECON 2026-08-24] Classe de finding de estado de migration do staging (ex.:
  // STG-MIG-SCHEMA-LAG-01 — staging 23/28 migrations, DocumentoTecnico ausente). Dono: Claude.
  'STG-MIG-',
]);

export function lerLedger(caminho = CAMINHO_LEDGER) {
  if (!existsSync(caminho)) return { estado: 'AUSENTE', itens: [] };
  try {
    const doc = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!Array.isArray(doc.itens)) return { estado: 'MALFORMADO', itens: [] };
    return { estado: 'OK', ...doc };
  } catch (e) {
    return { estado: 'ILEGIVEL', motivo: e.message, itens: [] };
  }
}

/** Achados compartilhados do surface-registry, para integridade referencial. Import tardio:
 *  o registry lê App.jsx no load, e o selftest deste módulo não deve depender do produto. */
async function idsDeAchados() {
  const m = await import('./surface-registry.mjs');
  return new Set(m.ACHADOS_COMPARTILHADOS.map((a) => a.id));
}

export function controles(ledger, { achados = null } = {}) {
  const casos = [];
  const itens = ledger.itens ?? [];
  const ids = new Set();

  casos.push(['ledger legível e com lista de itens', ledger.estado === 'OK']);
  casos.push(['schema declarado', ledger.schema === 'admai.delivery.completion-ledger/1']);
  casos.push([
    'pelo menos um item por fase de execução F0..F6',
    ['F0', 'F0.5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6'].every((f) =>
      itens.some((i) => i.phase === f)
    ),
  ]);

  const fora = [];
  for (const i of itens) {
    const alvo = (msg) => fora.push(`${i.workId ?? '(sem id)'}: ${msg}`);
    if (!i.workId || typeof i.workId !== 'string') alvo('workId ausente');
    else if (ids.has(i.workId)) alvo('workId duplicado');
    else ids.add(i.workId);
    if (!FASES.includes(i.phase)) alvo(`phase fora da taxonomia (${i.phase})`);
    if (!ESTADOS.includes(i.status)) alvo(`status fora da taxonomia (${i.status})`);
    if (!AUTORIDADES.includes(i.authority)) alvo(`authority fora da taxonomia (${i.authority})`);
    if (!i.description || i.description.length < 12) alvo('description curta demais');

    if (String(i.status).startsWith('BLOCKED_')) {
      if (!i.blockerRefs?.length) alvo('BLOCKED_* sem blockerRefs');
      if (!(i.revisitCondition?.length > 8)) alvo('BLOCKED_* sem revisitCondition');
      if (!(i.nextAction?.length > 8)) alvo('BLOCKED_* sem nextAction');
    }
    if (
      (i.status === 'DEFERRED_BY_SCOPE' || i.status === 'DEFERRED_BY_D2') &&
      !(i.revisitCondition?.length > 8)
    ) {
      alvo(`${i.status} sem revisitCondition — diferir sem porta de volta é descartar`);
    }
    if (i.status === 'DONE' && !i.evidenceRefs?.length) {
      alvo('DONE sem evidenceRefs — feito sem evidência é declarado, não provado');
    }
    for (const ref of i.findingRefs ?? []) {
      if (!PREFIXOS_DE_REF.some((p) => ref.startsWith(p)))
        alvo(`findingRef de prefixo desconhecido: ${ref}`);
      if (
        achados &&
        (ref.startsWith('GAP-UX-') || ref.startsWith('GAP-LEGAL-')) &&
        !achados.has(ref)
      ) {
        alvo(`findingRef aponta achado inexistente no surface-registry: ${ref}`);
      }
    }
  }
  for (const i of itens) {
    for (const dep of i.dependencies ?? []) {
      if (!ids.has(dep)) fora.push(`${i.workId}: dependency inexistente (${dep})`);
    }
  }

  casos.push(['todo item satisfaz o schema condicional', fora.length === 0, fora]);
  return casos;
}

export function resumo(ledger) {
  const porStatus = {};
  const porFase = {};
  for (const i of ledger.itens ?? []) {
    porStatus[i.status] = (porStatus[i.status] ?? 0) + 1;
    porFase[i.phase] = (porFase[i.phase] ?? 0) + 1;
  }
  return { total: (ledger.itens ?? []).length, porStatus, porFase };
}

/* ── Selftest: ledger sintético; cada regra provada nos dois sentidos ─────── */
export function autoteste() {
  const base = (extra = {}) => ({
    workId: 'X-01',
    phase: 'F0',
    domain: 'gate',
    description: 'item sintetico de teste',
    dependencies: [],
    priority: 'P1',
    risk: 'baixo',
    authority: 'CLAUDE',
    owner: 'claude',
    requiredReviewer: null,
    status: 'READY',
    blockerRefs: [],
    findingRefs: [],
    writeSetRef: null,
    evidenceRefs: [],
    attemptCount: 0,
    lastAttempt: null,
    nextAction: 'executar',
    revisitCondition: null,
    snapshotRef: null,
    ...extra,
  });
  const doc = (itens) => ({
    estado: 'OK',
    schema: 'admai.delivery.completion-ledger/1',
    itens: [
      ...['F0', 'F0.5', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6'].map((f, n) =>
        base({ workId: `PH-${n}`, phase: f })
      ),
      ...itens,
    ],
  });
  const falhas = (itens, opts) => {
    const caso = controles(doc(itens), opts).find(([r]) => r.startsWith('todo item'));
    return caso[1] ? [] : caso[2];
  };

  const casos = [
    ['ledger válido passa', falhas([]).length === 0],
    [
      'status fora da taxonomia reprova',
      falhas([base({ workId: 'X-02', status: 'pending' })]).length === 1,
    ],
    [
      'BLOCKED_* sem revisitCondition reprova (SKIP != FORGET como regra de schema)',
      falhas([base({ workId: 'X-03', status: 'BLOCKED_D2', blockerRefs: ['GAP-LEGAL-MODELO-01'] })])
        .length >= 1,
    ],
    [
      'BLOCKED_* completo passa',
      falhas([
        base({
          workId: 'X-04',
          status: 'BLOCKED_D2',
          blockerRefs: ['GAP-LEGAL-MODELO-01'],
          revisitCondition: 'usuario fornecer os textos',
          nextAction: 'aplicar textos no ponto unico',
        }),
      ]).length === 0,
    ],
    [
      'DEFERRED sem revisitCondition reprova',
      falhas([base({ workId: 'X-05', status: 'DEFERRED_BY_SCOPE' })]).length === 1,
    ],
    ['DONE sem evidência reprova', falhas([base({ workId: 'X-06', status: 'DONE' })]).length === 1],
    [
      'workId duplicado reprova',
      falhas([base({ workId: 'X-07' }), base({ workId: 'X-07' })]).length >= 1,
    ],
    [
      'dependency inexistente reprova',
      falhas([base({ workId: 'X-08', dependencies: ['NAO-EXISTE'] })]).length === 1,
    ],
    [
      'findingRef de prefixo desconhecido reprova',
      falhas([base({ workId: 'X-09', findingRefs: ['XYZ-123'] })]).length === 1,
    ],
    [
      'findingRef GAP-UX-* inexistente no registry reprova quando o registry é consultado',
      falhas([base({ workId: 'X-10', findingRefs: ['GAP-UX-INVENTADO-99'] })], {
        achados: new Set(['GAP-UX-REAL-01']),
      }).length === 1,
    ],
    [
      'authority fora da taxonomia reprova',
      falhas([base({ workId: 'X-11', authority: 'ROBO' })]).length === 1,
    ],
  ];
  return casos;
}

/* ── CLI (somente leitura — mutações no JSON são edições comuns sob write set) ── */
export const MODO_DE_ACESSO = 'READ_ONLY';
export const FLAGS = flagsDoModulo(import.meta.url);

export async function executar(argv = []) {
  const recusa = recusarDesconhecida(argv, FLAGS, {
    modos: ['--resumo', '--validar', '--por-fase', '--selftest'],
  });
  if (recusa !== null) return recusa;

  if (argv.includes('--selftest')) {
    const casos = autoteste();
    const falhos = casos.filter(([, ok]) => !ok);
    console.log('completion-ledger — selftest (ledger sintético; o real não é lido)');
    console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
    for (const [rotulo] of falhos) console.log(`    FAIL  ${rotulo}`);
    return falhos.length === 0 ? 0 : 1;
  }

  const ledger = lerLedger();

  if (argv.includes('--validar')) {
    const achados = await idsDeAchados();
    const casos = controles(ledger, { achados });
    const falhos = casos.filter(([, ok]) => !ok);
    console.log(
      `completion-ledger — validação do ledger real (${(ledger.itens ?? []).length} itens)`
    );
    console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
    for (const [rotulo, , detalhes] of falhos) {
      console.log(`    FAIL  ${rotulo}`);
      for (const d of (detalhes ?? []).slice(0, 12)) console.log(`          - ${d}`);
    }
    return falhos.length === 0 ? 0 : 1;
  }

  if (argv.includes('--por-fase')) {
    for (const fase of FASES) {
      const doFase = (ledger.itens ?? []).filter((i) => i.phase === fase);
      if (!doFase.length) continue;
      console.log(`\n${fase} (${doFase.length})`);
      for (const i of doFase) {
        console.log(
          `  ${String(i.status).padEnd(28)} ${i.workId.padEnd(24)} ${i.description.slice(0, 76)}`
        );
      }
    }
    return 0;
  }

  /* --resumo é o modo padrão E o explícito: retomada de sessão começa por aqui. O `includes`
     por extenso existe para a allowlist derivada — modo que só vive no fallback é invisível a
     `flagsDaFonte` e cairia em FLAG_DESCONHECIDA. */
  if (argv.includes('--resumo') || argv.every((a) => !a.startsWith('--'))) {
    // segue para o resumo abaixo
  }
  const r = resumo(ledger);
  console.log(`ADMAI_COMPLETION_LEDGER — ${r.total} itens  [${ledger.estado}]`);
  console.log('  por status :');
  for (const [k, v] of Object.entries(r.porStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k.padEnd(30)} ${v}`);
  }
  console.log(
    '  por fase   : ' +
      Object.entries(r.porFase)
        .map(([k, v]) => `${k}:${v}`)
        .join(' · ')
  );
  const bloqueados = (ledger.itens ?? []).filter((i) => String(i.status).startsWith('BLOCKED_'));
  if (bloqueados.length) {
    console.log('  bloqueados :');
    for (const i of bloqueados)
      console.log(`    ${i.workId.padEnd(24)} [${i.status}] revisita: ${i.revisitCondition}`);
  }
  console.log('\n  comandos canonicos do programa:  [F0-08]');
  console.log(
    '    selftests : node tools/eos/selftest/run.mjs · node tools/admai-delivery/write-set-gate.mjs --selftest'
  );
  console.log(
    '    write set : node tools/admai-delivery/write-set-declarar.mjs <spec.json> | --fechar [--nota t]'
  );
  console.log(
    '    captura   : CAPTURA_SENHA=... node chaveiro-painel/e2e/capturar.mjs <destino> <papel:usuario> <rotas...>'
  );
  console.log(
    '    seed demo : ALLOW_DEMO_SEED=true node --env-file=.env scripts/seed-demo.mjs --seed  (em chaveiro-bot/)'
  );
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('completion-ledger.mjs')) {
  executar(process.argv.slice(2)).then((c) => process.exit(c));
}
