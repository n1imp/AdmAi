/**
 * Rate limiters compartilhados, todos com store Redis (não MemoryStore).
 *
 * F4: `authLimiter` era definido DUAS VEZES — uma em app.js (Redis) e outra, separada,
 * em routes/auth.js (import dinâmico, sem RedisStore → cai no MemoryStore padrão). Sob
 * múltiplas réplicas do processo, o limite de 5/15min em recuperar-senha/redefinir-senha/
 * magic-link resetava por instância. Este módulo é a única fonte de verdade: um único
 * Redis compartilhado, um único `authLimiter` aplicado a TODAS as rotas de auth
 * (login, register, recuperar-senha, redefinir-senha, magic-link).
 */
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const redisClient = new Redis(env.REDIS_URL);
// ioredis emite 'error' em falha de conexão; sem handler, o processo crasha.
redisClient.on('error', (err) => logger.warn('Redis connection error', { error: err.message }));

function novoStoreRedis() {
  return new RedisStore({ sendCommand: (...args) => redisClient.call(...args) });
}

/** Cria um rate limiter com o store Redis compartilhado (nunca MemoryStore). */
export function criarLimiterRedis(opcoes) {
  return rateLimit({ ...opcoes, store: novoStoreRedis() });
}

// Rate limit AGRESSIVO contra brute force em login/register/recuperação de senha/magic-link
// (guia §3.2). Chave por username/e-mail do corpo quando presente; cai para IP senão.
export const authLimiter = criarLimiterRedis({
  windowMs: 15 * 60_000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => req.body?.username || req.body?.email || ipKeyGenerator(req, res),
  message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
});

export { ipKeyGenerator };
