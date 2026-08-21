# ROUND-00 — EOS-Repository-Mapper (testes, CI/CD, ambientes, documentação)

| Campo | Valor |
|---|---|
| Rodada | 00 (bootstrap, pré-Rodada 1) |
| Agente EOS | `EOS-Repository-Mapper` (com insumo para `EOS-QA-Acceptance`) |
| Tipo de subagente usado | `Explore` (somente leitura, busca "medium") |
| Data | 2026-08-05 |
| Commit-base | `30bf545` (código idêntico à tag `project-baseline-v1`) |
| Mandato | Testes backend/frontend, E2E, fixtures/seed, CI/CD, existência de staging, documentação de `docs/`, descrição de produto no README, roadmap |
| Grau de confiança | ALTA |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. O orquestrador reverificou independentemente a ausência de staging nos workflows
> (`grep` por staging/preview/homologação em `.github/` → zero resultados) e a existência dos
> arquivos do kit de staging de banco.

---

# Inventário factual — Testes, CI/CD, Ambientes e Documentação (AdmAi)

Repositório: monorepo de 2 apps (`chaveiro-bot` backend, `chaveiro-painel` frontend) + `docs/` + `tools/`. Leitura somente; nada foi alterado.

---

## 1. Testes backend (`chaveiro-bot`)

### 1.1 Configs Vitest (2 configs distintas)

| Arquivo | Papel |
|---|---|
| `chaveiro-bot/vitest.config.js` | Unitários. `include: ['src/**/*.test.js','scripts/**/*.test.js']`, env node, injeta env mínimo (DATABASE_URL/API_TOKEN/JWT_SECRET/ENCRYPTION_KEY/ADMIN_*) para não derrubar o Zod de `config/env.js`. Timeouts 30s. Cobertura v8 com `include: ['src/**/*.js']` e **thresholds: statements 27 / branches 22 / functions 28 / lines 27** (queda reprova CI). |
| `chaveiro-bot/vitest.integration.config.js` | Integração. `include: ['test/integration/**/*.test.js']`, `globalSetup: test/integration/global-setup.js`, `fileParallelism: false` (banco compartilhado + TRUNCATE), carrega `.env.test`, liga flags `WHATSAPP_HABILITADO`, `SERVICO_ANDAMENTO_ENABLED`, `DOCUMENTOS_ENABLED`. **Sem thresholds de cobertura.** |

Scripts (`chaveiro-bot/package.json`): `test` = `vitest run` · `test:coverage` · `test:integration` = `vitest run --config vitest.integration.config.js` · `lint` · `typecheck` (`tsc -p jsconfig.json`) · `format:check` · `validate:staging` · `bucket:check|provision|validate`.

### 1.2 Unitários — `chaveiro-bot/src/**/__tests__` + `scripts/__tests__` (42 arquivos)

Raiz `src/__tests__`:
- `recuperacao2faRateLimit.test.js` — `/api/auth/login/2fa/recuperar` herda `twoFactorLimiter` (5/15min) por prefix match (T-REC-02).
- `security-headers.test.js` — headers de segurança do helmet (CSP etc.).

`src/config/__tests__`: `env.test.js` (validação Zod do env) · `sentry.test.js` (F5) · `sentryTransport.test.js` (transport winston→Sentry).
`src/db/__tests__`: `tenant.test.js` (`prismaParaEmpresa` — validação do escopo por tenant).
`src/middlewares/__tests__`: `rateLimiters.test.js` (`identidadeDaRequisicao`, chaves de rate limit).
`src/routes/__tests__`: `billing.test.js` (`despacharEvento` de `checkout.session.completed`) · `tecnicos-foto-perfil.test.js` (`validarFotoPerfil`, achado F2).

`src/services/__tests__` (22): `agendador-lock.test.js` (lock distribuído de cron, F1a) · `agendador.test.js` (resumo semanal) · `auth.test.js` (gerar/verificar JWT) · `avaliacao.test.js` (captura de resposta) · `billing.test.js` (checkout Stripe) · `bootstrap.test.js` (`bootstrapAdmin`) · `catalogo.test.js` (normalização) · `codigosRecuperacao.test.js` (concorrência real, EV-056) · `confirmacaoExclusaoConta.test.js` (código stateless, F3) · `estoque.test.js` (isolamento por `empresaId`, F6) · `idempotencia.test.js` (`marcarSeNovo`, F5.2) · `identidade.test.js` (`resolverRemetente` — número único) · `oauth.test.js` (provedores habilitados) · `otp.test.js` · `parser.test.js` (conversão de valor) · `periodo.test.js` · `permissoes.test.js` (`presetDoPapel` — RBAC) · `ponto.test.js` (formatação de duração/RH) · `senha.test.js` (força de senha) · `storage.test.js` (F1b) · `telefone.test.js` (normalização) · `totp.test.js` (segredo 2FA).

`src/services/google/__tests__`: `analise.test.js` (`iaDisponivel`) · `businessClient.test.js` (erro de verificação).
`src/services/whatsapp/__tests__`: `gateway.test.js` (`mapearEstado`) · `cloud-gateway.test.js` (`soDigitos`) · `crypto.test.js` (encrypt/decrypt de segredos em repouso).
`src/utils/__tests__`: `busca.test.js` (filtros textuais por provider PG/SQLite) · `logger.test.js` (`redigirSensiveis`) · `resiliencia.test.js` (`comTimeout`, F5) · `upload.test.js` (`conferirMagicBytes`).
`scripts/__tests__`: `audit-gate.test.js` (gate de `npm audit` + allowlist) · `backfill-uploads.test.js` (tipo de conteúdo / path traversal).

### 1.3 Integração — `chaveiro-bot/test/integration/` (28 testes + 2 infra)

Infra: `global-setup.js` (roda `npx prisma migrate deploy` uma vez; exige `DATABASE_URL`) · `helpers.js` (exporta `limparBanco()` — TRUNCATE descobrindo tabelas em `pg_tables` + flush do Redis dos rate limiters —, `criarEmpresaComAdmin()`, `criarFuncionarioComAcesso()`, `prisma`).

| Arquivo | Cobre (~casos) |
|---|---|
| `aggregate_perfil_dashboard.test.js` | Equivalência de valor do aggregate no banco, perfil+dashboard (F3.2) — 3 |
| `assinatura_cadastro.test.js` | Assinatura criada no cadastro (T-BILL-06) — 3 |
| `auth.test.js` | `POST /api/setup`, login, sessão — 7 |
| `autoexclusao_conta.test.js` | `DELETE /api/me/conta` (confirmação/2FA) — 7 |
| `billing_google_auth.test.js` | `requireAuth`/`adminOnly` reais em billing + Google — 11 |
| `bugs_regressao.test.js` | Regressão B1..B* (credenciais WhatsApp Cloud, prefixos de rota) — 6 |
| `cadastro_otp.test.js` | Cadastro com OTP de telefone — 3 |
| `conta_2fa_bruteforce.test.js` | EV-067: rate limit dedicado em `/me/2fa/ativar` — 9 |
| `dashboard_groupby.test.js` | `/api/dashboard` aggregate+groupBy, técnicos homônimos (F3.3) — 2 |
| `documentos.test.js` | Documentos do funcionário, flag on/off (F9/M4) — 7 |
| `e2e_rbac_ponto.test.js` | Fluxo E2E funcionário: acesso → ponto → serviço pendente → aprovação — 1 |
| `gestor_indicadores.test.js` | `GET /api/gestor/indicadores` (F9/M2) — 3 |
| `idor.test.js` | IDOR cross-tenant — 4 |
| `inbound_numero_unico.test.js` | Roteamento inbound WhatsApp, gatilho "serviço", número único — 3 |
| `lgpd.test.js` | `POST /api/lgpd/anonimizar-cliente` — 2 |
| `login_disambiguacao_leak.test.js` | EV-063: vazamento de info no login (corpo/status/timing) — 10 |
| `me_metricas.test.js` | `GET /api/me/metricas` período + série (F9/M1) — 4 |
| `metricas.test.js` | Equivalência de valor das métricas (F3.1) — 2 |
| `preferencias.test.js` | Preferências de dashboard (F9/M5) — 6 |
| `rbac_privilege_escalation.test.js` | F1-BYPASS: teto de autoridade em `POST/PATCH/DELETE /usuarios` — 18 |
| `recuperacao_2fa.test.js` | `POST /api/auth/login/2fa/recuperar` — 8 |
| `rls.test.js` | Row Level Security no banco (F4-RLS.1) — 1 |
| `seguranca.test.js` | RBAC + força de senha (admin) — 8 |
| `servico_atual.test.js` | Serviço em andamento / iniciar-concluir (F9/M3) — 6 |
| `servicos_keyset.test.js` | Paginação keyset por cursor (F3.5) — 3 |
| `takeover_reset_pin.test.js` | C1: reset de PIN contra conta de maior privilégio — 6 |
| `tecnico_criacao.test.js` | `POST /api/tecnicos` com campos estendidos — 3 |
| `troca_email_confirmacao.test.js` | `PATCH /me`: troca de e-mail exige confirmação no endereço antigo — 5 |

---

## 2. Testes frontend (`chaveiro-painel`)

### 2.1 Configs

| Arquivo | Papel |
|---|---|
| `chaveiro-painel/vite.config.js` (bloco `test`) | Suíte principal. jsdom, `globals: true`, `setupFiles: ./src/test/setup.js`, `include: ['src/**/*.test.{js,jsx}']`, timeouts 15s. Cobertura v8 `include: ['src/**/*.{js,jsx}']`, **thresholds: statements 30 / branches 31 / functions 29 / lines 29**. |
| `chaveiro-painel/vitest.a11y.config.js` | Suíte a11y standalone (não estende o vite.config para não concatenar `include`): roda **só `src/**/*.axe.jsx`** com axe-core. |

Scripts: `test`, `test:coverage`, `test:a11y`, `e2e` (`node e2e/run.mjs`), `lint`, `typecheck`, `format:check`, `build`, `cap:sync`.
Suporte: `chaveiro-painel/src/test/setup.js` e `chaveiro-painel/src/test/axe.js`.

### 2.2 Testes (28 `*.test.js[x]` + 5 `*.axe.jsx`)

Componentes — `src/components/__tests__`: `EstadoVazio.test.jsx` · `Guards.test.jsx` (`RequireAuth`/`RequirePermissao`) · `MaterialPicker.test.jsx` (combobox acessível O-10) · `MaterialPicker.qtd.test.jsx` (quantidade).
Primitives UI — `src/components/ui/__tests__`: `Button.test.jsx` · `Field.test.jsx` · `Overlay.test.jsx` · `Structure.test.jsx` · `FeedbackState.test.jsx` (+ adapters legados) · `Motion.test.jsx` (movimento reduzido no tour) · **`Button.axe.jsx`** (axe).
Config/hooks/lib: `src/config/__tests__/navigation.test.js` (`buildNavigation` PR2+PR4) · `src/hooks/__tests__/useFormPersist.test.js` (F8) · `src/hooks/__tests__/useWidgetPrefs.test.js` (F4d) · `src/lib/__tests__/api.test.js` (`formatarMoeda`) · `src/lib/__tests__/senha.test.js`.
Páginas — `src/pages/__tests__`: `Aprovacoes.test.jsx` · `Dashboard.test.jsx` (estados F8) · `DashboardWidgets.test.jsx` (alternativa textual dos gráficos O-11) · `DashboardWidgetsOps.test.jsx` (F7) · `Documentos.test.jsx` (F9/M4) · `GestorHome.test.jsx` (F7 + F9/M2) · `MeuPainel.test.jsx` (F9/M1) · `MeuPonto.test.jsx` · `MeusServicos.test.jsx` · `NovoServico.test.jsx` (wizard FO3) · `NovoServicoFuncionario.test.jsx` · `Servicos.test.jsx` (paginação keyset) · `Servicos.a11y.test.jsx` (filtros recolhíveis FI4) · **axe**: `Documentos.axe.jsx`, `GestorHome.axe.jsx`, `MeuPainel.axe.jsx`, `MeusServicos.axe.jsx`.

---

## 3. E2E, fixtures e seed

**Playwright/Cypress: NÃO existem.** Grep em `chaveiro-painel/package.json` e `chaveiro-bot/package.json` por `playwright|cypress|puppeteer` retorna zero.

E2E real = harness próprio Chrome headless + CDP:
- `chaveiro-painel/e2e/run.mjs` — sobe servidor HTTP próprio que serve `../dist` (SPA fallback), mocka `/api/*` deterministicamente e devolve 404 em `/sw.js` (desliga o service worker). Papéis simulados por JWT falso em `localStorage`. Screenshot de falha em `e2e/e2e-falha.png`.
- `chaveiro-painel/e2e/README.md` — cobertura atual declarada: **M1** (MeuPainel + KPIs) e **M4** (Documentos, flag on/off). Próximo incremento previsto: M2 e M3. Exige build com `VITE_API_URL=/api`. Decisão citada em `.ai/decisions/DEC-20260719-E2E-CDP.md` — **esse diretório `.ai/` não existe no worktree** (link quebrado).
- Backend tem um "E2E" lógico dentro da integração: `chaveiro-bot/test/integration/e2e_rbac_ponto.test.js`.

**Seed/fixtures/factories:**
- **Não existe `prisma/seed*`** — `chaveiro-bot/prisma/` contém apenas `schema.prisma`, `schema.sqlite.prisma`, `sqlite-schema.mjs`, `migrations/` (27 migrations, de `20260524204642_` a `20260803000000_usuario_telefone_unique`) e `rls/enable_rls.sql`. Não há chave `prisma.seed` no `package.json`.
- Factories = funções em `chaveiro-bot/test/integration/helpers.js` (`criarEmpresaComAdmin` via `POST /api/auth/register` com `X-Forwarded-For` único por empresa; `criarFuncionarioComAcesso`). "Seed" nos testes é dado montado inline por arquivo (ex.: `dashboard_groupby.test.js`, `metricas.test.js`).
- Frontend: sem fixtures compartilhadas; mocks inline por teste + mocks do harness E2E.
- Templates de env: `chaveiro-bot/.env.example`, `.env.test.example`, `.env.staging.example` (os `.env` reais são gitignored).

---

## 4. CI/CD — `.github/workflows/`

### `ci.yml` (workflow `CI`)
Dispara em `push` e `pull_request` para `main`/`master`. `concurrency` com cancel-in-progress. Permissões `contents: read`, `pull-requests: read`.

| Job | Condição | O que roda |
|---|---|---|
| `changes` | sempre | `dorny/paths-filter@v4` → outputs `backend` (`chaveiro-bot/**`), `frontend` (`chaveiro-painel/**`), `codexpolicy` (`tools/codex-policy/**`); qualquer mudança em `ci.yml` liga os três. |
| `codex-policy` | se `codexpolicy` | **windows-latest** (semântica de path do Windows é load-bearing), Node 22, `node --test tools/codex-policy/*.test.mjs`. |
| `backend` | se `backend` | ubuntu, Node 20, services **postgres:16-alpine** + **redis:7-alpine**. Passos: `npm ci` → `prisma generate` → **gate anti-drift** (`prisma migrate deploy` + `prisma migrate diff --exit-code`) → `lint` → `typecheck` → `format:check` → **`test:coverage`** → **`test:integration`** → **audit gate** (`npm audit --json` + `scripts/audit-gate.mjs`, falha em High+ salvo allowlist `scripts/audit-allowlist.json`). |
| `docker-build` | se `backend` | `docker build -t admai-bot:ci ./chaveiro-bot` (smoke do Dockerfile antes do Railway). |
| `frontend` | se `frontend` | ubuntu, Node 20: `npm ci` → `lint` → `typecheck` → `format:check` → **`test:coverage`** → **`test:a11y` (axe, BLOQUEANTE)** → `build` → **E2E CDP (`VITE_API_URL=/api npm run build && npm run e2e`) com `continue-on-error: true` — NÃO bloqueante** → `npm audit --audit-level=high --omit=dev`. |
| `ci-ok` | `always()` | Gate único para branch protection. Falha se `changes` não teve sucesso (evita "passar em falso" com jobs skipped) ou se qualquer job foi `failure`/`cancelled`. |

### `deploy.yml` (workflow `Deploy`)
Dispara por `workflow_run` do workflow **CI** concluído em `master` (não em push direto). Job `deploy-frontend`: só roda se `conclusion == 'success'`; faz checkout do `workflow_run.head_sha` (publica exatamente o commit aprovado), Node 20, `npm ci`, `npm run build` com `VITE_API_URL`/`VITE_CRISP_ID`/`VITE_POSTHOG_KEY` (secrets), e publica via `cloudflare/wrangler-action@v4`: `pages deploy chaveiro-painel/dist --project-name=admai-painel --branch=master`. **Só ambiente de produção; nenhum branch/env alternativo.**

### `security.yml` (workflow `Security`)
Dispara em `pull_request` (main/master), **cron `0 6 * * 1`** (segunda 06:00 UTC) e `workflow_dispatch`. Jobs: `semgrep` (container `semgrep/semgrep`; passo 1 relatório completo não-bloqueante, passo 2 **gate falhando só em severidade ERROR**, rulesets `p/owasp-top-ten` + `p/javascript` sobre `chaveiro-bot/src chaveiro-painel/src`) · `gitleaks` (`gitleaks/gitleaks-action@v3`, `fetch-depth: 0`) · `audit` (matriz `[chaveiro-bot, chaveiro-painel]`; bot usa `audit-gate.mjs`, painel usa `--audit-level=high --omit=dev`).

### `release.yml` (workflow `Release`)
Dispara em `workflow_dispatch` (input `build_android`, default true) ou push de tag `v*`. Job `android-aab`: Node 20 + Temurin JDK 17, `npm run cap:sync` com `vars.VITE_API_URL`, restaura keystore de `ANDROID_KEYSTORE_BASE64` (falha explícita se ausente), `gradlew bundleRelease`, limpa segredos (`if: always()`), publica artifact `admai-release-aab`. Upload à Play Store está **comentado** (aguardando service account). Deploy web não vive aqui.

Outros: `.github/dependabot.yml`. Documentação viva do pipeline em `docs/CI_CD.md`, incluindo o achado de **dois pipelines concorrentes de deploy do painel** (GitHub Actions + integração nativa Git↔Cloudflare Pages) e o incidente de 2026-08-05 (build da integração nativa sem `VITE_API_URL` gerou CSP `connect-src` sem a origem da API → login quebrado em produção).

---

## 5. Ambientes — existe STAGING?

**Resposta objetiva: NÃO existe um ambiente de staging da aplicação. Existe apenas um projeto Supabase de staging (banco), usado como sandbox de validação de banco/RLS/performance — nunca como ambiente de deploy do app.**

Evidências a favor de "não existe staging de aplicação":
- `.github/workflows/deploy.yml`: único destino é Cloudflare Pages `--project-name=admai-painel --branch=master`. Não há `environment:`, nem branch de preview, nem job condicional por ambiente.
- `docs/CI_CD.md` (seções "CD", linhas 31-73): descreve exatamente três destinos — Railway (backend, deploy on push em `master` com "Wait for CI"), Cloudflare Pages (painel, production branch `master`), Android `.aab`. **Zero menção a staging/preview/homologação em todo o arquivo** (grep por `staging` em `docs/CI_CD.md` e `docs/DEPLOYMENT.md` retorna 0 linhas).
- `README.md:660` menciona staging apenas como regra de conduta ("Deploy direto em produção (fora de staging), sem ter passado pela validação"), não como ambiente provisionado.
- `docs/decisions.md:80` cita staging só como passo desejável ("aplicar a migration em staging").

Evidências do que **de fato existe** (staging de banco):
- `docs/db/STAGING_VALIDATION.md` — kit de validação. Linha 22: projeto Supabase **`admai-staging`** criado (org `n1imp`, região `sa-east-1`, ref `qsuufuulxfkkeasgxhcv`, Healthy). Linha 28: ⚠️ **falta o dono fazer 2 edições em `chaveiro-bot/.env.staging`** (senha real + `ALLOW_STAGING_WRITES=true`) — ou seja, ainda **não executado**. Destrava Prisma 7 no pooler (ADR-005), ligar RLS (ADR-004) e EXPLAIN/carga (F5).
- `chaveiro-bot/.env.staging.example` — trava anti-prod: `ALLOW_STAGING_WRITES`, allowlist `STAGING_REF`, blocklist `PROD_HOST_BLOCKLIST` (staging e prod dividem o mesmo host de pooler).
- Scripts: `chaveiro-bot/scripts/validate-staging.mjs` (`npm run validate:staging`), `validate-rls-staging.mjs`, `smoke-pooler.mjs`, `smoke-storage.mjs`, `provision-bucket-documentos.mjs` (`bucket:*` rodam com `--env-file=.env.staging`).
- `docs/ARCHITECTURE_EVOLUTION_PLAN.md:15` — "validação em `admai-staging`"; `docs/TUTORIAL_RLS_DAST.md` — RLS + DAST "dependem de staging + Supabase".

Ambientes efetivos hoje: **local/dev** (docker-compose + Vite proxy), **test/CI** (Postgres+Redis efêmeros no runner), **produção** (Railway + Cloudflare Pages + Supabase). Não há preview deployments de PR.

---

## 6. Documentação em `docs/` (uma linha cada)

Raiz de `docs/`:
- `docs/AUDIT.md` — painel mestre de prontidão: tabela de Fases 0-3 com status (Fase 0 diagnóstico ✅, Fase 1 correções 🔄, Fase 2 testes funcionais desktop ✅/mobile parcial, Fase 3 auditorias especializadas 🔄) + tabela de findings B1-B17 com commit de correção.
- `docs/BUGLIST.md` — diagnóstico Fase 0 (2026-07-07): bugs B1-B8 com evidência, correções aplicadas, leads estáticos L1-L8 (L2 mobile, L4 perf `take:10000`, L5 observabilidade ainda "a verificar"), seção "O que funciona (confirmado)".
- `docs/TESTPLAN.md` — plano de testes funcionais Fase 2 por fluxo × papel × plataforma (A Auth, B RBAC, C Ponto, D Serviços/aprovação, E Estoque, F Dashboard, G Avaliações/Google, H Billing, I Responsividade/PWA) + resultados das passadas desktop e mobile de 2026-07-07.
- `docs/decisions.md` — log persistente de decisões de arquitetura/trade-off (decisão registrada não é reinvestigada).
- `docs/ARCHITECTURE_EVOLUTION_PLAN.md` — plano de evolução para escala/resiliência/HA: estado atual com evidência, premissas questionadas, trade-offs, fases F0-F6 e **roadmap consolidado** (billing+região+Sentry → stateless/object storage → LB+réplicas → cache+keyset → réplica de leitura+Decimal+RLS+retenção LGPD → OTel/SLO → HA multi-AZ/PITR). Nada implementado.
- `docs/DB_ARCHITECTURE_PLAN.md` — roteiro de 12 seções (papel Principal Data Architect) para levar o banco a nível corporativo; só planejamento.
- `docs/GO_LIVE_CHECKLIST.md` — passos manuais de go-live: "já entregue em código", FASE A (Railway+Cloudflare+Supabase), FASE B (legal), FASE C (.aab), FASE D (Play Store) e **"Pendências de produto (decidir)"** (retenção LGPD de selfie/geo; quando reativar WhatsApp).
- `docs/LAUNCH_CHECKLIST.md` — checklist de configuração dos serviços externos e deploy do zero, com seções ⚠️ bloqueantes.
- `docs/LAUNCH_PLAN.md` — plano de lançamento de 2026-06, marcado como **histórico/parcialmente superado** (previa VPS+Caddy, não é o caminho real).
- `docs/CI_CD.md` — como o projeto integra/testa/entrega; CI job a job, CD por plataforma, inventário de secrets por plataforma, troubleshooting, achado dos dois pipelines Cloudflare.
- `docs/DEPLOYMENT.md` — deploy de produção oficial (Railway + Cloudflare Pages + Supabase), confirmado ao vivo.
- `docs/RUNBOOK.md` — runbook operacional dia-a-dia e de incidentes na arquitetura oficial.
- `docs/DEPS_MAJORS.md` — passada dedicada de majors do Dependabot (ex.: Vite 7→8 com Rolldown exigindo `manualChunks` como função), com evidência por upgrade.
- `docs/TUTORIAL_META_WHATSAPP.md` — passo a passo para obter credenciais da Meta/WhatsApp Cloud API.
- `docs/TUTORIAL_RLS_DAST.md` — passo a passo para concluir RLS (Fase 3) e DAST com OWASP ZAP, dependentes de staging+Supabase.

`docs/db/` (execução do `DB_ARCHITECTURE_PLAN`, tudo aterrado em `arquivo:linha`):
- `db/README.md` — índice da pasta, explica que cada arquivo é entregável de uma fase.
- `db/01-discovery.md` — F0 descoberta do negócio + F1 auditoria do estado atual; itens que só o dono resolve marcados **⚠️ CONFIRMAR** (leitura obrigatória para descoberta de produto).
- `db/02-domain-model.md` — F2 modelagem DDD: 25 modelos reais vs. entidades/VOs/eventos/agregados/bounded contexts, guardião de cada invariante.
- `db/03-adrs.md` — F3 ADRs formato Nygard (inclui ADR-002 Float→Decimal, ADR-004 RLS, ADR-005 Prisma 7 no pooler).
- `db/04-data-model.md` — F4 ER real + dicionário de dados com sensibilidade LGPD + achados de normalização/índices/FK.
- `db/05-performance.md` — F5 consultas quentes com evidência, SLOs propostos (alguns placeholders), plano de índices/keyset/cache.
- `db/06-security-lgpd.md` — F6 STRIDE, menor privilégio, multi-tenant e dados sensíveis (geo+selfie+CPF+salário), aterrado em `enable_rls.sql`.
- `db/07-scalability.md` — F7 escalabilidade por gatilho numérico (partição/shard só ao atingir limiar).
- `db/08-operations.md` — F8 dia-2/DBRE: operabilidade, recuperabilidade, evolução segura (drift B7, Prisma 7).
- `db/STAGING_VALIDATION.md` — kit de staging de banco (ver seção 5).

`docs/legal/`:
- `legal/POLITICA_DE_PRIVACIDADE.md` — **modelo** com campos `[ ]` a preencher e validar com advogado.
- `legal/TERMOS_DE_USO.md` — **modelo** idem, "Última atualização: [DD/MM/AAAA]".

`docs/agent-environment/` (governança e missões de agentes):
- `PROJECT_BASELINE_V1.md` — consolidação oficial da plataforma (metodologia Evidence Driven Execution, gates 1-10, arquitetura confirmada ao vivo).
- `FUNCTIONALITY_MATRIX_V1.md` — **inventário funcional por módulo** (rotas backend × páginas frontend × cobertura de teste × bugs/leads × criticidade) — o ativo mais direto para descoberta de produto.
- `SECURITY_BASELINE_v1.md` / `SECURITY_CLOSURE_FINAL_REPORT.md` / `SECURITY_CLOSURE_REPORT.md` / `SECURITY_FINAL_REPORT.md` — frente de segurança declarada encerrada, sem pendências categoria A/B.
- `EV060_/EV063_/EV065_/EV070_*REPORT.md` — relatórios por achado (escalonamento lateral em `admin.js`; vazamento no login; validação de EV-065 contra produção real → "NÃO existe"; `ipKeyGenerator` remediado).
- `SECURITY_HARDENING_BACKLOG.md` — 16 itens Categoria C não bloqueantes, com condição de reentrada no escopo.
- `EOS_SECURITY_CLOSURE_V2_PLAN.md` — plano vivo EDE (planejamento, nada implementado).
- `AGENT_DECISIONS.md` — ledger de decisões de agentes quando não há plano/contrato ativo.

`docs/legacy/`: `DEPLOYMENT_VPS.md` e `RUNBOOK_VPS.md` — marcados **[LEGADO]**, arquitetura VPS+Docker Compose+Caddy que não é a produção atual.

Raiz do repo (fora de `docs/`): `README.md`, `AGENTS.md` (contrato normativo dos agentes), `CLAUDE.md` (roteamento do orquestrador), `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, `tools/codex-policy/README.md`.

---

## 7. README.md da raiz — descrição do produto

Arquivo: `README.md` (43 KB). **Atenção estrutural:** as linhas 1-22 são um bloco "Governança de agentes" + checklist OWASP Mobile Top 10; o README de produto começa na **linha 23**.

- **Título (L23):** "🔑 AdmAi — Plataforma SaaS de Gestão para Chaveiros via WhatsApp".
- **Tagline (L25-27):** plataforma **multi-empresa (SaaS)** onde os técnicos registram serviços **conversando com um robô no WhatsApp** e o dono acompanha receita, comissões, estoque e avaliações por um **painel web (desktop + mobile)**.
- **Seção "🎯 O que é" (L52-64)** — dor resolvida: registrar e contabilizar **serviços de campo sem fricção**.
  - **Público/personas:** (a) **Técnico** — manda `serviço` no privado do robô e responde uma pergunta por vez (local, valor, cliente, foto); ao confirmar, o serviço é salvo e o resumo é postado no grupo da empresa. (b) **Dono/admin** — painel com receita líquida, ticket médio, comparativo de período, ranking de técnicos, comissões, estoque de materiais, avaliações de clientes, e exportação de PDF de fechamento.
  - **Visão declarada de arquitetura de produto:** "Cada **empresa é um _tenant_ isolado**" — todo dado de negócio escopado por `empresaId`, múltiplas empresas na mesma instância com dados estanques.
- **"🏗 Arquitetura" (L68-99):** diagrama WhatsApp ↔ Evolution API (1 instância por empresa) → `POST /webhook/whatsapp/:empresaId` (HMAC/token) → `inbound.js` → `conversa.js` (máquina de estados) → Prisma/Postgres; painel React consome `/api/*` com JWT; `node-cron` para avaliações/resumos; observabilidade Sentry + Prometheus `/metrics` + Pino. **Dois modos de WhatsApp:** Evolution API multi-instância (multi-tenant) e WhatsApp Cloud API da Meta (`WHATSAPP_PROVIDER=cloud`).
- **"🧱 Stack" (L102-117):** Node 20/Express 4/Prisma 5/Postgres 16/Zod/node-cron/pdfkit no backend; Vite 7/React 18/Tailwind/Recharts/lucide/driver.js no painel; testes Vitest+Supertest e Vitest+Testing Library.
- **"🗃 Modelo de domínio" (L121-141):** módulos/entidades — Empresa (tenant), EmpresaWhatsapp, Usuario (2FA TOTP, `tokenValidoApos`), ContaSocial (Google/Microsoft/Apple), Tecnico (comissão %, meta mensal), Servico (valores, local, cliente, foto), Material + MovimentacaoEstoque + ServicoMaterial, Avaliacao (NPS 1-5 agendada), Notificacao (inbox), Pagamento (comissões), SessaoConversa.
- **"💬 Fluxo do bot" (L144-164):** máquina de estados `local → endereço → descrição → material → valor cobrado → nome do cliente → telefone do cliente → foto → confirmação`; comandos globais `cancelar`/`voltar`; sessão persistida e expira em 30 min; só técnicos cadastrados iniciam.
- **"🔐 Autenticação & Segurança" (L168+)**, **"🌐 API REST — endpoints" (L195-298)** com 9 grupos (públicas, `/me`, notificações, serviços/dashboard/técnicos, RBAC+PIN+aprovação, ponto eletrônico RH, materiais/estoque, avaliações/relatório/usuários, gateway WhatsApp/infra), **"🖥 Painel — rotas" (L300)**, **"⚙️ Setup & execução" (L327)**, **"🔧 Variáveis de ambiente" (L377)**, **"✅ Testes & CI" (L419-433)**, **"📁 Estrutura de pastas" (L437)**, **"🤖 Guia para IAs & Agentes" (L488-716, subseções 13.1-13.6)**, **"🗺 Roadmap" (L719-727)**.

> Nota de divergência: a seção "✅ Testes & CI" (L431-433) descreve o CI de forma desatualizada — cita apenas backend/frontend com audit, sem mencionar os gates atuais de `typecheck`, `format:check`, `migrate diff`, `test:a11y` bloqueante, E2E não-bloqueante, `docker-build` e o gate agregador `ci-ok`. Fonte correta e atualizada: `docs/CI_CD.md`.

---

## 8. Roadmap / funcionalidades futuras — onde está

Existe, disperso em quatro lugares (não há um `ROADMAP.md`):

1. **`README.md` L719-727 — "🗺 Roadmap" (produto):** resumo automático semanal no grupo (ranking de receita/destaque da semana) · validação de líquido no bot (recalcular cobrado − material e avisar divergências) · histórico por endereço (clientes recorrentes) · verificação de e-mail/telefone por OTP sobre a estrutura já existente em `Usuario` · app Android nativo (PWA → React Native + Expo) · integração contábil (exportação compatível com MEI).
2. **`docs/ARCHITECTURE_EVOLUTION_PLAN.md` seção 8 (L195+) — "Roadmap consolidado" (técnico):** F0 fundação (billing + região sa-east-1 + Sentry/metrics) → F1 stateless (object storage, separar web/worker, lock de cron) → F2 LB + réplicas web → F3 cache-aside + matar `take:10000` + keyset → F4 réplica de leitura + Decimal + RLS + retenção LGPD → F5 OpenTelemetry + alertas SLO + circuit breakers → F6 HA multi-AZ + PITR/DR testado; gatilhos futuros: particionamento, UUIDv7, Kafka/SQS, multi-região. Seção 5 lista melhorias recomendadas não solicitadas e seção 6 gargalos futuros previstos.
3. **`docs/GO_LIVE_CHECKLIST.md` L123-128 — "Pendências de produto (decidir)":** retenção LGPD de selfie/geo do ponto (prazo e descarte) e reativação do WhatsApp (`WHATSAPP_HABILITADO=true`, seguindo `docs/LAUNCH_PLAN.md` F1-3 / Cloud API).
4. **Backlogs formais:** `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` (16 itens Categoria C com condição de reentrada) e `docs/AUDIT.md` seção "Backlog remanescente (não bloqueante, com justificativa)". `docs/agent-environment/FUNCTIONALITY_MATRIX_V1.md` declara-se explicitamente "ponto de partida da próxima frente (Funcionalidades)" e registra que a priorização de roadmap "cabe ao usuário na próxima frente" — inclui itens parqueados como `ConfiguracaoBotLegado` ("Em breve", `ConfiguracaoBot.jsx:82`, confirmado não-morto em BUGLIST L8) e o TODO de migração Cloud API em `services/whatsapp/cloud-gateway.js:127`.
