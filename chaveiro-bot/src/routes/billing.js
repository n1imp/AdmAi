import express, { Router } from 'express';
import { requireAuth, adminOnly } from '../middlewares/auth.js';
import {
  criarCheckoutSession,
  criarPortalSession,
  processarEvento,
  sincronizarAssinatura,
} from '../services/billing.js';
import { enviarEmailRecibo, enviarEmailFalhaPagamento } from '../services/email.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { marcarSeNovo } from '../services/idempotencia.js';

// ── /api/billing/* ────────────────────────────────────────────────────────────

export const billingRouter = Router();

billingRouter.post('/billing/checkout', requireAuth, adminOnly, async (req, res) => {
  try {
    const returnUrl = req.headers.origin ?? `${req.protocol}://${req.get('host')}`;
    const session = await criarCheckoutSession(req.user.empresaId, req.user.email ?? '', returnUrl);
    res.json({ url: session.url });
  } catch (e) {
    logger.error('billing_checkout_erro', { erro: e.message });
    res.status(500).json({ erro: e.message });
  }
});

billingRouter.post('/billing/portal', requireAuth, adminOnly, async (req, res) => {
  try {
    const assinatura = await prisma.assinatura.findUnique({ where: { empresaId: req.user.empresaId } });
    if (!assinatura?.stripeCustomerId) {
      return res.status(400).json({ erro: 'Sem assinatura ativa' });
    }
    const returnUrl = req.headers.origin ?? `${req.protocol}://${req.get('host')}`;
    const session = await criarPortalSession(assinatura.stripeCustomerId, returnUrl);
    res.json({ url: session.url });
  } catch (e) {
    logger.error('billing_portal_erro', { erro: e.message });
    res.status(500).json({ erro: e.message });
  }
});

billingRouter.get('/billing/status', requireAuth, async (req, res) => {
  const assinatura = await prisma.assinatura.findUnique({ where: { empresaId: req.user.empresaId } });
  res.json({
    status: assinatura?.status ?? 'sem_plano',
    trialFimEm: assinatura?.trialFimEm ?? null,
    periodoFimEm: assinatura?.periodoFimEm ?? null,
    canceladoEm: assinatura?.canceladoEm ?? null,
  });
});

// ── /webhook/stripe ───────────────────────────────────────────────────────────
// Montado FORA do apiRouter em app.js para receber o corpo bruto (raw).

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let evento;
    try {
      evento = await processarEvento(req.body, sig);
    } catch (e) {
      logger.warn('stripe_webhook_sig_invalida', { erro: e.message });
      return res.status(400).json({ erro: e.message });
    }

    try {
      // Idempotência: a Stripe reenvia eventos; processa cada event.id só uma vez.
      if (!(await marcarSeNovo(`stripe:${evento.id}`, 86400))) {
        logger.info('stripe_webhook_duplicado', { id: evento.id, tipo: evento.type });
        return res.json({ recebido: true, duplicado: true });
      }
      await despacharEvento(evento);
      res.json({ recebido: true });
    } catch (e) {
      logger.error('stripe_webhook_erro', { tipo: evento.type, erro: e.message });
      res.status(500).json({ erro: 'Erro ao processar evento' });
    }
  }
);

async function despacharEvento(evento) {
  const obj = evento.data.object;

  switch (evento.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') break;
      const empresaId = Number(obj.metadata?.empresaId);
      if (!empresaId) break;
      await sincronizarAssinatura(empresaId, {
        stripeCustomerId: obj.customer,
        stripeSubId: obj.subscription,
        status: 'active',
      });
      break;
    }

    case 'customer.subscription.updated': {
      const assinatura = await prisma.assinatura.findFirst({ where: { stripeSubId: obj.id } });
      if (!assinatura) break;
      await sincronizarAssinatura(assinatura.empresaId, {
        stripePriceId: obj.items?.data?.[0]?.price?.id ?? null,
        status: obj.status,
        periodoFimEm: obj.current_period_end ? new Date(obj.current_period_end * 1000) : null,
        canceladoEm: obj.canceled_at ? new Date(obj.canceled_at * 1000) : null,
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const assinatura = await prisma.assinatura.findFirst({ where: { stripeSubId: obj.id } });
      if (!assinatura) break;
      await sincronizarAssinatura(assinatura.empresaId, {
        status: 'canceled',
        canceladoEm: new Date(),
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      // checkout.session.completed já trata a criação inicial — evitar email duplo
      if (obj.billing_reason === 'subscription_create') break;
      const assinatura = await prisma.assinatura.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (!assinatura) break;
      const usuario = await prisma.usuario.findFirst({
        where: { empresaId: assinatura.empresaId, papel: 'dono' },
        select: { nome: true, email: true },
      });
      if (usuario?.email) {
        const currency = (obj.currency ?? 'BRL').toUpperCase();
        const valorFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(
          (obj.amount_paid ?? 0) / 100
        );
        enviarEmailRecibo(usuario, valorFmt, 'AdmAi Pro').catch(() => {});
      }
      break;
    }

    case 'invoice.payment_failed': {
      const assinatura = await prisma.assinatura.findFirst({ where: { stripeCustomerId: obj.customer } });
      if (!assinatura) break;
      await sincronizarAssinatura(assinatura.empresaId, { status: 'past_due' });
      const usuario = await prisma.usuario.findFirst({
        where: { empresaId: assinatura.empresaId, papel: 'dono' },
        select: { nome: true, email: true },
      });
      if (usuario?.email) {
        enviarEmailFalhaPagamento(usuario).catch(() => {});
      }
      break;
    }

    default:
      logger.debug('stripe_evento_ignorado', { tipo: evento.type });
  }
}
