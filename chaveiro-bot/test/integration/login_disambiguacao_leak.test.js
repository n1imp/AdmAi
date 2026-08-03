import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * EV-063 — Gate 1 (reprodução). Registra o comportamento ATUAL de `POST /auth/login`
 * antes de qualquer correção, para os cenários exigidos pela missão. Não assume o
 * relatório anterior como correto — cada caso abaixo bate na rota real.
 *
 * Nota importante descoberta nesta reprodução: `Usuario.telefone` ganhou `@unique`
 * global na missão anterior (EV-057, migration `20260803000000_usuario_telefone_unique`),
 * aplicada no banco de teste do CI via `prisma migrate deploy` (confirmado em
 * `.github/workflows/ci.yml`). Isso significa que a fixture "2 contas ATIVAS com o
 * MESMO telefone, em empresas diferentes" — o cenário central do vazamento original —
 * NÃO PODE MAIS ser criada via cadastro novo (a 2ª chamada de `/auth/register` com o
 * mesmo telefone falha com conflito de unicidade). O teste abaixo confirma isso
 * empiricamente (não por suposição) e documenta a implicação: o vazamento continua
 * sendo um bug de CÓDIGO real (a rota nunca verifica senha antes de decidir
 * desambiguação) — só não é mais reproduzível de ponta a ponta via HTTP nesta branch
 * para dado NOVO. Permanece um risco real para (a) qualquer banco em produção onde a
 * migration de unicidade ainda não tenha sido aplicada, e (b) qualquer dado legado
 * anterior à migration. A correção deste EV-063 deve continuar tratando o caso de N
 * candidatos corretamente, e é validada com candidatos construídos diretamente (não
 * via cadastro HTTP) no arquivo de testes pós-correção.
 */
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

describe('EV-063 Gate 1 — reprodução do estado atual de POST /auth/login', () => {
  it('telefone inexistente → 401 "Credenciais inválidas", sem vazamento', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone: '5511900000000', password: 'qualquercoisa' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('telefone existente, 1 conta, senha CORRETA → login normal (sessão emitida)', async () => {
    const telefone = '5511988887777';
    const A = await criarEmpresaComAdmin(request, app, 'Gate1SenhaOk');
    await prisma.usuario.update({ where: { id: A.userId }, data: { telefone } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaForte1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('telefone existente, 1 conta, senha INCORRETA → 401 "Credenciais inválidas"', async () => {
    const telefone = '5511977776666';
    const A = await criarEmpresaComAdmin(request, app, 'Gate1SenhaErrada');
    await prisma.usuario.update({ where: { id: A.userId }, data: { telefone } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaErrada999!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('usuário DESATIVADO — hoje revela "Usuário inativo" (401), diferente de "Credenciais inválidas" — achado de enumeração adicional', async () => {
    const telefone = '5511966665555';
    const A = await criarEmpresaComAdmin(request, app, 'Gate1Inativo');
    await prisma.usuario.update({
      where: { id: A.userId },
      data: { telefone, ativo: false },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaForte1!' });

    // Comportamento ATUAL (a corrigir): mensagem distinta revela que a conta existe.
    expect(res.status).toBe(401);
    expect(res.body.erro).toBe('Usuário inativo');
  });

  it('confirma empiricamente: Postgres agora BLOQUEIA 2 contas com o mesmo telefone (unique constraint da migration anterior)', async () => {
    const telefoneCompartilhado = '5511955554444';
    const A = await criarEmpresaComAdmin(request, app, 'Gate1MultiA');
    await prisma.usuario.update({
      where: { id: A.userId },
      data: { telefone: telefoneCompartilhado },
    });

    // Tenta criar uma 2ª empresa/dono com o MESMO telefone (o cenário original do
    // vazamento) — via update direto no banco (mais rápido que passar por todo o
    // fluxo de /auth/register, mas exercitando a MESMA constraint de unicidade).
    const B = await criarEmpresaComAdmin(request, app, 'Gate1MultiB');
    await expect(
      prisma.usuario.update({ where: { id: B.userId }, data: { telefone: telefoneCompartilhado } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
