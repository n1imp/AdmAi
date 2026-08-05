import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

/**
 * EV-063 — vazamento de informações em `POST /auth/login` antes da autenticação.
 *
 * Histórico: o Gate 1 desta missão reproduziu o comportamento ATUAL (sem correção)
 * e confirmou, via CI real: (a) o ramo de telefone com múltiplos candidatos devolvia
 * `desambiguacao` (nomes de empresa + `usuarioId`) SEM checar senha nenhuma; (b) os
 * ramos de `username`/`usuarioId` revelavam mensagens distintas ("Usuário inativo",
 * "Esta conta usa login social...") para contas existentes, diferente do "Credenciais
 * inválidas" de uma conta inexistente/senha errada — uma segunda forma de enumeração,
 * não estava no relatório original do EV-063 mas cai na mesma regra arquitetural.
 *
 * A correção (`services/auth.js:autenticarCandidatos`) unifica todos os casos de falha
 * pré-autenticação numa única resposta (`401 Credenciais inválidas`), e só revela a
 * lista de desambiguação DEPOIS de a senha ter sido comprovada contra os candidatos.
 *
 * Nota de reprodutibilidade: `Usuario.telefone` ganhou `@unique` global na missão
 * anterior (migration aplicada no banco de teste via `prisma migrate deploy` no CI) —
 * não é mais possível criar 2 contas ATIVAS com o mesmo telefone via cadastro real
 * nesta branch. O cenário de N candidatos é testado diretamente na função pura
 * (`src/services/__tests__/auth.test.js`, `describe('autenticarCandidatos (EV-063)')`),
 * não aqui — este arquivo cobre o que É reproduzível via HTTP real.
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

describe('EV-063 — POST /auth/login não revela nada antes da autenticação', () => {
  it('telefone inexistente → 401 "Credenciais inválidas"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone: '5511900000000', password: 'qualquercoisa' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('telefone existente, senha CORRETA → login normal (sessão emitida)', async () => {
    const telefone = '5511988887777';
    const A = await criarEmpresaComAdmin(request, app, 'Gate5SenhaOk');
    await prisma.usuario.update({ where: { id: A.userId }, data: { telefone } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaForte1!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('telefone existente, senha INCORRETA → 401 "Credenciais inválidas"', async () => {
    const telefone = '5511977776666';
    const A = await criarEmpresaComAdmin(request, app, 'Gate5SenhaErrada');
    await prisma.usuario.update({ where: { id: A.userId }, data: { telefone } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaErrada999!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('CORRIGIDO — login por telefone de usuário desativado, senha CORRETA → 401 genérico, não "Usuário inativo"', async () => {
    const telefone = '5511966665555';
    const A = await criarEmpresaComAdmin(request, app, 'Gate5InativoTelefone');
    await prisma.usuario.update({
      where: { id: A.userId },
      data: { telefone, ativo: false },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ telefone, password: 'SenhaForte1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('CORRIGIDO — login por username de usuário desativado, senha CORRETA → 401 genérico, não "Usuário inativo"', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'Gate5InativoUsername');
    await prisma.usuario.update({ where: { id: A.userId }, data: { ativo: false } });
    const usuarioAntes = await prisma.usuario.findUnique({ where: { id: A.userId } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: usuarioAntes.username, password: 'SenhaForte1!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('CORRIGIDO — login por username de conta social, qualquer senha → 401 genérico, não "Esta conta usa login social"', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'Gate5Social');
    await prisma.usuario.update({ where: { id: A.userId }, data: { senhaHash: null } });
    const usuarioAntes = await prisma.usuario.findUnique({ where: { id: A.userId } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: usuarioAntes.username, password: 'qualquercoisa' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('username inexistente → mesma resposta genérica de senha errada (sem distinguir "não existe" de "senha errada")', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'usuario-que-nao-existe-' + Date.now(), password: 'qualquercoisa' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('seleção de empresa APÓS autenticação bem-sucedida continua funcionando via usuarioId + senha', async () => {
    // Simula a segunda etapa do fluxo multi-empresa: o painel, de posse do
    // `usuarioId` (só revelado depois de já ter provado a senha, quando N>1), faz uma
    // 2ª chamada de login já mirando a conta escolhida. Aqui validamos que essa 2ª
    // chamada (por usuarioId) continua exigindo e validando a senha normalmente.
    const A = await criarEmpresaComAdmin(request, app, 'Gate5SelecaoPosAuth');

    const resOk = await request(app)
      .post('/api/auth/login')
      .send({ usuarioId: A.userId, password: 'SenhaForte1!' });
    expect(resOk.status).toBe(200);
    expect(resOk.body).toHaveProperty('token');

    const resErrada = await request(app)
      .post('/api/auth/login')
      .send({ usuarioId: A.userId, password: 'SenhaErrada!' });
    expect(resErrada.status).toBe(401);
    expect(resErrada.body).toEqual({ erro: 'Credenciais inválidas' });
  });

  it('rate limiter (authLimiter/authIpLimiter) continua aplicado ao endpoint após a correção', async () => {
    const telefone = '5511944443333';
    const A = await criarEmpresaComAdmin(request, app, 'Gate5RateLimit');
    await prisma.usuario.update({ where: { id: A.userId }, data: { telefone } });

    let ultimaResposta;
    for (let i = 0; i < 6; i += 1) {
      ultimaResposta = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.99.99.99')
        .send({ telefone, password: 'SenhaErrada!' });
    }
    expect(ultimaResposta.status).toBe(429);
  });

  it('confirma que Postgres continua bloqueando 2 contas ativas com o mesmo telefone (defesa em profundidade da migration anterior)', async () => {
    const telefoneCompartilhado = '5511955554444';
    const A = await criarEmpresaComAdmin(request, app, 'Gate5MultiA');
    await prisma.usuario.update({
      where: { id: A.userId },
      data: { telefone: telefoneCompartilhado },
    });

    const B = await criarEmpresaComAdmin(request, app, 'Gate5MultiB');
    await expect(
      prisma.usuario.update({ where: { id: B.userId }, data: { telefone: telefoneCompartilhado } })
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
