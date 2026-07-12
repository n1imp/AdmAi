import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../utils/logger.js';
import { criarBreaker } from '../../utils/resiliencia.js';

// Breaker por réplica: num lote de avaliações, se a Anthropic cair, abre após 5 falhas e
// os itens restantes falham rápido (em vez de cada um esperar 20s×retries do SDK).
const breakerIA = criarBreaker({ rotulo: 'anthropic', limiar: 5, resetMs: 30000 });

/**
 * Análise de avaliações por IA (Claude / Anthropic SDK).
 *
 * Para cada avaliação NOVA (sem analiseJson), gera:
 *   { elogios:[], criticas:[], sugestaoResposta:'' }
 * e grava em AvaliacaoGoogle.analiseJson. Depois consolida um resumo agregado por
 * empresa em AnaliseAvaliacoes (elogios/críticas mais recorrentes).
 *
 * Se ANTHROPIC_API_KEY estiver ausente → no-op silencioso (a UI esconde a seção).
 * Modelo: env.AI_REVIEWS_MODEL (default 'claude-haiku-4-5'). Haiku 4.5 NÃO aceita
 * `effort` — por isso nunca é enviado.
 */

const MAX_POR_CICLO = 20;

// JSON schema da saída estruturada de cada avaliação.
const SCHEMA_REVIEW = {
  type: 'object',
  properties: {
    elogios: { type: 'array', items: { type: 'string' } },
    criticas: { type: 'array', items: { type: 'string' } },
    sugestaoResposta: { type: 'string' },
  },
  required: ['elogios', 'criticas', 'sugestaoResposta'],
  additionalProperties: false,
};

const SYSTEM = [
  'Você é um assistente que analisa avaliações de clientes de uma empresa de chaveiro no Brasil.',
  'Para cada avaliação, identifique os ELOGIOS (pontos positivos citados) e as CRÍTICAS',
  '(pontos negativos/sugestões), em frases curtas em português do Brasil.',
  'Gere também uma SUGESTÃO DE RESPOSTA cordial, profissional e empática (1 a 3 frases),',
  'agradecendo elogios e/ou reconhecendo críticas com disposição para melhorar.',
  'Responda SOMENTE no formato JSON solicitado.',
].join(' ');

let _cliente = null;
function cliente() {
  if (!env.ANTHROPIC_API_KEY) return null;
  if (!_cliente) _cliente = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20000, maxRetries: 2 });
  return _cliente;
}

/** A análise por IA está disponível? (chave presente). */
export function iaDisponivel() {
  return Boolean(env.ANTHROPIC_API_KEY);
}

/** Extrai o texto JSON da resposta do SDK (tolerante a variações de formato). */
function extrairJson(msg) {
  const bloco = (msg?.content ?? []).find((c) => c.type === 'text' || c.text);
  const txt = bloco?.text ?? '';
  try {
    return JSON.parse(txt);
  } catch {
    // fallback: tenta achar o primeiro objeto JSON no texto
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* ignora */ } }
    return null;
  }
}

/** Analisa UMA avaliação. Retorna {elogios,criticas,sugestaoResposta} ou null. */
async function analisarUma(client, aval) {
  const userMsg =
    `Avaliação (nota ${aval.nota ?? 's/ nota'}): "${aval.comentario ?? '(sem comentário)'}"`;
  const msg = await breakerIA(() => client.messages.create({
    model: env.AI_REVIEWS_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA_REVIEW } },
  }));
  const json = extrairJson(msg);
  if (!json) return null;
  return {
    elogios: Array.isArray(json.elogios) ? json.elogios : [],
    criticas: Array.isArray(json.criticas) ? json.criticas : [],
    sugestaoResposta: typeof json.sugestaoResposta === 'string' ? json.sugestaoResposta : '',
  };
}

/**
 * Processa as avaliações novas da empresa (sem analiseJson) e atualiza o resumo agregado.
 * No-op silencioso se a IA não estiver disponível.
 * @returns {Promise<{ analisadas:number }>}
 */
export async function analisarNovas(empresaId) {
  const client = cliente();
  if (!client) return { analisadas: 0 };

  const novas = await prisma.avaliacaoGoogle.findMany({
    where: { empresaId, analiseJson: { equals: null }, comentario: { not: null } },
    orderBy: { criadoEmGoogle: 'desc' },
    take: MAX_POR_CICLO,
  });
  if (novas.length === 0) return { analisadas: 0 };

  let analisadas = 0;
  let ultimoReviewAnalisado = null;
  for (const aval of novas) {
    try {
      const res = await analisarUma(client, aval);
      if (!res) continue;
      await prisma.avaliacaoGoogle.update({
        where: { id: aval.id },
        data: { analiseJson: res },
      });
      ultimoReviewAnalisado = aval.reviewId;
      analisadas++;
    } catch (erro) {
      logger.warn('Falha ao analisar avaliação', { empresaId, reviewId: aval.reviewId, erro: erro.message });
    }
  }

  if (analisadas > 0) {
    await consolidarResumo(empresaId, ultimoReviewAnalisado);
    logger.info('Avaliações analisadas por IA', { empresaId, analisadas });
  }
  return { analisadas };
}

/**
 * Recalcula o resumo agregado (elogios/críticas recorrentes) a partir de todas as
 * análises já gravadas e grava em AnaliseAvaliacoes. Heurística simples e barata:
 * conta frequência das frases e lista as mais comuns (sem nova chamada à IA).
 */
async function consolidarResumo(empresaId, ultimoReviewAnalisado) {
  const analisadas = await prisma.avaliacaoGoogle.findMany({
    where: { empresaId, analiseJson: { not: null } },
    select: { analiseJson: true },
  });
  const freq = (chave) => {
    const mapa = new Map();
    for (const a of analisadas) {
      const itens = a.analiseJson?.[chave];
      if (!Array.isArray(itens)) continue;
      for (const item of itens) {
        const k = String(item).trim();
        if (k) mapa.set(k, (mapa.get(k) ?? 0) + 1);
      }
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  };
  const resumoElogios = freq('elogios').join('; ') || null;
  const resumoCriticas = freq('criticas').join('; ') || null;

  await prisma.analiseAvaliacoes.upsert({
    where: { empresaId },
    create: { empresaId, resumoElogios, resumoCriticas, ultimoReviewAnalisado },
    update: { resumoElogios, resumoCriticas, ...(ultimoReviewAnalisado ? { ultimoReviewAnalisado } : {}) },
  });
}

export const _internal = { extrairJson, SCHEMA_REVIEW };
