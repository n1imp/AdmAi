/**
 * O hub de configuração parou de PROMETER e recusar.  [SL-10 · GAP-UX-CONFIG-PROMESSA-01]
 *
 * O DEFEITO: WhatsApp e "Plano e cobrança" tinham chevron de navegação, `breve: true` e
 * clique caindo em toast "Em breve" — sobre capacidades que EXISTEM (/configuracao/whatsapp
 * renderiza; o backend de billing está montado). E o tour mirava
 * `a[href="/configuracao/whatsapp"]`, um elemento que o hub nunca renderizava (card era
 * <button onClick={navigate}>).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Configuracao from '../Configuracao.jsx';

vi.mock('../../lib/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ isAdmin: true, pode: () => false }),
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, className }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

describe('Configuracao — cards navegáveis são links de verdade', () => {
  it('WhatsApp navega para a página que sempre existiu — e é o alvo que o tour mira', () => {
    render(<Configuracao />);
    const alvoDoTour = document.querySelector('a[href="/configuracao/whatsapp"]');
    expect(alvoDoTour).not.toBeNull();
    expect(alvoDoTour.textContent).toMatch(/whatsapp/i);
  });

  it('Plano e cobrança leva à superfície de assinatura', () => {
    render(<Configuracao />);
    const link = document.querySelector('a[href="/assinatura"]');
    expect(link).not.toBeNull();
    expect(link.textContent).toMatch(/plano e cobrança/i);
  });

  it('nenhum card promete "em breve" — a promessa morreu com a causa', () => {
    render(<Configuracao />);
    expect(screen.queryByText(/em breve/i)).toBeNull();
  });
});
