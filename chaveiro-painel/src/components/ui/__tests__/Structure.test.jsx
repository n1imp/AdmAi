import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PageHeader from '../PageHeader.jsx';
import PanelScope from '../PanelScope.jsx';
import { Row, Surface } from '../Surface.jsx';

describe('primitives estruturais', () => {
  it('Surface preserva a semântica escolhida', () => {
    render(<Surface as="article">Conteúdo</Surface>);
    expect(screen.getByRole('article')).toHaveTextContent('Conteúdo');
  });

  it('Row interativo usa button nativo e respeita disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(<Row onClick={onClick}>Abrir detalhe</Row>);

    const row = screen.getByRole('button', { name: 'Abrir detalhe' });
    row.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();

    rerender(
      <Row onClick={onClick} disabled>
        Abrir detalhe
      </Row>
    );
    await user.click(screen.getByRole('button', { name: 'Abrir detalhe' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('Row com href usa link e bloqueia navegação quando disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { rerender } = render(
      <Row href="/servicos" onClick={onClick}>
        Ver serviços
      </Row>
    );

    const link = screen.getByRole('link', { name: 'Ver serviços' });
    expect(link).toHaveAttribute('href', '/servicos');

    rerender(
      <Row href="/servicos" onClick={onClick} disabled>
        Ver serviços
      </Row>
    );
    expect(screen.getByRole('link', { name: 'Ver serviços' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await user.click(screen.getByRole('link', { name: 'Ver serviços' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('PageHeader expõe heading configurável e voltar acessível', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<PageHeader title="Serviços" subtitle="Visão geral" headingLevel={2} onBack={onBack} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Serviços' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('PanelScope envolve TODA superfície — Aurora em tudo, sem prop de exceção (SL-09)', () => {
    const { container, rerender } = render(
      <PanelScope>
        <span>Público</span>
      </PanelScope>
    );
    expect(container.querySelector('.panel-ui')).toBeInTheDocument();

    rerender(
      <PanelScope>
        <span>Painel</span>
      </PanelScope>
    );
    expect(container.querySelector('[data-ui="panel"]')).toHaveAttribute(
      'data-panel-scope',
      'contents'
    );
  });
});
