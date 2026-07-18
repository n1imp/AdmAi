import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Aprovacoes from '../Aprovacoes.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

vi.mock('../../components/Toast.jsx', () => ({
  useToast: () => vi.fn(),
}));

// BackHeader usa useNavigate; EstadoVazio usa Link — evita precisar de Router.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const PENDENTE = {
  id: 7,
  local: 'Casa do cliente',
  descricao: 'Abertura de porta',
  valorCobrado: 200,
  valorLiquido: 200,
  comissaoGerada: 40,
  clienteNome: 'João',
  criadoEm: '2026-06-20T10:00:00Z',
  tecnico: { id: 3, nome: 'Carlos' },
};

describe('<Aprovacoes>', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('lista os serviços pendentes com técnico e ações', async () => {
    mockGet.mockResolvedValue({ data: [PENDENTE] });

    render(<Aprovacoes />);

    await waitFor(() => expect(screen.getByText('Carlos')).toBeInTheDocument());
    expect(screen.getByText('Abertura de porta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aprovar/i })).toBeInTheDocument();
  });

  it('remove o item da lista ao aprovar', async () => {
    mockGet.mockResolvedValue({ data: [PENDENTE] });
    mockPost.mockResolvedValue({ data: {} });

    render(<Aprovacoes />);
    await waitFor(() => expect(screen.getByText('Abertura de porta')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /Aprovar/i }));

    await waitFor(() => expect(screen.queryByText('Abertura de porta')).not.toBeInTheDocument());
    expect(mockPost).toHaveBeenCalledWith('/servicos/7/aprovar');
  });

  it('mostra estado vazio quando não há pendências', async () => {
    mockGet.mockResolvedValue({ data: [] });

    render(<Aprovacoes />);

    await waitFor(() =>
      expect(screen.getByText('Nenhum serviço aguardando aprovação')).toBeInTheDocument()
    );
  });
});
