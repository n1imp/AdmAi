import { describe, it, expect } from 'vitest';
import { detalhesAuditoria, dtoAuditoria, whereKeyset } from '../admin.js';

/**
 * AUDITORIA consultável (USER GATE D3 · DECISOR AUD2-P3): a saída do endpoint é
 * ALLOWLIST POR AÇÃO com default fechado — `antes/depois` são Json livres e um call
 * site futuro pode gravar chave sensível; ação desconhecida NÃO expõe detalhes.
 * Estes testes fixam o contrato de exposição e o keyset da paginação.
 */

describe('detalhesAuditoria — allowlist por ação (default fechado)', () => {
  it('ação DESCONHECIDA nunca devolve antes/depois', () => {
    const r = detalhesAuditoria('acao.nova_qualquer', { credentialValue: 'x' }, { senha: 'y' });
    expect(r).toEqual({ antes: null, depois: null });
  });

  it('usuario.criado expõe só nome e papel do depois', () => {
    const r = detalhesAuditoria('usuario.criado', null, {
      nome: 'Fulano',
      papel: 'gestor',
      senhaHash: 'NUNCA',
      extra: 1,
    });
    expect(r.depois).toEqual({ nome: 'Fulano', papel: 'gestor' });
    expect(JSON.stringify(r)).not.toContain('NUNCA');
  });

  it('permissoes_alteradas reduz a matriz às chaves CONHECIDAS do catálogo', () => {
    const r = detalhesAuditoria(
      'usuario.permissoes_alteradas',
      {
        papel: 'funcionario',
        permissoes: { estoque: { ver: true, hack: 'x' }, moduloFalso: { ver: true } },
      },
      {
        papel: 'funcionario',
        permissoes: { estoque: { ver: false }, proprio: { documentos: true, capFalsa: true } },
      }
    );
    expect(r.antes.permissoes).toEqual({ estoque: { ver: true } });
    expect(r.depois.permissoes.estoque).toEqual({ ver: false });
    expect(r.depois.permissoes.proprio).toEqual({ documentos: true });
    expect(JSON.stringify(r)).not.toContain('moduloFalso');
    expect(JSON.stringify(r)).not.toContain('capFalsa');
    expect(JSON.stringify(r)).not.toContain('hack');
  });

  it('usuario.excluido expõe nome/papel/admin do antes; nada do depois', () => {
    const r = detalhesAuditoria(
      'usuario.excluido',
      { nome: 'Alvo', papel: 'gestor', admin: false, telefone: '5511999998888' },
      null
    );
    expect(r.antes).toEqual({ nome: 'Alvo', papel: 'gestor', admin: false });
    expect(JSON.stringify(r)).not.toContain('5511999998888');
  });

  it('lgpd.cliente_anonimizado expõe SOMENTE contagens numéricas', () => {
    const r = detalhesAuditoria('lgpd.cliente_anonimizado', null, {
      servicosAnonimizados: 3,
      avaliacoesAnonimizadas: 1,
      telefone: 'NUNCA',
    });
    expect(r.depois).toEqual({ servicosAnonimizados: 3, avaliacoesAnonimizadas: 1 });
    expect(JSON.stringify(r)).not.toContain('NUNCA');
  });

  it('conta.excluida expõe escopo e usuariosAfetados', () => {
    const r = detalhesAuditoria('conta.excluida', null, { escopo: 'empresa', usuariosAfetados: 3 });
    expect(r.depois).toEqual({ escopo: 'empresa', usuariosAfetados: 3 });
  });

  it('tipos errados viram null (nunca vazam cru)', () => {
    const r = detalhesAuditoria('convite.enviado', null, { email: 42, papel: ['gestor'] });
    expect(r.depois).toEqual({ email: null, papel: null });
  });
});

describe('dtoAuditoria — allowlist top-level, sem spread', () => {
  const reg = {
    id: 7,
    criadoEm: new Date('2026-08-27T10:00:00Z'),
    acao: 'usuario.criado',
    entidade: 'Usuario',
    entidadeId: 99,
    ip: '10.0.0.1',
    usuarioId: 5,
    antes: null,
    depois: { nome: 'Novo', papel: 'funcionario' },
    empresaId: 1327, // NUNCA deve aparecer na saída
  };

  it('expõe exatamente as chaves do contrato', () => {
    const dto = dtoAuditoria(reg, new Map([[5, 'Dono A']]));
    expect(Object.keys(dto).sort()).toEqual(
      [
        'acao',
        'antes',
        'autorNome',
        'criadoEm',
        'depois',
        'entidade',
        'entidadeId',
        'id',
        'ip',
      ].sort()
    );
    expect(dto.autorNome).toBe('Dono A');
    expect(JSON.stringify(dto)).not.toContain('empresaId');
  });

  it('autor fora do lookup (removido/outro tenant) vira null', () => {
    const dto = dtoAuditoria(reg, new Map());
    expect(dto.autorNome).toBeNull();
  });

  it('injeção de credencial em ação conhecida não sobrevive (allowlist + redator)', () => {
    const dto = dtoAuditoria(
      {
        ...reg,
        acao: 'usuario.permissoes_alteradas',
        antes: { papel: 'x', permissoes: { token: 'SEGREDO' } },
        depois: null,
      },
      new Map()
    );
    expect(JSON.stringify(dto)).not.toContain('SEGREDO');
  });
});

describe('whereKeyset — tupla (criadoEm, id) DESC', () => {
  it('sem cursor: sem filtro', () => {
    expect(whereKeyset(null)).toEqual({});
  });

  it('com cursor: OR de criadoEm menor OU empate com id menor', () => {
    const c = { id: 10, criadoEm: new Date('2026-08-27T10:00:00Z') };
    expect(whereKeyset(c)).toEqual({
      OR: [{ criadoEm: { lt: c.criadoEm } }, { criadoEm: c.criadoEm, id: { lt: c.id } }],
    });
  });
});
