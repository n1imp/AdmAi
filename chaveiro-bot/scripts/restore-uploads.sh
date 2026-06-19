#!/usr/bin/env bash
# ============================================================================
# restore-uploads.sh — Restaura um backup para o volume backend_uploads
# ----------------------------------------------------------------------------
# Recebe o caminho de um arquivo .tar.gz (gerado por backup-uploads.sh) e
# restaura o conteúdo DENTRO do volume Docker de uploads.
#
#   ATENÇÃO: esta operação SOBRESCREVE o conteúdo atual do volume!
#   Tudo que estiver hoje em backend_uploads será apagado antes da restauração.
#   Use com cuidado — de preferência apenas em recuperação de desastre.
#
# USO:
#   ./restore-uploads.sh /home/appuser/backups/backup_uploads_2026-06-18_0300.tar.gz
# ============================================================================
set -euo pipefail

# --- Configuração -----------------------------------------------------------
VOLUME_UPLOADS=${VOLUME_UPLOADS:-chaveiro-bot_backend_uploads}

# --- Validação dos argumentos -----------------------------------------------
ARQ="${1:-}"

if [ -z "$ARQ" ]; then
  echo "Uso: $0 <caminho-do-backup.tar.gz>"
  echo "Exemplo: $0 /home/appuser/backups/backup_uploads_2026-06-18_0300.tar.gz"
  exit 1
fi

if [ ! -f "$ARQ" ]; then
  echo "✖ Arquivo de backup não encontrado: $ARQ"
  exit 1
fi

echo "⚠ ATENÇÃO: isto vai APAGAR o conteúdo atual do volume '$VOLUME_UPLOADS'"
echo "  e substituí-lo pelo conteúdo de: $ARQ"
echo "▶ Restaurando..."

# --- Restauração ------------------------------------------------------------
# Monta o volume em /data e a pasta do backup em /backup, limpa o volume e
# extrai o tar por cima.
docker run --rm \
  -v "$VOLUME_UPLOADS:/data" \
  -v "$(dirname "$ARQ"):/backup" \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename "$ARQ") -C /data"

echo "✔ Restauração concluída no volume '$VOLUME_UPLOADS'"
