# ── Backend ChaveiroBot — imagem de produção (guia §5.1) ────────────────────
# Multi-stage: deps + prisma generate no builder; runtime enxuto e NÃO-root.

FROM node:20-alpine AS builder
WORKDIR /app
# Instala dependências de produção (deterministico via lockfile).
COPY package*.json ./
RUN npm ci --omit=dev
# Gera o Prisma Client a partir do schema.
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Usuário sem privilégios (nunca rodar como root).
RUN addgroup -S nodejs -g 1001 && adduser -S appuser -u 1001 -G nodejs

# Copia node_modules (com Prisma Client gerado), schema e código.
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
COPY --chown=appuser:nodejs package*.json ./
COPY --chown=appuser:nodejs src ./src
COPY --chown=appuser:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER appuser
EXPOSE 3000

# Healthcheck nativo do container (complementa o do compose).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=512", "src/server.js"]
