import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { env } from './config/env.js';
import { apiRouter, requireAuth } from './routes/api.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';
import { iniciarWhatsApp, getQRBase64, getEstado, getSock } from './services/baileys.js';
import { iniciarAgendamentos } from './services/agendador.js';
import { whatsappRouter } from './routes/whatsapp.js';

const app = express();

// O webhook da Evolution precisa do corpo CRU (raw) para validar HMAC.
// Por isso, o parser JSON global NÃO deve consumir o corpo das rotas /webhook.
app.use((req, res, next) => {
  if (req.path.startsWith('/webhook/')) return next();
  express.json({ limit: '10mb' })(req, res, next);
});

// Fotos de evidência salvas pelo bot — servidas estaticamente para o painel.
// Público por design: são imagens referenciadas via <img src> no frontend.
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
app.get('/health', (req, res) => {
  res.json({ status: 'ok', whatsapp: getEstado(), timestamp: new Date().toISOString() });
});

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
app.use((erro, req, res, next) => {
  logger.error('Erro não tratado', { erro: erro.message });
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORT = parseInt(env.PORT);

app.listen(PORT, async () => {
  logger.info(`🔑 ChaveiroBot iniciado na porta ${PORT}`, {
    ambiente: env.NODE_ENV,
    whatsapp: env.EVOLUTION_HOST ? 'evolution' : (env.GROUP_JID ? 'baileys-legado' : 'nenhum'),
  });

  try {
    await prisma.$connect();
    logger.info('✅ Banco de dados conectado');
  } catch (erro) {
    logger.error('❌ Falha ao conectar ao banco', { erro: erro.message });
    process.exit(1);
  }

  // Camada WhatsApp:
  // - Se a Evolution estiver configurada (EVOLUTION_HOST), o gateway multi-tenant
  //   assume — as instâncias são provisionadas sob demanda pelo painel/webhook.
  // - Senão, mantém o fluxo legado Baileys (grupo único) para não quebrar o ambiente atual.
  if (env.EVOLUTION_HOST) {
    logger.info('🌐 Gateway WhatsApp via Evolution API ativo', { host: env.EVOLUTION_HOST });
  } else if (env.GROUP_JID) {
    iniciarWhatsApp().catch((erro) =>
      logger.error('Falha ao iniciar WhatsApp (legado Baileys)', { erro: erro.message })
    );
  } else {
    logger.warn('Nenhuma camada WhatsApp configurada (defina EVOLUTION_HOST ou GROUP_JID).');
  }

  iniciarAgendamentos();
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
