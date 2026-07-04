import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

export const filaEmail = new Queue('emails', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 200 },
  },
});
