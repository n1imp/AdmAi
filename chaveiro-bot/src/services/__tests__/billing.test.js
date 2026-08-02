import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-BILL-01 — a Checkout Session precisa carregar `metadata.empresaId` (a
 * FONTE ÚNICA que `routes/billing.js` usa pra sincronizar a assinatura no
 * webhook `checkout.session.completed`). Antes desta correção, só o Customer
 * levava esse metadata — a Session não, então o webhook nunca conseguia
 * associar o evento a uma empresa (EV-021).
 *
 * Mockamos `stripe` (import dinâmico dentro de getStripe()) e `db/prisma.js`
 * (import dinâmico dentro de cada função) pra exercitar `criarCheckoutSession`
 * sem rede nem banco real.
 */
const { checkoutCreateMock, customersCreateMock, assinaturaFindUniqueMock, assinaturaUpsertMock } =
  vi.hoisted(() => ({
    checkoutCreateMock: vi.fn(),
    customersCreateMock: vi.fn(),
    assinaturaFindUniqueMock: vi.fn(),
    assinaturaUpsertMock: vi.fn(),
  }));

vi.mock('stripe', () => ({
  // mockImplementation precisa de function() normal — arrow function não pode
  // ser chamada com `new` (é assim que services/billing.js instancia o SDK).
  default: vi.fn().mockImplementation(function StripeMock() {
    return {
      checkout: { sessions: { create: checkoutCreateMock } },
      customers: { create: customersCreateMock },
    };
  }),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_PRICE_ID_PRO: 'price_123',
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    empresa: { findUnique: vi.fn(async () => ({ id: 7, nome: 'Chaveiro Teste' })) },
    assinatura: { findUnique: assinaturaFindUniqueMock, upsert: assinaturaUpsertMock },
  },
}));

async function carregar() {
  vi.resetModules();
  return import('../billing.js');
}

beforeEach(() => {
  checkoutCreateMock.mockReset().mockResolvedValue({ url: 'https://checkout.stripe.com/xyz' });
  customersCreateMock.mockReset().mockResolvedValue({ id: 'cus_novo' });
  assinaturaFindUniqueMock.mockReset().mockResolvedValue(null);
  assinaturaUpsertMock.mockReset().mockResolvedValue({});
});

describe('criarCheckoutSession', () => {
  it('cria a Checkout Session com metadata.empresaId — fonte única pro webhook sincronizar', async () => {
    const { criarCheckoutSession } = await carregar();
    await criarCheckoutSession(7, 'dono@x.com', 'https://app.example.com');

    expect(checkoutCreateMock).toHaveBeenCalledTimes(1);
    const args = checkoutCreateMock.mock.calls[0][0];
    expect(args.metadata).toEqual({ empresaId: '7' });
  });

  it('não delega o metadata pro Customer — a Session precisa do próprio, não é suficiente ter só no Customer', async () => {
    const { criarCheckoutSession } = await carregar();
    await criarCheckoutSession(7, 'dono@x.com', 'https://app.example.com');

    // obterOuCriarCliente() já seta metadata no Customer (comportamento pré-existente,
    // não tocado por T-BILL-01) — este teste prova que a Session TAMBÉM recebe o seu.
    expect(customersCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { empresaId: '7' } })
    );
    const args = checkoutCreateMock.mock.calls[0][0];
    expect(args.metadata).toEqual({ empresaId: '7' });
  });

  it('empresaId vira string no metadata (Stripe só aceita string em metadata)', async () => {
    const { criarCheckoutSession } = await carregar();
    await criarCheckoutSession(42, 'dono@x.com', 'https://app.example.com');

    const args = checkoutCreateMock.mock.calls[0][0];
    expect(args.metadata.empresaId).toBe('42');
    expect(typeof args.metadata.empresaId).toBe('string');
  });
});
