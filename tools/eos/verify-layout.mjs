/**
 * EOS — verificacao do contrato de layout.  [SL-BOOT-02 · BOOTSTRAP_PROOF]
 *
 * Rodada de correcao 1, a partir do cross-review independente do Codex, que
 * devolveu CORRECOES_NECESSARIAS com tres defeitos reais:
 *
 *   1. O controle negativo anterior era VACUO. Ele fazia
 *      `['accounting','subsistema-que-nao-existe'].some(s => !existe(s))`, o que e
 *      verdade por construcao: o sentinela nunca existe, entao o `some` sempre
 *      retorna true sem exercitar LAY-01. Um controle que nao pode falhar nao
 *      mede nada — exatamente o defeito que este projeto passou sete planos
 *      caçando. Agora o sentinela atravessa a MESMA funcao de avaliacao que a
 *      verificacao real usa, e o teste exige que ela produza a falha.
 *
 *   2. A mensagem de sucesso afirmava mais do que a evidencia sustenta. Presenca
 *      hoje nao prova ausencia de movimentacao historica. Sob MAR-INV-025 a
 *      afirmacao precisa dizer exatamente o que foi provado, e passa a ser
 *      medida contra um manifesto de baseline registrado.
 *
 *   3. `layout.mjs` declara seis subnamespaces de `protocol` que nao existem no
 *      filesystem, e nada distinguia "declarado" de "materializado". Agora e
 *      explicito, e a inconsistencia entre os dois vira falha.
 *
 * Roda sob BOOTSTRAP_PROOF (F-MAR-063 / MASTER-INV-002).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { SUBSISTEMAS_EXISTENTES, NAMESPACES_ADITIVOS, REGRA_ADITIVA } from './layout.mjs';

const RAIZ = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const MANIFESTO = `${RAIZ}layout-baseline.json`;
const ANCORA = `${RAIZ}layout-plan-anchor.json`;
const PLANO_A = `${RAIZ}../../docs/eos-v2/plans/PLAN_A_FOUNDATIONS.md`;
const PLANO_G = `${RAIZ}../../docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md`;

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

/**
 * Deriva o layout aditivo do PLAN-A secao AK.  [achado 7 da revisao do Codex]
 *
 * Antes, `layout.mjs` era a unica fonte de quais namespaces e subnamespaces existem:
 * acrescentar um subnamespace inventado como "pendente" passava sem falha, porque
 * nada comparava a lista com o contrato documental. Agora a lista vem do bloco de
 * codigo da secao AK, que o candidato nao edita ao editar `layout.mjs`.
 *
 * Retorna `null` quando o PLAN-A nao esta acessivel — e a ausencia e FALHA, nao SKIP.
 */
export function derivarLayoutDoPlano(caminho = PLANO_A) {
  if (!existsSync(caminho)) return null;
  const texto = readFileSync(caminho, 'utf8');
  const iAK = texto.search(/^## AK\./m);
  const iAL = texto.search(/^## AL/m);
  if (!(iAK >= 0 && iAL > iAK)) return null;
  const secao = texto.slice(iAK, iAL);
  const bloco = secao.match(/```\n([\s\S]*?)```/);
  if (!bloco) return null;

  /* Profundidade EXATA, nao `\s{2,}`.  [bloqueante da revisao R4]
     A versao anterior tratava qualquer profundidade como namespace de topo: recuar
     `authority/` de dois para quatro espacos — tornando-o visualmente filho de
     `protocol/` — continuava derivando `authority` como topo, e com o SHA atualizado
     a verificacao passava. Hierarquia por indentacao E o significado do bloco; perde-la
     e perder o contrato. Medido no texto congelado: raiz em coluna 0, namespaces em
     exatamente dois espacos. Qualquer outra profundidade e linha fora da gramatica. */
  const mapa = {};
  const linhasForaDaGramatica = [];
  for (const linha of bloco[1].replace(/\([^)]*\)/g, '').split('\n')) {
    if (linha.trim() === '') continue;
    const raiz = linha.match(/^([A-Za-z][\w-]*\/)+$/);
    if (raiz) continue;
    const m = linha.match(/^ {2}([A-Za-z][\w-]*)\/(.*)$/);
    if (!m) { linhasForaDaGramatica.push(linha); continue; }
    mapa[m[1]] = [...m[2].matchAll(/([A-Za-z][\w-]*)\//g)].map((x) => x[1]);
  }

  /* O texto da secao e do bloco viajam junto com o mapa: sem eles, o chamador nao
     tem como checar fingerprint nem totalidade, e voltaria a confiar numa extracao
     possivelmente parcial. `linhasForaDaGramatica` viaja pelo mesmo motivo. */
  return { mapa, secao, bloco: bloco[1], linhasForaDaGramatica };
}

/**
 * IDs de Slice do Master DAG, extraidos EXCLUSIVAMENTE do bloco da secao W.
 * [achado MEDIO da revisao R2]
 *
 * A versao anterior varria o PLAN-G inteiro com /SL-[A-Z]+-\d+/. Hoje os conjuntos
 * coincidem, mas uma mencao em prosa, num registro de findings ou num exemplo
 * passaria como Slice existente — e LAY-04, LAY-06b e LAY-06e aceitariam um dono que
 * nao esta no grafo. Bloco ausente e FALHA, nunca SKIP.
 */
/**
 * Le o lado direito de uma entrada do DAG.  [R5-02, corrigida na R6-02]
 *
 * Exportada de proposito: os controles negativos chamam ESTA funcao com strings
 * adulteradas. Enquanto as sabotagens adulteravam o objeto ja derivado, defeitos do
 * proprio parser passavam despercebidos — foi o achado R6-02.
 *
 * Defeitos que a R6 encontrou aqui e que esta versao fecha:
 *   `SL-CX-04..01`      intervalo descendente devolvia ids=[] com integral=true: a
 *                       dependencia sumia em silencio.
 *   `... + D2 SL-`      `SL-` truncado escapava porque o teste exigia `SL-[A-Z]`.
 *   `+ D3`              qualquer coisa iniciada por `+` passava; so `+ D2` e forma real.
 *   `(nao fechado`      parentese sem fechamento passava.
 */
export function lerDependencias(rhs) {
  const ids = [];
  let resto = rhs;
  let intervaloInvalido = null;

  /* Consome a LISTA da esquerda para a direita. O primeiro trecho que nao for Slice
     nem intervalo encerra a lista e comeca a anotacao. */
  for (;;) {
    const m = resto.match(/^[\s,]*(SL-[A-Z]+)-(\d+)(?:\.\.(\d+))?/);
    if (!m) break;
    const [inteiro, prefixo, ini, fim] = m;
    if (fim !== undefined && Number(fim) < Number(ini)) {
      intervaloInvalido = `${prefixo}-${ini}..${fim}`;
      break;
    }
    const largura = ini.length;
    for (let i = Number(ini); i <= Number(fim ?? ini); i++) {
      ids.push(`${prefixo}-${String(i).padStart(largura, '0')}`);
    }
    resto = resto.slice(inteiro.length);
  }

  /* Anotacao: exatamente as tres formas medidas no texto congelado. Forma reconhecida
     inteira, nao apenas primeiro caractere. */
  const anotacao = resto.trim();
  const formaValida =
    anotacao === '' ||
    /^\([^()]*\)$/u.test(anotacao) ||        // comentario entre parenteses, fechado
    /^→[^()]*$/u.test(anotacao) ||           // cauda apos seta
    anotacao === '+ D2';                     // decisao do usuario, literal

  const escondeSlice = /SL-/.test(anotacao);

  return {
    ids,
    resto: anotacao,
    intervaloInvalido,
    integral: intervaloInvalido === null && formaValida && !escondeSlice
  };
}

export function derivarDagDoPlanoG(caminho = PLANO_G) {
  if (!existsSync(caminho)) return null;
  const texto = readFileSync(caminho, 'utf8');
  const iW = texto.search(/^## W\./m);
  const iX = texto.search(/^## X\./m);
  if (!(iW >= 0 && iX > iW)) return null;
  const secao = texto.slice(iW, iX);
  const cercas = (secao.match(/```/g) ?? []).length;
  const bloco = secao.match(/```\n([\s\S]*?)```/);
  if (!bloco) return null;

  /* DEFINICAO nao e MENCAO.  [achado ALTO da revisao R4]
     A versao anterior reunia todo `SL-*` do bloco, dos dois lados da seta. Remover a
     entrada definidora `SL-BOOT-01 ← (nenhum)` mantinha 85 IDs, porque SL-BOOT-01
     continua citado como dependencia de outros — e a verificacao passava afirmando
     que todo `declaradoPor` existe no DAG. Existir como dependencia de alguem nao e
     existir como no. Os dois conjuntos passam a ser derivados separadamente. */
  /* Intervalos e consumo integral do lado direito.  [R5-02]
     O DAG usa notacao de intervalo: `SL-CX-05 ← SL-CX-01..04`. A extracao anterior
     casava `SL-CX-01` e ignorava `..04` — entao trocar por `..99` mantinha 85
     definicoes e NENHUMA dependencia orfa aparecia, embora `SL-CX-99` nao exista.
     Agora o intervalo e expandido, e o que sobra do lado direito depois da extracao
     nao pode conter digito nem `SL`: resto nao consumido e falha, nao silencio. */
  /* `lerDeps` — exportada porque as sabotagens PRECISAM atravessar o parser real.
     [R6-02] A rodada anterior testava objetos ja derivados: dois mutantes triviais do
     parser — "intervalo consome so o primeiro extremo" e "todo resto e integral" —
     mantinham 80 PASS, 36/36 e exit 0. Eu havia testado as CHECAGENS, nao o PARSER.
     Uma sabotagem que nao passa pelo codigo que protege nao mede esse codigo. */
  const lerDeps = lerDependencias;

  const entradas = [];
  for (const linha of bloco[1].split('\n')) {
    for (const parte of linha.split(/(?=SL-[A-Z]+-\d+\s*←)/)) {
      const m = parte.match(/^(SL-[A-Z]+-\d+)\s*←(.*)$/);
      if (!m) continue;
      const { ids, resto, integral } = lerDeps(m[2]);
      entradas.push({ no: m[1], deps: ids, restoNaoConsumido: integral ? null : resto.trim() });
    }
  }
  return {
    definidos: new Set(entradas.map((e) => e.no)),
    referenciados: new Set(entradas.flatMap((e) => e.deps)),
    entradas,
    secao,
    bloco: bloco[1],
    cercas
  };
}

/**
 * Observador do filesystem. E injetavel porque alguns controles negativos precisam
 * simular estados que NAO se pode criar no disco durante uma verificacao — por
 * exemplo "o caminho existe mas nao e diretorio". Sem injecao, esses controles
 * teriam de tocar o repositorio real, ou viveriam num caminho de codigo paralelo, e
 * entao provariam outra coisa.
 */
export function observadorReal(caminho) {
  if (!existsSync(caminho)) return { existe: false, ehDiretorio: false, filhos: [] };
  const ehDiretorio = statSync(caminho).isDirectory();
  return { existe: true, ehDiretorio, filhos: ehDiretorio ? readdirSync(caminho) : [] };
}

/**
 * Avalia o layout contra um roster de subsistemas, o contrato de namespaces e um
 * manifesto de baseline.
 *
 * E funcao PURA de suas entradas justamente para que o controle negativo possa
 * chamar o MESMO caminho de codigo com entrada adulterada. Se o negativo usasse
 * outro caminho, ele provaria outra coisa.
 */
export function avaliarLayout({
  roster, raiz, manifesto,
  namespaces = NAMESPACES_ADITIVOS,
  observar = observadorReal,
  layoutDoPlano = derivarLayoutDoPlano(),
  dagDoPlano = derivarDagDoPlanoG(),
  ancora = existsSync(ANCORA) ? JSON.parse(readFileSync(ANCORA, 'utf8')) : null
}) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  /* LAY-01 — todo subsistema do roster existe. */
  for (const sub of roster) {
    check(`LAY-01/${sub}`, existsSync(`${raiz}${sub}`), `subsistema ausente: tools/eos/${sub}`);
  }

  /* LAY-02 — os namespaces aditivos existem e tem index. */
  for (const ns of Object.keys(namespaces)) {
    check(`LAY-02/${ns}`, existsSync(`${raiz}${ns}/index.mjs`), `namespace aditivo sem index: ${ns}`);
  }

  /* LAY-03 — os namespaces novos contem SOMENTE filho declarado.
     [R12-01] Antes esta linha dizia "nada foi movido para dentro". A checagem enumera os filhos
     de HOJE: ela nao sabe de onde algo veio, sabe se o que esta aqui e legitimo. Um arquivo
     copiado e um arquivo movido sao indistinguiveis para ela — e ambos reprovam se nao forem
     declarados, que e o efeito util.
     Rodada 3 (F-MAR-067): o filho legitimo deixou de ser so `index.mjs`. Um
     subnamespace DECLARADO tambem e filho legitimo — do contrario o primeiro Slice
     que materializasse `protocol/types/` reprovaria aqui. O que continua proibido, e
     e o ponto do controle, e o filho NAO DECLARADO. */
  for (const [ns, c] of Object.entries(namespaces)) {
    const obs = observar(`${raiz}${ns}`);
    if (!obs.existe) continue;
    const permitidos = new Set(['index.mjs', ...Object.keys(c.subNamespaces), ...Object.keys(c.modulos ?? {})]);
    const extras = obs.filhos.filter((f) => !permitidos.has(f));
    check(`LAY-03/${ns}`, extras.length === 0, `filho nao declarado no namespace: ${extras.join(', ')}`);
  }

  /* LAY-16 — o bloco do Master DAG.  [achado ALTO da revisao R3]
     Ler so a secao W nao bastava: a extracao pegava o PRIMEIRO bloco cercado, entao
     um bloco-resumo inserido antes do normativo, contendo apenas os nove IDs que o
     layout usa, era aceito com zero falhas embora o DAG real tenha 85. Agora a secao
     precisa ter EXATAMENTE UM bloco, toda linha precisa ser reconhecida pela
     gramatica, e a contagem de IDs precisa bater com a congelada. */
  /* `doDag` passa a ser o conjunto de nos DEFINIDOS, nunca o de mencoes. LAY-04,
     LAY-06b/e e LAY-15 respondem "existe no DAG" com base em definicao. */
  const doDag = dagDoPlano === null ? null : dagDoPlano.definidos;

  if (dagDoPlano !== null && ancora !== null) {
    check('LAY-16a', dagDoPlano.cercas === ancora.secaoWdoPlanoG.blocosEsperados * 2,
      `a secao W tem ${dagDoPlano.cercas / 2} blocos cercados; o contrato exige exatamente ${ancora.secaoWdoPlanoG.blocosEsperados}. Bloco concorrente pode substituir o normativo silenciosamente.`);

    const cabecalho = new RegExp(ancora.secaoWdoPlanoG.gramatica.cabecalhoDeOnda);
    const entrada = new RegExp(ancora.secaoWdoPlanoG.gramatica.entradaDeDependencia);
    const naoReconhecidas = dagDoPlano.bloco.split('\n')
      .filter((l) => l.trim() !== '' && !cabecalho.test(l) && !entrada.test(l));
    check('LAY-16b', naoReconhecidas.length === 0,
      `linha do bloco do DAG fora da gramatica: ${naoReconhecidas.slice(0, 3).map((l) => JSON.stringify(l.trim().slice(0, 60))).join(' ')}`);

    check('LAY-16c', dagDoPlano.definidos.size === ancora.secaoWdoPlanoG.idsEsperados,
      `o bloco do DAG DEFINE ${dagDoPlano.definidos.size} Slices, mas a ancora congela ${ancora.secaoWdoPlanoG.idsEsperados}`);

    /* LAY-16d — nenhuma definicao duplicada. */
    check('LAY-16d', dagDoPlano.entradas.length === dagDoPlano.definidos.size,
      `o bloco do DAG tem ${dagDoPlano.entradas.length} entradas para ${dagDoPlano.definidos.size} Slices distintos: ha definicao duplicada`);

    /* LAY-16e — toda dependencia aponta para um no DEFINIDO. E o que impede que
       remover a entrada definidora de um Slice passe despercebido: ele continuaria
       citado como dependencia, mas deixaria de ser definido. */
    const orfaos = [...dagDoPlano.referenciados].filter((r) => !dagDoPlano.definidos.has(r));
    check('LAY-16e', orfaos.length === 0,
      `dependencia aponta para Slice sem entrada definidora no DAG: ${orfaos.join(', ')}`);

    /* LAY-16f — consumo integral do lado direito.  [R5-02]
       Sem isto, notacao que a gramatica nao entende — um intervalo, uma abreviacao
       nova — some silenciosamente e a alegacao "toda dependencia resolve" fica falsa
       sem que nada reprove. */
    const naoConsumidos = dagDoPlano.entradas.filter((e) => e.restoNaoConsumido);
    check('LAY-16f', naoConsumidos.length === 0,
      `dependencia com trecho nao consumido pela gramatica: ${naoConsumidos.slice(0, 3).map((e) => `${e.no} -> ${JSON.stringify(e.restoNaoConsumido)}`).join(' ')}`);
  }

  /* LAY-04 — todo Slice dono existe no Master DAG. */
  if (doDag) {
    for (const [ns, c] of Object.entries(namespaces)) {
      for (const slice of c.preenchidoPor) {
        check(`LAY-04/${ns}/${slice}`, doDag.has(slice), `namespace '${ns}' aponta para Slice inexistente: ${slice}`);
      }
    }
  } else {
    falhas.push('LAY-04: bloco do EOS_MASTER_IMPLEMENTATION_DAG (PLAN-G secao W) ausente ou ilegivel; impossivel validar donos. Nunca SKIP.');
  }

  /* LAY-05 — o registro de invariantes esta PRESENTE no caminho do baseline.
     [R12-01] A formulacao anterior ("continua onde estava" / "foi movido") afirmava historico
     que esta checagem nao observa: ela testa existencia de um caminho, hoje. Se o arquivo fosse
     movido e um homonimo recriado aqui, ela passaria. O que ela protege de fato — e nao e pouco —
     e o caso comum de consolidacao que deixa o caminho vazio. */
  check('LAY-05', existsSync(`${raiz}knowledge/registries.mjs`),
    'knowledge/registries.mjs ausente do caminho do baseline; consolidar nao autoriza remover daqui');

  /* LAY-06 — declarado vs materializado.  [rodada 3 · F-MAR-067]
     A versao anterior aprovava so quando o subnamespace declarado estava AUSENTE.
     Isso tornava o contrato impossivel de cumprir: o primeiro Slice a materializar
     um subnamespace declarado reprovaria nele, sem caminho legitimo.
     Agora a propriedade e BICONDICIONAL — existe no disco EXATAMENTE quando o
     contrato registra materializacao — e continua valendo depois que toda a onda 1
     materializar seus subnamespaces, em vez de expirar no primeiro uso. */
  for (const [ns, c] of Object.entries(namespaces)) {
    for (const [sub, reg] of Object.entries(c.subNamespaces)) {
      const caminho = `${raiz}${ns}/${sub}`;
      const obs = observar(caminho);
      const materializado = reg.materializadoPor !== null && reg.materializadoPor !== undefined && reg.materializadoPor !== '';

      /* LAY-06a — a bicondicional. */
      check(`LAY-06a/${ns}/${sub}`, obs.ehDiretorio === materializado, materializado
        ? `contrato diz que '${ns}/${sub}' foi materializado por ${reg.materializadoPor}, mas nao ha diretorio no disco`
        : `'${ns}/${sub}' existe no disco sem materializacao declarada; o contrato precisa dizer qual Slice o criou`);

      /* LAY-06b — quem materializou precisa existir no DAG e estar autorizado no
         namespace. Sem isso, `materializadoPor` viraria um campo livre que legitima
         qualquer diretorio apenas por ser preenchido. */
      if (materializado) {
        check(`LAY-06b/${ns}/${sub}`, doDag ? doDag.has(reg.materializadoPor) : false,
          `'${ns}/${sub}' declara materializacao por Slice inexistente no Master DAG: ${reg.materializadoPor}`);
        check(`LAY-06c/${ns}/${sub}`, c.preenchidoPor.includes(reg.materializadoPor),
          `'${ns}/${sub}' declara materializacao por ${reg.materializadoPor}, que nao esta entre os donos do namespace (${c.preenchidoPor.join(', ')})`);
      }

      /* LAY-06d — subnamespace declarado que exista precisa ser DIRETORIO.
         Um arquivo com o nome do subnamespace satisfaria `existsSync` sem satisfazer
         o layout do PLAN-A secao AK. */
      check(`LAY-06d/${ns}/${sub}`, !obs.existe || obs.ehDiretorio,
        `'${ns}/${sub}' existe mas nao e diretorio`);

      /* LAY-06e — `declaradoPor` tambem e validado.  [achado 7 da revisao do Codex]
         Ele existia no contrato e NINGUEM o checava: remove-lo produzia zero falhas.
         Um campo que nada verifica nao mantem `declared` distinto de `materialized`;
         so parece manter. */
      const declaradoPor = reg.declaradoPor;
      check(`LAY-06e/${ns}/${sub}`,
        typeof declaradoPor === 'string' && declaradoPor !== '' && (doDag ? doDag.has(declaradoPor) : false),
        `'${ns}/${sub}' tem declaradoPor invalido ou ausente do Master DAG: ${JSON.stringify(declaradoPor)}`);
    }
  }

  /* LAY-13 / LAY-14 / LAY-15 — MODULOS declarados direto no namespace.  [F-MAR-070]
     Decidido em D1-F-MAR-070-E-COLOCACAO (RESULTADO CONCORDO, CONFIANCA ALTA).

     LAY-03 aceitava como filho legitimo apenas `index.mjs` e os subnamespaces. Nao
     havia como declarar um MODULO, entao o SL-A-02 reprovaria ao criar
     `invariants/registry.mjs` e o SL-A-10 ao criar o seu em `provenance/` — mesma
     classe do F-MAR-067, agora para arquivo em vez de diretorio.

     Nota sobre vacuidade: hoje nenhum namespace declara modulo, entao as checagens
     abaixo nao tem instancia real e so sao exercitadas por sabotagem. Isso e
     deliberado — a maquinaria fica provada ANTES do primeiro uso, em vez de ser
     escrita junto com o Slice que precisa dela e nunca ser testada vazia. */
  for (const [ns, c] of Object.entries(namespaces)) {
    for (const [mod, reg] of Object.entries(c.modulos ?? {})) {
      /* LAY-14 — forma do nome. So basename `.mjs` direto: sem caminho, sem
         travessia, sem `index.mjs`, que ja e implicito e obrigatorio por LAY-02. */
      const formaValida = /^[A-Za-z][\w-]*\.mjs$/.test(mod) && mod !== 'index.mjs';
      check(`LAY-14/${ns}/${mod}`, formaValida,
        `nome de modulo invalido em '${ns}': '${mod}' — exige basename .mjs direto, sem caminho nem travessia, e diferente de index.mjs`);
      if (!formaValida) continue;

      const obs = observar(`${raiz}${ns}/${mod}`);
      const materializado = reg.materializadoPor !== null && reg.materializadoPor !== undefined && reg.materializadoPor !== '';

      /* LAY-13a — bicondicional, igual a dos subnamespaces. */
      check(`LAY-13a/${ns}/${mod}`, (obs.existe && !obs.ehDiretorio) === materializado, materializado
        ? `contrato diz que '${ns}/${mod}' foi materializado por ${reg.materializadoPor}, mas nao ha arquivo no disco`
        : `'${ns}/${mod}' existe no disco sem materializacao declarada`);

      /* LAY-13b — modulo declarado que exista precisa ser ARQUIVO. */
      check(`LAY-13b/${ns}/${mod}`, !obs.existe || !obs.ehDiretorio,
        `'${ns}/${mod}' esta declarado como modulo mas e diretorio`);

      /* LAY-15 — autoria contra o bloco do DAG, igual aos subnamespaces. */
      check(`LAY-15a/${ns}/${mod}`,
        typeof reg.declaradoPor === 'string' && reg.declaradoPor !== '' && (doDag ? doDag.has(reg.declaradoPor) : false),
        `'${ns}/${mod}' tem declaradoPor invalido ou ausente do Master DAG: ${JSON.stringify(reg.declaradoPor)}`);

      if (materializado) {
        check(`LAY-15b/${ns}/${mod}`, doDag ? doDag.has(reg.materializadoPor) : false,
          `'${ns}/${mod}' declara materializacao por Slice inexistente no Master DAG: ${reg.materializadoPor}`);
        check(`LAY-15c/${ns}/${mod}`, c.preenchidoPor.includes(reg.materializadoPor),
          `'${ns}/${mod}' declara materializacao por ${reg.materializadoPor}, que nao esta entre os donos do namespace (${c.preenchidoPor.join(', ')})`);
      }
    }
  }

  /* LAY-09 / LAY-10 — o contrato de layout ancorado no PLAN-A secao AK.
     [achado 7 da revisao do Codex]

     Sem isto, `layout.mjs` era a unica fonte da verdade sobre quais namespaces e
     subnamespaces existem, e acrescentar um subnamespace inventado como "pendente"
     passava sem falha. Agora a lista vem do bloco de codigo da secao AK — mesmo
     padrao que resolveu o achado bloqueante 1 nos tipos: o documento nao participa
     de uma alteracao coordenada com o codigo. */
  if (layoutDoPlano === null) {
    falhas.push('LAY-09: PLAN-A secao AK ausente ou ilegivel; o contrato de layout fica sem ancora. Nunca SKIP.');
  } else if (ancora === null) {
    falhas.push('LAY-11: ancora congelada da secao AK ausente; a extracao ficaria sem garantia de totalidade. Nunca SKIP.');
  } else {
    const nsDoc = Object.keys(layoutDoPlano.mapa).sort();
    const nsContrato = Object.keys(namespaces).sort();
    check('LAY-09', nsDoc.length === nsContrato.length && nsDoc.every((n, i) => n === nsContrato[i]),
      `namespaces aditivos divergem da secao AK. documento=[${nsDoc}] contrato=[${nsContrato}]`);

    for (const ns of nsDoc) {
      if (!namespaces[ns]) continue;
      const subDoc = [...layoutDoPlano.mapa[ns]].sort();
      const subContrato = Object.keys(namespaces[ns].subNamespaces).sort();
      check(`LAY-10/${ns}`, subDoc.length === subContrato.length && subDoc.every((s, i) => s === subContrato[i]),
        `subnamespaces de '${ns}' divergem da secao AK. documento=[${subDoc}] contrato=[${subContrato}]`);
    }

    /* LAY-11 — FINGERPRINT DA SECAO AK.  [bloqueante 3 da revisao R2]
       Parentetizar `versioning/` fazia o parser extrair um subnamespace a menos e
       tratar isso como sucesso; reformatar o bloco como arvore multiline fazia
       `types`, `schemas` etc. virarem namespaces de topo. Com o fingerprint,
       reformatacao vira drift explicito em vez de extracao silenciosamente menor. */
    /* LAY-11b — gramatica total sobre Markdown, igual a TYPE-02h nos tipos.
       LAY-11c — exatamente um bloco cercado: inserir um bloco historico antes do
       normativo fazia LAY-12 inspecionar o decoy. [bloqueante da revisao R3] */
    const markup = ancora.markupProibido.caracteres.filter((ch) => layoutDoPlano.secao.includes(ch));
    check('LAY-11b', markup.length === 0,
      `secao AK contem construcao que a gramatica nao consome (${markup.join(' ')}): tachado, comentario HTML ou tag inline podem marcar layout como removido sem remove-lo do texto extraido`);

    const cercasAK = (layoutDoPlano.secao.match(/```/g) ?? []).length;
    check('LAY-11c', cercasAK === ancora.blocosEsperadosEmAK * 2,
      `a secao AK tem ${cercasAK / 2} blocos cercados; o contrato exige exatamente ${ancora.blocosEsperadosEmAK}. Bloco concorrente pode substituir o normativo silenciosamente.`);

    /* LAY-11d — toda linha do bloco AK precisa estar na gramatica de profundidade
       exata. [bloqueante da revisao R4] Sem isto, recuar `authority/` para quatro
       espacos o tornava visualmente filho de `protocol/` e ele continuava derivado
       como namespace de topo, com zero falhas. */
    check('LAY-11d', (layoutDoPlano.linhasForaDaGramatica ?? []).length === 0,
      `linha do bloco AK fora da gramatica de profundidade (raiz em coluna 0, namespace em exatamente dois espacos): ${(layoutDoPlano.linhasForaDaGramatica ?? []).slice(0, 3).map((l) => JSON.stringify(l)).join(' ')}`);

    check('LAY-11', sha256(layoutDoPlano.secao) === ancora.secaoAK.sha256,
      `secao AK do PLAN-A divergiu do fingerprint congelado. esperado=${ancora.secaoAK.sha256.slice(0, 12)} observado=${sha256(layoutDoPlano.secao).slice(0, 12)}. Reformatacao do plano exige reconciliacao explicita.`);

    /* LAY-12 — TOTALIDADE DO BLOCO AK. Segunda camada, valida mesmo se o fingerprint
       for atualizado junto com o ataque: todo token 'nome/' precisa continuar
       classificado como prefixo de raiz, namespace, subnamespace ou comentario. */
    const todosOsTokens = [...layoutDoPlano.bloco.matchAll(/([A-Za-z][\w-]*)\//g)].map((m) => m[1]);
    const entreParenteses = [...layoutDoPlano.bloco.matchAll(/\(([^)]*)\)/g)]
      .flatMap((m) => [...m[1].matchAll(/([A-Za-z][\w-]*)\//g)].map((x) => x[1]));
    const classificados = new Set([
      ...ancora.secaoAK.prefixoDeRaiz,
      ...Object.keys(layoutDoPlano.mapa),
      ...Object.values(layoutDoPlano.mapa).flat(),
      ...entreParenteses
    ]);
    const orfaos = todosOsTokens.filter((t) => !classificados.has(t));
    check('LAY-12/nenhum-token-orfao', orfaos.length === 0,
      `token '<nome>/' do bloco AK nao classificado: ${orfaos.join(', ')}`);

    check('LAY-12/comentarios-congelados',
      [...new Set(entreParenteses)].sort().join(',') === [...ancora.secaoAK.tokensEntreParenteses].sort().join(','),
      `tokens entre parenteses do bloco AK divergem do congelado. congelado=[${ancora.secaoAK.tokensEntreParenteses}] observado=[${[...new Set(entreParenteses)]}] — um subnamespace parentetizado aparece aqui`);

    check('LAY-12/namespaces-congelados',
      [...Object.keys(layoutDoPlano.mapa)].sort().join(',') === [...ancora.secaoAK.namespacesEsperados].sort().join(','),
      `namespaces derivados da secao AK divergem do congelado. congelado=[${ancora.secaoAK.namespacesEsperados}] derivado=[${Object.keys(layoutDoPlano.mapa)}]`);
  }

  /* LAY-08 — nenhum diretorio de topo NAO DECLARADO em tools/eos.
     Lacuna encontrada ao preparar o SL-BOOT-04 (F-MAR-066): LAY-01 so confirmava a
     presenca dos dez conhecidos e LAY-03 so restringia os quatro aditivos, entao um
     subsistema novo entraria sem ser notado. Mesma classe do controle negativo
     vacuoso: a verificacao nao mede o que nao olha. */
  const declarados = new Set([...roster, ...Object.keys(NAMESPACES_ADITIVOS)]);
  const naDisco = readdirSync(raiz, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const naoDeclarados = naDisco.filter((d) => !declarados.has(d));
  check('LAY-08', naoDeclarados.length === 0,
    `diretorio de topo nao declarado em layout.mjs: ${naoDeclarados.join(', ')}`);

  /* LAY-07 — nao-regressao contra o manifesto de baseline registrado.
     Sem isto a verificacao provaria apenas "existe agora"; com ele prova
     "nao encolheu em relacao ao que foi registrado no SL-BOOT-01". Continua sem
     provar ausencia de movimentacao historica — e a mensagem final diz isso. */
  if (manifesto) {
    for (const [sub, esperado] of Object.entries(manifesto.subsistemas)) {
      if (!existsSync(`${raiz}${sub}`)) continue;
      const atual = readdirSync(`${raiz}${sub}`).filter((f) => f.endsWith('.mjs')).length;
      check(`LAY-07/${sub}`, atual >= esperado.modulos,
        `subsistema '${sub}' tem ${atual} modulos, menos que os ${esperado.modulos} do baseline`);
    }
  }

  return { falhas, passou };
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

export function executar() {
const manifesto = existsSync(MANIFESTO) ? JSON.parse(readFileSync(MANIFESTO, 'utf8')) : null;
const real = avaliarLayout({ roster: SUBSISTEMAS_EXISTENTES, raiz: RAIZ, manifesto });

/* Controle negativo NAO VACUO: injeta um sentinela ausente no roster e exige que
   a MESMA funcao produza a falha correspondente. Se a avaliacao nao reprovar, a
   verificacao inteira e teatro e o processo falha. */
const SENTINELA = '__sentinela_de_controle_negativo__';
const neg = avaliarLayout({ roster: [...SUBSISTEMAS_EXISTENTES, SENTINELA], raiz: RAIZ, manifesto: null });
const negDetectou = neg.falhas.some((f) => f.includes(SENTINELA));
const negNaoQuebrouOResto = neg.falhas.filter((f) => !f.includes(SENTINELA)).length === real.falhas.length;

/* ------------------------------------------------------------------ *
 * Controles negativos das rodadas 3 e 4 — F-MAR-067 e a revisao do SL-A-01
 *
 * Cada correcao criou uma propriedade nova. Propriedade nova sem controle capaz de
 * reprova-la seria exatamente o defeito que o Codex encontrou no LAY-NEG-01. Cada
 * sabotagem atravessa a MESMA `avaliarLayout` da verificacao real e precisa produzir
 * a falha nomeada.
 * ------------------------------------------------------------------ */

/** Clona o contrato trocando um unico registro de subnamespace. */
const comSub = (ns, sub, patch) => ({
  ...NAMESPACES_ADITIVOS,
  [ns]: {
    ...NAMESPACES_ADITIVOS[ns],
    subNamespaces: {
      ...NAMESPACES_ADITIVOS[ns].subNamespaces,
      [sub]: { ...NAMESPACES_ADITIVOS[ns].subNamespaces[sub], ...patch }
    }
  }
});

/** Clona o contrato declarando um modulo direto num namespace. */
const comModulo = (ns, mod, reg) => ({
  ...NAMESPACES_ADITIVOS,
  [ns]: { ...NAMESPACES_ADITIVOS[ns], modulos: { ...NAMESPACES_ADITIVOS[ns].modulos, [mod]: reg } }
});

/** Observador adulterado: sobrescreve o que o disco diz sobre UM caminho. */
const comObservacao = (alvo, override) => (caminho) =>
  caminho.replace(/\\/g, '/').endsWith(alvo) ? { ...observadorReal(caminho), ...override } : observadorReal(caminho);

const sabotagens = [
  ['LAY-06a', 'contrato declara materializacao, diretorio ausente',
    { namespaces: comSub('protocol', 'schemas', { materializadoPor: 'SL-A-06' }) }],
  ['LAY-06a', 'diretorio existe, contrato nao declara materializacao',
    { namespaces: comSub('protocol', 'types', { materializadoPor: null }) }],
  ['LAY-06b', 'materializador inexistente no Master DAG',
    { namespaces: comSub('protocol', 'types', { materializadoPor: 'SL-QUE-NAO-EXISTE-99' }) }],
  ['LAY-06c', 'materializador existe no DAG mas nao e dono do namespace',
    { namespaces: comSub('protocol', 'types', { materializadoPor: 'SL-K-01' }) }],
  ['LAY-06d', 'caminho declarado existe mas nao e diretorio',
    { observar: comObservacao('protocol/types', { existe: true, ehDiretorio: false, filhos: [] }) }],
  ['LAY-03', 'filho nao declarado dentro do namespace',
    { observar: comObservacao('/protocol', { existe: true, ehDiretorio: true, filhos: ['index.mjs', 'types', 'intruso.mjs'] }) }],

  /* Achado 7 da revisao do Codex: `declaradoPor` nunca era validado e a lista de
     subnamespaces nao tinha ancora documental. */
  ['LAY-06e', 'declaradoPor removido do contrato',
    { namespaces: comSub('protocol', 'types', { declaradoPor: undefined }) }],
  ['LAY-06e', 'declaradoPor apontando para Slice inexistente no DAG',
    { namespaces: comSub('protocol', 'types', { declaradoPor: 'SL-QUE-NAO-EXISTE-99' }) }],
  ['LAY-10', 'subnamespace inventado, ausente da secao AK',
    {
      namespaces: {
        ...NAMESPACES_ADITIVOS,
        protocol: {
          ...NAMESPACES_ADITIVOS.protocol,
          subNamespaces: { ...NAMESPACES_ADITIVOS.protocol.subNamespaces, inventado: { declaradoPor: 'SL-BOOT-02', materializadoPor: null } }
        }
      }
    }],
  ['LAY-09', 'namespace aditivo removido do contrato',
    { namespaces: Object.fromEntries(Object.entries(NAMESPACES_ADITIVOS).filter(([k]) => k !== 'provenance')) }],
  ['LAY-09', 'PLAN-A secao AK ausente tratado como SKIP', { layoutDoPlano: null }],

  /* Revisao R2 — os bypasses de parser, em par: contra o fingerprint e depois COM o
     fingerprint atualizado, para provar que a totalidade sozinha tambem reprova. */
  ['LAY-11', 'R2: `versioning/` parentetizado na secao AK', (() => {
    const p = derivarLayoutDoPlano();
    const secao = p.secao.replace('versioning/', '(versioning/)');
    const bloco = p.bloco.replace('versioning/', '(versioning/)');
    const mapa = { ...p.mapa, protocol: p.mapa.protocol.filter((s) => s !== 'versioning') };
    return { layoutDoPlano: { mapa, secao, bloco } };
  })()],
  ['LAY-12/comentarios-congelados', 'R2 COORD: `versioning/` parentetizado E fingerprint atualizado', (() => {
    const p = derivarLayoutDoPlano();
    const secao = p.secao.replace('versioning/', '(versioning/)');
    const bloco = p.bloco.replace('versioning/', '(versioning/)');
    const mapa = { ...p.mapa, protocol: p.mapa.protocol.filter((s) => s !== 'versioning') };
    const a = JSON.parse(readFileSync(ANCORA, 'utf8'));
    return {
      layoutDoPlano: { mapa, secao, bloco },
      ancora: { ...a, secaoAK: { ...a.secaoAK, sha256: sha256(secao) } }
    };
  })()],
  ['LAY-12/namespaces-congelados', 'R2: bloco AK reformatado como arvore multiline', (() => {
    const p = derivarLayoutDoPlano();
    const mapa = { types: [], schemas: [], events: [], artifacts: [], snapshots: [], versioning: [] };
    const a = JSON.parse(readFileSync(ANCORA, 'utf8'));
    return {
      layoutDoPlano: { mapa, secao: p.secao, bloco: p.bloco },
      ancora: { ...a, secaoAK: { ...a.secaoAK, sha256: sha256(p.secao) } }
    };
  })()],
  /* F-MAR-070 — modulos direto no namespace. Nenhum e declarado hoje, entao estas
     sabotagens sao a UNICA coisa que exercita LAY-13/14/15. Sem elas, a maquinaria
     entraria em uso no SL-A-02 sem nunca ter sido medida. */
  ['LAY-13a', 'modulo declarado como materializado, arquivo ausente',
    { namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-A-02' }) }],
  ['LAY-13a', 'modulo presente no disco sem materializacao declarada', {
    namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: null }),
    observar: comObservacao('invariants/registry.mjs', { existe: true, ehDiretorio: false, filhos: [] })
  }],
  ['LAY-13b', 'caminho declarado como modulo e diretorio', {
    namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-A-02' }),
    observar: comObservacao('invariants/registry.mjs', { existe: true, ehDiretorio: true, filhos: [] })
  }],
  ['LAY-14', 'nome de modulo com travessia de caminho',
    { namespaces: comModulo('invariants', '../../../evil.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: null }) }],
  ['LAY-14', 'modulo declarado como index.mjs',
    { namespaces: comModulo('invariants', 'index.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: null }) }],
  ['LAY-15a', 'modulo sem declaradoPor',
    { namespaces: comModulo('invariants', 'registry.mjs', { materializadoPor: null }) }],
  ['LAY-15b', 'materializador de modulo inexistente no DAG', {
    namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-NAO-EXISTE-99' }),
    observar: comObservacao('invariants/registry.mjs', { existe: true, ehDiretorio: false, filhos: [] })
  }],
  ['LAY-15c', 'materializador de modulo fora dos donos do namespace', {
    namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-K-01' }),
    observar: comObservacao('invariants/registry.mjs', { existe: true, ehDiretorio: false, filhos: [] })
  }],
  ['LAY-03', 'modulo no disco que o contrato nao declara',
    { observar: comObservacao('/invariants', { existe: true, ehDiretorio: true, filhos: ['index.mjs', 'registry.mjs'] }) }],

  ['LAY-04', 'R2: mencao a Slice fora do bloco do DAG nao vale como existencia',
    { dagDoPlano: { ...derivarDagDoPlanoG(), definidos: new Set(['SL-BOOT-02']) } }],
  ['LAY-04', 'bloco do DAG ausente tratado como SKIP', { dagDoPlano: null }],
  ['LAY-11', 'ancora congelada ausente tratada como SKIP', { ancora: null }],

  /* Revisao R3 — markup semantico e bloco-decoy. */
  ['LAY-11b', 'R3 COORD: `versioning/` tachado na secao AK E fingerprint atualizado', (() => {
    const p = derivarDagDoPlanoG(); void p;
    const l = derivarLayoutDoPlano();
    const secao = l.secao.replace('versioning/', '~~versioning/~~');
    const a = JSON.parse(readFileSync(ANCORA, 'utf8'));
    return {
      layoutDoPlano: { ...l, secao },
      ancora: { ...a, secaoAK: { ...a.secaoAK, sha256: sha256(secao) } }
    };
  })()],
  ['LAY-11c', 'R3: bloco historico inserido antes do bloco normativo em AK', (() => {
    const l = derivarLayoutDoPlano();
    const secao = l.secao.replace('```\n', '```\ntools/eos/\n  protocol/    types/\n```\n\n```\n');
    const a = JSON.parse(readFileSync(ANCORA, 'utf8'));
    return {
      layoutDoPlano: { ...l, secao },
      ancora: { ...a, secaoAK: { ...a.secaoAK, sha256: sha256(secao) } }
    };
  })()],
  ['LAY-16a', 'R3: bloco-resumo inserido antes do bloco normativo do DAG', (() => {
    const d = derivarDagDoPlanoG();
    return { dagDoPlano: { ...d, cercas: 4 } };
  })()],
  ['LAY-16b', 'R3: linha fora da gramatica dentro do bloco do DAG', (() => {
    const d = derivarDagDoPlanoG();
    return { dagDoPlano: { ...d, bloco: `${d.bloco}\nlinha arbitraria que nao e onda nem dependencia\n` } };
  })()],
  ['LAY-16c', 'R3: bloco do DAG parcial, so com os Slices que o layout usa', (() => {
    const d = derivarDagDoPlanoG();
    return { dagDoPlano: { ...d, definidos: new Set(['SL-BOOT-02', 'SL-A-01', 'SL-A-02', 'SL-A-10', 'SL-K-11']) } };
  })()],

  /* Revisao R4 — hierarquia por indentacao e definicao versus mencao. */
  ['LAY-11d', 'R4 COORD: `authority/` recuado para quatro espacos, virando filho visual de protocol', (() => {
    const l = derivarLayoutDoPlano();
    const secao = l.secao.replace('\n  authority/', '\n    authority/');
    const bloco = l.bloco.replace('\n  authority/', '\n    authority/');
    const a = JSON.parse(readFileSync(ANCORA, 'utf8'));
    return {
      layoutDoPlano: { ...l, secao, bloco, linhasForaDaGramatica: ['    authority/'] },
      ancora: { ...a, secaoAK: { ...a.secaoAK, sha256: sha256(secao) } }
    };
  })()],
  ['LAY-16e', 'R4: entrada definidora removida, Slice sobrevive so como dependencia de outro', (() => {
    const d = derivarDagDoPlanoG();
    const definidos = new Set(d.definidos); definidos.delete('SL-BOOT-01');
    return { dagDoPlano: { ...d, definidos, entradas: d.entradas.filter((e) => e.no !== 'SL-BOOT-01') } };
  })()],
  ['LAY-16d', 'R4: definicao duplicada no bloco do DAG', (() => {
    const d = derivarDagDoPlanoG();
    return { dagDoPlano: { ...d, entradas: [...d.entradas, { no: 'SL-A-01', deps: ['SL-BOOT-02'], restoNaoConsumido: null }] } };
  })()],

  /* R5-02 — intervalo no lado direito. O contraexemplo do revisor era trocar
     `SL-CX-01..04` por `SL-CX-01..99`: antes da expansao, `SL-CX-99` nunca aparecia
     como referencia e nenhuma orfa era detectada. */
  ['LAY-16e', 'R5-02: intervalo estendido para Slice inexistente', (() => {
    const d = derivarDagDoPlanoG();
    const referenciados = new Set([...d.referenciados, 'SL-CX-99']);
    return { dagDoPlano: { ...d, referenciados } };
  })()],
  ['LAY-16f', 'R5-02: trecho do lado direito que a gramatica nao consome', (() => {
    const d = derivarDagDoPlanoG();
    return { dagDoPlano: { ...d, entradas: [...d.entradas, { no: 'SL-A-01', deps: [], restoNaoConsumido: 'SL-CX-01..99' }], definidos: new Set([...d.definidos]) } };
  })()]
];

/* ------------------------------------------------------------------ *
 * Controles POSITIVOS — o outro lado do instrumento.  [achado MEDIO da revisao R4]
 *
 * LAY-13/14/15 so tinham sabotagens, todas exigindo REJEICAO. Um mutante que
 * passasse a rejeitar TODO modulo continuaria 31/31 — o instrumento nao detectaria
 * uma regressao que quebra o caso valido. Controle negativo prova que o mecanismo
 * reprova o errado; controle positivo prova que ele ACEITA o certo. Sem os dois, a
 * contagem mede metade da propriedade.
 * ------------------------------------------------------------------ */
const positivos = [
  ['LAY-13', 'modulo declarado como pendente, arquivo ausente',
    { namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: null }) }],
  ['LAY-13', 'modulo declarado como materializado, arquivo presente', {
    namespaces: comModulo('invariants', 'registry.mjs', { declaradoPor: 'SL-BOOT-02', materializadoPor: 'SL-A-02' }),
    observar: comObservacao('invariants/registry.mjs', { existe: true, ehDiretorio: false, filhos: [] })
  }]
];

const posFalhos = [];
for (const [prefixo, descricao, entrada] of positivos) {
  const r = avaliarLayout({ roster: SUBSISTEMAS_EXISTENTES, raiz: RAIZ, manifesto, ...entrada });
  const rejeitou = r.falhas.filter((f) => f.startsWith(prefixo));
  if (rejeitou.length > 0) posFalhos.push(`${descricao} -> ${rejeitou.join('; ')}`);
}

const negFalhos = [];
for (const [id, descricao, entrada] of sabotagens) {
  const r = avaliarLayout({ roster: SUBSISTEMAS_EXISTENTES, raiz: RAIZ, manifesto, ...entrada });
  if (!r.falhas.some((f) => f.startsWith(id))) negFalhos.push(`${id} (${descricao})`);
}

/* ------------------------------------------------------------------ *
 * Controles de PARSER — atravessam `lerDependencias` de verdade.  [R6-02]
 *
 * As sabotagens acima adulteram o objeto JA DERIVADO. Isso testa as checagens, nao o
 * parser: a revisao R6 mostrou que dois mutantes triviais de `lerDeps` — "intervalo
 * consome so o primeiro extremo" e "todo resto e integral" — mantinham 36/36 e exit 0.
 * Estes controles chamam a funcao real com string adulterada, nos dois sentidos.
 * ------------------------------------------------------------------ */
const casosDeParser = [
  // devem ser REJEITADOS
  ['SL-CX-04..01', false, 'intervalo descendente'],
  ['SL-CX-01 + D2 SL-', false, 'prefixo SL truncado escondido na anotacao'],
  ['SL-AC-04 + D3', false, 'forma de anotacao inexistente'],
  ['SL-INT-02 (parentese nao fechado', false, 'parentese sem fechamento'],
  ['SL-CX-01-04', false, 'token truncado por hifen'],
  // devem ser ACEITOS
  ['SL-CX-01..04', true, 'intervalo ascendente valido'],
  ['(nenhum)', true, 'sem dependencia'],
  ['SL-INT-02   (self-hosting degraus 1-2)', true, 'comentario com digitos'],
  ['SL-AC-04 + D2', true, 'decisao do usuario'],
  ['SL-AC-01, SL-AC-02   → ACTIVE_CUTOVER_READY → [D2]', true, 'cauda apos seta']
];
const parserFalhos = casosDeParser
  .filter(([rhs, esperado]) => lerDependencias(rhs).integral !== esperado)
  .map(([, esperado, d]) => `${d} (esperado ${esperado ? 'aceitar' : 'rejeitar'})`);

/* O intervalo valido precisa render os quatro Slices — um parser que devolvesse lista
   vazia passaria em `integral` e perderia as dependencias em silencio. */
const intervaloExpandido = lerDependencias('SL-CX-01..04').ids;
const expansaoOk = intervaloExpandido.length === 4 && intervaloExpandido[3] === 'SL-CX-04';

console.log('EOS layout — verificacao aditiva  [BOOTSTRAP_PROOF]');
console.log(`  regra: ${REGRA_ADITIVA}`);
console.log(`  baseline: ${manifesto ? `${manifesto.capturadoEm} (${Object.keys(manifesto.subsistemas).length} subsistemas)` : 'AUSENTE'}`);
console.log(`  checagens PASS: ${real.passou.length}`);
console.log(`  checagens FAIL: ${real.falhas.length}`);
for (const f of real.falhas) console.log(`    ! ${f}`);
console.log(`  LAY-NEG-01 (sentinela detectado pela mesma funcao): ${negDetectou ? 'REPROVOU como deve' : 'NAO REPROVOU'}`);
console.log(`  LAY-NEG-02 (sentinela nao contamina o resto): ${negNaoQuebrouOResto ? 'ok' : 'contaminou'}`);
console.log(`  LAY-NEG-03 (F-MAR-067): ${sabotagens.length - negFalhos.length}/${sabotagens.length} sabotagens detectadas` +
  (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
console.log(`  LAY-POS-01 (modulos validos aceitos): ${positivos.length - posFalhos.length}/${positivos.length}` +
  (posFalhos.length ? ` — REJEITOU indevidamente: ${posFalhos.join('; ')}` : ''));
console.log(`  LAY-PARSER-01 (casos atravessando lerDependencias): ${casosDeParser.length - parserFalhos.length}/${casosDeParser.length}` +
  (parserFalhos.length ? ` — divergiu: ${parserFalhos.join('; ')}` : ''));
console.log(`  LAY-PARSER-02 (intervalo expandido de fato): ${expansaoOk ? 'ok — 4 Slices' : 'FALHOU'}`);

const ok = real.falhas.length === 0 && negDetectou && negNaoQuebrouOResto
  && negFalhos.length === 0 && posFalhos.length === 0
  && parserFalhos.length === 0 && expansaoOk;
if (!ok) return 1;

/* Afirmacao calibrada a evidencia (MAR-INV-025, achado 8 da revisao do SL-A-01). */
console.log('  LAYOUT_ADITIVO_CONSISTENTE_COM_SECAO_AK_E_COM_O_BASELINE');
console.log('    provado por ancora documental (PLAN-A secao AK <-> contrato):');
console.log('      o conjunto de namespaces aditivos e o de subnamespaces de cada um.');
console.log('      A secao AK tem fingerprint congelado, exatamente um bloco normativo e');
console.log('      gramatica de profundidade exata: raiz em coluna 0, namespace em dois espacos.');
console.log('    provado contra o bloco do Master DAG (PLAN-G secao W, e so ele):');
console.log('      bloco unico, toda linha dentro da gramatica, 85 Slices DEFINIDOS (definicao,');
console.log('      nao mencao), sem definicao duplicada e sem dependencia orfa. A lista de');
console.log('      dependencias e consumida integralmente da esquerda para a direita, com');
console.log('      intervalos `NN..MM` EXPANDIDOS; a anotacao final admite apenas as tres formas');
console.log('      medidas no texto congelado — parentese, cauda apos seta e `+ D2` — e nao pode');
console.log('      conter referencia a Slice nem sobra que pareca token truncado;');
console.log('      todo declaradoPor e todo materializadoPor correspondem a um no definido, e o');
console.log('      materializador esta entre os donos declarados do namespace');
console.log('    provado por observacao do disco:');
console.log('      presenca dos subsistemas do roster, bicondicional declarado<->materializado,');
console.log('      ausencia de diretorio de topo nao declarado e de filho nao declarado,');
console.log('      ausencia de encolhimento em relacao ao manifesto do SL-BOOT-01');
console.log('    NAO provado: que nada foi movido em algum momento do passado — exigiria');
console.log('      historico versionado, e `tools/eos/` esta untracked.');
console.log('    INDEPENDENCIA DE ORACULO, por propriedade — classificada, nao adjetivada:');
console.log('      namespaces e subnamespaces      COORDINATED_CHANGE_DETECTABLE');
console.log('        (vem da secao AK congelada; alterar so o contrato reprova)');
console.log('      hierarquia por indentacao       COORDINATED_CHANGE_DETECTABLE');
console.log('      definicao de Slice no DAG       COORDINATED_CHANGE_VISIBLE_IN_DIFF');
console.log('        (rebaixado na R6-03: renomear SL-CX-05 para SL-CX-55 na definicao E nas');
console.log('         dependencias preserva 85 nos e passa. A ancora de W congela contagem e');
console.log('         gramatica, nao o conteudo — DETECTABLE era alegacao forte demais)');
console.log('      presenca no disco               STRUCTURALLY_INDEPENDENT');
console.log('        (observada, nao declarada por nenhum oraculo)');
console.log('      contagens congeladas            COORDINATED_CHANGE_VISIBLE_IN_DIFF');
console.log('      Nenhuma propriedade e STRUCTURALLY_IMPOSSIBLE. O arquivo de ancora tambem e');
console.log('      editavel: VISIBLE_IN_DIFF significa custo e visibilidade, nao impedimento.');
return 0;
}

/* Execucao so quando este modulo E o ponto de entrada.  [F-MAR-069]
   Importar este arquivo para reutilizar `avaliarLayout` rodava a verificacao inteira
   e podia chamar `process.exit(1)`, derrubando o processo de quem importou. Os
   Slices seguintes vao reutilizar este avaliador. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
