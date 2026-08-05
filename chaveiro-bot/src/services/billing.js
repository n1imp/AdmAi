import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// T-BILL-06 (D-09): duração fixa do trial concedido a toda empresa nova, em
// QUALQUER caminho que crie uma Empresa (routes/auth.js: /auth/register,
// /auth/oauth/:provedor, /setup; services/bootstrap.js: bootstrapAdmin) —
// centralizado aqui (não redeclarado em cada arquivo) para não divergir.
export const TRIAL_DIAS = 14;

let _stripe = null;

export async function getStripe() {
  if (!env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) {
    const { default: Stripe } = await import('stripe');
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, { timeout: 20000, maxNetworkRetries: 2 });
  }
  return _stripe;
}

export async function obterOuCriarCliente(empresa, email) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe não configurado');

  const { prisma } = await import('../db/prisma.js');
  const assinatura = await prisma.assinatura.findUnique({ where: { empresaId: empresa.id } });

  if (assinatura?.stripeCustomerId) {
    return assinatura.stripeCustomerId;
  }

  const cliente = await stripe.customers.create({
    email,
    name: empresa.nome,
    metadata: { empresaId: String(empresa.id) },
  });
  await prisma.assinatura.upsert({
    where: { empresaId: empresa.id },
    create: { empresaId: empresa.id, stripeCustomerId: cliente.id },
    update: { stripeCustomerId: cliente.id },
  });
  return cliente.id;
}

export async function criarCheckoutSession(empresaId, email, returnUrl) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe não configurado');
  if (!env.STRIPE_PRICE_ID_PRO) throw new Error('STRIPE_PRICE_ID_PRO não configurado');

  const { prisma } = await import('../db/prisma.js');
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  const customerId = await obterOuCriarCliente(empresa, email);

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: env.STRIPE_PRICE_ID_PRO, quantity: 1 }],
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancel`,
    // T-BILL-01: fonte ÚNICA de verdade pro webhook (checkout.session.completed)
    // saber a qual empresa a assinatura pertence. Antes só o Customer levava esse
    // metadata — a Session não, então o evento nunca sincronizava a assinatura
    // nova (Number(undefined) é NaN, o handler dava break silencioso).
    metadata: { empresaId: String(empresaId) },
  });
}

export async function criarPortalSession(stripeCustomerId, returnUrl) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe não configurado');
  return stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
}

export async function processarEvento(rawBody, signature) {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe não configurado');
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET não configurado');
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}

export async function sincronizarAssinatura(empresaId, dados) {
  const { prisma } = await import('../db/prisma.js');
  await prisma.assinatura.upsert({
    where: { empresaId },
    create: { empresaId, ...dados },
    update: dados,
  });
  logger.info('assinatura_sincronizada', { empresaId, status: dados.status });
}
