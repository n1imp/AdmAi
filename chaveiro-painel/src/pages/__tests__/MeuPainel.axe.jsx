// a11y (axe) — Meu Painel (F9/M1), estado carregado com desempenho por período.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MeuPainel from '../MeuPainel.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarDataCurta: (d) => String(d).slice(5),
}));
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

afterEach(cleanup);

describe('a11y (axe) — MeuPainel (M1)', () => {
  it('estado carregado (período + série) sem violações sérias/críticas', async () => {
    mockGet.mockResolvedValue({ data: METRICAS });
    const { container } = render(<MeuPainel />);
    await screen.findByText('MEU DESEMPENHO');
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });
});
