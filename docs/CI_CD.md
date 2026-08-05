# CI/CD — AdmAi

Como o projeto integra, testa e entrega. Arquitetura de produção: **backend → Railway**
(Docker + Supabase), **painel → Cloudflare Pages** (estático), **app → Android `.aab`**.

```
   PR / push                merge na master              deploy automático
  ┌──────────┐   CI verde   ┌──────────────┐   nativo    ┌─────────────────────────┐
  │  branch  │ ───────────► │   master     │ ──────────► │ Railway  (backend)      │
  │  feat/*  │   (ci-ok)    │ (produção)   │             │ Cloudflare Pages (painel)│
  └──────────┘              └──────────────┘             └─────────────────────────┘
        │                                                  app Android: tag v* → release.yml
```

## CI — `.github/workflows/ci.yml`

Dispara em **PR** e **push** para `main`/`master`. `concurrency` cancela runs superados.
Um job `changes` (dorny/paths-filter) decide o que roda:

| Job | Quando | O que faz |
|-----|--------|-----------|
| `backend` | mudou `chaveiro-bot/**` | `npm ci` → `prisma generate` → **lint** → testes unit → **integração** (service Postgres 16) → `npm audit` |
| `docker-build` | mudou `chaveiro-bot/**` | `docker build ./chaveiro-bot` (smoke do Dockerfile, sem push) |
| `frontend` | mudou `chaveiro-painel/**` | `npm ci` → **lint** → testes (Vitest+RTL) → `npm run build` → `npm audit` |
| `ci-ok` | sempre | **gate** — falha se algum job acima falhou; jobs pulados (path filter) contam como OK |

**Branch protection (configurar manualmente em GitHub → Settings → Branches → `master`):**
exigir Pull Request, exigir o status check **`ci-ok`**, e "require branches to be up to date".
Basta `ci-ok` como check obrigatório (ele agrega os demais).

## CD

### Backend → Railway (integração nativa, sem Actions)
- New Project → Deploy from GitHub → **Root Directory = `chaveiro-bot`** (usa `Dockerfile` +
  `railway.json`).
- **Volume persistente em `/app/uploads`** (selfies do ponto sobrevivem a deploys; o
  `docker-entrypoint.sh` ajusta a permissão).
- **Deploy on push** em `master` + **Wait for CI / Check Suites** (deploy só após o CI verde).
- Migrations aplicadas no boot (`docker-entrypoint.sh → prisma migrate deploy`).
- Domínio do serviço: `api.SEUDOMINIO`.

### Painel → Cloudflare Pages (via GitHub Actions, `.github/workflows/deploy.yml`)
- **Não** é integração nativa Git↔Cloudflare — o deploy roda via Actions: `deploy.yml`
  dispara em `workflow_run` após o workflow `CI` concluir em `master` (só publica se
  `conclusion == 'success'`), faz checkout do exato `head_sha` testado, `npm ci` + `npm run
  build` (`chaveiro-painel`, Node 20 — alinhado ao `ci.yml`) e publica com
  `cloudflare/wrangler-action@v4` (`pages deploy dist --project-name=admai-painel
  --branch=master`).
- Variáveis de build (`VITE_API_URL`, `VITE_CRISP_ID`, `VITE_POSTHOG_KEY`) e credenciais
  (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) vêm de **GitHub Actions secrets**, não do
  painel do Cloudflare.
- `public/_redirects` já faz o fallback de SPA (deep links).
- Domínio: `app.SEUDOMINIO` (ou `admai-painel.pages.dev` por padrão).

### App Android → `.github/workflows/release.yml`
- Dispara em **tag `v*`** ou manual (`workflow_dispatch`). Gera o **`.aab` assinado** e publica
  como artifact. Upload automático à Play fica comentado (ativar após criar a service account).

## Inventário de secrets/variáveis (por plataforma)

| Plataforma | Nome | Para quê |
|-----------|------|----------|
| **GitHub → Actions secrets** | `ANDROID_KEYSTORE_BASE64` | keystore `.jks` em base64 (assinar o `.aab`, `release.yml`) |
| | `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | credenciais de assinatura (`release.yml`) |
| | `VITE_API_URL`, `VITE_CRISP_ID`, `VITE_POSTHOG_KEY` | build do painel web (`deploy.yml`) — **secret**, não variable, apesar do mesmo nome usado em `release.yml` |
| | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | publicação via `cloudflare/wrangler-action@v4` (`deploy.yml`) |
| **GitHub → Actions variables** | `VITE_API_URL` | URL da API embutida no build do `.aab` (`release.yml` — **variable**, store distinto do secret de mesmo nome usado por `deploy.yml`) |
| **Railway → Variables** | `NODE_ENV`, `DATABASE_URL` (Supabase direta), `JWT_SECRET`, `ENCRYPTION_KEY`, `API_TOKEN`, `ALLOWED_ORIGIN`, `PUBLIC_URL`, `SENTRY_DSN` | runtime do backend (ver `chaveiro-bot/.env.example`). **Não** definir `PORT` (injetado) nem `WHATSAPP_HABILITADO`. |
| **Cloudflare Pages** | (nenhuma — o build não roda na Cloudflare) | o deploy é feito por `deploy.yml` via `wrangler pages deploy` de um `dist/` já pronto; não há integração nativa Git↔Cloudflare configurada para build neste projeto |

> Nada de segredo vive no repositório. Os `.env.example` documentam os nomes; os valores ficam
> só nos painéis das plataformas.

## Troubleshooting

- **Deploy do Railway não dispara:** confirme "Deploy on push" + "Wait for CI" e que o `master`
  ficou verde (check `ci-ok`).
- **Selfies somem após deploy:** o volume não está montado em `/app/uploads` (sem volume, o disco
  do container é efêmero).
- **CORS no painel:** `ALLOWED_ORIGIN` (Railway) deve ser exatamente `https://app.SEUDOMINIO`,
  sem barra final; o painel deve buildar com `VITE_API_URL=https://api.SEUDOMINIO`.
- **Deep link 404 no painel:** garanta que `public/_redirects` foi para o `dist/` (vai por padrão).
- **Migrations falham no boot:** use a **conexão direta** do Supabase (porta 5432) na
  `DATABASE_URL`, não o pooler (6543).
- **CI verde mas check obrigatório "pendente":** exija `ci-ok` (não os jobs individuais, que são
  pulados pelo path filter em PRs de um subprojeto só).
