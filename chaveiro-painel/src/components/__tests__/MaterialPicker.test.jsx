import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MaterialPicker from '../MaterialPicker.jsx';

// jsdom não implementa scrollIntoView; a rolagem da opção ativa é apenas cosmética
// (existe em navegadores reais). Um no-op deixa o efeito rodar sem afetar o teste.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// F3 — MaterialPicker como combobox acessível (ARIA APG): role=combobox no input,
// aria-expanded/aria-controls/aria-activedescendant, listbox de options, navegação
// por setas, Enter adiciona e Escape fecha mantendo o foco no input.
const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a) },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));

const CATALOGO = [
  { id: 1, nome: 'Fechadura', unidade: 'un', precoVenda: 50 },
  { id: 2, nome: 'Chave', unidade: 'un', precoVenda: 10 },
  { id: 3, nome: 'Cilindro', unidade: 'un', precoVenda: null },
];

// Harness stateful: reflete o contrato value/onChange do pai, para exercer a seleção
// real (o item adicionado vira linha removível e some das options).
function Harness() {
  const [value, setValue] = useState([]);
  return <MaterialPicker value={value} onChange={setValue} />;
}

async function abrirCombobox(user) {
  const combo = screen.getByRole('combobox');
  await waitFor(() => expect(combo).toBeEnabled());
  await user.click(combo);
  return combo;
}

describe('<MaterialPicker> — combobox acessível (O-10)', () => {
  beforeEach(() => mockGet.mockReset());
  afterEach(() => cleanup());

  it('expõe role=combobox e alterna aria-expanded / listbox ao focar', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: CATALOGO });
    render(<Harness />);

    const combo = screen.getByRole('combobox');
    await waitFor(() => expect(combo).toBeEnabled());
    expect(combo).toHaveAttribute('aria-autocomplete', 'list');
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(combo);
    expect(combo).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(combo).toHaveAttribute('aria-controls', listbox.id);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('ArrowDown/ArrowUp movem a opção ativa (aria-activedescendant + aria-selected)', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: CATALOGO });
    render(<Harness />);
    const combo = await abrirCombobox(user);

    const optFechadura = screen.getByRole('option', { name: /Fechadura/ });
    const optChave = screen.getByRole('option', { name: /Chave/ });

    // Ao abrir, a 1ª opção já é a ativa.
    expect(optFechadura).toHaveAttribute('aria-selected', 'true');
    expect(combo).toHaveAttribute('aria-activedescendant', optFechadura.id);

    await user.keyboard('{ArrowDown}');
    expect(optChave).toHaveAttribute('aria-selected', 'true');
    expect(optFechadura).toHaveAttribute('aria-selected', 'false');
    expect(combo).toHaveAttribute('aria-activedescendant', optChave.id);

    await user.keyboard('{ArrowUp}');
    expect(combo).toHaveAttribute('aria-activedescendant', optFechadura.id);
    expect(optFechadura).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter adiciona a opção ativa: vira linha removível e some do listbox', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: CATALOGO });
    render(<Harness />);
    const combo = await abrirCombobox(user);

    await user.keyboard('{ArrowDown}'); // ativa "Chave"
    await user.keyboard('{Enter}');

    expect(screen.getByLabelText('Quantidade de Chave')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Chave' })).toBeInTheDocument();

    // Reabre pelo teclado (o foco nunca saiu do input) e confirma que "Chave" sumiu.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('option', { name: /Chave/ })).not.toBeInTheDocument();
    expect(combo).toHaveFocus();
  });

  it('Escape fecha o listbox mantendo o foco no input', async () => {
    const user = userEvent.setup();
    mockGet.mockResolvedValue({ data: CATALOGO });
    render(<Harness />);
    const combo = await abrirCombobox(user);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combo).toHaveAttribute('aria-expanded', 'false');
    expect(combo).toHaveFocus();
  });
});
