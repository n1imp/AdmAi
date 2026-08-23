/**
 * Declara e FECHA write sets — o trilho de toda mutação do programa.  [F0-01]
 *
 * POR QUE ESTE ARQUIVO EXISTE AQUI, E NÃO NO SCRATCHPAD
 *   Por nove fatias este fluxo viveu em `declarar.mjs`/`fechar-*.mjs` no scratchpad da sessão —
 *   um diretório temporário que morre com ela. O gate (`write-set-gate.mjs`) sempre foi durável;
 *   o único jeito de ABRIR e FECHAR uma declaração, não. Uma retomada de sessão sem o scratchpad
 *   deixaria todo o programa sem trilho de mutação, com o gate íntegro porém inalcançável.
 *   É o primeiro item de F0 por exatamente esse motivo.
 *
 * O QUE MUDA NA PROMOÇÃO (além do endereço)
 *   - `LANES` deixa de ser caminho absoluto hardcoded de uma máquina: `HARNESS` é derivado da
 *     localização deste módulo, e `EOS` só existe se a worktree irmã existir no disco.
 *   - O fechamento vira modo de primeira classe (`--fechar`), com a mesma forma de registro que
 *     as nove fatias já arquivadas — inclusive `reconciliacao` opcional validada pelo gate.
 *   - Selftest contra caminhos INJETADOS: o teste nunca toca o livro-razão real. Um selftest que
 *     escrevesse `docs/eos-v2/WRITE_SET.json` para se provar seria o instrumento mutando o que
 *     observa (classe F-MAR-069).
 *
 * USO
 *   node tools/admai-delivery/write-set-declarar.mjs <spec.json>          # declara
 *   node tools/admai-delivery/write-set-declarar.mjs --fechar \
 *        [--nota "texto"] [--reconciliacao <arquivo.json>]               # fecha a viva
 *   node tools/admai-delivery/write-set-declarar.mjs --selftest
 *
 *   spec.json: { sliceId, titulo, notaDeMetodo?, artefatos?: [raizes],
 *                entradas: [{ lane: 'HARNESS'|'EOS', caminho, proposito, precisao? }] }
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arquivar,
  artefatosIgnorados,
  CLASSES_QUE_BLOQUEIAM,
  compararRodada,
  disposicaoValida,
  lerDeclaracao,
  observarSujos,
  shasDaLane,
} from './write-set-gate.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');

/**
 * Lanes DERIVADAS, nunca digitadas. `HARNESS` é o repositório onde este módulo vive; `EOS` é a
 * worktree irmã QUANDO existe — declarar contra lane ausente falha alto, em vez de criar baseline
 * de um caminho que só existia na máquina de quem escreveu o script.
 */
export function lanesDisponiveis(raiz = RAIZ) {
  const lanes = { HARNESS: raiz };
  const eos = path.resolve(raiz, '../EOS_BUILD_CLAUDE');
  if (existsSync(eos)) lanes.EOS = eos;
  return lanes;
}

const ARTEFATO = path.join(RAIZ, 'docs/eos-v2/WRITE_SET.json');
const HISTORICO = path.join(RAIZ, 'docs/eos-v2/WRITE_SET_HISTORY.json');

const sha256 = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex');

/**
 * Declara um write set. Arquiva a declaração viva antes — a lição da fatia ADMAI-P1-SWEEP, que
 * sumiu do livro-razão porque um `declarar` sobrescreveu o artefato sem arquivar. Se a viva já
 * está no histórico com a MESMA `declaradoEm`, não rearquiva: `arquivar()` recomputaria a
 * comparação sob HEAD possivelmente movido e transformaria um MATCH fechado em bloqueio novo.
 */
export function declarar(spec, {
  lanes = lanesDisponiveis(),
  caminhoArtefato = ARTEFATO,
  caminhoHistorico = HISTORICO,
} = {}) {
  if (!spec?.sliceId || !Array.isArray(spec.entradas) || spec.entradas.length === 0) {
    throw new Error('spec inválida: exige sliceId e entradas não vazias');
  }
  const usadas = [...new Set(spec.entradas.map((e) => e.lane))];
  for (const n of usadas) if (!lanes[n]) throw new Error(`lane desconhecida ou ausente no disco: ${n}`);

  const baselinePorLane = Object.fromEntries(usadas.map((n) => [n, shasDaLane(lanes[n])]));
  const sujosPorLane = Object.fromEntries(usadas.map((n) => [n, observarSujos(lanes[n])]));
  /* Sem este baseline a dimensão de artefato fica indisponível e o gate devolve
     UNKNOWN_DIFFERENCE — falha fechada, de propósito. */
  const artefatosPorLane = Object.fromEntries(usadas.map((n) => [n, artefatosIgnorados(lanes[n])]));

  const entradas = spec.entradas.map(({ lane, caminho, proposito, precisao = 'BOUNDED' }) => {
    const abs = path.join(lanes[lane], caminho);
    const existe = existsSync(abs);
    const sujo = sujosPorLane[lane].has(caminho);
    return {
      lane, caminho, precisao, proposito,
      existiaNaDeclaracao: existe,
      shaNaDeclaracao: existe ? sha256(abs) : null,
      sujoNaDeclaracao: sujo,
      ...(sujo ? { reescritaDeclarada: true, motivoDaReescrita: 'caminho ja sujo nesta frente' } : {}),
    };
  });

  const viva = lerDeclaracao(caminhoArtefato);
  const jaArquivada = (() => {
    try {
      const h = JSON.parse(readFileSync(caminhoHistorico, 'utf8'));
      return (h.declaracoes ?? []).some(
        (d) => String(d.sliceId).split('#')[0] === viva.sliceId && d.declaradoEm === viva.declaradoEm
      );
    } catch {
      return false;
    }
  })();
  let notaDeArquivo = null;
  if (viva.estado !== 'NOT_DECLARED' && !jaArquivada) {
    const r = arquivar(caminhoArtefato, caminhoHistorico);
    if (!r.arquivado) {
      throw new Error(
        `recusa: declaracao viva ${viva.sliceId ?? '(sem id)'} nao pode ser arquivada (${r.motivo})`
      );
    }
    notaDeArquivo = `arquivada a anterior: ${viva.sliceId} (${viva.estado})`;
  }

  const doc = {
    schema: 'admai.write-set/4',
    sliceId: spec.sliceId,
    titulo: spec.titulo,
    lanes: Object.fromEntries(usadas.map((n) => [n, lanes[n]])),
    estado: 'DECLARED',
    declaradoEm: new Date().toISOString(),
    baseCommitPorLane: Object.fromEntries(usadas.map((n) =>
      [n, execFileSync('git', ['-C', lanes[n], 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()])),
    cobertura: 'LANE_COMPLETA',
    ...(spec.notaDeMetodo ? { notaDeMetodo: spec.notaDeMetodo } : {}),
    baselinePorLane,
    artefatosPorLane,
    ...(spec.artefatos ? { artefatos: spec.artefatos } : {}),
    entradas,
  };
  writeFileSync(caminhoArtefato, `${JSON.stringify(doc, null, 2)}\n`);

  return {
    sliceId: spec.sliceId,
    entradas: entradas.length,
    aCriar: entradas.filter((e) => !e.existiaNaDeclaracao).length,
    sujos: entradas.filter((e) => e.sujoNaDeclaracao).length,
    artefatosNoBaseline: usadas.reduce((t, n) => t + Object.keys(artefatosPorLane[n] ?? {}).length, 0),
    notaDeArquivo,
  };
}

/**
 * Fecha a declaração VIVA: compara agora, grava o desfecho no artefato e no histórico.
 *
 * `provenance` segue a regra do próprio gate: HEAD movido não produz evidência
 * ORIGINAL_PRE_MUTATION — a comparação perdeu a base, e rotular o registro de original seria
 * exatamente o histórico reconstruído que o contrato proíbe.
 */
export function fechar({
  nota = null,
  reconciliacao = null,
  caminhoArtefato = ARTEFATO,
  caminhoHistorico = HISTORICO,
} = {}) {
  const d = lerDeclaracao(caminhoArtefato);
  if (d.estado === 'NOT_DECLARED') throw new Error('nada a fechar: nenhuma declaracao viva');
  if (d.estado === 'CLOSED') throw new Error(`ja fechada: ${d.sliceId}`);

  if (reconciliacao && !disposicaoValida(reconciliacao)) {
    throw new Error('reconciliacao invalida: disposicao/autorizadoPor/justificativa nao satisfazem o gate');
  }

  const r = compararRodada(d);
  const headMoveu = r.classe === 'UNKNOWN_DIFFERENCE' && String(r.motivo ?? '').startsWith('HEAD_MOVEU');
  Object.assign(d, {
    estado: 'CLOSED',
    comparacao: r.classe,
    escopoDaComparacao: r.escopo,
    lanesObservadas: r.lanes,
    provenance: headMoveu ? 'UNKNOWN_PROVENANCE' : 'ORIGINAL_PRE_MUTATION',
    bloqueiaIntegracao: CLASSES_QUE_BLOQUEIAM.includes(r.classe),
    ...(nota ? { nota } : {}),
    ...(reconciliacao ? { reconciliacao } : {}),
  });

  const h = (() => {
    try { return JSON.parse(readFileSync(caminhoHistorico, 'utf8')); }
    catch { return { declaracoes: [] }; }
  })();
  h.declaracoes.push(Object.fromEntries(
    ['sliceId', 'titulo', 'estado', 'comparacao', 'escopoDaComparacao', 'lanesObservadas',
      'provenance', 'bloqueiaIntegracao', 'nota', 'reconciliacao', 'declaradoEm']
      .filter((k) => d[k] !== undefined)
      .map((k) => [k, d[k]])
  ));
  h.geradoEm = new Date().toISOString();
  writeFileSync(caminhoHistorico, `${JSON.stringify(h, null, 2)}\n`);
  writeFileSync(caminhoArtefato, `${JSON.stringify({ ...d, aviso: 'Declaracao ENCERRADA.' }, null, 2)}\n`);

  return {
    sliceId: d.sliceId,
    classe: r.classe,
    escopo: r.escopo,
    bloqueia: d.bloqueiaIntegracao,
    ...(r.artefatosNaoDeclarados?.length ? { artefatosNaoDeclarados: r.artefatosNaoDeclarados } : {}),
  };
}

/* ── Selftest — sempre contra caminhos injetados, nunca o livro-razão real ── */

export function autoteste() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'ws-declarar-'));
  const lane = path.join(tmp, 'lane');
  mkdirSync(lane, { recursive: true });
  execFileSync('git', ['-C', lane, 'init', '-q']);
  execFileSync('git', ['-C', lane, 'config', 'user.email', 'a@b.c']);
  execFileSync('git', ['-C', lane, 'config', 'user.name', 't']);
  writeFileSync(path.join(lane, 'base.txt'), 'x');
  writeFileSync(path.join(lane, '.gitignore'), 'saida/\n');
  execFileSync('git', ['-C', lane, 'add', '-A']);
  execFileSync('git', ['-C', lane, 'commit', '-q', '-m', 'base']);

  const artefato = path.join(tmp, 'WS.json');
  const historico = path.join(tmp, 'WSH.json');
  const opts = { lanes: { T: lane }, caminhoArtefato: artefato, caminhoHistorico: historico };
  const spec = (id, caminho) => ({
    sliceId: id, titulo: 't', entradas: [{ lane: 'T', caminho, proposito: 'p' }],
  });

  const casos = [];
  const caso = (rotulo, fn) => {
    try { casos.push([rotulo, Boolean(fn())]); }
    catch (e) { casos.push([`${rotulo} — lancou: ${e.message}`, false]); }
  };
  const casoLanca = (rotulo, fn) => {
    try { fn(); casos.push([`${rotulo} — NAO lancou`, false]); }
    catch { casos.push([rotulo, true]); }
  };

  // Declarar grava baseline completo, inclusive a dimensão de artefato ignorado.
  const d1 = declarar(spec('S1', 'novo.txt'), opts);
  caso('declaracao grava DECLARED com baseline e artefatosPorLane', () => {
    const doc = JSON.parse(readFileSync(artefato, 'utf8'));
    return doc.estado === 'DECLARED' && doc.baselinePorLane?.T && doc.artefatosPorLane?.T !== undefined
      && d1.aCriar === 1;
  });

  // Escrever o declarado e fechar → MATCH, histórico ganha a linha.
  writeFileSync(path.join(lane, 'novo.txt'), 'conteudo');
  const f1 = fechar({ nota: 'fatia sintetica', ...opts });
  caso('fechamento computa classe e grava CLOSED no artefato e no historico', () => {
    const doc = JSON.parse(readFileSync(artefato, 'utf8'));
    const h = JSON.parse(readFileSync(historico, 'utf8'));
    return f1.classe === 'MATCH' && doc.estado === 'CLOSED'
      && h.declaracoes.length === 1 && h.declaracoes[0].sliceId === 'S1'
      && h.declaracoes[0].provenance === 'ORIGINAL_PRE_MUTATION';
  });

  // Declarar de novo: a fechada JÁ está no histórico → não rearquiva (sem #rearquivado-N).
  declarar(spec('S2', 'outro.txt'), opts);
  caso('declarar sobre fatia FECHADA nao a rearquiva (dedup por sliceId+declaradoEm)', () => {
    const h = JSON.parse(readFileSync(historico, 'utf8'));
    return h.declaracoes.length === 1
      && JSON.parse(readFileSync(artefato, 'utf8')).sliceId === 'S2';
  });

  // SABOTAGEM: escrita ignorada e não declarada aparece no fechamento e BLOQUEIA.
  mkdirSync(path.join(lane, 'saida'), { recursive: true });
  writeFileSync(path.join(lane, 'saida', 'clandestino.bin'), 'b');
  writeFileSync(path.join(lane, 'outro.txt'), 'ok');
  const f2 = fechar(opts);
  caso('SABOTAGEM: artefato ignorado nao declarado fecha como UNDECLARED_ARTIFACT_WRITE e bloqueia',
    () => f2.classe === 'UNDECLARED_ARTIFACT_WRITE' && f2.bloqueia === true
      && f2.artefatosNaoDeclarados?.some((c) => c.endsWith('saida/clandestino.bin')));

  // CONTRAPROVA: mesma escrita com a raiz declarada não acusa.
  declarar({ ...spec('S3', 'outro.txt'), artefatos: ['saida'] }, opts);
  writeFileSync(path.join(lane, 'saida', 'clandestino.bin'), 'bb');
  writeFileSync(path.join(lane, 'outro.txt'), 'ok2');
  const f3 = fechar(opts);
  caso('CONTRAPROVA: raiz de artefato declarada nao bloqueia',
    () => f3.classe !== 'UNDECLARED_ARTIFACT_WRITE' && f3.bloqueia === false);

  // HEAD movido → provenance NUNCA é original (regra do gate, agora no fechador).
  declarar(spec('S4', 'outro.txt'), opts);
  writeFileSync(path.join(lane, 'movido.txt'), 'm');
  execFileSync('git', ['-C', lane, 'add', '-A']);
  execFileSync('git', ['-C', lane, 'commit', '-q', '-m', 'move']);
  const f4 = fechar(opts);
  caso('HEAD movido fecha UNKNOWN_DIFFERENCE com UNKNOWN_PROVENANCE', () => {
    const h = JSON.parse(readFileSync(historico, 'utf8'));
    const ultimo = h.declaracoes[h.declaracoes.length - 1];
    return f4.classe === 'UNKNOWN_DIFFERENCE' && ultimo.provenance === 'UNKNOWN_PROVENANCE';
  });

  // Recusas que precisam ser altas.
  casoLanca('fechar sem declaracao viva recusa', () =>
    fechar({ caminhoArtefato: path.join(tmp, 'nao-existe.json'), caminhoHistorico: historico }));
  casoLanca('lane desconhecida recusa', () =>
    declarar(spec('S5', 'x.txt'), { ...opts, lanes: {} }));
  casoLanca('reconciliacao invalida recusa o fechamento', () => {
    declarar(spec('S6', 'outro.txt'), opts);
    fechar({ reconciliacao: { disposicao: 'INVENTADA' }, ...opts });
  });
  // Limpa a viva S6 para o tmp não ficar com declaração pendurada (higiene do teste).
  fechar(opts);

  caso('lanes derivadas incluem HARNESS e apontam para um repositorio git', () => {
    const l = lanesDisponiveis();
    return Boolean(l.HARNESS) && existsSync(path.join(l.HARNESS, '.git'));
  });

  rmSync(tmp, { recursive: true, force: true });
  return casos;
}

/* ── CLI ─────────────────────────────────────────────────────────────────── */

/** [H-01.9] Escreve o livro-razão (WRITE_SET.json / WRITE_SET_HISTORY.json). */
export const MODO_DE_ACESSO = 'MUTATING';
export const FLAGS = flagsDoModulo(import.meta.url);

/* O índice vem do CALL SITE como `argv.indexOf('--nota')` literal: é uma das três formas que
   `flagsDaFonte` reconhece. Esconder a flag numa variável fazia `--nota` cair em
   FLAG_DESCONHECIDA — a allowlist derivada só enxerga o que está escrito por extenso. */
function lerValor(argv, i, rotulo) {
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) throw new Error(`${rotulo} exige um valor`);
  return v;
}

export function executar(argv = []) {
  const recusa = recusarDesconhecida(argv, FLAGS, { modos: ['--fechar', '--selftest'] });
  if (recusa !== null) return recusa;

  if (argv.includes('--selftest')) {
    const casos = autoteste();
    const falhos = casos.filter(([, ok]) => !ok);
    console.log(`write-set-declarar — selftest (caminhos injetados; livro-razao real intocado)`);
    console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
    for (const [rotulo] of falhos) console.log(`    FAIL  ${rotulo}`);
    return falhos.length === 0 ? 0 : 1;
  }

  if (argv.includes('--fechar')) {
    const nota = lerValor(argv, argv.indexOf('--nota'), '--nota');
    const caminhoRec = lerValor(argv, argv.indexOf('--reconciliacao'), '--reconciliacao');
    const reconciliacao = caminhoRec ? JSON.parse(readFileSync(caminhoRec, 'utf8')) : null;
    const r = fechar({ nota, reconciliacao });
    console.log(`${r.sliceId} fechado: ${r.classe} | escopo ${r.escopo}${r.bloqueia ? ' | BLOQUEIA integracao' : ''}`);
    if (r.artefatosNaoDeclarados?.length) {
      console.log(`  artefatos nao declarados: ${r.artefatosNaoDeclarados.slice(0, 6).join(', ')}`);
    }
    return r.bloqueia ? 1 : 0;
  }

  const especPos = argv.find((a) => !a.startsWith('--'));
  if (!especPos) {
    console.log('uso: write-set-declarar.mjs <spec.json> | --fechar [--nota t] [--reconciliacao r.json] | --selftest');
    return 2;
  }
  const spec = JSON.parse(readFileSync(especPos, 'utf8'));
  const r = declarar(spec);
  if (r.notaDeArquivo) console.log(r.notaDeArquivo);
  console.log(
    `${r.sliceId} declarado | entradas: ${r.entradas}${r.aCriar ? ` (${r.aCriar} a criar)` : ''}` +
    ` | sujos: ${r.sujos} | artefatos ignorados no baseline: ${r.artefatosNoBaseline}`
  );
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('write-set-declarar.mjs')) {
  process.exit(executar(process.argv.slice(2)));
}
