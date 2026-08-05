# [LEGADO] Runbook Operacional — AdmAi (VPS + Docker Compose)

> ⚠️ **Este documento é LEGADO e não representa a produção atual.**
> A arquitetura oficialmente em produção é **Railway** (backend) + **Cloudflare Pages**
> (painel) + **Supabase** (Postgres) — ver [`docs/RUNBOOK.md`](../RUNBOOK.md) para o runbook
> operacional real. Nenhum dos comandos `docker compose` abaixo se aplica à produção atual
> (não há container Docker próprio nem Caddy na frente do backend real). Preservado aqui só
> por valor histórico/referência de um guia self-hosted.

---

Procedimentos de operação do dia a dia e de incidentes em produção (VPS + Docker Compose).
Comandos assumem que você está em `chaveiro-bot/` no servidor, com os arquivos
`docker-compose.yml` + `docker-compose.prod.yml` (ver [DEPLOYMENT_VPS.md](./DEPLOYMENT_VPS.md)).

> Atalho útil: `alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'`

---

## 1. Saúde e diagnóstico rápido

```bash
dc ps                                   # estado dos containers
dc logs -f --tail=100 backend           # logs do backend
curl -s https://api.[dominio]/health    # health check (espera 200 + database: ok)
docker stats --no-stream                # uso de CPU/memória por container
```

Sinais de problema:
- `/health` retorna **503** → banco indisponível ou app desligando.
- Container em `Restarting` → veja `dc logs <serviço>`.
- Memória estourando no backend → ajustada por `--max-old-space-size=512` (Dockerfile).

## 2. Reiniciar serviços

```bash
dc restart backend          # reinicia só o backend
dc restart painel
dc up -d                    # recria o que mudou (idempotente)
dc down && dc up -d         # parada total e subida (cuidado: breve indisponibilidade)
```

> Os dados ficam em **volumes nomeados** (`postgres_data`, etc.); `dc down` **não** apaga
> volumes. **Nunca** use `dc down -v` em produção (apaga o banco!).

## 3. Backup e restore do banco

### Backup manual
```bash
docker exec chaveiro-postgres pg_dump -U chaveiro -d chaveirobot | gzip > backup_$(date +%F).sql.gz
```

### Restore (teste periódico — obrigatório!)
Restaure num **banco temporário** para validar o dump, sem tocar produção:

```bash
# 1) cria DB de teste
docker exec -i chaveiro-postgres psql -U chaveiro -c "CREATE DATABASE restore_test;"
# 2) restaura o dump nele
gunzip -c backup_AAAA-MM-DD.sql.gz | docker exec -i chaveiro-postgres psql -U chaveiro -d restore_test
# 3) confere e remove
docker exec -i chaveiro-postgres psql -U chaveiro -d restore_test -c "\dt"
docker exec -i chaveiro-postgres psql -U chaveiro -c "DROP DATABASE restore_test;"
```

### Restore real (recuperação de desastre)
```bash
dc stop backend                                  # evita escrita concorrente
docker exec -i chaveiro-postgres psql -U chaveiro -c "DROP DATABASE chaveirobot; CREATE DATABASE chaveirobot;"
gunzip -c backup.sql.gz | docker exec -i chaveiro-postgres psql -U chaveiro -d chaveirobot
dc start backend
```

## 4. Migrations de banco

Rodam **automaticamente** no boot do backend (`prisma migrate deploy`). Para aplicar manualmente:

```bash
dc exec backend npx prisma migrate deploy
dc exec backend npx prisma migrate status     # ver estado
```

> **Faça backup antes** de aplicar migrations novas em produção.

## 5. Rotação de segredos

- **JWT_SECRET**: ao trocar, **todas as sessões são invalidadas** (usuários precisam relogar).
  Edite o `.env`, depois `dc up -d backend`.
- **ENCRYPTION_KEY**: ⚠️ **não troque sem plano de migração** — ela cifra segredos por empresa
  (apikey/2FA). Trocar torna os dados cifrados ilegíveis. Migração exige decifrar com a chave
  antiga e recifrar com a nova antes da virada.
- **Token do WhatsApp (Meta, após migração)**: gere novo token de System User no Meta Business,
  atualize no `.env`/config da empresa e `dc up -d backend`.
- **Senha do Postgres**: altere no Postgres **e** no `DATABASE_URL` simultaneamente.

## 6. Observabilidade e alertas

- **Sentry**: erros em tempo real (PII filtrada). Configure alerta de pico de erros.
- **Uptime**: cadastre `https://api.[dominio]/health` no UptimeRobot/Healthchecks.io
  (intervalo 1–5 min) com alerta por e-mail/WhatsApp.
- **Métricas**: `https://api.[dominio]/metrics` (Prometheus). Aponte um Prometheus/Grafana
  (ou Grafana Cloud) para latência, taxa de erro e memória.
- **Logs**: `dc logs` (stdout JSON). Para retenção/centralização, encaminhe a um agregador
  (Loki/Better Stack). **Nunca** logar PII/segredos.

## 7. Incidentes comuns

| Sintoma | Causa provável | Ação |
|---|---|---|
| `/health` 503 | Postgres caiu | `dc logs postgres`; `dc restart postgres` |
| 502/Bad Gateway no Caddy | Backend não subiu | `dc logs backend`; verifique `.env`/migrations |
| Erro de CORS no painel | `ALLOWED_ORIGIN` errado | Ajuste no `.env`, `dc up -d backend` |
| Mensagens do WhatsApp não chegam | Webhook/token inválido | Confira `PUBLIC_URL`, assinatura e config da Meta |
| Disco cheio | Logs/dumps/volumes | Limpe backups antigos; `docker system prune` (cuidado) |
| Boot falha com erro de env | Variável obrigatória ausente | A mensagem do Zod indica qual; corrija o `.env` |

## 8. Contatos e escalonamento

- **Responsável técnico:** [nome / telefone]
- **Provedor de VPS:** [painel/suporte]
- **Suporte WhatsApp/Meta Business:** [link]
- **Segurança:** ver [SECURITY.md](../../SECURITY.md)
