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
| FUNCTIONAL_AUDIT_STATUS | **CYCLE2_CLOSED** — gate reconciliado: AUD2-P1 RECONCILED (zero bloqueios AUD*); /tecnicos REDESIGN→REFINE no scope freeze (refutado por evidência); PII boundary da auditoria = ACCEPTED_AS_CURRENT_TECHNICAL_PRODUCT_BOUNDARY (técnica ≠ legal; sem expansão; mudança exige security review); support e-mail RESOLVIDO no frontend (`suporte@chaveirobot.com.br`, evidência `.env.example`) |
| CLASSIFICACAO_ATUAL | **14 FEATURE_COMPLETE** · 5 USER_REAL_CAN_USE · 2 INTEGRATED · 1 BACKEND_ONLY→resolvido (AUDITORIA agora FC) · 1 BLOCKED_D2 (LGPD) · 1 POST_MVP (WHATSAPP) · 4 DEFERRED_BY_SCOPE |
| FEATURE_COMPLETE (14) | AUTH_LOGIN · AUTH_2FA · MULTI_TENANCY · APROVACOES · CONFIGURACOES · STAGING · DOCUMENTOS · ONBOARDING · AUDITORIA · RBAC · SEGURANCA · ESTOQUE · FINANCEIRO · INDICADORES |
| USER_REAL_CAN_USE (5) | SERVICOS_CRUD · PONTO · BILLING · ADMIN · TECNICOS (gaps declarados: delete-UI / selfie-headless / checkout-D7 / convite-email-real) |
| READY_FRONTIER | **ADMAI_FUNCTIONAL_PRODUCT_AUDIT** (5 USER_REAL_CAN_USE: SERVICOS_CRUD/PONTO/BILLING/ADMIN/TECNICOS + 2 INTEGRATED). Restam apenas D2 soberanos (legal/produção) e validações não-executáveis declaradas |
| REACT_DOCTOR (verificador frontend) | **CAPABILITY ATIVA** — pin `0.9.12` via npx (zero dep/lockfile/bundle); baseline full `0 erros/243 avisos` + design `0/190` versionados; portão = erro NOVO vs baseline (diff por id do adapter `react-doctor-summary.mjs`); score NÃO é KPI (score API/Socket.dev desligados por política); controle negativo PROVADO (residual 0); router EOS 8/8; CI SHADOW no job frontend; 4 erros correctness corrigidos (`94f82a1`, `424b4d0`); `auth-token-in-web-storage` = ACCEPTED_ARCHITECTURE (mudança exige security review). Contrato: `docs/agent-environment/EOS_REACT_DOCTOR_CAPABILITY.md` + perfil `docs/eos-v2/REACT_DOCTOR_PROFILE_ADMAI.json` |
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
