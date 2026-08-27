# 02_CURRENT_STATE — snapshot de verdade atual (atualize ao fechar cada ciclo)

| Chave | Valor |
|---|---|
| CURRENT_HEAD | *(será o commit deste pacote — confirme com `git rev-parse HEAD`; qualquer commit posterior legítimo = EXPECTED_NEW_COMMIT)* |
| CURRENT_BRANCH (local) | `fix/seguranca-criticos` |
| REMOTE_TARGET | `origin/staging` (push via `HEAD:refs/heads/staging`) |
| WORKTREE_STATUS | CLEAN esperado |
| BASELINE_HEAD | `8a53cc5bd4d0beeb2dc985ba745debfec1b629b3` |
| BASELINE_TAG | `admai-staging-accepted-2026-08-27` |
| STAGING_STATUS | ACCEPTED/CLOSED (`REAL_STAGING_ACCEPTANCE_PROVEN=YES`; reopen só por regressão objetiva) |
| FUNCTIONAL_AUDIT_STATUS | NOT_STARTED |
| READY_FRONTIER | ADMAI_FUNCTIONAL_PRODUCT_AUDIT |
| RELEASE_STATE | ADMAI_RELEASE_CANDIDATE_READY=YES · ADMAI_RELEASE_READY=NO |
| LEGAL_STATE | DEFERRED_BY_D2 |
| PRODUCTION_STATE | UNTOUCHED · PROMOTION NOT_AUTHORIZED · ref `disljhkypaxpyzvbooge` = DENY TARGET |
| OPEN_D2 | `D2-DOC-BUCKET` · `D2-BACKFILL-PROD` · `D2-Q010-BACKUP` · `D2-PROMOTION` (soberanos; produção) |
| OPEN_ENGINEERING_BACKLOG | 2× SEC-HB de infra de teste (ver `05_CARRYOVER_FINDINGS.md`) + itens em `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` |
| STAGING_LEDGER (fechado) | `docs/eos-v2/ADMAI_COMPLETION_LEDGER.json` (terminal CLOSED; validar com `node tools/admai-delivery/completion-ledger.mjs --validar`) |
| AUDIT_LEDGER (ativo) | `docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` |
| BACKEND_STAGING_URL | `https://admai-staging-staging-c42d.up.railway.app` |
| FRONTEND_STAGING_URL | `https://staging.admai-painel.pages.dev` |
| STAGING_FIXTURES | Empresa A id 1327 (`dono.a.stg`/`gestor.a.stg`/`func.a.stg`) · B id 1328 (`dono.b.stg`); senha em `chaveiro-bot/.env.staging` (`STAGING_FIXTURE_SENHA`, git-ignored); re-seed: `ALLOW_STAGING_SEED=true node --env-file=.env.staging scripts/seed-staging.mjs --seed` |
