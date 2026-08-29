import { useEffect, useState } from 'react';

/**
 * UMA composição por vez (split xl+ OU route-like) — decidida por matchMedia, nunca por CSS
 * escondendo DOM duplicado (leitores de tela leriam tudo duas vezes). Sem matchMedia
 * (jsdom/ambientes mínimos) cai na composição route-like, a mais segura.
 * Extraído de Servicos para as superfícies MASTER_DETAIL da capability (Revisor 01a04c56:
 * Aprovações também precisa promover o detalhe a tela própria abaixo de xl).
 */
export function useSplitDesktop() {
  const consultar = () =>
    typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches;
  const [split, setSplit] = useState(consultar);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(min-width: 1280px)');
    const ouvir = (e) => setSplit(e.matches);
    mq.addEventListener?.('change', ouvir);
    return () => mq.removeEventListener?.('change', ouvir);
  }, []);
  return split;
}
