/**
 * Metric Foundation — REGISTRO canônico de métricas.  [Feature METRIC_FOUNDATION · P9]
 *
 * COMO ESTE REGISTRO FOI CONSTRUÍDO
 *   De trás para frente. Não parti do dado disponível perguntando "o que dá para plotar?" —
 *   parti da decisão: quem decide o quê, e qual número mudaria essa decisão. Métrica que não
 *   sobreviveu a essa pergunta não entrou, e `violacoesDaMetrica` reprova quem tentar.
 *
 * O QUE JÁ EXISTE NO PRODUTO, e que este registro formaliza em vez de reinventar
 *   `GET /dashboard` (`servicos.js:414`) já agrega por `req.db` — tenant-escopado pelo client
 *   Prisma estendido — com `_sum` de `valorCobrado`, `valorLiquido` e `comissaoGerada`, mais
 *   `groupBy` por técnico e por local, e comparação com o período anterior.
 *   `GET /me/metricas` (`account.js:134`) é self-scoped e checa `podeProprio(req.user,
 *   'ver_metricas')`.
 *
 *   Ou seja: a distinção entre VER AGREGADO e VER O PRÓPRIO já existe no código. O contrato a
 *   torna declarada e verificável, em vez de convenção que a próxima rota pode esquecer.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ
 *   Não calcula nada. É contrato — o que a métrica significa, de onde vem, quem pode ver e o que
 *   se faz com ela. A implementação vem depois, e `sourceEntities` é o que permite conferir se
 *   ela ficou fiel.
 */

import { derivarConfianca } from './contrato.js';
import { PAPEIS, presetDoPapel } from '../permissoes.js';

/** Atalho: escopo de tenant é universal no produto; nenhuma métrica atravessa empresa. */
const TENANT = 'empresa — toda consulta passa por req.db (client Prisma estendido)';

/**
 * Quem pode ver, DERIVADO do RBAC real — nunca uma lista de papéis escrita à mão.
 *
 * O ERRO QUE ISTO EVITA
 *   A primeira versão declarava `agregado: ['dono', 'gestor']` como literal. Parecia inofensivo e
 *   não era: `pode()` decide por MÓDULO/AÇÃO com **overrides por usuário** (`Usuario.permissoes` ⊕
 *   preset do papel). Um funcionário com override de `financeiro.ver` tem a permissão de verdade,
 *   e uma lista de papéis o excluiria; um gestor com override revogado não tem, e a lista o
 *   incluiria. Checar papel seria criar uma SEGUNDA autoridade de autorização ao lado da real —
 *   e as duas divergem no dia em que alguém mexe num override.
 *
 *   Aqui a lista vira sombra do preset: informativa, derivada, e conferida. A autoridade em runtime
 *   continua sendo `pode()` / `requirePermissao`, que enxergam o override.
 *
 * `dono` nunca entra por preset — é grant total e imutável por construção, então entra sempre.
 */
export function papeisComPermissao(requiredPermission) {
  const exigidas = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
  return Object.freeze(
    PAPEIS.filter((papel) => {
      if (papel === 'dono') return true;
      const preset = presetDoPapel(papel);
      /* Conjunção: métrica que cruza módulos exige TODOS. Direção segura — exigir a mais nunca
       concede acesso indevido, exigir a menos concede. */
      return exigidas.every(({ modulo, acao }) => Boolean(preset?.[modulo]?.[acao]));
    })
  );
}

/**
 * Permissão exigida por métrica, no vocabulário autoritativo de `permissoes.js`.
 *
 * O mapeamento NÃO foi inventado: veio do que o produto já exige para o mesmo dado.
 *   `GET /dashboard`                     -> dashboard.ver
 *   `GET /relatorio/pdf` (financeiro)    -> financeiro.ver
 *   `GET /tecnicos/:id/ponto/relatorio`  -> ponto.ver
 * Uma métrica que servisse o mesmo número sob permissão mais frouxa que a rota existente seria
 * uma porta lateral para o dado — e `MET-SEC-03` reprova isso.
 */
export const PERMISSAO_POR_METRICA = Object.freeze({
  'faturamento-liquido': { modulo: 'financeiro', acao: 'ver' },
  'ticket-medio': { modulo: 'financeiro', acao: 'ver' },
  'comissao-total': { modulo: 'financeiro', acao: 'ver' },
  'servicos-concluidos': { modulo: 'servicos', acao: 'ver' },
  'taxa-aprovacao': { modulo: 'aprovacoes', acao: 'ver' },
  'producao-por-tecnico': { modulo: 'tecnicos', acao: 'ver' },
  'horas-trabalhadas': { modulo: 'ponto', acao: 'ver' },
  'nota-media-avaliacao': { modulo: 'avaliacoes', acao: 'ver' },
  'taxa-recompra': { modulo: 'dashboard', acao: 'ver' },
  'taxa-conversao-orcamento': { modulo: 'financeiro', acao: 'ver' },
  'ocupacao-agenda': { modulo: 'servicos', acao: 'ver' },
  'conversao-funil': { modulo: 'dashboard', acao: 'ver' },
});

/** Métricas cujo recorte por técnico o próprio funcionário pode ver — capacidade `ver_metricas`. */
export const AUTO_ESCOPADAS = Object.freeze(['producao-por-tecnico', 'horas-trabalhadas']);

/**
 * Escopo de segurança DERIVADO. Duas fontes distintas, e a distinção é o ponto:
 *
 *   permissão de MÓDULO   -> ver o agregado da EMPRESA (dono, gestor, ou quem tiver override)
 *   capacidade `proprio`  -> ver o PRÓPRIO recorte (funcionário), como `/me/metricas` já faz
 *
 * `drilldown` nunca herda o auto-escopo: ver o próprio número não é ver os registros de todos.
 * `MET-05` do contrato reprova drilldown mais permissivo que agregado, e aqui ele é por
 * construção um subconjunto — não uma promessa.
 */
export function escopoDaMetrica(metricId) {
  const requiredPermission = PERMISSAO_POR_METRICA[metricId];
  const porModulo = papeisComPermissao(requiredPermission);
  const autoEscopo = AUTO_ESCOPADAS.includes(metricId);
  return Object.freeze({
    requiredPermission,
    autoEscopo: autoEscopo ? 'ver_metricas' : null,
    agregado: Object.freeze(
      autoEscopo ? [...new Set([...porModulo, 'funcionario'])] : [...porModulo]
    ),
    drilldown: porModulo,
    tenantScope: TENANT,
  });
}

export const METRICAS = Object.freeze([
  /* ---------------- BUSINESS_HEALTH ---------------- */
  {
    metricId: 'faturamento-liquido',
    /* [Hub #2] Era 'Faturamento líquido', e o nome prometia mais do que a fórmula entrega.
       `valorLiquido` é `valorCobrado − valorMaterial`: comissão NÃO entra, e ela é modelada
       (`comissaoGerada`) e descontada pelo próprio Dashboard no card "Lucro do período". Em
       contabilidade brasileira "faturamento líquido" sugere receita líquida de impostos e
       deduções — nenhum imposto, aluguel ou combustível é considerado aqui.

       O nome passa a ser o que o produto JÁ usa para este mesmo número no Dashboard: um número,
       um nome, em toda a superfície. O `metricId` fica: o nome de exibição tinha 1 dependência,
       o id tem 8. */
    name: 'Receita líquida',
    familia: 'BUSINESS_HEALTH',
    description: 'Soma do valor cobrado menos o material dos serviços ativos no período.',
    /* Ressalva que a UI é obrigada a mostrar: o número não é lucro, e o usuário não pode ser
       levado a acreditar que custos não modelados foram considerados. */
    escopoDeCusto:
      'Considera apenas custos de material registrados no AdmAi. Não inclui comissão, impostos nem despesas fixas.',
    businessQuestion: 'A empresa está faturando mais ou menos que no período anterior?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'manter ou cortar custo, contratar ou segurar',
        acao: 'comparar com o período anterior e, na queda, abrir a decomposição por técnico e por local antes de decidir',
      },
    ],
    formula: 'SUM(Servico.valorLiquido) WHERE status = "ativo" AND criadoEm ∈ período',
    grain: 'empresa × período',
    sourceEntities: ['Servico'],
    filters: ['status = ativo', 'criadoEm no período'],
    dimensions: ['tecnico', 'local', 'dia'],
    timeSemantics:
      'criadoEm — data de REGISTRO do serviço, não de execução. A distinção importa: serviço registrado com atraso desloca faturamento para o período errado.',
    comparisons: ['período anterior de mesma duração'],
    freshness: 'tempo real — agregação direta, sem materialização',
    qualityRules: ['serviço sem valorLiquido não entra', 'valorLiquido negativo é dado inválido'],
    drilldown: 'lista de Servico do período, com técnico, local e a decomposição do valor',
    /* Cada campo do drilldown com a permissão que ele exige. Ver o total da empresa e ver quanto
       um colega ganhou por serviço são direitos diferentes, e `comissaoGerada` é dado financeiro
       DE UMA PESSOA — por isso exige também `tecnicos.ver`. Uma chave só para as duas
       sensibilidades trataria coisas diferentes como iguais. */
    fieldPolicy: {
      valorCobrado: [{ modulo: 'financeiro', acao: 'ver' }],
      valorMaterial: [{ modulo: 'financeiro', acao: 'ver' }],
      valorLiquido: [{ modulo: 'financeiro', acao: 'ver' }],
      comissaoGerada: [
        { modulo: 'financeiro', acao: 'ver' },
        { modulo: 'tecnicos', acao: 'ver' },
      ],
    },
    relatedMetrics: ['ticket-medio', 'comissao-total', 'servicos-concluidos'],
    securityScope: escopoDaMetrica('faturamento-liquido'),
    hubModules: [
      'Hero',
      'Timeline',
      'Comparison',
      'Decomposition',
      'Segmentation',
      'DataConfidence',
      'Lineage',
      'UnderlyingRecords',
    ],
    version: '1.0.0',
  },
  {
    metricId: 'ticket-medio',
    name: 'Ticket médio',
    familia: 'FINANCIAL',
    description: 'Valor líquido médio por serviço no período.',
    businessQuestion: 'Estamos cobrando pouco, ou fazendo serviço pequeno demais?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'revisar tabela de preço ou mix de serviço',
        acao: 'se cair com volume estável, revisar preço; se cair com volume subindo, é mix — e a ação é outra',
      },
    ],
    formula: 'SUM(Servico.valorLiquido) / COUNT(Servico) WHERE status = "ativo"',
    grain: 'empresa × período',
    sourceEntities: ['Servico'],
    filters: ['status = ativo'],
    dimensions: ['tecnico', 'local'],
    timeSemantics: 'criadoEm',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: ['denominador zero devolve INSUFFICIENT, nunca 0 — média de nada não é zero'],
    drilldown: 'serviços do período ordenados por valor',
    relatedMetrics: ['faturamento-liquido'],
    securityScope: escopoDaMetrica('ticket-medio'),
    hubModules: ['Hero', 'Timeline', 'Distribution', 'Comparison', 'DataConfidence', 'Lineage'],
    version: '1.0.0',
  },
  {
    metricId: 'comissao-total',
    name: 'Comissão gerada',
    familia: 'FINANCIAL',
    description: 'Soma da comissão gerada pelos serviços do período.',
    businessQuestion: 'Quanto a operação deve à equipe neste período?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'programar pagamento e conferir margem',
        acao: 'confrontar com o que já foi pago em Pagamento e liquidar a diferença',
      },
      {
        papel: 'gestor',
        decisao: 'conferir comissão por técnico antes de fechar o mês',
        acao: 'abrir a decomposição por técnico e revisar divergência antes do pagamento',
      },
    ],
    formula: 'SUM(Servico.comissaoGerada) WHERE status = "ativo" AND criadoEm ∈ período',
    grain: 'empresa × período',
    sourceEntities: ['Servico', 'Pagamento'],
    filters: ['status = ativo'],
    dimensions: ['tecnico'],
    timeSemantics: 'criadoEm',
    comparisons: ['total já pago no mesmo período'],
    freshness: 'tempo real',
    qualityRules: ['comissão de técnico sem percentual configurado é dado incompleto'],
    drilldown: 'serviços por técnico com comissão individual',
    relatedMetrics: ['faturamento-liquido', 'producao-por-tecnico'],
    securityScope: escopoDaMetrica('comissao-total'),
    hubModules: [
      'Hero',
      'Decomposition',
      'Timeline',
      'ActionCenter',
      'DataConfidence',
      'Lineage',
      'UnderlyingRecords',
    ],
    version: '1.0.0',
  },

  /* ---------------- OPERATIONS ---------------- */
  {
    metricId: 'servicos-concluidos',
    name: 'Serviços concluídos',
    familia: 'OPERATIONS',
    description: 'Contagem de serviços ativos no período.',
    businessQuestion: 'O volume de trabalho está subindo ou caindo?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'dimensionar equipe',
        acao: 'volume subindo com equipe fixa antecipa gargalo: contratar ou redistribuir',
      },
      {
        papel: 'gestor',
        decisao: 'redistribuir carga entre técnicos',
        acao: 'comparar volume por técnico e reequilibrar a fila',
      },
    ],
    formula: 'COUNT(Servico) WHERE status = "ativo" AND criadoEm ∈ período',
    grain: 'empresa × período',
    sourceEntities: ['Servico'],
    filters: ['status = ativo'],
    dimensions: ['tecnico', 'local', 'dia'],
    timeSemantics: 'criadoEm',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: ['serviço pendente de aprovação não conta como concluído'],
    drilldown: 'lista de serviços do período',
    relatedMetrics: ['faturamento-liquido', 'taxa-aprovacao'],
    securityScope: escopoDaMetrica('servicos-concluidos'),
    hubModules: [
      'Hero',
      'Timeline',
      'Segmentation',
      'AnomalyRadar',
      'DataConfidence',
      'Lineage',
      'UnderlyingRecords',
    ],
    version: '1.0.0',
  },
  {
    metricId: 'taxa-aprovacao',
    name: 'Taxa de aprovação de serviço',
    familia: 'OPERATIONS',
    description: 'Proporção de serviços registrados por funcionário que foram aprovados.',
    businessQuestion: 'O fluxo de aprovação está travando a operação?',
    decisionSupported: [
      {
        papel: 'gestor',
        decisao: 'manter ou relaxar a exigência de aprovação',
        acao: 'aprovação alta e constante sugere revisar a exigência; rejeição alta sugere treinar registro',
      },
    ],
    /* [P7] A versão 1.0.0 dizia "COUNT(registrados por funcionário)" — prosa, não campo. Ao
       implementar o cálculo, a checagem de ancoragem reprovou: não existe `registradoPorFuncionario`
       no schema. O mecanismo real é observável sem campo novo — funcionário em empresa com
       `aprovacaoServico` cria o serviço como `pendente`, e aprovar leva a `ativo`+`aprovadoEm`
       enquanto rejeitar leva a `rejeitado`+`aprovadoEm`. O denominador é o conjunto que ENTROU no
       fluxo. Contrato vago não ancora cálculo, então o contrato ficou preciso. */
    formula:
      'COUNT(status = "ativo" AND aprovadoEm IS NOT NULL) / COUNT(status IN ("pendente","rejeitado") OR (status = "ativo" AND aprovadoEm IS NOT NULL))',
    grain: 'empresa × período',
    sourceEntities: ['Servico', 'Empresa'],
    filters: ['Empresa.aprovacaoServico = true', 'criadoEm no período'],
    dimensions: ['tecnico'],
    timeSemantics: 'aprovadoEm quando existe; criadoEm como fallback',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: [
      'empresa sem aprovacaoServico ligada devolve INSUFFICIENT, não 100%',
      'nenhum serviço no fluxo de aprovação devolve INSUFFICIENT — denominador zero não é taxa',
    ],
    drilldown: 'serviços pendentes e rejeitados do período',
    relatedMetrics: ['servicos-concluidos'],
    securityScope: escopoDaMetrica('taxa-aprovacao'),
    hubModules: ['Hero', 'Timeline', 'ActionCenter', 'DataConfidence', 'Lineage'],
    version: '1.1.0',
  },

  /* ---------------- TEAM ---------------- */
  {
    metricId: 'producao-por-tecnico',
    name: 'Produção por técnico',
    familia: 'TEAM',
    description: 'Serviços e valor líquido agregados por técnico no período.',
    businessQuestion: 'Quem está produzindo, e quem precisa de apoio?',
    decisionSupported: [
      {
        papel: 'gestor',
        decisao: 'apoiar, treinar ou redistribuir',
        acao: 'técnico consistentemente abaixo da mediana entra em acompanhamento, não em corte automático',
      },
      {
        papel: 'funcionario',
        decisao: 'acompanhar a própria produção',
        acao: 'ver o próprio número e a própria comissão do período',
      },
    ],
    formula: 'GROUP BY tecnicoId: COUNT(Servico), SUM(valorLiquido), SUM(comissaoGerada)',
    grain: 'técnico × período',
    sourceEntities: ['Servico', 'Tecnico'],
    filters: ['status = ativo'],
    dimensions: ['tecnico', 'periodo'],
    timeSemantics: 'criadoEm',
    comparisons: ['mediana da equipe', 'período anterior do mesmo técnico'],
    freshness: 'tempo real',
    qualityRules: ['técnico sem serviço no período aparece com zero explícito, não some da lista'],
    drilldown: 'serviços do técnico no período',
    relatedMetrics: ['comissao-total', 'horas-trabalhadas', 'servicos-concluidos'],
    /* O caso que o contrato de segurança existe para impedir: o funcionário vê o AGREGADO da
       própria produção (self-scope, via /me/metricas), mas o drilldown da equipe inteira é de
       dono e gestor. Ver o próprio total não abre a lista dos outros. */
    securityScope: escopoDaMetrica('producao-por-tecnico'),
    hubModules: [
      'Hero',
      'Decomposition',
      'Comparison',
      'Distribution',
      'DriverAnalysis',
      'DataConfidence',
      'Lineage',
      'UnderlyingRecords',
    ],
    version: '1.0.0',
  },
  {
    metricId: 'horas-trabalhadas',
    name: 'Horas trabalhadas',
    familia: 'TEAM',
    description: 'Jornada registrada por técnico no período, a partir das batidas de ponto.',
    businessQuestion: 'A jornada registrada corresponde à produção observada?',
    decisionSupported: [
      {
        papel: 'gestor',
        decisao: 'conferir jornada antes de fechar folha',
        acao: 'divergência entre jornada e produção entra em conferência antes do fechamento',
      },
    ],
    /* [P7] Também vago demais para ancorar cálculo: "intervalos" não diz QUAIS batidas nem como o
       almoço entra. Os tipos são os do schema, e o almoço só é descontado quando o par existe —
       descontar um almoço aberto inventaria pausa que ninguém registrou. */
    formula:
      'SUM(BatidaPonto.em[tipo="saida"] - BatidaPonto.em[tipo="entrada"] - (almoco_volta - almoco_saida quando o par existe)) agrupado por registroId, por técnico',
    grain: 'técnico × período',
    sourceEntities: ['RegistroPonto', 'BatidaPonto', 'Tecnico'],
    filters: ['data no período'],
    dimensions: ['tecnico', 'dia'],
    timeSemantics: 'RegistroPonto.data',
    comparisons: ['jornada contratada do técnico'],
    freshness: 'tempo real',
    qualityRules: [
      'registro com batida de entrada sem saída é incompleto e não entra na soma',
      'jornada não é fechada com o relógio atual — hora não trabalhada cresceria sozinha',
    ],
    drilldown: 'batidas do técnico no período',
    relatedMetrics: ['producao-por-tecnico'],
    securityScope: escopoDaMetrica('horas-trabalhadas'),
    hubModules: ['Hero', 'Timeline', 'Comparison', 'AnomalyRadar', 'DataConfidence', 'Lineage'],
    version: '1.0.0',
  },

  /* ---------------- QUALITY ---------------- */
  {
    metricId: 'nota-media-avaliacao',
    name: 'Nota média de avaliação',
    familia: 'QUALITY',
    description: 'Média das notas de avaliação recebidas no período.',
    businessQuestion: 'A qualidade percebida está caindo?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'intervir em qualidade antes de perder cliente',
        acao: 'queda sustentada abre investigação por técnico e por tipo de serviço',
      },
    ],
    formula: 'AVG(Avaliacao.nota) WHERE criadoEm ∈ período',
    grain: 'empresa × período',
    sourceEntities: ['Avaliacao', 'Servico'],
    filters: ['criadoEm no período'],
    dimensions: ['tecnico'],
    timeSemantics: 'Avaliacao.criadoEm',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: [
      'menos de 5 avaliações no período devolve INSUFFICIENT — média de amostra mínima engana',
    ],
    drilldown: 'avaliações do período com comentário',
    relatedMetrics: ['producao-por-tecnico'],
    securityScope: escopoDaMetrica('nota-media-avaliacao'),
    hubModules: [
      'Hero',
      'Timeline',
      'Distribution',
      'Segmentation',
      'DataConfidence',
      'Lineage',
      'UnderlyingRecords',
    ],
    version: '1.0.0',
  },

  /* ---------------- CUSTOMER / SCHEDULING / BUDGET / CRM ----------------
     Definidas agora, DE PROPÓSITO, e classificadas como indisponíveis. O motivo é o que dá razão
     à ordem "Metric Foundation antes do CRM": saber que `taxa-recompra` precisa de `Cliente` é o
     que impede modelar `Cliente` sem o campo que a métrica exige. Definir depois de construir é
     descobrir tarde que o estado nunca foi persistido. */
  {
    metricId: 'taxa-recompra',
    name: 'Taxa de recompra',
    familia: 'CUSTOMER',
    description: 'Proporção de clientes com mais de um serviço no intervalo.',
    businessQuestion: 'Os clientes voltam?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'investir em retenção ou em aquisição',
        acao: 'recompra baixa desloca investimento para retenção antes de gastar em aquisição',
      },
    ],
    formula: 'COUNT(DISTINCT Cliente com ≥2 Servico) / COUNT(DISTINCT Cliente)',
    grain: 'empresa × intervalo',
    sourceEntities: ['Cliente', 'Servico'],
    filters: ['serviços no intervalo'],
    dimensions: ['cliente', 'periodo'],
    timeSemantics: 'Servico.criadoEm',
    comparisons: ['intervalo anterior'],
    freshness: 'diária',
    qualityRules: [
      'sem entidade Cliente, identidade por texto livre não sustenta contagem distinta',
    ],
    drilldown: 'clientes com mais de um serviço',
    relatedMetrics: ['ticket-medio'],
    securityScope: escopoDaMetrica('taxa-recompra'),
    hubModules: ['Hero', 'Timeline', 'Distribution', 'DataConfidence', 'Lineage'],
    version: '0.1.0',
  },
  {
    metricId: 'taxa-conversao-orcamento',
    name: 'Taxa de conversão de orçamento',
    familia: 'BUDGET',
    description: 'Proporção de orçamentos que viraram serviço.',
    businessQuestion: 'Estamos perdendo trabalho no orçamento?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'revisar preço ou abordagem comercial',
        acao: 'conversão baixa com preço na média sugere problema de abordagem, não de preço',
      },
    ],
    formula: 'COUNT(Orcamento aprovado) / COUNT(Orcamento)',
    grain: 'empresa × período',
    sourceEntities: ['Orcamento', 'Servico'],
    filters: ['orçamentos do período'],
    dimensions: ['categoria', 'origem'],
    timeSemantics: 'Orcamento.criadoEm',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: [
      'orçamento sem desfecho registrado fica fora do denominador, e isso precisa aparecer na confiança',
    ],
    drilldown: 'orçamentos perdidos com motivo',
    relatedMetrics: ['ticket-medio'],
    securityScope: escopoDaMetrica('taxa-conversao-orcamento'),
    hubModules: ['Hero', 'Timeline', 'DriverAnalysis', 'ActionCenter', 'DataConfidence', 'Lineage'],
    version: '0.1.0',
  },
  {
    metricId: 'ocupacao-agenda',
    name: 'Ocupação da agenda',
    familia: 'SCHEDULING',
    description: 'Proporção da capacidade da equipe ocupada por agendamentos.',
    businessQuestion: 'Cabe mais trabalho na semana que vem?',
    decisionSupported: [
      {
        papel: 'gestor',
        decisao: 'aceitar ou recusar novo agendamento',
        acao: 'ocupação acima do limite recusa ou realoca antes de prometer prazo',
      },
    ],
    formula: 'SUM(duração de Agendamento) / capacidade da equipe no período',
    grain: 'empresa × período',
    sourceEntities: ['Agendamento', 'Tecnico'],
    filters: ['agendamentos confirmados'],
    dimensions: ['tecnico', 'dia'],
    timeSemantics: 'Agendamento.inicioEm',
    comparisons: ['semana anterior'],
    freshness: 'tempo real',
    qualityRules: ['agendamento sem duração não entra no numerador'],
    drilldown: 'agenda do período por técnico',
    relatedMetrics: ['producao-por-tecnico'],
    securityScope: escopoDaMetrica('ocupacao-agenda'),
    hubModules: ['Hero', 'Timeline', 'Segmentation', 'ActionCenter', 'DataConfidence', 'Lineage'],
    version: '0.1.0',
  },
  {
    metricId: 'conversao-funil',
    name: 'Conversão do funil',
    familia: 'CRM_FUTURE',
    description: 'Proporção de leads que chegam a oportunidade e a serviço.',
    businessQuestion: 'Onde o funil perde mais?',
    decisionSupported: [
      {
        papel: 'dono',
        decisao: 'onde investir esforço comercial',
        acao: 'o estágio com maior queda recebe a intervenção — e sem instrumentação prévia esse estágio é invisível',
      },
    ],
    formula: 'COUNT por estágio, com transições preservadas em histórico',
    grain: 'empresa × estágio × período',
    sourceEntities: ['Lead', 'Oportunidade', 'Servico'],
    filters: ['leads do período'],
    dimensions: ['origem', 'estagio', 'dono'],
    timeSemantics: 'data da transição de estágio — exige histórico, não só o estado atual',
    comparisons: ['período anterior'],
    freshness: 'tempo real',
    qualityRules: [
      'sem histórico de transição não há drop-off por estágio, só foto do estado atual',
    ],
    drilldown: 'leads por estágio com data de entrada',
    relatedMetrics: ['taxa-conversao-orcamento', 'taxa-recompra'],
    securityScope: escopoDaMetrica('conversao-funil'),
    hubModules: [
      'Hero',
      'Decomposition',
      'Timeline',
      'DriverAnalysis',
      'DataConfidence',
      'Lineage',
    ],
    version: '0.1.0',
  },
]);

export const metricaPorId = (id) => METRICAS.find((m) => m.metricId === id);

export { derivarConfianca };
