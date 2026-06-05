import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, Users, Package, MoreHorizontal } from 'lucide-react';

const LINKS = [
  { to: '/', label: 'Início', icon: LayoutDashboard },
  { to: '/servicos', label: 'Serviços', icon: ClipboardList },
  { to: '/tecnicos', label: 'Técnicos', icon: Users },
  { to: '/materiais', label: 'Materiais', icon: Package },
  { to: '/mais', label: 'Mais', icon: MoreHorizontal },
];

export default function BottomNav() {
  return (
    <nav
      role="navigation"
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 bg-dark-900/95 backdrop-blur border-t border-dark-600 z-40 safe-area-bottom"
    >
      <div className="flex">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className={({ isActive }) =>
              `relative flex-1 flex flex-col items-center gap-1 py-2.5 min-h-[44px] transition-colors ${
                isActive ? 'text-accent-300' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Marcador de aba ativa (traço de acento no topo) */}
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-accent-400 shadow-[0_0_8px_0_rgba(34,211,238,0.7)]" />
                )}
                <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="text-[10px] font-medium tracking-wide">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      <div className="h-safe-area-inset-bottom bg-dark-900" />
    </nav>
  );
}
