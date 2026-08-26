# ADMAI_APPLICATION_STAGING_DEPLOY_PACKAGE — EXTERNAL_DEPLOY_PACKAGE

**[STG-APP-STAGING-01 · D1 `01a038e5`] + [STG-APP-DEPLOY-01 · D1 `01a03b55`]** · **Alvo:** criar
`BACKEND_STAGING_URL` + `FRONTEND_STAGING_URL` reais, isolados de produção, apontando ao Supabase
**admai-staging** (`qsuufuulxfkkeasgxhcv`). **PROIBIDO:** produção.

Arquitetura (D1, vinculante): **C** — backend = **projeto Railway DEDICADO `admai-staging`**
(environment `staging`, service sem source até os secrets existirem — bifásico); frontend =
**branch preview fixa `staging`** do projeto Pages `admai-painel`, publicada **exclusivamente**
pelo workflow `Deploy Staging` (preview nativo da `staging` excluído ANTES do primeiro push).

> **D2 do usuário (AskUserQuestion, literal, 2026-08-25):** custo do serviço Railway **E** do Redis
> staging AUTORIZADOS; push da branch `staging` AUTORIZADO; push da tag técnica one-shot AUTORIZADO;
> secrets Cloudflare de REPO reusados; credenciais do staging via `.env.staging` local.

---

## ORDEM VINCULANTE (D1 `01a03b55` — automatizada; substitui os click-paths manuais abaixo)

| # | Passo | Executor | Comando/ação |
|---|---|---|---|
| 1 | ~~Autorizar Redis + tag~~ | usuário | **FEITO** (D2 literal acima) |
| 2 | Excluir `staging` do preview nativo **antes** da branch existir | Claude (`gh`) | `git tag ops/cf-preview-guard-1 && git push origin ops/cf-preview-guard-1` → workflow `CF Preview Guard` (GET→PATCH→GET provado) |
| 3 | Criar a branch | Claude (`gh`) | `git push origin HEAD:refs/heads/staging` → aguardar `ci-ok` verde (CI agora roda em staging). Nenhum deploy de produção dispara (deploy.yml só consome master) |
| 4 | Backend fase 1 (sem source) | Claude (`gh`) | `gh workflow run staging-backend-bootstrap.yml --ref staging -f confirm_cost=yes -f phase=prepare` → projeto dedicado + env staging + service + Redis + domínio + vars não-secretas; **inventário de IDs no summary** |
| 5 | Vars SECRETAS do service | **usuário** | Railway → projeto `admai-staging` → service → Variables: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `API_TOKEN`, `RESEND_API_KEY` (valores do admai-staging; novos — nunca de produção) |
| 6 | Backend fase 2 (conectar) | Claude (`gh`) | `gh workflow run ... -f phase=connect -f project_id=.. -f environment_id=.. -f service_id=..` → conecta `n1imp/AdmAi#staging` root `chaveiro-bot`; deploy dispara; boot só passa com o anti-prod guard verde |
| 7 | Provar backend | Claude | `GET https://<domínio>/health` → 200 `database: ok` |
| 8 | Apontar o frontend | Claude (`gh`) | `gh variable set VITE_API_URL_STAGING -b "https://<domínio>/api"` → re-run `Deploy Staging` (gate ci-ok + guards + publish `--branch=staging`) |
| 9 | Provas finais | Claude | `.env.staging` (usuário) → seed A/B → bucket `--staging` → validate:staging → negative-controls (H-mut/I) → browser real §32 (login, refresh cross-site 4b) → `e2e/staging.mjs` + viewports |

Os passos manuais antigos abaixo ficam como **fallback** (se algum workflow reportar
`PASSO MANUAL EXATO`, é o texto dele que vale).

## ✅ ESTADO REAL DA EXECUÇÃO (2026-08-26) — passos 1–4 PROVADOS

| Recurso | Valor REAL |
|---|---|
| CF preview nativo | `staging` **excluída** (run `32913971101`; excludes=`["staging"]`; production_branch=master intacta) |
| Branch `staging` | criada; **`ci-ok` VERDE** (run `32918881340`: backend+frontend+docker+audit todos success) |
| Projeto Railway DEDICADO | `admai-staging` · projectId `e792a2d8-2fdf-45b9-87ff-ca3f7c828e95` |
| environmentId | `d8e3fbe2-096e-40b7-9394-dc4b8afc2261` — **RENOMEADO para `staging`** no re-prepare de 2026-08-26 (contrato D1 cumprido) |
| serviceId | `0ddfe463-2a06-4378-8d8b-54576bd04c6b` (SEM source — bifásico; nenhum deploy disparou) |
| **BACKEND_STAGING_URL** | **`https://admai-staging-staging.up.railway.app`** (novo, pós-rename; 404 até o connect). O domínio antigo `admai-staging-production.up.railway.app` pode coexistir — limpeza opcional |
| Vars não-secretas | aplicadas (APP_ENV/STAGING_REF/SUPABASE_URL/ALLOWED_ORIGIN/FRONTEND_URL/STORAGE_STRICT/NODE_ENV/PUBLIC_URL/REDIS_URL-referência) |
| Redis | **MANUAL_PENDENTE** (template API recusou) — ver ação 2 abaixo |

### ⏳ RESTANTE DO PASSO 5 — **agente executou o executável** (Redis ✓, 3 internos ✓ via runner, `.env.staging` scaffold ✓)

**Irredutível ao usuário — 4 valores, por REGRA do agente (não por UI):** `DATABASE_URL`,
`DIRECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` — preencher em DOIS lugares:
(a) Railway → service `admai-staging` → Variables; (b) `chaveiro-bot/.env.staging` (campos já
vazios no scaffold). Verificação: re-dispatch do `connect` lista o que faltar, sem expor nada.
Opcional p/ subgates H-mut/I: `STAGING_SUPABASE_ANON_KEY`, `STAGING_AUTHENTICATED_JWT` no `.env.staging`.

1. **Vars SECRETAS do service** — Railway → projeto `admai-staging` → service `admai-staging` →
   Variables: `DATABASE_URL` (pooler 6543 do admai-staging), `DIRECT_URL` (pooler 5432),
   `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, `API_TOKEN`
   (3 últimos: `openssl rand -hex 32`, NOVOS), `RESEND_API_KEY` (key/sandbox de staging).
2. **Redis** — mesmo projeto → environment **`staging`** (já renomeado) → **Create → Database →
   Redis** (o service DEVE chamar-se `Redis` para a referência `${{Redis.REDIS_URL}}` resolver).
3. **`chaveiro-bot/.env.staging` local** (modelo `.env.staging.example`) — para seed/bucket/
   negative-controls/validate rodarem da sua máquina.

Depois de (1)+(2), Claude executa: `phase=connect` → `/health` 200 → `VITE_API_URL_STAGING` →
publish do frontend → provas §32 (com (3): seed A/B, bucket, subgates H-mut/I/J/K, E2E).

---

## Passo 0 — Pré-requisitos (uma vez)

1. **Branch `staging`** no GitHub: criar a partir do commit atual de `fix/seguranca-criticos`
   (ou de `master` quando esta frente for integrada). O workflow e o Railway apontam para ela.
2. **GitHub Environment `staging`** (Settings → Environments → New environment → `staging`):
   - Secrets (store EXCLUSIVO — nunca reutilizar os de produção; sufixo `_STAGING` obrigatório,
     pois nomes genéricos caem no fallback de secrets de repo/org [REVISOR `01a038fc`]):
     - `VITE_API_URL_STAGING` = `https://<backend-staging>/api` (preencher no Passo 1.6)
     - `CLOUDFLARE_API_TOKEN_STAGING` (escopo Pages: edit) · `CLOUDFLARE_ACCOUNT_ID_STAGING`
   - (Opcional) Protection rules: required reviewers para deploy staging.

## Passo 1 — Backend staging (Railway) — **requer D2 (custo)**

1. Railway → **New Project** (ou novo **service** no projeto atual) → **Deploy from GitHub repo**
   → repo `n1imp/AdmAi` → **Root Directory = `chaveiro-bot`** (usa `Dockerfile` + `railway.json`
   já versionados; healthcheck `/health` automático).
2. **Branch = `staging`** + ligar **"Wait for CI"** (deploy só com `ci-ok` verde).
3. **Variables** (nomes e classificação em `STG_APP_SECRET_MATRIX.md`; valores NUNCA no repo):
   `APP_ENV=staging` · `NODE_ENV=production` · `STAGING_REF=qsuufuulxfkkeasgxhcv` ·
   `PROD_REF_BLOCKLIST=disljhkypaxpyzvbooge` · `DATABASE_URL` (pooler 6543 do admai-staging) ·
   `DIRECT_URL` (pooler session 5432) · `SUPABASE_URL=https://qsuufuulxfkkeasgxhcv.supabase.co` ·
   `SUPABASE_SERVICE_ROLE_KEY` (do staging) · `JWT_SECRET`/`ENCRYPTION_KEY`/`API_TOKEN` (novos,
   `openssl rand -hex 32`) · `ALLOWED_ORIGIN=https://staging.admai-painel.pages.dev` ·
   `FRONTEND_URL=https://staging.admai-painel.pages.dev` · `STORAGE_STRICT=true` ·
   `RESEND_API_KEY` (key/sandbox própria de staging) · `REDIS_URL` (Redis de staging) ·
   **não** definir `PORT`.
4. **Volume**: não é necessário em staging (`STORAGE_STRICT=true` força Supabase Storage; sem
   fallback de disco). Se criar, montar em `/app/uploads` como em prod.
5. Primeiro deploy: o boot roda `prisma migrate deploy` (28/28, no-op) e o **anti-production
   guard** — se qualquer var apontar para produção, o processo **aborta com a lista de campos**
   (Railway → Logs). Isso é o guard funcionando, não um bug.
6. Copiar o domínio gerado (Settings → Networking → ex.: `admai-staging.up.railway.app`) →
   preencher `PUBLIC_URL` nas Variables **e** `VITE_API_URL_STAGING` no GitHub Environment
   (`https://<domínio>/api`).
7. **Prova:** `GET https://<domínio>/health` → `200 {"status":"ok","database":"ok",...}`.

## Passo 2 — Frontend staging (Cloudflare Pages) — grátis

1. Cloudflare Pages → projeto **`admai-painel`** → Settings → **Builds & deployments**:
   - **Production branch** permanece `master` (não tocar).
   - **Preview deployments**: desligar o build nativo para a branch `staging` — opção
     "Custom branches": incluir apenas as branches desejadas e **excluir `staging`**
     (D1: o workflow é o ÚNICO writer do alias staging; dois pipelines = corrida/config
     divergente — a lição do incidente CSP 2026-08-05).
2. GitHub → Actions → **`Deploy Staging`** → Run workflow (branch `staging`).
   O workflow: guard de config (denylist prod) → `npm run build:staging` (guard fail-closed +
   build + CSP `_headers`) → guard do artefato (connect-src staging, sem produção) →
   `wrangler pages deploy --project-name=admai-painel --branch=staging`.
3. **Prova:** abrir `https://staging.admai-painel.pages.dev` num browser real → página carrega;
   DevTools → Network: chamadas indo **só** para `https://<backend-staging>/api/...`.

## Passo 3 — Fixtures sintéticas (staging DB)

Na máquina do operador com `chaveiro-bot/.env.staging` preenchido (modelo: `.env.staging.example`):

```bash
cd chaveiro-bot
node --env-file=.env.staging scripts/seed-staging.mjs --check          # elegibilidade (read-only)
ALLOW_STAGING_SEED=true SEED_STAGING_SENHA=<senha-sintética> \
  node --env-file=.env.staging scripts/seed-staging.mjs --seed         # Empresa A + B
```

Contas: `dono.a.stg` · `gestor.a.stg` · `func.a.stg` (Empresa A) · `dono.b.stg` (Empresa B).
O guard do seeder só aceita conexão **vinculada positivamente** ao `qsuufuulxfkkeasgxhcv`.
Cleanup: `--reset` (remove só os tenants `stg-fix-*`). **Nunca** contas/dados de produção.

Usuário Supabase **authenticated-unprivileged** (para STG-SEC-RLS-01 **I**): Supabase Dashboard
(admai-staging) → Authentication → Add user → email sintético + senha forte → gerar JWT de login
(`POST /auth/v1/token?grant_type=password` com a anon key) → exportar como
`STAGING_AUTHENTICATED_JWT` (nunca ecoar). Este usuário NÃO recebe nenhum grant/role extra.

## Passo 4 — Provas de runtime (fecham STG-RUNTIME §32)

| # | Prova | Comando/ação | PASS |
|---|---|---|---|
| 1 | Backend health | `GET <BACKEND_STAGING_URL>/health` | 200 + `database: ok` |
| 2 | Guard negativo (opcional, recomendado) | trocar `STAGING_REF` p/ valor errado → redeploy | boot **aborta** (Logs); restaurar |
| 3 | Frontend carrega | browser real em `FRONTEND_STAGING_URL` | página renderiza; zero chamadas a produção (Network) |
| 4 | **Login real** | `dono.a.stg` na UI | dashboard com dados do admai-staging |
| 4b | **Refresh cross-site** [REVISOR `01a038fc`] | após o login, DevTools → Application: cookie `refresh_token` presente (`SameSite=None; Secure`); apagar `admai_token` do localStorage e navegar → sessão se recupera via `/auth/refresh` | refresh 200 + sessão continua; provar também que o browser não bloqueou o cookie (políticas de third-party cookies) |
| 5 | Backend smoke completo | `cd chaveiro-bot && npm run validate:staging` | migrate deploy no-op + generate + integração verdes |
| 6 | E2E por papel | `ADMAI_URL=<front> ADMAI_API_URL=<back>/api STAGING_FIXTURE_SENHA=... node e2e/staging.mjs` | 4 jornadas OK (owner/manager/employee + TENANT-NEGATIVE A→B; RBAC e tenant negativos = 401/403/404 do backend) |
| 7 | Tenant-negative (mecanismo) | `node --env-file=.env.staging scripts/validate-rls-staging.mjs` | GUC não vaza sob pooler |
| 8 | Mobile | `node e2e/staging.mjs --viewport=360` (e 390/1440/1920) | jornadas OK nos 4 viewports |

## Passo 5 — Storage + subgates RLS restantes

| Subgate | Comando | PASS |
|---|---|---|
| **STG-03-DOC-BUCKET** | `ALLOW_STORAGE_PROVISION=true node --env-file=.env.staging scripts/provision-bucket-documentos.mjs --staging --provision` → `... --staging --validate` (a flag `--staging` fixa o ref VERSIONADO do admai-staging — um `.env` errado não redefine o alvo [DELTA `01a038fc`]) | bucket `documentos-tecnico` privado; URL assinada abre; pública bloqueia; objeto de teste removido |
| **STG-SEC-RLS-01 H (mutations)** | `node --env-file=<env com URL+anon key> scripts/staging-rls-negative-control.mjs` | POST/PATCH/DELETE → 401/403/404 |
| **STG-SEC-RLS-01 I** | mesmo script com `STAGING_AUTHENTICATED_JWT` | `/auth/v1/user`=200 e matriz 26 negada |
| **STG-SEC-RLS-01 J** | `node --env-file=.env.staging scripts/smoke-storage.mjs --staging documentos-tecnico private` | upload+signed URL+delete OK |
| **STG-SEC-RLS-01 K** | prova 5 do Passo 4 | verde |

## Rollback / Observabilidade

`docs/eos-v2/STG_APP_ROLLBACK_OBSERVABILITY.md` — rollback = deployment anterior do provider;
**nunca** rollback de migrations (28/28 fica); fixtures limpam com `seed-staging.mjs --reset`.

## Critério de fechamento

`STG-RUNTIME` fecha **somente** com as provas 1, 3, 4, 5 (e 6 para os E2E gates) — URLs reais +
browser real + dados do admai-staging. `TEST_PASS != USER_VISIBLE_RUNTIME_PROVEN`.
`REAL_STAGING_ACCEPTANCE_PROVEN` continua exigindo TODOS os gates do frontier
(`STG_STAGING_FRONTIER_GATES.md`). Produção intocada em todos os passos.
