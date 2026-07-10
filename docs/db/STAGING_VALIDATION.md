# Staging — validação do Prisma 7 (pooler) + RLS + performance

Este staging destrava **três** frentes de uma vez (F8 do plano de arquitetura):
ADR-005 (Prisma 7 no pooler), ADR-004 (ligar RLS) e F5 (EXPLAIN/carga). O kit já está pronto no repo;
só falta você criar o **projeto Supabase dedicado** e preencher `chaveiro-bot/.env.staging`.

> **Regra de ouro:** o projeto de staging é **separado** do AdmAi de produção. O AdmAi de prod **nunca**
> recebe `migrate deploy` desta validação. O script tem trava anti-prod (`ALLOW_STAGING_WRITES` +
> `PROD_HOST_BLOCKLIST`), mas a 1ª linha de defesa é usar um projeto novo.

## Kit já preparado (nesta branch `chore/prisma-7`)

| Arquivo | Papel |
|---|---|
| `chaveiro-bot/.env.staging.example` | Modelo das variáveis (copie para `.env.staging`) |
| `chaveiro-bot/.env.staging` | **Você cria** — ignorado pelo git (contém a senha) |
| `chaveiro-bot/scripts/validate-staging.mjs` | Orquestra migrate+generate+integração com trava anti-prod |
| `npm run validate:staging` | Atalho para rodar o script |

## Estado atual (já feito via Chrome)

- ✅ Projeto **`admai-staging`** criado (org `n1imp`, região **sa-east-1**, ref `qsuufuulxfkkeasgxhcv`, Healthy).
- ✅ `chaveiro-bot/.env.staging` **pré-preenchido** com as strings reais (lidas do Connect → ORM → Prisma):
  - `DATABASE_URL` = pooler **transaction** (6543) — runtime, valida o Prisma 7.
  - `DIRECT_URL` = pooler **session** (5432) — migrations (o Supabase indica o session pooler p/ o
    `directUrl` do Prisma no free plan; **não** a 6543).
  - `STAGING_REF=qsuufuulxfkkeasgxhcv` — o script exige que as duas URLs contenham este ref (allowlist).
- ⚠️ Falta **só você** (2 edições no `.env.staging`):

## O que falta (você)

```bash
# em chaveiro-bot/.env.staging:
#   1) troque SUA_SENHA (2x) pela senha do banco definida ao criar o projeto
#   2) ALLOW_STAGING_WRITES=true
#   (opcional) PROD_HOST_BLOCKLIST = o REF do projeto AdmAi de PROD (defesa extra)
```

> **Por que o guard usa o REF e não o host:** staging e prod dividem o **mesmo host de pooler**
> (`aws-1-sa-east-1.pooler.supabase.com`) — só o `postgres.<ref>` difere. Bloquear por host
> bloquearia o staging; por isso a trava é o `STAGING_REF` (allowlist) + o ref de prod no blocklist.

### Rodar a validação
```bash
npm run validate:staging
```
O script executa, com trava anti-prod antes de tudo:
1. `prisma migrate deploy` — cria o schema pela **conexão direta** (5432).
2. `prisma generate`.
3. `npm run test:integration` — exercita IDOR/auth com as queries passando pelo **pooler** (6543)
   via `@prisma/adapter-pg`. **É isto que valida o Prisma 7** (prepared statements sob transaction pooling).

**Resultado esperado:** as 3 etapas verdes → o Prisma 7 está seguro para merge/deploy.
**Se falhar** na etapa 3 com erro de prepared statement/pooler: é exatamente o risco que queríamos pegar
**antes** de prod — anote o erro; a correção provável é ajustar o `pg`/adapter (ex.: desabilitar prepared
statements ou usar a porta 5432 do pooler em session mode). Não mergear até verde.

## Fase 2 — RLS (ADR-004), depois que a Fase 1 passar

O `prisma/rls/enable_rls.sql` é fail-closed e exige um **role dedicado sem BYPASSRLS**. Em staging:
1. Criar o role `app_rw` (bloco "ROLE DEDICADO" no fim de `enable_rls.sql`).
2. Aplicar as policies:  `psql "$DIRECT_URL" -f prisma/rls/enable_rls.sql`
3. Apontar o `DATABASE_URL` do runtime para o `app_rw` e ligar `RLS_ENABLED=true` no `.env.staging`.
4. **Cobrir os jobs cross-tenant** (`services/agendador.js` — expurgo LGPD, sync avaliações, inbound) numa
   conexão privilegiada, senão eles somem (fail-closed).
5. Re-rodar `npm run test:integration` — o isolamento agora é garantido pelo banco, não só pelo ORM.

Roteiro completo de RLS + DAST: [`../TUTORIAL_RLS_DAST.md`](../TUTORIAL_RLS_DAST.md).

## Fase 3 — Performance (F5), no mesmo staging
- Semear volume realista e rodar `EXPLAIN ANALYZE` nas consultas quentes catalogadas em
  [`05-performance.md`](./05-performance.md) (os `MAX_AGREGACAO`/OFFSET).
- Medir p95 e comparar aos SLOs (a fixar em F0).

## Segurança (invariantes desta trilha)
- `.env.staging` é **ignorado pelo git** (`.gitignore`: `.env.*`). Nunca commitar; nunca colar senha no chat.
- Produção é **read-only** nesta validação; migrations só no projeto de staging.
- O script recusa rodar sem `ALLOW_STAGING_WRITES=true` e checa `PROD_HOST_BLOCKLIST`.
