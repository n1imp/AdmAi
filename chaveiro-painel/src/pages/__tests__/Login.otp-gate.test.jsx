import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../Login.jsx';

/**
 * [D4-v · DECISOR AUD2-P3] A etapa de OTP por WhatsApp no cadastro só existe com a feature
 * ligada. Com WHATSAPP POST_MVP (flag OFF), "Enviamos um código pelo WhatsApp" seria um claim
 * falso — o bot está desconectado e o código nunca chega. Sem a flag, o cadastro conclui direto.
 */

const flagWhatsapp = { valor: false };
vi.mock('../../lib/featureFlags.js', () => ({
  featureAtiva: (nome) => (nome === 'WHATSAPP' ? flagWhatsapp.valor : true),
}));

const mockRegister = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { post: vi.fn(), get: vi.fn() },
  register: (...a) => mockRegister(...a),
}));
const mockLogin = vi.fn();
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ login: mockLogin }) }));
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
  flagWhatsapp.valor = false;
  window.history.replaceState({}, '', '/login?modo=cadastrar');
});

async function preencherEcadastrar() {
  render(<Login />);
  const set = (ph, v) =>
    fireEvent.change(screen.getByPlaceholderText(ph), { target: { value: v } });
  set('João da Silva', 'Fulano de Teste');
  set('Chaveiro Express', 'Chaveiro Teste');
  set('seu_usuario', 'fulano_teste');
  set('voce@empresa.com', 'fulano@delivered.resend.dev');
  set('11999990000', '5511999998888');
  set('••••••••', 'SenhaForte!1');
  mockRegister.mockResolvedValue({ token: 'TOKEN-NOVO' });
  fireEvent.submit(screen.getByPlaceholderText('••••••••').closest('form'));
}

describe('Login cadastro — etapa OTP atrás da feature WHATSAPP', () => {
  it('flag OFF: conclui direto (login + navigate), sem tela nem claim de OTP por WhatsApp', async () => {
    flagWhatsapp.valor = false;
    await preencherEcadastrar();
    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('TOKEN-NOVO'));
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(screen.queryByText(/c[oó]digo pelo WhatsApp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/CONFIRME SEU WHATSAPP/i)).not.toBeInTheDocument();
  });

  it('flag ON: mostra a etapa de OTP por WhatsApp (fluxo preservado)', async () => {
    flagWhatsapp.valor = true;
    await preencherEcadastrar();
    expect(await screen.findByText(/c[oó]digo pelo WhatsApp/i)).toBeInTheDocument();
    // não navegou direto: a etapa OTP intercepta
    expect(mockNavigate).not.toHaveBeenCalledWith('/', { replace: true });
  });
});
