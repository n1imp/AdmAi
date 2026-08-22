import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
/* `get` entrou porque a tela passou a ler `GET /me/permissoes` para descobrir se a empresa exige
   aprovação — é isso que decide se o seletor de material aparece.  [GAP-EST-03]
   Sem ele, `api.get` era `undefined` e três casos quebravam com "default.get is not a function". */
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { post: (...a) => mockPost(...a), get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));

const mockToast = vi.fn();
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => mockToast }));

beforeEach(() => {
  localStorage.clear();
  mockNavigate.mockReset();
  mockToast.mockReset();
  mockPost.mockReset().mockResolvedValue({ data: { status: 'pendente' } });
  /* Padrão: empresa SEM aprovação, que é o default do modelo (`aprovacaoServico @default(false)`).
     Os casos que exercitam o seletor sobrescrevem. */
  mockGet.mockReset().mockResolvedValue({ data: { aprovacaoServico: false } });
});
afterEach(cleanup);

describe('NovoServicoFuncionario — FO3', () => {
  it('bloqueia o avanço sem descrição e marca o campo inválido', async () => {
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);
    const descricao = screen.getByRole('textbox', { name: /Descrição/ });

    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await waitFor(() => expect(descricao).toHaveAttribute('aria-invalid', 'true'));
    // não avançou: o campo "Valor cobrado" (etapa 2) não apareceu
    expect(screen.queryByRole('textbox', { name: /Valor cobrado/ })).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('percorre as etapas, envia o payload do funcionário e trata o status pendente', async () => {
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    await user.type(await screen.findByRole('textbox', { name: /Valor cobrado/ }), '15000');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));

    expect(await screen.findByText(/RESUMO DO SERVIÇO/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Registrar serviço/ }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, payload] = mockPost.mock.calls[0];
    expect(url).toBe('/servicos');
    expect(payload).toMatchObject({
      local: 'Casa do cliente',
      descricao: 'Abertura de porta',
      valorCobrado: 150,
      valorMaterial: 0,
      clienteNome: null,
      endereco: null,
    });
    // payload do funcionário não envia técnico nem materiais
    expect(payload).not.toHaveProperty('tecnico');
    expect(payload).not.toHaveProperty('materiais');

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('Enviado para aprovação do gestor', 'success')
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/meus-servicos'));
  });

  it('SEM aprovação: o seletor de material NÃO aparece', async () => {
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await screen.findByRole('textbox', { name: /Valor cobrado/ });

    /* O backend recusaria com `materiais_nao_permitidos`, porque sem aprovação o serviço nasce
       `ativo` e a baixa sairia sem gestor nenhum. Mostrar o campo aqui ofereceria uma capacidade
       que seria negada depois de o técnico preencher — o pior momento para descobrir. */
    expect(screen.queryByText(/Materiais do catálogo/)).not.toBeInTheDocument();
  });

  it('COM aprovação: o seletor aparece e busca o catálogo MÍNIMO', async () => {
    mockGet.mockImplementation((rota) => {
      if (rota === '/me/permissoes') return Promise.resolve({ data: { aprovacaoServico: true } });
      return Promise.resolve({ data: [{ id: 1, nome: 'Fechadura Tetra', unidade: 'un' }] });
    });
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await screen.findByRole('textbox', { name: /Valor cobrado/ });

    expect(await screen.findByText(/Materiais do catálogo/)).toBeInTheDocument();
    /* A rota importa tanto quanto o campo: `/materiais` exige `estoque:ver`, que o funcionário não
       tem, e devolveria custo e saldo. Apontar para a rota errada daria 403 e um seletor vazio. */
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/me/materiais-servico'));
  });

  it('sem contexto (falha ao ler permissões) o seletor fica ESCONDIDO', async () => {
    mockGet.mockRejectedValue(new Error('rede'));
    const user = userEvent.setup();
    render(<NovoServicoFuncionario />);

    await user.type(screen.getByRole('textbox', { name: /Descrição/ }), 'Abertura de porta');
    await user.click(screen.getByRole('button', { name: /Continuar/ }));
    await screen.findByRole('textbox', { name: /Valor cobrado/ });

    /* Falhar para o lado de esconder: um campo ausente é frustração; um campo que aceita entrada e
       depois derruba o registro inteiro é trabalho perdido em campo. */
    expect(screen.queryByText(/Materiais do catálogo/)).not.toBeInTheDocument();
  });

  it('restaura o rascunho salvo no localStorage ao montar', () => {
    localStorage.setItem(
      'admai_novo_servico_func',
      JSON.stringify({ descricao: 'Rascunho de porta' })
    );
    render(<NovoServicoFuncionario />);
    expect(screen.getByRole('textbox', { name: /Descrição/ })).toHaveValue('Rascunho de porta');
  });
});
