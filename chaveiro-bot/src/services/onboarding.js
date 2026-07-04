import { filaEmail } from '../queues/email.js';
import { logger } from '../utils/logger.js';

const DIA = 24 * 60 * 60 * 1000;

const SEQUENCIA = [
  { nome: 'onboarding_dia0', delay: 0 },
  { nome: 'onboarding_dia1', delay: 1 * DIA },
  { nome: 'onboarding_dia3', delay: 3 * DIA },
  { nome: 'onboarding_dia7', delay: 7 * DIA },
];

export async function agendarSequencia(userId, email, nomeUsuario) {
  try {
    for (const { nome, delay } of SEQUENCIA) {
      await filaEmail.add(nome, { userId, email, nome: nomeUsuario }, { delay });
    }
    logger.info('onboarding_agendado', { userId, emails: SEQUENCIA.length });
  } catch (e) {
    logger.warn('onboarding_agendamento_falhou', { userId, erro: e.message });
  }
}
