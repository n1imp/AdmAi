import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { gerarSegredo } from './crypto.js';
import * as evo from './evolution-client.js';

/**
 * Provider de WhatsApp ativo (env.WHATSAPP_PROVIDER). 'evolution' (padrão) usa a
 * Evolution API; 'cloud' usa a API oficial da Meta. O switch é aplicado nos pontos
 * de entrada usados pelo resto do app (envio e status), mantendo a Evolution como
 * caminho padrão e intocado. O módulo do provider 'cloud' é carregado sob demanda
 * (import dinâmico) — não pesa o caminho Evolution nem os testes que reimportam o gateway.
 */
export function provedorAtual() {
  return env.WHATSAPP_PROVIDER ?? 'evolution';
}

/**
 * Gateway WhatsApp do robô de NÚMERO ÚNICO sobre a Evolution API.
 *
 * Uma instância Evolution global (singleton ConexaoBot) atende todas as empresas;
 * o remetente é identificado pelo telefone (roteamento em inbound.js). Este módulo
 * é a ÚNICA porta de saída/conexão do app para o WhatsApp. O provider 'cloud' (Meta)
 * é selecionado pela flag WHATSAPP_PROVIDER e carregado sob demanda (import dinâmico).
 */

const EVENTOS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];

// Vars de ambiente obrigatórias para o gateway Evolution funcionar.
const ENV_OBRIGATORIAS = ['EVOLUTION_HOST', 'EVOLUTION_API_KEY', 'ENCRYPTION_KEY'];
// Recomendadas: sem elas o gateway sobe, mas o webhook inbound não chega.
const ENV_RECOMENDADAS = ['PUBLIC_URL'];

/**
 * Diagnóstico de configuração do servidor (NUNCA expõe valores — só os NOMES das
 * vars que faltam). Usado pelo painel para orientar o admin antes de tentar
 * conectar. Retorna { configIncompleta, faltando } onde `faltando` lista os nomes
 * das vars ausentes (obrigatórias + recomendadas).
 */
export function configWhatsappFaltando() {
  const faltando = [];
  for (const nome of [...ENV_OBRIGATORIAS, ...ENV_RECOMENDADAS]) {
    if (!env[nome]) faltando.push(nome);
  }
  // `configIncompleta` só considera as obrigatórias — sem elas não dá para conectar.
  const configIncompleta = ENV_OBRIGATORIAS.some((nome) => !env[nome]);
  return { configIncompleta, faltando };
}

/**
 * Extrai o QR (data URL/base64) de uma resposta da Evolution v2, tolerando as
 * várias formas em que ela aparece entre /instance/create e /instance/connect:
 *   { qrcode: { base64 } } | { qrcode: { code } } | { base64 } | { code } | { qr }
 * Retorna o data URL/base64 pronto para o <img src>, ou null.
 */
export function extrairQr(payload) {
  if (!payload) return null;
  const q = payload.qrcode ?? payload.qr ?? payload;
  const valor =
    q?.base64 ??
    q?.code ??
    (typeof q === 'string' ? q : null) ??
    payload.base64 ??
    payload.code ??
    null;
  return valor || null;
}

/**
 * Envio GLOBAL (modelo número único): a origem é a instância ÚNICA do robô; o
 * destino é o telefone/JID. Não depende de empresa.
 */
export async function enviarMensagem(numeroOuJid, texto) {
  if (provedorAtual() === 'cloud') {
    const cloud = await import('./cloud-gateway.js');
    if (typeof cloud.enviarMensagemCloudGlobal === 'function') {
      return cloud.enviarMensagemCloudGlobal(numeroOuJid, texto);
    }
    logger.warn('enviarMensagem: envio global Cloud ainda não implementado (use Evolution)');
    return null;
  }
  const c = await prisma.conexaoBot.findUnique({
    where: { id: 1 },
    select: { instanceName: true },
  });
  if (!c?.instanceName) {
    logger.warn('enviarMensagem: robô sem instância conectada');
    return null;
  }
  return evo.enviarTexto(c.instanceName, numeroOuJid, texto);
}

// ── CONEXÃO ÚNICA DO ROBÔ (modelo número único) ───────────────────────────────
// Uma instância Evolution global (nome = env.BOT_INSTANCE_NAME) atende todas as
// empresas. Estado/QR/segredo do webhook ficam no singleton ConexaoBot (id=1).

function webhookUrlBot(token = null) {
  const base = (env.PUBLIC_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, '');
  const url = `${base}/webhook/whatsapp`;
  return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

/** Carrega (ou cria) o singleton ConexaoBot, garantindo webhookSecret. */
export async function obterConexaoBot() {
  let c = await prisma.conexaoBot.findUnique({ where: { id: 1 } });
  if (!c) {
    c = await prisma.conexaoBot.create({ data: { id: 1, webhookSecret: gerarSegredo() } });
  } else if (!c.webhookSecret) {
    c = await prisma.conexaoBot.update({
      where: { id: 1 },
      data: { webhookSecret: gerarSegredo() },
    });
  }
  return c;
}

/** Provisiona a instância única do robô e devolve o QR para parear (super-admin). */
export async function conectarBot() {
  const c = await obterConexaoBot();
  const instanceName = c.instanceName ?? env.BOT_INSTANCE_NAME ?? 'admai-bot';
  const url = webhookUrlBot(c.webhookSecret);

  const criacao = await evo.criarInstancia({ instanceName, webhookUrl: url, eventos: EVENTOS });
  await prisma.conexaoBot.update({ where: { id: 1 }, data: { instanceName } });
  await evo.definirWebhook(instanceName, url, EVENTOS).catch(() => {});

  let qr = extrairQr(criacao);
  if (!qr) {
    const conn = await evo.conectarInstancia(instanceName);
    qr = extrairQr(conn);
  }
  let estado;
  if (qr) {
    estado = 'aguardando_qr';
  } else {
    const est = await evo.estadoConexao(instanceName);
    estado = mapearEstado(est?.instance?.state, false);
  }
  await prisma.conexaoBot.update({
    where: { id: 1 },
    data: { estadoConexao: estado, qrCode: qr ?? undefined },
  });
  return { instanceName, qr, estado };
}

/** Estado da conexão única do robô (+ diagnóstico de env) para o super-admin. */
export async function statusBot() {
  const diag = configWhatsappFaltando();
  if (diag.configIncompleta)
    return { estado: 'desconectado', qr: null, instanceName: null, ...diag };

  const c = await prisma.conexaoBot.findUnique({ where: { id: 1 } });
  if (!c?.instanceName) return { estado: 'desconectado', qr: null, instanceName: null, ...diag };

  const est = await evo.estadoConexao(c.instanceName);
  const aberto = est?.instance?.state === 'open';
  let qr = null;
  if (!aberto) {
    qr = c.qrCode ?? null;
    if (!qr) {
      const conn = await evo.conectarInstancia(c.instanceName).catch(() => null);
      qr = extrairQr(conn);
    }
  }
  const estado = mapearEstado(est?.instance?.state, !!qr);
  await prisma.conexaoBot
    .update({
      where: { id: 1 },
      data: { estadoConexao: estado, ...(aberto ? { qrCode: null } : {}) },
    })
    .catch(() => {});
  return { estado, qr, instanceName: c.instanceName, ...diag };
}

/** Desconecta o robô (deleta a instância única) e zera o estado. Idempotente. */
export async function desconectarBot() {
  const c = await prisma.conexaoBot.findUnique({ where: { id: 1 } });
  if (c?.instanceName) {
    await evo
      .deletarInstancia(c.instanceName)
      .catch((e) =>
        logger.warn('desconectarBot: falha ao deletar instância (ignorado)', { erro: e.message })
      );
  }
  await prisma.conexaoBot
    .update({
      where: { id: 1 },
      data: { estadoConexao: 'desconectado', instanceName: null },
    })
    .catch(() => {});
  return { estado: 'desconectado' };
}

/** webhookSecret do robô (claro) — usado na verificação HMAC/token do webhook global. */
export async function segredoWebhookBot() {
  const c = await prisma.conexaoBot.findUnique({
    where: { id: 1 },
    select: { webhookSecret: true },
  });
  return c?.webhookSecret ?? null;
}

/** Persiste o QR recebido via webhook QRCODE_UPDATED (robô). */
export async function salvarQrBot(qr) {
  if (!qr) return;
  await prisma.conexaoBot
    .update({
      where: { id: 1 },
      data: { qrCode: qr, estadoConexao: 'aguardando_qr' },
    })
    .catch(() => {});
}

/** Atualiza o estado do robô a partir do webhook CONNECTION_UPDATE. */
export async function atualizarEstadoBot(state) {
  const mapa = { open: 'conectado', connecting: 'conectando', close: 'desconectado' };
  const estado = mapa[state] ?? 'desconectado';
  await prisma.conexaoBot
    .update({
      where: { id: 1 },
      data: { estadoConexao: estado, ...(estado === 'conectado' ? { qrCode: null } : {}) },
    })
    .catch(() => {});
}

/**
 * Mapeia o state da Evolution para o vocabulário do painel.
 *
 * Quando há um QR disponível e a instância ainda não está 'open', o painel deve
 * mostrar a tela de leitura do QR — por isso reportamos 'aguardando_qr' em vez de
 * 'desconectado'. 'connecting' continua 'conectando' e 'open' continua 'conectado'.
 *
 * @param {string|undefined|null} state  state cru da Evolution ('open'|'connecting'|'close').
 * @param {boolean} [temQr=false]         há QR disponível para leitura?
 */
export function mapearEstado(state, temQr = false) {
  if (state === 'open') return 'conectado';
  if (state === 'connecting') return 'conectando';
  // 'close' / undefined / null: se há QR aguardando leitura, é 'aguardando_qr'.
  return temQr ? 'aguardando_qr' : 'desconectado';
}
