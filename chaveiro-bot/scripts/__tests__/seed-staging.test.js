import { describe, it, expect } from 'vitest';
import {
  ambienteElegivelStaging,
  REF_STAGING,
  REF_PRODUCAO,
  SLUG_A,
  SLUG_B,
} from '../seed-staging.mjs';

/**
 * Guard do seeder de STAGING (STG-APP-STAGING-01): o INVERSO do seed-demo —
 * só o banco REMOTO do admai-staging é elegível, por VÍNCULO POSITIVO do ref
 * (pooler `postgres.<ref>` ou direta `db.<ref>.supabase.co`). Produção, local,
 * ref arbitrário e formas desconhecidas são recusados. Import não abre conexão
 * (cliente preguiçoso) — estes testes rodam sem banco.
 */
const POOLER = 'aws-1-sa-east-1.pooler.supabase.com';

describe('ambienteElegivelStaging (fail-closed, vínculo positivo ao admai-staging)', () => {
  it('aceita o pooler do staging (transaction 6543 e session 5432)', () => {
    for (const porta of [6543, 5432]) {
      const r = ambienteElegivelStaging(
        `postgresql://postgres.${REF_STAGING}:pw@${POOLER}:${porta}/postgres`
      );
      expect(r.elegivel).toBe(true);
      expect(r.ref).toBe(REF_STAGING);
    }
  });

  it('aceita a conexão direta db.<ref>.supabase.co do staging', () => {
    const r = ambienteElegivelStaging(
      `postgresql://postgres:pw@db.${REF_STAGING}.supabase.co:5432/postgres`
    );
    expect(r.elegivel).toBe(true);
  });

  it('SABOTAGEM: recusa o ref de PRODUÇÃO (pooler e direta)', () => {
    expect(
      ambienteElegivelStaging(`postgresql://postgres.${REF_PRODUCAO}:pw@${POOLER}:6543/postgres`)
        .elegivel
    ).toBe(false);
    expect(
      ambienteElegivelStaging(
        `postgresql://postgres:pw@db.${REF_PRODUCAO}.supabase.co:5432/postgres`
      ).elegivel
    ).toBe(false);
  });

  it('SABOTAGEM: recusa ref arbitrário (nem staging nem produção)', () => {
    const r = ambienteElegivelStaging(
      `postgresql://postgres.aaaabbbbccccddddeeee:pw@${POOLER}:6543/postgres`
    );
    expect(r.elegivel).toBe(false);
    expect(r.motivo).toMatch(/vínculo positivo/);
  });

  it('SABOTAGEM [REVISOR 01a038fc]: user do staging em HOST ARBITRÁRIO não passa (anti-spoof)', () => {
    expect(
      ambienteElegivelStaging(`postgresql://postgres.${REF_STAGING}:pw@evil.example:6543/postgres`)
        .elegivel
    ).toBe(false);
    expect(
      ambienteElegivelStaging(
        `postgresql://postgres.${REF_STAGING}:pw@pooler.supabase.com.evil.io:6543/postgres`
      ).elegivel
    ).toBe(false);
  });

  it('SABOTAGEM: recusa loopback/local (staging é remoto por definição)', () => {
    expect(ambienteElegivelStaging('postgresql://u:p@localhost:5432/admai_dev').elegivel).toBe(
      false
    );
    expect(ambienteElegivelStaging('postgresql://u:p@127.0.0.1:5432/admai_test').elegivel).toBe(
      false
    );
  });

  it('SABOTAGEM: recusa ausente e inválida', () => {
    expect(ambienteElegivelStaging(undefined).elegivel).toBe(false);
    expect(ambienteElegivelStaging('nao-e-url').elegivel).toBe(false);
  });

  it('slugs das fixtures são determinísticos e prefixados (cleanup seguro)', () => {
    expect(SLUG_A).toBe('stg-fix-empresa-a');
    expect(SLUG_B).toBe('stg-fix-empresa-b');
    expect(SLUG_A.startsWith('stg-fix-')).toBe(true);
    expect(SLUG_B.startsWith('stg-fix-')).toBe(true);
  });
});
