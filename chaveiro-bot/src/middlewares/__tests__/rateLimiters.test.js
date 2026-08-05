import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * EV-057 — testa a INSTANCIAÇÃO REAL de um limiter (este arquivo, antes,
 * só testava a função pura `identidadeDaRequisicao`, nunca um limiter
 * rodando de verdade). Substitui o `RedisStore` real por um store em
 * memória com a MESMA interface (`init`/`increment`/`decrement`/
 * `resetKey`) esperada por `express-rate-limit`, para não depender de um
 * Redis real nesta suíte unitária — mesmo espírito do fake de `ioredis`
 * usado em `src/services/__tests__/idempotencia.test.js`.
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

const {
  identidadeDaRequisicao,
  normalizarCaminho,
  authLimiter,
  authIpLimiter,
  cadastroLimiter,
  totpAtivarLimiter,
  totpDesativarLimiter,
} = await import('../rateLimiters.js');
const { default: authRouter } = await import('../../routes/auth.js');

/**
 * C2 — a chave do rate limit de login (+ achados da revisão de aprovação do
 * Gate 2, thread Codex `019fbfe8`).
 *
 * `authLimiter` é UM SÓ, compartilhado por 5 rotas com schemas Zod diferentes
 * (login, register, recuperar-senha, redefinir-senha, magic-link — F4). Uma
 * ordem de precedência ÚNICA e global nunca é suficiente: qualquer campo que
 * vença sempre é explorável em alguma rota que não o usa de verdade. Ex.: se
 * `usuarioId` sempre vencesse, um atacante mandaria o e-mail FIXO da vítima em
 * `/auth/recuperar-senha` com um `usuarioId` FALSO e diferente a cada
 * tentativa — o Zod do handler (`z.object({ email })`, sem `.strict()`) ignora
 * silenciosamente o campo que não declara, processa pelo e-mail mesmo assim,
 * mas a chave do limiter muda a cada request e o teto de 5/15min nunca é
 * atingido. O rate limiter roda ANTES da validação Zod da rota, então
 * `req.body` aqui ainda carrega qualquer campo extra que o cliente mandar.
 *
 * A correção: `identidadeDaRequisicao` só considera os campos que são a
 * identidade REAL da rota atual, decidido por `req.originalUrl` (estável
 * mesmo com roteadores aninhados). Por isso, nestes testes, cada chamada
 * simula `originalUrl` — sem isso a função não reconhece nenhuma rota e cai
 * sempre em `null` (comportamento seguro por padrão, testado explicitamente
 * abaixo).
 */
describe('identidadeDaRequisicao', () => {
  const LOGIN = '/api/auth/login';
  const REGISTER = '/api/auth/register';
  const RECUPERAR_SENHA = '/api/auth/recuperar-senha';
  const REDEFINIR_SENHA = '/api/auth/redefinir-senha';
  const MAGIC_LINK = '/api/auth/magic-link';

  describe('/auth/login — usuarioId, username, telefone (sem email, o schema não tem esse campo)', () => {
    it('extrai username, telefone e usuarioId', () => {
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { username: 'joao' } })).toBe(
        'u:joao'
      );
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { usuarioId: 42 } })).toBe('i:42');
      expect(
        identidadeDaRequisicao({ originalUrl: LOGIN, body: { telefone: '5511994089030' } })
      ).toMatch(/^t:5511/);
    });

    it('colapsa as variantes de 9o digito do MESMO numero na mesma chave', () => {
      const com9 = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { telefone: '5511994089030' },
      });
      const sem9 = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { telefone: '551194089030' },
      });
      expect(com9).toBe(sem9);
    });

    it('ignora formatacao do telefone', () => {
      const cru = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { telefone: '5511994089030' },
      });
      expect(
        identidadeDaRequisicao({ originalUrl: LOGIN, body: { telefone: '+55 (11) 99408-9030' } })
      ).toBe(cru);
    });

    it('normaliza caixa e espaco no username', () => {
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { username: '  JOAO  ' } })).toBe(
        'u:joao'
      );
    });

    it('prefixo por tipo evita colisao entre username "42" e usuarioId 42', () => {
      const porNome = identidadeDaRequisicao({ originalUrl: LOGIN, body: { username: '42' } });
      const porId = identidadeDaRequisicao({ originalUrl: LOGIN, body: { usuarioId: 42 } });
      expect(porNome).not.toBe(porId);
    });

    it('devolve null quando nao ha identidade (cai para IP no limiter)', () => {
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: {} })).toBeNull();
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { username: '   ' } })).toBeNull();
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { usuarioId: '' } })).toBeNull();
    });

    it('reconhece a rota mesmo com barra final — Express roteia "/login/" pro mesmo handler', () => {
      // Achado do Codex (thread 019fbfe8): Express (roteamento nao-estrito, o
      // padrao) trata "/api/auth/login" e "/api/auth/login/" como a MESMA rota,
      // mas req.originalUrl preserva a barra final tal como o cliente mandou —
      // sem normalizar aqui, essa requisicao legitima cairia sempre no IP.
      expect(identidadeDaRequisicao({ originalUrl: `${LOGIN}/`, body: { usuarioId: 42 } })).toBe(
        'i:42'
      );
    });

    it('reconhece a rota mesmo em maiusculas — Express roteia sem diferenciar caixa', () => {
      // Achado do Codex (thread 019fbfe8): "/API/AUTH/LOGIN" chega no mesmo
      // handler de "/api/auth/login", mas req.originalUrl preserva a caixa
      // exata que o cliente mandou.
      expect(
        identidadeDaRequisicao({ originalUrl: '/API/AUTH/LOGIN', body: { usuarioId: 42 } })
      ).toBe('i:42');
    });

    it('username tem precedencia sobre telefone quando ambos vem', () => {
      expect(
        identidadeDaRequisicao({
          originalUrl: LOGIN,
          body: { username: 'joao', telefone: '5511999999999' },
        })
      ).toBe('u:joao');
    });

    it('usuarioId tem precedencia sobre username e telefone, espelhando routes/auth.js /auth/login', () => {
      // O handler de login resolve a conta por usuarioId quando presente, ignorando
      // username/telefone. Se a chave do limiter nao seguisse a mesma ordem, um
      // atacante mandaria o usuarioId fixo da vitima com um username diferente a
      // cada tentativa: o handler sempre ataca a mesma conta, mas a chave do
      // limiter mudaria a cada request, zerando o teto de 5/15min por identidade.
      expect(
        identidadeDaRequisicao({
          originalUrl: LOGIN,
          body: { usuarioId: 42, username: 'joao', telefone: '5511999999999' },
        })
      ).toBe('i:42');
    });

    it('usuarioId fixo com username variavel colapsa na MESMA chave (nao evade o limite)', () => {
      const tentativa1 = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { usuarioId: 42, username: 'aleatorio1' },
      });
      const tentativa2 = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { usuarioId: 42, username: 'aleatorio2' },
      });
      expect(tentativa1).toBe(tentativa2);
      expect(tentativa1).toBe('i:42');
    });

    it('email injetado no corpo e IGNORADO — /auth/login nao tem esse campo no schema', () => {
      // Achado do Codex (thread 019fbfe8): antes desta correcao, um "email" no
      // corpo de /auth/login virava a chave do limiter (o handler real ignora
      // esse campo via Zod, entao o atacante podia variar email e nunca repetir
      // chave, mesmo mirando sempre o mesmo telefone/usuarioId real).
      const semEmail = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { telefone: '5511999999999' },
      });
      const comEmailFalso = identidadeDaRequisicao({
        originalUrl: LOGIN,
        body: { telefone: '5511999999999', email: 'qualquer@x.com' },
      });
      expect(comEmailFalso).toBe(semEmail);
      expect(comEmailFalso).toMatch(/^t:/);
    });

    it('so email no corpo (sem usuarioId/username/telefone) devolve null — nao vira chave em /auth/login', () => {
      expect(identidadeDaRequisicao({ originalUrl: LOGIN, body: { email: 'x@x.com' } })).toBeNull();
    });
  });

  describe('/auth/register — username, telefone, email', () => {
    it('usa o username, que o schema sempre exige', () => {
      expect(
        identidadeDaRequisicao({
          originalUrl: REGISTER,
          body: { username: 'joao', email: 'joao@x.com', telefone: '5511999999999' },
        })
      ).toBe('u:joao');
    });
  });

  describe('/auth/recuperar-senha e /auth/magic-link — SÓ email (schema não tem outro campo)', () => {
    it.each([RECUPERAR_SENHA, MAGIC_LINK])('%s usa o email como chave', (rota) => {
      expect(identidadeDaRequisicao({ originalUrl: rota, body: { email: 'A@B.com' } })).toBe(
        'e:a@b.com'
      );
    });

    it.each([RECUPERAR_SENHA, MAGIC_LINK])(
      '%s: usuarioId/username/telefone injetados sao IGNORADOS — só email é identidade real aqui',
      (rota) => {
        // Achado do Codex (thread 019fbfe8): antes desta correção, um atacante
        // mantinha o email FIXO da vítima e variava usuarioId/username/telefone
        // (campos que o handler de recuperar-senha/magic-link nem olha) pra
        // nunca repetir a chave do limiter, driblando o teto de 5/15min.
        const semExtra = identidadeDaRequisicao({ originalUrl: rota, body: { email: 'v@x.com' } });
        const comUsuarioIdFalso = identidadeDaRequisicao({
          originalUrl: rota,
          body: { email: 'v@x.com', usuarioId: 999 },
        });
        const comUsernameFalso = identidadeDaRequisicao({
          originalUrl: rota,
          body: { email: 'v@x.com', username: 'aleatorio' },
        });
        const comTelefoneFalso = identidadeDaRequisicao({
          originalUrl: rota,
          body: { email: 'v@x.com', telefone: '5511988887777' },
        });
        expect(comUsuarioIdFalso).toBe(semExtra);
        expect(comUsernameFalso).toBe(semExtra);
        expect(comTelefoneFalso).toBe(semExtra);
        expect(semExtra).toBe('e:v@x.com');
      }
    );
  });

  describe('/auth/redefinir-senha — identidade real é o token, não extraído aqui: sempre cai pro IP', () => {
    it('devolve null mesmo com usuarioId/username/telefone/email no corpo', () => {
      expect(
        identidadeDaRequisicao({
          originalUrl: REDEFINIR_SENHA,
          body: {
            usuarioId: 1,
            username: 'x',
            telefone: '5511999999999',
            email: 'x@x.com',
            token: 'abc',
          },
        })
      ).toBeNull();
    });
  });

  describe('rota desconhecida ou ausente — seguro por padrão (nenhum campo é considerado)', () => {
    it('devolve null para uma rota fora do mapa, mesmo com campos válidos no corpo', () => {
      expect(
        identidadeDaRequisicao({
          originalUrl: '/api/rota/nao-mapeada',
          body: { usuarioId: 1, username: 'joao', telefone: '5511999999999', email: 'x@x.com' },
        })
      ).toBeNull();
    });

    it('devolve null quando não há originalUrl nem path', () => {
      expect(identidadeDaRequisicao({ body: { username: 'joao' } })).toBeNull();
      expect(identidadeDaRequisicao({})).toBeNull();
    });
  });
});

// EV-067, Gate 6 (revisão adversarial da própria correção, 2 rodadas) — a chave de
// `totpContaLimiter` usa `normalizarCaminho(req)`. A 1ª rodada achou que caixa/barra
// final não eram normalizadas; corrigido. A 2ª rodada, sobre a correção já aplicada,
// achou 2 vetores novos que a normalização original (só toLowerCase + barra final)
// não cobria: barra dupla interna (`/api//me/2fa/desativar`, teto 2x) e fragmento de
// URL cru preservado em `req.originalUrl` por clientes HTTP de baixo nível
// (`/me/2fa/desativar#qualquercoisa`, teto ILIMITADO — cada fragmento distinto abria
// um balde novo). Ambos fechados: `normalizarCaminho` agora também corta tudo a
// partir de `#` e colapsa barras repetidas antes de comparar.
describe('normalizarCaminho (EV-067, Gate 6 — 2 rodadas de revisão adversarial)', () => {
  const BASE = '/api/me/2fa/desativar';

  it('caixa e barra final (achado da 1ª rodada) normalizam para o mesmo caminho', () => {
    expect(normalizarCaminho({ originalUrl: BASE })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: '/API/ME/2FA/DESATIVAR' })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: `${BASE}/` })).toBe(BASE);
  });

  it('barra dupla interna (achado da 2ª rodada, vetor A) normaliza para o mesmo caminho', () => {
    expect(normalizarCaminho({ originalUrl: '/api//me/2fa/desativar' })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: '/api///me/2fa/desativar' })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: '//api//me//2fa//desativar//' })).toBe(BASE);
  });

  it('fragmento de URL cru (achado da 2ª rodada, vetor B) é descartado, não vira balde novo', () => {
    expect(normalizarCaminho({ originalUrl: `${BASE}#a` })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: `${BASE}#b` })).toBe(BASE);
    expect(normalizarCaminho({ originalUrl: `${BASE}#${Math.random()}` })).toBe(BASE);
  });

  it('combinação de todos os vetores ao mesmo tempo ainda normaliza igual', () => {
    expect(normalizarCaminho({ originalUrl: '/API//ME/2fa//Desativar/#xyz?ignorado=1' })).toBe(
      BASE
    );
  });

  it('query string continua sendo removida (comportamento pré-existente, não regrediu)', () => {
    expect(normalizarCaminho({ originalUrl: `${BASE}?codigo=123456` })).toBe(BASE);
  });
});

// F4: authLimiter era definido DUAS VEZES — uma em app.js (Redis) e outra, separada, em
// routes/auth.js (sem RedisStore, cai no MemoryStore padrão). Este teste prova que
// routes/auth.js reaproveita a MESMA instância exportada por rateLimiters.js
// (identidade de referência), não uma segunda instância independente.
function encontrarCamada(router, path, method) {
  return router.stack.find(
    (camada) =>
      camada.route?.path === path && Object.keys(camada.route?.methods ?? {}).includes(method)
  );
}

describe('rateLimiters (F4 — dedup do authLimiter)', () => {
  it.each([
    ['/auth/recuperar-senha', 'post'],
    ['/auth/redefinir-senha', 'post'],
    ['/auth/magic-link', 'post'],
  ])('%s usa a MESMA instância de authLimiter (não uma cópia em MemoryStore)', (path, method) => {
    const camada = encontrarCamada(authRouter, path, method);
    expect(camada, `rota ${method} ${path} não encontrada`).toBeTruthy();
    // O stack da rota inclui [authLimiter, handler] — o authLimiter deve ser
    // referência-idêntica ao exportado por rateLimiters.js (mesma instância/estado Redis).
    const temAuthLimiter = camada.route.stack.some((s) => s.handle === authLimiter);
    expect(temAuthLimiter).toBe(true);
  });
});

/**
 * EV-057 — cadastroLimiter conta TODA tentativa, sucesso incluso. Diferente
 * de authLimiter/authIpLimiter (skipSuccessfulRequests: true), que nunca
 * contavam um cadastro bem-sucedido pro teto, permitindo abuso de trial via
 * criação ilimitada de empresas. Monta um app Express mínimo, real, com
 * cadastroLimiter e uma rota que SEMPRE responde 200, e prova que mesmo só
 * com respostas de sucesso o teto de 30/15min é atingido (429).
 */
describe('cadastroLimiter (EV-057 — conta sucesso, não só falha)', () => {
  it('estoura o limite (429) mesmo quando toda requisição responde 200', async () => {
    storeState.hits.clear();
    const app = express();
    app.post('/cadastro-teste', cadastroLimiter, (req, res) => res.status(200).json({ ok: true }));

    const respostas = [];
    // Sequencial de propósito: cada requisição precisa observar o contador já
    // incrementado pela anterior.
    for (let i = 0; i < 31; i += 1) {
      respostas.push(await request(app).post('/cadastro-teste'));
    }

    const sucessos = respostas.filter((r) => r.status === 200);
    const bloqueadas = respostas.filter((r) => r.status === 429);

    // As 30 primeiras (limit: 30) respondem 200 — todas de sucesso, provando
    // que cadastroLimiter (ao contrário de authLimiter/authIpLimiter) NÃO
    // ignora requisições bem-sucedidas na contagem.
    expect(sucessos).toHaveLength(30);
    expect(bloqueadas).toHaveLength(1);
    expect(respostas[30].status).toBe(429);
    expect(respostas[30].body).toEqual({
      erro: 'Muitos cadastros a partir desta origem. Tente novamente em 15 minutos.',
    });
  });
});

/**
 * EV-067, Gate 6 (3ª rodada de revisão adversarial) — as 2 primeiras rodadas fecharam
 * caixa/barra final/barra dupla/fragmento normalizando `req.originalUrl`. A 3ª achou
 * que isso ainda era insuficiente: um request-target em FORMA ABSOLUTA do HTTP/1.1
 * (`POST http://<host arbitrário>/api/me/2fa/ativar HTTP/1.1`, legal pela RFC 7230) faz
 * o Express rotear certo (`req.path` limpo) mas `req.originalUrl` preserva o prefixo
 * `scheme://host` inteiro, escolhido livremente pelo atacante — nenhuma normalização de
 * string cobre um prefixo arbitrário. A correção final abandona `req.originalUrl` por
 * completo nesta chave: `criarTotpContaLimiter` usa um RÓTULO FIXO por rota, decidido em
 * tempo de definição, não em nenhuma leitura da requisição. Este teste simula o ataque
 * diretamente — um middleware antes do limiter reescreve `req.originalUrl` a cada
 * tentativa, como um request-target absoluto com host diferente faria — e prova que o
 * bloqueio de 429 acontece do mesmo jeito, porque a chave não lê mais esse campo.
 */
describe('totpAtivarLimiter / totpDesativarLimiter (EV-067, Gate 6 — 3ª rodada)', () => {
  it('bloqueia com 429 mesmo variando req.originalUrl a cada tentativa (simula request-target absoluto)', async () => {
    storeState.hits.clear();
    const app = express();
    app.use((req, res, next) => {
      req.user = { id: 777 };
      next();
    });
    app.post(
      '/me/2fa/desativar',
      (req, res, next) => {
        // Simula o que um request-target HTTP/1.1 em forma absoluta produziria em
        // req.originalUrl (prefixo scheme://host arbitrário, escolhido pelo atacante) —
        // sem tocar req.path, que é o que o Express usa pra rotear de verdade.
        req.originalUrl = `http://attacker-${Math.random()}.example${req.originalUrl}`;
        next();
      },
      totpDesativarLimiter,
      (req, res) => res.status(200).json({ ok: true })
    );

    const respostas = [];
    for (let i = 0; i < 6; i += 1) {
      respostas.push(await request(app).post('/me/2fa/desativar'));
    }

    const sucessos = respostas.filter((r) => r.status === 200);
    const bloqueadas = respostas.filter((r) => r.status === 429);
    expect(sucessos).toHaveLength(5);
    expect(bloqueadas).toHaveLength(1);
    expect(respostas[5].status).toBe(429);
  });

  it('ativar e desativar continuam com teto independente mesmo com req.originalUrl variando', async () => {
    storeState.hits.clear();
    const app = express();
    app.use((req, res, next) => {
      req.user = { id: 888 };
      next();
    });
    const reescreverUrl = (req, res, next) => {
      req.originalUrl = `http://attacker-${Math.random()}.example${req.originalUrl}`;
      next();
    };
    app.post('/me/2fa/ativar', reescreverUrl, totpAtivarLimiter, (req, res) =>
      res.status(200).json({ ok: true })
    );
    app.post('/me/2fa/desativar', reescreverUrl, totpDesativarLimiter, (req, res) =>
      res.status(200).json({ ok: true })
    );

    // Esgota o teto de ativar (5).
    for (let i = 0; i < 5; i += 1) {
      const r = await request(app).post('/me/2fa/ativar');
      expect(r.status).toBe(200);
    }
    const ativarBloqueado = await request(app).post('/me/2fa/ativar');
    expect(ativarBloqueado.status).toBe(429);

    // Desativar, mesmo usuário, continua com balde próprio intacto.
    const desativarOk = await request(app).post('/me/2fa/desativar');
    expect(desativarOk.status).toBe(200);
  });
});

/**
 * EV-070 — descoberto como efeito colateral da missão "EV-069" (investigação de um CVE
 * em `ip-address`, dependência de `express-rate-limit`): `ipKeyGenerator`, exportado por
 * `express-rate-limit`, tem assinatura `ipKeyGenerator(ip: string, ipv6Subnet?)` — espera
 * uma STRING de IP, normalmente `req.ip` (documentado no próprio `.d.ts` do pacote,
 * `node_modules/express-rate-limit/dist/index.d.cts:9`: "return ipKeyGenerator(req.ip)
 * rather than just req.ip"). Mas `authIpLimiter` e `cadastroLimiter` chamavam
 * `ipKeyGenerator(req, res)` — passando o objeto `req` INTEIRO. Como `net.isIPv6(req)` é
 * sempre `false` pra um objeto, a função cai direto em `return ip` (o próprio `req`), que
 * vira a string constante `"[object Object]"` quando interpolada — MESMA chave pra
 * QUALQUER IP. Confirmado com a aplicação real, rotas reais, requisições HTTP reais
 * (`criarApp()` + `supertest`, ver `EV070_VALIDATION_AND_REMEDIATION_REPORT.md`, Gate 4):
 * `authIpLimiter`/`cadastroLimiter` produziam 1 única chave compartilhada por TODOS os
 * IPs, enquanto o limiter geral de `/api` (que usa o `keyGenerator` padrão da própria
 * biblioteca, `ipKeyGenerator(request.ip, subnet)`, correto) produzia uma chave por IP no
 * MESMO teste. Gate 6 quantificou o impacto: um usuário legítimo que nunca fez nenhuma
 * requisição recebia `429` na primeira tentativa de cadastro, só porque outro IP não
 * relacionado tinha esgotado o teto — nega serviço entre usuários sem nenhuma relação,
 * e reduz a eficácia do EV-057 (`cadastroLimiter`) de "30 tentativas por IP" pra "30
 * tentativas para a aplicação inteira, compartilhadas por todos os usuários".
 */
describe('authIpLimiter / cadastroLimiter (EV-070 — chave precisa ser por IP, não constante)', () => {
  it('authIpLimiter: 2 IPs diferentes usam baldes DIFERENTES (não colidem em "[object Object]")', async () => {
    storeState.hits.clear();
    const app = express();
    app.set('trust proxy', true);
    app.post('/auth-ip-teste', authIpLimiter, (req, res) => res.status(200).json({ ip: req.ip }));

    await request(app).post('/auth-ip-teste').set('X-Forwarded-For', '203.0.113.9');
    await request(app).post('/auth-ip-teste').set('X-Forwarded-For', '198.51.100.42');

    const chaves = [...storeState.hits.keys()];
    expect(chaves.some((k) => k.includes('[object Object]'))).toBe(false);
    expect(chaves).toHaveLength(2);
    expect(chaves.some((k) => k.includes('203.0.113.9'))).toBe(true);
    expect(chaves.some((k) => k.includes('198.51.100.42'))).toBe(true);
  });

  it('cadastroLimiter: 2 IPs diferentes usam baldes DIFERENTES (não colidem em "[object Object]")', async () => {
    storeState.hits.clear();
    const app = express();
    app.set('trust proxy', true);
    app.post('/cadastro-ip-teste', cadastroLimiter, (req, res) =>
      res.status(200).json({ ip: req.ip })
    );

    await request(app).post('/cadastro-ip-teste').set('X-Forwarded-For', '203.0.113.9');
    await request(app).post('/cadastro-ip-teste').set('X-Forwarded-For', '198.51.100.42');

    const chaves = [...storeState.hits.keys()];
    expect(chaves.some((k) => k.includes('[object Object]'))).toBe(false);
    expect(chaves).toHaveLength(2);
  });

  it('cadastroLimiter: esgotar o teto num IP NÃO bloqueia um IP diferente (fecha o DoS entre usuários)', async () => {
    storeState.hits.clear();
    const app = express();
    app.set('trust proxy', true);
    app.post('/cadastro-dos-teste', cadastroLimiter, (req, res) =>
      res.status(200).json({ ok: true })
    );

    for (let i = 0; i < 30; i += 1) {
      await request(app).post('/cadastro-dos-teste').set('X-Forwarded-For', '203.0.113.9');
    }
    const bloqueadoMesmoIp = await request(app)
      .post('/cadastro-dos-teste')
      .set('X-Forwarded-For', '203.0.113.9');
    expect(bloqueadoMesmoIp.status).toBe(429);

    // Usuário legítimo, IP totalmente diferente, primeira requisição — não pode ser afetado.
    const legitimoOutroIp = await request(app)
      .post('/cadastro-dos-teste')
      .set('X-Forwarded-For', '198.51.100.42');
    expect(legitimoOutroIp.status).toBe(200);
  });
});
