// a11y (axe) — Meus Serviços (F9/M3), com o serviço atual em andamento (flag on).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MeusServicos from '../MeusServicos.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: vi.fn() },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/06/2026 10:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const ATIVO = {
  id: 1,
  status: 'ativo',
  local: 'Centro',
  descricao: 'Troca de segredo',
  valorCobrado: 200,
  comissaoGerada: 40,
  criadoEm: '2026-07-01T10:00:00Z',
};

afterEach(cleanup);

describe('a11y (axe) — MeusServicos (M3)', () => {
  it('lista + ação "Iniciar serviço" (flag on) sem violações sérias/críticas', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/me/servico-atual') return Promise.resolve({ data: { servico: null } });
      return Promise.resolve({ data: [ATIVO] });
    });
    const { container } = render(<MeusServicos />);
    await screen.findByRole('button', { name: /Iniciar serviço/ });
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });
});
