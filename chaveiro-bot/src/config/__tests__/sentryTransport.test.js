/**
 * Unit — transporte winston→Sentry (F9/M7, lacuna global de observabilidade).
 *
 * Usa o logger REAL (não mockado) para provar de ponta a ponta:
 *  - que `logger.error` inesperado vira `captureMessage('error')` no Sentry;
 *  - que o meta (redigido pelo format) vira `extra`;
 *  - que logs marcados com `JA_ENVIADO_AO_SENTRY` são pulados (sem duplicar `capturarErro`);
 *  - que níveis abaixo de `error` (info/warn) não são espelhados;
 *  - que, sem `iniciarSentry` (sem DSN), nada é enviado (transporte nem é anexado).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const captureMessageMock = vi.hoisted(() => vi.fn());
const scope = vi.hoisted(() => ({ setUser: vi.fn(), setTag: vi.fn(), setExtra: vi.fn() }));
const withScopeMock = vi.hoisted(() => vi.fn((cb) => cb(scope)));
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: captureMessageMock,
  withScope: withScopeMock,
}));

const envMock = vi.hoisted(() => ({
  env: { SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1', NODE_ENV: 'test' },
}));
vi.mock('../env.js', () => envMock);
// logger NÃO é mockado de propósito — o teste exercita o winston de verdade.

async function fresh() {
  vi.resetModules();
  const sentry = await import('../sentry.js');
  const { logger } = await import('../../utils/logger.js');
  return { sentry, logger };
}

const proximoTick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  captureMessageMock.mockClear();
  scope.setExtra.mockClear();
});

describe('SentryTransport (winston→Sentry)', () => {
  it('sem iniciarSentry (Sentry inativo): não espelha nada', async () => {
    const { logger } = await fresh();
    logger.error('Erro qualquer', { erro: 'boom' });
    await proximoTick();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('após iniciarSentry: espelha logger.error legado como captureMessage + extra', async () => {
    const { sentry, logger } = await fresh();
    expect(sentry.iniciarSentry()).toBe(true);
    logger.error('Erro GET /rota-legada', { erro: 'boom' });
    await proximoTick();
    expect(captureMessageMock).toHaveBeenCalledWith('Erro GET /rota-legada', 'error');
    expect(scope.setExtra).toHaveBeenCalledWith('erro', 'boom');
  });

  it('pula logs marcados como já capturados (evita duplicar com capturarErro)', async () => {
    const { sentry, logger } = await fresh();
    sentry.iniciarSentry();
    logger.error('Erro tratado', { erro: 'x', [sentry.JA_ENVIADO_AO_SENTRY]: true });
    await proximoTick();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it('não espelha níveis abaixo de error (info/warn)', async () => {
    const { sentry, logger } = await fresh();
    sentry.iniciarSentry();
    logger.info('rotina');
    logger.warn('aviso');
    await proximoTick();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});
