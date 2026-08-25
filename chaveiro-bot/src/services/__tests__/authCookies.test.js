import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * COOKIE_OPTS_REFRESH por ambiente — STG-APP-STAGING-REV1 (REVISOR 01a038fc achado 2).
 *
 * O valor é computado NO IMPORT de env.js (module-level), então o teste que importa o
 * módulo dentro do worker do vitest só veria o modo de teste. A prova real é por SPAWN:
 * um node filho importa services/auth.js sob o env desejado e imprime as opts.
 *
 * Contrato: staging (cross-site pages.dev↔railway.app) ⇒ SameSite=None + Secure
 * (browsers rejeitam None sem Secure); default/produção ⇒ Strict, comportamento
 * histórico INTACTO. clearCookie usa as MESMAS opts (uma única fonte).
 */
const RAIZ_BOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const POOLER = 'aws-1-sa-east-1.pooler.supabase.com';
const REF = 'qsuufuulxfkkeasgxhcv';
const ORIGEM = 'https://staging.admai-painel.pages.dev';

const lerOpts = (extraEnv) => {
  const envFilho = { ...process.env, NODE_ENV: 'test', VITEST: '', ...extraEnv };
  // "default" = APP_ENV AUSENTE (env real sem a var). String vazia NÃO é o mesmo:
  // o enum do Zod a reprova (fail-closed correto) — então removemos a chave.
  if (extraEnv.APP_ENV === undefined) delete envFilho.APP_ENV;
  const r = spawnSync(
    process.execPath,
    [
      '-e',
      "import('./src/services/auth.js').then(m=>{console.log(JSON.stringify(m.COOKIE_OPTS_REFRESH));process.exit(0)},e=>{console.error(e.message);process.exit(1)})",
    ],
    {
      cwd: RAIZ_BOT,
      env: envFilho,
      timeout: 20000,
      encoding: 'utf8',
    }
  );
  expect(r.status).toBe(0);
  return JSON.parse(r.stdout.trim().split('\n').pop());
};

const envStagingValido = {
  APP_ENV: 'staging',
  STAGING_REF: REF,
  DATABASE_URL: `postgresql://postgres.${REF}:pw@${POOLER}:6543/postgres`,
  DIRECT_URL: `postgresql://postgres.${REF}:pw@${POOLER}:5432/postgres`,
  SUPABASE_URL: `https://${REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: 'srk_staging_sintetica',
  STORAGE_STRICT: 'true',
  ALLOWED_ORIGIN: ORIGEM,
  FRONTEND_URL: ORIGEM,
  API_TOKEN: 't',
  JWT_SECRET: '0123456789012345678901234567890123456789',
};

describe('COOKIE_OPTS_REFRESH por ambiente (boot real via spawn)', () => {
  it('default (sem APP_ENV): SameSite=Strict, sem secure fixo — histórico intacto', () => {
    const opts = lerOpts({});
    expect(opts).toEqual({ httpOnly: true, sameSite: 'strict', path: '/api/auth' });
  });

  it('staging: SameSite=None + Secure (cross-site pages.dev ↔ railway.app)', () => {
    const opts = lerOpts(envStagingValido);
    expect(opts).toEqual({ httpOnly: true, sameSite: 'none', secure: true, path: '/api/auth' });
  });
});

/**
 * Origin-guard das rotas de sessão — a CSRF-compensação do SameSite=None [DELTA 01a038fc].
 * A decisão é a função pura exportada de routes/auth.js (o wiring router.use é 3 linhas
 * inspecionáveis); aqui os TRÊS ramos viram regressão executável.
 */
describe('origemDeSessaoRecusada (CSRF-compensação do SameSite=None em staging)', async () => {
  const { origemDeSessaoRecusada } = await import('../../routes/auth.js');

  it('staging: Origin DIVERGENTE é recusada (403 no wiring)', () => {
    expect(origemDeSessaoRecusada('staging', ORIGEM, 'https://attacker.example')).toBe(true);
    expect(origemDeSessaoRecusada('staging', ORIGEM, 'https://app.chaveirobot.com.br')).toBe(true);
    expect(origemDeSessaoRecusada('staging', ORIGEM, 'null')).toBe(true); // Origin: null (sandbox)
  });

  it('staging: Origin PERMITIDA (o painel staging) passa', () => {
    expect(origemDeSessaoRecusada('staging', ORIGEM, ORIGEM)).toBe(false);
  });

  it('staging: SEM Origin passa (curl/supertest/mobile — o vetor browser sempre envia)', () => {
    expect(origemDeSessaoRecusada('staging', ORIGEM, undefined)).toBe(false);
    expect(origemDeSessaoRecusada('staging', ORIGEM, '')).toBe(false);
  });

  it('fora de staging: INERTE mesmo com Origin divergente (produção segue Strict)', () => {
    expect(origemDeSessaoRecusada('production', ORIGEM, 'https://attacker.example')).toBe(false);
    expect(origemDeSessaoRecusada(undefined, ORIGEM, 'https://attacker.example')).toBe(false);
  });
});
