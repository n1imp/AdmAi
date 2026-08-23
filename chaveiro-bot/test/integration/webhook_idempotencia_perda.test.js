/**
 * Falha do handler NÃO pode descartar o evento — desmarcar-na-falha.  [FIX-IDEMP-PERDA]
 *
 * O MODO DE PERDA (achado 1 da revisão independente, thread 01a02cf7, consenso registrado):
 *   a chave de idempotência era marcada ANTES do processamento. Handler falhava; o provider
 *   reenviava (Stripe reenvia por dias; a fila do WhatsApp tem retry próprio); o reenvio caía em
 *   "duplicado" e o evento morria por 24h. A dedup virava descarte.
 *
 * O QUE ESTE ARQUIVO PROVA (testes obrigatórios do consenso), contra Redis REAL:
 *   Stripe — falha remove a chave, responde 500, e o reenvio PROCESSA de novo;
 *            sucesso mantém a chave e o reenvio é descartado como duplicado;
 *   WhatsApp — falha pós-marca desmarca e relança (a fila retenta um handler de verdade);
 *              sucesso mantém a dedup;
 *   Timeout — com Redis inalcançável, marcarSeNovo resolve fail-open DENTRO de teto conhecido
 *             (sem teto, "fail-open" seria travamento com outro nome);
 *   Namespaces stripe:/wa: permanecem isolados.
 *
 * Assinatura Stripe REAL (HMAC v1 com o secret de teste): o caminho exercitado é o webhook
 * inteiro, não um atalho por dentro.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

// Falha INJETADA NUMA COSTURA REAL do fluxo wa: carregarSessao é o primeiro passo pós-marca.
// O switch `__falharSessao` liga o modo de falha por teste; Redis e desmarcar são reais.
vi.mock('../../src/services/conversa.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    carregarSessao: vi.fn(async (...args) => {
      if (globalThis.__falharSessao) throw new Error('falha injetada pós-marca');
      return real.carregarSessao(...args);
    }),
  };
});

/* IMPORTS DINÂMICOS de propósito: import estático iça e `env.js` congelaria o ambiente ANTES
   destas linhas. O secret de webhook não está no .env.test (nenhum teste anterior exercitava a
   assinatura), e a chave sk_ falsa basta — constructEvent é HMAC puro, sem rede. */
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_teste_integracao';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_apenas_para_construir_o_cliente';

let app;
let prisma;
let limparBanco;
let rotearMensagemInbound;
let marcarSeNovo;

beforeAll(async () => {
  ({ limparBanco, prisma } = await import('./helpers.js'));
  ({ rotearMensagemInbound } = await import('../../src/services/inbound.js'));
  ({ marcarSeNovo } = await import('../../src/services/idempotencia.js'));
  const { criarApp } = await import('../../src/app.js');
  ({ app } = await criarApp());
  await limparBanco();
});

beforeEach(() => {
  globalThis.__falharSessao = false;
});

/** Cabeçalho stripe-signature válido para o corpo dado, no esquema t.v1 real. */
function assinar(corpo) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${corpo}`)
    .digest('hex');
  return `t=${t},v1=${v1}`;
}

function eventoStripe(id, type, objeto) {
  return JSON.stringify({ id, type, data: { object: objeto } });
}

const postStripe = (corpo) =>
  request(app)
    .post('/webhook/stripe')
    .set('stripe-signature', assinar(corpo))
    .set('content-type', 'application/json')
    .send(corpo);

describe('Stripe — desmarcar na falha', () => {
  it('handler falha → 500 → chave removida → o REENVIO processa (não cai em duplicado)', async () => {
    // checkout.session.completed apontando para uma EMPRESA INEXISTENTE: o upsert de
    // Assinatura estoura na FK (P2003) — falha REAL do handler, sem mock no caminho do billing.
    // (A primeira tentativa usou subscription.updated com subId desconhecido e NAO falhou:
    // aquele ramo e defensivo por desenho, `if (!assinatura) break`.)
    const id = `evt_falha_${Date.now()}`;
    const corpo = eventoStripe(id, 'checkout.session.completed', {
      mode: 'subscription',
      metadata: { empresaId: '999999999' },
      customer: 'cus_teste_falha',
      subscription: `sub_teste_falha_${Date.now()}`,
    });

    const primeira = await postStripe(corpo);
    expect(primeira.status).toBe(500);

    // A prova central: o reenvio NÃO é "duplicado" — a chave foi desmarcada e o handler roda de
    // novo (e falha de novo, com 500 — que é o que faz a Stripe continuar reenviando).
    const reenvio = await postStripe(corpo);
    expect(reenvio.status).toBe(500);
    expect(reenvio.body).not.toHaveProperty('duplicado');
  });

  it('sucesso mantém a chave: o reenvio é descartado como duplicado', async () => {
    // Evento de tipo não tratado cai no default (log + 200) — sucesso sem tocar banco.
    const id = `evt_ok_${Date.now()}`;
    const corpo = eventoStripe(id, 'evento.ignorado.teste', {});

    const primeira = await postStripe(corpo);
    expect(primeira.status).toBe(200);
    expect(primeira.body).toEqual({ recebido: true });

    const reenvio = await postStripe(corpo);
    expect(reenvio.status).toBe(200);
    expect(reenvio.body.duplicado).toBe(true);
  });
});

describe('WhatsApp — desmarcar na falha (retry da fila volta a executar)', () => {
  const evento = (id) => ({
    event: 'MESSAGES_UPSERT',
    data: {
      key: { remoteJid: '5511999990000@s.whatsapp.net', fromMe: false, id },
      message: { conversation: 'oi' },
    },
  });

  it('falha pós-marca relança E desmarca: a tentativa seguinte executa o handler', async () => {
    const id = `wamid_falha_${Date.now()}`;

    globalThis.__falharSessao = true;
    await expect(rotearMensagemInbound(evento(id))).rejects.toThrow('falha injetada');

    // Sem o desmarcar, esta segunda chamada devolveria { duplicado: true } SEM executar nada —
    // a fila retentaria um no-op. Com o fix, ela processa (a falha injetada prova a execução).
    await expect(rotearMensagemInbound(evento(id))).rejects.toThrow('falha injetada');

    // E quando o defeito transitório passa, a mesma mensagem finalmente é tratada.
    globalThis.__falharSessao = false;
    const r = await rotearMensagemInbound(evento(id));
    expect(r).not.toHaveProperty('duplicado');
  });

  it('sucesso mantém a dedup: reentrega é descartada', async () => {
    const id = `wamid_ok_${Date.now()}`;
    await rotearMensagemInbound(evento(id));
    const reentrega = await rotearMensagemInbound(evento(id));
    expect(reentrega.duplicado).toBe(true);
  });
});

describe('contratos do serviço', () => {
  it('namespaces stripe:/wa: são isolados — marcar um não deduplica o outro', async () => {
    const sufixo = `iso_${Date.now()}`;
    expect(await marcarSeNovo(`stripe:${sufixo}`, 60)).toBe(true);
    expect(await marcarSeNovo(`wa:${sufixo}`, 60)).toBe(true); // mesmo sufixo, chave distinta
    expect(await marcarSeNovo(`stripe:${sufixo}`, 60)).toBe(false);
  });

  it('TIMEOUT: com Redis inalcançável, marcarSeNovo resolve fail-open dentro do teto', async () => {
    // Processo filho com REDIS_URL de blackhole (TEST-NET-1, não roteável): o módulo real, o
    // caminho real. Sem os timeouts explícitos do cliente, isto PENDURAVA — e fail-open que
    // nunca resolve é travamento com outro nome (exigência do consenso).
    const inicio = Date.now();
    const saida = await new Promise((resolver, rejeitar) => {
      execFile(
        process.execPath,
        ['-e', `
          process.env.REDIS_URL = 'redis://192.0.2.1:6390';
          const { marcarSeNovo } = await import('./src/services/idempotencia.js');
          const r = await marcarSeNovo('timeout:teste', 60);
          console.log(JSON.stringify({ failOpen: r }));
          process.exit(0);
        `.replace(/^/, '(async()=>{').concat('})()')],
        { cwd: process.cwd(), timeout: 8000, env: { ...process.env, REDIS_URL: 'redis://192.0.2.1:6390' } },
        (erro, stdout) => (erro ? rejeitar(erro) : resolver(stdout))
      );
    });
    const duracao = Date.now() - inicio;
    // dotenv@17 imprime um banner no stdout do filho — o contrato é a ÚLTIMA linha JSON.
    const ultimaJson = saida.trim().split('\n').reverse().find((l) => l.trim().startsWith('{'));
    expect(JSON.parse(ultimaJson)).toEqual({ failOpen: true });
    expect(duracao).toBeLessThan(6000);
  });
});
