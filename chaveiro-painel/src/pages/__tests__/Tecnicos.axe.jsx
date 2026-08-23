// a11y (axe) — /tecnicos pós-redesign (SL-15, direção B do DECISOR D-SL15).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Tecnicos from '../Tecnicos.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: vi.fn(), patch: vi.fn() },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('a11y (axe) — Tecnicos (SL-15)', () => {
  it('lista com técnico de nome longo sem violações sérias/críticas', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: 1,
          nome: 'Maria Auxiliadora dos Santos Albuquerque',
          telefone: '5511999990001',
          ativo: true,
          ehDono: false,
          totalServicos: 12,
          receitaLiquida: 1234.56,
          comissaoGerada: 246.91,
          saldoPendente: 100,
        },
      ],
    });
    render(<Tecnicos />);
    await screen.findByText(/Maria Auxiliadora/);
    const resultado = await checarA11y(document.body);
    const serias = violacoesRelevantes(resultado);
    expect(serias, formatarViolacoes(serias)).toHaveLength(0);
  });
});
