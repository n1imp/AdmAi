import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeuPainel from '../MeuPainel.jsx';

// F9/M1: adoção visual do seletor de período + série diária em /me/metricas.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarDataCurta: (d) => String(d).slice(5), // MM-DD, suficiente p/ teste
}));

// recharts não tem layout no jsdom — stub. O gráfico é aria-hidden e tem alternativa
// textual (sr-only), então a asserção recai sobre KPIs + texto alternativo, não sobre SVG.
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    ResponsiveContainer: Stub,
    BarChart: Stub,
    Bar: Stub,
    XAxis: Stub,
    YAxis: Stub,
    Tooltip: Stub,
    CartesianGrid: Stub,
  };
});

// useNavigate (atalhos) e Link (EstadoVazio/aviso de pendências) — evita precisar de Router.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const METRICAS = {
  tecnico: { id: 1, nome: 'Carlos Silva', comissao: 20, metaMensal: 5000, fotoPerfil: null },
  totalServicos: 12,
  comissaoGanha: 800,
  totalRecebido: 500,
  saldoPendente: 300,
  servicosPendentes: 0,
  mesAtual: { receitaLiquida: 2000, comissao: 400, meta: 5000, progressoMeta: 40 },
  periodo: { chave: 'mes', servicos: 8, receitaLiquida: 1600, comissao: 320 },
  serie: [
    { data: '2026-07-01', receita: 900 },
    { data: '2026-07-02', receita: 700 },
  ],
};

describe('<MeuPainel> — F9/M1 desempenho por período', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('carrega /me/metricas com período padrão (mes) e mostra os KPIs do período', async () => {
    mockGet.mockResolvedValue({ data: METRICAS });

    render(<MeuPainel />);

    await waitFor(() => expect(screen.getByText('MEU DESEMPENHO')).toBeInTheDocument());
    // Primeira chamada usa o período default `mes`.
    expect(mockGet).toHaveBeenCalledWith('/me/metricas?periodo=mes');
    // KPIs do período (valores distintos dos KPIs totais).
    expect(screen.getByText('R$ 1600.00')).toBeInTheDocument(); // receita líquida do período
    expect(screen.getByText('R$ 320.00')).toBeInTheDocument(); // comissão do período
    // Alternativa textual do gráfico (acessibilidade — chart é aria-hidden).
    expect(screen.getByText(/Receita líquida por dia no período/)).toBeInTheDocument();
  });

  it('trocar o período refaz o fetch com o novo ?periodo=', async () => {
    mockGet.mockResolvedValue({ data: METRICAS });
    render(<MeuPainel />);
    await waitFor(() => expect(screen.getByText('MEU DESEMPENHO')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }));

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/me/metricas?periodo=hoje'));
  });

  /* ── GAP-UI-04 ──────────────────────────────────────────────────────────────
     Dois defeitos de LEITURA, não de dado. O card mostra `receitaLiquida` sob o rótulo "Meta do
     mês": sem meta definida ele afirmava que a meta era o próprio resultado, e o texto abaixo
     dizia que não havia meta. E `comissaoGanha` e `saldoPendente` são métricas distintas que
     coincidem enquanto nada foi repassado — dois cards de "Comissão" com o mesmo número levam a
     somar. Os casos abaixo fixam os DOIS estados de cada um. */

  it('SEM meta: o rótulo diz o que o número é, e não o chama de meta', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...METRICAS,
        tecnico: { ...METRICAS.tecnico, metaMensal: null },
        mesAtual: { receitaLiquida: 260, comissao: 52, meta: null, progressoMeta: null },
      },
    });
    render(<MeuPainel />);

    expect(await screen.findByText(/Receita líquida do mês/i)).toBeInTheDocument();
    /* A contradição fixada: não pode existir "Meta do mês" na mesma tela que "Sem meta definida". */
    expect(screen.queryByText('Meta do mês')).not.toBeInTheDocument();
    expect(screen.getByText(/Sem meta definida/i)).toBeInTheDocument();
  });

  it('COM meta: volta a ser meta, com o alvo ao lado', async () => {
    mockGet.mockResolvedValue({ data: METRICAS });
    render(<MeuPainel />);

    /* Contraprova do caso acima: o rótulo "Meta do mês" não sumiu do produto — ele passou a
       depender de haver meta. Sem esta asserção, apagá-lo de vez também passaria. */
    expect(await screen.findByText('Meta do mês')).toBeInTheDocument();
    expect(screen.queryByText(/Sem meta definida/i)).not.toBeInTheDocument();
  });

  it('comissão: mostra a composição quando já houve repasse', async () => {
    mockGet.mockResolvedValue({ data: METRICAS }); // ganha 800, recebido 500, pendente 300
    render(<MeuPainel />);

    /* Sem isto, os dois cards de comissão ficam sem relação visível e o técnico soma 800+300. */
    expect(await screen.findByText(/já recebeu/i)).toBeInTheDocument();
    expect(screen.getByText(/Comissão gerada no período/i)).toBeInTheDocument();
  });

  it('comissão: quando nada foi repassado, diz isso em vez de repetir o número em silêncio', async () => {
    mockGet.mockResolvedValue({
      data: { ...METRICAS, comissaoGanha: 52, totalRecebido: 0, saldoPendente: 52 },
    });
    render(<MeuPainel />);

    /* O estado do runtime observado: ganha 52, recebido 0, pendente 52 — dois cards com R$ 52,00
       e nenhuma pista de que são a mesma comissão vista de dois ângulos. */
    expect(await screen.findByText(/nada foi repassado ainda/i)).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há serviços no período', async () => {
    mockGet.mockResolvedValue({
      data: {
        ...METRICAS,
        periodo: { chave: 'hoje', servicos: 0, receitaLiquida: 0, comissao: 0 },
        serie: [],
      },
    });

    render(<MeuPainel />);

    await waitFor(() =>
      expect(screen.getByText('Nenhum serviço neste período')).toBeInTheDocument()
    );
  });

  it('mostra erro com opção de tentar novamente quando a API falha', async () => {
    mockGet.mockRejectedValue(new Error('falha'));

    render(<MeuPainel />);

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar suas métricas.')).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeInTheDocument();
  });
});
