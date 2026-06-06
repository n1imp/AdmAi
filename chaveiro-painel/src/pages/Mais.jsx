import { useNavigate } from 'react-router-dom';
import { PieChart, Package, Settings2, LogOut, Star, ChevronRight, HelpCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

const GRUPOS = [
  {
    titulo: 'Operação',
    cards: [
      { to: '/avaliacoes', icon: Star, titulo: 'Avaliações', sub: 'Feedback dos clientes', cor: 'text-warning', bg: 'bg-warning/10' },
      { to: '/reparticao', icon: PieChart, titulo: 'Repartição', sub: 'Fechamento e relatório PDF', cor: 'text-sky-300', bg: 'bg-sky-400/10' },
      { to: '/estoque', icon: Package, titulo: 'Estoque', sub: 'Saldo e alertas de reposição', cor: 'text-accent-300', bg: 'bg-accent-400/10' },
    ],
  },
  {
    titulo: 'Conta e sistema',
    cards: [
      { to: '/configuracao', icon: Settings2, titulo: 'Configurações', sub: 'Conta, segurança e preferências', cor: 'text-muted', bg: 'bg-dark-700' },
      { to: '/ajuda', icon: HelpCircle, titulo: 'Ajuda', sub: 'Como usar o app', cor: 'text-sky-300', bg: 'bg-sky-400/10' },
    ],
  },
];

function CardLink({ card, onClick }) {
  const { icon: Icon, titulo, sub, cor, bg } = card;
  return (
    <button
      onClick={onClick}
      className="card flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:border-dark-500 w-full"
    >
      <div className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 border border-dark-600 ${bg}`}>
        <Icon size={21} className={cor} strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white">{titulo}</p>
        <p className="text-muted text-xs mt-0.5">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </button>
  );
}

export default function Mais() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-full px-4 pt-6 pb-8">
      <div className="mb-6">
        <p className="section-label mb-1"><span className="w-5 h-px bg-accent-400" /> {user?.nome ?? 'Conta'}</p>
        <h1 className="font-display text-3xl font-bold text-white uppercase tracking-wide">Mais</h1>
      </div>

      <div className="flex flex-col gap-6">
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="section-label mb-2 px-1">{grupo.titulo}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {grupo.cards.map((card) => (
                <CardLink key={card.to} card={card} onClick={() => navigate(card.to)} />
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={logout}
          className="card flex items-center gap-4 text-left active:scale-[0.98] transition-all hover:border-danger/40 w-full mt-2 sm:max-w-xs"
        >
          <div className="w-11 h-11 rounded-md flex items-center justify-center shrink-0 bg-danger/10 border border-danger/20">
            <LogOut size={21} className="text-danger" strokeWidth={1.8} />
          </div>
          <p className="font-semibold text-danger">Sair</p>
        </button>
      </div>
    </div>
  );
}
