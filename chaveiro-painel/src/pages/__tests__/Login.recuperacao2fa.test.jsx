import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Login from '../Login.jsx';

/**
 * AUD-GAP-2FA-RECOVERY-CODES (consumo) — exibir códigos sem uma superfície que os
 * aceite não fecha o fluxo: Login só aceitava TOTP de 6 dígitos e nunca chamava
 * /auth/login/2fa/recuperar (DECISOR AUD-C1). Contrato fixado: no desafio TOTP existe
 * "Usar código de recuperação"; o modo aceita 10 caracteres alfanuméricos maiúsculos,
 * chama a rota de recuperação com o MESMO desafio e estabelece a sessão com o token.
 */

const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { post: (...a) => mockPost(...a), get: vi.fn() },
  register: vi.fn(),
}));
const mockLogin = vi.fn();
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ login: mockLogin }),
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
  Link: ({ to, children }) => <a href={to}>{children}</a>,
}));
vi.mock('../../hooks/useDocumentHead.js', () => ({ useDocumentHead: () => {} }));
vi.mock('../../components/BotoesSociais.jsx', () => ({ default: () => null }));
vi.mock('../../components/RodapeLegal.jsx', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/login');
});

async function chegarAoDesafioTotp() {
  mockPost.mockResolvedValueOnce({
    data: { twoFactorRequerido: true, desafio: 'DESAFIO-OPACO', metodo: 'totp' },
  });
  render(<Login />);
  fireEvent.change(screen.getByPlaceholderText('seu_usuario'), {
    target: { value: 'dono.teste' },
  });
  const senha = screen.getByPlaceholderText('••••••••');
  fireEvent.change(senha, { target: { value: 'senha-forte-1!' } });
  // "Entrar" existe também no alternador de modo — submete o form diretamente.
  fireEvent.submit(senha.closest('form'));
  await screen.findByText('Verificação em duas etapas');
}

describe('Login — recuperação 2FA por código de uso único', () => {
  it('no desafio TOTP oferece "Usar código de recuperação"', async () => {
    await chegarAoDesafioTotp();
    expect(screen.getByRole('button', { name: /usar código de recuperação/i })).toBeInTheDocument();
  });

  it('modo recuperação chama /auth/login/2fa/recuperar com o mesmo desafio e loga', async () => {
    await chegarAoDesafioTotp();
    fireEvent.click(screen.getByRole('button', { name: /usar código de recuperação/i }));

    const campo = await screen.findByLabelText('Código de recuperação');
    // entrada minúscula/suja normaliza para 10 maiúsculas alfanuméricas
    fireEvent.change(campo, { target: { value: 'a1b2-c3d4e5' } });
    expect(campo).toHaveValue('A1B2C3D4E5');

    mockPost.mockResolvedValueOnce({ data: { token: 'TOKEN-RECUPERADO' } });
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));

    await screen.findByText('Verificação em duas etapas'); // tela permanece até resolver
    expect(mockPost).toHaveBeenLastCalledWith('/auth/login/2fa/recuperar', {
      desafio: 'DESAFIO-OPACO',
      codigo: 'A1B2C3D4E5',
    });
    await vi.waitFor(() => expect(mockLogin).toHaveBeenCalledWith('TOKEN-RECUPERADO'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('código inválido mostra o erro do backend e não estabelece sessão', async () => {
    await chegarAoDesafioTotp();
    fireEvent.click(screen.getByRole('button', { name: /usar código de recuperação/i }));
    fireEvent.change(await screen.findByLabelText('Código de recuperação'), {
      target: { value: 'AAAAAAAAAA' },
    });
    mockPost.mockRejectedValueOnce({
      response: { data: { erro: 'Código de recuperação inválido ou já utilizado' } },
    });
    fireEvent.click(screen.getByRole('button', { name: /verificar/i }));

    expect(
      await screen.findByText('Código de recuperação inválido ou já utilizado')
    ).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('alternar de volta para "Usar código do app" restaura o campo de 6 dígitos', async () => {
    await chegarAoDesafioTotp();
    fireEvent.click(screen.getByRole('button', { name: /usar código de recuperação/i }));
    await screen.findByLabelText('Código de recuperação');
    fireEvent.click(screen.getByRole('button', { name: /usar código do app/i }));
    expect(await screen.findByPlaceholderText('000000')).toBeInTheDocument();
  });
});
