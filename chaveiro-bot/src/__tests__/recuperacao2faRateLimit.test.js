import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

/**
 * Trava o comportamento EMERGENTE (nunca decidido explicitamente em código,
 * nem testado antes) de que `POST /api/auth/login/2fa/recuperar` herda
 * `twoFactorLimiter` por PREFIX MATCH do Express: `app.use('/api/auth/login/2fa',
 * twoFactorLimiter)` (src/app.js) bate com qualquer path que comece com esse
 * prefixo, incluindo `/api/auth/login/2fa/recuperar` — não só
 * `/api/auth/login/2fa` e `/api/auth/login/2fa-telefone`, os dois casos óbvios.
 *
 * Isso cancela a necessidade de T-REC-02 (que propunha adicionar um rate
 * limit dedicado à rota de recuperação): a proteção já existe. Este teste
 * prova empiricamente a herança batendo na rota repetidas vezes com o MESMO
 * `desafio` (mesmo inválido — twoFactorLimiter roda ANTES da validação do
 * desafio pelo handler, então nem precisa de um desafio real nem de banco de
 * dados) até estourar o limite de 5/15min e observar a resposta virar 429.
 * Se um dia alguém remontar esses limiters e a herança por prefixo deixar de
 * cobrir `/recuperar`, este teste quebra.
 *
 * Usa o app Express REAL (`criarApp()`), não uma reimplementação da rota.
 * O `RedisStore` é substituído por um fake em memória com a mesma interface
 * (`init`/`increment`/`decrement`/`resetKey`) — mesmo padrão usado em
 * `src/middlewares/__tests__/rateLimiters.test.js` — para não depender de um
 * Redis real nesta suíte unitária. Um `desafio` inválido nunca chega a tocar
 * o Prisma (o handler responde 401 assim que `verificarDesafio2fa` lança),
 * então também não depende de Postgres.
 *
 * EV-070: o MESMO prefix-match que herda `twoFactorLimiter` (`/api/auth/login/2fa`,
 * linha acima) também herda `authIpLimiter`+`authLimiter` (`app.use('/api/auth/login',
 * authIpLimiter, authLimiter)`, mais cedo em `app.js`, ANTES de `twoFactorLimiter` na
 * cadeia) — `/api/auth/login/2fa/recuperar` começa com `/api/auth/login`. Antes da
 * correção do EV-070, `authLimiter` tinha um bug que fazia sua chave de fallback (por
 * IP) nunca colidir de verdade entre requisições (usava o objeto `req` inteiro como
 * chave, então cada requisição virava uma chave "nova" por identidade de objeto) — na
 * prática, `authLimiter` NUNCA bloqueava nada nesta rota, mesmo estando montado. Depois
 * da correção, a chave é o IP de verdade, e `authLimiter` (teto 5/15min, ANTES de
 * `twoFactorLimiter` na cadeia) passa a bloquear primeiro quando as requisições vêm do
 * MESMO IP — os testes abaixo variam o IP simulado (`X-Forwarded-For`) entre tentativas
 * quando o objetivo é isolar o comportamento de `twoFactorLimiter` (por `desafio`, não
 * por IP) do de `authLimiter` (por IP, agora corretamente ativo nesta rota também).
 */
const storeState = vi.hoisted(() => ({ hits: new Map() }));
vi.mock('rate-limit-redis', () => {
  class FakeRedisStore {
    init(options) {
      this.windowMs = options.windowMs;
    }
    async increment(key) {
      const total = (storeState.hits.get(key) ?? 0) + 1;
      storeState.hits.set(key, total);
      return { totalHits: total, resetTime: new Date(Date.now() + (this.windowMs ?? 0)) };
    }
    async decrement(key) {
      const total = Math.max(0, (storeState.hits.get(key) ?? 0) - 1);
      storeState.hits.set(key, total);
    }
    async resetKey(key) {
      storeState.hits.delete(key);
    }
  }
  return { RedisStore: FakeRedisStore, default: FakeRedisStore };
});

const { criarApp } = await import('../app.js');

describe('POST /api/auth/login/2fa/recuperar herda twoFactorLimiter (5/15min) via prefix match — cancela T-REC-02', () => {
  it('as 5 primeiras tentativas com o mesmo desafio respondem normalmente (401, desafio inválido); a 6ª estoura em 429', async () => {
    storeState.hits.clear();
    const { app } = criarApp();

    const desafioFixo = 'desafio-fixo-para-provar-o-rate-limit-herdado';
    const respostas = [];
    // Sequencial de propósito: cada requisição precisa observar o contador já
    // incrementado pela anterior (mesma chave: o próprio `desafio`, ver
    // `keyGenerator` de `twoFactorLimiter` em src/app.js). IP simulado DIFERENTE a
    // cada tentativa (EV-070) — isola o teto de `twoFactorLimiter` (por `desafio`)
    // do de `authLimiter` (por IP, herdado pelo mesmo prefix-match, teto também 5).
    for (let i = 0; i < 6; i += 1) {
      respostas.push(
        await request(app)
          .post('/api/auth/login/2fa/recuperar')
          .set('X-Forwarded-For', `203.0.113.${i}, 10.0.0.1`)
          .send({ desafio: desafioFixo, codigo: 'QUALQUERCODIGO' })
      );
    }

    // As 5 primeiras (limit: 5) chegam até o handler normalmente: desafio
    // inválido (não é um JWT real) → 401, ANTES de qualquer acesso ao banco.
    for (let i = 0; i < 5; i += 1) {
      expect(respostas[i].status, `tentativa ${i + 1}`).toBe(401);
    }

    // A 6ª nem chega ao handler — barrada por twoFactorLimiter.
    expect(respostas[5].status).toBe(429);
    expect(respostas[5].body).toEqual({
      erro: 'Muitas tentativas de verificação. Reinicie o login e tente de novo.',
    });
  });

  it('um desafio DIFERENTE não é afetado pelo teto do primeiro (chave é o desafio, não o IP)', async () => {
    storeState.hits.clear();
    const { app } = criarApp();

    // Sequencial de propósito (ver comentário do teste anterior); IP simulado
    // DIFERENTE a cada tentativa pelo mesmo motivo (isolar de `authLimiter`, EV-070).
    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/auth/login/2fa/recuperar')
        .set('X-Forwarded-For', `198.51.100.${i}, 10.0.0.1`)
        .send({ desafio: 'desafio-A-esgotado', codigo: 'X' });
    }

    const outroDesafio = await request(app)
      .post('/api/auth/login/2fa/recuperar')
      .set('X-Forwarded-For', '198.51.100.99, 10.0.0.1')
      .send({ desafio: 'desafio-B-nunca-usado', codigo: 'X' });

    expect(outroDesafio.status).toBe(401);
  });

  it('EV-070: authLimiter (herdado pelo mesmo prefix-match) agora bloqueia por IP de verdade nesta rota', async () => {
    // Antes da correção do EV-070, authLimiter estava montado aqui (mesmo prefix-match
    // de /api/auth/login) mas sua chave de fallback por IP nunca colidia de verdade —
    // na prática nunca bloqueava nada. Este teste tranca o comportamento CORRIGIDO:
    // do MESMO IP, variando o desafio a cada tentativa (twoFactorLimiter não deveria
    // bloquear, chave diferente a cada vez), authLimiter (teto 5/15min por IP) bloqueia
    // mesmo assim, porque agora conta o IP de verdade.
    storeState.hits.clear();
    const { app } = criarApp();

    const respostas = [];
    for (let i = 0; i < 6; i += 1) {
      respostas.push(
        await request(app)
          .post('/api/auth/login/2fa/recuperar')
          .set('X-Forwarded-For', '203.0.113.55, 10.0.0.1')
          .send({ desafio: `desafio-diferente-${i}`, codigo: 'X' })
      );
    }

    for (let i = 0; i < 5; i += 1) {
      expect(respostas[i].status, `tentativa ${i + 1}`).toBe(401);
    }
    expect(respostas[5].status).toBe(429);
    expect(respostas[5].body).toEqual({
      erro: 'Muitas tentativas. Tente novamente em 15 minutos.',
    });
  });
});
