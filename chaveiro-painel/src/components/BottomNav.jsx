import { useLayoutEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { buildNavigation } from '../config/navigation.js';

// Bottom navigation (mobile, < lg). Derivada do manifesto único: 3–5 destinos
// persistentes por papel + "Mais". Enquanto as permissões carregam (não-Dono),
// mostra um esqueleto estável para não piscar nem reordenar.
export default function BottomNav() {
  const { papel, permissoes, pode, podeProprio } = useAuth();
  const carregando = papel !== 'dono' && permissoes === null;

  const primary = carregando ? [] : buildNavigation({ papel, pode, podeProprio }).primary;
  const itens = [...primary, { to: '/mais', label: 'Mais', icon: MoreHorizontal, end: false }];
  const total = carregando ? 5 : itens.length;

  /* Publica a propria altura para que o banner de consentimento sente ACIMA dela, e nao sobre
     ela. Em >= lg este componente esta em `display: none`, entao a medida cai a zero sozinha —
     sem `if` de breakpoint duplicando a regra que o CSS ja expressa. [GAP-UX-CONSENT-01] */
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
      className="fixed bottom-0 left-0 right-0 bg-dark-900/95 backdrop-blur border-t border-dark-600 z-40 safe-area-bottom"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
        {carregando
          ? Array.from({ length: total }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 py-2.5 min-h-[54px]">
                <span className="skeleton w-6 h-6 rounded-md" aria-hidden="true" />
                <span className="skeleton w-10 h-2 rounded" aria-hidden="true" />
              </div>
            ))
          : itens.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `relative flex flex-col items-center gap-1 py-2.5 min-h-[54px] justify-center transition-colors ${
                    isActive ? 'text-accent-300' : 'text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full bg-accent-400" />
                    )}
                    <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                    <span className="text-[10px] font-medium tracking-wide">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
      </div>
    </nav>
  );
}
