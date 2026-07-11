import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { prisma } from '../db/prisma.js';
import { gerarJWT } from '../services/auth.js';
import { podeProprio } from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import { gerarSegredoTotp, montarOtpauthUrl, verificarCodigo, cifrarSegredo, decifrarSegredo } from '../services/totp.js';
import { definirOtpTelefone, validarOtpTelefone, limparOtpTelefone } from '../services/otp.js';
import { gerarCodigos, verificarCodigo as verificarCodigoRecuperacao } from '../services/codigosRecuperacao.js';
import { canonizarTelefone } from '../services/parser.js';
import { enviarMensagem } from '../services/whatsapp/gateway.js';
import { requireAuth, senhaProvisoria } from '../middlewares/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);
router.use(senhaProvisoria);

const SELECT_ME = {
  id: true, nome: true, username: true, email: true, telefone: true,
  admin: true, papel: true, senhaProvisoria: true, ativo: true,
  emailVerificado: true, telefoneVerificado: true,
  twoFactorAtivo: true, senhaAlteradaEm: true, criadoEm: true,
};

const ultimoOtpEnviado = new Map();
const OTP_REENVIO_MS = 5 * 60_000;

async function gerarEEnviarOtp(userId, telefone) {
  const agora = Date.now();
  const anterior = ultimoOtpEnviado.get(userId);
  if (anterior && agora - anterior < OTP_REENVIO_MS) { logger.info('otp_reenvio_throttled', { userId }); return; }
  ultimoOtpEnviado.set(userId, agora);
  const codigo = await definirOtpTelefone(userId);
  const destino = canonizarTelefone(telefone);
  if (destino) {
    await enviarMensagem(destino, `🔑 Seu código de verificação ADMAI é *${codigo}* (válido por 10 minutos).`)
      .catch((e) => logger.warn('Falha ao enviar OTP por WhatsApp', { userId, erro: e.message }));
  }
}

async function apagarEmpresaEmCascata(empresaId) {
  const where = { empresaId };
  await prisma.$transaction([
    prisma.registroPonto.deleteMany({ where }),
    prisma.avaliacao.deleteMany({ where }),
    prisma.avaliacaoGoogle.deleteMany({ where }),
    prisma.analiseAvaliacoes.deleteMany({ where }),
    prisma.googleConta.deleteMany({ where }),
    prisma.pagamento.deleteMany({ where }),
    prisma.servico.deleteMany({ where }),
    prisma.material.deleteMany({ where }),
    prisma.tecnico.deleteMany({ where }),
    prisma.sessaoConversa.deleteMany({ where }),
    prisma.usuario.deleteMany({ where }),
    prisma.empresaWhatsapp.deleteMany({ where }),
    prisma.empresa.delete({ where: { id: empresaId } }),
  ]);
}

router.get('/me', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: SELECT_ME });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(usuario);
  } catch (erro) {
    logger.error('Erro GET /me', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/me/permissoes', (req, res) => {
  res.json({ papel: req.user.papel, admin: req.user.admin, permissoes: req.user.permissoesEfetivas });
});

router.get('/me/metricas', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'ver_metricas')) return res.status(403).json({ erro: 'Sem permissão' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const id = req.user.tecnicoId;
    const filtroMes = { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1), lte: new Date() };
    const [tecnico, aggTotal, aggPagamentos, aggMes, pendentes] = await Promise.all([
      req.db.tecnico.findUnique({ where: { id } }),
      req.db.servico.aggregate({ where: { tecnicoId: id, status: 'ativo' }, _sum: { comissaoGerada: true }, _count: true }),
      req.db.pagamento.aggregate({ where: { tecnicoId: id }, _sum: { valor: true } }),
      req.db.servico.aggregate({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroMes }, _sum: { valorLiquido: true, comissaoGerada: true } }),
      req.db.servico.count({ where: { tecnicoId: id, status: 'pendente' } }),
    ]);
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    // Agregação no banco (SUM/COUNT) — antes carregava até 10k linhas e somava em JS (F3: mata take:10000).
    const comissaoGanha = aggTotal._sum.comissaoGerada ?? 0;
    const recebido = aggPagamentos._sum.valor ?? 0;
    const receitaMes = aggMes._sum.valorLiquido ?? 0;
    const comissaoMes = aggMes._sum.comissaoGerada ?? 0;
    res.json({
      tecnico: { id: tecnico.id, nome: tecnico.nome, comissao: tecnico.comissao, metaMensal: tecnico.metaMensal, fotoPerfil: tecnico.fotoPerfil },
      totalServicos: aggTotal._count,
      comissaoGanha: parseFloat(comissaoGanha.toFixed(2)),
      totalRecebido: parseFloat(recebido.toFixed(2)),
      saldoPendente: parseFloat((comissaoGanha - recebido).toFixed(2)),
      servicosPendentes: pendentes,
      mesAtual: {
        receitaLiquida: parseFloat(receitaMes.toFixed(2)),
        comissao: parseFloat(comissaoMes.toFixed(2)),
        meta: tecnico.metaMensal ?? null,
        progressoMeta: tecnico.metaMensal ? Math.min(100, Math.round((receitaMes / tecnico.metaMensal) * 100)) : null,
      },
    });
  } catch (erro) {
    logger.error('Erro GET /me/metricas', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/me/servicos', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'ver_metricas') && !podeProprio(req.user, 'registrar_servico')) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const servicos = await req.db.servico.findMany({ where: { tecnicoId: req.user.tecnicoId }, orderBy: { criadoEm: 'desc' }, take: 100 });
    res.json(servicos);
  } catch (erro) {
    logger.error('Erro GET /me/servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/me', async (req, res) => {
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
    if (parse.data.email !== undefined) {
      const email = parse.data.email === '' ? null : parse.data.email;
      data.email = email;
      if (email !== atual.email) data.emailVerificado = false;
    }
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

router.patch('/me/senha', async (req, res) => {
  try {
    const parse = z.object({ senhaAtual: z.string().min(1), novaSenha: z.string().min(8) }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const { senhaAtual, novaSenha } = parse.data;
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    const confere = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!confere) return res.status(401).json({ erro: 'Senha atual incorreta' });
    const forca = avaliarForcaSenha(novaSenha);
    if (!forca.valida) return res.status(400).json({ erro: 'A nova senha é muito fraca', requisitos: forca.requisitos });
    const senhaHash = await bcrypt.hash(novaSenha, 12);
    const agora = new Date();
    const corte = new Date(agora.getTime() - 1000);
    const atualizado = await prisma.usuario.update({
      where: { id: req.user.id },
      data: { senhaHash, senhaAlteradaEm: agora, tokenValidoApos: corte, senhaProvisoria: false },
    });
    const token = gerarJWT(atualizado);
    logger.info('senha_alterada', { userId: req.user.id });
    res.json({ mensagem: 'Senha alterada com sucesso', token });
  } catch (erro) {
    logger.error('Erro PATCH /me/senha', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/me/conta', async (req, res) => {
  try {
    const parse = z.object({ senha: z.string().optional(), codigo: z.string().optional() }).safeParse(req.body ?? {});
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (usuario.senhaHash) {
      const confere = await bcrypt.compare(parse.data.senha ?? '', usuario.senhaHash);
      if (!confere) return res.status(403).json({ erro: 'Senha incorreta' });
    }
    if (usuario.twoFactorAtivo) {
      const segredo = decifrarSegredo(usuario.totpSecret);
      const ok = segredo && (await verificarCodigo(segredo, parse.data.codigo ?? ''));
      if (!ok) return res.status(403).json({ erro: 'Código 2FA inválido' });
    }
    const { empresaId } = usuario;
    const adminsAtivos = await prisma.usuario.count({ where: { empresaId, ativo: true, admin: true } });
    const apagaEmpresa = usuario.admin && adminsAtivos <= 1;
    if (apagaEmpresa) {
      await apagarEmpresaEmCascata(empresaId);
      logger.info('conta_excluida_empresa', { userId: usuario.id, empresaId });
      return res.json({ ok: true, escopo: 'empresa', mensagem: 'Conta e empresa excluídas permanentemente' });
    }
    await prisma.usuario.delete({ where: { id: usuario.id } });
    logger.info('conta_excluida_usuario', { userId: usuario.id, empresaId });
    return res.json({ ok: true, escopo: 'usuario', mensagem: 'Conta excluída permanentemente' });
  } catch (erro) {
    logger.error('Erro DELETE /me/conta', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.patch('/me/2fa', async (_req, res) => {
  res.status(410).json({ erro: 'Use /me/2fa/setup, /me/2fa/ativar e /me/2fa/desativar (TOTP).' });
});

router.post('/me/2fa/setup', async (req, res) => {
  try {
    const secret = gerarSegredoTotp();
    const otpauthUrl = montarOtpauthUrl(secret, req.user.nome);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    await prisma.usuario.update({ where: { id: req.user.id }, data: { totpPendente: cifrarSegredo(secret) } });
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/setup', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/2fa/ativar', async (req, res) => {
  try {
    const parse = z.object({ codigo: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { totpPendente: true } });
    const segredo = decifrarSegredo(usuario?.totpPendente);
    if (!segredo) return res.status(400).json({ erro: 'Inicie a configuração em /me/2fa/setup' });
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) return res.status(400).json({ erro: 'Código inválido' });

    let codigosRecuperacao;
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: req.user.id }, data: { totpSecret: cifrarSegredo(segredo), totpPendente: null, twoFactorAtivo: true } });
      codigosRecuperacao = await gerarCodigos(req.user.id, tx);
    });

    logger.info('2fa_ativado', { userId: req.user.id });
    res.json({ twoFactorAtivo: true, codigosRecuperacao });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/ativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/2fa/recuperar', async (req, res) => {
  try {
    const parse = z.object({ desafio: z.string().min(1), codigo: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    let payload;
    try {
      const jwt = await import('jsonwebtoken');
      const { env } = await import('../config/env.js');
      payload = jwt.default.verify(parse.data.desafio, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload?.tipo !== '2fa' || !payload?.sub) throw new Error('Desafio inválido');
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário não encontrado' });
    if (!usuario.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });

    const ok = await verificarCodigoRecuperacao(usuario.id, parse.data.codigo);
    if (!ok) {
      logger.info('recuperacao_2fa_falha', { userId: usuario.id });
      return res.status(400).json({ erro: 'Código de recuperação inválido ou já utilizado' });
    }

    const { gerarJWT } = await import('../services/auth.js');
    const token = gerarJWT(usuario);
    logger.info('recuperacao_2fa_sucesso', { userId: usuario.id });
    res.json({ token, nome: usuario.nome, admin: usuario.admin, papel: usuario.papel, senhaProvisoria: usuario.senhaProvisoria });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/recuperar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/2fa/desativar', async (req, res) => {
  try {
    const parse = z.object({ codigo: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { totpSecret: true, twoFactorAtivo: true } });
    if (!usuario?.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });
    const segredo = decifrarSegredo(usuario.totpSecret);
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) return res.status(400).json({ erro: 'Código inválido' });
    await prisma.usuario.update({ where: { id: req.user.id }, data: { twoFactorAtivo: false, totpSecret: null, totpPendente: null } });
    logger.info('2fa_desativado', { userId: req.user.id });
    res.json({ twoFactorAtivo: false });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/desativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/telefone/otp/enviar', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { telefone: true } });
    if (!usuario?.telefone) return res.status(400).json({ erro: 'Cadastre um telefone primeiro' });
    await gerarEEnviarOtp(req.user.id, usuario.telefone);
    res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/otp/enviar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/telefone/otp/verificar', async (req, res) => {
  try {
    const parse = z.object({ codigo: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { id: true, nome: true, telefone: true, empresaId: true, telefoneOtpHash: true, telefoneOtpExpira: true },
    });
    if (!usuario?.telefone) return res.status(400).json({ erro: 'Cadastre um telefone primeiro' });
    if (!validarOtpTelefone(usuario, parse.data.codigo)) return res.status(400).json({ erro: 'Código inválido ou expirado' });
    const telefone = canonizarTelefone(usuario.telefone);
    await prisma.usuario.update({ where: { id: usuario.id }, data: { telefoneVerificado: true, telefoneOtpHash: null, telefoneOtpExpira: null } });
    try {
      const existente = await prisma.tecnico.findFirst({ where: { empresaId: usuario.empresaId, telefone } });
      if (existente) {
        if (existente.usuarioId == null) {
          await prisma.tecnico.update({ where: { id: existente.id }, data: { usuarioId: usuario.id, ativo: true } });
        } else if (existente.usuarioId !== usuario.id) {
          logger.warn('Técnico do telefone já vinculado a outro usuário', { userId: usuario.id, tecnicoId: existente.id, empresaId: usuario.empresaId });
        }
      } else {
        await prisma.tecnico.create({ data: { empresaId: usuario.empresaId, nome: usuario.nome, telefone, telefoneDisplay: telefone, usuarioId: usuario.id } });
      }
    } catch (e) {
      logger.warn('Falha ao criar técnico do dono na verificação', { userId: usuario.id, erro: e.message });
    }
    logger.info('telefone_verificado', { userId: usuario.id });
    res.json({ telefoneVerificado: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/otp/verificar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/telefone/2fa/ativar', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { telefoneVerificado: true } });
    if (!usuario?.telefoneVerificado) return res.status(400).json({ erro: 'Verifique seu telefone antes de ativar o 2FA por telefone' });
    await prisma.usuario.update({ where: { id: req.user.id }, data: { phone2faAtivo: true } });
    logger.info('phone2fa_ativado', { userId: req.user.id });
    res.json({ phone2faAtivo: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/2fa/ativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/telefone/2fa/desativar', async (req, res) => {
  try {
    await prisma.usuario.update({ where: { id: req.user.id }, data: { phone2faAtivo: false } });
    logger.info('phone2fa_desativado', { userId: req.user.id });
    res.json({ phone2faAtivo: false });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/2fa/desativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/me/sessoes', async (req, res) => {
  try {
    const sessoes = await prisma.sessaoUsuario.findMany({
      where: { usuarioId: req.user.id },
      select: { jwtIat: true, ip: true, userAgent: true, ultimaAtividadeEm: true, criadoEm: true },
      orderBy: { ultimaAtividadeEm: 'desc' },
      take: 10,
    });
    return res.json(sessoes.map((s) => ({ ...s, atual: s.jwtIat === req.jwtIat })));
  } catch (erro) {
    logger.error('Erro GET /me/sessoes', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/logout-all', async (req, res) => {
  try {
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: req.user.id }, data: { tokenValidoApos: new Date() } }),
      prisma.refreshToken.deleteMany({ where: { usuarioId: req.user.id } }),
      prisma.sessaoUsuario.deleteMany({ where: { usuarioId: req.user.id } }),
    ]);
    res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'strict', path: '/api/auth' });
    logger.info('logout_all', { userId: req.user.id });
    res.json({ mensagem: 'Todas as sessões foram encerradas' });
  } catch (erro) {
    logger.error('Erro POST /me/logout-all', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
