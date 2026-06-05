import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { alertarEstoqueBaixo } from './notificacao.js';

/**
 * Movimenta o estoque de um material de forma transacional:
 * atualiza o saldo (quantidadeAtual) e registra a movimentação no histórico.
 *
 * O saldo nunca fica negativo — saídas são limitadas ao saldo disponível.
 *
 * @param {object} params
 * @param {number} params.materialId
 * @param {'entrada'|'saida'|'ajuste'} params.tipo
 * @param {number} params.quantidade  Sempre positiva.
 * @param {string} [params.origem]    "manual" | "servico" | "ajuste"
 * @param {number} [params.servicoId] Serviço que originou a saída, se houver.
 * @param {string} [params.observacao]
 * @param {object} [tx]               Cliente Prisma transacional (opcional).
 */
export async function movimentarEstoque(
  { materialId, tipo, quantidade, origem = 'manual', servicoId = null, observacao = null },
  tx = prisma
) {
  if (quantidade <= 0) throw new Error('Quantidade deve ser positiva');

  const executar = async (client) => {
    const material = await client.material.findUnique({ where: { id: materialId } });
    if (!material) throw new Error('Material não encontrado');

    const delta = tipo === 'saida' ? -quantidade : quantidade;
    // Saldo não pode ficar negativo: limita a baixa ao disponível
    const saldoApos = Math.max(0, material.quantidadeAtual + delta);
    const quantidadeReal = Math.abs(saldoApos - material.quantidadeAtual);

    await client.material.update({
      where: { id: materialId },
      data: { quantidadeAtual: saldoApos },
    });

    const mov = await client.movimentacaoEstoque.create({
      data: {
        materialId,
        tipo,
        quantidade: quantidadeReal,
        saldoApos,
        origem,
        servicoId,
        observacao,
      },
    });

    return { material: { ...material, quantidadeAtual: saldoApos }, movimentacao: mov };
  };

  // Se já estamos numa transação, reutiliza; senão abre uma própria
  return tx === prisma ? prisma.$transaction(executar) : executar(tx);
}

/**
 * Dá baixa no estoque para uma lista de materiais consumidos num serviço.
 * Tolerante a falhas: registra erro mas não derruba o registro do serviço.
 *
 * @param {number} servicoId
 * @param {Array<{materialId:number, quantidade:number}>} itens
 * @param {object} [tx] Cliente transacional.
 */
export async function darBaixaPorServico(servicoId, itens, tx = prisma) {
  for (const item of itens) {
    try {
      const { material } = await movimentarEstoque(
        {
          materialId: item.materialId,
          tipo: 'saida',
          quantidade: item.quantidade,
          origem: 'servico',
          servicoId,
          observacao: 'Baixa automática por serviço concluído',
        },
        tx
      );
      // Se a baixa levou o saldo ao/abaixo do mínimo, avisa os admins
      await alertarEstoqueBaixo(material, tx);
    } catch (erro) {
      logger.error('Falha ao dar baixa de estoque', { servicoId, materialId: item.materialId, erro: erro.message });
    }
  }
}
