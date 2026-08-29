import { Link } from 'react-router-dom';
import { LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { buildNavigation } from '../config/navigation.js';

// "Mais": destinos que não cabem na bottom navigation, derivados do mesmo manifesto
// (filtrados por papel e permissão — não mais cards fixos). Ações de conta ficam no fim.
function CardLink({ to, label, descricao, icon: Icon }) {
  return (
    <Link
      to={to}
      className="card flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:border-dark-500 w-full min-h-[56px]"
    >
      <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 border border-dark-600 bg-dark-700">
        <Icon size={21} className="text-accent-300" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{label}</p>
        {descricao && <p className="text-xs text-muted truncate">{descricao}</p>}
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" aria-hidden="true" />
    </Link>
  );
}

export default function Mais() {
  const { user, papel, permissoes, pode, podeProprio, logout } = useAuth();
  const carregando = papel !== 'dono' && permissoes === null;
  const grupos = carregando
    ? []
    : buildNavigation({ papel, pode, podeProprio, admin: user?.admin === true }).moreGroups;

  return (
    <div className="flex flex-col min-h-full px-4 pt-6 pb-8">
      <div className="mb-6">
        <p className="section-label mb-1">
          <span className="w-5 h-px bg-accent-400" /> {user?.nome ?? 'Conta'}
        </p>
        <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Mais</h1>
      </div>

      <div className="flex flex-col gap-6" aria-busy={carregando || undefined}>
        {carregando ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="skeleton h-[72px] rounded-lg" aria-hidden="true" />
            ))}
          </div>
        ) : (
          grupos.map((grupo) => (
            <div key={grupo.titulo}>
              <p className="section-label mb-2 px-1">{grupo.titulo}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {grupo.itens.map((item) => (
                  <CardLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    descricao={item.descricao}
                    icon={item.icon}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        <button
          onClick={logout}
          className="card flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:border-danger/40 w-full mt-2 sm:max-w-xs min-h-[56px]"
        >
          <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 bg-danger/10 border border-danger/20">
            <LogOut size={21} className="text-danger" strokeWidth={1.8} aria-hidden="true" />
          </div>
          <p className="font-semibold text-danger">Sair</p>
        </button>
      </div>
    </div>
  );
}
