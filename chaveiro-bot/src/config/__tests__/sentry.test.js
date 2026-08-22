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

/**
 * `beforeSend` é o último ponto antes de o evento sair da máquina. Nada aqui o exercitava: os
 * casos acima provam que o Sentry inicializa e que o contexto é anexado — não provam o que é
 * REMOVIDO na saída. E é o oposto de todo o resto do arquivo: lá o defeito é não enviar; aqui o
 * defeito é enviar demais, e ele passa despercebido justamente porque tudo continua funcionando.
 *
 * Os quatro campos não foram escolhidos por gosto. `user.email` e `user.ip_address` são PII direta;
 * `authorization` carrega o token de sessão e `cookie` carrega o refresh — qualquer um dos dois num
 * evento de erro entrega uma sessão válida a quem tiver acesso ao painel do Sentry.  [GAP-OBS-02]
 */
describe('beforeSend: o que NÃO pode sair da máquina', () => {
  /** Pega o `beforeSend` que o próprio módulo passou ao `Sentry.init`. */
  async function beforeSendReal() {
    envMock.env = { SENTRY_DSN: DSN, NODE_ENV: 'production' };
    const { iniciarSentry } = await freshSentry();
    iniciarSentry();
    const [config] = initMock.mock.calls[0];
    expect(typeof config.beforeSend).toBe('function');
    return config.beforeSend;
  }

  it('CONTROLE POSITIVO: o evento continua sendo enviado, e o que não é sensível sobrevive', async () => {
    const beforeSend = await beforeSendReal();

    const evento = beforeSend({
      message: 'boom',
      user: { id: '42' },
      request: { headers: { 'user-agent': 'AdmAi/1.0' }, url: '/api/servicos' },
    });

    /* Sem isto, "não vazou nada" seria satisfeito por um `beforeSend` que devolvesse `null` e
       descartasse TODO evento — observabilidade zero passando como privacidade perfeita. */
    expect(evento).toBeTruthy();
    expect(evento.message).toBe('boom');
    expect(evento.user.id).toBe('42');
    expect(evento.request.headers['user-agent']).toBe('AdmAi/1.0');
    expect(evento.request.url).toBe('/api/servicos');
  });

  it('remove e-mail e IP do usuário, preservando o id que torna o erro rastreável', async () => {
    const beforeSend = await beforeSendReal();

    const evento = beforeSend({
      user: { id: '42', email: 'cliente@exemplo.com', ip_address: '203.0.113.7' },
    });

    expect(evento.user.email).toBeUndefined();
    expect(evento.user.ip_address).toBeUndefined();
    /* O id fica: sem ele o erro deixa de ser diagnosticável, e a troca vira privacidade por
       inutilidade. Identificador interno não é PII. */
    expect(evento.user.id).toBe('42');
  });

  it('remove os cabeçalhos que carregam sessão', async () => {
    const beforeSend = await beforeSendReal();

    const evento = beforeSend({
      request: {
        headers: {
          authorization: 'Bearer token-de-sessao-valido',
          cookie: 'refresh=abc123; outra=coisa',
          'content-type': 'application/json',
        },
      },
    });

    expect(evento.request.headers.authorization).toBeUndefined();
    expect(evento.request.headers.cookie).toBeUndefined();
    expect(evento.request.headers['content-type']).toBe('application/json');
    /* Verificação pelo TEXTO INTEIRO, não só pelas chaves: um scrub que apagasse o nome do
       cabeçalho e deixasse o valor em outro lugar do evento passaria na asserção acima. */
    expect(JSON.stringify(evento)).not.toContain('token-de-sessao-valido');
    expect(JSON.stringify(evento)).not.toContain('refresh=abc123');
  });

  it('evento sem `user` nem `request` não quebra o envio', async () => {
    const beforeSend = await beforeSendReal();

    /* O caminho mais comum de todos: erro de fundo, sem requisição associada. Um `beforeSend` que
       assumisse a presença dos campos derrubaria justamente o evento mais frequente — e a falha
       apareceria como ausência de eventos, que é indistinguível de "não houve erro". */
    expect(() => beforeSend({ message: 'erro de worker' })).not.toThrow();
    expect(beforeSend({ message: 'erro de worker' }).message).toBe('erro de worker');
  });
});
