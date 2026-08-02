import { describe, it, expect, beforeAll } from 'vitest';

// auth.js importa env (config/env.js), que exige JWT_SECRET >= 32 chars.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.API_TOKEN ??= 'test-token';
  process.env.JWT_SECRET ??= '0123456789012345678901234567890123';
  process.env.NODE_ENV = 'test';
});

const { gerarJWT, verificarJWT, tokenAindaValido, gerarDesafio2fa, verificarDesafio2fa } =
  await import('../auth.js');
const jwt = (await import('jsonwebtoken')).default;
const { env } = await import('../../config/env.js');

describe('gerarJWT / verificarJWT', () => {
  it('round-trip preserva os claims do usuário', () => {
    const token = gerarJWT({ id: 1, nome: 'Ana', admin: true, empresaId: 9 });
    const payload = verificarJWT(token);
    expect(payload).toMatchObject({ id: 1, nome: 'Ana', admin: true, empresaId: 9 });
    expect(payload.iat).toBeTypeOf('number');
  });

  it('rejeita token adulterado', () => {
    const token = gerarJWT({ id: 1, nome: 'Ana', admin: false, empresaId: 1 });
    expect(() => verificarJWT(token + 'x')).toThrow();
  });
});

describe('tokenAindaValido', () => {
  it('válido quando não há data de corte', () => {
    expect(tokenAindaValido({ iat: 1000 }, null)).toBe(true);
  });

  it('inválido quando emitido antes do corte (logout-all / troca de senha)', () => {
    const iatSegundos = 1_000_000; // 1000000s
    const corte = new Date((iatSegundos + 60) * 1000); // corte 60s depois do iat
    expect(tokenAindaValido({ iat: iatSegundos }, corte)).toBe(false);
  });

  it('válido quando emitido após o corte', () => {
    const iatSegundos = 2_000_000;
    const corte = new Date((iatSegundos - 60) * 1000);
    expect(tokenAindaValido({ iat: iatSegundos }, corte)).toBe(true);
  });

  it('inválido quando o payload não tem iat mas há corte', () => {
    expect(tokenAindaValido({}, new Date())).toBe(false);
  });
});

describe('gerarDesafio2fa / verificarDesafio2fa', () => {
  // T-REC-01: extraídas de routes/auth.js pra serem compartilhadas também por
  // /auth/login/2fa/recuperar (EV-025) — estes testes garantem que a extração
  // preservou exatamente as mesmas garantias que /auth/login/2fa já tinha.
  it('round-trip: um desafio gerado é aceito e devolve o userId original', () => {
    const desafio = gerarDesafio2fa(42);
    const payload = verificarDesafio2fa(desafio);
    expect(payload.sub).toBe(42);
    expect(payload.tipo).toBe('2fa');
  });

  it('rejeita um JWT adulterado', () => {
    const desafio = gerarDesafio2fa(42);
    expect(() => verificarDesafio2fa(desafio + 'x')).toThrow();
  });

  it('rejeita um JWT de sessão comum (gerado por gerarJWT) — tipo/shape diferente', () => {
    // O ataque que isto fecha: um token de SESSÃO válido (ex.: roubado) não
    // pode ser reaproveitado como se fosse um desafio 2FA.
    const tokenSessao = gerarJWT({ id: 42, nome: 'Ana', admin: false, empresaId: 1 });
    expect(() => verificarDesafio2fa(tokenSessao)).toThrow();
  });

  it('rejeita um JWT válido mas com tipo diferente de "2fa"', () => {
    // Mesmo formato (sub + tipo), tipo errado — não pode ser um "desafio
    // genérico" aceito por engano.
    const outroTipo = jwt.sign({ sub: 42, tipo: 'outra-coisa' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    expect(() => verificarDesafio2fa(outroTipo)).toThrow();
  });

  it('rejeita um JWT com tipo "2fa" mas sem sub', () => {
    const semSub = jwt.sign({ tipo: '2fa' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    expect(() => verificarDesafio2fa(semSub)).toThrow();
  });

  it('rejeita um desafio expirado', () => {
    const expirado = jwt.sign({ sub: 42, tipo: '2fa' }, env.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '-1s', // já expirado no momento da emissão
    });
    expect(() => verificarDesafio2fa(expirado)).toThrow();
  });

  it('rejeita um desafio malformado (não é um JWT)', () => {
    expect(() => verificarDesafio2fa('isto-nao-e-um-jwt')).toThrow();
  });
});
