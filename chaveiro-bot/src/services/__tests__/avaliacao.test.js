/**
 * Testes unitários para tentarCapturarResposta em services/avaliacao.js
 *
 * Estratégia London School: prisma e gateway são mockados; parser.js (variantesTelefone)
 * é real para testar a tolerância ao 9º dígito.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks declarados antes de importar o SUT.
// Caminhos relativos ao arquivo de teste em __tests__/:
//   ../../db/prisma.js  →  src/db/prisma.js
//   ../whatsapp/gateway.js  →  src/services/whatsapp/gateway.js
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    avaliacao: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../whatsapp/gateway.js', () => ({
  enviarMensagem: vi.fn(),
}));

import { prisma } from '../../db/prisma.js';
import { enviarMensagem } from '../whatsapp/gateway.js';
import { tentarCapturarResposta } from '../avaliacao.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tentarCapturarResposta', () => {
  it('retorna capturado:false quando não há avaliação com status enviada', async () => {
    prisma.avaliacao.findFirst.mockResolvedValue(null);

    const resultado = await tentarCapturarResposta('5511988887777', 'Boa tarde');
    expect(resultado).toEqual({ capturado: false });
    expect(prisma.avaliacao.update).not.toHaveBeenCalled();
  });

  it('retorna capturado:true com mensagem pedindo nota quando o texto não contém 1–5', async () => {
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 42,
      clienteTelefone: '5511988887777',
      status: 'enviada',
    });

    const resultado = await tentarCapturarResposta('5511988887777', 'Obrigado pelo serviço');
    expect(resultado.capturado).toBe(true);
    expect(resultado.resposta).toMatch(/1 a 5/i);
    // Não deve gravar nota quando o texto não tem avaliação
    expect(prisma.avaliacao.update).not.toHaveBeenCalled();
  });

  it('grava nota 5, status respondida e retorna agradecimento quando cliente responde "5"', async () => {
    const avaliacaoMock = {
      id: 99,
      clienteTelefone: '5511988887777',
      status: 'enviada',
    };
    prisma.avaliacao.findFirst.mockResolvedValue(avaliacaoMock);
    prisma.avaliacao.update.mockResolvedValue({ id: 99, nota: 5, status: 'respondida' });

    const resultado = await tentarCapturarResposta('5511988887777', '5');
    expect(resultado.capturado).toBe(true);
    expect(resultado.resposta).toMatch(/5/);

    // Verifica a chamada de update com os campos corretos
    const chamadaUpdate = prisma.avaliacao.update.mock.calls[0][0];
    expect(chamadaUpdate.where).toEqual({ id: 99 });
    expect(chamadaUpdate.data.nota).toBe(5);
    expect(chamadaUpdate.data.status).toBe('respondida');
    expect(chamadaUpdate.data.respondidoEm).toBeInstanceOf(Date);
  });

  it('grava nota 3 e retorna mensagem de agradecimento com feedback de melhoria', async () => {
    prisma.avaliacao.findFirst.mockResolvedValue({
      id: 55,
      clienteTelefone: '5511988887777',
      status: 'enviada',
    });
    prisma.avaliacao.update.mockResolvedValue({});

    const resultado = await tentarCapturarResposta('5511988887777', 'nota 3');
    expect(resultado.capturado).toBe(true);
    expect(resultado.resposta).toMatch(/3/);

    const chamadaUpdate = prisma.avaliacao.update.mock.calls[0][0];
    expect(chamadaUpdate.data.nota).toBe(3);
    expect(chamadaUpdate.data.status).toBe('respondida');
  });

  it('casa por variante do 9º dígito: JID sem 9 encontra avaliação gravada com 9', async () => {
    // Avaliação gravada COM o 9
    prisma.avaliacao.findFirst.mockImplementation(({ where }) => {
      if (where.clienteTelefone.in.includes('5511988887777')) {
        return Promise.resolve({ id: 7, clienteTelefone: '5511988887777', status: 'enviada' });
      }
      return Promise.resolve(null);
    });
    prisma.avaliacao.update.mockResolvedValue({});

    // Telefone chegando SEM o 9 (variante gerada por variantesTelefone)
    const resultado = await tentarCapturarResposta('551188887777', '4');
    expect(resultado.capturado).toBe(true);

    // findFirst deve ter sido chamado com ambas as variantes
    const chamada = prisma.avaliacao.findFirst.mock.calls[0][0];
    expect(chamada.where.clienteTelefone.in).toContain('551188887777');
    expect(chamada.where.clienteTelefone.in).toContain('5511988887777');
  });

  it('retorna capturado:false para telefone vazio (sem variantes)', async () => {
    const resultado = await tentarCapturarResposta('', 'qualquer coisa');
    expect(resultado).toEqual({ capturado: false });
    expect(prisma.avaliacao.findFirst).not.toHaveBeenCalled();
  });
});
