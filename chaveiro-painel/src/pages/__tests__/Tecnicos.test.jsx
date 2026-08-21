import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Tecnicos from '../Tecnicos.jsx';

/**
 * DOG-002 — a pagina ja trata os quatro estados (carregando, erro, vazio, lista).
 * O que faltava era prova: nenhum teste cobria QUAL estado a pagina escolhe.
 *
 * Nenhuma alteracao de produto foi feita para estes testes existirem.
 */

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), patch: vi.fn() },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));

const tecnico = (id) => ({
  id,
  nome: `Tecnico ${id}`,
  telefone: '11999998888',
  ativo: true,
  servicosMes: 3,
  faturamentoMes: 1000,
});

beforeEach(() => {
  mockGet.mockReset();
});

describe('Tecnicos — selecao de estado da lista', () => {
  it('com tecnicos: renderiza os cards e nao o estado vazio', async () => {
    mockGet.mockResolvedValue({ data: [tecnico(1), tecnico(2)] });
    render(<Tecnicos />);

    expect(await screen.findByText('Tecnico 1')).toBeInTheDocument();
    expect(screen.getByText('Tecnico 2')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum técnico cadastrado')).not.toBeInTheDocument();
  });

  it('lista vazia: renderiza mensagem, subtitulo e CTA para o cadastro', async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<Tecnicos />);

    expect(await screen.findByText('Nenhum técnico cadastrado')).toBeInTheDocument();
    expect(screen.getByText(/Toque no \+ para adicionar/)).toBeInTheDocument();

    // O CTA e o unico caminho de acao dentro do estado vazio.
    const cta = screen.getByRole('link', { name: 'Adicionar técnico' });
    expect(cta).toHaveAttribute('href', '/tecnicos/novo');
  });

  it('carregando: nao mostra nem lista nem estado vazio', () => {
    // Promise que nunca resolve mantem a pagina no estado inicial.
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Tecnicos />);

    expect(screen.queryByText('Nenhum técnico cadastrado')).not.toBeInTheDocument();
    expect(screen.queryByText('Tecnico 1')).not.toBeInTheDocument();
  });

  it('erro: mostra o banner de erro e NAO afirma que nao ha tecnicos', async () => {
    // Falha de carregamento nao e evidencia de lista vazia: o app nao sabe
    // quantos tecnicos existem. Afirmar "Nenhum técnico cadastrado" aqui e
    // afirmar um fato que nao esta em evidencia.
    mockGet.mockRejectedValue(new Error('falha de rede'));
    render(<Tecnicos />);

    expect(await screen.findByText(/Não foi possível carregar os técnicos/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum técnico cadastrado')).not.toBeInTheDocument();
  });

  it('contador do cabecalho acompanha o estado', async () => {
    mockGet.mockResolvedValue({ data: [] });
    const { unmount } = render(<Tecnicos />);
    expect(await screen.findByText(/^0 cadastrados?$/)).toBeInTheDocument();
    unmount();

    mockGet.mockResolvedValue({ data: [tecnico(1)] });
    render(<Tecnicos />);
    expect(await screen.findByText(/^1 cadastrado$/)).toBeInTheDocument();
  });
});
