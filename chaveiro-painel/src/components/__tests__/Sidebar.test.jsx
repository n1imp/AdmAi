import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../Sidebar.jsx';

/**
 * AUD-INPUT-DESKTOP-LOGOUT — o desktop era o único viewport SEM logout (o "Sair"
 * vivia só em /mais, aba da navegação mobile; provado em staging real 2026-08-27).
 * Estes testes fixam o contrato mínimo: o rodapé da Sidebar expõe "Sair" e o clique
 * chama exatamente o logout() compartilhado do AuthContext (o mesmo de Mais.jsx).
 */

const mockLogout = vi.fn();
const mockAuth = vi.fn();

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => mockAuth(),
}));

vi.mock('react-router-dom', () => ({
  NavLink: ({ to, children, className }) => (
    <a
      href={to}
      className={typeof className === 'function' ? className({ isActive: false }) : className}
    >
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockReturnValue({
    user: { nome: 'Dono Teste', admin: true },
    papel: 'dono',
    permissoes: {},
    pode: () => true,
    podeProprio: () => true,
    logout: mockLogout,
  });
});

describe('<Sidebar> — logout no desktop', () => {
  it('expõe o botão "Sair" no rodapé', () => {
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument();
  });

  it('clique em "Sair" chama logout() exatamente uma vez', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /sair/i }));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('continua expondo "Sair" mesmo enquanto as permissões carregam (gestor)', () => {
    mockAuth.mockReturnValue({
      user: { nome: 'Gestor Teste' },
      papel: 'gestor',
      permissoes: null, // nav em skeleton — o logout não pode depender disso
      pode: () => false,
      podeProprio: () => false,
      logout: mockLogout,
    });
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: /sair/i })).toBeInTheDocument();
  });
});
