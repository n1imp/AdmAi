import { describe, it, expect, vi } from 'vitest';

// Isola o agendador de efeitos colaterais: WhatsApp, notificações e cron.
vi.mock('../whatsapp/gateway.js', () => ({ enviarMensagem: vi.fn() }));
vi.mock('../notificacao.js', () => ({ notificarAdmins: vi.fn() }));
vi.mock('../avaliacao.js', () => ({ dispararAvaliacoesPendentes: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

// prisma mockado: controla os serviços retornados para o resumo.
const findManyMock = vi.fn();
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    servico: { findMany: (...a) => findManyMock(...a) },
    empresa: { findFirst: async () => ({ id: 1 }) },
    empresaWhatsapp: { findMany: async () => [] },
  },
}));

const { gerarResumoSemanal } = await import('../agendador.js');

describe('gerarResumoSemanal', () => {
  it('agrega receita líquida por técnico e ordena o ranking', async () => {
    findManyMock.mockResolvedValueOnce([
      { valorLiquido: 100, tecnico: { nome: 'Ana' } },
      { valorLiquido: 250, tecnico: { nome: 'Bruno' } },
      { valorLiquido: 50, tecnico: { nome: 'Ana' } },
    ]);
    const r = await gerarResumoSemanal(new Date('2026-06-03T12:00:00Z'), 1);

    expect(r.totalServicos).toBe(3);
    expect(r.receitaTotal).toBe(400);
    expect(r.ranking[0]).toMatchObject({ tecnico: 'Bruno', receitaLiquida: 250 });
    expect(r.ranking[1]).toMatchObject({ tecnico: 'Ana', receitaLiquida: 150, servicos: 2 });
    expect(r.texto).toContain('RESUMO DA SEMANA');
    expect(r.texto).toContain('Bruno');
  });

  it('gera texto coerente quando não há serviços na semana', async () => {
    findManyMock.mockResolvedValueOnce([]);
    const r = await gerarResumoSemanal(new Date('2026-06-03T12:00:00Z'), 1);
    expect(r.totalServicos).toBe(0);
    expect(r.receitaTotal).toBe(0);
    expect(r.ranking).toEqual([]);
    expect(r.texto).toContain('Nenhum serviço registrado');
  });
});
