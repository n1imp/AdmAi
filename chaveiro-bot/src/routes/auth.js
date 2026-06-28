import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { gerarJWT } from '../services/auth.js';
import { permissoesEfetivas } from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import { verificarCodigo, decifrarSegredo } from '../services/totp.js';
import { definirOtpTelefone, validarOtpTelefone, limparOtpTelefone } from '../services/otp.js';
import { canonizarTelefone, variantesTelefone } from '../services/parser.js';
import { enviarMensagem } from '../services/whatsapp/gateway.js';
import { verificarIdToken, provedoresHabilitados, OAuthError } from '../services/oauth.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = Router();

async function gerarSlugEmpresa(nome) {
  const base = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';
  let slug = base;
  let n = 1;
  while (await prisma.empresa.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

async function gerarUsernameUnico(base) {
  const limpo = String(base || '')
    .split('@')[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'usuario';
  let username = limpo;
  let n = 1;
  while (await prisma.usuario.findUnique({ where: { username } })) username = `${limpo}_${n++}`;
  return username;
}

function payloadSessao(usuario, token) {
  return {
    token,
    nome: usuario.nome,
    admin: usuario.admin,
    papel: usuario.papel ?? (usuario.admin ? 'dono' : 'funcionario'),
    senhaProvisoria: Boolean(usuario.senhaProvisoria),
  };
}

function responderSessao(res, usuario, via) {
  if (usuario.twoFactorAtivo && usuario.totpSecret) {
    logger.info('login_2fa_required', { userId: usuario.id, via });
    return res.json({ twoFactorRequerido: true, desafio: gerarDesafio2fa(usuario.id) });
  }
  const token = gerarJWT(usuario);
  logger.info('login_success', { userId: usuario.id, via });
  return res.json(payloadSessao(usuario, token));
}

function gerarDesafio2fa(userId) {
  return jwt.sign({ sub: userId, tipo: '2fa' }, env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '5m' });
}

function verificarDesafio2fa(desafio) {
  const payload = jwt.verify(desafio, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload?.tipo !== '2fa' || !payload?.sub) throw new Error('Desafio 2FA inválido');
  return payload;
}

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

const registerSchema = z.object({
  nome:        z.string().min(2),
  nomeEmpresa: z.string().min(2),
  username:    z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
  email:       z.string().email(),
  telefone:    z.string().min(8).max(20),
  senha:       z.string().min(8),
});

const PROVEDORES_VALIDOS = new Set(['google', 'microsoft', 'apple']);
const oauthSchema = z.object({ idToken: z.string().min(1), nonce: z.string().min(1).optional() });

router.post('/auth/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(1).optional(),
    telefone: z.string().min(1).optional(),
    usuarioId: z.number().int().positive().optional(),
    password: z.string().min(1),
  }).refine((d) => d.username || d.telefone || d.usuarioId, { message: 'Informe usuário ou telefone' });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  const { username, telefone, usuarioId, password } = parse.data;
  const ref = username ?? telefone ?? `id:${usuarioId}`;
  try {
    let usuario = null;
    if (usuarioId) {
      usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
    } else if (username) {
      usuario = await prisma.usuario.findUnique({ where: { username } });
    } else {
      const variantes = variantesTelefone(telefone);
      const candidatos = variantes.length
        ? await prisma.usuario.findMany({
            where: { telefone: { in: variantes }, ativo: true },
            include: { empresa: { select: { nome: true } } },
          })
        : [];
      if (candidatos.length > 1) {
        logger.info('login_desambiguacao', { telefone: '***', n: candidatos.length });
        return res.json({ desambiguacao: candidatos.map((c) => ({ usuarioId: c.id, empresa: c.empresa?.nome ?? '—' })) });
      }
      usuario = candidatos[0] ?? null;
    }
    if (!usuario) { logger.info('login_failure', { ref, motivo: 'user_not_found' }); return res.status(401).json({ erro: 'Credenciais inválidas' }); }
    if (!usuario.ativo) { logger.info('login_failure', { ref, motivo: 'user_inactive' }); return res.status(401).json({ erro: 'Usuário inativo' }); }
    if (!usuario.senhaHash) {
      logger.info('login_failure', { ref, motivo: 'sem_senha_social' });
      return res.status(401).json({ erro: 'Esta conta usa login social. Entre com Google, Microsoft ou Apple.' });
    }
    const senhaCorreta = await bcrypt.compare(password, usuario.senhaHash);
    if (!senhaCorreta) { logger.info('login_failure', { ref, motivo: 'invalid_password' }); return res.status(401).json({ erro: 'Credenciais inválidas' }); }
    if (usuario.twoFactorAtivo && usuario.totpSecret) {
      logger.info('login_2fa_required', { userId: usuario.id, metodo: 'totp' });
      return res.json({ twoFactorRequerido: true, desafio: gerarDesafio2fa(usuario.id), metodo: 'totp' });
    }
    if (usuario.phone2faAtivo && usuario.telefone) {
      await gerarEEnviarOtp(usuario.id, usuario.telefone);
      logger.info('login_2fa_required', { userId: usuario.id, metodo: 'telefone' });
      return res.json({ twoFactorRequerido: true, desafio: gerarDesafio2fa(usuario.id), metodo: 'telefone' });
    }
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id });
    res.json(payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/login/2fa', async (req, res) => {
  const parse = z.object({ desafio: z.string().min(1), codigo: z.string().min(1) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try { payload = verificarDesafio2fa(parse.data.desafio); } catch { return res.status(401).json({ erro: 'Desafio inválido ou expirado' }); }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });
    const segredo = decifrarSegredo(usuario.totpSecret);
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) { logger.info('login_2fa_failure', { userId: usuario.id }); return res.status(400).json({ erro: 'Código inválido' }); }
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa' });
    res.json(payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/login/2fa-telefone', async (req, res) => {
  const parse = z.object({ desafio: z.string().min(1), codigo: z.string().min(1) }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try { payload = verificarDesafio2fa(parse.data.desafio); } catch { return res.status(401).json({ erro: 'Desafio inválido ou expirado' }); }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.phone2faAtivo) return res.status(400).json({ erro: '2FA por telefone não está ativo' });
    if (!validarOtpTelefone(usuario, parse.data.codigo)) {
      logger.info('login_2fa_telefone_failure', { userId: usuario.id });
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }
    await limparOtpTelefone(usuario.id);
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa-telefone' });
    res.json(payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa-telefone', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/setup', async (req, res) => {
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
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      return tx.usuario.create({
        data: { nome, username, senhaHash, admin: true, papel: 'dono', empresaId: empresa.id },
        select: { id: true, nome: true, username: true, admin: true, papel: true, empresaId: true },
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

router.post('/auth/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
  const { nome, nomeEmpresa, username, email, telefone, senha } = parse.data;
  const forca = avaliarForcaSenha(senha);
  if (!forca.valida) return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });
  const senhaHash = await bcrypt.hash(senha, 12);
  const telefoneCanonico = canonizarTelefone(telefone);
  try {
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      return tx.usuario.create({
        data: { nome, username, email, telefone: telefoneCanonico, senhaHash, admin: true, papel: 'dono', empresaId: empresa.id },
        select: { id: true, nome: true, username: true, email: true, telefone: true, admin: true, ativo: true, telefoneVerificado: true, empresaId: true, criadoEm: true },
      });
    });
    await gerarEEnviarOtp(usuario.id, telefoneCanonico);
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

router.get('/auth/providers', (req, res) => {
  res.json(provedoresHabilitados());
});

router.post('/auth/oauth/:provedor', async (req, res) => {
  const provedor = String(req.params.provedor || '').toLowerCase();
  if (!PROVEDORES_VALIDOS.has(provedor)) return res.status(404).json({ erro: 'Provedor não suportado' });
  const parse = oauthSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  let identidade;
  try {
    identidade = await verificarIdToken(provedor, parse.data.idToken, parse.data.nonce);
  } catch (erro) {
    if (erro instanceof OAuthError) {
      logger.info('oauth_falha', { provedor, codigo: erro.codigo });
      const status = erro.status === 404 ? 404 : 400;
      return res.status(status).json({ erro: status === 404 ? 'Provedor indisponível' : 'Não foi possível validar o login social. Tente novamente.' });
    }
    logger.error('Erro verificar ID token', { provedor, erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }

  const { sub, email, emailVerificado, nome } = identidade;
  try {
    const vinculo = await prisma.contaSocial.findUnique({
      where: { provedor_provedorSub: { provedor, provedorSub: sub } },
      include: { usuario: true },
    });
    if (vinculo) {
      if (!vinculo.usuario.ativo) return res.status(403).json({ erro: 'Usuário inativo' });
      return responderSessao(res, vinculo.usuario, `oauth:${provedor}`);
    }
    if (email && emailVerificado) {
      const existente = await prisma.usuario.findUnique({ where: { email } });
      if (existente) {
        if (!existente.ativo) return res.status(403).json({ erro: 'Usuário inativo' });
        await prisma.contaSocial.create({ data: { usuarioId: existente.id, provedor, provedorSub: sub, email } });
        logger.info('oauth_vinculo_email', { userId: existente.id, provedor });
        return responderSessao(res, existente, `oauth:${provedor}`);
      }
    }
    const emailConfiavel = email && emailVerificado ? email : null;
    const nomeEmpresa = `Empresa de ${nome}`.slice(0, 60);
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    const username = await gerarUsernameUnico(email || nome);
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      const novo = await tx.usuario.create({
        data: { nome, username, email: emailConfiavel, senhaHash: null, admin: true, papel: 'dono', empresaId: empresa.id, emailVerificado: Boolean(emailConfiavel) },
      });
      await tx.contaSocial.create({ data: { usuarioId: novo.id, provedor, provedorSub: sub, email: email ?? null } });
      return novo;
    });
    logger.info('oauth_cadastro', { userId: usuario.id, provedor });
    return responderSessao(res, usuario, `oauth:${provedor}`);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Conflito ao criar a conta. Tente novamente.' });
    logger.error('Erro POST /auth/oauth', { provedor, erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
