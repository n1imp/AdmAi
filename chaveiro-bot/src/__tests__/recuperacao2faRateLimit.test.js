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
 * HISTÓRICO DOS MOUNTS [REVISOR 01a03bb9 DELTA achado 2 — doc atualizada]:
 * EV-070 corrigiu a chave por-IP do `authLimiter` numa época em que
 * `app.use('/api/auth/login', ...)` alcançava as subrotas 2FA por prefix-match.
 * A decisão POSTERIOR D-FE-STRUCT-LIMITER-2FA (Codex 01a0346e; app.js:131-141)
 * trocou o mount para `app.post('/api/auth/login')` EXATO — hoje o `authLimiter`
 * NÃO alcança `/api/auth/login/2fa/recuperar`; a rota fica só com o
 * `twoFactorLimiter` (chave = `desafio`, herdado por `app.use('/api/auth/login/2fa')`)
 * e o limiter global de /api. A variação de `X-Forwarded-For` nos testes 1-2 é
 * herança do desenho antigo e permanece INÓCUA (nenhum limiter por IP atua aqui);
 * o teste 3 tranca exatamente essa ausência (anti cross-flow lockout).
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

/* [REVISOR 01a03bb9 achado 6] Cabeçalho atualizado ao mount VIGENTE: o twoFactorLimiter
   é herdado pelo prefix de app.use('/api/auth/login/2fa', ...) — que casa /recuperar —,
   enquanto o authLimiter fica em app.post('/api/auth/login') EXATO e NÃO alcança as
   subrotas 2FA (D-FE-STRUCT-LIMITER-2FA). */
describe('POST /api/auth/login/2fa/recuperar: twoFactorLimiter (5/15min) via prefixo /2fa; authLimiter NÃO alcança (mount exato)', () => {
  it('as 5 primeiras tentativas com o mesmo desafio respondem normalmente (401, desafio inválido); a 6ª estoura em 429', async () => {
    storeState.hits.clear();
    const { app } = criarApp();

    const desafioFixo = 'desafio-fixo-para-provar-o-rate-limit-herdado';
    const respostas = [];
    // Sequencial de propósito: cada requisição precisa observar o contador já
    // incrementado pela anterior (mesma chave: o próprio `desafio`, ver
    // `keyGenerator` de `twoFactorLimiter` em src/app.js). A variação do IP
    // simulado é herança do desenho antigo (quando o authLimiter alcançava a
    // rota) e hoje é INÓCUA — mantida por não custar nada (ver cabeçalho).
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

    // Sequencial de propósito (ver comentário do teste anterior); a variação do IP
    // é herança inócua do desenho antigo — o authLimiter NÃO alcança esta rota
    // (mount exato; ver cabeçalho).
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

  it('D-FE-STRUCT-LIMITER-2FA: /2fa/recuperar NÃO herda mais o authLimiter — sem cross-flow lockout por IP', async () => {
    /* HISTÓRICO: este caso nasceu como "EV-070" assertando que o authLimiter, herdado
       pelo prefix-match de app.use('/api/auth/login'), bloqueava por IP nesta rota.
       A decisão POSTERIOR D-FE-STRUCT-LIMITER-2FA (Codex DECISOR thread 01a0346e,
       registrada em app.js:131-141) REMOVEU essa herança de propósito: o balde por IP
       de 5/15min compartilhado entre login e 2FA fazia a senha errada de UMA pessoa
       bloquear o 2FA do escritório inteiro atrás de um NAT (cross-flow lockout) —
       contra os dois designs documentados (twoFactorLimiter dedicado por DESAFIO;
       authIpLimiter "folgado de propósito"). O mount virou app.post EXATO em
       /api/auth/login, e as etapas 2FA ficam só com o twoFactorLimiter + limiter
       global de /api. Este teste agora TRANCA o comportamento decidido: mesmo IP,
       desafios variados ⇒ NENHUM 429 vindo do authLimiter nesta subrota. */
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

    // Todas chegam ao handler (401 = desafio inválido) — nunca o 429 do authLimiter,
    // cuja mensagem seria 'Muitas tentativas. Tente novamente em 15 minutos.'
    for (let i = 0; i < 6; i += 1) {
      expect(respostas[i].status, `tentativa ${i + 1}`).toBe(401);
    }
  });
});
