import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErroBanner from '../../ErroBanner.jsx';
import EstadoVazio from '../../EstadoVazio.jsx';
import { SkeletonCard, SkeletonKpi, SkeletonLista, SkeletonServico } from '../../Skeleton.jsx';
import { ToastProvider, useToast } from '../../Toast.jsx';
import { Button } from '../Button.jsx';
import FeedbackState from '../FeedbackState.jsx';

function ToastTrigger({ mensagem = 'Alterações salvas', tipo = 'success' }) {
  const toast = useToast();
  return <button onClick={() => toast(mensagem, tipo)}>Notificar {tipo}</button>;
}

describe('FeedbackState e adapters legados', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aplica a política de anúncio de cada categoria', () => {
    const { rerender } = render(<FeedbackState state="loading" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    rerender(<FeedbackState state="updating" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');

    rerender(<FeedbackState state="error" />);
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-live');

    rerender(<FeedbackState state="success" />);
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-live');

    rerender(<FeedbackState state="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent('Você está sem conexão');

    rerender(<FeedbackState state="empty" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<FeedbackState state="permission-denied" />);
    expect(screen.getByText('Acesso não permitido')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    rerender(<FeedbackState state="permission-denied" announce />);
    expect(screen.getByRole('status')).toHaveTextContent('Acesso não permitido');
  });

  it('mantém a ação acessível por teclado', async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(
      <FeedbackState state="offline" action={<Button onClick={action}>Tentar novamente</Button>} />
    );

    const button = screen.getByRole('button', { name: 'Tentar novamente' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(action).toHaveBeenCalledOnce();
  });

  it('preserva EstadoVazio e ErroBanner com semântica consistente', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onCreate = vi.fn();
    const onAction = vi.fn();
    const { rerender } = render(
      <EstadoVazio
        mensagem="Sem serviços"
        sub="Cadastre o primeiro"
        cta={{ label: 'Cadastrar serviço', onClick: onCreate }}
      />
    );
    expect(screen.getByText('Sem serviços')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar serviço' }));
    expect(onCreate).toHaveBeenCalledOnce();

    rerender(
      <ErroBanner
        mensagem="Falha ao carregar"
        onRetry={onRetry}
        acao="Usar dados locais"
        onAcao={onAction}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar');
    await user.click(screen.getByRole('button', { name: 'Usar dados locais' }));
    expect(onAction).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('anuncia cada grupo skeleton apenas uma vez', () => {
    const { rerender } = render(
      <>
        <SkeletonKpi announce />
        <SkeletonKpi />
        <SkeletonKpi />
      </>
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Carregando indicadores' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(<SkeletonLista qtd={3} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status', { name: 'Carregando lista' })).toHaveAttribute(
      'aria-busy',
      'true'
    );

    rerender(
      <>
        <SkeletonCard />
        <SkeletonServico />
      </>
    );
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Carregando serviço' })).toBeInTheDocument();

    rerender(<SkeletonCard announce={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('anuncia e permite fechar um toast', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Notificar success' }));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Alterações salvas');
    expect(toast).not.toHaveAttribute('aria-live');
    expect(toast.closest('[data-ui="panel"]')).toHaveClass('panel-ui');
    await user.click(screen.getByRole('button', { name: 'Fechar notificação' }));
    expect(screen.queryByText('Alterações salvas')).not.toBeInTheDocument();
  });

  it('diferencia erro e aviso sem duplicar a live region', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastTrigger mensagem="Falha ao salvar" tipo="error" />
        <ToastTrigger mensagem="Conexão instável" tipo="warning" />
      </ToastProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Notificar error' }));
    await user.click(screen.getByRole('button', { name: 'Notificar warning' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao salvar');
    expect(screen.getByRole('alert')).not.toHaveAttribute('aria-live');
    expect(screen.getByRole('status')).toHaveTextContent('Conexão instável');
  });

  it('remove automaticamente o toast após o tempo contratado', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Notificar success' }));
    expect(screen.getByText('Alterações salvas')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3500));
    expect(screen.queryByText('Alterações salvas')).not.toBeInTheDocument();
  });
});
