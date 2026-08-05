# Runbook Operacional — AdmAi

Procedimentos de operação do dia a dia e de incidentes na arquitetura oficial de produção:
**Railway** (backend) + **Cloudflare Pages** (painel) + **Supabase** (Postgres). Confirmado ao
vivo nesta execução — ver `docs/agent-environment/PROJECT_BASELINE_V1.md`, seção "Arquitetura
Oficial". Para o guia self-hosted anterior (VPS + Docker Compose + Caddy, não usado em
produção), ver [`docs/legacy/RUNBOOK_VPS.md`](./legacy/RUNBOOK_VPS.md).

---

## 1. Saúde e diagnóstico rápido

```bash
curl -s https://api.SEUDOMINIO/health     # health check (espera 200 + database: ok)
curl -s https://api.SEUDOMINIO/metrics    # métricas Prometheus (sem auth, fora de /api)
```

- Logs, métricas de CPU/memória e histórico de deploys do backend: **dashboard do Railway**
  (projeto → serviço `chaveiro-bot` → abas "Deployments"/"Metrics"/"Logs").
- Logs e histórico de builds do painel: **dashboard do Cloudflare Pages** (projeto
  `admai-painel` → aba "Deployments").
- Sinais de problema: `/health` retornando `503` → banco indisponível ou app desligando
  (`estado.isShuttingDown`, ver `chaveiro-bot/src/app.js`); deploy do Railway travado em
  "Building"/"Crashed" → ver logs do serviço no dashboard.

## 2. Reiniciar / reverter (rollback)

- **Backend (Railway):** um redeploy do último commit bom, ou o botão "Redeploy" num
  deployment anterior específico, ambos disponíveis na aba "Deployments" do serviço no
  dashboard do Railway. Não há comando `docker compose restart` — o container é gerenciado
  pela plataforma.
- **Painel (Cloudflare Pages):** cada deploy fica versionado na aba "Deployments" do projeto;
  qualquer deployment anterior pode ser promovido a produção com "Rollback to this deployment"
  (retenção padrão da plataforma).
- **Migrations:** rodam automaticamente no boot do backend (`docker-entrypoint.sh` →
  `npx prisma migrate deploy`) — não há um passo manual de "restart" separado da aplicação da
  migration; um redeploy reaplica o boot inteiro.

## 3. Backup e restore do banco (Supabase)

**Limitação declarada nesta execução — não confirmado, não assumido:** não foi possível
verificar nesta missão (sem acesso ao painel do Supabase desta worktree) se o backup
automático está habilitado, qual a política de retenção, nem se um restore já foi testado
para o projeto Supabase de produção. `docs/legacy/DEPLOYMENT_VPS.md`/`RUNBOOK_VPS.md`
descreviam backup manual via `pg_dump` num container Docker local — **isso não se aplica** à
arquitetura real (não há container Postgres próprio; o banco é gerenciado pelo Supabase).

**Tarefa objetiva pendente (fora do escopo desta missão de documentação — decisão/verificação
do usuário):** confirmar no painel do Supabase (Project Settings → Database → Backups) se
backups automáticos estão ativos, qual a retenção, e executar/documentar um teste de restore
real. Até essa confirmação, este runbook não pode declarar uma estratégia de backup como
verificada — apenas registrar que o mecanismo é gerenciado pela plataforma, não por script
próprio do projeto.

## 4. Migrations de banco

Aplicadas automaticamente no boot do backend (`docker-entrypoint.sh` → `prisma migrate
deploy`), usando a **conexão direta** do Supabase (porta 5432), não o pooler (6543) — ver
`docs/CI_CD.md`, seção Troubleshooting ("Migrations falham no boot"). `DATABASE_URL`/
`DIRECT_URL` no Railway devem apontar para `db.SEU_REF.supabase.co:5432`
(`chaveiro-bot/.env.example:15-22`).

## 5. Rotação de segredos

Todas as variáveis vivem no painel do Railway (backend) e do Cloudflare Pages (painel) — ver
o inventário completo em `docs/CI_CD.md`, seção "Inventário de secrets/variáveis". Nenhum
segredo vive no repositório.

- **`JWT_SECRET`**: ao trocar, **todas as sessões são invalidadas** (usuários precisam
  relogar). Atualize a variável no Railway; o redeploy é automático.
- **`ENCRYPTION_KEY`**: ⚠️ **não troque sem plano de migração** — cifra segredos por empresa
  (apikey/2FA). Trocar torna os dados cifrados ilegíveis sem decifrar com a chave antiga e
  recifrar com a nova antes da virada.
- **Senha do Supabase (`DATABASE_URL`/`DIRECT_URL`)**: altere no painel do Supabase e nas
  variáveis do Railway simultaneamente.
- **Secrets de assinatura Android** (`ANDROID_KEYSTORE_BASE64` etc.): GitHub → Settings →
  Secrets, consumidos só por `.github/workflows/release.yml`.

## 6. Observabilidade e alertas

- **Sentry**: `SENTRY_DSN` (Railway, backend) e `VITE_SENTRY_DSN` (Cloudflare Pages, painel) —
  erros em tempo real (PII filtrada, `beforeSend`). Configure alerta de pico de erros no
  Sentry.
- **Uptime**: cadastre `https://api.SEUDOMINIO/health` num serviço de uptime (UptimeRobot/
  Healthchecks.io), intervalo 1–5 min, alerta por e-mail/WhatsApp.
- **Métricas**: `https://api.SEUDOMINIO/metrics` (Prometheus, sem auth, fora de `/api`) —
  aponte um Prometheus/Grafana (ou Grafana Cloud) para latência, taxa de erro e memória.
- **Logs**: dashboard do Railway (backend) e do Cloudflare Pages (painel/build). Para
  retenção/centralização de logs do backend, encaminhar a um agregador externo não está
  configurado nesta execução — **não confirmado**, registrar como gap se necessário.

## 7. Incidentes comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| `/health` 503 | Supabase indisponível ou app em shutdown | Painel do Supabase (status do projeto); logs do Railway |
| Deploy do Railway não dispara | "Deploy on push"/"Wait for CI" desligado, ou `master` não ficou verde (`ci-ok`) | Ver `docs/CI_CD.md`, Troubleshooting |
| Painel não atualiza após merge | `deploy.yml` não rodou/falhou (depende do `workflow_run` do CI concluir com sucesso) | `gh run list --workflow=deploy.yml`; conferir `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` |
| Selfies do ponto somem após deploy | Volume `/app/uploads` não persistente | Confirmar volume montado no serviço do Railway |
| Erro de CORS no painel | `ALLOWED_ORIGIN` (Railway) não bate com o domínio real do painel | Ver `docs/CI_CD.md`, Troubleshooting |
| Migrations falham no boot | `DATABASE_URL` apontando para o pooler (6543) em vez da conexão direta (5432) | Ver `docs/CI_CD.md`, Troubleshooting |
| Mensagens do WhatsApp não chegam | Webhook/token inválido | Confira `PUBLIC_URL` e config da Meta |

## 8. Contatos e escalonamento

- **Responsável técnico:** [nome / telefone]
- **Painel Railway:** [link do projeto]
- **Painel Cloudflare:** [link do projeto]
- **Painel Supabase:** [link do projeto]
- **Segurança:** ver [SECURITY.md](../SECURITY.md)
