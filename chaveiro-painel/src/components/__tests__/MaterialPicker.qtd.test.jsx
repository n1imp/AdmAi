import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MaterialPicker from '../MaterialPicker.jsx';

vi.mock('../../lib/api.js', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

/**
 * F5 — o campo de quantidade normalizava a cada tecla com `num > 0`, então digitar "0,5"
 * era zerado no primeiro caractere (o `0` sozinho reprova no >0) e nenhuma fração podia
 * ser informada. Como NovoServico filtrava itens sem quantidade antes do POST, o material
 * ficava fora do envio EM SILÊNCIO — sem baixa de estoque e com toast de sucesso.
 */
function renderizar(value, onChange) {
  return render(<MaterialPicker value={value} onChange={onChange} />);
}

const item = { materialId: 1, quantidade: 1, nome: 'Fechadura' };

describe('MaterialPicker — quantidade', () => {
  it('permite digitar decimal começando por zero sem apagar o campo', () => {
    const onChange = vi.fn();
    renderizar([item], onChange);
    const campo = screen.getByRole('textbox', { name: /quantidade/i });

    fireEvent.change(campo, { target: { value: '0' } });
    // O ponto do bug: antes virava '' aqui e o dígito sumia da tela.
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ quantidade: '0' })]);
  });

  it('aceita fração completa (0.5)', () => {
    const onChange = vi.fn();
    renderizar([item], onChange);
    const campo = screen.getByRole('textbox', { name: /quantidade/i });

    fireEvent.change(campo, { target: { value: '0.5' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ quantidade: '0.5' })]);
  });

  it('aceita vírgula como separador decimal (pt-BR)', () => {
    const onChange = vi.fn();
    renderizar([item], onChange);
    const campo = screen.getByRole('textbox', { name: /quantidade/i });

    fireEvent.change(campo, { target: { value: '1,5' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ quantidade: '1.5' })]);
  });

  it('permite esvaziar o campo (usuário apagando para redigitar)', () => {
    const onChange = vi.fn();
    renderizar([item], onChange);
    const campo = screen.getByRole('textbox', { name: /quantidade/i });

    fireEvent.change(campo, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ quantidade: '' })]);
  });

  it('ignora texto não numérico em vez de aceitar lixo', () => {
    const onChange = vi.fn();
    renderizar([item], onChange);
    const campo = screen.getByRole('textbox', { name: /quantidade/i });

    fireEvent.change(campo, { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
