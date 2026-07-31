/**
 * Código de confirmação por e-mail para excluir a conta (F3).
 *
 * Stateless (HMAC), ligado a (usuario.id, propósito fixo, janela de tempo) — NÃO reusa
 * `telefoneOtpHash`/`telefoneOtpExpira` de services/otp.js. Aquele canal é phone/WhatsApp
 * e pode ser redirecionado pelo próprio atacante: com um JWT de sessão válido, `PATCH /me`
 * troca o telefone para um número do próprio atacante SEM exigir confirmação, e o código
 * de verificação de telefone chegaria ali — satisfazendo indevidamente esta exigência de
 * "código por e-mail" (achado da revisão independente). Este código nunca toca o telefone
 * do usuário: é calculado sob demanda e só é entregue por e-mail.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const JANELA_MS = 10 * 60_000; // 10 minutos
const PROPOSITO = 'exclusao_conta';

function calcularCodigo(userId, janela) {
  const h = createHmac('sha256', env.JWT_SECRET)
    .update(`${PROPOSITO}:${userId}:${janela}`)
    .digest();
  return String(h.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** Código válido para a janela de tempo ATUAL (para gerar e enviar por e-mail). */
export function gerarCodigoExclusaoConta(userId, agora = Date.now()) {
  return calcularCodigo(userId, Math.floor(agora / JANELA_MS));
}

/** Valida contra a janela atual OU a anterior (tolerância de borda de ~10-20 min). */
export function validarCodigoExclusaoConta(userId, codigo, agora = Date.now()) {
  if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return false;
  const janelaAtual = Math.floor(agora / JANELA_MS);
  for (const janela of [janelaAtual, janelaAtual - 1]) {
    const esperado = calcularCodigo(userId, janela);
    const a = Buffer.from(esperado);
    const b = Buffer.from(codigo);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
