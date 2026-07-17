import { Component } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { reportarErro } from '../lib/monitoring.js';

/**
 * Captura erros de renderização em qualquer página do painel e mostra uma tela
 * amigável em vez de uma tela branca. Plugue aqui um coletor (ex.: Sentry) no
 * componentDidCatch quando houver DSN no frontend.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    reportarErro(erro, { componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div className="min-h-dvh bg-dark-900 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-5">
          <KeyRound size={30} className="text-accent-300" strokeWidth={2} />
        </div>
        <h1 className="font-display font-bold text-2xl text-white uppercase tracking-wide">
          Algo deu errado
        </h1>
        <p className="text-muted mt-3 max-w-sm leading-relaxed">
          Ocorreu um erro inesperado no painel. Tente recarregar a página. Se o problema continuar,
          fale com o suporte.
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary mt-6">
          <RefreshCw size={16} /> Recarregar
        </button>
        <a href="/" className="text-sm text-muted hover:text-white transition-colors mt-4">
          Voltar ao início
        </a>
      </div>
    );
  }
}
