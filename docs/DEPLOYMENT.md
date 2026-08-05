# Deploy em Produção — AdmAi

**Arquitetura oficial:** Backend → **Railway** (Docker + Supabase) · Painel → **Cloudflare
Pages** (estático) · App → **Android `.aab`** (Capacitor). Confirmado ao vivo nesta execução
(`Server: railway-hikari` em `https://admai-production.up.railway.app/health`;
`Server: cloudflare` em `https://admai-painel.pages.dev/`) e documentado em `README.md`
(seção "Deploy") e `chaveiro-bot/.env.example:2`.

O procedimento completo de deploy — configuração do Railway, configuração do Cloudflare
Pages, inventário de secrets/variáveis por plataforma e troubleshooting — está em
**[`docs/CI_CD.md`](./CI_CD.md)**, para não duplicar (e divergir) a mesma informação em dois
lugares. Este arquivo existe só como ponto de entrada.

Para operação do dia a dia, incidentes, backup/restore e rotação de segredos da arquitetura
real, ver **[`docs/RUNBOOK.md`](./RUNBOOK.md)**.

---

## Histórico

Este projeto foi originalmente desenhado para deploy self-hosted (VPS + Docker Compose +
Caddy). Essa arquitetura **não é mais usada em produção** — foi substituída por
Railway + Cloudflare Pages + Supabase. O guia self-hosted completo (`Caddyfile`,
`docker-compose.prod.yml`, hardening de VPS, backup via `pg_dump` em container) está
preservado, marcado explicitamente como legado, em
**[`docs/legacy/DEPLOYMENT_VPS.md`](./legacy/DEPLOYMENT_VPS.md)** — não execute esses passos
contra a produção real.
