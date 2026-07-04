# Deploy em Produção — AdmAi (VPS + Docker Compose)

Guia passo a passo para subir o AdmAi num **VPS** (Ubuntu LTS) com **Docker Compose**,
**HTTPS automático** (Caddy + Let's Encrypt) e **backups** do PostgreSQL.

> Substitua os campos entre `[ ]` (domínios, e-mails, senhas) pelos seus valores reais.
> **Nunca** commite o `.env` de produção.

---

## 1. Pré-requisitos

- VPS com **Ubuntu 22.04/24.04 LTS**, ≥ 2 vCPU / 4 GB RAM (Evolution API + Postgres + Redis
  consomem memória). Sugestões: Hetzner, DigitalOcean, Contabo.
- Um **domínio** com DNS apontando para o IP do VPS:
  - `app.[seudominio.com]` → painel
  - `api.[seudominio.com]` → backend (webhook do WhatsApp e API)
- Acesso SSH com chave (sem senha).

## 2. Hardening básico do servidor

```bash
# como root, no primeiro acesso
adduser deploy && usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # copia sua chave SSH

# SSH: desabilite root e senha em /etc/ssh/sshd_config
#   PermitRootLogin no
#   PasswordAuthentication no
systemctl restart ssh

# Firewall: apenas SSH + HTTP + HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable

# fail2ban (bloqueia brute force de SSH)
apt update && apt install -y fail2ban
```

> **Importante:** em produção, **não** publique as portas internas (3000, 8081, 8080, 5432).
> Só o Caddy (80/443) fica exposto. A seção 5 mostra como.

## 3. Instalar Docker + Compose

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy   # relogue para aplicar
docker compose version      # confirme o plugin v2
```

## 4. Obter o código e configurar o `.env`

```bash
git clone [URL_DO_REPO] chaveiro && cd chaveiro/chaveiro-bot
cp .env.example .env
```

Gere segredos fortes (rode e cole no `.env`):

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "API_TOKEN=$(openssl rand -hex 24)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

`.env` de produção (mínimo):

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://chaveiro:[POSTGRES_PASSWORD]@postgres:5432/chaveirobot
POSTGRES_USER=chaveiro
POSTGRES_PASSWORD=[POSTGRES_PASSWORD]
JWT_SECRET=[gerado acima — 64 chars]
ENCRYPTION_KEY=[gerado acima]
API_TOKEN=[gerado acima]
ALLOWED_ORIGIN=https://app.[seudominio.com]
PUBLIC_URL=https://api.[seudominio.com]
APP_VERSION=1.0.0
SENTRY_DSN=[seu DSN de produção, opcional]
# NÃO defina ADMIN_USERNAME/ADMIN_PASSWORD em produção — crie o admin via tela de cadastro.
```

> **WhatsApp:** durante a migração para a **Cloud API oficial** (ver
> [plano de lançamento]), as variáveis `EVOLUTION_*` serão substituídas por
> `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, etc. Enquanto isso, mantenha o bloco Evolution.

## 5. Reverse proxy + HTTPS automático (Caddy)

O `Caddyfile` e o `docker-compose.prod.yml` **já estão versionados** em `chaveiro-bot/`. O
Caddy termina TLS (Let's Encrypt) e faz proxy; as portas internas (3000/8081/8080) deixam de
ser publicadas no host (via `ports: !reset []` — requer Docker Compose ≥ 2.24, já validado).

Basta definir os domínios no `.env`:

```dotenv
CADDY_APP_DOMAIN=app.[seudominio.com]
CADDY_API_DOMAIN=api.[seudominio.com]
```

> **Observabilidade (opcional):** suba também o Prometheus + Grafana com
> `-f docker-compose.monitoring.yml` (portas só no loopback; ver [RUNBOOK.md](./RUNBOOK.md)).

## 6. Subir

```bash
cd chaveiro-bot
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
docker compose logs -f backend     # acompanhe o boot e as migrations
```

O `docker-entrypoint.sh` roda `npx prisma migrate deploy` automaticamente. Em segundos o Caddy
emite os certificados. Acesse `https://app.[seudominio.com]`.

### Primeiro acesso
Crie o primeiro admin/empresa pela **tela de cadastro** (`/login` → cadastrar) ou `POST /api/setup`.

## 7. Backups automáticos do PostgreSQL

Crie `/home/deploy/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%F_%H%M)
DIR=/home/deploy/backups
mkdir -p "$DIR"
docker exec chaveiro-postgres pg_dump -U chaveiro -d chaveirobot \
  | gzip > "$DIR/chaveirobot_$STAMP.sql.gz"
# retenção: 7 dias locais
find "$DIR" -name '*.sql.gz' -mtime +7 -delete
# offsite (recomendado): envie para S3/Backblaze
# rclone copy "$DIR/chaveirobot_$STAMP.sql.gz" remote:chaveiro-backups
```

Agende no cron (diário às 3h):

```bash
chmod +x /home/deploy/backup-db.sh
( crontab -l 2>/dev/null; echo "0 3 * * * /home/deploy/backup-db.sh" ) | crontab -
```

> **Teste o restore** (ver [RUNBOOK.md](./RUNBOOK.md)) — backup não testado não é backup.

## 8. Atualizações (deploy de nova versão)

```bash
cd chaveiro/chaveiro-bot
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
# migrations rodam sozinhas no boot do backend
```

Para zero-downtime mais robusto, considere build de imagens num **registry (GHCR)** no CI e
`docker compose pull && up -d` no servidor (ver Workstream E do plano).

## 9. Checklist pós-deploy

- [ ] `https://app.[dominio]` carrega com cadeado válido (TLS ok).
- [ ] `https://api.[dominio]/health` responde `200` com `database: ok`.
- [ ] Portas 3000/8081/8080/5432 **não** acessíveis externamente (`nmap` do seu PC).
- [ ] Login + 2FA funcionam; `ALLOWED_ORIGIN` correto (sem erro de CORS).
- [ ] Webhook do WhatsApp aponta para `https://api.[dominio]/webhook/...`.
- [ ] Backup rodou e **restore foi testado** num banco limpo.
- [ ] Sentry recebendo eventos; alerta de uptime configurado (ver RUNBOOK).
