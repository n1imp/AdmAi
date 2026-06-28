import { prisma } from '../db/prisma.js';
import { prismaParaEmpresa } from '../db/tenant.js';
import { verificarJWT, tokenAindaValido } from '../services/auth.js';
import { permissoesEfetivas, pode } from '../services/permissoes.js';

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
    if (!usuario || !usuario.ativo) return res.status(401).json({ erro: 'Usuário inativo ou não encontrado' });
    if (!tokenAindaValido(payload, usuario.tokenValidoApos)) {
      return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
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
    req.db = prismaParaEmpresa(usuario.empresaId);
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
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
  return res.status(403).json({ erro: 'Defina uma nova senha para continuar', codigo: 'senha_provisoria' });
}
