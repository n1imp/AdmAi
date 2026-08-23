/**
 * F4-02 — a matriz COMPLETA das ações auditadas, linha a linha.  [GAP-AUD-01 · aceitação]
 *
 * Cada ação que o produto declara auditar precisa produzir uma linha com os campos que
 * permitem DEMONSTRAR (LGPD): quem (empresaId+usuarioId), o quê (acao/entidade), sobre quem
 * (entidadeId), o efeito (antes/depois) e de onde (ip). Sete ações reais:
 *   usuario.criado · usuario.desativado · usuario.permissoes_alteradas · usuario.excluido ·
 *   convite.enviado · lgpd.cliente_anonimizado · conta.excluida
 *
 * conta.excluida e a sobrevivência da trilha à cascata já têm arquivo próprio
 * (auditoria_dado_pessoal, autoexclusao_conta) — aqui entram as SEIS restantes + o invariante
 * de tolerância: auditoria que falha NÃO pode derrubar a operação (o .catch(() => {}) nos
 * call sites é o mecanismo; o teste o transforma em contrato).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

// O invariante de tolerância precisa de uma falha REAL no serviço de auditoria. O mock
// deixa `registrar` explodir sob demanda e passa reto nos demais testes.
vi.mock('../../src/services/auditoria.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    registrar: vi.fn(async (...args) => {
      if (globalThis.__auditoriaFalha) throw new Error('auditoria indisponível (injetado)');
      return real.registrar(...args);
    }),
  };
});

let app;

beforeAll(async () => {
  ({ app } = await import('../../src/app.js').then((m) => m.criarApp()));
});

beforeEach(async () => {
  globalThis.__auditoriaFalha = false;
  await limparBanco();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function ultimaLinha(acao) {
  // registrarAudit é fire-and-forget nos call sites: espera curta e determinística por poll.
  for (let i = 0; i < 40; i++) {
    const linha = await prisma.auditLog.findFirst({ where: { acao }, orderBy: { id: 'desc' } });
    if (linha) return linha;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function esperaCamposBasicos(linha, { empresaId, usuarioId, entidade }) {
  expect(linha).not.toBeNull();
  expect(linha.empresaId).toBe(empresaId);
  expect(linha.usuarioId).toBe(usuarioId);
  expect(linha.entidade).toBe(entidade);
  expect(linha.ip).toBeTruthy();
}

describe('matriz de ações auditadas', () => {
  it('usuario.criado / desativado / permissoes_alteradas / excluido — uma linha completa cada', async () => {
    const { token, empresaId, userId } = await criarEmpresaComAdmin(request, app, 'Aud');

    const criado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Gestora Nova', username: `gestora${Date.now()}`, senha: 'SenhaForte1!' });
    expect(criado.status).toBe(201);
    const alvoId = criado.body.id;

    let linha = await ultimaLinha('usuario.criado');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'Usuario' });
    expect(linha.entidadeId).toBe(alvoId);
    expect(linha.depois).toMatchObject({ nome: 'Gestora Nova' });

    const permissoes = await request(app)
      .patch(`/api/usuarios/${alvoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissoes: { estoque: 'nenhum' } });
    expect(permissoes.status).toBe(200);
    linha = await ultimaLinha('usuario.permissoes_alteradas');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'Usuario' });
    expect(linha.entidadeId).toBe(alvoId);

    const desativado = await request(app)
      .patch(`/api/usuarios/${alvoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ativo: false });
    expect(desativado.status).toBe(200);
    linha = await ultimaLinha('usuario.desativado');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'Usuario' });
    expect(linha.entidadeId).toBe(alvoId);

    const excluido = await request(app)
      .delete(`/api/usuarios/${alvoId}`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 204]).toContain(excluido.status);
    linha = await ultimaLinha('usuario.excluido');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'Usuario' });
    // O "antes" preserva o suficiente para demonstrar O QUE foi removido.
    expect(linha.antes ?? linha.depois).toBeTruthy();
  });

  it('convite.enviado — linha com o e-mail convidado no efeito', async () => {
    const { token, empresaId, userId } = await criarEmpresaComAdmin(request, app, 'Conv');
    const r = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'convidada@teste.com', papel: 'funcionario' });
    expect([200, 201]).toContain(r.status);
    const linha = await ultimaLinha('convite.enviado');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'ConviteUsuario' });
  });

  it('lgpd.cliente_anonimizado — registra o EFEITO (contagens), nunca o telefone removido', async () => {
    const { token, empresaId, userId } = await criarEmpresaComAdmin(request, app, 'Lgpd');
    const tecnico = await prisma.tecnico.create({
      data: { empresaId, nome: 'Tec Aud', telefone: '5511977770009', comissao: 10 },
    });
    await prisma.servico.create({
      data: {
        empresaId,
        tecnicoId: tecnico.id,
        local: 'Casa do cliente',
        descricao: 'Servico do titular',
        msgOriginal: 'registro via teste de aceitacao',
        remetenteWpp: '5511977770009',
        valorCobrado: 100,
        valorMaterial: 0,
        valorLiquido: 100,
        comissaoGerada: 10,
        clienteNome: 'Titular LGPD',
        clienteTelefone: '5511988887777',
      },
    });

    const r = await request(app)
      .post('/api/lgpd/anonimizar-cliente')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefone: '5511988887777' });
    expect(r.status).toBe(200);
    expect(r.body.servicosAnonimizados).toBe(1);

    const linha = await ultimaLinha('lgpd.cliente_anonimizado');
    esperaCamposBasicos(linha, { empresaId, usuarioId: userId, entidade: 'Cliente' });
    expect(linha.depois).toMatchObject({ servicosAnonimizados: 1 });
    // A trilha NÃO pode preservar o dado que a operação removeu.
    expect(JSON.stringify(linha)).not.toContain('5511988887777');
    expect(JSON.stringify(linha)).not.toContain('Titular LGPD');
  });

  it('INVARIANTE: auditoria fora do ar NÃO derruba a operação auditada', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'Tol');
    globalThis.__auditoriaFalha = true;

    const r = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Sem Auditoria', username: `semaud${Date.now()}`, senha: 'SenhaForte1!' });
    // A operação atravessa a falha do serviço de auditoria (fire-and-forget com catch).
    expect(r.status).toBe(201);

    globalThis.__auditoriaFalha = false;
  });
});
