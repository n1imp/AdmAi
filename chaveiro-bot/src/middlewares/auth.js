import { prisma } from '../db/prisma.js';
import { prismaParaEmpresa } from '../db/tenant.js';
import { verificarJWT, tokenAindaValido } from '../services/auth.js';
import { permissoesEfetivas, pode } from '../services/permissoes.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const VERIFICACAO_BYPASS = new Set([
  'GET /me',
  'POST /me/email/reenviar',
  'GET /auth/email/verificar',
  'DELETE /me/conta',
  'POST /me/conta/codigo-exclusao',
  'GET /me/permissoes',
]);

export async function requireAuth(req, res, next) {
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Token ausente' });
  try {
    const payload = verificarJWT(token);
    const usuario = await prisma.usuario.findUnique({
      where: { id: payload.id },
      include: { tecnico: { select: { id: true } } },
    });
    if (!usuario || !usuario.ativo)
      return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!tokenAindaValido(payload, usuario.tokenValidoApos)) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
    // Gate de verificação de e-mail (opcional via env REQUIRE_EMAIL_VERIFICATION=true)
    if (env.REQUIRE_EMAIL_VERIFICATION === 'true' && !usuario.emailVerificado && usuario.email) {
      const chave = `${req.method} ${req.path}`;
      if (!VERIFICACAO_BYPASS.has(chave)) {
        return res
          .status(403)
          .json({ erro: 'Verifique seu e-mail para continuar', codigo: 'email_nao_verificado' });
      }
    }
    req.user = {
      id: usuario.id,
      nome: usuario.nome,
      username: usuario.username,
      admin: usuario.admin,
      papel: usuario.papel,
      empresaId: usuario.empresaId,
      tecnicoId: usuario.tecnico?.id ?? null,
      senhaProvisoria: usuario.senhaProvisoria,
      permissoesEfetivas: permissoesEfetivas(usuario),
    };
    req.jwtIat = payload.iat ?? null;
    req.db = prismaParaEmpresa(usuario.empresaId);

    // Registra/atualiza esta sessão (fire-and-forget; erros não bloqueiam a requisição).
    if (payload.iat) {
      prisma.sessaoUsuario
        .upsert({
          where: { usuarioId_jwtIat: { usuarioId: usuario.id, jwtIat: payload.iat } },
          create: {
            usuarioId: usuario.id,
            jwtIat: payload.iat,
            ip: req.ip,
            userAgent: req.headers['user-agent']?.slice(0, 300),
          },
          update: { ip: req.ip },
        })
        .catch(() => {});
    }

    next();
  } catch (erro) {
    // O catch cobria também `prisma.usuario.findUnique` e `prismaParaEmpresa`, não só a
    // verificação do JWT — então uma instabilidade de banco devolvia 401 para TODA
    // requisição autenticada, e o painel lia isso como "sessão expirada" e deslogava
    // todo mundo. Erro de JWT continua 401; falha de infra vira 503 (retryable).
    const ehErroDeToken =
      erro?.name === 'JsonWebTokenError' ||
      erro?.name === 'TokenExpiredError' ||
      erro?.name === 'NotBeforeError';
    if (ehErroDeToken) return res.status(401).json({ erro: 'Token inválido ou expirado' });

    logger.error('Erro de infraestrutura em requireAuth', { erro: erro?.message });
    return res.status(503).json({ erro: 'Serviço temporariamente indisponível' });
  }
}

export function adminOnly(req, res, next) {
  if (!req.user?.admin) return res.status(403).json({ erro: 'Acesso restrito a administradores' });
  next();
}

export function requirePermissao(modulo, acao) {
  return (req, res, next) => {
    if (pode(req.user, modulo, acao)) return next();
    return res.status(403).json({ erro: 'Sem permissão para esta ação' });
  };
}

export function senhaProvisoria(req, res, next) {
  if (!req.user?.senhaProvisoria) return next();
  const liberado =
    (req.method === 'GET' && req.path === '/me') ||
    (req.method === 'PATCH' && req.path === '/me/senha');
  if (liberado) return next();
  return res
    .status(403)
    .json({ erro: 'Defina uma nova senha para continuar', codigo: 'senha_provisoria' });
}
