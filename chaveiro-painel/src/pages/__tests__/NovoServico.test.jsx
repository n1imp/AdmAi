import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as renderRtl, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

const mockPost = vi.fn();
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { post: (...a) => mockPost(...a), get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));

function render(ui) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return renderRtl(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
  mockPost.mockReset().mockResolvedValue({ status: 201, data: { id: 1 } });
  mockGet
    .mockReset()
    .mockImplementation((url) =>
      url === '/tecnicos'
        ? Promise.resolve({ data: [{ id: 7, nome: 'Ana Técnica', ativo: true }] })
        : Promise.resolve({ data: [] })
    );
});
afterEach(cleanup);

/** Form D/G single-page por seções (DECISOR 01a04bfb §iii; wizard de 4 etapas removido). */
describe('NovoServico — form por seções', () => {
  it('submit sem obrigatórios: técnico e descrição inválidos, sem POST', async () => {
    const user = userEvent.setup();
    render(<NovoServico />);
    await screen.findByRole('combobox', { name: /Técnico/ });

    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /Técnico/ })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
    );
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('preenche numa página só e envia o payload de /servicos com técnico do select', async () => {
    const user = userEvent.setup();
    render(<NovoServico />);

    await user.selectOptions(
      await screen.findByRole('combobox', { name: /Técnico/ }),
      'Ana Técnica'
    );
    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Troca de fechadura tetra');
    await user.type(screen.getByRole('textbox', { name: /Valor cobrado/ }), '34000');
    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, payload] = mockPost.mock.calls[0];
    expect(url).toBe('/servicos');
    expect(payload.tecnico).toBe('Ana Técnica');
    expect(payload.descricao).toBe('Troca de fechadura tetra');
    expect(payload.valorCobrado).toBe(340);
    expect(payload.valorMaterial).toBe(0);
    expect(mockNavigate).toHaveBeenCalledWith('/servicos');
  });

  it('resumo financeiro AO VIVO substitui a etapa de revisão (líquido = cobrado − material)', async () => {
    const user = userEvent.setup();
    render(<NovoServico />);
    await user.type(await screen.findByRole('textbox', { name: /Valor cobrado/ }), '20000');
    await user.type(screen.getByRole('textbox', { name: /Valor material/ }), '5000');
    expect(screen.getByText('R$ 150.00')).toBeInTheDocument();
  });
});
