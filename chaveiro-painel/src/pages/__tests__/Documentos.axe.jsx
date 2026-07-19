// a11y (axe) — tela Documentos (F9/M4). Renderiza os estados com conteúdo e valida
// que não há violações sérias/críticas (labels de form, nomes acessíveis dos botões).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Documentos from '../Documentos.jsx';
import { checarA11y, violacoesRelevantes, formatarViolacoes } from '../../test/axe.js';

const mockGet = vi.fn();
vi.mock('../../lib/api.js', () => ({
  default: { get: (...a) => mockGet(...a), post: vi.fn(), delete: vi.fn() },
  formatarData: () => '01/07/2026 10:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

const DOC = {
  id: 1,
  tipo: 'contrato',
  nome: 'contrato.pdf',
  mime: 'application/pdf',
  tamanho: 2048,
  criadoEm: '2026-07-01T10:00:00Z',
  url: '/api/me/documentos/1/arquivo',
};

afterEach(cleanup);

describe('a11y (axe) — Documentos (M4)', () => {
  it('lista + formulário de envio sem violações sérias/críticas', async () => {
    mockGet.mockResolvedValue({ data: { documentos: [DOC] } });
    const { container } = render(<Documentos />);
    await screen.findByText('contrato.pdf');
    const v = violacoesRelevantes(await checarA11y(container));
    expect(v, formatarViolacoes(v)).toHaveLength(0);
  });
});
