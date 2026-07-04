import { useEffect, useRef, useState } from 'react';

/**
 * Hook para pull-to-refresh em dispositivos touch.
 * Retorna { containerRef, isRefreshing } e chama onRefresh quando detecta o gesto.
 *
 * @param {() => Promise<void>} onRefresh - Callback assíncrono chamado ao puxar
 * @param {number} threshold - Distância mínima em px para disparar (padrão: 80)
 */
export function usePullToRefresh(onRefresh, threshold = 80) {
  const containerRef = useRef(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshing = useRef(false); // flag em ref evita closure obsoleta e churn de listener
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      // Só ativa quando o scroll está no topo
      if (el.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e) => {
      if (!pulling.current) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) e.preventDefault();
    };

    const onTouchEnd = async (e) => {
      if (!pulling.current) return;
      pulling.current = false;

      const delta = e.changedTouches[0].clientY - startY.current;
      if (delta > threshold && !refreshing.current) {
        refreshing.current = true;
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          refreshing.current = false;
          setIsRefreshing(false);
        }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, threshold]);

  return { containerRef, isRefreshing };
}
