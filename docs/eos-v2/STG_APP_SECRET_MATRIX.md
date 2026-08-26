# STG_APP_SECRET_MATRIX — classificação de secrets do staging de aplicação

**[STG-APP-STAGING-01 · D1 `01a038e5`]** · Nenhum VALOR aparece aqui ou em qualquer arquivo do
repo — só nomes, classe e onde vive. **Regra soberana: NUNCA copiar secret de produção para
staging.** Staging usa credenciais **próprias** (ou sandbox). GitHub Environment/secrets de staging
são **exclusivos** (D1: nunca compartilhar o store com produção).

Classes: `PUBLIC_CONFIG` (vai ao browser/bundle, não é segredo) · `SERVER_SECRET` (runtime do
backend) · `PROVIDER_SECRET` (credencial de plataforma de deploy) · `TEST_ONLY_SECRET` (fixtures
sintéticas de teste, sem valor real).

## Backend staging (Railway → service **admai-staging** → Variables)

| Nome | Classe | Observação |
|---|---|---|
| `APP_ENV` | PUBLIC_CONFIG | `staging` — liga o anti-production guard do boot |
| `NODE_ENV` | PUBLIC_CONFIG | `production` (guards de prod ATIVOS; D1 §3) |
| `STAGING_REF` | PUBLIC_CONFIG | `qsuufuulxfkkeasgxhcv` (allowlist positiva) |
| `PROD_REF_BLOCKLIST` | PUBLIC_CONFIG | `disljhkypaxpyzvbooge` (defesa extra; o boot nega sempre) |
| `DATABASE_URL` | **SERVER_SECRET** | pooler 6543 do **admai-staging** (user `postgres.qsuufuulxfkkeasgxhcv`) |
| `DIRECT_URL` | **SERVER_SECRET** | pooler session 5432 do admai-staging (migrations no boot) |
| `SUPABASE_URL` | PUBLIC_CONFIG | `https://qsuufuulxfkkeasgxhcv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | **SERVER_SECRET** | service-role do **staging** (Storage server-side; fecha STG-SEC-RLS-01 J + STG-03) |
| `JWT_SECRET` | **SERVER_SECRET** | gerar NOVO p/ staging (`openssl rand -hex 32`) — nunca o de prod |
| `ENCRYPTION_KEY` | **SERVER_SECRET** | idem (novo, staging-only) |
| `API_TOKEN` | **SERVER_SECRET** | idem |
| `ALLOWED_ORIGIN` | PUBLIC_CONFIG | `https://staging.admai-painel.pages.dev` (igualdade exata no boot) |
| `FRONTEND_URL` | PUBLIC_CONFIG | mesma origem staging (links de email) |
| `PUBLIC_URL` | PUBLIC_CONFIG | URL pública do backend staging (após criar o serviço) |
| `STORAGE_STRICT` | PUBLIC_CONFIG | `true` (upload nunca cai no disco atrás do CDN) |
| `RESEND_API_KEY` | **SERVER_SECRET** | exigida por NODE_ENV=production — usar key/sandbox PRÓPRIA de staging |
| `REDIS_URL` | **SERVER_SECRET** | Redis de staging (o runtime usa BullMQ) — nunca o de prod |
| `SENTRY_DSN` | PUBLIC_CONFIG | opcional; projeto Sentry separado de staging ou vazio |
| `PORT` | — | **NÃO definir** (Railway injeta) |

## Frontend staging (build no GitHub Actions → Environment `staging`)

| Nome | Classe | Observação |
|---|---|---|
| `VITE_API_URL` | PUBLIC_CONFIG | `https://<backend-staging>/api` — validada pelo guard (nunca prod/localhost) |
| `VITE_SENTRY_DSN` / `VITE_CRISP_ID` / `VITE_POSTHOG_KEY` | PUBLIC_CONFIG | vazios em staging por padrão (não poluir analytics de prod) |
| Supabase **publishable/anon key** | PUBLIC_CONFIG | pública por design; usada só nos negative controls (não no painel) |

## Provider (GitHub → Environment `staging` → secrets exclusivos)

| Nome | Classe | Observação |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` (repo) | **PROVIDER_SECRET** | **[AMEND por D2 literal do usuário, 2026-08-25: "Reusar os do repo"]** O plano anterior exigia `*_STAGING` em Environment próprio [REVISOR `01a038fc`]; o usuário decidiu reusar o secret de REPO existente (mesmo token que já publica previews deste projeto Pages). **Risco residual documentado (D1 `01a03b55`)**: o token compartilhado continua capaz de afetar produção se o workflow for alterado — as proteções reais são o guard nunca-master, `--branch=staging` fixo, guards de config/artefato e o gate `ci-ok` |
| `CLOUDFLARE_ACCOUNT_ID` (repo) | PROVIDER_SECRET | idem (reuso por D2) |
| `RAILWAY_TOKEN` (repo) | **PROVIDER_SECRET** | usado SÓ pelo `staging-backend-bootstrap.yml` (projeto DEDICADO `admai-staging`; guards anti-produção; nunca ecoado). Precisa ser token de conta/team — project-token de produção falha explícito |
| `VITE_API_URL_STAGING` | PUBLIC_CONFIG | repo **VARIABLE** (`vars.`), não secret — é URL pública; `gh variable set VITE_API_URL_STAGING -b https://<backend>/api` |

## Testes/fixtures (nunca produção; sem valor real)

| Nome | Classe | Observação |
|---|---|---|
| `STAGING_AUTHENTICATED_JWT` | TEST_ONLY_SECRET | JWT de usuário Supabase authenticated **sem privilégio** (fecha STG-SEC-RLS-01 I); nunca ecoado |
| `STAGING_SUPABASE_ANON_KEY` | PUBLIC_CONFIG | negative control PostgREST (H) |
| `SEED_STAGING_SENHA` | TEST_ONLY_SECRET | senha sintética dos usuários fixture A/B (via env; sem default; nunca impressa) |
| `DEMO_SENHA` | TEST_ONLY_SECRET | idem, seeder demo local (já existente) |

## Nota de auth cross-site (staging)

Produção é **same-site** (subdomínios de `chaveirobot.com.br`) e o cookie de refresh usa
`SameSite=Strict`. Staging (`staging.admai-painel.pages.dev` ↔ Railway) é **cross-site**: com
`APP_ENV=staging` o backend emite o cookie com `SameSite=None; Secure` (fonte única em
`services/auth.js`), o painel envia `withCredentials` e as rotas de sessão recusam `Origin`
divergente (CSRF-compensação). Nenhum secret novo — mas o **teste real de refresh cross-site em
browser** é prova obrigatória do STG-RUNTIME (Passo 4 do deploy package).

## Regras de manuseio

1. **Nunca** imprimir, commitar, ou colar valor em chat/log — `.env.staging` é git-ignored; exemplos só documentam nomes.
2. **Nunca** copiar secret de produção; staging gera os próprios (`openssl rand -hex 32` para JWT/ENCRYPTION/API_TOKEN).
3. GitHub: usar **Environment `staging`** com secrets exclusivos — o `deploy.yml` de produção não os enxerga e vice-versa.
4. Rotação: trocar qualquer secret de staging é livre (ambiente sintético); nunca exige mudança em produção.
