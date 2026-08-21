/**
 * EOS — verificacao dos tipos canonicos.  [SL-A-01 · BOOTSTRAP_PROOF]
 *
 * RODADA DE CORRECAO 1, a partir da revisao independente do Codex, que devolveu
 * CORRECOES_NECESSARIAS com oito achados — os oito procedentes. Os tres bloqueantes:
 *
 *   1. A ancora documental comparava apenas o CONJUNTO de tokens entre crases, nao a
 *      associacao tipo->familia. Mover `Checkpoint` de Persistence para Work no
 *      oraculo E na implementacao ao mesmo tempo passava com zero falhas. Pior:
 *      remover um membro dos dois e acrescenta-lo a `tokensNaoMembros` tambem
 *      passava, porque essa lista era controlada pelo candidato. Eu havia afirmado
 *      "ancorado nos dois sentidos" com evidencia de um sentido so.
 *
 *   2. Nao existia oraculo algum para a composicao das 14 distincoes. Remover a
 *      DIST-14 produzia zero falhas; a linha final apenas imprimia a quantidade que
 *      restou. Contar nao e verificar.
 *
 *   3. `layout.mjs` exportava `ENFORCEMENT_CLASSES`, que pertence ao SL-A-02.
 *
 * A correcao troca listas por DERIVACAO DOCUMENTAL. As familias e as distincoes
 * passam a ser extraidas do PLAN-A secoes E e F, e a verificacao e a TRES VIAS:
 * documento <-> oraculo <-> implementacao. Uma alteracao coordenada entre oraculo e
 * implementacao continua reprovando, porque o documento nao participa do conluio — e
 * ele esta sob Planning Freeze, com fingerprint conferido.
 *
 * O QUE CONTINUA SEM ANCORA DOCUMENTAL, E ESTA DITO NA MENSAGEM FINAL
 *   A superficie de export e os campos do descritor. O PLAN-A nao enumera exports de
 *   modulo, entao nao ha o que ancorar; a expectativa mora em oraculo externo, o que
 *   torna a alteracao coordenada visivel no diff sem torna-la impossivel.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import * as barrel from './index.mjs';
import { TIPOS_CANONICOS, FAMILIAS, CAMPOS_DO_DESCRITOR } from './families.mjs';
import { DISTINCOES_OBRIGATORIAS, marcaDeConceito } from './distinctions.mjs';

const DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ORACULO_FAMILIAS = `${DIR}oracle/canonical-families.json`;
const ORACULO_SUPERFICIE = `${DIR}oracle/sl-a-01-surface.json`;
const ORACULO_ANCORA = `${DIR}oracle/plan-anchor.json`;
const PLANO_A = `${DIR}../../../../docs/eos-v2/plans/PLAN_A_FOUNDATIONS.md`;

const sha256 = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

/* ------------------------------------------------------------------ *
 * Derivacao documental — a unica fonte que o candidato nao edita ao editar codigo
 * ------------------------------------------------------------------ */

/**
 * Extrai familia -> membros da secao E.
 *
 * Duas regras estruturais, ambas sem excecao caso a caso:
 *   - os trechos entre parenteses saem ANTES da extracao. Os tres tokens entre
 *     crases que nao sao tipos (`codex.architect`, `claude.backend` e a formula de
 *     AgentIdentity) estao todos dentro de parenteses; nenhum membro canonico esta.
 *   - a extracao e POR BLOCO DE FAMILIA, nunca sobre a secao inteira. E o que
 *     transforma "o token existe em algum lugar" em "o token pertence a ESTA
 *     familia" — a diferenca que deixou passar o achado bloqueante 1.
 */
export function derivarFamiliasDoPlano(secaoE) {
  const semParenteses = secaoE.replace(/\([^)]*\)/gs, '');
  const blocos = [...semParenteses.matchAll(/\*\*([A-Z][A-Za-z ]*?)\*\*\s*—([\s\S]*?)(?=\n\*\*[A-Z]|$)/g)];
  const mapa = {};
  for (const [, nome, corpo] of blocos) {
    mapa[nome.trim()] = [...corpo.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  }
  return mapa;
}

/**
 * Extrai os grupos de distincao da secao F: todo trecho entre crases que contenha
 * `≠`. A prosa explicativa da secao tambem usa crases, mas nunca com `≠`, entao o
 * filtro separa contrato de comentario sem lista de excecao.
 */
export function derivarDistincoesDoPlano(secaoF) {
  return [...secaoF.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1])
    .filter((s) => s.includes('≠'))
    .map((s) => s.split('≠').map((x) => x.trim()));
}

/**
 * Extrai os especificadores de `import ... from 'X'`, `export ... from 'X'` e
 * `import('X')` de um modulo.
 *
 * POR QUE ESTE PARSER EXISTE  [R7-02, item 5 do CHALLENGE-SL-A-01]
 *   O challenge exigiu "fixture de compilacao/importacao negativa proibindo tipos ou campos
 *   provider-native nos modulos canonicos". A metade de COMPILACAO foi supersedida por
 *   `D2-SL-A-01-COMPILE-FAIL` (descritor congelado nao tem atribuicao a reprovar). A metade de
 *   IMPORTACAO nao depende de compilador nenhum e continua obrigatoria — e e esta.
 *
 *   TYPE-05a/b/c olha o CONTEUDO dos descritores. Um modulo canonico continuaria limpo nesse
 *   eixo enquanto importasse um SDK de fornecedor: a fronteira provider-neutral vazaria pela
 *   dependencia, nao pelo dado.
 *
 * Exportado de proposito: os controles precisam atravessar esta funcao, e nao um objeto ja
 * derivado. Foi essa a licao da R6-02.
 */
/**
 * Remove comentarios.  [corrigido na R9-01]
 *
 * A versao anterior so removia comentario de linha que COMECAVA a linha. Com isso
 * `await import // comentario\n(p);` — JavaScript valido — sobrevivia inteiro e nenhum dos dois
 * extratores casava, porque ambos exigem `import` seguido so de espaco e `(`. Resultado medido
 * pelo revisor: zero especificadores, zero opacos, zero falhas.
 *
 * O guarda `[^:]` impede que `https://` dentro de string seja tratado como comentario. E uma
 * regra estreita e conhecida, nao um lexer: string contendo `//` sem `:` antes ainda seria
 * cortada. Declarado, nao alegado como completo.
 */
function semComentarios(fonte) {
  return String(fonte ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // comentario de bloco
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');       // comentario de linha, inclusive no meio
}

/**
 * Formas de `import`/`export`/`require` que este verificador SABE classificar.
 * Fechada e positiva: o que nao casa nao e ignorado, e reprovado por TYPE-09e.
 */
const FORMAS_RECONHECIDAS = Object.freeze([
  /^import\s*\(/,                          // import( ... )  — literal ou opaco, TYPE-09d decide
  /^import\s*\.\s*meta\b/,                 // import.meta
  /^import\s+['"]/,                        // import 'x'
  /^import\s+[^;'"()]*?\bfrom\s*['"]/,     // import ... from 'x'
  /^require\s*\(/                          // require( ... )
]);

/**
 * Ocorrencias de `import`/`require`/`export ... from` que a gramatica NAO consegue classificar.
 *
 * POR QUE ISTO EXISTE  [R9-01]
 *   O revisor mostrou que `import { 'readFile' as rf } from 'node:fs';` — sintaxe valida — nao
 *   casa com nenhuma forma reconhecida, porque o nome importado entre aspas quebra o padrao. E
 *   nao casar estava significando "nada a classificar", que virava aprovacao.
 *
 *   A regra correta nao e reconhecer mais formas: e PARTICIONAR. Toda ocorrencia do keyword
 *   precisa cair numa forma conhecida; o resto reprova. Isso nao exige parser de JavaScript —
 *   exige que o desconhecido seja tratado como desconhecido, e nao como ausencia.
 */
export function lerOcorrenciasNaoClassificadas(fonte) {
  const texto = semComentarios(fonte);
  const fora = [];

  for (const m of texto.matchAll(/\b(?:import|require)\b/g)) {
    const trecho = texto.slice(m.index, m.index + 400);
    if (!FORMAS_RECONHECIDAS.some((re) => re.test(trecho))) {
      fora.push(trecho.split('\n')[0].trim().slice(0, 60));
    }
  }

  /* `export ... from` tambem introduz dependencia. So interessam as ocorrencias de `export` que
     tenham `from` antes do fim da instrucao — `export const`/`export function` nao dependem de
     nada e nao entram aqui. */
  for (const m of texto.matchAll(/\bexport\b/g)) {
    const ateFim = texto.slice(m.index).split(';')[0];
    if (!/\bfrom\b/.test(ateFim)) continue;
    if (!/^export\s+[^;'"()]*?\bfrom\s*['"][^'"]+['"]/.test(ateFim)) {
      fora.push(ateFim.split('\n')[0].trim().slice(0, 60));
    }
  }

  return fora;
}

/**
 * Formas dinamicas de `import()`/`require()` cujo argumento NAO e um unico literal de string.
 *
 * POR QUE ISTO EXISTE  [R8-01]
 *   `lerEspecificadoresDeImport` so enxerga literal. A revisao R8 mostrou o buraco executando o
 *   avaliador completo com duas fontes que passavam com zero falhas:
 *
 *       const p = 'zod'; await import(p);
 *       await import('@anthropic-ai/' + 'sdk');
 *
 *   O especificador nao existe como literal, entao nao havia o que classificar — e "nada a
 *   classificar" virava aprovacao. Uma dependencia de fornecedor atravessava a fronteira por
 *   expressao.
 *
 *   A regra e a mesma que a R4 ensinou: o que o extrator NAO consegue analisar precisa REPROVAR,
 *   nao ser ignorado. Analisavel = um unico literal; qualquer outra forma cai aqui.
 */
export function lerImportsDinamicosNaoAnalisaveis(fonte) {
  const texto = semComentarios(fonte);
  const fora = [];
  for (const m of texto.matchAll(/\b(import|require)\s*\(([^)]*)\)/g)) {
    const argumento = m[2].trim();
    if (!/^(['"])[^'"]*\1$/.test(argumento)) fora.push(`${m[1]}(${argumento})`);
  }
  return fora;
}

export function lerEspecificadoresDeImport(fonte) {
  const texto = semComentarios(fonte);
  const achados = [];
  const padroes = [
    /\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const re of padroes) {
    for (const m of texto.matchAll(re)) achados.push(m[1]);
  }
  return [...new Set(achados)];
}

/**
 * Um especificador e interno ao Slice? Gramatica FECHADA E POSITIVA: so `./algo`, e sem `..`.
 * Tudo o mais — pacote npm, `node:` builtin, subida de diretorio — fica de fora por construcao,
 * em vez de depender de uma lista de negacao que a R4 ja mostrou ser incompleta.
 */
export function especificadorInternoAoSlice(spec) {
  if (typeof spec !== 'string' || spec === '') return false;
  if (spec.includes('..')) return false;
  return spec.startsWith('./');
}

/** Le as secoes E e F do PLAN-A. Retorna `null` quando o plano nao esta acessivel. */
export function lerSecoesDoPlano(caminho = PLANO_A) {
  if (!existsSync(caminho)) return null;
  const texto = readFileSync(caminho, 'utf8');
  const iE = texto.search(/^## E\./m);
  const iF = texto.search(/^## F\./m);
  const iG = texto.search(/^## G\./m);
  if (!(iE >= 0 && iF > iE && iG > iF)) return null;
  return { secaoE: texto.slice(iE, iF), secaoF: texto.slice(iF, iG) };
}

/* ------------------------------------------------------------------ *
 * Avaliacao
 * ------------------------------------------------------------------ */

const iguais = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function* chavesProfundas(valor) {
  if (Array.isArray(valor)) { for (const v of valor) yield* chavesProfundas(v); return; }
  if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) { yield k; yield* chavesProfundas(v); }
  }
}

/**
 * Avalia o modelo de tipos. PURA em relacao a `modelo` para que toda sabotagem use o
 * MESMO caminho de codigo da verificacao real.
 */
export function avaliarTipos(modelo) {
  const {
    oraculo, superficie: orcSuperficie, ancora, tipos, familias, distincoes,
    exports: exportsReais, camposDoDescritor, plano
  } = modelo;

  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  const vocabulario = orcSuperficie.vocabularioDeProvider.termos;
  const sujo = (texto) => vocabulario.filter((v) => String(texto).toLowerCase().includes(v));

  const membrosImpl = Object.values(tipos).flat();
  const nomesImpl = new Set(membrosImpl.map((t) => t.nome));

  /* ---------------- TYPE-01 — oraculo <-> implementacao ---------------- */

  const famOraculo = oraculo.familias.map((f) => f.nome);
  check('TYPE-01a', iguais(famOraculo, Object.keys(tipos)),
    `familias divergem do oraculo. oraculo=[${famOraculo}] implementacao=[${Object.keys(tipos)}]`);
  check('TYPE-01b', iguais(famOraculo, familias),
    `FAMILIAS exportada diverge do oraculo. oraculo=[${famOraculo}] exportada=[${familias}]`);

  for (const f of oraculo.familias) {
    const impl = (tipos[f.nome] ?? []).map((t) => t.nome);
    check(`TYPE-01c/${f.nome}`, iguais(f.membros, impl),
      `membros de '${f.nome}' divergem do oraculo. faltando=[${f.membros.filter((m) => !impl.includes(m))}] sobrando=[${impl.filter((m) => !f.membros.includes(m))}]`);
  }

  check('TYPE-01d', membrosImpl.length === oraculo.totalMembros,
    `total de membros ${membrosImpl.length} != ${oraculo.totalMembros} declarado no oraculo`);

  /* ---------------- TYPE-02 — ancora documental, COM familia ---------------- */

  if (plano === null) {
    falhas.push('TYPE-02: PLAN-A secoes E/F ausentes ou ilegiveis; sem ancora documental nao ha prova. Nunca SKIP.');
  } else {
    /* TYPE-02f — FINGERPRINT DA SECAO.  [bloqueantes 1 e 2 da revisao R2]
       Os parsers eram parciais: parentetizar `Checkpoint` ou quebrar
       `Journal ≠ Projection` em dois spans fazia o parser extrair MENOS e tratar
       isso como sucesso. Com o fingerprint, qualquer reformatacao vira drift
       EXPLICITO. O PLAN-A esta sob Planning Freeze — ele nao deveria mudar, entao a
       rigidez aqui e o contrato, nao excesso de zelo. */
    check('TYPE-02f/E', sha256(plano.secaoE) === ancora.secoes.E.sha256,
      `secao E do PLAN-A divergiu do fingerprint congelado. esperado=${ancora.secoes.E.sha256.slice(0, 12)} observado=${sha256(plano.secaoE).slice(0, 12)}. Reformatacao do plano exige reconciliacao explicita, nao extracao parcial.`);
    check('TYPE-02f/F', sha256(plano.secaoF) === ancora.secoes.F.sha256,
      `secao F do PLAN-A divergiu do fingerprint congelado. esperado=${ancora.secoes.F.sha256.slice(0, 12)} observado=${sha256(plano.secaoF).slice(0, 12)}.`);

    /* TYPE-02h — GRAMATICA DE LINHA FECHADA E POSITIVA.  [bloqueante das revisoes R3 e R4]

       Historico deste controle, porque ele foi refeito duas vezes:

         R3 apontou que tachado e comentario HTML marcam conteudo como removido sem
         remove-lo do texto extraido. Respondi com uma LISTA DE NEGACAO de caracteres,
         '~' e '<'.

         R4 derrubou a resposta: uma definicao de referencia Markdown nao renderizada
         — linha comecando com '[rotulo]:' e contendo o token entre crases — passava
         com zero falhas mediante apenas documento e SHA, sem tocar em implementacao
         nem nos oraculos taxonomicos. Lista de negacao de caractere e incompleta por
         construcao: sempre ha outra sintaxe que nao renderiza.

       A resposta agora e POSITIVA e medida sobre o texto congelado: toda linha nao
       vazia comeca com '#', '*', crase, '(' ou letra. Nenhuma comeca com '[', que e
       como comecam definicao de referencia e nota de rodape. Linha fora da gramatica
       reprova em vez de ser ignorada pelo extrator. */
    /* Classes de linha ESPECIFICAS POR SECAO.  [R5-01]
       Historico, porque este controle foi refeito tres vezes:

         R3 → lista de negacao de caracteres. Derrubada pela R4 com definicao de
              referencia nao renderizada.
         R4 → gramatica por primeiro caractere. Derrubada por mim mesmo (F-MAR-072):
              aceitava item de lista, porque `*` precisa valer para o italico.
         R5 → derrubada de novo: a classe era generica. Qualquer `## ` virava HEADING
              e qualquer `**` virava BLOCO, entao mover um membro para
              `## Exemplo: \`Checkpoint\`` mantinha o token sendo extraido como membro
              normativo da familia anterior. Conteudo rotulado como EXEMPLO continuava
              lido como contrato.

       Agora a classe diz QUAL construcao, nao apenas que forma tem: a secao admite
       exatamente um heading, e ele precisa ser o proprio heading da secao; os blocos
       precisam ter a forma normativa da secao (cabecalho de familia em E, distincao
       entre crases em F). */
    const GRAMATICA_POR_SECAO = {
      E: {
        heading: /^## E\. /,
        bloco: /^\*\*[A-Z][A-Za-z ]*\*\* — /,
        continuacao: /^(?:[`(\p{L}]|\*[^ *])/u
      },
      F: {
        heading: /^## F\. /,
        bloco: /^\*\*`/,
        continuacao: /^(?:[`(\p{L}]|\*[^ *])/u
      }
    };
    for (const [id, texto] of [['E', plano.secaoE], ['F', plano.secaoF]]) {
      const g = GRAMATICA_POR_SECAO[id];
      const linhas = texto.split('\n').filter((l) => l.trim() !== '');

      const foraDaGramatica = linhas.filter((l) =>
        !(g.heading.test(l) || g.bloco.test(l) || (!/^(?:## |\*\*)/.test(l) && g.continuacao.test(l))));
      check(`TYPE-02h/${id}/linha`, foraDaGramatica.length === 0,
        `secao ${id} tem linha fora das classes normativas da secao: ${foraDaGramatica.slice(0, 2).map((l) => JSON.stringify(l.slice(0, 56))).join(' ')}`);

      /* Exatamente um heading, e ele e o da propria secao. Um heading extra e o
         vetor da R5-01: ele nao interrompe o bloco de familia em curso, entao seus
         tokens sao absorvidos como membros. */
      const headings = linhas.filter((l) => l.startsWith('## '));
      check(`TYPE-02h/${id}/heading`, headings.length === 1 && g.heading.test(headings[0]),
        `secao ${id} deveria ter exatamente um heading, o da propria secao; encontrados ${headings.length}: ${headings.map((h) => JSON.stringify(h.slice(0, 40))).join(' ')}`);

      /* TYPE-02h/{E,F}/linhas — CONTAGEM DE LINHAS CONGELADA.  [R6-01]
         A gramatica por classe fechou heading e bloco, mas a classe CONTINUACAO aceita
         qualquer linha iniciada por letra — e as continuacoes reais da secao sao
         exatamente isso. `Exemplo: \`Checkpoint\`` e estruturalmente indistinguivel de
         `percebe) · \`Coordination\``, entao nenhuma regra de forma separa as duas.
         O que separa e que uma delas E UMA LINHA A MAIS. A contagem esta medida no
         texto congelado e o PLAN-A esta sob Planning Freeze: acrescentar linha e drift,
         nao evolucao silenciosa. Fecha o vetor sem inventar heuristica semantica. */
      check(`TYPE-02h/${id}/linhas`, linhas.length === ancora.secoes[id].linhasNaoVazias,
        `secao ${id} tem ${linhas.length} linhas nao vazias; a ancora congela ${ancora.secoes[id].linhasNaoVazias}. Linha acrescentada pode carregar token sem ser construcao normativa.`);

      const comSequencia = ancora.gramaticaDeLinha.sequenciasProibidas.filter((s) => texto.includes(s));
      check(`TYPE-02h/${id}/sequencia`, comSequencia.length === 0,
        `secao ${id} contem sequencia estrutural que produz conteudo nao renderizado (${comSequencia.join(' ')}): link, imagem, nota de rodape, HTML, tachado ou bloco de codigo`);
    }

    const derivado = derivarFamiliasDoPlano(plano.secaoE);
    const famDoc = Object.keys(derivado);

    /* TYPE-02g — TOTALIDADE DA SECAO E.
       Segunda camada, para o caso de o fingerprint ser atualizado junto com o
       ataque: todo token entre crases precisa continuar classificado. Um membro
       movido para dentro de parenteses aparece na lista de exemplos, que e fechada,
       e a divergencia reprova. */
    const todosOsTokens = [...plano.secaoE.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const membrosDerivados = new Set(Object.values(derivado).flat());
    const entreParenteses = [...plano.secaoE.matchAll(/\(([^)]*)\)/gs)]
      .flatMap((m) => [...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]));

    const naoClassificados = todosOsTokens.filter((t) => !membrosDerivados.has(t) && !entreParenteses.includes(t));
    check('TYPE-02g/nenhum-token-orfao', naoClassificados.length === 0,
      `token da secao E nao classificado como membro nem como exemplo: ${naoClassificados.join(', ')}`);

    const esperadosEntreParenteses = ancora.secoes.E.tokensEntreParenteses;
    check('TYPE-02g/exemplos-congelados',
      iguais([...esperadosEntreParenteses].sort(), [...new Set(entreParenteses)].sort()),
      `tokens entre parenteses da secao E divergem do congelado. congelado=[${esperadosEntreParenteses}] observado=[${[...new Set(entreParenteses)]}] — um membro movido para dentro de parenteses aparece aqui`);

    check('TYPE-02g/contagem', membrosDerivados.size === ancora.secoes.E.membrosEsperados,
      `a secao E rende ${membrosDerivados.size} membros distintos, mas a ancora congela ${ancora.secoes.E.membrosEsperados}`);
    check('TYPE-02g/familias', famDoc.length === ancora.secoes.E.familiasEsperadas,
      `a secao E rende ${famDoc.length} familias, mas a ancora congela ${ancora.secoes.E.familiasEsperadas}`);

    check('TYPE-02a', iguais(famDoc, famOraculo),
      `familias do oraculo divergem da secao E. documento=[${famDoc}] oraculo=[${famOraculo}]`);
    check('TYPE-02b', iguais(famDoc, Object.keys(tipos)),
      `familias da implementacao divergem da secao E. documento=[${famDoc}] implementacao=[${Object.keys(tipos)}]`);

    for (const fam of famDoc) {
      const doc = derivado[fam];
      const orc = oraculo.familias.find((f) => f.nome === fam)?.membros ?? [];
      const impl = (tipos[fam] ?? []).map((t) => t.nome);
      check(`TYPE-02c/${fam}`, iguais(doc, orc),
        `membros de '${fam}' no oraculo divergem da secao E. documento=[${doc}] oraculo=[${orc}]`);
      check(`TYPE-02d/${fam}`, iguais(doc, impl),
        `membros de '${fam}' na implementacao divergem da secao E. documento=[${doc}] implementacao=[${impl}]`);
    }

    const totalDoc = Object.values(derivado).flat().length;
    check('TYPE-02e', totalDoc === oraculo.totalMembros,
      `a secao E rende ${totalDoc} membros, mas o oraculo declara ${oraculo.totalMembros}`);
  }

  /* ---------------- TYPE-03 — unicidade nominal global ---------------- */

  const ocorrencias = new Map();
  for (const [fam, membros] of Object.entries(tipos)) {
    for (const t of membros) {
      if (!ocorrencias.has(t.nome)) ocorrencias.set(t.nome, []);
      ocorrencias.get(t.nome).push(fam);
    }
  }
  const duplicados = [...ocorrencias.entries()].filter(([, fams]) => fams.length > 1);
  check('TYPE-03', duplicados.length === 0,
    `nome canonico em mais de uma familia: ${duplicados.map(([n, f]) => `${n} em ${f.join(' e ')}`).join('; ')}`);

  /* ---------------- TYPE-04 — distincao nominal ---------------- */

  const marcaCanonica = (familia, nome) => `eos.type.${familia.replace(/\s+/g, '')}.${nome}`;
  const forasDaDerivacao = membrosImpl.filter((t) => t.marca !== marcaCanonica(t.familia, t.nome));
  check('TYPE-04a', forasDaDerivacao.length === 0,
    `marca fora da derivacao canonica: ${forasDaDerivacao.map((t) => `${t.nome} -> ${t.marca}`).join(', ')}`);

  const marcas = membrosImpl.map((t) => t.marca);
  check('TYPE-04b', new Set(marcas).size === marcas.length,
    `marcas nominais colidem: ${marcas.filter((m, i) => marcas.indexOf(m) !== i).join(', ')}`);

  const marcaDoTermo = (termo) => termo.tipo === 'CANONICO'
    ? (membrosImpl.find((t) => t.nome === termo.nome)?.marca ?? null)
    : termo.marca;

  for (const d of distincoes) {
    const ms = d.termos.map(marcaDoTermo);
    check(`TYPE-04c/${d.id}`, ms.every((m) => m !== null) && new Set(ms).size === ms.length,
      `distincao ${d.id} colapsou: termo com marca nula ou repetida (${ms.join(', ')})`);

    for (const termo of d.termos) {
      if (termo.tipo === 'CANONICO') {
        const alvo = membrosImpl.find((t) => t.nome === termo.nome);
        check(`TYPE-04d/${d.id}/${termo.nome}`, alvo != null && alvo.familia === termo.familia,
          `${d.id} cita '${termo.nome}' como CANONICO da familia '${termo.familia}', mas ${alvo ? `ele e da familia '${alvo.familia}'` : 'ele nao e tipo canonico'}`);
      } else if (termo.relacionadoA != null) {
        check(`TYPE-04e/${d.id}/${termo.nome}`, nomesImpl.has(termo.relacionadoA),
          `${d.id} relaciona o conceito '${termo.nome}' ao tipo inexistente '${termo.relacionadoA}'`);
      }
    }
  }

  /* TYPE-04f/g — as marcas de CONCEITO.  [achado ALTO da revisao R2]
     Elas nao tinham derivacao nem unicidade global validadas. Duas consequencias
     reais, ambas demonstradas: trocar `Tool.marca` por 'Gemini Runtime' passava — o
     vetor provider-native reentrava pela marca, que TYPE-08e nao cobre porque
     TYPE-08e olha o NOME do termo; e fazer a marca de `Capability Discovered`
     colidir com `eos.type.Runtime.Capability` passava, porque TYPE-04c so procurava
     colisao DENTRO do mesmo grupo. */
  const conceitos = distincoes.flatMap((d) => d.termos).filter((t) => t.tipo === 'CONCEITO');

  const marcasForaDaDerivacao = conceitos.filter((t) => t.marca !== marcaDeConceito(t.nome));
  check('TYPE-04f', marcasForaDaDerivacao.length === 0,
    `marca de conceito fora da derivacao canonica: ${marcasForaDaDerivacao.map((t) => `${t.nome} -> ${t.marca}`).join(', ')}`);

  const todasAsMarcas = [...membrosImpl.map((t) => t.marca), ...conceitos.map((t) => t.marca)];
  const colisoesGlobais = todasAsMarcas.filter((m, i) => todasAsMarcas.indexOf(m) !== i);
  check('TYPE-04g', colisoesGlobais.length === 0,
    `colisao global entre marcas canonicas e de conceito: ${[...new Set(colisoesGlobais)].join(', ')}`);

  /* TYPE-04h — forma exata do termo. Metadado estrutural extra e o mesmo vetor de
     antecipacao de escopo que TYPE-07b fecha para os descritores. */
  const CAMPOS_CANONICO = ['familia', 'nome', 'tipo'];
  const CAMPOS_CONCEITO = ['marca', 'nome', 'relacionadoA', 'tipo'];
  const termosMalFormados = distincoes.flatMap((d) => d.termos).filter((t) =>
    !iguais(t.tipo === 'CANONICO' ? CAMPOS_CANONICO : CAMPOS_CONCEITO, Object.keys(t).sort()));
  check('TYPE-04h', termosMalFormados.length === 0,
    `termo de distincao com campos fora do contrato: ${termosMalFormados.map((t) => `${t.nome}{${Object.keys(t).join(',')}}`).join('; ')}`);

  /* ---------------- TYPE-08 — as distincoes, ancoradas na secao F ---------------- */
  /* Achado bloqueante 2: sem isto, remover uma distincao inteira nao produzia falha
     alguma. Agora composicao, ordem, termos exatos e classificacao vem do documento. */

  if (plano !== null) {
    const grupos = derivarDistincoesDoPlano(plano.secaoF);

    check('TYPE-08a', grupos.length === distincoes.length,
      `a secao F declara ${grupos.length} distincoes, a implementacao tem ${distincoes.length}`);

    const n = Math.min(grupos.length, distincoes.length);
    for (let i = 0; i < n; i++) {
      const doc = grupos[i];
      const impl = distincoes[i].termos.map((t) => t.nome);
      check(`TYPE-08b/${distincoes[i].id}`, iguais(doc, impl),
        `termos divergem da secao F. documento=[${doc.join(' | ')}] implementacao=[${impl.join(' | ')}]`);

      /* A classificacao nao e declarada pelo autor: ela e DERIVADA. Um termo e
         CANONICO se, e somente se, e um dos 75 membros. Declarar diferente disso e
         defeito, nao preferencia. */
      for (const termo of distincoes[i].termos) {
        const esperado = nomesImpl.has(termo.nome) ? 'CANONICO' : 'CONCEITO';
        check(`TYPE-08c/${distincoes[i].id}/${termo.nome}`, termo.tipo === esperado,
          `'${termo.nome}' esta declarado como ${termo.tipo}, mas ${esperado === 'CANONICO' ? 'e um tipo canonico da secao E' : 'nao e tipo canonico'}`);
      }
    }

    const ids = distincoes.map((d) => d.id);
    check('TYPE-08d', new Set(ids).size === ids.length, `ids de distincao repetidos: ${ids.join(', ')}`);

    /* TYPE-08f — TOTALIDADE DA SECAO F.  [bloqueante 2 da revisao R2]
       `derivarDistincoesDoPlano` so reconhece `≠` dentro de um unico span entre
       crases. Reformatar `Journal ≠ Projection` como `Journal` ≠ `Projection` faz o
       grupo sumir da derivacao sem sumir do texto — Markdown legitimo, distincao
       preservada, verificador cego. A soma de (termos - 1) precisa bater com o
       numero de `≠` do texto: um grupo perdido derruba a soma e reprova. */
    const naoIgualNoTexto = (plano.secaoF.match(/≠/g) ?? []).length;
    const naoIgualDerivado = grupos.reduce((soma, g) => soma + g.length - 1, 0);
    check('TYPE-08f/totalidade', naoIgualNoTexto === naoIgualDerivado,
      `a secao F tem ${naoIgualNoTexto} ocorrencias de '≠', mas os grupos derivados somam ${naoIgualDerivado} separadores — ha distincao no texto que o parser nao capturou`);
    check('TYPE-08f/congelado', naoIgualNoTexto === ancora.secoes.F.ocorrenciasDeNaoIgual,
      `a secao F tem ${naoIgualNoTexto} ocorrencias de '≠', mas a ancora congela ${ancora.secoes.F.ocorrenciasDeNaoIgual}`);
    check('TYPE-08g/grupos-congelados', grupos.length === ancora.secoes.F.gruposEsperados,
      `a secao F rende ${grupos.length} grupos, mas a ancora congela ${ancora.secoes.F.gruposEsperados}`);

    /* Fecha o vetor de vazamento por conceito inventado: um termo que nao esta na
       secao F nao entra, tenha ele vocabulario de fornecedor ou nao. */
    const termosDoc = new Set(grupos.flat());
    const inventados = distincoes.flatMap((d) => d.termos).filter((t) => !termosDoc.has(t.nome));
    check('TYPE-08e', inventados.length === 0,
      `termo de distincao que nao aparece na secao F: ${inventados.map((t) => t.nome).join(', ')}`);
  }

  /* ---------------- TYPE-05 — vazamento provider-native ---------------- */
  /* Escopo: ESTRUTURA (chaves, nomes canonicos, marcas, nomes exportados), nao texto
     de comentario. A lista de negacao e reconhecidamente incompleta — o Codex provou
     isso com `Gemini Runtime`. Quem fecha o vetor de conceito e a ancora TYPE-08e. */

  const chaves = [...new Set([...chavesProfundas(tipos), ...chavesProfundas(distincoes)])];
  const chavesSujas = chaves.filter((k) => sujo(k).length > 0);
  check('TYPE-05a', chavesSujas.length === 0,
    `chave estrutural com vocabulario provider-native: ${chavesSujas.join(', ')}`);

  const canonicosSujos = membrosImpl.filter((t) => sujo(t.nome).length > 0 || sujo(t.marca).length > 0);
  check('TYPE-05b', canonicosSujos.length === 0,
    `tipo canonico com vocabulario provider-native: ${canonicosSujos.map((t) => t.nome).join(', ')}`);

  const exportsSujos = exportsReais.filter((n) => sujo(n).length > 0);
  check('TYPE-05c', exportsSujos.length === 0,
    `export com vocabulario provider-native: ${exportsSujos.join(', ')}`);

  /* TYPE-05d REMOVIDO na revisao R3, por achado do Codex.
     Ele exigia que a marca de conceito nao introduzisse vocabulario de fornecedor
     ausente do nome. A checagem funcionava, mas era LOGICAMENTE REDUNDANTE: TYPE-04f
     ja exige `marca === marcaDeConceito(nome)`, e uma marca exatamente derivada nao
     pode introduzir nada. Prova disso no proprio instrumento: nenhuma das 26
     sabotagens exigia o id TYPE-05d, e o harness continuaria 26/26 se ele parasse de
     funcionar. Checagem que nao pode falhar sozinha e decoracao — o mesmo padrao que
     este projeto rejeita desde LAY-NEG-01. A propriedade continua provada por
     TYPE-04f (derivacao da marca) e TYPE-08e (nome ancorado na secao F). */

  /* ---------------- TYPE-06 — fronteira de escopo do barrel ---------------- */

  check('TYPE-06a', iguais([...orcSuperficie.superficieEsperada].sort(), [...exportsReais].sort()),
    `exports divergem da superficie do oraculo. sobrando=[${exportsReais.filter((e) => !orcSuperficie.superficieEsperada.includes(e))}] faltando=[${orcSuperficie.superficieEsperada.filter((s) => !exportsReais.includes(s))}]`);

  const vazados = orcSuperficie.simbolosDeSlicesPosteriores.filter((p) => exportsReais.includes(p.nome));
  check('TYPE-06b', vazados.length === 0,
    `barrel exporta simbolo de Slice posterior: ${vazados.map((p) => `${p.nome} (${p.dono})`).join(', ')}`);

  /* ---------------- TYPE-07 — forca na familia certa ---------------- */

  const sondas = [
    ['SliceLease', 'Concurrency'], ['WriteManifest', 'Side Effects'],
    ['Enforcement', 'Security'], ['Coordination', 'Security'], ['Capability', 'Runtime']
  ];
  for (const [nome, esperada] of sondas) {
    const alvo = membrosImpl.find((t) => t.nome === nome);
    check(`TYPE-07a/${nome}`, alvo != null && alvo.familia === esperada,
      `${nome} deveria ser da familia '${esperada}', mas esta em '${alvo ? alvo.familia : 'nenhuma'}'`);
  }

  const esperados = [...orcSuperficie.camposDoDescritor.campos].sort();
  const comCamposExtras = membrosImpl.filter((t) => !iguais(esperados, Object.keys(t).sort()));
  check('TYPE-07b', comCamposExtras.length === 0,
    `descritor com campos fora do oraculo (${esperados.join(', ')}): ${comCamposExtras.map((t) => `${t.nome}{${Object.keys(t).join(',')}}`).join('; ')}`);

  check('TYPE-07c', iguais(esperados, [...camposDoDescritor].sort()),
    `CAMPOS_DO_DESCRITOR da implementacao diverge do oraculo. implementacao=[${camposDoDescritor}] oraculo=[${esperados}]`);

  /* TYPE-07d — barreira contra campo de estado ou de forca, mesmo que oraculo e
     implementacao sejam alterados juntos. Nao fecha o vetor; encarece. */
  const SUSPEITOS = ['estado', 'state', 'forca', 'strength', 'enforc', 'nivel', 'level', 'classe', 'class', 'garantia'];
  const camposSuspeitos = [...new Set(membrosImpl.flatMap((t) => Object.keys(t)))]
    .filter((k) => SUSPEITOS.some((s) => k.toLowerCase().includes(s)));
  check('TYPE-07d', camposSuspeitos.length === 0,
    `descritor com campo de estado ou forca, que pertence a SL-A-02/SL-A-09: ${camposSuspeitos.join(', ')}`);

  /* ---------------- TYPE-09 — SUPERFICIE TEXTUAL DE IMPORT  [R7-02, calibrado em R10-01/R11-01] --
     A metade executavel do item 5 do challenge. O que estas checagens cobrem: nenhum modulo
     canonico DECLARA, no texto-fonte, dependencia fora do proprio Slice — seja pacote de
     fornecedor, builtin do runtime ou arquivo de outro namespace.

     NAO e "o modulo nao depende de nada fora do Slice". Aquisicao sem os keywords atravessa:
     `process.getBuiltinModule('node:fs')` carrega o builtin e passa. Isso e UNKNOWN, nao provado,
     e a mensagem final do verificador publica o contraexemplo. A R11-01 achou exatamente esta
     frase ainda em forma ampla, contradizendo a classificacao correta no fim do arquivo.

     Ainda assim vale: sem TYPE-09, TYPE-05 ficava verde com um SDK importado no topo. */

  const fontes = modelo.fontes;
  const modulosCanonicos = ['families.mjs', 'distinctions.mjs', 'index.mjs'];

  /* Nao-vacuidade primeiro: sem fonte para ler, isto REPROVA. Um verificador de importacao que
     passa quando nao tem o que ler estaria aprovando exatamente o caso em que nao olhou. */
  const temTodasAsFontes = fontes != null && typeof fontes === 'object' &&
    modulosCanonicos.every((m) => typeof fontes[m] === 'string' && fontes[m].length > 0);
  check('TYPE-09a', temTodasAsFontes,
    `fonte dos modulos canonicos indisponivel; sem ler o modulo nao ha afirmacao sobre imports (esperados: ${modulosCanonicos.join(', ')})`);

  if (temTodasAsFontes) {
    for (const nome of modulosCanonicos) {
      const specs = lerEspecificadoresDeImport(fontes[nome]);

      const externos = specs.filter((s) => !especificadorInternoAoSlice(s));
      check(`TYPE-09b/${nome}`, externos.length === 0,
        `${nome} tem especificador de import fora do Slice: ${externos.join(', ')} — a fronteira provider-neutral vaza pela dependencia, nao so pelo dado. (Escopo desta checagem: a SUPERFICIE TEXTUAL de import; aquisicao sem os keywords nao e coberta — ver TYPE-09/limites)`);

      const sujos = specs.filter((s) => sujo(s).length > 0);
      check(`TYPE-09c/${nome}`, sujos.length === 0,
        `${nome} importa especificador com vocabulario de fornecedor: ${sujos.join(', ')}`);

      /* TYPE-09d — o que o extrator nao consegue analisar REPROVA.  [R8-01]
         Sem isto, `import(p)` e `import('@anthropic-ai/' + 'sdk')` passavam: nao produziam
         especificador, e ausencia de especificador estava virando aprovacao. */
      const opacos = lerImportsDinamicosNaoAnalisaveis(fontes[nome]);
      check(`TYPE-09d/${nome}`, opacos.length === 0,
        `${nome} usa import/require dinamico nao analisavel: ${opacos.join(', ')} — o destino nao e determinavel por inspecao, entao a fronteira do Slice nao pode ser afirmada`);

      /* TYPE-09e — o desconhecido reprova, em vez de virar ausencia.  [R9-01]
         Sem isto, `import { 'readFile' as rf } from 'node:fs'` nao casava com forma nenhuma,
         nao produzia especificador, e passava. Particionar e a correcao; reconhecer mais
         formas so adiaria o mesmo defeito. */
      const naoClassificadas = lerOcorrenciasNaoClassificadas(fontes[nome]);
      check(`TYPE-09e/${nome}`, naoClassificadas.length === 0,
        `${nome} tem ocorrencia de import/export/require que a gramatica nao classifica: ${naoClassificadas.join(' | ')} — forma desconhecida nao pode ser lida como ausencia de dependencia`);
    }
  }

  return { falhas, passou };
}

/* ------------------------------------------------------------------ *
 * Execucao — so quando este modulo E o ponto de entrada.  [F-MAR-069]
 *
 * Antes, importar este arquivo para reutilizar `avaliarTipos` rodava a verificacao
 * inteira e podia chamar `process.exit(1)`, derrubando o processo de quem importou.
 * Uma biblioteca que encerra o processo do chamador ao ser importada e um defeito,
 * nao um detalhe — e os Slices SL-A-02..10 vao reutilizar estes avaliadores.
 * ------------------------------------------------------------------ */

export function executar() {
  const oraculo = JSON.parse(readFileSync(ORACULO_FAMILIAS, 'utf8'));
  const orcSuperficie = JSON.parse(readFileSync(ORACULO_SUPERFICIE, 'utf8'));
  const ancora = JSON.parse(readFileSync(ORACULO_ANCORA, 'utf8'));
  const plano = lerSecoesDoPlano();

  /* Fonte dos modulos canonicos, para TYPE-09. Lida do disco, nao do que eles exportam: o objeto
     exportado nao carrega as dependencias do modulo, e e justamente a dependencia que se quer ver. */
  const AQUI = new URL('.', import.meta.url);
  const fontes = {};
  for (const nome of ['families.mjs', 'distinctions.mjs', 'index.mjs']) {
    const caminho = new URL(nome, AQUI);
    if (existsSync(caminho)) fontes[nome] = readFileSync(caminho, 'utf8');
  }

  const modeloReal = Object.freeze({
    oraculo,
    superficie: orcSuperficie,
    ancora,
    tipos: TIPOS_CANONICOS,
    familias: FAMILIAS,
    distincoes: DISTINCOES_OBRIGATORIAS,
    exports: Object.keys(barrel),
    camposDoDescritor: CAMPOS_DO_DESCRITOR,
    plano,
    fontes
  });

  const real = avaliarTipos(modeloReal);

  /* Controles negativos. Como a avaliacao real termina com zero falhas, qualquer
     falha sob sabotagem foi causada pela sabotagem. Os casos COORD-* sao os que a
     revisao do Codex mostrou faltar: alteracao COORDENADA entre oraculo e
     implementacao, que so o documento consegue reprovar. */

  const comFamilia = (fam, fn) => ({ ...TIPOS_CANONICOS, [fam]: fn([...TIPOS_CANONICOS[fam]]) });
  const sem = (fam, nome) => comFamilia(fam, (ms) => ms.filter((t) => t.nome !== nome));
  const troca = (fam, nome, patch) => comFamilia(fam, (ms) => ms.map((t) => (t.nome === nome ? { ...t, ...patch } : t)));
  const oraculoSem = (fam, nome) => ({
    ...oraculo, totalMembros: oraculo.totalMembros - 1,
    familias: oraculo.familias.map((f) => (f.nome === fam ? { ...f, membros: f.membros.filter((m) => m !== nome) } : f))
  });

  const plane = TIPOS_CANONICOS['Runtime'].find((t) => t.nome === 'Plane');
  const sliceLease = TIPOS_CANONICOS['Concurrency'].find((t) => t.nome === 'SliceLease');
  const checkpoint = TIPOS_CANONICOS['Persistence'].find((t) => t.nome === 'Checkpoint');

  const sabotagens = [
    ['TYPE-01c', 'membro removido so na implementacao', { tipos: sem('Persistence', 'Journal') }],
    ['TYPE-01c', 'membro extra so na implementacao',
      { tipos: comFamilia('Persistence', (ms) => [...ms, { nome: 'Ledger', familia: 'Persistence', marca: 'eos.type.Persistence.Ledger' }]) }],
    ['TYPE-01c', 'typo em membro',
      { tipos: troca('Concurrency', 'SliceLease', { nome: 'SliceLeases', marca: 'eos.type.Concurrency.SliceLeases' }) }],
    ['TYPE-01a', 'familia renomeada',
      { tipos: Object.fromEntries(Object.entries(TIPOS_CANONICOS).map(([k, v]) => [k === 'Knowledge' ? 'Conhecimento' : k, v])) }],
    ['TYPE-03', 'mesmo membro em duas familias',
      { tipos: { ...TIPOS_CANONICOS, 'Security': [...TIPOS_CANONICOS['Security'], { ...sliceLease, familia: 'Security', marca: 'eos.type.Security.SliceLease' }] } }],
    ['TYPE-04b', 'marcas colapsadas entre Plane e Process', { tipos: troca('Runtime', 'Process', { marca: plane.marca }) }],
    ['TYPE-04a', 'marca fora da derivacao', { tipos: troca('Runtime', 'Session', { marca: 'eos.type.QualquerCoisa.Session' }) }],

    /* Achado 1 — as coordenadas. Oraculo e implementacao mudam JUNTOS. */
    ['TYPE-02c', 'COORD: membro movido de familia no oraculo E na implementacao', {
      oraculo: {
        ...oraculo,
        familias: oraculo.familias.map((f) => f.nome === 'Persistence' ? { ...f, membros: f.membros.filter((m) => m !== 'Checkpoint') }
          : f.nome === 'Work' ? { ...f, membros: [...f.membros, 'Checkpoint'] } : f)
      },
      tipos: {
        ...sem('Persistence', 'Checkpoint'),
        'Work': [...TIPOS_CANONICOS['Work'], { ...checkpoint, familia: 'Work', marca: 'eos.type.Work.Checkpoint' }]
      }
    }],
    ['TYPE-02c', 'COORD: membro removido do oraculo E da implementacao',
      { oraculo: oraculoSem('Persistence', 'Checkpoint'), tipos: sem('Persistence', 'Checkpoint') }],

    /* Achado 2 — as distincoes. */
    ['TYPE-08a', 'distincao inteira removida', { distincoes: DISTINCOES_OBRIGATORIAS.slice(0, -1) }],
    ['TYPE-08b', 'termo trocado dentro de uma distincao',
      { distincoes: DISTINCOES_OBRIGATORIAS.map((d) => d.id !== 'DIST-09' ? d : { ...d, termos: [d.termos[0], { nome: 'Snapshot', tipo: 'CANONICO', familia: 'Persistence' }] }) }],
    ['TYPE-08c', 'classificacao CANONICO/CONCEITO invertida',
      { distincoes: DISTINCOES_OBRIGATORIAS.map((d) => d.id !== 'DIST-09' ? d : { ...d, termos: d.termos.map((t) => ({ nome: t.nome, tipo: 'CONCEITO', marca: `eos.concept.${t.nome}`, relacionadoA: null })) }) }],
    ['TYPE-08e', 'conceito inventado com nome de fornecedor',
      { distincoes: [...DISTINCOES_OBRIGATORIAS, { id: 'DIST-FALSA', enfase: false, termos: [{ nome: 'Gemini Runtime', tipo: 'CONCEITO', marca: 'eos.concept.Gemini-Runtime', relacionadoA: null }, { nome: 'Outro', tipo: 'CONCEITO', marca: 'eos.concept.Outro', relacionadoA: null }] }] }],

    ['TYPE-05a', 'campo provider-native injetado', { tipos: troca('Runtime', 'Provider', { sandbox: 'workspace-write' }) }],

    /* Achado 4 — escopo antecipado, inclusive coordenado com o oraculo. */
    ['TYPE-06a', 'export a mais no barrel', { exports: [...Object.keys(barrel), 'CapabilityMachine'] }],
    ['TYPE-06b', 'COORD: export a mais no barrel E no oraculo de superficie', {
      exports: [...Object.keys(barrel), 'CapabilityMachine'],
      superficie: { ...orcSuperficie, superficieEsperada: [...orcSuperficie.superficieEsperada, 'CapabilityMachine'] }
    }],

    /* Achado 5 — estado antecipado no descritor, inclusive coordenado. */
    ['TYPE-07b', 'estado fixado em Capability', { tipos: troca('Runtime', 'Capability', { estado: 'PROVEN' }) }],
    ['TYPE-07d', 'COORD: estado no descritor E no oraculo de campos', {
      tipos: Object.fromEntries(Object.entries(TIPOS_CANONICOS).map(([k, v]) => [k, v.map((t) => ({ ...t, estado: 'PROVEN' }))])),
      camposDoDescritor: ['nome', 'familia', 'marca', 'estado'],
      superficie: { ...orcSuperficie, camposDoDescritor: { ...orcSuperficie.camposDoDescritor, campos: ['nome', 'familia', 'marca', 'estado'] } }
    }],

    ['TYPE-02', 'PLAN-A ausente tratado como SKIP', { plano: null }],

    /* Revisao R2 — os tres bypasses de parser. Reproduzem literalmente os ataques
       que o Codex executou. Cada um vem em par: primeiro contra o fingerprint,
       depois COM o fingerprint atualizado, para provar que a totalidade sozinha
       tambem reprova. Defesa em duas camadas so vale se cada camada for testada
       sem a outra. */
    ['TYPE-02f/E', 'R2: `Checkpoint` parentetizado na secao E',
      { plano: { ...plano, secaoE: plano.secaoE.replace('`Checkpoint`', '(`Checkpoint`)') } }],
    ['TYPE-02g', 'R2 COORD: `Checkpoint` parentetizado E fingerprint atualizado', (() => {
      const secaoE = plano.secaoE.replace('`Checkpoint`', '(`Checkpoint`)');
      return {
        plano: { ...plano, secaoE },
        ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } }
      };
    })()],
    ['TYPE-02f/F', 'R2: `Journal ≠ Projection` quebrado em dois spans',
      { plano: { ...plano, secaoF: plano.secaoF.replace('`Journal ≠ Projection`', '`Journal` ≠ `Projection`') } }],
    ['TYPE-08f/totalidade', 'R2 COORD: distincao quebrada em spans E fingerprint atualizado', (() => {
      const secaoF = plano.secaoF.replace('`Journal ≠ Projection`', '`Journal` ≠ `Projection`');
      return {
        plano: { ...plano, secaoF },
        ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } }
      };
    })()],

    /* Revisao R2 — o achado ALTO das marcas de conceito. */
    ['TYPE-04f', 'R2: marca de conceito com nome de fornecedor',
      { distincoes: DISTINCOES_OBRIGATORIAS.map((d) => d.id !== 'DIST-01' ? d : { ...d, termos: d.termos.map((t) => t.nome !== 'Tool' ? t : { ...t, marca: 'Gemini Runtime' }) }) }],
    ['TYPE-04g', 'R2: marca de conceito colidindo com marca canonica',
      { distincoes: DISTINCOES_OBRIGATORIAS.map((d) => d.id !== 'DIST-06' ? d : { ...d, termos: d.termos.map((t) => t.nome !== 'Capability Discovered' ? t : { ...t, marca: 'eos.type.Runtime.Capability' }) }) }],
    ['TYPE-04h', 'R2: metadado estrutural extra num termo de distincao',
      { distincoes: DISTINCOES_OBRIGATORIAS.map((d) => d.id !== 'DIST-09' ? d : { ...d, termos: d.termos.map((t) => ({ ...t, forcaDeGarantia: 'HARD_ENFORCED' })) }) }],

    /* Revisao R3 — o bloqueante que sobreviveu as duas rodadas anteriores: markup que
       marca conteudo como removido sem remove-lo do texto extraido. Os quatro casos
       vem COM o fingerprint atualizado, que era exatamente a condicao em que a
       verificacao passava antes. */
    ['TYPE-02h/E', 'R3 COORD: `Checkpoint` tachado E fingerprint atualizado', (() => {
      const secaoE = plano.secaoE.replace('`Checkpoint`', '~~`Checkpoint`~~');
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/E', 'R3 COORD: `Checkpoint` em comentario HTML E fingerprint atualizado', (() => {
      const secaoE = plano.secaoE.replace('`Checkpoint`', '<!-- `Checkpoint` -->');
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/F', 'R3 COORD: distincao tachada E fingerprint atualizado', (() => {
      const secaoF = plano.secaoF.replace('`Journal ≠ Projection`', '~~`Journal ≠ Projection`~~');
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],
    ['TYPE-02h/F', 'R3 COORD: distincao em comentario HTML E fingerprint atualizado', (() => {
      const secaoF = plano.secaoF.replace('`Journal ≠ Projection`', '<!-- `Journal ≠ Projection` -->');
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],

    /* Revisao R4 — o vetor que derrubou a lista de negacao de caracteres: conteudo
       que NAO RENDERIZA e mesmo assim satisfazia a taxonomia. Custo do ataque: so
       documento e fingerprint, sem tocar em implementacao nem nos oraculos. */
    ['TYPE-02h/E/linha', 'R4 COORD: `Checkpoint` movido para definicao de referencia nao renderizada', (() => {
      const secaoE = `${plano.secaoE}\n[nota]: http://exemplo.invalido "\`Checkpoint\`"\n`;
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/F/linha', 'R4 COORD: distincao movida para definicao de referencia nao renderizada', (() => {
      const secaoF = `${plano.secaoF}\n[nota]: http://exemplo.invalido "\`Journal ≠ Projection\`"\n`;
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],
    ['TYPE-02h/E/sequencia', 'R4 COORD: token dentro de link inline', (() => {
      const secaoE = plano.secaoE.replace('`Checkpoint`', '[`Checkpoint`](http://exemplo.invalido)');
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],

    /* F-MAR-072 — achado meu, aplicando o criterio de soundness da R5 a propria
       gramatica: item de lista era aceito porque `*` precisa valer para o italico. */
    ['TYPE-02h/E/linha', 'F-MAR-072: item de lista carregando token canonico', (() => {
      const secaoE = `${plano.secaoE}\n* \`Checkpoint\` movido para item de lista\n`;
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/F/linha', 'F-MAR-072: item de lista carregando distincao', (() => {
      const secaoF = `${plano.secaoF}\n* \`Journal ≠ Projection\` movido para item de lista\n`;
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],

    /* R5-01 — conteudo rotulado como EXEMPLO sendo lido como contrato. */
    ['TYPE-02h/E/heading', 'R5-01 COORD: membro movido para heading de exemplo', (() => {
      const secaoE = plano.secaoE.replace('`Checkpoint` ·', '\n## Exemplo: `Checkpoint`\n');
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/F/heading', 'R5-01 COORD: distincao movida para heading de exemplo', (() => {
      const secaoF = `${plano.secaoF}\n## Exemplo: \`Journal ≠ Projection\`\n`;
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],
    ['TYPE-02h/E/linha', 'R5-01: bloco em negrito fora da forma de cabecalho de familia', (() => {
      const secaoE = `${plano.secaoE}\n**Exemplo** de \`Checkpoint\` fora da forma normativa\n`;
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],

    /* R6-01 — linha de continuacao carregando conteudo rotulado como exemplo. Nao ha
       regra de FORMA que a separe de uma continuacao legitima; o que a separa e ser
       uma linha a mais. */
    ['TYPE-02h/E/linhas', 'R6-01 COORD: linha `Exemplo:` acrescentada com token canonico', (() => {
      const secaoE = `${plano.secaoE}\nExemplo: \`Checkpoint\` citado fora da familia\n`;
      return { plano: { ...plano, secaoE }, ancora: { ...ancora, secoes: { ...ancora.secoes, E: { ...ancora.secoes.E, sha256: sha256(secaoE) } } } };
    })()],
    ['TYPE-02h/F/linhas', 'R6-01 COORD: linha `Exemplo:` acrescentada com distincao', (() => {
      const secaoF = `${plano.secaoF}\nExemplo: \`Capability Discovered ≠ Capability Proven\` fora do contrato\n`;
      return { plano: { ...plano, secaoF }, ancora: { ...ancora, secoes: { ...ancora.secoes, F: { ...ancora.secoes.F, sha256: sha256(secaoF) } } } };
    })()],

    /* Revisao R7 — fronteira de IMPORTACAO. TYPE-05 olha o dado; estes olham a dependencia. */
    ['TYPE-09a', 'R7: fonte dos modulos canonicos indisponivel', { fontes: {} }],
    ['TYPE-09a', 'R7: fonte de um modulo faltando', { fontes: { ...fontes, 'index.mjs': undefined } }],
    ['TYPE-09b/families.mjs', 'R7: modulo canonico importando pacote npm',
      { fontes: { ...fontes, 'families.mjs': `import z from 'zod';\n${fontes['families.mjs'] ?? ''}` } }],
    ['TYPE-09b/index.mjs', 'R7: modulo canonico importando builtin do runtime',
      { fontes: { ...fontes, 'index.mjs': `import { readFileSync } from 'node:fs';\n${fontes['index.mjs'] ?? ''}` } }],
    ['TYPE-09b/distinctions.mjs', 'R7: modulo canonico subindo para fora do Slice',
      { fontes: { ...fontes, 'distinctions.mjs': `export { algo } from '../../layout.mjs';\n${fontes['distinctions.mjs'] ?? ''}` } }],
    ['TYPE-09c/families.mjs', 'R7: import relativo com vocabulario de fornecedor',
      { fontes: { ...fontes, 'families.mjs': `import x from './codex-sandbox-adapter.mjs';\n${fontes['families.mjs'] ?? ''}` } }],
    ['TYPE-09b/families.mjs', 'R7: dependencia entrando por import() dinamico literal',
      { fontes: { ...fontes, 'families.mjs': `${fontes['families.mjs'] ?? ''}\nconst m = await import('@anthropic-ai/sdk');` } }],

    /* Revisao R8 — as duas fontes que o revisor executou e que passavam com zero falhas. */
    ['TYPE-09d/families.mjs', 'R8: import() com variavel, sem literal a classificar',
      { fontes: { ...fontes, 'families.mjs': `${fontes['families.mjs'] ?? ''}\nconst p = 'zod'; await import(p);` } }],
    ['TYPE-09d/index.mjs', 'R8: import() com concatenacao de strings',
      { fontes: { ...fontes, 'index.mjs': `${fontes['index.mjs'] ?? ''}\nawait import('@anthropic-ai/' + 'sdk');` } }],
    ['TYPE-09d/distinctions.mjs', 'R8: require() com expressao',
      { fontes: { ...fontes, 'distinctions.mjs': `${fontes['distinctions.mjs'] ?? ''}\nconst n = 'fs'; const m = require(n);` } }],

    /* Revisao R9 — os dois JavaScript validos que atravessavam a gramatica sem casar com nada. */
    ['TYPE-09d/families.mjs', 'R9: comentario de linha entre `import` e `(`',
      { fontes: { ...fontes, 'families.mjs': `${fontes['families.mjs'] ?? ''}\nconst p = 'node:fs';\nawait import // comentario valido\n(p);` } }],
    ['TYPE-09e/index.mjs', 'R9: nome importado como string quebra o padrao de `from`',
      { fontes: { ...fontes, 'index.mjs': `${fontes['index.mjs'] ?? ''}\nimport { 'readFile' as rf } from 'node:fs';` } }],
    ['TYPE-09e/distinctions.mjs', 'R9: `export ... from` com nome entre aspas',
      { fontes: { ...fontes, 'distinctions.mjs': `${fontes['distinctions.mjs'] ?? ''}\nexport { 'x' as y } from 'zod';` } }]
  ];

  const negFalhos = [];
  for (const [id, descricao, patch] of sabotagens) {
    const r = avaliarTipos({ ...modeloReal, ...patch });
    if (!r.falhas.some((f) => f.startsWith(id))) negFalhos.push(`${id} (${descricao})`);
  }

  /* TYPE-PARSER-01 — casos que ATRAVESSAM `lerEspecificadoresDeImport`.  [licao da R6-02]
     Sabotar `fontes` prova o avaliador; so isto prova o extrator. Metade das formas precisa ser
     encontrada, e a outra metade precisa NAO gerar especificador — um extrator que devolvesse
     tudo teria as sabotagens acima verdes do mesmo jeito. */
  const casosImport = [
    ["import x from 'zod';", ['zod']],
    ['import { a } from "./families.mjs";', ['./families.mjs']],
    ["export { a } from '../fora.mjs';", ['../fora.mjs']],
    ["export * from './b.mjs';", ['./b.mjs']],
    ["import 'efeito-colateral';", ['efeito-colateral']],
    ["const m = await import('@anthropic-ai/sdk');", ['@anthropic-ai/sdk']],
    ["const r = require('node:fs');", ['node:fs']],
    ["import {\n  a,\n  b\n} from './multilinha.mjs';", ['./multilinha.mjs']],
    ["// import x from 'comentado';", []],
    ["/* import x from 'em-bloco'; */", []],
    ['const texto = "a palavra import aparece aqui";', []],
    ['', []]
  ];
  const importFalhos = casosImport
    .filter(([fonte, esperado]) => JSON.stringify(lerEspecificadoresDeImport(fonte)) !== JSON.stringify(esperado))
    .map(([f]) => JSON.stringify(f.slice(0, 40)));

  /* TYPE-PARSER-02 — a gramatica de especificador interno, aceitos E rejeitados. */
  const casosSpec = [
    ['./families.mjs', true], ['./oracle/plan-anchor.json', true],
    ['../layout.mjs', false], ['./../fora.mjs', false], ['node:fs', false],
    ['zod', false], ['@anthropic-ai/sdk', false], ['/abs/x.mjs', false], ['', false]
  ];
  const specFalhos = casosSpec
    .filter(([s, esperado]) => especificadorInternoAoSlice(s) !== esperado)
    .map(([s]) => `'${s}'`);

  /* TYPE-PARSER-03 — a deteccao de import dinamico opaco.  [R8-01]
     Precisa das duas direcoes: o dinamico nao analisavel tem que ser PEGO, e o literal
     legitimo NAO pode ser marcado como opaco — senao TYPE-09d reprovaria import valido. */
  const casosDinamico = [
    ["await import(p);", 1],
    ["await import('@anthropic-ai/' + 'sdk');", 1],
    ["const m = require(nome);", 1],
    ["import(`./${familia}.mjs`);", 1],
    ["await import(cond ? 'a' : 'b');", 1],
    ["await import('./families.mjs');", 0],
    ["const m = require('node:fs');", 0],
    ["import { a } from './b.mjs';", 0],
    ["// await import(p);", 0],
    ["/* require(x) */", 0],
    ['', 0]
  ];
  const dinamicoFalhos = casosDinamico
    .filter(([fonte, esperado]) => lerImportsDinamicosNaoAnalisaveis(fonte).length !== esperado)
    .map(([f]) => JSON.stringify(f.slice(0, 40)));

  /* TYPE-PARSER-04 — o particionamento.  [R9-01]
     Duas direcoes obrigatorias: forma desconhecida tem que ser PEGA, e forma legitima do
     repositorio NAO pode ser marcada como desconhecida — inclusive a palavra "import" em prosa
     de comentario, que existe de fato no cabecalho de `index.mjs`. */
  const casosParticao = [
    ["import { 'readFile' as rf } from 'node:fs';", 1],
    ["export { 'x' as y } from 'zod';", 1],
    ["const p='a'; await import // c\n(p);", 0],           // classificado; quem reprova e TYPE-09d
    ['import defeituoso sem from nem parenteses;', 1],
    ["import { a } from './b.mjs';", 0],
    ["import {\n  A,\n  B\n} from './families.mjs';", 0],
    ["export {\n  A\n} from './families.mjs';", 0],
    ["import './efeito.mjs';", 0],
    ['const u = new URL(".", import.meta.url);', 0],
    ["const m = require('node:fs');", 0],
    ['export const FAMILIAS = [];', 0],
    ['export function pendente(nome, dono) { throw new Error(nome); }', 0],
    ['/* Este barrel nao e uma conveniencia de import. */', 0],
    ['', 0]
  ];
  const particaoFalhos = casosParticao
    .filter(([fonte, esperado]) => lerOcorrenciasNaoClassificadas(fonte).length !== esperado)
    .map(([f]) => JSON.stringify(f.slice(0, 44)));

  console.log('EOS protocol/types — tipos canonicos das nove familias  [SL-A-01 · BOOTSTRAP_PROOF]');
  console.log(`  oraculo de familias : ${oraculo.oraculo} v${oraculo.versao} (${oraculo.estado})`);
  console.log(`  oraculo de superficie : ${orcSuperficie.oraculo} v${orcSuperficie.versao} (${orcSuperficie.estado})`);
  console.log(`  ancora documental : ${plano ? `PLAN-A secoes E e F lidas (${Object.keys(derivarFamiliasDoPlano(plano.secaoE)).length} familias, ${derivarDistincoesDoPlano(plano.secaoF).length} distincoes derivadas)` : 'AUSENTE'}`);
  console.log(`  checagens PASS: ${real.passou.length}`);
  console.log(`  checagens FAIL: ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos: ${sabotagens.length - negFalhos.length}/${sabotagens.length} sabotagens detectadas` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  TYPE-PARSER-01 (casos atravessando lerEspecificadoresDeImport): ${casosImport.length - importFalhos.length}/${casosImport.length}` +
    (importFalhos.length ? ` — errou: ${importFalhos.join(', ')}` : ''));
  console.log(`  TYPE-PARSER-02 (gramatica de especificador interno): ${casosSpec.length - specFalhos.length}/${casosSpec.length}` +
    (specFalhos.length ? ` — errou: ${specFalhos.join(', ')}` : ''));
  console.log(`  TYPE-PARSER-03 (import dinamico opaco, pega e nao marca literal): ${casosDinamico.length - dinamicoFalhos.length}/${casosDinamico.length}` +
    (dinamicoFalhos.length ? ` — errou: ${dinamicoFalhos.join(', ')}` : ''));
  /* Rotulo restrito ao que os casos medem  [R10-02]: "legitimo" aqui e a forma legitima USADA
     PELO REPOSITORIO. `const palavra = 'import';`, `{ import: 'interno' }` e `objeto.import` sao
     JavaScript valido e SERIAM marcados como nao classificados — falso positivo conhecido, que os
     modulos atuais nao disparam e que nao se pretende fechar sem um lexer. */
  console.log(`  TYPE-PARSER-04 (particao: desconhecido reprova; formas do repositorio passam): ${casosParticao.length - particaoFalhos.length}/${casosParticao.length}` +
    (particaoFalhos.length ? ` — errou: ${particaoFalhos.join(', ')}` : ''));

  if (real.falhas.length > 0 || negFalhos.length > 0 || importFalhos.length > 0 ||
      specFalhos.length > 0 || dinamicoFalhos.length > 0 || particaoFalhos.length > 0) return 1;

  /* Afirmacao calibrada a evidencia (MAR-INV-025, achado 8 da revisao). */
  console.log('  TIPOS_CANONICOS_CONSISTENTES_COM_PLAN_A_SECOES_E_E_F');
  console.log('    provado por ancora documental (documento <-> oraculo <-> implementacao):');
  console.log('      as nove familias e a associacao familia->membro de cada um dos 75 tipos;');
  console.log('      os 14 grupos da secao F com termos exatos e classificacao DERIVADA da');
  console.log('      membresia canonica, nao declarada pelo autor.');
  console.log('      As secoes E e F tem fingerprint congelado e checagens de totalidade que');
  console.log('      exigem todo token contratual classificado.');
  console.log('    NATUREZA DA GRAMATICA, para nao ser lida como mais forte do que e:');
  console.log('      TYPE-02h e uma checagem de CLASSE ESTRUTURAL DE LINHA, especifica por secao:');
  console.log('      o heading precisa ser o da propria secao e ser unico, e os blocos precisam');
  console.log('      ter a forma normativa da secao. NAO e um parser de Markdown e nao decide');
  console.log('      renderizacao. O que ela garante e que a secao conserva as CLASSES DE LINHA e');
  console.log('      a CONTAGEM congeladas. NAO garante que um token esteja numa construcao');
  console.log('      normativa e nao em prosa  [R7-01, medido]: a secao F tem 13 linhas nao vazias');
  console.log('      e so 3 comecam com a forma de bloco — 10 dos 14 grupos vivem em prosa corrida,');
  console.log('      entao em F nao ha construcao normativa por linha a preservar. E em E,');
  console.log('      reaproveitar uma linha existente como "Exemplo: ..." mantendo o token no corpo');
  console.log('      da mesma familia produz mapa IDENTICO. Essa relocacao passa quando o');
  console.log('      fingerprint e atualizado junto: e COORDINATED_CHANGE_VISIBLE_IN_DIFF.');
  console.log('      A completude vale DENTRO do contrato congelado medido, nao sobre Markdown em');
  console.log('      geral: construcao valida de Markdown que o PLAN-A nao usa e rejeitada, e isso');
  console.log('      e sinal de drift, nao bug. As sequencias proibidas sao hardening complementar;');
  console.log('      elas NAO sustentam que toda sintaxe nao normativa seja impossivel.');
  console.log('    provado na IMPLEMENTACAO, nao no documento (o PLAN-A nao fala de marcas):');
  console.log('      unicidade nominal global, marcas canonicas e de conceito derivadas de');
  console.log('      (familia, nome) e sem colisao entre si, forma exata de descritor e termo.');
  console.log('    provado apenas contra oraculo externo, SEM ancora documental possivel:');
  console.log('      superficie de export e campos do descritor — o PLAN-A nao enumera exports');
  console.log('      de modulo. Alteracao coordenada nesses eixos fica visivel no diff, nao impossivel.');
  console.log('    FRONTEIRA DE IMPORTACAO (TYPE-09), a metade executavel do item 5 do challenge:');
  console.log('      INSPECAO LEXICA do texto-fonte dos tres modulos canonicos  [R8-02, R9-02]:');
  console.log('      sobre o texto sem comentarios, TODA ocorrencia de import/require, e todo');
  console.log('      `export ... from`, precisa cair numa forma reconhecida (TYPE-09e) — forma');
  console.log('      desconhecida REPROVA em vez de virar ausencia de dependencia. Dentro das');
  console.log('      formas reconhecidas: especificador literal comeca com `./`, sem `..` e sem');
  console.log('      vocabulario de fornecedor (TYPE-09b/c); e chamada dinamica cujo argumento nao');
  console.log('      seja um unico literal REPROVA (TYPE-09d).');
  console.log('      O QUE TYPE-09 PROVA, com o nome exato  [calibrado na R10-01]: a SUPERFICIE');
  console.log('      TEXTUAL DE IMPORT dos tres modulos. NAO prova ausencia de dependencia externa.');
  console.log('      Contraexemplo medido pelo revisor, JavaScript valido e sem nenhum dos keywords:');
  console.log('        const fs = process.getBuiltinModule(\'node:fs\');');
  console.log('      Ele carrega o builtin de fato e atravessa TYPE-09 com zero falhas. Enumerar');
  console.log('      mecanismos de aquisicao (globalThis, createRequire, eval, ...) seria lista de');
  console.log('      negacao — incompleta por construcao, a licao da R4. Entao a classe honesta e:');
  console.log('        superficie textual de import  DETECTIVE (provada)');
  console.log('        aquisicao sem keyword         UNKNOWN  (nao provada, e nao alegada)');
  console.log('      LIMITES adicionais, medidos: NAO ha resolucao do grafo — o que um arquivo `./`');
  console.log('      alcanca por sua vez nao e verificado; e a remocao de comentario e regra estreita');
  console.log('      (guarda `[^:]` para `https://`), nao um lexer de JavaScript. Ainda assim, sem');
  console.log('      TYPE-09 o caso comum — um SDK de fornecedor importado no topo — passava com');
  console.log('      TYPE-05 verde: a fronteira vazava pela dependencia, e nao pelo dado.');
  console.log('    SEM GARANTIA ESTATICA — dito explicitamente, nao omitido:');
  console.log('      `compile-fail cruzado` do CHALLENGE-SL-A-01 esta NOT_APPLICABLE, supersedido');
  console.log('      por D2-SL-A-01-COMPILE-FAIL: descritor congelado nao tem operacao de');
  console.log('      atribuicao a reprovar, e nao existe compilacao nesta materializacao. Isto');
  console.log('      NAO e PASS e NAO e SKIP. A distincao entre os tipos e provada como distincao');
  console.log('      e deteccao de colisao dos descritores materializados (TYPE-04a/b/c/f/g), que');
  console.log('      e garantia de DADO, nao de sistema de tipos. Nada aqui impede um consumidor');
  console.log('      de trocar um descritor por outro em tempo de execucao.');
  console.log('    NAO provado: semantica dos tipos, forca de enforcement (SL-A-02),');
  console.log('      modelo de artefato (SL-A-03), maquina de capability (SL-A-09).');
  console.log('      A lista de vocabulario provider-native e reconhecidamente incompleta:');
  console.log('      TYPE-08e fecha o NOME dos termos contra a secao F e TYPE-04f fecha a MARCA');
  console.log('      por derivacao — nao ha prova de fechamento para toda a estrutura do conceito.');
  console.log('    INDEPENDENCIA DE ORACULO, por propriedade — classificada, nao adjetivada:');
  console.log('      familias e membresia            COORDINATED_CHANGE_DETECTABLE');
  console.log('        (no nivel da CONSTRUCAO NORMATIVA da secao, nao da semantica do texto:');
  console.log('         o documento congelado nao participa; alterar oraculo+implementacao reprova)');
  console.log('      distincoes da secao F           COORDINATED_CHANGE_DETECTABLE');
  console.log('      classificacao CANONICO/CONCEITO COORDINATED_CHANGE_DETECTABLE');
  console.log('        (a EXPECTATIVA e derivada da membresia e nao tem oraculo a editar; o valor');
  console.log('         OBSERVADO e o campo `tipo` de distinctions.mjs, declarado e adulteravel.');
  console.log('         R7-03: dizer "nao ha campo a adulterar" era refutado pela sabotagem');
  console.log('         TYPE-08c deste mesmo arquivo, que inverte exatamente esse campo)');
  console.log('      marcas e forma de descritor     COORDINATED_CHANGE_VISIBLE_IN_DIFF');
  console.log('      superficie de export            COORDINATED_CHANGE_VISIBLE_IN_DIFF');
  console.log('      campos do descritor             COORDINATED_CHANGE_VISIBLE_IN_DIFF');
  console.log('      vocabulario provider-native     UNKNOWN (lista de negacao incompleta por natureza)');
  console.log('      Nenhuma propriedade e STRUCTURALLY_IMPOSSIBLE, e VISIBLE_IN_DIFF nao deve ser');
  console.log('      lido como tal: significa custo e visibilidade, nao impedimento.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
