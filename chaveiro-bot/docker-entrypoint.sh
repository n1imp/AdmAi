#!/bin/sh
# Aplica migrations pendentes antes de subir o servidor.
# `migrate deploy` é idempotente e seguro para produção (não gera migration nova).
set -e

echo "▶ Aplicando migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "▶ Iniciando ChaveiroBot..."
exec "$@"
