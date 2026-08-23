import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { alertarEstoqueBaixo } from './notificacao.js';

/**
 * Movimenta o estoque de um material de forma transacional:
 * atualiza o saldo (quantidadeAtual) e registra a movimentação no histórico.
 *
 * O saldo nunca fica negativo — saídas são limitadas ao saldo disponível.
 *
 * `empresaId` é OBRIGATÓRIO e filtra a leitura do material: o parâmetro `tx` cai no
 * `prisma` cru (sem escopo de tenant) quando omitido, então sem esse filtro a função
 * dependeria apenas da validação de posse feita pelo chamador. Hoje todos os call sites
 * pré-validam, mas isso é frágil a regressão — aqui a checagem passa a ser local.
 *
 * @param {object} params
 * @param {number} params.materialId
 * @param {number} params.empresaId   Tenant dono do material (obrigatório).
 * @param {'entrada'|'saida'|'ajuste'} params.tipo
 * @param {number} params.quantidade  Sempre positiva.
 * @param {string} [params.origem]    "manual" | "servico" | "ajuste"
 * @param {number} [params.servicoId] Serviço que originou a saída, se houver.
 * @param {string} [params.observacao]
 * @param {object} [tx]               Cliente Prisma transacional (opcional).
 */
export async function movimentarEstoque(
  {
    materialId,
    empresaId,
    tipo,
    quantidade,
    origem = 'manual',
    servicoId = null,
    observacao = null,
  },
  tx = prisma
) {
  if (quantidade <= 0) throw new Error('Quantidade deve ser positiva');
  if (!empresaId) throw new Error('empresaId obrigatório para movimentar estoque');

  const executar = async (client) => {
    /* LOCK DE LINHA, e por que o `increment` sozinho não bastava.  [FIX-ESTOQUE-CORRIDA]
       A versão anterior lia o material, computava o piso (`Math.max(0, lido + delta)`) e aplicava
       `increment` do ajuste. O increment fecha o lost-update do SALDO — mas o piso e o `saldoApos`
       eram computados contra a leitura STALE: duas saídas concorrentes de 7 sobre saldo 10 liam
       10 as duas, cada uma aplicava -7, e o saldo real terminava em -4 com AMBAS as linhas do
       ledger dizendo `saldoApos = 3`. O comentário de então prometia mais do que o código
       entregava — achado da revisão independente (thread 01a02cf7), confirmado linha a linha.

       `SELECT ... FOR UPDATE` serializa os movimentos DO MESMO material: o segundo concorrente
       espera o lock e computa o clamp contra o valor JÁ atualizado. A semântica de baixa PARCIAL
       (saída limitada ao disponível) é preservada — agora contra o valor verdadeiro. O custo é
       uma espera por lock apenas entre movimentos do mesmo material do mesmo tenant, que é
       exatamente o caso que precisa serializar. */
    const [material] = await client.$queryRaw`
      SELECT * FROM "Material" WHERE id = ${materialId} AND "empresaId" = ${empresaId}
      FOR UPDATE`;
    if (!material) throw new Error('Material não encontrado');

    const delta = tipo === 'saida' ? -quantidade : quantidade;
    // Saldo não pode ficar negativo: limita a baixa ao disponível — LIDO SOB LOCK.
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

  // Se já estamos numa transação, reutiliza; senão abre uma própria. O FOR UPDATE acima só
  // tem efeito dentro de transação — fora dela o lock morre com o statement, e é por isso que
  // o caminho standalone SEMPRE abre uma.
  return tx === prisma ? prisma.$transaction(executar) : executar(tx);
}

/**
 * Dá baixa no estoque para uma lista de materiais consumidos num serviço.
 * Tolerante a falhas: registra erro mas não derruba o registro do serviço.
 *
 * @param {number} servicoId
 * @param {Array<{materialId:number, quantidade:number}>} itens
 * @param {number} empresaId Tenant dono dos materiais (obrigatório, repassado ao movimentarEstoque).
 * @param {object} [tx] Cliente transacional.
 */
export async function darBaixaPorServico(servicoId, itens, empresaId, tx = prisma) {
  if (!empresaId) throw new Error('empresaId obrigatório para dar baixa de estoque');
  for (const item of itens) {
    try {
      const { material } = await movimentarEstoque(
        {
          materialId: item.materialId,
          empresaId,
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
      logger.error('Falha ao dar baixa de estoque', {
        servicoId,
        materialId: item.materialId,
        erro: erro.message,
      });
    }
  }
}
