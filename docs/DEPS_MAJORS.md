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

**✅ STATUS (branch `chore/prisma-7`):** passos 1–7 **feitos e validados localmente** (Postgres session mode) — `generate` ok, `migrate deploy` ok (Prisma 7 exige `datasource.url` no `prisma.config.ts` p/ migrations), **unit 180/180 + integration 34/34** (IDOR + auth). A migração convergiu com só 2 ajustes de API (datasource fora do schema; `datasource.url` na config). **✅ Passo 6 VALIDADO (2026-07-09) em Supabase de staging** (`admai-staging`, org n1imp, sa-east-1, ref `qsuufuulxfkkeasgxhcv`): `migrate deploy` aplicou as **23 migrations** pelo **pooler session (5432)**; e o **pooler transaction (6543)** foi exercitado em runtime pelo `chaveiro-bot/scripts/smoke-pooler.mjs` (SELECT parametrizado · **10× findMany** p/ estressar prepared statements · **transação interativa** create/read/delete) — **tudo verde, sem erro de prepared statement**. O risco central do Prisma 7 (pg-adapter sob transaction pooling) está **confirmado seguro**. Kit reprodutível: `npm run validate:staging` + `scripts/smoke-pooler.mjs` (ver `docs/db/STAGING_VALIDATION.md`). *(A suíte de integração completa exige Redis local — ortogonal ao Prisma 7; já passou 34/34 em session mode.)* **Caveat:** o dev SQLite (`schema.sqlite.prisma`) fica pendente sob Prisma 7 (`src/db/prisma.js` agora é só pg; SQLite precisaria de `@prisma/adapter-better-sqlite3`, ou usar Docker Postgres no dev).

## Outros bumps — aplicados e validados
- **Backend:** `dotenv` 16→**17**, `node-cron` 4.2→**4.6**, `pino` 9→**10** (todos majors) — validados: unit **180/180** + integration **34/34**.
- **Frontend:** `lucide-react` 0.344→**1.23** (major) — validado via build (todos os ícones importados resolvem).
- **CI:** `actions/checkout` v4→**v5**, `actions/setup-node` v4→**v6**.
- ⏸️ **`recharts` 2→3 (major) — DEFERIDO**: lib de gráficos **sem cobertura de teste** no Dashboard; o build passa mas não valida a renderização. Precisa de validação visual com dados (criar serviços → abrir o dashboard → conferir os 3 gráficos). Deferido pra não shipar gráfico quebrado às cegas — mesmo critério do Prisma 7.

---
**Resumo:** majors aplicados e validados — **Vite 8, Sentry 10, dotenv 17, pino 10, node-cron 4.6, lucide-react 1** + bumps de CI. **Deferidos por risco não-validável aqui:** **Prisma 7** (driver adapters + pooler Supabase) e **recharts 3** (gráficos sem teste). Cada um com critério explícito, não por dificuldade técnica.
