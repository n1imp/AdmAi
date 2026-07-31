/**
 * Helpers para os testes de integração (Supertest + Postgres real).
 *
 * Requer um banco de teste acessível via DATABASE_URL (ver .env.test / CI).
 * As migrations devem ter sido aplicadas antes (`prisma migrate deploy`), o que
 * o globalSetup faz uma vez por execução.
 */
import { prisma } from '../../src/db/prisma.js';

/**
 * Apaga TODOS os dados entre testes, descobrindo as tabelas no catálogo do Postgres.
 *
 * Era uma lista fixa de 13 nomes para um schema com 26 modelos. Os que têm FK eram
 * alcançados pelo CASCADE, mas 6 sem FK nenhuma (AuditLog, ConviteUsuario,
 * AnaliseAvaliacoes, AvaliacaoGoogle, GoogleConta, ConexaoBot) sobreviviam a todo
 * `limparBanco` e acumulavam durante a suíte inteira e entre execuções locais. Uma lista
 * escrita à mão sempre volta a divergir do schema — por isso ela é a causa raiz, e não os
 * nomes que faltavam. Ler do catálogo mantém isto correto sozinho quando um modelo nasce.
 */
let _tabelas = null;

export async function limparBanco() {
  if (!_tabelas) {
    const linhas = await prisma.$queryRawUnsafe(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '\\_prisma%'
    `);
    _tabelas = linhas.map((l) => `"${l.tablename}"`);
  }
  if (_tabelas.length === 0) return;
  // CASCADE resolve a ordem das FKs. SEM `RESTART IDENTITY` de propósito: zerar as
  // sequences faz todo teste recriar o usuário com id 1, e os rate limiters com chave
  // por usuário (exclusaoContaLimiter) passam a somar no mesmo balde entre testes,
  // devolvendo 429 em cascata. Ids sempre crescentes mantêm cada teste isolado.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${_tabelas.join(',')} CASCADE;`);

  // Zera o estado dos rate limiters junto com o banco. Sem isto o balde do authLimiter
  // (janela de 15 min, chave = username) sobrevive à execução inteira e ao processo:
  // rodar a suíte duas vezes em menos de 15 min fazia o teste de login válido receber
  // 429 e falhar, e o teste de 429 passava por gordura acumulada, não pelo próprio laço.
  await limparRateLimiters();
}

/** Limpa as chaves de rate limit no Redis compartilhado pela app sob teste. */
async function limparRateLimiters() {
  try {
    const { redisClient } = await import('../../src/middlewares/rateLimiters.js');
    await redisClient.flushdb();
  } catch {
    // Sem Redis acessível o limiter já degrada sozinho; não é motivo para derrubar o setup.
  }
}

/**
 * Cria uma empresa + admin via a rota pública /api/setup OU /api/auth/register.
 * Usa register pois suporta múltiplas empresas (setup só funciona com banco vazio).
 * @returns {Promise<{ token: string, empresaId: number, userId: number }>}
 */
let _ipSeq = 0;
export async function criarEmpresaComAdmin(request, app, sufixo = '') {
  // IP único por empresa (trust proxy:1 → req.ip vem do X-Forwarded-For). Evita que o
  // rate limiter de /api/auth/register acumule entre testes e gere 429 espúrios — cada
  // empresa onboard é, de fato, um cliente distinto.
  const ip = `10.0.${Math.floor(++_ipSeq / 256) % 256}.${_ipSeq % 256}`;
  const res = await request(app)
    .post('/api/auth/register')
    .set('X-Forwarded-For', ip)
    .send({
      nome: `Admin${sufixo}`,
      nomeEmpresa: `Empresa ${sufixo || 'A'}`,
      username: `admin${sufixo}${Date.now().toString().slice(-5)}`,
      email: `admin${sufixo}${Date.now()}@teste.com`,
      // telefone agora é obrigatório no cadastro (identidade no robô de número único).
      telefone: '5511' + String(_ipSeq).padStart(9, '0'),
      senha: 'SenhaForte1!',
    });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar empresa/admin: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, empresaId: res.body.empresaId, userId: res.body.id };
}

/**
 * Cria um técnico COM acesso ao painel, faz login por telefone+PIN e troca a senha
 * provisória — devolvendo um FUNCIONÁRIO pronto (self-scope) para exercitar /me/*.
 * @returns {Promise<{ tecnicoId: number, token: string, telefone: string }>}
 */
export async function criarFuncionarioComAcesso(
  request,
  app,
  tokenDono,
  { nome = 'Func', telefone, comissao = 20 } = {}
) {
  const tel = telefone ?? '5521' + String(Date.now()).slice(-9);
  const resTec = await request(app)
    .post('/api/tecnicos')
    .set('Authorization', `Bearer ${tokenDono}`)
    .send({ nome, telefone: tel, comissao, criarAcesso: true });
  if (resTec.status !== 201) {
    throw new Error(`Falha ao criar técnico: ${resTec.status} ${JSON.stringify(resTec.body)}`);
  }
  const pin = resTec.body.acesso.pin;
  const resLogin = await request(app)
    .post('/api/auth/login')
    .send({ telefone: tel, password: pin });
  const resTroca = await request(app)
    .patch('/api/me/senha')
    .set('Authorization', `Bearer ${resLogin.body.token}`)
    .send({ senhaAtual: pin, novaSenha: 'NovaSenhaForte1!' });
  return { tecnicoId: resTec.body.id, token: resTroca.body.token, telefone: tel };
}

export { prisma };
