import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, IconButton } from '../Button.jsx';

describe('Button e IconButton', () => {
  it('usa semântica nativa, tipo seguro e responde ao teclado', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Salvar</Button>);

    const button = screen.getByRole('button', { name: 'Salvar' });
    expect(button).toHaveAttribute('type', 'button');
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('bloqueia interação durante disabled e loading', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Button disabled onClick={onClick}>
        Excluir
      </Button>
    );

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onClick).not.toHaveBeenCalled();

    rerender(
      <Button loading onClick={onClick}>
        Salvar
      </Button>
    );
    const loadingButton = screen.getByRole('button', { name: /salvar.*carregando/i });
    expect(loadingButton).toBeDisabled();
    expect(loadingButton).toHaveAttribute('aria-busy', 'true');
  });

  it('encaminha ref e fornece nome ao botão de ícone', () => {
    const ref = createRef();
    render(
      <IconButton ref={ref} label="Fechar" size="small" variant="ghost">
        ×
      </IconButton>
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toBe(ref.current);
    expect(ref.current).toHaveClass('panel-button--icon');
    expect(ref.current).not.toHaveClass('panel-button--small');
    expect(ref.current.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
