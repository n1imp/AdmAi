import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Package, Star,
  Boxes, PieChart, Settings, MessageSquare, KeyRound,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

// Navegação do desktop (≥ lg). Espelha o BottomNav mobile e amplia com itens
// que no celular ficam em "Mais".
const PRINCIPAIS = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/servicos', label: 'Serviços', icon: ClipboardList },
  { to: '/tecnicos', label: 'Técnicos', icon: Users },
  { to: '/avaliacoes', label: 'Avaliações', icon: Star },
];

const OPERACAO = [
  { to: '/materiais', label: 'Materiais', icon: Package },
  { to: '/estoque', label: 'Estoque', icon: Boxes },
  { to: '/reparticao', label: 'Repartição', icon: PieChart },
];

const SISTEMA = [
  { to: '/configuracao/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { to: '/configuracao', label: 'Configurações', icon: Settings },
];

function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-all ${
          isActive
            ? 'bg-accent-400/10 text-accent-300 shadow-[inset_2px_0_0_0_theme(colors.accent.400)]'
            : 'text-muted hover:text-white hover:bg-dark-700'
        }`
      }
    >
      <Icon size={18} strokeWidth={1.8} />
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
        {itens.map((i) => <Item key={i.to} {...i} />)}
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user, isAdmin } = useAuth();

  return (
    <aside className="hidden lg:flex lg:flex-col w-64 shrink-0 border-r border-dark-600 bg-dark-900/80 backdrop-blur sticky top-0 h-dvh">
      {/* Marca */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-dark-600">
        <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/30 flex items-center justify-center">
          <KeyRound size={18} className="text-accent-300" strokeWidth={2} />
        </div>
        <div className="leading-tight">
          <p className="font-display font-bold text-white text-lg tracking-wide">CHAVEIRO<span className="text-accent-400">BOT</span></p>
          <p className="text-[10px] text-dark-500 uppercase tracking-[0.2em] -mt-0.5">painel de controle</p>
        </div>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-5 space-y-5">
        <Grupo titulo="Operação" itens={PRINCIPAIS} />
        <Grupo titulo="Gestão" itens={OPERACAO} />
        <Grupo titulo="Sistema" itens={isAdmin ? [...SISTEMA, { to: '/configuracao/usuarios', label: 'Usuários', icon: Users }] : SISTEMA} />
      </nav>

      {/* Usuário */}
      <div className="border-t border-dark-600 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-dark-700 border border-dark-600 flex items-center justify-center font-display font-bold text-accent-300">
            {(user?.nome ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{user?.nome ?? 'Usuário'}</p>
            <p className="text-[11px] text-muted truncate">{isAdmin ? 'Administrador' : 'Operador'}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
