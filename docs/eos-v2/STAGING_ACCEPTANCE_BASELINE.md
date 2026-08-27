# STAGING_ACCEPTANCE_BASELINE — AdmAi

Baseline operacional IMUTÁVEL do staging aceito. Congela o estado comprovado antes da
transição para `ADMAI_FUNCTIONAL_PRODUCT_AUDIT`. Nenhum secret neste arquivo.

## Identidade do baseline

| Campo | Valor |
|---|---|
| BASELINE_HEAD | `8a53cc5bd4d0beeb2dc985ba745debfec1b629b3` |
| BASELINE_TAG | `admai-staging-accepted-2026-08-27` (annotated; aponta exatamente o HEAD acima) |
| DATE | 2026-08-27 |
| BRANCH | `origin/staging` (worktree local `fix/seguranca-criticos` publica nela) |
| BACKEND_STAGING_URL | `https://admai-staging-staging-c42d.up.railway.app` |
| FRONTEND_STAGING_URL | `https://staging.admai-painel.pages.dev` |
| Supabase staging | ref `qsuufuulxfkkeasgxhcv` (produção `disljhkypaxpyzvbooge` jamais tocada) |

## Estados terminais

- **REAL_STAGING_ACCEPTANCE_PROVEN = YES**
- **PRODUCTION_TOUCHED = NO**
- **ADMAI_RELEASE_CANDIDATE_READY = YES**
- **ADMAI_RELEASE_READY = NO** — `LEGAL_ACCEPTANCE = DEFERRED_BY_D2`; `PRODUCTION_PROMOTION = NOT_AUTHORIZED`

## Matriz final de gates (evidências nos refs citados)

| Gate | Resultado | Evidência primária |
|---|---|---|
| VALIDATE_STAGING | PASS | 373 PASS + 1 SKIP (374); 4/4 passos; log `validate-staging-final2` (sessão) |
| RLS_CANONICAL_POSTSTATE | PASS | `verify_lockdown_v2.pure` PASS + contagens independentes 26 ENABLED / 0 FORCE / 0 policies |
| STG_SEC_RLS_H / I | PASS | 26 sondas anon+authenticated negadas (401/403), re-provadas pós-restauração |
| STG_SEC_RLS_J | PASS | bucket `documentos-tecnico` privado: upload service-role OK, assinada 200, pública 400 |
| STG_SEC_RLS_K | PASS | suíte de integração via pooler (env hermético; `rls.test` SKIP estrutural) |
| STG_03_DOC_BUCKET / STG_RUNTIME | DONE | health 200 `database: ok`; CSP/CORS/cookies/login provados; USER_GATE 9/9 |
| E2E OWNER/MANAGER/EMPLOYEE | PASS | 16/16 na matriz; escrita real (serviço criado, pendente aprovado, ponto batido); RBAC negativo do backend |
| TENANT_NEGATIVE | PASS | A→A 200; A→B read/delete 403/404; sem vazamento em listagem |
| GUC_POOLER | PASS | set_config local carrega no tx e não vaza pós-COMMIT |
| VIEWPORT 360/390/1440/1920 | PASS | logs `e2e-m360b/m390/m1440/m1920` (sessão) |
| SECURITY_ADVISOR_FINAL | PASS | 0 errors pós-rerun; 1 warning (Leaked Password Protection) reavaliado non-blocking: Supabase Auth não é a auth do produto |
| ZERO_FORGOTTEN_BLOCKER | PASS | todos os itens STG DONE; restam apenas `D2-*` soberanos |

Runs de referência (GitHub Actions): re-prepare `33023675804` · external-secrets `33025568469` ·
connect `33025613197` · Deploy Staging `33025736808` · internal-secrets `32923117791`.

## Carryover findings (NÃO são blockers do staging aceito)

| Finding | Classificação |
|---|---|
| `SEC-HB-STG-INTEGRATION-FIXTURE-DESTRUCTION` | ENGINEERING_BACKLOG / TEST_INFRA_DEBT |
| `SEC-HB-STG-INTEGRATION-SECURITY-CLEANUP` | ENGINEERING_BACKLOG / TEST_INFRA_DEBT |
| DESKTOP-LOGOUT-CONTROL-MISSING | FUNCTIONAL_PRODUCT_AUDIT_INPUT |

Detalhes em `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` e `AGENT_DECISIONS.md`.

## READY_FRONTIER

`ADMAI_FUNCTIONAL_PRODUCT_AUDIT` — critical path: FUNCTIONAL_CAPABILITY_INVENTORY →
USER_REAL_CAN_USE CLASSIFICATION → GAP EXECUTION → REVERIFY IN STAGING.
Ledger: `docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (NOT_STARTED).
