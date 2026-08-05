import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-BILL-01 — quando `checkout.session.completed` chega SEM `metadata.empresaId`,
 * o handler precisa logar um `warn` estruturado com só identificadores
 * operacionais seguros (`eventId`/`eventType`) — nunca o payload completo do
 * evento, dado pessoal ou segredo — e continuar sem derrubar o processo (D-16).
 *
 * Mockamos `db/prisma.js`, `services/billing.js` e `utils/logger.js` pra
 * exercitar `despacharEvento` isoladamente, sem banco nem rede.
 */
const { sincronizarAssinaturaMock, loggerWarnMock, loggerInfoMock, loggerDebugMock } = vi.hoisted(
  () => ({
    sincronizarAssinaturaMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerDebugMock: vi.fn(),
  })
);

vi.mock('../../services/billing.js', () => ({
  criarCheckoutSession: vi.fn(),
  criarPortalSession: vi.fn(),
  processarEvento: vi.fn(),
  sincronizarAssinatura: sincronizarAssinaturaMock,
}));

vi.mock('../../services/email.js', () => ({
  enviarEmailRecibo: vi.fn(),
  enviarEmailFalhaPagamento: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    assinatura: { findUnique: vi.fn(), findFirst: vi.fn() },
    usuario: { findFirst: vi.fn() },
  },
}));

vi.mock('../../services/idempotencia.js', () => ({ marcarSeNovo: vi.fn() }));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    warn: loggerWarnMock,
    info: loggerInfoMock,
    debug: loggerDebugMock,
    error: vi.fn(),
  },
}));

async function carregar() {
  vi.resetModules();
  return import('../billing.js');
}

beforeEach(() => {
  sincronizarAssinaturaMock.mockReset();
  loggerWarnMock.mockReset();
  loggerInfoMock.mockReset();
  loggerDebugMock.mockReset();
});

describe('despacharEvento — checkout.session.completed', () => {
  it('com metadata.empresaId presente, sincroniza a assinatura normalmente', async () => {
    const { despacharEvento } = await carregar();
    await despacharEvento({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          metadata: { empresaId: '7' },
          customer: 'cus_1',
          subscription: 'sub_1',
        },
      },
    });

    expect(sincronizarAssinaturaMock).toHaveBeenCalledWith(7, {
      stripeCustomerId: 'cus_1',
      stripeSubId: 'sub_1',
      status: 'active',
    });
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it('SEM metadata.empresaId, loga warn só com eventId/eventType — nunca o payload completo', async () => {
    const { despacharEvento } = await carregar();
    const objSemMetadata = {
      mode: 'subscription',
      customer: 'cus_secreto',
      subscription: 'sub_secreto',
      customer_details: { email: 'cliente@x.com' }, // dado pessoal — NÃO pode vazar pro log
    };

    await despacharEvento({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: { object: objSemMetadata },
    });

    expect(sincronizarAssinaturaMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalledWith('stripe_checkout_sem_empresa_id', {
      eventId: 'evt_2',
      eventType: 'checkout.session.completed',
    });

    // Prova negativa: nenhum campo do log carrega o objeto do evento (nem
    // customer, nem email, nem qualquer coisa além de eventId/eventType).
    const [, campos] = loggerWarnMock.mock.calls[0];
    expect(Object.keys(campos).sort()).toEqual(['eventId', 'eventType']);
    expect(JSON.stringify(campos)).not.toContain('cliente@x.com');
    expect(JSON.stringify(campos)).not.toContain('cus_secreto');
  });

  it('metadata.empresaId inválido (não numérico) também loga warn e não derruba o processo', async () => {
    const { despacharEvento } = await carregar();
    await expect(
      despacharEvento({
        id: 'evt_3',
        type: 'checkout.session.completed',
        data: { object: { mode: 'subscription', metadata: { empresaId: 'abc' } } },
      })
    ).resolves.toBeUndefined();

    expect(sincronizarAssinaturaMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).toHaveBeenCalledWith('stripe_checkout_sem_empresa_id', {
      eventId: 'evt_3',
      eventType: 'checkout.session.completed',
    });
  });

  it('mode diferente de subscription não é afetado (nunca chega a checar metadata)', async () => {
    const { despacharEvento } = await carregar();
    await despacharEvento({
      id: 'evt_4',
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment' } },
    });

    expect(sincronizarAssinaturaMock).not.toHaveBeenCalled();
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });
});
