import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';

// Mock parcial do gateway WhatsApp: evita envio real de OTP/mensagem (padrão de
// e2e_rbac_ponto.test.js).
vi.mock('../../src/services/whatsapp/gateway.js', async (orig) => ({
  ...(await orig()),
  enviarMensagem: vi.fn().mockResolvedValue(null),
}));

import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, criarFuncionarioComAcesso, prisma } from './helpers.js';

/**
 * F1 — teto de autoridade no RBAC. Cobre os 3 pontos de escrita de `Usuario.permissoes`/
 * `papel` sob `requirePermissao('usuarios','editar')`: PATCH /usuarios/:id (coberto no
 * commit original), POST /usuarios e POST /usuarios/convidar (gaps achados na revisão
 * independente — o ceiling/bloqueio de promoção a dono valia só para o PATCH).
 *
 * EV-060 — o teto acima só bloqueava atribuir/promover a `dono`. Um `gestor` com
 * `usuarios.editar` (concedido via override pelo dono — não é o preset padrão) podia
 * criar/convidar OUTRO `gestor` (papel igual ao seu) livremente, e o `PATCH`/`DELETE`
 * não tinham NENHUM teto de gestão cross-user: um gestor podia editar (inclusive
 * desativar) ou deletar QUALQUER usuário da empresa, incluindo o `dono`. Os testes desta
 * seção reproduzem cada um desses casos e travam a correção (`podeAtribuirPapel`/
 * `podeGerenciarUsuario`, já existentes em `services/permissoes.js` e já usadas
 * corretamente em `routes/tecnicos.js`, agora também em `admin.js`).
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

async function criarGestorComUsuariosEditar(request_, app_, tokenDono, sufixo) {
  const res = await request_(app_)
    .post('/api/usuarios')
    .set('Authorization', `Bearer ${tokenDono}`)
    .send({
      nome: `Gestor${sufixo}`,
      username: `gestor${sufixo}${Date.now()}`,
      senha: 'SenhaForte1!',
      papel: 'gestor',
      permissoes: { usuarios: { editar: true } },
    });
  expect(res.status).toBe(201);
  const login = await request_(app_)
    .post('/api/auth/login')
    .send({ username: res.body.username, password: 'SenhaForte1!' });
  expect(login.status).toBe(200);
  return { userId: res.body.id, token: login.body.token };
}

describe('F1-BYPASS — POST /usuarios escapava do teto de autoridade', () => {
  it('gestor com só usuarios.editar NÃO consegue criar outro usuário como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1Post');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PostDono');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({
        nome: 'Invasor',
        username: `invasor${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'dono',
      });

    expect(res.status).toBe(403);
  });

  it('gestor com só usuarios.editar NÃO consegue criar usuário com permissoes.financeiro.editar (que não possui)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1PostPerm');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PostPerm');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({
        nome: 'Novo Func',
        username: `novofunc${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
        permissoes: { financeiro: { editar: true } },
      });

    expect(res.status).toBe(201);
    expect(res.body.permissoesEfetivas?.financeiro?.editar).not.toBe(true);
  });

  it('regressão: dono continua podendo criar outro dono e conceder qualquer permissão', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1PostRegressao');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Segundo Dono',
        username: `segundodono${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'dono',
      });

    expect(res.status).toBe(201);
    expect(res.body.papel).toBe('dono');
  });
});

describe('F1-BYPASS — POST /usuarios/convidar escapava do teto de autoridade', () => {
  it('gestor com só usuarios.editar NÃO consegue convidar alguém como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1Convite');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'Convite');

    const res = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ email: `convidado${Date.now()}@teste.com`, papel: 'dono' });

    expect(res.status).toBe(403);
  });

  it('regressão: dono continua podendo convidar alguém como dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'F1ConviteRegressao');

    const res = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${A.token}`)
      .send({ email: `convidado${Date.now()}@teste.com`, papel: 'dono' });

    expect(res.status).toBe(200);
    expect(res.body.enviado).toBe(true);
  });
});

describe('EV-060 — POST /usuarios: gestor não pode criar outro gestor (par)', () => {
  it('gestor com só usuarios.editar NÃO consegue criar outro gestor', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PostGestor');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PostParGestor');

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({
        nome: 'Gestor Par',
        username: `gestorpar${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'gestor',
      });

    expect(res.status).toBe(403);
  });

  it('regressão: dono continua podendo criar gestor e funcionário', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PostDonoRegressao');

    const resGestor = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Gestor Legítimo',
        username: `gestorlegitimo${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'gestor',
      });
    expect(resGestor.status).toBe(201);
    expect(resGestor.body.papel).toBe('gestor');

    const resFunc = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Func Legítimo',
        username: `funclegitimo${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
      });
    expect(resFunc.status).toBe(201);
    expect(resFunc.body.papel).toBe('funcionario');
  });

  it('funcionário sem override NÃO consegue nem chegar no guard de papel (403 por falta de permissão de módulo)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PostFunc');
    const func = await criarFuncionarioComAcesso(request, app, A.token, { nome: 'FuncSemAcesso' });

    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${func.token}`)
      .send({
        nome: 'Invasor Func',
        username: `invasorfunc${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
      });

    expect(res.status).toBe(403);
  });
});

describe('EV-060 — POST /usuarios/convidar: gestor não pode convidar outro gestor (par)', () => {
  it('gestor com só usuarios.editar NÃO consegue convidar outro gestor', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60ConviteGestor');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'ConviteParGestor');

    const res = await request(app)
      .post('/api/usuarios/convidar')
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ email: `convidadopar${Date.now()}@teste.com`, papel: 'gestor' });

    expect(res.status).toBe(403);
  });
});

describe('EV-060 — PATCH /usuarios/:id: gestor não pode gerenciar par nem dono', () => {
  it('gestor NÃO consegue desativar outro gestor (par)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchParAtivo');
    const gestorAtacante = await criarGestorComUsuariosEditar(
      request,
      app,
      A.token,
      'PatchAtacante'
    );
    const resAlvo = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Gestor Alvo',
        username: `gestoralvo${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'gestor',
      });
    expect(resAlvo.status).toBe(201);

    const res = await request(app)
      .patch(`/api/usuarios/${resAlvo.body.id}`)
      .set('Authorization', `Bearer ${gestorAtacante.token}`)
      .send({ ativo: false });

    expect(res.status).toBe(403);
  });

  it('gestor NÃO consegue desativar o dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchDonoAtivo');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PatchDono');

    const res = await request(app)
      .patch(`/api/usuarios/${A.userId}`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ ativo: false });

    expect(res.status).toBe(403);
    const donoNoBanco = await prisma.usuario.findUnique({ where: { id: A.userId } });
    expect(donoNoBanco.ativo).toBe(true);
  });

  it('gestor NÃO consegue promover um funcionário a gestor (papel igual ao seu)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchPromoverPar');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PatchPromoverPar');
    await criarFuncionarioComAcesso(request, app, A.token, { nome: 'FuncParaPromover' });
    const funcUsuario = await prisma.usuario.findFirst({
      where: { empresaId: A.empresaId, nome: 'FuncParaPromover' },
    });

    const res = await request(app)
      .patch(`/api/usuarios/${funcUsuario.id}`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ papel: 'gestor' });

    expect(res.status).toBe(403);
  });

  it('regressão: gestor continua podendo editar um funcionário (nível abaixo do seu)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchFuncRegressao');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'PatchFuncRegressao');
    const resFunc = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Func Gerenciável',
        username: `funcgerenciavel${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
      });
    expect(resFunc.status).toBe(201);

    const res = await request(app)
      .patch(`/api/usuarios/${resFunc.body.id}`)
      .set('Authorization', `Bearer ${gestor.token}`)
      .send({ ativo: false });

    expect(res.status).toBe(200);
  });

  it('regressão: dono continua podendo promover funcionário a gestor e fazer downgrade depois', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchDonoPromoveDowngrade');
    const resFunc = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Func Promovível',
        username: `funcpromovivel${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'funcionario',
      });
    expect(resFunc.status).toBe(201);

    const resPromocao = await request(app)
      .patch(`/api/usuarios/${resFunc.body.id}`)
      .set('Authorization', `Bearer ${A.token}`)
      .send({ papel: 'gestor' });
    expect(resPromocao.status).toBe(200);
    expect(resPromocao.body.papel).toBe('gestor');

    const resDowngrade = await request(app)
      .patch(`/api/usuarios/${resFunc.body.id}`)
      .set('Authorization', `Bearer ${A.token}`)
      .send({ papel: 'funcionario' });
    expect(resDowngrade.status).toBe(200);
    expect(resDowngrade.body.papel).toBe('funcionario');
  });

  it('anti-IDOR: gestor de uma empresa tenta PATCH num usuário de OUTRA empresa → 404, nunca 403', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60PatchCrossTenantA');
    const B = await criarEmpresaComAdmin(request, app, 'EV60PatchCrossTenantB');
    const gestorA = await criarGestorComUsuariosEditar(request, app, A.token, 'CrossTenant');

    const res = await request(app)
      .patch(`/api/usuarios/${B.userId}`)
      .set('Authorization', `Bearer ${gestorA.token}`)
      .send({ ativo: false });

    expect(res.status).toBe(404);
  });
});

describe('EV-060 — DELETE /usuarios/:id: gestor não pode remover par nem dono (rota sem NENHUM teste antes)', () => {
  it('gestor NÃO consegue deletar o dono', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60DeleteDono');
    const gestor = await criarGestorComUsuariosEditar(request, app, A.token, 'DeleteDono');

    const res = await request(app)
      .delete(`/api/usuarios/${A.userId}`)
      .set('Authorization', `Bearer ${gestor.token}`);

    expect(res.status).toBe(403);
    const donoNoBanco = await prisma.usuario.findUnique({ where: { id: A.userId } });
    expect(donoNoBanco).not.toBeNull();
  });

  it('gestor NÃO consegue deletar outro gestor (par)', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60DeletePar');
    const gestorAtacante = await criarGestorComUsuariosEditar(
      request,
      app,
      A.token,
      'DeleteAtacante'
    );
    const resAlvo = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Gestor Alvo Delete',
        username: `gestoralvodelete${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'gestor',
      });
    expect(resAlvo.status).toBe(201);

    const res = await request(app)
      .delete(`/api/usuarios/${resAlvo.body.id}`)
      .set('Authorization', `Bearer ${gestorAtacante.token}`);

    expect(res.status).toBe(403);
  });

  it('regressão: dono continua podendo deletar um gestor ou funcionário', async () => {
    const A = await criarEmpresaComAdmin(request, app, 'EV60DeleteDonoRegressao');
    const resGestor = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${A.token}`)
      .send({
        nome: 'Gestor Removível',
        username: `gestorremovivel${Date.now()}`,
        senha: 'SenhaForte1!',
        papel: 'gestor',
      });
    expect(resGestor.status).toBe(201);

    const res = await request(app)
      .delete(`/api/usuarios/${resGestor.body.id}`)
      .set('Authorization', `Bearer ${A.token}`);

    expect(res.status).toBe(200);
    const noBanco = await prisma.usuario.findUnique({ where: { id: resGestor.body.id } });
    expect(noBanco).toBeNull();
  });
});
