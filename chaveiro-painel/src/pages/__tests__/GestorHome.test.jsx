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

// Roteia por URL: /dashboard, /servicos/pendentes, /avaliacoes e /servicos?limit=5 são
// endpoints DISTINTOS já existentes (F7 é surfacing, sem endpoints novos).
function rota(overrides = {}) {
  return (url) => {
    if (url === '/servicos/pendentes')
      return Promise.resolve(overrides.pendentes ?? { data: [servico(9), servico(10)] });
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

describe('GestorHome (F7 — indicadores + operacional)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(rota());
  });
  afterEach(cleanup);

  it('mostra ações, indicadores do período (KPIs) e a fila recente', async () => {
    setup();

    expect(screen.getByRole('heading', { name: /Operação de hoje/ })).toBeInTheDocument();
    // Ações operacionais desambiguadas pelo subtítulo (o card "Aprovações pendentes" também é link).
    for (const nome of [
      /Revisar serviços pendentes/,
      /Fila e histórico completo/,
      /Técnicos e desempenho/,
      /Saldo e reposição/,
    ]) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument();
    }

    // KPIs do período (via /dashboard, que o gestor pode acessar)
    expect(await screen.findByText('Receita Líquida')).toBeInTheDocument();
    expect(screen.getByText('Ticket Médio')).toBeInTheDocument();

    // Fila recente (via /servicos?limit=5)
    const linha = await screen.findByRole('link', { name: /Lucas 1/ });
    expect(linha.getAttribute('href')).toContain('/servicos?servico=1');

    expect(mockGet).toHaveBeenCalledWith('/servicos?limit=5');
    expect(mockGet).toHaveBeenCalledWith('/dashboard?periodo=mes');
  });

  it('surfacing de aprovações pendentes usa /servicos/pendentes (contagem + CTA)', async () => {
    setup();
    const card = (await screen.findByText('Aprovações pendentes')).closest('a');
    await waitFor(() => expect(card).toHaveTextContent('2'));
    expect(card.getAttribute('href')).toContain('/aprovacoes');
    expect(mockGet).toHaveBeenCalledWith('/servicos/pendentes');
  });

  it('estado vazio quando não há serviços recentes', async () => {
    mockGet.mockImplementation(
      rota({
        servicos: { data: { data: [], total: 0 } },
        pendentes: { data: [] },
        avaliacoes: { data: null },
      })
    );
    setup();
    expect(await screen.findByText(/Nenhum serviço ainda/)).toBeInTheDocument();
  });
});
