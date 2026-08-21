/**
 * EOS — fronteira de slices e SEGURANÇA DE PARALELISMO.  [onda 1]
 *
 * A PERGUNTA QUE ESTE MÓDULO RESPONDE
 *   Quais slices podem correr ao mesmo tempo sem que um sobrescreva o outro?
 *
 *   "Dependência satisfeita" responde se um slice PODE COMEÇAR. Não responde se DOIS podem correr
 *   juntos — para isso é preciso olhar onde cada um ESCREVE. Dois slices prontos que gravam no
 *   mesmo subnamespace colidem, e a colisão aparece como trabalho perdido, não como erro.
 *
 * POR QUE ISTO É DERIVADO, E NÃO UMA LISTA
 *   As dependências saem do DAG do PLAN-G; os destinos de escrita, do `layout.mjs`. Uma lista
 *   escrita à mão ficaria correta hoje e mentiria quando um slice fosse verificado — que é a mesma
 *   razão pela qual o feature graph do produto é derivado.
 *
 * AS QUATRO CLASSES
 *   PARALLEL_SAFE       pronto, e nenhum outro slice pronto escreve no mesmo lugar
 *   PARALLEL_WITH_JOIN  pronto e sem colisão de escrita, mas com gate PRÓPRIO — pode correr junto
 *                       e precisa de ponto de encontro antes do gate
 *   SERIAL_REQUIRED     pronto, mas colide com outro slice pronto
 *   UNKNOWN_OVERLAP     destino de escrita não determinável pelo contrato → serializa
 *
 *   `UNKNOWN_OVERLAP` serializa por decisão: incerteza sobre colisão custa menos como espera do
 *   que como sobrescrita.
 *
 * PROVENANCE
 *   DAG e destinos vêm dos artefatos (OBSERVED). A classificação é DERIVED. Nada é INFERRED.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';

const PLANO_G = `${RAIZ}docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md`;

/**
 * Slices já verificados. DECLARADO a partir do estado registrado — é o único campo que não sai de
 * derivação, porque "verificado" é um gate fechado, não um fato do filesystem.
 */
export const VERIFICADOS = Object.freeze([
  'SL-BOOT-01', 'SL-BOOT-02', 'SL-BOOT-03', 'SL-BOOT-04', 'SL-A-01'
]);

/**
 * Onde cada slice da onda 1 escreve, conforme `layout.mjs` e a decisão
 * `D1-F-MAR-070-E-COLOCACAO`. DECLARADO com a fonte ao lado: o layout diz quem preenche cada
 * namespace, mas a colocação por SUBnamespace veio da decisão registrada.
 */
export const DESTINO_DE_ESCRITA = Object.freeze({
  'SL-A-02': { alvo: 'invariants/', fonte: 'layout.mjs: invariants.preenchidoPor' },
  'SL-A-03': { alvo: 'protocol/artifacts/', fonte: 'D1-F-MAR-070-E-COLOCACAO' },
  'SL-A-04': { alvo: 'protocol/artifacts/', fonte: 'D1-F-MAR-070-E-COLOCACAO: repositoryId em protocol/artifacts/' },
  'SL-A-05': { alvo: 'protocol/schemas/', fonte: 'D1-F-MAR-070-E-COLOCACAO: máquina de contrato em protocol/schemas/' },
  'SL-A-06': { alvo: 'protocol/events/', fonte: 'layout.mjs: subnamespace events' },
  'SL-A-07': { alvo: 'protocol/snapshots/', fonte: 'layout.mjs: subnamespace snapshots' },
  'SL-A-08': { alvo: 'protocol/versioning/', fonte: 'layout.mjs: subnamespace versioning' },
  'SL-A-09': { alvo: 'protocol/schemas/', fonte: 'D1-F-MAR-070-E-COLOCACAO: capability em protocol/schemas/' },
  'SL-A-10': { alvo: 'provenance/', fonte: 'layout.mjs: provenance.preenchidoPor' }
});

/** Slices com gate PRÓPRIO, distinto do gate da onda. */
export const GATE_PROPRIO = Object.freeze({ 'SL-A-07': 'SNAPSHOT_ID_FROZEN' });

/**
 * Extrai as dependências da onda 1 do bloco do DAG. Exportada: os controles atravessam ela.
 * `null` quando o PLAN-G não está acessível — ausência nunca vira grafo vazio.
 */
export function derivarDependencias(texto) {
  if (typeof texto !== 'string') return null;
  const deps = {};

  /* A LINHA DO DAG TEM ATÉ TRÊS ENTRADAS.  [defeito real desta função, corrigido na origem]
     A primeira versão fazia `(SL-A-\d+)\s*←\s*([^\n]*)`, engolindo o resto da linha. O bloco real
     é assim:

       SL-A-02 ← SL-A-01        SL-A-03 ← SL-A-01        SL-A-04 ← SL-A-01

     e o resultado era `SL-A-02` dependendo de `SL-A-03` e `SL-A-04` — invertendo a ordem do grafo.
     Meus controles não pegaram porque só testavam uma entrada por linha: a forma fácil, não a
     forma real. É a mesma lição da R6-02 do lado EOS, e desta vez o caso com a forma real do
     documento está entre os controles.

     A dependência para em `,` ou em espaço duplo — que é o separador entre entradas na mesma
     linha. Espaço simples continua dentro da lista, para `SL-A-08 ← SL-A-06, SL-K-01`. */
  for (const m of texto.matchAll(/(SL-[A-Z]+-\d+)\s*←\s*((?:SL-[A-Z]+-\d+)(?:,\s*SL-[A-Z]+-\d+)*)/g)) {
    const ids = [...m[2].matchAll(/SL-[A-Z]+-\d+/g)].map((x) => x[0]);
    deps[m[1]] = ids;
  }
  return Object.keys(deps).length ? deps : null;
}

/**
 * Classifica a fronteira. PURA nos argumentos — os controles percorrem este caminho.
 */
export function classificarFronteira({ dependencias, verificados, destinos, gatesProprios = {} }) {
  if (dependencias === null) {
    return { nos: [], veredito: 'UNKNOWN', motivo: 'DAG indisponível; sem ele nada pode ser classificado' };
  }

  const feito = new Set(verificados);
  const prontos = Object.entries(dependencias)
    .filter(([id, deps]) => !feito.has(id) && deps.every((d) => feito.has(d)))
    .map(([id]) => id);

  /* Colisão só importa entre slices PRONTOS: um bloqueado não vai escrever agora. */
  const porAlvo = {};
  for (const id of prontos) {
    const alvo = destinos[id]?.alvo ?? null;
    (porAlvo[alvo] ??= []).push(id);
  }

  const nos = Object.entries(dependencias).map(([id, deps]) => {
    const faltando = deps.filter((d) => !feito.has(d));
    if (feito.has(id)) return { id, estado: 'VERIFIED', classe: null, deps, faltando: [] };
    if (faltando.length) return { id, estado: 'BLOCKED', classe: null, deps, faltando };

    const alvo = destinos[id]?.alvo ?? null;
    if (alvo === null) {
      return { id, estado: 'READY', classe: 'UNKNOWN_OVERLAP', deps, faltando: [], alvo,
        motivo: 'destino de escrita não determinável pelo contrato; serializa por precaução' };
    }
    const concorrentes = (porAlvo[alvo] ?? []).filter((x) => x !== id);
    if (concorrentes.length) {
      return { id, estado: 'READY', classe: 'SERIAL_REQUIRED', deps, faltando: [], alvo,
        motivo: `colide em ${alvo} com ${concorrentes.join(', ')}` };
    }
    if (gatesProprios[id]) {
      return { id, estado: 'READY', classe: 'PARALLEL_WITH_JOIN', deps, faltando: [], alvo,
        motivo: `sem colisão, mas tem gate próprio ${gatesProprios[id]} — precisa de ponto de encontro antes dele` };
    }
    return { id, estado: 'READY', classe: 'PARALLEL_SAFE', deps, faltando: [], alvo,
      motivo: `escreve sozinho em ${alvo}` };
  });

  const seguros = nos.filter((n) => n.classe === 'PARALLEL_SAFE').map((n) => n.id);
  return {
    nos,
    maiorConjuntoSeguro: seguros,
    veredito: seguros.length ? 'PARALELISMO_SEGURO_IDENTIFICADO' : 'SEM_PARALELISMO_SEGURO'
  };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const texto = existsSync(PLANO_G) ? readFileSync(PLANO_G, 'utf8') : null;
  const dependencias = derivarDependencias(texto);
  const real = classificarFronteira({
    dependencias, verificados: VERIFICADOS, destinos: DESTINO_DE_ESCRITA, gatesProprios: GATE_PROPRIO
  });

  /* Controles do PARSER — atravessam `derivarDependencias`. */
  const casosDag = [
    ['SL-A-03 ← SL-A-01', { 'SL-A-03': ['SL-A-01'] }],
    ['SL-A-05 ← SL-A-03\nSL-A-06 ← SL-A-01', { 'SL-A-05': ['SL-A-03'], 'SL-A-06': ['SL-A-01'] }],
    ['SL-A-08 ← SL-A-06, SL-K-01', { 'SL-A-08': ['SL-A-06', 'SL-K-01'] }],
    ['SL-BOOT-01 ← (nenhum)', null],
    ['texto sem DAG', null],
    ['', null]
  ];
  const dagFalhos = casosDag
    .filter(([t, esp]) => JSON.stringify(derivarDependencias(t)) !== JSON.stringify(esp))
    .map(([t]) => JSON.stringify(t.slice(0, 30)));
  const nuloOk = derivarDependencias(null) === null;

  /* Controles da CLASSIFICAÇÃO — cada classe alcançável, e nenhuma é o padrão. */
  const d = { A: ['V'], B: ['V'], C: ['A'] };
  const casosClasse = [
    ['PARALLEL_SAFE quando escreve sozinho',
      classificarFronteira({ dependencias: { A: ['V'] }, verificados: ['V'], destinos: { A: { alvo: 'x/' } } })
        .nos.find((n) => n.id === 'A').classe === 'PARALLEL_SAFE'],
    ['SERIAL_REQUIRED quando dois prontos colidem',
      classificarFronteira({ dependencias: d, verificados: ['V'], destinos: { A: { alvo: 'x/' }, B: { alvo: 'x/' } } })
        .nos.find((n) => n.id === 'A').classe === 'SERIAL_REQUIRED'],
    ['PARALLEL_WITH_JOIN quando tem gate próprio',
      classificarFronteira({ dependencias: { A: ['V'] }, verificados: ['V'], destinos: { A: { alvo: 'x/' } }, gatesProprios: { A: 'G' } })
        .nos.find((n) => n.id === 'A').classe === 'PARALLEL_WITH_JOIN'],
    ['UNKNOWN_OVERLAP quando o destino é desconhecido',
      classificarFronteira({ dependencias: { A: ['V'] }, verificados: ['V'], destinos: {} })
        .nos.find((n) => n.id === 'A').classe === 'UNKNOWN_OVERLAP'],
    ['BLOCKED quando falta dependência',
      classificarFronteira({ dependencias: d, verificados: ['V'], destinos: { A: { alvo: 'x/' }, B: { alvo: 'y/' } } })
        .nos.find((n) => n.id === 'C').estado === 'BLOCKED'],
    ['bloqueado NÃO conta como concorrente',
      classificarFronteira({ dependencias: { A: ['V'], C: ['naoFeito'] }, verificados: ['V'], destinos: { A: { alvo: 'x/' }, C: { alvo: 'x/' } } })
        .nos.find((n) => n.id === 'A').classe === 'PARALLEL_SAFE'],
    ['DAG ausente não vira fronteira vazia',
      classificarFronteira({ dependencias: null, verificados: [], destinos: {} }).veredito === 'UNKNOWN']
  ];
  const classeFalhos = casosClasse.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('EOS — fronteira de slices e segurança de paralelismo  [onda 1]');
  console.log(`  verificados : ${VERIFICADOS.join(', ')}`);
  console.log(`  slices no DAG da onda 1 : ${real.nos.length}`);
  console.log('');
  for (const classe of ['PARALLEL_SAFE', 'PARALLEL_WITH_JOIN', 'SERIAL_REQUIRED', 'UNKNOWN_OVERLAP']) {
    const ns = real.nos.filter((n) => n.classe === classe);
    if (!ns.length) continue;
    console.log(`  ${classe} (${ns.length})`);
    for (const n of ns) console.log(`    ${n.id.padEnd(10)} ${n.motivo}`);
  }
  const bloqueados = real.nos.filter((n) => n.estado === 'BLOCKED');
  if (bloqueados.length) {
    console.log(`  BLOCKED (${bloqueados.length})`);
    for (const n of bloqueados) console.log(`    ${n.id.padEnd(10)} aguarda ${n.faltando.join(', ')}`);
  }
  console.log('');
  console.log(`  controles de parser do DAG   : ${casosDag.length - dagFalhos.length}/${casosDag.length}` +
    (dagFalhos.length ? ` — errou: ${dagFalhos.join(', ')}` : ''));
  console.log(`  DAG ausente devolve null     : ${nuloOk}`);
  console.log(`  controles de classificação   : ${casosClasse.length - classeFalhos.length}/${casosClasse.length}` +
    (classeFalhos.length ? ` — errou: ${classeFalhos.join('; ')}` : ''));

  if (dagFalhos.length || classeFalhos.length || !nuloOk) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use esta classificação');
    return 2;
  }

  console.log(`  MAIOR CONJUNTO SEGURO (${real.maiorConjuntoSeguro.length}) : ${real.maiorConjuntoSeguro.join(', ') || 'nenhum'}`);
  console.log('    derivado: dependência do DAG do PLAN-G, destino de escrita do layout e da decisão');
  console.log('      de colocação. Colisão só é contada entre slices PRONTOS — um bloqueado não vai');
  console.log('      escrever agora, e trata-lo como concorrente serializaria sem motivo.');
  console.log('    NÃO derivado: que os slices do conjunto seguro estejam especificados. Escrever em');
  console.log('      lugares diferentes evita SOBRESCRITA; não garante que os contratos entre eles');
  console.log('      sejam compatíveis. Isso é do DeepSpec de cada um, não deste grafo.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
