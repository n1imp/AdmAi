/**
 * Regressão executável do FOR UPDATE da rotação de refresh.  [Gate 6 · exigência do revisor]
 *
 * O harness comum (supertest + Promise.all) SERIALIZA transações e não isola concorrência —
 * então nenhum teste com Promise.all morde o TOCTOU. Este teste, ao contrário, cria a
 * concorrência de verdade com DUAS conexões: uma transação segura a linha do usuário com
 * `SELECT ... FOR UPDATE` e a mantém aberta; o `/auth/refresh` roda por outra conexão.
 *
 * COM o lock (`lockUsuario`) na rotação, o refresh BLOQUEIA no FOR UPDATE enquanto a linha está
 * travada — prova-se que ele espera. SEM o lock (sabotagem: remover `lockUsuario` da rotação em
 * auth.js), o refresh completa de imediato e este teste FALHA. É a regressão que protege a
 * correção central contra remoção silenciosa.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { limparBanco, prisma } from './helpers.js';

let app;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('rotação de refresh — lock da linha do usuário (regressão do FOR UPDATE)', () => {
  it('o refresh ESPERA enquanto a linha do usuário está travada por outra transação', async () => {
    await request(app).post('/api/setup').send({
      nome: 'Dona Lock',
      nomeEmpresa: 'Chaveiro Lock',
      username: 'donalock',
      senha: 'SenhaForte1!',
    });
    const usuario = await prisma.usuario.findFirst({ where: { username: 'donalock' } });
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'donalock', password: 'SenhaForte1!' });
    const cookie = login.headers['set-cookie'].find((c) => c.startsWith('refresh_token='));

    // Transação que SEGURA a linha do usuário travada até recebermos ordem de liberar.
    let liberar;
    const seguro = new Promise((r) => {
      liberar = r;
    });
    const txSeguro = prisma
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${usuario.id} FOR UPDATE`;
          /* Avança SÓ o corte (não toca os refreshToken) — assim a única coisa que faz o refresh
           esperar é o lock da LINHA DO USUÁRIO. Se apagássemos os refresh aqui, o refresh
           esperaria pelo lock daquelas linhas e o teste passaria mesmo sem lockUsuario (foi o
           que aconteceu na primeira versão). Sob READ COMMITTED, um SELECT comum NÃO bloqueia
           por FOR UPDATE: sem lockUsuario, a rotação lê o usuário (corte antigo, ainda não
           commitado) e completa; com lockUsuario, ela bloqueia até o commit. */
          await tx.usuario.update({
            where: { id: usuario.id },
            data: { tokenValidoApos: new Date() },
          });
          await seguro; // mantém a transação aberta (lock retido)
        },
        { timeout: 20000 }
      )
      .catch(() => {});

    await espera(400); // garante que o FOR UPDATE da txSeguro já foi adquirido

    // Dispara o refresh por OUTRA conexão, SEM await — com o lock, ele bloqueia aqui.
    const pRefresh = request(app).post('/api/auth/refresh').set('Cookie', cookie);
    const marcado = pRefresh.then((r) => ({ resolveu: true, status: r.status }));

    // Corrida: se o refresh resolver dentro de 800ms, ele NÃO esperou o lock (regressão).
    const veredito = await Promise.race([marcado, espera(800).then(() => ({ resolveu: false }))]);
    expect(veredito.resolveu, 'a rotação não esperou o lock da linha do usuário').toBe(false);

    // Libera a transação travada: ela commita (corte avançado + refresh apagados).
    liberar();
    await txSeguro;

    // Agora o refresh desbloqueia, relê o corte novo sob o lock e rejeita.
    const r = await pRefresh;
    expect(r.status).toBe(401);
  });
});
