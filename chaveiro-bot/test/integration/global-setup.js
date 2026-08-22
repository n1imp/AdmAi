import { execSync } from 'node:child_process';

/**
 * Aplica as migrations no banco de teste uma vez, antes de toda a suíte de
 * integração. Usa `prisma migrate deploy` (idempotente, não interativo).
 *
 * POR QUE `DIRECT_URL` É FIXADO AQUI  [SAFE-MIG-01]
 *   O CLI do Prisma NÃO herda a hermeticidade de `.env.test`. `prisma.config.ts` faz
 *   `import 'dotenv/config'` — que carrega o `.env`, não o `.env.test` — e resolve a conexão como
 *   `process.env.DIRECT_URL ?? process.env.DATABASE_URL`.
 *
 *   `.env.test` define `DATABASE_URL` e não define `DIRECT_URL`. Então bastava existir um `.env`
 *   com `DIRECT_URL` para o `migrate deploy` desta suíte mirar OUTRO banco — sem aviso, porque o
 *   `DATABASE_URL` do runtime continuava correto e os testes passavam normalmente.
 *
 *   E `DIRECT_URL` é, por desenho, onde mora a conexão DIRETA de produção (o pooler do Supabase
 *   não suporta os locks de migration). Ou seja, o caso ruim não é exótico: é o uso pretendido da
 *   variável. Num ambiente com `.env` de produção presente, `npm run test:integration` aplicaria
 *   migrations em PRODUÇÃO.
 *
 *   A garantia tem de viver no código, não na esperança de que um arquivo local não versionado
 *   esteja certo. Aqui o ambiente do subprocesso é montado explicitamente: a migration vai para o
 *   MESMO banco que os testes usam, e `DIRECT_URL` herdado é descartado.
 */
export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definido para os testes de integração (ver .env.test.example)'
    );
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    /* Sobrepõe `DIRECT_URL` em vez de apenas repassar `process.env`: repassar deixaria o valor
       vindo do `.env` intacto, que é exatamente o defeito. */
    env: { ...process.env, DIRECT_URL: process.env.DATABASE_URL },
  });
}
