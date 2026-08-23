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

⚠️ **CONFIRMADO em 2026-08-05, direto no painel do Supabase (projeto `AdmAI`, org `n1imp`,
Free Plan) — não há NENHUM backup automático do banco de produção:**

- Aba "Scheduled backups": *"Free Plan does not include project backups."*
- Aba "Point in time" (PITR): *"Point in Time Recovery is a Pro Plan add-on... Starts at
  $100/month."*

Nenhum dos dois mecanismos nativos do Supabase está disponível no plano atual — não é uma
configuração faltando, é uma limitação do plano contratado (Free). `docs/legacy/
DEPLOYMENT_VPS.md`/`RUNBOOK_VPS.md` descreviam backup manual via `pg_dump` num container
Docker local — **isso não se aplica** à arquitetura real (não há container Postgres
próprio; o banco é gerenciado pelo Supabase, sem cron/script de backup próprio do projeto).

**Risco real:** perda de dados de produção sem qualquer via de recuperação, em caso de
corrupção, exclusão acidental ou incidente na conta Supabase.

**Tarefa objetiva pendente (decisão do usuário, fora do escopo de execução autônoma):**
1. Upgrade para o Plano Pro do Supabase (inclui backup diário; PITR como add-on pago à
   parte), **ou**
2. Implementar um `pg_dump` externo agendado contra a conexão direta (ex.: job periódico
   no GitHub Actions ou outro agendador, salvando em storage externo) como mitigação de
   menor custo.

Até uma dessas ações, a produção real está sem cobertura de backup.

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
| **Login no painel falha com "Não foi possível conectar à API"** (achado real, 2026-08-05) | CSP do painel (`connect-src`) sem a origem do Railway — o navegador bloqueia a chamada antes de sair, axios recebe erro de rede. Causa raiz: há **2 pipelines de deploy do painel** (GitHub Actions `deploy.yml` E integração nativa Git↔Cloudflare, ver `docs/CI_CD.md`); se a build da integração nativa vencer a corrida e não tiver `VITE_API_URL` configurada em Cloudflare Pages → Variables and secrets, o `_headers` gerado fica sem a API no `connect-src` | 1. Confirmar via `curl -I https://app.SEUDOMINIO/ \| grep -i content-security-policy` se falta a origem da API; 2. Garantir `VITE_API_URL` setada em **ambos** GitHub Actions secrets e Cloudflare Pages → Variables and secrets (Production); 3. Se já quebrado, promover manualmente o deployment correto em Cloudflare Pages → Deployments → "Rollback to this deployment" |

## 8. Contatos e escalonamento

- **Responsável técnico:** [nome / telefone]
- **Painel Railway:** [link do projeto]
- **Painel Cloudflare:** [link do projeto]
- **Painel Supabase:** [link do projeto]
- **Segurança:** ver [SECURITY.md](../SECURITY.md)

## Drill de backup/restore (provado localmente — F6-07, 2026-08-23)

O procedimento abaixo foi EXECUTADO nesta data contra o Postgres local (container
`admai-pg-test`, Postgres 16), com verificação por tabela — não é um roteiro teórico.

### Banco (pg_dump → restore → verificação)

```bash
# 1. Dump custom-format do banco (dentro do container)
docker exec admai-pg-test sh -c 'pg_dump -U "$POSTGRES_USER" -d admai_dev -F c -f /tmp/drill.dump'

# 2. Banco descartável e restore
docker exec admai-pg-test sh -c 'psql -U "$POSTGRES_USER" -d postgres -qc "CREATE DATABASE admai_drill;"'
docker exec admai-pg-test sh -c 'pg_restore -U "$POSTGRES_USER" -d admai_drill --no-owner /tmp/drill.dump'

# 3. VERIFICAÇÃO por tabela (origem × restaurado) — laço sobre pg_tables comparando count(*)
#    Resultado do drill: 27 tabelas, todas as contagens idênticas, zero erros de restore.
#    (Armadilha real encontrada: rodar pg_restore DUAS vezes no mesmo banco gera ~175 erros
#    "already exists" — sempre restaurar em banco recém-criado.)

# 4. Limpeza
docker exec admai-pg-test sh -c 'psql -U "$POSTGRES_USER" -d postgres -qc "DROP DATABASE admai_drill;" && rm -f /tmp/drill.dump'
```

### Uploads (tar → restore → diff)

```bash
# No diretório chaveiro-bot (Git Bash/Windows exige --force-local por causa do "C:")
tar --force-local -czf /caminho/backup/uploads-backup.tgz uploads uploads-ponto uploads-evidencias
tar --force-local -xzf /caminho/backup/uploads-backup.tgz -C /caminho/restore
diff -rq uploads /caminho/restore/uploads   # idem para uploads-ponto e uploads-evidencias
# Resultado do drill: byte a byte idêntico nos três diretórios.
```

### O que este drill NÃO cobre (continua D2 — Q-010)

Produção (Supabase Free) segue **sem backup automático** — ver §3 acima. O drill prova o
PROCEDIMENTO e as ferramentas; a cobertura real de produção depende da decisão do usuário
(upgrade Pro/PITR ou cron de `pg_dump` contra o pooler do Supabase).
