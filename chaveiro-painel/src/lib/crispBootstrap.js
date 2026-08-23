// Widget de suporte Crisp.chat — ATRÁS do consentimento, como a política publicada promete.
//
// Antes vivia como <script> inline em index.html (exigia 'unsafe-inline' na CSP) e, já como
// módulo, carregava INCONDICIONALMENTE no boot — contradizendo a Política de Cookies §2/§4
// ("Crisp.chat (suporte) — somente com seu consentimento"). O gate espelha o do PostHog em
// useAnalytics.js: fail-closed, storage bloqueado = não consentido.
//
// Revogação: um <script> carregado não se descarrega; o que o Crisp oferece é esconder o
// widget ('do', 'chat:hide') — e no PRÓXIMO boot, sem consentimento, a tag nem entra. Por
// isso a função é "sincronizar", não "iniciar": ela leva o widget ao estado que o
// consentimento atual pede, e é idempotente em todos os caminhos.

function consentiuSuporte() {
  try {
    return localStorage.getItem('admai_cookies_consent') === 'all';
  } catch {
    return false; // storage bloqueado → trata como não consentido
  }
}

let carregado = false;

/** Leva o widget ao estado que o consentimento pede. No-op sem VITE_CRISP_ID. */
export function sincronizarCrisp() {
  const id = import.meta.env.VITE_CRISP_ID;
  if (!id) return;

  if (!consentiuSuporte()) {
    // Consentimento ausente/revogado: se nunca carregou, nada a fazer (a tag nunca entra);
    // se já carregou nesta sessão, esconder é o máximo que a plataforma permite.
    if (carregado) window.$crisp?.push(['do', 'chat:hide']);
    return;
  }

  if (carregado) {
    window.$crisp?.push(['do', 'chat:show']); // re-consentiu após esconder
    return;
  }

  window.$crisp = [];
  window.CRISP_WEBSITE_ID = id;
  const s = document.createElement('script');
  s.src = 'https://client.crisp.chat/l.js';
  s.async = true;
  document.head.appendChild(s);
  carregado = true;
}
