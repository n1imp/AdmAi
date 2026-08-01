import { describe, it, expect } from 'vitest';
import {
  presetDoPapel,
  permissoesEfetivas,
  pode,
  podeProprio,
  sanitizarPermissoes,
  limitarPermissoesAoAtor,
  nivelDoPapel,
  podeGerenciarUsuario,
  podeAtribuirPapel,
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

describe('limitarPermissoesAoAtor (teto de autoridade — F1)', () => {
  it('CVE-like: gestor com override customizado de usuarios.editar NÃO consegue conceder financeiro.editar (que não possui)', () => {
    // Reproduz o cenário real: dono cria um gestor com override { usuarios: { editar: true } }.
    const gestorComOverrideUsuarios = {
      papel: 'gestor',
      permissoes: { usuarios: { editar: true } },
    };
    gestorComOverrideUsuarios.permissoesEfetivas = permissoesEfetivas(gestorComOverrideUsuarios);
    // presets de gestor: financeiro.editar é false — o ator não possui essa permissão.
    expect(gestorComOverrideUsuarios.permissoesEfetivas.financeiro.editar).toBe(false);

    const propostos = sanitizarPermissoes({ financeiro: { editar: true } });
    const limitado = limitarPermissoesAoAtor(gestorComOverrideUsuarios, propostos);

    // Sem o teto, `limitado` seria { financeiro: { editar: true } } — a escalação.
    expect(limitado?.financeiro?.editar).not.toBe(true);
  });

  it('permite conceder uma permissão que o ator JÁ possui (não bloqueia uso legítimo)', () => {
    const gestor = { papel: 'gestor', permissoes: null };
    gestor.permissoesEfetivas = permissoesEfetivas(gestor);
    expect(gestor.permissoesEfetivas.servicos.deletar).toBe(true);

    const propostos = sanitizarPermissoes({ servicos: { deletar: true } });
    const limitado = limitarPermissoesAoAtor(gestor, propostos);
    expect(limitado?.servicos?.deletar).toBe(true);
  });

  it('permite sempre REVOGAR (valor false), mesmo que o ator não possua a permissão', () => {
    const gestor = { papel: 'gestor', permissoes: null };
    gestor.permissoesEfetivas = permissoesEfetivas(gestor);
    const propostos = sanitizarPermissoes({ financeiro: { editar: false } });
    const limitado = limitarPermissoesAoAtor(gestor, propostos);
    expect(limitado?.financeiro?.editar).toBe(false);
  });

  it('não limita o dono (grant total, sem teto)', () => {
    const dono = { papel: 'dono', permissoesEfetivas: permissoesEfetivas({ papel: 'dono' }) };
    const propostos = sanitizarPermissoes({
      financeiro: { editar: true },
      usuarios: { editar: true },
    });
    const limitado = limitarPermissoesAoAtor(dono, propostos);
    expect(limitado).toEqual(propostos);
  });

  it('também limita capacidades "proprio" acima do teto do ator', () => {
    const funcSemDocumentos = {
      papel: 'funcionario',
      permissoes: { proprio: { documentos: false } },
    };
    funcSemDocumentos.permissoesEfetivas = permissoesEfetivas(funcSemDocumentos);
    expect(funcSemDocumentos.permissoesEfetivas.proprio.documentos).toBe(false);

    // Um funcionário sem 'documentos' tentando conceder essa capacidade a OUTRO usuário
    // (via um PATCH em que ele não deveria nem ter usuarios.editar, mas testamos a função isolada).
    const propostos = sanitizarPermissoes({ proprio: { documentos: true } });
    const limitado = limitarPermissoesAoAtor(funcSemDocumentos, propostos);
    expect(limitado?.proprio?.documentos).not.toBe(true);
  });

  it('devolve null/undefined intacto quando não há overrides propostos', () => {
    const gestor = { papel: 'gestor', permissoesEfetivas: permissoesEfetivas({ papel: 'gestor' }) };
    expect(limitarPermissoesAoAtor(gestor, null)).toBeNull();
  });
});

describe('PAPEIS', () => {
  it('expõe exatamente os três papéis', () => {
    expect(PAPEIS).toEqual(['dono', 'gestor', 'funcionario']);
  });
});

describe('hierarquia de papéis', () => {
  it('ordena do mais para o menos privilegiado', () => {
    expect(nivelDoPapel('dono')).toBeLessThan(nivelDoPapel('gestor'));
    expect(nivelDoPapel('gestor')).toBeLessThan(nivelDoPapel('funcionario'));
  });

  it('trata papel desconhecido como o menos privilegiado (fail-closed)', () => {
    expect(nivelDoPapel('superadmin')).toBeGreaterThanOrEqual(nivelDoPapel('funcionario'));
    expect(nivelDoPapel(null)).toBeGreaterThanOrEqual(nivelDoPapel('funcionario'));
    expect(nivelDoPapel(undefined)).toBeGreaterThanOrEqual(nivelDoPapel('funcionario'));
  });
});

describe('podeGerenciarUsuario', () => {
  const dono = { id: 1, papel: 'dono' };
  const gestor = { id: 2, papel: 'gestor' };
  const funcionario = { id: 3, papel: 'funcionario' };

  it('nega gestor sobre a conta do dono — a cadeia do achado de auditoria', () => {
    // Era exatamente isto: o dono ganha um Tecnico ao verificar o telefone, e o
    // reset de PIN só exigia `tecnicos.editar`. O PIN voltava em claro.
    expect(podeGerenciarUsuario(gestor, dono)).toBe(false);
  });

  it('nega papel igual (lateral), inclusive dono sobre dono', () => {
    expect(podeGerenciarUsuario(gestor, { id: 9, papel: 'gestor' })).toBe(false);
    expect(podeGerenciarUsuario(dono, { id: 9, papel: 'dono' })).toBe(false);
    expect(podeGerenciarUsuario(funcionario, { id: 9, papel: 'funcionario' })).toBe(false);
  });

  it('permite apenas quem supera estritamente o alvo', () => {
    expect(podeGerenciarUsuario(dono, gestor)).toBe(true);
    expect(podeGerenciarUsuario(dono, funcionario)).toBe(true);
    expect(podeGerenciarUsuario(gestor, funcionario)).toBe(true);
  });

  it('nega o ator sobre a própria conta', () => {
    expect(podeGerenciarUsuario(dono, { id: 1, papel: 'funcionario' })).toBe(false);
    expect(podeGerenciarUsuario(gestor, { id: 2, papel: 'funcionario' })).toBe(false);
  });

  it('deriva papel do campo legado `admin` quando `papel` falta', () => {
    expect(podeGerenciarUsuario({ id: 1, admin: true }, { id: 2, papel: 'gestor' })).toBe(true);
    expect(podeGerenciarUsuario({ id: 2, papel: 'gestor' }, { id: 1, admin: true })).toBe(false);
  });

  it('nega quando falta ator ou alvo', () => {
    expect(podeGerenciarUsuario(null, dono)).toBe(false);
    expect(podeGerenciarUsuario(dono, null)).toBe(false);
  });

  it('nega papel desconhecido no ATOR, mesmo contra funcionário', () => {
    expect(podeGerenciarUsuario({ id: 7, papel: 'superadmin' }, funcionario)).toBe(false);
  });
});

describe('podeAtribuirPapel', () => {
  it('nega atribuir papel igual ou acima do próprio', () => {
    expect(podeAtribuirPapel({ papel: 'gestor' }, 'gestor')).toBe(false);
    expect(podeAtribuirPapel({ papel: 'gestor' }, 'dono')).toBe(false);
    expect(podeAtribuirPapel({ papel: 'funcionario' }, 'funcionario')).toBe(false);
    expect(podeAtribuirPapel({ papel: 'dono' }, 'dono')).toBe(false);
  });

  it('permite atribuir papel estritamente abaixo', () => {
    expect(podeAtribuirPapel({ papel: 'dono' }, 'gestor')).toBe(true);
    expect(podeAtribuirPapel({ papel: 'dono' }, 'funcionario')).toBe(true);
    expect(podeAtribuirPapel({ papel: 'gestor' }, 'funcionario')).toBe(true);
  });

  it('nega ator ausente', () => {
    expect(podeAtribuirPapel(null, 'funcionario')).toBe(false);
  });
});
