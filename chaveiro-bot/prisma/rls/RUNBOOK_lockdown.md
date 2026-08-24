# RUNBOOK — STG-SEC-RLS-01 lockdown (STAGING `admai-staging`)

Fecha o finding BLOQUEANTE: 26 tabelas `public` com RLS off + grants full de
`anon`/`authenticated` (Advisor `rls_disabled_in_public`, ERROR/EXTERNAL).

**Decisão D1** (Codex DECISOR, thread `01a03164`, CONCORDO — opção C ancorada em B):
`REVOKE` integral de `anon`/`authenticated`/`PUBLIC` em `public` **+** `ENABLE RLS`
(NO FORCE, sem policy) nas 26 tabelas do Prisma. `enable_rls.sql` (isolamento
inter-tenant) fica **intacto** — é outra missão.

> ⚠️ **SOMENTE STAGING** (ref `qsuufuulxfkkeasgxhcv`). Produção **não** é alvo;
> `PRODUCTION_RLS_STATE = UNKNOWN`. Todos os passos usam a conexão de staging.
> **Dependência:** exige o `DIRECT_URL` (session pooler, DB) do admai-staging e a
> anon key — enquanto ausentes, este artefato fica pronto no repo e a aplicação é
> `BLOCKED_CAPABILITY` (ver STG-02-USO no ledger).

Artefatos: `lockdown_public_access.sql` (fix), `verify_lockdown.sql` (pós-condições +
negative controls SQL, não-mutante), `../../scripts/staging-rls-negative-control.mjs`
(negative control PostgREST).

---

## 1. Preflight (inventário — não muta nada)

```bash
# Confirme que a conexão é a de STAGING (o ref precisa aparecer no host da URL):
echo "$STAGING_DIRECT_URL" | grep -q qsuufuulxfkkeasgxhcv || { echo "NAO e staging"; exit 1; }
PSQL() { psql "$STAGING_DIRECT_URL" --set ON_ERROR_STOP=1 "$@"; }
```

Rode e guarde a saída (evidência ANTES):

```sql
-- 26 tabelas do banco vs 26 models esperados
SELECT count(*) FROM pg_tables WHERE schemaname='public';
-- Owners das relações (define o FOR ROLE dos default privileges)
SELECT DISTINCT pg_get_userbyid(relowner) FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind IN ('r','p','v','m','f');
-- Policies preexistentes (o fix ABORTA se houver alguma nas 26)
SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public';
-- Runtime é BYPASSRLS? (o DATABASE_URL de runtime precisa ser BYPASSRLS p/ o app seguir)
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('postgres','authenticator','anon','authenticated','service_role');
-- Grants atuais de anon/authenticated (evidência ANTES — deve ter muita coisa)
SELECT grantee, count(*) FROM information_schema.role_table_grants
  WHERE table_schema='public' AND grantee IN ('anon','authenticated') GROUP BY grantee;
-- Publicações Realtime que tocam essas tabelas (efeito colateral esperado: anon perde realtime)
SELECT pubname, schemaname, tablename FROM pg_publication_tables WHERE schemaname='public';
```

**Negative control ANTES (prova que o controle morde):** com a anon key, mostre que
a exposição existe hoje —

```bash
node --env-file=<arquivo local com STAGING_SUPABASE_URL/ANON_KEY> \
  scripts/staging-rls-negative-control.mjs --expect-open
# Esperado: sensíveis (Usuario, RefreshToken, ...) respondem 200 => há o que fechar.
```

---

## 2. Aplicar o lockdown

```bash
PSQL -v staging_ref=qsuufuulxfkkeasgxhcv -f prisma/rls/lockdown_public_access.sql
```

Idempotente: reexecutar é inócuo. Aborta se faltar tabela ou se houver policy nas 26.

---

## 3. Verificação determinística (grupos 2–4 do D1)

```bash
PSQL -f prisma/rls/verify_lockdown.sql
```

Prova, tudo dentro de `BEGIN…ROLLBACK` (nada persiste):
- **A** 26/26 `relrowsecurity=true`, `relforcerowsecurity=false`;
- **B** privilégio **efetivo** (`has_*_privilege`, inclui PUBLIC e memberships) = zero
  para `anon`/`authenticated`/`PUBLIC` em tabelas/sequences/routines;
- **B2** schema sem USAGE p/ anon/authenticated e sem CREATE p/ PUBLIC;
- **C** defaults neutralizados (novos objetos não concedem a anon/auth/PUBLIC);
- **D** negative controls comportamentais (`SET LOCAL ROLE`): SELECT nas 26 +
  INSERT/UPDATE/DELETE em Usuario + EXECUTE → `insufficient_privilege`;
- **E** RLS deny-all independente do grant (mesmo com grant, RLS zera as linhas).

## 4. Negative control PostgREST DEPOIS (grupo 5)

```bash
node --env-file=<arquivo local> scripts/staging-rls-negative-control.mjs
# Esperado: TODAS as 26 negadas (401/403/404 — nunca 200 []); POST/PATCH/DELETE negados.
```

Confirme por SQL que nenhum canário foi criado pelo POST:

```sql
SELECT count(*) FROM public."Usuario" WHERE username LIKE '_negctl_%';  -- deve ser 0
```

## 5. Positive controls (grupo 6 — o app real segue funcionando)

- Prisma pelo `DATABASE_URL` de runtime lê/escreve normalmente (rode um smoke dentro
  de uma transação com rollback, ou o smoke do Express: login → consulta tenant →
  um CRUD representativo → caminho cross-tenant privilegiado).
- **Nenhum** teste deve depender de um `DATABASE_URL_APP` NOBYPASSRLS nesta missão.

## 6. Fechamento (grupo 7)

- Reexecutar o **Supabase Security Advisor**: zero `rls_disabled_in_public` nas 26.
- Registrar evidências ANTES/DEPOIS (grants, RLS flags, negative controls) no ledger.
- `git diff --check` limpo.
- **Codex REVISOR** (conversa nova) sobre o diff aplicado + resultados.

`STG-SEC-RLS-01` só fecha com: proteção existe **+** negative control morde **+**
fluxo normal do backend funciona.

---

## Rollback (operacional)

Um rollback **nunca** restaura grants de `anon`/`authenticated` (D1). Em regressão do
app por RLS, desabilite RLS mantendo os revokes (a exposição externa segue fechada):

```sql
DO $$ DECLARE t text; modelos text[] := ARRAY[/* as 26 */]; BEGIN
  FOREACH t IN ARRAY modelos LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', t); END LOOP;
END $$;
```

## Restrição herdada (gate)

Enquanto RLS estiver ligada nas 26 **sem policies**, **não** aponte `DATABASE_URL_APP`
para um role `NOBYPASSRLS` — ele ficaria deny-all (inclusive com `RLS_ENABLED=false`,
que só configura o GUC, não desliga RLS). Trocar o role de runtime exige antes a matriz
completa de policies/testes para todos os caminhos `req.db` (inclui Empresa e Usuario);
o `enable_rls.sql` atual não satisfaz esse gate.
