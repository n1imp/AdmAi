import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { cifrarSegredo, decifrarSegredo } from './totp.js';

/**
 * OTP de telefone entregue pelo WhatsApp do robô (número único).
 *
 * Usado em dois pontos: verificação do telefone no cadastro e 2FA por telefone no
 * login. O código fica CIFRADO em repouso (`Usuario.telefoneOtpHash`, AES-256-GCM via
 * totp.js) com validade curta (`telefoneOtpExpira`). Reusa a mesma cripto do TOTP.
 */

const VALIDADE_MIN = 10;

/** Gera um código numérico de 6 dígitos (com zeros à esquerda). */
export function gerarCodigoOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Gera, persiste (cifrado) e retorna o código OTP do usuário. O chamador é
 * responsável por entregá-lo (enviarMensagem via WhatsApp). Validade: 10 min.
 *
 * @param {number} userId
 * @returns {Promise<string>} o código em claro (para envio)
 */
export async function definirOtpTelefone(userId) {
  const codigo = gerarCodigoOtp();
  await prisma.usuario.update({
    where: { id: userId },
    data: {
      telefoneOtpHash: cifrarSegredo(codigo),
      telefoneOtpExpira: new Date(Date.now() + VALIDADE_MIN * 60_000),
    },
  });
  return codigo;
}

/**
 * Valida um código contra o OTP cifrado do usuário (constante no tempo).
 * Não consome o OTP — o chamador limpa os campos após sucesso.
 *
 * @param {{telefoneOtpHash?:string|null, telefoneOtpExpira?:Date|null}} usuario
 * @param {string} codigo
 * @returns {boolean}
 */
export function validarOtpTelefone(usuario, codigo) {
  if (!usuario?.telefoneOtpHash || !usuario.telefoneOtpExpira) return false;
  if (new Date(usuario.telefoneOtpExpira).getTime() < Date.now()) return false;
  const real = decifrarSegredo(usuario.telefoneOtpHash);
  if (!real) return false;
  const a = Buffer.from(real);
  const b = Buffer.from(String(codigo ?? ''));
  // timingSafeEqual exige buffers do mesmo tamanho.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Limpa o OTP do usuário (após verificação bem-sucedida). */
export async function limparOtpTelefone(userId) {
  await prisma.usuario.update({
    where: { id: userId },
    data: { telefoneOtpHash: null, telefoneOtpExpira: null },
  });
}
