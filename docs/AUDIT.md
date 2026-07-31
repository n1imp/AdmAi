# AUDIT — Painel de prontidão do AdmAi

Índice mestre de "quanto falta pro app estar pronto". Atualizado ao fim de cada fase.
Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluído.

## Fases

| Fase | Escopo | Status | Findings |
|------|--------|--------|----------|
| **0 — Diagnóstico** | Varredura dos fluxos, backend+frontend, com evidência → [`BUGLIST.md`](./BUGLIST.md) | ✅ concluído | **P1: 3** · P2: 3 · L1/L3 confirmados (decisão) · L6 refutado · 5 leads restantes |
| 1 — Correção (P0→P1→P2) | Loop 1-bug-por-vez, branch+CI, reteste no browser | 🔄 em andamento | **6 corrigidos** (3 P1 + 3 P2), verificados; unit 180/180 |
| 2 — Testes funcionais | Plano por fluxo × papel × desktop/mobile → [`TESTPLAN.md`](./TESTPLAN.md) | 🔄 desktop ✅ · mobile parcial | desktop: core + **B1 end-to-end** ✅. Mobile: impl. verificada via DOM (L7 live, BottomNav) — render precisa DevTools device mode/Android. Faltam alguns fluxos + Fase 3 |
| 3 — Auditoria especializada | Backend/API · Banco · Segurança · CI/CD · UI/UX | 🔄 quase | **Segurança ✅** · **Banco ✅** (B7/B8, migrate diff zerado) · **CI/CD ✅** (+ `migrate diff` no CI) · **UI/UX ✅** (axe: crítica `button-name` corrigida; 2 landmarks moderate no login pendentes; Lighthouse pendente). **Resta:** Dependabot majors (passada dedicada) |

## Findings confirmados (Fase 0)

| ID | Sev. | Título | Status |
|----|------|--------|--------|
| B1 | **P1** | Rotas Google em `/api/api/google/*` (prefixo duplicado) → 404 no painel | 🔧 `78bf6b3` |
| B2 | **P1** | Sem RBAC em `POST /api/whatsapp/cloud/credenciais` | 🔧 `88aa747` |
| B3 | **P1** | Sem RBAC nas rotas Google Business | 🔧 `62e023b` |
| B4 | P2 | `schema.sqlite.prisma` defasado (falta `papel`) | 🔧 `06cf0a2` (+ gerador anti-drift) |
| B5 | P2 | `DIRECT_URL`/`RLS_ENABLED` fora do `.env.example` | 🔧 `8ddfc3b` (domínio prod não tocado) |
| B6 | P2 | Testes locais poluídos pelo `.env` de prod (`RLS_ENABLED`) | 🔧 `e48ed74` |
| B7 | **P1** | `CodigoRecuperacaoTotp` sem migration → ativar 2FA quebra em prod | 🔧 `32db308` (migrate diff zerado) |
| B8 | **P1** | `Material_nome_key` UNIQUE global → colisão de nome entre tenants | 🔧 `72e8ef6` (migrate diff zerado) |

## Ciclo de segurança dedicado (2026-07-30) — pós-Fase 3

Auditoria dedicada de segurança (não redundante com a Fase 0/3 acima), focada em gaps
não cobertos pelo diagnóstico anterior: escalação de privilégio RBAC, validação de
upload, step-up de confirmação em operações destrutivas e infra de rate limiting.
Branch `fix/seguranca-ciclo1-critico-alto` (worktree `agent-environment`), 4 commits
locais, nenhum push/merge/deploy. Escopo deste ciclo: crítico + alto (B9–B12). Médio/
baixo (backlog abaixo) documentados e não bloqueantes.

| ID | Sev. | Título | Status |
|----|------|--------|--------|
| B9 | **CRÍTICO** | `sanitizarPermissoes` sem teto de autoridade → `PATCH /usuarios/:id` permitia um ator conceder a si mesmo/outro permissão que não possuía, ou promover outro usuário a `dono` | 🔧 `6e6c14e` |
| B10 | **CRÍTICO** | `POST /tecnicos` aceitava `fotoPerfil` sem validação de tamanho/MIME/magic-bytes (ao contrário de `documentos.js`/`estoque.js`) | 🔧 `3265555` |
| B11 | ALTO | `DELETE /me/conta` sem nenhuma confirmação extra para contas social-only (sem senha) e sem 2FA — JWT vazado bastava para apagar a empresa em cascata | 🔧 `c1edc8e` |
| B12 | ALTO | `authLimiter` duplicado — instância de `routes/auth.js` sem `RedisStore` (MemoryStore por instância) para recuperar-senha/redefinir-senha/magic-link | 🔧 `0c43e23` |

Backlog não bloqueante desta frente (documentado, impacto limitado, com mitigação/
justificativa — ver plano de segurança da sessão para detalhe arquivo:linha):
- MÉDIO: ambiguidade cross-tenant em resposta de avaliação por telefone único (`avaliacao.js`); hardening defensivo de `movimentarEstoque`/`darBaixaPorServico` (`estoque.js`, não explorável hoje); CSP do painel em modo `Report-Only` apenas (`nginx.conf`); `android:allowBackup="true"` sem regras de exclusão no app Android.
- BAIXO: `axios`/`stripe` desatualizados e `pino` como dependência morta no bot; CSP do backend sem `frame-ancestors`/`object-src` explícitos; zero cobertura de teste para `RequireAuth`/`RequirePermissao`/`AuthContext` no painel.

Validação: unit `chaveiro-bot` 246/246 verde (baseline 236 + 10 novos), `npm run lint`
0 erros (5 warnings pré-existentes, nenhum novo), `criarApp()` smoke-testado (boot OK).
PoC-first aplicado em B9/B10/B11 (teste falha contra o código revertido via `git stash`,
passa com o fix — confirmado nesta sessão). **Limitação declarada**: testes de
integração (Supertest+Postgres) não executados nesta sessão — Postgres/Redis locais
indisponíveis e Docker Desktop sem daemon ativo; o teste de integração de B11 foi
escrito seguindo o padrão de `autoexclusao_conta.test.js` mas não executado.

## Planejamento de arquitetura de banco
- [`DB_ARCHITECTURE_PLAN.md`](./DB_ARCHITECTURE_PLAN.md) — roteiro de 12 seções (Principal Data Architect) para evoluir o banco a nível corporativo. **Planejamento** (sem SQL/tabelas), aterrado no `schema.prisma` real.
- [`db/`](./db/) — **execução** do roteiro (F1–F9), entregáveis com evidência `arquivo:linha`:
  - [`db/README.md`](./db/README.md) — índice + status por fase + o que depende de você.
  - F0/F1 [`db/01-discovery.md`](./db/01-discovery.md) · F2 [`db/02-domain-model.md`](./db/02-domain-model.md) · F3 [`db/03-adrs.md`](./db/03-adrs.md) (ADR-001..008) · F4 [`db/04-data-model.md`](./db/04-data-model.md) (ER + dicionário) · F5 [`db/05-performance.md`](./db/05-performance.md) · F6 [`db/06-security-lgpd.md`](./db/06-security-lgpd.md) · F7 [`db/07-scalability.md`](./db/07-scalability.md) · F8 [`db/08-operations.md`](./db/08-operations.md).
  - **Bloqueios reais** (não autônomos): números de negócio/RNF (F0), aval DPO + prazo retenção LGPD (F6), e **staging fiel ao pooler** (destrava Prisma 7 + RLS + EXPLAIN/carga).

## Roadmap de evolução de arquitetura (escala/resiliência/HA)
- [`ARCHITECTURE_EVOLUTION_PLAN.md`](./ARCHITECTURE_EVOLUTION_PLAN.md) — avaliação dos 10 requisitos de escala (**✅ 3 · 🟡 5 · ❌ 2**) + roadmap **F0→F6** (fundação/região → statelessness → LB → cache → réplica de leitura+RLS+Decimal → observabilidade → HA multi-AZ). **Planejamento** — nada implementado; F0 (billing Railway + região sa-east-1) é ação do dono. Prisma 7 já em prod (deploy #60). Integra o `DB_ARCHITECTURE_PLAN.md`/`db/`.

## Reconciliação `progress.md`
Dos 5 bugs "pendentes" herdados: **1, 3, 4, 5 já aplicados**; **2 tem causa errada** (é o B1). Detalhe em `BUGLIST.md`.

## Pré-Fase-1 (bloqueios de ambiente para o usuário)
- Concluir first-run do **Docker Desktop** (WSL2 sem distro → precisa reboot) para o Postgres/Redis oficiais e os testes de integração (IDOR/auth) — hoje rodando em Postgres portátil local.
- `gh` ainda não instalado → fila de PRs (#28/#29/#30) não mapeada (Tarefa pendente).
