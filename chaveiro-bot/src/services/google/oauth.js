import jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { encrypt, decrypt } from '../whatsapp/crypto.js';

/**
 * OAuth2 (authorization-code) do Google Business Profile.
 *
 * Diferente do login social (apenas ID-token), aqui precisamos de ACESSO OFFLINE
 * (refresh token) para sincronizar avaliações em background a cada 6h. O fluxo:
 *   1) urlAutorizacao(empresaId) → manda o usuário ao consentimento do Google,
 *      com `state` = JWT curto assinado (empresaId) para amarrar o callback.
 *   2) trocarCodigo(code) → troca o code por access+refresh tokens.
 *   3) renovarToken(empresaId) → usa o refresh quando o access expira.
 *
 * Tokens são SEMPRE cifrados (encrypt/decrypt, AES-256-GCM) antes de ir ao banco.
 * Nunca logamos tokens/segredos.
 */

const SCOPE = 'https://www.googleapis.com/auth/business.manage';
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_TTL = '10m';

/** Assina o `state` (JWT curto) que carrega o empresaId pelo redirect do Google. */
export function assinarState(empresaId) {
  return jwt.sign({ empresaId, tipo: 'google_oauth' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: STATE_TTL,
  });
}

/** Valida o `state` do callback; lança se inválido/expirado. Retorna { empresaId }. */
export function validarState(state) {
  const payload = jwt.verify(state, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload?.tipo !== 'google_oauth' || !Number.isInteger(payload?.empresaId)) {
    throw new Error('state OAuth do Google inválido');
  }
  return { empresaId: payload.empresaId };
}

/** Monta a URL de consentimento (offline + prompt=consent garante o refresh token). */
export function urlAutorizacao(empresaId) {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error('OAuth do Google não configurado (CLIENT_ID/REDIRECT_URI ausentes)');
  }
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: assinarState(empresaId),
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

/**
 * Troca o authorization code por tokens e persiste a GoogleConta (tokens cifrados).
 * @returns {Promise<{ empresaId:number }>}  empresaId derivado do `state`.
 */
export async function trocarCodigo(code, state) {
  const { empresaId } = validarState(state);
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_OAUTH_REDIRECT_URI) {
    throw new Error('OAuth do Google não configurado');
  }
  const resp = await axios.post(TOKEN_URL, new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });

  const { access_token, refresh_token, expires_in, scope } = resp.data;
  const tokenExpira = expires_in ? new Date(Date.now() + expires_in * 1000) : null;

  await prisma.googleConta.upsert({
    where: { empresaId },
    create: {
      empresaId,
      accessTokenEnc: encrypt(access_token),
      // O Google só devolve refresh_token no 1º consentimento; preserva o existente.
      refreshTokenEnc: refresh_token ? encrypt(refresh_token) : null,
      tokenExpira,
      escopo: scope ?? SCOPE,
      conectadoEm: new Date(),
    },
    update: {
      accessTokenEnc: encrypt(access_token),
      ...(refresh_token ? { refreshTokenEnc: encrypt(refresh_token) } : {}),
      tokenExpira,
      escopo: scope ?? SCOPE,
      conectadoEm: new Date(),
    },
  });
  logger.info('Google OAuth conectado', { empresaId });
  return { empresaId };
}

/**
 * Garante um access token válido para a empresa. Renova via refresh quando faltam
 * menos de 60s para expirar. Retorna o access token EM CLARO (uso imediato em chamada
 * de API) ou null se não há conta/refresh.
 */
export async function renovarToken(empresaId, { forcar = false } = {}) {
  const conta = await prisma.googleConta.findUnique({ where: { empresaId } });
  if (!conta) return null;

  const margem = 60_000; // renova com 1 min de folga
  const aindaValido = conta.tokenExpira && conta.tokenExpira.getTime() - Date.now() > margem;
  if (!forcar && aindaValido && conta.accessTokenEnc) {
    return decrypt(conta.accessTokenEnc);
  }

  const refresh = decrypt(conta.refreshTokenEnc);
  if (!refresh || !env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    // Sem refresh token utilizável — devolve o access atual (pode estar expirado).
    return conta.accessTokenEnc ? decrypt(conta.accessTokenEnc) : null;
  }

  try {
    const resp = await axios.post(TOKEN_URL, new URLSearchParams({
      refresh_token: refresh,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 });

    const { access_token, expires_in } = resp.data;
    const tokenExpira = expires_in ? new Date(Date.now() + expires_in * 1000) : null;
    await prisma.googleConta.update({
      where: { empresaId },
      data: { accessTokenEnc: encrypt(access_token), tokenExpira },
    });
    logger.info('Google token renovado', { empresaId });
    return access_token;
  } catch (erro) {
    logger.warn('Falha ao renovar token do Google', { empresaId, erro: erro.message });
    return conta.accessTokenEnc ? decrypt(conta.accessTokenEnc) : null;
  }
}

/** Remove a conexão Google da empresa (limpa tokens cifrados). */
export async function desconectar(empresaId) {
  await prisma.googleConta.deleteMany({ where: { empresaId } });
  logger.info('Google OAuth desconectado', { empresaId });
}
