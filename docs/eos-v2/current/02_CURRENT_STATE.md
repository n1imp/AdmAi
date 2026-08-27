# 02_CURRENT_STATE — snapshot de verdade atual (atualize ao fechar cada ciclo)

| Chave | Valor |
|---|---|
| CURRENT_HEAD | *(commit do fechamento do ciclo 1 da auditoria — confirme com `git rev-parse HEAD`; qualquer commit posterior legítimo = EXPECTED_NEW_COMMIT)* |
| CURRENT_BRANCH (local) | `fix/seguranca-criticos` |
| REMOTE_TARGET | `origin/staging` (push via `HEAD:refs/heads/staging`) |
| WORKTREE_STATUS | CLEAN esperado |
| BASELINE_HEAD | `8a53cc5bd4d0beeb2dc985ba745debfec1b629b3` (tag `admai-staging-accepted-2026-08-27`, imutável) |
| STAGING_DEPLOY_ATUAL | `ecf4c14` (baseline + 5 commits da auditoria; Deploy Staging run 33081925408 SUCCESS; avanço auditado, NÃO é reabertura do staging aceito) |
| STAGING_STATUS | ACCEPTED/CLOSED (`REAL_STAGING_ACCEPTANCE_PROVEN=YES`; reopen só por regressão objetiva) |
| FUNCTIONAL_AUDIT_STATUS | **ROUND1_COMPLETE_AWAITING_USER_GATE** — inventário 27 caps; classificação por evidência real (6 tours, 105/109 passos, 4 falhas instrumentais); 4 gaps EXECUTADOS e REVERIFICADOS em staging (logout desktop, 2FA recovery codes exibição+consumo, guards estoque, flash-of-empty); DECISOR consenso + REVISOR (correções aplicadas; veredito final pendente da resposta à evidência E3) |
| CLASSIFICACAO_ATUAL | 6 FEATURE_COMPLETE · 8 USER_REAL_CAN_USE · 4 PARTIAL · 2 INTEGRATED · 1 BACKEND_ONLY (AUDITORIA) · 1 BLOCKED_D2 (LGPD) · 1 POST_MVP (WHATSAPP, D2 amendment) · 4 DEFERRED_BY_SCOPE |
| READY_FRONTIER | **GATE DO USUÁRIO** (ver `gateDoUsuario` no audit ledger): D2 legal + 4 autorizações operacionais (DOCUMENTOS_ENABLED staging, sonda de signup, AUDITORIA consultável?, copy WhatsApp) + 2 reconciliações de write-set (comandos prontos em `writeSetReconciliacoesPendentes`); depois, rodada 2 de gaps |
| RELEASE_STATE | ADMAI_RELEASE_CANDIDATE_READY=YES · ADMAI_RELEASE_READY=NO |
| LEGAL_STATE | DEFERRED_BY_D2 (evidência fresca de staging no tour0: modelo + colchetes + barbers-flow) |
| PRODUCTION_STATE | UNTOUCHED · PROMOTION NOT_AUTHORIZED · ref `disljhkypaxpyzvbooge` = DENY TARGET |
| OPEN_D2 | `D2-DOC-BUCKET` · `D2-BACKFILL-PROD` · `D2-Q010-BACKUP` · `D2-PROMOTION` (soberanos; produção) |
| OPEN_ENGINEERING_BACKLOG | 2× SEC-HB de infra de teste (`05_CARRYOVER_FINDINGS.md`) + `SECURITY_HARDENING_BACKLOG.md` + AUD-NOTE-LOGOUT-LOCAL-ONLY + AUD-NOTE-CONFIG-EMPRESA-SEM-AUDIT |
| STAGING_LEDGER (fechado) | `docs/eos-v2/ADMAI_COMPLETION_LEDGER.json` (terminal CLOSED) |
| AUDIT_LEDGER (ativo) | `docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (status ROUND1_COMPLETE_AWAITING_USER_GATE; memória completa do macrofront) |
| BACKEND_STAGING_URL | `https://admai-staging-staging-c42d.up.railway.app` |
| FRONTEND_STAGING_URL | `https://staging.admai-painel.pages.dev` |
| STAGING_FIXTURES | Empresa A id 1327 (`dono.a.stg`/`gestor.a.stg`/`func.a.stg`) · B id 1328 (`dono.b.stg`); senha em `chaveiro-bot/.env.staging` (`STAGING_FIXTURE_SENHA`, git-ignored); fixtures RESTAURADAS pela auditoria (2FA off; sondas STG-AUD limpas; fila de aprovações vazia); re-seed: `ALLOW_STAGING_SEED=true node --env-file=.env.staging scripts/seed-staging.mjs --seed` |
| RATE_LIMIT_NOTA | login 5/15min por IP — tours de auditoria orçam logins por janela (padrão provado nos tours 0-6) |
