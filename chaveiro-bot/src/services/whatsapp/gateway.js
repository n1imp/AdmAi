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
  if (!qr) {
    const conn = await evo.conectarInstancia(instanceName);
    qr = conn?.base64 ?? conn?.qrcode?.base64 ?? null;
  }
  // Com QR → 'aguardando_qr'. Sem QR → mapeia o estado real da conexão.
  let estado;
  if (qr) {
    estado = 'aguardando_qr';
  } else {
    const est = await evo.estadoConexao(instanceName);
    estado = mapearEstado(est?.instance?.state, false);
  }

  await prisma.empresaWhatsapp.update({ where: { empresaId }, data: { estadoConexao: estado } });
  return { instanceName, qr, estado };
}

/**
 * Estado atual + QR (se aguardando) para o painel, já incluindo o diagnóstico de
 * configuração do servidor. Quando a config está incompleta (faltam vars
 * obrigatórias), NÃO tentamos falar com a Evolution — devolvemos 'desconectado'
 * + o diagnóstico para o painel orientar o admin.
 */
export async function statusConexao(empresaId) {
  const diag = configWhatsappFaltando();
  if (diag.configIncompleta) {
    return { estado: 'desconectado', qr: null, instanceName: null, ...diag };
  }

  const cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });
  if (!cfg?.instanceName) {
    return { estado: 'desconectado', qr: null, instanceName: null, ...diag };
  }

  const est = await evo.estadoConexao(cfg.instanceName);
  let qr = null;
  if (est?.instance?.state !== 'open') {
    const conn = await evo.conectarInstancia(cfg.instanceName).catch(() => null);
    qr = conn?.base64 ?? conn?.qrcode?.base64 ?? null;
  }
  const estado = mapearEstado(est?.instance?.state, !!qr);
  await prisma.empresaWhatsapp.update({ where: { empresaId }, data: { estadoConexao: estado } }).catch(() => {});
  return { estado, qr, instanceName: cfg.instanceName, ...diag };
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

/**
 * Desconecta a empresa do WhatsApp: deleta a instância na Evolution (tolerante a
 * 404 / instância inexistente) e zera o estado local (estadoConexao='desconectado',
 * instanceName=null). Idempotente — chamar sem instância também devolve desconectado.
 * @returns {Promise<{ estado: 'desconectado' }>}
 */
export async function desconectar(empresaId) {
  const cfg = await prisma.empresaWhatsapp.findUnique({ where: { empresaId } });

  if (cfg?.instanceName) {
    // deletarInstancia já é tolerante a 404; protegemos contra Evolution fora do ar
    // para não impedir o reset local do estado.
    await evo.deletarInstancia(cfg.instanceName).catch((e) =>
      logger.warn('desconectar: falha ao deletar instância Evolution (ignorado)', {
        empresaId,
        erro: e.message,
      })
    );
  }

  await prisma.empresaWhatsapp.update({
    where: { empresaId },
    data: { estadoConexao: 'desconectado', instanceName: null },
  }).catch(() => {});

  return { estado: 'desconectado' };
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
