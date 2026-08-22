/**
 * Teste de integração: `/health` diz a verdade sobre o estado da aplicação.  [GAP-OBS-01]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   `/health` não tinha teste nenhum. Nenhum. E é o endpoint de que mais coisa depende sem pedir
 *   licença: o `HEALTHCHECK` do Dockerfile decide com ele se o container está vivo, e o compose
 *   decide com ele se sobe o que depende do bot. Um `/health` que responda 200 enquanto o banco
 *   está fora faz o orquestrador manter no ar um processo que não atende ninguém — e ninguém é
 *   avisado, porque o sinal de "está tudo bem" é exatamente o que quebrou.
 *
 *   O critério de aceitação da observabilidade é "erro em produção é detectável sem acesso ao
 *   banco". Quem opera não abre o Postgres para saber se o Postgres caiu; olha o health.
 *
 * O RAMO QUE IMPORTA É O DEGRADADO, e é o que nunca roda sozinho
 *   Em teste o banco está sempre de pé, então o caminho 200 se exercita à toa e o caminho 503 não
 *   se exercita nunca. Aqui o `$queryRaw` é derrubado de propósito para forçar o `catch` — sem
 *   isso o teste provaria só que "quando está tudo bem, diz que está tudo bem", que é a metade
 *   inútil da garantia.
 *
 *   CONTROLE POSITIVO PRIMEIRO: antes de afirmar que a falha é detectada, provo que a saúde é
 *   reportada. Um endpoint que respondesse 503 sempre passaria no teste de degradação sozinho.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import { criarApp } from '../../src/app.js';
import { prisma } from '../../src/db/prisma.js';

let app;
let estado;

beforeAll(() => {
  ({ app, estado } = criarApp());
});

afterEach(() => {
  vi.restoreAllMocks();
  estado.isShuttingDown = false;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('/health [GAP-OBS-01]', () => {
  it('CONTROLE POSITIVO: com o banco de pé responde 200 e diz que o banco está ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('ok');
  });

  it('reporta uptime e timestamp — o operador precisa saber HÁ QUANTO TEMPO está assim', async () => {
    const res = await request(app).get('/health');

    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThan(0);
    /* Um timestamp que não é data válida é pior que nenhum: parece informação e não é. */
    expect(Number.isNaN(Date.parse(res.body.timestamp))).toBe(false);
  });

  it('não exige autenticação — o orquestrador não tem credencial', async () => {
    const res = await request(app).get('/health');

    /* Se o `/health` passasse a exigir sessão, o HEALTHCHECK do Dockerfile receberia 401, trataria
       como container morto e reiniciaria em laço uma aplicação saudável. */
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('BANCO FORA: responde 503 e marca database=error, sem derrubar a resposta', async () => {
    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('error');
    /* O endpoint tem de RESPONDER a falha, não falhar junto: 500 ou timeout aqui diria "o app
       morreu" quando o que morreu foi o banco, e são incidentes diferentes. */
  });

  it('DESLIGANDO: responde 503 com shutting_down, e não tenta falar com o banco', async () => {
    const consulta = vi.spyOn(prisma, '$queryRaw');
    estado.isShuttingDown = true;

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('shutting_down');
    /* Durante o shutdown o pool já pode estar fechando. Consultar aqui transformaria um
       desligamento ordenado em erro de conexão no log, escondendo o motivo real do 503. */
    expect(consulta).not.toHaveBeenCalled();
  });

  it('os três estados são DISTINGUÍVEIS entre si', async () => {
    const saudavel = await request(app).get('/health');

    vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection refused'));
    const degradado = await request(app).get('/health');

    estado.isShuttingDown = true;
    const desligando = await request(app).get('/health');

    /* Dois 503 com a mesma causa aparente mandariam o operador investigar a coisa errada:
       "desligando" é esperado num deploy, "degraded" é incidente. */
    const marcas = [saudavel.body.status, degradado.body.status, desligando.body.status];
    expect(new Set(marcas).size).toBe(3);
  });
});
