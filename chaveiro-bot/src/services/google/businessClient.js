import axios from 'axios';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { renovarToken } from './oauth.js';

/**
 * Cliente da Google Business Profile API (avaliações).
 *
 * MOCKÁVEL: quando GOOGLE_REVIEWS_ENABLED != 'true' OU a empresa não tem GoogleConta
 * conectada (accountId/locationId), as funções devolvem FIXTURES de mock para que a
 * UI funcione sem credenciais. Com a flag ligada e a conta conectada, fala com a API
 * real respeitando GOOGLE_BUSINESS_VALIDATE_ONLY (default = valida só, não publica).
 */

const API_BASE = 'https://mybusiness.googleapis.com/v4';
const ACCOUNTS_URL = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
const INFO_BASE = 'https://mybusinessbusinessinformation.googleapis.com/v1';

/** A integração real está ligada? (flag de ambiente). */
export function integracaoLigada() {
  return env.GOOGLE_REVIEWS_ENABLED === 'true';
}

/**
 * Erro do Google que significa "app/empresa ainda sem acesso liberado à Business
 * Profile API" (401/403, API não habilitada, escopo insuficiente, app em verificação).
 * Usado para mostrar um estado de "verificação pendente" no painel em vez de um erro cru.
 */
export function ehErroVerificacao(erro) {
  const status = erro?.response?.status;
  if (status === 401 || status === 403) return true;
  const data = erro?.response?.data?.error;
  const txt = `${data?.status ?? ''} ${data?.message ?? ''}`;
  return /PERMISSION_DENIED|accessNotConfigured|SERVICE_DISABLED|has not been used|verification|insufficient/i.test(txt);
}

/** Responder de review publica de verdade? (default: só valida). */
export function publicarDeVerdade() {
  return env.GOOGLE_BUSINESS_VALIDATE_ONLY === 'false';
}

// ── Fixtures de mock (UI sem credenciais) ─────────────────────────────────────
function reviewsMock() {
  const agora = Date.now();
  return [
    {
      reviewId: 'mock-1',
      autorNome: 'Mariana Souza',
      nota: 5,
      comentario: 'Atendimento rápido e profissional. Resolveram minha fechadura em minutos!',
      criadoEmGoogle: new Date(agora - 2 * 86400000),
    },
    {
      reviewId: 'mock-2',
      autorNome: 'Carlos Pereira',
      nota: 4,
      comentario: 'Bom serviço, só demorou um pouco para chegar. Recomendo.',
      criadoEmGoogle: new Date(agora - 5 * 86400000),
    },
    {
      reviewId: 'mock-3',
      autorNome: 'Júlia Antunes',
      nota: 2,
      comentario: 'Preço acima do combinado e o técnico atrasou bastante.',
      criadoEmGoogle: new Date(agora - 9 * 86400000),
    },
  ];
}

/** A empresa está apta a usar a API real (flag ligada + conta conectada)? */
async function contaConectada(empresaId) {
  if (!integracaoLigada()) return null;
  const conta = await prisma.googleConta.findUnique({ where: { empresaId } });
  if (!conta?.accountId || !conta?.locationId) return null;
  return conta;
}

// Loja de exemplo para o seletor funcionar sem credenciais (modo demonstração).
function locationsMock() {
  return [
    {
      accountId: 'accounts/demo',
      locationId: 'locations/demo-1',
      title: 'Chaveiro Demo — Unidade Centro',
      endereco: 'Rua Exemplo, 100 - Centro',
      placeId: 'ChIJ_demo_place_id_0001',
    },
  ];
}

function normalizarLocation(accName, loc) {
  const nome = String(loc.name ?? '');
  const locId = nome.startsWith('locations/') ? nome : `locations/${nome.split('/').pop()}`;
  const a = loc.storefrontAddress;
  const endereco = a
    ? [(a.addressLines ?? []).join(', '), a.locality, a.administrativeArea].filter(Boolean).join(' - ')
    : null;
  return {
    accountId: accName,          // "accounts/123"
    locationId: locId,           // "locations/456"
    title: loc.title ?? null,
    endereco: endereco || null,
    placeId: loc.metadata?.placeId ?? null,
  };
}

/**
 * Descobre as LOJAS (locations) do Google da empresa após o OAuth, para o dono
 * ESCOLHER no painel em vez de digitar o Place ID manualmente.
 * Mockável (modo demonstração) e tolerante: em erro de acesso devolve verificacaoPendente.
 * @returns {Promise<{ locations:Array, mock:boolean, verificacaoPendente:boolean, mensagem?:string }>}
 */
export async function listarLocations(empresaId) {
  if (!integracaoLigada()) {
    return { locations: locationsMock(), mock: true, verificacaoPendente: false };
  }
  const conta = await prisma.googleConta.findUnique({ where: { empresaId } });
  if (!conta || (!conta.refreshTokenEnc && !conta.accessTokenEnc)) {
    return { locations: locationsMock(), mock: true, verificacaoPendente: false };
  }
  const token = await renovarToken(empresaId);
  if (!token) return { locations: locationsMock(), mock: true, verificacaoPendente: false };

  try {
    const accResp = await axios.get(ACCOUNTS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      params: { pageSize: 20 },
      timeout: 20000,
    });
    const out = [];
    for (const acc of accResp.data?.accounts ?? []) {
      const locResp = await axios.get(`${INFO_BASE}/${acc.name}/locations`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { readMask: 'name,title,storefrontAddress,metadata', pageSize: 100 },
        timeout: 20000,
      });
      for (const loc of locResp.data?.locations ?? []) out.push(normalizarLocation(acc.name, loc));
    }
    return { locations: out, mock: false, verificacaoPendente: false };
  } catch (erro) {
    if (ehErroVerificacao(erro)) {
      return {
        locations: [],
        mock: false,
        verificacaoPendente: true,
        mensagem:
          'O acesso à API do Google ainda não foi liberado para este app (em verificação/aprovação). ' +
          'Assim que aprovado, suas lojas aparecerão aqui automaticamente.',
      };
    }
    logger.warn('Falha ao listar locations do Google', { empresaId, erro: erro.message });
    return { locations: [], mock: false, verificacaoPendente: false };
  }
}

/**
 * Lista avaliações do Google da empresa.
 * @returns {Promise<{ reviews: Array, mock: boolean }>}  reviews normalizadas
 *   ({reviewId, autorNome, nota, comentario, criadoEmGoogle}).
 */
export async function listarReviews(empresaId, { desde = null } = {}) {
  const conta = await contaConectada(empresaId);
  if (!conta) {
    return { reviews: reviewsMock(), mock: true, verificacaoPendente: false };
  }

  const token = await renovarToken(empresaId);
  if (!token) return { reviews: reviewsMock(), mock: true, verificacaoPendente: false };

  const reviews = [];
  let pageToken = null;
  const url = `${API_BASE}/${conta.accountId}/${conta.locationId}/reviews`;
  try {
    do {
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: { pageSize: 50, ...(pageToken ? { pageToken } : {}) },
        timeout: 20000,
      });
      for (const r of resp.data?.reviews ?? []) {
        const criado = r.createTime ? new Date(r.createTime) : null;
        // Para sync incremental: para na primeira mais antiga que `desde`.
        if (desde && criado && criado <= desde) { pageToken = null; break; }
        reviews.push(normalizarReview(r));
      }
      pageToken = resp.data?.nextPageToken ?? null;
    } while (pageToken);
    return { reviews, mock: false, verificacaoPendente: false };
  } catch (erro) {
    if (ehErroVerificacao(erro)) {
      return { reviews, mock: false, verificacaoPendente: true };
    }
    logger.warn('Falha ao listar reviews do Google', { empresaId, erro: erro.message });
    return { reviews, mock: false, verificacaoPendente: false };
  }
}

const ESTRELA_NUM = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

function normalizarReview(r) {
  return {
    reviewId: r.reviewId ?? r.name?.split('/').pop(),
    autorNome: r.reviewer?.displayName ?? null,
    nota: ESTRELA_NUM[r.starRating] ?? null,
    comentario: r.comment ?? null,
    criadoEmGoogle: r.createTime ? new Date(r.createTime) : null,
  };
}

/**
 * Publica (ou valida) a resposta a uma avaliação.
 * Respeita GOOGLE_BUSINESS_VALIDATE_ONLY: por padrão NÃO publica de verdade.
 * @returns {Promise<{ publicado:boolean, mock:boolean, validado:boolean }>}
 */
export async function responderReview(empresaId, reviewId, texto) {
  const conta = await contaConectada(empresaId);
  if (!conta) {
    // Mock: simula sucesso para a UI sem credenciais.
    return { publicado: false, mock: true, validado: true };
  }

  const token = await renovarToken(empresaId);
  if (!token) return { publicado: false, mock: true, validado: true };

  // Modo seguro por padrão: só valida (não publica) até GOOGLE_BUSINESS_VALIDATE_ONLY=false.
  if (!publicarDeVerdade()) {
    logger.info('Resposta a review validada (validateOnly)', { empresaId, reviewId });
    return { publicado: false, mock: false, validado: true };
  }

  const url = `${API_BASE}/${conta.accountId}/${conta.locationId}/reviews/${reviewId}/reply`;
  await axios.put(url, { comment: texto }, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });
  logger.info('Resposta a review publicada', { empresaId, reviewId });
  return { publicado: true, mock: false, validado: false };
}

export const _internal = { reviewsMock, normalizarReview };
