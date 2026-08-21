/**
 * AdmAi Delivery Harness — Evidence Bundle.  [Wave P0]
 *
 * O QUE ESTE ARQUIVO PRODUZ
 *   O pacote que acompanha uma feature ate o gate: comandos executados, exitCode, suites, ambiente,
 *   artefatos com fingerprint, e cada afirmacao marcada com sua provenance.
 *
 * AS TRES PROPRIEDADES QUE VALEM O ARQUIVO
 *
 *   1. NAO-VACUIDADE. Um bundle que diz fechar gate precisa carregar pelo menos uma execucao real
 *      com exitCode zero. Sem isso, "gate fechado" e uma afirmacao sobre coisa nenhuma — a mesma
 *      armadilha que o stale check evita quando trata registro ausente como STALE.
 *
 *   2. PROVENANCE QUE RESTRINGE. Marcar afirmacao com OBSERVED/DERIVED/INFERRED/PROPOSED/UNKNOWN so
 *      serve se a marca mudar o que pode acontecer. Aqui muda: bundle com `fechaGate` verdadeiro e
 *      afirmacao INFERRED, PROPOSED ou UNKNOWN REPROVA.
 *
 *   3. REDACAO DE SEGREDO COM ALVO REAL. A varredura procura os VALORES das variaveis sensiveis
 *      presentes neste processo — nao apenas formatos conhecidos. Esse e o modelo de ameaca certo:
 *      o que pode vazar para um bundle montado por este processo e o que este processo consegue ler.
 *      Rodar com `node --env-file=.env.test` torna o teste nao-vacuo: existe um segredo de verdade
 *      para procurar, e o bundle precisa nao conte-lo.
 *
 *      A camada de PADRAO (`postgres://user:senha@`, `sk_live_`, JWT, chave PEM) e uma lista de
 *      NEGACAO e portanto incompleta por construcao — a licao da R4 do lado EOS. Ela entra como
 *      reforco e o output diz que e incompleta; quem sustenta a checagem e a camada de valor.
 *
 *   Em nenhum caminho deste modulo o valor de um segredo e impresso, gravado ou devolvido. O que se
 *   publica e o NOME do campo onde houve casamento.
 *
 * PROVENANCE
 *   `exitCode`, sha256 e dados de ambiente sao OBSERVED. `fechaGate` e DERIVED. Nada e INFERRED.
 */

import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ, observarRepositorio } from './snapshot.mjs';

export const DESTINO = `${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`;

/** Conjunto FECHADO de marcas de provenance. Fora dele, reprova. */
export const PROVENANCE_VALIDA = Object.freeze(['OBSERVED', 'DERIVED', 'INFERRED', 'PROPOSED', 'UNKNOWN']);

/** Marcas que nao podem sustentar fechamento de gate. */
export const PROVENANCE_NAO_FECHA_GATE = Object.freeze(['INFERRED', 'PROPOSED', 'UNKNOWN']);

/** Rotulos permitidos para configuracao sensivel. O valor nunca entra no bundle; so o rotulo. */
export const ROTULOS_DE_CONFIG = Object.freeze(['PRESENT', 'ABSENT', 'CONFIGURED', 'VALIDATED']);

/** Variaveis cujo VALOR nunca pode aparecer no bundle. */
export const VARIAVEIS_SENSIVEIS = Object.freeze([
  'DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'API_TOKEN', 'ENCRYPTION_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY', 'ADMIN_PASSWORD', 'POSTGRES_PASSWORD'
]);

/**
 * Formatos conhecidos de segredo. INCOMPLETO POR CONSTRUCAO — e uma lista de negacao, e nenhuma
 * lista de negacao de formato e exaustiva. Serve de reforco, nao de garantia.
 */
export const PADROES_DE_SEGREDO = Object.freeze([
  ['URL com credencial', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]+@/i],
  ['chave Stripe viva', /\bsk_live_[A-Za-z0-9]{8,}/],
  ['token GitHub', /\bgh[pousr]_[A-Za-z0-9]{16,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
  ['chave PEM', /-----BEGIN [A-Z ]*PRIVATE KEY-----/]
]);

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/**
 * Coleta os valores sensiveis VISIVEIS a este processo.
 * Devolve apenas os valores longos o bastante para nao produzirem casamento acidental — um valor de
 * 3 caracteres apareceria em qualquer texto e transformaria a checagem em ruido.
 * O retorno e usado so para comparacao; nunca e impresso.
 */
export function coletarValoresSensiveis(env = process.env, tamanhoMinimo = 8) {
  const fora = [];
  for (const nome of VARIAVEIS_SENSIVEIS) {
    const v = env[nome];
    if (typeof v === 'string' && v.length >= tamanhoMinimo) fora.push([nome, v]);
  }
  return fora;
}

/**
 * Varre um texto atras de segredo. Devolve NOMES de variavel e ROTULOS de padrao — nunca o valor,
 * nunca o trecho casado.
 */
export function varrerSegredos(texto, valores = []) {
  const achados = [];
  for (const [nome, valor] of valores) {
    if (texto.includes(valor)) achados.push(`valor de ${nome}`);
  }
  for (const [rotulo, re] of PADROES_DE_SEGREDO) {
    if (re.test(texto)) achados.push(`padrao: ${rotulo}`);
  }
  return achados;
}

/**
 * Avalia um bundle. PURA nos argumentos — as sabotagens percorrem exatamente este caminho.
 * `valoresSensiveis` entra por parametro para que o controle negativo consiga injetar um canario
 * sintetico sem depender do ambiente.
 */
export function avaliarBundle({ bundle, valoresSensiveis = [] }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  const afirmacoes = bundle.afirmacoes ?? [];
  const execucoes = bundle.execucoes ?? [];
  const artefatos = bundle.artefatos ?? [];

  const semProvenance = afirmacoes.filter((a) => !PROVENANCE_VALIDA.includes(a.provenance));
  check('EV-01', semProvenance.length === 0,
    `afirmacao sem provenance valida (${PROVENANCE_VALIDA.join('/')}): ${semProvenance.map((a) => a.texto).slice(0, 3).join(' | ')}`);

  const fracas = afirmacoes.filter((a) => PROVENANCE_NAO_FECHA_GATE.includes(a.provenance));
  check('EV-02', !bundle.fechaGate || fracas.length === 0,
    `bundle declara fechar gate carregando afirmacao ${fracas.map((a) => a.provenance).join('/')}: ` +
    `${fracas.map((a) => a.texto).slice(0, 3).join(' | ')}`);

  /* Nao-vacuidade: gate fechado exige execucao real aprovada. */
  const aprovadas = execucoes.filter((e) => e.estado === 'PASS' && e.exitCode === 0);
  check('EV-03', !bundle.fechaGate || aprovadas.length > 0,
    'bundle declara fechar gate sem nenhuma execucao com exitCode 0; gate fechado sobre nada');

  const semExit = execucoes.filter((e) => !('exitCode' in e));
  check('EV-04', semExit.length === 0,
    `execucao sem exitCode: ${semExit.map((e) => e.id).join(', ')} — exitCode e o unico campo que o runner promete`);

  const incoerentes = execucoes.filter((e) =>
    e.estado !== 'NAO_EXECUTADA' && e.estado !== (e.exitCode === 0 ? 'PASS' : 'FAIL'));
  check('EV-05', incoerentes.length === 0,
    `estado incoerente com exitCode: ${incoerentes.map((e) => `${e.id}(${e.estado}/${e.exitCode})`).join(', ')}`);

  const naoExecutadasSemMotivo = execucoes.filter((e) => e.estado === 'NAO_EXECUTADA' && !e.motivo);
  check('EV-06', naoExecutadasSemMotivo.length === 0,
    `NAO_EXECUTADA sem motivo registrado: ${naoExecutadasSemMotivo.map((e) => e.id).join(', ')}`);

  const naoExecutadasContadas = execucoes.filter((e) => e.estado === 'NAO_EXECUTADA' && e.exitCode === 0);
  check('EV-07', naoExecutadasContadas.length === 0,
    `suite NAO_EXECUTADA carregando exitCode 0 — limitacao de ambiente disfarcada de aprovacao: ${naoExecutadasContadas.map((e) => e.id).join(', ')}`);

  const artefatosRuins = artefatos.filter((a) => !a.caminho || !/^[0-9a-f]{64}$/.test(a.sha256 ?? ''));
  check('EV-08', artefatos.length > 0 && artefatosRuins.length === 0,
    artefatos.length === 0
      ? 'bundle sem artefato; evidencia precisa dizer SOBRE O QUE ela e'
      : `artefato sem caminho ou sha256 valido: ${artefatosRuins.map((a) => a.caminho).join(', ')}`);

  /* Rotulo de config, nunca valor. `DATABASE_URL: PRESENT` passa; a URL nao. */
  const rotulosRuins = Object.entries(bundle.ambiente?.config ?? {})
    .filter(([, v]) => !ROTULOS_DE_CONFIG.includes(v));
  check('EV-09', rotulosRuins.length === 0,
    `config com valor fora dos rotulos permitidos (${ROTULOS_DE_CONFIG.join('/')}): ${rotulosRuins.map(([k]) => k).join(', ')}`);

  const vazamentos = varrerSegredos(JSON.stringify(bundle), valoresSensiveis);
  check('EV-10', vazamentos.length === 0,
    `segredo no bundle — ${vazamentos.join('; ')}`);

  return { falhas, passou, vazamentos };
}

/** Monta o bundle a partir do estado observado e das execucoes fornecidas. */
export function montarBundle({ agora = null, execucoes = [], estadoRepo = observarRepositorio(), fechaGate = false } = {}) {
  const arquivos = [
    'tools/admai-delivery/snapshot.mjs',
    'tools/admai-delivery/write-scope.mjs',
    'tools/admai-delivery/test-orchestrator.mjs',
    'tools/admai-delivery/stale-check.mjs',
    'tools/admai-delivery/evidence-bundle.mjs',
    'tools/admai-delivery/run-state.mjs'
  ];

  const naoExecutadas = execucoes.filter((e) => e.estado === 'NAO_EXECUTADA');

  return {
    schema: 'admai.delivery.evidence-bundle/1',
    geradoEm: agora,
    wave: 'P0',
    feature: 'DELIVERY_HARNESS_BOOTSTRAP',
    fechaGate,

    artefatos: arquivos
      .filter((f) => existsSync(`${RAIZ}${f}`))
      .map((f) => ({ caminho: f, sha256: sha(`${RAIZ}${f}`) })),

    ambiente: {
      node: process.version,
      plataforma: process.platform,
      branch: estadoRepo.git.branch,
      head: estadoRepo.git.head,
      /* Rotulo, nunca valor. Este e o contrato do §18 do prompt de execucao. */
      config: {
        DATABASE_URL: process.env.DATABASE_URL ? 'PRESENT' : 'ABSENT'
      },
      databaseTarget: process.env.DATABASE_URL ? 'LOCAL' : 'NENHUM'
    },

    execucoes,

    afirmacoes: [
      { texto: `branch ${estadoRepo.git.branch} em ${String(estadoRepo.git.head).slice(0, 12)}`, provenance: 'OBSERVED' },
      { texto: `git diff --check limpo: ${estadoRepo.git.diffCheckLimpo}`, provenance: 'OBSERVED' },
      { texto: `${estadoRepo.prisma.modelos?.length ?? 0} modelos no schema Prisma`, provenance: 'OBSERVED' },
      { texto: `${estadoRepo.prisma.migrations?.length ?? 0} migrations no repositorio`, provenance: 'OBSERVED' },
      { texto: `${execucoes.filter((e) => e.estado === 'PASS').length} suites aprovadas por exitCode 0`, provenance: 'DERIVED' },
      ...(naoExecutadas.length
        ? [{ texto: `${naoExecutadas.length} suite(s) NAO_EXECUTADA — limitacao de ambiente, nao aprovacao`, provenance: 'OBSERVED' }]
        : [])
    ]
  };
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

/**
 * Resolve as execucoes que vao para o bundle. PURA nos argumentos — os controles a atravessam.
 *
 * O INCIDENTE QUE ISTO CORRIGE
 *   Rodei `evidence-bundle.mjs` sem `--execucoes` num loop final de verificacao. Ele sobrescreveu
 *   um bundle com cinco suites — incluindo `bot:integration PASS`, 19 minutos de execucao real —
 *   por um bundle vazio, imprimiu `EVIDENCE_BUNDLE_MONTADO` e saiu com 0. O gate pegou depois
 *   (`P0 = NOT_VERIFIED`), entao a rede funcionou; mas a ferramenta destruiu evidencia e chamou
 *   isso de sucesso.
 *
 *   Havia TRES caminhos para o mesmo estrago, e o `catch` vazio era o pior: ausencia de flag,
 *   caminho inexistente e JSON ilegivel — todos virando `[]` sem uma palavra.
 *
 * A REGRA
 *   Sem execucoes novas, PRESERVA as do bundle anterior. Com caminho declarado e ilegivel, RECUSA —
 *   ali houve intencao de fornecer evidencia, e falhar calado transformaria erro de digitacao em
 *   apagamento. Vazio so quando nao ha bundle anterior, e dito em voz alta.
 */
export function resolverExecucoes(argv = [], { destino = DESTINO } = {}) {
  const i = argv.indexOf('--execucoes');
  const caminho = i >= 0 ? argv[i + 1] : null;
  const vazio = (origem, erro = null) => ({ execucoes: [], origem, erro });

  if (caminho) {
    if (!existsSync(caminho)) return vazio('ARQUIVO', `--execucoes aponta para arquivo inexistente: ${caminho}`);
    let lido;
    try {
      lido = JSON.parse(readFileSync(caminho, 'utf8'));
    } catch (erro) {
      return vazio('ARQUIVO', `--execucoes ilegivel: ${erro.message}`);
    }
    if (!Array.isArray(lido)) return vazio('ARQUIVO', '--execucoes nao contem uma lista de execucoes');
    return { execucoes: lido, origem: 'ARQUIVO', erro: null };
  }

  if (existsSync(destino)) {
    try {
      const anterior = JSON.parse(readFileSync(destino, 'utf8'));
      if (Array.isArray(anterior.execucoes) && anterior.execucoes.length) {
        return { execucoes: anterior.execucoes, origem: 'BUNDLE_ANTERIOR', erro: null };
      }
    } catch { /* bundle anterior corrompido: segue vazio, e a saida declara isso */ }
  }
  return vazio('NENHUMA');
}

/**
 * Flags reconhecidas.  [F-MAR-069]
 *
 * Existe porque `--selftest` era ACEITO e IGNORADO: caia no caminho normal, que regenera e escreve
 * `EVIDENCE_BUNDLE.json`. Eu reportei "evidence-bundle selftest 6/6" varias vezes; o numero era real
 * (`EV-PRESERVA-01`), o modo nao existia, e cada "verificacao" reescrevia o artefato de producao.
 * Parametro aceito e nao aplicado e pior que recusado — o chamador acredita ter pedido algo.
 */
export const FLAGS = Object.freeze(['--fecha-gate', '--execucoes', '--verificar']);

export function executar(argv = []) {
  const desconhecidas = argv
    .filter((a) => a.startsWith('--'))
    .map((a) => a.split('=')[0])
    .filter((a) => !FLAGS.includes(a));
  if (desconhecidas.length) {
    console.log(`FLAG_DESCONHECIDA — ${desconhecidas.join(', ')}`);
    console.log(`  reconhecidas: ${FLAGS.join(', ')}`);
    console.log('  Recusar e deliberado: aceitar e ignorar faz o chamador crer que pediu outro modo.');
    return 2;
  }

  /* `--verificar` roda os controles e NAO escreve. Um instrumento que muta o artefato a cada
     observacao transforma toda conferencia de rotina numa escrita nao declarada — foi assim que
     este defeito apareceu, pego pelo proprio Write Set Gate. */
  const soVerificar = argv.includes('--verificar');
  const fechaGate = argv.includes('--fecha-gate');

  const resolvido = resolverExecucoes(argv, { destino: DESTINO });
  if (resolvido.erro) {
    console.log(`EVIDENCE_BUNDLE_RECUSADO — ${resolvido.erro}`);
    console.log('  Recusar e deliberado: sem isto, o bundle anterior seria sobrescrito por vazio.');
    return 1;
  }
  const execucoes = resolvido.execucoes;
  const origemDasExecucoes = resolvido.origem;

  const bundle = montarBundle({ agora: new Date().toISOString(), execucoes, fechaGate });
  const valores = coletarValoresSensiveis();
  const real = avaliarBundle({ bundle, valoresSensiveis: valores });

  /* Canario sintetico: um valor que NAO existe no ambiente, usado so para provar que a varredura
     por valor casa quando o segredo esta la. Sem ele, EV-10 poderia estar 'passando' por nunca ter
     tido alvo — passar por ausencia de alvo nao e passar. */
  const CANARIO = 'canario-sintetico-de-teste-nao-e-segredo-real-8f3a1c';
  const bundleOk = montarBundle({ agora: null, execucoes: [{ id: 'x', comando: 'npm test', estado: 'PASS', exitCode: 0 }] });
  const sabotagens = [
    ['EV-01', 'provenance invalida', { bundle: { ...bundleOk, afirmacoes: [{ texto: 'a', provenance: 'ACHO_QUE_SIM' }] } }],
    ['EV-02', 'gate fechado com INFERRED', { bundle: { ...bundleOk, fechaGate: true, afirmacoes: [{ texto: 'a', provenance: 'INFERRED' }] } }],
    ['EV-03', 'gate fechado sem execucao', { bundle: { ...bundleOk, fechaGate: true, execucoes: [] } }],
    ['EV-04', 'execucao sem exitCode', { bundle: { ...bundleOk, execucoes: [{ id: 'x', estado: 'PASS' }] } }],
    ['EV-05', 'PASS com exitCode 1', { bundle: { ...bundleOk, execucoes: [{ id: 'x', estado: 'PASS', exitCode: 1 }] } }],
    ['EV-06', 'NAO_EXECUTADA sem motivo', { bundle: { ...bundleOk, execucoes: [{ id: 'x', estado: 'NAO_EXECUTADA', exitCode: null }] } }],
    ['EV-07', 'NAO_EXECUTADA com exitCode 0', { bundle: { ...bundleOk, execucoes: [{ id: 'x', estado: 'NAO_EXECUTADA', motivo: 'sem banco', exitCode: 0 }] } }],
    ['EV-08', 'bundle sem artefato', { bundle: { ...bundleOk, artefatos: [] } }],
    ['EV-08', 'artefato com sha invalido', { bundle: { ...bundleOk, artefatos: [{ caminho: 'a.mjs', sha256: 'nao-e-sha' }] } }],
    ['EV-09', 'config com valor em vez de rotulo',
      { bundle: { ...bundleOk, ambiente: { ...bundleOk.ambiente, config: { DATABASE_URL: 'postgresql://u:p@h/db' } } } }],
    ['EV-10', 'valor de segredo no bundle (canario)',
      { bundle: { ...bundleOk, afirmacoes: [{ texto: `conectou em ${CANARIO}`, provenance: 'OBSERVED' }] },
        valoresSensiveis: [['DATABASE_URL', CANARIO]] }],
    ['EV-10', 'URL com credencial por padrao',
      { bundle: { ...bundleOk, afirmacoes: [{ texto: 'usei postgresql://admai:senha123@localhost:5432/db', provenance: 'OBSERVED' }] } }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , e]) => !avaliarBundle(e).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* EV-PRESERVA-01 — o incidente do bundle apagado.
     Estes controles atravessam a RESOLUCAO de execucoes de verdade, com arquivos sinteticos: um
     controle sobre objeto ja resolvido nao provaria nada sobre o caminho que causou o estrago. */
  /* [R25-04] Os dois temporarios moravam em `docs/eos-v2/`, dentro da lane observada. Entao
     `--verificar`, que eu anunciei como "nao escreve", escrevia dois arquivos — e sob perfil
     somente leitura falhava com EPERM. O provado era "nao reescreve EVIDENCE_BUNDLE.json", que e
     coisa menor que a frase publicada. Temporario de controle vai para o diretorio temporario do
     SO: fora da lane, nao observavel, e sem permissao de escrita na arvore do projeto. */
  const dirTmp = mkdtempSync(join(tmpdir(), 'ev-preserva-'));
  const tmp = join(dirTmp, 'exec.json');
  const anteriorComExec = join(dirTmp, 'anterior.json');
  const umaExecucao = [{ id: 'x', comando: 'c', estado: 'PASS', exitCode: 0 }];
  const casosPreserva = [];
  try {
    writeFileSync(tmp, JSON.stringify(umaExecucao));
    writeFileSync(anteriorComExec, JSON.stringify({ execucoes: umaExecucao }));

    const r = (argv, destino) => resolverExecucoes(argv, { destino });
    casosPreserva.push(['arquivo valido e lido', r(['--execucoes', tmp], anteriorComExec).origem === 'ARQUIVO']);
    casosPreserva.push(['caminho inexistente RECUSA em vez de esvaziar',
      r(['--execucoes', `${tmp}.nao-existe`], anteriorComExec).erro !== null]);
    /* O caso exato do incidente: sem flag, o que ja havia NAO pode sumir. */
    const semFlag = r([], anteriorComExec);
    casosPreserva.push(['sem --execucoes PRESERVA o bundle anterior',
      semFlag.origem === 'BUNDLE_ANTERIOR' && semFlag.execucoes.length === 1]);

    writeFileSync(tmp, '{ isto nao e json valido');
    casosPreserva.push(['JSON ilegivel RECUSA em vez de esvaziar',
      r(['--execucoes', tmp], anteriorComExec).erro !== null]);
    writeFileSync(tmp, JSON.stringify({ nao: 'e lista' }));
    casosPreserva.push(['payload que nao e lista RECUSA', r(['--execucoes', tmp], anteriorComExec).erro !== null]);
    /* Sem bundle anterior, vazio e legitimo — e precisa se declarar como tal. */
    casosPreserva.push(['sem anterior, vazio se declara NENHUMA',
      r([], `${anteriorComExec}.nao-existe`).origem === 'NENHUMA']);
  } catch (erro) {
    casosPreserva.push([`controle nao pode rodar: ${erro.message}`, false]);
  } finally {
    try { rmSync(dirTmp, { recursive: true, force: true }); } catch { /* nada a limpar */ }
  }
  const preservaFalhos = casosPreserva.filter(([, ok]) => !ok).map(([r]) => r);

  /* Controle positivo com as DUAS dimensoes que importam aqui:
     (a) um bundle valido e aceito;
     (b) mencionar o NOME `DATABASE_URL` com rotulo `PRESENT` continua sendo aceito — um scanner que
         reprovasse a palavra transformaria a regra de redacao em falso positivo. */
  const positivo = avaliarBundle({
    bundle: {
      ...bundleOk,
      ambiente: { ...bundleOk.ambiente, config: { DATABASE_URL: 'PRESENT' } },
      afirmacoes: [{ texto: 'DATABASE_URL: PRESENT — alvo LOCAL, valor nao registrado', provenance: 'OBSERVED' }]
    },
    valoresSensiveis: valores
  });

  /* Controle da VARREDURA, atravessando `varrerSegredos` de verdade (licao da R6-02: sabotar o
     objeto derivado nao prova a funcao que faz o trabalho). */
  const casosVarredura = [
    ['texto limpo', 'DATABASE_URL: PRESENT, alvo LOCAL', [], 0],
    ['valor presente', `conectado em ${CANARIO}`, [['DATABASE_URL', CANARIO]], 1],
    ['valor ausente', 'nada aqui', [['DATABASE_URL', CANARIO]], 0],
    ['url com credencial', 'postgres://u:senha@host:5432/db', [], 1],
    ['url sem credencial', 'https://exemplo.com/painel', [], 0],
    ['stripe vivo', 'sk_live_abcdefgh12345678', [], 1],
    ['stripe de teste', 'sk_test_abcdefgh12345678', [], 0],
    ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.assinatura', [], 1],
    ['pem', '-----BEGIN RSA PRIVATE KEY-----', [], 1],
    ['token github', 'ghp_ABCDEFGHIJKLMNOP1234', [], 1]
  ];
  const varreduraFalhos = casosVarredura
    .filter(([, texto, vals, esperado]) => varrerSegredos(texto, vals).length !== esperado)
    .map(([rotulo]) => rotulo);

  if (!soVerificar) {
    mkdirSync(dirname(DESTINO), { recursive: true });
    writeFileSync(DESTINO, `${JSON.stringify(bundle, null, 2)}\n`);
  }

  console.log('AdmAi Delivery — Evidence Bundle  [Wave P0]');
  console.log(`  destino    : ${soVerificar ? 'NAO ESCRITO (--verificar)' : DESTINO.replace(RAIZ, '')}`);
  console.log(`  execucoes  : ${bundle.execucoes.length} (origem: ${origemDasExecucoes})` +
    (origemDasExecucoes === 'NENHUMA' ? ' — bundle SEM execucao; nenhum gate de teste fecha assim' : ''));
  console.log(`  feature    : ${bundle.feature} (wave ${bundle.wave})`);
  console.log(`  fecha gate : ${bundle.fechaGate}`);
  console.log(`  artefatos  : ${bundle.artefatos.length}`);
  console.log(`  execucoes  : ${bundle.execucoes.length}`);
  for (const e of bundle.execucoes) {
    console.log(`    ${String(e.id).padEnd(18)} ${String(e.estado).padEnd(14)} exitCode=${e.exitCode}${e.motivo ? ` (${e.motivo})` : ''}`);
  }
  console.log(`  afirmacoes : ${bundle.afirmacoes.length} — ` +
    Object.entries(bundle.afirmacoes.reduce((a, x) => ({ ...a, [x.provenance]: (a[x.provenance] ?? 0) + 1 }), {}))
      .map(([k, v]) => `${k}:${v}`).join(' '));
  console.log(`  DATABASE_URL no ambiente : ${bundle.ambiente.config.DATABASE_URL} (alvo ${bundle.ambiente.databaseTarget})`);
  console.log(`  valores sensiveis com alvo real na varredura : ${valores.length}` +
    (valores.length === 0 ? ' — varredura por valor sem alvo neste processo' : ''));
  console.log(`  checagens PASS : ${real.passou.length}`);
  console.log(`  checagens FAIL : ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.falhas.length === 0 ? 'bundle valido aceito, e o NOME DATABASE_URL com rotulo PRESENT nao e tratado como vazamento' : `REJEITOU: ${positivo.falhas.join('; ')}`}`);
  console.log(`  EV-SCAN-01 (casos atravessando varrerSegredos) : ${casosVarredura.length - varreduraFalhos.length}/${casosVarredura.length}` +
    (varreduraFalhos.length ? ` — errou: ${varreduraFalhos.join(', ')}` : ''));

  console.log(`  EV-PRESERVA-01 (evidencia nao se apaga em silencio) : ${casosPreserva.length - preservaFalhos.length}/${casosPreserva.length}` +
    (preservaFalhos.length ? ` — errou: ${preservaFalhos.join('; ')}` : ''));

  const instrumentoIntegro = negFalhos.length === 0 && positivo.falhas.length === 0 &&
    varreduraFalhos.length === 0 && preservaFalhos.length === 0;
  if (!instrumentoIntegro) {
    console.log('  INSTRUMENTO_COMPROMETIDO — nao use este resultado como evidencia');
    return 2;
  }

  console.log('  EVIDENCE_BUNDLE_MONTADO');
  console.log('    provado: gate fechado exige execucao com exitCode 0; provenance fraca impede');
  console.log('      fechamento; NAO_EXECUTADA nao vira aprovacao; e a varredura casa quando o valor');
  console.log('      esta presente (canario) sem reprovar o NOME da variavel.');
  console.log('    NAO provado: ausencia de todo segredo. A camada de PADRAO e lista de negacao e');
  console.log('      por isso incompleta por construcao; a camada de VALOR so alcanca o que este');
  console.log('      processo enxerga. Segredo de formato desconhecido, invisivel a este processo,');
  console.log('      passaria — a classe honesta aqui e DETECTIVE, nao HARD_ENFORCED.');
  return real.falhas.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar(process.argv.slice(2)));
}
