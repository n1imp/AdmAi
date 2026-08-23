/**
 * F4-07 — a ponta local do WhatsApp: o webhook global só aceita quem PROVA quem é.
 *
 * A ponta REAL (provider conectado, Evolution/Meta na rua) é BLOCKED_CAPABILITY e fica
 * explícita no gate. O que o ambiente local prova de verdade:
 *   - assinatura HMAC inválida/ausente → 401, e o evento NUNCA chega ao roteador;
 *   - HMAC correta do corpo cru → 200 e o inbound roda (mensagem de remetente
 *     desconhecido não explode: o roteamento por telefone responde e segue);
 *   - segredo não configurado → 401 fail-closed (não existe webhook "aberto por default").
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { limparBanco, prisma } from './helpers.js';

// Espião NA COSTURA REAL do webhook: mensagem validada vai para a FILA (o worker que a
// consome tem cobertura própria em inbound_*.test.js). O contrato DESTA rota é: HMAC válida
// → enfileirado; inválida → nem chega perto.
const roteadas = [];
vi.mock('../../src/queues/mensagens.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    filaMensagens: {
      add: vi.fn(async (_nome, evento) => {
        roteadas.push(evento?.data?.key?.id ?? 'sem-id');
      }),
    },
  };
});

let app;

beforeAll(async () => {
  ({ app } = await import('../../src/app.js').then((m) => m.criarApp()));
});

beforeEach(async () => {
  roteadas.length = 0;
  await limparBanco();
  await prisma.conexaoBot.upsert({
    where: { id: 1 },
    create: { id: 1, webhookSecret: 'segredo-de-teste-f4' },
    update: { webhookSecret: 'segredo-de-teste-f4' },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const evento = (id) =>
  JSON.stringify({
    event: 'MESSAGES_UPSERT',
    data: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id },
      message: { conversation: 'oi' },
    },
  });

const assinar = (corpo, segredo = 'segredo-de-teste-f4') =>
  createHmac('sha256', segredo).update(corpo).digest('hex');

const postar = (corpo, headers = {}) => {
  let r = request(app).post('/webhook/whatsapp').set('content-type', 'application/json');
  for (const [k, v] of Object.entries(headers)) r = r.set(k, v);
  return r.send(corpo);
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

describe('webhook global — HMAC', () => {
  it('sem assinatura: 401 e NADA chega ao roteador', async () => {
    const r = await postar(evento('wamid_sem_assinatura'));
    expect(r.status).toBe(401);
    await espera(150);
    expect(roteadas).toHaveLength(0);
  });

  it('assinatura de OUTRO segredo: 401 — corpo válido não compensa HMAC errada', async () => {
    const corpo = evento('wamid_hmac_errada');
    const r = await postar(corpo, { 'x-hub-signature-256': assinar(corpo, 'segredo-errado') });
    expect(r.status).toBe(401);
    await espera(150);
    expect(roteadas).toHaveLength(0);
  });

  it('assinatura do corpo ADULTERADO: 401 — a HMAC é do corpo cru, byte a byte', async () => {
    const original = evento('wamid_original');
    const adulterado = original.replace('oi', 'PIX pra mim');
    const r = await postar(adulterado, { 'x-hub-signature-256': assinar(original) });
    expect(r.status).toBe(401);
  });

  it('HMAC correta: 200 e o evento chega à FILA de inbound', async () => {
    const corpo = evento('wamid_valido');
    const r = await postar(corpo, { 'x-hub-signature-256': assinar(corpo) });
    expect(r.status).toBe(200);
    // O processamento é pós-resposta (fire-and-forget): espera curta por poll.
    for (let i = 0; i < 20 && roteadas.length === 0; i++) await espera(50);
    expect(roteadas).toContain('wamid_valido');
  });

  it('segredo não configurado: 401 fail-closed', async () => {
    await prisma.conexaoBot.update({ where: { id: 1 }, data: { webhookSecret: null } });
    const corpo = evento('wamid_sem_segredo');
    const r = await postar(corpo, { 'x-hub-signature-256': assinar(corpo) });
    expect(r.status).toBe(401);
  });
});
