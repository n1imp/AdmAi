# Project Baseline v1 — AdmAi

**Missão:** "Project Baseline v1 — Consolidação Oficial da Plataforma"
**Metodologia:** Evidence Driven Execution (EDE) — Gates 1-10, evidência produzida nesta
execução (git/CI reais, leitura direta de código, testes rerodados localmente).

---

## 1. Identificação

| Campo | Valor |
|---|---|
| Data | 2026-08-04 |
| Commit (HEAD no momento do congelamento) | `e98425a1f98313f059683098318c2edf72572168` |
| Branch | `fix/seguranca-criticos` (112 commits à frente de `master`) |
| Versão | `chaveiro-bot@1.0.0`, `chaveiro-painel@1.0.0` |
| Arquitetura de produção real | Backend → **Railway** (Docker + Supabase Postgres) · Painel → **Cloudflare Pages** (estático) · App → **Android `.aab`** (Capacitor, distribuição manual/Play Store pendente) — confirmado ao vivo em `docs/agent-environment/EV065_VALIDATION_REPORT.md` (EV-066) e reconfirmado ao vivo nesta missão (§11) |
| PR aberta associada | #100 (**estado: DRAFT** — mantido de propósito; título/descrição atualizados nesta missão, §11) |
| Repositório | `n1imp/AdmAi`, 2 módulos independentes (`chaveiro-bot/`, `chaveiro-painel/`), sem manifest de monorepo na raiz |

---

## Arquitetura Oficial

> **A partir deste commit, esta é a única arquitetura oficialmente suportada.**

| Componente | Plataforma | Evidência |
|---|---|---|
| **Backend** | **Railway** (build Docker via `railway.json`, healthcheck `/health`) | Confirmado ao vivo nesta missão: `GET https://admai-production.up.railway.app/health` → `200`, header `Server: railway-hikari` |
| **Frontend** | **Cloudflare Pages** (estático, projeto `admai-painel`) | Confirmado ao vivo nesta missão: `GET https://admai-painel.pages.dev/` → `200`, header `Server: cloudflare` + `CF-RAY`; CSP `connect-src` aponta para o domínio Railway acima |
| **Banco** | **Supabase** (Postgres, conexão direta porta 5432 para migrations) | `chaveiro-bot/.env.example:2` ("Deploy: Railway (Docker) + Supabase (Postgres)"), `DATABASE_URL`/`DIRECT_URL` de exemplo usando `supabase.co` |
| **Deploy backend** | Integração nativa Railway↔GitHub — "Deploy on push" em `master`, condicionado ao CI (`ci-ok`) verde | `docs/CI_CD.md`, seção "Backend → Railway" |
| **Deploy frontend** | **GitHub Actions** (`deploy.yml`) — dispara via `workflow_run` após o `CI` concluir com sucesso em `master`, publica com `cloudflare/wrangler-action@v4`. **Não** é a integração nativa Git↔Cloudflare | `.github/workflows/deploy.yml`, lido diretamente nesta missão |
| **App Android** | Capacitor, `.aab` assinado via `.github/workflows/release.yml` (tag `v*`) | `docs/CI_CD.md` |
| **Rollback** | Backend: redeploy de um deployment anterior no dashboard Railway. Painel: "Rollback to this deployment" no dashboard Cloudflare Pages. Banco: forward-fix (sem migration *down* automática, decisão deliberada) | `docs/RUNBOOK.md`, `docs/DB_ARCHITECTURE_PLAN.md:352-361` |
| **Monitoramento** | Sentry (`SENTRY_DSN` no Railway, `VITE_SENTRY_DSN` no Cloudflare Pages) + `/metrics` (Prometheus, sem auth) + uptime externo (UptimeRobot/Healthchecks, não confirmado se configurado) | `docs/RUNBOOK.md §6` |
| **Ambientes** | Só produção confirmada nesta execução (`master` → deploy automático); PRs geram preview deployments no Cloudflare Pages (nativo do Pages, independente do `deploy.yml`) | `docs/CI_CD.md` |

**Arquitetura legada (não oficial):** VPS + Docker Compose + Caddy — desenho original do
projeto, substituído. Preservada só por valor histórico em `docs/legacy/` (`DEPLOYMENT_VPS.md`,
`RUNBOOK_VPS.md`), com aviso explícito em cada arquivo. Os artefatos de infraestrutura desse
caminho (`chaveiro-bot/Caddyfile`, `docker-compose.prod.yml`, `docker-compose.monitoring.yml`,
`railway.json` — este último na verdade É usado, ver acima) continuam versionados, mas não são
o caminho de produção.

**Gap conhecido, não confirmado nesta missão:** política de backup automático e teste de
restore do Supabase de produção — ver `docs/GO_LIVE_CHECKLIST.md`, item A7. Não presumido como
resolvido.

---

## 2. Estado da Plataforma

### Segurança

Ver §3 — encerrada, sem Categoria A/B, 16 itens Categoria C no backlog.

### Backend (`chaveiro-bot`)

- Node `>=20` (declarado em `engines`), 29 dependências diretas / 8 devDependencies.
- Estrutura: `routes/` (11 arquivos, um por domínio) → `services/` (~28 arquivos, lógica de
  negócio) → `db/`/`middlewares/`/`queues/`/`workers/`/`utils/`/`config/`, cada um com
  `__tests__/` próprio, mais `test/integration/` (28 arquivos, foco forte em RBAC/IDOR/
  LGPD/RLS/força-bruta).
- Lint: **0 erros**, 6 warnings pré-existentes (variáveis não usadas, todas com padrão
  `no-unused-vars` já configurado para não bloquear CI).
- Typecheck (`tsc -p jsconfig.json`): limpo.
- Testes unitários (rerodados nesta execução, `npx vitest run`): **41/41 arquivos, 390/390
  testes passando**.
- Testes de integração: **não executados localmente nesta missão** — esta worktree não tem
  Postgres disponível (limitação ambiental, declarada explicitamente, não tratada como teste
  aprovado). Evidência real e autoritativa: CI do commit `e98425a` (run `30956693824`, job
  `backend`) confirma o passo "Testes de integração (Supertest + Postgres)" verde.
- Único TODO real encontrado em todo `src/`: `services/whatsapp/cloud-gateway.js:127`
  (migração pendente para tipos de mídia além de texto na Cloud API do WhatsApp) — gap
  funcional documentado, não é bug de segurança.
- Nenhum arquivo órfão encontrado na amostra completa de `routes/`; nenhuma dependência com
  pin suspeito (`file:`/`git:`/`*`/`latest`); nenhuma configuração duplicada real (múltiplos
  `.env*.example`/`vitest.*.config.js` são variantes intencionais por ambiente/tipo de teste).

### Frontend (`chaveiro-painel`)

- Sem `engines.node` declarado no `package.json` (gap menor, não corrigido nesta missão —
  registrado como nota). 12 dependências diretas / 23 devDependencies.
- Lint: **0 erros**, 12 warnings pré-existentes (variáveis não usadas, 3 dependências de
  `useEffect` faltando — `AuthContext.jsx`, `useAnalytics.js`, `NovoServico.jsx` —, espaço em
  branco irregular num teste).
- Testes unitários (rerodados nesta execução, `npm test`): **28/28 arquivos, 130/130 testes
  passando**.
- Build de produção (`npm run build`): **sucesso** — único aviso é sobre tamanho de chunk
  (>500kB, `charts`/`index`), cosmético, não bloqueante.

### Mobile

App Android via Capacitor gerado (`chaveiro-painel/android/`); publicação na Play Store ainda
não iniciada (ver `docs/GO_LIVE_CHECKLIST.md` FASE C-D, todos os itens ainda `[ ]`).

### Banco

27 migrations aplicadas (`chaveiro-bot/prisma/migrations/`), mais recente
`20260803000000_usuario_telefone_unique`. Estratégia de rollback é **forward-fix** (decisão
corporativa deliberada, documentada em `docs/DB_ARCHITECTURE_PLAN.md:352-361`) — não há
migration *down* automática por design do Prisma.

### CI/CD

Ver §4.

---

## 3. Segurança

A Frente de Segurança está **oficialmente encerrada para a arquitetura atualmente
implantada** — declaração já publicada em
`docs/agent-environment/SECURITY_CLOSURE_FINAL_REPORT.md` e
`docs/agent-environment/SECURITY_BASELINE_v1.md`, ambos revisados nesta missão (Gate 2) sem
nenhuma inconsistência material encontrada entre eles, `EOS_SECURITY_CLOSURE_V2_PLAN.md` e os
4 relatórios dedicados por missão (EV060/063/065/070).

- **Categoria A:** 0
- **Categoria B:** 0
- **Categoria C:** 16 (ver `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` — não
  duplicado aqui)

8 achados rastreados (EV-056, EV-057, EV-060, EV-063, EV-065, EV-067, EV-069, EV-070), todos
corrigidos, refutados ou aceitos como risco residual/decisão de produto. Detalhe completo,
evidências e rastreabilidade: `docs/agent-environment/SECURITY_BASELINE_v1.md`.

**Correção documental aplicada nesta missão (Gate 2):** as linhas EV-056/EV-057 na tabela
mestra de `EOS_SECURITY_CLOSURE_V2_PLAN.md` não tinham o marcador "✓" inline nem refletiam
que já haviam sido resolvidas (Wave 1 da missão "Security Closure Operation", commits
`7a644d8`/`3f0f049`) — o texto antigo ainda dizia "pendente de triagem do usuário". Corrigido
para eliminar a contradição interna entre a tabela mestra e a Discovery Queue (itens 28/29,
já fechados). Edição cosmética/de consistência, sem mudança de conteúdo técnico.

---

## 4. CI

| Workflow | Arquivo | Propósito |
|---|---|---|
| CI | `.github/workflows/ci.yml` | `backend` (lint/typecheck/testes unit+integração/audit), `docker-build` (smoke do Dockerfile), `frontend` (lint/testes/build/audit), `ci-ok` (gate agregador, check obrigatório de branch protection) |
| Security | `.github/workflows/security.yml` | Semgrep, Gitleaks, `npm audit` (bot + painel) |
| Deploy | `.github/workflows/deploy.yml` | — |
| Release | `.github/workflows/release.yml` | Build do `.aab` Android assinado, disparado por tag `v*` |

**Status real do CI mais recente** (commit `e98425a`, runs `30956693824`/`30956694077`,
verificado por leitura direta do log desta execução, não presumido):

- `backend`: lint, typecheck, format (Linux/CI), testes unitários e de integração — **todos
  verdes**.
- `frontend`: lint, testes, build — **verdes**.
- `docker-build`, `codex-policy`: **verdes**.
- `Security` (Semgrep, Gitleaks): **verdes**.
- **Exceção aceita:** `npm audit --audit-level=high` falha no job `audit (chaveiro-bot)` por
  causa do CVE em `ip-address` (`GHSA-mwp4-54f8-5fhr`) — já investigado, reproduzido e
  classificado **Categoria C** na missão EV-069 (estruturalmente inalcançável nesta
  aplicação). `audit (chaveiro-painel)` aparece cancelado no mesmo run — efeito do fail-fast
  da matrix do job `audit`, não uma falha própria do painel.

**Validação local desta execução** (Gate 5, rerodada — não apenas citada do CI anterior):
lint (bot+painel), typecheck (bot), testes unitários (bot: 390/390, painel: 130/130), build
(painel) — todos confirmados verdes agora, na worktree atual. `format:check` do bot **falha
localmente** por diferença de fim-de-linha (CRLF vs LF) — causa raiz confirmada por inspeção
direta de um arquivo (`core.autocrlf=true` neste checkout Windows converte LF→CRLF; o
`.prettierrc` do projeto não declara `endOfLine`, então o padrão `lf` do Prettier rejeita
qualquer arquivo CRLF). **Não é uma regressão de código** — é um artefato do ambiente local
Windows; o CI (Linux) é a fonte autoritativa e está verde para este mesmo commit. Testes de
integração não executados localmente (sem Postgres nesta worktree) — limitação ambiental
declarada, CI é a evidência autoritativa.

---

## 5. Hardening

Todo o backlog de hardening (16 itens, todos Categoria C, nenhum bloqueante) está em
`docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` — não duplicado aqui.

---

## 6. Auditoria do Repositório (Gate 3)

112 commits à frente de `master`, distribuição por tipo (Conventional Commits): 41 `fix`, 19
`docs`, 12 `test`, 6 `deps` (Dependabot), 4 `feat`, 4 `ci`, 3 `style`, 2 `chore`, 1 `refactor`,
mais ~20 commits de merge de PRs já revisadas (#47-#99, incluindo Dependabot). Nenhuma
mensagem de commit temporária/experimental encontrada (`wip`/`temp`/`debug`/`scratch`/
`placeholder` etc. — busca sem resultados). `git status --short` limpo (só `.codex/`
untracked, esperado). Nenhum arquivo local indevidamente versionado — `git ls-files` filtrado
por padrões suspeitos (`.env`, `.bak`, `.dump`, `.log`, `credential`, `secret`) só retorna os
4 `.env*.example` legítimos.

---

## 7. Pendências — status após a missão "PROJECT BASELINE V1 — Final Approval" (§11)

As 3 pendências levantadas na missão anterior foram **todas resolvidas** nesta execução:

1. ~~PR #100 em DRAFT com título desatualizado~~ — **resolvido**: título e descrição
   atualizados via `gh pr edit` (autorizado explicitamente pelo Gate 4 desta missão), refletindo
   o escopo real acumulado. Estado DRAFT mantido de propósito (não é uma pendência — decisão
   de merge continua do usuário).
2. ~~`docs/DEPLOYMENT.md`/`GO_LIVE_CHECKLIST.md`/`RUNBOOK.md` descreviam VPS como
   arquitetura oficial~~ — **resolvido**: ver §11, Gate 2/3.
3. ~~`chaveiro-painel/package.json` sem `engines.node`~~ — **resolvido**: adicionado
   `>=20`, grounded em evidência real (todo workflow que roda o painel — `ci.yml` job
   `frontend`, `deploy.yml`, `release.yml` — usa Node 20).

**Único gap residual conhecido, não resolvido (fora do escopo de uma missão documental):**
confirmação de backup automático + teste de restore do Supabase de produção
(`docs/GO_LIVE_CHECKLIST.md`, item A7). Não é uma inconsistência documental — é uma
verificação operacional pendente que só o usuário pode confirmar no painel do Supabase.

---

## 8. Matriz Funcional

Ver `docs/agent-environment/FUNCTIONALITY_MATRIX_V1.md` — inventário completo dos ~19 módulos
funcionais da plataforma (rotas, páginas, cobertura de teste, bugs/leads conhecidos,
criticidade técnica), ponto de partida para a próxima frente.

---

## 9. Revisão Final (Gate 9)

Ver seção de rastreabilidade — revisão independente executada por agente fresco antes da
declaração do Gate 10, mandato: confirmar que este documento e a matriz funcional
representam fielmente o estado real do repositório, não procurar vulnerabilidade nova.

---

## 10. Encerramento

Ver a declaração de veredito entregue ao usuário na missão "Project Baseline v1" (Gate 10
original) — Opção B (não aprovado), bloqueado exclusivamente pela inconsistência de
arquitetura resolvida em §11 abaixo.

---

## 11. Consolidação de Infraestrutura — missão "PROJECT BASELINE V1 — Final Approval"

Missão dedicada, EDE completo, para resolver a única pendência que bloqueava a Opção A da
missão anterior: documentação operacional descrevendo uma arquitetura diferente da real.

**Gate 1 (revalidação com evidência fresca):** confirmado ao vivo, nesta execução — ver
"Arquitetura Oficial" acima. Sem divergência — não foi necessário interromper a missão.

**Gate 2 (classificação dos documentos operacionais):**

| Documento | Estado | Motivo | Ação |
|---|---|---|---|
| `docs/DEPLOYMENT.md` (original) | Legado | Guia completo de deploy self-hosted VPS+Docker+Caddy, nunca mencionava Railway/Cloudflare/Supabase | Movido para `docs/legacy/DEPLOYMENT_VPS.md` (com banner ⚠️), path original virou ponteiro curto para `CI_CD.md` |
| `docs/RUNBOOK.md` (original) | Legado | Runbook operacional inteiro escrito para `docker compose`/Caddy — nenhum comando se aplica à produção real | Movido para `docs/legacy/RUNBOOK_VPS.md` (com banner ⚠️), path original recebeu um runbook novo e real para Railway/Cloudflare/Supabase |
| `docs/GO_LIVE_CHECKLIST.md` | Parcialmente correto | FASE A (infra) era só VPS; FASE B (legal)/C (Android)/D (Play Store) são corretas e independentes de arquitetura | Mantido no lugar; FASE A reescrita para Railway/Cloudflare/Supabase; nota explícita apontando a versão original para `docs/legacy/DEPLOYMENT_VPS.md` |
| `README.md` | Parcialmente correto | 3 pontos stale: checklist OWASP M3/M9 citando Caddy como controle ativo; comentário sobre topologia de proxy (`Caddy → nginx → backend = 2`) desalinhado, mesmo texto do comentário stale em `app.js` (item 13 do backlog, não corrigido) | Atualizar (3 edições pontuais) — feito |
| `docs/CI_CD.md` | Parcialmente correto | Dizia "CD — integração nativa (sem Actions de deploy)" para o painel, mas o deploy real roda via `deploy.yml`+`wrangler-action`; tabela de secrets omitia `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`VITE_CRISP_ID`/`VITE_POSTHOG_KEY` e confundia o `VITE_API_URL` variable (`release.yml`) com o secret de mesmo nome (`deploy.yml`) | Atualizar — feito |
| `SECURITY_BASELINE_v1.md` | Oficial | Já descrevia a arquitetura real corretamente (linha 10) desde a missão anterior | Manter — nenhuma edição necessária |
| `docs/LAUNCH_PLAN.md` | Parcialmente correto (achado do Gate 5, loop-back) | Documento de planejamento de 2026-06, FASE 0 inteira descrevia VPS como o go-live pendente; Apêndice A marcava "Deploy/HTTPS/backups" como 🟡 não executado | Banner de documento histórico + FASE 0 marcada como superada, com nota apontando para `GO_LIVE_CHECKLIST.md`; Apêndice A atualizado para 🟢 |
| `chaveiro-bot/scripts/backup-uploads.sh` / `restore-uploads.sh` | Legado (achado do Gate 5, loop-back) | Scripts reais e funcionais, mas só válidos contra volumes Docker de uma VPS — não aplicáveis ao volume do Railway | Banner de cabeçalho adicionado (comentário, sem mudança de lógica/comportamento) |
| `CHANGELOG.md` | Parcialmente correto (achado do Gate 5, loop-back) | Item "A fazer" listava "Infra de produção em VPS" como trabalho pendente rumo ao 1.0.0 | Marcado como feito (caminho diferente do planejado), com nota do gap real (backup Supabase) |
| `chaveiro-bot/src/app.js:37-40` | Legado, **não alterado de propósito** | Comentário de código descreve a mesma topologia stale (`Caddy → nginx → backend`) | **Não editado** — já é o item 13 do `SECURITY_HARDENING_BACKLOG.md` (Categoria C, aceito), e esta missão restringe explicitamente alterar código da aplicação e corrigir itens Categoria C. `README.md` agora documenta explicitamente que esse comentário está desalinhado, para não deixar a contradição silenciosa. |
| `chaveiro-painel/nginx.conf:29` | Legado, não alterado | Comentário afirma que "o Caddy termina TLS na frente" — só usado no caminho self-hosted, config do painel local/legado | Não editado — baixa prioridade, arquivo já pertence exclusivamente ao caminho legado |

**Gate 3 (sincronização):** `README.md` ganhou uma seção "Arquitetura Oficial" explícita
(logo após a linha de Deploy) declarando Railway/Cloudflare/Supabase como único suportado e
apontando `docs/legacy/` como não-oficial. `docs/CI_CD.md` corrigido (mecanismo de deploy do
painel + tabela de secrets). `SECURITY_BASELINE_v1.md` já estava correto.

**Gate 4 (pendências administrativas):** PR #100 — título e descrição atualizados via
`gh pr edit` (ação visível autorizada explicitamente pelo texto da missão); estado DRAFT
mantido, não é uma decisão desta missão. `chaveiro-painel/package.json` — `engines.node
>=20` adicionado, com base em evidência real (Node 20 em todo workflow que toca o painel).

**Gate 5 (revisão cruzada independente):** agente fresco, mandato de achar qualquer
referência restante a VPS/Caddy como oficial. Confirmou o núcleo (README/CI_CD/DEPLOYMENT/
RUNBOOK/GO_LIVE_CHECKLIST/legacy) consistente, mas encontrou 3 arquivos fora do conjunto
originalmente revisado (`docs/LAUNCH_PLAN.md`, os 2 scripts de backup/restore de uploads,
`CHANGELOG.md`) — **todos corrigidos nesta mesma execução, sem nova rodada necessária**
(loop-back único, convergiu).

**Gate 6 (baseline):** esta seção.

**Gate 7 (validação final):** Nenhum arquivo remanescente encontrado apresentando VPS/Caddy
como arquitetura oficial (confirmado pela segunda passada do Gate 5, incluída acima).
Documentação consistente. Arquitetura consistente. Rastreabilidade preservada (todas as
edições, motivos e arquivos tocados documentados nesta seção). Nenhum documento operacional
contraditório remanescente. Nenhum arquivo legado tratado como oficial — todos os 2 arquivos
movidos para `docs/legacy/` têm banner `⚠️ LEGADO` explícito, e os 2 documentos parcialmente
corretos (`GO_LIVE_CHECKLIST.md`, `LAUNCH_PLAN.md`) têm a seção legada claramente isolada e
rotulada dentro do próprio arquivo. Nenhum deploy, merge, migration ou nova auditoria de
segurança executados.
