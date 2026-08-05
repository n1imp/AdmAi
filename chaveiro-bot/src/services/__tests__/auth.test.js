import { describe, it, expect, beforeAll, vi } from 'vitest';
import bcrypt from 'bcryptjs';

// auth.js importa env (config/env.js), que exige JWT_SECRET >= 32 chars.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x';
  process.env.API_TOKEN ??= 'test-token';
  process.env.JWT_SECRET ??= '0123456789012345678901234567890123';
  process.env.NODE_ENV = 'test';
});

const {
  gerarJWT,
  verificarJWT,
  tokenAindaValido,
  gerarDesafio2fa,
  verificarDesafio2fa,
  autenticarCandidatos,
} = await import('../auth.js');
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

describe('autenticarCandidatos (EV-063)', () => {
  // Candidatos construídos diretamente (sem Prisma/Postgres) — depois da migration
  // de `Usuario.telefone @unique` (missão anterior), não é mais possível criar 2
  // contas ATIVAS com o mesmo telefone via cadastro real; testar a lógica de N
  // candidatos exige montar o array manualmente, exatamente como abaixo.
  let hashSenhaA, hashSenhaB;
  beforeAll(async () => {
    hashSenhaA = await bcrypt.hash('SenhaDaContaA1!', 4); // rounds baixo só pra teste rápido
    hashSenhaB = await bcrypt.hash('SenhaDaContaB1!', 4);
  });

  it('0 candidatos (telefone/username inexistente) → lista vazia, sem lançar', async () => {
    const r = await autenticarCandidatos([], 'qualquercoisa');
    expect(r).toEqual([]);
  });

  it('1 candidato, senha correta → autentica', async () => {
    const candidato = { id: 1, senhaHash: hashSenhaA, ativo: true };
    const r = await autenticarCandidatos([candidato], 'SenhaDaContaA1!');
    expect(r).toEqual([candidato]);
  });

  it('1 candidato, senha incorreta → lista vazia', async () => {
    const candidato = { id: 1, senhaHash: hashSenhaA, ativo: true };
    const r = await autenticarCandidatos([candidato], 'SenhaErrada!');
    expect(r).toEqual([]);
  });

  it('1 candidato INATIVO, senha correta → lista vazia (não distingue de senha errada)', async () => {
    const candidato = { id: 1, senhaHash: hashSenhaA, ativo: false };
    const r = await autenticarCandidatos([candidato], 'SenhaDaContaA1!');
    expect(r).toEqual([]);
  });

  it('1 candidato SOCIAL (senhaHash null), qualquer senha → lista vazia, sem lançar', async () => {
    const candidato = { id: 1, senhaHash: null, ativo: true };
    const r = await autenticarCandidatos([candidato], 'qualquercoisa');
    expect(r).toEqual([]);
  });

  it('N candidatos (telefone em 2 empresas), MESMA senha nos dois → autentica os 2 (desambiguação legítima)', async () => {
    const senhaCompartilhada = 'SenhaCompartilhada1!';
    const hashCompartilhado = await bcrypt.hash(senhaCompartilhada, 4);
    const candidatoA = { id: 1, empresaId: 10, senhaHash: hashCompartilhado, ativo: true };
    const candidatoB = { id: 2, empresaId: 20, senhaHash: hashCompartilhado, ativo: true };

    const r = await autenticarCandidatos([candidatoA, candidatoB], senhaCompartilhada);

    expect(r).toHaveLength(2);
    expect(r.map((c) => c.id).sort()).toEqual([1, 2]);
  });

  it('N candidatos, senha bate em SÓ UM dos dois → autentica só esse (login direto, sem desambiguação)', async () => {
    const candidatoA = { id: 1, senhaHash: hashSenhaA, ativo: true };
    const candidatoB = { id: 2, senhaHash: hashSenhaB, ativo: true };

    const r = await autenticarCandidatos([candidatoA, candidatoB], 'SenhaDaContaA1!');

    expect(r).toEqual([candidatoA]);
  });

  it('N candidatos, senha não bate em nenhum → lista vazia (não vaza quantidade nem identidade)', async () => {
    const candidatoA = { id: 1, senhaHash: hashSenhaA, ativo: true };
    const candidatoB = { id: 2, senhaHash: hashSenhaB, ativo: true };

    const r = await autenticarCandidatos([candidatoA, candidatoB], 'NenhumaBate!');

    expect(r).toEqual([]);
  });

  it('N candidatos, senha bate em 1 ativo e 1 inativo com a MESMA senha → só o ativo autentica', async () => {
    const hashCompartilhado = await bcrypt.hash('SenhaCompartilhada2!', 4);
    const candidatoAtivo = { id: 1, senhaHash: hashCompartilhado, ativo: true };
    const candidatoInativo = { id: 2, senhaHash: hashCompartilhado, ativo: false };

    const r = await autenticarCandidatos(
      [candidatoAtivo, candidatoInativo],
      'SenhaCompartilhada2!'
    );

    expect(r).toEqual([candidatoAtivo]);
  });

  // EV-063, Gate 7 (achado do red team): bcryptjs é JS puro, então N chamadas de
  // bcrypt.compare em Promise.all ainda serializam no mesmo thread — o tempo de
  // resposta escalava com N, vazando por TIMING a mesma cardinalidade que o corpo da
  // resposta já não vaza mais. Corrigido rodando sempre exatamente 3 comparações
  // (reais + dummy até completar o piso). Este teste conta as chamadas reais a
  // `bcrypt.compare` (determinístico, não depende de wall-clock — instável em CI)
  // em vez de medir tempo.
  describe('tempo constante (EV-063, Gate 7)', () => {
    it('N=0,1,2,3 candidatos → sempre exatamente 3 chamadas a bcrypt.compare', async () => {
      const spy = vi.spyOn(bcrypt, 'compare');
      for (const n of [0, 1, 2, 3]) {
        spy.mockClear();
        const candidatos = Array.from({ length: n }, (_, i) => ({
          id: i,
          senhaHash: hashSenhaA,
          ativo: true,
        }));
        await autenticarCandidatos(candidatos, 'senha-nao-bate');
        expect(spy).toHaveBeenCalledTimes(3);
      }
      spy.mockRestore();
    });

    it('N=5 candidatos (acima do piso) → 5 chamadas, todas reais (sem dummy extra)', async () => {
      const spy = vi.spyOn(bcrypt, 'compare');
      const candidatos = Array.from({ length: 5 }, (_, i) => ({
        id: i,
        senhaHash: hashSenhaA,
        ativo: true,
      }));
      await autenticarCandidatos(candidatos, 'senha-nao-bate');
      expect(spy).toHaveBeenCalledTimes(5);
      spy.mockRestore();
    });
  });
});
