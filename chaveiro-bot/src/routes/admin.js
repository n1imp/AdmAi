import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { resolverPreferencias } from '../services/notificacao.js';
import {
  permissoesEfetivas,
  sanitizarPermissoes,
  limitarPermissoesAoAtor,
  presetDoPapel,
  PAPEIS,
  MODULOS,
  ACOES_POR_MODULO,
  CAPACIDADES_PROPRIO,
} from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import { requireAuth, adminOnly, requirePermissao, senhaProvisoria } from '../middlewares/auth.js';
import { registrar as registrarAudit } from '../services/auditoria.js';
import { enviarEmailConvite } from '../services/email.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const SELECT_USUARIO = {
  id: true,
  nome: true,
  username: true,
  telefone: true,
  admin: true,
  papel: true,
  permissoes: true,
  senhaProvisoria: true,
  ativo: true,
  tecnico: { select: { id: true } },
  criadoEm: true,
};

router.get('/me/notificacoes', async (req, res) => {
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

router.patch('/me/notificacoes', async (req, res) => {
  try {
    const schema = z.object({
      estoque_baixo: z.boolean().optional(),
      resumo: z.boolean().optional(),
      novo_servico: z.boolean().optional(),
      meta: z.boolean().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const atual = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { notificacoes: true },
    });
    const novas = { ...resolverPreferencias(atual?.notificacoes), ...parse.data };
    await prisma.usuario.update({ where: { id: req.user.id }, data: { notificacoes: novas } });
    res.json(novas);
  } catch (erro) {
    logger.error('Erro PATCH /me/notificacoes', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/notificacoes', async (req, res) => {
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

router.get('/notificacoes/nao-lidas', async (req, res) => {
  try {
    const total = await prisma.notificacao.count({
      where: { usuarioId: req.user.id, lida: false },
    });
    res.json({ total });
  } catch (erro) {
    logger.error('Erro GET /notificacoes/nao-lidas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/notificacoes/:id/lida', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
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

router.post('/notificacoes/ler-todas', async (req, res) => {
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

router.delete('/notificacoes/:id', async (req, res) => {
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

router.get('/config/empresa', requirePermissao('configuracao', 'ver'), async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.user.empresaId },
      select: { nome: true, aprovacaoServico: true },
    });
    res.json({ nome: empresa?.nome ?? null, aprovacaoServico: empresa?.aprovacaoServico ?? false });
  } catch (erro) {
    logger.error('Erro GET /config/empresa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/config/empresa', requirePermissao('configuracao', 'editar'), async (req, res) => {
  try {
    const parse = z.object({ aprovacaoServico: z.boolean().optional() }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const empresa = await prisma.empresa.update({
      where: { id: req.user.empresaId },
      data: parse.data,
      select: { nome: true, aprovacaoServico: true },
    });
    res.json(empresa);
  } catch (erro) {
    logger.error('Erro PATCH /config/empresa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/permissoes/catalogo', requirePermissao('usuarios', 'ver'), (req, res) => {
  res.json({
    papeis: PAPEIS,
    modulos: MODULOS,
    acoesPorModulo: ACOES_POR_MODULO,
    capacidadesProprio: CAPACIDADES_PROPRIO,
    presets: Object.fromEntries(PAPEIS.map((p) => [p, presetDoPapel(p)])),
  });
});

router.get('/usuarios', requirePermissao('usuarios', 'ver'), async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      select: SELECT_USUARIO,
      orderBy: { criadoEm: 'asc' },
    });
    res.json(usuarios.map((u) => ({ ...u, permissoesEfetivas: permissoesEfetivas(u) })));
  } catch (erro) {
    logger.error('Erro GET /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/usuarios', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2),
      username: z
        .string()
        .min(3)
        .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
      papel: z.enum(PAPEIS).default('gestor'),
      permissoes: z.any().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, username, senha, papel } = parse.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    const usuario = await prisma.usuario.create({
      data: {
        nome,
        username,
        senhaHash,
        papel,
        admin: papel === 'dono',
        permissoes: sanitizarPermissoes(parse.data.permissoes),
        empresaId: req.user.empresaId,
      },
      select: SELECT_USUARIO,
    });
    logger.info('user_created', { adminId: req.user.id, novoUserId: usuario.id, papel });
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'usuario.criado',
      entidade: 'Usuario',
      entidadeId: usuario.id,
      depois: { nome: usuario.nome, papel: usuario.papel },
      ip: req.ip,
    }).catch(() => {});
    res.status(201).json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Username já em uso' });
    logger.error('Erro POST /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const schema = z.object({
      nome: z.string().min(2).optional(),
      ativo: z.boolean().optional(),
      papel: z.enum(PAPEIS).optional(),
      permissoes: z.any().optional(),
      senha: z.string().min(6).optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    if (parse.data.senha && !avaliarForcaSenha(parse.data.senha).valida) {
      return res
        .status(400)
        .json({ erro: 'Senha fraca: use ao menos 8 caracteres com letras, números e símbolos.' });
    }
    if (id === req.user.id) {
      if (parse.data.papel && parse.data.papel !== req.user.papel)
        return res.status(400).json({ erro: 'Você não pode alterar o próprio papel' });
      if (parse.data.ativo === false)
        return res.status(400).json({ erro: 'Você não pode desativar a própria conta' });
    }
    if (parse.data.papel === 'dono' && req.user.papel !== 'dono' && !req.user.admin) {
      return res.status(403).json({ erro: 'Somente o dono pode promover outro usuário a dono' });
    }
    const { senha, permissoes, papel, ...resto } = parse.data;
    const data = { ...resto };
    if (papel !== undefined) {
      data.papel = papel;
      data.admin = papel === 'dono';
    }
    if (permissoes !== undefined)
      data.permissoes = limitarPermissoesAoAtor(req.user, sanitizarPermissoes(permissoes));
    if (senha) data.senhaHash = await bcrypt.hash(senha, 12);
    const auditarRbac = papel !== undefined || permissoes !== undefined;
    const antes = auditarRbac
      ? await prisma.usuario.findFirst({
          where: { id, empresaId: req.user.empresaId },
          select: { papel: true, permissoes: true },
        })
      : null;
    const r = await prisma.usuario.updateMany({
      where: { id, empresaId: req.user.empresaId },
      data,
    });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
    if (parse.data.ativo === false) {
      logger.info('user_deactivated', { adminId: req.user.id, userId: id });
      registrarAudit({
        empresaId: req.user.empresaId,
        usuarioId: req.user.id,
        acao: 'usuario.desativado',
        entidade: 'Usuario',
        entidadeId: id,
        ip: req.ip,
      }).catch(() => {});
    }
    if (auditarRbac && antes) {
      logger.info('permissao_alterada', {
        adminId: req.user.id,
        userId: id,
        papelAntes: antes.papel,
        papelDepois: usuario.papel,
        permissoesMudaram:
          permissoes !== undefined &&
          JSON.stringify(antes.permissoes ?? null) !== JSON.stringify(usuario.permissoes ?? null),
      });
      registrarAudit({
        empresaId: req.user.empresaId,
        usuarioId: req.user.id,
        acao: 'usuario.permissoes_alteradas',
        entidade: 'Usuario',
        entidadeId: id,
        antes: { papel: antes.papel, permissoes: antes.permissoes },
        depois: { papel: usuario.papel, permissoes: usuario.permissoes },
        ip: req.ip,
      }).catch(() => {});
    }
    res.json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro PATCH /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    if (id === req.user.id)
      return res.status(400).json({ erro: 'Não é possível remover o próprio usuário' });
    const alvoDel = await prisma.usuario.findFirst({
      where: { id, empresaId: req.user.empresaId },
      select: { nome: true, papel: true },
    });
    const r = await prisma.usuario.deleteMany({ where: { id, empresaId: req.user.empresaId } });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'usuario.excluido',
      entidade: 'Usuario',
      entidadeId: id,
      antes: alvoDel,
      ip: req.ip,
    }).catch(() => {});
    res.json({ mensagem: 'Usuário removido' });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro DELETE /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/usuarios/convidar', requirePermissao('usuarios', 'editar'), async (req, res) => {
  const parse = z
    .object({ email: z.string().email(), papel: z.enum(PAPEIS).default('funcionario') })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiraEm = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.conviteUsuario.create({
      data: {
        empresaId: req.user.empresaId,
        email: parse.data.email,
        papel: parse.data.papel,
        tokenHash,
        nomeConvidadoPor: req.user.nome,
        expiraEm,
      },
    });
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.user.empresaId },
      select: { nome: true },
    });
    enviarEmailConvite(parse.data.email, empresa?.nome ?? 'AdmAi', parse.data.papel, token).catch(
      () => {}
    );
    registrarAudit({
      empresaId: req.user.empresaId,
      usuarioId: req.user.id,
      acao: 'convite.enviado',
      depois: { email: parse.data.email, papel: parse.data.papel },
      ip: req.ip,
    }).catch(() => {});
    res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /usuarios/convidar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/lgpd/anonimizar-cliente', adminOnly, async (req, res) => {
  try {
    const parse = z
      .object({ telefone: z.string().trim().min(8, 'Telefone inválido') })
      .safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Informe o telefone do cliente.' });
    const bruto = parse.data.telefone;
    const digitos = bruto.replace(/\D/g, '');
    const alvo = { OR: [{ clienteTelefone: bruto }, { clienteTelefone: digitos }] };
    const [servicos, avaliacoes] = await Promise.all([
      req.db.servico.updateMany({
        where: alvo,
        data: { clienteNome: null, clienteTelefone: null },
      }),
      req.db.avaliacao.updateMany({
        where: alvo,
        data: { clienteNome: null, clienteTelefone: '', comentario: null },
      }),
    ]);
    logger.info('lgpd_anonimizar_cliente', {
      empresaId: req.user.empresaId,
      servicos: servicos.count,
      avaliacoes: avaliacoes.count,
    });
    res.json({
      ok: true,
      servicosAnonimizados: servicos.count,
      avaliacoesAnonimizadas: avaliacoes.count,
    });
  } catch (erro) {
    logger.error('Erro POST /lgpd/anonimizar-cliente', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
