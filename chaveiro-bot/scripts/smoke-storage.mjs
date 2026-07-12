/**
 * Smoke do object storage (F1b) contra o Supabase real.
 * Uso: node --env-file=.env.staging scripts/smoke-storage.mjs
 * Faz upload de um PNG 1x1 no bucket `estoque`, confirma a URL pública (GET 200)
 * e remove o objeto de teste. Nunca imprime credenciais.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (use node --env-file=.env.staging ...).');
  process.exit(1);
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const bucket = 'estoque';
const nome = `smoke-${Date.now()}.png`;
const cliente = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { error: upErr } = await cliente.storage.from(bucket).upload(nome, PNG_1x1, { contentType: 'image/png', upsert: false });
if (upErr) { console.error('UPLOAD FALHOU:', upErr.message); process.exit(1); }

const { data } = cliente.storage.from(bucket).getPublicUrl(nome);
console.log('Objeto:', `${bucket}/${nome}`);
console.log('URL pública:', data.publicUrl);

const resp = await fetch(data.publicUrl);
const bytes = (await resp.arrayBuffer()).byteLength;
console.log('GET público:', resp.status, `(${bytes} bytes)`);

await cliente.storage.from(bucket).remove([nome]); // limpa o objeto de teste
console.log(resp.ok ? 'SMOKE OK — upload + URL pública acessível, objeto de teste removido.' : 'SMOKE FALHOU.');
process.exit(resp.ok ? 0 : 1);
