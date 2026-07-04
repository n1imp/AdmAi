import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

async function processarEmail(job) {
  const { email, nome } = job.data;
  const {
    enviarEmailBoasVindas,
    enviarEmailOnboardingDia1,
    enviarEmailOnboardingDia3,
    enviarEmailOnboardingDia7,
  } = await import('../services/email.js');

  switch (job.name) {
    case 'onboarding_dia0':
      await enviarEmailBoasVindas({ email, nome });
      break;
    case 'onboarding_dia1':
      await enviarEmailOnboardingDia1({ email, nome });
      break;
    case 'onboarding_dia3':
      await enviarEmailOnboardingDia3({ email, nome });
      break;
    case 'onboarding_dia7':
      await enviarEmailOnboardingDia7({ email, nome });
      break;
    default:
      logger.warn('email_worker_job_desconhecido', { tipo: job.name });
  }
}

export function iniciarWorkerEmail() {
  return new Worker('emails', processarEmail, { connection, concurrency: 3 });
}
