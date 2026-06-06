import { describe, it, expect } from 'vitest';
import { env, schema } from '../env.js';

/**
 * Testes da validação de ambiente (Zod).
 *
 * O `vitest.config.js` injeta um env MÍNIMO de teste SEM EVOLUTION_HOST, então o
 * import de `env.js` precisa continuar parseando (sem disparar process.exit). Além
 * disso, validamos o cross-field `.superRefine`: com EVOLUTION_HOST setado, as
 * vars do gateway tornam-se obrigatórias; PUBLIC_URL nunca é obrigatória.
 *
 * Usamos `schema.safeParse` diretamente para exercitar regras sem mexer no
 * process.env real (e sem o process.exit do import).
 */

// Base mínima válida (mesma forma do env de teste injetado pelo vitest.config).
const baseValida = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  API_TOKEN: 'token',
  JWT_SECRET: '0123456789012345678901234567890123456789',
};

describe('env.js (import com o env de teste)', () => {
  it('parseia o env e expõe as vars obrigatórias', () => {
    // NODE_ENV é fixado pelo vitest.config; as demais vêm do env injetado.
    // Não asseramos EVOLUTION_HOST: o `import 'dotenv/config'` do env.js carrega
    // o .env real do dev, que pode (ou não) tê-la — o teste seria não-hermético.
    expect(env.NODE_ENV).toBe('test');
    expect(env.DATABASE_URL).toBeTruthy();
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });
});

describe('schema cross-field (EVOLUTION_HOST exige API_KEY + ENCRYPTION_KEY)', () => {
  it('aceita config SEM EVOLUTION_HOST (gateway desligado)', () => {
    const r = schema.safeParse({ ...baseValida });
    expect(r.success).toBe(true);
  });

  it('aceita EVOLUTION_HOST com API_KEY + ENCRYPTION_KEY presentes', () => {
    const r = schema.safeParse({
      ...baseValida,
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'global-key',
      ENCRYPTION_KEY: 'chave-mestra-suficientemente-longa',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita EVOLUTION_HOST sem EVOLUTION_API_KEY', () => {
    const r = schema.safeParse({
      ...baseValida,
      EVOLUTION_HOST: 'http://localhost:8080',
      ENCRYPTION_KEY: 'chave-mestra-suficientemente-longa',
    });
    expect(r.success).toBe(false);
    const campos = r.error.issues.map((i) => i.path.join('.'));
    expect(campos).toContain('EVOLUTION_API_KEY');
  });

  it('rejeita EVOLUTION_HOST sem ENCRYPTION_KEY', () => {
    const r = schema.safeParse({
      ...baseValida,
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'global-key',
    });
    expect(r.success).toBe(false);
    const campos = r.error.issues.map((i) => i.path.join('.'));
    expect(campos).toContain('ENCRYPTION_KEY');
  });

  it('NÃO exige PUBLIC_URL mesmo com EVOLUTION_HOST setado', () => {
    const r = schema.safeParse({
      ...baseValida,
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'global-key',
      ENCRYPTION_KEY: 'chave-mestra-suficientemente-longa',
      // PUBLIC_URL ausente de propósito
    });
    expect(r.success).toBe(true);
  });
});
