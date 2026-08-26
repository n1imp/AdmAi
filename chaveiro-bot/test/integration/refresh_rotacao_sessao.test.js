/**
 * Teste de integração: rotação de refresh token e morte de sessão.  [GAP-AUTH-01]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   `POST /api/auth/refresh` está implementado desde sempre e nenhuma suíte de integração o
 *   tocava. O acceptance sweep dos P0 pegou isso: `auth.test.js` cobre setup, login 200/401,
 *   bruteforce e token ausente/inválido — e para aí. Renovação e expiração, que são a superfície
 *   mais exercitada do produto depois do login, não tinham prova nenhuma.
 *
 * A PROPRIEDADE QUE IMPORTA — e ela é de segurança, não de conveniência
 *   O endpoint ROTACIONA: apaga o token usado e emite outro. Rotação só vale se o token velho
 *   MORRER. Um refresh que renova mas não invalida o anterior transforma um vazamento único de
 *   cookie em acesso permanente, porque o atacante renova indefinidamente a partir da cópia.
 *
 * CONTROLE POSITIVO ANTES DO NEGATIVO
 *   O primeiro caso prova que a renovação legítima FUNCIONA. Sem ele, um endpoint quebrado que
 *   recusasse tudo passaria em todos os casos negativos e a suíte pareceria rigorosa. É a mesma
 *   armadilha que o harness já documentou: um sistema que remove tudo passa nos testes de
 *   segurança por acidente.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
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

/**
 * Faz login e devolve o cookie de refresh junto do token.
 *
 * O cookie é lido do `set-cookie` da resposta em vez de montado à mão: montá-lo exigiria conhecer
 * o formato interno, e o teste passaria a provar a minha reimplementação em vez do produto.
 */
async function logar(credenciais) {
  const res = await request(app).post('/api/auth/login').send(credenciais);
  expect(res.status).toBe(200);
  const cookies = res.headers['set-cookie'] ?? [];
  const refresh = cookies.find((c) => c.startsWith('refresh_token='));
  return { token: res.body.token, cookieRefresh: refresh?.split(';')[0] ?? null };
}

async function criarAdminLogado() {
  const admin = await criarEmpresaComAdmin(request, app);
  const usuario = await prisma.usuario.findUnique({ where: { id: admin.userId } });
  /* O contrato real de `/auth/login` e `{ username | telefone | usuarioId, password }` — nao
     `identificador`/`senha`, que foi o que eu supus na primeira versao e rendeu 400 em 11 casos. */
  const sessao = await logar({ username: usuario.username, password: 'SenhaForte1!' });
  return { ...admin, usuario, ...sessao };
}

describe('Refresh token: rotação e morte de sessão', () => {
  it('CONTROLE POSITIVO: refresh válido renova e devolve um token novo', async () => {
    const { cookieRefresh } = await criarAdminLogado();
    expect(cookieRefresh).toBeTruthy();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(20);
  });

  it('CONTROLE POSITIVO: o token renovado é aceito numa rota autenticada', async () => {
    const { cookieRefresh } = await criarAdminLogado();
    const renovado = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${renovado.body.token}`);

    expect(res.status).toBe(200);
  });

  it('ROTAÇÃO: o refresh usado NÃO funciona uma segunda vez', async () => {
    const { cookieRefresh } = await criarAdminLogado();

    const primeira = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);
    expect(primeira.status).toBe(200);

    /* O mesmo cookie de novo. Se isto passar, a rotação é decorativa: um cookie vazado renderia
       acesso indefinido. */
    const segunda = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    expect(segunda.status).toBe(401);
  });

  it('ROTAÇÃO: a renovação emite um cookie DIFERENTE do usado', async () => {
    const { cookieRefresh } = await criarAdminLogado();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);
    const novo = (res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0];

    expect(novo).toBeTruthy();
    expect(novo).not.toBe(cookieRefresh);
  });

  it('ROTAÇÃO: um registro é trocado por outro, sem derrubar as demais sessões', async () => {
    const { cookieRefresh, userId } = await criarAdminLogado();
    const antes = await prisma.refreshToken.findMany({ where: { usuarioId: userId } });

    /* O usuário tem MAIS de um refresh: `register` emite um e `login` emite outro. São duas sessões
       legítimas, e a primeira versão deste caso afirmava `toHaveLength(1)` — media a contagem em vez
       da propriedade, e falhou contra o comportamento correto do produto. */
    expect(antes.length).toBeGreaterThanOrEqual(1);

    await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    const depois = await prisma.refreshToken.findMany({ where: { usuarioId: userId } });
    const idsAntes = new Set(antes.map((r) => r.id));
    const idsDepois = new Set(depois.map((r) => r.id));

    /* Exatamente um sai e exatamente um entra: rotação, não acúmulo nem faxina geral. */
    const sairam = [...idsAntes].filter((id) => !idsDepois.has(id));
    const entraram = [...idsDepois].filter((id) => !idsAntes.has(id));
    expect(sairam).toHaveLength(1);
    expect(entraram).toHaveLength(1);
    expect(depois).toHaveLength(antes.length);
  });

  it('SESSÃO EXPIRADA: refresh vencido é recusado', async () => {
    const { cookieRefresh, userId } = await criarAdminLogado();

    /* Envelhece o registro em vez de esperar: a propriedade sob teste é a comparação com `agora`,
       e o relógio não precisa participar dela. */
    await prisma.refreshToken.updateMany({
      where: { usuarioId: userId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    expect(res.status).toBe(401);
  });

  it('SESSÃO EXPIRADA: o registro vencido não é reaproveitado depois', async () => {
    const { cookieRefresh, userId } = await criarAdminLogado();
    await prisma.refreshToken.updateMany({
      where: { usuarioId: userId },
      data: { expiraEm: new Date(Date.now() - 60_000) },
    });

    await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);
    const segunda = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    expect(segunda.status).toBe(401);
  });

  it('USUÁRIO INATIVO: refresh válido de conta desativada é recusado', async () => {
    const { cookieRefresh, userId } = await criarAdminLogado();
    await prisma.usuario.update({ where: { id: userId }, data: { ativo: false } });

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);

    expect(res.status).toBe(401);
  });

  it('sem cookie de refresh → 401', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('cookie de refresh inexistente no banco → 401', async () => {
    await criarAdminLogado();
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=nao-existe-em-lugar-nenhum');
    expect(res.status).toBe(401);
  });

  it('LOGOUT: invalida o refresh, e o cookie guardado não renova mais', async () => {
    const { cookieRefresh } = await criarAdminLogado();

    const saida = await request(app).post('/api/auth/logout').set('Cookie', cookieRefresh);
    expect(saida.status).toBe(200);

    const res = await request(app).post('/api/auth/refresh').set('Cookie', cookieRefresh);
    expect(res.status).toBe(401);
  });

  it('ISOLAMENTO: o refresh de um usuário não renova a sessão de outro', async () => {
    const a = await criarAdminLogado();
    const b = await criarAdminLogado();

    const res = await request(app).post('/api/auth/refresh').set('Cookie', a.cookieRefresh);
    expect(res.status).toBe(200);

    /* O token devolvido tem de ser do usuário A. Sem esta asserção, a renovação poderia devolver
       sessão de qualquer um e os casos acima continuariam verdes. */
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(a.userId);
    expect(me.body.id).not.toBe(b.userId);
  });
});
