import { describe, it, expect } from 'vitest';
import {
  presetDoPapel,
  permissoesEfetivas,
  pode,
  podeProprio,
  sanitizarPermissoes,
  PAPEIS,
  MODULOS,
} from '../permissoes.js';

describe('presetDoPapel', () => {
  it('dono = grant total (todos os módulos, todas as ações)', () => {
    const dono = presetDoPapel('dono');
    for (const m of MODULOS) {
      for (const acao of Object.keys(dono[m])) expect(dono[m][acao]).toBe(true);
    }
    expect(dono.proprio.bater_ponto).toBe(true);
  });

  it('gestor: opera mas NÃO gerencia usuários/config; vê financeiro sem editar', () => {
    const g = presetDoPapel('gestor');
    expect(g.servicos.deletar).toBe(true);
    expect(g.financeiro.ver).toBe(true);
    expect(g.financeiro.editar).toBe(false);
    expect(g.aprovacoes.aprovar).toBe(true);
    expect(g.usuarios.ver).toBe(false);
    expect(g.usuarios.editar).toBe(false);
    expect(g.configuracao.editar).toBe(false);
  });

  it('funcionário: nenhum módulo de empresa, mas tem as capacidades próprias', () => {
    const f = presetDoPapel('funcionario');
    for (const m of MODULOS) {
      for (const acao of Object.keys(f[m])) expect(f[m][acao]).toBe(false);
    }
    expect(f.proprio.bater_ponto).toBe(true);
    expect(f.proprio.registrar_servico).toBe(true);
  });
});

describe('permissoesEfetivas (preset ⊕ overrides)', () => {
  it('dono é IMUTÁVEL: overrides não conseguem reduzir o dono', () => {
    const ef = permissoesEfetivas({ papel: 'dono', permissoes: { usuarios: { editar: false } } });
    expect(ef.usuarios.editar).toBe(true);
  });

  it('override restringe e libera dentro do papel do gestor', () => {
    const ef = permissoesEfetivas({
      papel: 'gestor',
      permissoes: { financeiro: { ver: false }, usuarios: { ver: true } },
    });
    expect(ef.financeiro.ver).toBe(false); // restringido
    expect(ef.usuarios.ver).toBe(true); // liberado
    expect(ef.servicos.deletar).toBe(true); // preset preservado onde não houve override
  });

  it('cai para funcionário quando papel é desconhecido/ausente', () => {
    const ef = permissoesEfetivas({ permissoes: null });
    expect(ef.servicos.ver).toBe(false);
    expect(ef.proprio.bater_ponto).toBe(true);
  });
});

describe('pode / podeProprio', () => {
  const dono = { papel: 'dono' };
  const gestor = { papel: 'gestor' };
  const func = { papel: 'funcionario' };

  it('dono pode tudo', () => {
    expect(pode(dono, 'usuarios', 'editar')).toBe(true);
    expect(podeProprio(dono, 'registrar_servico')).toBe(true);
  });
  it('gestor segue o preset', () => {
    expect(pode(gestor, 'servicos', 'deletar')).toBe(true);
    expect(pode(gestor, 'usuarios', 'editar')).toBe(false);
  });
  it('funcionário não acessa módulos de empresa, mas tem capacidades próprias', () => {
    expect(pode(func, 'servicos', 'ver')).toBe(false);
    expect(podeProprio(func, 'bater_ponto')).toBe(true);
  });
  it('compat: admin=true sem papel é tratado como dono', () => {
    expect(pode({ admin: true }, 'usuarios', 'editar')).toBe(true);
  });
});

describe('sanitizarPermissoes', () => {
  it('mantém só módulos/ações conhecidos e descarta o resto', () => {
    const out = sanitizarPermissoes({
      servicos: { ver: true, hack: true },
      lixo: { x: 1 },
      proprio: { bater_ponto: false, inventado: true },
    });
    expect(out).toEqual({ servicos: { ver: true }, proprio: { bater_ponto: false } });
  });
  it('devolve null para entrada inválida', () => {
    expect(sanitizarPermissoes(null)).toBeNull();
    expect(sanitizarPermissoes('x')).toBeNull();
  });
});

describe('PAPEIS', () => {
  it('expõe exatamente os três papéis', () => {
    expect(PAPEIS).toEqual(['dono', 'gestor', 'funcionario']);
  });
});
