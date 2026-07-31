import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireAuth, RequirePermissao } from '../Guards.jsx';

/**
 * F11 — cobertura dos guards de rota do painel (antes: zero testes).
 *
 * IMPORTANTE: estes guards são UX. A autorização real é do backend — estes testes NÃO
 * provam que o app é seguro, só que a navegação degrada como esperado. O equivalente
 * server-side vive em test/integration/ do chaveiro-bot.
 */

const mockAuth = vi.fn();
const mockTokenExpirado = vi.fn(() => false);

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => mockAuth(),
  tokenExpirado: () => mockTokenExpirado(),
}));

function renderizarComRota(elemento, rotaInicial = '/protegida') {
  return render(
    <MemoryRouter initialEntries={[rotaInicial]}>
      <Routes>
        <Route path="/protegida" element={elemento} />
        <Route path="/login" element={<div>TELA_LOGIN</div>} />
        <Route path="/trocar-senha" element={<div>TELA_TROCAR_SENHA</div>} />
        <Route path="/configuracao" element={<div>TELA_CONFIGURACAO</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const Protegido = () => <div>CONTEUDO_PROTEGIDO</div>;

beforeEach(() => {
  vi.clearAllMocks();
  mockTokenExpirado.mockReturnValue(false);
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('<RequireAuth>', () => {
  it('redireciona para /login quando não há usuário', () => {
    mockAuth.mockReturnValue({ user: null, logout: vi.fn(), senhaProvisoria: false });
    renderizarComRota(
      <RequireAuth>
        <Protegido />
      </RequireAuth>
    );
    expect(screen.getByText('TELA_LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('redireciona para /login e derruba a sessão quando o token expirou', () => {
    const logout = vi.fn();
    mockTokenExpirado.mockReturnValue(true);
    mockAuth.mockReturnValue({ user: { id: 1, papel: 'dono' }, logout, senhaProvisoria: false });
    renderizarComRota(
      <RequireAuth>
        <Protegido />
      </RequireAuth>
    );
    expect(screen.getByText('TELA_LOGIN')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled(); // não basta redirecionar: a sessão local tem de ser limpa
  });

  it('prende o usuário em /trocar-senha enquanto a senha for provisória', () => {
    mockAuth.mockReturnValue({ user: { id: 1, papel: 'funcionario' }, logout: vi.fn(), senhaProvisoria: true });
    renderizarComRota(
      <RequireAuth>
        <Protegido />
      </RequireAuth>
    );
    expect(screen.getByText('TELA_TROCAR_SENHA')).toBeInTheDocument();
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('libera o conteúdo para sessão válida sem senha provisória', () => {
    mockAuth.mockReturnValue({ user: { id: 1, papel: 'dono' }, logout: vi.fn(), senhaProvisoria: false });
    renderizarComRota(
      <RequireAuth>
        <Protegido />
      </RequireAuth>
    );
    expect(screen.getByText('CONTEUDO_PROTEGIDO')).toBeInTheDocument();
  });
});

describe('<RequirePermissao>', () => {
  it('redireciona quem não tem a permissão do módulo', () => {
    mockAuth.mockReturnValue({
      user: { id: 2, papel: 'gestor' },
      permissoes: { usuarios: { ver: false } },
      pode: () => false,
    });
    renderizarComRota(
      <RequirePermissao modulo="usuarios" acao="ver">
        <Protegido />
      </RequirePermissao>
    );
    expect(screen.getByText('TELA_CONFIGURACAO')).toBeInTheDocument();
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
  });

  it('libera quem tem a permissão', () => {
    mockAuth.mockReturnValue({
      user: { id: 2, papel: 'gestor' },
      permissoes: { usuarios: { ver: true } },
      pode: () => true,
    });
    renderizarComRota(
      <RequirePermissao modulo="usuarios" acao="ver">
        <Protegido />
      </RequirePermissao>
    );
    expect(screen.getByText('CONTEUDO_PROTEGIDO')).toBeInTheDocument();
  });

  it('dono passa mesmo com permissoes ainda não carregadas (null)', () => {
    mockAuth.mockReturnValue({ user: { id: 1, papel: 'dono' }, permissoes: null, pode: () => true });
    renderizarComRota(
      <RequirePermissao modulo="usuarios" acao="ver">
        <Protegido />
      </RequirePermissao>
    );
    expect(screen.getByText('CONTEUDO_PROTEGIDO')).toBeInTheDocument();
  });

  it('não redireciona prematuramente enquanto as permissões carregam (evita flash)', () => {
    mockAuth.mockReturnValue({ user: { id: 2, papel: 'gestor' }, permissoes: null, pode: () => false });
    renderizarComRota(
      <RequirePermissao modulo="usuarios" acao="ver">
        <Protegido />
      </RequirePermissao>
    );
    // Nem conteúdo nem redirect: fica em branco até /me/permissoes responder.
    expect(screen.queryByText('CONTEUDO_PROTEGIDO')).not.toBeInTheDocument();
    expect(screen.queryByText('TELA_CONFIGURACAO')).not.toBeInTheDocument();
  });

  it('usa acao="ver" por padrão quando não informada', () => {
    const pode = vi.fn(() => true);
    mockAuth.mockReturnValue({ user: { id: 2, papel: 'gestor' }, permissoes: {}, pode });
    renderizarComRota(
      <RequirePermissao modulo="estoque">
        <Protegido />
      </RequirePermissao>
    );
    expect(pode).toHaveBeenCalledWith('estoque', 'ver');
  });
});
