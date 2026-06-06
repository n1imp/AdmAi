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
    RESTART IDENTITY CASCADE;
  `);
}

/**
 * Cria uma empresa + admin via a rota pública /api/setup OU /api/auth/register.
 * Usa register pois suporta múltiplas empresas (setup só funciona com banco vazio).
 * @returns {Promise<{ token: string, empresaId: number, userId: number }>}
 */
export async function criarEmpresaComAdmin(request, app, sufixo = '') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      nome: `Admin${sufixo}`,
      nomeEmpresa: `Empresa ${sufixo || 'A'}`,
      username: `admin${sufixo}${Date.now().toString().slice(-5)}`,
      email: `admin${sufixo}${Date.now()}@teste.com`,
      senha: 'SenhaForte1!',
    });
  if (res.status !== 201) {
    throw new Error(`Falha ao criar empresa/admin: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, empresaId: res.body.empresaId, userId: res.body.id };
}

export { prisma };
