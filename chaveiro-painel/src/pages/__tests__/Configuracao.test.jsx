/**
 * O hub de configuração: sem promessas quebradas E com o WhatsApp atrás do flag POST_MVP.
 * [SL-10 GAP-UX-CONFIG-PROMESSA-01 + D2 amendment: WhatsApp SUPERINTEGRATION POST_MVP]
 *
 * SL-10 matou o "em breve"/chevron-que-recusa; o D2 amendment moveu o WhatsApp para trás de
 * um feature flag (OFF no MVP). No MVP o card do WhatsApp NÃO aparece — logo o hub não promete
 * a superintegração diferida — e Plano/cobrança continua um link real. Com o flag ON (POST_MVP),
 * o card reaparece e volta a ser o alvo real que o tour mira.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

/* Espelha o default real: diferidas OFF (WHATSAPP e SUBSCRIPTIONS_BILLING), o resto ligado.
   vi.hoisted: o mock é consultado já na fase de IMPORT (algum módulo da cadeia chama
   featureAtiva no top-level), então o estado precisa existir antes dos imports. */
const flags = vi.hoisted(() => ({ WHATSAPP: false, SUBSCRIPTIONS_BILLING: false }));
const flagWhatsapp = {
  get valor() {
    return flags.WHATSAPP;
  },
  set valor(v) {
    flags.WHATSAPP = v;
  },
};
vi.mock('../../lib/featureFlags.js', () => ({
  featureAtiva: (nome) => (nome in flags ? flags[nome] : true),
}));

beforeEach(() => {
  flags.WHATSAPP = false;
  flags.SUBSCRIPTIONS_BILLING = false;
});
afterEach(cleanup);

describe('Configuracao — WhatsApp atrás do flag POST_MVP', () => {
  it('MVP (flag OFF): o card do WhatsApp NÃO aparece — o hub não promete a superintegração', () => {
    render(<Configuracao />);
    expect(document.querySelector('a[href="/configuracao/whatsapp"]')).toBeNull();
    expect(screen.queryByText(/^whatsapp$/i)).toBeNull();
  });

  it('POST_MVP (flag ON): o card do WhatsApp reaparece e é o alvo que o tour mira', () => {
    flagWhatsapp.valor = true;
    render(<Configuracao />);
    const alvo = document.querySelector('a[href="/configuracao/whatsapp"]');
    expect(alvo).not.toBeNull();
    expect(alvo.textContent).toMatch(/whatsapp/i);
  });

  it('Plano e cobrança NÃO aparece no MVP (assinaturas fora do escopo, D2 Refoundation)', () => {
    render(<Configuracao />);
    expect(document.querySelector('a[href="/assinatura"]')).toBeNull();
    expect(document.body.textContent).not.toMatch(/plano e cobrança/i);
  });

  it('nenhum card promete "em breve" — nem com o flag OFF nem ON', () => {
    render(<Configuracao />);
    expect(screen.queryByText(/em breve/i)).toBeNull();
    cleanup();
    flagWhatsapp.valor = true;
    render(<Configuracao />);
    expect(screen.queryByText(/em breve/i)).toBeNull();
  });
});
