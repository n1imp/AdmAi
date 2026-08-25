/**
 * guard-frontend-build.mjs — ANTI-PRODUCTION GUARD do build de STAGING do painel.
 * [STG-APP-STAGING-01 · D1 thread 01a038e5]
 *
 * Por que existe: o painel embute `VITE_API_URL` NO BUNDLE e no CSP `connect-src`
 * (scripts/gerar-headers.mjs). Um build "de staging" apontando para a API de
 * PRODUÇÃO publicaria um staging que grava em produção — exatamente o acidente
 * que este guard torna impossível. Fail-closed: qualquer dúvida ABORTA o build.
 *
 * Uso (é o primeiro passo de `npm run build:staging`):
 *   VITE_API_URL=https://<backend-staging>/api npm run build:staging
 *
 * Resolução do valor: IDÊNTICA à do bundle/gerar-headers — `loadEnv('production')`
 * (o `vite build` roda em mode production) mesclado com `process.env` por cima.
 * Assim um `.env`/`.env.local` esquecido com a URL de produção é PEGO aqui,
 * antes de contaminar o artefato.
 *
 * Contrato provado no código (VITE_API_URL_CONTRACT = API_BASE_WITH_PREFIX):
 * `src/lib/api.js` usa o valor como axios baseURL e os call sites NÃO prefixam
 * `/api` — logo o valor DEVE terminar em `/api` (senão toda chamada 404).
 */
import { loadEnv } from 'vite';

const REF_PRODUCAO = 'disljhkypaxpyzvbooge'; // Supabase AdmAi produção — PROIBIDO
const HOSTS_PRODUCAO = [
  'api.chaveirobot.com.br',
  'admai-production.up.railway.app',
  'app.chaveirobot.com.br',
  'admai-painel.pages.dev', // alias de PRODUÇÃO do projeto Pages (staging usa subdomínio staging.*)
];
const PLACEHOLDERS = /SEU_|SEUDOMINIO|example\.|<[^>]+>|\.\.\./i;

function abortar(motivo) {
  console.error(`\n❌ build:staging ABORTADO — ${motivo}\n`);
  console.error(
    '   Defina VITE_API_URL=https://<backend-staging>/api (o backend de STAGING no Railway,'
  );
  console.error('   nunca produção, nunca localhost) e rode de novo.\n');
  process.exit(1);
}

// Mesma resolução do bundle: .env* (mode production) + process.env por cima.
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const bruto = env.VITE_API_URL;

if (!bruto || !String(bruto).trim()) abortar('VITE_API_URL está VAZIA/ausente.');
const valor = String(bruto).trim();

if (PLACEHOLDERS.test(valor)) abortar(`VITE_API_URL parece placeholder: "${valor}".`);
if (valor.includes(REF_PRODUCAO)) abortar('VITE_API_URL contém o ref do Supabase de PRODUÇÃO.');

let url;
try {
  url = new URL(valor);
} catch {
  abortar(`VITE_API_URL não é URL absoluta: "${valor}" (staging na Cloudflare exige URL absoluta).`);
}

if (url.protocol !== 'https:') abortar(`VITE_API_URL deve ser https (recebido ${url.protocol}//).`);
if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]') {
  abortar('VITE_API_URL aponta para localhost — staging publicado precisa de backend público.');
}
if (HOSTS_PRODUCAO.includes(url.hostname)) {
  abortar(`VITE_API_URL aponta para PRODUÇÃO (${url.hostname}).`);
}
// Contrato API_BASE_WITH_PREFIX: o axios NÃO prefixa /api nos call sites.
if (url.pathname !== '/api') {
  abortar(
    `VITE_API_URL deve terminar exatamente em /api (contrato API_BASE_WITH_PREFIX); recebido path "${url.pathname}".`
  );
}

console.log(`✅ guard staging: VITE_API_URL ok (${url.origin}${url.pathname}) — build prossegue.`);
