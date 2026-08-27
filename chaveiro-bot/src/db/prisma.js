import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Prisma 7: a conexão vem do driver adapter (pg), não mais do schema. DATABASE_URL pode
// ser o pooler pgbouncer (6543, transaction mode) em prod — o `pg` usa prepared statements
// NÃO-nomeados, compatíveis com transaction pooling. ⚠️ VALIDAR em Supabase staging antes
// de deploy (o Postgres local é session mode e não replica o pooler).
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

// [D-STG-K-SUITE-VS-STAGING-01] maxWait afinável por env validado (ver env.js): ausente ⇒
// objeto vazio e o default do Prisma (2s) é preservado byte-a-byte. Vale para os DOIS
// clientes compartilhados; nenhuma chamada individual de $transaction muda.
const opcoesDeTransacao = env.PRISMA_TX_MAX_WAIT_MS
  ? { transactionOptions: { maxWait: env.PRISMA_TX_MAX_WAIT_MS } }
  : {};

// Singleton do cliente Prisma para evitar múltiplas conexões
const prisma = new PrismaClient({
  adapter,
  ...opcoesDeTransacao,
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('error', (e) => {
  logger.error('Erro Prisma', { message: e.message, target: e.target });
});

// Loga queries lentas (>100ms) para flagrar N+1 e índices faltando (guia §1.2).
const LIMIAR_QUERY_LENTA_MS = 100;
prisma.$on('query', (e) => {
  if (e.duration > LIMIAR_QUERY_LENTA_MS) {
    logger.warn('Query lenta', { duracaoMs: e.duration, query: e.query });
  }
});

// F4-RLS: cliente do caminho de REQUEST (base do prismaParaEmpresa). Com DATABASE_URL_APP
// apontando pro role app_rw (sem BYPASSRLS), as queries escopadas passam a sofrer RLS.
// Ausente → reusa o `prisma` privilegiado (comportamento atual). Os jobs/auth cross-tenant
// continuam no `prisma` (privilegiado, bypassa RLS) — é essa a separação que a RLS exige.
const prismaApp = env.DATABASE_URL_APP
  ? new PrismaClient({
      adapter: new PrismaPg({ connectionString: env.DATABASE_URL_APP }),
      ...opcoesDeTransacao,
    })
  : prisma;

export { prisma, prismaApp };
