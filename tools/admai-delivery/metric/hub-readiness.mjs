/**
 * Prontidão de Hub por métrica.  [Metric Hubs · P10]
 *
 * PARA QUE ISTO EXISTE
 *   A vertical de `servicos-concluidos` provou o framework. A pergunta seguinte não é "qual o
 *   próximo da lista" — é qual métrica o framework atual já serve, qual precisa de módulo novo, e
 *   qual não tem drilldown que signifique alguma coisa. Sem essa separação, o segundo Hub vira
 *   descoberta cara no meio da implementação.
 *
 * DERIVADO, NÃO OPINADO
 *   A classe sai do que a métrica DECLARA no registro cruzado com o que a exposição já sabe fazer:
 *   existe cálculo, existe consulta, quantas dimensões o contrato declara, o `drilldown` está
 *   implementado, e a forma do valor (escalar ou agrupado). Um mapa escrito à mão estaria certo
 *   hoje e mentiria na próxima métrica.
 */

import { pathToFileURL } from 'node:url';
import { METRICAS } from '../../../chaveiro-bot/src/services/metricas/registro.js';
import { CALCULADORES, FIXTURES } from '../../../chaveiro-bot/src/services/metricas/calculo.js';
import { CONSULTAS } from '../../../chaveiro-bot/src/services/metricas/consulta.js';

export const CLASSES_DE_HUB = Object.freeze([
  'HUB_COMPATIBLE_DIRECTLY',
  'HUB_REQUIRES_SPECIAL_MODULE',
  'HUB_REQUIRES_DRILLDOWN',
  'HUB_REQUIRES_MORE_DATA',
  'NO_MEANINGFUL_DRILLDOWN'
]);

/** Drilldown implementado hoje. Declarado porque é fato do código, não do contrato. */
export const DRILLDOWN_IMPLEMENTADO = Object.freeze(['servicos-concluidos', 'faturamento-liquido']);

/**
 * O que DUAS verticais provaram compartilhado — e o que continua faltando.
 *
 * Com um Hub só, qualquer coisa parecia compartilhável; com dois, dá para separar o que se repetiu
 * do que apenas se pareceu. Esta lista é observação sobre o código, não aspiração.
 */
export const FRAMEWORK = Object.freeze({
  SHARED_PRIMITIVES_PROVEN: [
    'useMetricHub — a coreografia (2 requisições no load, recorte e registros sob demanda)',
    'MetricHubShell — moldura, seletor de período e ordem dos módulos',
    'MetricHero · MetricPulse · MetricTimeline · MetricBreakdown · MetricConfidence · MetricLineage',
    'MetricStateBoundary — os oito estados com saída determinística',
    'MetricDrilldown dirigido por colunas: campo redigido não vira coluna',
    'redigirRegistros + POLITICA_PADRAO_DE_CAMPO — redação no servidor, herdada por toda métrica',
    'elegiveis por métrica — um predicado servindo cálculo e drilldown'
  ],
  METRIC_SPECIFIC_MODULES: [
    'formatação do valor (contagem vs moeda)',
    'ressalva de escopo (só métrica com definição parcial precisa)',
    'colunas do drilldown',
    'ações do rodapé'
  ],
  MISSING_CAPABILITIES: [
    'módulo de RANKING para métrica cujo valor já é agrupamento (producao-por-tecnico)',
    'drilldown de entidade não-Servico (horas-trabalhadas lista batidas; nota-media lista avaliações)',
    'granularidade semana/mês — exige declaração no contrato antes de existir na UI'
  ]
});

/**
 * O valor da métrica é um escalar ou já é um agrupamento?
 *
 * `producao-por-tecnico` devolve uma LISTA por técnico — o herói de um Hub precisa de um número, e
 * uma lista pede outro módulo (ranking) em vez de um valor gigante no topo. Isso é forma, não
 * dificuldade: ignorá-lo faria o Hub tentar exibir um array como número.
 */
export function formaDoValor(metricId) {
  const calc = CALCULADORES[metricId];
  if (!calc) return 'SEM_CALCULO';
  try {
    const F = FIXTURES;
    const entrada = metricId === 'horas-trabalhadas' ? F.registrosDePonto
      : metricId === 'nota-media-avaliacao' ? F.avaliacoes
        : F.servicos;
    const extra = metricId === 'producao-por-tecnico' ? F.tecnicos
      : metricId === 'taxa-aprovacao' ? F.empresaComAprovacao : {};
    const r = calc.calcular(entrada, F.periodo, extra);
    if (r.estado !== 'OK') return 'ESCALAR';
    return Array.isArray(r.valor) ? 'AGRUPADO' : 'ESCALAR';
  } catch {
    return 'DESCONHECIDA';
  }
}

/** Classifica uma métrica. PURA nos argumentos — os controles atravessam este caminho. */
export function classificarHub(metrica, { drilldowns = DRILLDOWN_IMPLEMENTADO } = {}) {
  const id = metrica.metricId;
  const temCalculo = Boolean(CALCULADORES[id]);
  const temConsulta = Boolean(CONSULTAS[id]);

  if (!temCalculo || !temConsulta) {
    return { classe: 'HUB_REQUIRES_MORE_DATA', motivo: 'métrica ainda não é servível: falta o modelo que ela declara' };
  }

  const forma = formaDoValor(id);
  if (forma === 'AGRUPADO') {
    return {
      classe: 'HUB_REQUIRES_SPECIAL_MODULE',
      motivo: 'o valor já é um agrupamento, não um escalar: o herói precisa de um módulo de ranking, não de um número'
    };
  }

  const dimensoes = metrica.dimensions ?? [];
  if (dimensoes.length === 0) {
    return { classe: 'NO_MEANINGFUL_DRILLDOWN', motivo: 'sem dimensão declarada: não há recorte que responda "quem contribuiu"' };
  }

  if (!drilldowns.includes(id)) {
    return {
      classe: 'HUB_REQUIRES_DRILLDOWN',
      motivo: `dimensões (${dimensoes.join(', ')}) e cálculo prontos; falta implementar os registros por trás do número`
    };
  }

  return { classe: 'HUB_COMPATIBLE_DIRECTLY', motivo: 'cálculo, dimensões e drilldown prontos — o framework atual serve' };
}

export function derivarProntidao(metricas = METRICAS) {
  const resultados = metricas.map((m) => ({ metricId: m.metricId, familia: m.familia, ...classificarHub(m) }));
  const porClasse = {};
  for (const r of resultados) (porClasse[r.classe] ??= []).push(r.metricId);
  return { resultados, porClasse };
}

export function executar() {
  const { resultados, porClasse } = derivarProntidao();
  const falhas = [];

  /* Controles: cada classe alcançável e nenhuma é o padrão silencioso. */
  const casos = [
    ['a vertical provada é diretamente compatível',
      classificarHub(METRICAS.find((m) => m.metricId === 'servicos-concluidos')).classe === 'HUB_COMPATIBLE_DIRECTLY'],
    ['valor agrupado exige módulo próprio',
      classificarHub(METRICAS.find((m) => m.metricId === 'producao-por-tecnico')).classe === 'HUB_REQUIRES_SPECIAL_MODULE'],
    ['métrica sem modelo entra como falta de dado',
      classificarHub(METRICAS.find((m) => m.metricId === 'taxa-recompra')).classe === 'HUB_REQUIRES_MORE_DATA'],
    ['sem drilldown implementado, a classe diz isso',
      classificarHub(METRICAS.find((m) => m.metricId === 'faturamento-liquido'), { drilldowns: [] }).classe === 'HUB_REQUIRES_DRILLDOWN'],
    ['implementar o drilldown MUDA a classe — senão a classificação é decorativa',
      classificarHub(METRICAS.find((m) => m.metricId === 'faturamento-liquido'), { drilldowns: ['faturamento-liquido'] }).classe === 'HUB_COMPATIBLE_DIRECTLY'],
    ['sem dimensão não há recorte significativo',
      classificarHub({ metricId: 'servicos-concluidos', dimensions: [] }).classe === 'NO_MEANINGFUL_DRILLDOWN'],
    ['toda classe emitida pertence à taxonomia',
      resultados.every((r) => CLASSES_DE_HUB.includes(r.classe))],
    ['toda classificação traz motivo',
      resultados.every((r) => typeof r.motivo === 'string' && r.motivo.trim() !== '')]
  ];
  for (const [rotulo, ok] of casos) if (!ok) falhas.push(rotulo);

  console.log('AdmAi Metric Hubs — prontidão por métrica  [P10]');
  for (const classe of CLASSES_DE_HUB) {
    const ids = porClasse[classe];
    if (!ids) continue;
    console.log(`\n  ${classe} (${ids.length})`);
    for (const id of ids) {
      console.log(`    ${id.padEnd(28)} ${resultados.find((r) => r.metricId === id).motivo}`);
    }
  }
  console.log('');
  console.log('  FRAMEWORK apos DUAS verticais — o que se repetiu, e nao o que se pareceu:');
  for (const [grupo, itens] of Object.entries(FRAMEWORK)) {
    console.log(`    ${grupo} (${itens.length})`);
    for (const i of itens) console.log(`      - ${i}`);
  }
  console.log('');
  console.log(`  controles : ${casos.length - falhas.length}/${casos.length}`);
  for (const f of falhas) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log('    derivado: a classe sai do registro cruzado com o que a exposição sabe fazer.');
  console.log('      Implementar um drilldown MUDA a classe sozinho — é o que impede esta lista de');
  console.log('      virar anotação que envelhece.');
  console.log('    NÃO derivado: PRIORIDADE. Isto diz o que o framework atual serve, não o que vale');
  console.log('      mais construir — essa ordem é decisão de produto, não do instrumento.');

  return falhas.length ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(executar());
