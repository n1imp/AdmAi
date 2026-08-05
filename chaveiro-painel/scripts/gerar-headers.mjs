/**
 * Gera `dist/_headers` (Cloudflare Pages) com os headers de segurança do painel.
 *
 * Por que gerado e não estático: na Cloudflare o painel é host ESTÁTICO, sem proxy de
 * `/api` (o `public/_redirects` é só fallback de SPA). Logo a API fica em OUTRA origem e
 * precisa entrar no `connect-src` — caso contrário nenhuma chamada passa e o painel quebra
 * por inteiro. Essa origem vem de `VITE_API_URL`, que é secret e muda entre
 * preview/staging/produção. Gerando no build, cada ambiente recebe a própria origem sem
 * ninguém precisar manter host hardcoded.
 *
 * O caminho nginx/Docker usa `nginx.conf` (mesma política, mas lá `/api` é same-origin).
 *
 * IMPORTANTE — lê o env com `loadEnv` do Vite, NÃO com `process.env`: o Vite carrega
 * `.env*` para `import.meta.env` do bundle, mas não exporta nada para o `process.env` de
 * um processo Node irmão. Com `process.env` o bundle recebia a URL absoluta do `.env`
 * enquanto o `_headers` saía sem ela no `connect-src` — CSP bloqueando 100% das chamadas
 * de API. Só não quebrou antes porque o `deploy.yml` passa a variável como `env:` do step.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';

const DIST = path.resolve(process.cwd(), 'dist');
const RAIZ = process.cwd();
const MODO = process.env.NODE_ENV ?? 'production';

// Mesma resolução do bundle: .env, .env.local, .env.[modo], .env.[modo].local + process.env.
const env = { ...loadEnv(MODO, RAIZ, 'VITE_'), ...process.env };

/** Extrai só a origem (scheme://host[:porta]) de uma URL; ignora path/barra final. */
function origem(url) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null; // valor relativo (ex.: "/api") → same-origin, já coberto por 'self'
  }
}

const apiUrlBruta = env.VITE_API_URL;
const apiOrigem = origem(apiUrlBruta);
const posthog = origem(env.VITE_POSTHOG_HOST) ?? 'https://*.posthog.com';

// Falhar alto: uma URL absoluta que não resolve em origem viraria um _headers sem a API no
// connect-src — painel inteiro quebrado em produção, e silenciosamente. Melhor quebrar o build.
if (apiUrlBruta && !apiUrlBruta.startsWith('/') && !apiOrigem) {
  throw new Error(
    `VITE_API_URL="${apiUrlBruta}" não é uma URL válida nem um caminho relativo — ` +
      'não dá para montar o connect-src do CSP.'
  );
}

// Hosts de terceiros efetivamente carregados pelo painel (auditado no código, não presumido):
//  - accounts.google.com/apis.google.com: SDK GSI (BotoesSociais.jsx)
//  - alcdn.msauth.net + login.microsoftonline.com: MSAL
//  - appleid.cdn-apple.com + appleid.apple.com: Sign in with Apple
//  - client.crisp.chat (+ relay wss): widget de suporte (src/lib/crispBootstrap.js)
//  - *.posthog.com: analytics (useAnalytics.js); recorder/remote-config vêm do api_host
//  - *.ingest*.sentry.io: observabilidade
//  - fonts.googleapis.com/fonts.gstatic.com: webfonts
const conectar = [
  "'self'",
  apiOrigem,
  'https://accounts.google.com',
  'https://login.microsoftonline.com',
  'https://appleid.apple.com',
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://client.crisp.chat',
  'wss://client.relay.crisp.chat',
  posthog,
].filter(Boolean);

const csp = [
  "default-src 'self'",
  `script-src 'self' https://accounts.google.com https://apis.google.com https://alcdn.msauth.net https://appleid.cdn-apple.com https://client.crisp.chat ${posthog}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://client.crisp.chat",
  "font-src 'self' https://fonts.gstatic.com https://client.crisp.chat data:",
  "img-src 'self' data: https:",
  `connect-src ${conectar.join(' ')}`,
  "media-src 'self' https://client.crisp.chat",
  'frame-src https://accounts.google.com https://appleid.apple.com',
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join('; ');

// HSTS sem `preload` de propósito, espelhando a decisão já registrada no nginx.conf:
// preload é um compromisso forte (entra na lista embutida do navegador) e só deve ser
// adicionado após validação deliberada.
const conteudo = `# GERADO POR scripts/gerar-headers.mjs — não edite à mão.
/*
  Content-Security-Policy: ${csp}
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: geolocation=(self), camera=(self), microphone=()
`;

await mkdir(DIST, { recursive: true });
await writeFile(path.join(DIST, '_headers'), conteudo, 'utf8');

console.log(
  apiOrigem
    ? `_headers gerado (API em ${apiOrigem}).`
    : '_headers gerado (VITE_API_URL ausente/relativa → API tratada como same-origin).'
);
