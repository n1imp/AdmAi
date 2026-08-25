# STG_APP_ROLLBACK_OBSERVABILITY — staging de aplicação

**[STG-APP-STAGING-01 · D1 `01a038e5`]** · Regra soberana: **rollback de app ≠ rollback de schema**.
O banco admai-staging está em **28/28 migrations** — **NUNCA** reverter migrations arbitrariamente;
qualquer mudança de schema segue o fluxo normal de migration para frente.

## Rollback (antes do primeiro deploy — este é o procedimento)

### Backend (Railway, serviço staging)
1. Railway → serviço `admai-staging` → aba **Deployments**.
2. Escolher o deployment anterior saudável → **⋮ → Redeploy** (o Railway mantém a imagem).
3. As **Variables não são versionadas**: se a mudança foi de env var, reverter a var manualmente
   (a fonte de verdade dos NOMES é `chaveiro-bot/.env.staging.example` + `STG_APP_SECRET_MATRIX.md`).
4. Migrations aplicadas no boot (`docker-entrypoint.sh → prisma migrate deploy`) são **aditivas e
   ficam** — o app antigo deve tolerar o schema mais novo (Expand/Contract já é a regra do repo).

### Frontend (Cloudflare Pages, preview fixo `staging`)
1. Cloudflare Pages → projeto `admai-painel` → **Deployments** → filtrar branch `staging`.
2. Alternativa reprodutível (preferida): re-rodar `Deploy Staging` (workflow_dispatch) no commit
   anterior da branch `staging` — o guard re-valida o alvo e republica o alias.
3. O alias `staging.admai-painel.pages.dev` sempre serve o ÚLTIMO deploy da branch `staging`;
   produção (branch `master`) é intocada por definição do provider.

### Banco (NÃO é rollback)
- Estado de referência: 28/28 concluídas, zero failed/rolled-back (STG-MIG-RECON DONE).
- Problema de dado sintético: usar o cleanup do seeder (`seed-staging.mjs --reset`), nunca SQL manual
  destrutivo; fixtures têm prefixo determinístico exatamente para isso.

## Observabilidade (só o que os providers já oferecem — sem plataforma nova)

| Sinal | Onde | O que olhar |
|---|---|---|
| Backend logs (startup/erros) | Railway → serviço staging → **Logs** | o anti-production guard aborta o boot com a lista de campos inválidos (Zod), sem ecoar URLs |
| HTTP health | `GET <BACKEND_STAGING_URL>/health` | `200 {status:ok, database:ok}`; usado pelo healthcheck do Railway (`railway.json`) |
| Falha de conectividade DB | Railway Logs no boot | `prisma migrate deploy`/pool falham alto no entrypoint |
| Build/publish do painel | GitHub Actions run `Deploy Staging` + Cloudflare Pages → Deployments | guards 1–4 do workflow; CSP `_headers` validado contra produção |
| Runtime/network do painel | DevTools no browser real (gate STG-RUNTIME §32) | chamadas indo SÓ para `<BACKEND_STAGING_URL>/api/...`; zero chamadas a produção |
| Erros de runtime front | `VITE_SENTRY_DSN` de staging (opcional; projeto separado) | vazio por padrão |

## Invariantes (quebrou ⇒ parar e investigar, nunca contornar)

1. Staging **incapaz** de tocar produção: guard de boot (APP_ENV=staging) + guards do workflow.
2. `master` continua a única branch de produção dos dois providers.
3. Preview nativo Cloudflare da branch `staging` **desligado** — o workflow é o único writer.
4. Toda mudança de config de staging passa pelo repo (exemplos/docs) — nada só-no-painel.
