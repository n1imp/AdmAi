# Checklist de Go-Live — AdmAi (web + Play Store)

Este documento cobre os passos **manuais** (dependem da sua infraestrutura e da conta Google)
para colocar o AdmAi no ar e publicá-lo na Play Store. O que já foi entregue em código
está marcado como ✅ FEITO.

Decisões atuais: app via **Capacitor**, hospedagem em **Railway (backend) + Cloudflare Pages
(painel) + Supabase (Postgres)** — ver `docs/CI_CD.md` e `docs/RUNBOOK.md`, **WhatsApp
desabilitado** no lançamento, **conta Play ainda não criada**.

> A FASE A abaixo foi reescrita para a arquitetura atual (Railway/Cloudflare/Supabase). A
> versão original desta fase, escrita para um VPS self-hosted (Docker Compose + Caddy), não é
> mais o caminho de produção e está preservada só por histórico em
> [`docs/legacy/DEPLOYMENT_VPS.md`](./legacy/DEPLOYMENT_VPS.md).

---

## Já entregue em código (✅)

- ✅ **Autoexclusão de conta** — `DELETE /api/me/conta` (reauth por senha + 2FA), com remoção
  em cascata da empresa para o único dono. Tela em `chaveiro-painel` → Segurança → "Excluir
  minha conta". Teste de integração em `chaveiro-bot/test/integration/autoexclusao_conta.test.js`.
- ✅ **Instrução pública de exclusão** na Política de Privacidade (seção 11), em `/privacidade`
  (acessível sem login) — atende ao requisito da Play Store.
- 🗄️ **`chaveiro-bot/docker-compose.prod.yml`** — stack para deploy self-hosted (Postgres +
  backend + painel + Caddy HTTPS). Não é o caminho de produção atual (ver nota acima) —
  preservado no repositório só para o cenário legado de `docs/legacy/DEPLOYMENT_VPS.md`.
- ✅ **App Android (Capacitor)** gerado em `chaveiro-painel/android/`, com câmera/localização no
  manifest e CapacitorHttp (sem CORS). Ver `chaveiro-painel/CAPACITOR.md`.
- ✅ **API base configurável** (`VITE_API_URL`) para o build do app.

---

## FASE A — Backend + painel em produção (Railway + Cloudflare Pages + Supabase)

- [ ] **A1. Provisionar Supabase.** Criar projeto Supabase; anotar a **conexão direta**
  (porta 5432, não o pooler 6543 — migrations no boot exigem conexão direta, ver
  `docs/CI_CD.md` Troubleshooting) para `DATABASE_URL`/`DIRECT_URL`.
- [ ] **A2. Provisionar Railway.** New Project → Deploy from GitHub → Root Directory =
  `chaveiro-bot` (usa `Dockerfile` + `railway.json`). Configurar **volume persistente** em
  `/app/uploads`. Ativar "Deploy on push" em `master` + "Wait for CI / Check Suites". Ref.:
  `docs/CI_CD.md`, seção "Backend → Railway".
- [ ] **A3. Variáveis no Railway.** Gerar segredos (`openssl rand -hex 32` para `JWT_SECRET`/
  `ENCRYPTION_KEY`, `openssl rand -hex 24` para `API_TOKEN`) e definir no painel do Railway:
  `NODE_ENV=production`, `DATABASE_URL`/`DIRECT_URL` (Supabase, conexão direta), `JWT_SECRET`,
  `ENCRYPTION_KEY`, `API_TOKEN`, `ALLOWED_ORIGIN=https://app.SEU_DOMINIO`,
  `PUBLIC_URL=https://api.SEU_DOMINIO`, `SENTRY_DSN` (opcional). **Não** definir `PORT`
  (injetado pelo Railway) nem `ADMIN_USERNAME`/`ADMIN_PASSWORD` (crie o admin via tela de
  cadastro). Deixar WhatsApp OFF (não definir `WHATSAPP_HABILITADO`). Ref.: `docs/CI_CD.md`,
  "Inventário de secrets/variáveis".
- [ ] **A4. Provisionar Cloudflare Pages.** Connect to Git → Root Directory =
  `chaveiro-painel`, build `npm run build`, output `dist`. Definir `VITE_API_URL`/
  `VITE_SENTRY_DSN` nas Env vars do projeto. Confirmar que `public/_redirects` está no build
  (fallback de SPA). Ref.: `docs/CI_CD.md`, seção "Painel → Cloudflare Pages". **Nota:** o
  deploy real do painel roda via GitHub Actions (`.github/workflows/deploy.yml`,
  `cloudflare/wrangler-action`, disparado após o CI concluir em `master`) — confirmar que
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` estão configurados como secrets do repositório
  no GitHub, não só no painel do Cloudflare.
- [ ] **A5. DNS.** Apontar `app.SEU_DOMINIO` (Cloudflare Pages) e `api.SEU_DOMINIO` (Railway)
  conforme a documentação de cada plataforma para domínio customizado.
- [ ] **A6. Verificar:** `https://app.SEU_DOMINIO` carrega; `https://api.SEU_DOMINIO/health` →
  200 com `database: ok`; migrations aplicadas (`prisma migrate status` via Railway).
- [ ] **A7. Backups.** Confirmar no painel do Supabase (Project Settings → Database → Backups)
  se o backup automático está ativo e qual a retenção; executar **1 restore de teste**. Não
  confirmado nesta missão de documentação — ver `docs/RUNBOOK.md §3` (gap declarado
  explicitamente, não presumir configurado).
- [ ] **A8. Monitoramento.** UptimeRobot/Healthchecks no `/health`; `SENTRY_DSN` (Railway) e
  `VITE_SENTRY_DSN` (Cloudflare Pages) recebendo eventos (testar um erro proposital).
- [ ] **A9. Smoke test:** cadastro, login, 2FA, criar serviço, bater ponto (selfie+geo),
  excluir uma conta de teste.

---

## FASE B — Legal (revisão final)

- [ ] **B1.** Revisar `chaveiro-painel/src/lib/legal.js` com um advogado e **substituir todos os
  `[placeholders]`** (CNPJ, DPO, e-mail de privacidade, retenção, foro). O texto é um MODELO.
- [ ] **B2.** Confirmar `/privacidade` e `/termos` acessíveis sem login em produção (URLs que vão
  na ficha da Play Store).
- [ ] **B3.** Publicar canal de **suporte** (e-mail/WhatsApp) e referenciá-lo no painel.

---

## FASE C — App Android (build do .aab)

Siga `chaveiro-painel/CAPACITOR.md`. Resumo:

- [ ] **C1.** `npm ci` no `chaveiro-painel` (numa máquina com Android Studio + JDK 17).
- [ ] **C2.** `$env:VITE_API_URL='https://api.SEU_DOMINIO'; npm run cap:sync`.
- [ ] **C3.** Rodar em dispositivo/emulador (`npm run cap:open` → Run) e **validar câmera + GPS**
  na batida de ponto (prompt de permissão de runtime aparece).
- [ ] **C4.** Ícone/splash: `@capacitor/assets` (icon 1024×1024 + splash).
- [ ] **C5.** Keystore de upload (`keytool`) + signing em `android/app/build.gradle` (senhas fora
  do git). Gerar `.aab`: `cd android && ./gradlew bundleRelease`.

---

## FASE D — Play Store

- [ ] **D1.** Criar conta **Google Play Developer** (US$ 25). **Faça já** — o teste fechado tem
  prazo de calendário. Conta pessoal nova exige teste fechado de **14 dias com ≥12 testadores**;
  conta de organização (D-U-N-S) é isenta dessa regra.
- [ ] **D2.** Ficha da loja: nome, descrição, **screenshots** (do app), ícone, feature graphic,
  categoria.
- [ ] **D3.** **Segurança de Dados** + **Classificação de conteúdo** + URL da Política de
  Privacidade (`https://app.SEU_DOMINIO/privacidade`) + **fluxo/URL de exclusão de conta**
  (a seção 11 da política já descreve o passo a passo).
- [ ] **D4.** Subir o `.aab` no **track interno**; depois **teste fechado** (≥12 testadores, 14
  dias) se for conta pessoal.
- [ ] **D5.** Submeter para **produção** e passar na revisão do Google.

---

## Pendências de produto (decidir)

- **LGPD — retenção de selfie/geo do ponto:** definir prazo e descarte (registrado em
  `docs/decisions.md`); refletir na política (seção 8).
- **WhatsApp:** quando reativar, seguir `docs/LAUNCH_PLAN.md` F1-3 (Cloud API/Meta) e ligar
  `WHATSAPP_HABILITADO=true`.
