# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto
adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (SemVer).

## [Não lançado]

### A fazer (rumo ao 1.0.0 — beta fechado)
- Migração do WhatsApp para a **API oficial (Cloud API / Meta)** com seleção por provedor.
- Backup do banco de produção: confirmado em 2026-08-05 que o Plano Free do Supabase **não
  inclui backup nenhum** (nem scheduled backups nem PITR) — decisão pendente do usuário
  (upgrade para Pro, ou `pg_dump` externo agendado). Ver `docs/GO_LIVE_CHECKLIST.md` A7,
  `docs/RUNBOOK.md §3`.
- `POST /me/documentos` retorna `500` em produção (achado real do smoke test de
  2026-08-05, causa raiz não diagnosticada — sem acesso a logs do Railway) — investigação
  futura, fora do escopo da missão que o encontrou.
- Observabilidade de produção (Prometheus/Grafana, alertas, uptime, agregação de logs).
- Aumento de cobertura de testes (CRUD, webhook, OAuth, 2FA) + ESLint/Prettier no CI.
- PWA, Error Boundary, onboarding e landing page no painel.

---

## [project-baseline-v1] - 2026-08-05

Encerramento oficial da fase de fundação técnica da plataforma — tag anotada
`project-baseline-v1`, commit `b0124abc9b7b9c0a5ef159149cacd05b8bda61f3` (branch `master`).

### Adicionado
- Documentação de lançamento: Política de Privacidade (LGPD), Termos de Uso, `SECURITY.md`,
  `CONTRIBUTING.md` e este `CHANGELOG.md`.
- `docs/agent-environment/PROJECT_BASELINE_V1.md` e `FUNCTIONALITY_MATRIX_V1.md` — baseline
  técnico e funcional oficial do projeto.
- Gate de `npm audit` com exceção granular e auditável (`scripts/audit-gate.mjs` +
  `scripts/audit-allowlist.json`) — destrava o deploy automático (Railway + Cloudflare
  Pages), bloqueado desde 2026-07-25 por um CVE já investigado e classificado Categoria C
  (EV-069).

### Corrigido
- Frente de Segurança encerrada: 8 achados (EV-056, EV-057, EV-060, EV-063, EV-065, EV-067,
  EV-069, EV-070) corrigidos, refutados ou aceitos como risco residual. 0 Categoria A, 0
  Categoria B, 16 Categoria C (backlog, não bloqueante) — ver
  `docs/agent-environment/SECURITY_BASELINE_v1.md`.
- Documentação operacional sincronizada com a arquitetura real de produção (Railway +
  Cloudflare Pages + Supabase); guia self-hosted anterior (VPS + Docker Compose + Caddy)
  arquivado explicitamente em `docs/legacy/`.

### Validado em produção (2026-08-05)
- Deploy real confirmado (backend e painel redeployados após a correção do gate de CI).
- Smoke test funcional real: cadastro, login, 2FA, criar técnico, criar serviço/cliente,
  bater ponto, dashboard — todos OK. 1 achado real (`POST /me/documentos` → 500, ver "A
  fazer" acima).

---

## [1.0.0] - AAAA-MM-DD  _(planejado — go-live do beta)_

Primeira versão pública (beta fechado). Estado atual da base de código:

### Recursos
- **Bot WhatsApp**: registro de serviços por máquina de estados, resumo no grupo da empresa,
  pesquisa de avaliação agendada ao cliente.
- **Painel web** (React/Vite): dashboard de receita/comissões/estoque/avaliações, exportação PDF.
- **Multi-tenant**: isolamento por empresa via Prisma Extensions (anti-IDOR).
- **Autenticação**: JWT (HS256), 2FA TOTP, login social OIDC (Google/Microsoft/Apple),
  invalidação de sessões.
- **Segurança**: segredos cifrados em repouso (AES-256-GCM), `helmet` (CSP/HSTS), CORS com
  allow-list, rate limiting, validação Zod, webhook autenticado por HMAC/token.
- **Observabilidade**: Sentry (PII filtrada), métricas Prometheus em `/metrics`, health check
  com checagem de banco, graceful shutdown.
- **Infra**: Docker Compose (Postgres, Redis, Evolution API, backend, painel), CI no GitHub
  Actions (unit + integração + `npm audit`).

---

<!--
Modelo de entrada para versões futuras:

## [X.Y.Z] - AAAA-MM-DD
### Adicionado
### Alterado
### Corrigido
### Removido
### Segurança
-->

[Não lançado]: https://github.com/[org]/[repo]/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/[org]/[repo]/releases/tag/v1.0.0
