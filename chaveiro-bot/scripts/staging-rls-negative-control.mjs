/**
 * STG-SEC-RLS-01 — Negative control PostgREST (Data API) contra o admai-staging.
 *
 * Bate no /rest/v1 com a ANON (publishable) key — que e publica por design — e prova
 * que, apos o lockdown, anon NAO acessa nenhuma das 26 tabelas (nunca 200, nem 200 []),
 * e que POST/PATCH/DELETE representativos sao negados por PRIVILEGIO.
 *
 * Prova que o controle MORDE (sabotage/bite) sem mutar o banco aqui:
 *   --expect-open : ANTES do lockdown (ou apos um re-grant deliberado de sabotagem),
 *                   exige que as tabelas sensiveis estejam ACESSIVEIS (200) — ou seja,
 *                   o controle detecta a exposicao. Sai != 0 se JA estiver fechado.
 *   (default)     : DEPOIS do lockdown, exige que TODAS estejam NEGADAS.
 *
 * NUNCA imprime a key. Le do ambiente (sem ecoar):
 *   STAGING_SUPABASE_URL       (ex.: https://qsuufuulxfkkeasgxhcv.supabase.co)
 *   STAGING_SUPABASE_ANON_KEY  (publishable/anon key do admai-staging)
 *
 * Uso:
 *   node --env-file=.env.staging.negcontrol scripts/staging-rls-negative-control.mjs
 *   node --env-file=... scripts/staging-rls-negative-control.mjs --expect-open
 *
 * (o --env-file evita a key na linha de comando/history; o arquivo fica fora do git.)
 */

const EXPECT_OPEN = process.argv.includes('--expect-open');

const URL_BASE = process.env.STAGING_SUPABASE_URL;
const ANON = process.env.STAGING_SUPABASE_ANON_KEY;
const REF_ESPERADO = 'qsuufuulxfkkeasgxhcv';

if (!URL_BASE || !ANON) {
  console.error(
    'ABORTADO: defina STAGING_SUPABASE_URL e STAGING_SUPABASE_ANON_KEY (via --env-file, sem ecoar).'
  );
  process.exit(2);
}
// Guard staging-only: a URL precisa conter o ref do admai-staging.
if (!URL_BASE.includes(REF_ESPERADO)) {
  console.error(`ABORTADO: STAGING_SUPABASE_URL nao aponta para ${REF_ESPERADO} (staging-only).`);
  process.exit(2);
}

const TABELAS = [
  'Empresa', 'EmpresaWhatsapp', 'Tecnico', 'DocumentoTecnico', 'Servico', 'Material',
  'MovimentacaoEstoque', 'ServicoMaterial', 'Usuario', 'ContaSocial', 'Notificacao', 'Pagamento',
  'SessaoConversa', 'Avaliacao', 'ConexaoBot', 'RegistroPonto', 'BatidaPonto', 'GoogleConta',
  'AvaliacaoGoogle', 'AnaliseAvaliacoes', 'CodigoRecuperacaoTotp', 'Assinatura', 'ConviteUsuario',
  'SessaoUsuario', 'RefreshToken', 'AuditLog',
];
// Tabelas sensiveis destacadas no amendment (usadas no modo --expect-open).
const SENSIVEIS = ['Usuario', 'RefreshToken', 'SessaoUsuario', 'CodigoRecuperacaoTotp', 'Pagamento', 'AuditLog'];

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function req(method, path, body) {
  const opts = { method, headers: { ...headers } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers.Prefer = 'return=representation';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, opts);
  let texto = '';
  try { texto = await r.text(); } catch { /* ignore */ }
  let arrayLen = null;
  try { const j = JSON.parse(texto); if (Array.isArray(j)) arrayLen = j.length; } catch { /* nao-json */ }
  return { status: r.status, arrayLen };
}

// "acessivel" = a Data API devolveu dados (200 com array) — a porta esta aberta.
// Mesmo 200 [] conta como acessivel (RLS filtrou, mas o privilegio existe): FAIL no fechado.
function acessivel(res) {
  return res.status === 200 && res.arrayLen !== null;
}
function negado(res) {
  return res.status === 401 || res.status === 403 || res.status === 404;
}

const falhas = [];
const linhas = [];

async function main() {
  // GET nas 26
  for (const t of TABELAS) {
    const res = await req('GET', `${t}?select=*&limit=1`);
    const aberto = acessivel(res);
    linhas.push(`GET ${t.padEnd(22)} -> ${res.status}${res.arrayLen !== null ? ` [array:${res.arrayLen}]` : ''}`);
    if (EXPECT_OPEN) {
      if (SENSIVEIS.includes(t) && !aberto) {
        falhas.push(`--expect-open: ${t} deveria estar ACESSIVEL (status ${res.status}) — nada a provar/morder`);
      }
    } else if (aberto || !negado(res)) {
      falhas.push(`${t}: NAO negado (status ${res.status}${res.arrayLen !== null ? `, array:${res.arrayLen}` : ''})`);
    }
  }

  // Mutacoes representativas em Usuario (so no modo fechado — nunca tentamos escrever no aberto).
  if (!EXPECT_OPEN) {
    const post = await req('POST', 'Usuario', { username: `_negctl_${Date.now()}` });
    linhas.push(`POST Usuario           -> ${post.status}`);
    if (post.status >= 200 && post.status < 300) falhas.push(`POST Usuario NAO negado (status ${post.status}) — canario pode ter sido criado!`);

    const patch = await req('PATCH', 'Usuario?id=eq.-999999', { nome: '_negctl_' });
    linhas.push(`PATCH Usuario(id=-999999) -> ${patch.status}`);
    if (patch.status >= 200 && patch.status < 300) falhas.push(`PATCH Usuario NAO negado (status ${patch.status})`);

    const del = await req('DELETE', 'Usuario?id=eq.-999999');
    linhas.push(`DELETE Usuario(id=-999999) -> ${del.status}`);
    if (del.status >= 200 && del.status < 300) falhas.push(`DELETE Usuario NAO negado (status ${del.status})`);
  }

  console.log(`\nSTG-SEC-RLS-01 negative control (${EXPECT_OPEN ? 'EXPECT_OPEN' : 'EXPECT_DENIED'}) @ ${REF_ESPERADO}`);
  for (const l of linhas) console.log('  ' + l);

  if (falhas.length) {
    console.error(`\nFALHOU (${falhas.length}):`);
    for (const f of falhas) console.error('  - ' + f);
    process.exit(1);
  }
  console.log(
    EXPECT_OPEN
      ? '\nOK — exposicao CONFIRMADA (o controle morde: sem lockdown as sensiveis respondem 200).'
      : '\nOK — TODAS as 26 negadas via Data API; POST/PATCH/DELETE negados. Sem exposicao externa.'
  );
}

main().catch((e) => { console.error('erro inesperado:', e.message); process.exit(2); });
