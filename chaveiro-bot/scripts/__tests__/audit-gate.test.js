import { describe, it, expect } from 'vitest';
import { avaliarGate, extrairAdvisories, carregarAllowlist } from '../audit-gate-helpers.mjs';

/** Fabrica um fragmento de `npm audit --json` para 1 pacote com N advisories. */
function auditComAdvisories(pacote, advisories) {
  return {
    vulnerabilities: {
      [pacote]: {
        name: pacote,
        severity: advisories[0]?.severity ?? 'high',
        via: advisories.map((a) => ({
          source: 1,
          name: pacote,
          dependency: pacote,
          title: a.title ?? `${pacote} advisory`,
          url: `https://github.com/advisories/${a.ghsaId}`,
          severity: a.severity,
          cwe: ['CWE-20'],
          cvss: { score: 0, vectorString: null },
          range: '*',
        })),
        effects: [],
        range: '*',
        nodes: [`node_modules/${pacote}`],
        fixAvailable: true,
      },
    },
    metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: advisories.length } },
  };
}

const allowlistReal = {
  entries: [
    {
      ghsaId: 'GHSA-mwp4-54f8-5fhr',
      package: 'ip-address',
      severity: 'high',
      justification: 'Estruturalmente inalcançável nesta aplicação (EV-069).',
      reference: 'EOS_SECURITY_CLOSURE_V2_PLAN.md (EV-069)',
      reviewBy: '2026-11-04',
    },
    {
      ghsaId: 'GHSA-4xrf-jv44-h6hh',
      package: 'ip-address',
      severity: 'moderate',
      justification: 'Estruturalmente inalcançável nesta aplicação (EV-069).',
      reference: 'EOS_SECURITY_CLOSURE_V2_PLAN.md (EV-069)',
      reviewBy: '2026-11-04',
    },
  ],
};

const HOJE_DENTRO_DO_PRAZO = new Date('2026-08-05T00:00:00Z');
const HOJE_APOS_EXPIRACAO = new Date('2027-01-01T00:00:00Z');

describe('avaliarGate — apenas advisories aceitos', () => {
  it('passa (ok=true) e reporta o advisory como dispensado, com aviso', () => {
    const audit = auditComAdvisories('ip-address', [
      { ghsaId: 'GHSA-mwp4-54f8-5fhr', severity: 'high', title: 'Address4 leading zero' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(true);
    expect(resultado.bloqueantes).toHaveLength(0);
    expect(resultado.dispensados).toHaveLength(1);
    expect(resultado.dispensados[0].ghsaId).toBe('GHSA-MWP4-54F8-5FHR');
  });
});

describe('avaliarGate — advisory High novo, fora da allowlist', () => {
  it('falha (ok=false) e lista o advisory como bloqueante', () => {
    const audit = auditComAdvisories('algum-pacote-novo', [
      { ghsaId: 'GHSA-aaaa-bbbb-cccc', severity: 'high', title: 'Vulnerabilidade nova nunca revisada' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(false);
    expect(resultado.bloqueantes).toHaveLength(1);
    expect(resultado.bloqueantes[0].motivo).toMatch(/não consta na allowlist/);
  });
});

describe('avaliarGate — advisory Critical novo, fora da allowlist', () => {
  it('falha (ok=false) e lista o advisory como bloqueante', () => {
    const audit = auditComAdvisories('outro-pacote', [
      { ghsaId: 'GHSA-dddd-eeee-ffff', severity: 'critical', title: 'RCE crítico nunca revisado' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(false);
    expect(resultado.bloqueantes).toHaveLength(1);
    expect(resultado.bloqueantes[0].severity).toBe('critical');
  });
});

describe('avaliarGate — resultado limpo', () => {
  it('passa (ok=true) sem nenhum advisory', () => {
    const audit = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(true);
    expect(resultado.bloqueantes).toHaveLength(0);
    expect(resultado.dispensados).toHaveLength(0);
    expect(resultado.ignorados).toHaveLength(0);
  });
});

describe('avaliarGate — exceção expirada', () => {
  it('volta a bloquear um advisory que estava na allowlist, mas passou do reviewBy', () => {
    const audit = auditComAdvisories('ip-address', [
      { ghsaId: 'GHSA-mwp4-54f8-5fhr', severity: 'high', title: 'Address4 leading zero' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_APOS_EXPIRACAO);

    expect(resultado.ok).toBe(false);
    expect(resultado.bloqueantes).toHaveLength(1);
    expect(resultado.bloqueantes[0].motivo).toMatch(/expirada/);
  });
});

describe('avaliarGate — severidade abaixo de high nunca bloqueia', () => {
  it('advisory moderate sem entrada na allowlist ainda assim passa (ok=true), só é ignorado', () => {
    const audit = auditComAdvisories('pacote-qualquer', [
      { ghsaId: 'GHSA-zzzz-yyyy-xxxx', severity: 'moderate', title: 'Achado moderate sem exceção' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(true);
    expect(resultado.bloqueantes).toHaveLength(0);
    expect(resultado.ignorados).toHaveLength(1);
  });
});

describe('avaliarGate — não dispensa o pacote inteiro por nome', () => {
  it('um 2º advisory High no MESMO pacote, sem entrada própria na allowlist, ainda bloqueia', () => {
    const audit = auditComAdvisories('ip-address', [
      { ghsaId: 'GHSA-mwp4-54f8-5fhr', severity: 'high', title: 'Já coberto pela allowlist' },
      { ghsaId: 'GHSA-novo-9999-achx', severity: 'high', title: 'Advisory novo no mesmo pacote' },
    ]);

    const resultado = avaliarGate(audit, allowlistReal, HOJE_DENTRO_DO_PRAZO);

    expect(resultado.ok).toBe(false);
    expect(resultado.dispensados).toHaveLength(1);
    expect(resultado.bloqueantes).toHaveLength(1);
    expect(resultado.bloqueantes[0].ghsaId).toBe('GHSA-NOVO-9999-ACHX');
  });
});

describe('extrairAdvisories', () => {
  it('ignora entradas de `via` que são apenas strings (referência indireta, não advisory)', () => {
    const audit = {
      vulnerabilities: {
        'pacote-dependente': {
          name: 'pacote-dependente',
          severity: 'high',
          via: ['ip-address'], // referência indireta em cadeia, não um advisory em si
          effects: [],
          range: '*',
          nodes: [],
          fixAvailable: true,
        },
      },
    };

    expect(extrairAdvisories(audit)).toHaveLength(0);
  });
});

describe('carregarAllowlist', () => {
  it('marca entradas expiradas conforme a data de referência', () => {
    const mapa = carregarAllowlist(allowlistReal, HOJE_APOS_EXPIRACAO);
    expect(mapa.get('GHSA-MWP4-54F8-5FHR::ip-address').expirada).toBe(true);
  });

  it('não marca como expirada uma entrada ainda dentro do prazo', () => {
    const mapa = carregarAllowlist(allowlistReal, HOJE_DENTRO_DO_PRAZO);
    expect(mapa.get('GHSA-MWP4-54F8-5FHR::ip-address').expirada).toBe(false);
  });
});
