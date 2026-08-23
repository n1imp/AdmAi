import { Link } from 'react-router-dom';
import { abrirPreferenciasDeCookies } from './CookieBanner.jsx';

/**
 * Rodapé enxuto com os links legais (Privacidade e Termos). Usado no Login e no
 * Layout das páginas internas.
 */
export default function RodapeLegal({ className = '' }) {
  const ano = new Date().getFullYear();
  /* Área de TOQUE ≥ 44px sem crescer o visual: os links continuam texto de 12px, mas o alvo
     que o dedo encontra é o inline-flex com min-height do token. Este rodapé aparece em TODA
     página — era o maior reincidente de GAP-UX-ALVO-01, e um componente só fecha a classe. */
  const alvo =
    'inline-flex items-center min-h-[44px] px-2 -my-2 hover:text-muted transition-colors';
  return (
    <footer className={`text-center text-xs text-dark-500 py-4 px-6 ${className}`}>
      <span className="font-mono">© {ano} AdmAi</span>
      <span className="mx-1 text-dark-600">·</span>
      <Link to="/privacidade" className={alvo}>
        Privacidade
      </Link>
      <span className="mx-1 text-dark-600">·</span>
      <Link to="/termos" className={alvo}>
        Termos
      </Link>
      <span className="mx-1 text-dark-600">·</span>
      <Link to="/cookies" className={alvo}>
        Cookies
      </Link>
      <span className="mx-1 text-dark-600">·</span>
      {/* O controle que a Política de Cookies §3 promete: revoga a escolha e reabre o banner. */}
      <button type="button" onClick={abrirPreferenciasDeCookies} className={alvo}>
        Preferências de cookies
      </button>
    </footer>
  );
}
