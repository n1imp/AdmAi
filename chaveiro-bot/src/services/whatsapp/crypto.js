import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

/**
 * Criptografia simétrica para segredos por-empresa em repouso
 * (api key da instância Evolution e webhookSecret).
 *
 * Usa AES-256-GCM. A chave deriva de env.ENCRYPTION_KEY via SHA-256, então
 * qualquer string suficientemente longa serve como master key. O resultado é
 * "iv:authTag:ciphertext" em base64, seguro para gravar em coluna de texto.
 */

const ALG = 'aes-256-gcm';
// Tag de autenticação do GCM: SEMPRE 128 bits (16 bytes). Fixar isso no cipher e no
// decipher faz o Node REJEITAR uma tag mais curta no setAuthTag — sem isso, um atacante
// poderia forjar ciphertext com tag truncada (CWE-310). Ver sg.run/NbGG1.
const TAG_BYTES = 16;

function chave() {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY ausente — defina no .env para cifrar segredos do WhatsApp');
  }
  // Normaliza qualquer comprimento para 32 bytes (256 bits)
  return crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();
}

/** Cifra um texto. Retorna null se a entrada for vazia/null. */
export function encrypt(texto) {
  if (texto == null || texto === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, chave(), iv, { authTagLength: TAG_BYTES });
  const ct = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/**
 * Decifra um texto produzido por encrypt(). Retorna null se entrada vazia, mal
 * formada, ou se a decifragem falhar (chave rotacionada/tampering) — em vez de
 * lançar, para que o chamador trate graciosamente sem derrubar a requisição (500).
 */
export function decrypt(blob) {
  if (blob == null || blob === '') return null;
  try {
    const [ivB64, tagB64, ctB64] = String(blob).split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const tag = Buffer.from(tagB64, 'base64');
    // Rejeita tag fora dos 128 bits ANTES de decifrar (defesa explícita contra truncamento;
    // o authTagLength abaixo também força isso no setAuthTag).
    if (tag.length !== TAG_BYTES) return null;
    const decipher = crypto.createDecipheriv(ALG, chave(), Buffer.from(ivB64, 'base64'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch (erro) {
    // Falha real de decifragem (auth tag/chave rotacionada/tampering): observabilidade
    // sem derrubar a requisição. Não loga o blob (poderia conter ciphertext sensível).
    logger.warn('decrypt_falhou', { motivo: erro.message });
    return null;
  }
}

/** Gera um segredo aleatório (para webhookSecret). */
export function gerarSegredo(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Verificação HMAC de webhook em tempo constante.
 * @param {string} payloadRaw  Corpo cru da requisição (string).
 * @param {string} assinatura  Header recebido (hex).
 * @param {string} segredo     webhookSecret em claro (já decifrado).
 */
export function verificarHmac(payloadRaw, assinatura, segredo) {
  if (!assinatura || !segredo) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(payloadRaw).digest('hex');
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Compara um token recebido com o segredo em tempo constante (anti-timing).
 * Substitui o `===`, que vaza o tamanho/posição do mismatch.
 * @param {string} recebido  Token enviado pelo cliente (header).
 * @param {string} segredo   Segredo esperado em claro.
 */
export function compararToken(recebido, segredo) {
  if (!recebido || !segredo) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
