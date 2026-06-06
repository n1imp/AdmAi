/**
 * Sentry — captura de erros com contexto (guia §4.3).
 *
 * Ativação é OPCIONAL: só inicializa quando SENTRY_DSN está definido. Em dev/test,
 * sem DSN, todas as funções viram no-ops — nada é enviado e nada quebra.
 *
 * `beforeSend` remove dados sensíveis antes de enviar (e-mail/IP/headers de auth).
 */
import * as Sentry from '@sentry/node';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let ativo = false;

export function iniciarSentry() {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.APP_VERSION,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Nunca vazar PII ou credenciais para o Sentry.
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });
  ativo = true;
  logger.info('Sentry inicializado', { environment: env.NODE_ENV });
  return true;
}

export function sentryAtivo() {
  return ativo;
}

/**
 * Captura uma exceção com contexto de negócio. No-op se o Sentry não estiver ativo.
 * @param {Error} erro
 * @param {{ userId?: number|string, empresaId?: number, feature?: string, extra?: object }} [contexto]
 */
export function capturarErro(erro, contexto = {}) {
  if (!ativo) return;
  Sentry.withScope((scope) => {
    if (contexto.userId != null) scope.setUser({ id: String(contexto.userId) });
    if (contexto.empresaId != null) scope.setTag('empresaId', String(contexto.empresaId));
    if (contexto.feature) scope.setTag('feature', contexto.feature);
    if (contexto.extra) {
      for (const [k, v] of Object.entries(contexto.extra)) scope.setExtra(k, v);
    }
    Sentry.captureException(erro);
  });
}

export { Sentry };
