import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as renderRtl, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NovoServicoFuncionario from '../NovoServicoFuncionario.jsx';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/meus-servicos/novo' }),
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

const mockToast = vi.fn();
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => mockToast }));

function render(ui) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return renderRtl(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
  mockToast.mockReset();
  mockPost.mockReset().mockResolvedValue({ status: 201, data: { status: 'pendente' } });
  /* Padrão: empresa SEM aprovação (`aprovacaoServico @default(false)`) — o seletor de
     material fica escondido; os casos que o exercitam sobrescrevem. */
  mockGet.mockReset().mockResolvedValue({ data: { aprovacaoServico: false } });
});
afterEach(cleanup);

/** Form single-page por seções (DECISOR 01a04bfb §iii) — o wizard de 3 etapas foi removido:
 *  todos os campos visíveis de uma vez, CTA único "Registrar serviço", validação no submit
 *  com foco no primeiro erro. */
describe('NovoServicoFuncionario — form por seções', () => {
  it('submit sem descrição: campo inválido + foco, sem POST', async () => {
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);
    const descricao = screen.getByRole('textbox', { name: /Descrição/ });

    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() => expect(descricao).toHaveAttribute('aria-invalid', 'true'));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('single-page: preenche descrição+valor, envia payload SEM tecnico e navega no sucesso', async () => {
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.type(screen.getByRole('textbox', { name: /Valor cobrado/ }), '15000');
    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, payload] = mockPost.mock.calls[0];
    expect(url).toBe('/servicos');
    expect(payload.tecnico).toBeUndefined(); // deriva da sessão no backend
    expect(payload.descricao).toBe('Abertura de porta');
    expect(payload.valorCobrado).toBe(150);
    expect(mockNavigate).toHaveBeenCalledWith('/meus-servicos');
  });

  /* Revisor 01a04c56 (ALTA): "rascunho limpo só após 201" precisa ser literal — qualquer
     outro 2xx não prova que o serviço foi criado. */
  it('resposta 2xx que NÃO é 201: rascunho preservado, sem sucesso e sem navegar', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ status: 200, data: {} });
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.type(screen.getByRole('textbox', { name: /Valor cobrado/ }), '15000');
    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalledWith('Serviço registrado com sucesso!', 'success');
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Abertura de porta');
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem('admai_novo_servico_func') ?? '{}').descricao).toBe(
        'Abertura de porta'
      )
    );
  });

  it('SEM aprovação: o seletor de material do catálogo NÃO aparece', async () => {
    render(<NovoServicoFuncionario />);
    await screen.findByRole('textbox', { name: /Descrição/ });
    await waitFor(() =>
      expect(mockGet.mock.calls.some(([url]) => url === '/me/permissoes')).toBe(true)
    );
    expect(screen.queryByText(/Materiais do catálogo/)).not.toBeInTheDocument();
  });

  it('COM aprovação: o seletor aparece', async () => {
    mockGet.mockImplementation((url) =>
      url === '/me/permissoes'
        ? Promise.resolve({ data: { aprovacaoServico: true } })
        : Promise.resolve({ data: [] })
    );
    render(<NovoServicoFuncionario />);
    expect(await screen.findByText(/Materiais do catálogo/)).toBeInTheDocument();
  });

  it('sem contexto (falha ao ler permissões) o seletor fica ESCONDIDO', async () => {
    mockGet.mockRejectedValue(new Error('net'));
    render(<NovoServicoFuncionario />);
    await screen.findByRole('textbox', { name: /Descrição/ });
    expect(screen.queryByText(/Materiais do catálogo/)).not.toBeInTheDocument();
  });

  it('restaura o rascunho salvo no localStorage ao montar (limpo só após sucesso)', async () => {
    localStorage.setItem(
      'admai_novo_servico_func',
      JSON.stringify({
        descricao: 'Rascunho vivo',
        local: 'Contrato',
        valorCobrado: '80,00',
        valorMaterial: '',
        material: '',
        endereco: '',
        clienteNome: '',
        clienteTelefone: '',
        tecnico: '',
        materiais: [],
      })
    );
    render(<NovoServicoFuncionario />);
    expect(await screen.findByDisplayValue('Rascunho vivo')).toBeInTheDocument();
  });
});
