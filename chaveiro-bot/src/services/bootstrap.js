import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Bootstrap de admin (conveniência de desenvolvimento).
 *
 * Na subida do servidor, SE `ADMIN_USERNAME` e `ADMIN_PASSWORD` estiverem
 * definidos no ambiente E o banco ainda NÃO tiver nenhum usuário, cria esse
 * admin junto com sua empresa (mesmo fluxo do POST /api/setup).
 *
 * Garantias:
 *  - Idempotente: só age em banco SEM usuários — nunca sobrescreve dados.
 *  - Opcional/seguro: sem as vars setadas, não faz nada (prod fica intacto).
 *  - Tolerante a falhas: um erro aqui é logado, mas NÃO derruba o servidor.
 */

// Slug de empresa único a partir do nome (espelha o de routes/api.js).
async function gerarSlugEmpresa(nome) {
  const base = nome
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'empresa';
  let slug = base;
  let n = 1;
  while (await prisma.empresa.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export async function bootstrapAdmin() {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return;

  try {
    const totalUsuarios = await prisma.usuario.count();
    if (totalUsuarios > 0) return; // já há usuários — não mexe

    const nomeEmpresa = env.ADMIN_EMPRESA ?? 'Empresa Dev';
    const senhaHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
    const slug = await gerarSlugEmpresa(nomeEmpresa);

    await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({ data: { nome: nomeEmpresa, slug } });
      await tx.empresaWhatsapp.create({ data: { empresaId: empresa.id } });
      await tx.usuario.create({
        data: {
          nome: env.ADMIN_NOME ?? 'Admin',
          username: env.ADMIN_USERNAME,
          senhaHash,
          admin: true,
          papel: 'dono',
          empresaId: empresa.id,
        },
      });
    });

    logger.info('🌱 Admin de bootstrap criado a partir do .env', {
      username: env.ADMIN_USERNAME,
      empresa: nomeEmpresa,
    });
  } catch (erro) {
    // Race de boot concorrente (P2002) ou outro erro: não derruba o servidor.
    logger.warn('Bootstrap de admin ignorado (já existe ou falhou)', { erro: erro.message });
  }
}
