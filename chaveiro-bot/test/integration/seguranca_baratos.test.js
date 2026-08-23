/**
 * F6-03 — os fechamentos baratos do backlog de hardening, cada um com a prova que morde.
 *
 *   SEC-HB-01  aceite de convite concorrente elege UM vencedor (updateMany condicional na tx);
 *   SEC-HB-03  PATCH ancora a mutação no papel lido (regressão: fluxo legítimo intacto);
 *   SEC-HB-07  criarAcessoTecnico recusa papel 'dono' internamente;
 *   SEC-HB-11  200 intermediário (desafio 2FA) CONTA no rate limit — martelar o ramo pré-2FA
 *              esbarra no teto de 5 como qualquer senha errada.
 *   (SEC-HB-06 tem regressão própria: a matriz 402 inteira roda sobre req.db.assinatura já
 *   escopado; SEC-HB-14 é bump de lockfile com EDE prévio.)
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { generate } from 'otplib';
import { criarApp } from '../../src/app.js';
import { criarAcessoTecnico } from '../../src/services/credenciais.js';
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

describe('SEC-HB-01 — corrida no aceite de convite', () => {
  it('duas aceitações do MESMO token em paralelo: um 201, um 404, UM usuário criado', async () => {
    const { empresaId } = await criarEmpresaComAdmin(request, app, 'Corrida');
    const token = randomBytes(24).toString('hex');
    await prisma.conviteUsuario.create({
      data: {
        empresaId,
        email: 'corrida@teste.com',
        papel: 'funcionario',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiraEm: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const aceitar = (username) =>
      request(app)
        .post(`/api/convite/${token}/aceitar`)
        .send({ nome: 'Convidada', username, senha: 'SenhaForte1!' });
    const [r1, r2] = await Promise.all([aceitar('convidada_a'), aceitar('convidada_b')]);

    const statuses = [r1.status, r2.status].sort();
    // Sob o TOCTOU antigo, ambos seriam 201. A defesa tem DUAS camadas: o unique de e-mail
    // (P2002→409) costuma pegar o perdedor primeiro; o consumo condicional pega o resto.
    expect(statuses[0]).toBe(201);
    expect([404, 409]).toContain(statuses[1]);
    const criados = await prisma.usuario.count({ where: { email: 'corrida@teste.com' } });
    expect(criados).toBe(1);
    // E o convite terminou CONSUMIDO exatamente uma vez.
    const convites = await prisma.conviteUsuario.findMany({
      where: { email: 'corrida@teste.com' },
    });
    expect(convites).toHaveLength(1);
    expect(convites[0].aceitoEm).not.toBeNull();
  });
});

describe('SEC-HB-03 — regressão do fluxo legítimo com a âncora de papel', () => {
  it('dono altera papel e desativa normalmente (a âncora só mata a janela de corrida)', async () => {
    const { token } = await criarEmpresaComAdmin(request, app, 'Ancora');
    const criado = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ nome: 'Alvo Ancora', username: `ancora${Date.now()}`, senha: 'SenhaForte1!' });
    expect(criado.status).toBe(201);

    const troca = await request(app)
      .patch(`/api/usuarios/${criado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ papel: 'funcionario' });
    expect(troca.status).toBe(200);

    const desativa = await request(app)
      .patch(`/api/usuarios/${criado.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ativo: false });
    expect(desativa.status).toBe(200);

    const apaga = await request(app)
      .delete(`/api/usuarios/${criado.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 204]).toContain(apaga.status);
  });
});

describe('SEC-HB-07 — criarAcessoTecnico não confia no chamador', () => {
  it("papel 'dono' é recusado pela própria função", async () => {
    await expect(
      criarAcessoTecnico({ tecnico: { id: 1 }, empresaId: 1, papel: 'dono' })
    ).rejects.toThrow(/dono/);
  });
});

describe('SEC-HB-11 — desafio 2FA conta como tentativa', () => {
  it('6º login de usuário 2FA (todos 200-desafio) esbarra no teto: 429', async () => {
    // Conta com TOTP ativo montada por dentro (o loop completo já tem arquivo próprio).
    const setup = await request(app).post('/api/setup').send({
      nome: 'Dona Teto',
      nomeEmpresa: 'Chaveiro Teto',
      username: 'donateto',
      senha: 'SenhaForte1!',
    });
    const token = setup.body.token;
    const { body: s } = await request(app)
      .post('/api/me/2fa/setup')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const codigo = await generate({ secret: s.secret }).then((r) =>
      typeof r === 'string' ? r : (r?.token ?? r?.otp)
    );
    await request(app)
      .post('/api/me/2fa/ativar')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo });

    const logar = () =>
      request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', '10.99.0.1')
        .send({ username: 'donateto', password: 'SenhaForte1!' });

    for (let i = 1; i <= 5; i++) {
      const r = await logar();
      expect(r.status).toBe(200);
      expect(r.body.twoFactorRequerido).toBe(true); // intermediário — e agora CONTA
    }
    const sexto = await logar();
    // Antes do fix: skipSuccessfulRequests via statusCode deixava martelar sem teto.
    expect(sexto.status).toBe(429);
  });
});
