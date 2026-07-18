import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { rotearMensagemInbound } from '../services/inbound.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (err) =>
  logger.warn('Redis connection error (inbound-worker)', { error: err.message })
);

export function iniciarWorkerInbound() {
  return new Worker('mensagens-inbound', (job) => rotearMensagemInbound(job.data), {
    connection,
    concurrency: 5,
  });
}
