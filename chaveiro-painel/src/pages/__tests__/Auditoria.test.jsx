import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Auditoria from '../Auditoria.jsx';

/**
 * AUDITORIA consultável (USER GATE D3). Contrato do frontend: autogate por isAdmin
 * (espelha o adminOnly do backend), estados loading/empty/error sem empty-com-erro,
 * dados reais e paginação por "Carregar mais".
 */

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({ default: { get: (...a) => mockGet(...a) } }));

const mockAuth = vi.fn();
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => mockAuth() }));

const navSpy = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Navigate: ({ to }) => {
    navSpy(to);
    return <div>REDIRECT:{to}</div>;
  },
}));

const evento = (id, acao, extra = {}) => ({
  id,
  criadoEm: '2026-08-27T12:00:00Z',
  acao,
  entidade: 'Usuario',
  entidadeId: 5,
  ip: '10.0.0.1',
  autorNome: 'Dono A',
  antes: null,
  depois: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue({ isAdmin: true });
});

describe('Auditoria — autogate isAdmin', () => {
  it('não-admin é redirecionado para /configuracao (espelha adminOnly do backend)', () => {
    mockAuth.mockReturnValue({ isAdmin: false });
    render(<Auditoria />);
    expect(navSpy).toHaveBeenCalledWith('/configuracao');
    expect(mockGet).not.toHaveBeenCalled(); // nem chega a buscar
  });
});

describe('Auditoria — estados e dados', () => {
  it('carregando: não mostra lista nem empty', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Auditoria />);
    expect(screen.queryByText('Nenhum evento registrado ainda')).not.toBeInTheDocument();
  });

  it('sucesso: renderiza os eventos com rótulo, autor e detalhe', async () => {
    mockGet.mockResolvedValue({
      data: {
        itens: [
          evento(2, 'usuario.criado', { depois: { nome: 'Novo Func', papel: 'funcionario' } }),
          evento(1, 'convite.enviado', { depois: { email: 'x@y.z', papel: 'gestor' } }),
        ],
        proximoCursor: null,
      },
    });
    render(<Auditoria />);
    expect(await screen.findByText('Usuário criado')).toBeInTheDocument();
    expect(screen.getByText(/Novo Func · funcionario/)).toBeInTheDocument();
    expect(screen.getByText('Convite enviado')).toBeInTheDocument();
    expect(screen.getAllByText(/por Dono A/)[0]).toBeInTheDocument();
    expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument(); // proximoCursor null
  });

  it('empty state real (sem erro)', async () => {
    mockGet.mockResolvedValue({ data: { itens: [], proximoCursor: null } });
    render(<Auditoria />);
    expect(await screen.findByText('Nenhum evento registrado ainda')).toBeInTheDocument();
  });

  it('erro: banner presente e NÃO afirma lista vazia', async () => {
    mockGet.mockRejectedValue(new Error('rede'));
    render(<Auditoria />);
    expect(await screen.findByText(/Não foi possível carregar a auditoria/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum evento registrado ainda')).not.toBeInTheDocument();
  });

  it('paginação: "Carregar mais" busca a próxima página com o cursor', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        itens: [evento(3, 'usuario.criado', { depois: { nome: 'A', papel: 'gestor' } })],
        proximoCursor: 3,
      },
    });
    render(<Auditoria />);
    await screen.findByText('Usuário criado');
    const btn = screen.getByRole('button', { name: /carregar mais/i });

    mockGet.mockResolvedValueOnce({
      data: {
        itens: [evento(2, 'conta.excluida', { depois: { escopo: 'usuario' } })],
        proximoCursor: null,
      },
    });
    fireEvent.click(btn);
    await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/auditoria?take=20&cursor=3'));
    expect(await screen.findByText('Conta excluída')).toBeInTheDocument();
    expect(screen.queryByText('Carregar mais')).not.toBeInTheDocument();
  });
});
