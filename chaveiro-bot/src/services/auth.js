import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { env } from '../config/env.js';

// EV-063: hash fixo, gerado uma vez no boot — usado só para gastar o MESMO tempo de
// bcrypt.compare quando não há candidato real (telefone/username inexistente) ou
// quando um candidato não tem senhaHash (conta social), evitando que o tempo de
// resposta de POST /auth/login revele essas condições antes da autenticação.
const HASH_DUMMY_TIMING = bcrypt.hashSync('dummy-nao-corresponde-a-nenhuma-senha-real', 12);

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

/* Opções do cookie de refresh — path restrito a /api/auth (só as rotas de sessão o recebem). */
export const COOKIE_OPTS_REFRESH = { httpOnly: true, sameSite: 'strict', path: '/api/auth' };

/* [Gate 6 R3] Criação de refresh centralizada aqui (junto dos primitivos), para que auth.js e
   account.js reusem a MESMA lógica dentro de suas transações — sem duplicar nem cada um montar
   o próprio cookie. Devolve o raw; não toca a resposta. */
export async function criarRefreshEmTx(tx, usuarioId) {
  const raw = gerarRefreshTokenRaw();
  await tx.refreshToken.create({
    data: { tokenHash: hashRefreshToken(raw), usuarioId, expiraEm: dataExpiracaoRefresh() },
  });
  return raw;
}

export function setRefreshCookie(res, raw) {
  res.cookie('refresh_token', raw, {
    ...COOKIE_OPTS_REFRESH,
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
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
  /* [Gate 6 R3] `iat` é em SEGUNDOS (RFC 7519); um JWT reemitido no MESMO segundo da troca de
     credencial pode ter iat*1000 até 999ms abaixo do corte (que é em ms). Toleramos 1s AQUI, na
     leitura do JWT — e SÓ aqui. O corte em si passou a ser exato (agora), e o refresh token
     (persistente, ms) usa o corte exato sem tolerância. Antes, recuar o próprio corte 1s abria
     uma janela para refresh roubado recente sobreviver. */
  return payload.iat * 1000 >= new Date(tokenValidoApos).getTime() - 1000;
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

// EV-063 (Gate 7 — achado do red team, corrigido no mesmo ciclo): `bcryptjs` é JS puro
// — `bcrypt.compare` não roda em thread separada (ao contrário da lib nativa `bcrypt`),
// então N chamadas em Promise.all ainda serializam no mesmo thread JS. Medido
// empiricamente: N=1 ~370ms, N=2 ~745ms, N=3 ~1110ms — escala linear com N. Isso vazava
// por TIMING exatamente a cardinalidade que o corpo da resposta já não vazava mais:
// quantos candidatos um telefone tem. Corrigido rodando sempre exatamente
// `MAX_CANDIDATOS_TEMPO_CONSTANTE` comparações bcrypt (reais + dummy até completar o
// piso), então o tempo de resposta é o mesmo para N=0,1,2 ou 3. Acima de 3 candidatos
// reais (telefone compartilhado por mais de 3 contas — não é o caso de uso legítimo
// descrito, que é tipicamente 1-2 empresas por pessoa), o tempo volta a escalar com N;
// esse resíduo só permite inferir "mais de 3", não a contagem exata — aceito como risco
// residual de severidade muito baixa dado quão incomum é esse cenário.
const MAX_CANDIDATOS_TEMPO_CONSTANTE = 3;

/**
 * EV-063 — autentica `password` contra uma lista de candidatos (0, 1 ou N — N ocorre
 * quando um telefone tem contas em mais de uma empresa), SEM revelar nada sobre a
 * existência/estado dos candidatos antes de a senha bater — nem no corpo da resposta,
 * nem no tempo de resposta (até `MAX_CANDIDATOS_TEMPO_CONSTANTE`). Regra arquitetural:
 * nenhum endpoint de autenticação pode expor informação de identidade antes da
 * autenticação ser concluída com sucesso.
 *
 * Só candidatos ATIVOS, com senha definida (contas sociais têm `senhaHash:null`) e cuja
 * senha bateu entram no retorno — inativo/social/senha-errada/inexistente resultam, do
 * ponto de vista do chamador, na MESMA lista vazia.
 *
 * @param {Array<{id:number, senhaHash:string|null, ativo:boolean}>} candidatos
 * @param {string} password
 * @returns {Promise<Array>} subconjunto de `candidatos` autenticado com sucesso
 */
export async function autenticarCandidatos(candidatos, password) {
  const totalDummy = Math.max(0, MAX_CANDIDATOS_TEMPO_CONSTANTE - candidatos.length);

  const [resultadosReais] = await Promise.all([
    Promise.all(
      candidatos.map(async (c) => ({
        candidato: c,
        senhaOk: c.senhaHash
          ? await bcrypt.compare(password, c.senhaHash)
          : await bcrypt.compare(password, HASH_DUMMY_TIMING).then(() => false),
      }))
    ),
    Promise.all(
      Array.from({ length: totalDummy }, () => bcrypt.compare(password, HASH_DUMMY_TIMING))
    ),
  ]);

  return resultadosReais
    .filter((r) => r.senhaOk && r.candidato.ativo && r.candidato.senhaHash)
    .map((r) => r.candidato);
}
