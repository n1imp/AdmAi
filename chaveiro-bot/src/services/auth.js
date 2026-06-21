import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function gerarJWT(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nome: usuario.nome,
      admin: usuario.admin,
      papel: usuario.papel ?? (usuario.admin ? 'dono' : 'funcionario'),
      senhaProvisoria: Boolean(usuario.senhaProvisoria),
      empresaId: usuario.empresaId,
    },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '24h' }
  );
}

export function verificarJWT(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

/**
 * Verifica se um token foi emitido antes de uma data de corte.
 * Usado para invalidar sessões antigas (logout-all, troca de senha).
 *
 * @param {object} payload  Payload do JWT (contém `iat` em segundos).
 * @param {Date|null} tokenValidoApos  Data de corte do usuário.
 * @returns {boolean} true se o token ainda é válido quanto à data.
 */
export function tokenAindaValido(payload, tokenValidoApos) {
  if (!tokenValidoApos) return true;
  if (!payload?.iat) return false;
  return payload.iat * 1000 >= new Date(tokenValidoApos).getTime();
}
