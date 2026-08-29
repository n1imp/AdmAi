import { NavLink } from 'react-router-dom';
import { KeyRound, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { buildNavigation } from '../config/navigation.js';

const PAPEL_LABEL = { dono: 'Dono', gestor: 'Gestor', funcionario: 'Funcionário' };

/* Sidebar do App Shell (FR-13B) — 256px, foundations LIGHT (DDR-1/DDR-3). Projeção do
   manifesto único: capability habilitada → papel → permissão → grupos canônicos. A lógica
   provada permanece: skeleton estável enquanto permissões carregam (sem flash nem
   reordenação), logout no desktop [AUD-INPUT-DESKTOP-LOGOUT], aria-busy/labels. */
function Item({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `adm-navitem${isActive ? ' ativa' : ''}`}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

function Grupo({ titulo, itens }) {
  return (
    <div className="adm-navgroup">
      <h3>{titulo}</h3>
      {itens.map((i) => (
        <Item key={i.to} {...i} />
      ))}
    </div>
  );
}

export default function Sidebar() {
  const { user, papel, permissoes, pode, podeProprio, logout } = useAuth();
  const carregando = papel !== 'dono' && permissoes === null;
  const grupos = carregando
    ? []
    : buildNavigation({ papel, pode, podeProprio, admin: user?.admin === true }).desktopGroups;
  const papelLabel = user?.admin ? 'Administrador' : (PAPEL_LABEL[papel] ?? 'Conta');

  return (
    <aside className="adm-sidebar hidden lg:flex shrink-0">
      <div className="adm-brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <KeyRound
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          style={{ color: 'var(--adm-accent)' }}
        />
        <span>
          AdmAi{' '}
          <span style={{ color: 'var(--adm-text-faint)', font: 'var(--adm-caption)' }}>painel</span>
        </span>
      </div>

      <nav
        aria-label="Navegação lateral"
        aria-busy={carregando || undefined}
        style={{ flex: 1, overflowY: 'auto', paddingBottom: 'var(--adm-s5)' }}
      >
        {carregando
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="adm-navgroup">
                <span className="adm-skeleton" style={{ height: 16 }} aria-hidden="true" />
              </div>
            ))
          : grupos.map((g) => <Grupo key={g.titulo} titulo={g.titulo} itens={g.itens} />)}
      </nav>

      {/* GLOBAL UTILITIES (seam estrutural do shell): hoje somente as utilities REAIS —
          identidade da conta e logout. Um futuro Notification Center entra AQUI quando a
          capability existir; nenhum sino/placeholder antes disso (§19/§49). */}
      <div
        className="adm-utilities"
        style={{
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
          padding: '12px 12px 14px',
          borderTop: '1px solid var(--adm-border)',
        }}
      >
        <div className="adm-conta">
          <span className="adm-avatar" aria-hidden="true">
            {(user?.nome ?? '?').charAt(0).toUpperCase()}
          </span>
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: 'block',
                color: 'var(--adm-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user?.nome ?? 'Usuário'}
            </span>
            <span style={{ font: 'var(--adm-caption)', color: 'var(--adm-text-faint)' }}>
              {papelLabel}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={logout}
          className="adm-sair"
          style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
        >
          <LogOut size={15} strokeWidth={1.8} aria-hidden="true" />
          Sair
        </button>
      </div>
    </aside>
  );
}
