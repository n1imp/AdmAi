import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EstadoVazio({ mensagem = 'Nenhum dado encontrado', sub = '', cta = null }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-lg bg-dark-700 border border-dark-600 flex items-center justify-center">
        <Inbox size={28} className="text-muted" />
      </div>
      <p className="text-white font-medium">{mensagem}</p>
      {sub && <p className="text-muted text-sm max-w-xs">{sub}</p>}
      {cta && (
        cta.to
          ? <Link to={cta.to} className="btn-primary mt-1 text-sm">{cta.label}</Link>
          : <button type="button" onClick={cta.onClick} className="btn-primary mt-1 text-sm">{cta.label}</button>
      )}
    </div>
  );
}
