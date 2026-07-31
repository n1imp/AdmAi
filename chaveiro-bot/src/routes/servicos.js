import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { buscarOuCriarTecnico } from '../services/servico.js';
import { darBaixaPorServico } from '../services/estoque.js';
import { agendarAvaliacao } from '../services/avaliacao.js';
import { pode, podeProprio } from '../services/permissoes.js';
import { requireAuth, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { contemInsensivel } from '../utils/busca.js';
import { construirFiltroPeriodo, construirFiltroPeriodoAnterior } from '../services/periodo.js';
import { diaLocal } from '../services/ponto.js';
import { env } from '../config/env.js';
import { capturarErro, JA_ENVIADO_AO_SENTRY } from '../config/sentry.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const MAX_AGREGACAO = 10_000;

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
  materiais: z
    .array(z.object({ materialId: z.number().int().positive(), quantidade: z.number().positive() }))
    .optional()
    .default([]),
});

function podeRegistrarServico(req, res, next) {
  if (pode(req.user, 'servicos', 'criar') || podeProprio(req.user, 'registrar_servico'))
    return next();
  return res.status(403).json({ erro: 'Sem permissão para registrar serviço' });
}

// Cursor keyset opaco codificando (criadoEm, id) — o desempate por id é obrigatório
// porque criadoEm NÃO é único (dois serviços podem ter o mesmo instante).
function encodeCursor(s) {
  return Buffer.from(`${s.criadoEm.toISOString()}|${s.id}`).toString('base64url');
}
function decodeCursor(raw) {
  try {
    const [iso, idStr] = Buffer.from(String(raw), 'base64url').toString('utf8').split('|');
    const criadoEm = new Date(iso);
    const id = parseInt(idStr, 10);
    if (Number.isNaN(criadoEm.getTime()) || !Number.isInteger(id) || id <= 0) return null;
    return { criadoEm, id };
  } catch {
    return null;
  }
}

router.get('/servicos', requirePermissao('servicos', 'ver'), async (req, res) => {
  try {
    const { tecnico, local, endereco, inicio, fim, page = '1', limit = '20', cursor } = req.query;
    // `Math.max(1, NaN)` é NaN, não 1 — com ?limit=abc isso ia como take/skip NaN para o
    // Prisma e estourava 500, além de serializar totalPages:null. Mesmo padrão defensivo
    // já usado em routes/estoque.js.
    const pageBruto = parseInt(page, 10);
    const limitBruto = parseInt(limit, 10);
    const pageNum = Number.isNaN(pageBruto) ? 1 : Math.max(1, pageBruto);
    const limitNum = Number.isNaN(limitBruto) ? 20 : Math.min(100, Math.max(1, limitBruto));
    const where = { status: req.query.status ? String(req.query.status) : 'ativo' };
    if (tecnico) where.tecnico = { nome: contemInsensivel(tecnico) };
    if (local) where.local = contemInsensivel(local);
    if (endereco) where.endereco = contemInsensivel(endereco);
    if (inicio || fim) where.criadoEm = construirFiltroPeriodo('custom', inicio, fim);

    // Paginação keyset (cursor): estável sob inserção concorrente e sem o custo de OFFSET.
    // Backward-compat: sem `cursor`, cai no page/OFFSET legado. Ordenação com desempate por id.
    let whereFinal = where;
    let skip;
    if (cursor !== undefined) {
      const cur = decodeCursor(cursor);
      if (!cur) return res.status(400).json({ erro: 'cursor inválido' });
      whereFinal = {
        AND: [
          where,
          {
            OR: [
              { criadoEm: { lt: cur.criadoEm } },
              { criadoEm: cur.criadoEm, id: { lt: cur.id } },
            ],
          },
        ],
      };
    } else {
      skip = (pageNum - 1) * limitNum;
    }
    const [servicos, total] = await Promise.all([
      req.db.servico.findMany({
        where: whereFinal,
        include: { tecnico: { select: { id: true, nome: true } } },
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip,
        take: limitNum,
      }),
      req.db.servico.count({ where }),
    ]);
    const nextCursor =
      servicos.length === limitNum ? encodeCursor(servicos[servicos.length - 1]) : null;
    res.json({
      data: servicos,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      nextCursor,
    });
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
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const dados = parse.data;
    const empresaId = req.user.empresaId;
    const ehFuncionario = req.user.papel === 'funcionario';
    let tecnico;
    let materiais = dados.materiais;
    if (ehFuncionario) {
      if (!req.user.tecnicoId)
        return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
      tecnico = await prisma.tecnico.findUnique({ where: { id: req.user.tecnicoId } });
      if (!tecnico) return res.status(400).json({ erro: 'Técnico não encontrado' });
      // Funcionário não movimenta estoque (a baixa acontece só na aprovação). Antes os
      // materiais eram zerados em SILÊNCIO: o app respondia 201, o técnico via sucesso, e
      // os itens simplesmente não existiam — sem vínculo, sem baixa, com o estoque
      // divergindo do real sem nenhum sinal. Melhor recusar explicitamente.
      if (Array.isArray(materiais) && materiais.length > 0) {
        return res.status(400).json({
          erro: 'Materiais não podem ser informados neste fluxo; registre-os na aprovação.',
          codigo: 'materiais_nao_permitidos',
        });
      }
      materiais = [];
    } else {
      if (!dados.tecnico) return res.status(400).json({ erro: 'Informe o técnico' });
      tecnico = await buscarOuCriarTecnico(dados.tecnico, empresaId);
    }
    const valorLiquido = dados.valorCobrado - dados.valorMaterial;
    const comissaoGerada = parseFloat((valorLiquido * (tecnico.comissao / 100)).toFixed(2));
    let status = 'ativo';
    if (ehFuncionario) {
      const emp = await prisma.empresa.findUnique({
        where: { id: empresaId },
        select: { aprovacaoServico: true },
      });
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
          empresaId,
          tecnicoId: tecnico.id,
          local: dados.local,
          endereco: dados.endereco ?? null,
          descricao: dados.descricao,
          material: dados.material ?? null,
          valorCobrado: dados.valorCobrado,
          valorMaterial: dados.valorMaterial,
          valorLiquido,
          comissaoGerada,
          status,
          clienteNome: dados.clienteNome ?? null,
          clienteTelefone: dados.clienteTelefone ?? null,
          msgOriginal: ehFuncionario ? 'CADASTRO_FUNCIONARIO' : 'CADASTRO_MANUAL',
          remetenteWpp: ehFuncionario ? `painel-func:${req.user.id}` : 'painel-admin',
          materiais:
            materiais.length > 0
              ? {
                  create: materiais.map((m) => ({
                    materialId: m.materialId,
                    quantidade: m.quantidade,
                  })),
                }
              : undefined,
        },
        include: { tecnico: true },
      });
      if (status === 'ativo' && materiais.length > 0)
        await darBaixaPorServico(criado.id, materiais, empresaId, tx);
      return criado;
    });
    if (status === 'ativo' && dados.clienteTelefone) {
      agendarAvaliacao({
        empresaId,
        servicoId: servico.id,
        clienteTelefone: dados.clienteTelefone,
        clienteNome: dados.clienteNome ?? null,
      }).catch((e) => logger.warn('Falha ao agendar avaliação (manual)', { erro: e.message }));
    }
    res.status(201).json(servico);
  } catch (erro) {
    logger.error('Erro POST /servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao criar serviço' });
  }
});

router.post(
  '/servicos/:id/aprovar',
  requirePermissao('aprovacoes', 'aprovar'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
      const servico = await req.db.servico.findUnique({
        where: { id },
        include: { materiais: { select: { materialId: true, quantidade: true } } },
      });
      if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });
      if (servico.status !== 'pendente')
        return res.status(409).json({ erro: 'Serviço não está pendente' });
      await prisma.$transaction(async (tx) => {
        await tx.servico.update({
          where: { id },
          data: { status: 'ativo', aprovadoPor: req.user.id, aprovadoEm: new Date() },
        });
        if (servico.materiais.length > 0) {
          await darBaixaPorServico(
            id,
            servico.materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })),
            req.user.empresaId,
            tx
          );
        }
      });
      if (servico.clienteTelefone) {
        agendarAvaliacao({
          empresaId: req.user.empresaId,
          servicoId: id,
          clienteTelefone: servico.clienteTelefone,
          clienteNome: servico.clienteNome ?? null,
        }).catch((e) => logger.warn('Falha ao agendar avaliação (aprovação)', { erro: e.message }));
      }
      logger.info('servico_aprovado', { id, aprovadoPor: req.user.id });
      res.json({ mensagem: 'Serviço aprovado', id, status: 'ativo' });
    } catch (erro) {
      logger.error('Erro POST /servicos/:id/aprovar', { erro: erro.message });
      res.status(500).json({ erro: 'Erro interno' });
    }
  }
);

router.post(
  '/servicos/:id/rejeitar',
  requirePermissao('aprovacoes', 'aprovar'),
  async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
      const r = await req.db.servico.updateMany({
        where: { id, status: 'pendente' },
        data: { status: 'rejeitado', aprovadoPor: req.user.id, aprovadoEm: new Date() },
      });
      if (r.count === 0) return res.status(404).json({ erro: 'Serviço pendente não encontrado' });
      logger.info('servico_rejeitado', { id, por: req.user.id });
      res.json({ mensagem: 'Serviço rejeitado', id, status: 'rejeitado' });
    } catch (erro) {
      logger.error('Erro POST /servicos/:id/rejeitar', { erro: erro.message });
      res.status(500).json({ erro: 'Erro interno' });
    }
  }
);

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
      prisma.avaliacao.findMany({
        where: { empresaId, status: 'respondida', nota: { not: null } },
        select: { nota: true },
      }),
    ]);
    const total = respondidas.length;
    const media =
      total > 0
        ? parseFloat((respondidas.reduce((s, a) => s + (a.nota ?? 0), 0) / total).toFixed(2))
        : null;
    const distribuicao = [1, 2, 3, 4, 5].map((n) => ({
      nota: n,
      quantidade: respondidas.filter((a) => a.nota === n).length,
    }));
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
    res.json({
      reviewAtivo: cfg?.reviewAtivo ?? true,
      reviewTemplate: cfg?.reviewTemplate ?? null,
      reviewDelayHoras: cfg?.reviewDelayHoras ?? 2,
      reviewLink: cfg?.reviewLink ?? null,
    });
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
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const data = {};
    if (parse.data.reviewAtivo !== undefined) data.reviewAtivo = parse.data.reviewAtivo;
    if (parse.data.reviewTemplate !== undefined)
      data.reviewTemplate = parse.data.reviewTemplate === '' ? null : parse.data.reviewTemplate;
    if (parse.data.reviewDelayHoras !== undefined)
      data.reviewDelayHoras = parse.data.reviewDelayHoras;
    if (parse.data.reviewLink !== undefined)
      data.reviewLink = parse.data.reviewLink === '' ? null : parse.data.reviewLink;
    await req.db.empresaWhatsapp.updateMany({ where: { empresaId: req.user.empresaId }, data });
    const cfg = await req.db.empresaWhatsapp.findUnique({
      where: { empresaId: req.user.empresaId },
      select: { reviewAtivo: true, reviewTemplate: true, reviewDelayHoras: true, reviewLink: true },
    });
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
    const whereAtual = { status: 'ativo', criadoEm: filtroDatas };
    // F3.3: escalares e agrupamentos (técnico/local) somados no banco via aggregate/groupBy
    // — auto-escopados por empresaId pelo req.db (tenant.js). A série diária precisa de bucket
    // por dia, que o groupBy do Prisma não trunca; então busca só 2 colunas e agrega em JS.
    const [agg, aggAnterior, porTecnicoRaw, porLocalRaw, servicosDia] = await Promise.all([
      req.db.servico.aggregate({
        where: whereAtual,
        _count: true,
        _sum: { valorCobrado: true, valorMaterial: true, valorLiquido: true, comissaoGerada: true },
      }),
      // Período anterior: só receita líquida e contagem → SUM/COUNT no banco (F3.2).
      req.db.servico.aggregate({
        where: { status: 'ativo', criadoEm: filtroAnterior },
        _sum: { valorLiquido: true },
        _count: true,
      }),
      req.db.servico.groupBy({
        by: ['tecnicoId'],
        where: whereAtual,
        _count: true,
        _sum: { valorCobrado: true, valorLiquido: true, comissaoGerada: true },
      }),
      req.db.servico.groupBy({
        by: ['local'],
        where: whereAtual,
        _count: true,
        _sum: { valorLiquido: true },
      }),
      req.db.servico.findMany({
        where: whereAtual,
        select: { criadoEm: true, valorLiquido: true },
        take: MAX_AGREGACAO,
      }),
    ]);
    const totalServicos = agg._count;
    const receitaBruta = agg._sum.valorCobrado ?? 0;
    const totalMaterial = agg._sum.valorMaterial ?? 0;
    const receitaLiquida = agg._sum.valorLiquido ?? 0;
    const ticketMedio = totalServicos > 0 ? receitaLiquida / totalServicos : 0;
    const totalComissao = agg._sum.comissaoGerada ?? 0;
    const lucro = receitaLiquida - totalComissao;
    const margemLucro =
      receitaBruta > 0 ? parseFloat(((lucro / receitaBruta) * 100).toFixed(1)) : 0;
    const receitaLiquidaAnterior = aggAnterior._sum.valorLiquido ?? 0;
    const totalServicosAnterior = aggAnterior._count;
    const ticketMedioAnterior =
      totalServicosAnterior > 0 ? receitaLiquidaAnterior / totalServicosAnterior : 0;
    const comparativo = {
      receitaLiquida: variacao(receitaLiquida, receitaLiquidaAnterior),
      totalServicos: variacao(totalServicos, totalServicosAnterior),
      ticketMedio: variacao(ticketMedio, ticketMedioAnterior),
    };
    // Resolve os nomes dos técnicos dos grupos e RE-COLAPSA por nome (preserva o comportamento
    // atual: técnicos homônimos somam numa única linha).
    const tecnicoIds = porTecnicoRaw.map((g) => g.tecnicoId);
    const tecnicos = tecnicoIds.length
      ? await req.db.tecnico.findMany({
          where: { id: { in: tecnicoIds } },
          select: { id: true, nome: true },
        })
      : [];
    const nomePorId = new Map(tecnicos.map((t) => [t.id, t.nome]));
    const mapasTecnico = {};
    for (const g of porTecnicoRaw) {
      const nome = nomePorId.get(g.tecnicoId) ?? '';
      if (!mapasTecnico[nome])
        mapasTecnico[nome] = {
          tecnico: nome,
          servicos: 0,
          receitaBruta: 0,
          receitaLiquida: 0,
          comissao: 0,
        };
      mapasTecnico[nome].servicos += g._count;
      mapasTecnico[nome].receitaBruta += g._sum.valorCobrado ?? 0;
      mapasTecnico[nome].receitaLiquida += g._sum.valorLiquido ?? 0;
      mapasTecnico[nome].comissao += g._sum.comissaoGerada ?? 0;
    }
    const porTecnico = Object.values(mapasTecnico)
      .map((t) => ({
        ...t,
        percentualReceita:
          receitaLiquida > 0
            ? parseFloat(((t.receitaLiquida / receitaLiquida) * 100).toFixed(1))
            : 0,
        ticketMedio: t.servicos > 0 ? parseFloat((t.receitaLiquida / t.servicos).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.receitaLiquida - a.receitaLiquida);
    const porLocal = porLocalRaw
      .map((g) => ({ local: g.local, quantidade: g._count, receita: g._sum.valorLiquido ?? 0 }))
      .sort((a, b) => b.receita - a.receita);
    const mapasDia = {};
    for (const s of servicosDia) {
      const dia = new Date(s.criadoEm).toISOString().split('T')[0];
      if (!mapasDia[dia]) mapasDia[dia] = { data: dia, receita: 0, servicos: 0 };
      mapasDia[dia].receita += s.valorLiquido;
      mapasDia[dia].servicos++;
    }
    const evolucaoDiaria = Object.values(mapasDia).sort((a, b) => a.data.localeCompare(b.data));
    res.json({
      totalServicos,
      receitaBruta,
      totalMaterial,
      receitaLiquida,
      ticketMedio,
      totalComissao,
      lucro,
      margemLucro,
      comparativo,
      porTecnico,
      porLocal,
      evolucaoDiaria,
    });
  } catch (erro) {
    logger.error('Erro GET /dashboard', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao calcular dashboard' });
  }
});

// F9/M2: indicadores operacionais do Gestor num único round-trip (o GestorHome antes fazia 3
// fetches). Presença do time HOJE = agregado sobre RegistroPonto (índice [empresaId, data]).
router.get('/gestor/indicadores', requirePermissao('dashboard', 'ver'), async (req, res) => {
  try {
    const hoje = diaLocal();
    const [pendentes, tecnicos, registrosHoje, aval] = await Promise.all([
      req.db.servico.count({ where: { status: 'pendente' } }),
      req.db.tecnico.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      }),
      req.db.registroPonto.findMany({
        where: { data: hoje },
        select: {
          tecnicoId: true,
          entradaEm: true,
          almocoSaidaEm: true,
          almocoVoltaEm: true,
          saidaEm: true,
        },
      }),
      req.db.avaliacao.aggregate({
        where: { status: 'respondida', nota: { not: null } },
        _avg: { nota: true },
        _count: true,
      }),
    ]);
    const regPorTecnico = new Map(registrosHoje.map((r) => [r.tecnicoId, r]));
    const presencaHoje = tecnicos.map((t) => {
      const r = regPorTecnico.get(t.id);
      let status = 'ausente';
      if (r) {
        if (r.saidaEm) status = 'encerrado';
        else if (r.almocoSaidaEm && !r.almocoVoltaEm) status = 'almoco';
        else if (r.entradaEm) status = 'trabalhando';
      }
      return { tecnicoId: t.id, nome: t.nome, status };
    });
    const presentes = presencaHoje.filter(
      (p) => p.status === 'trabalhando' || p.status === 'almoco'
    ).length;
    const media = aval._avg.nota != null ? parseFloat(aval._avg.nota.toFixed(2)) : null;
    res.json({
      pendentes,
      presentes,
      totalTecnicos: tecnicos.length,
      presencaHoje,
      avaliacoes: { media, total: aval._count },
    });
  } catch (erro) {
    logger.error('Erro GET /gestor/indicadores', {
      erro: erro.message,
      [JA_ENVIADO_AO_SENTRY]: true,
    });
    capturarErro(erro, {
      feature: 'gestor-indicadores',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── F9/M3: serviço em andamento ("serviço atual" do funcionário) ─────────────────
// Atrás da flag SERVICO_ANDAMENTO_ENABLED (off por padrão → 404). Transições de estado
// ADITIVAS sobre um serviço já existente do PRÓPRIO técnico: ativo → em_andamento
// (iniciar) → ativo (concluir), com iniciadoEm/finalizadoEm. Um único "atual" por técnico.
// Tudo via req.db (tenant) + filtro por tecnicoId → sem IDOR e sem vazamento cross-tenant.
function recursoServicoAtual(req, res, next) {
  if (env.SERVICO_ANDAMENTO_ENABLED !== 'true') {
    return res.status(404).json({ erro: 'Recurso não disponível' });
  }
  if (!req.user.tecnicoId || !podeProprio(req.user, 'registrar_servico')) {
    return res.status(403).json({ erro: 'Sem permissão para o serviço atual' });
  }
  return next();
}

const incluiTecnico = { tecnico: { select: { id: true, nome: true } } };

router.get('/me/servico-atual', recursoServicoAtual, async (req, res) => {
  try {
    const servico = await req.db.servico.findFirst({
      where: { tecnicoId: req.user.tecnicoId, status: 'em_andamento' },
      orderBy: { iniciadoEm: 'desc' },
      include: incluiTecnico,
    });
    res.json({ servico: servico ?? null });
  } catch (erro) {
    logger.error('Erro GET /me/servico-atual', {
      erro: erro.message,
      [JA_ENVIADO_AO_SENTRY]: true,
    });
    capturarErro(erro, {
      feature: 'servico-atual',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/servicos/:id/iniciar', recursoServicoAtual, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'id inválido' });
  try {
    // Um único "atual" por técnico. Se já há um em andamento: reiniciar o MESMO é
    // idempotente (200, sem reescrever iniciadoEm); qualquer OUTRO é recusado (409).
    const atual = await req.db.servico.findFirst({
      where: { tecnicoId: req.user.tecnicoId, status: 'em_andamento' },
      select: { id: true },
    });
    if (atual) {
      if (atual.id !== id) {
        return res
          .status(409)
          .json({ erro: 'Já existe um serviço em andamento', servicoId: atual.id });
      }
      const servico = await req.db.servico.findFirst({ where: { id }, include: incluiTecnico });
      return res.json({ servico });
    }
    // updateMany escopado (tenant + tecnicoId próprio + status ativo): só transiciona o
    // serviço do técnico que ainda está "ativo". count=0 → não existe/não elegível.
    const r = await req.db.servico.updateMany({
      where: { id, tecnicoId: req.user.tecnicoId, status: 'ativo' },
      data: { status: 'em_andamento', iniciadoEm: new Date() },
    });
    if (r.count === 0)
      return res.status(404).json({ erro: 'Serviço não encontrado ou não elegível' });
    const servico = await req.db.servico.findFirst({ where: { id }, include: incluiTecnico });
    res.json({ servico });
  } catch (erro) {
    logger.error('Erro POST /servicos/:id/iniciar', {
      erro: erro.message,
      [JA_ENVIADO_AO_SENTRY]: true,
    });
    capturarErro(erro, {
      feature: 'servico-atual',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
      extra: { servicoId: id },
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/servicos/:id/concluir', recursoServicoAtual, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'id inválido' });
  try {
    const r = await req.db.servico.updateMany({
      where: { id, tecnicoId: req.user.tecnicoId, status: 'em_andamento' },
      data: { status: 'ativo', finalizadoEm: new Date() },
    });
    if (r.count === 0) return res.status(404).json({ erro: 'Serviço em andamento não encontrado' });
    const servico = await req.db.servico.findFirst({ where: { id }, include: incluiTecnico });
    res.json({ servico });
  } catch (erro) {
    logger.error('Erro POST /servicos/:id/concluir', {
      erro: erro.message,
      [JA_ENVIADO_AO_SENTRY]: true,
    });
    capturarErro(erro, {
      feature: 'servico-atual',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
      extra: { servicoId: id },
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
