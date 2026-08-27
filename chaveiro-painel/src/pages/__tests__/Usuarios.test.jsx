import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Usuarios from '../Usuarios.jsx';

/**
 * AUD-GAP-FLASH-EMPTY — em staging real a tela mostrou "0 contas cadastradas" com
 * 3 usuários na API: o contador renderizava ANTES do fetch. Regra fixada (a mesma
 * do DOG-002 em Tecnicos): contagem desconhecida (carregando/erro) exibe "—", e a
 * falha de carregamento NÃO afirma "Nenhuma conta cadastrada".
 */

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 99 } }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}));

const usuario = (id, papel = 'gestor') => ({
  id,
  nome: `Conta ${id}`,
  username: `conta${id}`,
  papel,
  ativo: true,
  permissoesEfetivas: {},
});

const catalogo = {
  papeis: ['dono', 'gestor', 'funcionario'],
  modulos: [],
  acoesPorModulo: {},
  capacidadesProprio: [],
  presets: { dono: {}, gestor: {}, funcionario: {} },
};

beforeEach(() => {
  mockGet.mockReset();
});

function mockListas({ usuarios, falha = false }) {
  mockGet.mockImplementation((rota) => {
    if (rota === '/usuarios') {
      return falha ? Promise.reject(new Error('rede')) : Promise.resolve({ data: usuarios });
    }
    if (rota === '/permissoes/catalogo') return Promise.resolve({ data: catalogo });
    return Promise.resolve({ data: {} });
  });
}

describe('Usuarios — contador e estados da lista', () => {
  it('carregando: contador mostra "—" e nunca "0 contas"', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<Usuarios />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/0 contas? cadastradas?/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta cadastrada')).not.toBeInTheDocument();
  });

  it('sucesso: contador exibe a contagem real e os cards', async () => {
    mockListas({ usuarios: [usuario(1), usuario(2), usuario(3, 'funcionario')] });
    render(<Usuarios />);
    expect(await screen.findByText('3 contas cadastradas')).toBeInTheDocument();
    expect(screen.getByText('Conta 1')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('erro: banner presente, contador "—", e SEM estado vazio', async () => {
    mockListas({ usuarios: [], falha: true });
    render(<Usuarios />);
    expect(await screen.findByText(/Não foi possível carregar as contas/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    // Falha não é evidência de lista vazia: afirmar "Nenhuma conta" declararia
    // um fato sem evidência (paridade com Tecnicos/DOG-002).
    expect(screen.queryByText('Nenhuma conta cadastrada')).not.toBeInTheDocument();
  });

  it('lista vazia real (sem erro): estado vazio aparece com contagem zero', async () => {
    mockListas({ usuarios: [] });
    render(<Usuarios />);
    expect(await screen.findByText('Nenhuma conta cadastrada')).toBeInTheDocument();
    expect(screen.getByText('0 contas cadastradas')).toBeInTheDocument();
  });
});
