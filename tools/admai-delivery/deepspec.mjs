/**
 * EOS DeepSpec — MVP.  [Wave P0 → P1]
 *
 * O QUE ESTE MÓDULO DECIDE
 *   Se uma Feature está especificada o bastante para ser implementada com segurança — e, quando
 *   não está, exatamente qual incerteza falta resolver e de quem é a resposta.
 *
 * AS DUAS FALHAS SIMÉTRICAS QUE ELE EXISTE PARA EVITAR
 *
 *     UNDER_SPECIFICATION   implementar sobre ambiguidade material e descobrir tarde
 *     ANALYSIS_PARALYSIS    aprofundar indefinidamente porque sempre resta uma pergunta imaginável
 *
 *   `SWEET_SPOT_REACHED` é o ponto entre as duas: nenhuma ambiguidade material impede implementar
 *   de forma segura e verificável, E aprofundar mais tem retorno marginal menor que implementar e
 *   observar. Não significa "não existe pergunta imaginável" — esse critério nunca fecha.
 *
 * REUSO OBRIGATÓRIO — o discovery grande é INPUT, não trabalho a refazer
 *   `docs/functionality-discovery/` tem 24 questões rastreadas com dono, origem e bloqueio. Antes
 *   de abrir qualquer pergunta nova, o conhecimento existente é classificado como
 *   `STILL_VALID / STALE / SUPERSEDED / CONFLICTING / UNKNOWN`. Só se aprofunda o que permanece
 *   materialmente indefinido E bloqueia a feature em execução.
 *
 * PRIORIZAÇÃO
 *   `UNCERTAINTY × IMPACT × IRREVERSIBILITY × CROSS_MODULE`. Multiplicativo de propósito: um fator
 *   zero zera o produto — incerteza sem impacto não merece rodada de aprofundamento, e impacto sem
 *   incerteza também não. Uma soma deixaria os dois casos com nota média e desperdiçaria rodada.
 *
 * PROVENANCE
 *   As classificações de reuso são DECLARED (vêm de leitura humana do discovery, registradas aqui).
 *   Os vereditos são DERIVED. Nada é INFERRED.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

export const FAST_MODE = true;

/** Estados da máquina. A ordem importa: é o caminho, não um conjunto. */
export const ESTADOS = Object.freeze([
  'RAW_INTENT', 'CONTEXT_GATHERED', 'AMBIGUITY_MAPPED', 'DEEPENED',
  'SWEET_SPOT_REACHED', 'IMPLEMENTABLE'
]);

export const VEREDITOS = Object.freeze([
  'SWEET_SPOT_REACHED', 'DEEPENING_REQUIRED', 'USER_DECISION_REQUIRED', 'SPEC_CONFLICT'
]);

export const CLASSES_DE_REUSO = Object.freeze([
  'STILL_VALID', 'STALE', 'SUPERSEDED', 'CONFLICTING', 'UNKNOWN'
]);

/** Donos possíveis de uma resposta. Só `USUARIO` justifica `USER_DECISION_REQUIRED`. */
export const DONOS = Object.freeze(['USUARIO', 'INVESTIGACAO', 'PESQUISA_EXTERNA', 'PROFISSIONAL']);

/**
 * Classificação do discovery existente. DECLARED — cada linha cita o motivo, para que a próxima
 * retomada possa contestar a classificação em vez de herdá-la sem exame.
 */
export const REUSO_DO_DISCOVERY = Object.freeze([
  { id: 'Q-023', tema: 'planos, assinatura, trial, cobrança', classe: 'SUPERSEDED',
    motivo: 'decisão de produto ADMAI_FREE_MODE=TRUE responde a pergunta que estava [ADIADO]' },
  { id: 'Q-013', tema: 'papéis além dos três', classe: 'SUPERSEDED',
    motivo: 'dono/gestor/funcionario congelados; papel `tecnico` proibido' },
  { id: 'Q-003', tema: 'WhatsApp entra no escopo?', classe: 'SUPERSEDED',
    motivo: 'trazido ao backlog com pré-requisito de segurança' },
  { id: 'Q-024', tema: 'relatórios', classe: 'SUPERSEDED',
    motivo: 'substituído por Metric Intelligence; formato e exportação seguem abertos' },
  { id: 'Q-006', tema: 'staging obrigatório antes de produção', classe: 'STILL_VALID',
    motivo: 'coincide com a cadeia local → staging → produção' },
  { id: 'Q-010', tema: 'RPO e backup', classe: 'STILL_VALID',
    motivo: 'Supabase Free sem backup e sem PITR, confirmado no painel; crítico para promoção' },
  { id: 'Q-021', tema: 'frescor de indicadores', classe: 'STILL_VALID',
    motivo: 'alimenta data confidence da Metric Foundation' },
  { id: 'Q-004', tema: 'retenção de selfie e geolocalização', classe: 'STILL_VALID',
    motivo: 'exige reobservação antes de mexer' },
  { id: 'Q-002', tema: 'flags ligadas em produção', classe: 'UNKNOWN',
    motivo: 'não verificável pelo repositório; depende de observar o ambiente real' },
  { id: 'Q-014', tema: 'multiunidade', classe: 'STILL_VALID',
    motivo: 'afeta a modelagem de toda entidade nova das waves P2/P3' }
]);

/**
 * Incertezas por feature. Uma incerteza é MATERIAL quando `bloqueiaImplementacaoSegura` é
 * verdadeiro — e só as materiais impedem o Sweet Spot. As demais são registradas e não travam.
 */
export const INCERTEZAS = Object.freeze({
  BILLING_ACCESS_AUDIT: [
    { id: 'BA-1', pergunta: 'Existe gate comercial bloqueando rota de produto?',
      dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: false,
      resolucao: 'teste dirigido escrito: billing_access_audit.test.js. Investigação resolve, e é justamente a entrega desta feature',
      uncertainty: 5, impact: 4, irreversibility: 1, crossModule: 3 }
  ],
  PRODUCT_INTEGRITY: [
    { id: 'PI-1', pergunta: 'Os negativos cross-tenant cobrem todas as rotas com escopo de empresa?',
      dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: false,
      resolucao: 'enumerável por script sobre as rotas existentes',
      uncertainty: 3, impact: 5, irreversibility: 2, crossModule: 5 }
  ],
  METRIC_FOUNDATION: [
    { id: 'MF-1', pergunta: 'Quais eventos e estados precisam ser preservados para medir conversão, drop-off e ciclo de vida?',
      dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: false,
      /* RESOLVIDA. O registro respondeu: `conversao-funil` exige HISTÓRICO DE TRANSIÇÃO de estágio,
         não o estado atual — e é exatamente isso que se perde quando se constrói o CRM primeiro e
         se instrumenta depois. Registrado antes de o modelo existir, que era o ponto da ordem. */
      resolucao: 'RESOLVIDA por chaveiro-bot/src/services/metricas/registro.js: 12 métricas com timeSemantics declarado; 8 AVAILABLE_NOW, 4 nomeando o modelo que falta',
      uncertainty: 4, impact: 5, irreversibility: 4, crossModule: 5 },
    { id: 'MF-3', pergunta: 'Permissão de agregado implica permissão de drilldown?',
      dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: false,
      resolucao: 'RESOLVIDA por evidência no produto: `requirePermissao(dashboard,ver)` para agregado e `podeProprio(user,ver_metricas)` para self-scope já são checagens distintas. O contrato formaliza e MET-05 reprova drilldown mais permissivo que agregado',
      uncertainty: 3, impact: 5, irreversibility: 3, crossModule: 4 },
    { id: 'MF-2', pergunta: 'Qual o frescor aceitável de cada indicador (Q-021)?',
      dono: 'USUARIO', bloqueiaImplementacaoSegura: false,
      resolucao: 'afeta apresentação e data confidence, não a captura. Capturar cedo e decidir frescor depois é reversível; o contrário não',
      uncertainty: 4, impact: 3, irreversibility: 1, crossModule: 2 }
  ],
  CLIENTES: [
    { id: 'CL-1', pergunta: 'O que fazer com o histórico: todo Servico tem clienteNome em texto solto e nenhum Cliente',
      dono: 'USUARIO', bloqueiaImplementacaoSegura: true,
      resolucao: 'PENDENTE. Backfill automático inventaria identidade de cliente a partir de string — irreversível e contaminaria toda métrica de recorrência. Campo novo opcional é seguro; a política de backfill é decisão de produto',
      uncertainty: 5, impact: 5, irreversibility: 5, crossModule: 5 },
    { id: 'CL-2', pergunta: 'Cliente é por empresa ou compartilhado entre unidades (Q-014)?',
      dono: 'USUARIO', bloqueiaImplementacaoSegura: true,
      resolucao: 'PENDENTE. Define a chave de unicidade e o escopo de tenant — mudar depois exige migração de dado real',
      uncertainty: 4, impact: 5, irreversibility: 5, crossModule: 4 }
  ]
});

/** Prioridade multiplicativa. Fator zero zera — é o comportamento desejado. */
export function prioridade(i) {
  return i.uncertainty * i.impact * i.irreversibility * i.crossModule;
}

/**
 * Avalia uma feature. PURA nos argumentos — as sabotagens percorrem este caminho.
 */
export function avaliarFeature({ feature, incertezas, fastMode = FAST_MODE }) {
  const lista = incertezas ?? [];
  const materiais = lista.filter((i) => i.bloqueiaImplementacaoSegura);

  const doInvalido = lista.filter((i) => !DONOS.includes(i.dono));
  if (doInvalido.length) {
    return { feature, veredito: 'SPEC_CONFLICT', materiais,
      motivo: `incerteza com dono fora do conjunto conhecido: ${doInvalido.map((i) => `${i.id}→${i.dono}`).join(', ')}` };
  }

  /* Conflito antes de tudo: uma incerteza material que é simultaneamente do usuário e declarada
     resolvível por investigação é contradição de especificação, não falta de aprofundamento. */
  const contraditorias = materiais.filter((i) => i.dono === 'USUARIO' && /^derivável|^enumerável/i.test(i.resolucao ?? ''));
  if (contraditorias.length) {
    return { feature, veredito: 'SPEC_CONFLICT', materiais,
      motivo: `incerteza atribuída ao usuário mas declarada resolvível por investigação: ${contraditorias.map((i) => i.id).join(', ')}` };
  }

  if (materiais.length === 0) {
    return { feature, veredito: 'SWEET_SPOT_REACHED', materiais,
      motivo: fastMode
        ? 'nenhuma incerteza material; em FAST_MODE, aprofundar o não material tem retorno marginal menor que implementar e observar'
        : 'nenhuma incerteza material restante' };
  }

  /* Material e do usuário → só o usuário resolve. Aprofundar não produz a resposta. */
  const doUsuario = materiais.filter((i) => i.dono === 'USUARIO');
  if (doUsuario.length === materiais.length) {
    return { feature, veredito: 'USER_DECISION_REQUIRED', materiais,
      motivo: `${doUsuario.length} incerteza(s) material(is) reservada(s) ao usuário: ${doUsuario.map((i) => i.id).join(', ')}`,
      perguntas: doUsuario.sort((a, b) => prioridade(b) - prioridade(a)).map((i) => ({ id: i.id, pergunta: i.pergunta, prioridade: prioridade(i) })) };
  }

  return { feature, veredito: 'DEEPENING_REQUIRED', materiais,
    motivo: `${materiais.length} incerteza(s) material(is), ao menos uma resolvível sem o usuário`,
    proxima: materiais.sort((a, b) => prioridade(b) - prioridade(a))[0] };
}

/** O discovery existente está acessível? Sem ele, DeepSpec repetiria trabalho já feito. */
export function observarDiscovery() {
  const base = `${RAIZ}docs/functionality-discovery/`;
  const indices = ['00_DECISION_LOG.md', '00_OPEN_QUESTIONS.md', '00_DEPENDENCY_MAP.md',
    '00_TRACEABILITY_MATRIX.md', '00_CANDIDATE_BACKLOG.md', '00_EOS_DISCOVERY_PROTOCOL.md'];
  const presentes = indices.filter((f) => existsSync(`${base}${f}`));
  const perguntas = existsSync(`${base}00_OPEN_QUESTIONS.md`)
    ? (readFileSync(`${base}00_OPEN_QUESTIONS.md`, 'utf8').match(/\bQ-\d{3}\b/g) ?? [])
    : [];
  return { presentes, total: indices.length, perguntasDistintas: new Set(perguntas).size };
}

/* ------------------------------------------------------------------ *
 * Execução
 * ------------------------------------------------------------------ */

export function executar() {
  const discovery = observarDiscovery();

  const features = Object.keys(INCERTEZAS);
  const avaliacoes = features.map((f) => avaliarFeature({ feature: f, incertezas: INCERTEZAS[f] }));

  /* Controles negativos: cada veredito precisa ser alcançável, e nenhum pode ser o padrão. */
  const base = { uncertainty: 3, impact: 3, irreversibility: 3, crossModule: 3 };
  const sabotagens = [
    ['SWEET_SPOT_REACHED', 'sem incerteza material',
      { feature: 'X', incertezas: [{ id: 'a', dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: false, ...base }] }],
    ['DEEPENING_REQUIRED', 'material e resolvível sem usuário',
      { feature: 'X', incertezas: [{ id: 'a', dono: 'INVESTIGACAO', bloqueiaImplementacaoSegura: true, ...base }] }],
    ['USER_DECISION_REQUIRED', 'material e só do usuário',
      { feature: 'X', incertezas: [{ id: 'a', dono: 'USUARIO', bloqueiaImplementacaoSegura: true, resolucao: 'PENDENTE', ...base }] }],
    ['SPEC_CONFLICT', 'dono desconhecido',
      { feature: 'X', incertezas: [{ id: 'a', dono: 'SEI_LA', bloqueiaImplementacaoSegura: true, ...base }] }],
    ['SPEC_CONFLICT', 'do usuário mas declarada derivável',
      { feature: 'X', incertezas: [{ id: 'a', dono: 'USUARIO', bloqueiaImplementacaoSegura: true, resolucao: 'derivável do schema', ...base }] }],
    ['SWEET_SPOT_REACHED', 'lista vazia', { feature: 'X', incertezas: [] }]
  ];
  const negFalhos = sabotagens
    .filter(([esperado, , entrada]) => avaliarFeature(entrada).veredito !== esperado)
    .map(([e, d]) => `${e} (${d})`);

  /* Controle da prioridade: multiplicativo zera com qualquer fator zero, e ordena de fato. */
  const controlePrioridade = [
    ['fator zero zera', prioridade({ uncertainty: 5, impact: 5, irreversibility: 0, crossModule: 5 }) === 0],
    ['ordena por produto', prioridade({ uncertainty: 5, impact: 5, irreversibility: 5, crossModule: 5 }) >
      prioridade({ uncertainty: 5, impact: 5, irreversibility: 4, crossModule: 5 })]
  ];
  const prioFalhos = controlePrioridade.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('EOS DeepSpec — MVP  [FAST_MODE = ' + FAST_MODE + ']');
  console.log(`  discovery reutilizado : ${discovery.presentes.length}/${discovery.total} índices, ${discovery.perguntasDistintas} questões distintas`);
  console.log(`  classificações de reuso declaradas : ${REUSO_DO_DISCOVERY.length}` +
    ` (SUPERSEDED ${REUSO_DO_DISCOVERY.filter((r) => r.classe === 'SUPERSEDED').length}` +
    ` · STILL_VALID ${REUSO_DO_DISCOVERY.filter((r) => r.classe === 'STILL_VALID').length}` +
    ` · UNKNOWN ${REUSO_DO_DISCOVERY.filter((r) => r.classe === 'UNKNOWN').length})`);
  console.log('');
  for (const a of avaliacoes) {
    console.log(`  ${a.feature}`);
    console.log(`    veredito : ${a.veredito}`);
    console.log(`    motivo   : ${a.motivo}`);
    for (const p of a.perguntas ?? []) console.log(`    pergunta ao usuário [${p.prioridade}] : ${p.pergunta}`);
    if (a.proxima) console.log(`    próxima a aprofundar [${prioridade(a.proxima)}] : ${a.proxima.pergunta}`);
  }
  console.log('');
  console.log(`  controles de veredito : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — falhou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controles de prioridade : ${controlePrioridade.length - prioFalhos.length}/${controlePrioridade.length}` +
    (prioFalhos.length ? ` — falhou: ${prioFalhos.join('; ')}` : ''));

  if (negFalhos.length || prioFalhos.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — não use estes vereditos');
    return 2;
  }

  const prontas = avaliacoes.filter((a) => a.veredito === 'SWEET_SPOT_REACHED').map((a) => a.feature);
  console.log(`  IMPLEMENTÁVEIS AGORA (${prontas.length}) : ${prontas.join(', ') || 'nenhuma'}`);
  console.log('    provado: os quatro vereditos são alcançáveis e nenhum é o padrão; a prioridade');
  console.log('      multiplicativa zera com fator zero e ordena de fato.');
  console.log('    NÃO provado: que a lista de incertezas está completa. DeepSpec mede o que foi');
  console.log('      declarado; incerteza não enxergada não vira veredito. Por isso o discovery');
  console.log('      existente é INPUT obrigatório, e não um passo opcional.');
  return 0;
}

/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Nao escreve. A prova de roteamento pode executa-lo com seguranca. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte deste modulo, nao de lista literal a manter em paralelo. */
export const FLAGS = flagsDoModulo(import.meta.url);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(recusarDesconhecida(process.argv.slice(2), FLAGS) ?? executar());
}
