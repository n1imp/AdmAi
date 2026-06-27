/**
 * Login social (OIDC) — verificação de ID tokens de Google, Microsoft e Apple.
 *
 * Estratégia: o painel obtém um ID token (JWT) do provedor (via SDK, popup) e o
 * envia ao backend. Aqui verificamos a ASSINATURA do token contra o JWKS público
 * do provedor (chaves rotativas, baixadas e cacheadas pela lib `jose`) e validamos
 * `aud` (nossa client id), `iss`, `exp` e — quando disponível — o `nonce`.
 *
 * Só então confiamos no `sub` (id estável do usuário no provedor) e no e-mail.
 * Nenhum segredo de cliente é necessário para ESTE fluxo (apenas as client ids
 * públicas) — o segredo da Apple só seria preciso para troca de code/refresh.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';

/** Erro de OAuth com código estável e status HTTP sugerido (mapeado na rota). */
export class OAuthError extends Error {
  constructor(codigo, status = 401, extra = {}) {
    super(codigo);
    this.name = 'OAuthError';
    this.codigo = codigo;
    this.status = status;
    this.extra = extra;
  }
}

// Em tenants Microsoft multi-tenant (common/organizations/consumers) o `iss` é
// específico do tenant que autenticou — validamos por padrão em vez de valor fixo.
const ISS_MICROSOFT_RE = /^https:\/\/login\.microsoftonline\.com\/[\w.-]+\/v2\.0$/;

/**
 * Configuração de verificação por provedor (lida do env a cada chamada para
 * refletir mudanças de ambiente/mocks). `audience` ausente = provedor desabilitado.
 */
export function configProvedor(provedor) {
  switch (provedor) {
    case 'google':
      return {
        audience: env.GOOGLE_CLIENT_ID,
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
        exigeNonce: true, // o painel envia o nonce e o Google o ecoa no ID token
      };
    case 'microsoft': {
      const tenant = env.MICROSOFT_TENANT || 'common';
      const multiTenant = ['common', 'organizations', 'consumers'].includes(tenant);
      return {
        audience: env.MICROSOFT_CLIENT_ID,
        issuer: multiTenant ? null : `https://login.microsoftonline.com/${tenant}/v2.0`,
        issuerRegex: multiTenant ? ISS_MICROSOFT_RE : null,
        jwksUri: `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`,
        // MSAL valida o nonce no cliente; o painel não reenvia o nonce ao backend.
        exigeNonce: false,
      };
    }
    case 'apple':
      return {
        audience: env.APPLE_CLIENT_ID,
        issuer: 'https://appleid.apple.com',
        jwksUri: 'https://appleid.apple.com/auth/keys',
        exigeNonce: true, // o painel envia o nonce e a Apple o ecoa no ID token
      };
    default:
      return null;
  }
}

/** Quais provedores estão habilitados (client id presente). Usado pelo painel. */
export function provedoresHabilitados() {
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID),
    microsoft: Boolean(env.MICROSOFT_CLIENT_ID),
    apple: Boolean(env.APPLE_CLIENT_ID),
  };
}

// Cache do JWKSet por URI: a função retornada por `createRemoteJWKSet` cacheia as
// chaves internamente e só rebaixa no rollover. Recriar a cada request anularia isso.
const jwksCache = new Map();
function obterJwks(uri) {
  let jwks = jwksCache.get(uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, jwks);
  }
  return jwks;
}

// O `email_verified` vem como boolean (Google) ou string "true" (Apple). A
// Microsoft não envia esse claim; usamos `xms_edov` (domínio verificado) quando há.
function normalizarEmailVerificado(payload) {
  const v = payload.email_verified;
  if (v === true || v === 'true') return true;
  if (payload.xms_edov === true || payload.xms_edov === 'true') return true;
  return false;
}

function extrairEmail(payload) {
  return payload.email || payload.preferred_username || payload.upn || null;
}

function extrairNome(payload) {
  if (payload.name) return payload.name;
  const partes = [payload.given_name, payload.family_name].filter(Boolean);
  if (partes.length) return partes.join(' ');
  const email = extrairEmail(payload);
  return email ? email.split('@')[0] : 'Usuário';
}

/**
 * Verifica um ID token e devolve a identidade normalizada.
 * @param {string} provedor  "google" | "microsoft" | "apple"
 * @param {string} idToken   JWT recebido do provedor (via painel)
 * @param {string} [nonce]   nonce gerado pelo cliente; se informado, DEVE bater
 * @returns {Promise<{sub:string, email:string|null, emailVerificado:boolean, nome:string}>}
 * @throws {OAuthError}
 */
export async function verificarIdToken(provedor, idToken, nonce) {
  const cfg = configProvedor(provedor);
  if (!cfg) throw new OAuthError('provedor_desconhecido', 404);
  if (!cfg.audience) throw new OAuthError('provedor_desabilitado', 404);
  if (!idToken || typeof idToken !== 'string') throw new OAuthError('token_ausente', 400);

  let payload;
  try {
    const jwks = obterJwks(cfg.jwksUri);
    ({ payload } = await jwtVerify(idToken, jwks, {
      audience: cfg.audience,
      ...(cfg.issuer ? { issuer: cfg.issuer } : {}),
      clockTolerance: 30, // segundos — tolera leve descompasso de relógio
    }));
  } catch (e) {
    throw new OAuthError('token_invalido', 401, { causa: e?.message });
  }

  // Microsoft multi-tenant: `iss` é por-tenant; validamos o formato esperado.
  if (cfg.issuerRegex && !cfg.issuerRegex.test(String(payload.iss || ''))) {
    throw new OAuthError('issuer_invalido', 401);
  }
  // Anti-replay. Provedores que ecoam o nonce no ID token (Google, Apple) o EXIGEM:
  // o cliente precisa enviar o nonce e ele tem de bater com o do token — fecha o
  // replay de um ID token interceptado. A Microsoft é validada pelo MSAL no cliente
  // (o painel não reenvia o nonce), então só checamos quando, por acaso, vier um.
  if (cfg.exigeNonce) {
    if (!nonce) throw new OAuthError('nonce_ausente', 400);
    if (payload.nonce !== nonce) throw new OAuthError('nonce_invalido', 401);
  } else if (nonce && payload.nonce !== nonce) {
    throw new OAuthError('nonce_invalido', 401);
  }
  if (!payload.sub) throw new OAuthError('sub_ausente', 401);

  return {
    sub: String(payload.sub),
    email: extrairEmail(payload),
    emailVerificado: normalizarEmailVerificado(payload),
    nome: extrairNome(payload),
  };
}
