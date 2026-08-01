// @ts-check
import { generateSecret, generateURI, verify } from 'otplib';
import { encrypt, decrypt } from './whatsapp/crypto.js';

/**
 * 2FA TOTP (Time-based One-Time Password) — app autenticador + códigos de 6 dígitos,
 * compatível com Google Authenticator / Authy / 1Password (RFC 6238).
 *
 * O segredo é guardado CIFRADO em repouso (reutiliza a cifra AES-256-GCM do
 * módulo whatsapp/crypto). Este módulo é a única porta de entrada do app para o
 * otplib — concentra a geração do segredo, da URI otpauth e a verificação do código.
 *
 * Janela de tolerância de 30s (uma "step") absorve a defasagem de relógio entre o
 * servidor e o celular do usuário, padrão dos apps autenticadores.
 */

const EMISSOR = 'AdmAi';
const TOLERANCIA_SEGUNDOS = 30; // ±1 step de 30s para defasagem de relógio

/** Gera um novo segredo TOTP em Base32 (compatível com apps autenticadores). */
export function gerarSegredoTotp() {
  return generateSecret();
}

/**
 * Monta a URI otpauth:// para o QR (emissor "AdmAi", label = username).
 * @param {string} secret Segredo TOTP em Base32 (em claro).
 * @param {string} label  Identificação exibida no app autenticador.
 * @returns {string}
 */
export function montarOtpauthUrl(secret, label) {
  return generateURI({ issuer: EMISSOR, label, secret });
}

/**
 * Verifica um código de 6 dígitos contra o segredo, com tolerância de relógio.
 * @param {string} secret  Segredo TOTP em Base32 (em claro).
 * @param {string} codigo  Código informado pelo usuário.
 * @returns {Promise<boolean>}
 */
export async function verificarCodigo(secret, codigo) {
  if (!secret || !codigo) return false;
  // Aceita só dígitos (o app sempre envia 6 dígitos); evita ruído de espaços.
  const token = String(codigo).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const r = await verify({ secret, token, epochTolerance: TOLERANCIA_SEGUNDOS });
    return r?.valid === true;
  } catch {
    return false;
  }
}

/**
 * Cifra um segredo TOTP para gravar em coluna de texto.
 * @param {string|null|undefined} secret
 * @returns {string|null}
 */
export function cifrarSegredo(secret) {
  return encrypt(secret);
}

/**
 * Decifra um segredo TOTP gravado (null se vazio/corrompido).
 * @param {string|null|undefined} blob
 * @returns {string|null}
 */
export function decifrarSegredo(blob) {
  return decrypt(blob);
}
