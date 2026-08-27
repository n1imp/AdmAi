import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Seguranca from '../Seguranca.jsx';

/**
 * AUD-GAP-2FA-RECOVERY-CODES — o backend devolve os códigos de recuperação UMA única
 * vez em POST /me/2fa/ativar, e a tela os descartava: usuário ativava 2FA sem nunca
 * vê-los (risco de lockout permanente). Contrato fixado aqui:
 *   ativação bem-sucedida → passo "Guarde seus códigos" com TODOS os códigos →
 *   "Copiar todos" copia a lista → só "Concluir" fecha e limpa (X/Escape não descartam).
 */

const CODIGOS = [
  'A1B2C3D4E5',
  'F6A7B8C9D0',
  '1122334455',
  'AABBCCDDEE',
  'FF00AA11BB',
  '9988776655',
  'ABCDEF0123',
  '0123456789',
  'DEADBEEF00',
  'CAFEBABE11',
];

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: {
    get: (...a) => mockGet(...a),
    post: (...a) => mockPost(...a),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
const mockToast = vi.fn();
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => mockToast }));
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn(), isAdmin: false }),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((rota) => {
    if (rota === '/me') return Promise.resolve({ data: { twoFactorAtivo: false } });
    if (rota === '/me/sessoes') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
  mockPost.mockImplementation((rota) => {
    if (rota === '/me/2fa/setup') {
      return Promise.resolve({
        data: {
          secret: 'SEGREDOBASE32XX',
          otpauthUrl: 'otpauth://x',
          qrDataUrl: 'data:image/png;base64,QQ==',
        },
      });
    }
    if (rota === '/me/2fa/ativar') {
      return Promise.resolve({ data: { twoFactorAtivo: true, codigosRecuperacao: CODIGOS } });
    }
    return Promise.resolve({ data: {} });
  });
});

async function ativarAteCodigos() {
  render(<Seguranca />);
  // switch habilita quando /me carrega
  const alternar = await screen.findByRole('switch', { name: /ativar 2fa/i });
  await waitFor(() => expect(alternar).not.toBeDisabled());
  fireEvent.click(alternar);
  // modal de setup com o campo de código
  const campo = await screen.findByLabelText('Código de verificação');
  fireEvent.change(campo, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: /confirmar e ativar/i }));
  // passo de códigos
  await screen.findByText('Guarde seus códigos de recuperação');
}

describe('Seguranca — códigos de recuperação do 2FA', () => {
  it('ativação bem-sucedida exibe TODOS os códigos devolvidos pelo backend', async () => {
    await ativarAteCodigos();
    for (const c of CODIGOS) {
      expect(screen.getByText(c)).toBeInTheDocument();
    }
  });

  it('"Copiar todos" envia a lista completa para a área de transferência', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    await ativarAteCodigos();
    fireEvent.click(screen.getByRole('button', { name: /copiar todos/i }));
    expect(writeText).toHaveBeenCalledWith(CODIGOS.join('\n'));
  });

  it('só o "Concluir" fecha o passo e limpa os códigos da tela', async () => {
    await ativarAteCodigos();
    // Escape NÃO pode descartar códigos de exibição única (onClose local é no-op).
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Guarde seus códigos de recuperação')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /concluir/i }));
    await waitFor(() =>
      expect(screen.queryByText('Guarde seus códigos de recuperação')).not.toBeInTheDocument()
    );
    expect(screen.queryByText(CODIGOS[0])).not.toBeInTheDocument();
  });
});
