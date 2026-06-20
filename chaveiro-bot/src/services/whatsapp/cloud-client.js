import axios from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Cliente REST da WhatsApp Cloud API (Meta Graph API).
 *
 * Diferente da Evolution (multi-instância com apikey global), a Cloud API autentica
 * por um access token POR EMPRESA (System User token, cifrado em repouso) e envia
 * mensagens para o endpoint do número (`phoneNumberId`). Por isso cada chamada
 * recebe `{ phoneNumberId, accessToken }` — não há estado global aqui.
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

const GRAPH = 'https://graph.facebook.com';

function http(accessToken) {
  if (!accessToken) throw new Error('accessToken ausente para a WhatsApp Cloud API');
  return axios.create({
    baseURL: `${GRAPH}/${env.WHATSAPP_API_VERSION}`,
    timeout: 20000,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
}

function tratarErro(contexto, erro) {
  const status = erro.response?.status;
  const corpo = erro.response?.data;
  logger.error(`WhatsApp Cloud API erro (${contexto})`, {
    status,
    corpo: typeof corpo === 'object' ? JSON.stringify(corpo).slice(0, 300) : corpo,
  });
  const e = new Error(`WhatsApp Cloud API falhou: ${contexto}`);
  e.status = status;
  e.detalhe = corpo;
  throw e;
}

/**
 * Envia uma mensagem de texto livre. Só funciona DENTRO da janela de atendimento
 * de 24h (após o cliente ter mandado mensagem). Fora dela, use enviarTemplate.
 * @param {object} p
 * @param {string} p.phoneNumberId  ID do número de origem (Cloud API)
 * @param {string} p.accessToken    token de acesso (já decifrado)
 * @param {string} p.to             destino em E.164 sem '+' (ex.: 5511999999999)
 * @param {string} p.texto          corpo da mensagem
 */
export async function enviarTexto({ phoneNumberId, accessToken, to, texto }) {
  try {
    const { data } = await http(accessToken).post(`/${encodeURIComponent(phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: texto },
    });
    return data;
  } catch (erro) {
    tratarErro('enviarTexto', erro);
  }
}

/**
 * Envia uma mensagem de TEMPLATE aprovado (necessário para iniciar conversa ou
 * enviar fora da janela de 24h — ex.: solicitação de avaliação, resumo).
 * @param {object} p
 * @param {string} p.phoneNumberId
 * @param {string} p.accessToken
 * @param {string} p.to
 * @param {string} p.template   nome do template aprovado na Meta
 * @param {string} [p.idioma]   código do idioma (default 'pt_BR')
 * @param {object[]} [p.componentes]  components (variáveis/botões) do template
 */
export async function enviarTemplate({ phoneNumberId, accessToken, to, template, idioma = 'pt_BR', componentes }) {
  try {
    const { data } = await http(accessToken).post(`/${encodeURIComponent(phoneNumberId)}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: template,
        language: { code: idioma },
        ...(componentes ? { components: componentes } : {}),
      },
    });
    return data;
  } catch (erro) {
    tratarErro('enviarTemplate', erro);
  }
}
