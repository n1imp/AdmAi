import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';

// Singleton do cliente Prisma para evitar múltiplas conexões
const prisma = new PrismaClient({
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

export { prisma };
