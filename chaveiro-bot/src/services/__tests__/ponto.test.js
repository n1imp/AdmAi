import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock do prisma para isolar a máquina de ponto (sem banco).
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    registroPonto: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    tecnico: { findUnique: vi.fn() },
  },
}));

const { prisma } = await import('../../db/prisma.js');
const {
  registrarPonto, calcularDia, resumoMes, jornadaDiariaMin, temBancoDeHoras, formatarDuracao,
} = await import('../ponto.js');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.registroPonto.update.mockResolvedValue({});
});

describe('formatarDuracao', () => {
  it('formata minutos como "Xh Ymin"', () => {
    expect(formatarDuracao(90)).toBe('1h 30min');
    expect(formatarDuracao(0)).toBe('0h 0min');
    expect(formatarDuracao(480)).toBe('8h 0min');
  });
});

describe('jornadaDiariaMin / temBancoDeHoras', () => {
  it('usa o padrão da modalidade', () => {
    expect(jornadaDiariaMin({ modalidade: 'clt' })).toBe(480);
    expect(jornadaDiariaMin({ modalidade: 'clt_meio' })).toBe(360);
    expect(jornadaDiariaMin({ modalidade: 'clt_12x36' })).toBe(720);
    expect(jornadaDiariaMin({ modalidade: 'autonomo' })).toBeNull();
  });
  it('campo explícito tem precedência sobre o padrão', () => {
    expect(jornadaDiariaMin({ modalidade: 'clt', jornadaDiariaMin: 400 })).toBe(400);
  });
  it('temBancoDeHoras só para modalidades CLT', () => {
    expect(temBancoDeHoras('clt')).toBe(true);
    expect(temBancoDeHoras('clt_12x36')).toBe(true);
    expect(temBancoDeHoras('autonomo')).toBe(false);
    expect(temBancoDeHoras('intermitente')).toBe(false);
  });
});

describe('calcularDia (hora extra + saldo por modalidade)', () => {
  it('CLT padrão: HE acima de 8h, saldo positivo/negativo', () => {
    expect(calcularDia({ modalidade: 'clt' }, 540)).toEqual({ horaExtraMinutos: 60, saldoMinutos: 60 });
    expect(calcularDia({ modalidade: 'clt' }, 420)).toEqual({ horaExtraMinutos: 0, saldoMinutos: -60 });
  });
  it('meio período: HE acima de 6h', () => {
    expect(calcularDia({ modalidade: 'clt_meio' }, 420)).toEqual({ horaExtraMinutos: 60, saldoMinutos: 60 });
  });
  it('12x36: HE acima de 12h', () => {
    expect(calcularDia({ modalidade: 'clt_12x36' }, 780)).toEqual({ horaExtraMinutos: 60, saldoMinutos: 60 });
  });
  it('autônomo/intermitente: sem banco → HE e saldo zerados', () => {
    expect(calcularDia({ modalidade: 'autonomo' }, 600)).toEqual({ horaExtraMinutos: 0, saldoMinutos: 0 });
    expect(calcularDia({ modalidade: 'intermitente' }, 600)).toEqual({ horaExtraMinutos: 0, saldoMinutos: 0 });
  });
});

describe('resumoMes', () => {
  it('agrega total trabalhado, saldo do banco e hora extra', () => {
    const tecnico = { modalidade: 'clt' };
    const registros = [
      { data: new Date(), totalMinutos: 540 }, // +60 HE, saldo +60
      { data: new Date(), totalMinutos: 420 }, // 0 HE, saldo -60
    ];
    const r = resumoMes(tecnico, registros);
    expect(r.totalTrabalhadoMin).toBe(960);
    expect(r.horaExtraMin).toBe(60);
    expect(r.saldoBancoMin).toBe(0);
    expect(r.dias).toHaveLength(2);
  });
});

describe('registrarPonto (máquina do dia, timestamp do servidor)', () => {
  const base = { empresaId: 1, tecnicoId: 1, tecnico: { modalidade: 'clt' } };

  it('estado 0 (sem entrada) → registra ENTRADA com o timestamp do servidor', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({ id: 9, entradaEm: null });
    const agora = new Date('2026-06-15T12:00:00Z');
    const { resposta } = await registrarPonto({ ...base, agora });
    expect(resposta).toMatch(/^✅ Entrada registrada:/);
    // prova que usa o `agora` do servidor (não a hora do cliente)
    expect(prisma.registroPonto.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 9 }, data: { entradaEm: agora } }),
    );
  });

  it('estado 1 (entrada feita) → SAÍDA ALMOÇO', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({ id: 9, entradaEm: new Date(), almocoSaidaEm: null });
    const { resposta } = await registrarPonto({ ...base, agora: new Date() });
    expect(resposta).toMatch(/Saída para almoço/);
    expect(prisma.registroPonto.update.mock.calls[0][0].data).toHaveProperty('almocoSaidaEm');
  });

  it('estado 2 (almoço saída) → VOLTA ALMOÇO', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({
      id: 9, entradaEm: new Date(), almocoSaidaEm: new Date(), almocoVoltaEm: null,
    });
    const { resposta } = await registrarPonto({ ...base, agora: new Date() });
    expect(resposta).toMatch(/Volta do almoço/);
    expect(prisma.registroPonto.update.mock.calls[0][0].data).toHaveProperty('almocoVoltaEm');
  });

  it('estado 3 (volta feita) → SAÍDA: total descontando almoço, sem HE em 8h', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({
      id: 9,
      entradaEm: new Date('2026-06-15T12:00:00Z'),     // 09:00 SP
      almocoSaidaEm: new Date('2026-06-15T15:00:00Z'), // 12:00 SP
      almocoVoltaEm: new Date('2026-06-15T16:00:00Z'), // 13:00 SP
      saidaEm: null,
    });
    const agora = new Date('2026-06-15T21:00:00Z');    // 18:00 SP → 9h - 1h almoço = 8h
    const { resposta } = await registrarPonto({ ...base, agora });
    expect(resposta).toMatch(/Saída registrada/);
    expect(resposta).toMatch(/Horas hoje: 8h 0min/);
    expect(resposta).not.toMatch(/Hora extra/);
    expect(prisma.registroPonto.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saidaEm: agora, totalMinutos: 480, horaExtraMinutos: 0 } }),
    );
  });

  it('estado 3 com 9h trabalhadas → 1h de HORA EXTRA (CLT)', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({
      id: 9,
      entradaEm: new Date('2026-06-15T12:00:00Z'),
      almocoSaidaEm: new Date('2026-06-15T15:00:00Z'),
      almocoVoltaEm: new Date('2026-06-15T16:00:00Z'),
      saidaEm: null,
    });
    const agora = new Date('2026-06-15T22:00:00Z');    // 19:00 SP → 10h - 1h = 9h
    const { resposta } = await registrarPonto({ ...base, agora });
    expect(resposta).toMatch(/Horas hoje: 9h 0min/);
    expect(resposta).toMatch(/Hora extra: 1h 0min/);
    expect(prisma.registroPonto.update.mock.calls[0][0].data.horaExtraMinutos).toBe(60);
  });

  it('dia já completo → informa estado atual sem nova gravação', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue({
      id: 9, entradaEm: new Date(), almocoSaidaEm: new Date(), almocoVoltaEm: new Date(),
      saidaEm: new Date(), totalMinutos: 480, horaExtraMinutos: 0,
    });
    const { resposta } = await registrarPonto({ ...base, agora: new Date() });
    expect(resposta).toMatch(/já está completo/);
    expect(prisma.registroPonto.update).not.toHaveBeenCalled();
  });

  it('cria o registro do dia quando ainda não existe', async () => {
    prisma.registroPonto.findUnique.mockResolvedValue(null);
    prisma.registroPonto.create.mockResolvedValue({ id: 10, entradaEm: null });
    await registrarPonto({ ...base, agora: new Date() });
    expect(prisma.registroPonto.create).toHaveBeenCalled();
  });
});
