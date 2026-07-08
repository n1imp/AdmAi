import { Router, raw } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { requireAuth, requirePermissao } from '../middlewares/auth.js';
import { verificarHmac, compararToken } from '../services/whatsapp/crypto.js';
import { normalizarInboundCloud, salvarCredenciaisCloud } from '../services/whatsapp/cloud-gateway.js';
import {
  extrairQr,
  // Número único (conexão global do robô)
  segredoWebhookBot,
  salvarQrBot,
  atualizarEstadoBot,
  statusBot,
  conectarBot,
  desconectarBot,
} from '../services/whatsapp/gateway.js';
import { rotearMensagemInbound } from '../services/inbound.js';
import { filaMensagens } from '../queues/mensagens.js';

export const whatsappRouter = Router();

/**
 * Converte falhas comuns do gateway em mensagens pt-BR acionáveis para o painel,
 * sem vazar detalhes internos. Retorna o texto a colocar no campo `erro`.
 */
function mensagemErro(erro) {
  const msg = String(erro?.message ?? '');
  if (msg.includes('ENCRYPTION_KEY')) {
    return 'Falta configurar ENCRYPTION_KEY no servidor.';
  }
  if (msg.includes('EVOLUTION_HOST')) {
    return 'Falta configurar EVOLUTION_HOST no servidor.';
  }
  if (msg.includes('EVOLUTION_API_KEY')) {
    return 'Falta configurar EVOLUTION_API_KEY no servidor.';
  }
  // Erros de rede/axios ao falar com a Evolution (host errado, fora do ar, timeout).
  const codigo = erro?.code ?? '';
  if (
    msg.includes('Evolution API falhou') ||
    ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET'].includes(codigo)
  ) {
    return 'Não foi possível falar com o servidor Evolution. Verifique EVOLUTION_HOST.';
  }
  return 'Falha ao conectar ao gateway WhatsApp.';
}

// ── CLOUD API (Meta) — credenciais por empresa (provider 'cloud') ─────────────

// POST /api/whatsapp/cloud/credenciais — salva as credenciais da Cloud API (Meta)
// da empresa (access token cifrado em repouso) e ativa o provider 'cloud' para ela.
whatsappRouter.post('/api/whatsapp/cloud/credenciais', requireAuth, requirePermissao('configuracao', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      phoneNumberId: z.string().min(1),
      wabaId: z.string().optional().nullable(),
      accessToken: z.string().min(1),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    await salvarCredenciaisCloud(req.user.empresaId, parse.data);
    res.json({ ok: true });
  } catch (erro) {
    logger.error('Erro POST /whatsapp/cloud/credenciais', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── BOT GLOBAL (número único) — só o SUPER-ADMIN pareia o número do robô ───────
// O número único atende todas as empresas; quem o conecta/desconecta é um único
// operador, identificado por SUPER_ADMIN_USERNAME (env) vs req.user.username.

function requireSuperAdmin(req, res, next) {
  if (!env.SUPER_ADMIN_USERNAME || req.user?.username !== env.SUPER_ADMIN_USERNAME) {
    return res.status(403).json({ erro: 'Acesso restrito ao super-admin do robô' });
  }
  next();
}

// GET /api/bot/whatsapp/status — estado da conexão global do robô.
// Visível a QUALQUER usuário autenticado (read-only); só o super-admin recebe o QR
// e pode parear. `ehSuperAdmin` diz ao painel se deve mostrar o botão "Parear".
whatsappRouter.get('/api/bot/whatsapp/status', requireAuth, async (req, res) => {
  try {
    const ehSuperAdmin = !!env.SUPER_ADMIN_USERNAME && req.user?.username === env.SUPER_ADMIN_USERNAME;
    const status = await statusBot();
    // Usuário comum não recebe o QR (dado operacional do pareamento).
    if (!ehSuperAdmin) status.qr = null;
    res.json({ ...status, ehSuperAdmin });
  } catch (erro) {
    logger.error('Erro GET /bot/whatsapp/status', { erro: erro.message });
    res.status(500).json({ erro: mensagemErro(erro) });
  }
});

// POST /api/bot/whatsapp/conectar — provisiona a instância global e devolve o QR
whatsappRouter.post('/api/bot/whatsapp/conectar', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    res.json(await conectarBot());
  } catch (erro) {
    logger.error('Erro POST /bot/whatsapp/conectar', { erro: erro.message });
    const msg = String(erro?.message ?? '');
    const ehConfig = /ENCRYPTION_KEY|EVOLUTION_HOST|EVOLUTION_API_KEY/.test(msg);
    res.status(ehConfig ? 500 : 502).json({ erro: mensagemErro(erro) });
  }
});

// POST /api/bot/whatsapp/desconectar — deleta a instância global e zera o estado
whatsappRouter.post('/api/bot/whatsapp/desconectar', requireAuth, requireSuperAdmin, async (_req, res) => {
  try {
    res.json(await desconectarBot());
  } catch (erro) {
    logger.error('Erro POST /bot/whatsapp/desconectar', { erro: erro.message });
    res.status(500).json({ erro: mensagemErro(erro) });
  }
});

// Shape mínimo de um evento da Evolution (usado pelo webhook global do robô).
const eventoSchema = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  data: z.any().optional(),
}).passthrough();

// ── WEBHOOK GLOBAL (número único) ─────────────────────────────────────────────
// Evolution chama POST /webhook/whatsapp (sem :empresaId) para a instância global
// do robô. Autenticado pelo webhookSecret da ConexaoBot (via ?token= ou header
// x-webhook-token, em tempo constante) ou HMAC. O roteamento descobre a empresa
// pelo telefone do remetente (rotearMensagemInbound, sem empresaId).
whatsappRouter.post(
  '/webhook/whatsapp',
  raw({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    try {
      const segredo = await segredoWebhookBot();
      if (!segredo) {
        logger.warn('Webhook global rejeitado (segredo não configurado)');
        return res.status(401).json({ erro: 'Webhook não configurado' });
      }
      const assinatura = req.get('x-hub-signature-256') || req.get('x-webhook-signature') || '';
      const tokenQuery = typeof req.query?.token === 'string' ? req.query.token : '';
      const tokenHeader = req.get('x-webhook-token') || '';
      const hmacOk = verificarHmac(rawBody, assinatura, segredo);
      const tokenOk = compararToken(tokenQuery, segredo) || compararToken(tokenHeader, segredo);
      if (!hmacOk && !tokenOk) {
        logger.warn('Webhook global rejeitado (assinatura/token inválido)');
        return res.status(401).json({ erro: 'Assinatura inválida' });
      }

      let json;
      try { json = JSON.parse(rawBody); } catch { return res.status(400).json({ erro: 'JSON inválido' }); }
      const parse = eventoSchema.safeParse(json);
      if (!parse.success) return res.status(400).json({ erro: 'Payload inválido' });

      res.status(200).json({ ok: true });

      processarEventoInboundBot(parse.data).catch((e) =>
        logger.error('Erro ao processar evento inbound (global)', {
          tipo: parse.data?.event ?? 'desconhecido', erro: e.message,
        })
      );
    } catch (erro) {
      logger.error('Erro no webhook global', { erro: erro.message });
      if (!res.headersSent) res.status(500).json({ erro: 'Erro interno' });
    }
  }
);

// ── WEBHOOK CLOUD API (Meta) — provider 'cloud' ───────────────────────────────
// A Meta usa UMA URL de callback configurada no app. Verificação em dois passos:
//   GET  — handshake: ecoa hub.challenge se hub.verify_token === WHATSAPP_VERIFY_TOKEN.
//   POST — eventos assinados em X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com
//          META_APP_SECRET). Validada a assinatura, normalizamos para o shape
//          Evolution e reusamos rotearMensagemInbound (inbound.js intocado).

// GET — verificação do webhook (handshake da Meta).
whatsappRouter.get('/webhook/whatsapp/cloud/:empresaId', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = typeof req.query['hub.verify_token'] === 'string' ? req.query['hub.verify_token'] : '';
  const challenge = req.query['hub.challenge'];
  if (modo === 'subscribe' && env.WHATSAPP_VERIFY_TOKEN && compararToken(token, env.WHATSAPP_VERIFY_TOKEN)) {
    return res.status(200).send(String(challenge ?? ''));
  }
  return res.sendStatus(403);
});

// POST — eventos inbound da Cloud API (assinatura HMAC com META_APP_SECRET).
whatsappRouter.post(
  '/webhook/whatsapp/cloud/:empresaId',
  raw({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    if (isNaN(empresaId)) return res.status(400).json({ erro: 'empresaId inválido' });

    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    try {
      const segredo = env.META_APP_SECRET;
      if (!segredo) {
        logger.warn('Webhook Cloud rejeitado (META_APP_SECRET ausente)', { empresaId });
        return res.status(401).json({ erro: 'Webhook não configurado' });
      }
      // A Meta envia "sha256=<hex>"; verificarHmac compara o hex puro em tempo constante.
      const assinatura = (req.get('x-hub-signature-256') || '').replace(/^sha256=/, '');
      if (!verificarHmac(rawBody, assinatura, segredo)) {
        logger.warn('Webhook Cloud rejeitado (assinatura inválida)', { empresaId });
        return res.status(401).json({ erro: 'Assinatura inválida' });
      }

      let json;
      try { json = JSON.parse(rawBody); } catch { return res.status(400).json({ erro: 'JSON inválido' }); }

      // Responde rápido (a Meta espera 2xx) e processa de forma assíncrona.
      res.status(200).json({ ok: true });

      for (const evento of normalizarInboundCloud(json)) {
        // Número único: o roteamento descobre a empresa pelo telefone do remetente.
        rotearMensagemInbound(evento).catch((e) =>
          logger.error('Erro no roteamento inbound (Cloud)', { empresaId, erro: e.message })
        );
      }
    } catch (erro) {
      logger.error('Erro no webhook WhatsApp Cloud', { empresaId, erro: erro.message });
      if (!res.headersSent) res.status(500).json({ erro: 'Erro interno' });
    }
  }
);

/**
 * Processa um evento inbound da conexão GLOBAL do robô (número único). Grava
 * QR/estado na ConexaoBot e roteia a mensagem pelo telefone do remetente (sem empresaId).
 */
async function processarEventoInboundBot(evento) {
  const tipo = evento.event ?? 'desconhecido';
  logger.info('Webhook global recebido', { tipo });

  if (tipo === 'qrcode.updated' || tipo === 'QRCODE_UPDATED') {
    const qr = extrairQr(evento.data) ?? extrairQr(evento);
    if (qr) {
      await salvarQrBot(qr);
      logger.info('QR global capturado via webhook');
    }
    return;
  }

  if (tipo === 'connection.update' || tipo === 'CONNECTION_UPDATE') {
    await atualizarEstadoBot(evento.data?.state);
    return;
  }

  if (tipo === 'messages.upsert' || tipo === 'MESSAGES_UPSERT') {
    await filaMensagens.add('mensagem', evento);
    return;
  }
}
