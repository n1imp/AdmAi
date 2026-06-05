import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { darBaixaPorServico } from './estoque.js';
export { formatarData, formatarMoeda } from '../utils/formatar.js';

export async function buscarOuCriarTecnico(nome, empresaId) {
  if (!empresaId) throw new Error('empresaId obrigatório para buscar/criar técnico');
  const nomeNormalizado = nome.trim();
  return prisma.$transaction(async (tx) => {
    const existente = await tx.tecnico.findFirst({
      where: { empresaId, nome: { equals: nomeNormalizado, mode: 'insensitive' } },
    });
    if (existente) return existente;
    const novo = await tx.tecnico.create({ data: { nome: nomeNormalizado, empresaId } });
    logger.info('Técnico criado', { nome: nomeNormalizado, empresaId });
    return novo;
  });
}

export async function registrarServico(dados) {
  const itensCatalogo = dados.itensCatalogo ?? [];

  if (!dados.empresaId) throw new Error('empresaId obrigatório para registrar serviço');

  const criar = async (tx) => {
    const servico = await tx.servico.create({
      data: {
        empresaId: dados.empresaId,
        tecnicoId: dados.tecnicoId,
        local: dados.local,
        endereco: dados.endereco ?? null,
        descricao: dados.descricao,
        material: dados.material ?? null,
        valorCobrado: dados.valorCobrado,
        valorMaterial: dados.valorMaterial,
        valorLiquido: dados.valorLiquido,
        comissaoGerada: dados.comissaoGerada ?? 0,
        fotoEvidencia: dados.fotoEvidencia ?? null,
        clienteNome: dados.clienteNome ?? null,
        clienteTelefone: dados.clienteTelefone ?? null,
        msgOriginal: dados.msgOriginal,
        remetenteWpp: dados.remetenteWpp,
        // Vínculo serviço ↔ produtos do catálogo consumidos
        materiais: itensCatalogo.length > 0
          ? { create: itensCatalogo.map((i) => ({ materialId: i.materialId, quantidade: i.quantidade })) }
          : undefined,
      },
      include: { tecnico: true },
    });
    // Baixa automática de estoque dos materiais consumidos
    if (itensCatalogo.length > 0) {
      await darBaixaPorServico(servico.id, itensCatalogo, tx);
    }
    return servico;
  };

  // Tudo numa transação quando há materiais (serviço + vínculos + baixa atômicos)
  const servico = itensCatalogo.length > 0
    ? await prisma.$transaction(criar)
    : await criar(prisma);

  logger.info('Serviço registrado', {
    id: servico.id,
    tecnico: servico.tecnico.nome,
    valorLiquido: dados.valorLiquido,
    materiais: itensCatalogo.length,
  });
  return servico;
}
