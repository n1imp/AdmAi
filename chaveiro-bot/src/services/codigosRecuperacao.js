// @ts-check
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';

const TOTAL_CODIGOS = 10;
const BCRYPT_ROUNDS = 10;

function gerarCodigo() {
  return crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 chars hex
}

/**
 * Substitui os códigos de recuperação do usuário e devolve os valores em claro
 * (única oportunidade de exibi-los — no banco fica só o hash bcrypt).
 * @param {number} usuarioId
 * @param {typeof prisma | import('@prisma/client').Prisma.TransactionClient} [tx]
 * @returns {Promise<string[]>}
 */
export async function gerarCodigos(usuarioId, tx = prisma) {
  const codigos = Array.from({ length: TOTAL_CODIGOS }, gerarCodigo);
  const hashes = await Promise.all(codigos.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)));

  await tx.codigoRecuperacaoTotp.deleteMany({ where: { usuarioId } });
  await tx.codigoRecuperacaoTotp.createMany({
    data: hashes.map((codigoHash) => ({ usuarioId, codigoHash })),
  });

  return codigos;
}

/**
 * Consome um código de recuperação, se casar com algum pendente.
 * @param {number} usuarioId
 * @param {string|null|undefined} codigo
 * @returns {Promise<boolean>}
 */
export async function verificarCodigo(usuarioId, codigo) {
  const pendentes = await prisma.codigoRecuperacaoTotp.findMany({
    where: { usuarioId, usado: false },
  });

  for (const registro of pendentes) {
    const ok = await bcrypt.compare(String(codigo ?? ''), registro.codigoHash);
    if (ok) {
      // EV-056: evita TOCTOU — duas requisições concorrentes com o mesmo
      // código poderiam ambas passar pelo bcrypt.compare acima antes de
      // qualquer update ser observado pela outra. O updateMany condicional
      // em `usado: false` é atômico no Postgres: das duas chamadas
      // concorrentes que tentam UPDATE ... WHERE id=? AND usado=false na
      // mesma linha, só uma serializa como count=1; a outra vê usado=true
      // já commitado e recebe count=0.
      const resultado = await prisma.codigoRecuperacaoTotp.updateMany({
        where: { id: registro.id, usado: false },
        data: { usado: true },
      });
      if (resultado.count === 1) {
        return true;
      }
      // Outra chamada venceu a corrida para este registro; continua
      // tentando os próximos candidatos pendentes.
    }
  }
  return false;
}

/**
 * Quantos códigos ainda não usados restam.
 * @param {number} usuarioId
 * @returns {Promise<number>}
 */
export async function quantidadeCodigos(usuarioId) {
  return prisma.codigoRecuperacaoTotp.count({ where: { usuarioId, usado: false } });
}
