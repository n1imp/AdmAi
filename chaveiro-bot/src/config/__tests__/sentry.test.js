/**
 * Unit — Sentry (F5 observabilidade). Mocka @sentry/node, env e logger.
 * Prova o gate por SENTRY_DSN, a idempotência do init (instrument.js + fallback) e o
 * enriquecimento de contexto por tenant (empresaId/userId/feature) em capturarErro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const initMock = vi.hoisted(() => vi.fn());
const captureMock = vi.hoisted(() => vi.fn());
const scope = vi.hoisted(() => ({ setUser: vi.fn(), setTag: vi.fn(), setExtra: vi.fn() }));
const withScopeMock = vi.hoisted(() => vi.fn((cb) => cb(scope)));
vi.mock('@sentry/node', () => ({
  init: initMock,
  captureException: captureMock,
  withScope: withScopeMock,
}));

const envMock = vi.hoisted(() => ({ env: {} }));
vi.mock('../env.js', () => envMock);
vi.mock('../../utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const DSN = 'https://k@o0.ingest.sentry.io/1';

async function freshSentry() {
  vi.resetModules();
  return import('../sentry.js');
}

beforeEach(() => {
  envMock.env = {};
  initMock.mockClear();
  captureMock.mockClear();
  scope.setUser.mockClear();
  scope.setTag.mockClear();
  scope.setExtra.mockClear();
});

describe('sentry (F5)', () => {
  it('sem DSN: iniciarSentry retorna false e não inicializa', async () => {
    const { iniciarSentry, sentryAtivo } = await freshSentry();
    expect(iniciarSentry()).toBe(false);
    expect(initMock).not.toHaveBeenCalled();
    expect(sentryAtivo()).toBe(false);
  });

  it('com DSN: inicializa uma vez e é idempotente', async () => {
    envMock.env = { SENTRY_DSN: DSN, NODE_ENV: 'production' };
    const { iniciarSentry, sentryAtivo } = await freshSentry();
    expect(iniciarSentry()).toBe(true);
    expect(iniciarSentry()).toBe(true); // 2ª chamada não re-inicializa
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(sentryAtivo()).toBe(true);
  });

  it('capturarErro: no-op quando o Sentry está inativo', async () => {
    const { capturarErro } = await freshSentry();
    capturarErro(new Error('x'), { empresaId: 7 });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('capturarErro: enriquece por tenant (empresaId/userId/feature) e captura', async () => {
    envMock.env = { SENTRY_DSN: DSN, NODE_ENV: 'production' };
    const { iniciarSentry, capturarErro } = await freshSentry();
    iniciarSentry();
    capturarErro(new Error('boom'), {
      userId: 9,
      empresaId: 7,
      feature: 'http',
      extra: { path: '/x' },
    });
    expect(scope.setUser).toHaveBeenCalledWith({ id: '9' });
    expect(scope.setTag).toHaveBeenCalledWith('empresaId', '7');
    expect(scope.setTag).toHaveBeenCalledWith('feature', 'http');
    expect(scope.setExtra).toHaveBeenCalledWith('path', '/x');
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
