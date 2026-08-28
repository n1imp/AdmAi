/**
 * Capability registry do AdmAi — manifesto ESTÁTICO e leve (Refoundation FR-9, §25).
 *
 * Evolui o mecanismo existente de feature flags para a unidade real do produto: a capability.
 * Cada entrada declara identidade, estado de ciclo de vida e as rotas que ela possui. A regra
 * de exposição (§26) é única e central:
 *
 *   lifecycleState CURRENT            → exposta
 *   qualquer outro estado             → exposta SÓ se a flag correspondente estiver ligada
 *                                        (default OFF: ausência de variável = fora do ar)
 *
 * O que este arquivo NÃO é: plugin runtime, sistema de contribuição, roteador. A navegação
 * derivada (enabled + permissão efetiva + papel → nav) entra junto com o novo App Shell
 * (FR-12); até lá o registry é a fonte de verdade verificável — os fitness tests garantem a
 * coerência com o router real (App.jsx) para o registry nunca virar documento morto.
 *
 * @typedef {Object} CapabilityManifest
 * @property {string} id                      id canônico (= ledger/scope freeze)
 * @property {'CURRENT'|'DISABLED'|'POST_MVP'|'DEFERRED_BY_SCOPE'|'EXPERIMENTAL'} lifecycleState
 * @property {string=} flag                   chave em FLAGS quando não-CURRENT
 * @property {string[]} routes                rotas de produto que a capability possui
 */
import { FLAGS } from './featureFlags.js';

/** @type {ReadonlyArray<CapabilityManifest>} */
export const CAPABILITIES = Object.freeze([
  // ── MVP (scope freeze 1.1.0: 20 features; capabilities com superfície própria) ──
  {
    id: 'AUTH_LOGIN',
    lifecycleState: 'CURRENT',
    routes: ['/login', '/magic-link', '/recuperar-senha', '/redefinir-senha', '/trocar-senha'],
  },
  { id: 'ONBOARDING', lifecycleState: 'CURRENT', routes: ['/verificar-email', '/convite/:token'] },
  {
    id: 'SERVICOS_CRUD',
    lifecycleState: 'CURRENT',
    routes: ['/servicos', '/servicos/novo', '/meus-servicos', '/meus-servicos/novo'],
  },
  { id: 'APROVACOES', lifecycleState: 'CURRENT', routes: ['/aprovacoes'] },
  {
    id: 'TECNICOS',
    lifecycleState: 'CURRENT',
    routes: ['/tecnicos', '/tecnicos/novo', '/tecnicos/:id'],
  },
  { id: 'PONTO', lifecycleState: 'CURRENT', routes: ['/meu-ponto'] },
  { id: 'ESTOQUE', lifecycleState: 'CURRENT', routes: ['/materiais', '/estoque'] },
  { id: 'FINANCEIRO', lifecycleState: 'CURRENT', routes: ['/reparticao'] },
  // '/' escolhe MeuPainel/GestorHome/Dashboard por papel (Home) — uma rota, três composições.
  {
    id: 'INDICADORES',
    lifecycleState: 'CURRENT',
    routes: ['/', '/metricas/faturamento-liquido', '/metricas/servicos-concluidos'],
  },
  { id: 'DOCUMENTOS', lifecycleState: 'CURRENT', routes: ['/meus-documentos'] },
  {
    id: 'CONFIGURACOES',
    lifecycleState: 'CURRENT',
    routes: ['/configuracao', '/configuracao/perfil'],
  },
  { id: 'SEGURANCA', lifecycleState: 'CURRENT', routes: ['/configuracao/seguranca'] },
  { id: 'ADMIN', lifecycleState: 'CURRENT', routes: ['/configuracao/usuarios'] },
  { id: 'AUDITORIA', lifecycleState: 'CURRENT', routes: ['/configuracao/auditoria'] },

  // ── Fora do MVP: rota SÓ existe com a flag ligada (fronteira única por capability) ──
  {
    id: 'WHATSAPP',
    lifecycleState: 'POST_MVP',
    flag: 'WHATSAPP',
    routes: ['/configuracao/whatsapp'],
  },
  {
    id: 'NOTIFICACOES',
    lifecycleState: 'DEFERRED_BY_SCOPE',
    flag: 'NOTIFICACOES',
    routes: ['/configuracao/notificacoes'],
  },
  {
    id: 'GOOGLE_REVIEWS',
    lifecycleState: 'DEFERRED_BY_SCOPE',
    flag: 'GOOGLE_REVIEWS',
    routes: ['/avaliacoes'],
  },
  {
    id: 'SUBSCRIPTIONS_BILLING',
    lifecycleState: 'DEFERRED_BY_SCOPE',
    flag: 'SUBSCRIPTIONS_BILLING',
    routes: ['/assinatura'],
  },
  { id: 'METRIC_HUBS', lifecycleState: 'DEFERRED_BY_SCOPE', flag: 'METRIC_HUBS', routes: [] },
]);

const POR_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

/**
 * A capability está exposta no produto AGORA? (regra única de exposição, §26)
 * Consulta FLAGS diretamente — `featureAtiva` devolve `true` para nome DESCONHECIDO (contrato
 * dela: só diferidas têm flag), o que aqui viraria exposição acidental de capability futura.
 */
export function capabilityAtiva(id, manifesto = POR_ID.get(id)) {
  if (!manifesto) return false;
  if (manifesto.lifecycleState === 'CURRENT') return true;
  return manifesto.flag in FLAGS && FLAGS[manifesto.flag] === true;
}

/** Rotas expostas dado o estado atual das flags — insumo da navegação derivada (FR-12). */
export function rotasExpostas(capabilities = CAPABILITIES) {
  return capabilities.filter((c) => capabilityAtiva(c.id, c)).flatMap((c) => c.routes);
}
