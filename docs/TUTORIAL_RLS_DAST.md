# Tutorial — Finalizar o plano de segurança (RLS + DAST)

Passo a passo para concluir os itens que dependem de **staging + Supabase**:
o rollout do **Row Level Security (RLS)** (Fase 3) e o **DAST com OWASP ZAP** (PASSO 6).

> **Pré-requisitos**
> - Ambiente de **staging** de pé (mesma stack de produção: backend + Supabase).
> - `psql` instalado **ou** uso do **SQL Editor** do Supabase no navegador.
> - Acesso de administrador ao projeto Supabase.
>
> A fundação já está no código (PR #44): a flag `RLS_ENABLED` (default **off**) e o
> script `chaveiro-bot/prisma/rls/enable_rls.sql`. Este tutorial ativa isso com segurança.

---

## Visão geral

| Passo | O quê | Onde |
|---|---|---|
| A | Criar role de aplicação sem `BYPASSRLS` | Supabase |
| B | Montar as duas `DATABASE_URL` (runtime x migrations) | `.env` / Supabase |
| C | Validar o app com `RLS_ENABLED=true` (sem tocar no banco) | Staging |
| D | Cobrir os jobs cross-tenant | Código (decisão sua) |
| E | Aplicar a RLS no banco e testar | Staging |
| F | Repetir em produção | Produção |
| G | DAST com OWASP ZAP | Staging |

> ⚠️ **RLS é fail-closed**: sem o GUC `app.empresa_id` setado, as policies retornam
> **zero linhas**. Por isso a ordem importa e tudo é validado em staging antes de prod.

---

## PASSO A — Criar o role de aplicação sem `BYPASSRLS`

No Supabase → **SQL Editor** → rode (troque a senha):

```sql
CREATE ROLE app_rw LOGIN PASSWORD 'UMA_SENHA_FORTE'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
```

Confirme que ele **não** bypassa RLS:

```sql
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'app_rw';
-- rolbypassrls deve ser  f  (false)
```

> Por que: o role padrão do Supabase tem `BYPASSRLS` e ignoraria as policies — a RLS
> seria inócua. O `FORCE ROW LEVEL SECURITY` do script vale para o *owner*, mas **não**
> para roles com `BYPASSRLS`/superuser. Por isso o runtime precisa de um role restrito.

---

## PASSO B — Montar as duas `DATABASE_URL`

Você terá **duas** strings de conexão:

- **Runtime (app)** → usa `app_rw` (restrito, sofre RLS).
- **Migrations** → continua o role privilegiado atual (aplica DDL, não sofre RLS).

Pegue o host em Supabase → **Project Settings → Database → Connection string**.

```bash
# runtime (vai no .env do staging do backend)
DATABASE_URL=postgresql://app_rw:UMA_SENHA_FORTE@<host>:5432/postgres?sslmode=require

# migrations (use só no comando de migrate; mantenha numa var à parte)
DATABASE_URL_MIGRATIONS=postgresql://postgres:<senha-atual>@<host>:5432/postgres?sslmode=require
```

> Use a porta **5432 (conexão direta)** para migrations; o **pooler (6543)** pode falhar
> no `prisma migrate deploy`.

---

## PASSO C — Validar o app com RLS ligada (ainda SEM tocar no banco)

1. No `.env` do **staging**, ligue a flag:

   ```bash
   RLS_ENABLED=true
   ```

2. Suba o backend de staging.

3. **Teste o painel inteiro** logado: login, técnicos, serviços, estoque,
   ponto/bater ponto, avaliações, notificações.

Como a RLS **ainda não** está aplicada no banco, tudo deve funcionar igual — isso
confirma que o wiring do GUC (`set_config('app.empresa_id', …, true)` por transação,
em `src/db/tenant.js`) não quebrou nenhum fluxo.

> Se **algo quebrar aqui**, pare e investigue antes de aplicar o SQL — o problema é no
> wiring/transação, não nas policies.

---

## PASSO D — Cobrir os jobs cross-tenant (decisão necessária)

Estes serviços rodam pelo `prisma` **base** e **não** setam o GUC → sob RLS retornariam
zero linhas e parariam **silenciosamente**:

- agendador / **expurgo LGPD** (`src/services/agendador.js`)
- **sync de avaliações** do Google
- **webhook inbound** (resolve a empresa pelo telefone)

Escolha um caminho:

- **(recomendado) Conexão privilegiada para os jobs**: um segundo Prisma client com a
  `DATABASE_URL` do role privilegiado, usado só por esses serviços de sistema.
- **Ou** setar o GUC por empresa dentro de cada job (loop por empresa).

> ⚠️ **Não pule este passo.** Aplicar a RLS sem cobrir os jobs faz o expurgo/sync
> pararem sem erro visível.

---

## PASSO E — Aplicar a RLS no banco (staging primeiro)

Com A, B, C e D prontos, aplique o script no **staging**:

```bash
cd chaveiro-bot
psql "postgresql://postgres:<senha>@<host>:5432/postgres?sslmode=require" \
  -f prisma/rls/enable_rls.sql
```

(ou cole o conteúdo de `prisma/rls/enable_rls.sql` no **SQL Editor** do Supabase).

### Teste anti-vazamento (conectado como `app_rw`)

```sql
-- sem tenant setado → zero linhas (fail-closed esperado)
SELECT count(*) FROM "Tecnico";                 -- deve dar 0

-- com tenant setado → só a empresa 1
SELECT set_config('app.empresa_id', '1', true);
SELECT count(*) FROM "Tecnico";                 -- só os da empresa 1
```

Depois, repita o teste de fumaça do painel (PASSO C) — agora com a RLS **ativa**.

### Rollback (se precisar)

Está no fim do `enable_rls.sql`, bloco **"DESFAZER"**: `DROP POLICY` +
`ALTER TABLE … NO FORCE / DISABLE ROW LEVEL SECURITY` para todas as tabelas.

---

## PASSO F — Repetir em PRODUÇÃO

Só após o staging estar 100%:

1. Aplique o `enable_rls.sql` em produção (com rollback à mão).
2. Troque a `DATABASE_URL` de runtime para o role `app_rw`.
3. Mantenha `RLS_ENABLED=true`.
4. Faça o smoke test do painel em produção.

---

## PASSO G — DAST com OWASP ZAP (staging, **nunca** produção)

Aponte para a **URL de staging**:

```bash
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://staging.SEUDOMINIO -r zap-report.html
```

Revise o `zap-report.html`. Achados de DAST viram correções no backend/painel.

---

## Checklist final

- [ ] **A** — role `app_rw` criado, `rolbypassrls = f`
- [ ] **B** — `DATABASE_URL` (runtime = `app_rw`) e a de migrations separadas
- [ ] **C** — staging com `RLS_ENABLED=true`, painel testado OK
- [ ] **D** — jobs cross-tenant cobertos (conexão privilegiada ou GUC por empresa)
- [ ] **E** — `enable_rls.sql` aplicado no staging + teste anti-vazamento OK
- [ ] **F** — replicado em produção, `DATABASE_URL` apontando para `app_rw`
- [ ] **G** — ZAP rodado no staging, achados tratados

### Arquivos de referência

- `chaveiro-bot/prisma/rls/enable_rls.sql` — policies + role + rollback
- `chaveiro-bot/src/db/tenant.js` — wiring do GUC por transação
- `chaveiro-bot/src/config/env.js` — flag `RLS_ENABLED`
