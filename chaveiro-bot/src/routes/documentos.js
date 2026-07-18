/**
 * Documentos do funcionário — F9/M4 (atrás da flag DOCUMENTOS_ENABLED).
 *
 * O técnico gerencia os PRÓPRIOS documentos (contrato, RG, CNH…). Armazenamento em
 * bucket PRIVADO (Supabase Storage) com URL assinada curta; sem storage configurado
 * (dev/test) cai para o disco local (./uploads-docs). Tudo escopado por empresa via
 * `req.db` (tenant) + filtro por `tecnicoId` próprio → sem IDOR nem vazamento cross-tenant.
 *
 * RBAC: capacidade própria `proprio.documentos` (ver src/services/permissoes.js). Flag off
 * → todos os endpoints respondem 404 (recurso inerte).
 */
import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { podeProprio } from '../services/permissoes.js';
import { requireAuth } from '../middlewares/auth.js';
import { conferirMagicBytes } from '../utils/upload.js';
import {
  storageHabilitado,
  uploadPrivado,
  urlAssinada,
  removerImagem,
} from '../services/storage.js';
import { env } from '../config/env.js';
import { capturarErro } from '../config/sentry.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);

const BUCKET = 'documentos-tecnico';
const DOCS_DIR = path.resolve('./uploads-docs');
const MAX_BYTES = 5 * 1024 * 1024;
const TIPOS = ['contrato', 'rg', 'cpf', 'cnh', 'comprovante', 'outro'];
// MIME aceito → extensão do objeto. PDF e imagens; magic-bytes conferidos no upload.
const DOC_MIME = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const DATA_URI_RE = /^data:(application\/pdf|image\/jpeg|image\/png);base64,(.+)$/s;

const criarSchema = z.object({
  tipo: z.enum(TIPOS),
  nome: z.string().trim().min(1).max(200),
  arquivo: z.string().min(1), // data URI (validado abaixo)
});

// Gate: flag ligada + funcionário vinculado a um técnico + capacidade própria.
function recursoDocumentos(req, res, next) {
  if (env.DOCUMENTOS_ENABLED !== 'true') {
    return res.status(404).json({ erro: 'Recurso não disponível' });
  }
  if (!req.user.tecnicoId || !podeProprio(req.user, 'documentos')) {
    return res.status(403).json({ erro: 'Sem permissão para documentos' });
  }
  return next();
}

// Metadados públicos do documento (NUNCA a storageKey). A URL aponta para o serve autenticado.
function saida(d) {
  return {
    id: d.id,
    tipo: d.tipo,
    nome: d.nome,
    mime: d.mime,
    tamanho: d.tamanho,
    criadoEm: d.criadoEm,
    url: `/api/me/documentos/${d.id}/arquivo`,
  };
}

router.get('/me/documentos', recursoDocumentos, async (req, res) => {
  try {
    const docs = await req.db.documentoTecnico.findMany({
      where: { tecnicoId: req.user.tecnicoId },
      orderBy: { criadoEm: 'desc' },
    });
    res.json({ documentos: docs.map(saida) });
  } catch (erro) {
    logger.error('Erro GET /me/documentos', { erro: erro.message });
    capturarErro(erro, {
      feature: 'documentos',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.post('/me/documentos', recursoDocumentos, async (req, res) => {
  try {
    const parse = criarSchema.safeParse(req.body ?? {});
    if (!parse.success)
      return res.status(400).json({ erro: 'Dados inválidos', detalhes: parse.error.format() });
    const { tipo, nome, arquivo } = parse.data;

    const m = DATA_URI_RE.exec(arquivo);
    if (!m)
      return res
        .status(400)
        .json({ erro: 'Arquivo inválido (use PDF/JPEG/PNG em data URI base64)' });
    const mime = m[1];
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return res.status(400).json({ erro: 'Arquivo vazio ou maior que 5MB' });
    }
    if (!conferirMagicBytes(buffer, mime)) {
      return res.status(400).json({ erro: 'Conteúdo não corresponde ao tipo declarado' });
    }

    const storageKey = `doc-${randomUUID()}.${DOC_MIME[mime]}`;
    // Bucket PRIVADO. Sem storage (dev/test) grava no disco; STORAGE_STRICT segue valendo
    // no caminho do storage (uploadPrivado lança e o erro cai no 500 — sem fallback silencioso).
    if (storageHabilitado()) {
      await uploadPrivado(BUCKET, storageKey, buffer, mime);
    } else {
      await mkdir(DOCS_DIR, { recursive: true });
      await writeFile(path.join(DOCS_DIR, storageKey), buffer);
    }

    const doc = await req.db.documentoTecnico.create({
      data: { tecnicoId: req.user.tecnicoId, tipo, nome, mime, tamanho: buffer.length, storageKey },
    });
    res.status(201).json({ documento: saida(doc) });
  } catch (erro) {
    logger.error('Erro POST /me/documentos', { erro: erro.message });
    capturarErro(erro, {
      feature: 'documentos',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.get('/me/documentos/:id/arquivo', recursoDocumentos, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'id inválido' });
  try {
    // findFirst escopado (tenant + tecnicoId próprio): só o dono do documento o acessa.
    const doc = await req.db.documentoTecnico.findFirst({
      where: { id, tecnicoId: req.user.tecnicoId },
    });
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado' });

    // Storage privado: 302 para URL assinada curta. Sem storage (ou objeto no disco): serve o arquivo.
    if (storageHabilitado()) {
      const assinada = await urlAssinada(BUCKET, doc.storageKey, 60);
      if (assinada) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.redirect(302, assinada);
      }
    }
    const caminho = path.join(DOCS_DIR, doc.storageKey);
    if (!existsSync(caminho)) return res.status(404).json({ erro: 'Arquivo não encontrado' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.type(doc.mime);
    return res.sendFile(caminho);
  } catch (erro) {
    logger.error('Erro GET /me/documentos/:id/arquivo', { erro: erro.message });
    capturarErro(erro, {
      feature: 'documentos',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
      extra: { documentoId: id },
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

router.delete('/me/documentos/:id', recursoDocumentos, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'id inválido' });
  try {
    const doc = await req.db.documentoTecnico.findFirst({
      where: { id, tecnicoId: req.user.tecnicoId },
    });
    if (!doc) return res.status(404).json({ erro: 'Documento não encontrado' });
    // deleteMany escopado (tenant + tecnicoId próprio): remove só o do dono.
    const r = await req.db.documentoTecnico.deleteMany({
      where: { id, tecnicoId: req.user.tecnicoId },
    });
    if (r.count === 0) return res.status(404).json({ erro: 'Documento não encontrado' });
    // Best-effort: remove o objeto do storage/disco (não falha a resposta se sobrar órfão).
    if (storageHabilitado()) {
      await removerImagem(BUCKET, doc.storageKey);
    } else {
      try {
        await unlink(path.join(DOCS_DIR, doc.storageKey));
      } catch {
        /* arquivo já ausente — ok */
      }
    }
    res.json({ removido: true, id });
  } catch (erro) {
    logger.error('Erro DELETE /me/documentos/:id', { erro: erro.message });
    capturarErro(erro, {
      feature: 'documentos',
      userId: req.user?.id,
      empresaId: req.user?.empresaId,
      extra: { documentoId: id },
    });
    res.status(500).json({ erro: 'Erro interno' });
  }
});

export default router;
