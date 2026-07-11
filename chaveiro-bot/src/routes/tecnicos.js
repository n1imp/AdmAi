import { Router } from 'express';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { gerarRelatorioPonto, gerarCsvPonto } from '../services/relatorio.js';
import { resumoMes, registrarPonto, diaLocal, ROTULO_BATIDA } from '../services/ponto.js';
import { criarAcessoTecnico, resetarPin } from '../services/credenciais.js';
import { pode, podeProprio } from '../services/permissoes.js';
import { canonizarTelefone } from '../services/parser.js';
import { conferirMagicBytes } from '../utils/upload.js';
import { requireAuth, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const MAX_AGREGACAO = 10_000;
const MODALIDADES = ['clt', 'clt_meio', 'clt_12x36', 'intermitente', 'autonomo'];
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PONTO_SELFIES_DIR = path.resolve('./uploads-ponto');
const SELFIE_PONTO_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const SELFIE_ARQUIVO_RE = /^ponto-[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

const dataOpcional = z.union([z.string(), z.null()]).optional().transform((v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
});

const schemaNovoTecnico = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(10).optional().nullable(),
  comissao: z.number().min(0).max(100).default(0),
  metaMensal: z.number().nonnegative().nullable().optional(),
  cpf: z.string().max(20).optional().nullable(),
  dataNascimento: dataOpcional,
  endereco: z.string().max(300).optional().nullable(),
  nivelAcesso: z.string().max(40).optional().nullable(),
  modalidade: z.enum(MODALIDADES).optional().nullable(),
  salarioBase: z.number().nonnegative().optional().nullable(),
  dataAdmissao: dataOpcional,
  horaExtraAtiva: z.boolean().optional(),
  horaExtraPercentual: z.number().nonnegative().optional().nullable(),
  adicionalNoturno: z.boolean().optional(),
  valorHora: z.number().nonnegative().optional().nullable(),
  jornadaDiariaMin: z.number().int().positive().optional().nullable(),
  jornadaSemanalMin: z.number().int().positive().optional().nullable(),
  fotoPerfil: z.string().optional().nullable(),
  criarAcesso: z.boolean().optional(),
}).superRefine((d, ctx) => {
  if (d.dataNascimento === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataNascimento'], message: 'Data inválida' });
  if (d.dataAdmissao === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataAdmissao'], message: 'Data inválida' });
});

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

function intervaloMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  return { inicio: new Date(Date.UTC(ano, m - 1, 1)), fim: new Date(Date.UTC(ano, m, 1)) };
}

function urlSelfieApi(selfieUrl) {
  return selfieUrl ? `/api/ponto/selfie/${path.basename(selfieUrl)}` : null;
}

async function salvarSelfiePonto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(dataUrl ?? '');
  if (!m) { const e = new Error('selfie inválida'); e.codigo = 'selfie'; throw e; }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) { const e = new Error('selfie grande'); e.codigo = 'selfie'; throw e; }
  if (!conferirMagicBytes(buffer, m[1])) { const e = new Error('selfie inválida'); e.codigo = 'selfie'; throw e; }
  await mkdir(PONTO_SELFIES_DIR, { recursive: true });
  const nome = `ponto-${randomUUID()}.${SELFIE_PONTO_MIME[m[1]] ?? 'jpg'}`;
  await writeFile(path.join(PONTO_SELFIES_DIR, nome), buffer);
  return `/uploads-ponto/${nome}`;
}

async function carregarPontoHoje(tecnicoId, agora) {
  const data = diaLocal(agora);
  const reg = await prisma.registroPonto.findUnique({
    where: { tecnicoId_data: { tecnicoId, data } },
    include: { batidas: { orderBy: { em: 'asc' } } },
  });
  const proximo = !reg || !reg.entradaEm ? 'entrada'
    : !reg.almocoSaidaEm ? 'almoco_saida'
    : !reg.almocoVoltaEm ? 'almoco_volta'
    : !reg.saidaEm ? 'saida' : null;
  return {
    data, entradaEm: reg?.entradaEm ?? null, almocoSaidaEm: reg?.almocoSaidaEm ?? null,
    almocoVoltaEm: reg?.almocoVoltaEm ?? null, saidaEm: reg?.saidaEm ?? null,
    completo: proximo === null, proximaBatida: proximo,
    proximaBatidaRotulo: proximo ? ROTULO_BATIDA[proximo] : null,
    batidas: (reg?.batidas ?? []).map((b) => ({
      tipo: b.tipo, rotulo: ROTULO_BATIDA[b.tipo] ?? b.tipo, em: b.em,
      lat: b.lat, lng: b.lng, temSelfie: Boolean(b.selfieUrl), selfieUrl: urlSelfieApi(b.selfieUrl),
    })),
  };
}

const pontoBaterSchema = z.object({
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  precisao: z.number().optional().nullable(),
  selfie: z.string().optional().nullable(),
});

router.get('/tecnicos', requirePermissao('tecnicos', 'ver'), async (req, res) => {
  try {
    const tecnicos = await req.db.tecnico.findMany({
      include: {
        servicos: { where: { status: 'ativo' }, select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true } },
        pagamentos: { select: { valor: true } },
        usuario: { select: { admin: true } },
      },
      orderBy: { nome: 'asc' },
    });
    const resultado = tecnicos.map((t) => {
      const totalComissaoGanha = t.servicos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
      const totalRecebido = t.pagamentos.reduce((s, x) => s + x.valor, 0);
      return {
        id: t.id, nome: t.nome,
        telefone: t.telefoneDisplay ?? (t.telefone && t.telefone.length <= 13 ? t.telefone : null),
        telefoneDisplay: t.telefoneDisplay, comissao: t.comissao, metaMensal: t.metaMensal,
        fotoPerfil: t.fotoPerfil, ativo: t.ativo, ehDono: t.usuario?.admin === true,
        criadoEm: t.criadoEm, totalServicos: t.servicos.length,
        receitaBruta: t.servicos.reduce((s, x) => s + x.valorCobrado, 0),
        receitaLiquida: t.servicos.reduce((s, x) => s + x.valorLiquido, 0),
        totalComissaoGanha, totalRecebido, saldoPendente: totalComissaoGanha - totalRecebido,
      };
    });
    res.json(resultado);
  } catch (erro) {
    logger.error('Erro GET /tecnicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/tecnicos', requirePermissao('tecnicos', 'editar'), async (req, res) => {
  try {
    const parse = schemaNovoTecnico.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const d = parse.data;
    const canonico = d.telefone ? canonizarTelefone(d.telefone) : null;
    const tecnico = await req.db.tecnico.create({
      data: {
        nome: d.nome, telefone: canonico, telefoneDisplay: d.telefone ?? null,
        comissao: d.comissao, metaMensal: d.metaMensal ?? null, cpf: d.cpf ?? null,
        dataNascimento: d.dataNascimento ?? null, endereco: d.endereco ?? null,
        nivelAcesso: d.nivelAcesso ?? null, modalidade: d.modalidade ?? null,
        salarioBase: d.salarioBase ?? null, dataAdmissao: d.dataAdmissao ?? null,
        horaExtraAtiva: d.horaExtraAtiva ?? false, horaExtraPercentual: d.horaExtraPercentual ?? null,
        adicionalNoturno: d.adicionalNoturno ?? false, valorHora: d.valorHora ?? null,
        jornadaDiariaMin: d.jornadaDiariaMin ?? null, jornadaSemanalMin: d.jornadaSemanalMin ?? null,
        fotoPerfil: d.fotoPerfil ?? null,
      },
    });
    let acesso = null;
    if (d.criarAcesso !== false && canonico) {
      const papel = (req.user.papel === 'dono' && d.nivelAcesso === 'gestor') ? 'gestor' : 'funcionario';
      try {
        const r = await criarAcessoTecnico({ tecnico, empresaId: req.user.empresaId, papel });
        acesso = { usuarioId: r.usuario.id, username: r.usuario.username, telefone: r.usuario.telefone, pin: r.pin, papel };
      } catch (e) {
        logger.warn('Técnico criado, mas acesso falhou', { tecnicoId: tecnico.id, erro: e.message });
      }
    }
    res.status(201).json({ ...tecnico, acesso });
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Telefone já cadastrado' });
    logger.error('Erro POST /tecnicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/tecnicos/:id/acesso', requirePermissao('tecnicos', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    if (tecnico.usuarioId) return res.status(409).json({ erro: 'Técnico já tem acesso ao painel' });
    const papel = (req.user.papel === 'dono' && req.body?.papel === 'gestor') ? 'gestor' : 'funcionario';
    try {
      const r = await criarAcessoTecnico({ tecnico, empresaId: req.user.empresaId, papel });
      logger.info('acesso_tecnico_criado', { tecnicoId: id, usuarioId: r.usuario.id, papel });
      return res.status(201).json({ usuarioId: r.usuario.id, username: r.usuario.username, telefone: r.usuario.telefone, pin: r.pin, papel });
    } catch (e) {
      if (e.codigo === 'sem_telefone') return res.status(400).json({ erro: 'Técnico sem telefone — adicione um telefone antes de criar o acesso' });
      throw e;
    }
  } catch (erro) {
    logger.error('Erro POST /tecnicos/:id/acesso', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/tecnicos/:id/acesso/reset', requirePermissao('tecnicos', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    if (!tecnico.usuarioId) return res.status(409).json({ erro: 'Técnico ainda não tem acesso ao painel' });
    const pin = await resetarPin(tecnico.usuarioId);
    logger.info('acesso_tecnico_reset', { tecnicoId: id, usuarioId: tecnico.usuarioId });
    res.json({ usuarioId: tecnico.usuarioId, pin });
  } catch (erro) {
    logger.error('Erro POST /tecnicos/:id/acesso/reset', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/tecnicos/:id/ponto', requirePermissao('ponto', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const mes = String(req.query.mes ?? '');
    if (!MES_RE.test(mes)) return res.status(400).json({ erro: 'Parâmetro mes inválido (use YYYY-MM)' });
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    const { inicio, fim } = intervaloMes(mes);
    const registros = await req.db.registroPonto.findMany({ where: { tecnicoId: id, data: { gte: inicio, lt: fim } }, orderBy: { data: 'asc' }, take: MAX_AGREGACAO });
    const resumo = resumoMes(tecnico, registros);
    res.json({ mes, tecnico: { id: tecnico.id, nome: tecnico.nome, modalidade: tecnico.modalidade }, ...resumo });
  } catch (erro) {
    logger.error('Erro GET /tecnicos/:id/ponto', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/tecnicos/:id/ponto/relatorio', requirePermissao('ponto', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const mes = String(req.query.mes ?? '');
    if (!MES_RE.test(mes)) return res.status(400).json({ erro: 'Parâmetro mes inválido (use YYYY-MM)' });
    const formato = String(req.query.formato ?? 'pdf').toLowerCase();
    const empresaId = req.user.empresaId;
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    if (formato === 'csv') {
      const csv = await gerarCsvPonto(empresaId, id, mes);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ponto-${id}-${mes}.csv"`);
      return res.send('﻿' + csv);
    }
    const pdf = await gerarRelatorioPonto(empresaId, id, mes);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ponto-${id}-${mes}.pdf"`);
    return res.send(pdf);
  } catch (erro) {
    logger.error('Erro GET /tecnicos/:id/ponto/relatorio', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/tecnicos/:id/perfil', requirePermissao('tecnicos', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);
    const filtroMesAtual = construirFiltroPeriodo('mes');
    const [tecnico, servicosPeriodo, aggTodos, pagamentos, aggMesAtual] = await Promise.all([
      req.db.tecnico.findUnique({ where: { id } }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroDatas }, orderBy: { criadoEm: 'desc' }, take: MAX_AGREGACAO }),
      // Totais (comissão ganha / nº serviços) somados no banco em vez de load-all + reduce (F3.2).
      req.db.servico.aggregate({ where: { tecnicoId: id, status: 'ativo' }, _sum: { comissaoGerada: true }, _count: true }),
      req.db.pagamento.findMany({ where: { tecnicoId: id }, orderBy: { criadoEm: 'desc' }, take: MAX_AGREGACAO }),
      req.db.servico.aggregate({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroMesAtual }, _sum: { valorLiquido: true } }),
    ]);
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    const totalComissaoGanha = aggTodos._sum.comissaoGerada ?? 0;
    const totalRecebido = pagamentos.reduce((s, x) => s + x.valor, 0);
    const receitaMesAtual = aggMesAtual._sum.valorLiquido ?? 0;
    const meta = tecnico.metaMensal && tecnico.metaMensal > 0
      ? { metaMensal: tecnico.metaMensal, receitaMes: receitaMesAtual, progresso: parseFloat(((receitaMesAtual / tecnico.metaMensal) * 100).toFixed(1)), atingida: receitaMesAtual >= tecnico.metaMensal }
      : { metaMensal: null, receitaMes: receitaMesAtual, progresso: null, atingida: false };
    const mapasDia = {};
    for (const s of servicosPeriodo) {
      const dia = new Date(s.criadoEm).toISOString().split('T')[0];
      if (!mapasDia[dia]) mapasDia[dia] = { data: dia, servicos: 0, receita: 0, comissao: 0 };
      mapasDia[dia].servicos++;
      mapasDia[dia].receita += s.valorLiquido;
      mapasDia[dia].comissao += s.comissaoGerada ?? 0;
    }
    res.json({
      tecnico: { ...tecnico, totalServicos: aggTodos._count, totalComissaoGanha, totalRecebido, saldoPendente: totalComissaoGanha - totalRecebido },
      meta,
      periodo: { servicos: servicosPeriodo, totalServicos: servicosPeriodo.length, receitaLiquida: servicosPeriodo.reduce((s, x) => s + x.valorLiquido, 0), comissaoGerada: servicosPeriodo.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0), evolucaoDiaria: Object.values(mapasDia).sort((a, b) => a.data.localeCompare(b.data)) },
      pagamentos,
    });
  } catch (erro) {
    logger.error('Erro GET /tecnicos/:id/perfil', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/tecnicos/:id', requirePermissao('tecnicos', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      ativo: z.boolean().optional(), comissao: z.number().min(0).max(100).optional(),
      metaMensal: z.number().nonnegative().nullable().optional(), nome: z.string().min(2).optional(),
      telefone: z.string().optional().nullable(), telefoneDisplay: z.string().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const r = await req.db.tecnico.updateMany({ where: { id }, data: parse.data });
    if (r.count === 0) return res.status(404).json({ erro: 'Técnico não encontrado' });
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    res.json(tecnico);
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Técnico não encontrado' });
    logger.error('Erro PATCH /tecnicos/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/pagamentos', requirePermissao('financeiro', 'editar'), async (req, res) => {
  try {
    const parse = z.object({ tecnicoId: z.number().int().positive(), valor: z.number().positive(), descricao: z.string().optional() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const tec = await req.db.tecnico.findUnique({ where: { id: parse.data.tecnicoId }, select: { id: true } });
    if (!tec) return res.status(404).json({ erro: 'Técnico não encontrado' });
    const pagamento = await req.db.pagamento.create({ data: parse.data });
    logger.info('Pagamento registrado', { tecnicoId: parse.data.tecnicoId, valor: parse.data.valor });
    res.status(201).json(pagamento);
  } catch (erro) {
    logger.error('Erro POST /pagamentos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/ponto/bater', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'bater_ponto')) return res.status(403).json({ erro: 'Sem permissão para bater ponto' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const parse = pontoBaterSchema.safeParse(req.body ?? {});
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const agora = new Date();
    const r = await registrarPonto({ empresaId: req.user.empresaId, tecnicoId: req.user.tecnicoId, agora });
    if (r.tipo) {
      let selfieUrl = null;
      if (parse.data.selfie) {
        try { selfieUrl = await salvarSelfiePonto(parse.data.selfie); }
        catch { return res.status(400).json({ erro: 'Selfie inválida (use JPEG/PNG/WEBP até 5MB)' }); }
      }
      await prisma.batidaPonto.create({
        data: { registroId: r.registroId, tipo: r.tipo, em: agora, lat: parse.data.lat ?? null, lng: parse.data.lng ?? null, precisao: parse.data.precisao ?? null, selfieUrl, origem: 'painel' },
      });
      logger.info('ponto_batido_painel', { tecnicoId: req.user.tecnicoId, tipo: r.tipo, geo: parse.data.lat != null, selfie: Boolean(selfieUrl) });
    }
    const dia = await carregarPontoHoje(req.user.tecnicoId, agora);
    res.status(r.tipo ? 201 : 200).json({ tipo: r.tipo, rotulo: r.tipo ? ROTULO_BATIDA[r.tipo] : null, jaCompleto: r.tipo === null, ...dia });
  } catch (erro) {
    logger.error('Erro POST /ponto/bater', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/ponto/hoje', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'bater_ponto')) return res.status(403).json({ erro: 'Sem permissão' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    res.json(await carregarPontoHoje(req.user.tecnicoId, new Date()));
  } catch (erro) {
    logger.error('Erro GET /ponto/hoje', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/ponto/selfie/:arquivo', async (req, res) => {
  try {
    const arquivo = String(req.params.arquivo ?? '');
    if (!SELFIE_ARQUIVO_RE.test(arquivo)) return res.status(400).json({ erro: 'Arquivo inválido' });
    const batida = await prisma.batidaPonto.findFirst({
      where: { selfieUrl: `/uploads-ponto/${arquivo}` },
      select: { registro: { select: { empresaId: true, tecnicoId: true } } },
    });
    if (!batida || batida.registro.empresaId !== req.user.empresaId) return res.status(404).json({ erro: 'Selfie não encontrada' });
    const ehProprio = req.user.tecnicoId === batida.registro.tecnicoId;
    if (!ehProprio && !pode(req.user, 'ponto', 'ver')) {
      return res.status(403).json({ erro: 'Sem permissão para ver esta selfie' });
    }
    const caminho = path.join(PONTO_SELFIES_DIR, arquivo);
    if (!existsSync(caminho)) return res.status(404).json({ erro: 'Selfie não encontrada' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(caminho);
  } catch (erro) {
    logger.error('Erro GET /ponto/selfie', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
