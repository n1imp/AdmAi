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
 * NUNCA imprime key/token. Le do ambiente (sem ecoar):
 *   STAGING_SUPABASE_URL           (ex.: https://qsuufuulxfkkeasgxhcv.supabase.co)
 *   STAGING_SUPABASE_ANON_KEY      (publishable/anon key do admai-staging)
 *   STAGING_AUTHENTICATED_JWT      (OPCIONAL: JWT de um usuario autenticado SEM
 *                                   privilegios — quando presente, a matriz roda
 *                                   TAMBEM como `authenticated` [D1 v2/REVISOR:
 *                                   authenticated-unprivileged nao pode acessar])
 *
 * Uso:
 *   node --env-file=.env.staging.negcontrol scripts/staging-rls-negative-control.mjs
 *   node --env-file=... scripts/staging-rls-negative-control.mjs --expect-open
 *
 * (o --env-file evita key/token na linha de comando/history; o arquivo fica fora do git.)
 */

const EXPECT_OPEN = process.argv.includes('--expect-open');

const URL_BASE = process.env.STAGING_SUPABASE_URL;
const ANON = process.env.STAGING_SUPABASE_ANON_KEY;
const AUTH_JWT = process.env.STAGING_AUTHENTICATED_JWT || null;
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
  'Empresa',
  'EmpresaWhatsapp',
  'Tecnico',
  'DocumentoTecnico',
  'Servico',
  'Material',
  'MovimentacaoEstoque',
  'ServicoMaterial',
  'Usuario',
  'ContaSocial',
  'Notificacao',
  'Pagamento',
  'SessaoConversa',
  'Avaliacao',
  'ConexaoBot',
  'RegistroPonto',
  'BatidaPonto',
  'GoogleConta',
  'AvaliacaoGoogle',
  'AnaliseAvaliacoes',
  'CodigoRecuperacaoTotp',
  'Assinatura',
  'ConviteUsuario',
  'SessaoUsuario',
  'RefreshToken',
  'AuditLog',
];
// Tabelas sensiveis destacadas no amendment (usadas no modo --expect-open).
const SENSIVEIS = [
  'Usuario',
  'RefreshToken',
  'SessaoUsuario',
  'CodigoRecuperacaoTotp',
  'Pagamento',
  'AuditLog',
];

// Dois principais: 'anon' (bearer = anon key) e, quando o JWT estiver presente,
// 'authenticated' (apikey = anon key; bearer = JWT do usuario sem privilegios).
function headersDe(principal) {
  const bearer = principal === 'authenticated' ? AUTH_JWT : ANON;
  return { apikey: ANON, Authorization: `Bearer ${bearer}` };
}

async function req(method, path, body, principal = 'anon') {
  const opts = { method, headers: { ...headersDe(principal) } };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.headers.Prefer = 'return=representation';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${URL_BASE}/rest/v1/${path}`, opts);
  let texto = '';
  try {
    texto = await r.text();
  } catch {
    /* ignore */
  }
  let arrayLen = null;
  try {
    const j = JSON.parse(texto);
    if (Array.isArray(j)) arrayLen = j.length;
  } catch {
    /* nao-json */
  }
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

async function matriz(principal) {
  // GET nas 26 sob o principal dado.
  for (const t of TABELAS) {
    const res = await req('GET', `${t}?select=*&limit=1`, undefined, principal);
    const aberto = acessivel(res);
    linhas.push(
      `[${principal}] GET ${t.padEnd(22)} -> ${res.status}${res.arrayLen !== null ? ` [array:${res.arrayLen}]` : ''}`
    );
    if (EXPECT_OPEN) {
      if (principal === 'anon' && SENSIVEIS.includes(t) && !aberto) {
        falhas.push(
          `--expect-open: ${t} deveria estar ACESSIVEL (status ${res.status}) — nada a provar/morder`
        );
      }
    } else if (aberto || !negado(res)) {
      falhas.push(
        `[${principal}] ${t}: NAO negado (status ${res.status}${res.arrayLen !== null ? `, array:${res.arrayLen}` : ''})`
      );
    }
  }

  // Mutacoes representativas em Usuario (so no modo fechado — nunca escrevemos no aberto).
  // [REVISOR F5] Exigir negacao por AUTORIZACAO (401/403) ou tabela nao exposta (404).
  if (!EXPECT_OPEN) {
    const negadoAcesso = (s) => s === 401 || s === 403 || s === 404;
    const checaMut = (nome, res) => {
      linhas.push(`[${principal}] ${nome} -> ${res.status}`);
      if (!negadoAcesso(res.status))
        falhas.push(
          `[${principal}] ${nome} NAO negado por privilegio (status ${res.status}; esperado 401/403/404)`
        );
    };
    checaMut(
      'POST Usuario',
      await req('POST', 'Usuario', { username: `_negctl_${Date.now()}` }, principal)
    );
    checaMut(
      'PATCH Usuario(id=eq.-999999)',
      await req('PATCH', 'Usuario?id=eq.-999999', { nome: '_negctl_' }, principal)
    );
    checaMut(
      'DELETE Usuario(id=eq.-999999)',
      await req('DELETE', 'Usuario?id=eq.-999999', undefined, principal)
    );
  }
}

async function main() {
  await matriz('anon');
  // [D1 v2/REVISOR achado 4 + DELTA] authenticated-unprivileged tambem nao pode acessar.
  // JWT AUSENTE no modo fechado = FALHA (nao-PASS): o gate authenticated e obrigatorio
  // para fechar — um exit 0 sem executa-lo seria falso PASS.
  if (AUTH_JWT) {
    // Controle POSITIVO do principal: prova que o JWT e um usuario autenticado VIVO
    // (GET /auth/v1/user -> 200) ANTES da matriz — senao os 401 da matriz poderiam
    // ser so "token invalido/expirado" e nao provariam nada sobre o boundary.
    const rUser = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: ANON, Authorization: `Bearer ${AUTH_JWT}` },
    });
    linhas.push(
      `[authenticated] GET /auth/v1/user -> ${rUser.status} (controle positivo do principal)`
    );
    if (rUser.status !== 200) {
      falhas.push(
        `[authenticated] JWT nao autentica em /auth/v1/user (status ${rUser.status}) — token invalido/expirado; a matriz authenticated NAO prova o boundary`
      );
    } else {
      await matriz('authenticated');
    }
  } else if (!EXPECT_OPEN) {
    falhas.push(
      '[authenticated] STAGING_AUTHENTICATED_JWT AUSENTE — o gate authenticated-unprivileged e OBRIGATORIO para fechar; defina o token (nunca ecoado) e re-rode'
    );
  }

  console.log(
    `\nSTG-SEC-RLS-01 negative control (${EXPECT_OPEN ? 'EXPECT_OPEN' : 'EXPECT_DENIED'}) @ ${REF_ESPERADO}`
  );
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

main().catch((e) => {
  console.error('erro inesperado:', e.message);
  process.exit(2);
});
