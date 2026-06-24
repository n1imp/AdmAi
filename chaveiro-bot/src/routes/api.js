import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { prismaParaEmpresa } from '../db/tenant.js';
import { gerarRelatorioPDF, gerarRelatorioPonto, gerarCsvPonto } from '../services/relatorio.js';
import { resumoMes, registrarPonto, diaLocal, ROTULO_BATIDA } from '../services/ponto.js';
import { buscarOuCriarTecnico } from '../services/servico.js';
import { movimentarEstoque, darBaixaPorServico } from '../services/estoque.js';
import { agendarAvaliacao } from '../services/avaliacao.js';
import { resolverPreferencias } from '../services/notificacao.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { contemInsensivel } from '../utils/busca.js';
import { conferirMagicBytes } from '../utils/upload.js';
import { gerarJWT, verificarJWT, tokenAindaValido } from '../services/auth.js';
import {
  permissoesEfetivas, pode, podeProprio, sanitizarPermissoes, presetDoPapel,
  PAPEIS, MODULOS, ACOES_POR_MODULO, CAPACIDADES_PROPRIO,
} from '../services/permissoes.js';
import { avaliarForcaSenha } from '../services/senha.js';
import {
  gerarSegredoTotp, montarOtpauthUrl, verificarCodigo,
  cifrarSegredo, decifrarSegredo,
} from '../services/totp.js';
import { definirOtpTelefone, validarOtpTelefone, limparOtpTelefone } from '../services/otp.js';
import { canonizarTelefone, variantesTelefone } from '../services/parser.js';
import { criarAcessoTecnico, resetarPin } from '../services/credenciais.js';
import { enviarMensagem } from '../services/whatsapp/gateway.js';
import { verificarIdToken, provedoresHabilitados, OAuthError } from '../services/oauth.js';

export const apiRouter = Router();

// ── MIDDLEWARES DE AUTENTICAÇÃO ───────────────────────────────────────────────

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Token ausente' });
  try {
    const payload = verificarJWT(token);
    // Carrega o técnico vinculado (escopo "próprio" do funcionário) num único round-trip.
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      include: { tecnico: { select: { id: true } } },
    });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!tokenAindaValido(payload, usuario.tokenValidoApos)) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    // Usa o empresaId AUTORITATIVO do banco — nunca o derivado do token (pode estar
    // defasado se o vínculo da empresa mudou após a emissão do JWT). O mesmo vale para
    // `papel`/`permissoes`: são sempre do banco, o token é só um espelho para o front.
    req.user = {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      admin: usuario.admin,
      papel: usuario.papel,
      empresaId: usuario.empresaId,
      tecnicoId: usuario.tecnico?.id ?? null,        // escopo "próprio" (nunca confiar no client)
      senhaProvisoria: usuario.senhaProvisoria,
      permissoesEfetivas: permissoesEfetivas(usuario),
    };
    // Client Prisma escopado à empresa do usuário — TODA query de negócio usa req.db.
    req.db = prismaParaEmpresa(usuario.empresaId);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

// Restringe a administradores (dono). Mantido para rotas legadas; novas rotas devem
// preferir requirePermissao(modulo, acao), que respeita papel + overrides.
function adminOnly(req, res, next) {
  if (!req.user?.admin) return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  next();
}

// Exige uma permissão de módulo/ação (RBAC granular). Ex.: requirePermissao('usuarios','editar').
function requirePermissao(modulo, acao) {
  return (req, res, next) => {
    if (pode(req.user, modulo, acao)) return next();
    return res.status(403).json({ erro: 'Sem permissão para esta ação' });
  };
}

export { requireAuth };

// ── HELPERS ────────────────────────────────────────────────────────────────────

// Teto de linhas para findMany de agregação (dashboard/perfil). Evita carregar a
// tabela inteira em memória num intervalo amplo; um valor alto cobre os casos reais
// sem sobrecarregar o processo.
const MAX_AGREGACAO = 10_000;

// Verifica se um Date é válido (não NaN) — evita propagar Invalid Date às queries.
function dataValida(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

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
  // Datas vindas da query (strings) são validadas: strings malformadas são
  // tratadas como ausentes para nunca enviar `Invalid Date` ao Prisma.
  const dInicio = inicio ? new Date(inicio) : null;
  const dFim = fim ? new Date(fim + 'T23:59:59.999Z') : null;
  const inicioOk = dataValida(dInicio);
  const fimOk = dataValida(dFim);
  if (inicioOk && fimOk) {
    return { gte: dInicio, lte: dFim };
  }
  if (inicioOk) {
    return { gte: dInicio, lte: agora };
  }
  if (fimOk) {
    return { gte: new Date('2000-01-01'), lte: dFim };
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

// Gera um username único a partir de um e-mail/nome (mesma ideia do slug, mas com
// `_` e respeitando o regex de username). Usado no cadastro via login social, onde
// o usuário não escolhe um username.
async function gerarUsernameUnico(base) {
  const limpo = String(base || '')
    .split('@')[0]
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'usuario';
  let username = limpo;
  let n = 1;
  while (await prisma.usuario.findUnique({ where: { username } })) {
    username = `${limpo}_${n++}`;
  }
  return username;
}

// Shape padrão da resposta de login bem-sucedido. `papel` e `senhaProvisoria` guiam o
// painel (RBAC + tela de troca de senha forçada). O token também os carrega.
function payloadSessao(usuario, token) {
  return {
    token,
    nome: usuario.nome,
    admin: usuario.admin,
    papel: usuario.papel ?? (usuario.admin ? 'dono' : 'funcionario'),
    senhaProvisoria: Boolean(usuario.senhaProvisoria),
  };
}

// Emite a sessão padrão pós-autenticação. Reusa a MESMA regra do login por senha:
// se o 2FA está ativo (com segredo TOTP), devolve um desafio curto em vez do token.
function responderSessao(res, usuario, via) {
  if (usuario.twoFactorAtivo && usuario.totpSecret) {
    logger.info('login_2fa_required', { userId: usuario.id, via });
    return res.json({ twoFactorRequerido: true, desafio: gerarDesafio2fa(usuario.id) });
  }
  const token = gerarJWT(usuario);
  logger.info('login_success', { userId: usuario.id, via });
  return res.json(payloadSessao(usuario, token));
}

// ── DESAFIO 2FA (JWT curto entre senha-OK e código TOTP) ──────────────────────
// Após a senha conferir, se o 2FA está ativo emitimos um "desafio" de 5 min
// (assinado com o JWT_SECRET, payload { sub, tipo:'2fa' }). O cliente troca esse
// desafio + o código de 6 dígitos pelo token de sessão normal. O desafio NÃO
// autentica sessão alguma — só prova que a etapa de senha passou recentemente.
function gerarDesafio2fa(userId) {
  return jwt.sign({ sub: userId, tipo: '2fa' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

function verificarDesafio2fa(desafio) {
  const payload = jwt.verify(desafio, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload?.tipo !== '2fa' || !payload?.sub) {
    throw new Error('Desafio 2FA inválido');
  }
  return payload;
}

// ── OTP DE TELEFONE (entregue pelo WhatsApp do robô) ──────────────────────────
// Gera um código, persiste cifrado no usuário e entrega via WhatsApp. Best-effort:
// se o robô estiver offline o fluxo não falha (o usuário pode reenviar). Nunca loga
// o código.
// Throttle de reenvio: evita spam de OTP (e de mensagens WhatsApp) se o mesmo usuário
// dispara vários logins seguidos. Mantém o OTP já válido (10 min) em vez de regerar.
// In-memory (1 instância no Railway); reinício zera — aceitável para anti-spam.
const ultimoOtpEnviado = new Map(); // userId -> timestamp(ms)
const OTP_REENVIO_MS = 5 * 60_000;

async function gerarEEnviarOtp(userId, telefone) {
  const agora = Date.now();
  const anterior = ultimoOtpEnviado.get(userId);
  if (anterior && agora - anterior < OTP_REENVIO_MS) {
    logger.info('otp_reenvio_throttled', { userId });
    return; // OTP recente ainda é válido; não regenera nem reenvia.
  }
  ultimoOtpEnviado.set(userId, agora);
  const codigo = await definirOtpTelefone(userId);
  const destino = canonizarTelefone(telefone);
  if (destino) {
    await enviarMensagem(destino, `🔑 Seu código de verificação ADMAI é *${codigo}* (válido por 10 minutos).`)
      .catch((e) => logger.warn('Falha ao enviar OTP por WhatsApp', { userId, erro: e.message }));
  }
}

// ── ROTAS PÚBLICAS (sem auth) ─────────────────────────────────────────────────

// POST /api/auth/login — por USERNAME (dono) ou TELEFONE (funcionário).
// O técnico entra pelo telefone (modelo de número único). Como o mesmo telefone pode
// existir em mais de uma empresa, quando há ambiguidade devolvemos a lista de empresas
// (`desambiguacao`) e o cliente repete o login com `usuarioId`.
apiRouter.post('/auth/login', async (req, res) => {
  const schema = z.object({
    username: z.string().min(1).optional(),
    telefone: z.string().min(1).optional(),
    usuarioId: z.number().int().positive().optional(),
    password: z.string().min(1),
  }).refine((d) => d.username || d.telefone || d.usuarioId, {
    message: 'Informe usuário ou telefone',
  });
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
      // Login por telefone: casa por variantes (tolerante ao 9º dígito BR).
      const variantes = variantesTelefone(telefone);
      const candidatos = variantes.length
        ? await prisma.usuario.findMany({
            where: { telefone: { in: variantes }, ativo: true },
            include: { empresa: { select: { nome: true } } },
          })
        : [];
      if (candidatos.length > 1) {
        // Ambiguidade entre empresas → o cliente escolhe e refaz com usuarioId.
        logger.info('login_desambiguacao', { telefone: '***', n: candidatos.length });
        return res.json({
          desambiguacao: candidatos.map((c) => ({ usuarioId: c.id, empresa: c.empresa?.nome ?? '—' })),
        });
      }
      usuario = candidatos[0] ?? null;
    }
    if (!usuario) {
      logger.info('login_failure', { ref, motivo: 'user_not_found' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    if (!usuario.ativo) {
      logger.info('login_failure', { ref, motivo: 'user_inactive' });
      return res.status(401).json({ erro: 'Usuário inativo' });
    }
    // Conta criada só por login social não tem senha — orienta a entrar pelo provedor.
    if (!usuario.senhaHash) {
      logger.info('login_failure', { ref, motivo: 'sem_senha_social' });
      return res.status(401).json({ erro: 'Esta conta usa login social. Entre com Google, Microsoft ou Apple.' });
    }
    const senhaCorreta = await bcrypt.compare(password, usuario.senhaHash);
    if (!senhaCorreta) {
      logger.info('login_failure', { ref, motivo: 'invalid_password' });
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }
    // 2FA ativo → não emite o token de sessão; devolve um desafio curto. O cliente
    // completa em POST /auth/login/2fa com o código do app autenticador.
    // Guarda defensiva: só exige 2FA quando há um segredo TOTP de fato. Usuários
    // que ficaram com o flag legado (antigo PATCH /me/2fa booleano, sem segredo)
    // NÃO ficam trancados para fora — entram normalmente.
    if (usuario.twoFactorAtivo && usuario.totpSecret) {
      logger.info('login_2fa_required', { userId: usuario.id, metodo: 'totp' });
      return res.json({ twoFactorRequerido: true, desafio: gerarDesafio2fa(usuario.id), metodo: 'totp' });
    }
    // 2FA por TELEFONE (OTP via WhatsApp). Só vale com telefone presente.
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

// POST /api/auth/login/2fa — segunda etapa do login quando o 2FA está ativo.
// Troca { desafio, codigo } pelo token de sessão (mesmo shape do login normal).
apiRouter.post('/auth/login/2fa', async (req, res) => {
  const schema = z.object({
    desafio: z.string().min(1),
    codigo: z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  try {
    let payload;
    try {
      payload = verificarDesafio2fa(parse.data.desafio);
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });

    const segredo = decifrarSegredo(usuario.totpSecret);
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) {
      logger.info('login_2fa_failure', { userId: usuario.id });
      // 400 (não 401) de propósito: o interceptor do painel redireciona p/ /login
      // em qualquer 401, o que descartaria o passo do 2FA. 400 mantém o erro inline
      // e permite o usuário tentar o código de novo na mesma tela.
      return res.status(400).json({ erro: 'Código inválido' });
    }
    const token = gerarJWT(usuario);
    logger.info('login_success', { userId: usuario.id, via: '2fa' });
    res.json(payloadSessao(usuario, token));
  } catch (erro) {
    logger.error('Erro POST /auth/login/2fa', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/auth/login/2fa-telefone — segunda etapa quando o 2FA por TELEFONE está
// ativo. Espelha /auth/login/2fa, mas valida o OTP entregue por WhatsApp.
apiRouter.post('/auth/login/2fa-telefone', async (req, res) => {
  const schema = z.object({
    desafio: z.string().min(1),
    codigo: z.string().min(1),
  });
  const parse = schema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  try {
    let payload;
    try {
      payload = verificarDesafio2fa(parse.data.desafio);
    } catch {
      return res.status(401).json({ erro: 'Desafio inválido ou expirado' });
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: payload.sub } });
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!usuario.phone2faAtivo) return res.status(400).json({ erro: '2FA por telefone não está ativo' });

    if (!validarOtpTelefone(usuario, parse.data.codigo)) {
      logger.info('login_2fa_telefone_failure', { userId: usuario.id });
      // 400 (não 401) de propósito: mantém o erro inline no painel (ver /auth/login/2fa).
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

// POST /api/auth/register — auto-cadastro público (usuário comum)
// Cadastro rígido: e-mail e TELEFONE obrigatórios, senha forte. O telefone é a
// identidade do dono no robô de número único — verificado por OTP via WhatsApp.
const registerSchema = z.object({
  nome:        z.string().min(2),
  nomeEmpresa: z.string().min(2),
  username:    z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
  email:       z.string().email(),
  telefone:    z.string().min(8).max(20),
  senha:       z.string().min(8),
});

apiRouter.post('/auth/register', async (req, res) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });

  const { nome, nomeEmpresa, username, email, telefone, senha } = parse.data;
  const forca = avaliarForcaSenha(senha);
  if (!forca.valida) return res.status(400).json({ erro: 'Senha muito fraca', requisitos: forca.requisitos });

  const senhaHash = await bcrypt.hash(senha, 12);
  const telefoneCanonico = canonizarTelefone(telefone);

  try {
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    // Cada cadastro público cria sua própria empresa; o usuário é o dono (admin).
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      return tx.usuario.create({
        data: { nome, username, email, telefone: telefoneCanonico, senhaHash, admin: true, papel: 'dono', empresaId: empresa.id },
        select: { id: true, nome: true, username: true, email: true, telefone: true, admin: true, ativo: true, telefoneVerificado: true, empresaId: true, criadoEm: true },
      });
    });
    // Envia o OTP de verificação do telefone (best-effort; o painel mostra a etapa).
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

// ── LOGIN SOCIAL (OIDC: Google / Microsoft / Apple) ───────────────────────────

// GET /api/auth/providers — quais provedores estão habilitados (client id
// configurada). O painel usa isso para exibir apenas os botões disponíveis.
apiRouter.get('/auth/providers', (req, res) => {
  res.json(provedoresHabilitados());
});

const PROVEDORES_VALIDOS = new Set(['google', 'microsoft', 'apple']);
const oauthSchema = z.object({
  idToken: z.string().min(1),
  nonce: z.string().min(1).optional(),
});

// POST /api/auth/oauth/:provedor — entra/cadastra com login social.
// Verifica o ID token → acha vínculo (provedor,sub) → ou vincula por e-mail
// verificado → ou cria conta+empresa nova. Emite a MESMA sessão do login normal.
apiRouter.post('/auth/oauth/:provedor', async (req, res) => {
  const provedor = String(req.params.provedor || '').toLowerCase();
  if (!PROVEDORES_VALIDOS.has(provedor)) {
    return res.status(404).json({ erro: 'Provedor não suportado' });
  }
  const parse = oauthSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

  let identidade;
  try {
    identidade = await verificarIdToken(provedor, parse.data.idToken, parse.data.nonce);
  } catch (erro) {
    if (erro instanceof OAuthError) {
      logger.info('oauth_falha', { provedor, codigo: erro.codigo });
      // 400 (não 401) em falha de validação de token: o interceptor do painel
      // redireciona p/ /login em qualquer 401, descartando o erro inline. 404 só
      // para provedor indisponível/desconhecido.
      const status = erro.status === 404 ? 404 : 400;
      const msg = status === 404
        ? 'Provedor indisponível'
        : 'Não foi possível validar o login social. Tente novamente.';
      return res.status(status).json({ erro: msg });
    }
    logger.error('Erro verificar ID token', { provedor, erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }

  const { sub, email, emailVerificado, nome } = identidade;

  try {
    // 1) Já existe vínculo (provedor, sub)? Login direto.
    const vinculo = await prisma.contaSocial.findUnique({
      where: { provedor_provedorSub: { provedor, provedorSub: sub } },
      include: { usuario: true },
    });
    if (vinculo) {
      if (!vinculo.usuario.ativo) return res.status(403).json({ erro: 'Usuário inativo' });
      return responderSessao(res, vinculo.usuario, `oauth:${provedor}`);
    }

    // 2) Sem vínculo: se o provedor CONFIRMA o e-mail, vincula a uma conta existente.
    //    Só com e-mail verificado — evita account-takeover por e-mail forjado.
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

    // 3) Conta nova: cria empresa + whatsapp + usuário (admin, sem senha) + vínculo.
    //    Só guardamos o e-mail no Usuario quando verificado (mantém a coluna confiável
    //    e livre de colisões); o e-mail bruto fica em ContaSocial para referência.
    const emailConfiavel = email && emailVerificado ? email : null;
    const nomeEmpresa = `Empresa de ${nome}`.slice(0, 60);
    const slug = await gerarSlugEmpresa(nomeEmpresa);
    const username = await gerarUsernameUnico(email || nome);
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      const novo = await tx.usuario.create({
        data: {
          nome, username, email: emailConfiavel,
          senhaHash: null, admin: true, papel: 'dono', empresaId: empresa.id,
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
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'Conflito ao criar a conta. Tente novamente.' });
    }
    logger.error('Erro POST /auth/oauth', { provedor, erro: erro.message });
    return res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── MIDDLEWARE GLOBAL — aplica às rotas abaixo ────────────────────────────────
apiRouter.use(requireAuth);

// Senha provisória (PIN inicial): bloqueia tudo no servidor até o funcionário definir
// uma senha definitiva. Allow-list mínima: ler o próprio /me e trocar a senha. Devolve
// 403 com `codigo` (o painel intercepta e força a tela de nova senha). Não é 401 de
// propósito — 401 dispara o redirect para /login e descartaria o fluxo.
apiRouter.use((req, res, next) => {
  if (!req.user?.senhaProvisoria) return next();
  const liberado =
    (req.method === 'GET' && req.path === '/me') ||
    (req.method === 'PATCH' && req.path === '/me/senha');
  if (liberado) return next();
  return res.status(403).json({ erro: 'Defina uma nova senha para continuar', codigo: 'senha_provisoria' });
});

// ── CONTA DO USUÁRIO LOGADO (/me) ─────────────────────────────────────────────

const SELECT_ME = {
  id: true, nome: true, username: true, email: true, telefone: true,
  admin: true, papel: true, senhaProvisoria: true, ativo: true,
  emailVerificado: true, telefoneVerificado: true,
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

// GET /api/me/permissoes — papel + permissões EFETIVAS do usuário logado.
// O painel usa isto para mostrar/esconder navegação e telas (a checagem real é no
// servidor; isto é só UX). Disponível para qualquer usuário autenticado (vê o próprio).
apiRouter.get('/me/permissoes', (req, res) => {
  res.json({
    papel: req.user.papel,
    admin: req.user.admin,
    permissoes: req.user.permissoesEfetivas,
  });
});

// GET /api/me/metricas — métricas do PRÓPRIO funcionário (self-scope). Nunca expõe
// dados de outros técnicos. tecnicoId vem de req.user (autoritativo do banco).
apiRouter.get('/me/metricas', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'ver_metricas')) return res.status(403).json({ erro: 'Sem permissão' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const id = req.user.tecnicoId;
    const filtroMes = construirFiltroPeriodo('mes');
    const [tecnico, todos, pagamentos, doMes, pendentes] = await Promise.all([
      req.db.tecnico.findUnique({ where: { id } }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo' }, select: { valorLiquido: true, comissaoGerada: true }, take: MAX_AGREGACAO }),
      req.db.pagamento.findMany({ where: { tecnicoId: id }, select: { valor: true }, take: MAX_AGREGACAO }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroMes }, select: { valorLiquido: true, comissaoGerada: true }, take: MAX_AGREGACAO }),
      req.db.servico.count({ where: { tecnicoId: id, status: 'pendente' } }),
    ]);
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });
    const comissaoGanha = todos.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
    const recebido = pagamentos.reduce((s, x) => s + x.valor, 0);
    const receitaMes = doMes.reduce((s, x) => s + x.valorLiquido, 0);
    const comissaoMes = doMes.reduce((s, x) => s + (x.comissaoGerada ?? 0), 0);
    res.json({
      tecnico: { id: tecnico.id, nome: tecnico.nome, comissao: tecnico.comissao, metaMensal: tecnico.metaMensal, fotoPerfil: tecnico.fotoPerfil },
      totalServicos: todos.length,
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

// GET /api/me/servicos — os PRÓPRIOS serviços do funcionário (inclui pendentes/rejeitados).
apiRouter.get('/me/servicos', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'ver_metricas') && !podeProprio(req.user, 'registrar_servico')) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const servicos = await req.db.servico.findMany({
      where: { tecnicoId: req.user.tecnicoId },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
    res.json(servicos);
  } catch (erro) {
    logger.error('Erro GET /me/servicos', { erro: erro.message });
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
    // Corte 1s no passado: o `iat` do JWT é em segundos (arredondado para baixo),
    // então um corte = agora poderia invalidar o token recém-emitido na mesma
    // janela de segundo. Recuar 1s garante que o novo token permaneça válido.
    const corte = new Date(agora.getTime() - 1000);
    // Invalida todas as sessões antigas — o próprio cliente recebe novo token.
    // Limpa senhaProvisoria: se era um PIN inicial, agora vira senha definitiva.
    const atualizado = await prisma.usuario.update({
      where: { id: req.user.id },
      data: { senhaHash, senhaAlteradaEm: agora, tokenValidoApos: corte, senhaProvisoria: false },
    });
    // Emite o novo token a partir do registro ATUALIZADO (senhaProvisoria já = false).
    const token = gerarJWT(atualizado);
    logger.info('senha_alterada', { userId: req.user.id });
    res.json({ mensagem: 'Senha alterada com sucesso', token });
  } catch (erro) {
    logger.error('Erro PATCH /me/senha', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// Apaga uma empresa e TODOS os seus dados numa transação única, respeitando a ordem
// de dependência das FKs (a maioria das relações com Empresa NÃO tem onDelete: Cascade,
// então os filhos precisam sair antes do pai). Os modelos com cascade real no schema
// (BatidaPonto←RegistroPonto, ServicoMaterial/MovimentacaoEstoque←Servico/Material,
// Notificacao/ContaSocial←Usuario, EmpresaWhatsapp←Empresa) saem junto dos pais.
async function apagarEmpresaEmCascata(empresaId) {
  const where = { empresaId };
  await prisma.$transaction([
    prisma.registroPonto.deleteMany({ where }),    // → BatidaPonto (cascade)
    prisma.avaliacao.deleteMany({ where }),
    prisma.avaliacaoGoogle.deleteMany({ where }),
    prisma.analiseAvaliacoes.deleteMany({ where }),
    prisma.googleConta.deleteMany({ where }),
    prisma.pagamento.deleteMany({ where }),
    prisma.servico.deleteMany({ where }),          // → ServicoMaterial (cascade); MovEstoque.servicoId → null
    prisma.material.deleteMany({ where }),          // → MovimentacaoEstoque (cascade)
    prisma.tecnico.deleteMany({ where }),
    prisma.sessaoConversa.deleteMany({ where }),
    prisma.usuario.deleteMany({ where }),           // → Notificacao, ContaSocial (cascade)
    prisma.empresaWhatsapp.deleteMany({ where }),
    prisma.empresa.delete({ where: { id: empresaId } }),
  ]);
}

// DELETE /api/me/conta — autoexclusão de conta (LGPD art. 18 + requisito da Play Store).
// Exige reautenticação (senha + código 2FA TOTP quando ativo). Se o usuário for o ÚNICO
// admin/dono ATIVO da empresa, apagar sua conta deixaria o tenant sem dono → apagamos a
// EMPRESA INTEIRA em cascata. Caso contrário, removemos apenas a própria conta (a empresa
// e os colegas permanecem; o vínculo Tecnico.usuarioId vira null por onDelete: SetNull).
apiRouter.delete('/me/conta', async (req, res) => {
  try {
    const schema = z.object({
      senha: z.string().optional(),
      codigo: z.string().optional(),
    });
    const parse = schema.safeParse(req.body ?? {});
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.id } });
    if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

    // Reautenticação por senha (contas com senha definida) — barra sequestro de sessão.
    // Usa 403 (e não 401): a sessão é válida; o que falhou foi a autorização elevada
    // para uma ação destrutiva. 401 dispararia o logout automático no interceptor do front.
    if (usuario.senhaHash) {
      const confere = await bcrypt.compare(parse.data.senha ?? '', usuario.senhaHash);
      if (!confere) return res.status(403).json({ erro: 'Senha incorreta' });
    }
    // Se houver 2FA TOTP ativo, exige um código válido além da senha.
    if (usuario.twoFactorAtivo) {
      const segredo = decifrarSegredo(usuario.totpSecret);
      const ok = segredo && (await verificarCodigo(segredo, parse.data.codigo ?? ''));
      if (!ok) return res.status(403).json({ erro: 'Código 2FA inválido' });
    }

    const { empresaId } = usuario;
    const adminsAtivos = await prisma.usuario.count({
      where: { empresaId, ativo: true, admin: true },
    });
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

// PATCH /api/me/2fa — REMOVIDO. O 2FA real é TOTP (app autenticador), via os
// endpoints /me/2fa/setup, /me/2fa/ativar e /me/2fa/desativar abaixo. Mantemos um
// 410 Gone para o frontend antigo parar de alternar o boolean (que deslogava).
apiRouter.patch('/me/2fa', async (_req, res) => {
  res.status(410).json({ erro: 'Use /me/2fa/setup, /me/2fa/ativar e /me/2fa/desativar (TOTP).' });
});

// POST /api/me/2fa/setup — inicia a configuração: gera um segredo TOTP pendente
// (cifrado), monta a URI otpauth e o QR (data URL) para o usuário escanear no app.
// O 2FA só passa a valer após confirmar um código em /me/2fa/ativar.
apiRouter.post('/me/2fa/setup', async (req, res) => {
  try {
    const secret = gerarSegredoTotp();
    const otpauthUrl = montarOtpauthUrl(secret, req.user.nome);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    // Guarda o segredo como PENDENTE (cifrado); não ativa ainda.
    await prisma.usuario.update({
      where: { id: req.user.id },
      data: { totpPendente: cifrarSegredo(secret) },
    });
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/setup', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/2fa/ativar — confirma o setup verificando um código de 6 dígitos
// contra o segredo pendente. Se válido, promove pendente→totpSecret e ativa o 2FA.
apiRouter.post('/me/2fa/ativar', async (req, res) => {
  try {
    const schema = z.object({ codigo: z.string().min(1) });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { totpPendente: true },
    });
    const segredo = decifrarSegredo(usuario?.totpPendente);
    if (!segredo) return res.status(400).json({ erro: 'Inicie a configuração em /me/2fa/setup' });

    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) return res.status(400).json({ erro: 'Código inválido' });

    await prisma.usuario.update({
      where: { id: req.user.id },
      data: {
        totpSecret: cifrarSegredo(segredo),
        totpPendente: null,
        twoFactorAtivo: true,
      },
    });
    logger.info('2fa_ativado', { userId: req.user.id });
    res.json({ twoFactorAtivo: true });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/ativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/2fa/desativar — desliga o 2FA verificando um código atual.
// Limpa o segredo confirmado e qualquer pendência.
apiRouter.post('/me/2fa/desativar', async (req, res) => {
  try {
    const schema = z.object({ codigo: z.string().min(1) });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { totpSecret: true, twoFactorAtivo: true },
    });
    if (!usuario?.twoFactorAtivo) return res.status(400).json({ erro: '2FA não está ativo' });

    const segredo = decifrarSegredo(usuario.totpSecret);
    const ok = await verificarCodigo(segredo, parse.data.codigo);
    if (!ok) return res.status(400).json({ erro: 'Código inválido' });

    await prisma.usuario.update({
      where: { id: req.user.id },
      data: { twoFactorAtivo: false, totpSecret: null, totpPendente: null },
    });
    logger.info('2fa_desativado', { userId: req.user.id });
    res.json({ twoFactorAtivo: false });
  } catch (erro) {
    logger.error('Erro POST /me/2fa/desativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── VERIFICAÇÃO / 2FA POR TELEFONE (OTP via WhatsApp do robô) ─────────────────

// POST /api/me/telefone/otp/enviar — (re)gera e envia o OTP ao telefone do usuário.
apiRouter.post('/me/telefone/otp/enviar', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { telefone: true },
    });
    if (!usuario?.telefone) return res.status(400).json({ erro: 'Cadastre um telefone primeiro' });
    await gerarEEnviarOtp(req.user.id, usuario.telefone);
    res.json({ enviado: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/otp/enviar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/telefone/otp/verificar — confirma o código; marca telefoneVerificado
// e cria/vincula o Técnico do DONO (identidade no robô de número único).
apiRouter.post('/me/telefone/otp/verificar', async (req, res) => {
  try {
    const schema = z.object({ codigo: z.string().min(1) });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { id: true, nome: true, telefone: true, empresaId: true, telefoneOtpHash: true, telefoneOtpExpira: true },
    });
    if (!usuario?.telefone) return res.status(400).json({ erro: 'Cadastre um telefone primeiro' });
    if (!validarOtpTelefone(usuario, parse.data.codigo)) {
      return res.status(400).json({ erro: 'Código inválido ou expirado' });
    }

    const telefone = canonizarTelefone(usuario.telefone);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { telefoneVerificado: true, telefoneOtpHash: null, telefoneOtpExpira: null },
    });

    // Dono → Técnico: cria (ou vincula) o técnico-self do dono na empresa, para que o
    // robô reconheça o remetente pelo telefone. Tolera técnico pré-existente.
    try {
      const existente = await prisma.tecnico.findFirst({
        where: { empresaId: usuario.empresaId, telefone },
      });
      if (existente) {
        if (existente.usuarioId == null) {
          await prisma.tecnico.update({ where: { id: existente.id }, data: { usuarioId: usuario.id, ativo: true } });
        } else if (existente.usuarioId !== usuario.id) {
          // Já vinculado a OUTRO usuário na mesma empresa (não deveria ocorrer: cada
          // dono cria a própria empresa vazia). Não sobrescreve o vínculo — só registra.
          logger.warn('Técnico do telefone já vinculado a outro usuário', {
            userId: usuario.id, tecnicoId: existente.id, empresaId: usuario.empresaId,
          });
        }
      } else {
        await prisma.tecnico.create({
          data: { empresaId: usuario.empresaId, nome: usuario.nome, telefone, telefoneDisplay: telefone, usuarioId: usuario.id },
        });
      }
    } catch (e) {
      // Não falha a verificação por causa do técnico (ex.: corrida/duplicidade).
      logger.warn('Falha ao criar técnico do dono na verificação', { userId: usuario.id, erro: e.message });
    }

    logger.info('telefone_verificado', { userId: usuario.id });
    res.json({ telefoneVerificado: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/otp/verificar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/telefone/2fa/ativar — liga o 2FA por telefone (exige telefone verificado).
apiRouter.post('/me/telefone/2fa/ativar', async (req, res) => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: { telefoneVerificado: true },
    });
    if (!usuario?.telefoneVerificado) {
      return res.status(400).json({ erro: 'Verifique seu telefone antes de ativar o 2FA por telefone' });
    }
    await prisma.usuario.update({ where: { id: req.user.id }, data: { phone2faAtivo: true } });
    logger.info('phone2fa_ativado', { userId: req.user.id });
    res.json({ phone2faAtivo: true });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/2fa/ativar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/me/telefone/2fa/desativar — desliga o 2FA por telefone.
apiRouter.post('/me/telefone/2fa/desativar', async (req, res) => {
  try {
    await prisma.usuario.update({ where: { id: req.user.id }, data: { phone2faAtivo: false } });
    logger.info('phone2fa_desativado', { userId: req.user.id });
    res.json({ phone2faAtivo: false });
  } catch (erro) {
    logger.error('Erro POST /me/telefone/2fa/desativar', { erro: erro.message });
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
apiRouter.get('/servicos', requirePermissao('servicos', 'ver'), async (req, res) => {
  try {
    const { tecnico, local, endereco, inicio, fim, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    // Por padrão a lista mostra só serviços que CONTAM (ativo). Pendentes/rejeitados
    // ficam na fila de aprovação; um ?status explícito permite filtrá-los.
    const where = { status: req.query.status ? String(req.query.status) : 'ativo' };
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

// ── GET /api/servicos/pendentes ───────────────────────────────────────────────
// Fila de aprovação (dono/gestor). DEVE vir antes de /servicos/:id (senão ":id"
// captura "pendentes").
apiRouter.get('/servicos/pendentes', requirePermissao('aprovacoes', 'ver'), async (req, res) => {
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

// ── GET /api/servicos/:id ─────────────────────────────────────────────────────
apiRouter.get('/servicos/:id', requirePermissao('servicos', 'ver'), async (req, res) => {
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
  // Opcional: o funcionário registra SEMPRE como ele mesmo (tecnico ignorado e forçado
  // para o próprio). Dono/gestor informam o técnico (validado no handler).
  tecnico: z.string().min(2).optional().nullable(),
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

// Pode registrar serviço quem tem servicos.criar (dono/gestor) OU a capacidade própria
// do funcionário (registrar o PRÓPRIO serviço).
function podeRegistrarServico(req, res, next) {
  if (pode(req.user, 'servicos', 'criar') || podeProprio(req.user, 'registrar_servico')) return next();
  return res.status(403).json({ erro: 'Sem permissão para registrar serviço' });
}

apiRouter.post('/servicos', podeRegistrarServico, async (req, res) => {
  try {
    const parse = schemaServico.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const dados = parse.data;
    const empresaId = req.user.empresaId;
    const ehFuncionario = req.user.papel === 'funcionario';

    // Funcionário registra SEMPRE como ele mesmo (self-scope no servidor, nunca confia no
    // client) e NÃO mexe no catálogo de estoque (não tem acesso a estoque).
    let tecnico;
    let materiais = dados.materiais;
    if (ehFuncionario) {
      if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
      tecnico = await prisma.tecnico.findUnique({ where: { id: req.user.tecnicoId } });
      if (!tecnico) return res.status(400).json({ erro: 'Técnico não encontrado' });
      materiais = []; // funcionário não baixa estoque do catálogo
    } else {
      if (!dados.tecnico) return res.status(400).json({ erro: 'Informe o técnico' });
      tecnico = await buscarOuCriarTecnico(dados.tecnico, empresaId);
    }

    const valorLiquido = dados.valorCobrado - dados.valorMaterial;
    const comissaoGerada = parseFloat((valorLiquido * (tecnico.comissao / 100)).toFixed(2));

    // Aprovação: só serviço de FUNCIONÁRIO numa empresa com aprovacaoServico ligada entra
    // como "pendente" (não conta comissão/receita/estoque até a aprovação do dono/gestor).
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
          materiais: materiais.length > 0
            ? { create: materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })) }
            : undefined,
        },
        include: { tecnico: true },
      });
      // Pendente NÃO baixa estoque nem agenda avaliação — isso ocorre na aprovação.
      if (status === 'ativo' && materiais.length > 0) {
        await darBaixaPorServico(criado.id, materiais, tx);
      }
      return criado;
    });

    if (status === 'ativo' && dados.clienteTelefone) {
      agendarAvaliacao({
        empresaId, servicoId: servico.id,
        clienteTelefone: dados.clienteTelefone, clienteNome: dados.clienteNome ?? null,
      }).catch((e) => logger.warn('Falha ao agendar avaliação (manual)', { erro: e.message }));
    }

    res.status(201).json(servico);
  } catch (erro) {
    logger.error('Erro POST /servicos', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno ao criar serviço' });
  }
});

// POST /api/servicos/:id/aprovar — aprova um serviço pendente: passa a contar
// (comissão/receita), baixa o estoque dos materiais (se houver) e agenda a avaliação.
apiRouter.post('/servicos/:id/aprovar', requirePermissao('aprovacoes', 'aprovar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const servico = await req.db.servico.findUnique({
      where: { id },
      include: { materiais: { select: { materialId: true, quantidade: true } } },
    });
    if (!servico) return res.status(404).json({ erro: 'Serviço não encontrado' });
    if (servico.status !== 'pendente') return res.status(409).json({ erro: 'Serviço não está pendente' });

    await prisma.$transaction(async (tx) => {
      await tx.servico.update({
        where: { id },
        data: { status: 'ativo', aprovadoPor: req.user.id, aprovadoEm: new Date() },
      });
      if (servico.materiais.length > 0) {
        await darBaixaPorServico(id, servico.materiais.map((m) => ({ materialId: m.materialId, quantidade: m.quantidade })), tx);
      }
    });
    if (servico.clienteTelefone) {
      agendarAvaliacao({
        empresaId: req.user.empresaId, servicoId: id,
        clienteTelefone: servico.clienteTelefone, clienteNome: servico.clienteNome ?? null,
      }).catch((e) => logger.warn('Falha ao agendar avaliação (aprovação)', { erro: e.message }));
    }
    logger.info('servico_aprovado', { id, aprovadoPor: req.user.id });
    res.json({ mensagem: 'Serviço aprovado', id, status: 'ativo' });
  } catch (erro) {
    logger.error('Erro POST /servicos/:id/aprovar', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/servicos/:id/rejeitar — rejeita um serviço pendente (não conta, não baixa).
apiRouter.post('/servicos/:id/rejeitar', requirePermissao('aprovacoes', 'aprovar'), async (req, res) => {
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
});

// ── DELETE /api/servicos/:id ──────────────────────────────────────────────────
apiRouter.delete('/servicos/:id', requirePermissao('servicos', 'deletar'), async (req, res) => {
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
apiRouter.get('/avaliacoes', requirePermissao('avaliacoes', 'ver'), async (req, res) => {
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

// ── GET /api/avaliacoes/config ────────────────────────────────────────────────
// Config da solicitação de avaliação (migrada da aba WhatsApp): ativar/desativar,
// template da mensagem, intervalo (horas) e link. Vive em EmpresaWhatsapp.
apiRouter.get('/avaliacoes/config', requirePermissao('avaliacoes', 'ver'), async (req, res) => {
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

// ── PATCH /api/avaliacoes/config ──────────────────────────────────────────────
apiRouter.patch('/avaliacoes/config', requirePermissao('avaliacoes', 'editar'), async (req, res) => {
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

    // updateMany escopado (empresaWhatsapp já é escopado por req.db).
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

// ── GET /api/dashboard ────────────────────────────────────────────────────────
apiRouter.get('/dashboard', requirePermissao('dashboard', 'ver'), async (req, res) => {
  try {
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);
    const filtroAnterior = construirFiltroPeriodoAnterior(filtroDatas);

    const [servicos, servicosAnterior] = await Promise.all([
      req.db.servico.findMany({
        where: { status: 'ativo', criadoEm: filtroDatas },
        include: { tecnico: { select: { nome: true } } },
        orderBy: { criadoEm: 'asc' },
        take: MAX_AGREGACAO,
      }),
      req.db.servico.findMany({
        where: { status: 'ativo', criadoEm: filtroAnterior },
        select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true },
        take: MAX_AGREGACAO,
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
apiRouter.get('/tecnicos', requirePermissao('tecnicos', 'ver'), async (req, res) => {
  try {
    const tecnicos = await req.db.tecnico.findMany({
      include: {
        servicos: { where: { status: 'ativo' }, select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true } },
        pagamentos: { select: { valor: true } },
        // admin do usuário vinculado distingue o DONO do funcionário. Desde que todo
        // técnico passou a ganhar um login (RBAC), `usuarioId != null` deixou de
        // identificar o dono — agora vale para qualquer funcionário com acesso.
        usuario: { select: { admin: true } },
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
        // Dono (técnico-self do dono) vs. funcionário comum: o vínculo com um usuário
        // admin marca o dono. `usuarioId != null` sozinho não serve mais (todo técnico
        // ganha login no RBAC), senão todo funcionário apareceria como "Dono".
        ehDono: t.usuario?.admin === true,
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
// Cadastro em wizard: além dos campos básicos, aceita os dados de RH (datas ISO →
// Date, modalidade do vínculo, valores numéricos). Tudo opcional/aditivo.
const MODALIDADES = ['clt', 'clt_meio', 'clt_12x36', 'intermitente', 'autonomo'];
// "YYYY-MM-DD" ou ISO completo → Date (ou null). Inválido lança no superRefine abaixo.
const dataOpcional = z.union([z.string(), z.null()]).optional().transform((v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d; // undefined sinaliza inválido
});

const schemaNovoTecnico = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(10).optional().nullable(),
  comissao: z.number().min(0).max(100).default(0),
  metaMensal: z.number().nonnegative().nullable().optional(),
  // RH
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
  fotoPerfil: z.string().optional().nullable(), // URL ou data-URL (foto opcional do cadastro)
  // Por padrão todo técnico vira usuário (login por telefone + PIN). false p/ não criar.
  criarAcesso: z.boolean().optional(),
}).superRefine((d, ctx) => {
  // dataOpcional vira `undefined` quando a string é uma data inválida.
  if (d.dataNascimento === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataNascimento'], message: 'Data inválida' });
  }
  if (d.dataAdmissao === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dataAdmissao'], message: 'Data inválida' });
  }
});

apiRouter.post('/tecnicos', requirePermissao('tecnicos', 'editar'), async (req, res) => {
  try {
    const parse = schemaNovoTecnico.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const d = parse.data;
    // Canoniza o telefone para o robô casar o remetente; guarda o cru como display.
    const canonico = d.telefone ? canonizarTelefone(d.telefone) : null;
    const tecnico = await req.db.tecnico.create({
      data: {
        nome: d.nome,
        telefone: canonico,
        telefoneDisplay: d.telefone ?? null,
        comissao: d.comissao,
        metaMensal: d.metaMensal ?? null,
        cpf: d.cpf ?? null,
        dataNascimento: d.dataNascimento ?? null,
        endereco: d.endereco ?? null,
        nivelAcesso: d.nivelAcesso ?? null,
        modalidade: d.modalidade ?? null,
        salarioBase: d.salarioBase ?? null,
        dataAdmissao: d.dataAdmissao ?? null,
        horaExtraAtiva: d.horaExtraAtiva ?? false,
        horaExtraPercentual: d.horaExtraPercentual ?? null,
        adicionalNoturno: d.adicionalNoturno ?? false,
        valorHora: d.valorHora ?? null,
        jornadaDiariaMin: d.jornadaDiariaMin ?? null,
        jornadaSemanalMin: d.jornadaSemanalMin ?? null,
        fotoPerfil: d.fotoPerfil ?? null,
      },
    });

    // Acesso ao painel: por padrão todo técnico vira usuário (login por telefone + PIN).
    // Só o DONO pode atribuir papel "gestor" (via nivelAcesso); demais → "funcionario"
    // (impede escalonamento por quem só edita técnicos). Falha aqui não desfaz o técnico:
    // o dono pode usar "criar acesso" depois.
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

// POST /api/tecnicos/:id/acesso — cria acesso ao painel para um técnico que ainda não
// tem conta (login por telefone + PIN provisório). Só o dono pode conceder papel "gestor".
apiRouter.post('/tecnicos/:id/acesso', requirePermissao('tecnicos', 'editar'), async (req, res) => {
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
      if (e.codigo === 'sem_telefone') {
        return res.status(400).json({ erro: 'Técnico sem telefone — adicione um telefone antes de criar o acesso' });
      }
      throw e;
    }
  } catch (erro) {
    logger.error('Erro POST /tecnicos/:id/acesso', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/tecnicos/:id/acesso/reset — reemite o PIN provisório (funcionário esqueceu
// a senha). Invalida as sessões antigas e exige nova senha no próximo login.
apiRouter.post('/tecnicos/:id/acesso/reset', requirePermissao('tecnicos', 'editar'), async (req, res) => {
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

// ── GET /api/tecnicos/:id/ponto?mes=YYYY-MM ───────────────────────────────────
// Banco de horas do mês: registros + agregados (total trabalhado, saldo, HE),
// calculados no backend conforme a modalidade do técnico.
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function intervaloMes(mes) {
  const [ano, m] = mes.split('-').map(Number);
  return { inicio: new Date(Date.UTC(ano, m - 1, 1)), fim: new Date(Date.UTC(ano, m, 1)) };
}

apiRouter.get('/tecnicos/:id/ponto', requirePermissao('ponto', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const mes = String(req.query.mes ?? '');
    if (!MES_RE.test(mes)) return res.status(400).json({ erro: 'Parâmetro mes inválido (use YYYY-MM)' });

    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });

    const { inicio, fim } = intervaloMes(mes);
    const registros = await req.db.registroPonto.findMany({
      where: { tecnicoId: id, data: { gte: inicio, lt: fim } },
      orderBy: { data: 'asc' },
      take: MAX_AGREGACAO,
    });
    const resumo = resumoMes(tecnico, registros);
    res.json({
      mes,
      tecnico: { id: tecnico.id, nome: tecnico.nome, modalidade: tecnico.modalidade },
      ...resumo,
    });
  } catch (erro) {
    logger.error('Erro GET /tecnicos/:id/ponto', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/tecnicos/:id/ponto/relatorio?mes=&formato=pdf|csv ────────────────
apiRouter.get('/tecnicos/:id/ponto/relatorio', requirePermissao('ponto', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const mes = String(req.query.mes ?? '');
    if (!MES_RE.test(mes)) return res.status(400).json({ erro: 'Parâmetro mes inválido (use YYYY-MM)' });
    const formato = String(req.query.formato ?? 'pdf').toLowerCase();
    const empresaId = req.user.empresaId;

    // Garante que o técnico é da empresa (req.db escopa por empresaId).
    const tecnico = await req.db.tecnico.findUnique({ where: { id } });
    if (!tecnico) return res.status(404).json({ erro: 'Técnico não encontrado' });

    if (formato === 'csv') {
      const csv = await gerarCsvPonto(empresaId, id, mes);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ponto-${id}-${mes}.csv"`);
      return res.send('﻿' + csv); // BOM para Excel reconhecer UTF-8
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

// ── GET /api/tecnicos/:id/perfil ──────────────────────────────────────────────
apiRouter.get('/tecnicos/:id/perfil', requirePermissao('tecnicos', 'ver'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    const { periodo = 'mes', inicio, fim } = req.query;
    const filtroDatas = construirFiltroPeriodo(periodo, inicio, fim);

    const filtroMesAtual = construirFiltroPeriodo('mes');

    const [tecnico, servicosPeriodo, todosServicos, pagamentos, servicosMesAtual] = await Promise.all([
      req.db.tecnico.findUnique({ where: { id } }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroDatas }, orderBy: { criadoEm: 'desc' }, take: MAX_AGREGACAO }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo' }, select: { valorCobrado: true, valorLiquido: true, comissaoGerada: true, criadoEm: true }, take: MAX_AGREGACAO }),
      req.db.pagamento.findMany({ where: { tecnicoId: id }, orderBy: { criadoEm: 'desc' }, take: MAX_AGREGACAO }),
      req.db.servico.findMany({ where: { tecnicoId: id, status: 'ativo', criadoEm: filtroMesAtual }, select: { valorLiquido: true }, take: MAX_AGREGACAO }),
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
apiRouter.patch('/tecnicos/:id', requirePermissao('tecnicos', 'editar'), async (req, res) => {
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
apiRouter.post('/pagamentos', requirePermissao('financeiro', 'editar'), async (req, res) => {
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

// ── PONTO PELO PAINEL (funcionário, escopo "próprio") ─────────────────────────
// O funcionário bate o ponto pelo painel: hora do SERVIDOR + geolocalização + selfie
// (anti-fraude). Ele vê só as batidas do DIA — o banco de horas (saldo/HE) é exclusivo
// do dono/gestor (GET /tecnicos/:id/ponto). tecnicoId vem SEMPRE de req.user (self).

// Salva a selfie (data URL base64) da batida em /uploads e devolve o caminho.
const SELFIE_PONTO_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
async function salvarSelfiePonto(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(dataUrl ?? '');
  if (!m) { const e = new Error('selfie inválida'); e.codigo = 'selfie'; throw e; }
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) { const e = new Error('selfie grande'); e.codigo = 'selfie'; throw e; }
  if (!conferirMagicBytes(buffer, m[1])) { const e = new Error('selfie inválida'); e.codigo = 'selfie'; throw e; }
  const dir = path.resolve('./uploads');
  await mkdir(dir, { recursive: true });
  const nome = `ponto-${randomUUID()}.${SELFIE_PONTO_MIME[m[1]] ?? 'jpg'}`;
  await writeFile(path.join(dir, nome), buffer);
  return `/uploads/${nome}`;
}

// Estado do ponto de HOJE (só as batidas — nunca saldo/HE). Base prisma filtrada por
// tecnicoId self (autoritativo de req.user), portanto sem risco cross-tenant.
async function carregarPontoHoje(tecnicoId, agora) {
  const data = diaLocal(agora);
  const reg = await prisma.registroPonto.findUnique({
    where: { tecnicoId_data: { tecnicoId, data } },
    include: { batidas: { orderBy: { em: 'asc' } } },
  });
  const proximo = !reg || !reg.entradaEm ? 'entrada'
    : !reg.almocoSaidaEm ? 'almoco_saida'
    : !reg.almocoVoltaEm ? 'almoco_volta'
    : !reg.saidaEm ? 'saida'
    : null;
  return {
    data,
    entradaEm: reg?.entradaEm ?? null,
    almocoSaidaEm: reg?.almocoSaidaEm ?? null,
    almocoVoltaEm: reg?.almocoVoltaEm ?? null,
    saidaEm: reg?.saidaEm ?? null,
    completo: proximo === null,
    proximaBatida: proximo,
    proximaBatidaRotulo: proximo ? ROTULO_BATIDA[proximo] : null,
    batidas: (reg?.batidas ?? []).map((b) => ({
      tipo: b.tipo, rotulo: ROTULO_BATIDA[b.tipo] ?? b.tipo, em: b.em,
      lat: b.lat, lng: b.lng, temSelfie: Boolean(b.selfieUrl), selfieUrl: b.selfieUrl,
    })),
  };
}

const pontoBaterSchema = z.object({
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  precisao: z.number().optional().nullable(),
  selfie: z.string().optional().nullable(), // data URL base64 (JPEG/PNG/WEBP)
});

// POST /api/ponto/bater — registra a próxima batida do dia (entrada→almoço→volta→saída).
apiRouter.post('/ponto/bater', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'bater_ponto')) return res.status(403).json({ erro: 'Sem permissão para bater ponto' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    const parse = pontoBaterSchema.safeParse(req.body ?? {});
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos' });

    const agora = new Date();
    // Avança a máquina do dia (timestamp do servidor). tipo=null → dia já completo.
    const r = await registrarPonto({ empresaId: req.user.empresaId, tecnicoId: req.user.tecnicoId, agora });
    if (r.tipo) {
      // Só salva a selfie quando houve batida de fato (evita arquivo órfão no dia completo).
      let selfieUrl = null;
      if (parse.data.selfie) {
        try { selfieUrl = await salvarSelfiePonto(parse.data.selfie); }
        catch { return res.status(400).json({ erro: 'Selfie inválida (use JPEG/PNG/WEBP até 5MB)' }); }
      }
      await prisma.batidaPonto.create({
        data: {
          registroId: r.registroId, tipo: r.tipo, em: agora,
          lat: parse.data.lat ?? null, lng: parse.data.lng ?? null,
          precisao: parse.data.precisao ?? null, selfieUrl, origem: 'painel',
        },
      });
      logger.info('ponto_batido_painel', { tecnicoId: req.user.tecnicoId, tipo: r.tipo, geo: parse.data.lat != null, selfie: Boolean(selfieUrl) });
    }
    const dia = await carregarPontoHoje(req.user.tecnicoId, agora);
    res.status(r.tipo ? 201 : 200).json({
      tipo: r.tipo,
      rotulo: r.tipo ? ROTULO_BATIDA[r.tipo] : null,
      jaCompleto: r.tipo === null,
      ...dia,
    });
  } catch (erro) {
    logger.error('Erro POST /ponto/bater', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// GET /api/ponto/hoje — estado do ponto do dia do funcionário (só as batidas).
apiRouter.get('/ponto/hoje', async (req, res) => {
  try {
    if (!podeProprio(req.user, 'bater_ponto')) return res.status(403).json({ erro: 'Sem permissão' });
    if (!req.user.tecnicoId) return res.status(400).json({ erro: 'Sua conta não está vinculada a um técnico' });
    res.json(await carregarPontoHoje(req.user.tecnicoId, new Date()));
  } catch (erro) {
    logger.error('Erro GET /ponto/hoje', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// ── GET /api/materiais ────────────────────────────────────────────────────────
apiRouter.get('/materiais', requirePermissao('estoque', 'ver'), async (req, res) => {
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

apiRouter.post('/materiais/upload', requirePermissao('estoque', 'editar'), async (req, res) => {
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

    // Confere o conteúdo real (magic bytes), não só o MIME declarado no data-URL.
    if (!conferirMagicBytes(buffer, mime)) {
      return res.status(400).json({ erro: 'Imagem inválida (conteúdo não confere com o tipo)' });
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
apiRouter.post('/materiais', requirePermissao('estoque', 'editar'), async (req, res) => {
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
apiRouter.patch('/materiais/:id', requirePermissao('estoque', 'editar'), async (req, res) => {
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
apiRouter.delete('/materiais/:id', requirePermissao('estoque', 'editar'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ erro: 'ID inválido' });
    // Confirma que o material é da empresa antes de qualquer operação (anti-IDOR)
    const mat = await req.db.material.findUnique({ where: { id }, select: { id: true } });
    if (!mat) return res.status(404).json({ erro: 'Material não encontrado' });
    // Usa req.db por consistência tenant. O material já foi confirmado da empresa
    // acima; ServicoMaterial é isolado pela relação com Servico (não escopado direto),
    // então o filtro por materialId já é seguro contra IDOR.
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

// ── GET /api/estoque ──────────────────────────────────────────────────────────
// Saldo real de todos os materiais + consumo no período (para contexto).
apiRouter.get('/estoque', requirePermissao('estoque', 'ver'), async (req, res) => {
  try {
    const diasNum = Math.max(1, Number.parseInt(req.query.periodo ?? '30', 10) || 30);
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
apiRouter.post('/materiais/:id/movimentacao', requirePermissao('estoque', 'editar'), async (req, res) => {
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
apiRouter.get('/materiais/:id/movimentacoes', requirePermissao('estoque', 'ver'), async (req, res) => {
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
apiRouter.get('/relatorio/pdf', requirePermissao('financeiro', 'ver'), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ erro: 'Parâmetros "inicio" e "fim" são obrigatórios (YYYY-MM-DD)' });
    const dataInicio = new Date(inicio);
    const dataFim = new Date(fim + 'T23:59:59.999Z');
    if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
      return res.status(400).json({ erro: 'Datas inválidas' });
    }
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

// ── CONFIGURAÇÃO DA EMPRESA ───────────────────────────────────────────────────
// GET/PATCH /api/config/empresa — opções gerais (ex.: exigir aprovação dos serviços
// registrados por funcionários). Só quem tem permissão de configuração (dono).
apiRouter.get('/config/empresa', requirePermissao('configuracao', 'ver'), async (req, res) => {
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

apiRouter.patch('/config/empresa', requirePermissao('configuracao', 'editar'), async (req, res) => {
  try {
    const schema = z.object({ aprovacaoServico: z.boolean().optional() });
    const parse = schema.safeParse(req.body);
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

// ── USUÁRIOS (gestão de contas e permissões — só DONO) ────────────────────────

const SELECT_USUARIO = {
  id: true, nome: true, username: true, telefone: true, admin: true,
  papel: true, permissoes: true, senhaProvisoria: true, ativo: true,
  tecnico: { select: { id: true } }, criadoEm: true,
};

// GET /api/permissoes/catalogo — módulos/ações/papéis para montar a matriz no painel.
apiRouter.get('/permissoes/catalogo', requirePermissao('usuarios', 'ver'), (req, res) => {
  res.json({
    papeis: PAPEIS,
    modulos: MODULOS,
    acoesPorModulo: ACOES_POR_MODULO,
    capacidadesProprio: CAPACIDADES_PROPRIO,
    // Presets por papel — o painel inicializa a matriz a partir daqui ao escolher o papel.
    presets: Object.fromEntries(PAPEIS.map((p) => [p, presetDoPapel(p)])),
  });
});

// GET /api/usuarios
apiRouter.get('/usuarios', requirePermissao('usuarios', 'ver'), async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      where: { empresaId: req.user.empresaId },
      select: SELECT_USUARIO,
      orderBy: { criadoEm: 'asc' },
    });
    // Expõe as permissões EFETIVAS (preset ⊕ override) para a matriz não precisar
    // recalcular o preset no front.
    res.json(usuarios.map((u) => ({ ...u, permissoesEfetivas: permissoesEfetivas(u) })));
  } catch (erro) {
    logger.error('Erro GET /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// POST /api/usuarios
apiRouter.post('/usuarios', requirePermissao('usuarios', 'editar'), async (req, res) => {
  try {
    const schema = z.object({
      nome: z.string().min(2),
      username: z.string().min(3).regex(/^[a-zA-Z0-9_]+$/, 'Apenas letras, números e _'),
      senha: z.string().min(6),
      papel: z.enum(PAPEIS).default('gestor'),
      permissoes: z.any().optional(),
    });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { nome, username, senha, papel } = parse.data;
    const senhaHash = await bcrypt.hash(senha, 12);
    // Novo usuário pertence à MESMA empresa de quem cria. `admin` espelha papel "dono"
    // (compat). Overrides são sanitizados (só módulos/ações conhecidos).
    const usuario = await prisma.usuario.create({
      data: {
        nome, username, senhaHash, papel,
        admin: papel === 'dono',
        permissoes: sanitizarPermissoes(parse.data.permissoes),
        empresaId: req.user.empresaId,
      },
      select: SELECT_USUARIO,
    });
    logger.info('user_created', { adminId: req.user.id, novoUserId: usuario.id, papel });
    res.status(201).json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'Username já em uso' });
    logger.error('Erro POST /usuarios', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// PATCH /api/usuarios/:id
apiRouter.patch('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
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

    // Salvaguarda: ninguém rebaixa/desativa a própria conta (evita o dono se trancar
    // pra fora ou perder o último acesso administrativo por engano).
    if (id === req.user.id) {
      if (parse.data.papel && parse.data.papel !== req.user.papel) {
        return res.status(400).json({ erro: 'Você não pode alterar o próprio papel' });
      }
      if (parse.data.ativo === false) {
        return res.status(400).json({ erro: 'Você não pode desativar a própria conta' });
      }
    }

    const { senha, permissoes, papel, ...resto } = parse.data;
    const data = { ...resto };
    if (papel !== undefined) {
      data.papel = papel;
      data.admin = papel === 'dono'; // mantém o booleano legado em sincronia
    }
    if (permissoes !== undefined) data.permissoes = sanitizarPermissoes(permissoes);
    if (senha) data.senhaHash = await bcrypt.hash(senha, 12);

    // Auditoria RBAC: captura o estado ANTERIOR quando papel/permissões mudam (mesmo
    // escopo de empresa), para registrar a trilha após o update.
    const auditarRbac = papel !== undefined || permissoes !== undefined;
    const antes = auditarRbac
      ? await prisma.usuario.findFirst({
          where: { id, empresaId: req.user.empresaId },
          select: { papel: true, permissoes: true },
        })
      : null;

    // Só atualiza se o usuário-alvo for da mesma empresa (anti-IDOR cross-tenant)
    const r = await prisma.usuario.updateMany({ where: { id, empresaId: req.user.empresaId }, data });
    if (r.count === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    const usuario = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO });
    if (parse.data.ativo === false) logger.info('user_deactivated', { adminId: req.user.id, userId: id });
    if (auditarRbac && antes) {
      logger.info('permissao_alterada', {
        adminId: req.user.id,
        userId: id,
        papelAntes: antes.papel,
        papelDepois: usuario.papel,
        permissoesMudaram: permissoes !== undefined &&
          JSON.stringify(antes.permissoes ?? null) !== JSON.stringify(usuario.permissoes ?? null),
      });
    }
    res.json({ ...usuario, permissoesEfetivas: permissoesEfetivas(usuario) });
  } catch (erro) {
    if (erro.code === 'P2025') return res.status(404).json({ erro: 'Usuário não encontrado' });
    logger.error('Erro PATCH /usuarios/:id', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

// DELETE /api/usuarios/:id
apiRouter.delete('/usuarios/:id', requirePermissao('usuarios', 'editar'), async (req, res) => {
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

// ── LGPD: direitos do titular ────────────────────────────────────────────────
// POST /api/lgpd/anonimizar-cliente — "direito ao esquecimento" (LGPD art. 18).
// Remove os dados pessoais de um cliente final (nome, telefone, comentário) dos
// serviços e avaliações DA EMPRESA, preservando os registros financeiros/estatísticos
// (valores, nota). Admin apenas; escopado por empresa via req.db (anti-IDOR).
apiRouter.post('/lgpd/anonimizar-cliente', adminOnly, async (req, res) => {
  try {
    const schema = z.object({ telefone: z.string().trim().min(8, 'Telefone inválido') });
    const parse = schema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ erro: 'Informe o telefone do cliente.' });

    // Casa tanto o valor bruto quanto só os dígitos (formatos variam entre origens).
    const bruto = parse.data.telefone;
    const digitos = bruto.replace(/\D/g, '');
    const alvo = { OR: [{ clienteTelefone: bruto }, { clienteTelefone: digitos }] };

    const [servicos, avaliacoes] = await Promise.all([
      // Servico.clienteTelefone é nullable → anonimiza para null.
      req.db.servico.updateMany({ where: alvo, data: { clienteNome: null, clienteTelefone: null } }),
      // Avaliacao.clienteTelefone é obrigatório → esvazia (não pode ser null).
      req.db.avaliacao.updateMany({ where: alvo, data: { clienteNome: null, clienteTelefone: '', comentario: null } }),
    ]);

    logger.info('lgpd_anonimizar_cliente', {
      empresaId: req.user.empresaId,
      servicos: servicos.count,
      avaliacoes: avaliacoes.count,
    });
    res.json({ ok: true, servicosAnonimizados: servicos.count, avaliacoesAnonimizadas: avaliacoes.count });
  } catch (erro) {
    logger.error('Erro POST /lgpd/anonimizar-cliente', { erro: erro.message });
    res.status(500).json({ erro: 'Erro interno' });
  }
});
