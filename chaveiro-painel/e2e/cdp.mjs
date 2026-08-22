// =============================================================================
// cdp.mjs — o mínimo de CDP compartilhado entre os consumidores de Chrome headless.
//
// Extraído de `run.mjs`, que era o único a ter estes dois helpers e não os exportava. Quando
// o capturador de telas precisou dos mesmos, a escolha era duplicar ou extrair; duplicar
// deixaria duas buscas de binário divergindo com o tempo, e a busca de binário é justamente
// o ponto que muda por máquina.
//
// Decisão de fundo em `.ai/decisions/DEC-20260719-E2E-CDP.md`: o painel dirige Chrome por CDP,
// sem Playwright.
// =============================================================================
import { existsSync } from 'node:fs';

// ── Chrome cross-plataforma ──────────────────────────────────────────────────
export function acharChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH))
    return process.env.CHROME_PATH;
  const c = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
  if (!c) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return c;
}

export async function conectar(url) {
  const socket = new WebSocket(url);
  const pend = new Map();
  let seq = 0;
  await new Promise((ok, err) => {
    socket.addEventListener('open', ok, { once: true });
    socket.addEventListener('error', err, { once: true });
  });
  const ouvintes = new Map();
  socket.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id);
      pend.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method && ouvintes.has(m.method)) {
      ouvintes.get(m.method).forEach((fn) => fn(m.params));
    }
  });
  return {
    send(method, params = {}) {
      const id = ++seq;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((ok, err) => pend.set(id, { resolve: ok, reject: err }));
    },
    on(method, fn) {
      if (!ouvintes.has(method)) ouvintes.set(method, []);
      ouvintes.get(method).push(fn);
    },
    close: () => socket.close(),
  };
}
