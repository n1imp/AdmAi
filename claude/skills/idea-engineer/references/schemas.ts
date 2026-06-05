/**
 * schemas.ts — Validações de runtime para o pipeline idea-engineer
 *
 * Validação dos JSONs emitidos por cada fase, executada pelo Artifact antes de
 * passar dados para a próxima fase. Bloqueia outputs malformados e dispara o
 * fluxo de reexecução descrito em pipeline-orchestration.md Seção 3.5.
 *
 * Uso no Artifact (sem build step):
 *
 *   <script type="module">
 *     import { z } from 'https://esm.sh/zod@3.23.8';
 *     // ... copie/cole o conteúdo deste arquivo aqui, OU sirva como módulo separado
 *     const result = validate(ContextAnalystResponseSchema, jsonFromApi);
 *     if (!result.ok) { /* tratar erro */ }
 *   </script>
 */

import { z } from 'zod';

// ============================================================================
// SCHEMAS COMUNS
// ============================================================================

/** Resposta NEEDS_INPUT — pode vir das Fases 0 ou 1. */
export const NeedsInputResponseSchema = z.object({
  status: z.literal('NEEDS_INPUT'),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(4),
      })
    )
    .min(1)
    .max(3),
});

/** Resposta de erro — qualquer fase pode emitir. */
export const ErrorResponseSchema = z.object({
  status: z.literal('ERROR'),
  reason: z.string().min(1),
  details: z.string().optional(),
});

/** Citação de fonte (Fases 1 e 2). */
const SourceSchema = z.object({
  claim: z.string().min(1),
  url: z.string().url(),
  publisher: z.string().min(1),
  year: z.number().int().min(2000).max(2035),
});

/** Item do plano de pesquisa (Fases 1 e 2). */
const ResearchPlanItemSchema = z.object({
  query: z.string().min(1),
  answers: z.string().min(1),
});

const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
const SeveritySchema = z.enum(['low', 'medium', 'high']);

// ============================================================================
// FASE 0 — CONTEXT ANALYST
// ============================================================================

export const ProjectStageSchema = z.enum(['zero', 'early', 'mid', 'production']);
export const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced']);

export const ExistingStackSchema = z.object({
  frontend: z.string().nullable(),
  backend: z.string().nullable(),
  database: z.string().nullable(),
  auth: z.string().nullable(),
  hosting: z.string().nullable(),
  other: z.array(z.string()),
});

export const ConstraintsSchema = z.object({
  budget_brl: z.number().nullable(),
  timeline_months: z.number().nullable(),
  team_size: z.number().int().positive().nullable(),
  technical_skill_level: SkillLevelSchema,
});

export const ContextAnalystCompleteSchema = z.object({
  status: z.literal('COMPLETE'),
  project_stage: ProjectStageSchema,
  existing_stack: ExistingStackSchema,
  decisions_made: z.array(z.string()),
  constraints: ConstraintsSchema,
  open_questions: z.array(z.string()),
  summary: z.string().min(20),

  // Metadados aditivos (Fase 1 ignora; Artifact usa para renderizar auditoria)
  _evidence: z
    .record(z.string(), z.union([z.string(), z.array(z.string())]))
    .optional(),
  _confidence: z
    .object({
      project_stage: ConfidenceSchema,
      existing_stack: ConfidenceSchema,
      decisions_made: ConfidenceSchema,
      constraints: ConfidenceSchema,
      technical_skill_level: ConfidenceSchema,
    })
    .optional(),
  _inconsistencies: z
    .array(
      z.object({
        field: z.string(),
        sources: z.array(z.string()).min(2),
        resolution: z.string(),
      })
    )
    .optional(),
});

export const ContextAnalystResponseSchema = z.union([
  ContextAnalystCompleteSchema,
  NeedsInputResponseSchema,
  ErrorResponseSchema,
]);

// ============================================================================
// FASE 1 — BUSINESS STRATEGIST
// ============================================================================

export const VerdictSchema = z.enum(['proceed', 'proceed_with_pivot', 'stop']);
export const BusinessModelTypeSchema = z.enum([
  'subscription',
  'transactional',
  'marketplace',
  'ads',
  'freemium',
  'hybrid',
]);
export const PricingMethodSchema = z.enum([
  'value-based',
  'cost-plus',
  'competitor-based',
  'freemium',
]);

const UnitEconomicsScenarioSchema = z.object({
  avg_ticket_brl: z.number().nonnegative(),
  gross_margin_pct: z.number().min(0).max(100),
  cac_brl: z.number().nonnegative(),
  ltv_brl: z.number().nonnegative(),
  ltv_cac_ratio: z.number().nonnegative(),
  payback_months: z.number().nonnegative(),
  breakeven_units: z.number().int().nonnegative(),
  breakeven_months: z.number().nonnegative(),
});

export const BusinessStrategistCompleteSchema = z.object({
  status: z.literal('COMPLETE'),
  verdict: VerdictSchema,
  halt_pipeline: z.boolean(),
  pivot_recommendation: z.string().optional(),

  scores: z.object({
    market: z.number().int().min(1).max(10),
    model: z.number().int().min(1).max(10),
    moat: z.number().int().min(1).max(10),
    operator_fit: z.number().int().min(1).max(10),
  }),

  business_model: z.object({
    type: BusinessModelTypeSchema,
    details: z.string().min(1),
  }),

  pricing: z.object({
    method: PricingMethodSchema,
    recommended_range_brl: z.tuple([z.number(), z.number()]),
    rationale: z.string().min(1),
  }),

  unit_economics: z.object({
    scenario_base: UnitEconomicsScenarioSchema,
    scenario_pessimistic: UnitEconomicsScenarioSchema,
    scenario_optimistic: UnitEconomicsScenarioSchema,
  }),

  icp: z.object({
    primary_persona: z.string().min(1),
    acquisition_channels: z.array(
      z.object({
        channel: z.string().min(1),
        estimated_cac_brl: z.number().nonnegative(),
        priority: z.number().int().positive(),
        fit: z.enum(['high', 'medium', 'low']),
      })
    ),
  }),

  critical_hypotheses: z.array(
    z.object({
      hypothesis: z.string().min(1),
      test_method: z.string().min(1),
      test_cost_brl: z.number().nonnegative(),
      test_duration_days: z.number().int().positive(),
      success_criterion: z.string().min(1),
    })
  ),

  required_integrations: z.array(z.string()),
  mvp_features_business_constrained: z.array(z.string()),
  kill_criteria: z.array(z.string()),

  regional_notes: z.object({
    legal_structure: z.string(),
    payment_methods: z.array(z.string()),
    logistics_notes: z.string().optional(),
    consumer_behavior_notes: z.string().optional(),
  }),

  sources: z.array(SourceSchema),
  unverified_assumptions: z.array(z.string()),
  research_plan: z.array(ResearchPlanItemSchema),
});

export const BusinessStrategistResponseSchema = z.union([
  BusinessStrategistCompleteSchema,
  NeedsInputResponseSchema,
  ErrorResponseSchema,
]);

// ============================================================================
// FASE 2 — TECH ARCHITECT
// ============================================================================

export const ArchitecturePatternSchema = z.enum([
  'monolith',
  'modular_monolith',
  'microservices',
  'serverless',
  'jamstack',
]);

export const FinalStackSchema = z.object({
  frontend: z.string().min(1),
  backend: z.string().min(1),
  database: z.string().min(1),
  auth: z.string().min(1),
  hosting: z.string().min(1),
  observability: z.string().nullable(),
  payment: z.string().min(1),
  email: z.string().nullable(),
  search: z.string().nullable(),
  queue: z.string().nullable(),
  cache: z.string().nullable(),
  cdn: z.string().nullable(),
  other: z.array(z.string()),
});

export const TechArchitectCompleteSchema = z.object({
  status: z.literal('COMPLETE'),
  halt_was_overridden: z.boolean(),

  architecture_pattern: ArchitecturePatternSchema,
  architecture_rationale: z.string().min(1),

  final_stack: FinalStackSchema,

  stack_changes_from_phase_0: z.object({
    kept: z.array(z.string()),
    added: z.array(z.string()),
    modified: z.array(z.string()),
  }),

  mvp_features: z.object({
    from_existing: z.array(z.string()),
    from_business_required: z.array(
      z.object({
        feature: z.string().min(1),
        estimate_hours: z.number().nonnegative(),
        dependencies: z.array(z.string()),
      })
    ),
    additional_technical: z.array(
      z.object({
        feature: z.string().min(1),
        estimate_hours: z.number().nonnegative(),
        justification: z.string().min(1),
      })
    ),
  }),

  integrations: z.array(
    z.object({
      name: z.string().min(1),
      provider: z.string().min(1),
      pricing_brl_month: z.number().nonnegative(),
      fee_pct: z.number().min(0).max(100),
      sdk_or_api: z.string().min(1),
      alternatives_rejected: z.array(
        z.object({ alt: z.string(), reason: z.string() })
      ),
    })
  ),

  infrastructure: z.object({
    monthly_cost_brl: z.object({
      pessimistic: z.number().nonnegative(),
      base: z.number().nonnegative(),
      optimistic: z.number().nonnegative(),
    }),
    breakdown_base: z.array(
      z.object({
        component: z.string().min(1),
        cost_brl: z.number().nonnegative(),
      })
    ),
    margin_validation: z.object({
      expected_revenue_month_6_brl: z.number().nonnegative(),
      infra_pct_of_revenue: z.number().nonnegative(),
      allowed_pct: z.number().nonnegative(),
      passes_margin_check: z.boolean(),
    }),
  }),

  measurement_infrastructure: z.array(
    z.object({
      hypothesis_or_criterion: z.string().min(1),
      source: z.enum(['critical_hypothesis', 'kill_criterion']),
      metric: z.string().min(1),
      instrumentation: z.string().min(1),
      storage: z.string().min(1),
      access: z.string().min(1),
    })
  ),

  development_estimate: z.object({
    team_size: z.number().int().positive(),
    skill_level: SkillLevelSchema,
    setup_hours: z.number().nonnegative(),
    mvp_total_hours: z.number().nonnegative(),
    mvp_total_weeks: z.number().nonnegative(),
    feature_breakdown_hours: z.array(
      z.object({
        feature: z.string().min(1),
        hours: z.number().nonnegative(),
      })
    ),
    risk_areas: z.array(z.string()),
  }),

  no_code_accelerators: z.array(
    z.object({
      area: z.string().min(1),
      tool: z.string().min(1),
      saves_hours: z.number().nonnegative(),
      monthly_cost_brl: z.number().nonnegative(),
    })
  ),

  technical_debts: z.array(
    z.object({
      item: z.string().min(1),
      severity: SeveritySchema,
      comes_due_at: z.string().min(1),
    })
  ),

  scaling_plan: z.array(
    z.object({
      component: z.string().min(1),
      breaks_at: z.string().min(1),
      next_step: z.string().min(1),
    })
  ),

  validations: z.object({
    all_required_integrations_assigned: z.boolean(),
    all_mvp_business_features_included: z.boolean(),
    all_critical_hypotheses_measurable: z.boolean(),
    all_kill_criteria_measurable: z.boolean(),
    infra_within_margin: z.boolean(),
    stack_compatible_with_skill_level: z.boolean(),
    regional_payment_compliance: z.boolean(),
    existing_stack_preserved: z.boolean(),
  }),

  validation_failures_explained: z.array(
    z.object({
      validation: z.string(),
      reason: z.string(),
      tradeoff_proposed: z.string(),
    })
  ),

  sources: z.array(SourceSchema),
  unverified_assumptions: z.array(z.string()),
  research_plan: z.array(ResearchPlanItemSchema),
});

export const TechArchitectResponseSchema = z.union([
  TechArchitectCompleteSchema,
  ErrorResponseSchema,
]);

// ============================================================================
// FASE 3 — SYNTHESIS
// ============================================================================

export const SynthesisCompleteSchema = z.object({
  status: z.literal('COMPLETE'),
  halt_was_overridden: z.boolean(),

  prompts: z.object({
    for_ai: z.object({
      content: z.string().min(400),
      word_count: z.number().int().positive(),
    }),
    for_human: z.object({
      content: z.string().min(500),
      word_count: z.number().int().positive(),
    }),
  }),

  validation_results: z.object({
    all_business_features_in_ai_prompt: z.boolean(),
    all_integrations_in_ai_prompt: z.boolean(),
    all_telemetry_in_ai_prompt: z.boolean(),
    stack_justification_in_human_prompt: z.boolean(),
    scaling_plan_in_human_prompt: z.boolean(),
    halt_notice_present_if_needed: z.boolean(),
    no_phase_references: z.boolean(),
    word_counts_within_range: z.boolean(),
  }),

  synthesis_notes: z.string(),
});

export const SynthesisResponseSchema = z.union([
  SynthesisCompleteSchema,
  ErrorResponseSchema,
]);

// ============================================================================
// TIPOS INFERIDOS (para uso em TypeScript)
// ============================================================================

export type ContextAnalystComplete = z.infer<typeof ContextAnalystCompleteSchema>;
export type BusinessStrategistComplete = z.infer<typeof BusinessStrategistCompleteSchema>;
export type TechArchitectComplete = z.infer<typeof TechArchitectCompleteSchema>;
export type SynthesisComplete = z.infer<typeof SynthesisCompleteSchema>;
export type NeedsInputResponse = z.infer<typeof NeedsInputResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================================================
// HELPER: validate com formatação de erros legível
// ============================================================================

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[]; rawData: unknown };

/**
 * Valida `data` contra `schema`. Retorna { ok: true, data } em sucesso
 * ou { ok: false, errors, rawData } em falha, com erros formatados como
 * "campo.aninhado: mensagem".
 */
export function validate<T>(
  schema: z.ZodType<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
  return { ok: false, errors, rawData: data };
}

// ============================================================================
// VALIDAÇÕES DE LÓGICA CRUZADA (além do schema estrutural)
// ============================================================================

/**
 * Validações da Fase 1 que dependem de coerência entre campos.
 * Roda DEPOIS do schema passar. Retorna lista de erros (vazia = ok).
 */
export function validateBusinessStrategistLogic(
  data: BusinessStrategistComplete
): string[] {
  const errors: string[] = [];

  // Coerência de halt_pipeline com verdict
  if (data.verdict === 'stop' && !data.halt_pipeline) {
    errors.push("verdict='stop' requer halt_pipeline=true");
  }

  // Coerência de pivot_recommendation com verdict
  if (
    data.verdict === 'proceed_with_pivot' &&
    (!data.pivot_recommendation || data.pivot_recommendation.length < 10)
  ) {
    errors.push(
      "verdict='proceed_with_pivot' requer pivot_recommendation preenchido (≥10 chars)"
    );
  }

  // Coerência aritmética dentro de cada cenário de unit economics
  for (const sc of ['scenario_base', 'scenario_pessimistic', 'scenario_optimistic'] as const) {
    const s = data.unit_economics[sc];
    if (s.cac_brl > 0) {
      const expected = s.ltv_brl / s.cac_brl;
      if (Math.abs(expected - s.ltv_cac_ratio) > 0.15) {
        errors.push(
          `${sc}: ltv_cac_ratio (${s.ltv_cac_ratio}) inconsistente com ltv_brl/cac_brl (${expected.toFixed(2)})`
        );
      }
    }
  }

  // Output sem fontes nem hipóteses é suspeito (todo número saiu do ar)
  if (data.sources.length === 0 && data.unverified_assumptions.length === 0) {
    errors.push(
      'output sem sources nem unverified_assumptions — todos os números precisam ter origem ou ser declarados como hipótese'
    );
  }

  // Score baixo + verdict=proceed é suspeito
  const avgScore =
    (data.scores.market + data.scores.model + data.scores.moat + data.scores.operator_fit) / 4;
  if (avgScore < 4 && data.verdict === 'proceed') {
    errors.push(
      `score médio (${avgScore.toFixed(1)}) baixo, mas verdict='proceed' — revisar`
    );
  }

  return errors;
}

/**
 * Validações da Fase 2: cada item obrigatório da Fase 1 tem que estar refletido
 * no output da Fase 2.
 */
export function validateTechArchitectLogic(
  data: TechArchitectComplete,
  phase1: BusinessStrategistComplete
): string[] {
  const errors: string[] = [];

  // Toda required_integration deve ter linha em integrations[]
  for (const required of phase1.required_integrations) {
    const found = data.integrations.some(
      (i) =>
        i.name.toLowerCase() === required.toLowerCase() ||
        i.name.toLowerCase().includes(required.toLowerCase()) ||
        required.toLowerCase().includes(i.name.toLowerCase())
    );
    if (!found) {
      errors.push(`required_integration "${required}" ausente em integrations[]`);
    }
  }

  // Toda mvp_feature obrigatória deve estar em from_business_required
  for (const required of phase1.mvp_features_business_constrained) {
    const found = data.mvp_features.from_business_required.some(
      (f) =>
        f.feature.toLowerCase() === required.toLowerCase() ||
        f.feature.toLowerCase().includes(required.toLowerCase().substring(0, 20))
    );
    if (!found) {
      errors.push(
        `mvp_feature obrigatória "${required.substring(0, 50)}..." ausente em mvp_features.from_business_required`
      );
    }
  }

  // Toda critical_hypothesis precisa de measurement_infrastructure
  for (const hyp of phase1.critical_hypotheses) {
    const found = data.measurement_infrastructure.some(
      (m) =>
        m.source === 'critical_hypothesis' &&
        (m.hypothesis_or_criterion === hyp.hypothesis ||
          m.hypothesis_or_criterion.includes(hyp.hypothesis.substring(0, 25)))
    );
    if (!found) {
      errors.push(
        `critical_hypothesis "${hyp.hypothesis.substring(0, 40)}..." ausente em measurement_infrastructure`
      );
    }
  }

  // Todo kill_criterion precisa de measurement_infrastructure
  for (const kc of phase1.kill_criteria) {
    const found = data.measurement_infrastructure.some(
      (m) =>
        m.source === 'kill_criterion' &&
        (m.hypothesis_or_criterion === kc ||
          m.hypothesis_or_criterion.includes(kc.substring(0, 25)))
    );
    if (!found) {
      errors.push(
        `kill_criterion "${kc.substring(0, 40)}..." ausente em measurement_infrastructure`
      );
    }
  }

  // Coerência da flag passes_margin_check
  const { infra_pct_of_revenue, allowed_pct, passes_margin_check } =
    data.infrastructure.margin_validation;
  const actuallyPasses = infra_pct_of_revenue <= allowed_pct;
  if (passes_margin_check !== actuallyPasses) {
    errors.push(
      `passes_margin_check=${passes_margin_check} mas infra_pct_of_revenue(${infra_pct_of_revenue}) ${actuallyPasses ? '≤' : '>'} allowed_pct(${allowed_pct})`
    );
  }

  // Custo de infra base deve estar entre pessimista e otimista
  const { pessimistic, base, optimistic } = data.infrastructure.monthly_cost_brl;
  if (!(pessimistic <= base && base <= optimistic)) {
    errors.push(
      `infrastructure.monthly_cost_brl: ordenação inválida — pessimistic(${pessimistic}) ≤ base(${base}) ≤ optimistic(${optimistic})`
    );
  }

  return errors;
}

/**
 * Validações da Fase 3: ambos os prompts devem refletir o output da Fase 2.
 */
export function validateSynthesisLogic(
  data: SynthesisComplete,
  phase2: TechArchitectComplete
): string[] {
  const errors: string[] = [];
  const promptA = data.prompts.for_ai.content;
  const promptB = data.prompts.for_human.content;

  // Word counts conferem
  const actualWordsA = promptA.trim().split(/\s+/).length;
  const actualWordsB = promptB.trim().split(/\s+/).length;
  if (Math.abs(actualWordsA - data.prompts.for_ai.word_count) > 5) {
    errors.push(
      `prompts.for_ai.word_count=${data.prompts.for_ai.word_count} mas contagem real é ${actualWordsA}`
    );
  }
  if (Math.abs(actualWordsB - data.prompts.for_human.word_count) > 5) {
    errors.push(
      `prompts.for_human.word_count=${data.prompts.for_human.word_count} mas contagem real é ${actualWordsB}`
    );
  }

  // Faixas de palavras
  if (actualWordsA < 350 || actualWordsA > 700) {
    errors.push(`Prompt A fora da faixa esperada (350-700 palavras): ${actualWordsA}`);
  }
  if (actualWordsB < 450 || actualWordsB > 800) {
    errors.push(`Prompt B fora da faixa esperada (450-800 palavras): ${actualWordsB}`);
  }

  // Prompt A começa com a abertura canônica
  if (!promptA.trim().startsWith('Você está ajudando a construir')) {
    errors.push("Prompt A deve começar com 'Você está ajudando a construir...'");
  }

  // Nenhum prompt referencia "as fases anteriores"
  const forbiddenPhrases = [
    'como discutido',
    'como mencionado',
    'a análise anterior',
    'as fases anteriores',
    'conforme apontado',
    'a análise apontou',
  ];
  for (const phrase of forbiddenPhrases) {
    if (promptA.toLowerCase().includes(phrase)) {
      errors.push(`Prompt A contém referência proibida: "${phrase}"`);
    }
    if (promptB.toLowerCase().includes(phrase)) {
      errors.push(`Prompt B contém referência proibida: "${phrase}"`);
    }
  }

  // Toda integration da Fase 2 deve aparecer no Prompt A
  for (const integration of phase2.integrations) {
    const promptALower = promptA.toLowerCase();
    if (
      !promptALower.includes(integration.provider.toLowerCase()) &&
      !promptALower.includes(integration.name.toLowerCase())
    ) {
      errors.push(
        `Prompt A não menciona integração "${integration.name}" (provedor: ${integration.provider})`
      );
    }
  }

  // Se halt_was_overridden, ambos os prompts devem ter aviso
  if (data.halt_was_overridden) {
    if (!promptA.toLowerCase().includes('análise comercial recomendou parar')) {
      errors.push(
        'halt_was_overridden=true mas Prompt A não inclui aviso visível'
      );
    }
    if (!promptB.toLowerCase().includes('análise comercial recomendou parar')) {
      errors.push(
        'halt_was_overridden=true mas Prompt B não inclui aviso visível'
      );
    }
  }

  return errors;
}

// ============================================================================
// VALIDAÇÃO COMBINADA: schema + lógica cruzada em uma chamada
// ============================================================================

export function validatePhase0(
  data: unknown
):
  | { ok: true; complete: true; data: ContextAnalystComplete }
  | { ok: true; complete: false; data: NeedsInputResponse }
  | { ok: false; errors: string[]; rawData: unknown } {
  const result = validate(ContextAnalystResponseSchema, data);
  if (!result.ok) return result;
  if ('status' in result.data && result.data.status === 'COMPLETE') {
    return { ok: true, complete: true, data: result.data };
  }
  if ('status' in result.data && result.data.status === 'NEEDS_INPUT') {
    return { ok: true, complete: false, data: result.data };
  }
  return { ok: false, errors: ['unexpected status in Phase 0 response'], rawData: data };
}

export function validatePhase1(
  data: unknown
):
  | { ok: true; complete: true; data: BusinessStrategistComplete; logicErrors: string[] }
  | { ok: true; complete: false; data: NeedsInputResponse }
  | { ok: false; errors: string[]; rawData: unknown } {
  const result = validate(BusinessStrategistResponseSchema, data);
  if (!result.ok) return result;
  if ('status' in result.data && result.data.status === 'COMPLETE') {
    const logicErrors = validateBusinessStrategistLogic(result.data);
    return { ok: true, complete: true, data: result.data, logicErrors };
  }
  if ('status' in result.data && result.data.status === 'NEEDS_INPUT') {
    return { ok: true, complete: false, data: result.data };
  }
  return { ok: false, errors: ['unexpected status in Phase 1 response'], rawData: data };
}

export function validatePhase2(
  data: unknown,
  phase1: BusinessStrategistComplete
):
  | { ok: true; data: TechArchitectComplete; logicErrors: string[] }
  | { ok: false; errors: string[]; rawData: unknown } {
  const result = validate(TechArchitectResponseSchema, data);
  if (!result.ok) return result;
  if (!('status' in result.data) || result.data.status !== 'COMPLETE') {
    return { ok: false, errors: ['Phase 2 returned non-COMPLETE'], rawData: data };
  }
  const logicErrors = validateTechArchitectLogic(result.data, phase1);
  return { ok: true, data: result.data, logicErrors };
}

export function validatePhase3(
  data: unknown,
  phase2: TechArchitectComplete
):
  | { ok: true; data: SynthesisComplete; logicErrors: string[] }
  | { ok: false; errors: string[]; rawData: unknown } {
  const result = validate(SynthesisResponseSchema, data);
  if (!result.ok) return result;
  if (!('status' in result.data) || result.data.status !== 'COMPLETE') {
    return { ok: false, errors: ['Phase 3 returned non-COMPLETE'], rawData: data };
  }
  const logicErrors = validateSynthesisLogic(result.data, phase2);
  return { ok: true, data: result.data, logicErrors };
}
