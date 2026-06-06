# ── Painel ChaveiroBot — build estático servido por nginx ───────────────────
# Stage 1: build do bundle Vite. Stage 2: nginx:alpine servindo /dist.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS runner
# Config própria: SPA fallback + proxy para o backend.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
# 127.0.0.1 (não "localhost"): nginx escuta só em IPv4; localhost resolveria p/ ::1.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
