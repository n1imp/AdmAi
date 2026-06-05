const isDev = import.meta.env.DEV;

export function useAnalytics() {
  function track(event, props = {}) {
    const entry = { event, ...props, ts: Date.now() };
    if (isDev) console.info('[analytics]', entry);
    try {
      const prev = JSON.parse(sessionStorage.getItem('_analytics') || '[]');
      prev.push(entry);
      sessionStorage.setItem('_analytics', JSON.stringify(prev.slice(-100)));
    } catch {}
  }

  return { track };
}
