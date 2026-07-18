/**
 * Teste de integração — paginação keyset (cursor) de GET /api/servicos (F3.5).
 *
 * Prova, contra Postgres real:
 *   - lotes sequenciais por cursor cobrem TODAS as linhas, na ordem (criadoEm desc, id desc),
 *     sem duplicata nem pulo;
 *   - o DESEMPATE por id funciona (dois serviços com o mesmo criadoEm);
 *   - `total` continua sendo a contagem cheia (não o restante);
 *   - cursor malformado → 400;
 *   - o caminho OFFSET legado (sem cursor) usa a MESMA ordem estável.
 *
 * Os ids são capturados do create() — o teste não depende dos valores da sequência.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

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

const sBase = {
  local: 'L',
  descricao: 'S',
  msgOriginal: 'm',
  remetenteWpp: 'w',
  status: 'ativo',
  valorCobrado: 100,
  valorMaterial: 0,
  valorLiquido: 100,
  comissaoGerada: 0,
};

describe('GET /api/servicos — paginação keyset (F3.5)', () => {
  it('percorre tudo por cursor sem dup/pulo, com desempate por id', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'Keyset');
    const tec = await prisma.tecnico.create({ data: { empresaId, nome: 'Tec K', comissao: 0 } });

    // 'b' e 'c' têm o MESMO criadoEm (empate) — 'c' é criado depois → id maior.
    const datas = {
      a: new Date('2024-06-01T10:00:00.000Z'),
      b: new Date('2024-06-03T10:00:00.000Z'),
      c: new Date('2024-06-03T10:00:00.000Z'),
      d: new Date('2024-06-04T10:00:00.000Z'),
      e: new Date('2024-06-05T10:00:00.000Z'),
    };
    const criados = [];
    for (const k of ['a', 'b', 'c', 'd', 'e']) {
      const row = await prisma.servico.create({
        data: { ...sBase, empresaId, tecnicoId: tec.id, criadoEm: datas[k] },
      });
      criados.push({ id: row.id, criadoEm: datas[k].getTime() });
    }
    // Verdade-base: ordem (criadoEm desc, id desc).
    const esperado = [...criados]
      .sort((x, y) => y.criadoEm - x.criadoEm || y.id - x.id)
      .map((r) => r.id);

    // Percorre por cursor, limit=2.
    let cursor;
    const coletados = [];
    for (let i = 0; i < 10; i++) {
      const url = cursor
        ? `/api/servicos?limit=2&cursor=${encodeURIComponent(cursor)}`
        : '/api/servicos?limit=2';
      const res = await request(app).get(url).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(5); // contagem cheia, sempre
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      coletados.push(...res.body.data.map((s) => s.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(coletados).toEqual(esperado); // ordem correta, cobertura total
    expect(new Set(coletados).size).toBe(5); // sem duplicata
  });

  it('cursor malformado → 400', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'KeysetBad');
    const res = await request(app)
      .get('/api/servicos?cursor=not_a_valid_cursor')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('OFFSET legado (sem cursor) usa a mesma ordem estável', async () => {
    const { token, empresaId } = await criarEmpresaComAdmin(request, app, 'KeysetOffset');
    const tec = await prisma.tecnico.create({ data: { empresaId, nome: 'Tec O', comissao: 0 } });
    const datas = [
      new Date('2024-06-01T10:00:00.000Z'),
      new Date('2024-06-03T10:00:00.000Z'),
      new Date('2024-06-03T10:00:00.000Z'),
    ];
    const criados = [];
    for (const d of datas) {
      const row = await prisma.servico.create({
        data: { ...sBase, empresaId, tecnicoId: tec.id, criadoEm: d },
      });
      criados.push({ id: row.id, criadoEm: d.getTime() });
    }
    const esperado = [...criados]
      .sort((x, y) => y.criadoEm - x.criadoEm || y.id - x.id)
      .map((r) => r.id);
    const res = await request(app)
      .get('/api/servicos?page=1&limit=100')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((s) => s.id)).toEqual(esperado);
  });
});
