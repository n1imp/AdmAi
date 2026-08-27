/**
 * Teste de integração — Row Level Security no BANCO (F4-RLS.1, validação).
 *
 * Prova que as policies de `prisma/rls/enable_rls.sql` ISOLAM de verdade no Postgres,
 * usando um role `app_rw` SEM BYPASSRLS (o role padrão/superuser bypassaria a RLS, que
 * é justamente a pegadinha documentada no SQL). Diferente do idor.test.js (que valida o
 * filtro APP-level da extensão do Prisma), este exercita a defesa em profundidade no banco:
 *   - sem o GUC `app.empresa_id` → 0 linhas (fail-closed);
 *   - com o GUC(empA) numa transação → só as linhas da empA.
 *
 * Só roda no CI (Postgres real, com o role base tendo permissão de CREATE ROLE).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';
import { ehHostDePooler } from '../../scripts/validate-staging.mjs';

const APP_RW_PWD = 'app_rw_test_pwd';
const rlsSql = readFileSync('prisma/rls/enable_rls.sql', 'utf8');

// URL do role app_rw a partir do DATABASE_URL base (troca user:senha).
function urlAppRw() {
  return process.env.DATABASE_URL.replace(/:\/\/[^:]+:[^@]+@/, `://app_rw:${APP_RW_PWD}@`);
}

let app;
let appRw;

/* SKIP ESTRUTURAL VIA POOLER [D-STG-K-SUITE-VS-STAGING-01 · Codex 01a040e7]: este teste
   cria um role próprio (app_rw, senha fixa) e aplica DDL (enable_rls.sql v1) — desenho
   para um Postgres DESCARTÁVEL (CI/local, ver cabeçalho "Só roda no CI"). Através do
   Supavisor (*.pooler.supabase.com) ele é impossível por construção — o pooler exige
   username com tenant (`role.<ref>`, dá ENOIDENTIFIER sem isso) — e, pior, o beforeAll
   roda ANTES da falha: no incidente de 2026-08-27 ele deixou o role app_rw (senha
   pública) num staging persistente e reaplicou o FORCE do v1 por cima do estado v2
   aprovado. Por isso o predicado é ESTRUTURAL (hostname do pooler, não APP_ENV) e o
   skip decide ANTES de qualquer hook — os hooks vivem DENTRO do describe pulado.
   O equivalente staging (GUC via pooler, não destrutivo) é validate-rls-staging.mjs,
   executado pelo próprio validate:staging. */
const VIA_POOLER = (() => {
  try {
    return ehHostDePooler(new URL(process.env.DATABASE_URL ?? '').hostname);
  } catch {
    return false; // sem/má URL: deixa o teste rodar e falhar alto no lugar certo
  }
})();

describe.skipIf(VIA_POOLER)('RLS no banco (F4-RLS.1)', () => {
  beforeAll(async () => {
    ({ app } = criarApp());

    // Cria o role app_rw (NOBYPASSRLS) + grants e aplica as policies, via um client pg cru
    // (o pg roda scripts multi-statement; o Prisma $executeRaw roda 1 statement por vez).
    const pg = new Client({ connectionString: process.env.DATABASE_URL });
    await pg.connect();
    await pg.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_rw') THEN
      CREATE ROLE app_rw LOGIN PASSWORD '${APP_RW_PWD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
  END $$;`);
    await pg.query(`GRANT USAGE ON SCHEMA public TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;`);
    await pg.query(rlsSql); // BEGIN..COMMIT com ENABLE/FORCE RLS + policies tenant_isolation
    await pg.end();

    appRw = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlAppRw() }) });
  }, 30_000);

  afterAll(async () => {
    await appRw?.$disconnect();
    await prisma.$disconnect();
  });
  it('app_rw: sem GUC → 0 linhas (fail-closed); com GUC(empA) → só empA', async () => {
    await limparBanco();
    // Seed 2 empresas via prisma base (role privilegiado → bypassa RLS, semeia as duas).
    const A = await criarEmpresaComAdmin(request, app, 'RLSA');
    const B = await criarEmpresaComAdmin(request, app, 'RLSB');
    await prisma.tecnico.create({ data: { empresaId: A.empresaId, nome: 'TecA' } });
    await prisma.tecnico.create({ data: { empresaId: B.empresaId, nome: 'TecB' } });

    // (a) app_rw SEM set_config → RLS fail-closed → nenhuma linha.
    const semGuc = await appRw.tecnico.findMany();
    expect(semGuc.length).toBe(0);

    // (b) app_rw COM set_config(empA) numa transação → só técnicos da A.
    const daA = await appRw.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.empresa_id', $1, true)",
        String(A.empresaId)
      );
      return tx.tecnico.findMany();
    });
    expect(daA.length).toBeGreaterThan(0);
    expect(daA.every((t) => t.empresaId === A.empresaId)).toBe(true);
    expect(daA.some((t) => t.empresaId === B.empresaId)).toBe(false);
  });
});
