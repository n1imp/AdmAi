# AUDIT — Painel de prontidão do AdmAi

Índice mestre de "quanto falta pro app estar pronto". Atualizado ao fim de cada fase.
Legenda: ⬜ pendente · 🔄 em andamento · ✅ concluído.

## Fases

| Fase | Escopo | Status | Findings |
|------|--------|--------|----------|
| **0 — Diagnóstico** | Varredura dos fluxos, backend+frontend, com evidência → [`BUGLIST.md`](./BUGLIST.md) | ✅ concluído | **P1: 3** · P2: 3 · L1/L3 confirmados (decisão) · L6 refutado · 5 leads restantes |
| 1 — Correção (P0→P1→P2) | Loop 1-bug-por-vez, branch+CI, reteste no browser | 🔄 em andamento | **6 corrigidos** (3 P1 + 3 P2), verificados; unit 180/180 |
| 2 — Testes funcionais | Plano por fluxo × papel × desktop/mobile → `TESTPLAN.md` | ⬜ | — |
| 3 — Auditoria especializada | Backend/API · Banco (RLS, EXPLAIN, migrate diff) · Segurança (tenant, RBAC, semgrep, gitleaks, LGPD) · CI/CD · UI/UX (Lighthouse, axe) | ⬜ | — |

## Findings confirmados (Fase 0)

| ID | Sev. | Título | Status |
|----|------|--------|--------|
| B1 | **P1** | Rotas Google em `/api/api/google/*` (prefixo duplicado) → 404 no painel | 🔧 `78bf6b3` |
| B2 | **P1** | Sem RBAC em `POST /api/whatsapp/cloud/credenciais` | 🔧 `88aa747` |
| B3 | **P1** | Sem RBAC nas rotas Google Business | 🔧 `62e023b` |
| B4 | P2 | `schema.sqlite.prisma` defasado (falta `papel`) | 🔧 `06cf0a2` (+ gerador anti-drift) |
| B5 | P2 | `DIRECT_URL`/`RLS_ENABLED` fora do `.env.example` | 🔧 `8ddfc3b` (domínio prod não tocado) |
| B6 | P2 | Testes locais poluídos pelo `.env` de prod (`RLS_ENABLED`) | 🔧 `e48ed74` |

## Reconciliação `progress.md`
Dos 5 bugs "pendentes" herdados: **1, 3, 4, 5 já aplicados**; **2 tem causa errada** (é o B1). Detalhe em `BUGLIST.md`.

## Pré-Fase-1 (bloqueios de ambiente para o usuário)
- Concluir first-run do **Docker Desktop** (WSL2 sem distro → precisa reboot) para o Postgres/Redis oficiais e os testes de integração (IDOR/auth) — hoje rodando em Postgres portátil local.
- `gh` ainda não instalado → fila de PRs (#28/#29/#30) não mapeada (Tarefa pendente).
