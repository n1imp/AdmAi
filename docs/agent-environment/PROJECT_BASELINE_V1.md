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
| Arquitetura de produção real | Backend → **Railway** (Docker + Supabase Postgres) · Painel → **Cloudflare Pages** (estático) · App → **Android `.aab`** (Capacitor, distribuição manual/Play Store pendente) — confirmado ao vivo em `docs/agent-environment/EV065_VALIDATION_REPORT.md` (EV-066) e documentado em `README.md:402`, `docs/CI_CD.md` |
| PR aberta associada | #100 (**estado: DRAFT**, título desatualizado — ver §7, pendência levantada ao usuário) |
| Repositório | `n1imp/AdmAi`, 2 módulos independentes (`chaveiro-bot/`, `chaveiro-painel/`), sem manifest de monorepo na raiz |

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

## 7. Pendências levantadas ao usuário (não bloqueiam a aprovação documental deste baseline)

1. **PR #100 está em DRAFT com título desatualizado** ("C2 + Onda 1 Eos Security Closure v2
   (T-BILL-01, T-BILL-06, T-REC-01)") — não reflete os ~30+ commits de segurança acumulados
   desde então. Decisão do usuário: atualizar título, promover para "ready for review", ou
   manter como está. Push/gestão de PR exige autorização explícita — não alterado nesta
   missão.
2. **`docs/DEPLOYMENT.md`, `docs/GO_LIVE_CHECKLIST.md` e `docs/RUNBOOK.md` documentam uma
   arquitetura de produção (VPS + Docker Compose + Caddy) diferente da arquitetura real
   atualmente em uso** (Railway + Cloudflare Pages + Supabase, confirmada ao vivo em EV-066,
   ver §1). Verificado por leitura direta dos 3 arquivos nesta execução — os 3 assumem
   `docker compose`/Caddy/backup manual via `pg_dump` em container próprio, nenhum menciona
   Railway/Cloudflare/Supabase. **Correção**: uma verificação anterior desta missão havia
   concluído erroneamente que `docs/RUNBOOK.md` não existia (falso — foi um erro de
   evidência: a busca original só confirmou arquivos que *referenciam* "RUNBOOK", sem checar
   diretamente se o arquivo em si existia); a revisão independente do Gate 9 encontrou e
   corrigiu esse engano antes da aprovação. `docs/RUNBOOK.md` **existe**, está versionado
   (adicionado em `cfdf7fe`, 2026-07-04) e tem conteúdo operacional real e substantivo (saúde/
   diagnóstico, restart, backup/restore, migrations, rotação de segredos, incidentes comuns) —
   mas, como os outros 2, escrito inteiramente para a arquitetura VPS, não para a real. Os
   arquivos `Caddyfile`/`docker-compose.prod.yml`/`railway.json` continuam todos versionados
   — não está claro se o caminho VPS é uma alternativa mantida de propósito ou documentação
   órfã de uma decisão de arquitetura anterior. Decisão do usuário: atualizar os 3 documentos
   para refletir Railway/Cloudflare/Supabase como caminho primário, marcar VPS como
   alternativa explícita, ou arquivar. Nenhuma edição feita nesses 3 arquivos nesta missão.
3. **`chaveiro-painel/package.json` não declara `engines.node`** (o bot declara `>=20`) —
   gap menor de consistência, não corrigido (mudança de configuração fora do escopo desta
   missão de consolidação).

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

Ver a declaração de veredito entregue ao usuário nesta missão (Gate 10) — este documento por
si só não constitui a aprovação; a aprovação é a resposta formal Opção A/B do orquestrador ao
usuário, referenciando este arquivo.
