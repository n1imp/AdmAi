/**
 * Testes unitários para services/identidade.js
 *
 * Estratégia London School: o prisma e suas chamadas são mockados via vi.mock.
 * O parser.js (variantesTelefone) é real — testamos a integração com ele.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock do módulo prisma ANTES de importar o SUT.
// O caminho é relativo ao arquivo de teste: __tests__/ → ../../db/prisma.js
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    tecnico: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '../../db/prisma.js';
import { resolverRemetente } from '../identidade.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolverRemetente', () => {
  it('retorna lista vazia quando o telefone não produz variantes', async () => {
    const resultado = await resolverRemetente('');
    expect(resultado).toEqual([]);
    // prisma não deve ser chamado se não há variantes
    expect(prisma.tecnico.findMany).not.toHaveBeenCalled();
  });

  it('retorna lista vazia quando nenhum técnico é encontrado no banco', async () => {
    prisma.tecnico.findMany.mockResolvedValue([]);

    const resultado = await resolverRemetente('5511988887777');
    expect(resultado).toEqual([]);
  });

  it('chama findMany com a condição telefone.in contendo as variantes do 9º dígito', async () => {
    prisma.tecnico.findMany.mockResolvedValue([]);

    // '5511988887777' → variante sem 9: '551188887777'
    await resolverRemetente('5511988887777');

    const chamada = prisma.tecnico.findMany.mock.calls[0][0];
    expect(chamada.where.telefone.in).toContain('5511988887777');
    expect(chamada.where.telefone.in).toContain('551188887777');
    expect(chamada.where.ativo).toBe(true);
  });

  it('retorna um vínculo quando há exatamente 1 técnico ativo', async () => {
    prisma.tecnico.findMany.mockResolvedValue([
      {
        id: 10,
        nome: 'João',
        empresaId: 1,
        usuarioId: null,
        telefone: '5511988887777',
        empresa: { id: 1, nome: 'Chaveiro Alfa' },
      },
    ]);

    const resultado = await resolverRemetente('5511988887777');
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual({
      empresaId: 1,
      empresaNome: 'Chaveiro Alfa',
      tecnicoId: 10,
      tecnicoNome: 'João',
      ehDono: false,
    });
  });

  it('retorna ehDono=true quando o técnico tem usuarioId preenchido', async () => {
    prisma.tecnico.findMany.mockResolvedValue([
      {
        id: 5,
        nome: 'Dono',
        empresaId: 2,
        usuarioId: 99,
        telefone: '5511977776666',
        empresa: { id: 2, nome: 'Chaveiro Beta' },
      },
    ]);

    const resultado = await resolverRemetente('5511977776666');
    expect(resultado[0].ehDono).toBe(true);
  });

  it('retorna N vínculos quando o mesmo telefone está em múltiplas empresas', async () => {
    prisma.tecnico.findMany.mockResolvedValue([
      {
        id: 1,
        nome: 'Técnico A',
        empresaId: 10,
        usuarioId: null,
        telefone: '5511988887777',
        empresa: { id: 10, nome: 'Empresa 10' },
      },
      {
        id: 2,
        nome: 'Técnico B',
        empresaId: 20,
        usuarioId: null,
        telefone: '5511988887777',
        empresa: { id: 20, nome: 'Empresa 20' },
      },
    ]);

    const resultado = await resolverRemetente('5511988887777');
    expect(resultado).toHaveLength(2);
    expect(resultado.map((v) => v.empresaId)).toEqual(expect.arrayContaining([10, 20]));
  });

  it('faz dedup por empresa quando 2 técnicos da mesma empresa casam (ex.: variante com e sem 9)', async () => {
    // Simula técnico gravado com o 9 e técnico gravado sem o 9 — mesma empresaId.
    prisma.tecnico.findMany.mockResolvedValue([
      {
        id: 1,
        nome: 'Técnico Com9',
        empresaId: 5,
        usuarioId: null,
        telefone: '5511988887777',
        empresa: { id: 5, nome: 'Única Empresa' },
      },
      {
        id: 2,
        nome: 'Técnico Sem9',
        empresaId: 5,
        usuarioId: null,
        telefone: '551188887777',
        empresa: { id: 5, nome: 'Única Empresa' },
      },
    ]);

    const resultado = await resolverRemetente('5511988887777');
    // Deve retornar apenas 1 vínculo para a empresa 5
    expect(resultado).toHaveLength(1);
    expect(resultado[0].empresaId).toBe(5);
    // O primeiro encontrado (id=1) tem precedência pelo dedup determinístico
    expect(resultado[0].tecnicoId).toBe(1);
  });
});
