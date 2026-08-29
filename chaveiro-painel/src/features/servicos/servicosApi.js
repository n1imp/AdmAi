import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { escopoDeSessao } from '../../lib/queryClient.js';

/**
 * Application layer de Serviços (FR-11/FR-14, DDR-4). Superfícies desta capability NUNCA
 * fazem fetch cru: consomem estes hooks. Axios é o transporte (interceptors globais
 * intactos); aqui vivem keys, invalidação (grafo REAL da capability-surface matrix) e a
 * tradução de erro para a taxonomia do produto.
 *
 * QUERY KEYS (convenção mínima, §17): prefixo da capability + ESCOPO DE IDENTIDADE + recorte.
 *   ['servicos',escopo,'lista',{tecnico,local}] · [...,'detalhe',id] · [...,'pendentes']
 * O escopo (empresa+usuário, de `lib/queryClient.js`) impede que a sessão seguinte leia o
 * cache da anterior; o prefixo `['servicos']` continua cobrindo a invalidação da capability.
 *
 * INVALIDAÇÃO (grafo, §19): toda mutação de serviço afeta lista, detalhe e a fila de
 * pendentes — o prefixo ['servicos'] cobre exatamente esse conjunto e nada além dele.
 * Dashboard/métricas legados ainda não vivem neste cache (fora do escopo até suas slices —
 * seguem refetch próprio por navegação, comportamento atual preservado).
 */

export const chaves = Object.freeze({
  lista: (filtros = {}) => ['servicos', escopoDeSessao(), 'lista', filtros],
  detalhe: (id) => ['servicos', escopoDeSessao(), 'detalhe', id],
  pendentes: () => ['servicos', escopoDeSessao(), 'pendentes'],
  meus: () => ['servicos', escopoDeSessao(), 'meus'],
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

/* O `signal` do TanStack vai ao axios: desmontar/trocar de key CANCELA o request em voo
   (Revisor 01a04c56 — sem isto, resposta velha de um filtro anterior podia aterrissar). */
export function useServicos(filtros = {}) {
  return useQuery({
    queryKey: chaves.lista(filtros),
    queryFn: async ({ signal }) => {
      /* Filtros do contrato REAL (servicos.js): tecnico, local, cursor/limit (keyset). */
      const params = new URLSearchParams();
      if (filtros.tecnico) params.set('tecnico', filtros.tecnico);
      if (filtros.local) params.set('local', filtros.local);
      if (filtros.cursor) params.set('cursor', String(filtros.cursor));
      const qs = params.toString();
      const { data } = await api.get(`/servicos${qs ? `?${qs}` : ''}`, { signal });
      return data; // { data: [...], total, nextCursor } — keyset real; tecnico = {id,nome}
    },
  });
}

/** Coleção com paginação keyset real ("Carregar mais"): páginas acumuladas por cursor. */
export function useServicosInfinita(filtros = {}) {
  return useInfiniteQuery({
    queryKey: chaves.lista(filtros),
    initialPageParam: undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      if (filtros.tecnico) params.set('tecnico', filtros.tecnico);
      if (filtros.local) params.set('local', filtros.local);
      if (pageParam) params.set('cursor', String(pageParam));
      const qs = params.toString();
      const { data } = await api.get(`/servicos${qs ? `?${qs}` : ''}`, { signal });
      return data;
    },
    getNextPageParam: (ultima) => ultima?.nextCursor ?? undefined,
  });
}

export function useServico(id) {
  return useQuery({
    queryKey: chaves.detalhe(id),
    enabled: id != null,
    queryFn: async ({ signal }) => (await api.get(`/servicos/${id}`, { signal })).data,
  });
}

/** Serviços do PRÓPRIO funcionário (/me/servicos) — mesmo prefixo: mutações invalidam junto. */
export function useMeusServicos() {
  return useQuery({
    queryKey: chaves.meus(),
    queryFn: async ({ signal }) => (await api.get('/me/servicos', { signal })).data,
  });
}

export function usePendentes(opts = {}) {
  return useQuery({
    queryKey: chaves.pendentes(),
    queryFn: async ({ signal }) => (await api.get('/servicos/pendentes', { signal })).data,
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

/** Devolve { status, data }: o chamador exige o 201 LITERAL do contrato de criação antes de
 *  limpar rascunho/anunciar sucesso (DECISOR 01a04bfb §iii; Revisor 01a04c56 — um 2xx
 *  qualquer não é prova de criação). */
export function useCriarServico() {
  return useMutacaoDeServico(async (corpo) => {
    const resposta = await api.post('/servicos', corpo);
    return { status: resposta.status, data: resposta.data };
  });
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
