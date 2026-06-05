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

export { prisma };
