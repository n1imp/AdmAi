import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MeuPonto from '../MeuPonto.jsx';

// Mocks dos colaboradores externos da página.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: vi.fn() },
}));

vi.mock('../../components/Toast.jsx', () => ({
  useToast: () => vi.fn(),
}));

// BackHeader usa useNavigate; EstadoVazio usa Link — evita precisar de Router.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

// CapturaSelfie acessa APIs de mídia; o stub mantém o teste focado na timeline.
vi.mock('../../components/CapturaSelfie.jsx', () => ({
  default: () => null,
}));

describe('<MeuPonto>', () => {
  beforeEach(() => {
    mockGet.mockReset();
    try {
      localStorage.removeItem('ponto_aviso_lgpd');
    } catch {
      /* sem storage */
    }
  });

  it('mostra a timeline com horas batidas e destaca a próxima etapa', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: '2026-06-20',
        entradaEm: '2026-06-20T11:00:00Z', // 08:00 em São Paulo
        almocoSaidaEm: null,
        almocoVoltaEm: null,
        saidaEm: null,
        completo: false,
        proximaBatida: 'almoco_saida',
        proximaBatidaRotulo: 'Saída para o almoço',
        batidas: [
          {
            tipo: 'entrada',
            rotulo: 'Entrada',
            em: '2026-06-20T11:00:00Z',
            lat: -23.5,
            lng: -46.6,
            temSelfie: true,
          },
        ],
      },
    });

    render(<MeuPonto />);

    // Aguarda o carregamento — 08:00 aparece na timeline e no histórico.
    await waitFor(() => expect(screen.getAllByText('08:00').length).toBeGreaterThan(0));

    // Botão grande mostra o rótulo da próxima batida.
    expect(
      screen.getByRole('button', { name: /Bater ponto — Saída para o almoço/i })
    ).toBeInTheDocument();
    // Destaque da próxima etapa.
    expect(screen.getByText('Próxima batida')).toBeInTheDocument();
    // Histórico do dia listado.
    expect(screen.getByText('Batidas de hoje')).toBeInTheDocument();
  });

  it('desabilita o botão e mostra "concluído" quando o dia está completo', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: '2026-06-20',
        entradaEm: '2026-06-20T11:00:00Z',
        almocoSaidaEm: '2026-06-20T15:00:00Z',
        almocoVoltaEm: '2026-06-20T16:00:00Z',
        saidaEm: '2026-06-20T20:00:00Z',
        completo: true,
        proximaBatida: null,
        proximaBatidaRotulo: null,
        batidas: [],
      },
    });

    render(<MeuPonto />);

    const botao = await screen.findByRole('button', { name: /Ponto de hoje concluído/i });
    expect(botao).toBeDisabled();
  });

  it('mostra o aviso de coleta (LGPD) antes da 1ª batida', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: '2026-06-20',
        entradaEm: null,
        almocoSaidaEm: null,
        almocoVoltaEm: null,
        saidaEm: null,
        completo: false,
        proximaBatida: 'entrada',
        proximaBatidaRotulo: 'Entrada',
        batidas: [],
      },
    });

    render(<MeuPonto />);

    const botao = await screen.findByRole('button', { name: /Bater ponto — Entrada/i });
    fireEvent.click(botao);

    // O aviso explica a coleta de selfie + localização e linka a política.
    expect(await screen.findByText(/Coleta de selfie e localização/i)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Política de Privacidade/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute('href', '/privacidade'));

    // Aceitar registra o consentimento no aparelho.
    fireEvent.click(screen.getByRole('button', { name: /Entendi, continuar/i }));
    await waitFor(() => expect(localStorage.getItem('ponto_aviso_lgpd')).toBe('1'));
  });
});
