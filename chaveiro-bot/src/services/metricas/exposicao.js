/**
 * Camada de EXPOSIÇÃO das métricas.  [Metric Foundation]
 *
 * O QUE ELA RESOLVE
 *   Transformar um cálculo provado em informação AUTORIZADA e EXPLICÁVEL. Três responsabilidades,
 *   e nenhuma a mais: decidir se quem pede pode ver, validar o que foi pedido contra o que a
 *   métrica declara aceitar, e montar uma resposta que diga o que o número é e o que ele não é.
 *
 * O QUE ELA NÃO FAZ, DE PROPÓSITO
 *   Não recalcula. Se a fórmula aparecesse aqui — nem que fosse "só uma somazinha" — passariam a
 *   existir duas definições da mesma métrica, e a que o usuário vê seria a não verificada. O
 *   cálculo canônico é `calculo.js`; esta camada consome.
 *
 * ALLOWLIST, E POR QUE REJEITAR EM VEZ DE IGNORAR
 *   Filtro ou dimensão que a métrica não declara é REJEITADO com 400. Ignorar em silêncio seria
 *   pior que rejeitar: o cliente pede "faturamento do técnico 7", recebe o faturamento da empresa
 *   inteira e não tem como saber. O número certo respondendo a pergunta errada é indistinguível
 *   de um número errado.
 *
 * `empresaId` vindo do cliente é sempre descartado. O tenant vem do token, e `req.db` o injeta.
 */

import { METRICAS } from './registro.js';
import { CALCULADORES, podeVer } from './calculo.js';
import { temConsulta } from './consulta.js';
import { derivarConfianca } from './contrato.js';
import { pode, podeProprio } from '../permissoes.js';

export const ESTADOS_DA_RESPOSTA = Object.freeze([
  'VALUE',
  'INSUFFICIENT_DATA',
  'NOT_APPLICABLE',
  'UNAVAILABLE',
]);

/** Nunca aceito do cliente, em nenhuma métrica: o tenant não é parâmetro. */
export const FILTROS_PROIBIDOS = Object.freeze(['empresaId', 'empresa', 'tenant', 'tenantId']);

export function metricaPorId(metricId) {
  return METRICAS.find((m) => m.metricId === metricId) ?? null;
}

/* ------------------------------------------------------------------ *
 * Autorização — a autoridade é `pode()`, que enxerga override
 * ------------------------------------------------------------------ */

/**
 * Quem pede pode ver o AGREGADO da empresa?
 *
 * Checa a permissão de MÓDULO com `pode()`, e não a lista de papéis do registro: a lista é sombra
 * derivada do preset, e um usuário com override concedido ou revogado difere dela. Autorizar por
 * papel criaria uma segunda autoridade ao lado da real.
 *
 * `escopo` distingue os dois acessos legítimos, que NÃO são o mesmo direito:
 *   EMPRESA  — o agregado de todo mundo
 *   PROPRIO  — só o recorte de quem pede, como `/me/metricas` já faz hoje
 */
export function autorizarAgregado(usuario, metrica) {
  const { modulo, acao } = metrica.securityScope.requiredPermission;
  if (pode(usuario, modulo, acao)) return { autorizado: true, escopo: 'EMPRESA' };

  const capacidade = metrica.securityScope.autoEscopo;
  if (capacidade && podeProprio(usuario, capacidade) && usuario?.tecnicoId) {
    return { autorizado: true, escopo: 'PROPRIO', tecnicoId: usuario.tecnicoId };
  }
  return { autorizado: false, motivo: `exige ${modulo}.${acao}` };
}

/**
 * Quem pede pode ver os REGISTROS por trás do número?
 *
 * Deliberadamente NÃO reusa `autorizarAgregado`: ver o próprio total não é ver os registros, e
 * encadear as duas checagens faria o auto-escopo vazar para o drilldown na primeira refatoração.
 * São direitos distintos e ficam em funções distintas.
 */
export function autorizarDrilldown(usuario, metrica) {
  const { modulo, acao } = metrica.securityScope.requiredPermission;
  return { autorizado: pode(usuario, modulo, acao), motivo: `drilldown exige ${modulo}.${acao}` };
}

/* ------------------------------------------------------------------ *
 * Allowlist
 * ------------------------------------------------------------------ */

/**
 * O que a métrica aceita, DERIVADO do que ela já declara — nada de segunda lista a divergir.
 * `filters` do registro é prosa de contrato (`status = ativo`); o que o cliente pode escolher são
 * as DIMENSÕES e as COMPARAÇÕES declaradas. Filtro fixo da métrica não é negociável pelo cliente:
 * afrouxá-lo mudaria o significado do número.
 */
export function permitidos(metrica) {
  const dimensoes = [...(metrica.dimensions ?? [])];
  return Object.freeze({
    dimensoes: Object.freeze(dimensoes),
    comparacoes: Object.freeze([...(metrica.comparisons ?? [])]),
    periodos: Object.freeze(['hoje', 'semana', 'mes', 'personalizado']),
    /* Granularidade NÃO é livre: só existe se o contrato declarar a dimensão de tempo
       correspondente. `servicos-concluidos` declara `dia`, então `semana` e `mes` REPROVAM até
       alguém acrescentá-las ao contrato. Inventá-las aqui seria a camada HTTP decidindo semântica
       temporal, que é justamente o que `timeSemantics` existe para fixar. */
    granularidades: Object.freeze(dimensoes.filter((d) => d === 'dia')),
  });
}

/**
 * Valida o pedido. Devolve LISTA de problemas — vazia significa aceito.
 * Rejeita, nunca corrige em silêncio.
 */
export function validarPedido(metrica, pedido = {}) {
  const problemas = [];
  const ok = permitidos(metrica);

  for (const proibido of FILTROS_PROIBIDOS) {
    if (proibido in pedido) problemas.push(`${proibido} não é parâmetro: o tenant vem do token`);
  }

  if (pedido.dimensao != null && !ok.dimensoes.includes(pedido.dimensao)) {
    problemas.push(`dimensão não declarada por ${metrica.metricId}: ${pedido.dimensao}`);
  }
  if (pedido.periodo != null && !ok.periodos.includes(pedido.periodo)) {
    problemas.push(`período inválido: ${pedido.periodo}`);
  }
  if (pedido.granularidade != null && !ok.granularidades.includes(pedido.granularidade)) {
    problemas.push(
      `granularidade não declarada por ${metrica.metricId}: ${pedido.granularidade}` +
        ` (declaradas: ${ok.granularidades.join(', ') || 'nenhuma'})`
    );
  }
  if (pedido.periodo === 'personalizado' && !(pedido.inicio && pedido.fim)) {
    problemas.push('período personalizado exige inicio e fim');
  }
  if (pedido.inicio && pedido.fim && new Date(pedido.inicio) > new Date(pedido.fim)) {
    problemas.push('inicio posterior a fim');
  }
  /* Filtro arbitrário nunca vira query: o que não está declarado não passa. */
  for (const chave of Object.keys(pedido.filtros ?? {})) {
    if (!ok.dimensoes.includes(chave)) problemas.push(`filtro não declarado: ${chave}`);
  }
  return problemas;
}

/* ------------------------------------------------------------------ *
 * Montagem da resposta
 * ------------------------------------------------------------------ */

/**
 * Traduz o resultado do cálculo no estado da resposta.
 *
 * A regra que sustenta a Metric Foundation inteira: **nenhum destes vira zero**. `INSUFFICIENT`
 * vindo do cálculo é `INSUFFICIENT_DATA` aqui, com o motivo do cálculo — não um zero educado.
 * `NOT_APPLICABLE` é métrica cujo modelo ainda não existe. `UNAVAILABLE` é falha de consulta, e
 * NUNCA pode se disfarçar de `INSUFFICIENT_DATA`: "não consegui medir" e "medi e não deu" são
 * afirmações diferentes, e confundi-las esconde incidente atrás de estado normal.
 */
export function estadoDoResultado(resultado) {
  if (resultado == null) return 'UNAVAILABLE';
  if (resultado.estado === 'INSUFFICIENT') return 'INSUFFICIENT_DATA';
  return 'VALUE';
}

/** Variação entre dois períodos. `null` quando não há base — divisão por zero não é 100%. */
export function compararValores(atual, anterior) {
  if (typeof atual !== 'number' || typeof anterior !== 'number') return null;
  const absoluta = Math.round((atual - anterior) * 100) / 100;
  const percentual =
    anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 10000) / 100;
  return {
    valorAnterior: anterior,
    variacaoAbsoluta: absoluta,
    variacaoPercentual: percentual,
    /* Sem base anterior, a direção é DESCONHECIDA — não "subiu infinito". */
    direcao:
      percentual === null ? 'SEM_BASE' : absoluta > 0 ? 'SUBIU' : absoluta < 0 ? 'CAIU' : 'ESTAVEL',
  };
}

/**
 * A resposta. `lineage` existe para que o número seja CONTESTÁVEL: quem discorda precisa poder ver
 * de qual contrato, qual versão, qual janela, quais filtros e quantos registros ele saiu. Número
 * sem procedência não se discute — só se acredita ou não, e isso não é medição.
 *
 * Não vazam daqui: SQL, identificador de outro tenant, segredo, ou interno de implementação.
 */
export function montarResposta({
  metrica,
  resultado,
  janela,
  escopo,
  comparacao = null,
  podeDrilldown = false,
}) {
  const estado = estadoDoResultado(resultado);
  const registros = resultado?.registros ?? null;

  return {
    metricId: metrica.metricId,
    name: metrica.name,
    version: metrica.version,
    window: {
      inicio: janela?.gte?.toISOString?.() ?? null,
      fim: janela?.lte?.toISOString?.() ?? null,
    },
    scope: escopo,
    status: estado,
    value: estado === 'VALUE' ? resultado.valor : null,
    /* O motivo do INSUFFICIENT viaja: sem ele o consumidor não sabe se falta dado, falta período
       ou falta configuração — e as três pedem ações diferentes. */
    reason: estado === 'INSUFFICIENT_DATA' ? resultado.motivo : null,
    comparison: comparacao,
    quality: {
      state: derivarConfianca({
        recordCount: registros,
        coverage:
          resultado?.incompletos != null && registros
            ? (registros - resultado.incompletos) / registros
            : null,
      }),
      recordCount: registros,
      incomplete: resultado?.incompletos ?? null,
      warnings: metrica.qualityRules ?? [],
    },
    lineage: {
      formula: metrica.formula,
      grain: metrica.grain,
      sourceEntities: metrica.sourceEntities,
      appliedFilters: metrica.filters,
      timeSemantics: metrica.timeSemantics,
      freshness: metrica.freshness,
    },
    permissions: { canDrillDown: podeDrilldown },
    /* O que o cliente PODE pedir, vindo do contrato. Sem isto o frontend teria de adivinhar as
       dimensões — e adivinhar vira lista escrita à mão que diverge do registro na primeira
       mudança. O backend revalida tudo que chegar de volta; esta lista é conveniência, nunca
       autoridade. */
    allowed: permitidos(metrica),
  };
}

/** Uma métrica é servível agora? `NOT_APPLICABLE` quando falta cálculo ou consulta. */
export function servivel(metricId) {
  return Boolean(CALCULADORES[metricId]) && temConsulta(metricId);
}

/** Reexportado para os controles: a permissão declarada continua conferível pelo contrato. */
export { podeVer };

/* ------------------------------------------------------------------ *
 * Redação de campo — a API nunca envia o que a permissão nega
 * ------------------------------------------------------------------ */

/**
 * Campos que sobrevivem à política, para um usuário.
 *
 * A REGRA QUE ISTO IMPÕE
 *   `CAN_VIEW_METRIC` não é `CAN_VIEW_ALL_UNDERLYING_FIELDS`. Chegar ao drilldown é um direito;
 *   ver quanto um colega ganhou por serviço é outro. Antes isso era uma linha embutida no handler
 *   com um único campo — funcionava e não era política: a próxima métrica financeira teria de
 *   redescobrir a regra, e a chance de esquecer um campo era só questão de tempo.
 *
 *   A redação acontece AQUI, no servidor. Mandar o campo e pedir que o frontend esconda seria
 *   segurança por acordo de cavalheiros: quem abrisse o DevTools veria tudo.
 *
 * A política é uma CONJUNÇÃO por campo: `comissaoGerada` exige `financeiro.ver` E `tecnicos.ver`,
 * porque é dado financeiro de uma pessoa. Exigir a mais nunca concede acesso indevido; exigir a
 * menos concede.
 *
 * Campo sem política declarada é considerado NÃO sensível e passa — a política cobre o que ela
 * nomeia. Por isso `EXP-FIELD-05` confere que todo campo financeiro conhecido está nomeado: uma
 * política que esquece um campo é pior que não ter política, porque parece completa.
 */
/**
 * Política PADRÃO por campo, aplicada a toda métrica.
 *
 * A REGRESSÃO QUE ISTO CORRIGE — pega em revisão própria, minutos depois de introduzida
 *   Ao generalizar o drilldown, o payload passou a carregar os quatro campos financeiros para
 *   TODAS as métricas. `servicos-concluidos` não declarava `fieldPolicy`, então nada era redigido:
 *   o campo que o Hub #1 protegia voltaria a sair para quem tem apenas `servicos.ver`. O drilldown
 *   viraria de novo a porta lateral que ele já tinha deixado de ser.
 *
 *   A causa é conceitual, não um esquecimento: a sensibilidade pertence ao CAMPO, não à métrica
 *   que por acaso o exibe. `comissaoGerada` é dado financeiro de uma pessoa em qualquer contexto.
 *   Amarrar a proteção à métrica exige que cada métrica futura se lembre — e uma delas não vai.
 *
 * A métrica pode ENDURECER um campo declarando exigência própria; não pode afrouxar, porque a
 * fusão é união de exigências.
 */
export const POLITICA_PADRAO_DE_CAMPO = Object.freeze({
  valorCobrado: [{ modulo: 'financeiro', acao: 'ver' }],
  valorMaterial: [{ modulo: 'financeiro', acao: 'ver' }],
  valorLiquido: [{ modulo: 'financeiro', acao: 'ver' }],
  comissaoGerada: [
    { modulo: 'financeiro', acao: 'ver' },
    { modulo: 'tecnicos', acao: 'ver' },
  ],
});

/** União das exigências: padrão + as da métrica. Exigir a mais nunca concede acesso indevido. */
export function politicaDaMetrica(metrica) {
  const propria = metrica.fieldPolicy ?? {};
  const campos = new Set([...Object.keys(POLITICA_PADRAO_DE_CAMPO), ...Object.keys(propria)]);
  const fundida = {};
  for (const campo of campos) {
    const vistas = new Set();
    fundida[campo] = [...(POLITICA_PADRAO_DE_CAMPO[campo] ?? []), ...(propria[campo] ?? [])].filter(
      ({ modulo, acao }) => {
        const chave = `${modulo}.${acao}`;
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      }
    );
  }
  return fundida;
}

export function camposPermitidos(metrica, usuario) {
  const policy = politicaDaMetrica(metrica);
  const permitidos = [];
  const omitidos = [];
  for (const [campo, exigencias] of Object.entries(policy)) {
    const ok = (exigencias ?? []).every(({ modulo, acao }) => pode(usuario, modulo, acao));
    (ok ? permitidos : omitidos).push(campo);
  }
  return { permitidos, omitidos: omitidos.sort() };
}

/**
 * Aplica a política a uma lista de registros. Os campos SEM política passam livres (id, local,
 * data); os COM política só passam quando a permissão existe.
 *
 * Devolve `omitidos` para que a interface saiba que a coluna não existe — em vez de renderizar
 * vazio, que o usuário leria como zero.
 */
export function redigirRegistros(metrica, registros, usuario) {
  const { omitidos } = camposPermitidos(metrica, usuario);
  const proibido = new Set(omitidos);
  return {
    camposOmitidos: omitidos,
    registros: registros.map((r) =>
      Object.fromEntries(Object.entries(r).filter(([campo]) => !proibido.has(campo)))
    ),
  };
}
