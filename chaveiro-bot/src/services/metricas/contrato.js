/**
 * Metric Foundation — CONTRATO.  [Feature METRIC_FOUNDATION · P9]
 *
 * POR QUE A FUNDAÇÃO VEM ANTES DO CRM, E ANTES DE QUALQUER GRÁFICO
 *   Métrica não é consequência de ter dado; é consequência de ter DECISÃO. Instrumentar depois de
 *   construir o fluxo é adivinhação: descobre-se tarde que o estado necessário para medir
 *   conversão, drop-off ou ciclo de vida nunca foi persistido, e o histórico perdido não volta.
 *   Por isso esta camada define o que precisa ser preservado ANTES de o CRM existir.
 *
 * A CADEIA OBRIGATÓRIA
 *   ROLE → DECISION → QUESTION → METRIC → FORMULA → DIMENSIONS → REQUIRED DATA → DRILLDOWN → ACTION
 *
 *   Métrica sem decisão associada é gráfico bonito. O verificador reprova quem não fecha a cadeia —
 *   e essa é a checagem que mais vai doer, porque quase toda métrica "óbvia" falha nela.
 *
 * DUAS SEPARAÇÕES QUE O CONTRATO IMPÕE
 *
 *   1. VER AGREGADO ≠ VER REGISTRO. Um funcionário pode legitimamente ver a própria produção sem
 *      poder ver o faturamento da empresa; e quem vê um total não ganha, por isso, o direito de
 *      listar as linhas que o compõem. `securityScope` separa `agregado` de `drilldown`, e o
 *      produto já faz essa distinção hoje (`requirePermissao('dashboard','ver')` para o agregado,
 *      `podeProprio(req.user,'ver_metricas')` para o self-scope) — o contrato formaliza o que já
 *      existe em vez de inventar um modelo paralelo.
 *
 *   2. DISPONÍVEL ≠ DESEJÁVEL. Uma métrica pode ser perfeitamente definida e ainda assim
 *      impossível hoje, porque o modelo que ela exige não existe. Isso é `REQUIRES_*`, não
 *      "backlog" — e a classificação é DERIVADA do schema, não declarada por quem escreve.
 */

/** Os papéis do produto. Congelados: `dono`, `gestor`, `funcionario`. Não existe papel `tecnico`. */
export const PAPEIS = Object.freeze(['dono', 'gestor', 'funcionario']);

/** Campos obrigatórios de uma métrica. Ordem do contrato. */
export const CAMPOS_DA_METRICA = Object.freeze([
  'metricId',
  'name',
  'description',
  'businessQuestion',
  'decisionSupported',
  'formula',
  'grain',
  'sourceEntities',
  'filters',
  'dimensions',
  'timeSemantics',
  'comparisons',
  'freshness',
  'qualityRules',
  'drilldown',
  'relatedMetrics',
  'securityScope',
  'version',
]);

/**
 * Classificação de disponibilidade. DERIVADA do schema — ver `tools/admai-delivery/metric/availability.mjs` (raiz do repositório; a exploração de 2026-08-23 procurou o módulo AO LADO deste arquivo e o deu por inexistente).
 * `INSUFFICIENT_DATA` e `DEFINITION_CONFLICT` são desfechos legítimos, não falhas a esconder.
 */
export const CLASSES_DE_DISPONIBILIDADE = Object.freeze([
  'AVAILABLE_NOW',
  'AVAILABLE_AFTER_MODEL_NORMALIZATION',
  'REQUIRES_CUSTOMER',
  'REQUIRES_SCHEDULING',
  'REQUIRES_BUDGET',
  'REQUIRES_WARRANTY',
  'REQUIRES_CRM',
  'REQUIRES_MORE_HISTORY',
  'INSUFFICIENT_DATA',
  'DEFINITION_CONFLICT',
]);

/** Famílias de métrica. `CRM_FUTURE` existe para ser preparada, não implementada agora. */
export const FAMILIAS = Object.freeze([
  'BUSINESS_HEALTH',
  'FINANCIAL',
  'OPERATIONS',
  'TEAM',
  'QUALITY',
  'CUSTOMER',
  'SCHEDULING',
  'BUDGET',
  'CRM_FUTURE',
]);

/** Módulos de Hub. Cada métrica escolhe os aplicáveis — nenhuma usa todos. */
export const MODULOS_DE_HUB = Object.freeze([
  'Hero',
  'Pulse',
  'Timeline',
  'Comparison',
  'Decomposition',
  'Distribution',
  'Segmentation',
  'DriverAnalysis',
  'AnomalyRadar',
  'RelatedMetrics',
  'Goals',
  'ActionCenter',
  'DataConfidence',
  'Lineage',
  'UnderlyingRecords',
  'AdmIntelligence',
]);

/**
 * Estados de confiança do dado. DETERMINÍSTICOS, derivados de critérios explícitos — nunca um
 * percentual inventado. "87% de confiança" não significa nada se ninguém sabe de onde saiu o 87.
 */
export const ESTADOS_DE_CONFIANCA = Object.freeze(['HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT']);

export const CRITERIOS_DE_CONFIANCA = Object.freeze([
  'missingData',
  'coverage',
  'freshness',
  'recordCount',
  'invalidValues',
  'unsupportedDimension',
]);

/**
 * Deriva a confiança a partir de critérios OBSERVADOS. Pura.
 *
 * A ordem é deliberada: `INSUFFICIENT` domina, porque não faz sentido chamar de "confiança baixa"
 * um número calculado sobre zero registros — isso é ausência de resultado, não resultado fraco.
 */
export function derivarConfianca({
  recordCount = null,
  coverage = null,
  freshnessHoras = null,
  invalidValues = 0,
  unsupportedDimension = false,
} = {}) {
  if (recordCount === null || coverage === null) return 'INSUFFICIENT';
  if (recordCount === 0) return 'INSUFFICIENT';
  if (unsupportedDimension) return 'INSUFFICIENT';
  if (coverage < 0.5 || invalidValues > recordCount * 0.1) return 'LOW';
  if (coverage < 0.9 || (freshnessHoras !== null && freshnessHoras > 24)) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Valida uma métrica contra o contrato. PURA — os controles atravessam esta função.
 * Devolve a lista de violações; vazia significa conforme.
 */
export function violacoesDaMetrica(m) {
  const fora = [];
  if (!m || typeof m !== 'object') return ['métrica não é objeto'];

  for (const campo of CAMPOS_DA_METRICA) {
    if (!(campo in m)) fora.push(`campo obrigatório ausente: ${campo}`);
  }

  const preenchido = (v) => typeof v === 'string' && v.trim() !== '';

  /* A cadeia que dá razão de existir à métrica. Vazio não é preenchimento. */
  if (!preenchido(m.businessQuestion))
    fora.push('sem businessQuestion — métrica que não responde pergunta não se justifica');
  if (!preenchido(m.formula)) fora.push('sem fórmula — número sem origem explicável');
  if (!Array.isArray(m.decisionSupported) || m.decisionSupported.length === 0) {
    fora.push('sem decisionSupported — métrica sem decisão associada é gráfico, não instrumento');
  }
  for (const d of m.decisionSupported ?? []) {
    if (!PAPEIS.includes(d.papel)) fora.push(`decisão com papel fora do contrato: ${d.papel}`);
    if (!preenchido(d.decisao)) fora.push(`decisão sem texto em ${m.metricId}`);
    if (!preenchido(d.acao))
      fora.push(
        `decisão sem AÇÃO possível em ${m.metricId} — se nada muda, a métrica não suporta decisão`
      );
  }

  if (!FAMILIAS.includes(m.familia)) fora.push(`família fora do contrato: ${m.familia}`);
  if (!Array.isArray(m.sourceEntities) || m.sourceEntities.length === 0) {
    fora.push('sem sourceEntities — sem lineage não há origem explicável');
  }

  /* Segurança: os dois eixos precisam existir, e drilldown não pode ser mais permissivo que
     agregado. Um funcionário que vê o próprio total não pode listar os registros da empresa. */
  const s = m.securityScope;
  if (!s || typeof s !== 'object') {
    fora.push('sem securityScope — quem vê agregado e quem faz drilldown precisa estar declarado');
  } else {
    const papeisInvalidos = [...(s.agregado ?? []), ...(s.drilldown ?? [])].filter(
      (p) => !PAPEIS.includes(p)
    );
    if (papeisInvalidos.length)
      fora.push(`securityScope com papel inexistente: ${papeisInvalidos.join(', ')}`);
    if (!Array.isArray(s.agregado) || s.agregado.length === 0)
      fora.push('securityScope.agregado vazio');
    if (!Array.isArray(s.drilldown)) fora.push('securityScope.drilldown ausente');
    const drilldownAMais = (s.drilldown ?? []).filter((p) => !(s.agregado ?? []).includes(p));
    if (drilldownAMais.length) {
      fora.push(
        `drilldown mais permissivo que agregado para ${drilldownAMais.join(', ')} — ver o total não autoriza listar os registros`
      );
    }
    if (!preenchido(s.tenantScope))
      fora.push('securityScope.tenantScope ausente — toda métrica é escopada por empresa');
  }

  if (!Array.isArray(m.hubModules) || m.hubModules.length === 0) {
    fora.push('sem hubModules — cada métrica escolhe os módulos aplicáveis');
  }
  const modulosInvalidos = (m.hubModules ?? []).filter((x) => !MODULOS_DE_HUB.includes(x));
  if (modulosInvalidos.length)
    fora.push(`módulo de Hub inexistente: ${modulosInvalidos.join(', ')}`);

  /* Lineage antes de estética: quem tem UnderlyingRecords precisa declarar quem pode vê-los. */
  if (
    (m.hubModules ?? []).includes('UnderlyingRecords') &&
    (m.securityScope?.drilldown ?? []).length === 0
  ) {
    fora.push(
      'Hub expõe UnderlyingRecords mas nenhum papel tem drilldown — módulo inalcançável ou permissão implícita'
    );
  }

  return fora;
}
