/**
 * Idempotência de webhooks (F5.2) via Redis SET NX EX.
 *
 * `marcarSeNovo(chave, ttl)` marca a chave se ela ainda não existe. Retorna:
 *   - true  → chave NOVA (é a primeira vez; o chamador DEVE processar);
 *   - false → chave JÁ existia (entrega duplicada; o chamador DEVE pular).
 *
 * Fail-OPEN: se o Redis não responder, retorna true (processa) — para webhook, perder
 * um evento é pior que reprocessar uma duplicata rara (e os handlers são quase-idempotentes).
 * (É o oposto do lock de cron, que é fail-closed: lá, duplicar é pior que pular.)
 */
import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let redis = null;
function cliente() {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    redis.on('error', () => { /* evita crash quando o Redis está indisponível */ });
  }
  return redis;
}

export async function marcarSeNovo(chave, ttlSegundos) {
  try {
    const r = await cliente().set(`idemp:${chave}`, '1', 'EX', ttlSegundos, 'NX');
    return r === 'OK'; // OK = marcou agora (novo) · null = já existia (duplicata)
  } catch (erro) {
    logger.warn('idempotencia: Redis indisponível — processando (fail-open)', { chave, erro: erro.message });
    return true;
  }
}
