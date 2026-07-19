// a11y (axe) — Home do Gestor (F9/M2): indicadores + presença do time.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GestorHome from '../GestorHome.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

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

afterEach(cleanup);

describe('a11y (axe) — GestorHome (M2)', () => {
  it('indicadores + presença do time sem violações sérias/críticas', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/gestor/indicadores') return Promise.resolve({ data: INDICADORES });
      if (url.startsWith('/dashboard'))
        return Promise.resolve({
          data: {
            totalServicos: 12,
            receitaLiquida: 3400,
            totalComissao: 800,
            ticketMedio: 283,
            comparativo: {},
          },
        });
      if (url === '/avaliacoes')
        return Promise.resolve({ data: { resumo: { total: 5, media: 4.6, distribuicao: [] } } });
      return Promise.resolve({ data: { data: [], total: 0 } });
    });
    const { container } = render(<GestorHome />, { wrapper: MemoryRouter });
    await screen.findByText('PRESENÇA DO TIME');
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });
});
