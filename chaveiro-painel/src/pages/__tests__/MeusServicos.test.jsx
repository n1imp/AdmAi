import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MeusServicos from '../MeusServicos.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));

const mockToast = vi.fn();
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => mockToast }));

// F9/M3: helper de rota. Por padrão o probe /me/servico-atual está LIGADO e sem serviço atual.
const erroStatus = (status) => Object.assign(new Error('http'), { response: { status } });
function rotaM3({ servicos = [], atual = { data: { servico: null } }, atualErro } = {}) {
  return (url) => {
    if (url === '/me/servico-atual')
      return atualErro ? Promise.reject(atualErro) : Promise.resolve(atual);
    if (url === '/me/servicos') return Promise.resolve({ data: servicos });
    return Promise.resolve({ data: [] });
  };
}

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
    mockPost.mockReset();
    mockToast.mockReset();
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

  // ── F9/M3: serviço em andamento (atrás da flag SERVICO_ANDAMENTO_ENABLED) ──
  const ativo1 = {
    id: 1,
    status: 'ativo',
    local: 'Centro',
    descricao: 'Troca de segredo',
    valorCobrado: 200,
    comissaoGerada: 40,
    criadoEm: '2026-07-01T10:00:00Z',
  };

  it('M3 ligado: "Iniciar serviço" no ativo → inicia e mostra o banner do serviço atual', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation(rotaM3({ servicos: [ativo1] }));
    mockPost.mockResolvedValue({
      data: { servico: { id: 1, descricao: 'Troca de segredo', local: 'Centro', iniciadoEm: 'x' } },
    });

    render(<MeusServicos />);
    await user.click(await screen.findByRole('button', { name: /Iniciar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/servicos/1/iniciar'));
    expect(await screen.findByText('SERVIÇO ATUAL')).toBeInTheDocument();
  });

  it('M3 desligado (404 no probe): sem ação de iniciar e sem banner', async () => {
    mockGet.mockImplementation(rotaM3({ servicos: [ativo1], atualErro: erroStatus(404) }));

    render(<MeusServicos />);
    await screen.findByText('Troca de segredo');
    expect(screen.queryByRole('button', { name: /Iniciar serviço/ })).not.toBeInTheDocument();
    expect(screen.queryByText('SERVIÇO ATUAL')).not.toBeInTheDocument();
  });

  it('M3 com serviço atual: mostra o banner e conclui', async () => {
    const user = userEvent.setup();
    const emAndamento = { ...ativo1, status: 'em_andamento' };
    mockGet.mockImplementation(
      rotaM3({
        servicos: [emAndamento],
        atual: { data: { servico: { id: 1, descricao: 'Troca de segredo', local: 'Centro' } } },
      })
    );
    mockPost.mockResolvedValue({ data: { servico: null } });

    render(<MeusServicos />);
    expect(await screen.findByText('SERVIÇO ATUAL')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Concluir/ }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/servicos/1/concluir'));
  });

  it('M3: iniciar com 409 avisa que já há um serviço em andamento', async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation(rotaM3({ servicos: [ativo1] }));
    mockPost.mockRejectedValue(erroStatus(409));

    render(<MeusServicos />);
    await user.click(await screen.findByRole('button', { name: /Iniciar serviço/ }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('Você já tem um serviço em andamento', 'warning')
    );
  });
});
