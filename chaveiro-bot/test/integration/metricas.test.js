/**
 * Teste de integração — equivalência de valor do GET /api/me/metricas após F3.1.
 *
 * F3.1 trocou 3 consultas `findMany(take:10000) + reduce` em JS por `aggregate`
 * (SUM/COUNT) no banco. Este teste prova, contra Postgres real e um dataset
 * semeado com valores conhecidos, que a resposta é idêntica — cobrindo os pontos
 * onde `aggregate` poderia divergir do reduce:
 *   - filtro de status (serviço "pendente" NÃO entra nas somas, mas conta em servicosPendentes);
 *   - filtro de mês (mesAtual só soma o mês corrente; "todos" soma tudo);
 *   - somatório multi-linha;
 *   - conjunto vazio → `_sum` retorna null → deve virar 0 (técnico sem serviços).
 *
 * Valores escolhidos inteiros de propósito: torna a asserção determinística e
 * isola a equivalência do somatório da dívida de `Float` (arredondamento — F4).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Evita envio real de OTP/WhatsApp ao criar acesso do técnico e no login.
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

/** Cria um técnico COM acesso e devolve { tecnicoId, tokenFunc } já com senha definitiva. */
async function criarFuncionarioComToken(tokenDono, { nome, telefone, comissao = 20 }) {
  const resTec = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${tokenDono}`)
    .send({ nome, telefone, comissao, criarAcesso: true });
  if (resTec.status !== 201)
    throw new Error(`criar técnico: ${resTec.status} ${JSON.stringify(resTec.body)}`);
  const tecnicoId = resTec.body.id;
  const pin = resTec.body.acesso.pin;

  const resLogin = await request(app).post('/api/auth/login').send({ telefone, password: pin });
  const resTroca = await request(app)
    .patch('/api/me/senha')
    .set('Authorization', `Bearer ${resLogin.body.token}`)
    .send({ senhaAtual: pin, novaSenha: 'NovaSenhaForte1!' });
  return { tecnicoId, tokenFunc: resTroca.body.token };
}

const servicoBase = { local: 'Local', descricao: 'Serviço', msgOriginal: 'm', remetenteWpp: 'w' };

describe('GET /api/me/metricas — equivalência de valor (aggregate no banco, F3.1)', () => {
  it('soma corretamente com filtros de status e mês contra dataset conhecido', async () => {
    const { token: tokenDono, empresaId } = await criarEmpresaComAdmin(request, app, 'Metricas');
    const { tecnicoId, tokenFunc } = await criarFuncionarioComToken(tokenDono, {
      nome: 'Func Métricas',
      telefone: '5521990000010',
    });

    const agora = new Date();
    const mesPassado = new Date('2020-01-15T12:00:00.000Z');
    await prisma.servico.createMany({
      data: [
        // Ativos no mês corrente → contam em tudo.
        {
          ...servicoBase,
          empresaId,
          tecnicoId,
          valorCobrado: 100,
          valorLiquido: 100,
          comissaoGerada: 20,
          status: 'ativo',
          criadoEm: agora,
        },
        {
          ...servicoBase,
          empresaId,
          tecnicoId,
          valorCobrado: 50,
          valorLiquido: 50,
          comissaoGerada: 10,
          status: 'ativo',
          criadoEm: agora,
        },
        // Ativo em mês antigo → conta em "todos", NÃO em mesAtual.
        {
          ...servicoBase,
          empresaId,
          tecnicoId,
          valorCobrado: 200,
          valorLiquido: 200,
          comissaoGerada: 40,
          status: 'ativo',
          criadoEm: mesPassado,
        },
        // Pendente → NÃO entra em soma nenhuma, só em servicosPendentes.
        {
          ...servicoBase,
          empresaId,
          tecnicoId,
          valorCobrado: 999,
          valorLiquido: 999,
          comissaoGerada: 999,
          status: 'pendente',
          criadoEm: agora,
        },
      ],
    });
    await prisma.pagamento.createMany({
      data: [
        { empresaId, tecnicoId, valor: 30 },
        { empresaId, tecnicoId, valor: 15 },
      ],
    });

    const res = await request(app)
      .get('/api/me/metricas')
      .set('Authorization', `Bearer ${tokenFunc}`);
    expect(res.status).toBe(200);
    // Somas esperadas (calculadas à mão sobre o seed) — devem bater com o SUM/COUNT do banco.
    expect(res.body.totalServicos).toBe(3); // 3 ativos (pendente excluído)
    expect(res.body.comissaoGanha).toBe(70); // 20 + 10 + 40
    expect(res.body.totalRecebido).toBe(45); // 30 + 15
    expect(res.body.saldoPendente).toBe(25); // 70 - 45
    expect(res.body.servicosPendentes).toBe(1);
    expect(res.body.mesAtual.receitaLiquida).toBe(150); // 100 + 50 (mês antigo fora)
    expect(res.body.mesAtual.comissao).toBe(30); // 20 + 10
  });

  it('conjunto vazio: _sum retorna null e a resposta zera (sem serviços/pagamentos)', async () => {
    const { token: tokenDono } = await criarEmpresaComAdmin(request, app, 'Vazio');
    const { tokenFunc } = await criarFuncionarioComToken(tokenDono, {
      nome: 'Func Vazio',
      telefone: '5521990000011',
    });

    const res = await request(app)
      .get('/api/me/metricas')
      .set('Authorization', `Bearer ${tokenFunc}`);
    expect(res.status).toBe(200);
    expect(res.body.totalServicos).toBe(0);
    expect(res.body.comissaoGanha).toBe(0);
    expect(res.body.totalRecebido).toBe(0);
    expect(res.body.saldoPendente).toBe(0);
    expect(res.body.servicosPendentes).toBe(0);
    expect(res.body.mesAtual.receitaLiquida).toBe(0);
    expect(res.body.mesAtual.comissao).toBe(0);
  });
});
