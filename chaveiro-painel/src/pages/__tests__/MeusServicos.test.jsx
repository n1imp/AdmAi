import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeusServicos from '../MeusServicos.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

// BackHeader/FAB usam useNavigate; EstadoVazio usa Link; a página usa useSearchParams.
// `mockSearchParams` é controlável por teste (o prefixo `mock` é permitido no hoisting do vi.mock).
let mockSearchParams = new URLSearchParams('');
const mockSetSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [mockSearchParams, mockSetSearchParams],
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const tres = [
  {
    id: 1,
    status: 'ativo',
    local: 'Casa',
    descricao: 'Serviço aprovado A',
    valorCobrado: 100,
    comissaoGerada: 30,
  },
  {
    id: 2,
    status: 'pendente',
    local: 'Loja',
    descricao: 'Serviço pendente B',
    valorCobrado: 200,
    comissaoGerada: 60,
  },
  {
    id: 3,
    status: 'rejeitado',
    local: 'Contrato',
    descricao: 'Serviço rejeitado C',
    valorCobrado: 50,
    comissaoGerada: 0,
  },
];

describe('<MeusServicos>', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockSearchParams = new URLSearchParams('');
    mockSetSearchParams.mockReset();
  });

  it('lista os serviços próprios com o badge de status correto', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: 1,
          local: 'Casa do cliente',
          descricao: 'Troca de fechadura',
          valorCobrado: 150,
          comissaoGerada: 30,
          status: 'pendente',
          clienteNome: 'Ana',
          criadoEm: '2026-06-20T10:00:00Z',
        },
        {
          id: 2,
          local: 'Contrato',
          descricao: 'Cópia de chave',
          valorCobrado: 50,
          comissaoGerada: 10,
          status: 'ativo',
          clienteNome: null,
          criadoEm: '2026-06-20T11:00:00Z',
        },
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

  it('filtra por status ao clicar num filtro (F7)', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: tres });

    render(<MeusServicos />);
    await waitFor(() => expect(screen.getByText('Serviço aprovado A')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Aguardando/ }));
    expect(screen.getByText('Serviço pendente B')).toBeInTheDocument();
    expect(screen.queryByText('Serviço aprovado A')).not.toBeInTheDocument();
    expect(screen.queryByText('Serviço rejeitado C')).not.toBeInTheDocument();
  });

  it('deep-link ?status=pendente pré-seleciona o filtro Aguardando (F7)', async () => {
    mockSearchParams = new URLSearchParams('status=pendente');
    mockGet.mockResolvedValue({ data: tres });

    render(<MeusServicos />);
    await waitFor(() => expect(screen.getByText('Serviço pendente B')).toBeInTheDocument());

    expect(screen.queryByText('Serviço aprovado A')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aguardando/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});
