import { describe, it, expect } from 'vitest';
import {
  montarEnvDeIntegracao,
  CHAVES_PROIBIDAS_NA_INTEGRACAO,
  ehHostDePooler,
} from '../validate-staging.mjs';

/**
 * Harness hermético do validate:staging [D-STG-K-SUITE-VS-STAGING-01 · Codex 01a040e7].
 *
 * A suíte de integração valida o Prisma 7 contra o pooler de staging — e SÓ isso. No run
 * real de 2026-08-27, o env vazou credenciais reais para a suíte (Storage virou 302 nos
 * testes de documentos; o onboarding disparou e-mails no Resend de verdade). Estes testes
 * trancam o construtor do env hermético e o predicado estrutural de pooler que decide o
 * skip do rls.test.js. Credenciais aqui são SINTÉTICAS.
 */

const processEnvSintetico = {
  PATH: 'C:/qualquer/bin',
  SUPABASE_URL: 'https://qsuufuulxfkkeasgxhcv.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_sintetico',
  STORAGE_STRICT: 'true',
  RESEND_API_KEY: 're_sintetica',
  DATABASE_URL_APP: 'postgresql://app_rw:x@h:5432/db',
  REDIS_URL: 'redis://interno-do-railway:6379',
  APP_ENV: 'staging',
  NODE_ENV: 'production',
};
const cfgSintetica = {
  DATABASE_URL: 'postgresql://postgres.ref:pw@aws-1-x.pooler.supabase.com:6543/postgres',
  DIRECT_URL: 'postgresql://postgres.ref:pw@aws-1-x.pooler.supabase.com:5432/postgres',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_do_cfg_nao_pode_passar',
};

describe('montarEnvDeIntegracao (env hermético do passo 3)', () => {
  const env = montarEnvDeIntegracao(processEnvSintetico, cfgSintetica);

  it('preserva o DB de staging validado (runtime pooler + direta) e o PATH do sistema', () => {
    expect(env.DATABASE_URL).toBe(cfgSintetica.DATABASE_URL);
    expect(env.DIRECT_URL).toBe(cfgSintetica.DIRECT_URL);
    expect(env.PATH).toBe('C:/qualquer/bin');
  });

  it('vira ambiente de TESTE: APP_ENV/NODE_ENV=test (guards de staging do env.js não disparam)', () => {
    expect(env.APP_ENV).toBe('test');
    expect(env.NODE_ENV).toBe('test');
  });

  it('NENHUMA chave proibida sobrevive — nem herdada do shell, nem vinda do .env.staging', () => {
    for (const k of CHAVES_PROIBIDAS_NA_INTEGRACAO) {
      expect(k in env, `${k} deveria estar AUSENTE (delete, não string vazia)`).toBe(false);
    }
  });

  it('a lista de proibidas cobre exatamente os serviços externos que não são objeto do K', () => {
    expect([...CHAVES_PROIBIDAS_NA_INTEGRACAO].sort()).toEqual([
      'DATABASE_URL_APP',
      'RESEND_API_KEY',
      'STORAGE_STRICT',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
  });

  it('remove REDIS_URL herdado (staging é interno ao Railway; o .env.test aponta o local)', () => {
    expect('REDIS_URL' in env).toBe(false);
  });

  it('sobe SÓ o maxWait de iniciar transação, dentro do timeout de 20s do vitest', () => {
    expect(env.PRISMA_TX_MAX_WAIT_MS).toBe('10000');
    expect(Number(env.PRISMA_TX_MAX_WAIT_MS)).toBeLessThanOrEqual(10_000);
  });
});

describe('ehHostDePooler (predicado ESTRUTURAL do skip do rls.test.js)', () => {
  it('casa hosts legítimos do Supavisor', () => {
    expect(ehHostDePooler('aws-1-sa-east-1.pooler.supabase.com')).toBe(true);
    expect(ehHostDePooler('pooler.supabase.com')).toBe(true);
  });

  it('NÃO casa host forjado com o sufixo no meio, conexão direta nem local', () => {
    expect(ehHostDePooler('pooler.supabase.com.evil.com')).toBe(false);
    expect(ehHostDePooler('xpooler.supabase.com')).toBe(false);
    expect(ehHostDePooler('db.qsuufuulxfkkeasgxhcv.supabase.co')).toBe(false);
    expect(ehHostDePooler('localhost')).toBe(false);
    expect(ehHostDePooler(undefined)).toBe(false);
  });
});
