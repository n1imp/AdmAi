import { QueryClient } from '@tanstack/react-query';

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

/** Troca de identidade/logout NUNCA vaza dados entre contas/empresas (DDR-4). */
export function limparCacheServidor() {
  queryClient.clear();
}
