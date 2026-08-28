# 02_CURRENT_STATE — snapshot de verdade atual (atualize ao fechar cada ciclo)

| Chave | Valor |
|---|---|
| CURRENT_HEAD | *(HEAD do fechamento do CICLO 2 — confirme com `git rev-parse HEAD`; commit posterior legítimo = EXPECTED_NEW_COMMIT)* |
| CURRENT_BRANCH (local) | `fix/seguranca-criticos` |
| REMOTE_TARGET | `origin/staging` (push via `HEAD:refs/heads/staging`) |
| WORKTREE_STATUS | CLEAN esperado |
| BASELINE_HEAD | `8a53cc5bd4d0beeb2dc985ba745debfec1b629b3` (tag `admai-staging-accepted-2026-08-27`, imutável) |
| STAGING_DEPLOY_ATUAL | `8bf37e9` (baseline + ciclos 1–2; frontend CF Pages + backend Railway Node 22; avanço auditado, NÃO reabre o staging aceito) |
| STAGING_STATUS | ACCEPTED/CLOSED (`REAL_STAGING_ACCEPTANCE_PROVEN=YES`; reopen só por regressão objetiva) |
| FUNCTIONAL_AUDIT_STATUS | **CYCLE3_COMPLETE** — frontier 5+2 consumido: 4 promoções a FEATURE_COMPLETE por evidência fresca (tours 10-13 + probe); capability types registrados; BILLING é o único não-completo, com blocker externo EXATO. `ZERO_UNEXPLAINED_NON_COMPLETE_STATE=YES` |
| CLASSIFICACAO_ATUAL | **18 FEATURE_COMPLETE** · 1 FOUNDATIONAL_COMPLETE (METRIC_FOUNDATION) · 1 OPERATIONAL_COMPLETE (OBSERVABILIDADE) · 1 USER_REAL_CAN_USE (BILLING) · 1 BLOCKED_D2 (LGPD) · 1 POST_MVP (WHATSAPP) · 4 DEFERRED_BY_SCOPE |
| FEATURE_COMPLETE (18) | AUTH_LOGIN · AUTH_2FA · MULTI_TENANCY · APROVACOES · CONFIGURACOES · STAGING · DOCUMENTOS · ONBOARDING · AUDITORIA · RBAC · SEGURANCA · ESTOQUE · FINANCEIRO · INDICADORES · **SERVICOS_CRUD** (tour10 11/11: delete-UI+empty+error; transições fora-de-scope evidenciado) · **PONTO** (tour11 10/10: selfie REAL via fake-device+geo override; negativo de papel) · **ADMIN** (convite=complementar; negativo 404+página coerente; e-mail real=não-executável por design) · **TECNICOS** (EstadoVazio renderizado real + error+mobile 390px; REFINE mantido) |
| BILLING (USER_REAL_CAN_USE) | EXACT_BLOCKER=`BLOCKED_EXTERNAL(STRIPE_KEY_STAGING)` — checkout 500 "Stripe não configurado" (nem sandbox sem a chave test); portal 400 recusa coerente no trial. AUTHORITY=usuário (upsert chave test via fase external-secrets). Produção financeira segue D2/D7 |
| READY_FRONTIER | Frontier funcional CONSUMIDO. Restantes exigem gates do usuário/D2: (1) `GITHUB_ACTIONS_BILLING` (Actions não inicia jobs novos — CI contínuo bloqueado); (2) `STRIPE_KEY_STAGING` test (reprobe billing sandbox); (3) D2 soberanos (LGPD legal · produção · backfill · backup) · validações não-executáveis declaradas (e-mail real de convite) |
| REACT_DOCTOR (verificador frontend) | **ROLLOUT=CLOSED · CI_MODE=BLOCKING_NEW_ERRORS** (`d082870`) — prova FAIL real: PR #115 run `33133459036` (gate FAILURE com eval sintético; fechado sem merge; branch deletada); gate verde no staging (runs `33133420614`, `33134315654` frontend SUCCESS, 0 novos/243 legados não bloqueando); pin `0.9.12`; baseline `0E/243W`; score≠KPI; `auth-token-in-web-storage`=ACCEPTED_ARCHITECTURE. Contrato: `docs/agent-environment/EOS_REACT_DOCTOR_CAPABILITY.md` + `docs/eos-v2/REACT_DOCTOR_PROFILE_ADMAI.json` |
| RELEASE_STATE | ADMAI_RELEASE_CANDIDATE_READY=YES · ADMAI_RELEASE_READY=NO |
| LEGAL_STATE | DEFERRED_BY_D2 (D6: conteúdo jurídico intocado; mecanismo LGPD auditado) |
| PRODUCTION_STATE | UNTOUCHED · PROMOTION NOT_AUTHORIZED · ref `disljhkypaxpyzvbooge` = DENY TARGET · PRODUCTION_TOUCHED=NO |
| OPEN_D2 | `GAP-LEGAL-MODELO-01` · `D2-DOC-BUCKET` (produção) · `D2-BACKFILL-PROD` · `D2-Q010-BACKUP` · `D2-PROMOTION` (soberanos) |
| OPEN_ENGINEERING_BACKLOG | 2× SEC-HB de infra de teste + `SECURITY_HARDENING_BACKLOG.md` + AUD-NOTE-LOGOUT-LOCAL-ONLY + AUD-NOTE-CONFIG-EMPRESA-SEM-AUDIT + AUD-NOTE-SUPORTE-BARBERS-FLOW (e-mail de suporte de outro produto em Ajuda — não legal, contato operacional; decisão do usuário) |
| AUDIT_LEDGER (ativo) | `docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (bloco `reactDoctorPilot` completo; decisão CURRENT selada após prova do CI shadow em run real) |
| BACKEND_STAGING_URL | `https://admai-staging-staging-c42d.up.railway.app` (Node 22) |
| FRONTEND_STAGING_URL | `https://staging.admai-painel.pages.dev` |
| STAGING_FIXTURES | Empresa A id 1327 (`dono.a.stg`/`gestor.a.stg`/`func.a.stg`) · B id 1328 (`dono.b.stg`); senha em `chaveiro-bot/.env.staging`; INTACTAS pós-ciclo-2 (provas destrutivas só em tenants STG-AUD descartáveis, todos removidos — 0 órfãos); DOCUMENTOS_ENABLED=true (D2) |
| EVIDENCIA_CICLO2 | `docs/eos-v2/AUDIT_EVIDENCE_TOURS_2026-08-27/` — tour7 DOCUMENTOS 13/13 · tour8 ONBOARDING 22/22 · tour9 AUDITORIA+CLAIMS 17/17 · probe-token-pos-exclusao (invalidação 401) |
