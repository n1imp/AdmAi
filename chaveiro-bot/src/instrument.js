/**
 * Bootstrap de instrumentação (Sentry/OpenTelemetry) — F5 observabilidade.
 *
 * O @sentry/node v10 usa auto-instrumentação via OpenTelemetry: para capturar spans de
 * HTTP/Express/Postgres(pg)/Redis(ioredis), o `Sentry.init` PRECISA rodar ANTES desses
 * módulos serem importados. Como imports ESM são avaliados em ordem de origem, este módulo
 * é o PRIMEIRO import do server.js — assim o init acontece antes de app.js/prisma.js/filas,
 * e o tracing (tracesSampleRate) passa a registrar o caminho API→DB→Redis→fila.
 *
 * É no-op sem SENTRY_DSN (dev/test) — `iniciarSentry` já guarda isso e é idempotente.
 */
import { iniciarSentry } from './config/sentry.js';

iniciarSentry();
