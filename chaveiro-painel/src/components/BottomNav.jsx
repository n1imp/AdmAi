import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Package, Clock, MoreHorizontal,
  Home, Wrench, CheckCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

// Cada item declara o módulo que o libera via `pode()`. "Mais" é sempre visível
// (leva à conta própria); os demais somem do menu quando sem permissão.
// `proprio` usa `podeProprio()`; `proprioOu` aceita uma lista de capacidades.
// "Meu painel" só aparece para o funcionário (substitui o Dashboard da empresa).
const LINKS = [
  { to: '/', label: 'Início', icon: LayoutDashboard, modulo: 'dashboard' },
  { to: '/', label: 'Meu painel', icon: Home, ehFuncionario: true },
  { to: '/servicos', label: 'Serviços', icon: ClipboardList, modulo: 'servicos' },
  { to: '/meus-servicos', label: 'Serviços', icon: Wrench, proprioOu: ['registrar_servico', 'ver_metricas'] },
  { to: '/tecnicos', label: 'Técnicos', icon: Users, modulo: 'tecnicos' },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle, modulo: 'aprovacoes' },
  { to: '/materiais', label: 'Materiais', icon: Package, modulo: 'estoque' },
  { to: '/meu-ponto', label: 'Meu ponto', icon: Clock, proprio: 'bater_ponto' },
  { to: '/mais', label: 'Mais', icon: MoreHorizontal, sempre: true },
];

export default function BottomNav() {
  const { ehFuncionario, pode, podeProprio } = useAuth();
  const links = LINKS.filter((l) => {
    if (l.sempre) return true;
    if (l.ehFuncionario) return ehFuncionario;
    if (l.proprio) return podeProprio(l.proprio);
    if (l.proprioOu) return l.proprioOu.some((c) => podeProprio(c));
    return pode(l.modulo, 'ver');
  });

  return (
    <nav
      role="navigation"
      aria-label="Navegação principal"
      className="fixed bottom-0 left-0 right-0 bg-dark-900/95 backdrop-blur border-t border-dark-600 z-40 safe-area-bottom"
    >
      <div className="flex">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={`${to}:${label}`}
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
