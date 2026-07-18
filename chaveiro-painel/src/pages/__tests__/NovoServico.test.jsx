import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NovoServico from '../NovoServico.jsx';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/servicos/novo' }),
  Link: ({ to, children, ...p }) => (
    <a href={to} {...p}>
      {children}
    </a>
  ),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));
vi.mock('../../components/MaterialPicker.jsx', () => ({
  default: () => <div data-testid="material-picker" />,
}));
vi.mock('../../hooks/useAnalytics.js', () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
  mockPost.mockReset().mockResolvedValue({ data: {} });
  mockGet.mockReset().mockResolvedValue({ data: [{ id: 1, nome: 'Lucas', ativo: true }] });
});
afterEach(cleanup);

describe('NovoServico — FO3 (wizard)', () => {
  it('bloqueia o avanço sem os obrigatórios da etapa e marca o campo inválido', async () => {
    const user = userEvent.setup();
    render(<NovoServico />);
    const tecnico = await screen.findByRole('combobox', { name: /Técnico/ });

    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // não avançou (a etapa de materiais não apareceu) e o técnico ficou inválido
    expect(screen.queryByTestId('material-picker')).not.toBeInTheDocument();
    await waitFor(() => expect(tecnico).toHaveAttribute('aria-invalid', 'true'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('percorre as etapas e envia o payload de /servicos inalterado ao concluir', async () => {
    const user = userEvent.setup();
    render(<NovoServico />);
    await screen.findByRole('combobox', { name: /Técnico/ });

    // Etapa 1 — contexto
    await user.selectOptions(screen.getByRole('combobox', { name: /Técnico/ }), 'Lucas');
    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Troca de fechadura');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Etapa 2 — materiais (nada obrigatório)
    expect(await screen.findByTestId('material-picker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Etapa 3 — valores
    await user.type(screen.getByRole('textbox', { name: /Valor cobrado/ }), '28000');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    // Etapa 4 — revisão + concluir
    expect(await screen.findByText(/RESUMO DO SERVIÇO/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Salvar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, payload] = mockPost.mock.calls[0];
    expect(url).toBe('/servicos');
    expect(payload).toMatchObject({
      tecnico: 'Lucas',
      local: 'Casa do cliente',
      descricao: 'Troca de fechadura',
      valorCobrado: 280,
      valorMaterial: 0,
      materiais: [],
      endereco: null,
      clienteNome: null,
    });
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/servicos'));
  });
});
