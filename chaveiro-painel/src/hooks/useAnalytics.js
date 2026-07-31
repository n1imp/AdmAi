import { useEffect } from 'react';

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com';
const isDev = import.meta.env.DEV;

let _ph = null;

/**
 * O consentimento é um GATE, não só uma escolha de persistência.
 *
 * Antes, escolher "Apenas necessários" ainda inicializava o PostHog e enviava eventos —
 * só mudava onde o id era guardado (memória em vez de cookie). A política de cookies
 * publicada promete analytics "somente com seu consentimento", e a LGPD trata envio de
 * dados comportamentais a terceiro como tratamento — persistir em memória não muda isso.
 */
function consentiuAnalytics() {
  try {
    return localStorage.getItem('admai_cookies_consent') === 'all';
  } catch {
    return false; // storage bloqueado → trata como não consentido
  }
}

async function getPostHog() {
  if (!KEY) return null;
  if (!consentiuAnalytics()) return null;
  if (_ph) return _ph;
  const { default: posthog } = await import('posthog-js');
  posthog.init(KEY, {
    api_host: HOST,
    persistence: 'localStorage+cookie',
    autocapture: false,
    capture_pageview: false,
    loaded: (ph) => {
      _ph = ph;
    },
  });
  _ph = posthog;
  return _ph;
}

export function useAnalytics() {
  function track(event, props = {}) {
    if (isDev) {
      console.info('[analytics]', event, props);
    }
    getPostHog()
      .then((ph) => ph?.capture(event, props))
      .catch(() => {});
  }

  return { track };
}

export function useAnalyticsIdentify(user) {
  useEffect(() => {
    if (!user) return;
    getPostHog()
      .then((ph) => {
        if (!ph) return;
        ph.identify(String(user.id), { papel: user.papel, empresaId: user.empresaId });
      })
      .catch(() => {});
  }, [user?.id]);
}

export function analyticsReset() {
  getPostHog()
    .then((ph) => ph?.reset())
    .catch(() => {});
}
