import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import Dashboard from '../Dashboard.jsx';

// F8: cobertura dos ESTADOS do dashboard do Dono (loading/error/loaded/partial).
// Mocks dos colaboradores pesados p/ isolar a lógica de estado (DashboardWidgets encapsula o
// recharts + ops widgets; jsdom não tem ResizeObserver/layout).
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));
// `Link` entrou no mock quando o KPI de Serviços virou porta de entrada do Metric Hub: sem ele o
// mock deixa de cobrir o que o componente usa e a página inteira falha ao renderizar.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...resto }) => (
    <a href={to} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock('../DashboardWidgets.jsx', () => ({ default: () => <div data-testid="widgets" /> }));
vi.mock('../../components/WelcomeCard.jsx', () => ({ default: () => null }));
vi.mock('../../components/TourGuide.jsx', () => ({ startTour: vi.fn() }));
vi.mock('../../hooks/usePullToRefresh.js', () => ({
  usePullToRefresh: () => ({ containerRef: { current: null }, isRefreshing: false }),
}));

const dashDados = {
  lucro: 5000,
  margemLucro: 42,
  receitaBruta: 12000,
  receitaLiquida: 9000,
  totalMaterial: 1500,
  totalComissao: 2500,
  totalServicos: 40,
  ticketMedio: 300,
  comparativo: { receitaLiquida: 8, totalServicos: 5, ticketMedio: -2 },
};

const rota =
  (over = {}) =>
  (url) => {
    const u = String(url ?? '');
    if (u.startsWith('/dashboard')) return Promise.resolve(over.dashboard ?? { data: dashDados });
    if (u.startsWith('/avaliacoes'))
      return Promise.resolve(
        over.avaliacoes ?? { data: { resumo: { total: 5, media: 4.6, distribuicao: [] } } }
      );
    return Promise.resolve({ data: {} });
  };

describe('<Dashboard> — estados (F8)', () => {
  beforeEach(() => mockGet.mockReset());
  afterEach(cleanup);

  it('loading: mostra os skeletons de KPI com região de status', async () => {
    let resolver;
    mockGet.mockReturnValue(
      new Promise((r) => {
        resolver = r;
      })
    );
    render(<Dashboard />);
    expect(screen.getByRole('status', { name: 'Carregando indicadores' })).toBeInTheDocument();
    expect(screen.queryByText('Receita Bruta')).not.toBeInTheDocument();
    // Resolve p/ a limpeza não ficar pendurada num efeito não concluído.
    await act(async () => {
      resolver({ data: dashDados });
    });
  });

  it('error: api do dashboard rejeita → ErroBanner', async () => {
    mockGet.mockImplementation((url) =>
      String(url ?? '').startsWith('/dashboard')
        ? Promise.reject(new Error('x'))
        : Promise.resolve({ data: null })
    );
    render(<Dashboard />);
    expect(await screen.findByText('Não foi possível carregar os dados.')).toBeInTheDocument();
  });

  it('loaded: herói (lucro/margem) + KPIs + satisfação', async () => {
    mockGet.mockImplementation(rota());
    render(<Dashboard />);
    expect(await screen.findByText('Lucro do período')).toBeInTheDocument();
    expect(screen.getByText('Receita Bruta')).toBeInTheDocument();
    expect(screen.getByText('Ticket Médio')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('4.6')).toBeInTheDocument();
    expect(screen.getByTestId('widgets')).toBeInTheDocument();
  });

  it('partial: dados presentes mas sem avaliações → "Sem avaliações"', async () => {
    mockGet.mockImplementation(rota({ avaliacoes: { data: { resumo: null } } }));
    render(<Dashboard />);
    expect(await screen.findByText('Lucro do período')).toBeInTheDocument();
    expect(screen.getByText('Sem avaliações')).toBeInTheDocument();
    expect(screen.getByText('Receita Líquida')).toBeInTheDocument();
  });

  it('período sem NENHUM serviço: guia com CTA aparece e os KPIs zerados continuam', async () => {
    // O defeito do inventário: empresa nova via R$ 0,00 em seis cards sem nenhuma
    // orientação. O guia diz o que fazer; zero continua visível porque zero é informação.
    mockGet.mockImplementation(
      rota({
        dashboard: {
          data: {
            receitaBruta: 0,
            receitaLiquida: 0,
            totalMaterial: 0,
            totalComissao: 0,
            totalServicos: 0,
            ticketMedio: 0,
            lucro: 0,
            margemLucro: 0,
          },
        },
      })
    );
    render(<Dashboard />);
    expect(await screen.findByText(/nenhum serviço neste período/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /registrar serviço/i })).toHaveAttribute(
      'href',
      '/servicos/novo'
    );
    expect(screen.getByText(/receita bruta/i)).toBeInTheDocument();
  });

  it('com serviços no período o guia NÃO aparece — não é banner permanente', async () => {
    mockGet.mockImplementation(
      rota({
        dashboard: {
          data: {
            receitaBruta: 100,
            receitaLiquida: 90,
            totalMaterial: 5,
            totalComissao: 5,
            totalServicos: 3,
            ticketMedio: 30,
            lucro: 80,
            margemLucro: 80,
          },
        },
      })
    );
    render(<Dashboard />);
    expect(await screen.findByText(/receita bruta/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhum serviço neste período/i)).toBeNull();
  });
});
