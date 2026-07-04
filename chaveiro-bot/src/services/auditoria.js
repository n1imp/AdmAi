import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

export async function registrar({ empresaId, usuarioId, acao, entidade, entidadeId, antes, depois, ip }) {
  try {
    await prisma.auditLog.create({
      data: { empresaId, usuarioId: usuarioId ?? null, acao, entidade: entidade ?? null, entidadeId: entidadeId ?? null, antes: antes ?? undefined, depois: depois ?? undefined, ip: ip ?? null },
    });
  } catch (e) {
    logger.warn('audit_log_falha', { acao, erro: e.message });
  }
}
