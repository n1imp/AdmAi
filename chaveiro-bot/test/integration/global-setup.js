import { execSync } from 'node:child_process';

/**
 * Aplica as migrations no banco de teste uma vez, antes de toda a suíte de
 * integração. Usa `prisma migrate deploy` (idempotente, não interativo).
 */
export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definido para os testes de integração (ver .env.test.example)');
  }
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: process.env,
  });
}
