import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Cliente REST da Evolution API (v2).
 *
 * Multi-instância: cada empresa tem UMA instância (nome único). A autenticação
 * usa a API key GLOBAL do servidor Evolution (header `apikey`), definida em
 * env.EVOLUTION_API_KEY. As operações por-instância recebem o nome da instância.
 *
 * Docs Evolution v2: https://doc.evolution-api.com/
 */

function http() {
  if (!env.EVOLUTION_HOST) throw new Error('EVOLUTION_HOST ausente no .env');
  if (!env.EVOLUTION_API_KEY) throw new Error('EVOLUTION_API_KEY ausente no .env');
  return axios.create({
    baseURL: env.EVOLUTION_HOST.replace(/\/+$/, ''),
    timeout: 20000,
    headers: { apikey: env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
  });
}

function tratarErro(contexto, erro) {
  const status = erro.response?.status;
  const corpo = erro.response?.data;
  logger.error(`Evolution API erro (${contexto})`, {
    status,
    corpo: typeof corpo === 'object' ? JSON.stringify(corpo).slice(0, 300) : corpo,
  });
  const e = new Error(`Evolution API falhou: ${contexto}`);
  e.status = status;
  e.detalhe = corpo;
  throw e;
}

/**
 * Cria uma instância Evolution. Em v2, retorna o objeto da instância incluindo
 * o hash/apikey da instância. Configura o webhook por-instância na criação.
 *
 * @param {object} p
 * @param {string} p.instanceName  Nome único (ex.: "empresa-7")
 * @param {string} p.webhookUrl    URL do webhook (POST) para eventos inbound
 * @param {string[]} [p.eventos]   Eventos a assinar
 * @returns {Promise<{instance:object, hash:string, qrcode?:object}>}
 */
export async function criarInstancia({ instanceName, webhookUrl, eventos }) {
  try {
    const { data } = await http().post('/instance/create', {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: webhookUrl
        ? {
            url: webhookUrl,
            byEvents: false,
            base64: true,
            events: eventos ?? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
          }
        : undefined,
    });
    return data;
  } catch (erro) {
    // 403/409 costuma significar instância já existente — não é fatal
    if (erro.response?.status === 403 || erro.response?.status === 409) {
      logger.warn('Instância Evolution já existe', { instanceName });
      return { instance: { instanceName }, jaExiste: true };
    }
    tratarErro('criarInstancia', erro);
  }
}

/** Inicia conexão / obtém QR code de uma instância. Retorna { base64?, code?, pairingCode? }. */
export async function conectarInstancia(instanceName) {
  try {
    const { data } = await http().get(`/instance/connect/${encodeURIComponent(instanceName)}`);
    return data;
  } catch (erro) {
    tratarErro('conectarInstancia', erro);
  }
}

/** Estado da conexão: { instance: { state: 'open'|'connecting'|'close' } }. */
export async function estadoConexao(instanceName) {
  try {
    const { data } = await http().get(
      `/instance/connectionState/${encodeURIComponent(instanceName)}`
    );
    return data;
  } catch (erro) {
    if (erro.response?.status === 404) return { instance: { state: 'close' }, naoExiste: true };
    tratarErro('estadoConexao', erro);
  }
}

/** Define/atualiza o webhook de uma instância existente. */
export async function definirWebhook(instanceName, webhookUrl, eventos) {
  try {
    const { data } = await http().post(`/webhook/set/${encodeURIComponent(instanceName)}`, {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: eventos ?? ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    });
    return data;
  } catch (erro) {
    tratarErro('definirWebhook', erro);
  }
}

/** Lista os grupos dos quais a instância participa. */
export async function listarGrupos(instanceName) {
  try {
    const { data } = await http().get(`/group/fetchAllGroups/${encodeURIComponent(instanceName)}`, {
      params: { getParticipants: 'false' },
    });
    const arr = Array.isArray(data) ? data : (data?.groups ?? []);
    return arr.map((g) => ({
      id: g.id,
      nome: g.subject ?? g.name ?? g.id,
      participantes: g.size ?? g.participants?.length ?? 0,
    }));
  } catch (erro) {
    tratarErro('listarGrupos', erro);
  }
}

/** Envia uma mensagem de texto por uma instância. */
export async function enviarTexto(instanceName, numeroOuJid, texto) {
  try {
    const { data } = await http().post(`/message/sendText/${encodeURIComponent(instanceName)}`, {
      number: numeroOuJid,
      text: texto,
    });
    return data;
  } catch (erro) {
    tratarErro('enviarTexto', erro);
  }
}

/** Remove (loga out + deleta) uma instância. Tolerante a 404. */
export async function deletarInstancia(instanceName) {
  try {
    await http()
      .delete(`/instance/logout/${encodeURIComponent(instanceName)}`)
      .catch(() => {});
    const { data } = await http().delete(`/instance/delete/${encodeURIComponent(instanceName)}`);
    return data;
  } catch (erro) {
    if (erro.response?.status === 404) return { naoExiste: true };
    tratarErro('deletarInstancia', erro);
  }
}
