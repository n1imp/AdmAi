# STG — Reconciliação de migrations (admai-staging) · amendment §7

**Data:** 2026-08-24 (atualizado com evidência EXTERNA real) · **Regra dura:** **não** rodar
`prisma migrate deploy` cego. Reconciliar primeiro.

> ## ⚠️ ATUALIZAÇÃO — evidência externa real (2026-08-24, ciclo STG-MIG-RECON-EXT)
>
> A consulta real ao `admai-staging` **refutou** a hipótese abaixo (`_prisma_migrations` = 0):
> o staging tem **23 migrations aplicadas**, em ordem **idêntica** aos primeiros 23 diretórios do
> repo (última: `20260707000001_drop_material_nome_unique_global`, finished_at 2026-07-10).
> `DocumentoTecnico` **não existe**. Zero policies. Classificação nova:
> **`STAGING_SCHEMA_BEHIND_REPOSITORY`** — **5 migrations pendentes** (todas aditivas, sem
> DML/drop): `20260717000000_servico_em_andamento`, `20260717000001_documentos_tecnico`
> (origem do `DocumentoTecnico`), `20260718000000_usuario_preferencias`,
> `20260803000000_usuario_telefone_unique` (**pré-condição de dados**: telefones únicos),
> `20260823000100_servico_comissao_taxa_aplicada`. Finding: **`STG-MIG-SCHEMA-LAG-01`**.
> Consequência: o preflight fail-closed do lockdown RLS abortou **corretamente**;
> `STG-SEC-RLS-01 = READY_FOR_EXTERNAL_APPLY + BLOCKED_DEPENDENCY(STG-MIG-RECON)`.
> A ordem original ("§8: security antes de migration") **inverte-se por necessidade técnica**:
> o lockdown exige as 26 tabelas ⇒ migrations pendentes aplicam **primeiro**, depois o lockdown.
> A estratégia de *baseline por `migrate resolve`* abaixo fica **SUPERSEDED** (era para schema
> equivalente sem history; o caso real é history correta + schema atrasado ⇒ **aplicar as
> pendentes**). Protocolo e pacote do executor externo:
> `docs/eos-v2/STG_MIG_RECON_EXTERNAL_APPLY_PACKAGE.md` (decisão D1 registrada em
> `AGENT_DECISIONS.md`, D-STG-MIG-EXTERNAL-APPLY).

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
