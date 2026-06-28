import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const filaMensagens = new Queue('mensagens-inbound', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});
