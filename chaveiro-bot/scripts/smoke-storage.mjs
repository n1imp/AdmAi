/**
 * Smoke do object storage (F1b) contra o Supabase real.
 * Uso: node --env-file=.env.staging scripts/smoke-storage.mjs
 * Faz upload de um PNG 1x1 no bucket (arg 1, default `estoque`), confirma a URL
 * pública (GET 200) e remove o objeto de teste. Nunca imprime credenciais.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    'Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (use node --env-file=.env.staging ...).'
  );
  process.exit(1);
}

/* [REVISOR 01a038fc achado 3 + DELTA-2 · STG-APP-STAGING-REV1] Vínculo positivo ao alvo,
   mesmo contrato do provision-bucket: `--staging` fixa o ref VERSIONADO do admai-staging
   (independente do env do operador — um .env trocado não redefine a identidade);
   REQUIRE_SUPABASE_REF cobre outros alvos deliberados (ex.: produção intencional).
   O smoke SEMPRE faz upload ⇒ identidade é OBRIGATÓRIA, nunca fail-open [DELTA-2]. */
const REF_STAGING_VERSIONADO = 'qsuufuulxfkkeasgxhcv'; // admai-staging (fonte: repo, não env)
const modoStaging = process.argv.includes('--staging');
const refExigido = modoStaging ? REF_STAGING_VERSIONADO : process.env.REQUIRE_SUPABASE_REF;
if (!refExigido) {
  console.error(
    'Smoke faz UPLOAD e exige identidade de alvo: use `--staging` (admai-staging versionado) ' +
      'ou REQUIRE_SUPABASE_REF no env. Fail-closed — nada foi enviado.'
  );
  process.exit(1);
}
{
  let u = null;
  try {
    u = new URL(url);
  } catch {
    /* u=null ⇒ aborta abaixo */
  }
  if (!u || u.protocol !== 'https:' || u.hostname !== `${refExigido}.supabase.co`) {
    console.error(
      `Alvo exigido (${modoStaging ? '--staging' : 'REQUIRE_SUPABASE_REF'}=${refExigido}) requer SUPABASE_URL=https://${refExigido}.supabase.co — divergente, abortado.`
    );
    process.exit(1);
  }
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
// Args posicionais IGNORAM flags (--staging etc.) — senão a flag viraria nome de bucket.
const posicionais = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const bucket = posicionais[0] || 'estoque';
const nome = `smoke-${Date.now()}.png`;
const cliente = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: upErr } = await cliente.storage
  .from(bucket)
  .upload(nome, PNG_1x1, { contentType: 'image/png', upsert: false });
if (upErr) {
  console.error('UPLOAD FALHOU:', upErr.message);
  process.exit(1);
}

console.log('Objeto:', `${bucket}/${nome}`);

/* [DELTA-2 01a038fc] TODO o caminho pós-upload sob try/finally: um erro em
   createSignedUrl/fetch/arrayBuffer acontecia ANTES do remove e deixava o objeto
   órfão. O finally SEMPRE tenta remover e checa {error} (Promise RESOLVIDA com
   error ≠ sucesso) — cleanup falho é exit ≠ 0, nunca falso PASS. */
let respOk = false;
let cleanupFalhou = null;
try {
  let link;
  if (posicionais[1] === 'private') {
    const { data, error } = await cliente.storage.from(bucket).createSignedUrl(nome, 60);
    if (error) throw new Error(`SIGN FALHOU: ${error.message}`);
    link = data.signedUrl;
    console.log('URL assinada (privado):', link);
  } else {
    const { data } = cliente.storage.from(bucket).getPublicUrl(nome);
    link = data.publicUrl;
    console.log('URL pública:', link);
  }

  const resp = await fetch(link);
  const bytes = (await resp.arrayBuffer()).byteLength;
  console.log('GET:', resp.status, `(${bytes} bytes)`);
  respOk = resp.ok;
} catch (e) {
  console.error(e.message);
} finally {
  try {
    const rm = await cliente.storage.from(bucket).remove([nome]);
    if (rm.error) cleanupFalhou = rm.error.message;
  } catch (e) {
    cleanupFalhou = e.message;
  }
  if (cleanupFalhou) {
    console.error(`CLEANUP FALHOU (${cleanupFalhou}) — remova ${bucket}/${nome} manualmente.`);
  }
}

if (cleanupFalhou) process.exit(1);
console.log(
  respOk ? 'SMOKE OK — upload + URL acessível, objeto de teste removido.' : 'SMOKE FALHOU.'
);
process.exit(respOk ? 0 : 1);
