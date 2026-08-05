# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto
adota [Versionamento Semântico](https://semver.org/lang/pt-BR/) (SemVer).

## [Não lançado]

### Adicionado
- Documentação de lançamento: Política de Privacidade (LGPD), Termos de Uso, `SECURITY.md`,
  `CONTRIBUTING.md` e este `CHANGELOG.md`.

### A fazer (rumo ao 1.0.0 — beta fechado)
- Migração do WhatsApp para a **API oficial (Cloud API / Meta)** com seleção por provedor.
- ~~Infra de produção em VPS (Docker Compose, reverse proxy + TLS, backups automáticos do Postgres).~~
  **Feito, caminho diferente do planejado:** produção real é Railway (backend) + Cloudflare
  Pages (painel) + Supabase (Postgres) — ver `docs/CI_CD.md`. Pendente: confirmar/testar
  backup automático do Supabase (`docs/GO_LIVE_CHECKLIST.md`, item A7).
- Observabilidade de produção (Prometheus/Grafana, alertas, uptime, agregação de logs).
- Aumento de cobertura de testes (CRUD, webhook, OAuth, 2FA) + ESLint/Prettier no CI.
- PWA, Error Boundary, onboarding e landing page no painel.

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
