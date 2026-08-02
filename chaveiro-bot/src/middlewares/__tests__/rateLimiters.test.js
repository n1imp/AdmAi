import { describe, it, expect } from 'vitest';
import { identidadeDaRequisicao, authLimiter } from '../rateLimiters.js';
import authRouter from '../../routes/auth.js';

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
