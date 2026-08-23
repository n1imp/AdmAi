/**
 * O rodapé cumpre a promessa da Política de Cookies §3: "Preferências de cookies" existe e
 * REVOGA — remove a escolha gravada e avisa o banner para reabrir.  [SL-05]
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import RodapeLegal from '../RodapeLegal.jsx';
import { EVENTO_PREFERENCIAS_COOKIES } from '../CookieBanner.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('RodapeLegal — preferências de cookies', () => {
  it('o controle existe com nome acessível e remove o consentimento ao ser acionado', async () => {
    localStorage.setItem('admai_cookies_consent', 'all');
    let avisado = false;
    const ouvir = () => (avisado = true);
    window.addEventListener(EVENTO_PREFERENCIAS_COOKIES, ouvir);

    render(<RodapeLegal />, { wrapper: MemoryRouter });
    await userEvent.click(screen.getByRole('button', { name: 'Preferências de cookies' }));

    expect(localStorage.getItem('admai_cookies_consent')).toBeNull();
    expect(avisado).toBe(true);
    window.removeEventListener(EVENTO_PREFERENCIAS_COOKIES, ouvir);
  });

  it('os três links legais continuam presentes (o controle novo não substitui nenhum)', () => {
    render(<RodapeLegal />, { wrapper: MemoryRouter });
    for (const nome of ['Privacidade', 'Termos', 'Cookies']) {
      expect(screen.getByRole('link', { name: nome })).toBeInTheDocument();
    }
  });
});
