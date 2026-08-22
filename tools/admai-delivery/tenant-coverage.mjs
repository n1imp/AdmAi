/**
 * AdmAi Delivery Harness — cobertura de negativos cross-tenant.  [Feature PRODUCT_INTEGRITY · P1]
 *
 * A PERGUNTA QUE ESTE MÓDULO RESPONDE
 *   Quais rotas escopadas por empresa têm negativo cross-tenant, e quais não têm?
 *
 *   O isolamento multi-tenant é imposto no client Prisma estendido (`src/db/tenant.js`), o que é a
 *   arquitetura certa. Mas "está no client" não é o mesmo que "provado para cada rota": uma rota
 *   que use o Prisma global, ou monte a query fora do escopo, fura o isolamento sem que nada no
 *   client mude. Só o teste por rota separa as duas coisas.
 *
 * O QUE ESTE MÓDULO NÃO FAZ — e o limite é grande o bastante para ficar no nome do veredito
 *   Ele mede COBERTURA, não corretude. Uma rota listada como coberta tem um teste que a nomeia num
 *   arquivo que exercita cross-tenant; ele NÃO verifica que o teste de fato prova isolamento. É
 *   detecção de lacuna, não prova de segurança.
 *
 *   Isto é `DETECTIVE`, e explicitamente não `HARD_ENFORCED`: nada aqui impede uma rota nova de
 *   nascer sem negativo — só torna a ausência visível e contável.
 *
 * PROVENANCE
 *   Rotas e menções vêm do filesystem (OBSERVED). A cobertura é DERIVED. Nada é INFERRED.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

const DIR_ROTAS = `${RAIZ}chaveiro-bot/src/routes`;
const DIR_TESTES = `${RAIZ}chaveiro-bot/test/integration`;

/**
 * Arquivos de rota fora do escopo de tenant, com o motivo. Lista DECLARADA: excluir por engano é
 * pior que incluir, então cada exclusão precisa de justificativa legível.
 */
export const FORA_DO_ESCOPO_DE_TENANT = Object.freeze({
  'auth.js': 'autenticação e cadastro acontecem ANTES de existir tenant no request',
  'admin.js': 'painel administrativo global, protegido por adminOnly — não é escopo de empresa',
  'billing.js': 'assinatura é da empresa, mas o webhook Stripe chega sem sessão',
  'api.js': 'apenas monta os demais routers',
  'google.js': 'OAuth externo; escopo verificado no callback',
  'whatsapp.js': 'webhook de provedor, sem sessão de usuário'
});

/** Extrai as rotas declaradas num arquivo de router. Exportada: os controles atravessam ela. */
export function lerRotas(fonte) {
  const sem = String(fonte ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  /* O corpo vai da declaração até a PRÓXIMA declaração — span aproximado de propósito: um parser
     de JS real seria outro projeto. A imprecisão é conhecida e tem consequência medida: middleware
     declarado ENTRE duas rotas é atribuído à rota anterior. Por isso o corpo só é usado para
     AFIRMAR coleção (evidência positiva), nunca para negar risco. */
  const ms = [...sem.matchAll(/\brouter\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)['"]/g)];
  return ms.map((m, i) => ({
    metodo: m[1].toUpperCase(),
    caminho: m[2],
    corpo: sem.slice(m.index, i + 1 < ms.length ? ms[i + 1].index : sem.length)
  }));
}

/**
 * Um arquivo de teste exercita cross-tenant?
 *
 * Gramática FECHADA de marcadores, medida sobre os testes reais do repositório. Deliberadamente
 * conservadora: reconhecer um marcador a menos gera lacuna investigável; reconhecer um a mais gera
 * cobertura falsa, que é o erro caro aqui.
 */
export const MARCADORES_CROSS_TENANT = Object.freeze([
  'multi-tenant', 'empresa B', 'outra empresa', 'cross-tenant', 'de outro tenant'
]);

export function exercitaCrossTenant(fonte) {
  const texto = String(fonte ?? '').toLowerCase();
  return MARCADORES_CROSS_TENANT.some((m) => texto.includes(m.toLowerCase()));
}

/**
 * O texto de um teste menciona esta rota?
 *
 * POR QUE NAO E `includes` LITERAL  [falso negativo real, medido]
 *   A rota e declarada como `/me/documentos/:id/arquivo`, e o teste escreve
 *   `/api/me/documentos/${docDeB}/arquivo`. Comparacao literal nao casa, e as duas rotas de
 *   documentos apareciam como lacuna quando `documentos.test.js` ja as cobria — inclusive com
 *   caso multi-tenant. O instrumento estava mandando escrever teste duplicado.
 *
 *   Um segmento `:param` casa com qualquer coisa que nao contenha `/`: id literal, interpolacao
 *   de template ou variavel. O resto do caminho continua exato, entao `/me/servicos` NAO casa com
 *   `/me/servicos/algo`.
 *
 * Exportada porque os controles precisam atravessa-la.
 */
export function mencionaRota(fonte, caminho) {
  if (typeof fonte !== 'string' || typeof caminho !== 'string' || caminho === '') return false;
  const padrao = caminho
    .split('/')
    .map((seg) => (seg.startsWith(':')
      ? '[^/\'"`\\s]+'
      : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  /* Ancorado a direita por um delimitador: sem isso, `/me` casaria dentro de `/me/servicos`. */
  return new RegExp(`${padrao}(?=['"\`?\\s)]|$)`).test(fonte);
}

/**
 * Classifica a EXPOSIÇÃO da rota, e com isso QUAL teste prova a propriedade dela.
 *
 * A CORREÇÃO QUE ESTA FUNÇÃO SOFREU, e por quê
 *   A versão anterior chamava de "vetor de IDOR" tudo que não fosse `/me/*`. Com isso 10 rotas de
 *   COLEÇÃO — `GET /estoque`, `GET /dashboard`, `GET /avaliacoes`, `POST /pagamentos` — entravam
 *   na mesma fila que `GET /tecnicos/:id/perfil`. Elas não recebem identificador externo nenhum:
 *   escrever "A pede o id de B → 404" para elas mede a coisa errada, porque não há id a pedir.
 *
 *   O risco delas é real e é outro: **vazamento de coleção**. A query precisa filtrar por
 *   `empresaId`, e a falha aparece como linha de outro tenant DENTRO do resultado — status 200,
 *   corpo contaminado. Um teste de IDOR nunca veria isso.
 *
 * AS QUATRO CLASSES, e o teste que cada uma exige
 *
 *   IDOR_VECTOR_PRESENT        o atacante fornece o id → A pede o recurso de B, espera 404 e
 *                              nenhum efeito no banco.
 *   COLLECTION_LEAKAGE_VECTOR  sem id externo, mas devolve conjunto → A lista, e o resultado não
 *                              pode conter NENHUMA linha de B.
 *   SELF_SCOPED_BY_AUTH_CONTEXT  alvo derivado do token → IDOR não se aplica. NÃO significa
 *                              segura: significa que a ameaça é outra (auth/sessão) e o
 *                              instrumento é outro.
 *   UNKNOWN                    não classificável — nunca vira "sem risco".
 */
export const CLASSES_DE_EXPOSICAO = Object.freeze([
  'IDOR_VECTOR_PRESENT', 'COLLECTION_LEAKAGE_VECTOR', 'SELF_SCOPED_BY_AUTH_CONTEXT',
  'NO_TENANT_DATA_ACCESS', 'UNKNOWN'
]);

/**
 * Rotas cuja classe foi determinada LENDO o handler, com o motivo registrado.
 *
 * Existe porque a análise estática tem um limite que não some com regex melhor: o sinal de coleção
 * é procurado no span do handler, e `GET /relatorio/pdf` agrega dentro de `gerarRelatorioPDF`, em
 * outro módulo. Esticar a heurística até ela concordar comigo seria ajustar o instrumento à
 * resposta; declarar com justificativa mantém a decisão revisável, que é como
 * `FORA_DO_ESCOPO_DE_TENANT` já funciona neste arquivo.
 *
 * Cada entrada é uma afirmação humana, contestável linha a linha — não uma derivação.
 */
export const CLASSIFICACAO_DECLARADA = Object.freeze({
  'GET /relatorio/pdf': {
    classe: 'COLLECTION_LEAKAGE_VECTOR',
    motivo: 'agrega movimentações do período dentro de gerarRelatorioPDF(inicio, fim, empresaId) — o conjunto existe, só não aparece no span do handler'
  },
  'POST /materiais/upload': {
    classe: 'NO_TENANT_DATA_ACCESS',
    motivo: 'valida e grava um arquivo; não lê nem escreve registro com escopo de empresa. O risco dele é de storage (URL adivinhável), não de query cross-tenant'
  }
});

/**
 * Sinais de que o handler devolve um CONJUNTO. Fechada e medida sobre os routers reais.
 * É o que autoriza afirmar `COLLECTION_LEAKAGE_VECTOR` — sem conjunto não há coleção a vazar.
 */
export const SINAIS_DE_COLECAO = Object.freeze(['findMany', 'groupBy', 'aggregate', 'count(']);

export function devolveColecao(corpo) {
  const texto = String(corpo ?? '');
  return SINAIS_DE_COLECAO.some((s) => texto.includes(s));
}

/**
 * [R20 · execução do teste de vazamento] `COLLECTION_LEAKAGE_VECTOR` era o FALLBACK: toda rota sem
 * `:param` e fora de `/me` caía nele por eliminação. `GET /ponto/hoje` desmentiu isso na prática —
 * ele lê `req.user.tecnicoId` e devolve UM registro, então a asserção "A lista e não vê linha de B"
 * é impossível de escrever: o teste voltou 400, não vazamento. Formato de caminho é um PROXY do
 * risco, e este caso mostra onde o proxy quebra.
 *
 * A correção não é afinar a heurística até concordar com minha leitura manual — isso seria ajustar
 * o instrumento à resposta. É exigir EVIDÊNCIA POSITIVA para afirmar a classe: sem sinal de
 * conjunto no corpo do handler, a rota vai para `UNKNOWN`, que é o que eu de fato sei sobre ela.
 *
 * O erro caro aqui é cobertura falsa, e `UNKNOWN` erra na direção segura: reduz a afirmação, não
 * a proteção. `UNKNOWN` NUNCA significa "sem risco" — significa "não classificável sem ler o
 * handler", e continua fora de qualquer fila de "coberto".
 *
 * `corpo` é opcional; ausente, nenhuma alegação de coleção é possível.
 */
export function classificarExposicao(caminho, corpo, metodo) {
  if (typeof caminho !== 'string' || caminho === '') return 'UNKNOWN';
  /* Declaração lida do handler vence a heurística — e só ela, nunca um palpite. */
  const declarada = CLASSIFICACAO_DECLARADA[`${metodo} ${caminho}`];
  if (declarada) return declarada.classe;
  /* Auto-escopada vem ANTES do parâmetro: `/me/documentos/:id` tem id, mas o dono é o token —
     o negativo natural ali é de POSSE (outro técnico da mesma empresa), não de tenant. */
  if (caminho === '/me' || caminho.startsWith('/me/')) return 'SELF_SCOPED_BY_AUTH_CONTEXT';
  if (/:\w+/.test(caminho)) return 'IDOR_VECTOR_PRESENT';
  return devolveColecao(corpo) ? 'COLLECTION_LEAKAGE_VECTOR' : 'UNKNOWN';
}

/** Observa rotas e testes. */
export function observarCobertura({ dirRotas = DIR_ROTAS, dirTestes = DIR_TESTES } = {}) {
  if (!existsSync(dirRotas)) return { rotas: null, testesCrossTenant: null, motivo: 'diretório de rotas ausente' };

  const arquivosDeRota = readdirSync(dirRotas).filter((f) => f.endsWith('.js'));
  const rotas = [];
  for (const arquivo of arquivosDeRota) {
    if (FORA_DO_ESCOPO_DE_TENANT[arquivo]) continue;
    for (const r of lerRotas(readFileSync(`${dirRotas}/${arquivo}`, 'utf8'))) {
      rotas.push({ ...r, arquivo });
    }
  }

  const testes = existsSync(dirTestes)
    ? readdirSync(dirTestes).filter((f) => f.endsWith('.test.js'))
    : [];
  const testesCrossTenant = testes
    .map((f) => ({ arquivo: f, fonte: readFileSync(`${dirTestes}/${f}`, 'utf8') }))
    .filter((t) => exercitaCrossTenant(t.fonte));

  return { rotas, testesCrossTenant, arquivosDeRota, totalDeTestes: testes.length };
}

/**
 * Deriva a cobertura. PURA nos argumentos — os controles percorrem este caminho.
 *
 * Uma rota é "mencionada" quando seu caminho aparece literalmente num teste que exercita
 * cross-tenant. Menção não é prova; ver o cabeçalho.
 */
export function derivarCobertura({ rotas, testesCrossTenant }) {
  if (rotas == null || testesCrossTenant == null) {
    return { cobertas: [], descobertas: [], veredito: 'UNKNOWN', motivo: 'observação indisponível' };
  }

  const cobertas = [];
  const descobertas = [];
  for (const r of rotas) {
    const onde = testesCrossTenant.filter((t) => mencionaRota(t.fonte, r.caminho)).map((t) => t.arquivo);
    const exposicao = classificarExposicao(r.caminho, r.corpo, r.metodo);
    (onde.length ? cobertas : descobertas).push({ ...r, testes: onde, exposicao });
  }

  /* Cada vetor material tem sua propria fila, porque cada um exige um teste diferente. */
  const porClasse = (c) => descobertas.filter((d) => d.exposicao === c);
  const lacunasIdor = porClasse('IDOR_VECTOR_PRESENT');
  const lacunasColecao = porClasse('COLLECTION_LEAKAGE_VECTOR');
  const lacunasAutoEscopadas = porClasse('SELF_SCOPED_BY_AUTH_CONTEXT');
  /* [R20] Lacuna NÃO CLASSIFICADA não pertence a nenhuma das outras filas — e não pode ficar
     invisível. Antes ela sumia: não era material, não era auto-escopada, não era impressa, e o
     veredito podia ficar verde com rotas que ninguém examinou. Desconhecido não fecha gate. */
  const lacunasNaoClassificadas = porClasse('UNKNOWN');
  const lacunasSemDadoDeTenant = porClasse('NO_TENANT_DATA_ACCESS');
  const lacunasMateriais = [...lacunasIdor, ...lacunasColecao];

  return {
    cobertas, descobertas, lacunasIdor, lacunasColecao, lacunasAutoEscopadas,
    lacunasNaoClassificadas, lacunasSemDadoDeTenant,
    lacunasComVetor: lacunasMateriais,
    /* O alvo NAO e "100% das rotas": e 100% dos VETORES MATERIAIS. Rota auto-escopada fora da
       conta nao e cobertura inflada — e escopo declarado, e o instrumento a lista para que a
       decisao continue revisavel. */
    veredito: lacunasMateriais.length > 0
      ? 'LACUNAS_IDENTIFICADAS'
      : lacunasNaoClassificadas.length > 0
        ? 'VETORES_CONHECIDOS_COBERTOS_COM_NAO_CLASSIFICADAS'
        : 'TODO_VETOR_MATERIAL_COBERTO',
    percentual: rotas.length ? Math.round((cobertas.length / rotas.length) * 100) : null
  };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const obs = observarCobertura();
  const cob = derivarCobertura(obs);

  /* Controles do PARSER de rotas — atravessam `lerRotas`, não um objeto já derivado. */
  const casosRota = [
    ["router.get('/servicos', requireAuth, handler);", [{ metodo: 'GET', caminho: '/servicos' }]],
    ['router.post("/tecnicos", h);', [{ metodo: 'POST', caminho: '/tecnicos' }]],
    ["router.patch('/me/senha', h);", [{ metodo: 'PATCH', caminho: '/me/senha' }]],
    ["router.delete('/x', h);\nrouter.put('/y', h);", [{ metodo: 'DELETE', caminho: '/x' }, { metodo: 'PUT', caminho: '/y' }]],
    ["// router.get('/comentada', h);", []],
    ["/* router.get('/bloco', h); */", []],
    ['router.use(algo);', []],
    ['', []]
  ];
  /* Compara método e caminho — `corpo` é span aproximado e não tem forma canônica a fixar aqui.
     Que ele CHEGUE ao classificador é provado por `corpoChega`, com sinal próprio. */
  const semCorpo = (rs) => rs.map(({ metodo, caminho }) => ({ metodo, caminho }));
  const rotaFalhos = casosRota
    .filter(([f, esp]) => JSON.stringify(semCorpo(lerRotas(f))) !== JSON.stringify(esp))
    .map(([f]) => JSON.stringify(f.slice(0, 36)));

  /* Controles do detector de cross-tenant, nas duas direções. */
  const casosMarcador = [
    ['multi-tenant: empresa B não acessa', true],
    ['it("cross-tenant negativo")', true],
    ['acessa de outro tenant', true],
    ['RBAC: gestor não promove dono', false],
    ['teste de rate limit', false],
    ['', false]
  ];
  const marcadorFalhos = casosMarcador
    .filter(([f, esp]) => exercitaCrossTenant(f) !== esp)
    .map(([f]) => JSON.stringify(f.slice(0, 36)));

  /* Controles do MATCHER de rota, atravessando `mencionaRota`. As duas direções importam: o
     interpolado precisa casar, e o prefixo de outra rota NÃO pode casar — senão a cobertura
     inflaria e as lacunas reais sumiriam, que é o erro caro aqui. */
  const casosMencao = [
    ['/me/documentos/:id/arquivo', 'get(`/api/me/documentos/${docDeB}/arquivo`)', true],
    ['/me/documentos/:id', 'delete(`/api/me/documentos/${id}`)', true],
    ['/materiais/:id', "patch('/api/materiais/7')", true],
    ['/servicos', "get('/api/servicos')", true],
    ['/tecnicos/:id/acesso', 'post(`/api/tecnicos/${t.id}/acesso`)', true],
    ['/me', "get('/api/me')", true],
    /* Prefixo não pode casar rota mais longa, nem o contrário. */
    ['/me/servicos', "get('/api/me')", false],
    ['/materiais/:id/movimentacao', "patch('/api/materiais/7')", false],
    ['/tecnicos/:id/acesso/reset', 'post(`/api/tecnicos/${t.id}/acesso`)', false],
    ['/estoque', "get('/api/servicos')", false],
    ['/me/documentos/:id', 'nada aqui', false],
    ['', 'qualquer coisa', false]
  ];
  const mencaoFalhos = casosMencao
    .filter(([rota, fonte, esp]) => mencionaRota(fonte, rota) !== esp)
    .map(([rota, fonte]) => `${rota} vs ${fonte.slice(0, 30)}`);

  /* Controles da CLASSIFICAÇÃO — cada classe precisa ser alcançável, e a ordem importa:
     `/me/documentos/:id` tem `:id` e mesmo assim é auto-escopada. */
  const COLECAO = 'const r = await req.db.material.findMany({ where: { empresaId } });';
  const UM_SO = 'if (!req.user.tecnicoId) return res.status(400); carregarPontoHoje(req.user.tecnicoId);';
  const casosExposicao = [
    ['/tecnicos/:id/perfil', COLECAO, 'IDOR_VECTOR_PRESENT'],
    ['/servicos/:id', COLECAO, 'IDOR_VECTOR_PRESENT'],
    ['/materiais/:id/movimentacao', UM_SO, 'IDOR_VECTOR_PRESENT'],
    ['/estoque', COLECAO, 'COLLECTION_LEAKAGE_VECTOR'],
    ['/dashboard', 'const t = await req.db.servico.groupBy({ by: [\'status\'] });', 'COLLECTION_LEAKAGE_VECTOR'],
    ['/me', COLECAO, 'SELF_SCOPED_BY_AUTH_CONTEXT'],
    ['/me/sessoes', COLECAO, 'SELF_SCOPED_BY_AUTH_CONTEXT'],
    ['/me/documentos/:id', UM_SO, 'SELF_SCOPED_BY_AUTH_CONTEXT'],
    ['', COLECAO, 'UNKNOWN'],
    /* O caso que a execução do teste desmentiu: sem `:param`, fora de `/me`, e mesmo assim NÃO é
       coleção. Antes caía em COLLECTION_LEAKAGE_VECTOR por eliminação. */
    ['/ponto/hoje', UM_SO, 'UNKNOWN'],
    /* Corpo ausente não pode virar alegação de coleção. */
    ['/estoque', undefined, 'UNKNOWN']
  ];
  const exposicaoFalhos = casosExposicao
    .filter(([c, corpo, esp]) => classificarExposicao(c, corpo) !== esp)
    .map(([c, corpo, esp]) => `${c || '(vazio)'} devia ser ${esp}, deu ${classificarExposicao(c, corpo)}`);

  /* A declaração lida do handler precisa VENCER a heurística — e só com o método certo, senão
     uma entrada mal chaveada silenciaria a rota errada. */
  const casosDeclarados = [
    ['declaração vence a heurística',
      classificarExposicao('/relatorio/pdf', UM_SO, 'GET') === 'COLLECTION_LEAKAGE_VECTOR'],
    ['classe sem acesso a dado de tenant é alcançável',
      classificarExposicao('/materiais/upload', UM_SO, 'POST') === 'NO_TENANT_DATA_ACCESS'],
    ['método errado não aplica a declaração',
      classificarExposicao('/relatorio/pdf', UM_SO, 'POST') === 'UNKNOWN'],
    ['toda classe declarada é uma classe válida',
      Object.values(CLASSIFICACAO_DECLARADA).every((d) => CLASSES_DE_EXPOSICAO.includes(d.classe))],
    ['toda declaração traz motivo',
      Object.values(CLASSIFICACAO_DECLARADA).every((d) => typeof d.motivo === 'string' && d.motivo.trim() !== '')]
  ];
  const declaradosFalhos = casosDeclarados.filter(([, ok]) => !ok).map(([r]) => r);

  /* O corpo do handler chega até o classificador? Sem isto, `lerRotas` podia parar de emitir
     `corpo` e TODA rota de coleção viraria UNKNOWN silenciosamente — degradação invisível. */
  const rotasDeAmostra = lerRotas(
    'router.get("/estoque", async (req, res) => { const x = await req.db.material.findMany({}); });\n' +
    'router.get("/ponto/hoje", async (req, res) => { carregarPontoHoje(req.user.tecnicoId); });'
  );
  const corpoChega =
    rotasDeAmostra.length === 2 &&
    classificarExposicao(rotasDeAmostra[0].caminho, rotasDeAmostra[0].corpo) === 'COLLECTION_LEAKAGE_VECTOR' &&
    classificarExposicao(rotasDeAmostra[1].caminho, rotasDeAmostra[1].corpo) === 'UNKNOWN';

  /* Controle da derivação: rota inexistente nos testes precisa aparecer como lacuna, e rota
     citada precisa aparecer como coberta. Sem isso a derivação poderia devolver sempre o mesmo. */
  const casosDeriv = [
    ['lacuna detectada', derivarCobertura({
      rotas: [{ metodo: 'GET', caminho: '/inexistente', arquivo: 'x.js' }],
      testesCrossTenant: [{ arquivo: 't.js', fonte: 'multi-tenant /outra' }]
    }).descobertas.length === 1],
    ['cobertura detectada', derivarCobertura({
      rotas: [{ metodo: 'GET', caminho: '/servicos', arquivo: 'x.js' }],
      testesCrossTenant: [{ arquivo: 't.js', fonte: 'multi-tenant /servicos' }]
    }).cobertas.length === 1],
    ['observação indisponível não vira cobertura', derivarCobertura({ rotas: null, testesCrossTenant: null }).veredito === 'UNKNOWN']
  ];
  const derivFalhos = casosDeriv.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('AdmAi Delivery — cobertura de negativos cross-tenant  [PRODUCT_INTEGRITY · P1]');
  console.log(`  arquivos de rota : ${obs.arquivosDeRota?.length ?? 'UNAVAILABLE'} (${Object.keys(FORA_DO_ESCOPO_DE_TENANT).length} fora do escopo de tenant, por declaração)`);
  console.log(`  rotas no escopo  : ${obs.rotas?.length ?? 'UNAVAILABLE'}`);
  console.log(`  testes que exercitam cross-tenant : ${obs.testesCrossTenant?.length ?? 'UNAVAILABLE'} de ${obs.totalDeTestes ?? '?'}`);
  console.log(`  cobertas : ${cob.cobertas.length}   lacunas : ${cob.descobertas.length}   (${cob.percentual ?? '?'}%)`);
  console.log('');
  console.log(`  IDOR_VECTOR_PRESENT (${cob.lacunasIdor.length}) — o atacante fornece o id; teste: A pede o recurso de B -> 404:`);
  for (const d of cob.lacunasIdor) console.log(`    ${d.arquivo.padEnd(14)} ${d.metodo} ${d.caminho}`);
  console.log('');
  console.log(`  COLLECTION_LEAKAGE_VECTOR (${cob.lacunasColecao.length}) — sem id externo; teste: A lista e o resultado nao contem linha de B:`);
  const porArquivo = {};
  for (const d of cob.lacunasColecao) (porArquivo[d.arquivo] ??= []).push(`${d.metodo} ${d.caminho}`);
  for (const [arq, lista] of Object.entries(porArquivo)) {
    console.log(`    ${arq}`);
    for (const l of lista) console.log(`      ${l}`);
  }
  console.log(`  NO_TENANT_DATA_ACCESS (${cob.lacunasSemDadoDeTenant.length}) — não lê nem escreve registro com escopo de empresa:`);
  for (const d of cob.lacunasSemDadoDeTenant) {
    console.log(`    ${d.arquivo.padEnd(14)} ${d.metodo} ${d.caminho}`);
    console.log(`      ${CLASSIFICACAO_DECLARADA[`${d.metodo} ${d.caminho}`]?.motivo ?? ''}`);
  }
  console.log('');
  console.log(`  UNKNOWN (${cob.lacunasNaoClassificadas.length}) — sem :param, fora de /me e SEM sinal de coleção no handler.`);
  console.log('    Não classificável estaticamente: exige ler o handler. NUNCA significa sem risco,');
  console.log('    e mantém o veredito fora de TODO_VETOR_MATERIAL_COBERTO.');
  for (const d of cob.lacunasNaoClassificadas) console.log(`    ${d.arquivo.padEnd(14)} ${d.metodo} ${d.caminho}`);
  console.log('');
  console.log(`  SELF_SCOPED_BY_AUTH_CONTEXT (${cob.lacunasAutoEscopadas.length}) — alvo derivado do token,`);
  console.log('    entao IDOR cross-tenant nao e a ameaca aplicavel. NAO significa seguras: significa que');
  console.log('    o instrumento certo para elas e outro (autenticacao/sessao), com outro teste.');
  console.log('');
  console.log(`  controles de parser de rota : ${casosRota.length - rotaFalhos.length}/${casosRota.length}` +
    (rotaFalhos.length ? ` — errou: ${rotaFalhos.join(', ')}` : ''));
  console.log(`  controles de marcador       : ${casosMarcador.length - marcadorFalhos.length}/${casosMarcador.length}` +
    (marcadorFalhos.length ? ` — errou: ${marcadorFalhos.join(', ')}` : ''));
  console.log(`  controles de derivação      : ${casosDeriv.length - derivFalhos.length}/${casosDeriv.length}` +
    (derivFalhos.length ? ` — falhou: ${derivFalhos.join('; ')}` : ''));
  console.log(`  controles de menção de rota : ${casosMencao.length - mencaoFalhos.length}/${casosMencao.length}` +
    (mencaoFalhos.length ? ` — errou: ${mencaoFalhos.join('; ')}` : ''));
  console.log(`  controles de classificação  : ${casosExposicao.length - exposicaoFalhos.length}/${casosExposicao.length}` +
    (exposicaoFalhos.length ? ` — errou: ${exposicaoFalhos.join('; ')}` : ''));
  console.log(`  corpo do handler chega ao classificador : ${corpoChega ? 'sim' : 'NÃO — coleção viraria UNKNOWN em silêncio'}`);
  console.log(`  controles de classificação declarada : ${casosDeclarados.length - declaradosFalhos.length}/${casosDeclarados.length}` +
    (declaradosFalhos.length ? ` — errou: ${declaradosFalhos.join('; ')}` : ''));

  if (rotaFalhos.length || marcadorFalhos.length || derivFalhos.length || mencaoFalhos.length ||
      exposicaoFalhos.length || declaradosFalhos.length || !corpoChega) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use esta cobertura');
    return 2;
  }

  console.log(`  VEREDITO : ${cob.veredito}`);
  console.log('    provado: quais rotas escopadas por empresa NÃO são nomeadas por nenhum teste que');
  console.log('      exercite cross-tenant. Isso é uma lista de lacunas investigáveis, e o parser');
  console.log('      de rota e o detector de marcador têm controle nas duas direções.');
  console.log('    NÃO provado: que as rotas cobertas estão de fato isoladas. "Coberta" aqui é');
  console.log('      MENÇÃO por um teste cross-tenant, não prova de isolamento — o teste pode citar');
  console.log('      a rota sem exercer o caminho perigoso. Classe honesta: DETECTIVE, não');
  console.log('      HARD_ENFORCED. Nada aqui impede uma rota nova de nascer sem negativo.');
  return 0;
}

/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Nao escreve. A prova de roteamento pode executa-lo com seguranca. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte deste modulo, nao de lista literal a manter em paralelo. */
export const FLAGS = flagsDoModulo(import.meta.url);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(recusarDesconhecida(process.argv.slice(2), FLAGS) ?? executar());
}
