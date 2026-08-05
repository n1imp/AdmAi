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

- [x] **A1. Provisionar Supabase.** ✅ Confirmado ao vivo em 2026-08-05 (missão "Project
  Baseline v1 — Publicação Oficial"): `/health` → `database: ok`.
- [x] **A2. Provisionar Railway.** ✅ Confirmado ao vivo em 2026-08-05: `Server:
  railway-hikari`; redeploy real observado (uptime resetou após o merge do PR #101).
- [x] **A3. Variáveis no Railway.** ✅ Confirmado indiretamente — a aplicação funciona
  corretamente em produção (cadastro/login/2FA/serviços testados ao vivo em 2026-08-05),
  o que implica `JWT_SECRET`/`ENCRYPTION_KEY`/`DATABASE_URL`/etc. corretamente definidas.
- [x] **A4. Provisionar Cloudflare Pages.** ✅ Confirmado ao vivo em 2026-08-05: `Server:
  cloudflare`; deploy real via `deploy.yml` observado com sucesso (antes disso, o deploy
  estava silenciosamente bloqueado desde 2026-07-25 pelo gate de `npm audit` — ver
  commit `8782971`/PR #101; corrigido nesta mesma missão).
- [ ] **A5. DNS.** **Não confirmado.** Produção roda nos domínios padrão da plataforma
  (`admai-production.up.railway.app`, `admai-painel.pages.dev`), não em domínio
  customizado — pode ser decisão deliberada, não investigado nesta missão.
- [x] **A6. Verificar:** ✅ Confirmado ao vivo em 2026-08-05 — `/health` 200 com
  `database: ok`; migrations aplicadas e funcionais (smoke test real criou registros —
  usuário, empresa, técnico, serviço, ponto — todos persistidos com sucesso).
- [ ] **A7. Backups.** ⚠️ **CONFIRMADO — sem cobertura de backup nenhuma.** Verificado
  diretamente no painel do Supabase em 2026-08-05 (projeto `AdmAI`, org `n1imp`, Free
  Plan): aba "Scheduled backups" declara literalmente *"Free Plan does not include
  project backups."*; aba "Point in time" declara *"Point in Time Recovery is a Pro Plan
  add-on... Starts at $100/month."* — **nenhum dos dois mecanismos está disponível no
  plano atual.** Não é um gap de configuração, é uma limitação do plano contratado. Ver
  `docs/RUNBOOK.md §3`. **Tarefa objetiva:** decisão do usuário — upgrade para o Plano
  Pro do Supabase (backup diário incluso, PITR como add-on), ou implementar um `pg_dump`
  externo agendado (ex.: GitHub Actions com cron, contra a conexão direta) como mitigação
  de menor custo.
- [ ] **A8. Monitoramento.** **Não confirmado.** `SENTRY_DSN`/`VITE_SENTRY_DSN` são
  variáveis documentadas, mas presença de eventos reais no Sentry e configuração de
  uptime externo não são verificáveis sem acesso aos painéis das plataformas.
- [x] **A9. Smoke test:** ✅ Executado ao vivo em produção em 2026-08-05 (conta
  `SMOKE-TEST-2026-08-05-*`, claramente identificada): cadastro, login, 2FA
  (setup+ativação), criar técnico, criar serviço+cliente, login como técnico, troca de
  senha provisória, bater ponto — **todos OK** (11/12 passos, 1.0–6.1s de resposta cada).
  **1 achado real:** `POST /me/documentos` (gerar documento) retornou `500 {"erro":"Erro
  interno"}` — bug reproduzível, não é uma regressão desta publicação (funcionalidade não
  tocada por este branch), causa raiz não diagnosticada (a aplicação não expõe stack
  trace por design; sem acesso aos logs do Railway não foi possível ir além). Registrado
  como pendência objetiva para investigação futura, fora do escopo desta missão.
  **Não executado:** exclusão da conta de teste — as 2 empresas de teste criadas
  (`smoketest_1785900291493`, `smoketest_1785900358426`) têm 2FA ativo e a autoexclusão
  exige um código TOTP válido, que não foi persistido entre execuções do script
  descartável; ficam como dado de teste isolado (multi-tenant, sem impacto em clientes
  reais) até uma limpeza manual futura.

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
