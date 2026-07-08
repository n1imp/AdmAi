import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { requireAuth, requirePermissao } from '../middlewares/auth.js';
import {
  urlAutorizacao, trocarCodigo, desconectar as desconectarGoogle,
} from '../services/google/oauth.js';
import {
  listarReviews, responderReview, listarLocations, integracaoLigada, publicarDeVerdade,
} from '../services/google/businessClient.js';
import { iaDisponivel } from '../services/google/analise.js';

/**
 * Rotas da integração Google Business Profile (avaliações).
 *
 * Todas exigem auth EXCETO o callback do OAuth (público, valida o `state` JWT).
 * Com GOOGLE_REVIEWS_ENABLED off, as rotas continuam respondendo via MOCK/fixtures
 * para não derrubar a UI — status reporta modo "mock".
 */
export const googleRouter = Router();

// URL do painel para redirecionar após o callback (reusa ALLOWED_ORIGIN; cai p/ '/').
function urlPainel(rota = '/avaliacoes') {
  const base = (env.ALLOWED_ORIGIN ?? '').replace(/\/+$/, '');
  return `${base}${rota}`;
}

// ── GET /api/google/status ────────────────────────────────────────────────────
googleRouter.get('/api/google/status', requireAuth, requirePermissao('avaliacoes', 'ver'), async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const conta = await prisma.googleConta.findUnique({
      where: { empresaId },
      // Tokens lidos só para derivar booleanos — NUNCA retornados ao painel.
      select: {
        placeId: true, accountId: true, locationId: true, conectadoEm: true,
        accessTokenEnc: true, refreshTokenEnc: true,
      },
    });
    const ligada = integracaoLigada();
    const temToken = Boolean(conta?.refreshTokenEnc || conta?.accessTokenEnc);
    const temConexao = Boolean(ligada && temToken);          // OAuth concluído (loja ainda pode faltar)
    const conectado = Boolean(ligada && conta?.accountId && conta?.locationId); // loja escolhida → API real
    const precisaSelecionarLoja = Boolean(temConexao && !conta?.locationId);
    const analise = await prisma.analiseAvaliacoes.findUnique({
      where: { empresaId },
      select: { resumoElogios: true, resumoCriticas: true, atualizadoEm: true },
    });
    res.json({
      // "mock" quando a integração está off (UI funciona com fixtures), senão real.
      modo: ligada ? 'real' : 'mock',
      conectado,
      temConexao,
      precisaSelecionarLoja,
      placeId: conta?.placeId ?? null,
      locationId: conta?.locationId ?? null,
      conectadoEm: conta?.conectadoEm ?? null,
      validateOnly: !publicarDeVerdade(),
      iaDisponivel: iaDisponivel(),
      analise: analise ?? null,
    });
  } catch (erro) {
    logger.error('Erro GET /google/status', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── POST /api/google/place-id ─────────────────────────────────────────────────
googleRouter.post('/api/google/place-id', requireAuth, requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    const schema = z.object({ placeId: z.string().min(1).max(200) });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const empresaId = req.user.empresaId;
    await prisma.googleConta.upsert({
      where: { empresaId },
      create: { empresaId, placeId: parse.data.placeId },
      update: { placeId: parse.data.placeId },
    });
    res.json({ placeId: parse.data.placeId });
  } catch (erro) {
    logger.error('Erro POST /google/place-id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/google/locations ─────────────────────────────────────────────────
// Descoberta automática das lojas do Google após o OAuth (o dono escolhe em vez de
// digitar o Place ID). Carrega verificacaoPendente quando o acesso à API ainda não
// foi liberado para o app (em verificação/aprovação pelo Google).
googleRouter.get('/api/google/locations', requireAuth, requirePermissao('avaliacoes', 'ver'), async (req, res) => {
  try {
    const r = await listarLocations(req.user.empresaId);
    res.json(r);
  } catch (erro) {
    logger.error('Erro GET /google/locations', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── POST /api/google/location — o dono escolhe a loja descoberta ──────────────
googleRouter.post('/api/google/location', requireAuth, requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      accountId: z.string().min(1).max(200),
      locationId: z.string().min(1).max(200),
      placeId: z.string().max(200).optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const empresaId = req.user.empresaId;
    const { accountId, locationId, placeId } = parse.data;
    await prisma.googleConta.upsert({
      where: { empresaId },
      create: { empresaId, accountId, locationId, placeId: placeId ?? null },
      update: { accountId, locationId, ...(placeId ? { placeId } : {}) },
    });
    res.json({ accountId, locationId, placeId: placeId ?? null });
  } catch (erro) {
    logger.error('Erro POST /google/location', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/google/oauth/iniciar → { url } ───────────────────────────────────
googleRouter.get('/api/google/oauth/iniciar', requireAuth, requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    if (!integracaoLigada()) {
      return res.status(503).json({ erro: 'Integração com o Google está desabilitada.' });
    }
    const url = urlAutorizacao(req.user.empresaId);
    res.json({ url });
  } catch (erro) {
    logger.warn('Erro GET /google/oauth/iniciar', { erro: erro.message });
    res.status(400).json({ erro: 'OAuth do Google não está configurado no servidor.' });
  }
});

// ── GET /api/google/oauth/callback (PÚBLICO; valida state JWT) ─────────────────
googleRouter.get('/api/google/oauth/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    logger.info('Google OAuth cancelado/erro', { error: String(error) });
    return res.redirect(urlPainel('/avaliacoes?google=erro'));
  }
  if (!code || !state) {
    return res.redirect(urlPainel('/avaliacoes?google=erro'));
  }
  try {
    await trocarCodigo(String(code), String(state));
    return res.redirect(urlPainel('/avaliacoes?google=ok'));
  } catch (erro) {
    logger.warn('Falha no callback OAuth do Google', { erro: erro.message });
    return res.redirect(urlPainel('/avaliacoes?google=erro'));
  }
});

// ── POST /api/google/desconectar ──────────────────────────────────────────────
googleRouter.post('/api/google/desconectar', requireAuth, requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    await desconectarGoogle(req.user.empresaId);
    res.json({ desconectado: true });
  } catch (erro) {
    logger.error('Erro POST /google/desconectar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/google/reviews ───────────────────────────────────────────────────
// Filtros: nota (1-5), periodo (dias), respondida (true/false), cursor (paginação local).
googleRouter.get('/api/google/reviews', requireAuth, requirePermissao('avaliacoes', 'ver'), async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const nota = req.query.nota ? parseInt(String(req.query.nota)) : null;
    const respondidaQ = req.query.respondida;
    const periodoDias = req.query.periodo ? parseInt(String(req.query.periodo)) : null;
    const cursor = req.query.cursor ? parseInt(String(req.query.cursor)) : null;
    const limit = 20;

    const where = { empresaId };
    if (nota && nota >= 1 && nota <= 5) where.nota = nota;
    if (respondidaQ === 'true') where.respondida = true;
    if (respondidaQ === 'false') where.respondida = false;
    if (periodoDias && periodoDias > 0) {
      where.criadoEmGoogle = { gte: new Date(Date.now() - periodoDias * 86400000) };
    }

    const persistidas = await prisma.avaliacaoGoogle.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    let mock = false;
    let verificacaoPendente = false;
    let lista = persistidas;
    // Sem nada persistido e sem filtros → mostra fixtures de mock para a UI iniciar.
    if (persistidas.length === 0 && !cursor && !nota && !respondidaQ && !periodoDias) {
      const r = await listarReviews(empresaId);
      mock = r.mock;
      verificacaoPendente = Boolean(r.verificacaoPendente);
      lista = r.reviews.map((rv, i) => ({
        id: -(i + 1),
        empresaId,
        reviewId: rv.reviewId,
        autorNome: rv.autorNome,
        nota: rv.nota,
        comentario: rv.comentario,
        criadoEmGoogle: rv.criadoEmGoogle,
        respondida: false,
        respostaTexto: null,
        respondidoEm: null,
        analiseJson: null,
      }));
    }

    const temMais = lista.length > limit;
    const data = temMais ? lista.slice(0, limit) : lista;
    const proximoCursor = temMais ? data[data.length - 1].id : null;
    res.json({ data, proximoCursor, mock, verificacaoPendente });
  } catch (erro) {
    logger.error('Erro GET /google/reviews', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── POST /api/google/reviews/:reviewId/responder { texto } ────────────────────
googleRouter.post('/api/google/reviews/:reviewId/responder', requireAuth, requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    const schema = z.object({ texto: z.string().min(1).max(4000) });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const empresaId = req.user.empresaId;
    const reviewId = String(req.params.reviewId);

    const resultado = await responderReview(empresaId, reviewId, parse.data.texto);

    // Grava a resposta na avaliação persistida (se existir). Em mock pode não existir.
    const existente = await prisma.avaliacaoGoogle.findUnique({ where: { reviewId } });
    if (existente && existente.empresaId === empresaId) {
      await prisma.avaliacaoGoogle.update({
        where: { reviewId },
        data: { respondida: resultado.publicado, respostaTexto: parse.data.texto, respondidoEm: new Date() },
      });
    }
    res.json({
      ...resultado,
      // Quando só validado (validateOnly), avisa que não publicou de verdade.
      mensagem: resultado.publicado
        ? 'Resposta publicada no Google.'
        : 'Resposta validada (modo somente-validação). Ative a publicação real para enviar ao Google.',
    });
  } catch (erro) {
    logger.error('Erro POST /google/reviews/:id/responder', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});
