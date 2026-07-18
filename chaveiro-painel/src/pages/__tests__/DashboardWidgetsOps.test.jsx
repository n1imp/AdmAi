import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WIDGETS_OPS } from '../DashboardWidgetsOps.jsx';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026',
}));

const byId = (id) => WIDGETS_OPS.find((w) => w.id === id).Render;
const renderWidget = (Comp) => render(<Comp />, { wrapper: MemoryRouter });

describe('DashboardWidgetsOps (F7 surfacing)', () => {
  beforeEach(() => mockGet.mockReset());
  afterEach(cleanup);

  it('WidgetAprovacoes mostra a contagem de /servicos/pendentes e CTA /aprovacoes', async () => {
    mockGet.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    renderWidget(byId('aprovacoes'));

    const cta = await screen.findByRole('link', { name: /aguardando aprovação/i });
    expect(cta).toHaveTextContent('3');
    expect(cta.getAttribute('href')).toContain('/aprovacoes');
    expect(mockGet).toHaveBeenCalledWith('/servicos/pendentes');
  });

  it('WidgetEstoqueBaixo lista só materiais com alerta', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: 1,
          nome: 'Fechadura',
          unidade: 'un',
          quantidadeAtual: 1,
          estoqueMinimo: 5,
          alerta: true,
        },
        {
          id: 2,
          nome: 'Chave bruta',
          unidade: 'un',
          quantidadeAtual: 50,
          estoqueMinimo: 10,
          alerta: false,
        },
      ],
    });
    renderWidget(byId('estoque-baixo'));

    expect(await screen.findByText('Fechadura')).toBeInTheDocument();
    expect(screen.queryByText('Chave bruta')).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/estoque?periodo=30');
  });
});

describe('WIDGETS_OPS — integridade do registro (F8)', () => {
  it('ids únicos e cada entrada tem disponivel + Render', () => {
    const ids = WIDGETS_OPS.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length); // sem duplicatas
    for (const w of WIDGETS_OPS) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.label).toBe('string');
      expect(typeof w.disponivel).toBe('function');
      expect(typeof w.Render).toBe('function');
    }
  });
});
