/**
 * Construção do app Express (sem side-effects de boot).
 *
 * Separado de server.js para ser importável em testes (Supertest) sem abrir porta,
 * iniciar WhatsApp ou agendadores. server.js importa `criarApp()` e faz o listen.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import { RedisStore } from 'rate-limit-redis';
import path from 'node:path';
import { env } from './config/env.js';
import { capturarErro } from './config/sentry.js';
import { metricsMiddleware, metricsHandler } from './config/metrics.js';
import { apiRouter } from './routes/api.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { stripeWebhookRouter } from './routes/billing.js';

const redisClient = new Redis(env.REDIS_URL);

/**
 * Monta o app. `estado.isShuttingDown` é lido pelo /health para responder 503
 * durante o graceful shutdown; server.js muta essa flag via o objeto retornado.
 */
export function criarApp() {
  const estado = { isShuttingDown: false };
  const app = express();

  // Em produção há 2 proxies na frente do app no caminho do painel:
  // Caddy (HTTPS) → nginx (painel) → backend. Confiamos em 2 saltos para que
  // req.ip seja o IP real do cliente — sem isso o rate limiting por IP (/api,
  // /webhook) contaria todos os usuários no mesmo balde e os logs perderiam o IP.
  app.set('trust proxy', 2);

  // ── Headers de segurança (Helmet) ─────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
        },
      },
      hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // /uploads servido ao painel
    })
  );

  // Métricas Prometheus: mede duração de todas as rotas.
  app.use(metricsMiddleware);

  // O webhook da Evolution precisa do corpo CRU (raw) para validar HMAC.
  // Por isso, o parser JSON global NÃO deve consumir o corpo das rotas /webhook.
  app.use((req, res, next) => {
    if (req.path.startsWith('/webhook/')) return next();
    express.json({ limit: '10mb' })(req, res, next);
  });

  // Fotos de evidência salvas pelo bot — servidas estaticamente para o painel.
  app.use('/uploads', express.static(path.resolve('./uploads')));

  app.use(cookieParser());

  app.use((req, res, next) => {
    const allowedOrigin = env.ALLOWED_ORIGIN ?? '*';
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (allowedOrigin !== '*') res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  const limiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) });
  app.use('/api', limiter);

  // Rate limit dedicado e mais permissivo para o webhook inbound (por IP da Evolution).
  const webhookLimiter = rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false, store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) });
  app.use('/webhook', webhookLimiter);

  // Rate limit AGRESSIVO contra brute force em login/registro (guia §3.2).
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body?.username || req.ip,
    message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Rate limit dedicado às etapas de 2FA, com a chave no DESAFIO (não no IP): cada
  // desafio de 5 min só admite poucas tentativas de código, fechando brute force do
  // OTP/TOTP de 6 dígitos mesmo que o atacante rode de vários IPs. Conta toda
  // tentativa (sucesso encerra o fluxo de qualquer forma).
  const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body?.desafio || req.ip,
    message: { erro: 'Muitas tentativas de verificação. Reinicie o login e tente de novo.' },
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
  });
  app.use('/api/auth/login/2fa', twoFactorLimiter);
  app.use('/api/auth/login/2fa-telefone', twoFactorLimiter);

  // ── /metrics — scraping do Prometheus (sem auth, fora de /api) ─────────────
  app.get('/metrics', metricsHandler);

  // Webhook Stripe: corpo bruto (raw) necessário para validar assinatura HMAC.
  // Montado ANTES do apiRouter e FORA do bypass do JSON parser (que já pula /webhook/).
  app.use(stripeWebhookRouter);

  // Gateway WhatsApp (Evolution): rotas de painel (/api/whatsapp/*) + webhook inbound.
  // Montado ANTES do apiRouter para que /api/whatsapp/* tenha precedência.
  app.use(whatsappRouter);

  app.use('/api', apiRouter);

  // ── Health check ──────────────────────────────────────────────────────────
  // Checa o banco (SELECT 1) e o estado de shutdown. 503 quando degradado/desligando.
  app.get('/health', async (req, res) => {
    if (estado.isShuttingDown) {
      return res.status(503).json({ status: 'shutting_down', timestamp: new Date().toISOString() });
    }
    const saude = {
      status: 'ok',
      whatsapp: 'desconhecido',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { database: 'unknown' },
    };
    try {
      await prisma.$queryRaw`SELECT 1`;
      saude.checks.database = 'ok';
      // Estado da conexão ÚNICA do robô (número único) — singleton ConexaoBot (id=1).
      const conexao = await prisma.conexaoBot.findUnique({ where: { id: 1 }, select: { estadoConexao: true } });
      saude.whatsapp = conexao?.estadoConexao ?? 'desconectado';
    } catch {
      saude.checks.database = 'error';
      saude.status = 'degraded';
    }
    res.status(saude.status === 'ok' ? 200 : 503).json(saude);
  });

  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
  app.use((erro, req, res, next) => {
    logger.error('Erro não tratado', { erro: erro.message });
    capturarErro(erro, { feature: 'http', extra: { path: req.path, method: req.method } });
    res.status(500).json({ erro: 'Erro interno do servidor' });
  });

  return { app, estado };
}
