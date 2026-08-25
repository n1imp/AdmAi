# STG-SEC-RLS-01 — Handoff `READY_FOR_EXTERNAL_APPLY`

> ## ⚠️ SUPERSEDED PELO v2 (2026-08-24) — NÃO aplicar os artefatos v1 deste handoff
>
> O apply real do **v1** abortou fail-closed (rollback total) em `ALTER DEFAULT PRIVILEGES FOR
> ROLE supabase_admin` — o `postgres` do Supabase hosted não tem authority sobre defaults do role
> de plataforma. Reaplicar o v1 abortará de novo no mesmo ponto. **Fluxo operacional vigente = v2**
> (D1 thread `01a035ce`; diagnóstico em `STG_SEC_RLS_SUPABASE_ADMIN_CAPABILITY_DIAGNOSIS.md`):
>
> 1. `node scripts/apply-rls-lockdown-v2.mjs` — aplica `prisma/rls/lockdown_public_access_v2.sql`
>    (exceção hard-assert p/ `supabase_admin` + **choke point**: `REVOKE USAGE ON SCHEMA public
>    FROM PUBLIC` com snapshot/regrant atômico exceto `anon`/`authenticated`) e roda
>    `verify_lockdown_v2.sql` (A/A2/B/B2v2/C/D/E/F-canário/G-baseline).
> 2. `staging-rls-negative-control.mjs` — matriz `anon` sempre; gate `authenticated-unprivileged`
>    exige `STAGING_AUTHENTICATED_JWT` (obrigatório para fechar).
> 3. Positive controls: Prisma/Express CRUD + **Storage via `service_role`** (smoke obrigatório).
> 4. Security Advisor: zero `rls_disabled_in_public` nas 26.
> 5. Defaults do `supabase_admin` na origem: `BLOCKED_CAPABILITY_NON_BLOCKING` (provider/Support).
> 6. **MONITORAR** (REVISOR DELTA-2): re-rodar `verify_lockdown_v2.sql` após qualquer `GRANT USAGE ON
>    SCHEMA public` / mudança de membership de `anon`/`authenticated` — reabriria o caminho; a parte
>    B2v2 falha fail-closed se readquirirem `USAGE`.
>
> **Status do v2: APROVADO** — DECISOR `01a035ce` + REVISOR (5 achados → `dcff6a1`) + REVISOR DELTA-2
> `01a03654` (2 achados → `c61ca07`) = APROVADO; sem regressão; v1 congelado intacto. Repo
> `READY_FOR_EXTERNAL_APPLY`; finding **ABERTO** até os gates reais de staging.
>
> Os artefatos v1 abaixo permanecem como registro histórico congelado (hashes válidos).

**Estado:** o patch de segurança está **pronto, aprovado (Codex REVISOR) e re-provado localmente**;
falta **apenas a aplicação no staging real**, que depende de credenciais ausentes. Isto **não é
PASS** — o finding `STG-SEC-RLS-01` permanece **ABERTO** até os gates reais de staging passarem.

Não modificar a solução. Este documento é o pacote de aplicação externa (§51).

## A. Projeto alvo (staging — nunca produção)

- **Supabase project ref:** `qsuufuulxfkkeasgxhcv` (`admai-staging`, ACTIVE_HEALTHY).
- Produção é **outro** projeto; `PRODUCTION_RLS_STATE = UNKNOWN`; **não** tocar/inspecionar produção.

## B/C. Artefatos versionados (com hash `git hash-object` @ HEAD `405d5cf`)

| Artefato | Papel | Hash |
| --- | --- | --- |
| `chaveiro-bot/prisma/rls/lockdown_public_access.sql` | o fix (REVOKE + RLS no-force) | `09e2f51e` |
| `chaveiro-bot/prisma/rls/verify_lockdown.sql` | pós-condições + negative controls SQL (não-mutante) | `54f6d4af` |
| `chaveiro-bot/scripts/apply-rls-lockdown.mjs` | wrapper de aplicação (guard vinculado à conexão) | `499d9fe4` |
| `chaveiro-bot/scripts/staging-rls-negative-control.mjs` | negative control PostgREST (anon key) | `53b324b3` |
| `chaveiro-bot/prisma/rls/RUNBOOK_lockdown.md` | runbook (preflight + 7 grupos de teste + rollback) | `c19874922` |

`chaveiro-bot/prisma/rls/enable_rls.sql` (isolamento inter-tenant) **fica intacto** — outra missão.

## D. Pós-condições esperadas (verify)

- As **26** tabelas de `public` com `relrowsecurity=true` e `relforcerowsecurity=false`.
- `anon`/`authenticated`/`PUBLIC` **sem privilégio efetivo** (tabela **e coluna**, sequences, routines).
- `PUBLIC` sem `CREATE` no schema; `anon`/`authenticated` sem grant **direto** de schema.
- Zero policies nas 26 (RLS deny-all puro).
- Novos objetos não concedem a `anon`/`authenticated`/`PUBLIC` (inclui EXECUTE — residual fechado).
- Role do Prisma (owner/`BYPASSRLS`) **continua operacional** (INSERT/SELECT/UPDATE/DELETE).

## E. Estado esperado do Security Advisor (após aplicar)

- **Zero** `rls_disabled_in_public` (level ERROR) para as 26 tabelas de domínio.
- Qualquer advisor novo deve ser classificado (NEW_BLOCKER / NON_BLOCKING / EXPECTED_BY_ARCHITECTURE /
  FALSE_ASSUMPTION) — não ignorar ERROR, não auto-corrigir sem checar semântica.

## F. Negative controls (têm de MORDER)

- **SQL** (`verify_lockdown.sql`, parte D): `SET LOCAL ROLE anon`/`authenticated` →
  SELECT(26)/INSERT/UPDATE/DELETE/EXECUTE → `42501 insufficient_privilege`.
- **PostgREST** (`staging-rls-negative-control.mjs`, com a **anon/publishable key**):
  - `--expect-open` **antes** do lockdown: as sensíveis respondem `200` (prova que há o que fechar);
  - **depois** (sem flag): as 26 `GET` negadas (401/403/404, nunca `200 []`); `POST/PATCH/DELETE`
    negados por autorização (401/403/404), com sentinela de id inexistente e confirmação por SQL de
    que nenhum canário persistiu.
- **Positive control:** Prisma/Express seguem funcionando; caminho cross-tenant privilegiado ok.

## G. Comandos exatos (com `.env.staging` local, git-ignored)

`.env.staging` em `chaveiro-bot/` com `DIRECT_URL`/`DATABASE_URL` (do `admai-staging`) +
`SUPABASE_SERVICE_ROLE_KEY` + `STAGING_REF=qsuufuulxfkkeasgxhcv` + `ALLOW_STAGING_WRITES=true`; e, para o
negative control, `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_ANON_KEY`.

```bash
cd chaveiro-bot
# 1) prova que o controle morde ANTES
node --env-file=<arquivo com URL+anon key> scripts/staging-rls-negative-control.mjs --expect-open
# 2) aplica o lockdown aprovado + verify (guard vinculado à conexão, fail-closed)
node scripts/apply-rls-lockdown.mjs
# 3) prova negação DEPOIS
node --env-file=<arquivo com URL+anon key> scripts/staging-rls-negative-control.mjs
# 4) re-rodar o Supabase Security Advisor (zero rls_disabled_in_public nas 26)
```

O wrapper prova `CONNECTED_PROJECT_REF == qsuufuulxfkkeasgxhcv` e aborta (fail-closed) em qualquer
alvo inesperado, na porta errada, ou se `ALLOW_STAGING_WRITES != true`. Nunca ecoa secret.

## H. Ponto no tempo

- Branch `fix/seguranca-criticos` @ HEAD `405d5cf` (árvore limpa).
- Revisão: Codex DECISOR `01a03164` + REVISOR `01a03185` (DECISOR + REVISOR + 3 deltas → **APROVADO**).
- Re-prova local (Postgres 16, Docker `admai-pg-test`, **não** staging/prod): verify A–E PASS;
  backend-owner operacional pós-lockdown + anon negado. `LOCAL_PROOF != STAGING_PROOF`.

## I. Zero produção

Nenhuma ação tocou produção neste programa. Produção permanece `UNKNOWN`/intocada. A aplicação é
**exclusivamente** contra `qsuufuulxfkkeasgxhcv`.

## J. O que fecha `STG-SEC-RLS-01`

Somente com TODAS: 26 RLS on · anon/authenticated sem privilégio (tabela+coluna) · PUBLIC sem path
indevido · Prisma funciona · Data API anônima negada · authenticated-unprivileged negado · negative
mutation morde · Advisor sem `rls_disabled_in_public` nas 26. Só então o finding passa de
`READY_FOR_EXTERNAL_APPLY` para fechado — e segue a reconciliação de migration (`STG-MIG-RECON`).
