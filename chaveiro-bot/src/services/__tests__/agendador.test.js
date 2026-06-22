import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isola o agendador de efeitos colaterais: WhatsApp, notificações e cron.
vi.mock('../whatsapp/gateway.js', () => ({ enviarMensagem: vi.fn() }));
vi.mock('../notificacao.js', () => ({ notificarAdmins: vi.fn() }));
vi.mock('../avaliacao.js', () => ({ dispararAvaliacoesPendentes: vi.fn() }));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

// fs mockado: captura os arquivos de selfie que o expurgo de ponto tenta apagar.
const unlinkMock = vi.fn(async () => {});
vi.mock('node:fs/promises', () => ({ unlink: (...a) => unlinkMock(...a) }));

// prisma mockado: controla os serviços retornados para o resumo e os dados de retenção.
const findManyMock = vi.fn();
const batidaFindManyMock = vi.fn();
const batidaUpdateManyMock = vi.fn(async () => ({ count: 0 }));
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    servico: { findMany: (...a) => findManyMock(...a) },
    empresa: { findFirst: async () => ({ id: 1 }) },
    empresaWhatsapp: { findMany: async () => [] },
    sessaoConversa: { deleteMany: async () => ({ count: 0 }) },
    avaliacao: { updateMany: async () => ({ count: 0 }) },
    batidaPonto: {
      findMany: (...a) => batidaFindManyMock(...a),
      updateMany: (...a) => batidaUpdateManyMock(...a),
    },
  },
}));

const { gerarResumoSemanal, limparDadosAntigos } = await import('../agendador.js');

beforeEach(() => vi.clearAllMocks());

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

describe('limparDadosAntigos (retenção LGPD do ponto)', () => {
  it('apaga o arquivo de selfie e zera selfie/geo das batidas antigas', async () => {
    batidaFindManyMock.mockResolvedValueOnce([
      { id: 10, selfieUrl: '/uploads/ponto-aaa.jpg' },
      { id: 11, selfieUrl: null }, // batida antiga só com geo (sem selfie)
    ]);

    const r = await limparDadosAntigos(new Date('2026-06-22T03:30:00Z'));

    expect(r.pontoExpurgados).toBe(2);
    // só apaga arquivo quando há selfieUrl, usando o basename (anti path traversal)
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0][0]).toContain('ponto-aaa.jpg');
    // zera os campos sensíveis das duas batidas numa única updateMany
    expect(batidaUpdateManyMock).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] } },
      data: { selfieUrl: null, lat: null, lng: null, precisao: null },
    });
  });

  it('é no-op quando não há batidas antigas a expurgar', async () => {
    batidaFindManyMock.mockResolvedValueOnce([]);
    const r = await limparDadosAntigos(new Date('2026-06-22T03:30:00Z'));
    expect(r.pontoExpurgados).toBe(0);
    expect(unlinkMock).not.toHaveBeenCalled();
    expect(batidaUpdateManyMock).not.toHaveBeenCalled();
  });
});
