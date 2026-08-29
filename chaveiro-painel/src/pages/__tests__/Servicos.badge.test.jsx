import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Servicos from '../Servicos.jsx';
import api from '../../lib/api.js';

vi.mock('../../lib/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  formatarMoeda: (v) =>
    'R$ ' +
    Number(v ?? 0)
      .toFixed(2)
      .replace('.', ','),
  formatarData: () => '28/08/2026 12:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ pode: () => true }) }));

/** Status é o ÚNICO chip semântico da linha (anti-carnaval, DECISOR §ii) e os rótulos são os
 *  canônicos do glossário — `pendente` cru NUNCA aparece na tela. */
describe('Servicos — semântica de status', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            descricao: 'A',
            local: 'X',
            status: 'pendente',
            valorCobrado: 10,
            tecnico: null,
            criadoEm: '2026-08-01T00:00:00Z',
          },
          {
            id: 2,
            descricao: 'B',
            local: 'X',
            status: 'ativo',
            valorCobrado: 10,
            tecnico: null,
            criadoEm: '2026-08-01T00:00:00Z',
          },
          {
            id: 3,
            descricao: 'C',
            local: 'X',
            status: 'rejeitado',
            valorCobrado: 10,
            tecnico: null,
            criadoEm: '2026-08-01T00:00:00Z',
          },
        ],
        total: 3,
        nextCursor: null,
      },
    });
  });

  function montar() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/servicos']}>
          <Servicos />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('rótulos canônicos presentes; domínio cru ausente', async () => {
    montar();
    await screen.findByText('Aguardando aprovação');
    expect(screen.getByText('Aprovado')).toBeTruthy();
    expect(screen.getByText('Rejeitado')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bpendente\b/i);
    expect(document.body.textContent).not.toMatch(/\bativo\b/);
  });

  it('exatamente UM chip de status por linha', async () => {
    montar();
    await screen.findByText('Aguardando aprovação');
    for (const linha of screen.getAllByRole('listitem')) {
      const chips = ['Aguardando aprovação', 'Aprovado', 'Rejeitado'].filter((r) =>
        linha.textContent.includes(r)
      );
      expect(chips.length, linha.textContent).toBe(1);
    }
  });
});
