import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Servicos from '../Servicos.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), delete: vi.fn() },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => <a href={to} className={className}>{children}</a>,
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));

const servico = (id) => ({
  id,
  tecnico: { nome: `Tec ${id}` },
  local: 'Casa do cliente',
  descricao: `Serv ${id}`,
  valorCobrado: 100,
  valorMaterial: 0,
  valorLiquido: 100,
  criadoEm: '2026-06-20T10:00:00Z',
});

describe('<Servicos> — paginação keyset (cursor)', () => {
  beforeEach(() => mockGet.mockReset());

  it('carga inicial vai SEM cursor e "Carregar mais" envia o nextCursor da resposta', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [servico(1)], total: 2, nextCursor: 'CUR1' } })
      .mockResolvedValueOnce({ data: { data: [servico(2)], total: 2, nextCursor: null } });

    render(<Servicos />);
    await waitFor(() => expect(screen.getByText('Serv 1')).toBeInTheDocument());

    // 1ª chamada: sem cursor.
    expect(mockGet.mock.calls[0][0]).toContain('/servicos?');
    expect(mockGet.mock.calls[0][0]).not.toContain('cursor=');

    // "Carregar mais" (temMais pois 1 < total=2) → usa o nextCursor da 1ª resposta.
    await userEvent.click(screen.getByText('Carregar mais'));
    await waitFor(() => expect(screen.getByText('Serv 2')).toBeInTheDocument());
    expect(mockGet.mock.calls[1][0]).toContain('cursor=CUR1');

    // Após acumular 2 de 2, o botão some (temMais falso).
    expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();
    // Serv 1 continua na tela (append, não substituição).
    expect(screen.getByText('Serv 1')).toBeInTheDocument();
  });
});
