import { Link } from 'react-router-dom';

/**
 * Rodapé enxuto com os links legais (Privacidade e Termos). Usado no Login e no
 * Layout das páginas internas.
 */
export default function RodapeLegal({ className = '' }) {
  const ano = new Date().getFullYear();
  return (
    <footer className={`text-center text-xs text-dark-500 py-4 px-6 ${className}`}>
      <span className="font-mono">© {ano} ChaveiroBot</span>
      <span className="mx-2 text-dark-600">·</span>
      <Link to="/privacidade" className="hover:text-muted transition-colors">
        Privacidade
      </Link>
      <span className="mx-2 text-dark-600">·</span>
      <Link to="/termos" className="hover:text-muted transition-colors">
        Termos
      </Link>
    </footer>
  );
}
