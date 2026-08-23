/**
 * A superfície mínima de billing diz o MOTIVO e oferece a ação certa.  [SL-10]
 *
 * Decisão do usuário: página sobre os 3 endpoints existentes, zero lógica nova.
 * O contrato aqui: cada status → mensagem que explica + ação que resolve
 * (sem plano/cancelada → checkout; assinatura viva no Stripe → portal); ações
 * só para admin (endpoints são adminOnly — botão para 403 seria mentira de UI).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Assinatura from '../Assinatura.jsx';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) },
  formatarData: () => '30/09/2026',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

let isAdmin = true;
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ isAdmin }) }));

function comStatus(assinatura) {
  mockGet.mockResolvedValue({ data: assinatura });
  return render(<Assinatura />);
}

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin = true;
});

describe('Assinatura — matriz status → motivo/ação', () => {
  it.each([
    ['sem_plano', /nenhuma assinatura ativa/i, 'Assinar'],
    ['trialing', /período de teste/i, 'Assinar'],
    ['active', /assinatura ativa/i, 'Gerenciar assinatura'],
    ['past_due', /pagamento atrasado/i, 'Gerenciar assinatura'],
    ['unpaid', /pagamento pendente/i, 'Gerenciar assinatura'],
    ['incomplete', /assinatura incompleta/i, 'Gerenciar assinatura'],
    ['canceled', /assinatura cancelada/i, 'Assinar'],
  ])('%s → mensagem própria + ação "%s"', async (status, mensagem, rotulo) => {
    comStatus({ status, trialFimEm: null, periodoFimEm: null, canceladoEm: null });
    expect(await screen.findByRole('heading', { name: mensagem })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(rotulo, 'i') })).toBeInTheDocument();
  });

  it('trialing GERIDO PELO STRIPE (periodoFimEm presente) vai ao portal — checkout dobraria a assinatura', async () => {
    comStatus({ status: 'trialing', trialFimEm: '2026-09-05', periodoFimEm: '2026-09-05' });
    expect(
      await screen.findByRole('button', { name: /gerenciar assinatura/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/cobrança começa automaticamente/i)).toBeInTheDocument();
  });

  it('trialing de CADASTRO (sem periodoFimEm) assina via checkout — o portal responderia 400', async () => {
    comStatus({ status: 'trialing', trialFimEm: '2026-09-05', periodoFimEm: null });
    expect(await screen.findByRole('button', { name: /^assinar$/i })).toBeInTheDocument();
    // E o texto NÃO promete cobrança automática: não há cartão nenhum em arquivo.
    expect(screen.queryByText(/cobrança começa automaticamente/i)).toBeNull();
  });

  it('status desconhecido não some nem inventa: mostra o fato cru e abre o portal', async () => {
    comStatus({ status: 'paused', trialFimEm: null, periodoFimEm: null, canceladoEm: null });
    expect(await screen.findByRole('heading', { name: /status: paused/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /gerenciar assinatura/i })).toBeInTheDocument();
  });

  it('cancelada com período restante diz até QUANDO o acesso dura', async () => {
    comStatus({ status: 'canceled', periodoFimEm: '2026-09-30T00:00:00Z' });
    expect(await screen.findByText(/acesso continua até 30\/09\/2026/i)).toBeInTheDocument();
  });

  it('a ação chama o endpoint certo: Assinar → checkout', async () => {
    mockPost.mockResolvedValue({ data: { url: 'https://stripe.test/s' } });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    comStatus({ status: 'sem_plano' });
    await userEvent.click(await screen.findByRole('button', { name: /assinar/i }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/billing/checkout'));
    expect(assign).toHaveBeenCalledWith('https://stripe.test/s');
    vi.unstubAllGlobals();
  });

  it('não-admin: status visível, ação AUSENTE (endpoint retornaria 403), orientação presente', async () => {
    isAdmin = false;
    comStatus({ status: 'active' });
    expect(await screen.findByRole('heading', { name: /assinatura ativa/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assinar|gerenciar/i })).toBeNull();
    expect(screen.getByText(/somente o administrador/i)).toBeInTheDocument();
  });

  it('falha do status: estado de erro honesto, sem tela em branco', async () => {
    mockGet.mockRejectedValue(new Error('rede'));
    render(<Assinatura />);
    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
  });
});
