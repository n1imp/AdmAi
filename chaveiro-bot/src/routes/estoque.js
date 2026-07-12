import { Router } from 'express';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { gerarRelatorioPDF } from '../services/relatorio.js';
import { movimentarEstoque } from '../services/estoque.js';
import { conferirMagicBytes } from '../utils/upload.js';
import { storageHabilitado, uploadImagem } from '../services/storage.js';
import { requireAuth, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const UPLOADS_DIR = path.resolve('./uploads');
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const imagemUrlSchema = z.string()
  .refine((v) => v === '' || /^https?:\/\//.test(v) || v.startsWith('/uploads/'), 'URL de imagem inválida')
  .optional().nullable();

router.get('/materiais', requirePermissao('estoque', 'ver'), async (req, res) => {
  try {
    const materiais = await req.db.material.findMany({ include: { _count: { select: { servicos: true } } }, orderBy: { nome: 'asc' } });
    res.json(materiais.map((m) => ({
      id: m.id, nome: m.nome, descricao: m.descricao, imagemUrl: m.imagemUrl, unidade: m.unidade,
      precoUnit: m.precoUnit, precoVenda: m.precoVenda, estoqueMinimo: m.estoqueMinimo,
      quantidadeAtual: m.quantidadeAtual, vezesUsado: m._count.servicos, criadoEm: m.criadoEm,
    })));
  } catch (erro) {
    logger.error('Erro GET /materiais', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/materiais/upload', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const parse = z.object({ imagem: z.string().regex(/^data:image\/(jpeg|png|webp|gif);base64,/, 'Formato de imagem inválido') }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Imagem inválida (use JPEG, PNG, WEBP ou GIF)' });
    const [cabecalho, dados] = parse.data.imagem.split(',');
    const mime = cabecalho.match(/data:(image\/\w+);base64/)?.[1];
    const ext = MIME_EXT[mime] ?? 'jpg';
    const buffer = Buffer.from(dados, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(413).json({ erro: 'Imagem muito grande (máx. 5MB)' });
    if (!conferirMagicBytes(buffer, mime)) return res.status(400).json({ erro: 'Imagem inválida (conteúdo não confere com o tipo)' });
    const nomeArquivo = `produto-${randomUUID()}.${ext}`;
    let url;
    if (storageHabilitado()) {
      url = await uploadImagem('estoque', nomeArquivo, buffer, mime);
    } else {
      await mkdir(UPLOADS_DIR, { recursive: true });
      await writeFile(path.join(UPLOADS_DIR, nomeArquivo), buffer);
      url = `/uploads/${nomeArquivo}`;
    }
    logger.info('Imagem de produto enviada', { nomeArquivo, bytes: buffer.length, destino: storageHabilitado() ? 'supabase' : 'disco' });
    res.status(201).json({ url });
  } catch (erro) {
    logger.error('Erro POST /materiais/upload', { erro: erro.message });
    res.status(500).json({ erro: 'Erro ao salvar imagem' });
  }
});

router.post('/materiais', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(1), descricao: z.string().optional().nullable(), imagemUrl: imagemUrlSchema,
      unidade: z.string().default('un'), precoUnit: z.number().nonnegative().optional().nullable(),
      precoVenda: z.number().nonnegative().optional().nullable(), estoqueMinimo: z.number().nonnegative().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const data = { ...parse.data };
    if (data.imagemUrl === '') data.imagemUrl = null;
    const material = await req.db.material.create({ data });
    res.status(201).json(material);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Material já cadastrado com esse nome' });
    logger.error('Erro POST /materiais', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/materiais/:id', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      nome: z.string().min(1).optional(), descricao: z.string().optional().nullable(), imagemUrl: imagemUrlSchema,
      unidade: z.string().optional(), precoUnit: z.number().nonnegative().optional().nullable(),
      precoVenda: z.number().nonnegative().optional().nullable(), estoqueMinimo: z.number().nonnegative().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const data = { ...parse.data };
    if (data.imagemUrl === '') data.imagemUrl = null;
    const r = await req.db.material.updateMany({ where: { id }, data });
    if (r.count === 0) return res.status(404).json({ erro: 'Material não encontrado' });
    const material = await req.db.material.findUnique({ where: { id } });
    res.json(material);
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Material não encontrado' });
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Já existe um material com esse nome' });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/materiais/:id', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const mat = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!mat) return res.status(404).json({ erro: 'Material não encontrado' });
    const count = await req.db.servicoMaterial.count({ where: { materialId: id } });
    if (count > 0) return res.status(409).json({ erro: 'Material em uso em serviços e não pode ser removido' });
    await req.db.material.deleteMany({ where: { id } });
    res.json({ mensagem: 'Material removido com sucesso' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Material não encontrado' });
    logger.error('Erro DELETE /materiais/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/estoque', requirePermissao('estoque', 'ver'), async (req, res) => {
  try {
    const diasNum = Math.max(1, Number.parseInt(req.query.periodo ?? '30', 10) || 30);
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasNum);
    const materiais = await req.db.material.findMany({
      include: { servicos: { where: { servico: { criadoEm: { gte: dataInicio } } }, select: { quantidade: true } } },
      orderBy: { nome: 'asc' },
    });
    const resultado = materiais.map((m) => {
      const consumoPeriodo = m.servicos.reduce((s, x) => s + x.quantidade, 0);
      const alerta = m.estoqueMinimo != null && m.quantidadeAtual <= m.estoqueMinimo;
      return { id: m.id, nome: m.nome, unidade: m.unidade, imagemUrl: m.imagemUrl, quantidadeAtual: m.quantidadeAtual, consumoPeriodo, estoqueMinimo: m.estoqueMinimo, alerta };
    });
    resultado.sort((a, b) => {
      if (a.alerta && !b.alerta) return -1;
      if (!a.alerta && b.alerta) return 1;
      return a.nome.localeCompare(b.nome);
    });
    res.json(resultado);
  } catch (erro) {
    logger.error('Erro GET /estoque', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/materiais/:id/movimentacao', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const parse = z.object({ tipo: z.enum(['entrada', 'saida', 'ajuste']), quantidade: z.number().positive(), observacao: z.string().optional().nullable() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const dono = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!dono) return res.status(404).json({ erro: 'Material não encontrado' });
    const { material, movimentacao } = await movimentarEstoque({
      materialId: id, tipo: parse.data.tipo, quantidade: parse.data.quantidade,
      origem: parse.data.tipo === 'ajuste' ? 'ajuste' : 'manual', observacao: parse.data.observacao ?? null,
    });
    logger.info('Movimentação de estoque', { materialId: id, tipo: parse.data.tipo, saldoApos: material.quantidadeAtual });
    res.status(201).json({ quantidadeAtual: material.quantidadeAtual, movimentacao });
  } catch (erro) {
    if (erro.message === 'Material não encontrado') return res.status(404).json({ erro: erro.message });
    logger.error('Erro POST /materiais/:id/movimentacao', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/materiais/:id/movimentacoes', requirePermissao('estoque', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const dono = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!dono) return res.status(404).json({ erro: 'Material não encontrado' });
    const movimentacoes = await prisma.movimentacaoEstoque.findMany({ where: { materialId: id }, orderBy: { criadoEm: 'desc' }, take: 50 });
    res.json(movimentacoes);
  } catch (erro) {
    logger.error('Erro GET /materiais/:id/movimentacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/relatorio/pdf', requirePermissao('financeiro', 'ver'), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ erro: 'Parâmetros "inicio" e "fim" são obrigatórios (YYYY-MM-DD)' });
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim + 'T23:59:59.999Z');
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) return res.status(400).json({ erro: 'Datas inválidas' });
    const pdfBuffer = await gerarRelatorioPDF(dataInicio, dataFim, req.user.empresaId);
    const nomeArquivo = `relatorio_${inicio}_${fim}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(pdfBuffer);
  } catch (erro) {
    logger.error('Erro GET /relatorio/pdf', { erro: erro.message });
    res.status(500).json({ erro: 'Erro ao gerar relatório PDF' });
  }
});

export default router;
