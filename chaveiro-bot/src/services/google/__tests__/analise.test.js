import { describe, it, expect, vi, beforeEach } from 'vitest';

// A chave precisa existir ANTES de carregar config/env.js (lido por analise.js).
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.AI_REVIEWS_MODEL = 'claude-haiku-4-5';

const createMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  // Precisa ser construível (new Anthropic(...)) — classe, não arrow.
  default: class MockAnthropic {
    constructor() {
      this.messages = { create: createMock };
    }
  },
}));
vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    avaliacaoGoogle: { findMany: vi.fn(), update: vi.fn() },
    analiseAvaliacoes: { upsert: vi.fn() },
  },
}));

const { prisma } = await import('../../../db/prisma.js');
const { analisarNovas, iaDisponivel } = await import('../analise.js');

function respostaIA(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

beforeEach(() => {
  vi.clearAllMocks();
  prisma.avaliacaoGoogle.update.mockResolvedValue({});
  prisma.analiseAvaliacoes.upsert.mockResolvedValue({});
});

describe('iaDisponivel', () => {
  it('true quando ANTHROPIC_API_KEY está presente', () => {
    expect(iaDisponivel()).toBe(true);
  });
});

describe('analisarNovas', () => {
  it('analisa só avaliações novas e grava a sugestão; usa Haiku SEM effort + JSON schema', async () => {
    prisma.avaliacaoGoogle.findMany
      .mockResolvedValueOnce([{ id: 1, reviewId: 'r1', nota: 5, comentario: 'Atendimento rápido e educado' }])
      .mockResolvedValueOnce([{ analiseJson: { elogios: ['rápido'], criticas: [] } }]);
    createMock.mockResolvedValue(
      respostaIA({ elogios: ['rápido', 'educado'], criticas: [], sugestaoResposta: 'Muito obrigado!' }),
    );

    const r = await analisarNovas(1);

    expect(r.analisadas).toBe(1);
    // chamada da IA: modelo correto, sem `effort`, saída estruturada por JSON schema
    const arg = createMock.mock.calls[0][0];
    expect(arg.model).toBe('claude-haiku-4-5');
    expect(arg).not.toHaveProperty('effort');
    expect(arg.output_config?.format?.type).toBe('json_schema');
    expect(arg.output_config).not.toHaveProperty('effort');
    // grava a análise na avaliação
    expect(prisma.avaliacaoGoogle.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: { analiseJson: { elogios: ['rápido', 'educado'], criticas: [], sugestaoResposta: 'Muito obrigado!' } },
      }),
    );
    // consolida o resumo agregado
    expect(prisma.analiseAvaliacoes.upsert).toHaveBeenCalled();
    // só processa o que veio do filtro analiseJson=null
    expect(prisma.avaliacaoGoogle.findMany.mock.calls[0][0].where).toMatchObject({
      empresaId: 1, analiseJson: { equals: null },
    });
  });

  it('no-op quando não há avaliações novas (não chama a IA)', async () => {
    prisma.avaliacaoGoogle.findMany.mockResolvedValueOnce([]);
    const r = await analisarNovas(1);
    expect(r.analisadas).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
    expect(prisma.avaliacaoGoogle.update).not.toHaveBeenCalled();
  });
});
