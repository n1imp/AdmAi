// a11y (axe) — Metric Hub de `faturamento-liquido` (Receita liquida), nos estados que o usuário realmente encontra.
//
// Os três estados aqui não são redundantes: o Hub carregado, o de dado insuficiente e o de acesso
// negado renderizam árvores diferentes, e uma violação num deles não apareceria nos outros. Testar
// só o caminho feliz deixaria de fora justamente as telas que mais dependem de texto para
// comunicar — as que não têm número para mostrar.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MetricHubReceita from '../MetricHubReceita.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarDataCurta: (d) => String(d).slice(5),
}));

// Recharts precisa de layout, que o jsdom não computa. Os gráficos já são `aria-hidden`; o que o
// axe precisa examinar é a ALTERNATIVA TEXTUAL, que continua renderizando.
vi.mock('recharts', () => {
  const Stub = () => null;
  return {
    ResponsiveContainer: Stub, BarChart: Stub, Bar: Stub, LineChart: Stub, Line: Stub,
    XAxis: Stub, YAxis: Stub, Tooltip: Stub, CartesianGrid: Stub,
  };
});
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className, ...resto }) => (
    <a href={to} className={className} {...resto}>
      {children}
    </a>
  ),
}));

const AGREGADO = {
  metricId: 'faturamento-liquido',
  name: 'Receita líquida',
  version: '1.0.0',
  window: { inicio: '2026-04-01T00:00:00.000Z', fim: '2026-04-30T23:59:59.000Z' },
  scope: 'EMPRESA',
  status: 'VALUE',
  value: 12400,
  comparison: { valorAnterior: 126, variacaoAbsoluta: 16, variacaoPercentual: 12.7, direcao: 'SUBIU' },
  quality: { state: 'HIGH', recordCount: 142, warnings: [] },
  lineage: {
    formula: 'COUNT(Servico)', grain: 'empresa × período', sourceEntities: ['Servico'],
    appliedFilters: ['status = ativo'], timeSemantics: 'criadoEm',
  },
  permissions: { canDrillDown: true },
  allowed: { dimensoes: ['tecnico', 'local'], comparacoes: [], periodos: [], granularidades: ['dia'] },
  breakdown: null,
};

const SERIE = {
  granularidade: 'dia',
  timeSemantics: 'criadoEm',
  pontos: [{ dia: '2026-04-01', valor: 3 }, { dia: '2026-04-02', valor: 0 }],
};

function responder(agregado) {
  mockGet.mockImplementation((url) =>
    url.endsWith('/serie') ? Promise.resolve({ data: SERIE }) : Promise.resolve({ data: agregado })
  );
}

async function semViolacoes(container) {
  const v = violacoesRelevantes(await checarA11y(container));
  expect(v, formatarViolacoes(v)).toHaveLength(0);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('a11y — Metric Hub receita', () => {
  it('estado carregado', async () => {
    responder(AGREGADO);
    const { container } = render(<MetricHubReceita />);
    await screen.findAllByText(/R\$ 12400/);
    await semViolacoes(container);
  });

  it('estado de dado insuficiente', async () => {
    responder({ ...AGREGADO, status: 'INSUFFICIENT_DATA', value: null, reason: 'amostra pequena' });
    const { container } = render(<MetricHubReceita />);
    await screen.findByText(/Dados insuficientes para medir/);
    await semViolacoes(container);
  });

  it('estado com registros abertos — a tabela financeira precisa ser navegável', async () => {
    responder(AGREGADO);
    mockGet.mockImplementation((url) =>
      url.endsWith('/serie')
        ? Promise.resolve({ data: SERIE })
        : url.endsWith('/registros')
          ? Promise.resolve({
            data: {
              total: 1,
              paginacao: { limite: 100, offset: 0, nestaPagina: 1 },
              camposOmitidos: ['comissaoGerada'],
              registros: [{ id: 1, local: 'Centro', criadoEm: '2026-04-02T10:00:00Z', valorCobrado: 300, valorMaterial: 100, valorLiquido: 200 }],
            },
          })
          : Promise.resolve({ data: AGREGADO })
    );
    const { container } = render(<MetricHubReceita />);
    await screen.findAllByText(/R\$ 12400/);
    (await screen.findByRole('button', { name: /Ver os serviços que compõem/ })).click();
    await screen.findByRole('columnheader', { name: 'Líquido' });
    await semViolacoes(container);
  });

  it('estado de acesso negado', async () => {
    mockGet.mockRejectedValue({ response: { status: 403 } });
    const { container } = render(<MetricHubReceita />);
    await screen.findByText(/Sem acesso a esta métrica/);
    await semViolacoes(container);
  });
});
