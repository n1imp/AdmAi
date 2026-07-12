/**
 * Object storage (Supabase Storage) — F1b.
 *
 * Wrapper fino sobre o Supabase Storage para tirar os uploads do disco local (que
 * torna o serviço stateful e impede escala horizontal). É feature-flag por env:
 * se `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` não estiverem configurados,
 * `storageHabilitado()` retorna false e as rotas caem no fallback de disco — então
 * é seguro deployar este código ANTES de provisionar as credenciais (Expand/Contract).
 *
 * O service-role key é usado apenas no servidor (nunca exposto ao cliente) e bypassa
 * RLS para escrever/remover; buckets públicos permitem leitura direta por URL.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let cliente = null;

/** true quando o storage está configurado (senão, as rotas usam o disco local). */
export function storageHabilitado() {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

function clienteStorage() {
  if (!cliente) {
    cliente = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

/**
 * Envia um buffer para um bucket e devolve a URL pública (buckets públicos).
 * @returns {Promise<string>} URL pública do objeto.
 */
export async function uploadImagem(bucket, nomeArquivo, buffer, contentType) {
  const { error } = await clienteStorage().storage
    .from(bucket)
    .upload(nomeArquivo, buffer, { contentType, upsert: false });
  if (error) throw new Error(`Falha no upload para ${bucket}/${nomeArquivo}: ${error.message}`);
  const { data } = clienteStorage().storage.from(bucket).getPublicUrl(nomeArquivo);
  return data.publicUrl;
}

/** Remove um objeto do bucket (best-effort; loga aviso em falha, não lança). */
export async function removerImagem(bucket, nomeArquivo) {
  const { error } = await clienteStorage().storage.from(bucket).remove([nomeArquivo]);
  if (error) logger.warn('Falha ao remover do storage', { bucket, nomeArquivo, erro: error.message });
}

/**
 * Sobe a imagem para o storage (se configurado) e, em QUALQUER falha — ou sem storage —,
 * grava no disco local em `uploadsDir`. Garante que a indisponibilidade do storage nunca
 * derrube o fluxo de upload (uploads não são caminho crítico e degradam com elegância).
 * @returns {Promise<string>} URL pública (storage) ou `/uploads/<nome>` (disco).
 */
export async function uploadComFallback(bucket, nomeArquivo, buffer, contentType, uploadsDir) {
  if (storageHabilitado()) {
    try {
      return await uploadImagem(bucket, nomeArquivo, buffer, contentType);
    } catch (erro) {
      logger.warn('Storage indisponível no upload; caindo para disco', { bucket, nomeArquivo, erro: erro.message });
    }
  }
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, nomeArquivo), buffer);
  return `/uploads/${nomeArquivo}`;
}
