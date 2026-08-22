/**
 * AdmAi Delivery Harness — orquestracao de testes.  [Wave P0]
 *
 * REGRA QUE ESTE MODULO IMPLEMENTA (secao 17)
 *   Nao pergunte a um modelo "os testes passaram?". Leia o exit code.
 *
 *   Parece obvio e nao e: a forma mais comum de um relatorio de entrega mentir e um agente ler a
 *   saida textual de um runner, ver muitos "ok" e concluir sucesso enquanto o processo terminou em
 *   1. `exitCode` e o unico campo que o runner promete; o resto e apresentacao.
 *
 * O QUE ESTE MODULO NAO FAZ
 *   Nao interpreta falha, nao adivinha causa, nao decide gate. Ele executa, mede e registra. A
 *   interpretacao vem depois, com o contrato na mao, e por quem tem autoridade para isso.
 *
 * PROVENANCE
 *   `exitCode`, `duracaoMs` e `saida` sao OBSERVED. `aprovado` e DERIVED de `exitCode === 0`.
 *   Nada aqui e INFERRED.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

/**
 * Suites conhecidas do repositorio. `cwd` relativo a raiz; `opcional` marca suite que pode nao
 * existir no ambiente (por exemplo, integracao que exige PostgreSQL) — ausencia dela e registrada
 * como NAO EXECUTADA, jamais como aprovada.
 */
export const SUITES = Object.freeze([
  { id: 'bot:unit', cwd: 'chaveiro-bot', comando: 'npm', args: ['test'], opcional: false },
  { id: 'painel:unit', cwd: 'chaveiro-painel', comando: 'npm', args: ['test'], opcional: false },
  { id: 'bot:lint', cwd: 'chaveiro-bot', comando: 'npm', args: ['run', 'lint'], opcional: true },
  { id: 'painel:lint', cwd: 'chaveiro-painel', comando: 'npm', args: ['run', 'lint'], opcional: true },
  {
    id: 'bot:integration',
    cwd: 'chaveiro-bot',
    comando: 'npm',
    args: ['run', 'test:integration'],
    opcional: true,
    /* Pre-condicao DECLARADA, verificada ANTES de executar.
       Na primeira execucao real deste harness a suite saiu como FAIL em 1,7s. A causa era
       `DATABASE_URL nao definido` — limitacao de ambiente, nao defeito de codigo. Reportar isso
       como FAIL faria um relatorio de entrega afirmar que a integracao esta quebrada quando ela
       nem rodou; reportar como PASS seria pior ainda.
       A checagem e da variavel, nao do texto de erro: heuristica sobre stderr classificaria uma
       falha real como ambiental na primeira vez que a mensagem mudasse. */
    precondicaoEnv: ['DATABASE_URL'],
    /* [INSTRUMENT_REPORTING_DEFECT] De onde a SUITE tira a variavel — `vitest.integration.config.js`
       carrega este arquivo com `dotenv` antes de tudo. Declarar isto e o que faz a pre-condicao
       olhar no mesmo lugar que a suite, em vez de exigir a variavel no processo do orquestrador. */
    envDeArquivo: '.env.test',
    /* Pre-condicao de SERVICO, distinta da de variavel.
       Descoberta em execucao real: com o Postgres no ar e `DATABASE_URL` definida, a suite ainda
       assim nao produzia resultado — 232 `ECONNREFUSED` na porta 6379. `REDIS_URL` tem default
       (`redis://localhost:6379` em src/config/env.js), entao a variavel NUNCA falta; o que falta e
       o servico. Uma pre-condicao so de variavel nao alcanca esse caso, e o orquestrador teria
       registrado FAIL para um Redis ausente — exatamente o erro de classificacao que este modulo
       existe para impedir. */
    precondicaoServico: [
      { nome: 'PostgreSQL', deUrl: 'DATABASE_URL', portaPadrao: 5432 },
      { nome: 'Redis', deUrl: 'REDIS_URL', padrao: 'redis://localhost:6379', portaPadrao: 6379 }
    ],
    exigeAmbiente: 'PostgreSQL com migrations aplicadas + Redis',
    /* MEDIDO, não estimado, e RE-MEDIDO quando a suite cresceu.
       Primeira medicao: 33 arquivos e 190 casos com `fileParallelism: false` e TRUNCATE entre
       casos levavam ~10min, e o padrao de 600s cortava a suite no fim, devolvendo `NAO_EXECUTADA`
       por ETIMEDOUT — falso negativo de causa diferente da pre-condicao. Dai 1.200.000ms.
       Segunda medicao: a suite passou a 40 arquivos e 270 casos. Corridas isoladas levaram 878s,
       964s e 1023s, e sob o orquestrador a de 1.200.000ms estourou — o mesmo falso negativo
       voltando pela mesma porta, so que agora com 42% mais casos disputando a mesma margem.
       Um numero declarado como "medido" precisa ser re-medido quando o que ele mede muda; deixar
       o valor velho seria manter uma medicao que ja nao descreve nada. O limite abaixo da ~2,3x
       sobre a pior corrida observada. NAO e afrouxar limite para fazer teste passar: a suite passa
       em 878s; o que falhava era a captura da evidencia dela.
       Declarado aqui em vez de aumentar o padrao global: suite unitaria travada por 40min seria
       espera cara, e o numero pertence a esta suite. */
    timeoutMs: 2_400_000,
    /* LIMITE DECLARADO, medido na pratica: quando o timeout do `spawnSync` dispara com
       `shell: true`, o Windows encerra o `cmd.exe` e NAO a arvore — o vitest continua rodando e
       vira orfao. E o mesmo padrao do incidente dos quatro runners, por outra porta. O guarda de
       exclusividade PEGA isso na execucao seguinte (foi como apareceu), mas nao impede que
       aconteca, e a limpeza da arvore continua manual. Classe honesta: DETECTIVE, nao preventivo. */
    /* Suite DESTRUTIVA: `prisma migrate deploy` e TRUNCATE entre casos. Duas execucoes sobre o
       mesmo banco corrompem uma a outra. Ver o bloco de TRIAGEM acima. */
    exigeExclusividade: true
  }
]);

/**
 * TRIAGEM DE FALHA DE TESTE — a regra que este bloco existe para impor.
 *
 * INCIDENTE QUE A ORIGINOU (registrado como INTEGRACAO-FALHAS-ERAM-DO-INSTRUMENTO)
 *   A suite de integracao apareceu reprovando em RBAC, multi-tenant e escalacao de privilegio.
 *   A leitura natural era defeito de seguranca do produto. Era corrida entre QUATRO execucoes
 *   orfas minhas dando TRUNCATE simultaneo no mesmo banco: `TaskStop` encerrava o wrapper do
 *   shell e nao a arvore de processos. Numa execucao limpa, exitCode 0.
 *
 *   O detalhe que torna isto perigoso: falha de instrumento IMITA defeito de produto com
 *   fidelidade alta, e imitou exatamente onde um leitor procuraria defeito real.
 *   `fileParallelism: false` isola arquivos DENTRO de uma execucao; nao protege contra outra.
 *
 * ANTES de classificar qualquer falha como PRODUCT_FAILURE, checar nesta ordem:
 *   1. runner terminou de verdade?          5. conexoes/locks do banco
 *   2. arvore de processos encerrada?        6. dependencias externas no ar?
 *   3. processo orfao de execucao anterior?  7. so entao classificar
 *   4. execucao concorrente externa?
 *
 * Classes: PRODUCT_FAILURE · TEST_FAILURE · ENVIRONMENT_FAILURE · INSTRUMENT_FAILURE · UNKNOWN
 * Os passos 3, 4 e 5 sao automatizados abaixo — fato deterministico nao vai para julgamento.
 */
export const CLASSES_DE_FALHA = Object.freeze([
  'PRODUCT_FAILURE', 'TEST_FAILURE', 'ENVIRONMENT_FAILURE', 'INSTRUMENT_FAILURE', 'UNKNOWN'
]);

/* ------------------------------------------------------------------ *
 * Resolucao de variavel de ambiente — INSTRUMENT_REPORTING_DEFECT
 * ------------------------------------------------------------------ */

export const ORIGENS_DE_ENV = Object.freeze(['PROCESS_ENV', 'ARQUIVO_DE_SUITE', 'AUSENTE']);

/**
 * De onde a suite REALMENTE tira a variavel.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *   A pre-condicao lia `process.env` DESTE processo. A suite de integracao le `.env.test` pelo
 *   `dotenv`, dentro do processo do vitest (`vitest.integration.config.js`). Os dois lugares nunca
 *   foram o mesmo, entao o orquestrador exigia da suite uma condicao que ela nunca precisou
 *   satisfazer: media 27/27 executando de verdade e registrava `NAO_EXECUTADA`.
 *
 *   A classe importa. Nao era teste quebrado nem ambiente ausente — era o RELATOR errando sobre a
 *   propria execucao. Corrigir o resultado a mao teria escondido isso; o que se corrige e a
 *   DETECCAO.
 *
 * SEGREDO
 *   Devolve `presente` e `origem`. NUNCA o valor. Quem precisa do valor — so a derivacao de
 *   host/porta — chama `lerValorDeEnv`, que existe separada justamente para que o caminho do valor
 *   seja curto, visivel e facil de auditar.
 *
 * Parser minimo de `KEY=VALUE`: sem dependencia nova, e o harness nao tem manifest proprio.
 * Comentario e linha vazia sao ignorados; aspas ao redor do valor sao removidas.
 */
export function lerArquivoDeEnv(caminho) {
  if (!caminho || !existsSync(caminho)) return null;
  const fora = {};
  for (const linha of readFileSync(caminho, 'utf8').split(/\r?\n/)) {
    const t = linha.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const nome = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    fora[nome] = valor;
  }
  return fora;
}

/** Valor cru. Uso restrito: derivar host/porta. Nunca serializar o retorno. */
export function lerValorDeEnv(nome, { dir = null, arquivo = null, env = process.env } = {}) {
  if (env[nome]) return env[nome];
  const doArquivo = arquivo && dir ? lerArquivoDeEnv(`${dir}/${arquivo}`) : null;
  return doArquivo?.[nome] ?? null;
}

/** Presenca e ORIGEM, sem valor. E isto que vai para o registro e para a evidencia. */
export function resolverEnv(nome, { dir = null, arquivo = null, env = process.env } = {}) {
  if (env[nome]) return { nome, presente: true, origem: 'PROCESS_ENV' };
  const doArquivo = arquivo && dir ? lerArquivoDeEnv(`${dir}/${arquivo}`) : null;
  if (doArquivo?.[nome]) return { nome, presente: true, origem: 'ARQUIVO_DE_SUITE', arquivo };
  return { nome, presente: false, origem: 'AUSENTE' };
}

/**
 * Conta execucoes concorrentes do runner de integracao, EXCLUINDO a arvore deste processo.
 *
 * Ownership importa: matar processo de outra sessao seria pior que o defeito original. Aqui so se
 * CONTA e se RECUSA a executar — nunca se mata processo alheio.
 */
export function contarRunnersConcorrentes({ padrao = 'test:integration', meuPid = process.pid } = {}) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='npm.cmd'" | ` +
    `Where-Object { $_.CommandLine -like '*${padrao}*' } | ` +
    `Select-Object -ExpandProperty ProcessId`
  ], { encoding: 'utf8', timeout: 15_000 });

  if (r.status !== 0 || r.error) return { total: null, pids: null, motivo: 'nao foi possivel enumerar processos' };

  const pids = String(r.stdout ?? '').split('\n').map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 0);
  const alheios = pids.filter((p) => p !== meuPid);
  return { total: alheios.length, pids: alheios, motivo: null };
}

/**
 * Avalia a pre-condicao de exclusividade. PURA — os controles atravessam este caminho.
 *
 * `total === null` (enumeracao indisponivel) NAO libera: incerteza sobre concorrencia numa suite
 * destrutiva e motivo para nao executar, nao para presumir que esta livre.
 */
export function avaliarExclusividade({ total, motivo }) {
  if (total === null) {
    return { pode: false, motivo: `impossivel verificar execucao concorrente (${motivo ?? 'sem detalhe'}); suite destrutiva nao roda sob incerteza` };
  }
  if (total > 0) {
    return { pode: false, motivo: `${total} execucao(oes) concorrente(s) do runner de integracao detectada(s); TRUNCATE simultaneo no mesmo banco produz falhas que imitam defeito de produto` };
  }
  return { pode: true, motivo: null };
}

/**
 * O servico esta aceitando conexao? Sincrono de proposito: o avaliador do orquestrador nao e
 * assincrono, e um probe de TCP em subprocesso mantem o resultado determinista e legivel por
 * exitCode — o mesmo criterio que o resto do modulo aplica.
 *
 * Devolve `true`/`false`, nunca lanca. Nao imprime a URL: so host e porta chegam ate aqui.
 */
export function servicoAlcancavel(host, porta, timeoutMs = 2000) {
  const script =
    `const net=require('net');const s=net.connect(${Number(porta)},${JSON.stringify(String(host))});` +
    `s.setTimeout(${Number(timeoutMs)});` +
    `s.on('connect',()=>{s.destroy();process.exit(0)});` +
    `s.on('timeout',()=>{s.destroy();process.exit(1)});` +
    `s.on('error',()=>process.exit(1));`;
  const r = spawnSync(process.execPath, ['-e', script], { timeout: timeoutMs + 3000, encoding: 'utf8' });
  return r.status === 0;
}

/** Extrai host e porta de uma URL de servico. Devolve `null` quando a URL nao e parseavel. */
export function hostEPorta(url, portaPadrao) {
  try {
    const u = new URL(url);
    return { host: u.hostname, porta: u.port ? Number(u.port) : portaPadrao };
  } catch {
    return null;
  }
}

/**
 * Executa uma suite e devolve o resultado observado.
 * Nunca lanca: falha de spawn tambem e um fato a registrar.
 */
export function executarSuite(suite, { raiz = RAIZ, timeoutMs = 600_000 } = {}) {
  const dir = `${raiz}${suite.cwd}`;

  if (!existsSync(`${dir}/package.json`)) {
    return { id: suite.id, estado: 'NAO_EXECUTADA', motivo: `modulo ausente: ${suite.cwd}`, exitCode: null };
  }
  if (!existsSync(`${dir}/node_modules`)) {
    return {
      id: suite.id,
      estado: 'NAO_EXECUTADA',
      motivo: `dependencias nao instaladas em ${suite.cwd}; instalar exige autorizacao explicita`,
      exitCode: null
    };
  }

  /* Resolve como a SUITE resolve: processo primeiro, depois o arquivo que ela declara carregar. */
  const ondeEnv = { dir, arquivo: suite.envDeArquivo ?? null };
  const resolvidas = (suite.precondicaoEnv ?? []).map((v) => resolverEnv(v, ondeEnv));
  const faltando = resolvidas.filter((r) => !r.presente).map((r) => r.nome);
  if (faltando.length) {
    return {
      id: suite.id,
      estado: 'NAO_EXECUTADA',
      motivo: `pre-condicao de ambiente ausente: ${faltando.join(', ')} (${suite.exigeAmbiente ?? 'ver documentacao da suite'})`,
      exitCode: null,
      /* ORIGEM, nunca valor. */
      origemDoAmbiente: resolvidas.map((r) => `${r.nome}=${r.origem}`)
    };
  }

  /* Exclusividade, so para suite destrutiva. As unitarias nao tocam banco compartilhado. */
  if (suite.exigeExclusividade) {
    const ex = avaliarExclusividade(contarRunnersConcorrentes());
    if (!ex.pode) {
      return { id: suite.id, estado: 'NAO_EXECUTADA', motivo: ex.motivo, exitCode: null };
    }
  }

  const foraDoAr = [];
  for (const svc of suite.precondicaoServico ?? []) {
    /* Mesma resolucao da variavel; caminho do VALOR isolado aqui, so para derivar host/porta. */
    const url = lerValorDeEnv(svc.deUrl, ondeEnv) ?? svc.padrao;
    const alvo = url ? hostEPorta(url, svc.portaPadrao) : null;
    if (!alvo) { foraDoAr.push(`${svc.nome} (URL ausente ou ilegivel)`); continue; }
    if (!servicoAlcancavel(alvo.host, alvo.porta)) foraDoAr.push(`${svc.nome} em ${alvo.host}:${alvo.porta}`);
  }
  if (foraDoAr.length) {
    return {
      id: suite.id,
      estado: 'NAO_EXECUTADA',
      motivo: `servico exigido fora do ar: ${foraDoAr.join('; ')} (${suite.exigeAmbiente ?? 'ver documentacao da suite'})`,
      exitCode: null
    };
  }

  const inicio = Date.now();
  const r = spawnSync(suite.comando, suite.args, {
    /* A suite pode declarar o proprio limite; o argumento e so o padrao de quem nao declara. */
    cwd: dir, encoding: 'utf8', shell: true, timeout: suite.timeoutMs ?? timeoutMs
  });
  return classificarSpawn(suite.id, r, Date.now() - inicio);
}

/**
 * Traduz o resultado de um spawn no registro da suite. PURA — e por isso as tres transicoes que o
 * relatorio promete podem ser PROVADAS com resultado fabricado, sem derrubar banco de verdade.
 *
 * As tres, e nenhuma outra:
 *   nao executou   -> NAO_EXECUTADA, exitCode null, motivo obrigatorio
 *   executou e OK  -> PASS, exitCode 0
 *   executou e nao -> FAIL, exitCode != 0
 *
 * `estado` NUNCA vem do texto da saida. `exitCode` e a unica coisa que o runner promete.
 */
export function classificarSpawn(id, r, duracaoMs = null) {
  if (r?.error) {
    return { id, estado: 'NAO_EXECUTADA', motivo: `falha ao executar: ${r.error.message}`, exitCode: null, duracaoMs };
  }
  /* Timeout do `spawnSync` chega como `status: null` com `signal` preenchido: nao executou ate o
     fim, entao nao ha exitCode a reportar — e chamar isso de FAIL afirmaria um resultado que o
     runner nao deu. */
  if (r?.status === null || r?.status === undefined) {
    return {
      id, estado: 'NAO_EXECUTADA', exitCode: null, duracaoMs,
      motivo: `runner encerrado sem exit code${r?.signal ? ` (sinal ${r.signal})` : ''}`
    };
  }
  return {
    id,
    estado: r.status === 0 ? 'PASS' : 'FAIL',
    exitCode: r.status,
    duracaoMs,
    saidaFinal: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-4).join('\n')
  };
}

/**
 * Avalia um conjunto de resultados contra o que a feature declarou exigir.
 *
 * PURA em relacao aos argumentos: os controles negativos passam por aqui com resultados fabricados.
 */
export function avaliarResultados({ resultados, exigidas }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  const porId = new Map(resultados.map((r) => [r.id, r]));

  for (const id of exigidas) {
    const r = porId.get(id);
    check(`TEST-01/${id}`, r != null, `suite exigida '${id}' nao consta nos resultados`);
    if (!r) continue;

    /* NAO_EXECUTADA nunca equivale a aprovada. E a regra que o repositorio ja aplica no lado EOS
       ("limitacao ambiental nunca equivale a teste aprovado") e que aqui vale igual. */
    check(`TEST-02/${id}`, r.estado !== 'NAO_EXECUTADA',
      `suite exigida '${id}' nao foi executada (${r.motivo ?? 'sem motivo registrado'}); isso NAO conta como aprovacao`);

    if (r.estado === 'NAO_EXECUTADA') continue;

    /* A checagem que da nome ao modulo: aprovado e exitCode zero, nao texto de saida. */
    check(`TEST-03/${id}`, r.exitCode === 0,
      `suite '${id}' terminou com exitCode ${r.exitCode}`);
    check(`TEST-04/${id}`, r.estado === (r.exitCode === 0 ? 'PASS' : 'FAIL'),
      `estado '${r.estado}' incoerente com exitCode ${r.exitCode} — resultado adulterado ou mal construido`);
  }

  return { falhas, passou };
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

export function executar(exigidasArg, { json = null } = {}) {
  const exigidas = exigidasArg ?? ['bot:unit', 'painel:unit'];
  const resultados = SUITES.map((s) => executarSuite(s));
  const real = avaliarResultados({ resultados, exigidas });

  /* Controles negativos. O terceiro e o mais importante: um resultado que DIZ PASS mas carrega
     exitCode diferente de zero precisa reprovar, senao o orquestrador confia na narrativa do
     runner em vez do contrato do processo. */
  const base = [{ id: 'x', estado: 'PASS', exitCode: 0, duracaoMs: 1 }];
  const sabotagens = [
    ['TEST-01', 'suite exigida ausente', { resultados: [], exigidas: ['x'] }],
    ['TEST-02', 'nao executada tratada como aprovada',
      { resultados: [{ id: 'x', estado: 'NAO_EXECUTADA', motivo: 'sem ambiente', exitCode: null }], exigidas: ['x'] }],
    ['TEST-03', 'exitCode diferente de zero',
      { resultados: [{ id: 'x', estado: 'FAIL', exitCode: 1, duracaoMs: 1 }], exigidas: ['x'] }],
    ['TEST-04', 'estado PASS com exitCode 1',
      { resultados: [{ id: 'x', estado: 'PASS', exitCode: 1, duracaoMs: 1 }], exigidas: ['x'] }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , e]) => !avaliarResultados(e).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: resultado valido precisa ser aceito. */
  const positivo = avaliarResultados({ resultados: base, exigidas: ['x'] });

  /* REGRESSAO DETERMINISTICA do incidente. Atravessa `avaliarExclusividade`, nao um objeto ja
     derivado — a licao da R6-02 do lado EOS. As duas direcoes importam: concorrencia e incerteza
     precisam BLOQUEAR, e ausencia de concorrencia precisa LIBERAR, senao a suite nunca roda. */
  const casosExclusividade = [
    ['4 orfaos (o incidente real)', { total: 4, motivo: null }, false],
    ['1 concorrente', { total: 1, motivo: null }, false],
    ['enumeracao indisponivel', { total: null, motivo: 'sem powershell' }, false],
    ['nenhum concorrente', { total: 0, motivo: null }, true]
  ];
  const exclFalhos = casosExclusividade
    .filter(([, entrada, esperado]) => avaliarExclusividade(entrada).pode !== esperado)
    .map(([rotulo]) => rotulo);

  /* ---------------- TEST-ENV-01 — regressao do INSTRUMENT_REPORTING_DEFECT ----------------
     A suite de integracao rodava 27/27 e era registrada como NAO_EXECUTADA porque a pre-condicao
     lia `process.env` DESTE processo, enquanto a suite le `.env.test` pelo dotenv. Estes controles
     travessam `resolverEnv` de verdade — sabotar objeto ja derivado nao provaria nada (R6-02). */
  const DIR_FIXTURE = `${RAIZ}chaveiro-bot`;
  const casosEnv = [
    ['variavel no processo -> PROCESS_ENV',
      resolverEnv('X_FAKE', { env: { X_FAKE: 'v' } }).origem === 'PROCESS_ENV'],
    ['variavel so no arquivo da suite -> ARQUIVO_DE_SUITE (o falso negativo de ontem)',
      resolverEnv('DATABASE_URL', { dir: DIR_FIXTURE, arquivo: '.env.test', env: {} }).origem === 'ARQUIVO_DE_SUITE'],
    ['ausente nos dois -> AUSENTE',
      resolverEnv('NAO_EXISTE_EM_LUGAR_NENHUM', { dir: DIR_FIXTURE, arquivo: '.env.test', env: {} }).origem === 'AUSENTE'],
    ['arquivo nao declarado nao inventa presenca',
      resolverEnv('DATABASE_URL', { dir: DIR_FIXTURE, arquivo: null, env: {} }).presente === false],
    ['processo VENCE o arquivo — a suite tambem resolve nessa ordem',
      resolverEnv('DATABASE_URL', { dir: DIR_FIXTURE, arquivo: '.env.test', env: { DATABASE_URL: 'v' } }).origem === 'PROCESS_ENV'],
    /* SEGREDO: o registro carrega presenca e origem, nunca o valor. */
    ['resolverEnv nao devolve valor',
      !('valor' in resolverEnv('DATABASE_URL', { dir: DIR_FIXTURE, arquivo: '.env.test', env: {} }))],
    ['serializado da resolucao nao contem credencial', (() => {
      const r = JSON.stringify(resolverEnv('DATABASE_URL', { dir: DIR_FIXTURE, arquivo: '.env.test', env: {} }));
      return !/:\/\/[^\s:/@]+:[^\s:/@]+@/.test(r);
    })()],
    ['comentario e linha vazia nao viram variavel',
      lerArquivoDeEnv(`${DIR_FIXTURE}/.env.test`) !== null &&
      !Object.keys(lerArquivoDeEnv(`${DIR_FIXTURE}/.env.test`)).some((k) => k.startsWith('#') || k === '')]
  ];
  const envFalhos = casosEnv.filter(([, ok]) => !ok).map(([r]) => r);

  /* ---------------- TEST-ENV-02 — as tres transicoes que o relatorio promete ----------------
     Sobre resultado de spawn FABRICADO: provar isto derrubando banco de verdade seria caro e
     destrutivo, e a funcao e pura exatamente para nao precisar disso. */
  const casosTransicao = [
    ['executou e passou -> PASS + exitCode 0', (() => {
      const r = classificarSpawn('x', { status: 0, stdout: 'ok', stderr: '' }, 10);
      return r.estado === 'PASS' && r.exitCode === 0;
    })()],
    ['executou e falhou -> FAIL + exitCode != 0', (() => {
      const r = classificarSpawn('x', { status: 1, stdout: '', stderr: 'boom' }, 10);
      return r.estado === 'FAIL' && r.exitCode === 1;
    })()],
    ['nao executou -> NAO_EXECUTADA + exitCode null + motivo', (() => {
      const r = classificarSpawn('x', { error: new Error('ENOENT') }, 10);
      return r.estado === 'NAO_EXECUTADA' && r.exitCode === null && typeof r.motivo === 'string' && r.motivo !== '';
    })()],
    ['encerrado sem exit code nao vira FAIL', (() => {
      const r = classificarSpawn('x', { status: null, signal: 'SIGTERM' }, 10);
      return r.estado === 'NAO_EXECUTADA' && r.exitCode === null;
    })()],
    ['saida textual NAO decide estado — so o exit code', (() => {
      const r = classificarSpawn('x', { status: 1, stdout: 'Tests  27 passed (27)', stderr: '' }, 10);
      return r.estado === 'FAIL';
    })()]
  ];
  const transicaoFalhos = casosTransicao.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('AdmAi Delivery — orquestracao de testes  [Wave P0]');
  for (const r of resultados) {
    const detalhe = r.estado === 'NAO_EXECUTADA' ? r.motivo : `exitCode=${r.exitCode} ${r.duracaoMs}ms`;
    console.log(`  ${r.id.padEnd(18)} ${r.estado.padEnd(14)} ${detalhe}`);
  }
  console.log(`  suites exigidas : ${exigidas.join(', ')}`);
  console.log(`  checagens PASS  : ${real.passou.length}`);
  console.log(`  checagens FAIL  : ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.falhas.length === 0 ? 'resultado valido aceito' : `REJEITOU: ${positivo.falhas.join('; ')}`}`);

  console.log(`  TEST-EXCL-01 (regressao do incidente de execucao orfa) : ${casosExclusividade.length - exclFalhos.length}/${casosExclusividade.length}` +
    (exclFalhos.length ? ` — errou: ${exclFalhos.join(', ')}` : ''));

  console.log(`  TEST-ENV-01 (regressao do relator que dizia NAO_EXECUTADA rodando) : ${casosEnv.length - envFalhos.length}/${casosEnv.length}` +
    (envFalhos.length ? ` — errou: ${envFalhos.join('; ')}` : ''));
  console.log(`  TEST-ENV-02 (as tres transicoes de estado) : ${casosTransicao.length - transicaoFalhos.length}/${casosTransicao.length}` +
    (transicaoFalhos.length ? ` — errou: ${transicaoFalhos.join('; ')}` : ''));

  const instrumentoIntegro = negFalhos.length === 0 && positivo.falhas.length === 0 &&
    exclFalhos.length === 0 && envFalhos.length === 0 && transicaoFalhos.length === 0;
  if (!instrumentoIntegro) {
    console.log('  INSTRUMENTO_COMPROMETIDO — nao use este resultado como evidencia');
    return 2;
  }

  /* Resultados em JSON para o Evidence Bundle. Gravados DEPOIS da checagem de integridade do
     instrumento: um resultado produzido por orquestrador comprometido nao deve virar arquivo que
     outra ferramenta consome como se fosse evidencia. */
  if (json) {
    writeFileSync(json, `${JSON.stringify(resultados, null, 2)}\n`);
    console.log(`  resultados gravados : ${json}`);
  }

  return real.falhas.length === 0 ? 0 : 1;
}

/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Escreve o JSON de resultados quando `--json <caminho>` e dado. Condicional ainda e MUTATING: declarar READ_ONLY porque o caminho comum nao escreve seria a mesma sobreafirmacao que o MAR-INV-025 proibe. */
export const MODO_DE_ACESSO = 'MUTATING';

/** [H-01.3] Derivado da fonte, nao de lista literal a manter em paralelo. */
export const FLAGS = flagsDoModulo(import.meta.url);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const recusa = recusarDesconhecida(argv, FLAGS);
  if (recusa !== null) process.exit(recusa);
  const i = argv.indexOf('--json');
  const json = i >= 0 ? argv[i + 1] : null;
  const exigidas = argv.filter((a, k) => a !== '--json' && k !== i + 1);
  process.exit(executar(exigidas.length ? exigidas : undefined, { json }));
}
