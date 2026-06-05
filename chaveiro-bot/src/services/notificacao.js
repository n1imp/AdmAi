import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * Preferências de notificação — padrões aplicados quando o usuário ainda
 * não personalizou (campo Usuario.notificacoes = null).
 */
export const PREFERENCIAS_PADRAO = {
  estoque_baixo: true,
  resumo: true,
  novo_servico: false,
  meta: true,
};

/** Mescla as preferências salvas com os padrões (campos ausentes herdam o padrão). */
export function resolverPreferencias(salvas) {
  return { ...PREFERENCIAS_PADRAO, ...(salvas ?? {}) };
}

/**
 * Cria uma notificação para um usuário, respeitando as preferências dele.
 * Se o tipo estiver desativado nas preferências, não cria nada.
 *
 * @param {object} params
 * @param {number} params.usuarioId
 * @param {string} params.tipo
 * @param {string} params.titulo
 * @param {string} params.mensagem
 * @param {string} [params.link]
 * @param {object} [tx] Cliente Prisma transacional.
 */
export async function notificar({ usuarioId, tipo, titulo, mensagem, link = null }, tx = prisma) {
  const usuario = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { notificacoes: true } });
  if (!usuario) return null;
  const prefs = resolverPreferencias(usuario.notificacoes);
  if (prefs[tipo] === false) return null; // tipo desativado pelo usuário

  return tx.notificacao.create({ data: { usuarioId, tipo, titulo, mensagem, link } });
}

/**
 * Notifica os administradores ativos (eventos do negócio, ex: estoque baixo).
 * Multi-tenant: passe `empresaId` para notificar apenas os admins daquela empresa.
 * Sem `empresaId`, notifica todos os admins (compatível com o fluxo interino).
 */
export async function notificarAdmins({ tipo, titulo, mensagem, link = null, empresaId = null }, tx = prisma) {
  const admins = await tx.usuario.findMany({
    where: { admin: true, ativo: true, ...(empresaId ? { empresaId } : {}) },
    select: { id: true },
  });
  for (const a of admins) {
    try {
      await notificar({ usuarioId: a.id, tipo, titulo, mensagem, link }, tx);
    } catch (erro) {
      logger.error('Falha ao notificar admin', { adminId: a.id, tipo, erro: erro.message });
    }
  }
}

/**
 * Dispara alerta de estoque baixo se o material cruzou (ou está abaixo do) mínimo.
 * Chamado após uma baixa de estoque. Idempotência leve: evita repetir o alerta
 * se já houver um aviso de estoque_baixo não lido para o mesmo material.
 *
 * @param {{id:number, nome:string, unidade:string, quantidadeAtual:number, estoqueMinimo:number|null}} material
 * @param {object} [tx]
 */
export async function alertarEstoqueBaixo(material, tx = prisma) {
  if (material.estoqueMinimo == null) return;
  if (material.quantidadeAtual > material.estoqueMinimo) return;

  const titulo = `Estoque baixo: ${material.nome}`;
  const mensagem = `Saldo atual de ${material.quantidadeAtual} ${material.unidade} ` +
    `(mínimo ${material.estoqueMinimo} ${material.unidade}). Considere repor.`;

  // Evita spam: só cria se não houver alerta não lido recente para este material
  const jaExiste = await tx.notificacao.findFirst({
    where: { tipo: 'estoque_baixo', lida: false, titulo },
  });
  if (jaExiste) return;

  await notificarAdmins({ tipo: 'estoque_baixo', titulo, mensagem, link: '/estoque' }, tx);
  logger.info('alerta_estoque_baixo', { materialId: material.id });
}
