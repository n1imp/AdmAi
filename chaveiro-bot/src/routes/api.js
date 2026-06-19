import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { prismaParaEmpresa } from '../db/tenant.js';
import { gerarRelatorioPDF } from '../services/relatorio.js';
import { buscarOuCriarTecnico } from '../services/servico.js';
import { movimentarEstoque, darBaixaPorServico } from '../services/estoque.js';
import { agendarAvaliacao } from '../services/avaliacao.js';
import { resolverPreferencias } from '../services/notificacao.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { contemInsensivel } from '../utils/busca.js';
import { gerarJWT, verificarJWT, tokenAindaValido } from '../services/auth.js';
import { avaliarForcaSenha } from '../services/senha.js';

export const apiRouter = Router();

// ── MIDDLEWARES DE AUTENTICAÇÃO ───────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Token ausente' });
  try {
    const payload = verificarJWT(token);
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.id } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!tokenAindaValido(payload, usuario.tokenValidoApos)) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    req.user = { id: usuario.id, nome: usuario.nome, admin: usuario.admin, empresaId: usuario.empresaId };
    // Client Prisma escopado à empresa do usuário — TODA query de negócio usa req.db.
    req.db = prismaParaEmpresa(usuario.empresaId);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user?.admin) return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  next();
}

export { requireAuth };

// ── HELPERS ────────────────────────────────────────────────────────────────────

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
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    return { gte: inicioSemana, lte: agora };
  }
  if (periodo === 'mes') {
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return { gte: inicioMes, lte: agora };
  }
  if (inicio && fim) {
    return { gte: new Date(inicio), lte: new Date(fim + 'T23:59:59.999Z') };
  }
  if (inicio) {
    return { gte: new Date(inicio), lte: agora };
  }
  if (fim) {
    return { gte: new Date('2000-01-01'), lte: new Date(fim + 'T23:59:59.999Z') };
  }
  const umMesAtras = new Date(hoje);
  umMesAtras.setMonth(hoje.getMonth() - 1);
  return { gte: umMesAtras, lte: agora };
}

// Calcula o intervalo imediatamente anterior, de mesma duração, para comparativos
function construirFiltroPeriodoAnterior(filtroAtual) {
  const inicio = filtroAtual.gte instanceof Date ? filtroAtual.gte : new Date(filtroAtual.gte);
  const fim = filtroAtual.lte instanceof Date ? filtroAtual.lte : new Date(filtroAtual.lte);
  const duracaoMs = fim.getTime() - inicio.getTime();
  return {
    gte: new Date(inicio.getTime() - duracaoMs),
    lte: new Date(inicio.getTime() - 1),
  };
}

// Variação percentual entre dois valores (null quando a base é zero)
function variacao(atual, anterior) {
  if (!anterior || anterior === 0) return atual > 0 ? null : 0;
  return parseFloat((((atual - anterior) / anterior) * 100).toFixed(1));
}

// Gera um slug único de empresa a partir do nome (kebab-case + sufixo se colidir).
async function gerarSlugEmpresa(nome) {
  const base = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';
  let slug = base;
  let n = 1;
  // Garante unicidade
  while (await prisma.empresa.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// ── ROTAS PÚBLICAS (sem auth) ─────────────────────────────────────────────────

// POST /api/auth/login
apiRouter.post('/auth/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  const { username, password } = parse.data;
  try {
    const usuario = await prisma.usuario.findUnique({ where: { username } });
    if (!usuario) {
      logger.info('login_failure', { username, motivo: 'user_not_found' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    if (!usuario.ativo) {
      logger.info('login_failure', { username, motivo: 'user_inactive' });
      return res.status(401).json({ erro: 'Usuário inativo' });
    }
    const senhaCorreta = await bcrypt.compare(password, usuario.senhaHash);
    if (!senhaCorreta) {
      logger.info('login_failure', { username, motivo: 'invalid_password' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id });
    res.json({ token, nome: usuario.nome, admin: usuario.admin });
  } catch (erro) {
    logger.error('Erro POST /auth/login', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/setup — cria o primeiro admin (bloqueado se já existe usuário)
apiRouter.post('/setup', async (req, res) => {
  try {
    const count = await prisma.usuario.count();
    if (count > 0) return res.status(409).json({ erro: 'Setup já foi realizado' });

    const schema = z.object({
      nome: z.string().min(2),
      nomeEmpresa: z.string().min(2),
      username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });

    const { nome, nomeEmpresa, username, senha } = parse.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    const slug = await gerarSlugEmpresa(nomeEmpresa);

    // 1º usuário cria a empresa e vira dono/admin dela (transação atômica).
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      return tx.usuario.create({
        data: { nome, username, senhaHash, admin: true, empresaId: empresa.id },
        select: { id: true, nome: true, username: true, admin: true, empresaId: true },
      });
    });
    const token = gerarJWT(usuario);
    res.status(201).json({ token, ...usuario });
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Username já em uso' });
    logger.error('Erro POST /setup', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/auth/register — auto-cadastro público (usuário comum)
// Cadastro rígido: e-mail obrigatório e único, senha forte.
const registerSchema = z.object({
  nome:        z.string().min(2),
  nomeEmpresa: z.string().min(2),
  username:    z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
  email:       z.string().email(),
  telefone:    z.string().min(8).max(20).optional().nullable(),
  senha:       z.string().min(8),
});

apiRouter.post('/auth/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });

  const { nome, nomeEmpresa, username, email, telefone, senha } = parse.data;
  const forca = avaliarForcaSenha(senha);
  if (!forca.valida) return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });

  const senhaHash = await bcrypt.hash(senha, 12);

  try {
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    // Cada cadastro público cria sua própria empresa; o usuário é o dono (admin).
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      return tx.usuario.create({
        data: { nome, username, email, telefone: telefone ?? null, senhaHash, admin: true, empresaId: empresa.id },
        select: { id: true, nome: true, username: true, email: true, admin: true, ativo: true, empresaId: true, criadoEm: true },
      });
    });
    const token = gerarJWT(usuario);
    logger.info({ event: 'user_registered', userId: usuario.id });
    return res.status(201).json({ token, ...usuario });
  } catch (erro) {
    if (erro.code === 'P2002') {
      const campo = erro.meta?.target?.includes('email') ? 'E-mail' : 'Username';
      return res.status(409).json({ erro: `${campo} já em uso` });
    }
    logger.error('Erro POST /auth/register', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── MIDDLEWARE GLOBAL — aplica às rotas abaixo ────────────────────────────────
apiRouter.use(requireAuth);

// ── CONTA DO USUÁRIO LOGADO (/me) ─────────────────────────────────────────────

const SELECT_ME = {
  id: true, nome: true, username: true, email: true, telefone: true,
  admin: true, ativo: true, emailVerificado: true, telefoneVerificado: true,
  twoFactorAtivo: true, senhaAlteradaEm: true, criadoEm: true,
};

// GET /api/me — dados do usuário autenticado
apiRouter.get('/me', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: SELECT_ME });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (erro) {
    logger.error('Erro GET /me', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/me — atualiza nome, e-mail e telefone do próprio usuário
apiRouter.patch('/me', async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2).optional(),
      email: z.string().email().optional().nullable().or(z.literal('')),
      telefone: z.string().min(8).max(20).optional().nullable().or(z.literal('')),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });

    const data = {};
    const atual = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    if (parse.data.nome !== undefined) data.nome = parse.data.nome;
    // Trocar e-mail reseta a verificação
    if (parse.data.email !== undefined) {
      const email = parse.data.email === '' ? null : parse.data.email;
      data.email = email;
      if (email !== atual.email) data.emailVerificado = false;
    }
    // Trocar telefone reseta a verificação
    if (parse.data.telefone !== undefined) {
      const telefone = parse.data.telefone === '' ? null : parse.data.telefone;
      data.telefone = telefone;
      if (telefone !== atual.telefone) data.telefoneVerificado = false;
    }

    const usuario = await prisma.usuario.update({ where: { id: req.user.id }, data, select: SELECT_ME });
    res.json(usuario);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'E-mail já em uso por outra conta' });
    logger.error('Erro PATCH /me', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/me/senha — troca de senha validando a senha atual
apiRouter.patch('/me/senha', async (req, res) => {
  try {
    const schema = z.object({
      senhaAtual: z.string().min(1),
      novaSenha: z.string().min(8),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const { senhaAtual, novaSenha } = parse.data;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    const confere = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!confere) return res.status(401).json({ erro: 'Senha atual incorreta' });

    const forca = avaliarForcaSenha(novaSenha);
    if (!forca.valida) return res.status(400).json({ erro: 'A nova senha é muito fraca', requisitos: forca.requisitos });

    const senhaHash = await bcrypt.hash(novaSenha, 12);
    const agora = new Date();
    // Invalida todas as sessões antigas — o próprio cliente recebe novo token
    await prisma.usuario.update({
      where: { id: req.user.id },
      data: { senhaHash, senhaAlteradaEm: agora, tokenValidoApos: agora },
    });
    const token = gerarJWT(usuario);
    logger.info('senha_alterada', { userId: req.user.id });
    res.json({ mensagem: 'Senha alterada com sucesso', token });
  } catch (erro) {
    logger.error('Erro PATCH /me/senha', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/me/2fa — ativa/desativa 2FA (estrutura; fluxo TOTP plugável depois)
apiRouter.patch('/me/2fa', async (req, res) => {
  try {
    const schema = z.object({ ativo: z.boolean() });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const usuario = await prisma.usuario.update({
      where: { id: req.user.id },
      data: { twoFactorAtivo: parse.data.ativo },
      select: SELECT_ME,
    });
    res.json(usuario);
  } catch (erro) {
    logger.error('Erro PATCH /me/2fa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/logout-all — invalida todas as sessões (todos os dispositivos)
apiRouter.post('/me/logout-all', async (req, res) => {
  try {
    await prisma.usuario.update({
      where: { id: req.user.id },
      data: { tokenValidoApos: new Date() },
    });
    logger.info('logout_all', { userId: req.user.id });
    res.json({ mensagem: 'Todas as sessões foram encerradas' });
  } catch (erro) {
    logger.error('Erro POST /me/logout-all', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── PREFERÊNCIAS DE NOTIFICAÇÃO ───────────────────────────────────────────────

// GET /api/me/notificacoes — preferências resolvidas (com padrões aplicados)
apiRouter.get('/me/notificacoes', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { notificacoes: true },
    });
    res.json(resolverPreferencias(usuario?.notificacoes));
  } catch (erro) {
    logger.error('Erro GET /me/notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/me/notificacoes — atualiza os toggles
apiRouter.patch('/me/notificacoes', async (req, res) => {
  try {
    const schema = z.object({
      estoque_baixo: z.boolean().optional(),
      resumo: z.boolean().optional(),
      novo_servico: z.boolean().optional(),
      meta: z.boolean().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const atual = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { notificacoes: true } });
    const novas = { ...resolverPreferencias(atual?.notificacoes), ...parse.data };
    await prisma.usuario.update({ where: { id: req.user.id }, data: { notificacoes: novas } });
    res.json(novas);
  } catch (erro) {
    logger.error('Erro PATCH /me/notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── CENTRAL DE AVISOS (INBOX) ─────────────────────────────────────────────────

// GET /api/notificacoes — lista os avisos do usuário (mais recentes primeiro)
apiRouter.get('/notificacoes', async (req, res) => {
  try {
    const apenasNaoLidas = req.query.naoLidas === 'true';
    const where = { usuarioId: req.user.id };
    if (apenasNaoLidas) where.lida = false;
    const avisos = await prisma.notificacao.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
    res.json(avisos);
  } catch (erro) {
    logger.error('Erro GET /notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// GET /api/notificacoes/nao-lidas — contador para o badge
apiRouter.get('/notificacoes/nao-lidas', async (req, res) => {
  try {
    const total = await prisma.notificacao.count({ where: { usuarioId: req.user.id, lida: false } });
    res.json({ total });
  } catch (erro) {
    logger.error('Erro GET /notificacoes/nao-lidas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/notificacoes/:id/lida — marca um aviso como lido
apiRouter.patch('/notificacoes/:id/lida', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    // Garante que o aviso pertence ao usuário
    const result = await prisma.notificacao.updateMany({
      where: { id, usuarioId: req.user.id },
      data: { lida: true },
    });
    if (result.count === 0) return res.status(404).json({ erro: 'Notificação não encontrada' });
    res.json({ mensagem: 'Marcada como lida' });
  } catch (erro) {
    logger.error('Erro PATCH /notificacoes/:id/lida', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/notificacoes/ler-todas — marca todas como lidas
apiRouter.post('/notificacoes/ler-todas', async (req, res) => {
  try {
    await prisma.notificacao.updateMany({
      where: { usuarioId: req.user.id, lida: false },
      data: { lida: true },
    });
    res.json({ mensagem: 'Todas marcadas como lidas' });
  } catch (erro) {
    logger.error('Erro POST /notificacoes/ler-todas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// DELETE /api/notificacoes/:id — remove um aviso
apiRouter.delete('/notificacoes/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const result = await prisma.notificacao.deleteMany({ where: { id, usuarioId: req.user.id } });
    if (result.count === 0) return res.status(404).json({ erro: 'Notificação não encontrada' });
    res.json({ mensagem: 'Removida' });
  } catch (erro) {
    logger.error('Erro DELETE /notificacoes/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/servicos ─────────────────────────────────────────────────────────
apiRouter.get('/servicos', async (req, res) => {
  try {
    const { tecnico, local, endereco, inicio, fim, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const where = {};
    if (tecnico) where.tecnico = { nome: contemInsensivel(tecnico) };
    if (local) where.local = contemInsensivel(local);
    if (endereco) where.endereco = contemInsensivel(endereco);
    if (inicio || fim) where.criadoEm = construirFiltroPeriodo('custom', inicio, fim);

    const [servicos, total] = await Promise.all([
      req.db.servico.findMany({
        where,
        include: { tecnico: { select: { id: true, nome: true } } },
        orderBy: { criadoEm: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      req.db.servico.count({ where }),
    ]);
    res.json({ data: servicos, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (erro) {
    logger.error('Erro GET /servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao buscar serviços' });
  }
});

// ── GET /api/servicos/:id ─────────────────────────────────────────────────────
apiRouter.get('/servicos/:id', async (req, res) => {
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

// ── POST /api/servicos ────────────────────────────────────────────────────────
const schemaServico = z.object({
  tecnico: z.string().min(2),
  local: z.string().min(2),
  endereco: z.string().optional().nullable(),
  descricao: z.string().min(3),
  material: z.string().optional().nullable(),
  clienteNome: z.string().optional().nullable(),
  clienteTelefone: z.string().optional().nullable(),
  valorCobrado: z.number().nonnegative(),
  valorMaterial: z.number().nonnegative().default(0),
  // Materiais do catálogo consumidos — disparam baixa automática de estoque
  materiais: z.array(z.object({
    materialId: z.number().int().positive(),
    quantidade: z.number().positive(),
  })).optional().default([]),
});

apiRouter.post('/servicos', async (req, res) => {
  try {
    const parse = schemaServico.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const dados = parse.data;
    const empresaId = req.user.empresaId;
    const tecnico = await buscarOuCriarTecnico(dados.tecnico, empresaId);
    const valorLiquido = dados.valorCobrado - dados.valorMaterial;
    const comissaoGerada = parseFloat((valorLiquido * (tecnico.comissao / 100)).toFixed(2));

    const servico = await prisma.$transaction(async (tx) => {
      // Garante que os materiais consumidos pertencem à empresa (evita IDOR)
      if (dados.materiais.length > 0) {
        const ids = dados.materiais.map((m) => m.materialId);
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
          clienteNome: dados.clienteNome ?? null,
          clienteTelefone: dados.clienteTelefone ?? null,
          msgOriginal: 'CADASTRO_MANUAL',
          remetenteWpp: 'painel-admin',
          materiais: dados.materiais.length > 0
            ? { create: dados.materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })) }
            : undefined,
        },
        include: { tecnico: true },
      });
      // Baixa automática no estoque dos materiais consumidos
      if (dados.materiais.length > 0) {
        await darBaixaPorServico(criado.id, dados.materiais, tx);
      }
      return criado;
    });

    // Agenda a avaliação do cliente (mesma regra do fluxo via WhatsApp)
    if (dados.clienteTelefone) {
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

// ── DELETE /api/servicos/:id ──────────────────────────────────────────────────
apiRouter.delete('/servicos/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    // delete escopado: id de outra empresa não casa o where e cai em P2025 → 404
    await req.db.servico.delete({ where: { id, empresaId: req.user.empresaId } });
    logger.info('Serviço deletado pelo admin', { id, empresaId: req.user.empresaId });
    res.json({ mensagem: 'Serviço removido com sucesso' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Serviço não encontrado' });
    logger.error('Erro DELETE /servicos/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/avaliacoes ───────────────────────────────────────────────────────
// Lista as avaliações da empresa (com o serviço relacionado) + resumo de média.
apiRouter.get('/avaliacoes', async (req, res) => {
  try {
    const empresaId = req.user.empresaId;
    const { status } = req.query;
    const where = { empresaId };
    if (status) where.status = String(status);

    const [avaliacoes, respondidas] = await Promise.all([
      prisma.avaliacao.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        take: 100,
      }),
      prisma.avaliacao.findMany({
        where: { empresaId, status: 'respondida', nota: { not: null } },
        select: { nota: true },
      }),
    ]);

    const total = respondidas.length;
    const media = total > 0
      ? parseFloat((respondidas.reduce((s, a) => s + (a.nota ?? 0), 0) / total).toFixed(2))
      : null;
    // Distribuição 1..5
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

// ── GET /api/dashboard ────────────────────────────────────────────────────────
apiRouter.get('/dashboard', async (req, res) => {
  try {
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);
    const filtroAnterior = construirFiltroPeriodoAnterior(filtroDatas);

    const [servicos, servicosAnterior] = await Promise.all([
      req.db.servico.findMany({
        where: { criadoEm: filtroDatas },
        include: { tecnico: { select: { nome: true } } },
        orderBy: { criadoEm: 'asc' },
      }),
      req.db.servico.findMany({
        where: { criadoEm: filtroAnterior },
        select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true },
      }),
    ]);

    const totalServicos = servicos.length;
    const receitaBruta = servicos.reduce((s, x) => s + x.valorCobrado, 0);
    const totalMaterial = servicos.reduce((s, x) => s + x.valorMaterial, 0);
    const receitaLiquida = servicos.reduce((s, x) => s + x.valorLiquido, 0);
    const ticketMedio = totalServicos > 0 ? receitaLiquida / totalServicos : 0;
    const totalComissao = servicos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
    // Margem = quanto sobra do bruto após material e comissão (lucro real do dono)
    const lucro = receitaLiquida - totalComissao;
    const margemLucro = receitaBruta > 0 ? parseFloat(((lucro / receitaBruta) * 100).toFixed(1)) : 0;

    // Comparativo com o período anterior de mesma duração
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
      .map((t) => ({
        ...t,
        percentualReceita: receitaLiquida > 0 ? parseFloat(((t.receitaLiquida / receitaLiquida) * 100).toFixed(1)) : 0,
        ticketMedio: t.servicos > 0 ? parseFloat((t.receitaLiquida / t.servicos).toFixed(2)) : 0,
      }))
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

    res.json({
      totalServicos, receitaBruta, totalMaterial, receitaLiquida, ticketMedio,
      totalComissao, lucro, margemLucro,
      comparativo,
      porTecnico, porLocal, evolucaoDiaria,
    });
  } catch (erro) {
    logger.error('Erro GET /dashboard', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao calcular dashboard' });
  }
});

// ── GET /api/tecnicos ─────────────────────────────────────────────────────────
apiRouter.get('/tecnicos', async (req, res) => {
  try {
    const tecnicos = await req.db.tecnico.findMany({
      include: {
        servicos: { select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true } },
        pagamentos: { select: { valor: true } },
      },
      orderBy: { nome: 'asc' },
    });
    const resultado = tecnicos.map((t) => {
      const totalComissaoGanha = t.servicos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
      const totalRecebido = t.pagamentos.reduce((s, x) => s + x.valor, 0);
      return {
        id: t.id,
        nome: t.nome,
        telefone: t.telefoneDisplay ?? (t.telefone && t.telefone.length <= 13 ? t.telefone : null),
        telefoneDisplay: t.telefoneDisplay,
        comissao: t.comissao,
        metaMensal: t.metaMensal,
        fotoPerfil: t.fotoPerfil,
        ativo: t.ativo,
        criadoEm: t.criadoEm,
        totalServicos: t.servicos.length,
        receitaBruta: t.servicos.reduce((s, x) => s + x.valorCobrado, 0),
        receitaLiquida: t.servicos.reduce((s, x) => s + x.valorLiquido, 0),
        totalComissaoGanha,
        totalRecebido,
        saldoPendente: totalComissaoGanha - totalRecebido,
      };
    });
    res.json(resultado);
  } catch (erro) {
    logger.error('Erro GET /tecnicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── POST /api/tecnicos ────────────────────────────────────────────────────────
apiRouter.post('/tecnicos', async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2),
      telefone: z.string().min(10).optional().nullable(),
      comissao: z.number().min(0).max(100).default(0),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, telefone, comissao } = parse.data;
    const tecnico = await req.db.tecnico.create({ data: { nome, telefone: telefone ?? null, comissao } });
    res.status(201).json(tecnico);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Telefone já cadastrado' });
    logger.error('Erro POST /tecnicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/tecnicos/:id/perfil ──────────────────────────────────────────────
apiRouter.get('/tecnicos/:id/perfil', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);

    const filtroMesAtual = construirFiltroPeriodo('mes');

    const [tecnico, servicosPeriodo, todosServicos, pagamentos, servicosMesAtual] = await Promise.all([
      req.db.tecnico.findUnique({ where: { id } }),
      req.db.servico.findMany({ where: { tecnicoId: id, criadoEm: filtroDatas }, orderBy: { criadoEm: 'desc' } }),
      req.db.servico.findMany({ where: { tecnicoId: id }, select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true, criadoEm: true } }),
      req.db.pagamento.findMany({ where: { tecnicoId: id }, orderBy: { criadoEm: 'desc' } }),
      req.db.servico.findMany({ where: { tecnicoId: id, criadoEm: filtroMesAtual }, select: { valorLiquido: true } }),
    ]);
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });

    const totalComissaoGanha = todosServicos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
    const totalRecebido = pagamentos.reduce((s, x) => s + x.valor, 0);

    // Progresso da meta mensal (sempre referente ao mês calendário corrente)
    const receitaMesAtual = servicosMesAtual.reduce((s, x) => s + x.valorLiquido, 0);
    const meta = tecnico.metaMensal && tecnico.metaMensal > 0
      ? {
          metaMensal: tecnico.metaMensal,
          receitaMes: receitaMesAtual,
          progresso: parseFloat(((receitaMesAtual / tecnico.metaMensal) * 100).toFixed(1)),
          atingida: receitaMesAtual >= tecnico.metaMensal,
        }
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
      tecnico: { ...tecnico, totalServicos: todosServicos.length, totalComissaoGanha, totalRecebido, saldoPendente: totalComissaoGanha - totalRecebido },
      meta,
      periodo: {
        servicos: servicosPeriodo,
        totalServicos: servicosPeriodo.length,
        receitaLiquida: servicosPeriodo.reduce((s, x) => s + x.valorLiquido, 0),
        comissaoGerada: servicosPeriodo.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0),
        evolucaoDiaria: Object.values(mapasDia).sort((a, b) => a.data.localeCompare(b.data)),
      },
      pagamentos,
    });
  } catch (erro) {
    logger.error('Erro GET /tecnicos/:id/perfil', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── PATCH /api/tecnicos/:id ───────────────────────────────────────────────────
apiRouter.patch('/tecnicos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      ativo: z.boolean().optional(),
      comissao: z.number().min(0).max(100).optional(),
      metaMensal: z.number().nonnegative().nullable().optional(),
      nome: z.string().min(2).optional(),
      telefone: z.string().optional().nullable(),
      telefoneDisplay: z.string().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    // updateMany escopado: id de outra empresa não casa e count fica 0 → 404
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

// ── POST /api/pagamentos ──────────────────────────────────────────────────────
apiRouter.post('/pagamentos', async (req, res) => {
  try {
    const schema = z.object({
      tecnicoId: z.number().int().positive(),
      valor: z.number().positive(),
      descricao: z.string().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    // Garante que o técnico pertence à empresa antes de registrar o pagamento (anti-IDOR)
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

// ── GET /api/materiais ────────────────────────────────────────────────────────
apiRouter.get('/materiais', async (req, res) => {
  try {
    const materiais = await req.db.material.findMany({
      include: { _count: { select: { servicos: true } } },
      orderBy: { nome: 'asc' },
    });
    res.json(materiais.map((m) => ({
      id: m.id,
      nome: m.nome,
      descricao: m.descricao,
      imagemUrl: m.imagemUrl,
      unidade: m.unidade,
      precoUnit: m.precoUnit,
      precoVenda: m.precoVenda,
      estoqueMinimo: m.estoqueMinimo,
      quantidadeAtual: m.quantidadeAtual,
      vezesUsado: m._count.servicos,
      criadoEm: m.criadoEm,
    })));
  } catch (erro) {
    logger.error('Erro GET /materiais', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── POST /api/materiais/upload ────────────────────────────────────────────────
// Recebe a imagem do produto como data URL base64 (JSON) e salva em /uploads,
// retornando a URL pública. Evita dependência extra (multer) — o app já envia JSON.
const UPLOADS_DIR = path.resolve('./uploads');
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// imagemUrl aceita URL completa (http...) OU caminho relativo /uploads/... gerado pelo upload
const imagemUrlSchema = z
  .string()
  .refine((v) => v === '' || /^https?:\/\//.test(v) || v.startsWith('/uploads/'), 'URL de imagem inválida')
  .optional()
  .nullable();

apiRouter.post('/materiais/upload', async (req, res) => {
  try {
    const schema = z.object({
      // data URL: "data:image/png;base64,...."
      imagem: z.string().regex(/^data:image\/(jpeg|png|webp|gif);base64,/, 'Formato de imagem inválido'),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Imagem inválida (use JPEG, PNG, WEBP ou GIF)' });

    const [cabecalho, dados] = parse.data.imagem.split(',');
    const mime = cabecalho.match(/data:(image\/\w+);base64/)?.[1];
    const ext = MIME_EXT[mime] ?? 'jpg';
    const buffer = Buffer.from(dados, 'base64');

    // Limite de tamanho (≈5MB) para não estourar disco com base64 grande
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ erro: 'Imagem muito grande (máx. 5MB)' });
    }

    await mkdir(UPLOADS_DIR, { recursive: true });
    const nomeArquivo = `produto-${randomUUID()}.${ext}`;
    await writeFile(path.join(UPLOADS_DIR, nomeArquivo), buffer);

    const url = `/uploads/${nomeArquivo}`;
    logger.info('Imagem de produto enviada', { nomeArquivo, bytes: buffer.length });
    res.status(201).json({ url });
  } catch (erro) {
    logger.error('Erro POST /materiais/upload', { erro: erro.message });
    res.status(500).json({ erro: 'Erro ao salvar imagem' });
  }
});

// ── POST /api/materiais ───────────────────────────────────────────────────────
apiRouter.post('/materiais', async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(1),
      descricao: z.string().optional().nullable(),
      imagemUrl: imagemUrlSchema,
      unidade: z.string().default('un'),
      precoUnit: z.number().nonnegative().optional().nullable(),
      precoVenda: z.number().nonnegative().optional().nullable(),
      estoqueMinimo: z.number().nonnegative().optional().nullable(),
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

// ── PATCH /api/materiais/:id ──────────────────────────────────────────────────
apiRouter.patch('/materiais/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      nome: z.string().min(1).optional(),
      descricao: z.string().optional().nullable(),
      imagemUrl: imagemUrlSchema,
      unidade: z.string().optional(),
      precoUnit: z.number().nonnegative().optional().nullable(),
      precoVenda: z.number().nonnegative().optional().nullable(),
      estoqueMinimo: z.number().nonnegative().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const data = { ...parse.data };
    if (data.imagemUrl === '') data.imagemUrl = null;
    // updateMany escopado por empresa (anti-IDOR); count 0 → 404
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

// ── DELETE /api/materiais/:id ─────────────────────────────────────────────────
apiRouter.delete('/materiais/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    // Confirma que o material é da empresa antes de qualquer operação (anti-IDOR)
    const mat = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!mat) return res.status(404).json({ erro: 'Material não encontrado' });
    const count = await prisma.servicoMaterial.count({ where: { materialId: id } });
    if (count > 0) return res.status(409).json({ erro: 'Material em uso em serviços e não pode ser removido' });
    await req.db.material.deleteMany({ where: { id } });
    res.json({ mensagem: 'Material removido com sucesso' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Material não encontrado' });
    logger.error('Erro DELETE /materiais/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/estoque ──────────────────────────────────────────────────────────
// Saldo real de todos os materiais + consumo no período (para contexto).
apiRouter.get('/estoque', async (req, res) => {
  try {
    const diasNum = Math.max(1, parseInt(req.query.periodo ?? '30'));
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - diasNum);

    const materiais = await req.db.material.findMany({
      include: {
        servicos: {
          where: { servico: { criadoEm: { gte: dataInicio } } },
          select: { quantidade: true },
        },
      },
      orderBy: { nome: 'asc' },
    });

    const resultado = materiais.map((m) => {
      const consumoPeriodo = m.servicos.reduce((s, x) => s + x.quantidade, 0);
      // Alerta quando o saldo atual está no/abaixo do mínimo configurado
      const alerta = m.estoqueMinimo != null && m.quantidadeAtual <= m.estoqueMinimo;
      return {
        id: m.id,
        nome: m.nome,
        unidade: m.unidade,
        imagemUrl: m.imagemUrl,
        quantidadeAtual: m.quantidadeAtual,
        consumoPeriodo,
        estoqueMinimo: m.estoqueMinimo,
        alerta,
      };
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

// ── POST /api/materiais/:id/movimentacao ──────────────────────────────────────
// Entrada manual / ajuste de estoque a partir do material do catálogo.
apiRouter.post('/materiais/:id/movimentacao', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      tipo: z.enum(['entrada', 'saida', 'ajuste']),
      quantidade: z.number().positive(),
      observacao: z.string().optional().nullable(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });

    // Confirma que o material pertence à empresa antes de movimentar (anti-IDOR)
    const dono = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!dono) return res.status(404).json({ erro: 'Material não encontrado' });

    const { material, movimentacao } = await movimentarEstoque({
      materialId: id,
      tipo: parse.data.tipo,
      quantidade: parse.data.quantidade,
      origem: parse.data.tipo === 'ajuste' ? 'ajuste' : 'manual',
      observacao: parse.data.observacao ?? null,
    });
    logger.info('Movimentação de estoque', { materialId: id, tipo: parse.data.tipo, saldoApos: material.quantidadeAtual });
    res.status(201).json({ quantidadeAtual: material.quantidadeAtual, movimentacao });
  } catch (erro) {
    if (erro.message === 'Material não encontrado') return res.status(404).json({ erro: erro.message });
    logger.error('Erro POST /materiais/:id/movimentacao', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/materiais/:id/movimentacoes ──────────────────────────────────────
apiRouter.get('/materiais/:id/movimentacoes', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    // Confirma que o material é da empresa antes de listar suas movimentações
    const dono = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!dono) return res.status(404).json({ erro: 'Material não encontrado' });
    const movimentacoes = await prisma.movimentacaoEstoque.findMany({
      where: { materialId: id },
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
    res.json(movimentacoes);
  } catch (erro) {
    logger.error('Erro GET /materiais/:id/movimentacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/relatorio/pdf ────────────────────────────────────────────────────
apiRouter.get('/relatorio/pdf', async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ erro: 'Parâmetros "inicio" e "fim" são obrigatórios (YYYY-MM-DD)' });
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim + 'T23:59:59.999Z');
    if (isNaN(dataInicio) || isNaN(dataFim)) return res.status(400).json({ erro: 'Datas inválidas' });
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

// ── USUÁRIOS (admin only) ─────────────────────────────────────────────────────

// GET /api/usuarios
apiRouter.get('/usuarios', adminOnly, async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      select: { id: true, nome: true, username: true, admin: true, ativo: true, criadoEm: true },
      orderBy: { criadoEm: 'asc' },
    });
    res.json(usuarios);
  } catch (erro) {
    logger.error('Erro GET /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/usuarios
apiRouter.post('/usuarios', adminOnly, async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2),
      username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
      admin: z.boolean().default(false),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, username, senha, admin } = parse.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    // Novo usuário pertence à MESMA empresa do admin que o cria
    const usuario = await prisma.usuario.create({
      data: { nome, username, senhaHash, admin, empresaId: req.user.empresaId },
      select: { id: true, nome: true, username: true, admin: true, ativo: true, criadoEm: true },
    });
    logger.info('user_created', { adminId: req.user.id, novoUserId: usuario.id });
    res.status(201).json(usuario);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Username já em uso' });
    logger.error('Erro POST /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/usuarios/:id
apiRouter.patch('/usuarios/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      nome: z.string().min(2).optional(),
      ativo: z.boolean().optional(),
      admin: z.boolean().optional(),
      senha: z.string().min(6).optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const data = { ...parse.data };
    if (data.senha) {
      data.senhaHash = await bcrypt.hash(data.senha, 12);
      delete data.senha;
    }
    // Só atualiza se o usuário-alvo for da mesma empresa (anti-IDOR cross-tenant)
    const r = await prisma.usuario.updateMany({ where: { id, empresaId: req.user.empresaId }, data });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nome: true, username: true, admin: true, ativo: true, criadoEm: true },
    });
    if (parse.data.ativo === false) logger.info('user_deactivated', { adminId: req.user.id, userId: id });
    res.json(usuario);
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro PATCH /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// DELETE /api/usuarios/:id
apiRouter.delete('/usuarios/:id', adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    if (id === req.user.id) return res.status(400).json({ erro: 'Não é possível remover o próprio usuário' });
    // Só remove se o usuário-alvo for da mesma empresa (anti-IDOR cross-tenant)
    const r = await prisma.usuario.deleteMany({ where: { id, empresaId: req.user.empresaId } });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json({ mensagem: 'Usuário removido' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro DELETE /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});
