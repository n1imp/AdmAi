import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GestorHome from '../GestorHome.jsx';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

const servico = (id) => ({
  id,
  tecnico: { nome: `Lucas ${id}` },
  local: 'Casa do cliente',
  criadoEm: '2026-06-20T10:00:00Z',
  valorLiquido: 100,
});

// F9/M2: o operacional (pendências + presença do time) vem num único /gestor/indicadores.
// /dashboard (KPIs do período), /avaliacoes (satisfação c/ distribuição) e /servicos?limit=5
// (fila recente) seguem como endpoints distintos.
const INDICADORES = {
  pendentes: 2,
  presentes: 1,
  totalTecnicos: 2,
  presencaHoje: [
    { tecnicoId: 1, nome: 'Ana', status: 'trabalhando' },
    { tecnicoId: 2, nome: 'Bruno', status: 'ausente' },
  ],
  avaliacoes: { media: 4.6, total: 5 },
};

function rota(overrides = {}) {
  return (url) => {
    if (url === '/gestor/indicadores')
      return Promise.resolve(overrides.indicadores ?? { data: INDICADORES });
    if (url.startsWith('/dashboard'))
      return Promise.resolve(
        overrides.dashboard ?? {
          data: {
            totalServicos: 12,
            receitaLiquida: 3400,
            totalComissao: 800,
            ticketMedio: 283,
            comparativo: {},
          },
        }
      );
    if (url === '/avaliacoes')
      return Promise.resolve(
        overrides.avaliacoes ?? { data: { resumo: { total: 5, media: 4.6, distribuicao: [] } } }
      );
    if (url.startsWith('/servicos'))
      return Promise.resolve(overrides.servicos ?? { data: { data: [servico(1)], total: 1 } });
    return Promise.resolve({ data: {} });
  };
}

const setup = () => render(<GestorHome />, { wrapper: MemoryRouter });

describe('GestorHome (F7 + F9/M2 — indicadores + presença)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(rota());
  });
  afterEach(cleanup);

  it('mostra ações, indicadores do período (KPIs) e a fila recente', async () => {
    setup();

    expect(screen.getByRole('heading', { name: /Operação de hoje/ })).toBeInTheDocument();
    for (const nome of [
      /Revisar serviços pendentes/,
      /Fila e histórico completo/,
      /Técnicos e desempenho/,
      /Saldo e reposição/,
    ]) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument();
    }

    expect(await screen.findByText('Receita Líquida')).toBeInTheDocument();
    expect(screen.getByText('Ticket Médio')).toBeInTheDocument();

    const linha = await screen.findByRole('link', { name: /Lucas 1/ });
    expect(linha.getAttribute('href')).toContain('/servicos?servico=1');

    expect(mockGet).toHaveBeenCalledWith('/servicos?limit=5');
    expect(mockGet).toHaveBeenCalledWith('/dashboard?periodo=mes');
  });

  it('surfacing de aprovações pendentes usa /gestor/indicadores (contagem + CTA)', async () => {
    setup();
    const card = (await screen.findByText('Aprovações pendentes')).closest('a');
    await waitFor(() => expect(card).toHaveTextContent('2'));
    expect(card.getAttribute('href')).toContain('/aprovacoes');
    expect(mockGet).toHaveBeenCalledWith('/gestor/indicadores');
  });

  it('mostra a presença do time hoje a partir de /gestor/indicadores', async () => {
    setup();
    expect(await screen.findByText('PRESENÇA DO TIME')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Trabalhando')).toBeInTheDocument();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    expect(screen.getByText('Ausente')).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 presente/)).toBeInTheDocument();
  });

  it('presença degrada para estado vazio quando não há técnicos ativos', async () => {
    mockGet.mockImplementation(
      rota({
        indicadores: {
          data: { pendentes: 0, presentes: 0, totalTecnicos: 0, presencaHoje: [], avaliacoes: {} },
        },
      })
    );
    setup();
    expect(await screen.findByText('Nenhum técnico ativo')).toBeInTheDocument();
  });

  it('estado vazio quando não há serviços recentes', async () => {
    mockGet.mockImplementation(
      rota({
        servicos: { data: { data: [], total: 0 } },
        avaliacoes: { data: null },
      })
    );
    setup();
    expect(await screen.findByText(/Nenhum serviço ainda/)).toBeInTheDocument();
  });
});
