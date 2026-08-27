# 01_SESSION_BOOTSTRAP — AdmAi (leia ISTO primeiro)

Sessão nova: leia este arquivo + `02_CURRENT_STATE.md` + `../ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json`
e comece. NÃO reconstrua histórico. `03_PROJECT_INDEX.md` é mapa sob demanda.

## A. PROJECT IDENTITY

**AdmAi / ChaveiroBot** — SaaS multi-tenant para chaveiros (empresas com dono, gestores e
funcionários de campo). Frontend **React+Vite** (`chaveiro-painel/`, também app Android via
Capacitor). Backend **Node.js+Express** (`chaveiro-bot/`), **Prisma 7 + PostgreSQL (Supabase)**,
Redis para rate-limit/sessões. Staging: backend **Railway**, frontend **Cloudflare Pages**.
RBAC por papel: `dono` / `gestor` / `funcionario` (+ overrides granulares de permissão).

## B. CURRENT MISSION

**`ADMAI_FUNCTIONAL_PRODUCT_AUDIT`** — descobrir o estado REAL das funcionalidades do produto
em staging e depois executar os gaps. Primeira macrofase: `FUNCTIONAL_CAPABILITY_INVENTORY`.
A auditoria avalia: frontend, backend, integração, RBAC, persistência, states
(loading/error/empty), browser real, mobile, usabilidade real.

## C. CURRENT BASELINE (staging FECHADO — não reabrir)

- `REAL_STAGING_ACCEPTANCE_PROVEN=YES` · BASELINE_HEAD `8a53cc5bd4d0beeb2dc985ba745debfec1b629b3`
  · tag `admai-staging-accepted-2026-08-27` · evidências: `../STAGING_ACCEPTANCE_BASELINE.md`
- Backend staging: `https://admai-staging-staging-c42d.up.railway.app` (aliases `-staging.` e
  `-8643.` coexistem; o `-c42d` é o canônico re-observado)
- Frontend staging: `https://staging.admai-painel.pages.dev`
- **Aceitação de staging é BASELINE OPERACIONAL, não prova de completude de features.**

## D. AUTHORITY MODEL

USER=**D2** soberano · EOS=**GOVERN** · Codex=**THINK/D1/REVIEW** (read-only; protocolos em
`AGENTS.md`) · Claude=**BUILD** (único writer) · verificação determinística=**PROVE**.
`THINK != BUILD != PROVE != GOVERN`. D0=mecânico/reversível · D1=decisão técnica reversível
(material ⇒ Codex DECISOR) · D2=escopo/legal/financeiro/enfraquecer segurança/produção/
irreversível/credenciais.

## E. CURRENT SCOPE (compacto — `docs/agent-environment/ADMAI_SCOPE_FREEZE.md` MANDA)

MVP: AUTH_LOGIN · AUTH_2FA · MULTI_TENANCY · RBAC · ONBOARDING · SERVICOS_CRUD · TECNICOS ·
FINANCEIRO · BILLING · SEGURANCA · LGPD · APROVACOES · METRIC_FOUNDATION · INDICADORES ·
PONTO · ESTOQUE · CONFIGURACOES · AUDITORIA · OBSERVABILIDADE · DOCUMENTOS · STAGING.
**WHATSAPP = POST_MVP.** Divergência entre esta lista e o scope freeze ⇒ **SCOPE_FREEZE WINS**.

## F. CRITICAL INVARIANTS

```
BLOCKED_ITEM != BLOCKED_RUN          SAFE_WORK_AVAILABLE -> DO_NOT_IDLE
UNKNOWN != PASS                      UNAVAILABLE != PASS
NOT_TESTED != PASS                   LOCAL_PROOF != STAGING_PROOF
CODE_EXISTS != USER_USABLE           TEST_PASS != FEATURE_COMPLETE
CLAIM_WITHOUT_EVIDENCE != PASS
FAILED_ATTEMPT_WITH_NO_NEW_INFORMATION -> DO_NOT_REPEAT_IDENTICALLY
MUTATION_REQUIRES_VALIDATED_WRITE_SET
PRODUCTION_MUTATION_REQUIRES_EXPLICIT_D2
DO_NOT_REOPEN_STAGING_WITHOUT_OBJECTIVE_REGRESSION
```

**Regra canônica de completude**: `BACKEND_DONE != FEATURE_DONE` · `FRONTEND_EXISTS !=
FEATURE_DONE` · `TESTS_PASS != FEATURE_DONE` · **`FEATURE_DONE = USER_REAL_CAN_USE`** —
FEATURE_COMPLETE somente quando um usuário real executa o fluxo ponta-a-ponta em staging:
frontend real + backend real + integração real + RBAC correto + loading/error/empty states
adequados + persistência/resultado observável + validação em browser/runtime + fluxo coerente
para o papel. Taxonomia de estados (não inventar outras): DISCUSSED · SPECIFIED ·
BACKEND_IMPLEMENTED · FRONTEND_IMPLEMENTED · INTEGRATED · USER_REAL_CAN_USE · FEATURE_COMPLETE
· PARTIAL · BACKEND_ONLY · FRONTEND_ONLY · MISSING · BROKEN · BLOCKED_D2 · DEFERRED_BY_SCOPE ·
POST_MVP.

**Produção** (`disljhkypaxpyzvbooge`, projeto Railway `AdmAi`, `*.chaveirobot.com.br`):
**DENY TARGET**. `ADMAI_RELEASE_READY=NO` (LEGAL `DEFERRED_BY_D2`; promotion NOT_AUTHORIZED).

**Branch state**: o worktree local chama-se `fix/seguranca-criticos` e PUBLICA em
`origin/staging` (`git push origin HEAD:refs/heads/staging`) — é o padrão desta frente, NÃO é
divergência. OBSERVE FIRST; nunca reset/rename automático por diferença de nome.

## G. CARRYOVER FINDINGS (detalhe: `05_CARRYOVER_FINDINGS.md`)

`SEC-HB-STG-INTEGRATION-FIXTURE-DESTRUCTION` e `SEC-HB-STG-INTEGRATION-SECURITY-CLEANUP` =
ENGINEERING_BACKLOG/TEST_INFRA_DEBT · `DESKTOP-LOGOUT-CONTROL-MISSING`
(`AUD-INPUT-DESKTOP-LOGOUT`) = FUNCTIONAL_PRODUCT_AUDIT_INPUT.

## H. READY_FRONTIER

`ADMAI_FUNCTIONAL_PRODUCT_AUDIT` — critical path: FUNCTIONAL_CAPABILITY_INVENTORY →
USER_REAL_CAN_USE CLASSIFICATION → GAP EXECUTION → REVERIFY IN STAGING.
Ledger persistente: `../ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (STATUS=NOT_STARTED;
memória do macrofront — checkpoints semânticos nele, não no chat).

## I. FILE POINTERS

Mapa completo: `03_PROJECT_INDEX.md`. Decisões fechadas: `04_DECISION_INVARIANTS.md`.
Economia de contexto: `06_CONTEXT_ECONOMY_POLICY.md`. Governança/protocolos Codex:
`/CLAUDE.md` + `/AGENTS.md`. Ferramentas de ledger/write-set: `tools/admai-delivery/`
(`completion-ledger.mjs --validar`; `write-set-declarar.mjs` declara/`--fechar`).

## J. STARTUP PROCEDURE

1. Ler `01_SESSION_BOOTSTRAP.md` (este). 2. Ler `02_CURRENT_STATE.md`. 3. Ler o audit
ledger. 4. Observar `git branch --show-current`, `git status`, `git rev-parse HEAD`.
5. Comparar com CURRENT_STATE. 6. Sem divergência inexplicada ⇒ NÃO reconstruir histórico.
7. Executar READY_FRONTIER.

**Divergence policy**: HEAD ≠ CURRENT_STATE ⇒ classificar primeiro (EXPECTED_NEW_COMMIT /
UNCOMMITTED_WORK / STALE_CURRENT_STATE / UNKNOWN_DIVERGENCE) via `git log --oneline -5`,
`git status`, `git diff` direcionados; só escalar a leitura histórica se necessário.
