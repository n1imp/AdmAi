import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import Servicos from '../Servicos.jsx';

// F3 — cobertura de a11y/teclado do vertical slice Serviços (FI4, L4, drawer/DT4, O-09).
// Usa react-router-dom REAL (createMemoryRouter) para exercer as transições por
// searchParams (drawer ↔ tela-cheia ↔ lista) com push de histórico de verdade — o
// arquivo Servicos.test.jsx (paginação keyset) segue com o mock estático de router.
const mockGet = vi.fn();
const mockDelete = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), delete: (...a) => mockDelete(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));

const servico = (id, over = {}) => ({
  id,
  tecnico: { nome: `Tec ${id}` },
  local: 'Casa do cliente',
  descricao: `Serv ${id}`,
  valorCobrado: 120,
  valorMaterial: 20,
  valorLiquido: 100,
  criadoEm: '2026-06-20T10:00:00Z',
  endereco: `Rua ${id}`,
  ...over,
});

// Renderiza <Servicos> num container com id="root" (o Overlay marca esse nó como
// `inert` ao abrir) e devolve o router para simular o "Voltar" do navegador.
function setup({ data = [servico(1), servico(2)], total = 2, nextCursor = null } = {}) {
  mockGet.mockResolvedValue({ data: { data, total, nextCursor } });
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  const router = createMemoryRouter([{ path: '/servicos', element: <Servicos /> }], {
    initialEntries: ['/servicos'],
  });
  const utils = render(<RouterProvider router={router} />, { container: root });
  return { router, ...utils };
}

const rowName = (id) => new RegExp(`Abrir serviço de Tec ${id}`);

describe('<Servicos> F3 — FI4 (filtros recolhíveis)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDelete.mockReset();
  });
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    document.getElementById('root')?.remove();
  });

  it('o botão "Filtros" alterna aria-expanded, revela o painel avançado e liga aria-controls', async () => {
    const user = userEvent.setup();
    setup({ data: [servico(1)], total: 1 });
    await screen.findByRole('button', { name: rowName(1) });

    const toggle = screen.getByRole('button', { name: /^Filtros/ });
    const painel = document.getElementById('servicos-filtros-avancados');
    expect(toggle).toHaveAttribute('aria-controls', 'servicos-filtros-avancados');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(painel).toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(painel).not.toHaveAttribute('hidden');
    expect(screen.getByLabelText('Endereço')).toBeVisible();
  });

  it('Escape dentro do painel recolhe os filtros e devolve o foco à busca por técnico', async () => {
    const user = userEvent.setup();
    setup({ data: [servico(1)], total: 1 });
    await screen.findByRole('button', { name: rowName(1) });

    const busca = screen.getByLabelText('Buscar por técnico');
    const toggle = screen.getByRole('button', { name: /^Filtros/ });
    await user.click(toggle);

    const endereco = screen.getByLabelText('Endereço');
    endereco.focus();
    expect(endereco).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('servicos-filtros-avancados')).toHaveAttribute('hidden');
    expect(busca).toHaveFocus();
  });

  it('O-09: os chips de local expõem aria-pressed refletindo a seleção', async () => {
    const user = userEvent.setup();
    setup({ data: [servico(1)], total: 1 });
    await screen.findByRole('button', { name: rowName(1) });

    await user.click(screen.getByRole('button', { name: /^Filtros/ }));
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    const contrato = screen.getByRole('button', { name: 'Contrato' });
    expect(contrato).toHaveAttribute('aria-pressed', 'false');

    await user.click(contrato);
    expect(contrato).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('<Servicos> F3 — L4 + drawer acessível (O-02)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDelete.mockReset();
  });
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    document.getElementById('root')?.remove();
  });

  it('cada linha é um <button aria-haspopup="dialog"> que abre o drawer (role=dialog)', async () => {
    const user = userEvent.setup();
    setup();
    const row1 = await screen.findByRole('button', { name: rowName(1) });
    expect(row1.tagName).toBe('BUTTON');
    expect(row1).toHaveAttribute('aria-haspopup', 'dialog');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(row1);
    expect(await screen.findByRole('dialog', { name: /Serviço de Tec 1/ })).toBeInTheDocument();
  });

  it('o drawer contém o foco, torna o fundo inert e o Tab não escapa', async () => {
    const user = userEvent.setup();
    setup();
    const row1 = await screen.findByRole('button', { name: rowName(1) });

    await user.click(row1);
    const dialog = await screen.findByRole('dialog', { name: /Serviço de Tec 1/ });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.getElementById('root')).toHaveAttribute('inert');

    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Escape fecha o drawer, remove o inert e restaura o foco à linha de origem', async () => {
    const user = userEvent.setup();
    setup();
    const row1 = await screen.findByRole('button', { name: rowName(1) });

    await user.click(row1);
    await screen.findByRole('dialog', { name: /Serviço de Tec 1/ });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
    await waitFor(() => expect(screen.getByRole('button', { name: rowName(1) })).toHaveFocus());
  });
});

describe('<Servicos> F3 — DT4 (drawer ↔ tela-cheia ↔ lista via URL)', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockDelete.mockReset();
  });
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    document.getElementById('root')?.remove();
  });

  it('Expandir vai para tela-cheia mantendo o foco contido; Voltar retorna ao resumo', async () => {
    const user = userEvent.setup();
    setup({ data: [servico(1)], total: 1 });
    const row1 = await screen.findByRole('button', { name: rowName(1) });

    await user.click(row1);
    const dialog = await screen.findByRole('dialog');
    // No resumo, o campo só-detalhe (endereço) ainda não aparece.
    expect(within(dialog).queryByText('Rua 1')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Expandir/ }));
    // Tela-cheia: surge "Voltar" e o campo só-detalhe; o foco NÃO cai fora do dialog
    // (o nó do botão é reaproveitado / o handleFocusIn do Overlay recaptura).
    const voltar = await within(dialog).findByRole('button', { name: /Voltar/ });
    expect(within(dialog).getByText('Rua 1')).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await user.click(voltar);
    await within(dialog).findByRole('button', { name: /Expandir/ });
    expect(within(dialog).queryByText('Rua 1')).not.toBeInTheDocument();
  });

  it('o "Voltar" do navegador reverte página → drawer → lista sem desmontar a lista', async () => {
    const user = userEvent.setup();
    const { router } = setup({ data: [servico(1)], total: 1 });
    const row1 = await screen.findByRole('button', { name: rowName(1) });

    await user.click(row1);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /Expandir/ }));
    await within(dialog).findByRole('button', { name: /Voltar/ });

    // 1º back: tela-cheia → drawer (resumo).
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: /Expandir/ })).toBeInTheDocument()
    );

    // 2º back: drawer → lista. A linha permanece (lista nunca foi desmontada).
    await act(async () => {
      await router.navigate(-1);
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: rowName(1) })).toBeInTheDocument();
  });
});
