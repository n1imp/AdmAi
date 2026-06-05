import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { encrypt, gerarSegredo } from './crypto.js';
import * as evo from './evolution-client.js';

/**
 * Gateway WhatsApp multi-tenant sobre a Evolution API.
 *
 * Cada empresa tem UMA instância Evolution (1 número/QR). A config fica em
 * EmpresaWhatsapp (instanceName, apiKeyEnc, webhookSecret, grupoJid, etc.).
 * Este módulo é a ÚNICA porta de entrada do app para o WhatsApp — substitui o
 * antigo socket Baileys global.
 */

// Nome determinístico da instância a partir da empresa.
function nomeInstancia(empresaId) {
  return `empresa-${empresaId}`;
}

// URL pública do webhook desta empresa (Evolution chama de volta aqui).
function webhookUrl(empresaId) {
  const base = (env.PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
  return `${base}/webhook/whatsapp/${empresaId}`;
}

const EVENTOS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];

/** Carrega (ou cria) a linha EmpresaWhatsapp da empresa, garantindo webhookSecret. */
export async function obterConfig(empresaId) {
  let cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });
  if (!cfg) {
    cfg = await prisma.empresaWhatsapp.create({
      data: { empresaId, webhookSecret: gerarSegredo() },
    });
  } else if (!cfg.webhookSecret) {
    cfg = await prisma.empresaWhatsapp.update({
      where: { empresaId },
      data: { webhookSecret: gerarSegredo() },
    });
  }
  return cfg;
}

/**
 * Provisiona a instância da empresa (cria no Evolution se preciso), define o
 * webhook e retorna o QR para o painel exibir.
 * @returns {Promise<{ instanceName, qr: string|null, estado: string }>}
 */
export async function provisionarEConectar(empresaId) {
  const cfg = await obterConfig(empresaId);
  const instanceName = cfg.instanceName ?? nomeInstancia(empresaId);

  // Cria a instância (idempotente) já com o webhook apontado para cá.
  const criacao = await evo.criarInstancia({
    instanceName,
    webhookUrl: webhookUrl(empresaId),
    eventos: EVENTOS,
  });

  // Persiste instanceName e a apikey da instância (cifrada), se vier.
  const hash = criacao?.hash?.apikey ?? criacao?.hash ?? null;
  await prisma.empresaWhatsapp.update({
    where: { empresaId },
    data: {
      instanceName,
      ...(hash ? { apiKeyEnc: encrypt(hash) } : {}),
    },
  });

  // Garante o webhook mesmo quando a instância já existia.
  await evo.definirWebhook(instanceName, webhookUrl(empresaId), EVENTOS).catch(() => {});

  // Tenta extrair o QR já da criação; senão, chama connect.
  let qr = criacao?.qrcode?.base64 ?? null;
  let estado = 'aguardando_qr';
  if (!qr) {
    const conn = await evo.conectarInstancia(instanceName);
    qr = conn?.base64 ?? conn?.qrcode?.base64 ?? null;
  }
  if (!qr) {
    const est = await evo.estadoConexao(instanceName);
    estado = mapearEstado(est?.instance?.state);
  }

  await prisma.empresaWhatsapp.update({ where: { empresaId }, data: { estadoConexao: estado } });
  return { instanceName, qr, estado };
}

/** Estado atual + QR (se aguardando) para o painel. */
export async function statusConexao(empresaId) {
  const cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });
  if (!cfg?.instanceName) return { estado: 'desconectado', qr: null, instanceName: null };

  const est = await evo.estadoConexao(cfg.instanceName);
  const estado = mapearEstado(est?.instance?.state);
  let qr = null;
  if (estado !== 'conectado') {
    const conn = await evo.conectarInstancia(cfg.instanceName).catch(() => null);
    qr = conn?.base64 ?? conn?.qrcode?.base64 ?? null;
  }
  await prisma.empresaWhatsapp.update({ where: { empresaId }, data: { estadoConexao: estado } }).catch(() => {});
  return { estado, qr, instanceName: cfg.instanceName };
}

/** Lista os grupos da instância da empresa (para escolher o grupo de resumo). */
export async function listarGrupos(empresaId) {
  const cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });
  if (!cfg?.instanceName) throw new Error('WhatsApp não conectado');
  return evo.listarGrupos(cfg.instanceName);
}

/**
 * Envia uma mensagem de texto pela instância da empresa.
 * Esta é a substituta de `enviarMensagem(jid, texto)` — agora SEMPRE por-empresa.
 */
export async function enviarMensagemEmpresa(empresaId, numeroOuJid, texto) {
  const cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });
  if (!cfg?.instanceName) {
    logger.warn('enviarMensagemEmpresa: empresa sem instância', { empresaId });
    return null;
  }
  return evo.enviarTexto(cfg.instanceName, numeroOuJid, texto);
}

/** Atualiza o grupo escolhido para receber o resumo dos serviços. */
export async function definirGrupo(empresaId, grupoJid) {
  return prisma.empresaWhatsapp.update({ where: { empresaId }, data: { grupoJid } });
}

/** Retorna o webhookSecret em claro (decifrado) — usado na verificação HMAC. */
export async function segredoWebhook(empresaId) {
  const cfg = await prisma.empresaWhatsapp.findUnique({
    where: { empresaId },
    select: { webhookSecret: true },
  });
  return cfg?.webhookSecret ?? null;
}

// Mapeia o state da Evolution para o vocabulário do painel.
function mapearEstado(state) {
  switch (state) {
    case 'open': return 'conectado';
    case 'connecting': return 'conectando';
    case 'close':
    case undefined:
    case null: return 'desconectado';
    default: return 'desconectado';
  }
}
