/**
 * Pre-Mutation Write Set Gate.  [F-MAR-068]
 *
 * O DEFEITO QUE ORIGINOU ESTE ARQUIVO
 *   Quatro fatias consecutivas escreveram primeiro e declararam o Write Set depois. O `WS-02` pegou
 *   as quatro — o instrumento acertou todas as vezes. O que falhava era a ORDEM, e ordem não é algo
 *   que `WS-02` consiga medir: ele compara o que foi tocado com o que está declarado, e nada ali
 *   distingue uma declaração feita antes de uma feita depois.
 *
 *   Quatro ocorrências são evidência suficiente para mudar o sistema em vez de esperar disciplina.
 *   "Lembrar de declarar antes" já foi refutado empiricamente.
 *
 * A IDEIA QUE TORNA A ORDEM VERIFICÁVEL
 *   Uma declaração só é credível como PRÉVIA se estiver ancorada a um estado do repositório
 *   anterior à mutação. Por isso `WRITE_SET.json` grava, no instante da declaração, o `sha256` de
 *   cada caminho declarado.
 *
 *   Daí sai a assinatura de declaração retroativa, que é o coração deste módulo:
 *
 *     caminho declarado que JÁ DIFERIA do HEAD quando foi declarado
 *     E que NÃO MUDOU depois
 *       -> foi escrito antes de ser declarado
 *
 *   Enquanto o Write Set fosse uma constante no código-fonte (`ESCOPO_P0`), essa distinção não
 *   existia: eu editava a constante a qualquer momento e nada registrava quando.
 *
 * FORÇA REAL — e o que este arquivo NÃO faz
 *   Hooks estão desligados no projeto e o contrato do repositório proíbe criá-los para este fluxo.
 *   Logo este gate NÃO intercepta chamada de ferramenta e NÃO contém o filesystem: qualquer
 *   processo continua podendo escrever onde quiser.
 *
 *     escrita não declarada       DETECTIVE        — detectada por comparação, depois do fato
 *     declaração retroativa       DETECTIVE        — detectada pela assinatura sha, depois do fato
 *     bloqueio de integração      COORDINATION_ONLY — informa; nada obriga a consultar
 *     filesystem                  NENHUMA          — não há contenção, e não se finge que há
 *
 *   [R26-02] Este bloco dizia `POLICY_ENFORCED — UNDECLARED_WRITE bloqueia integração`. O revisor
 *   procurou o ponto de imposição e não achou: `bloqueiosAbertos()` não tinha um único chamador, e
 *   nenhum launcher, CI ou passo de integração invoca este módulo obrigatoriamente. Pela definição
 *   do PLAN-A, `POLICY_ENFORCED` exige um componente que intercepte a integração ANTES do efeito.
 *   Não existe. O que existe é detecção, e a classe agora diz isso.
 *
 *   Elevar para `POLICY_ENFORCED` exige escolher ONDE a integração passa a ser barrada — decisão
 *   material sobre o fluxo, não uma linha de código. Registrada como `F-MAR-071`, aberta.
 *
 *   `MAR-INV-025` era exatamente isto: descrever garantia mais forte que a provada. A ferramenta
 *   feita para impedir a violação da regra a violava no próprio cabeçalho, por seis rodadas.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

export const ARTEFATO = `${RAIZ}docs/eos-v2/WRITE_SET.json`;

/** Estados do Write Set. Só `VALIDATED` satisfaz `MUTATION_READY`. */
export const ESTADOS = Object.freeze(['NOT_DECLARED', 'DECLARED', 'VALIDATED', 'INVALIDATED']);

/** Precisão declarável por entrada. `UNKNOWN` em área material serializa — não autoriza paralelo. */
export const PRECISOES = Object.freeze(['EXACT', 'BOUNDED', 'EXPECTED', 'UNKNOWN']);

/** Classificação de `DECLARED × OBSERVED`. */
export const CLASSES_DE_COMPARACAO = Object.freeze([
  'MATCH', 'OBSERVED_SUBSET', 'AUTHORIZED_EXPANSION', 'UNDECLARED_WRITE', 'UNKNOWN_DIFFERENCE'
]);

const sha = (caminho) =>
  (existsSync(caminho) ? createHash('sha256').update(readFileSync(caminho)).digest('hex') : null);

/**
 * Caminhos sujos, ARQUIVO A ARQUIVO.
 *
 * `-uall` é obrigatório: sem ele o porcelain devolve `docs/eos-v2/` como UMA linha quando o
 * diretório é não rastreado, e a sujeira por arquivo fica inderivável. A primeira versão desta
 * função usou o porcelain padrão e marcou como "já sujo" até arquivo que não existia — o prefixo
 * do diretório casava com tudo abaixo dele.
 */
export function observarSujos(raiz = RAIZ) {
  const saida = execFileSync('git', ['-C', raiz, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  const fora = new Set();
  for (const linha of saida.split('\n')) {
    if (linha.length <= 3) continue;
    const resto = linha.slice(3).trim();
    for (const parte of resto.includes(' -> ') ? resto.split(' -> ') : [resto]) {
      if (parte) fora.add(parte.replace(/\\/g, '/').replace(/^"|"$/g, ''));
    }
  }
  return fora;
}

/**
 * Sha de TODO arquivo da lane — rastreados e não rastreados. É o BASELINE que a declaração congela.
 *
 * Sem baseline algum, `observado` só podia vir do chamador, e um chamador que o derive de
 * `declarado` produz `MATCH` por construção (R21–R23).
 *
 * [R25-02] A primeira versão percorria só `git status`, ou seja, só o que JÁ ESTAVA SUJO — e eu
 * escrevi "sha de toda a lane" mesmo assim. Arquivo limpo na declaração, escrito e depois
 * commitado, saía dos sujos e sumia da observação. São 628 arquivos nas duas lanes: a versão
 * estreita não economizava nada, só tornava a frase falsa.
 *
 * LIMITE QUE PERMANECE, e que sha nenhum resolve: isto compara DIFERENÇA LÍQUIDA contra o
 * baseline, não histórico de escritas. Arquivo escrito e depois restaurado ao conteúdo do baseline
 * é invisível aqui. Detectar isso exigiria interceptar a chamada de escrita — hooks, proibidos
 * neste fluxo por contrato. O limite fica declarado; não é contornado nem omitido.
 */
export function shasDaLane(raiz = RAIZ) {
  const lista = execFileSync(
    'git', ['-C', raiz, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  ).split('\0').filter(Boolean);

  const fora = {};
  for (const caminho of lista) {
    const abs = join(raiz, caminho);
    try {
      fora[caminho] = statSync(abs).isFile()
        ? createHash('sha256').update(readFileSync(abs)).digest('hex')
        : null;
    } catch {
      fora[caminho] = null;   // ilegível agora: entra como diferença, não como ausência silenciosa
    }
  }
  return fora;
}

/**
 * Escrita REALMENTE observada na lane desde a declaração, derivada do baseline — nunca recebida.
 *
 * Um caminho entra por três vias independentes: apareceu sujo agora e não existia no baseline;
 * existia e mudou de sha; ou sumiu da lista de sujos (revertido ou commitado durante a rodada).
 * Nenhuma delas consulta `declarado`, então `UNDECLARED_WRITE` volta a ser alcançável.
 *
 * Declaração sem baseline não devolve lista vazia — devolve indisponibilidade. Lista vazia
 * significaria "nada foi escrito", que é a afirmação forte que não se pode fazer sem o baseline.
 */
/**
 * O caminho passou a ser ignorado pelo git?  [H-01.11]
 *
 * `check-ignore` sai 0 quando o caminho casa com uma regra de ignore, 1 quando não. Só isso separa
 * "deixou de ser rastreado" de "foi apagado" — e nenhuma das duas é "foi escrito".
 */
export function ignorado(raiz, caminho) {
  try {
    execFileSync('git', ['-C', raiz, 'check-ignore', '-q', '--', caminho], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function observarEscritaDaLane(declaracao, raiz) {
  const base = declaracao?.baselineDaLane;
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    return { disponivel: false, motivo: 'DECLARACAO_SEM_BASELINE_DA_LANE', observado: null };
  }
  const lane = raiz ?? declaracao.lane ?? RAIZ;
  const agora = shasDaLane(lane);
  const observado = new Set();
  const ignoradosAgora = new Set();

  for (const [caminho, sha] of Object.entries(agora)) {
    if (!(caminho in base) || base[caminho] !== sha) observado.add(caminho);
  }

  /* [H-01.11] Sumir da listagem tinha TRÊS causas tratadas como uma: revertido, commitado, ou
     **passou a ser ignorado**. A terceira não é escrita — nada foi escrito no arquivo; o que mudou
     foi a regra de rastreamento, tipicamente por uma edição de `.gitignore` que ESTAVA declarada.
     Classificar isso como `UNDECLARED_WRITE` afirma que houve escrita onde não houve. Foi o que
     aconteceu na Fase 0 do ADMAI DELIVERY MODE, e o registro ficou impreciso por isso. */
  const sumidos = Object.keys(base).filter((c) => !(c in agora));
  for (const caminho of sumidos) {
    /* [H01-REV-03] A primeira versão perguntava só "está ignorado?". Um arquivo APAGADO que também
       casasse com uma regra de ignore desaparecia da observação — exclusão real e líquida sumindo,
       o que é fail-open ALÉM da limitação declarada de "escrever e restaurar".
       `AGORA_IGNORADO` exige que o arquivo AINDA EXISTA e que seu conteúdo seja o mesmo do baseline.
       Ausente ou alterado continua sendo diferença observada, ignorado ou não. */
    const abs = join(lane, caminho);
    const aindaExiste = existsSync(abs) && statSync(abs).isFile();
    const mesmoConteudo = aindaExiste
      && createHash('sha256').update(readFileSync(abs)).digest('hex') === base[caminho];

    (aindaExiste && mesmoConteudo && ignorado(lane, caminho) ? ignoradosAgora : observado).add(caminho);
  }

  return {
    disponivel: true,
    observado: [...observado].sort(),
    ignoradosAgora: [...ignoradosAgora].sort()
  };
}

/**
 * Lanes que a declaracao cobre, normalizadas.  [schema/3]
 *
 * Schema 2 nomeia uma lane e o gate observava so ela. So que o trabalho desta frente escreve em
 * DUAS — a lane do EOS e a do harness — e um `MATCH` produzido olhando uma delas nao diz "nao houve
 * escrita nao declarada", diz "confere dentro do que foi olhado". Anunciar o primeiro tendo provado
 * o segundo e `MAR-INV-025` na propria ferramenta que existe para impedir isso.
 */
export function lanesDaDeclaracao(decl) {
  /* [R27-01] `{}` e objeto, entao `lanes: {}` passava por aqui e produzia zero lanes: a observacao
     nao olhava lugar nenhum e a comparacao dava MATCH sobre o vazio. Objeto sem chave nao e escopo. */
  if (decl?.lanes && typeof decl.lanes === 'object' && Object.keys(decl.lanes).length) return decl.lanes;
  if (decl?.lane) return { LANE: decl.lane };
  return { LANE: RAIZ };
}

/** Chave de caminho qualificada por lane. Sem isto, dois arquivos homonimos em lanes distintas
 *  colidiriam e um encobriria o outro na comparacao. */
export const qualificar = (lane, caminho) => `${lane}::${caminho}`;

/** Caminhos declarados, sempre qualificados — inclusive no schema antigo, para que a comparacao
 *  tenha um unico formato de chave e nao precise saber qual schema a produziu. */
export function caminhosDeclarados(decl) {
  const lanes = lanesDaDeclaracao(decl);
  const unica = Object.keys(lanes)[0];
  return (decl.entradas ?? []).map((e) => qualificar(e.lane ?? unica, e.caminho));
}

/**
 * Observacao real em TODAS as lanes declaradas.
 *
 * Uma lane sem baseline nao e observada como vazia: ela derruba a disponibilidade inteira. Observar
 * tres de quatro lanes e reportar o resultado como se fossem quatro e a mesma falha de escopo que
 * este bloco corrige, uma camada acima.
 */
/**
 * Livro-razao do proprio gate. Isento por CONSTRUCAO, nunca por conveniencia.
 *
 * `WRITE_SET.json` e escrito pelo ATO de declarar: nao existe declaracao que o contenha, porque ele
 * so passa a existir depois dela. `WRITE_SET_HISTORY.json` idem, no arquivamento. Isentar por
 * construcao e legitimo; o que nao e legitimo e isentar em silencio — a lista fica aqui, nomeada, e
 * um controle negativo prova que ela nao cobre nada alem destes dois.
 */
export const ARTEFATOS_DO_GATE = Object.freeze([
  'docs/eos-v2/WRITE_SET.json', 'docs/eos-v2/WRITE_SET_HISTORY.json'
]);

export function observarEscritaDasLanes(decl) {
  const lanes = lanesDaDeclaracao(decl);
  const porLane = decl?.baselinePorLane
    ?? (decl?.baselineDaLane ? { [Object.keys(lanes)[0]]: decl.baselineDaLane } : null);

  if (!porLane || typeof porLane !== 'object') {
    return { disponivel: false, motivo: 'DECLARACAO_SEM_BASELINE', observado: null, escopo: 'NENHUM' };
  }
  const semBaseline = Object.keys(lanes).filter((n) => !porLane[n] || typeof porLane[n] !== 'object');
  if (semBaseline.length) {
    return {
      disponivel: false, motivo: `LANE_DECLARADA_SEM_BASELINE: ${semBaseline.join(', ')}`,
      observado: null, escopo: 'PARCIAL'
    };
  }

  const observado = [];
  const livroRazao = [];
  const ignoradosAgora = [];
  for (const [nome, raiz] of Object.entries(lanes)) {
    const r = observarEscritaDaLane({ baselineDaLane: porLane[nome], lane: raiz }, raiz);
    ignoradosAgora.push(...(r.ignoradosAgora ?? []).map((c) => qualificar(nome, c)));
    for (const c of r.observado) {
      /* [R25-03] Antes eu REMOVIA o livro-razão da observação. Estreito por nome, largo por
         autoria: adulteração manual dos mesmos dois caminhos sumia junto. Agora ele sai da lista
         comparada mas continua VISÍVEL num campo próprio — isenção que se vê é auditável;
         isenção que apaga, não. */
      (ARTEFATOS_DO_GATE.includes(c) ? livroRazao : observado).push(qualificar(nome, c));
    }
  }
  return {
    disponivel: true, observado: observado.sort(), livroRazao: livroRazao.sort(),
    ignoradosAgora: ignoradosAgora.sort(),
    escopo: Object.keys(lanes).length > 1 ? 'TODAS_AS_LANES_DECLARADAS' : 'LANE_UNICA',
    lanes: Object.keys(lanes)
  };
}

/** Lê a declaração. Ausente é `NOT_DECLARED` — nunca um objeto vazio que pareça declarado. */
export function lerDeclaracao(caminho = ARTEFATO) {
  if (!existsSync(caminho)) return { estado: 'NOT_DECLARED', entradas: [], motivo: 'artefato ausente' };
  try {
    const doc = JSON.parse(readFileSync(caminho, 'utf8'));
    if (!Array.isArray(doc.entradas)) {
      return { estado: 'INVALIDATED', entradas: [], motivo: 'declaração sem lista de entradas' };
    }
    return doc;
  } catch (erro) {
    return { estado: 'INVALIDATED', entradas: [], motivo: `declaração ilegível: ${erro.message}` };
  }
}

/**
 * Valida a declaração contra o estado atual. PURA nos argumentos — as sabotagens atravessam aqui.
 *
 * Uma declaração válida precisa de três coisas, e a terceira é a que a torna uma declaração PRÉVIA
 * em vez de uma lista qualquer: nenhum caminho declarado pode já ter sido escrito por esta fatia.
 */
export function validarDeclaracao(decl, { sujos, baseCommitAtual, shaAtual, momento = 'DECLARACAO' }) {
  const problemas = [];

  if (decl.estado === 'NOT_DECLARED') problemas.push('Write Set não declarado');
  if (decl.estado === 'INVALIDATED') problemas.push(decl.motivo ?? 'declaração invalidada');
  if (!decl.sliceId) problemas.push('declaração sem sliceId — não dá para saber a que fatia pertence');

  if (decl.baseCommit && baseCommitAtual && decl.baseCommit !== baseCommitAtual) {
    problemas.push(`declaração feita sobre ${decl.baseCommit.slice(0, 12)} e o HEAD agora é ${baseCommitAtual.slice(0, 12)}`);
  }

  /* [schema/3] Entrada precisa apontar para uma lane que a declaração realmente nomeia. Uma lane
     inventada na entrada passaria a ser observada contra baseline nenhum. */
  const lanesConhecidas = Object.keys(lanesDaDeclaracao(decl));
  /* [R27-01] Declaracao que ANUNCIA `lanes` precisa nomear ao menos uma. */
  if (decl.lanes && !Object.keys(decl.lanes).length) {
    problemas.push('declaracao anuncia lanes e nao nomeia nenhuma — escopo vazio nao e escopo');
  }
  for (const e of decl.entradas ?? []) {
    if (e.lane && !lanesConhecidas.includes(e.lane)) {
      problemas.push(`${e.caminho}: lane "${e.lane}" não está declarada em lanes`);
    }
  }
  /* [R28-01] A checagem de baseline só disparava quando `lanes` **e** `baselinePorLane` existiam.
     Faltando os dois, ela era pulada inteira, e a declaração virava `VALIDATED` sem âncora alguma.
     Verificação condicionada à presença do dado que ela verifica não verifica nada. */
  if (!decl.baselinePorLane && !decl.baselineDaLane) {
    problemas.push('declaração sem baseline — sem ele a observação não tem contra o que comparar');
  }
  /* [H01-REV-06] O `!== undefined` deixava a AUSENCIA passar para o fallback de lane unica, e
     `lanes: null` idem. Declaracao que nao nomeia escopo nao tem escopo — e o schema corrente
     sempre o nomeia. */
  const temLaneUnica = typeof decl.lane === 'string' && decl.lane.length > 0;
  if ((decl.lanes === undefined || decl.lanes === null) && !temLaneUnica) {
    problemas.push('declaracao sem `lanes` nem `lane` — o escopo nao pode vir de fallback');
  } else if (decl.lanes != null && (typeof decl.lanes !== 'object' || Array.isArray(decl.lanes))) {
    problemas.push(`lanes precisa ser objeto nome->raiz, e veio ${Array.isArray(decl.lanes) ? 'array' : typeof decl.lanes}`);
  }
  if (decl.baselinePorLane) {
    const faltando = lanesConhecidas.filter((n) => !decl.baselinePorLane[n]);
    if (faltando.length) problemas.push(`lane sem baseline: ${faltando.join(', ')}`);
  }
  /* [R28-01] `baseCommit` é o que torna o baseline datável. Sem ele, "diferença contra o baseline"
     não distingue escrita desta rodada de estado herdado de outro commit. */
  if (!decl.baseCommitPorLane && !decl.baseCommit) {
    problemas.push('declaração sem baseCommit — o baseline deixa de ser datável');
  }

  /* [R26-01] Estado REAL por lane. Antes, `sujos` chegava como parâmetro e nunca era lido, e
     `shaAtual` só era testado por presença — então `sujoNaDeclaracao` e `shaNaDeclaracao` eram
     AUTO-DECLARADOS: bastava a declaração dizer `sujoNaDeclaracao: false` sobre um arquivo sujo,
     com um sha forjado, para virar `VALIDATED`. A âncora pré-mutação, que é a razão deste módulo
     existir, dependia da honestidade de quem declara. É a mesma raiz do R24-07 num campo diferente:
     confiar no dado declarado em vez de observar. */
  const lanes = lanesDaDeclaracao(decl);
  const observadoPorLane = {};
  const estadoDaLane = (nomeLane) => {
    if (observadoPorLane[nomeLane]) return observadoPorLane[nomeLane];
    const raiz = lanes[nomeLane];
    /* Chamador que forneceu `sujos`/`shaAtual` continua mandando — é assim que as sabotagens
       atravessam esta função sem tocar em disco.
       MAS só quando há UMA lane. Com declaração multi-lane, o estado que o CLI passa é de uma lane
       só, e aplicá-lo às demais compara caminho do HARNESS contra o `git status` do EOS: o arquivo
       "não está sujo" porque está na outra árvore. Foi o que aconteceu na primeira versão desta
       correção, e o próprio check acusou. Estado de uma lane não fala pela outra. */
    const laneUnica = Object.keys(lanes).length === 1;
    observadoPorLane[nomeLane] = (sujos && laneUnica) || !raiz
      ? { sujos, shas: shaAtual }
      : { sujos: observarSujos(raiz), shas: shasDaLane(raiz) };
    return observadoPorLane[nomeLane];
  };
  const nomeDaPrimeiraLane = Object.keys(lanes)[0];

  for (const e of decl.entradas ?? []) {
    if (!e.caminho) { problemas.push('entrada sem caminho'); continue; }
    if (!PRECISOES.includes(e.precisao)) {
      problemas.push(`${e.caminho}: precisão inválida (${e.precisao})`);
    }
    /* O ponto do gate. Caminho já sujo no momento da declaração é escrita que precedeu a
       declaração — a menos que a fatia o declare como reescrita consciente de trabalho anterior,
       o que exige dizer isso explicitamente em vez de deixar implícito. */
    if (e.sujoNaDeclaracao === true && e.reescritaDeclarada !== true) {
      problemas.push(`${e.caminho}: já estava modificado quando foi declarado — declare antes de escrever, ou marque reescritaDeclarada`);
    }
    if (e.existiaNaDeclaracao === true && e.shaNaDeclaracao == null) {
      problemas.push(`${e.caminho}: existia e não teve sha registrado — a âncora da ordem some sem ele`);
    }

    const est = estadoDaLane(e.lane ?? nomeDaPrimeiraLane);

    /* [R26-01a] O que a entrada AFIRMA sobre sujeira tem de bater com o que a lane MOSTRA. */
    /* [R27-01] As checagens so disparavam quando o campo ESTAVA presente — omitir
       `sujoNaDeclaracao`, `existiaNaDeclaracao` e `shaNaDeclaracao` desligava todas de uma vez, e a
       declaracao virava VALIDATED sem ancora nenhuma. Verificacao opcional nao e verificacao: quem
       declara escolhia se seria conferido. Ausencia agora REPROVA. */
    if (typeof e.sujoNaDeclaracao !== 'boolean') {
      problemas.push(`${e.caminho}: sem sujoNaDeclaracao — a ancora da ordem nao existe sem ele`);
    }
    if (typeof e.existiaNaDeclaracao !== 'boolean') {
      problemas.push(`${e.caminho}: sem existiaNaDeclaracao`);
    }
    if (e.existiaNaDeclaracao === true && typeof e.shaNaDeclaracao !== 'string') {
      problemas.push(`${e.caminho}: existia e nao registrou sha — sem ele nada ancora a ordem`);
    }
    if (est?.sujos && typeof e.sujoNaDeclaracao === 'boolean') {
      const sujoDeFato = est.sujos.has(e.caminho);
      if (sujoDeFato !== e.sujoNaDeclaracao) {
        problemas.push(`${e.caminho}: declarou sujoNaDeclaracao=${e.sujoNaDeclaracao} e a lane mostra ${sujoDeFato} — a declaração não confere com o repositório`);
      }
    }

    /* [R26-01b] O sha registrado precisa CORRESPONDER ao arquivo, não apenas existir. O comentário
       antigo já dizia "senão a âncora é decorativa" — e a checagem testava só presença. */
    if (est?.shas && e.shaNaDeclaracao) {
      const shaDeFato = est.shas[e.caminho];
      if (shaDeFato === undefined) {
        problemas.push(`${e.caminho}: declarado e ausente do estado observado`);
      } else if (momento === 'DECLARACAO' && shaDeFato !== e.shaNaDeclaracao) {
        /* Só na PROMOÇÃO o sha tem de bater: é o instante em que a âncora se forma. Depois da
           mutação ele diverge por definição, e exigir correspondência ali transformaria trabalho
           legítimo em erro. A primeira tentativa desta correção resolveu isso com um campo
           `escritoNestaRodada` por entrada — ou seja, um escape que a própria declaração liga para
           burlar a checagem. O momento é do chamador, não do dado declarado. */
        problemas.push(`${e.caminho}: sha declarado não corresponde ao arquivo — âncora forjada`);
      }
    }
  }

  return { valido: problemas.length === 0, problemas };
}

/** `MUTATION_READY` exige `VALIDATED`. `DECLARED` sozinho não autoriza mutação. */
export function mutationReady(decl, validacao) {
  if (decl.estado !== 'VALIDATED') {
    return { pronto: false, motivo: `Write Set está ${decl.estado}; mutação exige VALIDATED` };
  }
  if (!validacao.valido) {
    return { pronto: false, motivo: `Write Set VALIDATED porém inconsistente: ${validacao.problemas[0]}` };
  }
  return { pronto: true, motivo: null };
}

/**
 * Compara declarado com observado.
 *
 * `UNDECLARED_WRITE` é Finding mesmo com testes verdes e código correto: normalizar escrita fora do
 * contrato porque o resultado ficou bom é exatamente como as quatro violações anteriores foram
 * absorvidas sem custo.
 */
/**
 * Forca da evidencia de cada declaracao arquivada, da mais forte para a mais fraca.
 *
 * `UNKNOWN_PROVENANCE` nao e "sem informacao" — e o registro cuja evidencia foi INVALIDADA por
 * defeito do instrumento (R24-07). Precisa existir como valor nomeado, senao a reclassificacao
 * viraria simplesmente apagar o `MATCH` antigo.
 */
export const PROVENANCES = [
  'ARTEFATO_ORIGINAL', 'ORIGINAL_PRE_MUTATION', 'RECONSTRUIDO_DA_EXECUCAO', 'UNKNOWN_PROVENANCE'
];

export function compararDeclaradoObservado({ declarado, observado, expansoesAutorizadas = [] }) {
  const decl = new Set(declarado);
  const autorizadas = new Set(expansoesAutorizadas);
  const naoDeclarados = observado.filter((c) => !decl.has(c) && !autorizadas.has(c));
  const expandidos = observado.filter((c) => !decl.has(c) && autorizadas.has(c));
  const naoEntregues = declarado.filter((c) => !observado.includes(c));

  let classe;
  if (naoDeclarados.length > 0) classe = 'UNDECLARED_WRITE';
  else if (expandidos.length > 0) classe = 'AUTHORIZED_EXPANSION';
  else if (naoEntregues.length > 0) classe = 'OBSERVED_SUBSET';
  else classe = 'MATCH';

  return { classe, naoDeclarados, expandidos, naoEntregues };
}

/**
 * Assinatura de declaração retroativa, sobre a declaração JÁ CONCLUÍDA.
 *
 * Caminho que estava sujo quando foi declarado e cujo conteúdo não mudou depois: foi escrito antes
 * e declarado em seguida. É o caso que o §20 chama de `RETROACTIVE_SCOPE_NORMALIZATION`, e o único
 * modo de detectá-lo é comparar o sha da declaração com o de agora.
 */
export function detectarDeclaracaoRetroativa(decl, shaAtual) {
  return (decl.entradas ?? [])
    .filter((e) => e.sujoNaDeclaracao === true && e.reescritaDeclarada !== true)
    .filter((e) => shaAtual[e.caminho] === e.shaNaDeclaracao)
    .map((e) => e.caminho);
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

/**
 * Promove `DECLARED -> VALIDATED`, e SOMENTE quando a validação passa.
 *
 * Escrever `"estado": "VALIDATED"` à mão no artefato reabriria exatamente o buraco que este gate
 * fecha: a promoção viraria afirmação minha em vez de consequência da checagem. Por isso a
 * transição é mecânica, e o carimbo diz quem a fez.
 */
export function promover(caminho = ARTEFATO) {
  const decl = lerDeclaracao(caminho);
  if (decl.estado !== 'DECLARED') {
    return { promovido: false, motivo: `só DECLARED promove; estado atual é ${decl.estado}` };
  }
  const raiz = raizDaDeclaracao(decl);
  const sujos = observarSujos(raiz);
  const baseCommitAtual = execFileSync('git', ['-C', raiz, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const shaAtual = Object.fromEntries((decl.entradas ?? []).map((e) => [e.caminho, sha(`${raiz}${e.caminho}`)]));
  const v = validarDeclaracao(decl, { sujos, baseCommitAtual, shaAtual });
  if (!v.valido) return { promovido: false, motivo: v.problemas[0], problemas: v.problemas };

  const doc = { ...decl, estado: 'VALIDATED', validadoEm: new Date().toISOString(), validadoPor: 'write-set-gate.mjs' };
  writeFileSync(caminho, `${JSON.stringify(doc, null, 2)}
`);
  return { promovido: true, motivo: null };
}

/**
 * Raiz que a declaração observa.
 *
 * Fatia EOS escreve na lane do Claude (`EOS_BUILD_CLAUDE`), não na de integração — e a primeira
 * versão deste gate só olhava a raiz de integração, o que o tornaria cego justamente para as fatias
 * do EOS. Um gate cego para metade das mutações não é gate; a declaração diz qual lane observar.
 */
export const HISTORICO = `${RAIZ}docs/eos-v2/WRITE_SET_HISTORY.json`;

/**
 * Arquiva a declaracao corrente antes que a proxima a sobrescreva.
 *
 * O INCIDENTE QUE ISTO CORRIGE, e que aconteceu comigo
 *   `WRITE_SET.json` guarda UMA declaracao. Ao declarar o checkpoint seguinte eu sobrescrevi a do
 *   `SL-A-06` — a primeira fatia com a ordem provada, `MATCH`, zero nao declarados. Eu tinha
 *   identificado o risco na frase anterior e escrevi por cima assim mesmo.
 *
 *   Os `sha` pre-escrita nao sao reconstruiveis: foram capturados quando os arquivos ainda nao
 *   existiam. Sobrou o DESFECHO observado, que entrou no historico com provenance
 *   `RECONSTRUIDO_DA_EXECUCAO` — porque relato de execucao nao e artefato, e quem auditar precisa
 *   conseguir distinguir os dois.
 *
 * Mesma classe do `evidence-bundle` sem `--execucoes`: ferramenta que produz evidencia nao pode
 * destrui-la por omissao. A correcao e mecanica pela mesma razao — depender de lembrar ja falhou.
 */
export function arquivar(caminho = ARTEFATO, historico = HISTORICO) {
  const decl = lerDeclaracao(caminho);
  if (decl.estado === 'NOT_DECLARED') return { arquivado: false, motivo: 'nada a arquivar' };
  /* [R26-03] Arquivava INVALIDATED como se fosse registro bom, e ainda gravava
     bloqueiaIntegracao:false. Fechamento fail-open: o caminho de erro produzia o desfecho mais
     permissivo. Declaracao invalida nao vira historico limpo. */
  if (decl.estado === 'INVALIDATED') {
    return { arquivado: false, motivo: decl.motivo ?? 'declaracao INVALIDATED nao se arquiva' };
  }

  let hist = { schema: 'admai.write-set-history/1', declaracoes: [] };
  if (existsSync(historico)) {
    /* [R26-03] O comentario antigo dizia "corrompido: nao apaga, acrescenta" e o codigo fazia
       exatamente o contrario: o `catch` deixava `hist` no objeto vazio, e o `writeFileSync` adiante
       SUBSTITUIA o arquivo — perda integral do historico corrompido. Instrumento que produz
       evidencia nao pode destrui-la ao encontrar erro; e a mesma classe do `evidence-bundle` sem
       `--execucoes`. Agora recusa e preserva. */
    try {
      hist = JSON.parse(readFileSync(historico, 'utf8'));
    } catch (e) {
      return {
        arquivado: false,
        motivo: `historico ilegivel (${e.message}) — recusado para nao sobrescrever; resolva o arquivo antes`
      };
    }
  }
  /* [R27-02] JSON valido com `declaracoes` ausente ou nao-array caia aqui e virava lista vazia —
     depois sobrescrita. Parse OK nao e historico legivel; a correcao do R26-03 cobriu so erro de
     sintaxe e deixou o irmao semantico de pe. Estrutura invalida tambem preserva. */
  if (!Array.isArray(hist.declaracoes)) {
    return {
      arquivado: false,
      motivo: 'historico sem lista `declaracoes` — recusado para nao sobrescrever conteudo desconhecido'
    };
  }

  /* [SCOPE-F0] Rearquivar a MESMA declaração é no-op.
     `arquivar()` recomputa a comparação (logo abaixo, e por bom motivo). Só que a comparação
     depende do HEAD: a guarda [R25-02] devolve `UNKNOWN_DIFFERENCE` quando a base andou, porque
     "diferença contra o baseline" deixa de significar "escrita desta rodada". Então uma rodada
     fechada em `MATCH` virava `UNKNOWN_DIFFERENCE` só por ser arquivada de novo depois de um
     commit — e como entrada bloqueante é preservada ([R27-03]/[R28-02], regra certa), cada
     rearquivamento ACUMULAVA um bloqueio inventado.

     Foi a origem comum de três: `SAFE-MIG-01#rearquivado-1`, `GAP-UI-02#rearquivado-1` e
     `MVP-20-22/EVIDENCIA`. Reconciliar um a um trataria o sintoma.

     Identidade estável: `sliceId` + `declaradoEm`. Declaração nova da mesma fatia recebe outro
     `declaradoEm` e continua arquivando normalmente — inclusive com sufixo, quando houver entrada
     preservada. Nada aqui afrouxa as guardas existentes: o PRIMEIRO arquivamento segue mecânico,
     nada é sobrescrito, e nenhuma violação registrada é apagada. */
  /* `declaradoEm` precisa EXISTIR nos dois lados. Comparar sem isso fazia `undefined === undefined`
     casar, e uma declaração sem timestamp virava "já arquivada" contra qualquer entrada antiga
     homônima — o no-op engolia um arquivamento legítimo. O controle de convivência do [R27-03]
     pegou isso na hora, que é exatamente o que ele existe para fazer. */
  const jaArquivadaIgual =
    typeof decl.declaradoEm === 'string' &&
    decl.declaradoEm.length > 0 &&
    hist.declaracoes.some(
      (d) => String(d.sliceId).split('#')[0] === decl.sliceId && d.declaradoEm === decl.declaradoEm
    );
  if (jaArquivadaIgual) {
    return { arquivado: false, motivo: 'ja arquivada — mesma declaracao, nada a recomputar', total: hist.declaracoes.length };
  }

  /* [R25-01] Arquivar EXECUTA a comparação e a persiste. Antes ela era opcional: `--comparar` era um
     modo que eu podia esquecer de rodar, e o fechamento gravava a declaração sem confronto nenhum.
     É a mesma causa sistêmica do R24-07 — comparação que depende de alguém lembrar — sobrevivendo
     um degrau adiante, no caminho de fechamento. Mecânico aqui pela razão que já tornou `promover`
     mecânico: depender de lembrar já falhou, repetidamente. */
  const r = compararRodada(decl);

  /* [R25-01b] `provenance` era cravado em `ARTEFATO_ORIGINAL`, a mais forte, sem verificar nada.
     Agora é DERIVADO: só a declaração que trouxe baseline e produziu comparação disponível vale
     como evidência pré-mutação original. */
  /* [R26-04] Duas falhas numa linha so. `decl.provenance ??` deixava a DECLARACAO escolher a
     propria forca de evidencia — bastava escrever ORIGINAL_PRE_MUTATION no JSON, sem baseline
     nenhum. E `r.observado !== null` nao significa "comparacao disponivel": HEAD movido devolve
     UNKNOWN_DIFFERENCE COM observado preenchido, e ainda assim virava evidencia original.
     Derivar significa nao aceitar a resposta de quem esta sendo avaliado. */
  const temBaseline = Boolean(decl.baselinePorLane || decl.baselineDaLane);
  const comparacaoConclusiva = r.classe !== 'UNKNOWN_DIFFERENCE' && r.observado !== null;
  const provenance = temBaseline && comparacaoConclusiva
    ? 'ORIGINAL_PRE_MUTATION' : 'UNKNOWN_PROVENANCE';

  /* [R27-03] "Substitui, mantendo uma linha por fatia" apagava violacao registrada: rearquivar o
     mesmo sliceId removia um UNDECLARED_WRITE e o bloqueio sumia. Isso contradiz frontalmente a
     afirmacao de que a comparacao permanece UNDECLARED_WRITE para sempre — bastava rearquivar
     limpo. Violacao registrada nao se sobrescreve; a nova entrada convive com a anterior. */
  /* [R28-02] A correção do R27-03 preservava só `UNDECLARED_WRITE`. Um `UNKNOWN_DIFFERENCE`
     anterior — que passou a bloquear no R27-04 — continuava sendo apagado por rearquivamento, o que
     reabria exatamente o fail-open recém-fechado. Preserva-se toda classe bloqueante, e também toda
     entrada que já carrega disposição: apagar uma reconciliação apagaria a decisão do usuário. */
  const idBase = (id) => String(id).split('#')[0];
  const preservar = (d) => CLASSES_QUE_BLOQUEIAM.includes(d.comparacao) || Boolean(d.reconciliacao);

  const mesmaFatia = hist.declaracoes.filter((d) => idBase(d.sliceId) === decl.sliceId);
  const haPreservada = mesmaFatia.some(preservar);
  hist.declaracoes = hist.declaracoes.filter(
    (d) => idBase(d.sliceId) !== decl.sliceId || preservar(d)
  );

  /* [R28-04] O sufixo usava `anteriores.length`, e `anteriores` excluía as JÁ sufixadas — duas
     rearquivações produziam dois `#rearquivado-1` idênticos, e `reconciliar()` usa `find()`, então
     a segunda ficava inalcançável. Conta-se pelo id-BASE, que inclui as sufixadas. */
  const sufixo = haPreservada
    ? `${decl.sliceId}#rearquivado-${hist.declaracoes.filter((d) => idBase(d.sliceId) === decl.sliceId).length}`
    : decl.sliceId;
  hist.declaracoes.push({
    ...decl, sliceId: sufixo, arquivadoEm: new Date().toISOString(), provenance,
    comparacao: r.classe, escopoDaComparacao: r.escopo, lanesObservadas: r.lanes ?? null,
    caminhosNaoDeclarados: r.naoDeclarados ?? null,
    caminhosDeclaradosNaoEscritos: r.naoEntregues ?? null,
    livroRazaoTocado: r.livroRazao ?? null,
    /* [R27-04] So UNDECLARED_WRITE marcava bloqueio. UNKNOWN_DIFFERENCE significa que NAO FOI
       POSSIVEL determinar o que foi escrito — e isso saia publicado como "nenhum bloqueio".
       Impossibilidade de decidir e o caso em que menos se pode afirmar seguranca. */
    bloqueiaIntegracao: r.classe === 'UNDECLARED_WRITE' || r.classe === 'UNKNOWN_DIFFERENCE'
  });
  writeFileSync(historico, `${JSON.stringify(hist, null, 2)}
`);
  return { arquivado: true, motivo: null, total: hist.declaracoes.length };
}

/**
 * Dispõe de um `UNDECLARED_WRITE` sem apagá-lo.  [R25-08]
 *
 * O revisor foi explícito: revisar o conteúdo escrito fornece evidência técnica, mas não desfaz nem
 * autoriza retroativamente a escrita. Aceitar a exceção de processo é decisão do usuário — e essa
 * decisão precisa de forma verificável, senão vira o §20 outra vez: escrever fora do escopo, achar o
 * resultado bom, e seguir.
 *
 * O que esta função NÃO faz, deliberadamente: não toca `comparacao`. A violação continua
 * `UNDECLARED_WRITE` para sempre no histórico. O que muda é só `bloqueiaIntegracao`, e apenas na
 * presença de uma disposição nomeada, justificada e atribuída a quem autorizou.
 */
export const DISPOSICOES = Object.freeze([
  'CONTEUDO_ACEITO_ORDEM_VIOLADA',   // a escrita é legítima; o que faltou foi a declaração prévia
  'REVERTIDO',                       // desfeita e refeita sob declaração válida
  'ACEITO_COMO_RISCO',               // aceito com risco explícito, sem alegar que estava correto
  /* [H-01.11] As três acima assumem que HOUVE escrita. Esta é para o caso em que não houve: a
     comparação foi produzida por um classificador defeituoso, e o defeito está corrigido e provado.
     `observarEscritaDaLane` tratava "sumiu da listagem" como escrita sem distinguir revertido,
     commitado e AGORA_IGNORADO — e o terceiro não é escrita nenhuma.
     Não é atalho para as outras: exige que o defeito seja NOMEADO e que a correção seja apontável,
     e a comparação continua `UNDECLARED_WRITE` no histórico como qualquer outra. */
  'CLASSIFICACAO_INVALIDADA_POR_DEFEITO_DO_INSTRUMENTO'
]);

/** Disposição que nega a escrita precisa nomear o defeito e a correção. [H-01.11] */
export const EXIGE_DEFEITO_NOMEADO = 'CLASSIFICACAO_INVALIDADA_POR_DEFEITO_DO_INSTRUMENTO';

export function reconciliar({ sliceId, disposicao, autorizadoPor, justificativa, caminhos = [],
  defeito, correcao }, historico = HISTORICO) {
  if (!existsSync(historico)) return { reconciliado: false, motivo: 'histórico ausente' };

  let hist;
  try { hist = JSON.parse(readFileSync(historico, 'utf8')); } catch (e) {
    return { reconciliado: false, motivo: `histórico ilegível: ${e.message}` };
  }
  /* [R28-03] `?? []` tratava historico malformado como "sem declaracoes", e `arquivar()` ja
     recusava a mesma estrutura. O irmao do R27-02 sobreviveu aqui. */
  if (!Array.isArray(hist.declaracoes)) {
    return { reconciliado: false, motivo: 'historico sem lista `declaracoes` — estrutura desconhecida nao se reconcilia' };
  }
  const d = hist.declaracoes.find((x) => x.sliceId === sliceId);

  if (!d) return { reconciliado: false, motivo: `fatia ${sliceId} não está no histórico` };
  if (!CLASSES_QUE_BLOQUEIAM.includes(d.comparacao)) {
    return { reconciliado: false, motivo: `${sliceId} está ${d.comparacao}; só ${CLASSES_QUE_BLOQUEIAM.join('/')} se reconcilia` };
  }
  if (!DISPOSICOES.includes(disposicao)) {
    return { reconciliado: false, motivo: `disposição inválida (${DISPOSICOES.join('/')})` };
  }
  /* Sem autor e sem razão, "reconciliado" seria só uma flag que desliga o bloqueio. */
  /* [R26-05] `!autorizadoPor` e `length < 20` passavam com espacos: vinte espacos em branco
     levantavam o bloqueio. Conteudo, nao comprimento. */
  if (typeof autorizadoPor !== 'string' || autorizadoPor.trim().length < 3) {
    return { reconciliado: false, motivo: 'disposição sem autoria — quem autorizou?' };
  }
  if (typeof justificativa !== 'string' || justificativa.trim().length < 20) {
    return { reconciliado: false, motivo: 'disposição sem justificativa substantiva' };
  }

  /* [H-01.11] Negar que houve escrita é a afirmação mais forte das quatro disposições, então é a que
     exige mais: o defeito precisa ser NOMEADO e a correção precisa ser apontável. Sem isso, esta
     disposição viraria o atalho por onde qualquer violação escaparia — "o instrumento errou". */
  if (disposicao === EXIGE_DEFEITO_NOMEADO) {
    if (typeof defeito !== 'string' || defeito.trim().length < 10) {
      return { reconciliado: false, motivo: 'disposição que nega a escrita exige o defeito nomeado' };
    }
    if (typeof correcao !== 'string' || correcao.trim().length < 10) {
      return { reconciliado: false, motivo: 'disposição que nega a escrita exige a correção apontável' };
    }
  }

  d.reconciliacao = {
    em: new Date().toISOString(), disposicao, autorizadoPor, justificativa,
    caminhos: caminhos.length ? caminhos : (d.caminhosNaoDeclarados ?? []),
    ...(disposicao === EXIGE_DEFEITO_NOMEADO ? { defeito, correcao } : {}),
    preserva: disposicao === EXIGE_DEFEITO_NOMEADO
      ? 'A comparação permanece UNDECLARED_WRITE no histórico. Isto NÃO autoriza escrita — registra que escrita não houve, e que a medição estava errada.'
      : 'A comparação permanece UNDECLARED_WRITE. Isto dispõe do bloqueio, não da violação.'
  };
  d.bloqueiaIntegracao = false;
  hist.geradoEm = new Date().toISOString();
  writeFileSync(historico, `${JSON.stringify(hist, null, 2)}\n`);
  return { reconciliado: true, motivo: null, comparacaoPreservada: d.comparacao };
}

/**
 * Uma disposição só conta se for uma disposição.  [R26-05]
 *
 * `!d.reconciliacao` aceitava `{}` como suficiente: um objeto vazio levantava o bloqueio.
 */
/** Classes que travam integracao. `UNKNOWN_DIFFERENCE` entra: nao saber o que foi escrito e menos
 *  informacao que saber que houve escrita nao declarada, nao mais.  [R27-04] */
export const CLASSES_QUE_BLOQUEIAM = Object.freeze(['UNDECLARED_WRITE', 'UNKNOWN_DIFFERENCE']);

export function disposicaoValida(rec) {
  const base = Boolean(rec) && DISPOSICOES.includes(rec.disposicao)
    && typeof rec.autorizadoPor === 'string' && rec.autorizadoPor.trim().length >= 3
    && typeof rec.justificativa === 'string' && rec.justificativa.trim().length >= 20;
  if (!base) return false;

  /* [H01-REV-04] `reconciliar()` exigia defeito e correcao para a disposicao que NEGA a escrita, e
     `disposicaoValida()` nao — mas quem levanta o bloqueio e `bloqueiosAbertos()`, que usa esta
     funcao. Um registro escrito a mao com a disposicao especial e sem defeito passava pela porta que
     `reconciliar()` fechava. A exigencia mora aqui, no leitor, e nao so no escritor. */
  if (rec.disposicao === EXIGE_DEFEITO_NOMEADO) {
    return typeof rec.defeito === 'string' && rec.defeito.trim().length >= 10
      && typeof rec.correcao === 'string' && rec.correcao.trim().length >= 10;
  }
  return true;
}

/** Fatias que ainda bloqueiam integração: `UNDECLARED_WRITE` sem disposição VÁLIDA registrada. */
export function bloqueiosAbertos(historico = HISTORICO) {
  /* [R26-05] Histórico ausente devolvia `[]`, que se lê como "nenhum bloqueio" — a afirmação
     forte. Ausência de registro não é ausência de violação. */
  if (!existsSync(historico)) return ['HISTORICO_AUSENTE'];
  try {
    const hist = JSON.parse(readFileSync(historico, 'utf8'));
    /* [R28-03] Historico sem lista de declaracoes devolvia `[]`, que se le como "nada bloqueia" —
       a afirmacao mais forte possivel a partir da estrutura mais desconhecida possivel. */
    if (!Array.isArray(hist.declaracoes)) return ['HISTORICO_MALFORMADO'];
    return hist.declaracoes
      .filter((d) => CLASSES_QUE_BLOQUEIAM.includes(d.comparacao) && !disposicaoValida(d.reconciliacao))
      .map((d) => d.sliceId);
  } catch { return ['HISTORICO_ILEGIVEL']; }
}

export function raizDaDeclaracao(decl) {
  const lanes = lanesDaDeclaracao(decl);
  const primeira = Object.values(lanes)[0];
  return primeira ? `${primeira.replace(/\/?$/, '/')}` : RAIZ;
}

/**
 * `DECLARED x OBSERVED` como MODO DA FERRAMENTA.  [R24-07, causa raiz]
 *
 * O defeito nao foi de logica: foi que esta comparacao nunca morou aqui. `--comparar` era aceito
 * pelo parser de argumentos e caia no caminho de validacao; a comparacao de verdade vivia em
 * `node -e` improvisado a cada rodada, e foi ali que `observado: declarado.filter(...)` entrou e
 * sobreviveu tres revisoes. Invocacao ad hoc nao tem controle negativo.
 */
export function compararRodada(decl = lerDeclaracao()) {
  const obs = observarEscritaDasLanes(decl);
  if (!obs.disponivel) {
    return { classe: 'UNKNOWN_DIFFERENCE', escopo: obs.escopo, motivo: obs.motivo, observado: null };
  }

  /* [R25-02] HEAD movido invalida a comparação inteira. O baseline foi congelado contra um commit;
     se a lane commitou ou mudou de branch no meio da rodada, "diferença contra o baseline" deixa de
     significar "escrita desta rodada" — e a classe sairia forte sobre uma base que não existe mais. */
  const commitsDeclarados = decl.baseCommitPorLane
    ?? (decl.baseCommit ? { [Object.keys(lanesDaDeclaracao(decl))[0]]: decl.baseCommit } : null);
  const moveu = [];
  if (commitsDeclarados) {
    for (const [nome, raiz] of Object.entries(lanesDaDeclaracao(decl))) {
      if (!commitsDeclarados[nome]) continue;
      const agora = execFileSync('git', ['-C', raiz, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      if (agora !== commitsDeclarados[nome]) moveu.push(`${nome}: ${commitsDeclarados[nome].slice(0, 12)} -> ${agora.slice(0, 12)}`);
    }
  }
  if (moveu.length) {
    return {
      classe: 'UNKNOWN_DIFFERENCE', escopo: obs.escopo, lanes: obs.lanes,
      motivo: `HEAD_MOVEU_DESDE_A_DECLARACAO — ${moveu.join('; ')}`,
      observado: obs.observado, livroRazao: obs.livroRazao
    };
  }

  const r = compararDeclaradoObservado({
    declarado: caminhosDeclarados(decl),
    observado: obs.observado,
    expansoesAutorizadas: (decl.expansoesAutorizadas ?? []).map((e) =>
      (typeof e === 'string' ? e : qualificar(e.lane, e.caminho)))
  });
  return {
    ...r, escopo: obs.escopo, lanes: obs.lanes, observado: obs.observado,
    livroRazao: obs.livroRazao, ignoradosAgora: obs.ignoradosAgora
  };
}

/**
 * Flags reconhecidas.  [R26-08]
 *
 * Eu corrigi exatamente esta classe no `evidence-bundle` — flag aceita e ignorada — e deixei o irmão
 * aqui: `--selftest` não era reconhecido e caía no modo `validar`, junto com `--qualquer-coisa`. Os
 * 66 controles rodavam por serem incondicionais, então o comando parecia funcionar; o modo nunca
 * existiu. É o padrão que seis rodadas seguidas apontaram: tratar a instância nomeada e deixar o
 * irmão de pé.
 */
/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Escreve WRITE_SET.json e WRITE_SET_HISTORY.json — o proprio livro-razao. */
export const MODO_DE_ACESSO = 'MUTATING';

/** [H-01.3] Derivado da fonte: allowlist literal ja removeu uma capacidade real. */
export const FLAGS = flagsDoModulo(import.meta.url);

export function executar(argv = []) {
  const recusa = recusarDesconhecida(argv, FLAGS);
  if (recusa !== null) return recusa;
  /* [R27-05] Eu adicionei `--selftest` a FLAGS e NAO liguei o modo: o seletor continuava mandando
     para `validar`, e as duas saidas ficavam byte a byte iguais. Reproduzi "parametro aceito e nao
     aplicado" DENTRO da correcao dessa mesma classe, e reportei como fechada. Allowlist nao e
     roteamento. */
  /* [H-01.2] `--validar` constava da allowlist literal e NUNCA era despachado — era o default
     com um nome. Nomear um modo e nao rotea-lo e a mesma classe do `--selftest`, so que mais
     discreta, porque o comportamento coincidia. Explicito aqui, ele passa a ser derivavel da fonte
     e a existir de verdade. */
  const modo = argv.includes('--comparar') ? 'comparar'
    : argv.includes('--promover') ? 'promover'
      : argv.includes('--selftest') ? 'selftest'
        : argv.includes('--validar') ? 'validar' : 'validar';
  if (modo === 'promover') {
    const r = promover();
    console.log(r.promovido
      ? 'WRITE_SET_VALIDATED — MUTATION_READY'
      : `PROMOCAO_RECUSADA — ${r.motivo}`);
    if (!r.promovido) for (const p of r.problemas ?? []) console.log(`    ! ${p}`);
    return r.promovido ? 0 : 1;
  }
  if (modo === 'comparar') {
    const decl = lerDeclaracao();
    const r = compararRodada(decl);
    console.log(`DECLARED x OBSERVED — ${decl.sliceId ?? 'NENHUMA'}`);
    console.log(`  classe : ${r.classe}`);
    /* O escopo sai junto da classe, sempre. `MATCH` sem escopo foi lido como "nao houve escrita nao
       declarada" quando so provava "confere dentro da lane olhada". */
    console.log(`  escopo : ${r.escopo}${r.lanes ? ` (${r.lanes.join(', ')})` : ''}`);
    if (r.motivo) console.log(`  motivo : ${r.motivo}`);
    if (r.naoDeclarados?.length) console.log(`  NAO DECLARADOS : ${r.naoDeclarados.join(', ')}`);
    if (r.expandidos?.length) console.log(`  expansao autorizada : ${r.expandidos.join(', ')}`);
    if (r.naoEntregues?.length) console.log(`  declarado e nao escrito : ${r.naoEntregues.join(', ')}`);
    /* [R25-03] O livro-razão sai do confronto mas NÃO some do relatório. */
    if (r.livroRazao?.length) console.log(`  livro-razao tocado (isento) : ${r.livroRazao.join(', ')}`);
    /* [H-01.11] Sair da listagem por virar ignorado nao e escrita, e nao pode sumir do relatorio. */
    if (r.ignoradosAgora?.length) console.log(`  passou a ser IGNORADO (nao houve escrita) : ${r.ignoradosAgora.join(', ')}`);
    console.log('  LIMITE: diferenca liquida contra o baseline, nao historico de escritas.');
    console.log('    arquivo escrito e depois restaurado ao conteudo do baseline e invisivel aqui.');
    return r.classe === 'UNDECLARED_WRITE' || r.classe === 'UNKNOWN_DIFFERENCE' ? 1 : 0;
  }
  const decl = lerDeclaracao();
  const raiz = raizDaDeclaracao(decl);
  const sujos = observarSujos(raiz);
  const baseCommitAtual = execFileSync('git', ['-C', raiz, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const shaAtual = Object.fromEntries((decl.entradas ?? []).map((e) => [e.caminho, sha(`${raiz}${e.caminho}`)]));

  const validacao = validarDeclaracao(decl, { sujos, baseCommitAtual, shaAtual, momento: 'POSTERIOR' });
  const pronto = mutationReady(decl, validacao);

  const falhas = [];
  const ok = [];
  const check = (id, cond, msg) => (cond ? ok.push(id) : falhas.push(`${id}: ${msg}`));

  /* ---- Sabotagens: o gate precisa PODER rejeitar ---- */
  const base = { sujos: new Set(), baseCommitAtual: 'abc', shaAtual: {} };
  const entradaOk = { caminho: 'x.js', precisao: 'EXACT', existiaNaDeclaracao: false, shaNaDeclaracao: null, sujoNaDeclaracao: false };
  /* [R28-01] O fixture nao tinha baseline. Passava porque a checagem so disparava quando o dado
     ja estava la — o defeito e o fixture compartilhavam a mesma omissao. */
  /* [H01-REV-06] O fixture nao nomeava escopo — a mesma omissao que o defeito. Usa `lane` (schema/2)
     porque a checagem aceita as duas formas e ambas precisam ser exercitadas. */
  const declOk = {
    sliceId: 'S', estado: 'VALIDATED', baseCommit: 'abc', lane: '/tmp/lane',
    baselineDaLane: { 'x.js': 'a'.repeat(64) }, entradas: [entradaOk]
  };

  const sabotagens = [
    ['mutação sem declaração é rejeitada',
      mutationReady({ estado: 'NOT_DECLARED', entradas: [] }, { valido: false, problemas: ['x'] }).pronto === false],
    ['DECLARED sem validação não autoriza mutação',
      mutationReady({ ...declOk, estado: 'DECLARED' }, validarDeclaracao({ ...declOk, estado: 'DECLARED' }, base)).pronto === false],
    ['declaração sobre outro HEAD é invalidada',
      validarDeclaracao({ ...declOk, baseCommit: 'outro' }, base).valido === false],
    ['caminho já sujo na declaração reprova',
      validarDeclaracao({ ...declOk, entradas: [{ ...entradaOk, sujoNaDeclaracao: true }] }, base).valido === false],
    /* [R26-01] O fixture precisa ser COERENTE: declarar `sujoNaDeclaracao: true` exige que a lane
       observada mostre o caminho como sujo. A versão anterior declarava sujo contra um `sujos`
       vazio, e passava só porque nada conferia a afirmação contra a realidade. */
    ['reescrita DECLARADA é aceita — a regra não impede retomar arquivo, impede fazê-lo em silêncio',
      validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, sujoNaDeclaracao: true, reescritaDeclarada: true }] },
        { ...base, sujos: new Set(['x.js']) }
      ).valido === true],
    /* [R27-01] As checagens de âncora só disparavam quando o campo estava presente: omitir os três
       desligava todas de uma vez. Verificação que o verificado pode desligar não é verificação. */
    ['entrada SEM sujoNaDeclaracao reprova', (() => {
      const { sujoNaDeclaracao, ...semCampo } = entradaOk;
      return validarDeclaracao({ ...declOk, entradas: [semCampo] }, base).valido === false;
    })()],
    ['entrada SEM existiaNaDeclaracao reprova', (() => {
      const { existiaNaDeclaracao, ...semCampo } = entradaOk;
      return validarDeclaracao({ ...declOk, entradas: [semCampo] }, base).valido === false;
    })()],
    ['entrada que existia e omite o sha reprova',
      validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, existiaNaDeclaracao: true, shaNaDeclaracao: undefined }] },
        base
      ).valido === false],
    ['lanes vazias não produzem declaração válida',
      validarDeclaracao(
        { ...declOk, lanes: {}, baselinePorLane: {} }, base
      ).valido === false],
    /* [R28-01] Os três dados que datam e ancoram o baseline. Faltando qualquer um, "diferença contra
       o baseline" deixa de significar "escrita desta rodada". */
    ['declaração SEM baseline reprova', (() => {
      const { baselineDaLane, ...semBase } = declOk;
      return validarDeclaracao(semBase, base).valido === false;
    })()],
    ['declaração SEM  nem  reprova', (() => {
      const { lane, ...semEscopo } = declOk;
      return validarDeclaracao(semEscopo, base).valido === false;
    })()],
    ['`lanes: null` reprova',
      validarDeclaracao({ ...declOk, lane: undefined, lanes: null }, base).valido === false],
    ['declaração SEM baseCommit reprova', (() => {
      const { baseCommit, ...semCommit } = declOk;
      return validarDeclaracao(semCommit, base).valido === false;
    })()],
    ['`lanes` que não é objeto reprova',
      validarDeclaracao({ ...declOk, lanes: 'EOS' }, base).valido === false
      && validarDeclaracao({ ...declOk, lanes: ['EOS'] }, base).valido === false],
    ['declaração que MENTE sobre sujeira reprova', (() => {
      const r = validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, sujoNaDeclaracao: false }] },
        { ...base, sujos: new Set(['x.js']) }
      );
      return r.valido === false && r.problemas.some((p) => p.includes('não confere com o repositório'));
    })()],
    ['sha declarado que não corresponde ao arquivo reprova na PROMOÇÃO', (() => {
      const r = validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, existiaNaDeclaracao: true, shaNaDeclaracao: 'f'.repeat(64) }] },
        { ...base, shaAtual: { 'x.js': 'a'.repeat(64) } }
      );
      return r.valido === false && r.problemas.some((p) => p.includes('âncora forjada'));
    })()],
    ['CONTRAPROVA: sha correspondente é aceito',
      validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, existiaNaDeclaracao: true, shaNaDeclaracao: 'a'.repeat(64) }] },
        { ...base, shaAtual: { 'x.js': 'a'.repeat(64) } }
      ).valido === true],
    ['depois da mutação o sha divergente NÃO reprova — a âncora é do instante da declaração',
      validarDeclaracao(
        { ...declOk, entradas: [{ ...entradaOk, existiaNaDeclaracao: true, shaNaDeclaracao: 'f'.repeat(64) }] },
        { ...base, shaAtual: { 'x.js': 'a'.repeat(64) }, momento: 'POSTERIOR' }
      ).valido === true],
    ['precisão fora da taxonomia reprova',
      validarDeclaracao({ ...declOk, entradas: [{ ...entradaOk, precisao: 'TALVEZ' }] }, base).valido === false],
    ['declaração ilegível não vira NOT_DECLARED silencioso',
      lerDeclaracao(`${RAIZ}nao-existe-mesmo.json`).estado === 'NOT_DECLARED'],
    /* CONTROLE POSITIVO: sem ele, um gate que rejeitasse tudo passaria em todas as sabotagens. */
    ['declaração legítima é ACEITA', validarDeclaracao(declOk, base).valido === true],
    ['declaração legítima e validada autoriza mutação',
      mutationReady(declOk, validarDeclaracao(declOk, base)).pronto === true]
  ];

  /* ---- Comparação declarado × observado ---- */
  const casosComparacao = [
    ['declarado A, observado A -> MATCH',
      compararDeclaradoObservado({ declarado: ['a'], observado: ['a'] }).classe === 'MATCH'],
    ['declarado A, observado B -> UNDECLARED_WRITE',
      compararDeclaradoObservado({ declarado: ['a'], observado: ['b'] }).classe === 'UNDECLARED_WRITE'],
    ['expansão autorizada não vira violação',
      compararDeclaradoObservado({ declarado: ['a'], observado: ['a', 'b'], expansoesAutorizadas: ['b'] }).classe === 'AUTHORIZED_EXPANSION'],
    ['declarado e não entregue -> OBSERVED_SUBSET',
      compararDeclaradoObservado({ declarado: ['a', 'b'], observado: ['a'] }).classe === 'OBSERVED_SUBSET'],
    ['toda classe emitida pertence à taxonomia',
      CLASSES_DE_COMPARACAO.includes(compararDeclaradoObservado({ declarado: ['a'], observado: ['b'] }).classe)]
  ];

  /* ---- Declaração retroativa ---- */
  const casosRetroativos = [
    ['declaração retroativa é detectada',
      detectarDeclaracaoRetroativa(
        { entradas: [{ caminho: 'x', sujoNaDeclaracao: true, shaNaDeclaracao: 'abc' }] }, { x: 'abc' }
      ).length === 1],
    ['caminho sujo que MUDOU depois não é retroativo — foi retomado, não normalizado',
      detectarDeclaracaoRetroativa(
        { entradas: [{ caminho: 'x', sujoNaDeclaracao: true, shaNaDeclaracao: 'abc' }] }, { x: 'depois' }
      ).length === 0],
    ['lane declarada muda a raiz observada — sem isto o gate seria cego para as fatias EOS',
      raizDaDeclaracao({ lane: 'C:/x/EOS_BUILD_CLAUDE' }) !== raizDaDeclaracao({})],
    ['sem lane, observa a raiz de integração', raizDaDeclaracao({}) === RAIZ],
    /* O historico precisa EXISTIR e conter as fatias encerradas: sem ele, declarar a proxima
       apaga a evidencia da anterior — e foi exatamente o que aconteceu com SL-A-06. */
    ['historico de Write Set existe', existsSync(HISTORICO)],
    ['historico preserva as fatias ja encerradas', (() => {
      try {
        const h = JSON.parse(readFileSync(HISTORICO, 'utf8'));
        return Array.isArray(h.declaracoes) && h.declaracoes.some((d) => d.sliceId === 'SL-A-06');
      } catch { return false; }
    })()],
    /* Provenance honesta: relato de execucao nao pode se passar por artefato original. */
    ['entrada reconstruida se declara como tal', (() => {
      try {
        const h = JSON.parse(readFileSync(HISTORICO, 'utf8'));
        return h.declaracoes.every((d) => PROVENANCES.includes(d.provenance));
      } catch { return false; }
    })()],
    ['caminho limpo na declaração nunca é retroativo',
      detectarDeclaracaoRetroativa(
        { entradas: [{ caminho: 'x', sujoNaDeclaracao: false, shaNaDeclaracao: null }] }, { x: 'seja o que for' }
      ).length === 0]
  ];

  /* ---- Observação REAL da lane (R24-07) ----
   *
   * Os casos de comparação acima sempre passaram, e ainda assim três rodadas reportaram `MATCH`
   * sem poder detectar escrita não declarada. O que não estava coberto era o CAMINHO DE INVOCAÇÃO:
   * quem produz `observado`. Estes controles exercitam um repositório git real, porque o defeito
   * vivia entre a observação e a comparação — não dentro de nenhuma das duas.
   */
  const tmp = mkdtempSync(join(tmpdir(), 'ws-gate-'));
  const git = (...a) => execFileSync('git', ['-C', tmp, ...a], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 't');
  writeFileSync(join(tmp, 'base.txt'), 'x');
  git('add', '-A');
  git('commit', '-qm', 'base');

  writeFileSync(join(tmp, 'declarado.txt'), 'v1');
  const baseline = shasDaLane(tmp);
  const declLane = { lane: tmp, baselineDaLane: baseline, entradas: [{ caminho: 'declarado.txt' }] };

  const nadaAindaEscrito = observarEscritaDaLane(declLane, tmp);

  writeFileSync(join(tmp, 'declarado.txt'), 'v2');
  const soDeclarado = observarEscritaDaLane(declLane, tmp);

  writeFileSync(join(tmp, 'clandestino.txt'), 'nunca declarado');
  const comClandestino = observarEscritaDaLane(declLane, tmp);
  const classeReal = compararDeclaradoObservado({
    declarado: declLane.entradas.map((e) => e.caminho),
    observado: comClandestino.observado
  }).classe;

  // A observação não pode depender do que foi declarado: com declaração VAZIA, os dois caminhos
  // escritos precisam continuar aparecendo. É o teste que a invocação antiga não podia passar.
  const semDeclaracao = observarEscritaDaLane({ lane: tmp, baselineDaLane: baseline, entradas: [] }, tmp);

  const casosObservacao = [
    ['baseline congelado, nada escrito -> observado vazio',
      nadaAindaEscrito.disponivel && nadaAindaEscrito.observado.length === 0],
    ['só o declarado mudou -> observado é exatamente ele',
      soDeclarado.observado.join() === 'declarado.txt'],
    ['caminho não declarado escrito -> ENTRA na observação',
      comClandestino.observado.includes('clandestino.txt')],
    ['... e a comparação real classifica UNDECLARED_WRITE',
      classeReal === 'UNDECLARED_WRITE'],
    ['observação independe da declaração (declaração vazia observa o mesmo)',
      semDeclaracao.observado.join() === comClandestino.observado.join()],
    ['declaração sem baseline é INDISPONÍVEL, não observação vazia',
      observarEscritaDaLane({ lane: tmp, entradas: [] }, tmp).disponivel === false],
    ['baseline não-objeto também é indisponível',
      observarEscritaDaLane({ lane: tmp, baselineDaLane: [], entradas: [] }, tmp).disponivel === false]
  ];
  rmSync(tmp, { recursive: true, force: true });

  /* ---- Observacao MULTI-LANE ----
   *
   * O R24-07 fechou "observado vem do chamador". Restava "observado vem de UMA lane": a rodada que
   * corrigiu o gate escreveu em duas e a comparacao so olhou uma, devolvendo MATCH. Estes controles
   * usam DOIS repositorios reais, e a escrita clandestina vai na SEGUNDA lane — a que a versao
   * anterior nao alcancava.
   */
  const criarRepo = (nome) => {
    const dir = mkdtempSync(join(tmpdir(), `ws-${nome}-`));
    execFileSync('git', ['-C', dir, 'init', '-q']);
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'a@b.c']);
    execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
    writeFileSync(join(dir, 'base.txt'), 'x');
    execFileSync('git', ['-C', dir, 'add', '-A']);
    execFileSync('git', ['-C', dir, 'commit', '-qm', 'base']);
    return dir;
  };
  const laneA = criarRepo('a');
  const laneB = criarRepo('b');

  writeFileSync(join(laneA, 'alvo.txt'), 'v1');
  const declMulti = {
    lanes: { A: laneA, B: laneB },
    baselinePorLane: { A: shasDaLane(laneA), B: shasDaLane(laneB) },
    entradas: [{ lane: 'A', caminho: 'alvo.txt' }]
  };

  writeFileSync(join(laneA, 'alvo.txt'), 'v2');
  const soDeclaradoMulti = observarEscritaDasLanes(declMulti);

  // A escrita nao declarada vai na lane B — invisivel para a observacao de lane unica.
  writeFileSync(join(laneB, 'clandestino.txt'), 'fora do escopo');
  const comOutraLane = observarEscritaDasLanes(declMulti);
  const classeMulti = compararDeclaradoObservado({
    declarado: caminhosDeclarados(declMulti), observado: comOutraLane.observado
  }).classe;

  // Contraprova: a mesma escrita, observada so pela lane A, continua parecendo limpa.
  const soLaneA = observarEscritaDasLanes({
    lane: laneA, baselineDaLane: declMulti.baselinePorLane.A, entradas: declMulti.entradas
  });
  const classeLaneUnica = compararDeclaradoObservado({
    declarado: ['LANE::alvo.txt'], observado: soLaneA.observado.map((c) => c.replace(/^A::/, 'LANE::'))
  }).classe;

  const semBaselineDeB = observarEscritaDasLanes({
    lanes: { A: laneA, B: laneB }, baselinePorLane: { A: declMulti.baselinePorLane.A }, entradas: []
  });

  // A isencao do livro-razao precisa ser ESTREITA: cobre os dois artefatos e nada mais.
  writeFileSync(join(laneB, 'docs-eos-v2-WRITE_SET.json'), '{}');
  const vizinhoDoLedger = observarEscritaDasLanes(declMulti).observado;

  const casosMultiLane = [
    ['só o declarado mudou -> observado qualificado por lane',
      soDeclaradoMulti.observado.join() === 'A::alvo.txt'],
    ['escrita na SEGUNDA lane entra na observação',
      comOutraLane.observado.includes('B::clandestino.txt')],
    /* [H-01.11] Virar ignorado não é escrever. A versão anterior classificava as duas como
       `UNDECLARED_WRITE`, e o registro da Fase 0 do ADMAI DELIVERY MODE saiu impreciso por isso. */
    ...(() => {
      const dir = mkdtempSync(join(tmpdir(), 'ws-ign-'));
      execFileSync('git', ['-C', dir, 'init', '-q']);
      execFileSync('git', ['-C', dir, 'config', 'user.email', 'a@b.c']);
      execFileSync('git', ['-C', dir, 'config', 'user.name', 't']);
      writeFileSync(join(dir, 'fica.txt'), 'x');
      writeFileSync(join(dir, 'vira-ignorado.txt'), 'y');
      writeFileSync(join(dir, 'some.txt'), 'z');
      const baseIgn = shasDaLane(dir);

      writeFileSync(join(dir, '.gitignore'), 'vira-ignorado.txt\n');
      rmSync(join(dir, 'some.txt'), { force: true });
      const o = observarEscritaDaLane({ baselineDaLane: baseIgn, lane: dir }, dir);
      rmSync(dir, { recursive: true, force: true });

      return [
        ['caminho que passou a ser IGNORADO nao entra como escrita',
          o.ignoradosAgora.includes('vira-ignorado.txt') && !o.observado.includes('vira-ignorado.txt')],
        /* [H01-REV-03] O caso que a primeira versao perdia: APAGADO **e** ignorado. Perguntar so
           "esta ignorado?" fazia uma exclusao real e liquida desaparecer. */
        ...(() => {
          const d2 = mkdtempSync(join(tmpdir(), 'ws-del-'));
          execFileSync('git', ['-C', d2, 'init', '-q']);
          execFileSync('git', ['-C', d2, 'config', 'user.email', 'a@b.c']);
          execFileSync('git', ['-C', d2, 'config', 'user.name', 't']);
          writeFileSync(join(d2, 'seed.txt'), 'x');
          execFileSync('git', ['-C', d2, 'add', '-A']);
          execFileSync('git', ['-C', d2, 'commit', '-qm', 'b']);
          writeFileSync(join(d2, 'apagado.txt'), 'conteudo');
          writeFileSync(join(d2, 'alterado.txt'), 'v1');
          const b2 = shasDaLane(d2);

          writeFileSync(join(d2, '.gitignore'), 'apagado.txt\nalterado.txt\n');
          rmSync(join(d2, 'apagado.txt'), { force: true });
          writeFileSync(join(d2, 'alterado.txt'), 'v2');
          const r2 = observarEscritaDaLane({ baselineDaLane: b2, lane: d2 }, d2);
          rmSync(d2, { recursive: true, force: true });

          return [
            ['APAGADO + ignorado continua sendo diferenca observada',
              r2.observado.includes('apagado.txt') && !r2.ignoradosAgora.includes('apagado.txt')],
            ['ALTERADO + ignorado continua sendo diferenca observada',
              r2.observado.includes('alterado.txt') && !r2.ignoradosAgora.includes('alterado.txt')]
          ];
        })(),
        ['CONTRAPROVA: caminho APAGADO continua entrando como diferenca',
          o.observado.includes('some.txt')],
        ['CONTRAPROVA: caminho intacto nao aparece em lugar nenhum',
          !o.observado.includes('fica.txt') && !o.ignoradosAgora.includes('fica.txt')]
      ];
    })(),
    ['... e a comparação multi-lane classifica UNDECLARED_WRITE',
      classeMulti === 'UNDECLARED_WRITE'],
    ['CONTRAPROVA: a mesma escrita observada por uma lane só devolve MATCH',
      classeLaneUnica === 'MATCH'],
    ['escopo da observação é nomeado, não presumido',
      comOutraLane.escopo === 'TODAS_AS_LANES_DECLARADAS' && soLaneA.escopo === 'LANE_UNICA'],
    ['lane declarada SEM baseline derruba a observação inteira',
      semBaselineDeB.disponivel === false && semBaselineDeB.escopo === 'PARCIAL'],
    ['isenção do livro-razão não vaza para nome parecido',
      vizinhoDoLedger.includes('B::docs-eos-v2-WRITE_SET.json')],
    /* [R25-03] O controle anterior era `length === 2 && endsWith('.json')` — verdadeiro para
       QUALQUER par de arquivos .json. Não provava quais dois estão isentos, então trocar a lista
       inteira por outros dois caminhos passaria. Identidade exata, ordenada. */
    ['os dois artefatos isentos são exatamente estes',
      [...ARTEFATOS_DO_GATE].sort().join('|')
        === 'docs/eos-v2/WRITE_SET.json|docs/eos-v2/WRITE_SET_HISTORY.json'],
    ['livro-razão tocado é REPORTADO, não removido em silêncio',
      (() => {
        mkdirSync(join(laneB, 'docs/eos-v2'), { recursive: true });
        writeFileSync(join(laneB, 'docs/eos-v2/WRITE_SET.json'), '{"adulterado":true}');
        const o = observarEscritaDasLanes(declMulti);
        return o.livroRazao.includes('B::docs/eos-v2/WRITE_SET.json')
          && !o.observado.includes('B::docs/eos-v2/WRITE_SET.json');
      })()],
    /* [R25-02] O caso que o baseline restrito a sujos PERDIA: arquivo limpo na declaração, escrito,
       depois commitado. Some da lista de sujos, e a observação antiga não tinha com o que comparar. */
    ['arquivo limpo, escrito e COMMITADO ainda é observado',
      (() => {
        const base = shasDaLane(laneA);
        writeFileSync(join(laneA, 'base.txt'), 'alterado depois da declaracao');
        execFileSync('git', ['-C', laneA, 'add', '-A']);
        execFileSync('git', ['-C', laneA, 'commit', '-qm', 'escondendo nos commits']);
        const o = observarEscritaDaLane({ baselineDaLane: base, lane: laneA }, laneA);
        return o.observado.includes('base.txt');
      })()],
    ['baseline cobre arquivo RASTREADO e limpo, não só o sujo',
      Object.keys(shasDaLane(laneB)).includes('base.txt')],
    /* [R25-02] HEAD movido: a comparação perde a base e não pode emitir classe forte. */
    ['HEAD movido desde a declaração -> UNKNOWN_DIFFERENCE',
      (() => {
        const r = compararRodada({
          lanes: { A: laneA }, baselinePorLane: { A: shasDaLane(laneA) },
          baseCommitPorLane: { A: '0'.repeat(40) }, entradas: []
        });
        return r.classe === 'UNKNOWN_DIFFERENCE' && r.motivo.startsWith('HEAD_MOVEU');
      })()],
    ['CONTRAPROVA: HEAD correto deixa a comparação emitir classe real',
      compararRodada({
        lanes: { A: laneA }, baselinePorLane: { A: shasDaLane(laneA) },
        baseCommitPorLane: {
          A: execFileSync('git', ['-C', laneA, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        },
        entradas: []
      }).classe === 'MATCH'],
    /* [R26-03/04] Arquivamento: fail-open e destrutivo, os dois no caminho de erro. */
    ...(() => {
      const dirA = join(laneB, 'arq');
      mkdirSync(dirA, { recursive: true });
      const decl = join(dirA, 'ws.json');
      const hist = join(dirA, 'hist.json');
      const gravarDecl = (d) => writeFileSync(decl, JSON.stringify(d));
      const declBoa = {
        sliceId: 'Y', estado: 'VALIDATED', lanes: { A: laneA },
        baselinePorLane: { A: shasDaLane(laneA) },
        baseCommitPorLane: { A: execFileSync('git', ['-C', laneA, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() },
        entradas: []
      };

      writeFileSync(hist, '{"declaracoes":[]}');
      gravarDecl({ ...declBoa, estado: 'INVALIDATED', motivo: 'x' });
      const invalidada = arquivar(decl, hist);

      const corrompido = '{ isto nao e json';
      writeFileSync(hist, corrompido);
      gravarDecl(declBoa);
      const comHistoricoRuim = arquivar(decl, hist);
      const preservou = readFileSync(hist, 'utf8') === corrompido;

      writeFileSync(hist, '{"declaracoes":[]}');
      gravarDecl({ ...declBoa, provenance: 'ARTEFATO_ORIGINAL', baselinePorLane: undefined, lanes: undefined });
      arquivar(decl, hist);
      const forjada = JSON.parse(readFileSync(hist, 'utf8')).declaracoes[0];

      writeFileSync(hist, '{"declaracoes":[]}');
      gravarDecl({ ...declBoa, baseCommitPorLane: { A: '0'.repeat(40) } });
      arquivar(decl, hist);
      const headMovido = JSON.parse(readFileSync(hist, 'utf8')).declaracoes[0];

      /* [R27-02] Parse OK não é histórico legível. */
      writeFileSync(hist, '{"declaracoes":"EVIDENCIA_ANTIGA"}');
      gravarDecl(declBoa);
      const estruturaRuim = arquivar(decl, hist);
      const preservouEstrutura = readFileSync(hist, 'utf8') === '{"declaracoes":"EVIDENCIA_ANTIGA"}';

      /* [R27-03] Rearquivar o mesmo sliceId apagava a violação e o bloqueio sumia. */
      writeFileSync(hist, JSON.stringify({ declaracoes: [{
        sliceId: 'Y', comparacao: 'UNDECLARED_WRITE', bloqueiaIntegracao: true
      }] }));
      const bloqueadoAntes = bloqueiosAbertos(hist);
      gravarDecl(declBoa);
      arquivar(decl, hist);
      const bloqueadoDepois = bloqueiosAbertos(hist);
      const histFinal = JSON.parse(readFileSync(hist, 'utf8')).declaracoes;

      /* [R27-04] Não saber o que foi escrito não é "nenhum bloqueio". */
      writeFileSync(hist, JSON.stringify({ declaracoes: [{
        sliceId: 'Z', comparacao: 'UNKNOWN_DIFFERENCE'
      }] }));
      const indeterminado = bloqueiosAbertos(hist);

      return [
        ['arquivar RECUSA declaração INVALIDATED', invalidada.arquivado === false],
        ['arquivar RECUSA histórico com `declaracoes` que não é lista',
          estruturaRuim.arquivado === false && preservouEstrutura],
        ['rearquivar NÃO apaga a violação registrada',
          bloqueadoAntes.join() === 'Y' && bloqueadoDepois.includes('Y')],
        ['... e a entrada nova convive com ela em vez de substituí-la',
          histFinal.length === 2 && histFinal.some((d) => d.comparacao === 'UNDECLARED_WRITE')],
        ['UNKNOWN_DIFFERENCE bloqueia: não saber não é estar limpo',
          indeterminado.join() === 'Z'],
        /* [R28-02] O R27-03 preservava só `UNDECLARED_WRITE`; um `UNKNOWN_DIFFERENCE` anterior
           continuava sendo apagado, reabrindo o fail-open que o R27-04 tinha fechado. */
        ['rearquivar NÃO apaga UNKNOWN_DIFFERENCE anterior', (() => {
          writeFileSync(hist, JSON.stringify({ declaracoes: [{ sliceId: 'Y', comparacao: 'UNKNOWN_DIFFERENCE' }] }));
          gravarDecl(declBoa);
          arquivar(decl, hist);
          return bloqueiosAbertos(hist).includes('Y');
        })()],
        ['rearquivar NÃO apaga reconciliação anterior', (() => {
          writeFileSync(hist, JSON.stringify({ declaracoes: [{
            sliceId: 'Y', comparacao: 'UNDECLARED_WRITE',
            reconciliacao: { disposicao: 'ACEITO_COMO_RISCO', autorizadoPor: 'usuario', justificativa: 'a'.repeat(30) }
          }] }));
          gravarDecl(declBoa);
          arquivar(decl, hist);
          const d = JSON.parse(readFileSync(hist, 'utf8')).declaracoes;
          return d.some((x) => x.reconciliacao?.disposicao === 'ACEITO_COMO_RISCO');
        })()],
        /* [R28-04] `anteriores.length` excluía as já sufixadas: duas rearquivações davam dois
           `#rearquivado-1`, e `reconciliar()` usa `find()` — a segunda ficava inalcançável. */
        ['dois rearquivamentos NÃO colidem no mesmo id', (() => {
          writeFileSync(hist, JSON.stringify({ declaracoes: [{ sliceId: 'Y', comparacao: 'UNDECLARED_WRITE' }] }));
          gravarDecl(declBoa);
          arquivar(decl, hist);
          arquivar(decl, hist);
          const ids = JSON.parse(readFileSync(hist, 'utf8')).declaracoes.map((d) => d.sliceId);
          return new Set(ids).size === ids.length;
        })()],
        /* [SCOPE-F0] Rearquivar a MESMA declaração recomputava a comparação. Sob HEAD movido, a
           guarda [R25-02] devolve `UNKNOWN_DIFFERENCE`, e como classe bloqueante é preservada, o
           rearquivamento MINTAVA um bloqueio que nunca existiu. Três nasceram assim. */
        ['rearquivar a MESMA declaração é no-op', (() => {
          writeFileSync(hist, '{"declaracoes":[]}');
          gravarDecl({ ...declBoa, declaradoEm: '2026-01-01T00:00:00.000Z' });
          arquivar(decl, hist);
          const depoisDoPrimeiro = JSON.parse(readFileSync(hist, 'utf8')).declaracoes.length;
          const r = arquivar(decl, hist);
          const ids = JSON.parse(readFileSync(hist, 'utf8')).declaracoes.map((d) => d.sliceId);
          /* Nem cresce, nem ganha sufixo: o histórico fica idêntico. */
          return depoisDoPrimeiro === 1 && ids.length === 1 && r.arquivado === false
            && !ids.some((i) => String(i).includes('#'));
        })()],
        /* CONTRAPROVA obrigatória: sem ela, "arquivar nunca faz nada" passaria como idempotência —
           e o registro deixaria de existir, que é falha muito pior que duplicata. */
        ['CONTRAPROVA: declaração NOVA da mesma fatia continua sendo arquivada', (() => {
          writeFileSync(hist, '{"declaracoes":[]}');
          gravarDecl({ ...declBoa, declaradoEm: '2026-01-01T00:00:00.000Z' });
          arquivar(decl, hist);
          gravarDecl({ ...declBoa, declaradoEm: '2026-02-02T00:00:00.000Z' });
          const r = arquivar(decl, hist);
          const d = JSON.parse(readFileSync(hist, 'utf8')).declaracoes;
          /* O que prova a contraprova é o `declaradoEm` NOVO ter chegado ao histórico. A primeira
             versão exigia duas linhas e falhava: entrada anterior NÃO bloqueante é substituída, uma
             linha por fatia, pelo [R27-03]. A regra estava certa; a asserção é que estava errada —
             e contar linhas mediria a política de substituição, não a idempotência. */
          return r.arquivado === true
            && d.some((x) => x.declaradoEm === '2026-02-02T00:00:00.000Z');
        })()],
        /* [R28-03] Histórico malformado devolvia `[]` — a afirmação mais forte a partir da
           estrutura mais desconhecida. Irmão do R27-02, que eu corrigi só em `arquivar()`. */
        ['histórico sem lista `declaracoes` bloqueia em vez de parecer limpo', (() => {
          writeFileSync(hist, '{"declaracoes":"EVIDENCIA"}');
          return bloqueiosAbertos(hist).join() === 'HISTORICO_MALFORMADO';
        })()],
        ['... e não se reconcilia sobre estrutura desconhecida',
          reconciliar({
            sliceId: 'Y', disposicao: 'ACEITO_COMO_RISCO', autorizadoPor: 'controle',
            justificativa: 'estrutura desconhecida nao pode receber disposicao'
          }, hist).reconciliado === false],
        ['arquivar RECUSA histórico ilegível em vez de sobrescrever', comHistoricoRuim.arquivado === false],
        ['... e o histórico corrompido é PRESERVADO byte a byte', preservou],
        ['declaração não escolhe a própria provenance', forjada.provenance === 'UNKNOWN_PROVENANCE'],
        ['HEAD movido não produz evidência ORIGINAL_PRE_MUTATION',
          headMovido.comparacao === 'UNKNOWN_DIFFERENCE' && headMovido.provenance === 'UNKNOWN_PROVENANCE'],
        /* CONTRAPROVA: declaração íntegra ainda alcança a provenance forte. */
        ['CONTRAPROVA: declaração com baseline e HEAD certo é ORIGINAL_PRE_MUTATION', (() => {
          writeFileSync(hist, '{"declaracoes":[]}');
          gravarDecl(declBoa);
          arquivar(decl, hist);
          return JSON.parse(readFileSync(hist, 'utf8')).declaracoes[0].provenance === 'ORIGINAL_PRE_MUTATION';
        })()]
      ];
    })(),
    /* [R25-08] Reconciliação: dispõe do bloqueio, nunca da violação. */
    ...(() => {
      const hTmp = join(laneB, 'hist.json');
      const gravar = (d) => writeFileSync(hTmp, JSON.stringify({ declaracoes: [d] }));
      const ler = () => JSON.parse(readFileSync(hTmp, 'utf8')).declaracoes[0];
      const violado = {
        sliceId: 'X', comparacao: 'UNDECLARED_WRITE', bloqueiaIntegracao: true,
        caminhosNaoDeclarados: ['a.js']
      };
      const bom = {
        sliceId: 'X', disposicao: 'CONTEUDO_ACEITO_ORDEM_VIOLADA', autorizadoPor: 'usuario',
        justificativa: 'conteudo legitimo, o que faltou foi a declaracao previa'
      };
      gravar(violado);
      const ok = reconciliar(bom, hTmp);
      const depois = ler();

      gravar({ ...violado });
      const semAutor = reconciliar({ ...bom, autorizadoPor: '' }, hTmp);
      gravar({ ...violado });
      const semRazao = reconciliar({ ...bom, justificativa: 'curta' }, hTmp);
      gravar({ ...violado });
      const disposicaoInvalida = reconciliar({ ...bom, disposicao: 'TUDO_BEM' }, hTmp);
      gravar({ sliceId: 'X', comparacao: 'MATCH' });
      const nadaAReconciliar = reconciliar(bom, hTmp);

      gravar({ ...violado });
      const antesDaDisposicao = bloqueiosAbertos(hTmp);
      reconciliar(bom, hTmp);
      const depoisDaDisposicao = bloqueiosAbertos(hTmp);

      return [
        /* [R26-05] Espaços em branco satisfaziam `!autorizadoPor` e `length >= 20`. */
        ['autoria só de espaços é RECUSADA', (() => {
          gravar({ ...violado });
          return reconciliar({ ...bom, autorizadoPor: '   ' }, hTmp).reconciliado === false;
        })()],
        ['justificativa só de espaços é RECUSADA', (() => {
          gravar({ ...violado });
          return reconciliar({ ...bom, justificativa: ' '.repeat(30) }, hTmp).reconciliado === false;
        })()],
        ['reconciliação VAZIA não conta como disposição', (() => {
          gravar({ ...violado, reconciliacao: {} });
          return bloqueiosAbertos(hTmp).join() === 'X';
        })()],
        ['disposição fora da taxonomia no registro não conta', (() => {
          gravar({ ...violado, reconciliacao: { disposicao: 'INVENTADA', autorizadoPor: 'x', justificativa: 'a'.repeat(30) } });
          return bloqueiosAbertos(hTmp).join() === 'X';
        })()],
        /* [R26-05] Histórico ausente devolvia `[]` — silêncio lido como "nada bloqueia". */
        ['histórico ausente NÃO significa "nenhum bloqueio"',
          bloqueiosAbertos(join(laneB, 'nao-existe.json')).join() === 'HISTORICO_AUSENTE'],
        ['reconciliação PRESERVA a violação', ok.reconciliado && depois.comparacao === 'UNDECLARED_WRITE'],
        ['... e levanta apenas o bloqueio', depois.bloqueiaIntegracao === false && !!depois.reconciliacao],
        ['disposição sem autoria é RECUSADA', semAutor.reconciliado === false],
        ['disposição sem justificativa substantiva é RECUSADA', semRazao.reconciliado === false],
        ['disposição fora da taxonomia é RECUSADA', disposicaoInvalida.reconciliado === false],
        /* [H-01.11] A quarta disposição nega que houve escrita — a afirmação mais forte das quatro.
           Não pode virar o atalho por onde qualquer violação escapa dizendo "o instrumento errou". */
        ['negar a escrita SEM nomear o defeito é RECUSADO', (() => {
          gravar({ ...violado });
          return reconciliar({ ...bom, disposicao: EXIGE_DEFEITO_NOMEADO, correcao: 'x'.repeat(20) }, hTmp)
            .reconciliado === false;
        })()],
        ['negar a escrita SEM apontar a correção é RECUSADO', (() => {
          gravar({ ...violado });
          return reconciliar({ ...bom, disposicao: EXIGE_DEFEITO_NOMEADO, defeito: 'x'.repeat(20) }, hTmp)
            .reconciliado === false;
        })()],
        ['defeito só de espaços é RECUSADO', (() => {
          gravar({ ...violado });
          return reconciliar({
            ...bom, disposicao: EXIGE_DEFEITO_NOMEADO, defeito: ' '.repeat(20), correcao: 'x'.repeat(20)
          }, hTmp).reconciliado === false;
        })()],
        /* CONTRAPROVA: com defeito e correção nomeados, a disposição é aceita. */
        ['CONTRAPROVA: defeito e correção nomeados são aceitos, e a violação PERSISTE', (() => {
          gravar({ ...violado });
          const r = reconciliar({
            ...bom, disposicao: EXIGE_DEFEITO_NOMEADO,
            defeito: 'classificava mudanca de ignore-status como escrita',
            correcao: 'H-01.11 separa AGORA_IGNORADO de escrita, provado nos dois sentidos'
          }, hTmp);
          const d = ler();
          return r.reconciliado && d.comparacao === 'UNDECLARED_WRITE'
            && d.reconciliacao.defeito.length > 10 && /autoriza escrita/.test(d.reconciliacao.preserva);
        })()],
        ['as outras disposições NÃO exigem defeito nomeado', (() => {
          gravar({ ...violado });
          return reconciliar(bom, hTmp).reconciliado === true;
        })()],
        /* [H01-REV-04] A exigência morava só no ESCRITOR (`reconciliar`), e quem levanta o bloqueio é
           o LEITOR (`bloqueiosAbertos` via `disposicaoValida`). Um registro escrito à mão com a
           disposição especial e sem defeito passava pela porta que `reconciliar` fechava. */
        ['registro manual com a disposição especial e SEM defeito NÃO levanta o bloqueio', (() => {
          gravar({ ...violado, reconciliacao: {
            disposicao: EXIGE_DEFEITO_NOMEADO, autorizadoPor: 'alguem',
            justificativa: 'justificativa suficientemente longa para passar'
          } });
          return bloqueiosAbertos(hTmp).join() === 'X';
        })()],
        ['... e SEM correção também não', (() => {
          gravar({ ...violado, reconciliacao: {
            disposicao: EXIGE_DEFEITO_NOMEADO, autorizadoPor: 'alguem',
            justificativa: 'justificativa suficientemente longa para passar',
            defeito: 'defeito nomeado aqui'
          } });
          return bloqueiosAbertos(hTmp).join() === 'X';
        })()],
        ['CONTRAPROVA: com defeito E correção, o leitor concorda com o escritor', (() => {
          gravar({ ...violado, reconciliacao: {
            disposicao: EXIGE_DEFEITO_NOMEADO, autorizadoPor: 'alguem',
            justificativa: 'justificativa suficientemente longa para passar',
            defeito: 'defeito nomeado aqui', correcao: 'correcao apontavel aqui'
          } });
          return bloqueiosAbertos(hTmp).length === 0;
        })()],
        ['registro que não é UNDECLARED_WRITE não se reconcilia', nadaAReconciliar.reconciliado === false],
        ['bloqueio some da lista só APÓS a disposição',
          antesDaDisposicao.join() === 'X' && depoisDaDisposicao.length === 0],
        /* CONTRAPROVA: sem a disposição o bloqueio volta — a lista não é decorativa. */
        ['CONTRAPROVA: apagar a disposição faz o bloqueio reaparecer', (() => {
          const d = ler(); delete d.reconciliacao; gravar(d);
          return bloqueiosAbertos(hTmp).join() === 'X';
        })()]
      ];
    })(),
    ['entrada apontando para lane não declarada é problema de validação',
      validarDeclaracao(
        { estado: 'VALIDATED', sliceId: 's', lanes: { A: laneA }, baselinePorLane: { A: {} },
          entradas: [{ lane: 'Z', caminho: 'x', precisao: 'EXACT' }] },
        { sujos: new Set(), baseCommitAtual: null, shaAtual: null }
      ).problemas.some((p) => p.includes('lane "Z"'))]
  ];
  rmSync(laneA, { recursive: true, force: true });
  rmSync(laneB, { recursive: true, force: true });

  for (const [rotulo, cond] of [...sabotagens, ...casosComparacao, ...casosRetroativos, ...casosObservacao, ...casosMultiLane]) {
    check(rotulo, cond, 'controle falhou');
  }

  const retroativosReais = detectarDeclaracaoRetroativa(decl, shaAtual);

  console.log('AdmAi — Pre-Mutation Write Set Gate  [F-MAR-068]');
  console.log(`  fatia declarada : ${decl.sliceId ?? 'NENHUMA'} (${decl.estado})`);
  console.log(`  entradas        : ${(decl.entradas ?? []).length}`);
  console.log(`  MUTATION_READY  : ${pronto.pronto ? 'SIM' : `NAO — ${pronto.motivo}`}`);
  if (!validacao.valido) for (const p of validacao.problemas) console.log(`    ! ${p}`);
  if (retroativosReais.length) {
    console.log(`  RETROACTIVE_SCOPE_NORMALIZATION : ${retroativosReais.join(', ')}`);
  }
  console.log(`  controles       : ${ok.length}/${ok.length + falhas.length}`);
  for (const f of falhas) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log('    provado: o gate REJEITA mutação sem Write Set validado, detecta declaração');
  console.log('      retroativa pela assinatura sha, e distingue expansão autorizada de escrita');
  console.log('      não declarada. O controle positivo impede que "rejeitar tudo" passe.');
  console.log('    NAO provado, e a diferença importa: este gate DETECTA, não IMPEDE. [R26-02]');
  console.log('      Nenhum processo fica impedido de escrever — hooks estão desligados e o contrato');
  console.log('      proíbe criá-los aqui. E "UNDECLARED_WRITE bloqueia integração" é hoje');
  console.log('      COORDINATION_ONLY: bloqueiosAbertos() informa, e nada obriga a consultá-lo antes');
  console.log('      de integrar. Isto foi publicado como POLICY_ENFORCED por seis rodadas.');
  const abertos = bloqueiosAbertos();
  console.log(`    bloqueios de integração em aberto: ${abertos.length ? abertos.join(', ') : 'nenhum'}`);

  if (falhas.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use este gate como evidência');
    return 2;
  }
  /* [R27-05] Os dois modos precisam DIFERIR sempre, não só quando o estado está ruim. `--selftest`
     responde por uma pergunta ("o instrumento funciona?") e `--validar` por outra ("esta declaração
     autoriza mutação?"). Antes, com declaração boa, as saídas eram byte a byte iguais e o modo era
     indistinguível de não existir. */
  if (modo === 'selftest') {
    console.log('  MODO: selftest — mede o INSTRUMENTO. Não afirma nada sobre a declaração corrente.');
    return 0;
  }
  console.log('  MODO: validar — mede a DECLARAÇÃO corrente. Controles do instrumento acima.');
  if (!pronto.pronto) return 1;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar(process.argv.slice(2)));
}
