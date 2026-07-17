import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '../../Toast.jsx';
import Overlay from '../Overlay.jsx';

function Harness({ closeOnBackdrop = true }) {
  const [open, setOpen] = useState(false);
  const initialFocusRef = useRef(null);

  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir configurações</button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        title="Configurações"
        description="Ajuste os dados"
        initialFocusRef={initialFocusRef}
        closeOnBackdrop={closeOnBackdrop}
      >
        <button>Cancelar</button>
        <button ref={initialFocusRef}>Confirmar</button>
      </Overlay>
    </>
  );
}

function ExternalFocusHarness() {
  const externalRef = useRef(null);

  return (
    <>
      <button ref={externalRef}>Controle externo</button>
      <Overlay open onClose={() => {}} title="Aviso" initialFocusRef={externalRef}>
        <button>Continuar</button>
      </Overlay>
    </>
  );
}

function DisabledInitialFocusHarness() {
  const disabledRef = useRef(null);

  return (
    <Overlay
      open
      onClose={() => {}}
      title="Ação indisponível"
      initialFocusRef={disabledRef}
      showCloseButton={false}
    >
      <button ref={disabledRef} disabled>
        Indisponível
      </button>
      <div aria-hidden="true">
        <button>Oculto</button>
      </div>
      <button>Continuar</button>
    </Overlay>
  );
}

function NestedHarness() {
  const [firstOpen, setFirstOpen] = useState(true);
  const [secondOpen, setSecondOpen] = useState(false);

  return (
    <>
      <Overlay open={firstOpen} onClose={() => setFirstOpen(false)} title="Primeiro painel">
        <button onClick={() => setSecondOpen(true)}>Abrir segundo</button>
      </Overlay>
      <Overlay open={secondOpen} onClose={() => setSecondOpen(false)} title="Segundo painel">
        <button>Confirmar segundo</button>
      </Overlay>
    </>
  );
}

function SimultaneousHarness() {
  return (
    <>
      <Overlay open onClose={() => {}} title="Primeiro simultâneo">
        <button>Primeira ação</button>
      </Overlay>
      <Overlay open onClose={() => {}} title="Segundo simultâneo">
        <button>Segunda ação</button>
      </Overlay>
    </>
  );
}

function ToastInsideOverlay() {
  const toast = useToast();

  return (
    <Overlay open onClose={() => {}} title="Salvar alteração">
      <button onClick={() => toast('Não foi possível salvar', 'error')}>Salvar</button>
    </Overlay>
  );
}

describe('Overlay', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    document.getElementById('root')?.remove();
  });

  it('nomeia o dialog, contém foco, fecha com Escape e restaura o disparador', async () => {
    const user = userEvent.setup();
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(<Harness />, { container: applicationRoot });

    const trigger = screen.getByRole('button', { name: 'Abrir configurações' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Configurações' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(applicationRoot).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus());

    trigger.focus();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(applicationRoot).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
    expect(trigger).toHaveFocus();
  });

  it('diferencia clique interno de backdrop e respeita o contrato de fechamento', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir configurações' }));

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector('.panel-overlay-root'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<Harness closeOnBackdrop={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir configurações' }));
    fireEvent.mouseDown(document.querySelector('.panel-overlay-root'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restaura efeitos globais ao desmontar aberto', () => {
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    const { unmount } = render(
      <Overlay open onClose={() => {}} ariaLabel="Aviso">
        Conteúdo
      </Overlay>,
      { container: applicationRoot }
    );

    expect(applicationRoot).toHaveAttribute('inert');
    unmount();
    expect(applicationRoot).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('ignora initialFocusRef externo e mantém o foco dentro do dialog', async () => {
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(<ExternalFocusHarness />, { container: applicationRoot });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus());
    expect(applicationRoot.querySelector('button')).not.toHaveFocus();
  });

  it('ignora initialFocusRef desabilitado e usa o primeiro controle disponível', async () => {
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(<DisabledInitialFocusHarness />, { container: applicationRoot });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Indisponível' })).not.toHaveFocus();
  });

  it('mantém apenas o último overlay ativo quando ambos montam abertos', async () => {
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(<SimultaneousHarness />, { container: applicationRoot });

    const roots = [...document.querySelectorAll('[data-panel-overlay-root]')];
    expect(roots).toHaveLength(2);
    expect(roots[0]).toHaveAttribute('inert');
    expect(roots[0]).toHaveAttribute('aria-hidden', 'true');
    expect(roots[1]).not.toHaveAttribute('inert');
    expect(roots[1]).not.toHaveAttribute('aria-hidden');
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Segundo simultâneo' })).toContainElement(
        document.activeElement
      )
    );
  });

  it('fecha apenas o overlay superior e preserva o bloqueio global do anterior', async () => {
    const user = userEvent.setup();
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(<NestedHarness />, { container: applicationRoot });

    const firstDialog = screen.getByRole('dialog', { name: 'Primeiro painel' });
    await user.click(screen.getByRole('button', { name: 'Abrir segundo' }));
    const secondDialog = screen.getByRole('dialog', { name: 'Segundo painel' });
    const firstRoot = firstDialog.closest('[data-panel-overlay-root]');
    expect(firstRoot).toHaveAttribute('inert');
    expect(firstRoot).toHaveAttribute('aria-hidden', 'true');

    await user.keyboard('{Escape}');
    expect(secondDialog).not.toBeInTheDocument();
    expect(firstDialog).toBeInTheDocument();
    expect(firstRoot).not.toHaveAttribute('inert');
    expect(firstRoot).not.toHaveAttribute('aria-hidden');
    expect(applicationRoot).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Abrir segundo' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(applicationRoot).not.toHaveAttribute('inert');
    expect(applicationRoot).not.toHaveAttribute('aria-hidden');
    expect(document.body.style.overflow).toBe('');
  });

  it('mantém toast visível e anunciável fora da árvore inert', async () => {
    const user = userEvent.setup();
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(
      <ToastProvider>
        <ToastInsideOverlay />
      </ToastProvider>,
      { container: applicationRoot }
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('Não foi possível salvar');
    expect(applicationRoot).toHaveAttribute('inert');
    expect(applicationRoot).toHaveAttribute('aria-hidden', 'true');
    expect(applicationRoot).not.toContainElement(toast);
    expect(document.body).toContainElement(toast);
  });

  it('reflete size e variant como data-atributos', () => {
    render(
      <Overlay open onClose={() => {}} title="Grande" size="lg" variant="fullscreen">
        <button>Ok</button>
      </Overlay>
    );
    const dialog = screen.getByRole('dialog', { name: 'Grande' });
    expect(dialog).toHaveAttribute('data-size', 'lg');
    expect(dialog).toHaveAttribute('data-variant', 'fullscreen');
    expect(document.querySelector('.panel-overlay-root')).toHaveAttribute(
      'data-variant',
      'fullscreen'
    );
  });

  it('usa data-size="md" por padrão e omite data-variant', () => {
    render(
      <Overlay open onClose={() => {}} title="Padrão">
        <button>Ok</button>
      </Overlay>
    );
    const dialog = screen.getByRole('dialog', { name: 'Padrão' });
    expect(dialog).toHaveAttribute('data-size', 'md');
    expect(dialog).not.toHaveAttribute('data-variant');
  });

  it('initialFocus="dialog" foca o próprio diálogo em vez do primeiro controle', async () => {
    const applicationRoot = document.createElement('div');
    applicationRoot.id = 'root';
    document.body.appendChild(applicationRoot);
    render(
      <Overlay
        open
        onClose={() => {}}
        title="Leitura"
        initialFocus="dialog"
        showCloseButton={false}
      >
        <button>Primeira ação</button>
      </Overlay>,
      { container: applicationRoot }
    );

    const dialog = screen.getByRole('dialog', { name: 'Leitura' });
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Primeira ação' })).not.toHaveFocus();
  });

  it('mantém o dialog montado durante a saída animada e desmonta ao fim', () => {
    vi.useFakeTimers();
    window.matchMedia = (q) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    });
    try {
      const { rerender } = render(
        <Overlay open onClose={() => {}} title="Sai">
          <button>Ok</button>
        </Overlay>
      );
      expect(screen.getByRole('dialog', { name: 'Sai' })).toBeInTheDocument();

      rerender(
        <Overlay open={false} onClose={() => {}} title="Sai">
          <button>Ok</button>
        </Overlay>
      );
      // Ainda montado durante a animação de saída, marcado com data-closing.
      const dialog = screen.getByRole('dialog', { name: 'Sai' });
      expect(dialog).toHaveAttribute('data-closing', 'true');

      act(() => vi.advanceTimersByTime(250));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
      delete window.matchMedia;
    }
  });
});
