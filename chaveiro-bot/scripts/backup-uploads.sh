#!/usr/bin/env bash
# ============================================================================
# backup-uploads.sh — Backup dos volumes Docker que vivem na VPS
# ----------------------------------------------------------------------------
# POR QUE ESTE SCRIPT EXISTE:
#   O banco de dados (Postgres) roda no Supabase gerenciado, que já faz backup
#   automático — então o DB NÃO precisa de dump local. O que NÃO está coberto
#   pelo Supabase são os volumes Docker nomeados que ficam no disco da VPS:
#     - backend_uploads   -> fotos de evidência enviadas pelos técnicos
#     - backend_auth_info  -> credenciais legadas do WhatsApp (Baileys)
#   Se a VPS for perdida, esses arquivos somem. Este script os preserva.
#
# COMO O DOCKER NOMEIA OS VOLUMES:
#   O Compose prefixa o nome do volume com o nome do diretório do projeto.
#   Logo, o volume real costuma ser "chaveiro-bot_backend_uploads".
#   Ajuste via env vars caso seu projeto use outro prefixo.
#
# COMO AGENDAR (cron, diário às 03:00):
#   crontab -e
#   0 3 * * * /home/appuser/AdmAi/chaveiro-bot/scripts/backup-uploads.sh >> /home/appuser/backups/backup.log 2>&1
# ============================================================================
set -euo pipefail

# --- Configuração (sobrescreva via env vars se necessário) ------------------
VOLUME_UPLOADS=${VOLUME_UPLOADS:-chaveiro-bot_backend_uploads}
VOLUME_AUTH=${VOLUME_AUTH:-chaveiro-bot_backend_auth_info}
BACKUP_DIR=${BACKUP_DIR:-/home/appuser/backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}

# Garante que o diretório de backups exista
mkdir -p "$BACKUP_DIR"

TS="$(date +%F_%H%M)"

# --- Backup do volume de uploads (fotos de evidência) -----------------------
echo "▶ Fazendo backup do volume '$VOLUME_UPLOADS'..."
docker run --rm \
  -v "$VOLUME_UPLOADS:/data" \
  -v "$BACKUP_DIR:/backup" \
  alpine tar czf "/backup/backup_uploads_$TS.tar.gz" -C /data .

# --- Backup do volume de credenciais do WhatsApp (legado) -------------------
# Só faz o backup se o volume existir (instalações novas podem não ter).
if docker volume inspect "$VOLUME_AUTH" >/dev/null 2>&1; then
  echo "▶ Fazendo backup do volume '$VOLUME_AUTH'..."
  docker run --rm \
    -v "$VOLUME_AUTH:/data" \
    -v "$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/backup_auth_info_$TS.tar.gz" -C /data .
else
  echo "ℹ Volume '$VOLUME_AUTH' não existe — pulando."
fi

# --- Retenção local: remove backups com mais de N dias ----------------------
echo "▶ Limpando backups locais com mais de $RETENTION_DAYS dias..."
find "$BACKUP_DIR" -name 'backup_uploads_*.tar.gz'   -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'backup_auth_info_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

# --- Offsite (opcional) -----------------------------------------------------
# Para proteção contra perda total da VPS, envie os backups para um bucket
# remoto (Backblaze B2 / S3). Configure o rclone antes (rclone config) e
# descomente a linha abaixo:
# rclone copy "$BACKUP_DIR" "b2:meu-bucket-chaveiro/backups" --include "backup_*_$TS.tar.gz"

echo "✔ Backup concluído em $BACKUP_DIR"
