# Plano de Lançamento — AdmAi

> ⚠️ **Documento histórico (planejamento de 2026-06), parcialmente superado pela execução
> real.** A FASE 0 (web em produção) descrevia um deploy self-hosted em **VPS + Docker
> Compose + Caddy**, que **não é** o caminho usado — a web foi ao ar em **Railway +
> Cloudflare Pages + Supabase** (ver `docs/CI_CD.md`, `docs/GO_LIVE_CHECKLIST.md`,
> `docs/agent-environment/PROJECT_BASELINE_V1.md`). O app também passou a ser via
> **Capacitor** (não React Native/Expo como planejado aqui). Este documento fica preservado
> como registro do plano original; para o estado real e atualizado, ver
> `docs/GO_LIVE_CHECKLIST.md` (fonte de verdade operacional) e `PROJECT_BASELINE_V1.md`
> (fonte de verdade técnica).

Roadmap por fases para levar o AdmAi a um lançamento público sério: **web em
produção primeiro**, **app Android nativo (React Native/Expo) na Play Store** em seguida.
Cada tarefa tem um **ID** (vira issue), **prioridade**, **critério de pronto (DoD)** e
**esforço** estimado.

> Estado-base (auditoria de 2026-06): backend/segurança/CI/observabilidade **fortes**;
> deploy/ops **documentados mas não executados**; LGPD do cliente final **ok**; **app nativo
> inexistente (0%)**; **autoexclusão de conta ausente**. Detalhes na matriz no fim.

Legenda de prioridade: **P0** = bloqueia o lançamento · **P1** = necessário no lançamento ·
**P2** = qualidade / pode ser pós-lançamento. Esforço: S (≤1 dia) · M (2–4 dias) · L (1–2 sem) · XL (3+ sem).

---

## Estratégia: web-first, app em paralelo

O produto web está quase pronto; o app nativo são semanas. Não faz sentido segurar o
lançamento esperando o app. Sequência recomendada:

| Fase | Objetivo | Prazo alvo |
|---|---|---|
| **0** | Web no ar em produção, validado com chaveiros reais | ~1–2 semanas |
| **1** | Conformidade legal + robustez (paralela à Fase 0/2) | ~1–2 semanas |
| **2** | App React Native/Expo sobre a API | ~4–8 semanas |
| **3** | Publicação na Play Store (inclui teste fechado 14 dias) | ~2–3 semanas |

**Marco "web público": ~2 semanas. Marco "app na Play Store": ~2–3 meses** (realista, dependendo do escopo do app).

---

## FASE 0 — Web em produção (go-live)

> **Superada pela execução real.** O plano original abaixo (VPS + Docker Compose + Caddy)
> não foi o caminho seguido — a web está em produção via Railway + Cloudflare Pages +
> Supabase. A versão real e atualizada desta fase é `docs/GO_LIVE_CHECKLIST.md`, FASE A.
> Tabela original preservada só por histórico:

| ID | P | Tarefa (plano original, não executado assim) | DoD | Esforço |
|---|---|---|---|---|
| **F0-1** | P0 | Provisionar VPS + DNS (`app.` e `api.` apontando pro IP) seguindo `docs/legacy/DEPLOYMENT_VPS.md §1–3` | SSH com chave, sem root/senha; `ufw` + `fail2ban` ativos | M |
| **F0-2** | P0 | `.env` de produção com segredos fortes (`openssl rand`), `NODE_ENV=production`, `ALLOWED_ORIGIN`, `PUBLIC_URL` | Boot do backend passa na validação Zod ([env.js](../chaveiro-bot/src/config/env.js)); **nada commitado** | S |
| **F0-3** | P0 | Subir stack `docker-compose.yml + docker-compose.prod.yml` (Caddy + HTTPS, portas internas fechadas) | `https://app.` com cadeado; `https://api./health` = 200 `database: ok`; portas 3000/8081/8080/5432 fechadas externamente (`nmap`) | M |
| **F0-4** | P0 | Backups automáticos do Postgres + **teste de restore** (`docs/legacy/DEPLOYMENT_VPS.md §7` / `docs/legacy/RUNBOOK_VPS.md §3`) | Cron diário rodando; 1 restore validado em DB temporário; (recom.) cópia offsite S3/Backblaze | M |
| **F0-5** | P1 | Monitor de uptime + alerta (UptimeRobot/Healthchecks no `/health`) e Sentry de produção recebendo eventos | Alerta dispara em downtime de teste; evento de teste visível no Sentry | S |
| **F0-6** | P1 | Smoke test do checklist pós-deploy (`docs/legacy/DEPLOYMENT_VPS.md §9`): cadastro, login, 2FA, login Google, webhook WhatsApp | Todos os itens do checklist ✔ em produção | M |

**Saída da Fase 0 (real):** produto web no ar em Railway + Cloudflare Pages + Supabase —
ver `docs/GO_LIVE_CHECKLIST.md` FASE A para o checklist real, incluindo o item A7 (backup do
Supabase), ainda **não confirmado** nesta execução.

---

## FASE 1 — Conformidade legal & robustez

| ID | P | Tarefa | DoD | Esforço |
|---|---|---|---|---|
| **F1-1** | **P0** | **Autoexclusão de conta** — `DELETE /api/me/conta` (reautenticação por senha/2FA). Para o dono/único admin, apaga a **empresa e todos os dados em cascata**; usuário comum apaga só a própria conta | Endpoint + teste de integração (incl. cascata e isolamento por tenant); tela em [Seguranca.jsx](../chaveiro-painel/src/pages/Seguranca.jsx); fluxo testado ponta a ponta | M |
| **F1-2** | P1 | Publicar **Política de Privacidade** e **Termos** em URLs públicas estáveis (já há [Privacidade.jsx](../chaveiro-painel/src/pages/Privacidade.jsx)/[Termos.jsx](../chaveiro-painel/src/pages/Termos.jsx)); revisar sob a ótica LGPD (base legal, retenção, contato do controlador) | URLs `https://app./privacidade` e `/termos` acessíveis sem login; texto revisado | M |
| **F1-3** | P1 | Finalizar migração **WhatsApp Cloud API (Meta)** — `WHATSAPP_PROVIDER=cloud`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (já há [cloud-gateway.js](../chaveiro-bot/src/services/whatsapp/cloud-gateway.js)) | Envio/recebimento por número oficial; webhook validando assinatura; teste de integração verde | L |
| **F1-4** | P1 | Página/canal de **suporte** (e-mail + WhatsApp) e "fale conosco" no painel | Canal publicado e respondendo | S |
| **F1-5** | P2 | **Teste de carga** básico (k6/autocannon) nos endpoints quentes (`/api/dashboard`, `/api/servicos`, webhook) + revisar índices Prisma | Relatório de latência/erro sob carga alvo; gargalos endereçados | M |
| **F1-6** | P2 | Dashboards Grafana + agregação de logs (Loki/Better Stack) apontando para `/metrics` (ver `docs/RUNBOOK.md §6`) — `docker-compose.monitoring.yml` é só o caminho legado self-hosted, não se aplica a Railway | Painel de latência/erro/memória no ar; logs centralizados | M |

**Saída da Fase 1:** conformidade legal completa (incl. exclusão de conta — pré-requisito da Play Store) e robustez operacional.

---

## FASE 2 — App nativo (React Native / Expo)

> Reaproveita 100% da API REST existente (auth JWT por `Authorization: Bearer`). O app é
> para o **dono/admin** (o técnico continua no WhatsApp). Repo separado ou monorepo
> `chaveiro-app/`.

| ID | P | Tarefa | DoD | Esforço |
|---|---|---|---|---|
| **F2-1** | P0 | Scaffold **Expo** (TypeScript) + navegação + cliente HTTP (axios) reusando os contratos de [lib/api.js](../chaveiro-painel/src/lib/api.js); JWT em `expo-secure-store` | App roda no Android (Expo Go/dev build), faz login real e abre o Dashboard | L |
| **F2-2** | P0 | Portar telas núcleo: **Login (+2FA+OTP+social), Dashboard, Serviços (lista+novo), Técnicos, Avaliações, Estoque/Catálogo, Configurações, Usuários** | Paridade funcional com o painel nas telas núcleo; navegação e estados de erro/carregando | XL |
| **F2-3** | **P0** | **Exclusão de conta in-app** (consumindo F1-1) — exigência da Play Store visível dentro do app | Fluxo de exclusão acessível em Configurações, com confirmação | S |
| **F2-4** | P1 | **Push notifications (FCM)** — token do device no backend, envио nos eventos (estoque baixo, resumo, avaliação) reusando o inbox `Notificacao` | Push recebido no device em evento real; opt-in/preferências respeitados | L |
| **F2-5** | P1 | Ícone, splash, identidade visual (reusar tema dark + cyan), deep links | Assets aplicados; `app.json` configurado | M |
| **F2-6** | P1 | Build **EAS** gerando `.aab` assinado (Play App Signing), `targetSdkVersion` atual | `.aab` instalável via track interno | M |

**Saída da Fase 2:** app Android funcional, assinado, pronto pra loja.

---

## FASE 3 — Play Store

| ID | P | Tarefa | DoD | Esforço |
|---|---|---|---|---|
| **F3-1** | P0 | Conta **Google Play Developer** (US$ 25) | Conta criada e verificada | S |
| **F3-2** | P0 | Ficha da loja: nome, descrição, **screenshots**, ícone, categoria | Listagem completa no Console | M |
| **F3-3** | P0 | **Formulário "Segurança de Dados"** + **Classificação de conteúdo** + URL da Política de Privacidade + **URL de exclusão de conta** | Formulários aprovados sem pendências | M |
| **F3-4** | **P0** | **Teste fechado** ≥ 12 testadores por **14 dias** (exigência p/ contas pessoais novas) | 12 testadores ativos por 14 dias corridos | L (prazo de calendário) |
| **F3-5** | P0 | Submeter para **produção** e passar na revisão do Google | App publicado | M |

**Saída da Fase 3:** AdmAi público na Play Store.

---

## Apêndice A — Matriz de prontidão (estado atual)

| Área | Estado | Observação |
|---|---|---|
| Segurança (auth/2FA/OAuth/HMAC/CSP/rate limit) | 🟢 | Forte; não regredir os contratos de [SECURITY.md](../SECURITY.md) |
| Isolamento multi-tenant | 🟢 | Testado |
| CI (lint+unit+integração+audit) | 🟢 | Backend e frontend |
| Observabilidade (Sentry/Prometheus/Pino) | 🟢 | Falta cadastrar uptime/alertas (F0-5) |
| Deploy/HTTPS/backups | 🟢 | Web em produção real (Railway + Cloudflare Pages + Supabase); backup do Supabase **não confirmado** (ver `docs/GO_LIVE_CHECKLIST.md` A7) |
| LGPD — cliente final | 🟢 | `anonimizar-cliente` + retenção 180d, testado |
| LGPD/Play — **conta do usuário** | 🔴 | **Autoexclusão ausente** (F1-1) |
| WhatsApp Cloud API oficial | 🟡 | Migração em andamento (F1-3) |
| App nativo Android | 🔴 | **0% — não existe** (Fase 2) |
| Play Store (conta/listing/testes) | 🔴 | Não iniciado (Fase 3) |

## Apêndice B — Caminho crítico

```
F0 (web no ar) ──▶ F1-1 (exclusão de conta) ──▶ F2 (app) ──▶ F2-6 (.aab) ──▶ F3-4 (teste 14d) ──▶ F3-5 (produção)
```

O **teste fechado de 14 dias (F3-4)** e o **app (F2-2, XL)** são o caminho crítico — comece o app cedo e recrute testadores com antecedência.
