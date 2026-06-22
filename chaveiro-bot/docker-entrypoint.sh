#!/bin/sh
# Sobe o backend: ajusta o volume de uploads, aplica migrations e inicia o servidor
# como usuário não-root. `migrate deploy` é idempotente e seguro em produção.
set -e

RUN_AS="appuser:nodejs"
AS_ROOT=0
[ "$(id -u)" = "0" ] && AS_ROOT=1

# Em hosts que montam volume persistente (ex.: Railway em /app/uploads), o ponto de
# montagem vem como root. Como root, garantimos que a pasta exista e seja gravável
# pelo usuário da aplicação. Sem volume/sem root, é um no-op inofensivo.
if [ "$AS_ROOT" = "1" ]; then
  mkdir -p /app/uploads
  chown -R "$RUN_AS" /app/uploads
fi

echo "▶ Aplicando migrations (prisma migrate deploy)..."
if [ "$AS_ROOT" = "1" ]; then
  su-exec "$RUN_AS" npx prisma migrate deploy
else
  npx prisma migrate deploy
fi

echo "▶ Iniciando ChaveiroBot..."
if [ "$AS_ROOT" = "1" ]; then
  exec su-exec "$RUN_AS" "$@"
else
  exec "$@"
fi
