import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  env,
  schema,
  REF_STAGING,
  REF_PRODUCAO,
  ORIGEM_FRONTEND_STAGING,
  refDaConexaoSupabase,
} from '../env.js';

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

/**
 * ANTI-PRODUCTION GUARD (APP_ENV=staging) — STG-APP-STAGING-01, D1 thread 01a038e5.
 *
 * Contrato: staging é FAIL-CLOSED no boot. Vínculo POSITIVO ao ref do admai-staging
 * (denylist sozinha não prova identidade) + origens comparadas por IGUALDADE EXATA.
 * APP_ENV ausente preserva 100% o comportamento atual (baseline provada abaixo).
 * Cada guard segue PASS → sabotagem → MUST FAIL (matriz completa, não amostra).
 */
const POOLER = 'aws-1-sa-east-1.pooler.supabase.com';
const stagingValida = {
  ...baseValida,
  APP_ENV: 'staging',
  STAGING_REF: REF_STAGING,
  DATABASE_URL: `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:5432/postgres`,
  SUPABASE_URL: `https://${REF_STAGING}.supabase.co`,
  ALLOWED_ORIGIN: ORIGEM_FRONTEND_STAGING,
  FRONTEND_URL: ORIGEM_FRONTEND_STAGING,
};

/** Sabotagem tem de reprovar E apontar o campo certo (erro acionável, não genérico). */
function esperaFalhaEm(overrides, campo) {
  const r = schema.safeParse({ ...stagingValida, ...overrides });
  expect(r.success).toBe(false);
  const campos = r.error.issues.map((i) => i.path.join('.'));
  expect(campos).toContain(campo);
}

describe('guard APP_ENV=staging (fail-closed; vínculo positivo ao admai-staging)', () => {
  it('1. staging VÁLIDO passa (controle positivo da matriz)', () => {
    const r = schema.safeParse(stagingValida);
    expect(r.success).toBe(true);
  });

  it('2. STAGING_REF = ref de PRODUÇÃO reprova', () => {
    esperaFalhaEm({ STAGING_REF: REF_PRODUCAO }, 'STAGING_REF');
  });

  it('2b. STAGING_REF ausente reprova', () => {
    esperaFalhaEm({ STAGING_REF: undefined }, 'STAGING_REF');
  });

  it('3. DATABASE_URL de produção reprova', () => {
    esperaFalhaEm(
      { DATABASE_URL: `postgresql://postgres.${REF_PRODUCAO}:pw@${POOLER}:6543/postgres` },
      'DATABASE_URL'
    );
  });

  it('3b. DATABASE_URL sem ref reconhecível (localhost) reprova — vínculo positivo morde', () => {
    esperaFalhaEm({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }, 'DATABASE_URL');
  });

  it('3c. DATABASE_URL de um ref arbitrário (nem staging nem prod) reprova', () => {
    esperaFalhaEm(
      { DATABASE_URL: `postgresql://postgres.aaaabbbbccccddddeeee:pw@${POOLER}:6543/postgres` },
      'DATABASE_URL'
    );
  });

  it('4. DIRECT_URL de produção reprova; ausente também reprova (migrations do boot)', () => {
    esperaFalhaEm(
      { DIRECT_URL: `postgresql://postgres.${REF_PRODUCAO}:pw@${POOLER}:5432/postgres` },
      'DIRECT_URL'
    );
    esperaFalhaEm({ DIRECT_URL: undefined }, 'DIRECT_URL');
  });

  it('4b. DATABASE_URL_APP (quando presente) também exige vínculo staging', () => {
    esperaFalhaEm(
      { DATABASE_URL_APP: `postgresql://postgres.${REF_PRODUCAO}:pw@${POOLER}:6543/postgres` },
      'DATABASE_URL_APP'
    );
  });

  it('5. SUPABASE_URL de produção reprova; ausente reprova; host estranho reprova', () => {
    esperaFalhaEm({ SUPABASE_URL: `https://${REF_PRODUCAO}.supabase.co` }, 'SUPABASE_URL');
    esperaFalhaEm({ SUPABASE_URL: undefined }, 'SUPABASE_URL');
    esperaFalhaEm({ SUPABASE_URL: 'https://exemplo.com' }, 'SUPABASE_URL');
  });

  it('6. ALLOWED_ORIGIN localhost reprova (igualdade exata)', () => {
    esperaFalhaEm({ ALLOWED_ORIGIN: 'http://localhost:5173' }, 'ALLOWED_ORIGIN');
    esperaFalhaEm({ ALLOWED_ORIGIN: 'http://127.0.0.1:5173' }, 'ALLOWED_ORIGIN');
  });

  it('7. ALLOWED_ORIGIN de produção reprova (app.chaveirobot.com.br / pages.dev prod)', () => {
    esperaFalhaEm({ ALLOWED_ORIGIN: 'https://app.chaveirobot.com.br' }, 'ALLOWED_ORIGIN');
    esperaFalhaEm({ ALLOWED_ORIGIN: 'https://admai-painel.pages.dev' }, 'ALLOWED_ORIGIN');
  });

  it("7b. ALLOWED_ORIGIN '*' e placeholder reprovam", () => {
    esperaFalhaEm({ ALLOWED_ORIGIN: '*' }, 'ALLOWED_ORIGIN');
    esperaFalhaEm({ ALLOWED_ORIGIN: 'https://SEU_DOMINIO' }, 'ALLOWED_ORIGIN');
  });

  it('8. ALLOWED_ORIGIN ausente reprova', () => {
    esperaFalhaEm({ ALLOWED_ORIGIN: undefined }, 'ALLOWED_ORIGIN');
  });

  it('8b. FRONTEND_URL divergente da origem staging reprova; mesma origem com path passa', () => {
    esperaFalhaEm({ FRONTEND_URL: 'https://app.chaveirobot.com.br' }, 'FRONTEND_URL');
    esperaFalhaEm({ FRONTEND_URL: undefined }, 'FRONTEND_URL');
    const r = schema.safeParse({
      ...stagingValida,
      FRONTEND_URL: `${ORIGEM_FRONTEND_STAGING}/login`, // mesma ORIGEM ⇒ ok
    });
    expect(r.success).toBe(true);
  });

  it('8c. PUBLIC_URL http ou apontando p/ produção reprova; https staging passa', () => {
    esperaFalhaEm({ PUBLIC_URL: 'http://inseguro.example' }, 'PUBLIC_URL');
    esperaFalhaEm({ PUBLIC_URL: 'https://admai-production.up.railway.app' }, 'PUBLIC_URL');
    esperaFalhaEm({ PUBLIC_URL: 'https://api.chaveirobot.com.br' }, 'PUBLIC_URL');
    const r = schema.safeParse({
      ...stagingValida,
      PUBLIC_URL: 'https://admai-staging.up.railway.app',
    });
    expect(r.success).toBe(true);
  });

  it('9. APP_ENV ausente: config local (baseline) segue passando — comportamento intacto', () => {
    // Exatamente a baseValida de sempre (localhost, sem STAGING_REF/ALLOWED_ORIGIN):
    const r = schema.safeParse({ ...baseValida });
    expect(r.success).toBe(true);
  });

  it('9b. NODE_ENV=production + APP_ENV=staging: guards de prod NÃO relaxam e staging passa com secrets próprios', () => {
    const r = schema.safeParse({
      ...stagingValida,
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_staging_sandbox', // exigida pelo guard de prod — secrets DE STAGING
    });
    expect(r.success).toBe(true);
    // Contraprova: sem RESEND_API_KEY o guard de produção continua mordendo em staging.
    const semResend = schema.safeParse({ ...stagingValida, NODE_ENV: 'production' });
    expect(semResend.success).toBe(false);
  });

  it('extrator de ref: pooler, direta, e formas sem ref', () => {
    expect(refDaConexaoSupabase(`postgresql://postgres.${REF_STAGING}:pw@${POOLER}:6543/x`)).toBe(
      REF_STAGING
    );
    expect(
      refDaConexaoSupabase(`postgresql://postgres:pw@db.${REF_STAGING}.supabase.co:5432/x`)
    ).toBe(REF_STAGING);
    expect(refDaConexaoSupabase('postgresql://u:p@localhost:5432/db')).toBe(null);
    expect(refDaConexaoSupabase('nao-e-url')).toBe(null);
  });
});

/**
 * PROVA DE BOOT REAL — o teste de schema exercita o MESMO objeto usado no startup,
 * mas aqui provamos a cadeia completa: import de env.js → safeParse(process.env) →
 * process.exit(1). Startup real com sabotagem TEM de sair ≠0; válido TEM de sair 0.
 */
describe('boot real (spawn de node importando env.js)', () => {
  const RAIZ_BOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const importaEnv = (extraEnv) =>
    spawnSync(
      process.execPath,
      ['-e', "import('./src/config/env.js').then(()=>process.exit(0),()=>process.exit(1))"],
      {
        cwd: RAIZ_BOT,
        // NODE_ENV=test → dotenv carrega .env.test; vars explícitas abaixo PREVALECEM
        // (dotenv não sobrescreve o que já existe no process.env do filho).
        env: { ...process.env, NODE_ENV: 'test', VITEST: '', ...extraEnv },
        timeout: 15000,
        encoding: 'utf8',
      }
    );

  it('boot com staging SABOTADO (DATABASE_URL de produção) sai com código ≠ 0', () => {
    const r = importaEnv({
      APP_ENV: 'staging',
      STAGING_REF: REF_STAGING,
      DATABASE_URL: `postgresql://postgres.${REF_PRODUCAO}:pw@${POOLER}:6543/postgres`,
      DIRECT_URL: `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:5432/postgres`,
      SUPABASE_URL: `https://${REF_STAGING}.supabase.co`,
      ALLOWED_ORIGIN: ORIGEM_FRONTEND_STAGING,
      FRONTEND_URL: ORIGEM_FRONTEND_STAGING,
      API_TOKEN: 't',
      JWT_SECRET: '0123456789012345678901234567890123456789',
    });
    expect(r.status).not.toBe(0);
  });

  it('boot com staging VÁLIDO sai com código 0', () => {
    const r = importaEnv({
      APP_ENV: 'staging',
      STAGING_REF: REF_STAGING,
      DATABASE_URL: `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:6543/postgres`,
      DIRECT_URL: `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:5432/postgres`,
      SUPABASE_URL: `https://${REF_STAGING}.supabase.co`,
      ALLOWED_ORIGIN: ORIGEM_FRONTEND_STAGING,
      FRONTEND_URL: ORIGEM_FRONTEND_STAGING,
      API_TOKEN: 't',
      JWT_SECRET: '0123456789012345678901234567890123456789',
    });
    expect(r.status).toBe(0);
  });
});
