import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MeusServicos from '../MeusServicos.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

// BackHeader/FAB usam useNavigate; EstadoVazio usa Link — evita precisar de Router.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => <a href={to} className={className}>{children}</a>,
}));

describe('<MeusServicos>', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('lista os serviços próprios com o badge de status correto', async () => {
    mockGet.mockResolvedValue({
      data: [
        { id: 1, local: 'Casa do cliente', descricao: 'Troca de fechadura', valorCobrado: 150, comissaoGerada: 30, status: 'pendente', clienteNome: 'Ana', criadoEm: '2026-06-20T10:00:00Z' },
        { id: 2, local: 'Contrato', descricao: 'Cópia de chave', valorCobrado: 50, comissaoGerada: 10, status: 'ativo', clienteNome: null, criadoEm: '2026-06-20T11:00:00Z' },
      ],
    });

    render(<MeusServicos />);

    await waitFor(() => expect(screen.getByText('Troca de fechadura')).toBeInTheDocument());
    expect(screen.getByText('Aguardando aprovação')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('mostra estado vazio quando não há serviços', async () => {
    mockGet.mockResolvedValue({ data: [] });

    render(<MeusServicos />);

    await waitFor(() => expect(screen.getByText('Nenhum serviço ainda')).toBeInTheDocument());
  });
});
