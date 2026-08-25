#!/usr/bin/env node
// =============================================================================
// provision-bucket-documentos.mjs — provisiona/valida o bucket PRIVADO
// `documentos-tecnico` (F9/M4) no Supabase Storage, de forma IDEMPOTENTE.
//
// Por que existe: os endpoints /api/me/documentos (flag DOCUMENTOS_ENABLED) guardam
// contratos/RG/CNH em bucket privado com URL assinada curta. Sem o bucket, o app
// degrada para o disco local (não escala) — então provisionar é pré-requisito de
// produção. Este script torna esse passo reproduzível e auditável (não "clique no
// painel do Supabase"), casando exatamente o contrato do app (privado, 5 MB, pdf/jpg/png).
//
// Uso (as credenciais NUNCA são versionadas nem impressas):
//   node --env-file=.env.staging scripts/provision-bucket-documentos.mjs --check
//   ALLOW_STORAGE_PROVISION=true node --env-file=.env.staging scripts/provision-bucket-documentos.mjs --provision
//   node --env-file=.env.staging scripts/provision-bucket-documentos.mjs --validate
//   # produção: troque --env-file=.env.staging por --env-file=.env (mesmo comando)
//
// Modos:
//   --check     (default) SOMENTE LEITURA: existe? é privado? (exit 0 só se existe+privado)
//   --provision cria o bucket privado se faltar (idempotente). Requer ALLOW_STORAGE_PROVISION=true.
//               NUNCA altera a visibilidade de um bucket já existente (troca de exposição
//               é decisão humana) — se achar público, ABORTA pedindo revisão manual.
//   --validate  smoke real: sobe um PDF de teste, prova que a URL ASSINADA abre (200) e que
//               a URL PÚBLICA é BLOQUEADA (privado), e remove o objeto de teste.
//
// Segurança: sem SUPABASE_URL/SERVICE_ROLE_KEY, aborta. O service-role key só é usado
// server-side (bypassa RLS); o controle de acesso do M4 é na aplicação (tenant + tecnicoId
// próprio) + bucket privado + URL assinada de 60s. Por isso não há políticas de Storage RLS
// a configurar aqui: nenhum cliente anônimo acessa estes objetos diretamente.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

// Contrato do app — DEVE casar com src/routes/documentos.js.
const BUCKET = 'documentos-tecnico';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MIMES = ['application/pdf', 'image/jpeg', 'image/png'];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function abortar(msg, code = 1) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(code);
}
const ok = (m) => console.log(`✅ ${m}`);
const info = (m) => console.log(`   ${m}`);

if (!url || !key) {
  abortar(
    'Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.\n' +
      '   Rode com:  node --env-file=.env.staging scripts/provision-bucket-documentos.mjs --check'
  );
}

/* [REVISOR 01a038fc achado 3 + DELTA · STG-APP-STAGING-REV1] Vínculo POSITIVO ao alvo.
   Três camadas, fail-closed onde importa:
   1. `--staging`: o ref exigido é a CONSTANTE VERSIONADA abaixo (admai-staging) —
      independente do env do operador; um .env errado não redefine a identidade.
      É a forma usada por TODOS os comandos de staging do deploy package.
   2. REQUIRE_SUPABASE_REF (env): vínculo explícito para outros alvos (ex.: produção
      deliberada). Nota: vem do MESMO env da URL — não protege contra env-file trocado;
      por isso staging usa a flag, não a var.
   3. MUTAÇÃO exige identidade: --provision E --validate (o validate também faz UPLOAD
      [DELTA-2]) sem --staging e sem REQUIRE_SUPABASE_REF ABORTAM. Só o --check
      (somente leitura) dispensa identidade. */
const REF_STAGING_VERSIONADO = 'qsuufuulxfkkeasgxhcv'; // admai-staging (fonte: repo, não env)
const modoStaging = process.argv.includes('--staging');
const refExigido = modoStaging ? REF_STAGING_VERSIONADO : process.env.REQUIRE_SUPABASE_REF;
const vaiMutar = process.argv.includes('--provision') || process.argv.includes('--validate');
if (vaiMutar && !refExigido) {
  abortar(
    'MUTAÇÃO sem identidade de alvo: --provision/--validate exigem `--staging` (vincula ao ' +
      'admai-staging versionado) ou REQUIRE_SUPABASE_REF no env. Fail-closed — nenhuma mutação.'
  );
}
if (refExigido) {
  let u = null;
  try {
    u = new URL(url);
  } catch {
    /* u=null ⇒ aborta abaixo */
  }
  if (!u || u.protocol !== 'https:' || u.hostname !== `${refExigido}.supabase.co`) {
    abortar(
      `Alvo exigido (${modoStaging ? '--staging' : 'REQUIRE_SUPABASE_REF'}=${refExigido}) requer SUPABASE_URL=https://${refExigido}.supabase.co — alvo divergente, abortado (nenhuma mutação).`
    );
  }
}

const modo =
  process.argv.find((a) => ['--check', '--provision', '--validate'].includes(a)) || '--check';
const cliente = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Máscara defensiva: só o host do projeto (nunca a key).
try {
  info(`Projeto: ${new URL(url).host}  |  modo: ${modo}`);
} catch {
  abortar('SUPABASE_URL inválida.');
}

// ── Estado atual do bucket ────────────────────────────────────────────────────
async function lerBucket() {
  const { data, error } = await cliente.storage.getBucket(BUCKET);
  if (error && !/not.?found/i.test(error.message)) {
    abortar(`Falha ao consultar o bucket "${BUCKET}": ${error.message}`);
  }
  return data || null; // { id, name, public, file_size_limit, allowed_mime_types } | null
}

// ── --check ───────────────────────────────────────────────────────────────────
async function check() {
  const b = await lerBucket();
  if (!b) {
    console.error(`\n⚠️  Bucket "${BUCKET}" NÃO existe neste projeto.`);
    info('Provisione com:  ALLOW_STORAGE_PROVISION=true node --env-file=.env.staging \\');
    info('                 scripts/provision-bucket-documentos.mjs --provision');
    process.exit(1);
  }
  ok(`Bucket "${BUCKET}" existe.`);
  info(
    `público: ${b.public}  |  limite: ${b.file_size_limit ?? '—'}  |  mimes: ${(b.allowed_mime_types || []).join(', ') || '—'}`
  );
  if (b.public) {
    abortar(
      'O bucket está PÚBLICO — documentos são privados (LGPD). Revise no painel do Supabase.'
    );
  }
  ok('Bucket é PRIVADO — compatível com o M4.');
  process.exit(0);
}

// ── --provision (idempotente) ──────────────────────────────────────────────────
async function provision() {
  if (process.env.ALLOW_STORAGE_PROVISION !== 'true') {
    abortar(
      'ALLOW_STORAGE_PROVISION != "true". Confirmação explícita de que o projeto acima é o alvo\n' +
        '   correto (staging OU produção). Reexecute com ALLOW_STORAGE_PROVISION=true.'
    );
  }
  const existente = await lerBucket();
  if (existente) {
    if (existente.public) {
      abortar(
        `Bucket "${BUCKET}" JÁ existe e está PÚBLICO. Não vou trocar a visibilidade automaticamente (risco de exposição). Ajuste manualmente para privado e rode --validate.`
      );
    }
    ok(`Bucket "${BUCKET}" já existe e é privado — nada a fazer (idempotente).`);
    process.exit(0);
  }
  const { error } = await cliente.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: MIMES,
  });
  if (error) abortar(`Falha ao criar o bucket: ${error.message}`);
  ok(
    `Bucket "${BUCKET}" criado como PRIVADO (limite ${MAX_BYTES} bytes, mimes ${MIMES.join('/')}).`
  );
  info('Próximo passo: valide com --validate.');
  process.exit(0);
}

// ── --validate (smoke real: upload + URL assinada abre + URL pública bloqueada) ─
async function validate() {
  const b = await lerBucket();
  if (!b) abortar(`Bucket "${BUCKET}" não existe — rode --provision antes.`);
  if (b.public) abortar(`Bucket "${BUCKET}" está PÚBLICO — inválido para documentos privados.`);

  const nome = `_smoke/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
  const pdf = Buffer.from('%PDF-1.4\n% smoke test documentos-tecnico\n', 'utf8');

  const up = await cliente.storage.from(BUCKET).upload(nome, pdf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (up.error) abortar(`Upload de teste falhou: ${up.error.message}`);
  ok(`Upload autorizado (service-role): ${BUCKET}/${nome}`);

  /* [REVISOR 01a038fc achado 3 + DELTA] Cleanup em FINALLY, SEM falso PASS: o Supabase
     devolve {error} numa Promise RESOLVIDA — `.then(ok)` sozinho registraria "removido"
     com o objeto ainda lá. Cleanup que falha derruba a validação (exit != 0): objeto
     órfão num bucket de documentos privados não pode passar em silêncio. */
  let okAssinada = false;
  let bloqueado = false;
  let cleanupFalhou = null;
  try {
    // 1) URL assinada DEVE abrir (leitura autorizada).
    const sig = await cliente.storage.from(BUCKET).createSignedUrl(nome, 60);
    // throw (não abortar/process.exit): process.exit PULA o finally e órfã o objeto.
    if (sig.error) throw new Error(`createSignedUrl falhou: ${sig.error.message}`);
    const rSig = await fetch(sig.data.signedUrl);
    okAssinada = rSig.ok;
    info(`URL assinada → GET ${rSig.status} (${okAssinada ? 'abre, ok' : 'FALHOU'})`);

    // 2) URL pública NÃO pode abrir (bucket privado bloqueia acesso indevido).
    const pub = cliente.storage.from(BUCKET).getPublicUrl(nome);
    const rPub = await fetch(pub.data.publicUrl);
    bloqueado = !rPub.ok; // privado → 400/403/404
    info(
      `URL pública  → GET ${rPub.status} (${bloqueado ? 'BLOQUEADO, ok' : 'ABRIU — FALHA DE PRIVACIDADE'})`
    );
  } finally {
    try {
      const rm = await cliente.storage.from(BUCKET).remove([nome]);
      if (rm.error)
        cleanupFalhou = rm.error.message; // Promise resolvida com {error} ≠ sucesso
      else info('Objeto de teste removido.');
    } catch (e) {
      cleanupFalhou = e.message;
    }
    if (cleanupFalhou) {
      console.error(
        `⚠️  cleanup FALHOU (${cleanupFalhou}) — remova ${BUCKET}/${nome} manualmente.`
      );
    }
  }

  if (cleanupFalhou) {
    abortar(`VALIDAÇÃO NÃO-PASS: objeto de teste órfão no bucket (${BUCKET}/${nome}).`);
  }
  if (okAssinada && bloqueado) {
    ok('VALIDAÇÃO OK — upload + leitura assinada + bloqueio público (privacidade garantida).');
    process.exit(0);
  }
  abortar('VALIDAÇÃO FALHOU — veja os status acima (assinada deve abrir; pública deve bloquear).');
}

const acoes = { '--check': check, '--provision': provision, '--validate': validate };
await acoes[modo]();
