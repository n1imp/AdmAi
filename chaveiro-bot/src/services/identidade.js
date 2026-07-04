import { prisma } from '../db/prisma.js';
import { variantesTelefone } from './parser.js';

/**
 * Resolve QUEM mandou a mensagem no robô de número único.
 *
 * Modelo: um único WhatsApp atende todas as empresas. O remetente é identificado
 * pelo TELEFONE e pode ser técnico em MAIS DE UMA empresa (telefone repetível entre
 * empresas) → o chamador decide entre fluxo direto (0/1 vínculo) ou desambiguação (N).
 *
 * Casa por VARIANTES (tolerante ao 9º dígito BR) usando o índice global
 * `@@index([telefone])` de Tecnico. Faz dedup por empresa (variantes podem casar
 * duas linhas da mesma empresa: gravada com e sem o 9).
 *
 * Boundary de sistema: usa o `prisma` base (sem tenant) porque o webhook não tem
 * contexto de empresa — é justamente aqui que a empresa é descoberta pelo telefone.
 *
 * @param {string} telefone  Telefone do remetente (JID, formatado ou dígitos).
 * @returns {Promise<Array<{empresaId:number, empresaNome:string, tecnicoId:number,
 *   tecnicoNome:string, ehDono:boolean}>>}  Lista de vínculos (vazia = não cadastrado).
 */
export async function resolverRemetente(telefone) {
  const variantes = variantesTelefone(telefone);
  if (!variantes.length) return [];

  const tecnicos = await prisma.tecnico.findMany({
    where: { telefone: { in: variantes }, ativo: true },
    include: { empresa: { select: { id: true, nome: true } } },
    orderBy: { id: 'asc' }, // dedup-por-empresa determinístico (não depende da ordem do banco)
  });

  // Um vínculo por empresa (dedup determinístico: primeiro técnico ativo encontrado).
  const porEmpresa = new Map();
  for (const t of tecnicos) {
    if (porEmpresa.has(t.empresaId)) continue;
    porEmpresa.set(t.empresaId, {
      empresaId: t.empresaId,
      empresaNome: t.empresa.nome,
      tecnicoId: t.id,
      tecnicoNome: t.nome,
      ehDono: t.usuarioId != null,
    });
  }
  return [...porEmpresa.values()];
}
