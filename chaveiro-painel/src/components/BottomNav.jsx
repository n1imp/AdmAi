import { useLayoutEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { buildNavigation } from '../config/navigation.js';

/* Bottom navigation do App Shell (FR-13B) — foundations LIGHT. Derivada do manifesto único:
   4 destinos por papel + "Mais" (DDR-1: G ganha Serviços; F prioriza os jobs do dia).
   Lógica provada preservada: skeleton estável durante carga de permissões e publicação de
   `--admai-nav-h` para o banner de consentimento sentar ACIMA dela [GAP-UX-CONSENT-01]. */
export default function BottomNav() {
  const { user, papel, permissoes, pode, podeProprio } = useAuth();
  const carregando = papel !== 'dono' && permissoes === null;

  const primary = carregando
    ? []
    : buildNavigation({ papel, pode, podeProprio, admin: user?.admin === true }).primary;
  const itens = [...primary, { to: '/mais', label: 'Mais', icon: MoreHorizontal, end: false }];
  const total = carregando ? 5 : itens.length;

  const caixa = useRef(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const publicar = () =>
      document.documentElement.style.setProperty(
        '--admai-nav-h',
        `${Math.ceil(el.getBoundingClientRect().height)}px`
      );
    publicar();
    const RO = globalThis.ResizeObserver;
    const obs = RO ? new RO(publicar) : null;
    obs?.observe(el);
    return () => {
      obs?.disconnect();
      document.documentElement.style.removeProperty('--admai-nav-h');
    };
  });

  return (
    <nav
      ref={caixa}
      aria-label="Navegação principal"
      aria-busy={carregando || undefined}
      className="adm-bottomnav"
    >
      {carregando
        ? Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '10px 0',
              }}
            >
              <span className="adm-skeleton" style={{ width: 22, height: 22 }} aria-hidden="true" />
              <span className="adm-skeleton" style={{ width: 36, height: 8 }} aria-hidden="true" />
            </span>
          ))
        : itens.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'ativa' : undefined)}
            >
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
    </nav>
  );
}
