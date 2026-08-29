import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';

/**
 * Application layer de Serviços (FR-11/FR-14, DDR-4). Superfícies desta capability NUNCA
 * fazem fetch cru: consomem estes hooks. Axios é o transporte (interceptors globais
 * intactos); aqui vivem keys, invalidação (grafo REAL da capability-surface matrix) e a
 * tradução de erro para a taxonomia do produto.
 *
 * QUERY KEYS (convenção mínima, §17): prefixo da capability + recorte + contexto.
 *   ['servicos','lista',{busca,local}] · ['servicos','detalhe',id] · ['servicos','pendentes']
 *
 * INVALIDAÇÃO (grafo, §19): toda mutação de serviço afeta lista, detalhe e a fila de
 * pendentes — o prefixo ['servicos'] cobre exatamente esse conjunto e nada além dele.
 * Dashboard/métricas legados ainda não vivem neste cache (fora do escopo até suas slices —
 * seguem refetch próprio por navegação, comportamento atual preservado).
 */

export const chaves = Object.freeze({
  lista: (filtros = {}) => ['servicos', 'lista', filtros],
  detalhe: (id) => ['servicos', 'detalhe', id],
  pendentes: () => ['servicos', 'pendentes'],
});

/** Taxonomia de erro do produto (ARCHITECTURE_CONTRACT §79): tradução segura, sem vazar cru. */
export function classificarErro(error) {
  if (!error?.response)
    return {
      classe: 'NETWORK_ERROR',
      mensagem: 'Sem conexão. Verifique sua internet e tente novamente.',
    };
  const { status, data } = error.response;
  const doServidor = typeof data?.erro === 'string' ? data.erro : null;
  if (status === 401)
    return { classe: 'AUTH_REQUIRED', mensagem: 'Sessão expirada. Entre novamente.' };
  if (status === 403)
    return { classe: 'PERMISSION_DENIED', mensagem: 'Você não tem permissão para isso.' };
  if (status === 404)
    return {
      classe: 'NOT_FOUND',
      mensagem: doServidor ?? 'Não encontramos este item. Ele pode ter sido removido.',
    };
  if (status === 409)
    return {
      classe: 'CONFLICT',
      mensagem: doServidor ?? 'Este registro mudou de estado. Atualize e tente novamente.',
    };
  if (status === 400)
    return {
      classe: 'VALIDATION_ERROR',
      mensagem: doServidor ?? 'Confira os campos e tente novamente.',
    };
  if (status === 429)
    return { classe: 'RATE_LIMIT', mensagem: 'Muitas tentativas. Aguarde um instante.' };
  return {
    classe: 'SERVER_ERROR',
    mensagem: 'Não foi possível concluir. Tente novamente em instantes.',
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useServicos(filtros = {}) {
  return useQuery({
    queryKey: chaves.lista(filtros),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtros.busca) params.set('busca', filtros.busca);
      if (filtros.local) params.set('local', filtros.local);
      if (filtros.cursor) params.set('cursor', String(filtros.cursor));
      const qs = params.toString();
      const { data } = await api.get(`/servicos${qs ? `?${qs}` : ''}`);
      return data; // { data: [...], total, nextCursor? } — contrato keyset real
    },
  });
}

export function useServico(id) {
  return useQuery({
    queryKey: chaves.detalhe(id),
    enabled: id != null,
    queryFn: async () => (await api.get(`/servicos/${id}`)).data,
  });
}

export function usePendentes(opts = {}) {
  return useQuery({
    queryKey: chaves.pendentes(),
    queryFn: async () => (await api.get('/servicos/pendentes')).data,
    ...opts,
  });
}

// ── Mutations (críticas: retry 0 global; NO_FAKE_SUCCESS — invalidação pós-confirmação) ──

function useMutacaoDeServico(fn, aoConfirmar) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (...args) => {
      /* Grafo real: lista + detalhe + pendentes (prefixo exato da capability). */
      await qc.invalidateQueries({ queryKey: ['servicos'] });
      aoConfirmar?.(qc, ...args);
    },
  });
}

export function useCriarServico() {
  return useMutacaoDeServico(async (corpo) => (await api.post('/servicos', corpo)).data);
}

export function useDeletarServico() {
  return useMutacaoDeServico(
    async (id) => (await api.delete(`/servicos/${id}`)).data,
    (qc, _data, id) => qc.removeQueries({ queryKey: chaves.detalhe(id) })
  );
}

export function useAprovarServico() {
  return useMutacaoDeServico(async (id) => (await api.post(`/servicos/${id}/aprovar`)).data);
}

export function useRejeitarServico() {
  return useMutacaoDeServico(async (id) => (await api.post(`/servicos/${id}/rejeitar`)).data);
}
