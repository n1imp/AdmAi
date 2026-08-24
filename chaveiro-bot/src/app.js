/**
 * Construção do app Express (sem side-effects de boot).
 *
 * Separado de server.js para ser importável em testes (Supertest) sem abrir porta,
 * iniciar WhatsApp ou agendadores. server.js importa `criarApp()` e faz o listen.
 */
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import path from 'node:path';
import {
  redisClient,
  authLimiter,
  authIpLimiter,
  cadastroLimiter,
} from './middlewares/rateLimiters.js';
import { env } from './config/env.js';
import { capturarErro, JA_ENVIADO_AO_SENTRY } from './config/sentry.js';
import { metricsMiddleware, metricsHandler } from './config/metrics.js';
import { apiRouter } from './routes/api.js';
import { logger } from './utils/logger.js';
import { prisma } from './db/prisma.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { stripeWebhookRouter } from './routes/billing.js';
import { googleRouter } from './routes/google.js';

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
          // F10: clickjacking — frame-ancestors é a proteção moderna equivalente ao
          // X-Frame-Options (que o helmet já envia) e cobre navegadores que ignoram o header
          // legado. object-src fecha plugins legados; upgrade-insecure-requests evita
          // sub-recurso em http puro. styleSrc mantém 'unsafe-inline' de propósito:
          // removê-lo exige auditar todo o CSS inline do painel (débito registrado).
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
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
  /* [SEC-HB-02] CONTRATO: ./uploads serve SOMENTE conteúdo público por design (fotos de
     produto do estoque). Sensível tem dir próprio fora do static — ./uploads-ponto (selfies)
     e ./uploads-evidencias (fotos de evidência via WhatsApp) — servido por rotas autenticadas
     com escopo de tenant. Escrever conteúdo sensível aqui reabre o achado. */
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

  const limiter = rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    // Nos testes de integração, centenas de chamadas /api partem do MESMO IP (supertest,
    // 127.0.0.1) num único minuto e estouram o balde de 120 → 429 espúrios em cascata
    // (o limiter global é infra, não é exercido por nenhum teste). Desliga só em teste;
    // dev/produção seguem protegidos. Os limiters de auth/2FA (testados) continuam ativos.
    skip: () => env.NODE_ENV === 'test',
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
  });
  app.use('/api', limiter);

  // Rate limit dedicado e mais permissivo para o webhook inbound (por IP da Evolution).
  const webhookLimiter = rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }),
  });
  app.use('/webhook', webhookLimiter);

  // Rate limit AGRESSIVO contra brute force (guia §3.2). Instância ÚNICA e compartilhada
  // (middlewares/rateLimiters.js) com recuperar-senha/redefinir-senha/magic-link em
  // routes/auth.js — antes duplicado com uma segunda instância sem Redis (F4).
  // Dois tetos compostos: por IDENTIDADE (5/15min, evita brute force de uma
  // conta) e por ORIGEM (30/15min, evita varredura de muitas contas de um IP).
  // O limitador por identidade sozinho é evadível variando o identificador.
  /* [D-FE-STRUCT-LIMITER-2FA, Codex thread 01a0346e] app.post EXATO, não app.use com prefixo:
     `app.use('/api/auth/login')` casava também /login/2fa, /login/2fa-telefone e
     /login/2fa/recuperar por prefix-match — e nessas subrotas o authLimiter não acha identidade
     (CAMPOS_POR_ROTA não as mapeia) e degrada para um balde por IP de 5 falhas/15min
     COMPARTILHADO entre login e 2FA: senha errada de uma pessoa bloqueava o 2FA do escritório
     inteiro (cross-flow lockout via NAT), contra os dois designs documentados (twoFactorLimiter
     dedicado por DESAFIO; authIpLimiter "folgado de propósito" p/ não bloquear escritório).
     As etapas 2FA ficam só com o twoFactorLimiter (abaixo) + limiter global de /api. Obter um
     desafio NOVO continua exigindo credenciais válidas AQUI — o funil de mint já é limitado na
     porta certa. app.post sem handler terminal roda os middlewares e segue ao apiRouter. */
  app.post('/api/auth/login', authIpLimiter, authLimiter);
  // EV-057: cadastroLimiter conta TODA tentativa (sucesso incluso) — authLimiter/
  // authIpLimiter usam skipSuccessfulRequests e nunca contavam um registro
  // bem-sucedido, permitindo abuso de trial via criação ilimitada de empresas.
  app.use('/api/auth/register', authIpLimiter, authLimiter, cadastroLimiter);
  // /auth/oauth/:provedor (cadastro/login via provedor externo) não tinha
  // nenhum limiter de auth dedicado antes do EV-057.
  app.use('/api/auth/oauth', cadastroLimiter);

  // Rate limit dedicado às etapas de 2FA, com a chave no DESAFIO (não no IP): cada
  // desafio de 5 min só admite poucas tentativas de código, fechando brute force do
  // OTP/TOTP de 6 dígitos mesmo que o atacante rode de vários IPs. Conta toda
  // tentativa (sucesso encerra o fluxo de qualquer forma).
  const twoFactorLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.body?.desafio || ipKeyGenerator(req.ip),
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

  // Google Business: as rotas em google.js declaram o caminho completo (/api/google/*),
  // então são montadas na RAIZ (como o whatsappRouter). Montar sob apiRouter (/api)
  // duplicaria o prefixo (/api/api/google/*) e o painel receberia 404.
  app.use(googleRouter);

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
      const conexao = await prisma.conexaoBot.findUnique({
        where: { id: 1 },
        select: { estadoConexao: true },
      });
      saude.whatsapp = conexao?.estadoConexao ?? 'desconectado';
    } catch {
      saude.checks.database = 'error';
      saude.status = 'degraded';
    }
    res.status(saude.status === 'ok' ? 200 : 503).json(saude);
  });

  app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));
  app.use((erro, req, res, next) => {
    // ── Erro do CLIENTE não é falha da aplicação ─────────────────────────────── [D-OBS-03]
    // Antes tudo virava 500 e ia para o rastreador. Corpo JSON malformado, corpo acima de 10mb
    // ou charset inválido — todos culpa de quem chamou — inflavam a taxa de erro do servidor e
    // enchiam o painel de eventos não acionáveis. O sinal deixava de distinguir "o AdmAi
    // quebrou" de "alguém mandou lixo", e é esse sinal que decide se alguém investiga.
    //
    // O discriminador é `expose`, NÃO o status sozinho. `http-errors` (usado pelo body-parser)
    // marca `expose: true` no que é seguro contar ao cliente. Mas neste repositório há três
    // lugares que copiam status ALHEIO para a exceção — `whatsapp/evolution-client.js:33`,
    // `whatsapp/cloud-client.js:35` e `oauth.js:22`. Confiar só em `status` faria um 403 do
    // provedor do WhatsApp ser devolvido como erro do cliente E suprimido da captura: uma falha
    // de integração real desaparecendo justamente do lugar onde se procura falha.
    const candidato = erro.status ?? erro.statusCode;
    const ehDoCliente =
      erro.expose === true && Number.isInteger(candidato) && candidato >= 400 && candidato <= 499;

    if (ehDoCliente) {
      // Genérico de propósito: `erro.message` do parser vaza trecho do corpo recebido.
      return res.status(candidato).json({ erro: 'Requisição inválida' });
    }

    logger.error('Erro não tratado', { erro: erro.message, [JA_ENVIADO_AO_SENTRY]: true });
    capturarErro(erro, {
      feature: 'http',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
      extra: { path: req.path, method: req.method },
    });
    res.status(500).json({ erro: 'Erro interno do servidor' });
  });

  return { app, estado };
}
