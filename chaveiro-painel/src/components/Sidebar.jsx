import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, Users, Package, Star,
  Boxes, PieChart, Settings, KeyRound, Clock,
  Home, Wrench, CheckCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

// Navegação do desktop (≥ lg). Espelha o BottomNav mobile e amplia com itens
// que no celular ficam em "Mais". Cada item declara o módulo/ação que o libera
// via `pode()`; itens sem permissão somem do menu (não apenas desabilitam).
const PRINCIPAIS = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true, modulo: 'dashboard' },
  { to: '/servicos', label: 'Serviços', icon: ClipboardList, modulo: 'servicos' },
  { to: '/tecnicos', label: 'Técnicos', icon: Users, modulo: 'tecnicos' },
  { to: '/avaliacoes', label: 'Avaliações', icon: Star, modulo: 'avaliacoes' },
];

const OPERACAO = [
  { to: '/materiais', label: 'Materiais', icon: Package, modulo: 'estoque' },
  { to: '/estoque', label: 'Estoque', icon: Boxes, modulo: 'estoque' },
  { to: '/reparticao', label: 'Repartição', icon: PieChart, modulo: 'financeiro' },
];

// Configurações é sempre visível (conta própria). Usuários exige permissão.
// WhatsApp saiu do menu: é feature futura ("Em breve" dentro de Configurações).
const SISTEMA = [
  { to: '/configuracao', label: 'Configurações', icon: Settings, sempre: true },
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
  if (itens.length === 0) return null;
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
  const { user, isAdmin, ehFuncionario, pode, podeProprio } = useAuth();

  // Filtra cada item pela permissão do módulo (itens "sempre" passam direto).
  const visiveis = (itens) => itens.filter((i) => i.sempre || pode(i.modulo, 'ver'));

  // "Meu painel" é a home do funcionário (substitui o Dashboard da empresa).
  const operacao = [];
  if (ehFuncionario) {
    operacao.push({ to: '/', label: 'Meu painel', icon: Home, end: true, modulo: 'proprio' });
  }
  operacao.push(...visiveis(PRINCIPAIS));
  // "Meus serviços": funcionário que registra serviço ou vê métricas próprias.
  if (podeProprio('registrar_servico') || podeProprio('ver_metricas')) {
    operacao.push({ to: '/meus-servicos', label: 'Meus serviços', icon: Wrench, modulo: 'proprio' });
  }
  // "Meu ponto" aparece para quem tem a capacidade própria de bater ponto.
  if (podeProprio('bater_ponto')) {
    operacao.push({ to: '/meu-ponto', label: 'Meu ponto', icon: Clock, modulo: 'proprio' });
  }
  // "Aprovações": fila de aprovação para dono/gestor.
  if (pode('aprovacoes', 'ver')) {
    operacao.push({ to: '/aprovacoes', label: 'Aprovações', icon: CheckCircle, modulo: 'aprovacoes' });
  }

  const sistema = [...visiveis(SISTEMA)];
  if (pode('usuarios', 'ver')) {
    sistema.push({ to: '/configuracao/usuarios', label: 'Usuários', icon: Users, modulo: 'usuarios' });
  }

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
        <Grupo titulo="Operação" itens={operacao} />
        <Grupo titulo="Gestão" itens={visiveis(OPERACAO)} />
        <Grupo titulo="Sistema" itens={sistema} />
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
