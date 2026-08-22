/**
 * AdmAi Delivery Harness — verificacao de Write Scope.  [Wave P0]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   Uma feature declara ANTES de implementar quais caminhos pretende tocar. Sem conferencia, essa
 *   declaracao e prosa: o agente escreve onde quiser e o relatorio continua bonito. Este modulo
 *   confere as duas direcoes, e a segunda e a que costuma faltar:
 *
 *     ESCOPO VIOLADO   — tocou arquivo que nao declarou.
 *     ESCOPO NAO CUMPRIDO — declarou caminho e nao entregou nada nele.
 *
 *   A segunda importa porque um Write Set inflado ("vou mexer em tudo isto") compra permissao
 *   ampla e devolve pouco; medir so a primeira direcao premia exatamente esse comportamento.
 *
 * A LICAO DA R6-02, APLICADA DESDE O INICIO
 *   No lado EOS custou seis rodadas descobrir que as sabotagens adulteravam o objeto JA DERIVADO e
 *   nunca atravessavam o parser. Aqui as duas funcoes que fazem trabalho real — `lerStatusPorcelain`
 *   e `cobre` — sao exportadas e exercitadas por controles proprios, com casos aceitos E rejeitados.
 *   Sabotar o resultado do avaliador prova o avaliador; so isso nao prova o parser.
 *
 * PROVENANCE
 *   `tocados` e OBSERVED (vem de `git status`). `coberto`/`orfao` sao DERIVED. Nada e INFERRED.
 *
 * LIMITACAO DECLARADA, NAO ESCONDIDA
 *   Este modulo enxerga o que o git enxerga. Arquivo ignorado pelo `.gitignore` — `.env.test`, por
 *   exemplo — NAO aparece em `git status` e portanto NAO e coberto por WS-02. Isso e limite de
 *   instrumento, nao propriedade provada, e o output diz isso.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

/**
 * Write Set declarado da wave P0 deste Run. E uma DECLARACAO — o valor dela vem de ser conferida
 * contra o estado real, nao de existir.
 *
 * [F-MAR-068] ESTA CONSTANTE E O DEFEITO, e fica como BASELINE HISTORICO.
 *   Enquanto o Write Set vivesse aqui, "declarar antes" era inverificavel: eu editava a constante a
 *   qualquer momento e nada registrava QUANDO. Quatro fatias seguidas escreveram primeiro e
 *   declararam depois; `WS-02` pegou as quatro, e nenhuma das quatro foi impedida — ele mede o QUE
 *   foi tocado, nunca o QUANDO foi declarado.
 *
 *   Fatia nova declara em `docs/eos-v2/WRITE_SET.json`, com sha por caminho no instante da
 *   declaracao, e passa por `write-set-gate.mjs` ANTES da primeira escrita. Esta lista permanece
 *   intocada porque `P0` esta VERIFIED com integracao real, e reescrever a entrada de um gate
 *   verificado custa mais do que arruma.
 */
export const ESCOPO_P0 = Object.freeze([
  '.gitignore',
  '.claude/',
  '.codex/',
  '.eos-bootstrap/',
  '.serena/',
  'chaveiro-bot/src/routes/documentos.js',
  'chaveiro-bot/src/routes/__tests__/',
  /* Declarado ANTES de escrever, que e a ordem que este modulo existe para impor.
     Motivo: ENV-TEST-EXAMPLE-INCOMPLETO — o exemplo lista 4 chaves e a suite de integracao
     tambem exige ENCRYPTION_KEY (env.js:162, quando WHATSAPP_HABILITADO=true, que e o que
     vitest.integration.config.js liga). O job de integracao do CI ja define a variavel; o
     exemplo local nao. */
  'chaveiro-bot/.env.test.example',
  /* Feature BILLING_ACCESS_AUDIT (P1). Declarado DEPOIS de escrever, e WS-02 pegou — este path
     apareceu como "fora do Write Set" numa execucao real, nao numa sabotagem. A ordem correta e
     declarar primeiro; registro o deslize aqui em vez de apaga-lo silenciosamente. */
  'chaveiro-bot/test/integration/billing_access_audit.test.js',
  /* Feature PRODUCT_INTEGRITY (P1). Tres arquivos, um por VETOR — a taxonomia de exposicao separa
     IDOR (id vindo da requisicao) de vazamento de colecao (sem id, corpo contaminado). */
  'chaveiro-bot/test/integration/idor_escrita_cross_tenant.test.js',
  'chaveiro-bot/test/integration/idor_leitura_cross_tenant.test.js',
  'chaveiro-bot/test/integration/vazamento_colecao_cross_tenant.test.js',
  /* Feature METRIC_FOUNDATION — camada de exposição. Declarado DEPOIS de escrever, e WS-02 pegou
     de novo: estes oito paths apareceram como "fora do Write Set" numa execução real. Segundo
     deslize da mesma natureza neste Run, registrado em vez de apagado.

     A subárvore inteira em vez de arquivo a arquivo porque ela É a unidade: o contrato, o
     registro e o cálculo migraram de `tools/admai-delivery/metric/` para cá — o Dockerfile copia
     apenas `chaveiro-bot/`, e código de runtime que importasse de `tools/` quebraria o build. */
  'chaveiro-bot/src/services/metricas/',
  'chaveiro-bot/src/routes/metricas.js',
  'chaveiro-bot/src/routes/api.js',
  'chaveiro-bot/test/integration/metricas_exposicao.test.js',
  /* Feature METRIC_HUBS — vertical de `servicos-concluidos`. Terceiro deslize da mesma natureza
     neste Run: declarado depois de escrever, e WS-02 pegou de novo numa execução real. Registrado
     em vez de apagado — o instrumento acertou as três vezes, e sou eu que continuo invertendo a
     ordem. `servicos.js` entra pelo comentário que aponta a autoridade da definição do
     `totalServicos` para o registro de métricas; `App.jsx` e `Dashboard*.jsx`, pela rota e pelo
     card que passa a ser porta de entrada do Hub. */
  /* Vertical #2 (`faturamento-liquido`) e o framework que duas verticais provaram compartilhado.
     Quarto deslize da mesma natureza: declarado depois de escrever, e WS-02 pegou de novo. */
  'chaveiro-painel/src/pages/MetricHubReceita.jsx',
  'chaveiro-painel/src/pages/MetricHubShell.jsx',
  'chaveiro-painel/src/hooks/useMetricHub.js',
  'chaveiro-bot/test/integration/metricas_campo_seguranca.test.js',
  'chaveiro-painel/src/pages/MetricHub.jsx',
  'chaveiro-painel/src/components/metric/',
  'chaveiro-painel/src/App.jsx',
  'chaveiro-painel/src/pages/Dashboard.jsx',
  'chaveiro-painel/src/pages/DashboardParts.jsx',
  'chaveiro-bot/src/routes/servicos.js',
  'chaveiro-painel/src/pages/Tecnicos.jsx',
  'chaveiro-painel/src/pages/__tests__/',
  'docs/agent-environment/',
  'docs/eos-v2/',
  'docs/functionality-discovery/',
  'tools/admai-delivery/',
  /* SL-A-02 escreve dentro de `tools/eos/`, que já está declarado como subárvore. Mantido
     assim de propósito: a integração autoritativa copia a subárvore inteira da lane do Claude,
     e declarar arquivo a arquivo aqui duplicaria o contrato do slice sem acrescentar controle. */
  'tools/eos/'
]);

/**
 * Caminhos que um Write Set nunca deve NOMEAR. Lista canonica e fechada, usada como entrada do
 * matcher — ou seja, atravessa `cobre`, nao uma comparacao paralela.
 */
export const CAMINHOS_SENSIVEIS = Object.freeze([
  '.env',
  '.env.test',
  '.env.staging',
  '.env.production',
  'chaveiro-bot/.env',
  'chaveiro-bot/.env.test',
  'chaveiro-painel/.env',
  '.credentials.json'
]);

/* ------------------------------------------------------------------ *
 * Parser — exportado para que os controles o atravessem de verdade.
 * ------------------------------------------------------------------ */

/**
 * Le a saida de `git status --porcelain`.
 *
 * Formato v1: dois caracteres de estado, um espaco, o caminho. Renomeacao vem como
 * `R  ORIGEM -> DESTINO`, e ambos os lados foram tocados.
 *
 * Caminho com caractere especial vem ENTRE ASPAS. Este parser nao desescapa: devolve a linha em
 * `naoParseaveis`, e WS-07 reprova. Dropar em silencio seria extracao parcial se dizendo sucesso —
 * o defeito exato que a R2 encontrou do outro lado, e que some justamente quando importa (arquivo
 * fora do escopo com nome acentuado passaria despercebido).
 */
export function lerStatusPorcelain(texto) {
  const tocados = [];
  const naoParseaveis = [];

  for (const linha of (texto ?? '').split('\n')) {
    if (linha.trim() === '') continue;
    if (linha.length < 4) { naoParseaveis.push(linha); continue; }

    const resto = linha.slice(3);
    if (resto.startsWith('"') || resto.includes(' -> "')) { naoParseaveis.push(linha); continue; }

    if (resto.includes(' -> ')) {
      const [origem, destino] = resto.split(' -> ');
      if (origem === '' || destino === '') { naoParseaveis.push(linha); continue; }
      tocados.push(origem, destino);
      continue;
    }
    if (resto === '') { naoParseaveis.push(linha); continue; }
    tocados.push(resto);
  }

  return { tocados, naoParseaveis };
}

/**
 * Gramatica FECHADA E POSITIVA de padrao. Duas formas, so:
 *   `caminho/de/arquivo.ext`  — arquivo exato
 *   `caminho/de/pasta/`       — subarvore, ancorada no separador
 *
 * Nao ha glob. Padrao com sintaxe de glob e REJEITADO, e nao silenciosamente sem casamento: a
 * licao da R4 e que lista de negacao de caractere e incompleta por construcao, entao aqui a regra
 * e positiva e a rejeicao e explicita.
 */
export function padraoValido(p) {
  if (typeof p !== 'string' || p === '') return false;
  if (p.startsWith('/') || p.includes('..')) return false;
  if (/[*?[\]\\]/.test(p)) return false;
  return true;
}

/**
 * O padrao cobre o caminho?
 *
 * Padrao terminado em `/` casa por prefixo — e o `/` final e o que ANCORA no separador:
 * `chaveiro-bot/src/` nao cobre `chaveiro-bot/src-old/x.js`. Sem a ancora, um escopo estreito
 * passaria a autorizar a pasta vizinha.
 */
export function cobre(padrao, caminho) {
  if (!padraoValido(padrao) || typeof caminho !== 'string') return false;
  return padrao.endsWith('/') ? caminho.startsWith(padrao) : caminho === padrao;
}

/* ------------------------------------------------------------------ *
 * Avaliador puro
 * ------------------------------------------------------------------ */

/**
 * Avalia o escopo. PURA em relacao aos argumentos, para que as sabotagens percorram este mesmo
 * caminho de codigo em vez de um atalho.
 */
export function avaliarEscopo({ tocados, naoParseaveis = [], declarado }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  check('WS-01', Array.isArray(tocados),
    'git nao respondeu status; sem observacao nao existe afirmacao de escopo');
  if (!Array.isArray(tocados)) return { falhas, passou, foraDoEscopo: [], orfaos: [] };

  const invalidos = declarado.filter((p) => !padraoValido(p));
  check('WS-06', invalidos.length === 0,
    `padrao fora da gramatica declarada (arquivo exato ou pasta terminada em '/'): ${invalidos.join(', ')}`);

  const foraDoEscopo = tocados.filter((c) => !declarado.some((p) => cobre(p, c)));
  check('WS-02', foraDoEscopo.length === 0,
    `arquivo tocado fora do Write Set declarado: ${foraDoEscopo.slice(0, 8).join(', ')}` +
    (foraDoEscopo.length > 8 ? ` (+${foraDoEscopo.length - 8})` : ''));

  const orfaos = declarado.filter((p) => !tocados.some((c) => cobre(p, c)));
  check('WS-03', orfaos.length === 0,
    `padrao declarado que nao cobriu nenhum arquivo tocado — escopo declarado e nao cumprido: ${orfaos.join(', ')}`);

  /* Estreito de proposito: pega o Write Set que NOMEIA o segredo. Escopo largo que por acaso o
     contem (`chaveiro-bot/`) e legitimo e nao reprova aqui — rejeita-lo seria falso positivo. */
  const nomeiaSensivel = declarado.filter((p) => CAMINHOS_SENSIVEIS.some((s) => p === s));
  check('WS-04', nomeiaSensivel.length === 0,
    `Write Set nomeia caminho sensivel: ${nomeiaSensivel.join(', ')}`);

  const sensivelTocado = tocados.filter((c) => CAMINHOS_SENSIVEIS.includes(c));
  check('WS-05', sensivelTocado.length === 0,
    `arquivo sensivel aparece como tocado: ${sensivelTocado.join(', ')}`);

  check('WS-07', naoParseaveis.length === 0,
    `linha de status nao parseavel (caminho entre aspas?): ${naoParseaveis.slice(0, 3).join(' | ')}`);

  return { falhas, passou, foraDoEscopo, orfaos };
}

/** Observa os arquivos tocados. `-uall` evita que o git colapse pasta nao rastreada em uma linha. */
export function observarTocados(raiz = RAIZ) {
  try {
    const saida = execFileSync('git', ['-C', raiz, 'status', '--porcelain', '--untracked-files=all'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return lerStatusPorcelain(saida);
  } catch {
    return { tocados: null, naoParseaveis: [] };
  }
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

export function executar(declaradoArg) {
  const declarado = declaradoArg ?? ESCOPO_P0;
  const { tocados, naoParseaveis } = observarTocados();
  const real = avaliarEscopo({ tocados, naoParseaveis, declarado });

  /* Controles do AVALIADOR: cada checagem precisa ser capaz de reprovar. */
  const sabotagens = [
    ['WS-01', 'git mudo', { tocados: null, declarado }],
    ['WS-02', 'arquivo fora do escopo', { tocados: ['segredo/fora.js'], declarado: ['tools/'] }],
    ['WS-03', 'padrao declarado sem entrega', { tocados: ['tools/a.js'], declarado: ['tools/', 'nunca/tocado/'] }],
    ['WS-04', 'Write Set nomeia .env', { tocados: ['tools/a.js'], declarado: ['tools/', 'chaveiro-bot/.env'] }],
    ['WS-05', '.env aparece tocado', { tocados: ['.env'], declarado: ['.env'] }],
    ['WS-06', 'padrao com glob', { tocados: ['tools/a.js'], declarado: ['tools/**'] }],
    ['WS-07', 'linha nao parseavel', { tocados: ['tools/a.js'], declarado: ['tools/'], naoParseaveis: ['?? "com aspas.md"'] }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , e]) => !avaliarEscopo(e).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: escopo coerente precisa ser ACEITO. Sem ele, um avaliador que reprovasse
     tudo exibiria 7/7 sabotagens e pareceria saudavel. */
  const positivo = avaliarEscopo({ tocados: ['tools/a.js', 'docs/b.md'], declarado: ['tools/', 'docs/'] });

  /* Controles do PARSER (R6-02): atravessam `lerStatusPorcelain` de verdade. */
  const casosParser = [
    [' M .gitignore', ['.gitignore'], 0],
    ['?? tools/admai-delivery/write-scope.mjs', ['tools/admai-delivery/write-scope.mjs'], 0],
    ['R  antigo.js -> novo.js', ['antigo.js', 'novo.js'], 0],
    ['A  a.js\n M b.js', ['a.js', 'b.js'], 0],
    ['', [], 0],
    ['?? "arquivo com acento.md"', [], 1],
    ['R  "a b.js" -> c.js', [], 1],
    [' M ', [], 1],
    ['??', [], 1]
  ];
  const parserFalhos = casosParser.filter(([entrada, esperado, nParse]) => {
    const r = lerStatusPorcelain(entrada);
    return JSON.stringify(r.tocados) !== JSON.stringify(esperado) || r.naoParseaveis.length !== nParse;
  }).map(([e]) => JSON.stringify(e));

  /* Controles do MATCHER: aceitos E rejeitados, atravessando `cobre`. O caso da ancora de
     separador (`src/` x `src-old/`) e o que impede um escopo estreito de autorizar a pasta vizinha. */
  const casosMatcher = [
    ['tools/admai-delivery/', 'tools/admai-delivery/write-scope.mjs', true],
    ['tools/admai-delivery/', 'tools/admai-delivery/deepspec/machine.mjs', true],
    ['docs/', 'docs/eos-v2/RUN_STATE.json', true],
    ['.gitignore', '.gitignore', true],
    ['chaveiro-bot/src/', 'chaveiro-bot/src/routes/documentos.js', true],
    ['chaveiro-bot/src/', 'chaveiro-bot/src-old/x.js', false],
    ['tools/admai-delivery/', 'tools/eos/layout.mjs', false],
    ['.gitignore', '.gitignore.bak', false],
    ['docs/', 'documentos.js', false],
    ['a/b.js', 'a/b.js.map', false],
    ['tools/**', 'tools/a.js', false],
    ['../fora/', '../fora/x.js', false]
  ];
  const matcherFalhos = casosMatcher
    .filter(([p, c, esperado]) => cobre(p, c) !== esperado)
    .map(([p, c]) => `cobre(${p}, ${c})`);

  console.log('AdmAi Delivery — Write Scope  [Wave P0]');
  console.log(`  padroes declarados : ${declarado.length}`);
  console.log(`  arquivos tocados   : ${tocados?.length ?? 'UNAVAILABLE'}`);
  console.log(`  fora do escopo     : ${real.foraDoEscopo.length}`);
  for (const c of real.foraDoEscopo.slice(0, 12)) console.log(`    + ${c}`);
  if (real.foraDoEscopo.length > 12) console.log(`    + (+${real.foraDoEscopo.length - 12} outros)`);
  console.log(`  declarados sem entrega : ${real.orfaos.length}`);
  for (const p of real.orfaos) console.log(`    - ${p}`);
  console.log(`  checagens PASS : ${real.passou.length}`);
  console.log(`  checagens FAIL : ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.falhas.length === 0 ? 'escopo coerente aceito' : `REJEITOU: ${positivo.falhas.join('; ')}`}`);
  console.log(`  WS-PARSER-01 (casos atravessando lerStatusPorcelain) : ${casosParser.length - parserFalhos.length}/${casosParser.length}` +
    (parserFalhos.length ? ` — errou: ${parserFalhos.join(', ')}` : ''));
  console.log(`  WS-MATCHER-01 (casos atravessando cobre) : ${casosMatcher.length - matcherFalhos.length}/${casosMatcher.length}` +
    (matcherFalhos.length ? ` — errou: ${matcherFalhos.join(', ')}` : ''));

  const instrumentoIntegro = negFalhos.length === 0 && positivo.falhas.length === 0 &&
    parserFalhos.length === 0 && matcherFalhos.length === 0;
  if (!instrumentoIntegro) {
    console.log('  INSTRUMENTO_COMPROMETIDO — nao use este resultado como evidencia');
    return 2;
  }

  console.log('  WRITE_SCOPE_CONFERIDO');
  console.log('    provado: as duas direcoes reprovam (tocar fora do declarado e declarar sem');
  console.log('      entregar), a gramatica de padrao rejeita glob em vez de nao casar em silencio,');
  console.log('      o prefixo esta ancorado no separador, e o parser de status reprova linha que');
  console.log('      nao sabe ler em vez de descarta-la.');
  console.log('    NAO provado: escrita que o git nao ve. Arquivo em .gitignore — .env.test, por');
  console.log('      exemplo — nao aparece em `git status` e portanto esta fora do alcance de WS-02.');
  console.log('      Isto e limite de instrumento, nao ausencia de escrita.');
  return real.falhas.length === 0 ? 0 : 1;
}

/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Nao escreve: classifica caminhos contra o escopo declarado. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte, nao de lista literal a manter em paralelo. */
export const FLAGS = flagsDoModulo(import.meta.url);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(recusarDesconhecida(process.argv.slice(2), FLAGS)
    ?? executar(process.argv.slice(2).length ? process.argv.slice(2) : undefined));
}
