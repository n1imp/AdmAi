import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * LGPD — direito ao esquecimento. POST /api/lgpd/anonimizar-cliente deve remover a
 * PII do cliente (nome, telefone, comentário) dos serviços e avaliações DA EMPRESA,
 * preservando os registros financeiros, e nunca tocar dados de outra empresa.
 */
let app;
const TEL = '5511999998888';

beforeAll(() => {
  ({ app } = criarApp());
});
beforeEach(async () => {
  await limparBanco();
});
afterAll(async () => {
  await prisma.$disconnect();
});

async function criarTecnico(token, nome) {
  const res = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ nome, comissao: 10 });
  expect(res.status).toBe(201);
  return res.body;
}

async function criarServicoComCliente(token, empresaId, tecnicoNome) {
  const res = await request(app)
    .post('/api/servicos')
    .set('Authorization', `Bearer ${token}`)
    .send({ tecnico: tecnicoNome, local: 'Casa', descricao: 'Troca de fechadura', valorCobrado: 200 });
  expect(res.status).toBe(201);
  const servicoId = res.body.id;
  // A PII do cliente normalmente vem da conversa do bot; aqui setamos direto.
  await prisma.servico.update({
    where: { id: servicoId },
    data: { clienteNome: 'Cliente Teste', clienteTelefone: TEL },
  });
  await prisma.avaliacao.create({
    data: {
      empresaId,
      servicoId,
      clienteTelefone: TEL,
      clienteNome: 'Cliente Teste',
      comentario: 'Ótimo atendimento',
      status: 'respondida',
      agendadoPara: new Date(),
    },
  });
  return servicoId;
}

describe('LGPD: POST /api/lgpd/anonimizar-cliente', () => {
  it('anonimiza a PII do cliente nos serviços e avaliações da empresa', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    await criarTecnico(A.token, 'Téc A');
    const servicoId = await criarServicoComCliente(A.token, A.empresaId, 'Téc A');

    const res = await request(app)
      .post('/api/lgpd/anonimizar-cliente')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ telefone: TEL });

    expect(res.status).toBe(200);
    expect(res.body.servicosAnonimizados).toBeGreaterThanOrEqual(1);
    expect(res.body.avaliacoesAnonimizadas).toBeGreaterThanOrEqual(1);

    const servico = await prisma.servico.findUnique({ where: { id: servicoId } });
    expect(servico.clienteNome).toBeNull();
    expect(servico.clienteTelefone).toBeNull();

    const aval = await prisma.avaliacao.findUnique({ where: { servicoId } });
    expect(aval.clienteNome).toBeNull();
    expect(aval.clienteTelefone).toBe('');
    expect(aval.comentario).toBeNull();
  });

  it('não afeta dados de cliente de outra empresa (escopo por tenant)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'A');
    const B = await criarEmpresaComAdmin(request, app, 'B');
    await criarTecnico(B.token, 'Téc B');
    const servicoB = await criarServicoComCliente(B.token, B.empresaId, 'Téc B');

    // A anonimiza o MESMO telefone, mas o escopo (req.db) limita à empresa A.
    const res = await request(app)
      .post('/api/lgpd/anonimizar-cliente')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ telefone: TEL });
    expect(res.status).toBe(200);
    expect(res.body.servicosAnonimizados).toBe(0);

    // Os dados de B permanecem intactos.
    const servico = await prisma.servico.findUnique({ where: { id: servicoB } });
    expect(servico.clienteTelefone).toBe(TEL);
    expect(servico.clienteNome).toBe('Cliente Teste');
  });
});
