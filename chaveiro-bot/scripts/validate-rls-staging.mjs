/**
 * Validação da RLS contra o Supabase staging (F4-RLS.3) — NÃO-destrutivo.
 * Uso: node --env-file=.env.staging scripts/validate-rls-staging.mjs
 *
 * O isolamento das policies já é provado no CI (rls.test.js, Postgres). O que o CI NÃO
 * cobre é o POOLER do Supabase (Supavisor, transaction mode, 6543) — que é o que o runtime
 * usa. Aqui validamos o mecanismo do qual a RLS depende, EXATAMENTE como o app faz
 * (set_config local + query numa transação; sem SET ROLE/DDL, que o pooler nem aceita):
 *   1. autocommit, sem GUC → app.empresa_id vazio (fail-closed);
 *   2. dentro de um tx, set_config(local) → o GUC vale nas queries seguintes DO MESMO tx;
 *   3. depois do COMMIT, nova query → o GUC MORREU (local=true) e NÃO vaza para a próxima
 *      requisição na mesma conexão poolada — a propriedade de segurança crítica sob pooling.
 * Nada é criado/alterado no banco.
 */
import { Client } from 'pg';

const url = process.env.DATABASE_URL; // pooler 6543 (transaction mode) — o do runtime
if (!url) {
  console.error('DATABASE_URL ausente (use node --env-file=.env.staging).');
  process.exit(1);
}

const pg = new Client({ connectionString: url });
await pg.connect();

const leGuc = async () =>
  (await pg.query(`SELECT current_setting('app.empresa_id', true) AS g`)).rows[0].g;

let ok = false;
try {
  // 1) baseline fail-closed: sem GUC, current_setting devolve null/''.
  const base = await leGuc();

  // 2) dentro de uma transação, set_config(local=true) e lê no MESMO tx.
  await pg.query('BEGIN');
  await pg.query(`SELECT set_config('app.empresa_id', '42', true)`);
  const dentroTx = await leGuc();
  await pg.query('COMMIT');

  // 3) nova query (autocommit) após o COMMIT: o GUC local morreu → não vaza.
  const depoisTx = await leGuc();

  console.log(`1) sem GUC (baseline):        "${base ?? ''}"  (esperado vazio)`);
  console.log(
    `2) dentro do tx (set local):  "${dentroTx ?? ''}"  (esperado 42 — GUC carrega no tx pelo pooler)`
  );
  console.log(
    `3) apos COMMIT (nova conexao): "${depoisTx ?? ''}"  (esperado vazio — nao vaza entre requests)`
  );

  ok = (base ?? '') === '' && dentroTx === '42' && (depoisTx ?? '') === '';
  console.log(
    ok
      ? 'STAGING RLS-GUC OK — o mecanismo do set_config(local) carrega no tx e NAO vaza, atraves do pooler Supabase.'
      : 'STAGING RLS-GUC FALHOU — o pooler nao preserva/limpa o GUC como esperado.'
  );
} catch (e) {
  console.error('ERRO na validacao:', e.message);
} finally {
  await pg.end();
}
process.exit(ok ? 0 : 1);
