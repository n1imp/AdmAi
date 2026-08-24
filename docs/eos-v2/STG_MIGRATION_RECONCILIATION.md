# STG — Reconciliação de migrations (admai-staging) · amendment §7

**Data:** 2026-08-24 · **Ordem:** só APÓS `STG-SEC-RLS-01 = CLOSED` (amendment §8).
**Regra dura:** **não** rodar `prisma migrate deploy` cego. Reconciliar primeiro.

## Evidência

| Fonte | Estado |
| --- | --- |
| Repo `prisma/migrations` | **28 migrations**, cadeia consistente (`prisma migrate status` local: "schema up to date") |
| Prisma schema | 26 models |
| Staging `public` | **26 tabelas existem** |
| Staging `_prisma_migrations` | **0 linhas** |
| Supabase migration list | 0 |

## Classificação

`STAGING_SCHEMA_STATE = UNTRACKED_BASELINE` → provisoriamente
**`SCHEMA_LIKELY_EQUIVALENT_UNTRACKED`**: o schema foi materializado sem o tracking do Prisma
(ex.: `db push`, SQL direto ou restore sem a tabela de migrations). Falta **confirmar equivalência
exata** (colunas/constraints/índices/enums) — isso exige acesso ao banco de staging
(`BLOCKED_CAPABILITY`, ver STG-02-USO).

## Estratégia segura (reproduzível)

### Passo 1 — Preflight: diff determinístico (precisa do `DIRECT_URL` de staging)

```bash
# Diferença entre o schema REAL de staging e o que as migrations do repo produzem.
# Vazio => equivalente => baseline seguro. Não-vazio => DRIFT.
npx prisma migrate diff \
  --from-url "$STAGING_DIRECT_URL" \
  --to-migrations prisma/migrations \
  --script > /tmp/staging_vs_repo.sql
# (e o inverso, para ver o que o repo teria a mais)
npx prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-url "$STAGING_DIRECT_URL" \
  --script > /tmp/repo_vs_staging.sql
```

### Passo 2a — Se diff VAZIO (`SCHEMA_EQUIVALENT_UNTRACKED`): baseline sem DDL

Marca as 28 migrations como aplicadas **sem executar DDL** (popula `_prisma_migrations` para casar
com o schema já existente). Nenhuma operação destrutiva.

```bash
for m in $(ls prisma/migrations | grep -v migration_lock); do
  npx prisma migrate resolve --applied "$m"
done
npx prisma migrate status   # deve reportar "up to date"
```

### Passo 2b — Se diff NÃO-VAZIO (`SCHEMA_DRIFT`)

**Não** aplicar cegamente. Coletar o diff determinístico (os dois scripts acima) → **Codex D1**
(root cause + decisão) → Claude implementa a correção → provar. Só então baseline.

## Não-objetivos

- Não é `migrate deploy` (o schema já existe; deploy tentaria recriar/alterar e poderia falhar
  ou danificar).
- Não toca produção (`PRODUCTION_RLS_STATE`/migration state de prod = UNKNOWN).
- Não precede o boundary de segurança: `STG-SEC-RLS-01` fecha primeiro (amendment §8).

## Estado

`BLOCKED_CAPABILITY` para a execução (preflight/baseline exigem `DIRECT_URL` do admai-staging).
A **estratégia** e a classificação estão prontas aqui; a confirmação de equivalência e o baseline
rodam quando as credenciais existirem.
