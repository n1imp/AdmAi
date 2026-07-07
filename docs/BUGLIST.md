# BUGLIST — Fase 0 (Diagnóstico)

**Gerado:** 2026-07-07 · **Ambiente:** local isolado (ver abaixo) · **Método:** backend-first (API) + navegação real (Chrome).

Toda afirmação aqui tem evidência (status/payload da API, log ou arquivo). Ordenado por severidade. Legenda de status: ❌ falha reproduzida · ⚠️ a verificar (lead estático, ainda não reproduzido) · ✅ funciona · 🟢 já aplicado/obsoleto.

## Ambiente de teste (reprodutível, sem tocar prod)

- **Postgres 16.4 local** (binários portáteis) na porta **5433**, schema real via `prisma db push` (`schema.prisma`). O `.env` de prod aponta pra **Supabase** — neutralizado por override de `DATABASE_URL`/`DIRECT_URL` (dotenv não sobrescreve env já setado). **Zero mutação contra produção.**
- **Redis local** (portátil) na porta 6390 — sem ele o rate-limiter (`RedisStore`) **trava toda requisição `/api`** (ver Nota A).
- **Backend** `node --env-file=<local> src/server.js` (:3000). **Frontend** `vite` (:5173, proxy `/api`→:3000).
- **Usuários de teste** (criados via API): `dono`/`Dono@123456`, `gestor`/`Gestor@123456`, `func`/`Func@123456` (ids 1/2/3).
- Docker não subiu (WSL2 sem distro → exige reboot); SQLite dev descartado por bug (ver #B2).

---

## Índice

| ID | Título | Sev. | Camada | Status |
|----|--------|------|--------|--------|
| B1 | Rotas Google servidas em `/api/api/google/*` (prefixo `/api` duplicado) → 404 no painel | **P1** | rota (mount) | 🔧 corrigido `78bf6b3` |
| B2 | RBAC ausente: `POST /api/whatsapp/cloud/credenciais` (funcionário sobrescreve credenciais Meta) | **P1** | middleware | 🔧 corrigido `88aa747` |
| B3 | RBAC ausente: todas as rotas Google Business (funcionário lê/conecta/responde) | **P1** | middleware | 🔧 corrigido `62e023b` |
| B4 | `schema.sqlite.prisma` desatualizado (falta `papel`) → quebra o dev local em SQLite | P2 | prisma/schema | 🔧 corrigido `06cf0a2` |
| B5 | Vars ausentes no `.env.example` (`DIRECT_URL`/`RLS_ENABLED`); domínio prod stale (não tocado) | P2 | config | 🔧 corrigido `8ddfc3b` (parcial) |
| B6 | Testes locais poluídos pelo `.env` de prod (`RLS_ENABLED`) → 4 falhas em `tenant.test.js` | P2 | test/config | 🔧 corrigido `e48ed74` |
| L1..L8 | Leads estáticos a reproduzir (partial-auth, mobile, anti-fraude, perf, observabilidade, refetch, a11y, higiene) | P1–P2 | vários | ⚠️ a verificar |

---

## B1 — Rotas Google no caminho errado (prefixo `/api` duplicado) — P1 ❌

**Sintoma:** a aba **Avaliações → Google** no painel bate em `/api/google/*` e recebe **404**. (É o "Bug 2" do `progress.md`, mas a causa lá — "googleRouter não montado" — está **errada**: o router *está* montado em `routes/api.js:19`.)

**Causa raiz (camada: rota/mount):** `src/routes/google.js` define as rotas com o caminho **completo** `googleRouter.get('/api/google/status', …)`, mas `googleRouter` é montado **dentro** de `apiRouter` (`routes/api.js:19` → `router.use('/', googleRouter)`), e `apiRouter` já está em `/api` (`app.js:136`). Resultado: caminho efetivo = **`/api/api/google/*`**. O `whatsappRouter`, que usa a mesma convenção de caminho completo, é montado **na raiz do app** (`app.js`) e por isso funciona.

**Evidência (como `func`, token válido):**
```
GET /api/google/status        -> 404   (o que o frontend chama)
GET /api/api/google/status    -> 200   {"modo":"mock","conectado":false,...}
GET /api/api/google/reviews   -> 200   {"data":[{"reviewId":"mock-1",...}]}
```

**Correção proposta (Fase 1, ~1 linha):** montar `googleRouter` na raiz do app junto do `whatsappRouter` e remover de `routes/api.js` (mantém a convenção de caminho completo). Retestar: `/api/google/status` deve dar 200 e a aba Google carregar.

---

## B2 — RBAC ausente em `POST /api/whatsapp/cloud/credenciais` — P1 ❌

**Causa raiz (camada: middleware):** `src/routes/whatsapp.js:53` protege a rota só com `requireAuth` — **sem `requirePermissao`**. Qualquer usuário autenticado do tenant, inclusive **funcionário**, pode sobrescrever as credenciais Meta Cloud (`phoneNumberId`/`accessToken`) da empresa via `salvarCredenciaisCloud(req.user.empresaId, …)`. É escalonamento intra-tenant (funcionário reconfigura/quebra a integração WhatsApp da empresa).

**Evidência (como `func`):** `POST /api/whatsapp/cloud/credenciais` com body vazio → **400** ("Dados inválidos", ou seja, passou do auth e chegou no zod, **sem** barreira de permissão). **Controles** (rotas com `requirePermissao`) barram corretamente: `GET /api/usuarios` → **403**, `GET /api/dashboard` → **403**.

**Correção proposta:** adicionar `requirePermissao('configuracao','editar')` (ou `adminOnly`) na rota.

---

## B3 — RBAC ausente nas rotas Google Business — P1 ❌ (latente até B1)

**Causa raiz (camada: middleware):** todas as rotas em `src/routes/google.js` (`/status`, `/place-id`, `/locations`, `/location`, `/oauth/iniciar`, `/desconectar`, `/reviews`, `/reviews/:id/responder`) usam só `requireAuth`. Um **funcionário** pode conectar/desconectar o Google e **publicar respostas públicas** a reviews. Em `responder`, a chamada externa ao Google roda antes do check de ownership (google.js ~239 vs 242).

**Evidência (como `func`, no caminho real duplicado):** `GET /api/api/google/reviews` → **200** com dados (sem 403).

**Correção proposta:** `requirePermissao('avaliacoes','ver'|'editar')` por rota (consistente com `avaliacoes/config` em `servicos.js`). Corrigir junto de B1 (mesma área), mas em commit separado.

---

## B4 — `schema.sqlite.prisma` desatualizado quebra o dev local em SQLite — P2 ❌

**Causa raiz (camada: prisma/schema):** `prisma/schema.sqlite.prisma` (artefato de dev gerado por sed do `schema.prisma`) está **defasado** — falta o campo `papel` (migration `20260620000000_rbac_ponto_painel`) e provavelmente colunas de migrations recentes. O bootstrap do admin falha: `Invalid prisma.usuario.create(): Unknown argument 'papel'` (visto no log do backend ao subir em SQLite).

**Impacto:** o caminho de dev em SQLite documentado no próprio schema não funciona (foi o motivo do pivot para Postgres). **Correção proposta:** regenerar `schema.sqlite.prisma` a partir do `schema.prisma` atual (provider→sqlite, remover `directUrl`, `Json`→`String`, remover `@db.*`), ou documentar Docker/Postgres como único caminho de dev.

---

## B5 — Config obsoleta (domínios e vars) — P2 ❌

- **Domínio de API stale:** `chaveiro-painel/.env.production` → `VITE_API_URL=https://api.barbers-flow.com/api`, mas a API real é **`admai-production.up.railway.app`** (conforme `progress.md`). O `.env.example` do backend cita ainda outro domínio (`chaveirobot.com.br`). Rebrand ChaveiroBot→AdmAi não propagou.
- **Vars ausentes no `.env.example` do backend:** `DIRECT_URL` (usada por `schema.prisma`/CI) e `RLS_ENABLED` não estão documentadas.
- **Correção proposta:** alinhar `VITE_API_URL` de prod ao domínio real; documentar `DIRECT_URL`/`RLS_ENABLED`.

---

## B6 — Testes locais poluídos pelo `.env` de prod — P2 ❌

`env.js` faz `import 'dotenv/config'`, que carrega `.env` **incondicionalmente** (mesmo com `NODE_ENV=test`). O `.env` de prod tem `RLS_ENABLED` setado → `RLS_ATIVA=true` no `tenant.js`, e o mock de `prisma` em `tenant.test.js` não implementa `$transaction` → **4 falhas**. **Evidência:** `npm test` = 4 falhas; com `RLS_ENABLED=false` no shell → **180/180 verdes**. Em CI passa (sem `.env` de prod). **Correção proposta:** usar `.env.test` dedicado / não carregar `.env` em `NODE_ENV=test`.

---

## Fase 1 — correções aplicadas (branch `fix/rbac-google-whatsapp-mount`)

| Bug | Commit | Reteste (evidência) |
|-----|--------|---------------------|
| B1 | `78bf6b3` | `/api/google/status` 404→**200**; `/api/api/google/status` 200→**404** |
| B2 | `88aa747` | `POST /whatsapp/cloud/credenciais`: func/gestor **403**, dono **400** |
| B3 | `62e023b` | Google routes: func **403**; gestor/dono **200** |
| B5 | `8ddfc3b` | `DIRECT_URL`/`RLS_ENABLED` no `.env.example` (VITE_API_URL de prod não tocado — pode ser custom domain vivo) |
| B6 | `e48ed74` | `npm test` em shell limpo **180/180** (antes 176/180) — `.env.test` carregado no lugar do `.env` de prod |
| B4 | `06cf0a2` | `prisma db push` do sqlite regenerado **ok**; `papel`/`permissoes` presentes. Novo `npm run prisma:sqlite` (anti-drift) |

**Regressão:** suíte unit backend **180/180 verde** em shell limpo (após B6). RBAC intacto (`permissoes.test.js` passa). Falta rodar `test:integration` (IDOR/auth) — depende de Postgres/Redis oficiais (Docker) / CI.

---

## Reconciliação com `progress.md` — bugs "pendentes" que **já estão feitos** (não reaplicar) 🟢

| Bug (progress.md) | Verdito com evidência |
|---|---|
| 1 — rate limiter IPv6 `ipKeyGenerator` | 🟢 **já aplicado** — `app.js:102,118` usam `ipKeyGenerator(req,res)`; app sobe sem warning |
| 2 — "googleRouter não montado" → 404 | ⛔ **causa errada** — router montado; causa real = **B1** (prefixo `/api` duplicado) |
| 3 — manifest "ChaveiroBot"→"AdmAi" | 🟢 **já feito** — `public/manifest.webmanifest` name = "AdmAi — Painel" |
| 4 — `safe-area-inset-top` (notch) | 🟢 **já aplicado** — `App.jsx:156` `safe-area-top` + `index.css:135`; confirmar em device iPhone |
| 5 — ícones PNG 192/512 PWA | 🟢 **já feito** — `public/icons/icon-192.png` (5.6KB) e `icon-512.png` (20KB) existem |

**Conclusão:** aplicar a lista herdada às cegas seria ~4 no-ops + 1 correção na causa errada. Diagnóstico com evidência evitou isso.

---

## O que funciona (confirmado) ✅

- Login `dono` → **Dashboard/PAINEL renderiza** (KPIs, tour de onboarding). Login `gestor` e `func` OK (200 + token com papel correto).
- **RBAC barra corretamente quando aplicado**: `func` recebe 403 em `/api/usuarios` e `/api/dashboard`.
- Página **Avaliações** renderiza (abas Cliente/Google/Solicitação); `/health` = 200 com `database: ok`.

---

## Leads estáticos a reproduzir na Fase 1/2 (⚠️ ainda sem repro)

| Lead | Onde | Sev. | Como reproduzir |
|------|------|------|-----------------|
| L1 partial-auth escape | `Login.jsx:144` grava token antes do OTP | P1 | cadastro → recarregar no passo OTP → ver se loga completo |
| L2 mobile capture / CapacitorHttp | `api.js`, `capacitor.config.json` | P0/P1 mobile | **só em device Android** (getUserMedia/geolocation no WebView; cookie de refresh) |
| L3 anti-fraude ponto evidencial | `tecnicos.js:368` | P1/decisão | como técnico, `POST /ponto/bater` sem selfie/geo → aceita? (confirmar se é by-design) |
| L4 perf agregação | `servicos.js:294,245`, `tecnicos.js:140` | P1/P2 | `take:10000` em JS; `/avaliacoes` sem `take` (Fase 3 EXPLAIN) |
| L5 observabilidade | `monitoring.js` | P1 | Sentry DSN vazio em prod; sem handler global `unhandledrejection` |
| L6 sem refetch pós-mutação | `Aprovacoes.jsx`, `Servicos.jsx` | P2 | otimista sem reconciliação com servidor |
| L7 pinch-zoom desativado | `index.html` (`user-scalable=no`) | P2 a11y | WCAG 1.4.4 |
| L8 higiene | dir untracked `chaveiro-bot/supabase/`; dead code `ConfiguracaoBotLegado` | P2 | inspecionar/remover |

---

### Nota A — Redis é dependência dura no local
Com `REDIS_URL` inacessível, o `RedisStore` do `express-rate-limit` faz a fila offline do ioredis **travar toda requisição `/api`** (login deu timeout). Não é bug de produção (lá o Redis existe), mas é um risco de resiliência: uma queda do Redis derruba a API inteira em vez de degradar. Avaliar `enableOfflineQueue:false` / fallback memory-store (Fase 3 DevOps).
