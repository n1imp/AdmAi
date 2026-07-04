# Checklist de Go-Live — AdmAi (web + Play Store)

Este documento cobre os passos **manuais** (dependem da sua infraestrutura e da conta Google)
para colocar o AdmAi no ar e publicá-lo na Play Store. O que já foi entregue em código
está marcado como ✅ FEITO.

Decisões desta entrega: app via **Capacitor**, hospedagem em **VPS (Docker + Caddy)**,
**WhatsApp desabilitado** no lançamento, **conta Play ainda não criada**.

---

## Já entregue em código (✅)

- ✅ **Autoexclusão de conta** — `DELETE /api/me/conta` (reauth por senha + 2FA), com remoção
  em cascata da empresa para o único dono. Tela em `chaveiro-painel` → Segurança → "Excluir
  minha conta". Teste de integração em `chaveiro-bot/test/integration/autoexclusao_conta.test.js`.
- ✅ **Instrução pública de exclusão** na Política de Privacidade (seção 11), em `/privacidade`
  (acessível sem login) — atende ao requisito da Play Store.
- ✅ **`chaveiro-bot/docker-compose.prod.yml`** — stack de produção (Postgres + backend + painel
  + Caddy HTTPS), portas internas fechadas, sem Evolution/Redis.
- ✅ **App Android (Capacitor)** gerado em `chaveiro-painel/android/`, com câmera/localização no
  manifest e CapacitorHttp (sem CORS). Ver `chaveiro-painel/CAPACITOR.md`.
- ✅ **API base configurável** (`VITE_API_URL`) para o build do app.

---

## FASE A — Backend + painel em produção (VPS)

- [ ] **A1. VPS + DNS.** Provisionar VPS; SSH por chave (sem root/senha); `ufw` + `fail2ban`.
  Apontar `app.SEU_DOMINIO` (painel) e `api.SEU_DOMINIO` (API) para o IP **antes** de subir o
  Caddy (senão o TLS não emite). Ref.: `docs/DEPLOYMENT.md §1–3`.
- [ ] **A2. `.env` de produção** em `chaveiro-bot/.env` (NÃO commitar). Gerar segredos:
  `openssl rand -hex 32` para `JWT_SECRET`, `ENCRYPTION_KEY`, `API_TOKEN`, `POSTGRES_PASSWORD`.
  Definir: `NODE_ENV=production`, `DATABASE_URL=postgresql://chaveiro:<senha>@postgres:5432/chaveirobot`,
  `ALLOWED_ORIGIN=https://app.SEU_DOMINIO`, `PUBLIC_URL=https://api.SEU_DOMINIO`,
  `CADDY_APP_DOMAIN=app.SEU_DOMINIO`, `CADDY_API_DOMAIN=api.SEU_DOMINIO`.
  Deixar WhatsApp OFF (não definir `WHATSAPP_HABILITADO`).
- [ ] **A3. Subir a stack:** `docker compose -f docker-compose.prod.yml up -d --build`.
  As migrations rodam sozinhas (`docker-entrypoint.sh` → `prisma migrate deploy`).
- [ ] **A4. Verificar:** `https://app.` com cadeado; `https://api./health` → 200
  `{"checks":{"database":"ok"}}`; confirmar com `nmap` que 3000/5432 NÃO estão expostos.
- [ ] **A5. Backups.** Cron diário de `pg_dump` + **1 restore testado** em DB temporário;
  (recom.) cópia offsite. Ref.: `docs/DEPLOYMENT.md §7`, `docs/RUNBOOK.md §3`.
- [ ] **A6. Monitoramento.** UptimeRobot/Healthchecks no `/health`; `SENTRY_DSN` de produção
  recebendo eventos (testar um erro proposital).
- [ ] **A7. Smoke test** (`docs/DEPLOYMENT.md §9`): cadastro, login, 2FA, criar serviço, bater
  ponto (selfie+geo), excluir uma conta de teste.

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
