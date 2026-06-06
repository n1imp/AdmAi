import { describe, it, expect, beforeAll } from 'vitest';

// auth.js importa env (config/env.js), que exige JWT_SECRET >= 32 chars.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.API_TOKEN ??= 'test-token';
  process.env.JWT_SECRET ??= '0123456789012345678901234567890123';
  process.env.NODE_ENV = 'test';
});

const { gerarJWT, verificarJWT, tokenAindaValido } = await import('../auth.js');

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
