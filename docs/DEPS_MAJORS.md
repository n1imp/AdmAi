# Dependabot majors — passada dedicada (`chore/deps-majors`)

Base: branch de estabilização (`fix/rbac-google-whatsapp-mount`). Um major por vez, validado com evidência.

## ✅ Vite 7 → 8.1.3 (+ @vitejs/plugin-react 6)
- **Breaking:** Vite 8 usa o bundler **Rolldown**, que exige `manualChunks` como **função** — a forma de objeto quebra o build com `TypeError: manualChunks is not a function`.
- **Fix:** `vite.config.js` — `manualChunks` convertido para função (compatível com Rollup e Rolldown).
- **Validado:** `npm run build` **ok** (code-splitting mantido: `react-vendor`/`charts`/`icons`) · `npm test` **20/20**.

## ✅ Sentry 8 → 10.64.0 (`@sentry/node` + `@sentry/react`)
- **Sem mudança de código** — o uso é mínimo e só APIs estáveis (`init`/`withScope`/`captureException`/`setTag`/`setExtra`), todas presentes na v10 (verificado no runtime do pacote).
- **Validado:** backend `npm test` **180/180** + `test:integration` **34/34** · frontend `build` **ok**.

## ⏸️ Prisma 5 → 7 — DEFERIDO (migração dedicada)
- **Breaking arquitetural:** Prisma 7 **remove `url`/`directUrl` do schema** e exige **driver adapters** (`@prisma/adapter-pg` + `pg`) + um `prisma.config.ts`; o `PrismaClient` passa a ser construído a partir de um pool `pg` em JS (o engine Rust sai do caminho crítico).
- **Por que NÃO nesta passada:** é uma **reescrita da camada de conexão do banco**, e a parte **crítica de produção — o pooler do Supabase (pgbouncer, transaction mode) com o pg-adapter e prepared statements — NÃO é validável neste ambiente** (o Postgres local não é pgbouncer; o CI também roda Postgres puro). Fazer merge de uma mudança de conexão de banco não validada contra a topologia real de prod é risco alto numa fase de **estabilização**. Decisão técnica: deferir, não shipar às cegas.
- **Plano da migração dedicada (branch próprio + staging):**
  1. `npm i @prisma/adapter-pg pg`
  2. Criar `prisma.config.ts` com a datasource de migrations (`DIRECT_URL`).
  3. `schema.prisma`: remover `url`/`directUrl` do `datasource` (manter `provider = "postgresql"`).
  4. `src/db/prisma.js`: `new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) })`. A extensão `prismaParaEmpresa` (`$extends`) **não muda** (compartilha a conexão do client base).
  5. Configurar o pg-adapter para o pgbouncer transaction mode (prepared statements).
  6. **Validar contra um Supabase de staging** (não só Postgres local/CI) + `test:integration` + IDOR.
  7. Tratar breaking changes adicionais da v6/v7 que só aparecem após o passo 3.

## Minors seguros (sugestão, fora desta passada)
`dotenv`, `node-cron`, `pino`, `lucide-react`, `recharts`, `actions/checkout`, `actions/setup-node` — bumps não-breaking; podem ir juntos.

---
**Resumo:** 2/3 majors aplicados e validados (Vite 8, Sentry 10). Prisma 7 deferido com plano — por risco de prod não validável aqui, não por dificuldade técnica.
