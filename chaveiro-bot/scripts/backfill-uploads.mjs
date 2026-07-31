#!/usr/bin/env node
/**
 * Backfill de mídia legada (disco local → Object Storage) — pré-requisito da escala
 * horizontal (F1/F2 do ARCHITECTURE_EVOLUTION_PLAN).
 *
 * Antes do F1b, uploads iam para o volume local (`/app/uploads` e `/app/uploads-ponto`).
 * Com N réplicas (F2) esses arquivos existem só no disco da réplica que os gravou → as
 * demais respondem 404 na mídia. Este script sobe a mídia legada para o Supabase Storage
 * e reescreve as URLs públicas no banco, deixando o serviço stateless. É NÃO-destrutivo e
 * idempotente (upsert; re-rodar é inócuo — registros já migrados não voltam a casar o filtro).
 *
 * ⚠️ Rode DENTRO do ambiente que tem o volume + credenciais (ex.: `railway run ...` ou o
 * console do serviço), pois lê os arquivos do disco e acessa banco/storage de produção.
 *
 * Uso:
 *   node --env-file=.env scripts/backfill-uploads.mjs            # dry-run: só relata o que faria
 *   node --env-file=.env scripts/backfill-uploads.mjs --apply    # executa: sobe + reescreve URLs
 *
 * Superfícies migradas:
 *   Material.imagemUrl     /uploads/<n>        → bucket `estoque`      (público)  [reescreve a URL]
 *   Servico.fotoEvidencia  /uploads/<n>        → bucket `inbound`      (público)  [reescreve a URL]
 *   BatidaPonto.selfieUrl  /uploads-ponto/<n>  → bucket `selfies-ponto`(privado)  [NÃO reescreve: a
 *                          rota /ponto/selfie/:arquivo já assina do storage quando o objeto existe]
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helpers puros vivem num módulo sem shebang para poderem ser importados pelos testes
// (ver scripts/backfill-uploads-helpers.mjs). Reexportados para não quebrar quem importa daqui.
import { tipoConteudo, nomeObjeto } from './backfill-uploads-helpers.mjs';
export { tipoConteudo, nomeObjeto };

// Diretórios do volume — batem com os que a app usa (routes/estoque.js, services/inbound.js,
// routes/tecnicos.js). Sobrescrevíveis por env caso o mount do volume mude de caminho.
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.resolve('./uploads');
const PONTO_SELFIES_DIR = process.env.PONTO_SELFIES_DIR || path.resolve('./uploads-ponto');

/**
 * Migra uma superfície (coluna com URL de disco). `subir(nome, buffer)` sobe o arquivo e
 * devolve a nova URL (ou null p/ privado); `reescrever(id, url)` persiste a nova URL (ou null
 * quando a URL não muda). Em dry-run só contabiliza — nada é lido/enviado/reescrito.
 */
async function migrarSuperficie({
  rotulo,
  registros,
  prefixo,
  dir,
  subir,
  reescrever,
  aplicar,
  log,
}) {
  const r = {
    rotulo,
    encontrados: registros.length,
    migrados: 0,
    semArquivo: 0,
    invalidos: 0,
    erros: 0,
  };
  for (const reg of registros) {
    const nome = nomeObjeto(reg.url, prefixo);
    if (!nome) {
      r.invalidos++;
      log.warn('URL legada inválida — pulando', { rotulo, id: reg.id, url: reg.url });
      continue;
    }
    const caminho = path.join(dir, nome);
    if (!existsSync(caminho)) {
      r.semArquivo++;
      log.warn('Arquivo ausente no disco — pulando', { rotulo, id: reg.id, caminho });
      continue;
    }
    if (!aplicar) {
      r.migrados++;
      continue;
    } // dry-run: contaria como migrado
    try {
      const buffer = await readFile(caminho);
      const novaUrl = await subir(nome, buffer);
      if (reescrever) await reescrever(reg.id, novaUrl);
      r.migrados++;
      log.info('Mídia migrada', { rotulo, id: reg.id, nome });
    } catch (e) {
      r.erros++;
      log.error('Falha ao migrar mídia', { rotulo, id: reg.id, nome, erro: e.message });
    }
  }
  return r;
}

/**
 * Executa o backfill das três superfícies. Deps pesadas (prisma/storage/logger) são
 * carregadas via import dinâmico para que os helpers puros acima sejam testáveis sem
 * disparar a validação de env / conexão de banco no import.
 * @returns {Promise<Array>} resultados por superfície.
 */
export async function executar({ aplicar }) {
  const { prisma } = await import('../src/db/prisma.js');
  const { storageHabilitado, uploadImagem, uploadPrivado } =
    await import('../src/services/storage.js');
  const { logger: log } = await import('../src/utils/logger.js');

  if (!storageHabilitado()) {
    throw new Error(
      'Object storage não configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY). Nada a migrar.'
    );
  }

  const [materiais, servicos, batidas] = await Promise.all([
    prisma.material.findMany({
      where: { imagemUrl: { startsWith: '/uploads/' } },
      select: { id: true, imagemUrl: true },
    }),
    prisma.servico.findMany({
      where: { fotoEvidencia: { startsWith: '/uploads/' } },
      select: { id: true, fotoEvidencia: true },
    }),
    prisma.batidaPonto.findMany({
      where: { selfieUrl: { startsWith: '/uploads-ponto/' } },
      select: { id: true, selfieUrl: true },
    }),
  ]);

  return [
    await migrarSuperficie({
      rotulo: 'estoque (Material.imagemUrl)',
      aplicar,
      log,
      registros: materiais.map((m) => ({ id: m.id, url: m.imagemUrl })),
      prefixo: '/uploads/',
      dir: UPLOADS_DIR,
      subir: (nome, buffer) =>
        uploadImagem('estoque', nome, buffer, tipoConteudo(nome), { upsert: true }),
      reescrever: (id, url) => prisma.material.update({ where: { id }, data: { imagemUrl: url } }),
    }),
    await migrarSuperficie({
      rotulo: 'inbound (Servico.fotoEvidencia)',
      aplicar,
      log,
      registros: servicos.map((s) => ({ id: s.id, url: s.fotoEvidencia })),
      prefixo: '/uploads/',
      dir: UPLOADS_DIR,
      subir: (nome, buffer) =>
        uploadImagem('inbound', nome, buffer, tipoConteudo(nome), { upsert: true }),
      reescrever: (id, url) =>
        prisma.servico.update({ where: { id }, data: { fotoEvidencia: url } }),
    }),
    await migrarSuperficie({
      rotulo: 'selfies-ponto (BatidaPonto.selfieUrl)',
      aplicar,
      log,
      registros: batidas.map((b) => ({ id: b.id, url: b.selfieUrl })),
      prefixo: '/uploads-ponto/',
      dir: PONTO_SELFIES_DIR,
      // Bucket privado: só garante o objeto no storage; a URL no banco permanece /uploads-ponto/<n>.
      subir: async (nome, buffer) => {
        await uploadPrivado('selfies-ponto', nome, buffer, tipoConteudo(nome), { upsert: true });
        return null;
      },
      reescrever: null,
    }),
  ];
}

/** Imprime o sumário e devolve o total de erros (exit code). */
export function relatar(resultados, aplicar) {
  console.log(
    `\n=== Backfill de mídia (${aplicar ? 'APLICADO' : 'DRY-RUN — nada foi alterado'}) ===`
  );
  let erros = 0;
  for (const r of resultados) {
    console.log(`\n${r.rotulo}`);
    console.log(
      `  encontrados: ${r.encontrados} | ${aplicar ? 'migrados' : 'migraria'}: ${r.migrados}` +
        ` | sem arquivo: ${r.semArquivo} | invalidos: ${r.invalidos} | erros: ${r.erros}`
    );
    erros += r.erros;
  }
  console.log(`\nTotal de erros: ${erros}`);
  if (!aplicar) console.log('Rode com --apply para executar a migração.');
  return erros;
}

// Executa só quando chamado como script (não em import de teste).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const aplicar = process.argv.includes('--apply');
  const desconectar = async () => {
    try {
      const { prisma } = await import('../src/db/prisma.js');
      await prisma.$disconnect();
    } catch {
      /* noop */
    }
  };
  executar({ aplicar })
    .then(async (res) => {
      const erros = relatar(res, aplicar);
      await desconectar();
      process.exit(erros > 0 ? 1 : 0);
    })
    .catch(async (e) => {
      console.error('ERRO no backfill:', e.message);
      await desconectar();
      process.exit(1);
    });
}
