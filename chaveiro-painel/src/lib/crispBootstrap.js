// Bootstrap do widget de suporte Crisp.chat.
//
// Antes vivia como <script> inline em index.html, o que exigia 'unsafe-inline' em
// script-src na CSP. Como módulo ES normal, import.meta.env.VITE_CRISP_ID é substituído
// em tempo de build por uma constante de verdade (diferente da busca-e-substituição de
// string literal que o Vite fazia no HTML), então um `if (!id) return;` simples já cobre
// corretamente tanto "definido" quanto "vazio/ausente" — sem precisar da sentinela
// `naoSubstituido` que o index.html usava para contornar o bug de auto-comparação.

/** Inicializa o widget Crisp (fire-and-forget). No-op sem VITE_CRISP_ID. */
export function iniciarCrisp() {
  const id = import.meta.env.VITE_CRISP_ID;
  if (!id) return;
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = id;
  const s = document.createElement('script');
  s.src = 'https://client.crisp.chat/l.js';
  s.async = true;
  document.head.appendChild(s);
}
