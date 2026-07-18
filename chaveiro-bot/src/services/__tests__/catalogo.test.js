import { describe, it, expect } from 'vitest';
import {
  normalizar,
  levenshtein,
  similaridade,
  parsearItemMaterial,
  separarItens,
  encontrarNoCatalogo,
  resolverMateriaisDoServico,
} from '../catalogo.js';

describe('normalizar', () => {
  it('remove acentos, baixa caixa e colapsa espaços', () => {
    expect(normalizar('  Fechadura  TÉTRA ')).toBe('fechadura tetra');
  });
  it('trata null/undefined sem quebrar', () => {
    expect(normalizar(null)).toBe('');
  });
});

describe('levenshtein', () => {
  it('distância 0 para strings iguais', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('conta edições corretamente', () => {
    expect(levenshtein('gato', 'gata')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});

describe('similaridade', () => {
  it('1 para igualdade exata (ignorando acento/caixa)', () => {
    expect(similaridade('Fechadura', 'fechadura')).toBe(1);
  });
  it('score alto para substring', () => {
    expect(similaridade('fechadura', 'fechadura tetra')).toBeGreaterThan(0.6);
  });
  it('reconhece tokens fora de ordem', () => {
    expect(similaridade('tetra fechadura', 'fechadura tetra')).toBeGreaterThan(0.6);
  });
  it('score baixo para nomes não relacionados', () => {
    expect(similaridade('fechadura', 'cadeado')).toBeLessThan(0.6);
  });
});

describe('parsearItemMaterial', () => {
  it('quantidade padrão 1 quando não informada', () => {
    expect(parsearItemMaterial('Fechadura Tetra')).toEqual({
      nome: 'Fechadura Tetra',
      quantidade: 1,
    });
  });
  it('formato "Nome xN"', () => {
    expect(parsearItemMaterial('Fechadura Tetra x2')).toEqual({
      nome: 'Fechadura Tetra',
      quantidade: 2,
    });
  });
  it('formato "Nome - N"', () => {
    expect(parsearItemMaterial('Espelho - 3')).toEqual({ nome: 'Espelho', quantidade: 3 });
  });
  it('formato "N Nome" e "Nx Nome"', () => {
    expect(parsearItemMaterial('2 Fechadura')).toEqual({ nome: 'Fechadura', quantidade: 2 });
    expect(parsearItemMaterial('2x Fechadura')).toEqual({ nome: 'Fechadura', quantidade: 2 });
  });
  it('retorna null para linha vazia', () => {
    expect(parsearItemMaterial('')).toBeNull();
  });
});

describe('separarItens', () => {
  it('separa por vírgula, ponto-e-vírgula e " e "', () => {
    expect(separarItens('A, B; C e D')).toEqual(['A', 'B', 'C', 'D']);
  });
  it('lista vazia para entrada nula', () => {
    expect(separarItens(null)).toEqual([]);
  });
});

describe('encontrarNoCatalogo', () => {
  const catalogo = [
    { id: 1, nome: 'Fechadura Tetra', precoUnit: 50 },
    { id: 2, nome: 'Cadeado 40mm', precoUnit: 20 },
  ];
  it('encontra acima do limiar de confiança', () => {
    const r = encontrarNoCatalogo('fechadura tetra', catalogo);
    expect(r.material.id).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(0.6);
  });
  it('retorna null abaixo do limiar', () => {
    expect(encontrarNoCatalogo('chave de fenda', catalogo)).toBeNull();
  });
});

describe('resolverMateriaisDoServico (com client Prisma mockado)', () => {
  const client = {
    material: {
      findMany: async () => [
        {
          id: 1,
          nome: 'Fechadura Tetra',
          precoUnit: 50,
          precoVenda: 80,
          unidade: 'un',
          quantidadeAtual: 10,
        },
        {
          id: 2,
          nome: 'Espelho',
          precoUnit: 10,
          precoVenda: 18,
          unidade: 'un',
          quantidadeAtual: 5,
        },
      ],
    },
  };

  it('resolve itens e soma o valor pelo custo (precoUnit × qtd)', async () => {
    const r = await resolverMateriaisDoServico('Fechadura Tetra x2, Espelho', 1, client);
    expect(r.itens).toHaveLength(2);
    expect(r.valorMaterialTotal).toBe(110); // 50*2 + 10*1
    expect(r.naoEncontrados).toEqual([]);
  });

  it('reporta itens não encontrados no catálogo', async () => {
    const r = await resolverMateriaisDoServico('Chave Inexistente', 1, client);
    expect(r.itens).toEqual([]);
    expect(r.naoEncontrados).toContain('Chave Inexistente');
  });

  it('exige empresaId', async () => {
    await expect(resolverMateriaisDoServico('Fechadura', null, client)).rejects.toThrow();
  });

  it('retorna vazio para material em branco', async () => {
    const r = await resolverMateriaisDoServico('', 1, client);
    expect(r).toEqual({ itens: [], naoEncontrados: [], valorMaterialTotal: 0 });
  });
});
