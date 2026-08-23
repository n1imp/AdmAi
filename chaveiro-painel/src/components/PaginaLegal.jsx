import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead.js';
import { KeyRound, ArrowLeft, AlertTriangle } from 'lucide-react';
import { ATUALIZADO_EM } from '../lib/legal.js';

/**
 * Layout reutilizável para documentos legais (Privacidade, Termos). Recebe um
 * `doc` estruturado de lib/legal.js e renderiza título, seções e listas.
 */
export default function PaginaLegal({ doc }) {
  useDocumentHead({ titulo: doc?.titulo, indexavel: true });
  return (
    <div className="min-h-dvh bg-dark-900">
      <header className="border-b border-dark-600">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-11 h-11 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
              <KeyRound size={18} className="text-accent-300" strokeWidth={2} />
            </div>
            <span className="font-display font-bold text-lg tracking-wide text-white">
              ADM<span className="text-accent-400">AI</span>
            </span>
          </Link>
          <Link
            to="/login"
            className="alvo-toque-linha gap-1.5 px-2 text-sm text-muted hover:text-white transition-colors"
          >
            <ArrowLeft size={14} /> Voltar
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="font-display font-bold text-3xl text-white uppercase tracking-tight">
          {doc.titulo}
        </h1>
        <p className="text-xs text-muted mt-1 font-mono">Última atualização: {ATUALIZADO_EM}</p>

        {doc.aviso && (
          <div className="flex items-start gap-2 mt-5 bg-warning/10 border border-warning/30 rounded-md px-4 py-3">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            <p className="text-sm text-warning">{doc.aviso}</p>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {doc.secoes.map((s) => (
            <section key={s.titulo}>
              <h2 className="font-display font-semibold text-lg text-white">{s.titulo}</h2>
              {s.paragrafos?.map((p, i) => (
                <p key={i} className="text-muted leading-relaxed mt-2">
                  {p}
                </p>
              ))}
              {s.itens && (
                <ul className="mt-2 space-y-1.5">
                  {s.itens.map((it, i) => (
                    <li key={i} className="text-muted leading-relaxed pl-4 relative">
                      <span className="absolute left-0 text-accent-400">•</span>
                      {it}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-10 pt-6 border-t border-dark-600">
          <Link to="/login" className="btn-primary inline-flex">
            <ArrowLeft size={16} /> Voltar ao painel
          </Link>
        </div>
      </main>
    </div>
  );
}
