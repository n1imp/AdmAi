import { Router, raw } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { requireAuth } from './api.js';
import { verificarHmac } from '../services/whatsapp/crypto.js';
import {
  provisionarEConectar,
  statusConexao,
  listarGrupos,
  definirGrupo,
  desconectar,
  segredoWebhook,
} from '../services/whatsapp/gateway.js';
import { rotearMensagemInbound } from '../services/inbound.js';

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

// ── PAINEL (autenticado, escopado pela empresa do usuário) ────────────────────

// GET /api/whatsapp/status — estado + QR (se aguardando) da instância da empresa
whatsappRouter.get('/api/whatsapp/status', requireAuth, async (req, res) => {
  try {
    const status = await statusConexao(req.user.empresaId);
    res.json(status);
  } catch (erro) {
    logger.error('Erro GET /whatsapp/status', { erro: erro.message });
    res.status(500).json({ erro: mensagemErro(erro) });
  }
});

// POST /api/whatsapp/conectar — provisiona a instância e devolve o QR
whatsappRouter.post('/api/whatsapp/conectar', requireAuth, async (req, res) => {
  try {
    const r = await provisionarEConectar(req.user.empresaId);
    res.json(r);
  } catch (erro) {
    logger.error('Erro POST /whatsapp/conectar', { erro: erro.message });
    // Config ausente no servidor → 500 (admin precisa configurar o .env).
    // Falha de comunicação com a Evolution → 502 (gateway upstream).
    const msg = String(erro?.message ?? '');
    const ehConfig = /ENCRYPTION_KEY|EVOLUTION_HOST|EVOLUTION_API_KEY/.test(msg);
    res.status(ehConfig ? 500 : 502).json({ erro: mensagemErro(erro) });
  }
});

// POST /api/whatsapp/desconectar — deleta a instância e zera o estado da empresa
whatsappRouter.post('/api/whatsapp/desconectar', requireAuth, async (req, res) => {
  try {
    const r = await desconectar(req.user.empresaId);
    res.json(r);
  } catch (erro) {
    logger.error('Erro POST /whatsapp/desconectar', { erro: erro.message });
    res.status(500).json({ erro: mensagemErro(erro) });
  }
});

// GET /api/whatsapp/grupos — lista grupos da instância (para escolher o de resumo)
whatsappRouter.get('/api/whatsapp/grupos', requireAuth, async (req, res) => {
  try {
    const grupos = await listarGrupos(req.user.empresaId);
    res.json(grupos.sort((a, b) => a.nome.localeCompare(b.nome)));
  } catch (erro) {
    if (erro.message === 'WhatsApp não conectado') return res.status(503).json({ erro: erro.message });
    logger.error('Erro GET /whatsapp/grupos', { erro: erro.message });
    res.status(500).json({ erro: mensagemErro(erro) });
  }
});

// GET /api/whatsapp/config — config visível no painel (sem segredos)
whatsappRouter.get('/api/whatsapp/config', requireAuth, async (req, res) => {
  try {
    const cfg = await prisma.empresaWhatsapp.findUnique({
      where: { empresaId: req.user.empresaId },
      select: {
        instanceName: true, numeroDisplay: true, estadoConexao: true,
        grupoJid: true, reviewDelayHoras: true, reviewLink: true,
      },
    });
    res.json(cfg ?? {});
  } catch (erro) {
    logger.error('Erro GET /whatsapp/config', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/whatsapp/config — grupo de resumo, link/atraso de avaliação, número exibido
whatsappRouter.patch('/api/whatsapp/config', requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      grupoJid: z.string().optional().nullable(),
      reviewDelayHoras: z.number().int().min(0).max(168).optional(),
      reviewLink: z.string().url().optional().nullable().or(z.literal('')),
      numeroDisplay: z.string().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const data = { ...parse.data };
    if (data.reviewLink === '') data.reviewLink = null;

    if (data.grupoJid !== undefined) {
      await definirGrupo(req.user.empresaId, data.grupoJid);
      delete data.grupoJid;
    }
    if (Object.keys(data).length > 0) {
      await prisma.empresaWhatsapp.update({ where: { empresaId: req.user.empresaId }, data });
    }
    const cfg = await prisma.empresaWhatsapp.findUnique({
      where: { empresaId: req.user.empresaId },
      select: { instanceName: true, numeroDisplay: true, estadoConexao: true, grupoJid: true, reviewDelayHoras: true, reviewLink: true },
    });
    res.json(cfg);
  } catch (erro) {
    logger.error('Erro PATCH /whatsapp/config', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── WEBHOOK INBOUND (público, autenticado por HMAC por-empresa) ───────────────
// Evolution chama POST /webhook/whatsapp/:empresaId com os eventos da instância.
// Usamos raw body para validar a assinatura HMAC antes de confiar no payload.

const eventoSchema = z.object({
  event: z.string().optional(),
  instance: z.string().optional(),
  data: z.any().optional(),
}).passthrough();

whatsappRouter.post(
  '/webhook/whatsapp/:empresaId',
  raw({ type: '*/*', limit: '5mb' }),
  async (req, res) => {
    const empresaId = parseInt(req.params.empresaId);
    if (isNaN(empresaId)) return res.status(400).json({ erro: 'empresaId inválido' });

    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';

    try {
      // 1) Verifica HMAC (header configurável; Evolution assina o corpo).
      const segredo = await segredoWebhook(empresaId);
      const assinatura = req.get('x-hub-signature-256') || req.get('x-webhook-signature') || '';
      // Em ambiente onde a Evolution não assina, exigimos o segredo via header simples.
      const tokenHeader = req.get('x-webhook-token') || '';
      const hmacOk = verificarHmac(rawBody, assinatura, segredo);
      const tokenOk = !!segredo && tokenHeader === segredo;
      if (!hmacOk && !tokenOk) {
        logger.warn('Webhook WhatsApp rejeitado (assinatura inválida)', { empresaId });
        return res.status(401).json({ erro: 'Assinatura inválida' });
      }

      // 2) Valida o shape do payload.
      let json;
      try { json = JSON.parse(rawBody); } catch { return res.status(400).json({ erro: 'JSON inválido' }); }
      const parse = eventoSchema.safeParse(json);
      if (!parse.success) return res.status(400).json({ erro: 'Payload inválido' });

      // 3) Responde rápido (Evolution espera 2xx) e processa de forma assíncrona.
      res.status(200).json({ ok: true });

      // 4) Roteamento do evento. A máquina de conversa (Fase 3) consome aqui.
      processarEventoInbound(empresaId, parse.data).catch((e) =>
        logger.error('Erro ao processar evento inbound', { empresaId, erro: e.message })
      );
    } catch (erro) {
      logger.error('Erro no webhook WhatsApp', { empresaId, erro: erro.message });
      if (!res.headersSent) res.status(500).json({ erro: 'Erro interno' });
    }
  }
);

/**
 * Processa um evento inbound da Evolution para a empresa.
 * Fase 2: identifica o tipo e registra. Fase 3 conecta a máquina de conversa
 * (mensagens privadas de técnico → fluxo de registro) e a captura de avaliação.
 */
async function processarEventoInbound(empresaId, evento) {
  const tipo = evento.event ?? 'desconhecido';
  logger.info('Webhook inbound recebido', { empresaId, tipo });

  if (tipo === 'connection.update' || tipo === 'CONNECTION_UPDATE') {
    const state = evento.data?.state;
    const mapa = { open: 'conectado', connecting: 'conectando', close: 'desconectado' };
    await prisma.empresaWhatsapp.update({
      where: { empresaId },
      data: { estadoConexao: mapa[state] ?? 'desconectado' },
    }).catch(() => {});
    return;
  }

  // MESSAGES_UPSERT → fluxo de conversa privada (registro de serviço).
  if (tipo === 'messages.upsert' || tipo === 'MESSAGES_UPSERT') {
    await rotearMensagemInbound(empresaId, evento).catch((e) =>
      logger.error('Erro no roteamento da conversa', { empresaId, erro: e.message })
    );
    return;
  }
}
