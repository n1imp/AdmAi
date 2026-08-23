/**
 * O selo de status marca EXCEÇÃO — e 'ativo' é o normal.  [SL-12]
 *
 * O DEFEITO: a linha comparava `status !== 'aprovado'`, mas o valor que a aprovação grava é
 * 'ativo' (servicos.js:285 no bot). Resultado: TODO serviço normal carregava um selo âmbar
 * "ativo", como se algo estivesse errado — e o selo roubava largura do nome em 360px.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Servicos from '../Servicos.jsx';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: vi.fn(), patch: vi.fn() },
  formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  formatarData: () => '20/08/2026 10:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const servico = (over) => ({
  id: over.id,
  tecnico: { nome: 'Ana Técnica' },
  local: 'Casa do cliente',
  descricao: 'Troca de fechadura',
  criadoEm: '2026-08-20T10:00:00Z',
  valorLiquido: 100,
  valorCobrado: 120,
  ...over,
});

describe('Servicos — selo de status', () => {
  it("'ativo' é o normal: NENHUM selo; 'pendente' é exceção: selo presente", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [servico({ id: 1, status: 'ativo' }), servico({ id: 2, status: 'pendente' })],
        nextCursor: null,
        total: 2,
      },
    });
    render(<Servicos />);
    expect(await screen.findAllByText(/troca de fechadura/i)).toHaveLength(2);
    // Sob o bug antigo ('!== aprovado'), o selo "ativo" apareceria aqui.
    expect(screen.queryByText(/^ativo$/i)).toBeNull();
    expect(screen.getByText(/^pendente$/i)).toBeInTheDocument();
  });
});
