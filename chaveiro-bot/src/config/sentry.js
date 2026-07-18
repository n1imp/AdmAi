/**
 * Sentry — captura de erros com contexto (guia §4.3).
 *
 * Ativação é OPCIONAL: só inicializa quando SENTRY_DSN está definido. Em dev/test,
 * sem DSN, todas as funções viram no-ops — nada é enviado e nada quebra.
 *
 * `beforeSend` remove dados sensíveis antes de enviar (e-mail/IP/headers de auth).
 */
import * as Sentry from '@sentry/node';
import Transport from 'winston-transport';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let ativo = false;

// Marca (em meta de um log) que aquele erro JÁ foi enviado ao Sentry por um
// `capturarErro` explícito (com stack + tags de tenant). O transporte winston→Sentry
// pula esses logs para não duplicar o evento. `Symbol.for` usa o registro global, então
// qualquer módulo referencia o MESMO símbolo sem acoplar import. Invisível em JSON/printf
// (JSON.stringify e Object.keys ignoram símbolos), logo não polui a saída de log.
export const JA_ENVIADO_AO_SENTRY = Symbol.for('admai.sentryCapturado');

/**
 * Transporte winston que espelha logs de nível `error` para o Sentry (guia §4.3).
 * Fecha a lacuna global: QUALQUER `logger.error` inesperado (incl. 500s tratados nos
 * endpoints legados que não chamam `capturarErro`) vira um evento no Sentry — com o meta
 * já redigido pelo format do logger (sem PII/segredos). É `captureMessage` (não temos o
 * objeto Error aqui); os sites com contexto rico seguem em `capturarErro` (captureException
 * + stack + tags) e são pulados via `JA_ENVIADO_AO_SENTRY`. No-op sem DSN (nunca é anexado).
 */
export class SentryTransport extends Transport {
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));
    try {
      if (ativo && !info[JA_ENVIADO_AO_SENTRY]) {
        Sentry.withScope((scope) => {
          // O meta já passou pelo `redator` do logger → seguro. Só primitivos viram extra
          // (evita anexar objetos grandes/circulares). level/message/timestamp são fixos.
          for (const [k, v] of Object.entries(info)) {
            if (k === 'level' || k === 'message' || k === 'timestamp') continue;
            if (v !== null && typeof v === 'object') continue;
            scope.setExtra(k, v);
          }
          Sentry.captureMessage(String(info.message ?? 'erro'), 'error');
        });
      }
    } catch {
      // Um transporte de log JAMAIS pode derrubar a aplicação.
    }
    callback();
  }
}

export function iniciarSentry() {
  if (ativo) return true; // idempotente: instrument.js já pode ter inicializado no boot.
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
  // Anexa o transporte só quando o Sentry está de fato ativo (com DSN). Guard defensivo
  // para o caso de o logger estar mockado em teste sem `.add`.
  if (typeof logger.add === 'function') {
    logger.add(new SentryTransport({ level: 'error' }));
  }
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
