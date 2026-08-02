import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
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
    { algorithm: 'HS256', expiresIn: '1h' }
  );
}

export function gerarRefreshTokenRaw() {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

export function dataExpiracaoRefresh() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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

/**
 * Desafio 2FA: um JWT curto (5min) emitido em `/auth/login` quando a senha já
 * foi validada mas falta o segundo fator — NÃO é uma sessão, só prova que o
 * portador passou pela verificação de senha para este `userId` específico.
 *
 * T-REC-01: extraído de routes/auth.js (antes local/não-exportada) pra ser
 * reaproveitado, com a MESMA lógica, também por `/auth/login/2fa/recuperar`
 * (recuperação de conta via código de backup) — sem isso, cada rota que
 * precisar validar um desafio reimplementaria `jwt.verify` por conta própria,
 * como acontecia antes com uma cópia divergente em routes/account.js (EV-025).
 */
export function gerarDesafio2fa(userId) {
  return jwt.sign({ sub: userId, tipo: '2fa' }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

/**
 * Valida um desafio 2FA emitido por `gerarDesafio2fa`. Lança se a assinatura
 * for inválida/expirada (`jwt.verify`) OU se o payload não for de fato um
 * desafio 2FA (`tipo`/`sub` ausentes ou incorretos) — nunca aceita, por
 * engano, um JWT de outro propósito (ex.: token de sessão comum, que tem
 * `id`/`empresaId` mas não `tipo:'2fa'`).
 *
 * @returns {{ sub: number, tipo: '2fa', iat: number, exp: number }}
 */
export function verificarDesafio2fa(desafio) {
  const payload = jwt.verify(desafio, env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload?.tipo !== '2fa' || !payload?.sub) throw new Error('Desafio 2FA inválido');
  return payload;
}
