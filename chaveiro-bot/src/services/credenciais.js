import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { lockUsuario } from './auth.js';
import { canonizarTelefone } from './parser.js';

/**
 * Credenciais de acesso de FUNCIONÁRIO (técnico → usuário).
 *
 * Modelo escolhido: login por TELEFONE + PIN provisório, com troca de senha forçada
 * no 1º acesso (Usuario.senhaProvisoria). O WhatsApp (que entregaria OTP) está
 * desligado, então o dono cria a conta e repassa o PIN. O PIN só existe em claro no
 * retorno desta função — nunca é persistido em claro (só o hash).
 */

/** PIN provisório de 6 dígitos (cripto-seguro). */
export function gerarPin() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Username único derivado do telefone (identidade do técnico no modelo de número
 * único). É só uma chave interna — o funcionário entra pelo telefone. Sufixo `_N`
 * em colisão (o mesmo telefone pode existir em empresas diferentes).
 */
export async function gerarUsernameTecnico(telefoneCanonico, tx = prisma) {
  const digitos = String(telefoneCanonico || '').replace(/\D/g, '');
  const base = (digitos ? `tec${digitos}` : 'tecnico').slice(0, 24);
  let username = base;
  let n = 1;
  while (await tx.usuario.findUnique({ where: { username } })) {
    username = `${base.slice(0, 22)}_${n++}`;
  }
  return username;
}

/**
 * Cria a conta de acesso (Usuario) de um técnico e vincula via Tecnico.usuarioId.
 * Retorna o PIN em claro UMA única vez para o dono repassar ao funcionário.
 *
 * Segurança: `papel` é decidido pelo chamador (a rota só permite "gestor" se o
 * solicitante for dono — evita escalonamento de privilégio). Default: funcionário.
 *
 * @param {{ tecnico:object, empresaId:number, papel?:string, tx?:object }} args
 * @returns {Promise<{ usuario:object, pin:string }>}
 */
export async function criarAcessoTecnico({
  tecnico,
  empresaId,
  papel = 'funcionario',
  tx = prisma,
}) {
  /* [SEC-HB-07] A função não confia no chamador: acesso de técnico NUNCA nasce dono. Os dois
     call sites atuais jamais passam 'dono' — a guarda existe para o terceiro, futuro, que
     passaria. */
  if (papel === 'dono') {
    throw new Error("criarAcessoTecnico não cria papel 'dono'");
  }
  const telefoneCanonico =
    tecnico.telefone ||
    (tecnico.telefoneDisplay ? canonizarTelefone(tecnico.telefoneDisplay) : null);
  if (!telefoneCanonico) {
    const e = new Error('Técnico sem telefone — não é possível criar acesso por telefone');
    e.codigo = 'sem_telefone';
    throw e;
  }
  const pin = gerarPin();
  const senhaHash = await bcrypt.hash(pin, 12);
  const username = await gerarUsernameTecnico(telefoneCanonico, tx);
  const usuario = await tx.usuario.create({
    data: {
      nome: tecnico.nome,
      username,
      telefone: telefoneCanonico,
      senhaHash,
      senhaProvisoria: true,
      admin: papel === 'dono',
      papel,
      empresaId,
    },
  });
  await tx.tecnico.update({ where: { id: tecnico.id }, data: { usuarioId: usuario.id } });
  return { usuario, pin };
}

/**
 * Reemite o PIN provisório de uma conta existente (ex.: funcionário esqueceu a senha).
 * Invalida as sessões antigas e volta a exigir troca no próximo login.
 * @returns {Promise<string>} o novo PIN em claro (uma vez).
 */
export async function resetarPin(usuarioId, tx = null) {
  const pin = gerarPin();
  const senhaHash = await bcrypt.hash(pin, 12);
  /* [Gate 6 R4] Corte EXATO + revogação dos refresh numa transação com LOCK da linha do usuário
     — serializa com uma rotação de refresh concorrente (o call site não passava tx, então eram
     dois autocommits). Se um `tx` for fornecido, assume que o chamador já serializa. */
  const executar = async (client) => {
    await lockUsuario(client, usuarioId);
    await client.usuario.update({
      where: { id: usuarioId },
      data: { senhaHash, senhaProvisoria: true, tokenValidoApos: new Date() },
    });
    await client.refreshToken.deleteMany({ where: { usuarioId } });
  };
  if (tx) await executar(tx);
  else await prisma.$transaction(executar);
  return pin;
}
