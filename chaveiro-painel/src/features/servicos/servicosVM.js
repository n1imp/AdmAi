import { formatarMoeda, formatarData } from '../../lib/api.js';

/**
 * View models de Serviços (FR-10/FR-14). O backend é a verdade; aqui só TRADUÇÃO para a
 * linguagem do produto (ADMAI_PRODUCT_GLOSSARY). `pendente` cru NUNCA chega ao JSX.
 */

/** status de domínio → rótulo humano + semântica de cor (único acento por linha). */
export const STATUS_VM = Object.freeze({
  pendente: { rotulo: 'Aguardando aprovação', semantica: 'attention' },
  ativo: { rotulo: 'Aprovado', semantica: 'success' },
  rejeitado: { rotulo: 'Rejeitado', semantica: 'danger' },
  rascunho: { rotulo: 'Rascunho', semantica: 'neutral' },
});

export function statusVM(status) {
  return STATUS_VM[status] ?? { rotulo: status ?? '—', semantica: 'neutral' };
}

/** DTO → modelo de tela (dinheiro/data pelos formatadores centrais; líquido derivado). */
export function servicoVM(dto) {
  if (!dto) return null;
  const cobrado = dto.valorCobrado ?? 0;
  const material = dto.valorMaterial ?? 0;
  return {
    id: dto.id,
    descricao: dto.descricao,
    local: dto.local,
    endereco: dto.endereco ?? null,
    /* A API entrega tecnico como OBJETO {id,nome} (include) — nunca renderizar o objeto. */
    tecnicoNome: dto.tecnico?.nome ?? null,
    tecnicoId: dto.tecnico?.id ?? dto.tecnicoId ?? null,
    clienteNome: dto.clienteNome ?? null,
    clienteTelefone: dto.clienteTelefone ?? null,
    material: dto.material ?? null,
    fotoEvidencia: dto.fotoEvidencia ?? null,
    status: statusVM(dto.status),
    statusDominio: dto.status,
    criadoEmRotulo: formatarData(dto.criadoEm),
    cobradoRotulo: formatarMoeda(cobrado),
    materialRotulo: formatarMoeda(material),
    liquidoRotulo: formatarMoeda(dto.valorLiquido ?? cobrado - material),
    aprovadoEmRotulo: dto.aprovadoEm ? formatarData(dto.aprovadoEm) : null,
  };
}

/**
 * NEXT BEST ACTION (§23): estado + permissão efetiva → ação prioritária. Projeção de
 * usabilidade — a autorização real continua no backend (aprovar/rejeitar exigem
 * `aprovacoes.aprovar` no servidor de qualquer forma).
 */
export function proximaAcao(dto, pode) {
  if (!dto) return null;
  if (dto.status === 'pendente' && pode?.('aprovacoes', 'aprovar')) {
    return { tipo: 'revisar', rotulo: 'Revisar aprovação' };
  }
  return null;
}
