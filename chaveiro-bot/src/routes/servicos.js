import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { buscarOuCriarTecnico } from '../services/servico.js';
import { darBaixaPorServico } from '../services/estoque.js';
import { agendarAvaliacao } from '../services/avaliacao.js';
import { pode, podeProprio } from '../services/permissoes.js';
import { requireAuth, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { contemInsensivel } from '../utils/busca.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const MAX_AGREGACAO = 10_000;

function dataValida(d) { return d instanceof Date && !Number.isNaN(d.getTime()); }

function construirFiltroPeriodo(periodo, inicio, fim) {
  const agora = new Date();
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  if (periodo === 'hoje') {
    const fimHoje = new Date(hoje);
    fimHoje.setHours(23, 59, 59, 999);
    return { gte: hoje, lte: fimHoje };
  }
  if (periodo === 'semana') {
    const ini = new Date(hoje);
    ini.setDate(hoje.getDate() - hoje.getDay());
    return { gte: ini, lte: agora };
  }
  if (periodo === 'mes') {
    return { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1), lte: agora };
  }
  const dInicio = inicio ? new Date(inicio) : null;
  const dFim = fim ? new Date(fim + 'T23:59:59.999Z') : null;
  const inicioOk = dataValida(dInicio);
  const fimOk = dataValida(dFim);
  if (inicioOk && fimOk) return { gte: dInicio, lte: dFim };
  if (inicioOk) return { gte: dInicio, lte: agora };
  if (fimOk) return { gte: new Date('2000-01-01'), lte: dFim };
  const umMesAtras = new Date(hoje);
  umMesAtras.setMonth(hoje.getMonth() - 1);
  return { gte: umMesAtras, lte: agora };
}

function construirFiltroPeriodoAnterior(filtroAtual) {
  const inicio = filtroAtual.gte instanceof Date ? filtroAtual.gte : new Date(filtroAtual.gte);
  const fim = filtroAtual.lte instanceof Date ? filtroAtual.lte : new Date(filtroAtual.lte);
  const duracaoMs = fim.getTime() - inicio.getTime();
  return { gte: new Date(inicio.getTime() - duracaoMs), lte: new Date(inicio.getTime() - 1) };
}

function variacao(atual, anterior) {
  if (!anterior || anterior === 0) return atual > 0 ? null : 0;
  return parseFloat((((atual - anterior) / anterior) * 100).toFixed(1));
}

const schemaServico = z.object({
  tecnico: z.string().min(2).optional().nullable(),
  local: z.string().min(2),
  endereco: z.string().optional().nullable(),
  descricao: z.string().min(3),
  material: z.string().optional().nullable(),
  clienteNome: z.string().optional().nullable(),
  clienteTelefone: z.string().optional().nullable(),
  valorCobrado: z.number().nonnegative(),
  valorMaterial: z.number().nonnegative().default(0),
  materiais: z.array(z.object({ materialId: z.number().int().positive(), quantidade: z.number().positive() })).optional().default([]),
});

function podeRegistrarServico(req, res, next) {
  if (pode(req.user, 'servicos', 'criar') || podeProprio(req.user, 'registrar_servico')) return next();
  return res.status(403).json({ erro: 'Sem permissão para registrar serviço' });
}

router.get('/servicos', requirePermissao('servicos', 'ver'), async (req, res) => {
  try {
    const { tecnico, local, endereco, inicio, fim, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const where = { status: req.query.status ? String(req.query.status) : 'ativo' };
    if (tecnico) where.tecnico = { nome: contemInsensivel(tecnico) };
    if (local) where.local = contemInsensivel(local);
    if (endereco) where.endereco = contemInsensivel(endereco);
    if (inicio || fim) where.criadoEm = construirFiltroPeriodo('custom', inicio, fim);
    const [servicos, total] = await Promise.all([
      req.db.servico.findMany({ where, include: { tecnico: { select: { id: true, nome: true } } }, orderBy: { criadoEm: 'desc' }, skip: (pageNum - 1) * limitNum, take: limitNum }),
      req.db.servico.count({ where }),
    ]);
    res.json({ data: servicos, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (erro) {
    logger.error('Erro GET /servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao buscar serviços' });
  }
});

router.get('/servicos/pendentes', requirePermissao('aprovacoes', 'ver'), async (req, res) => {
  try {
    const pendentes = await req.db.servico.findMany({
      where: { status: 'pendente' },
      include: { tecnico: { select: { id: true, nome: true } } },
      orderBy: { criadoEm: 'asc' },
      take: 200,
    });
    res.json(pendentes);
  } catch (erro) {
    logger.error('Erro GET /servicos/pendentes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/servicos/:id', requirePermissao('servicos', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const servico = await req.db.servico.findUnique({ where: { id }, include: { tecnico: true } });
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });
    res.json(servico);
  } catch (erro) {
    logger.error('Erro GET /servicos/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/servicos', podeRegistrarServico, async (req, res) => {
  try {
    const parse = schemaServico.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const dados = parse.data;
    const empresaId = req.user.empresaId;
    const ehFuncionario = req.user.papel === 'funcionario';
    let tecnico;
    let materiais = dados.materiais;
    if (ehFuncionario) {
      if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
      tecnico = await prisma.tecnico.findUnique({ where: { id: req.user.tecnicoId } });
      if (!tecnico) return res.status(400).json({ erro: 'Técnico não encontrado' });
      materiais = [];
    } else {
      if (!dados.tecnico) return res.status(400).json({ erro: 'Informe o técnico' });
      tecnico = await buscarOuCriarTecnico(dados.tecnico, empresaId);
    }
    const valorLiquido = dados.valorCobrado - dados.valorMaterial;
    const comissaoGerada = parseFloat((valorLiquido * (tecnico.comissao / 100)).toFixed(2));
    let status = 'ativo';
    if (ehFuncionario) {
      const emp = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { aprovacaoServico: true } });
      if (emp?.aprovacaoServico) status = 'pendente';
    }
    const servico = await prisma.$transaction(async (tx) => {
      if (materiais.length > 0) {
        const ids = materiais.map((m) => m.materialId);
        const validos = await tx.material.count({ where: { id: { in: ids }, empresaId } });
        if (validos !== ids.length) throw new Error('Material de outra empresa');
      }
      const criado = await tx.servico.create({
        data: {
          empresaId, tecnicoId: tecnico.id, local: dados.local, endereco: dados.endereco ?? null,
          descricao: dados.descricao, material: dados.material ?? null, valorCobrado: dados.valorCobrado,
          valorMaterial: dados.valorMaterial, valorLiquido, comissaoGerada, status,
          clienteNome: dados.clienteNome ?? null, clienteTelefone: dados.clienteTelefone ?? null,
          msgOriginal: ehFuncionario ? 'CADASTRO_FUNCIONARIO' : 'CADASTRO_MANUAL',
          remetenteWpp: ehFuncionario ? `painel-func:${req.user.id}` : 'painel-admin',
          materiais: materiais.length > 0 ? { create: materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })) } : undefined,
        },
        include: { tecnico: true },
      });
      if (status === 'ativo' && materiais.length > 0) await darBaixaPorServico(criado.id, materiais, tx);
      return criado;
    });
    if (status === 'ativo' && dados.clienteTelefone) {
      agendarAvaliacao({ empresaId, servicoId: servico.id, clienteTelefone: dados.clienteTelefone, clienteNome: dados.clienteNome ?? null })
        .catch((e) => logger.warn('Falha ao agendar avaliação (manual)', { erro: e.message }));
    }
    res.status(201).json(servico);
  } catch (erro) {
    logger.error('Erro POST /servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao criar serviço' });
  }
});

router.post('/servicos/:id/aprovar', requirePermissao('aprovacoes', 'aprovar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const servico = await req.db.servico.findUnique({ where: { id }, include: { materiais: { select: { materialId: true, quantidade: true } } } });
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });
    if (servico.status !== 'pendente') return res.status(409).json({ erro: 'Serviço não está pendente' });
    await prisma.$transaction(async (tx) => {
      await tx.servico.update({ where: { id }, data: { status: 'ativo', aprovadoPor: req.user.id, aprovadoEm: new Date() } });
      if (servico.materiais.length > 0) {
        await darBaixaPorServico(id, servico.materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })), tx);
      }
    });
    if (servico.clienteTelefone) {
      agendarAvaliacao({ empresaId: req.user.empresaId, servicoId: id, clienteTelefone: servico.clienteTelefone, clienteNome: servico.clienteNome ?? null })
        .catch((e) => logger.warn('Falha ao agendar avaliação (aprovação)', { erro: e.message }));
    }
    logger.info('servico_aprovado', { id, aprovadoPor: req.user.id });
    res.json({ mensagem: 'Serviço aprovado', id, status: 'ativo' });
  } catch (erro) {
    logger.error('Erro POST /servicos/:id/aprovar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/servicos/:id/rejeitar', requirePermissao('aprovacoes', 'aprovar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const r = await req.db.servico.updateMany({ where: { id, status: 'pendente' }, data: { status: 'rejeitado', aprovadoPor: req.user.id, aprovadoEm: new Date() } });
    if (r.count === 0) return res.status(404).json({ erro: 'Serviço pendente não encontrado' });
    logger.info('servico_rejeitado', { id, por: req.user.id });
    res.json({ mensagem: 'Serviço rejeitado', id, status: 'rejeitado' });
  } catch (erro) {
    logger.error('Erro POST /servicos/:id/rejeitar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/servicos/:id', requirePermissao('servicos', 'deletar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    await req.db.servico.delete({ where: { id, empresaId: req.user.empresaId } });
    logger.info('Serviço deletado pelo admin', { id, empresaId: req.user.empresaId });
    res.json({ mensagem: 'Serviço removido com sucesso' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Serviço não encontrado' });
    logger.error('Erro DELETE /servicos/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/avaliacoes', requirePermissao('avaliacoes', 'ver'), async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const where = { empresaId };
    if (req.query.status) where.status = String(req.query.status);
    const [avaliacoes, respondidas] = await Promise.all([
      prisma.avaliacao.findMany({ where, orderBy: { criadoEm: 'desc' }, take: 100 }),
      prisma.avaliacao.findMany({ where: { empresaId, status: 'respondida', nota: { not: null } }, select: { nota: true } }),
    ]);
    const total = respondidas.length;
    const media = total > 0 ? parseFloat((respondidas.reduce((s, a) => s + (a.nota ?? 0), 0) / total).toFixed(2)) : null;
    const distribuicao = [1, 2, 3, 4, 5].map((n) => ({ nota: n, quantidade: respondidas.filter((a) => a.nota === n).length }));
    res.json({ avaliacoes, resumo: { total, media, distribuicao } });
  } catch (erro) {
    logger.error('Erro GET /avaliacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao buscar avaliações' });
  }
});

router.get('/avaliacoes/config', requirePermissao('avaliacoes', 'ver'), async (req, res) => {
  try {
    const cfg = await req.db.empresaWhatsapp.findUnique({
      where: { empresaId: req.user.empresaId },
      select: { reviewAtivo: true, reviewTemplate: true, reviewDelayHoras: true, reviewLink: true },
    });
    res.json({ reviewAtivo: cfg?.reviewAtivo ?? true, reviewTemplate: cfg?.reviewTemplate ?? null, reviewDelayHoras: cfg?.reviewDelayHoras ?? 2, reviewLink: cfg?.reviewLink ?? null });
  } catch (erro) {
    logger.error('Erro GET /avaliacoes/config', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/avaliacoes/config', requirePermissao('avaliacoes', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      reviewAtivo: z.boolean().optional(),
      reviewTemplate: z.string().max(1000).nullable().optional().or(z.literal('')),
      reviewDelayHoras: z.number().int().min(0).max(720).optional(),
      reviewLink: z.string().max(500).nullable().optional().or(z.literal('')),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const data = {};
    if (parse.data.reviewAtivo !== undefined) data.reviewAtivo = parse.data.reviewAtivo;
    if (parse.data.reviewTemplate !== undefined) data.reviewTemplate = parse.data.reviewTemplate === '' ? null : parse.data.reviewTemplate;
    if (parse.data.reviewDelayHoras !== undefined) data.reviewDelayHoras = parse.data.reviewDelayHoras;
    if (parse.data.reviewLink !== undefined) data.reviewLink = parse.data.reviewLink === '' ? null : parse.data.reviewLink;
    await req.db.empresaWhatsapp.updateMany({ where: { empresaId: req.user.empresaId }, data });
    const cfg = await req.db.empresaWhatsapp.findUnique({ where: { empresaId: req.user.empresaId }, select: { reviewAtivo: true, reviewTemplate: true, reviewDelayHoras: true, reviewLink: true } });
    res.json(cfg);
  } catch (erro) {
    logger.error('Erro PATCH /avaliacoes/config', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/dashboard', requirePermissao('dashboard', 'ver'), async (req, res) => {
  try {
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);
    const filtroAnterior = construirFiltroPeriodoAnterior(filtroDatas);
    const [servicos, servicosAnterior] = await Promise.all([
      req.db.servico.findMany({ where: { status: 'ativo', criadoEm: filtroDatas }, include: { tecnico: { select: { nome: true } } }, orderBy: { criadoEm: 'asc' }, take: MAX_AGREGACAO }),
      req.db.servico.findMany({ where: { status: 'ativo', criadoEm: filtroAnterior }, select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true }, take: MAX_AGREGACAO }),
    ]);
    const totalServicos = servicos.length;
    const receitaBruta = servicos.reduce((s, x) => s + x.valorCobrado, 0);
    const totalMaterial = servicos.reduce((s, x) => s + x.valorMaterial, 0);
    const receitaLiquida = servicos.reduce((s, x) => s + x.valorLiquido, 0);
    const ticketMedio = totalServicos > 0 ? receitaLiquida / totalServicos : 0;
    const totalComissao = servicos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
    const lucro = receitaLiquida - totalComissao;
    const margemLucro = receitaBruta > 0 ? parseFloat(((lucro / receitaBruta) * 100).toFixed(1)) : 0;
    const receitaLiquidaAnterior = servicosAnterior.reduce((s, x) => s + x.valorLiquido, 0);
    const totalServicosAnterior = servicosAnterior.length;
    const ticketMedioAnterior = totalServicosAnterior > 0 ? receitaLiquidaAnterior / totalServicosAnterior : 0;
    const comparativo = {
      receitaLiquida: variacao(receitaLiquida, receitaLiquidaAnterior),
      totalServicos: variacao(totalServicos, totalServicosAnterior),
      ticketMedio: variacao(ticketMedio, ticketMedioAnterior),
    };
    const mapasTecnico = {};
    for (const s of servicos) {
      const nome = s.tecnico.nome;
      if (!mapasTecnico[nome]) mapasTecnico[nome] = { tecnico: nome, servicos: 0, receitaBruta: 0, receitaLiquida: 0, comissao: 0 };
      mapasTecnico[nome].servicos++;
      mapasTecnico[nome].receitaBruta += s.valorCobrado;
      mapasTecnico[nome].receitaLiquida += s.valorLiquido;
      mapasTecnico[nome].comissao += s.comissaoGerada ?? 0;
    }
    const porTecnico = Object.values(mapasTecnico)
      .map((t) => ({ ...t, percentualReceita: receitaLiquida > 0 ? parseFloat(((t.receitaLiquida / receitaLiquida) * 100).toFixed(1)) : 0, ticketMedio: t.servicos > 0 ? parseFloat((t.receitaLiquida / t.servicos).toFixed(2)) : 0 }))
      .sort((a, b) => b.receitaLiquida - a.receitaLiquida);
    const mapasLocal = {};
    for (const s of servicos) {
      if (!mapasLocal[s.local]) mapasLocal[s.local] = { local: s.local, quantidade: 0, receita: 0 };
      mapasLocal[s.local].quantidade++;
      mapasLocal[s.local].receita += s.valorLiquido;
    }
    const porLocal = Object.values(mapasLocal).sort((a, b) => b.receita - a.receita);
    const mapasDia = {};
    for (const s of servicos) {
      const dia = new Date(s.criadoEm).toISOString().split('T')[0];
      if (!mapasDia[dia]) mapasDia[dia] = { data: dia, receita: 0, servicos: 0 };
      mapasDia[dia].receita += s.valorLiquido;
      mapasDia[dia].servicos++;
    }
    const evolucaoDiaria = Object.values(mapasDia).sort((a, b) => a.data.localeCompare(b.data));
    res.json({ totalServicos, receitaBruta, totalMaterial, receitaLiquida, ticketMedio, totalComissao, lucro, margemLucro, comparativo, porTecnico, porLocal, evolucaoDiaria });
  } catch (erro) {
    logger.error('Erro GET /dashboard', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao calcular dashboard' });
  }
});

export default router;
