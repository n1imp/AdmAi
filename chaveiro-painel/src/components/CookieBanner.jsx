import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const CHAVE = 'admai_cookies_consent';

export function useCookieConsent() {
  const valor = localStorage.getItem(CHAVE); // null | 'all' | 'necessary'
  return {
    consentimento: valor,
    aceitouTodos: valor === 'all',
    definido: valor !== null,
  };
}

export default function CookieBanner() {
  const [oculto, setOculto] = useState(() => localStorage.getItem(CHAVE) !== null);

  function aceitar(opcao) {
    localStorage.setItem(CHAVE, opcao);
    setOculto(true);
  }

  if (oculto) return null;

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
    >
      <div className="max-w-3xl mx-auto m-3 bg-dark-800/95 backdrop-blur-sm border border-dark-600 rounded-xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/20 flex items-center justify-center shrink-0 mt-0.5">
            <Cookie size={17} className="text-accent-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">Usamos cookies para manter sua sessão e melhorar o produto.</p>
            <p className="text-muted text-xs mt-0.5">
              Cookies necessários são essenciais para o funcionamento do painel. Os demais (analíticos e suporte) são opcionais.{' '}
              <Link to="/cookies" className="text-accent-300 hover:text-accent-200 transition-colors">
                Saiba mais
              </Link>
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={() => aceitar('all')}
            className="btn-primary flex-1 min-w-[120px] text-sm py-2"
          >
            Aceitar todos
          </button>
          <button
            onClick={() => aceitar('necessary')}
            className="btn-secondary flex-1 min-w-[120px] text-sm py-2"
          >
            Apenas necessários
          </button>
        </div>
      </div>
    </div>
  );
}
