import { NavLink } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { buildNavigation } from '../config/navigation.js';

const PAPEL_LABEL = { dono: 'Dono', gestor: 'Gestor', funcionario: 'Funcionário' };

// Navegação do desktop (≥ lg). Módulos principais estáveis, agrupados por seção,
// derivados do mesmo manifesto do BottomNav/"Mais" (fonte única, PR2 + PR4).
function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all min-h-[44px] ${
          isActive
            ? 'bg-accent-400/10 text-accent-300 shadow-[inset_2px_0_0_0_theme(colors.accent.400)]'
            : 'text-muted hover:text-white hover:bg-dark-700'
        }`
      }
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <span className="tracking-wide">{label}</span>
    </NavLink>
  );
}

function Grupo({ titulo, itens }) {
  return (
    <div className="px-3">
      <p className="px-3 mb-1.5 text-[10px] font-display font-semibold uppercase tracking-[0.18em] text-dark-500">
        {titulo}
      </p>
      <div className="space-y-0.5">
        {itens.map((i) => (
          <Item key={i.to} {...i} />
        ))}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, papel, permissoes, pode, podeProprio } = useAuth();
  const carregando = papel !== 'dono' && permissoes === null;
  const grupos = carregando ? [] : buildNavigation({ papel, pode, podeProprio }).desktopGroups;
  const papelLabel = user?.admin ? 'Administrador' : (PAPEL_LABEL[papel] ?? 'Conta');

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-dark-600 bg-dark-900/80 backdrop-blur sticky top-0 h-dvh">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-dark-600">
        <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
          <KeyRound size={18} className="text-accent-300" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="leading-tight">
          <p className="font-display font-bold text-white text-lg tracking-wide">
            ADM<span className="text-accent-400">AI</span>
          </p>
          <p className="text-[10px] text-dark-500 uppercase tracking-[0.2em] -mt-0.5">
            painel de controle
          </p>
        </div>
      </div>

      <nav
        aria-label="Navegação lateral"
        aria-busy={carregando || undefined}
        className="flex-1 overflow-y-auto py-5 space-y-5"
      >
        {carregando
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-6">
                <span className="skeleton block h-4 w-full rounded" aria-hidden="true" />
              </div>
            ))
          : grupos.map((g) => <Grupo key={g.titulo} titulo={g.titulo} itens={g.itens} />)}
      </nav>

      <div className="border-t border-dark-600 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center font-display font-bold text-accent-300">
            {(user?.nome ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{user?.nome ?? 'Usuário'}</p>
            <p className="text-[11px] text-muted truncate">{papelLabel}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
