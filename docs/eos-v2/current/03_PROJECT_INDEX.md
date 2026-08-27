# 03_PROJECT_INDEX — mapa de navegação (pointers; nada de varredura ampla)

## AUTHORITATIVE CURRENT STATE
`docs/eos-v2/current/` (este pacote) · baseline: `docs/eos-v2/STAGING_ACCEPTANCE_BASELINE.md`

## SCOPE
`docs/agent-environment/ADMAI_SCOPE_FREEZE.md` (autoridade final de escopo)

## FUNCTIONAL AUDIT
`docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (memória persistente do macrofront)

## BACKEND — `chaveiro-bot/`
- Rotas: `src/routes/` → `auth.js` `account.js` `admin.js` `api.js` `billing.js`
  `documentos.js` `estoque.js` `google.js` `metricas.js` `servicos.js` `tecnicos.js`
  `whatsapp.js` (POST_MVP)
- App/middlewares (mounts, limiters, CORS/origem): `src/app.js`
- Serviços/domínio: `src/services/` · Config/env (Zod, guards staging): `src/config/env.js`
- Prisma/DB: `prisma/schema.prisma` · migrations `prisma/migrations/` · RLS canônica
  `prisma/rls/` (`lockdown_public_access_v2.pure.sql` + `verify_lockdown_v2.pure.sql`)
- Scripts staging: `scripts/` → `seed-staging.mjs` `validate-staging.mjs`
  `validate-rls-staging.mjs` `staging-rls-negative-control.mjs` `provision-bucket-documentos.mjs`
  `smoke-storage.mjs` `restore-rls-v2-noforce.mjs`
- Testes: unit `src/**/__tests__` + `scripts/__tests__` · integração `test/integration/`
  (DESTRUTIVA: truncate; ver carryover findings)

## FRONTEND — `chaveiro-painel/`
- Páginas: `src/pages/` (nomes = capabilities) · Componentes: `src/components/`
  (`Sidebar` `BottomNav` `Guards` `Wizard` `MatrizPermissoes`…) · Auth ctx:
  `src/contexts/AuthContext.jsx` · API client: `src/lib/api.js`
- E2E staging real: `e2e/staging.mjs` (4 jornadas + `--viewport=360|390|1440|1920`;
  núcleo CDP `e2e/cdp.mjs`)

## CAPABILITY POINTERS (alto nível; refinar sob demanda)
| Capability | Backend | Frontend |
|---|---|---|
| AUTH/2FA | `routes/auth.js`, `services/auth.js` | `Login.jsx`, `Seguranca.jsx`, `TrocarSenha.jsx`, `MagicLink.jsx` |
| SERVICOS/APROVACOES | `routes/servicos.js` | `NovoServico*.jsx`, `MeusServicos.jsx`, `Servicos*.jsx`, `Aprovacoes.jsx` |
| TECNICOS/EQUIPE | `routes/tecnicos.js` | `Tecnicos*.jsx`/equipe, `ConviteAceitar.jsx` |
| FINANCEIRO/METRICAS/INDICADORES | `routes/metricas.js` | `MetricHub*.jsx`, `Dashboard*.jsx`, `GestorHome.jsx` |
| BILLING | `routes/billing.js` | `Assinatura.jsx` |
| PONTO | (rotas de ponto em api/routes) | `MeuPonto.jsx`, `MeuPainel.jsx`, `BancoHoras.jsx` |
| ESTOQUE/CATALOGO | `routes/estoque.js` | `Estoque.jsx`, `Catalogo.jsx`, `CatalogoModais.jsx` |
| DOCUMENTOS | `routes/documentos.js` | `Documentos.jsx` |
| CONFIGURACOES | `routes/account.js`/admin | `Configuracao.jsx`, `Mais.jsx` |
| ONBOARDING | `/api/setup` (auth/admin) | `Landing.jsx`, fluxo pós-login |
| Demais (LGPD, AUDITORIA, OBSERVABILIDADE…) | DISCOVER_ON_DEMAND | DISCOVER_ON_DEMAND |

## DEPLOYMENT (staging)
`.github/workflows/` → `deploy-staging.yml` (frontend CF Pages, gates ci-ok/CSP) ·
`staging-backend-bootstrap.yml` (Railway: prepare/internal-secrets/external-secrets/connect) ·
`cf-preview-guard.yml` · CI oficial: `ci.yml`

## SECURITY (canônico atual)
RLS v2: `chaveiro-bot/prisma/rls/*v2.pure.sql` · guards env: `src/config/env.js` ·
backlog: `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md`

## GOVERNANÇA
`/CLAUDE.md` `/AGENTS.md` · ferramentas `tools/admai-delivery/` · decisões:
`docs/agent-environment/AGENT_DECISIONS.md` (histórico grande — buscar por ID, não ler inteiro)

## HISTORY — READ_ON_DEMAND (não pré-carregar)
`docs/eos-v2/`: `01..06_*.md` (legado/forense) · `ADMAI_APPLICATION_STAGING_DEPLOY_PACKAGE.md`
· `ADMAI_REAL_STAGING_COMPLETION_HANDOFF.md` · `EXECUTION_STATE.md` · `EVIDENCE_BUNDLE.json`
· `WRITE_SET_HISTORY.json` · `50_KNOWLEDGE/` · demais relatórios de remediação/fases.
Abrir SOMENTE se: regressão real, artefato atual referencia, ou decisão depende da evidência.
