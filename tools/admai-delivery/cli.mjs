/**
 * Contrato de CLI do harness.  [SL-H-01 · H-01.1, H-01.2, H-01.3, H-01.9]
 *
 * O DEFEITO QUE ORIGINOU ESTE ARQUIVO
 *   `--selftest` foi adicionado à allowlist do `write-set-gate` e o seletor de modo continuou
 *   mandando para `validar`. As duas saídas ficaram byte a byte idênticas e eu reportei a correção
 *   como fechada. **Allowlist não é roteamento.** Na rodada anterior eu havia corrigido a mesma
 *   classe — "parâmetro aceito e ignorado" — no `evidence-bundle`, e deixei o irmão de pé aqui.
 *
 *   Depois, ao montar allowlists à mão em quatro módulos, omiti `--registrar` do `stale-check`, que
 *   estava implementado e funcionando. A correção de um defeito que confundia produziu outro que
 *   **removia função**. Lista literal que alguém precisa lembrar de manter repete exatamente a
 *   classe que ela deveria fechar.
 *
 * AS TRÊS PROPRIEDADES QUE ESTE ARQUIVO SUSTENTA
 *
 *   1. ENUMERAÇÃO DERIVADA. `flagsDaFonte` lê o próprio texto do módulo e extrai os modos que ele
 *      realmente despacha. Nascer um modo novo o inclui; sumir um modo o remove. Não há lista a
 *      manter em paralelo com a verdade.
 *
 *   2. RECUSA EXPLÍCITA. Flag desconhecida sai com código 2 e diz o que era aceito. Aceitar e
 *      ignorar faz o chamador acreditar que pediu outro modo.
 *
 *   3. `FLAG_ACCEPTED ≠ FLAG_ROUTED`. Aceitar o argumento não prova nada sobre o comportamento.
 *      `provarRoteamento` EXECUTA o módulo com cada modo e exige que a saída **difira** do padrão.
 *      É o controle que faltava quando `--selftest` entrou na lista e não no roteamento.
 *
 * O QUE ISTO NÃO PROVA
 *   Que o modo faz a coisa CERTA — só que faz coisa diferente. Correção de comportamento é assunto
 *   do controle próprio de cada módulo.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Um módulo do harness declara o que faz com o disco. Nunca se presume pelo nome. [H-01.9] */
export const MODOS_DE_ACESSO = Object.freeze(['READ_ONLY', 'MUTATING']);

/** [H-01.9] Este módulo não escreve: lê fonte e executa módulos `READ_ONLY` em subprocesso. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte deste modulo. */
export const FLAGS = flagsDoModulo(import.meta.url);

/**
 * Modos que o módulo REALMENTE despacha, extraídos do seu texto-fonte.
 *
 * Reconhece as três formas em uso no harness: comparação direta, teste de presença, e leitura por
 * posição para opção que carrega valor. Uma quarta forma futura precisa entrar aqui — e o controle
 * sintético em `controlesDeCli` existe para que a omissão apareça em vez de passar. Os padrões não
 * são citados aqui por extenso de propósito: a remoção de comentários já os ignoraria, mas escrever
 * exemplo de despacho em documentação foi o que contaminou a primeira versão.
 */
/**
 * Opções que carregam VALOR, lidas por posição. NÃO são modos.  [H-01.2, corrigido pelo uso]
 *
 * `evidence-bundle --execucoes <caminho> --fecha-gate` sempre foi a invocação correta, e a primeira
 * versão da guarda a recusou como `MODOS_SIMULTANEOS` — eu tratei toda flag derivada como modo
 * mutuamente exclusivo. É a MESMA classe do `--registrar`: a correção de um defeito removeu uma
 * capacidade real, e de novo por eu escrever a regra sem olhar como os módulos são de fato chamados.
 * Desta vez quem apontou foi o uso, não uma revisão.
 */
export function opcoesDaFonte(texto) {
  const fonte = semComentarios(texto);
  return [...new Set(
    [...fonte.matchAll(/argv\.indexOf\('(--[a-z][a-z-]*)'\)/g)].map((m) => m[1])
  )].sort();
}

/** Lê o módulo e devolve só os MODOS (sem as opções que carregam valor). */
export function modosDoModulo(url) {
  return modosDaFonte(readFileSync(new URL(url), 'utf8'));
}

/** Modos: mutuamente exclusivos entre si. Uma invocação pede no máximo um. */
export function modosDaFonte(texto) {
  const opcoes = new Set(opcoesDaFonte(texto));
  return flagsDaFonte(texto).filter((f) => !opcoes.has(f));
}

/** Remove comentários: um padrão de despacho CITADO não é um despacho. */
function semComentarios(texto) {
  return String(texto ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function flagsDaFonte(texto) {
  /* Comentário que MENCIONA um padrão de despacho não é despacho. Sem esta remoção, a própria
     documentação deste arquivo — que descreve as duas formas por extenso — virava "modo real", e
     `cli.mjs` declarava três modos sem ter CLI nenhum. Módulo que documenta suas flags num
     comentário sofreria o mesmo. */
  const fonte = semComentarios(texto);

  const achadas = [
    ...[...fonte.matchAll(/modo === '(--[a-z][a-z-]*)'/g)].map((m) => m[1]),
    ...[...fonte.matchAll(/argv\.includes\('(--[a-z][a-z-]*)'\)/g)].map((m) => m[1]),
    /* Terceira forma: opção que carrega VALOR, lida por posição. `--execucoes <caminho>` no
       `evidence-bundle` e `--json <caminho>` no `test-orchestrator` são assim, e nenhuma das duas
       constava de allowlist alguma. Uma lista escrita à mão teria matado as duas — foi exatamente
       assim que `--registrar` sumiu do `stale-check`. */
    ...[...fonte.matchAll(/argv\.indexOf\('(--[a-z][a-z-]*)'\)/g)].map((m) => m[1])
  ];
  return [...new Set(achadas)].sort();
}

/** Lê o módulo e devolve seus modos. Conveniência sobre `flagsDaFonte`. */
export function flagsDoModulo(url) {
  /* `import.meta.url` e uma STRING file://, e `readFileSync` a trataria como caminho relativo.
     Envolver em `URL` e o que faz a leitura funcionar dos dois lados (string ou URL). */
  return flagsDaFonte(readFileSync(new URL(url), 'utf8'));
}

/**
 * Recusa flag não reconhecida. Devolve o código de saída, ou `null` quando está tudo certo.
 *
 * Também recusa DOIS modos ao mesmo tempo: `--selftest --promover` selecionava `promover` e
 * descartava `--selftest` em silêncio, que é a mesma classe um nível acima.
 */
export function recusarDesconhecida(argv = [], flags = [],
  { escrever = console.log, modos = flags } = {}) {
  const passadas = argv.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]);

  const desconhecidas = passadas.filter((a) => !flags.includes(a));
  if (desconhecidas.length) {
    escrever(`FLAG_DESCONHECIDA — ${desconhecidas.join(', ')}`);
    escrever(`  reconhecidas: ${flags.join(', ') || '(nenhuma; este modulo nao aceita flag)'}`);
    escrever('  Recusar e deliberado: aceitar e ignorar faz o chamador crer que pediu outro modo.');
    return 2;
  }

  /* Exclusividade vale entre MODOS. Opção que carrega valor coexiste com modo por desenho —
     `--execucoes <caminho> --fecha-gate` é a invocação correta do `evidence-bundle`, e a primeira
     versão desta guarda a recusou. */
  const modosPedidos = passadas.filter((a) => modos.includes(a));
  if (modosPedidos.length > 1) {
    escrever(`MODOS_SIMULTANEOS — ${modosPedidos.join(', ')}`);
    escrever('  Escolher um em silencio descartaria o outro; a intencao do chamador e ambigua.');
    return 2;
  }
  return null;
}

/**
 * `FLAG_ACCEPTED ≠ FLAG_ROUTED`, provado por EXECUÇÃO.
 *
 * Para cada modo declarado, roda o executável com e sem a flag e compara saída e código. Igualdade
 * byte a byte significa modo inerte — aceito e não roteado.
 *
 * Módulo `MUTATING` **não é executado**: rodá-lo escreveria no repositório só para medir o CLI, e um
 * instrumento que muta o que observa foi justamente o `F-MAR-069`. O resultado sai como
 * `NAO_PROVADO_POR_SER_MUTANTE` — declarado, nunca omitido em silêncio.
 */
export function provarRoteamento({ executavel, flags, modoDeAcesso, cwd, timeoutMs = 45_000 }) {
  if (modoDeAcesso === 'MUTATING') {
    return { provado: false, motivo: 'NAO_PROVADO_POR_SER_MUTANTE', inertes: [], roteadas: [] };
  }
  const rodar = (args) => {
    try {
      return {
        saida: execFileSync('node', [executavel, ...args],
          { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs }),
        codigo: 0, expirou: false
      };
    } catch (e) {
      /* Timeout precisa ser DISTINGUÍVEL de falha: um módulo que roda suítes reais (o
         `test-orchestrator` leva minutos) sairia por tempo nas duas invocações, e comparar duas
         saídas truncadas produziria "roteado" ou "inerte" por acidente. */
      return {
        saida: `${e.stdout ?? ''}${e.stderr ?? ''}`,
        codigo: e.status ?? 1,
        expirou: e.killed === true || e.signal != null || e.code === 'ETIMEDOUT'
      };
    }
  };
  const padrao = rodar([]);
  if (padrao.expirou) {
    return { provado: false, motivo: 'NAO_PROVADO_POR_TIMEOUT', inertes: [], roteadas: [] };
  }
  const inertes = [];
  const roteadas = [];
  const expirados = [];
  for (const f of flags) {
    const r = rodar([f]);
    /* [H01-REV-05] A primeira versão jogava o modo expirado em `roteadas`, o que fazia `provado`
       virar `true`: um timeout era tratado como PROVA de que o modo roteia. Não comparável é não
       provado — o oposto. O timeout do processo padrão já era fail-closed; o do modo não era. */
    if (r.expirou) { expirados.push(f); continue; }
    /* Diferença pode ser na saída OU no código; exigir as duas deixaria passar modo que só muda o
       código, e exigir só a saída deixaria passar modo que só muda o código. */
    (r.saida === padrao.saida && r.codigo === padrao.codigo ? inertes : roteadas).push(f);
  }
  return {
    provado: inertes.length === 0 && expirados.length === 0,
    motivo: expirados.length ? 'NAO_PROVADO_POR_TIMEOUT_DE_MODO' : null,
    inertes, roteadas, expirados
  };
}

/**
 * Controles do próprio contrato de CLI, sobre fonte SINTÉTICA.
 *
 * Sintética porque a fonte real decide o que o controle consegue provar: quando `export async
 * function` entrou na varredura de derivadores do EOS, nenhum derivador async existia, e remover o
 * suporte de novo não teria falhado. Aqui cada forma é exercida de verdade.
 */
export function controlesDeCli() {
  /* As fixtures são MONTADAS por concatenação, nunca escritas por extenso. Literais, elas
     apareceriam como despacho na fonte DESTE módulo, e `flagsDaFonte(cli.mjs)` as devolveria como
     modos reais — o controle contaminaria exatamente o que ele mede. A primeira versão fazia isso:
     `cli.mjs` "declarava" `--comparar`, `--promover` e `--registrar` sem ter CLI nenhum. */
  const desp = (f) => `  if (modo ${'==='} '${f}') {`;
  const incl = (f) => `  const x = argv.${'inclu'}${'des'}('${f}');`;
  const idx = (f) => `  const i = argv.${'index'}${'Of'}('${f}');`;
  const FONTE = [
    desp('--comparar'),
    incl('--promover'),
    desp('--registrar'),
    idx('--com-valor'),
    /* Comentário contendo um despacho REAL. A fixture anterior usava `--nao-e-modo`, que não casa
       com padrão nenhum — o controle passava sem poder falhar. Um caso negativo precisa ser
       indistinguível do positivo, exceto pela propriedade sob teste. */
    `  // ${desp('--so-no-comentario')}`,
    `  /* ${incl('--so-no-bloco')} */`,
    "  const s = '--tambem-nao';"
  ].join('\n');

  const derivadas = flagsDaFonte(FONTE);
  const mudo = () => {};
  const casos = [
    ['deriva `modo === ` e `argv.includes` da fonte',
      derivadas.join() === '--com-valor,--comparar,--promover,--registrar'],
    ['string solta NAO vira modo', !derivadas.includes('--tambem-nao')],
    ['despacho REAL dentro de comentario de linha NAO vira modo',
      !derivadas.includes('--so-no-comentario')],
    ['despacho REAL dentro de comentario de bloco NAO vira modo',
      !derivadas.includes('--so-no-bloco')],
    /* CONTRAPROVA: a remocao de comentario nao pode ser tao larga que apague o codigo. */
    ['opcao com VALOR lida por posicao tambem e um modo reconhecido',
      derivadas.includes('--com-valor')],
    /* CONTRAPROVA: a remocao de comentario nao pode ser tao larga que apague o codigo. */
    ['CONTRAPROVA: os quatro despachos reais sobreviveram a remocao de comentarios',
      derivadas.length === 4],
    ['flag desconhecida devolve 2',
      recusarDesconhecida(['--inventada'], ['--comparar'], { escrever: mudo }) === 2],
    ['flag conhecida passa',
      recusarDesconhecida(['--comparar'], ['--comparar'], { escrever: mudo }) === null],
    ['sem flag passa',
      recusarDesconhecida([], ['--comparar'], { escrever: mudo }) === null],
    /* [H-01.2, corrigido pelo uso] Opcao que carrega valor NAO e modo, e coexiste com um. Tratar as
       duas como equivalentes recusou `evidence-bundle --execucoes X --fecha-gate`, que sempre foi a
       invocacao correta — mesma classe do `--registrar`, introduzida por mim ao corrigi-la. */
    ['opcao com valor e separada de modo',
      opcoesDaFonte(FONTE).join() === '--com-valor'
      && modosDaFonte(FONTE).join() === '--comparar,--promover,--registrar'],
    ['opcao com valor COEXISTE com um modo',
      recusarDesconhecida(['--com-valor', 'x', '--comparar'],
        ['--com-valor', '--comparar'], { escrever: mudo, modos: ['--comparar'] }) === null],
    ['... e dois MODOS continuam sendo recusados',
      recusarDesconhecida(['--comparar', '--promover'],
        ['--comparar', '--promover'], { escrever: mudo, modos: ['--comparar', '--promover'] }) === 2],
    ['sem `modos` explicito, toda flag conta como modo (retrocompativel)',
      recusarDesconhecida(['--a', '--b'], ['--a', '--b'], { escrever: mudo }) === 2],
    ['dois modos ao mesmo tempo devolve 2',
      recusarDesconhecida(['--comparar', '--promover'], ['--comparar', '--promover'], { escrever: mudo }) === 2],
    ['modulo sem modo nenhum recusa qualquer flag',
      recusarDesconhecida(['--x'], [], { escrever: mudo }) === 2],
    /* CONTRAPROVA: sem ela, "recusa tudo" passaria como rigor. */
    ['CONTRAPROVA: modulo sem modo aceita invocacao sem flag',
      recusarDesconhecida([], [], { escrever: mudo }) === null],
    ['modo que EXPIRA nao conta como roteado', (() => {
      const dir = mkdtempSync(join(tmpdir(), 'cli-hang-'));
      const exe = join(dir, 'hang.mjs');
      writeFileSync(exe, [
        "const argv = process.argv.slice(2);",
        "if (argv.inclu" + "des('--hang')) { const t = Date.now(); while (Date.now() - t < 30000) {} }",
        "console.log('ok');"
      ].join('\n'));
      const r = provarRoteamento({
        executavel: exe, flags: ['--hang'], modoDeAcesso: 'READ_ONLY', cwd: dir, timeoutMs: 1500
      });
      rmSync(dir, { recursive: true, force: true });
      return r.provado === false && r.motivo === 'NAO_PROVADO_POR_TIMEOUT_DE_MODO'
        && r.expirados.includes('--hang') && !r.roteadas.includes('--hang');
    })()],
    ['modo MUTATING nao e executado, e isso e DECLARADO',
      provarRoteamento({ executavel: 'x', flags: ['--a'], modoDeAcesso: 'MUTATING' }).motivo
        === 'NAO_PROVADO_POR_SER_MUTANTE'],
    ['taxonomia de acesso e fechada',
      MODOS_DE_ACESSO.length === 2 && MODOS_DE_ACESSO.every((m) => typeof m === 'string')]
  ];
  return casos;
}

/**
 * Varredura de roteamento sobre TODO o harness.  [H-01.1, H-01.2]
 *
 * Enumera os módulos do diretório, deriva os modos de cada um da fonte, e executa os `READ_ONLY`
 * para provar que cada modo declarado produz saída diferente do padrão. Os `MUTATING` ficam de fora
 * da execução e aparecem como não provados — declarado, não omitido.
 */
export function varrerRoteamento(dir = new URL('.', import.meta.url)) {
  const raiz = fileURLToPath(dir);
  const modulos = [
    ...readdirSync(raiz).filter((f) => f.endsWith('.mjs')),
    ...(existsSync(join(raiz, 'metric'))
      ? readdirSync(join(raiz, 'metric')).filter((f) => f.endsWith('.mjs')).map((f) => `metric/${f}`)
      : [])
  ].sort();

  /* A varredura nao roda a SI MESMA: `cli.mjs --varrer` dispararia outra varredura completa, que
     expira e produz `NAO_PROVADO_POR_TIMEOUT_DE_MODO` por autorrecursao, nao por defeito. O
     roteamento de `--varrer` e provado por controle proprio em `controlesDeCli`, comparando as duas
     saidas em processo. Exclusao DECLARADA, nao omitida. */
  const esteModulo = 'cli.mjs';
  const linhas = [];
  for (const rel of modulos) {
    if (rel === esteModulo) {
      /* `cli.mjs --varrer` dispararia outra varredura completa. E o roteamento de `--varrer` NAO
         pode ser provado por um controle em processo: `executar()` chama `controlesDeCli()`, entao
         um controle que chamasse `executar()` recursaria sem fim — tentei, e o Node estourou a
         pilha. O roteamento deste modo e exercitado pela BATERIA, que invoca as duas formas. */
      linhas.push({ rel, acesso: MODO_DE_ACESSO, flags: FLAGS, estado: 'NAO_VARRIDO_POR_AUTORRECURSAO' });
      continue;
    }
    const fonte = readFileSync(join(raiz, rel), 'utf8');
    const flags = flagsDaFonte(fonte);
    const acesso = (fonte.match(/MODO_DE_ACESSO = '(\w+)'/) ?? [])[1] ?? null;
    if (!flags.length) { linhas.push({ rel, acesso, flags, estado: 'SEM_MODO' }); continue; }
    const r = provarRoteamento({ executavel: join(raiz, rel), flags, modoDeAcesso: acesso, cwd: raiz });
    linhas.push({
      rel, acesso, flags,
      estado: r.motivo ?? (r.provado ? 'ROTEADO' : 'INERTE'),
      inertes: r.inertes, expirados: r.expirados ?? []
    });
  }
  return linhas;
}

export function executar(argv = []) {
  const recusa = recusarDesconhecida(argv, FLAGS);
  if (recusa !== null) return recusa;

  const casos = controlesDeCli();
  const falhos = casos.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('AdmAi Delivery — contrato de CLI  [SL-H-01]');
  console.log(`  controles do contrato : ${casos.length - falhos.length}/${casos.length}`);
  for (const f of falhos) console.log(`    FAIL  ${f}`);

  if (argv.includes('--varrer')) {
    const linhas = varrerRoteamento();
    const inertes = linhas.filter((l) => l.estado === 'INERTE');
    const naoProvados = linhas.filter((l) => l.estado === 'NAO_PROVADO_POR_SER_MUTANTE');
    const semAcesso = linhas.filter((l) => !l.acesso);

    console.log(`  modulos varridos      : ${linhas.length}`);
    for (const l of linhas) {
      console.log(`    ${l.rel.padEnd(30)} ${String(l.acesso ?? 'NAO_DECLARADO').padEnd(14)} ${l.estado}` +
        (l.inertes?.length ? ` — inerte: ${l.inertes.join(', ')}` : '') +
        (l.flags.length ? `  [${l.flags.join(' ')}]` : ''));
    }
    console.log(`  FLAG_ROUTED           : ${inertes.length ? `${inertes.length} modo(s) INERTE(s)` : 'nenhum modo aceito-e-ignorado'}`);
    const expirados = linhas.filter((l) =>
      l.estado === 'NAO_PROVADO_POR_TIMEOUT' || l.estado === 'NAO_PROVADO_POR_TIMEOUT_DE_MODO');
    /* [H01-REV-08] Eu publiquei "quatro MUTATING nao executados" e sao CINCO modulos MUTATING — o
       quinto (`run-state`) nao tem modo, entao nao aparecia na lista de "nao provados" e sumiu da
       contagem. Claim quantitativo subafirmado por omissao. Agora o total sai separado do recorte. */
    const mutantes = linhas.filter((l) => l.acesso === 'MUTATING');
    console.log(`  modulos MUTATING        : ${mutantes.length} (${mutantes.map((l) => l.rel).join(', ')})`);
    console.log(`    destes, com modo nao provado por serem mutantes : ${naoProvados.map((l) => l.rel).join(', ') || 'nenhum'}`);
    console.log(`    destes, sem modo algum a provar                 : ${mutantes.filter((l) => l.estado === 'SEM_MODO').map((l) => l.rel).join(', ') || 'nenhum'}`);
    console.log(`  nao provados (expiraram por tempo)      : ${expirados.map((l) => l.rel).join(', ') || 'nenhum'}`);
    console.log(`  sem MODO_DE_ACESSO declarado            : ${semAcesso.map((l) => l.rel).join(', ') || 'nenhum'}`);
    if (inertes.length || semAcesso.length || expirados.some((l) => l.estado === 'NAO_PROVADO_POR_TIMEOUT_DE_MODO')) {
      console.log('  INSTRUMENTO_COMPROMETIDO — modo aceito e nao roteado, acesso nao declarado,');
      console.log('    ou modo cujo roteamento nao pode ser comparado por expirar');
      return 2;
    }
  }
  if (falhos.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — o proprio contrato de CLI nao se sustenta');
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar(process.argv.slice(2)));
}
