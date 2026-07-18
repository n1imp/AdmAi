import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardWidgets from '../DashboardWidgets.jsx';

// F8 / O-11: os gráficos do dashboard do Dono devem ser aria-hidden e ter alternativa textual.
// recharts é stubado (jsdom não tem layout/ResizeObserver) — só a estrutura própria do widget
// (contêiner aria-hidden + texto alternativo) importa aqui.
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    LineChart: Stub,
    Line: Stub,
    CartesianGrid: Stub,
    PieChart: Stub,
    Pie: Stub,
    Cell: Stub,
    Legend: Stub,
  };
});

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarDataCurta: (v) => String(v),
}));

const dados = {
  porTecnico: [
    {
      tecnico: 'Ana',
      servicos: 5,
      ticketMedio: 100,
      comissao: 50,
      receitaLiquida: 500,
      percentualReceita: 60,
    },
  ],
  porLocal: [{ local: 'Casa do cliente', receita: 800 }],
  evolucaoDiaria: [
    { data: '2026-06-01', receita: 100 },
    { data: '2026-06-02', receita: 200 },
  ],
};

const setup = () =>
  render(<DashboardWidgets dados={dados} />, {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });

describe('DashboardWidgets — alternativa textual dos gráficos (O-11 / F8)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockGet.mockReset().mockResolvedValue({ data: [] }); // ops widgets self-fetch → vazios
  });
  afterEach(cleanup);

  it('cada gráfico é aria-hidden e tem alternativa textual', () => {
    setup();

    // Seções dos gráficos presentes
    expect(screen.getByText('DESEMPENHO POR TÉCNICO')).toBeInTheDocument();
    expect(screen.getByText('RECEITA POR LOCAL')).toBeInTheDocument();
    expect(screen.getByText('EVOLUÇÃO DIÁRIA')).toBeInTheDocument();

    // Alternativas textuais (o gráfico em si é decorativo/aria-hidden)
    expect(screen.getByText('Ana')).toBeInTheDocument(); // lista por técnico
    expect(screen.getByText(/Casa do cliente/)).toBeInTheDocument(); // sr-only de local
    expect(screen.getByText(/Evolução da receita em 2 dias/)).toBeInTheDocument(); // sr-only de evolução

    // Os contêineres de gráfico são escondidos da árvore de acessibilidade.
    expect(document.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3);
  });
});
