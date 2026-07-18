/**
 * Teste de integração — documentos do funcionário (F9/M4).
 * O técnico gerencia os PRÓPRIOS documentos (bucket privado; em teste, disco local).
 * Cobre: ciclo CRUD (upload PDF/imagem → listar → baixar → apagar), validação de conteúdo
 * (magic-bytes, tamanho, data URI), posse/multi-tenant (não acessa doc de outro → 404),
 * RBAC (dono sem tecnicoId → 403) e o gate da flag (off → 404). Sem SUPABASE_URL no
 * ambiente de teste, o upload cai no disco (./uploads-docs) e o serve devolve o arquivo.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

// PDF mínimo válido (assinatura %PDF-) e um PNG 1x1 real — ambos passam no magic-bytes.
const PDF_DATA_URI =
  'data:application/pdf;base64,' +
  Buffer.from('%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF\n', 'latin1').toString('base64');
const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app;
beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function novoFuncionario(sufixo, telefone) {
  const { token: dono } = await criarEmpresaComAdmin(request, app, sufixo);
  return criarFuncionarioComAcesso(request, app, dono, { telefone });
}

describe('Documentos do funcionário (F9/M4)', () => {
  it('ciclo CRUD: upload → listar → baixar → apagar', async () => {
    const { token: func } = await novoFuncionario('D1', '5521990210000');

    const up = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`)
      .send({ tipo: 'contrato', nome: 'contrato.pdf', arquivo: PDF_DATA_URI });
    expect(up.status).toBe(201);
    expect(up.body.documento.tipo).toBe('contrato');
    expect(up.body.documento.mime).toBe('application/pdf');
    expect(up.body.documento.tamanho).toBeGreaterThan(0);
    expect(up.body.documento.url).toBe(`/api/me/documentos/${up.body.documento.id}/arquivo`);
    // NÃO vaza a chave interna do storage.
    expect(up.body.documento.storageKey).toBeUndefined();
    const docId = up.body.documento.id;

    const lista = await request(app)
      .get('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`);
    expect(lista.status).toBe(200);
    expect(lista.body.documentos).toHaveLength(1);
    expect(lista.body.documentos[0].id).toBe(docId);

    const arquivo = await request(app)
      .get(`/api/me/documentos/${docId}/arquivo`)
      .set('Authorization', `Bearer ${func}`);
    expect(arquivo.status).toBe(200);
    expect(String(arquivo.headers['content-type'])).toMatch(/pdf/);

    const del = await request(app)
      .delete(`/api/me/documentos/${docId}`)
      .set('Authorization', `Bearer ${func}`);
    expect(del.status).toBe(200);
    expect(del.body.removido).toBe(true);

    const vazio = await request(app)
      .get('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`);
    expect(vazio.body.documentos).toHaveLength(0);
    // Baixar depois de apagar → 404.
    const semArquivo = await request(app)
      .get(`/api/me/documentos/${docId}/arquivo`)
      .set('Authorization', `Bearer ${func}`);
    expect(semArquivo.status).toBe(404);
  });

  it('aceita imagem (PNG) como documento', async () => {
    const { token: func } = await novoFuncionario('D2', '5521990220000');
    const up = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`)
      .send({ tipo: 'rg', nome: 'rg.png', arquivo: PNG_DATA_URI });
    expect(up.status).toBe(201);
    expect(up.body.documento.mime).toBe('image/png');
  });

  it('rejeita conteúdo que não bate com o MIME, data URI inválida e tipo desconhecido', async () => {
    const { token: func } = await novoFuncionario('D3', '5521990230000');
    // Declara PDF mas envia bytes de PNG → magic-bytes falha → 400.
    const falso = 'data:application/pdf;base64,' + PNG_DATA_URI.split(',')[1];
    const r1 = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`)
      .send({ tipo: 'contrato', nome: 'x.pdf', arquivo: falso });
    expect(r1.status).toBe(400);
    // data URI não suportada (svg) → 400.
    const r2 = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`)
      .send({ tipo: 'contrato', nome: 'x', arquivo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
    expect(r2.status).toBe(400);
    // tipo fora do enum → 400 (Zod).
    const r3 = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${func}`)
      .send({ tipo: 'hackeado', nome: 'x.pdf', arquivo: PDF_DATA_URI });
    expect(r3.status).toBe(400);
  });

  it('posse: técnico não baixa/apaga documento de outro técnico da mesma empresa → 404', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'D4');
    const a = await criarFuncionarioComAcesso(request, app, dono, { telefone: '5521990240000' });
    const b = await criarFuncionarioComAcesso(request, app, dono, { telefone: '5521990250000' });
    const up = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ tipo: 'contrato', nome: 'b.pdf', arquivo: PDF_DATA_URI });
    expect(up.status).toBe(201);
    const docDeB = up.body.documento.id;

    expect(
      (
        await request(app)
          .get(`/api/me/documentos/${docDeB}/arquivo`)
          .set('Authorization', `Bearer ${a.token}`)
      ).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete(`/api/me/documentos/${docDeB}`)
          .set('Authorization', `Bearer ${a.token}`)
      ).status
    ).toBe(404);
    // A lista de A não enxerga o documento de B.
    const listaA = await request(app)
      .get('/api/me/documentos')
      .set('Authorization', `Bearer ${a.token}`);
    expect(listaA.body.documentos).toHaveLength(0);
  });

  it('multi-tenant: empresa B não acessa documento da empresa A → 404', async () => {
    const a = await novoFuncionario('Da', '5521990260000');
    const up = await request(app)
      .post('/api/me/documentos')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ tipo: 'contrato', nome: 'a.pdf', arquivo: PDF_DATA_URI });
    const docDeA = up.body.documento.id;
    const b = await novoFuncionario('Db', '5521990270000');
    expect(
      (
        await request(app)
          .get(`/api/me/documentos/${docDeA}/arquivo`)
          .set('Authorization', `Bearer ${b.token}`)
      ).status
    ).toBe(404);
  });

  it('RBAC: dono/gestor (sem tecnicoId) não acessa documentos → 403', async () => {
    const { token: dono } = await criarEmpresaComAdmin(request, app, 'D5');
    expect(
      (await request(app).get('/api/me/documentos').set('Authorization', `Bearer ${dono}`)).status
    ).toBe(403);
  });

  it('flag off: mesmo autenticado, os endpoints respondem 404', async () => {
    const { token: func } = await novoFuncionario('D6', '5521990280000');
    vi.resetModules();
    vi.stubEnv('DOCUMENTOS_ENABLED', '');
    const { criarApp: criarAppOff } = await import('../../src/app.js');
    const { app: appOff } = criarAppOff();
    try {
      expect(
        (await request(appOff).get('/api/me/documentos').set('Authorization', `Bearer ${func}`))
          .status
      ).toBe(404);
      const up = await request(appOff)
        .post('/api/me/documentos')
        .set('Authorization', `Bearer ${func}`)
        .send({ tipo: 'contrato', nome: 'x.pdf', arquivo: PDF_DATA_URI });
      expect(up.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
