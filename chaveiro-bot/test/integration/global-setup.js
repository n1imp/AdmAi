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
/* COMPLEMENTO AO SAFE-MIG-01 [SEC-HB — stall de 2026-08-27, root cause provado]:
 * fixar `DIRECT_URL := DATABASE_URL` era seguro no caso local (55432, conexão direta),
 * mas sob `validate:staging` o DATABASE_URL é o POOLER TRANSACTION (6543) do Supabase —
 * e `prisma migrate deploy` através de pgbouncer em transaction mode TRAVA para sempre
 * nos locks (observado: 3s de CPU em 50min, datasource "...pooler...:6543", zero
 * atividade no servidor). O invariante do SAFE-MIG-01 continua valendo: a migration só
 * pode ir para o MESMO banco dos testes. A regra agora prova essa igualdade em vez de
 * forçá-la pela troca cega de URL:
 *   - usa `DIRECT_URL` do ambiente SOMENTE se for provadamente o mesmo banco que
 *     `DATABASE_URL` (mesmo username, mesmo dbname, mesmo hostname OU ambos na família
 *     pooler.supabase.com) e não estiver na porta 6543;
 *   - senão, mantém `DATABASE_URL` (caso local: conexão já é direta);
 *   - e se a escolha FINAL ainda for porta 6543, falha ALTO imediatamente — um erro em
 *     1s é diagnosticável; um hang de 50min não. */
export function escolherUrlDeMigracao(env = process.env) {
  const runtime = new URL(env.DATABASE_URL);
  let escolhida = env.DATABASE_URL;
  if (env.DIRECT_URL) {
    try {
      const direta = new URL(env.DIRECT_URL);
      const mesmoBanco =
        direta.username === runtime.username &&
        direta.pathname === runtime.pathname &&
        (direta.hostname === runtime.hostname ||
          (/(^|\.)pooler\.supabase\.com$/.test(direta.hostname) &&
            /(^|\.)pooler\.supabase\.com$/.test(runtime.hostname)));
      if (mesmoBanco && direta.port !== '6543') escolhida = env.DIRECT_URL;
    } catch {
      /* DIRECT_URL malformada ⇒ descartada (mesmo efeito do SAFE-MIG-01 original) */
    }
  }
  if (new URL(escolhida).port === '6543') {
    throw new Error(
      'migrations através do pooler TRANSACTION (porta 6543) travam nos locks do Prisma — ' +
        'forneça um DIRECT_URL do MESMO banco (porta 5432/direta) para os testes de integração.'
    );
  }
  return escolhida;
}

export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL não definido para os testes de integração (ver .env.test.example)'
    );
  }

  const urlDeMigracao = escolherUrlDeMigracao();
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    /* Ambos fixados na URL escolhida: `prisma.config.ts` resolve DIRECT_URL ?? DATABASE_URL,
       e qualquer valor herdado de um `.env` alheio é descartado (defeito original do SAFE-MIG-01). */
    env: { ...process.env, DATABASE_URL: urlDeMigracao, DIRECT_URL: urlDeMigracao },
  });
}
