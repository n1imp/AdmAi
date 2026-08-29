import { QueryClient } from '@tanstack/react-query';
import { decodeJWT } from './jwt.js';

/**
 * Server state do AdmAi (DDR-4 — TanStack Query HÍBRIDO, por capability migrada).
 * Axios continua o ÚNICO transporte (interceptors de refresh/401/402/403 intactos);
 * este client só orquestra cache/invalidations das capabilities já migradas.
 *
 * Política vinculante do DECISOR 01a04abb:
 *  - retry SÓ para falha transitória de rede (sem response), nunca para 4xx/5xx;
 *  - mutations retry 0 (mutação crítica não se repete sozinha);
 *  - refetchOnWindowFocus off: no Capacitor, voltar da câmera/permissão não pode disparar
 *    refetch involuntário (o fluxo do Ponto abre câmera).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => !error?.response && failureCount < 2,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
    mutations: { retry: 0 },
  },
});

/**
 * ESCOPO DE IDENTIDADE das query keys — defesa em profundidade contra vazamento entre
 * contas/empresas (achado ALTA do Revisor 01a04c56). Limpar no logout não basta sozinho:
 * observers ainda montados repopulam o cache no instante do clear, e uma key sem identidade
 * seria lida pela PRÓXIMA sessão como cache válido (dado da empresa A na tela da B, ao menos
 * como flash stale). Com o escopo na key, dado de A e dado de B nunca ocupam a mesma entrada.
 * Não substitui a limpeza: as duas medidas cobrem falhas diferentes.
 */
export function escopoDeSessao() {
  try {
    const token = localStorage.getItem('admai_token');
    const payload = token ? decodeJWT(token) : null;
    return payload ? `e${payload.empresaId ?? '?'}u${payload.id ?? '?'}` : 'anon';
  } catch {
    return 'anon';
  }
}

/** Troca de identidade/logout NUNCA vaza dados entre contas/empresas (DDR-4). */
export function limparCacheServidor() {
  queryClient.clear();
}
