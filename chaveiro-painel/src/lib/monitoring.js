// Observabilidade do painel.
//
// Integra com o Sentry SOMENTE se VITE_SENTRY_DSN estiver definido — e de forma
// LAZY (o SDK só é baixado quando há DSN), para não pesar o bundle padrão. Sem
// DSN, tudo vira no-op + console, espelhando o comportamento do backend.

let sentry = null;

/** Inicializa o monitoramento remoto (fire-and-forget). No-op sem DSN. */
export async function iniciarMonitoramento() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
    });
    sentry = Sentry;
  } catch {
    // Falha ao carregar/inicializar o SDK: segue sem monitoramento remoto.
  }
}

/** Reporta um erro capturado (ErrorBoundary/handlers globais). */
export function reportarErro(erro, contexto) {
  console.error('Erro capturado:', erro, contexto ?? '');
  if (sentry) sentry.captureException(erro, contexto ? { extra: contexto } : undefined);
}
