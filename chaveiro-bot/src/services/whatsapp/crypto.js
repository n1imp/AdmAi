import crypto from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Criptografia simétrica para segredos por-empresa em repouso
 * (api key da instância Evolution e webhookSecret).
 *
 * Usa AES-256-GCM. A chave deriva de env.ENCRYPTION_KEY via SHA-256, então
 * qualquer string suficientemente longa serve como master key. O resultado é
 * "iv:authTag:ciphertext" em base64, seguro para gravar em coluna de texto.
 */

const ALG = 'aes-256-gcm';

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
  const cipher = crypto.createCipheriv(ALG, chave(), iv);
  const ct = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** Decifra um texto produzido por encrypt(). Retorna null se entrada vazia. */
export function decrypt(blob) {
  if (blob == null || blob === '') return null;
  const [ivB64, tagB64, ctB64] = String(blob).split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Formato de segredo cifrado inválido');
  const decipher = crypto.createDecipheriv(ALG, chave(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
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
