# ADMAI_FRONTEND_ARCHITECTURE_CONTRACT

Contrato da camada de produto frontend (Refoundation). As decisões estruturais vinculantes
moram em `ADMAI_DESIGN_DECISIONS.md` (DDR-1..5); este contrato fixa as REGRAS DE CAMADA que
toda slice obedece. Princípios soberanos: `BACKEND OWNS TRUTH · APPLICATION LAYER OWNS
TRANSLATION · PRODUCT FRONTEND OWNS EXPERIENCE · DESIGN SYSTEM OWNS EXPRESSION`.

## Camadas

```
USER → PRODUCT JOURNEY → PRODUCT SURFACE → PRODUCT PATTERNS
     → APPLICATION / VIEW MODEL LAYER → QUERY/MUTATION/CONTRACT LAYER → BACKEND
```

- Superfície NUNCA faz fetch cru → backend; consome o application layer da capability.
- Adoção INCREMENTAL (DDR-4): TanStack Query entra por superfície migrada; o legado Aurora
  continua com axios direto até sua slice — sem refatoração por pureza.
- `API DTO != SCREEN STRUCTURE`: view model traduz (ex.: `aguardando` → "Aguardando
  aprovação" via glossário) sem alterar domínio; progressive disclosure decide o que aparece.

## Domain state ≠ UI state ≠ session state

- Domain (serviço, status, preço, técnico, aprovação, tenant, documento, estoque): server
  state (Query nas migradas) ou props derivadas — nunca duplicado em estado local mutável.
- UI (dialog aberto, tab, filtro, linha expandida, toast, animação): React local/reducer.
- Session (token, identidade): imperativo via AuthContext/api.js — NUNCA query cache (DDR-4).

## Permissions (§24)

Camada conceitual no application layer: `canViewFinance / canManageTechnicians /
canApproveService / canViewAudit / ...` derivada de `/me/permissoes` (papel+overrides) —
substitui `role === 'dono'` espalhado. Frontend permission = USABILIDADE;
`UI_HIDDEN != AUTHORIZED` — o backend continua a autoridade (requireAuth/requirePermissao).

## Error taxonomy (§79-§80)

Classificador ÚNICO no application layer: NETWORK_ERROR · AUTH_REQUIRED · PERMISSION_DENIED ·
VALIDATION_ERROR · CONFLICT · RATE_LIMIT · NOT_FOUND · SERVER_ERROR · DEPENDENCY_UNAVAILABLE.
Mensagens seguras do glossário; nunca stack/provider internals/secret; correlation id só como
referência de suporte quando confiável. Interceptors globais atuais (refresh 401, 402 gated,
403 senha-provisória/e-mail) preservados.

## Forms (§81)

`schema (zod) → defaults → validação client (UX) → submit → validação server (AUTORIDADE) →
field errors vinculados → form error → dirty state → SUBMITTING → SUCCESS_FEEDBACK`.
Erro de campo SEMPRE associado ao campo (a11y); wizard multi-etapa mantém o padrão do wizard
de serviço (schema por etapa, componível — seam do CATALOGO futuro).

## Mutations críticas (§82, §122)

Finanças, aprovação, segurança, ponto, documentos (e futura cobrança): SEM optimistic update;
`retry: 0`; sucesso = servidor confirmou + UI reflete + reload persiste (`NO FAKE SUCCESS`).
Confirmação proporcional ao risco (UX RISK CLASSES).

## Provider boundary (§54)

`Frontend → Product Capability Contract → Backend → Provider`. Conceitos de Stripe/WhatsApp
provider/Google APIs NUNCA vazam para superfícies fora da própria capability (o storage já
segue isso: usuário vê documento/enviar/abrir, nunca bucket/URL assinada/service role).

## Estados completos (§77-§78)

Toda superfície assíncrona modela: INITIAL · LOADING · SUCCESS_EMPTY · SUCCESS_WITH_DATA ·
ERROR_RECOVERABLE · ERROR_FATAL · PERMISSION_DENIED · DISABLED · SUBMITTING ·
SUCCESS_FEEDBACK. Nunca "0"/vazio durante loading. Empty explica o-que/significa/o-que-fazer
com CTA só sob permissão.

## Verification profile por slice (§101-§102)

Camadas selecionadas por impacto (nunca tudo cegamente): STATIC (typecheck/lint/React Doctor
changed — gate BLOCKING ativo) · CONTRACT (schema/API tests) · UNIT (view model/application) ·
INTEGRATION (query/mutation) · RUNTIME (CDP/Playwright na journey afetada) · VISUAL
(screenshots canônicos = SIGNAL, não autoridade) · A11Y (axe + teclado) · PERF (medição
dirigida). Seleção de testes pelo grafo de dependência da matrix; full suite em milestone/
release/mudança compartilhada. `LOCAL_PROOF != CI_PROOF` (CI reexecuta quando Actions voltar).

## Segurança (§124)

A repaginação não enfraquece RBAC, tenant isolation, 2FA, auth, redação da auditoria
(fronteira PII ACEITA — não expandir), acesso a documentos, storage, middlewares. Mudança em
fronteira de segurança → CODEX SECURITY REVIEW. `auth-token-in-web-storage` permanece
ACCEPTED_ARCHITECTURE (mudar = security review, fora deste programa).

## Design system governance (§104)

Após foundations aceitas, mudanças globais (color semantics, spacing, breakpoints, radius,
comportamento de primitive core) passam pelo `DESIGN_SYSTEM_CHANGE_GATE`: problema global? ·
superfícies afetadas? · impacto de migração? · a11y? · regressão visual?
