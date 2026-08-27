# ── Backend ChaveiroBot — imagem de produção (guia §5.1) ────────────────────
# Multi-stage: deps + prisma generate no builder; runtime enxuto e NÃO-root.

# Node 22: o @supabase/supabase-js atual exige WebSocket nativo (Node >= 22) e lança
# "native WebSocket not found" na criação do client em Node 20 — uploads de storage
# 500avam no Railway com o mesmo código passando em Node >= 22. [AUD2-P1F]
FROM node:22-alpine AS builder
WORKDIR /app
# Prisma no Alpine (musl) precisa de openssl para o engine; libc6-compat ajuda os binários.
RUN apk add --no-cache openssl libc6-compat
# Instala dependências de produção (deterministico via lockfile).
COPY package*.json ./
RUN npm ci --omit=dev
# Gera o Prisma Client a partir do schema.
COPY prisma ./prisma
RUN npx prisma generate

FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# openssl é exigido pelo schema/query engine do Prisma em runtime (migrate deploy).
# su-exec rebaixa privilégios no entrypoint depois de ajustar o volume de uploads.
RUN apk add --no-cache openssl libc6-compat su-exec

# Usuário sem privilégios (a aplicação NUNCA roda como root — ver docker-entrypoint.sh,
# que ajusta a permissão do volume de uploads como root e então faz `su-exec appuser`).
RUN addgroup -S nodejs -g 1001 && adduser -S appuser -u 1001 -G nodejs

# Copia node_modules (com Prisma Client gerado), schema e código.
COPY --from=builder --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/prisma ./prisma
# Prisma 7: a conexão saiu do schema e vive no prisma.config.ts (datasource.url).
# Sem este arquivo no runtime, o `prisma migrate deploy` do entrypoint falha em loop
# ("The datasource.url property is required...") e o healthcheck do deploy não sobe.
COPY --chown=appuser:nodejs prisma.config.ts ./
COPY --chown=appuser:nodejs package*.json ./
COPY --chown=appuser:nodejs src ./src
# Scripts de ops/migração (ex.: backfill de mídia, smokes) — disponíveis no container
# para rodar via console/`railway run`. Os testes ficam de fora (ver .dockerignore).
COPY --chown=appuser:nodejs scripts ./scripts
COPY --chown=appuser:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
# Garante a pasta de uploads existente (ponto de montagem do volume persistente).
RUN mkdir -p /app/uploads && chown -R appuser:nodejs /app/uploads

# NÃO definimos `USER appuser` aqui de propósito: o entrypoint inicia como root só
# para ajustar a permissão do volume montado em /app/uploads e logo rebaixa para
# appuser via su-exec. O processo do servidor roda como não-root.
EXPOSE 3000

# Healthcheck nativo do container (complementa o do compose).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "--max-old-space-size=512", "src/server.js"]
