import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import {
  gerarJWT,
  gerarRefreshTokenRaw,
  hashRefreshToken,
  dataExpiracaoRefresh,
  gerarDesafio2fa,
  verificarDesafio2fa,
  autenticarCandidatos,
  criarRefreshEmTx,
  setRefreshCookie,
} from '../services/auth.js';
import { permissoesEfetivas } from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import { verificarCodigo, decifrarSegredo } from '../services/totp.js';
import { verificarCodigo as verificarCodigoRecuperacao } from '../services/codigosRecuperacao.js';
import { definirOtpTelefone, validarOtpTelefone, limparOtpTelefone } from '../services/otp.js';
import { canonizarTelefone, variantesTelefone } from '../services/parser.js';
import { enviarMensagem } from '../services/whatsapp/gateway.js';
import { verificarIdToken, provedoresHabilitados, OAuthError } from '../services/oauth.js';
import {
  enviarEmailVerificacao,
  enviarEmailBoasVindas,
  enviarEmailResetSenha,
  enviarEmailMagicLink,
} from '../services/email.js';
import { agendarSequencia } from '../services/onboarding.js';
import { TRIAL_DIAS } from '../services/billing.js';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { authLimiter } from '../middlewares/rateLimiters.js';

const router = Router();

async function gerarSlugEmpresa(nome) {
  const base =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'empresa';
  let slug = base;
  let n = 1;
  while (await prisma.empresa.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

async function gerarUsernameUnico(base) {
  const limpo =
    String(base || '')
      .split('@')[0]
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'usuario';
  let username = limpo;
  let n = 1;
  while (await prisma.usuario.findUnique({ where: { username } })) username = `${limpo}_${n++}`;
  return username;
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'strict',
  path: '/api/auth',
};

async function emitirRefreshCookie(res, usuarioId) {
  const raw = await criarRefreshEmTx(prisma, usuarioId);
  setRefreshCookie(res, raw);
}

/* [SEC-HB-11] Só resposta que ENTREGA sessão conta como sucesso para o rate limit; 200
   intermediário (desafio 2FA, desambiguação) continua contando tentativa. O marcador é lido
   por requestWasSuccessful em rateLimiters.js. Devolve undefined de propósito (uso via ??). */
function marcarSessaoCompleta(res) {
  res.locals.sessaoCompleta = true;
  return undefined;
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

async function responderSessao(res, usuario, via) {
  if (usuario.twoFactorAtivo && usuario.totpSecret) {
    logger.info('login_2fa_required', { userId: usuario.id, via });
    return res.json({
      twoFactorRequerido: true,
      desafio: gerarDesafio2fa(usuario.id),
      metodo: 'totp',
    });
  }
  /* [Gate 6, achado 2] O 2o fator por TELEFONE também vale aqui — antes só o TOTP era exigido,
     então um login por OAuth (ou magic-link, que passou a usar este helper) de quem tem apenas
     2FA-por-telefone emitia sessão direto, contornando o fator no cenário de e-mail/OAuth
     comprometido. Espelha o ramo phone2fa do /auth/login normal. */
  if (usuario.phone2faAtivo && usuario.telefone) {
    await gerarEEnviarOtp(usuario.id, usuario.telefone);
    logger.info('login_2fa_required', { userId: usuario.id, via, metodo: 'telefone' });
    return res.json({
      twoFactorRequerido: true,
      desafio: gerarDesafio2fa(usuario.id),
      metodo: 'telefone',
    });
  }
  await emitirRefreshCookie(res, usuario.id);
  const token = gerarJWT(usuario);
  logger.info('login_success', { userId: usuario.id, via });
  return res.json(marcarSessaoCompleta(res) ?? payloadSessao(usuario, token));
}

// T-REC-01: gerarDesafio2fa/verificarDesafio2fa agora vivem em services/auth.js
// (compartilhadas com /auth/login/2fa/recuperar, abaixo) — ver import no topo.

const ultimoOtpEnviado = new Map();
const OTP_REENVIO_MS = 5 * 60_000;

async function gerarEEnviarOtp(userId, telefone) {
  const agora = Date.now();
  const anterior = ultimoOtpEnviado.get(userId);
  if (anterior && agora - anterior < OTP_REENVIO_MS) {
    logger.info('otp_reenvio_throttled', { userId });
    return;
  }
  ultimoOtpEnviado.set(userId, agora);
  const codigo = await definirOtpTelefone(userId);
  const destino = canonizarTelefone(telefone);
  if (destino) {
    await enviarMensagem(
      destino,
      `🔑 Seu código de verificação ADMAI é *${codigo}* (válido por 10 minutos).`
    ).catch((e) => logger.warn('Falha ao enviar OTP por WhatsApp', { userId, erro: e.message }));
  }
}

const registerSchema = z.object({
  nome: z.string().min(2),
  nomeEmpresa: z.string().min(2),
  username: z
    .string()
    .min(3)
    .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
  email: z.string().email(),
  telefone: z.string().min(8).max(20),
  senha: z.string().min(8),
});

const PROVEDORES_VALIDOS = new Set(['google', 'microsoft', 'apple']);
const oauthSchema = z.object({ idToken: z.string().min(1), nonce: z.string().min(1).optional() });

router.post('/auth/login', async (req, res) => {
  const schema = z
    .object({
      username: z.string().min(1).optional(),
      telefone: z.string().min(1).optional(),
      usuarioId: z.number().int().positive().optional(),
      password: z.string().min(1),
    })
    .refine((d) => d.username || d.telefone || d.usuarioId, {
      message: 'Informe usuário ou telefone',
    });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  const { username, telefone, usuarioId, password } = parse.data;
  const ref = username ?? telefone ?? `id:${usuarioId}`;
  try {
    // EV-063: candidatos são só resolvidos aqui — NENHUMA informação (existe? está
    // ativo? é conta social? quantas empresas?) é revelada antes de `autenticarCandidatos`
    // provar a senha. O ramo de telefone não filtra `ativo` na query de propósito: o
    // filtro de ativo acontece dentro de `autenticarCandidatos`, no mesmo lugar e do
    // mesmo jeito que para username/usuarioId — antes, só o ramo de telefone filtrava
    // ativo na query, o que por si só já era uma diferença observável de comportamento.
    let candidatos;
    if (usuarioId) {
      const u = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      candidatos = u ? [u] : [];
    } else if (username) {
      const u = await prisma.usuario.findUnique({ where: { username } });
      candidatos = u ? [u] : [];
    } else {
      const variantes = variantesTelefone(telefone);
      candidatos = variantes.length
        ? await prisma.usuario.findMany({
            where: { telefone: { in: variantes } },
            include: { empresa: { select: { nome: true } } },
          })
        : [];
    }

    const autenticados = await autenticarCandidatos(candidatos, password);

    if (autenticados.length === 0) {
      // Cobre, com a MESMA resposta: telefone/username/id inexistente, usuário
      // inativo, conta social (sem senha) e senha incorreta — nenhum desses casos é
      // distinguível de fora antes da autenticação (regra arquitetural do EV-063).
      logger.info('login_failure', { ref, motivo: 'invalid_credentials' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    if (autenticados.length > 1) {
      // Só chega aqui DEPOIS de provar a senha em mais de uma conta — é o caso
      // legítimo de uma pessoa com o mesmo telefone (e mesma senha) em empresas
      // diferentes. Antes do EV-063, esta lista era revelada sem checar senha nenhuma.
      logger.info('login_desambiguacao', { ref, n: autenticados.length });
      return res.json({
        desambiguacao: autenticados.map((c) => ({
          usuarioId: c.id,
          empresa: c.empresa?.nome ?? '—',
        })),
      });
    }

    const usuario = autenticados[0];
    if (usuario.twoFactorAtivo && usuario.totpSecret) {
      logger.info('login_2fa_required', { userId: usuario.id, metodo: 'totp' });
      return res.json({
        twoFactorRequerido: true,
        desafio: gerarDesafio2fa(usuario.id),
        metodo: 'totp',
      });
    }
    if (usuario.phone2faAtivo && usuario.telefone) {
      await gerarEEnviarOtp(usuario.id, usuario.telefone);
      logger.info('login_2fa_required', { userId: usuario.id, metodo: 'telefone' });
      return res.json({
        twoFactorRequerido: true,
        desafio: gerarDesafio2fa(usuario.id),
        metodo: 'telefone',
      });
    }
    await emitirRefreshCookie(res, usuario.id);
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id });
    res.json(marcarSessaoCompleta(res) ?? payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/login/2fa', async (req, res) => {
  const parse = z
    .object({ desafio: z.string().min(1), codigo: z.string().min(1) })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try {
      payload = verificarDesafio2fa(parse.data.desafio);
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo)
      return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });
    const segredo = decifrarSegredo(usuario.totpSecret);
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) {
      logger.info('login_2fa_failure', { userId: usuario.id });
      return res.status(400).json({ erro: 'Código inválido' });
    }
    await emitirRefreshCookie(res, usuario.id);
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa' });
    res.json(marcarSessaoCompleta(res) ?? payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/login/2fa-telefone', async (req, res) => {
  const parse = z
    .object({ desafio: z.string().min(1), codigo: z.string().min(1) })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try {
      payload = verificarDesafio2fa(parse.data.desafio);
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo)
      return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.phone2faAtivo)
      return res.status(400).json({ erro: '2FA por telefone não está ativo' });
    if (!validarOtpTelefone(usuario, parse.data.codigo)) {
      logger.info('login_2fa_telefone_failure', { userId: usuario.id });
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }
    await limparOtpTelefone(usuario.id);
    await emitirRefreshCookie(res, usuario.id);
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa-telefone' });
    res.json(marcarSessaoCompleta(res) ?? payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa-telefone', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// T-REC-01: rota MOVIDA de routes/account.js (POST /me/2fa/recuperar), onde
// vivia atrás de `router.use(requireAuth)` — inalcançável pelo fluxo real,
// porque nesse ponto do login (desafio 2FA pendente) o usuário AINDA NÃO tem
// sessão completa, só o `desafio` recebido de `/auth/login` (EV-022). Aqui,
// como `/auth/login/2fa` e `/auth/login/2fa-telefone` acima, a própria
// verificação do desafio (verificarDesafio2fa) É a autenticação da rota —
// não uma dispensa dela.
router.post('/auth/login/2fa/recuperar', async (req, res) => {
  const parse = z
    .object({ desafio: z.string().min(1), codigo: z.string().min(1) })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try {
      payload = verificarDesafio2fa(parse.data.desafio);
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo)
      return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });

    const ok = await verificarCodigoRecuperacao(usuario.id, parse.data.codigo);
    if (!ok) {
      logger.info('recuperacao_2fa_falha', { userId: usuario.id });
      return res.status(400).json({ erro: 'Código de recuperação inválido ou já utilizado' });
    }

    await emitirRefreshCookie(res, usuario.id);
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa-recuperacao' });
    res.json(marcarSessaoCompleta(res) ?? payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa/recuperar', { erro: erro.message });
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
      username: z
        .string()
        .min(3)
        .regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, nomeEmpresa, username, senha } = parse.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      // T-BILL-06 (correção pós-revisão): /setup cria empresa pelo mesmo
      // caminho de /auth/register — sem isto, a 1ª empresa da instância
      // (a do próprio bootstrap) ficaria sem Assinatura, mesmo estado
      // "indeterminado" (503) que T-BILL-06 existe pra fechar.
      await tx.assinatura.create({
        data: {
          empresaId: empresa.id,
          status: 'trialing',
          trialFimEm: new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000),
        },
      });
      return tx.usuario.create({
        data: { nome, username, senhaHash, admin: true, papel: 'dono', empresaId: empresa.id },
        select: { id: true, nome: true, username: true, admin: true, papel: true, empresaId: true },
      });
    });
    await emitirRefreshCookie(res, usuario.id);
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
  if (!parse.success)
    return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
  const { nome, nomeEmpresa, username, email, telefone, senha } = parse.data;
  const forca = avaliarForcaSenha(senha);
  if (!forca.valida)
    return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });
  const senhaHash = await bcrypt.hash(senha, 12);
  const telefoneCanonico = canonizarTelefone(telefone);
  try {
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      // T-BILL-06: sem isto, a empresa ficava SEM registro de Assinatura até
      // tocar o Stripe pela 1ª vez (EV-032) — o paywall (T-BILL-04) trataria
      // isso como estado indeterminado (503), bloqueando toda empresa nova.
      await tx.assinatura.create({
        data: {
          empresaId: empresa.id,
          status: 'trialing',
          trialFimEm: new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000),
        },
      });
      return tx.usuario.create({
        data: {
          nome,
          username,
          email,
          telefone: telefoneCanonico,
          senhaHash,
          admin: true,
          papel: 'dono',
          empresaId: empresa.id,
        },
        select: {
          id: true,
          nome: true,
          username: true,
          email: true,
          telefone: true,
          admin: true,
          ativo: true,
          telefoneVerificado: true,
          empresaId: true,
          criadoEm: true,
        },
      });
    });
    await gerarEEnviarOtp(usuario.id, telefoneCanonico);

    if (usuario.email) {
      const tokenEmail = jwt.sign(
        { sub: usuario.id, tipo: 'email_verify', email: usuario.email },
        env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '24h' }
      );
      enviarEmailVerificacao(usuario, tokenEmail).catch(() => {});
      agendarSequencia(usuario.id, usuario.email, usuario.nome).catch(() => {});
    }

    await emitirRefreshCookie(res, usuario.id);
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

router.post('/auth/recuperar-senha', authLimiter, async (req, res) => {
  const parse = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: parse.data.email } });
    if (usuario && usuario.email) {
      const token = jwt.sign({ sub: usuario.id, tipo: 'password_reset' }, env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '1h',
      });
      enviarEmailResetSenha(usuario, token).catch(() => {});
    }
    // Sempre retorna OK para evitar user enumeration
    return res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /auth/recuperar-senha', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/redefinir-senha', authLimiter, async (req, res) => {
  const parse = z
    .object({ token: z.string().min(1), novaSenha: z.string().min(8) })
    .safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    let payload;
    try {
      payload = jwt.verify(parse.data.token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload?.tipo !== 'password_reset' || !payload?.sub) throw new Error('Token inválido');
    } catch {
      return res.status(400).json({ erro: 'Link inválido ou expirado' });
    }

    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(404).json({ erro: 'Usuário não encontrado' });

    // Token single-use: iat deve ser >= senhaAlteradaEm
    const iatMs = payload.iat * 1000;
    if (usuario.senhaAlteradaEm && iatMs < usuario.senhaAlteradaEm.getTime()) {
      return res.status(400).json({ erro: 'Link já utilizado. Solicite um novo.' });
    }

    const { avaliarForcaSenha } = await import('../services/senha.js');
    const forca = avaliarForcaSenha(parse.data.novaSenha);
    if (!forca.valida)
      return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });

    const bcrypt = await import('bcryptjs');
    const senhaHash = await bcrypt.default.hash(parse.data.novaSenha, 12);
    const agora = new Date();
    /* [Gate 6 R2] Mutação da senha + revogação dos refresh na MESMA transação — atômico, como
       o revisor exigiu. O corte em tokenValidoApos já barra refresh antigos no /auth/refresh; o
       delete é o cinturão (invalida imediatamente, sem esperar a próxima rotação). */
    await prisma.$transaction([
      prisma.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash, senhaAlteradaEm: agora, tokenValidoApos: agora, senhaProvisoria: false },
      }),
      prisma.refreshToken.deleteMany({ where: { usuarioId: usuario.id } }),
    ]);
    logger.info('senha_redefinida_email', { userId: usuario.id });
    return res.json({ ok: true });
  } catch (erro) {
    logger.error('Erro POST /auth/redefinir-senha', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/auth/email/verificar', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) return res.status(400).json({ erro: 'Token ausente' });
  try {
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload?.tipo !== 'email_verify' || !payload?.sub) throw new Error('Token inválido');
    } catch {
      return res.status(400).json({ erro: 'Link inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (!usuario.emailVerificado) {
      await prisma.usuario.update({ where: { id: usuario.id }, data: { emailVerificado: true } });
      enviarEmailBoasVindas(usuario).catch(() => {});
    }
    logger.info('email_verificado', { userId: usuario.id });
    return res.json({ verificado: true });
  } catch (erro) {
    logger.error('Erro GET /auth/email/verificar', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

// F-BYPASS (revisão independente): confirma uma troca de e-mail solicitada via PATCH /me
// — o link foi enviado ao endereço ANTIGO (services/email.js:enviarEmailConfirmarMudancaEmail),
// então só quem já tinha acesso a ele pode aplicar a mudança. Depois, exige prova de posse
// do NOVO endereço reusando o fluxo padrão de verificação (emailVerificado volta a false).
router.get('/auth/email/confirmar-mudanca', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) return res.status(400).json({ erro: 'Token ausente' });
  try {
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload?.tipo !== 'confirmar_email' || !payload?.sub || !payload?.novoEmail) {
        throw new Error('Token inválido');
      }
    } catch {
      return res.status(400).json({ erro: 'Link inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const atualizado = await prisma.usuario.update({
      where: { id: usuario.id },
      data: { email: payload.novoEmail, emailVerificado: false },
    });
    const tokenVerificacao = jwt.sign(
      { sub: atualizado.id, tipo: 'email_verify', email: atualizado.email },
      env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '24h' }
    );
    enviarEmailVerificacao(atualizado, tokenVerificacao).catch(() => {});
    logger.info('email_mudanca_confirmada', { userId: usuario.id });
    return res.json({ confirmado: true, novoEmail: payload.novoEmail });
  } catch (erro) {
    if (erro.code === 'P2002')
      return res.status(409).json({ erro: 'E-mail já em uso por outra conta' });
    logger.error('Erro GET /auth/email/confirmar-mudanca', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/email/reenviar', async (req, res) => {
  const parse = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: parse.data.email } });
    if (usuario && !usuario.emailVerificado && usuario.email) {
      const token = jwt.sign(
        { sub: usuario.id, tipo: 'email_verify', email: usuario.email },
        env.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '24h' }
      );
      enviarEmailVerificacao(usuario, token).catch(() => {});
    }
    return res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /auth/email/reenviar', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/convite/:token', async (req, res) => {
  const tokenHash = createHash('sha256').update(req.params.token).digest('hex');
  try {
    const convite = await prisma.conviteUsuario.findFirst({
      where: { tokenHash, aceitoEm: null, expiraEm: { gt: new Date() } },
    });
    if (!convite) return res.status(404).json({ erro: 'Convite inválido ou expirado' });
    const empresa = await prisma.empresa.findUnique({
      where: { id: convite.empresaId },
      select: { nome: true },
    });
    res.json({
      email: convite.email,
      papel: convite.papel,
      empresa: empresa?.nome ?? '',
      convidadoPor: convite.nomeConvidadoPor,
    });
  } catch (erro) {
    logger.error('Erro GET /convite/:token', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/convite/:token/aceitar', async (req, res) => {
  const tokenHash = createHash('sha256').update(req.params.token).digest('hex');
  const parse = z
    .object({
      nome: z.string().min(2),
      username: z
        .string()
        .min(3)
        .regex(/^[a-zA-Z0-9_]+$/),
      senha: z.string().min(8),
    })
    .safeParse(req.body);
  if (!parse.success)
    return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
  try {
    const convite = await prisma.conviteUsuario.findFirst({
      where: { tokenHash, aceitoEm: null, expiraEm: { gt: new Date() } },
    });
    if (!convite) return res.status(404).json({ erro: 'Convite inválido ou expirado' });
    const forca = avaliarForcaSenha(parse.data.senha);
    if (!forca.valida)
      return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });
    const senhaHash = await bcrypt.hash(parse.data.senha, 12);
    const usuario = await prisma.$transaction(async (tx) => {
      const novo = await tx.usuario.create({
        data: {
          nome: parse.data.nome,
          username: parse.data.username,
          email: convite.email,
          senhaHash,
          papel: convite.papel,
          admin: convite.papel === 'dono',
          emailVerificado: true,
          empresaId: convite.empresaId,
        },
        select: {
          id: true,
          nome: true,
          username: true,
          admin: true,
          papel: true,
          empresaId: true,
          senhaProvisoria: true,
        },
      });
      /* [SEC-HB-01] Padrão EV-056: o consumo do convite é CONDICIONAL a aceitoEm:null —
         duas aceitações concorrentes do mesmo token elegem UM vencedor no banco; a perdedora
         lança e a transação desfaz o usuário que ela tinha criado. */
      const consumo = await tx.conviteUsuario.updateMany({
        where: { id: convite.id, aceitoEm: null },
        data: { aceitoEm: new Date() },
      });
      if (consumo.count !== 1) {
        const corrida = new Error('Convite já aceito por requisição concorrente');
        corrida.code = 'CONVITE_JA_ACEITO';
        throw corrida;
      }
      return novo;
    });
    logger.info('convite_aceito', { userId: usuario.id, empresaId: convite.empresaId });
    await emitirRefreshCookie(res, usuario.id);
    const token = gerarJWT(usuario);
    res.status(201).json(payloadSessao(usuario, token));
  } catch (erro) {
    if (erro.code === 'P2002')
      return res.status(409).json({ erro: 'Username ou e-mail já em uso' });
    if (erro.code === 'CONVITE_JA_ACEITO')
      return res.status(404).json({ erro: 'Convite inválido ou expirado' });
    logger.error('Erro POST /convite/:token/aceitar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/refresh', async (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (!raw) return res.status(401).json({ erro: 'Refresh token ausente' });
  try {
    const tokenHash = hashRefreshToken(raw);
    /* [Gate 6 R3] Rotação ATÔMICA: a checagem do corte, o consumo do token usado e a criação do
       novo acontecem na MESMA transação, relendo o corte FRESCO do usuário. Fecha as duas
       corridas que a R2 deixava:
         - temporal: o corte agora é exato (agora), e comparamos `criadoEm <= corte` (inclusivo);
         - TOCTOU: o delete é condicional (deleteMany por id → count) — se uma troca de credencial
           concorrente já apagou a árvore, count=0 e NÃO criamos um refresh novo (aborta 401). */
    let saida;
    try {
      saida = await prisma.$transaction(async (tx) => {
        const registro = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { usuario: true },
        });
        if (!registro || registro.expiraEm < new Date())
          return { status: 401, erro: 'Sessão expirada' };
        if (!registro.usuario.ativo) return { status: 401, erro: 'Usuário inativo' };
        const corte = registro.usuario.tokenValidoApos;
        if (corte && registro.criadoEm <= corte) {
          await tx.refreshToken.deleteMany({ where: { usuarioId: registro.usuario.id } });
          return { status: 401, erro: 'Sessão expirada' };
        }
        const consumido = await tx.refreshToken.deleteMany({ where: { id: registro.id } });
        if (consumido.count !== 1) return { status: 401, erro: 'Sessão expirada' };
        const rawNovo = await criarRefreshEmTx(tx, registro.usuario.id);
        return {
          status: 200,
          raw: rawNovo,
          token: gerarJWT(registro.usuario),
          userId: registro.usuario.id,
        };
      });
    } catch (e) {
      logger.error('Erro na rotação de refresh', { erro: e.message });
      return res.status(500).json({ erro: 'Erro interno' });
    }
    if (saida.status !== 200) {
      res.clearCookie('refresh_token', { ...COOKIE_OPTS });
      return res.status(401).json({ erro: saida.erro });
    }
    setRefreshCookie(res, saida.raw);
    logger.info('token_refreshed', { userId: saida.userId });
    return res.json({ token: saida.token });
  } catch (erro) {
    logger.error('Erro POST /auth/refresh', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/auth/logout', (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (raw) {
    const tokenHash = hashRefreshToken(raw);
    prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  res.clearCookie('refresh_token', { ...COOKIE_OPTS });
  return res.json({ ok: true });
});

router.post('/auth/magic-link', authLimiter, async (req, res) => {
  const parse = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const usuario = await prisma.usuario.findUnique({ where: { email: parse.data.email } });
    if (usuario && usuario.ativo && usuario.email) {
      const token = jwt.sign({ sub: usuario.id, tipo: 'magic_link' }, env.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '15m',
      });
      enviarEmailMagicLink(usuario, token).catch(() => {});
    }
    return res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /auth/magic-link', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/auth/magic-link/verificar', async (req, res) => {
  const token = String(req.query.token ?? '');
  if (!token) return res.status(400).json({ erro: 'Token ausente' });
  try {
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
      if (payload?.tipo !== 'magic_link' || !payload?.sub) throw new Error('Token inválido');
    } catch {
      return res.status(400).json({ erro: 'Link inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(404).json({ erro: 'Usuário não encontrado' });
    if (!usuario.emailVerificado) {
      await prisma.usuario.update({ where: { id: usuario.id }, data: { emailVerificado: true } });
    }
    /* [Gate 6, achado 2] Posse do e-mail é o 1º fator; se há 2FA ativo, o 2º ainda é exigido —
       responderSessao devolve o desafio em vez de emitir sessão. Sem isso, o magic-link era um
       bypass completo do 2FA para quem controlasse o e-mail. */
    logger.info('magic_link_login', { userId: usuario.id });
    return responderSessao(res, usuario, 'magic-link');
  } catch (erro) {
    logger.error('Erro GET /auth/magic-link/verificar', { erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/auth/providers', (req, res) => {
  res.json(provedoresHabilitados());
});

router.post('/auth/oauth/:provedor', async (req, res) => {
  const provedor = String(req.params.provedor || '').toLowerCase();
  if (!PROVEDORES_VALIDOS.has(provedor))
    return res.status(404).json({ erro: 'Provedor não suportado' });
  const parse = oauthSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  let identidade;
  try {
    identidade = await verificarIdToken(provedor, parse.data.idToken, parse.data.nonce);
  } catch (erro) {
    if (erro instanceof OAuthError) {
      logger.info('oauth_falha', { provedor, codigo: erro.codigo });
      const status = erro.status === 404 ? 404 : 400;
      return res.status(status).json({
        erro:
          status === 404
            ? 'Provedor indisponível'
            : 'Não foi possível validar o login social. Tente novamente.',
      });
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
        await prisma.contaSocial.create({
          data: { usuarioId: existente.id, provedor, provedorSub: sub, email },
        });
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
      // T-BILL-06: mesmo cadastro-de-empresa que /auth/register, só que via
      // login social — precisa do mesmo trial pra não cair em "indeterminado"
      // (503) no paywall (T-BILL-04) assim que a empresa nascer.
      await tx.assinatura.create({
        data: {
          empresaId: empresa.id,
          status: 'trialing',
          trialFimEm: new Date(Date.now() + TRIAL_DIAS * 24 * 60 * 60 * 1000),
        },
      });
      const novo = await tx.usuario.create({
        data: {
          nome,
          username,
          email: emailConfiavel,
          senhaHash: null,
          admin: true,
          papel: 'dono',
          empresaId: empresa.id,
          emailVerificado: Boolean(emailConfiavel),
        },
      });
      await tx.contaSocial.create({
        data: { usuarioId: novo.id, provedor, provedorSub: sub, email: email ?? null },
      });
      return novo;
    });
    logger.info('oauth_cadastro', { userId: usuario.id, provedor });
    return responderSessao(res, usuario, `oauth:${provedor}`);
  } catch (erro) {
    if (erro.code === 'P2002')
      return res.status(409).json({ erro: 'Conflito ao criar a conta. Tente novamente.' });
    logger.error('Erro POST /auth/oauth', { provedor, erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
