/**
 * Helpers para os testes de integração (Supertest + Postgres real).
 *
 * Requer um banco de teste acessível via DATABASE_URL (ver .env.test / CI).
 * As migrations devem ter sido aplicadas antes (`prisma migrate deploy`), o que
 * o globalSetup faz uma vez por execução.
 */
import { prisma } from '../../src/db/prisma.js';

/** Apaga todos os dados das tabelas de negócio entre testes (ordem respeita FKs). */
export async function limparBanco() {
  // TRUNCATE ... CASCADE zera tudo e reseta identidades de uma vez.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ServicoMaterial","MovimentacaoEstoque","Pagamento","Avaliacao",
      "SessaoConversa","Notificacao","Servico","Material","Tecnico",
      "Usuario","EmpresaWhatsapp","Empresa"
    CASCADE;
  `);
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

export { prisma };
