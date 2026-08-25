# STG_SEC_RLS_SUPABASE_ADMIN_CAPABILITY_DIAGNOSIS

**Data:** 2026-08-24 · **HEAD de partida:** `c630677` · **Finding:** STG-SEC-RLS-01 →
`BLOCKED_CAPABILITY(DEFAULT_PRIVILEGES_SUPABASE_ADMIN)` · **Decisão D1:** Codex DECISOR thread
`01a035ce` (CONCORDO) · **Alvo:** `admai-staging`/`qsuufuulxfkkeasgxhcv` (produção PROIBIDA)

## ROOT_CAUSE (provado)

O apply externo do lockdown v1 (aprovado, congelado) abortou **fail-closed por design** em
`ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` com **rollback total comprovado**
(0/26 RLS; `PARTIAL_LOCKDOWN=NO`). Causa: a cláusula de criadores do DELTA2
(`defaclrole` com namespace global/`public`) puxou `supabase_admin` — **role gerenciado pela
plataforma** com default ACLs reais em `public` (TABLES ALL-like, SEQUENCES rwU, FUNCTIONS
EXECUTE, concedendo a `postgres`/`anon`/`authenticated`/`service_role` — provisionamento padrão do
Supabase hosted). `ALTER DEFAULT PRIVILEGES FOR ROLE X` exige ser X ou membro de X; o `postgres`
gerenciado **não é membro** de `supabase_admin`. Não é falha do RLS, não é drift, não é migration:
é **pós-condição de segurança esperada × role de provider × executor sem authority**.

## Evidência de relevância do supabase_admin (repo, determinística)

- **Zero** ocorrências de `supabase_admin` em todo o repositório.
- **Toda** DDL do AdmAi executa como `postgres.<ref>` (Prisma `migrate deploy` via `DIRECT_URL`;
  executor externo A-prime idem). Migrations futuras = `postgres`.
- Logo os defaults de `supabase_admin` **não participam do ciclo de DDL do AdmAi** — só entram no
  threat model se a **plataforma** criar objetos novos em `public` como `supabase_admin` (raro,
  fora do nosso controle): tais objetos nasceriam com grants a `anon`/`authenticated` e (tabela
  nova, RLS off) expostos via PostgREST.

## CURRENT × FUTURE (separação obrigatória)

- **CURRENT_OBJECT_EXPOSURE:** 100% fechável pelo executor `postgres` (REVOKEs em objetos
  existentes/colunas/sequences/routines + schema + RLS 26 + ADP dos criadores administráveis).
- **FUTURE_OBJECT_EXPOSURE:** fechável para os criadores reais do AdmAi (`postgres`); **inexequível
  na origem** para `supabase_admin` (sem authority, sem credencial, sem `SET ROLE`, sem canal de
  cliente demonstrado com autoridade superior — Supabase Support = capacidade externa fora de banda).

## Queries READ-ONLY para o executor fechar o modelo de capability

```sql
SELECT current_user, session_user;
SELECT pg_has_role(current_user,'supabase_admin','MEMBER') AS member_capability,
       pg_has_role(current_user,'supabase_admin','USAGE')  AS usage_capability;
SELECT roleid::regrole::text, member::regrole::text FROM pg_auth_members
 WHERE roleid='supabase_admin'::regrole OR member='postgres'::regrole;
SELECT rolname, rolsuper, rolcreaterole, rolbypassrls FROM pg_roles
 WHERE rolname IN ('postgres','supabase_admin','authenticator','service_role');
SELECT nspowner::regrole::text AS schema_owner, nspacl FROM pg_namespace WHERE nspname='public';
SELECT rolname, has_schema_privilege(rolname,'public','USAGE') AS usage_public,
       has_schema_privilege(rolname,'public','CREATE') AS create_public
FROM pg_roles ORDER BY rolname;
```

(Esperado: `member_capability=false`; `rolsuper=true` em `supabase_admin` **não** confere authority
ao executor. Nota do Decisor: a generalização "SQL Editor/Management API sempre roda como postgres"
NÃO está provada — se esses canais forem usados, capturar `current_user/session_user` neles.)

## SECURITY ACCEPTANCE MATRIX

| Property | Current State | Required | Capability | Resolution |
|---|---|---|---|---|
| Existing table grants (anon/auth/PUBLIC) | expostos | closed | ✅ postgres | v2 REVOKE (inalterado do v1) |
| Existing column grants | idem | closed | ✅ | v2 REVOKE ALL cobre colunas |
| Existing sequences | idem | closed | ✅ | v2 REVOKE |
| Existing routines | EXECUTE via PUBLIC | closed | ✅ | v2 REVOKE |
| Schema CREATE (PUBLIC) | aberto | closed | ✅ | v2 REVOKE CREATE |
| RLS 26 tables | off | enabled / NO FORCE / 0 policies | ✅ | v2 (inalterado) |
| `postgres` defaults | concedem a anon/auth | closed | ✅ (é o current_user) | v2 ADP |
| `supabase_admin` defaults | **concedem a anon/auth** | closed **ou irrelevantes por prevenção** | ❌ no canal atual | exceção HARD-ASSERT + **choke point de USAGE** torna-os inócuos; correção na origem = `BLOCKED_CAPABILITY_NON_BLOCKING` (provider) |
| New future tables (criadas por postgres) | n/a | nascem fechadas | ✅ | ADP de postgres |
| New future tables (criadas pela plataforma como supabase_admin) | nasceriam expostas | **inacessíveis a anon/auth** | ✅ via schema | **D-forte**: sem `USAGE` no schema, grant de objeto não dá acesso |
| New future routines | idem | idem | ✅ | idem |
| `service_role` | Storage em uso | **preservado** | ✅ | nada revogado dele; `USAGE` re-grantado e ASSERT=true |

## CODEX_D1_DECISION (thread `01a035ce`, CONCORDO, confiança ALTA)

**B + D-detectivo + D-forte ajustado.** Artefatos **v2** (v1 permanece congelado):

1. Fecha todos os objetos atuais (idêntico ao v1).
2. Neutraliza defaults de **todos os criadores administráveis**.
3. **Única exceção tolerada** no ADP: `supabase_admin` — com **hard-assert** (qualquer OUTRO role
   não-administrável ⇒ rollback) e WARNING detalhado (role, namespace, objtype, grantee,
   privilégio) — nunca PASS silencioso.
4. **Choke point preventivo**: `REVOKE USAGE ON SCHEMA public FROM PUBLIC` +
   **snapshot/regrant atômico**: captura o `USAGE` efetivo de todos os roles ANTES; re-concede
   somente aos roles atuais que o perderam, **exceto `anon`/`authenticated`**; compara
   before/after (nenhum role não-alvo pode regredir); **aborta** se `anon`/`authenticated`
   retiverem `USAGE` efetivo (inclusive por membership — sem tocar memberships).
5. Com o choke point, defaults residuais de `supabase_admin` **deixam de produzir exposição**
   (grant de objeto sem `USAGE` de schema = inacessível). A correção dos defaults na origem vira
   higiene: **`BLOCKED_CAPABILITY_NON_BLOCKING`** (exige provider/Supabase Support).
6. Detecção obrigatória (não-contínua — rodar após migration/extension/feature e antes de release):
   baseline de **todo** o inventário real de `public` (26 + `_prisma_migrations`); relação fora da
   baseline, sem RLS ou com grants aos alvos ⇒ FAIL.

**NEGATIVE_PROOF vinculante (canário):** em transação, criar tabela (RLS off) + sequence + function
em `public` e conceder **deliberadamente** privilégios máximos a `anon`/`authenticated`/`PUBLIC`;
provar que os grants de objeto existem mas `SET LOCAL ROLE anon/authenticated` recebe `42501` por
falta de `USAGE` — a mesma condição adversarial que os defaults de `supabase_admin` produziriam,
sem impersonar o role.

**RESIDUAL_RISK (nomeado):** superuser do provider pode re-grantar `USAGE` a PUBLIC/anon (trust
boundary do Supabase — nenhum controle in-tenant resiste ao superuser do provider); roles de
plataforma FUTUROS nascem sem `USAGE` (fail-closed — feature nova pode falhar fechada até regrant
explícito); detecção não é contínua.

**MONITORAMENTO (ação vinculante — REVISOR DELTA-2):** o choke point protege contra defaults FUTUROS
de objetos do `supabase_admin`, **mas** um futuro `GRANT USAGE ON SCHEMA public` (a PUBLIC/anon/
authenticated), mudança de memberships de `anon`/`authenticated`, ou drift equivalente **reabre o
caminho**. Mitigação operacional: **re-rodar `verify_lockdown_v2.sql` após qualquer alteração de
grants/roles no schema `public` do staging** — a parte **B2v2** já falha (fail-closed) se
PUBLIC/anon/authenticated readquirirem `USAGE`. Como a detecção não é contínua, agendar a re-verify
como parte da rotina de mudança de schema/roles.

**ARTIFACT_CHANGE_REQUIRED: YES → CONCLUÍDO** — `lockdown_public_access_v2.sql`,
`verify_lockdown_v2.sql`, `apply-rls-lockdown-v2.mjs`. **REVISOR: APROVADO.**
- DECISOR `01a035ce` (CONCORDO, ALTA) → REVISOR v2 (5 achados, corrigidos em `dcff6a1`) → REVISOR
  DELTA (2 achados residuais) → correções em `c61ca07` → **REVISOR DELTA-2 `01a03654-0eb4-7ea1-97f3-f85e5794b02b` = APROVADO** (sem regressão: `c61ca07^ == dcff6a1`, 3 congelados byte-idênticos,
  choke point preservado, `service_role` USAGE intacto). Write set `STG-SEC-RLS-V2-REV2`
  OBSERVED_SUBSET.
- **Ainda ABERTO**: falta a evidência real de staging (apply + verify + negative control
  anon/authenticated + Advisor + smoke `service_role`/Storage) — `BLOCKED_CAPABILITY` por
  credenciais ausentes. `LOCAL_PROOF != STAGING_PROOF`.

**EXTERNAL_CAPABILITY_REQUIRED:** para fechar o boundary com v2 — **nenhuma** além do executor
staging atual; para remover os defaults de `supabase_admin` na origem — **SIM** (ação privilegiada
do provider/Supabase Support ou canal futuro com autoridade comprovada).
