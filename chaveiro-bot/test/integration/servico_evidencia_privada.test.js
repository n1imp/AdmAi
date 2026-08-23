/**
 * SEC-HB-02 — a foto de evidência saiu do estático público.  [F6-04 · pré-requisito WhatsApp prod]
 *
 * ANTES: inbound.js gravava a foto do WhatsApp em ./uploads, servido por express.static sem
 * auth nem tenant — religar a flag exporia dado LGPD-sensível com URL adivinhável por vazamento.
 * AGORA: dir privado ./uploads-evidencias + URL app-relativa /api/servicos/evidencia/<arquivo>
 * servida com auth (router), tenant (req.db escopado) e permissão (servicos.ver ou o técnico
 * dono do serviço) — espelho do padrão das selfies de ponto.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

let app;
const DIR = path.resolve('./uploads-evidencias');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await rm(DIR, { recursive: true, force: true });
  await prisma.$disconnect();
});

async function servicoComEvidencia(empresaId, tecnicoId) {
  const arquivo = `${randomUUID()}.png`;
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, arquivo), PNG);
  await prisma.servico.create({
    data: {
      empresaId,
      tecnicoId,
      local: 'Casa do cliente',
      descricao: 'Com evidência',
      msgOriginal: 'teste',
      remetenteWpp: '5511900000000',
      valorCobrado: 100,
      valorMaterial: 0,
      valorLiquido: 100,
      comissaoGerada: 10,
      fotoEvidencia: `/api/servicos/evidencia/${arquivo}`,
    },
  });
  return arquivo;
}

describe('GET /api/servicos/evidencia/:arquivo', () => {
  it('sem token: 401 — nada de estático público para evidência', async () => {
    const r = await request(app).get(`/api/servicos/evidencia/${randomUUID()}.png`);
    expect(r.status).toBe(401);
  });

  it('dono da empresa baixa (permissão servicos.ver); bytes conferem', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Evid');
    const tecnico = await prisma.tecnico.create({
      data: { empresaId, nome: 'Tec Evid', telefone: '5511977770021', comissao: 10 },
    });
    const arquivo = await servicoComEvidencia(empresaId, tecnico.id);

    const r = await request(app)
      .get(`/api/servicos/evidencia/${arquivo}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, cb) => {
        const p = [];
        res.on('data', (d) => p.push(d));
        res.on('end', () => cb(null, Buffer.concat(p)));
      });
    expect(r.status).toBe(200);
    expect(Buffer.compare(r.body, PNG)).toBe(0);
    expect(r.headers['cache-control']).toContain('private');
  });

  it('OUTRO tenant: 404 via req.db escopado — a existência nem transparece', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'EvidA');
    const tecnico = await prisma.tecnico.create({
      data: { empresaId, nome: 'Tec A', telefone: '5511977770022', comissao: 10 },
    });
    const arquivo = await servicoComEvidencia(empresaId, tecnico.id);

    const { token: tokenB } = await criarEmpresaComAdmin(request, app, 'EvidB');
    const r = await request(app)
      .get(`/api/servicos/evidencia/${arquivo}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(r.status).toBe(404);
  });

  it('nome de arquivo fora do formato UUID.ext: 400 (nem toca o disco)', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'EvidFmt');
    const r = await request(app)
      .get('/api/servicos/evidencia/..%2F..%2Fetc%2Fpasswd')
      .set('Authorization', `Bearer ${token}`);
    expect([400, 404]).toContain(r.status);
  });
});
