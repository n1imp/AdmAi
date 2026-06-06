/**
 * Construção do app Express (sem side-effects de boot).
 *
 * Separado de server.js para ser importável em testes (Supertest) sem abrir porta,
 * iniciar WhatsApp ou agendadores. server.js importa `criarApp()` e faz o listen.
 */
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { env } from './config/env.js';
import { capturarErro } from './config/sentry.js';
import { metricsMiddleware, metricsHandler } from './config/metrics.js';
import { apiRouter, requireAuth } from './routes/api.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';
import { getQRBase64, getEstado, getSock } from './services/baileys.js';
import { whatsappRouter } from './routes/whatsapp.js';

/**
 * Monta o app. `estado.isShuttingDown` é lido pelo /health para responder 503
 * durante o graceful shutdown; server.js muta essa flag via o objeto retornado.
 */
export function criarApp() {
  const estado = { isShuttingDown: false };
  const app = express();

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

  app.use((req, res, next) => {
    const allowedOrigin = env.ALLOWED_ORIGIN ?? '*';
    res.header('Access-Control-Allow-Origin', allowedOrigin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  const limiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
  app.use('/api', limiter);

  // Rate limit dedicado e mais permissivo para o webhook inbound (por IP da Evolution).
  const webhookLimiter = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });
  app.use('/webhook', webhookLimiter);

  // Rate limit AGRESSIVO contra brute force em login/registro (guia §3.2).
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body?.username || req.ip,
    message: { erro: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // ── /metrics — scraping do Prometheus (sem auth, fora de /api) ─────────────
  app.get('/metrics', metricsHandler);

  // Gateway WhatsApp (Evolution): rotas de painel (/api/whatsapp/*) + webhook inbound.
  // Montado ANTES do apiRouter para que /api/whatsapp/* tenha precedência.
  app.use(whatsappRouter);

  app.use('/api', apiRouter);

  // ── /api/qr — estado do WhatsApp para o painel React ─────────────────────
  app.get('/api/qr', requireAuth, (req, res) => {
    res.json({ qr: getQRBase64(), estado: getEstado() });
  });

  // ── /api/grupos — lista grupos do WhatsApp ────────────────────────────────
  app.get('/api/grupos', requireAuth, async (req, res) => {
    const sock = getSock();
    if (!sock || getEstado() !== 'conectado') {
      return res.status(503).json({ erro: 'WhatsApp não conectado' });
    }
    try {
      const grupos = await sock.groupFetchAllParticipating();
      const lista = Object.values(grupos).map((g) => ({
        id: g.id,
        nome: g.subject,
        participantes: g.participants?.length ?? 0,
      }));
      res.json(lista.sort((a, b) => a.nome.localeCompare(b.nome)));
    } catch {
      res.status(500).json({ erro: 'Erro ao buscar grupos' });
    }
  });

  // ── Health check ──────────────────────────────────────────────────────────
  // Checa o banco (SELECT 1) e o estado de shutdown. 503 quando degradado/desligando.
  app.get('/health', async (req, res) => {
    if (estado.isShuttingDown) {
      return res.status(503).json({ status: 'shutting_down', timestamp: new Date().toISOString() });
    }
    const saude = {
      status: 'ok',
      whatsapp: getEstado(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: { database: 'unknown' },
    };
    try {
      await prisma.$queryRaw`SELECT 1`;
      saude.checks.database = 'ok';
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
