import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { encrypt, decrypt } from './crypto.js';
import * as cloud from './cloud-client.js';

/**
 * Gateway WhatsApp por-empresa sobre a Cloud API oficial (Meta).
 *
 * Espelha a interface da parte Evolution do gateway.js para que o switch de
 * provider (em gateway.js) seja transparente para o resto do app:
 *   - enviarMensagemEmpresaCloud(empresaId, to, texto)
 *   - statusConexaoCloud(empresaId)
 * Mais o necessário ao painel/webhook:
 *   - salvarCredenciaisCloud(empresaId, { phoneNumberId, wabaId, accessToken })
 *   - normalizarInboundCloud(body)  → eventos no shape Evolution (reusa inbound.js)
 */

// Vars de ambiente obrigatórias para o provider Cloud funcionar.
const ENV_OBRIGATORIAS = ['META_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'ENCRYPTION_KEY'];
// Recomendadas: sem elas o provider sobe, mas o webhook inbound não chega.
const ENV_RECOMENDADAS = ['PUBLIC_URL'];

/** Diagnóstico de configuração do servidor (só os NOMES das vars ausentes). */
export function configCloudFaltando() {
  const faltando = [];
  for (const nome of [...ENV_OBRIGATORIAS, ...ENV_RECOMENDADAS]) {
    if (!env[nome]) faltando.push(nome);
  }
  const configIncompleta = ENV_OBRIGATORIAS.some((nome) => !env[nome]);
  return { configIncompleta, faltando };
}

/** Normaliza um destino ('5511...@s.whatsapp.net' | '+55 11 9...' ) para só dígitos. */
export function soDigitos(to) {
  return String(to ?? '')
    .replace(/@.*/, '')
    .replace(/\D/g, '');
}

/**
 * Persiste as credenciais Cloud da empresa (token cifrado em repouso) e marca o
 * provider como 'cloud'. Idempotente (upsert).
 */
export async function salvarCredenciaisCloud(empresaId, { phoneNumberId, wabaId, accessToken }) {
  await prisma.empresaWhatsapp.upsert({
    where: { empresaId },
    create: {
      empresaId,
      provider: 'cloud',
      phoneNumberId,
      wabaId: wabaId ?? null,
      accessTokenEnc: encrypt(accessToken),
    },
    update: {
      provider: 'cloud',
      phoneNumberId,
      ...(wabaId !== undefined ? { wabaId } : {}),
      ...(accessToken ? { accessTokenEnc: encrypt(accessToken) } : {}),
    },
  });
  return { ok: true };
}

/** Estado da conexão Cloud para o painel (conectado = tem número + token salvos). */
export async function statusConexaoCloud(empresaId) {
  const diag = configCloudFaltando();
  const cfg = await prisma.empresaWhatsapp.findUnique({
    where: { empresaId },
    select: { phoneNumberId: true, accessTokenEnc: true },
  });
  const conectado = !!(cfg?.phoneNumberId && cfg?.accessTokenEnc);
  return {
    estado: conectado ? 'conectado' : 'desconectado',
    qr: null,
    instanceName: null,
    provider: 'cloud',
    numeroDisplay: null, // coluna removida do EmpresaWhatsapp (modelo número único)
    ...diag,
  };
}

/**
 * Envia texto por empresa pela Cloud API (provider 'cloud').
 * IMPORTANTE: a Cloud API NÃO envia para grupos (@g.us) — nesses casos ignora com
 * log (o resumo em grupo precisará de outra estratégia no provider cloud).
 */
export async function enviarMensagemEmpresaCloud(empresaId, to, texto) {
  if (String(to).endsWith('@g.us')) {
    logger.warn('enviarMensagemEmpresaCloud: envio a grupo não suportado na Cloud API (ignorado)', {
      empresaId,
    });
    return null;
  }
  const cfg = await prisma.empresaWhatsapp.findUnique({
    where: { empresaId },
    select: { phoneNumberId: true, accessTokenEnc: true },
  });
  if (!cfg?.phoneNumberId || !cfg?.accessTokenEnc) {
    logger.warn('enviarMensagemEmpresaCloud: empresa sem credenciais Cloud', { empresaId });
    return null;
  }
  const accessToken = decrypt(cfg.accessTokenEnc);
  if (!accessToken) {
    logger.warn('enviarMensagemEmpresaCloud: access token ilegível (ENCRYPTION_KEY rotacionada?)', {
      empresaId,
    });
    return null;
  }
  return cloud.enviarTexto({
    phoneNumberId: cfg.phoneNumberId,
    accessToken,
    to: soDigitos(to),
    texto,
  });
}

/**
 * Converte o payload do webhook da Cloud API em uma lista de eventos no shape
 * Evolution v2 ({ event:'MESSAGES_UPSERT', data:{ key, message } }), para reusar
 * `rotearMensagemInbound`/`extrairMensagem` sem alterar inbound.js/conversa.js.
 *
 * Observações:
 *  - O `from` da Meta é o número do cliente (E.164 sem '+'); montamos um remoteJid
 *    '<num>@s.whatsapp.net' para casar com a normalização existente.
 *  - Imagens vêm como media id (exigem download via Graph + token) — ainda NÃO
 *    tratadas aqui (TODO ao finalizar a migração); somente texto por enquanto.
 *  - Eventos de status (sent/delivered/read) e não-mensagens são ignorados.
 */
export function normalizarInboundCloud(body) {
  const eventos = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const ch of changes) {
      const mensagens = Array.isArray(ch?.value?.messages) ? ch.value.messages : [];
      for (const m of mensagens) {
        const from = soDigitos(m.from);
        if (!from) continue;
        const texto = (
          m.text?.body ||
          m.button?.text ||
          m.interactive?.list_reply?.title ||
          m.interactive?.button_reply?.title ||
          ''
        ).trim();
        eventos.push({
          event: 'MESSAGES_UPSERT',
          data: {
            key: { remoteJid: `${from}@s.whatsapp.net`, fromMe: false },
            message: { conversation: texto },
          },
        });
      }
    }
  }
  return eventos;
}
