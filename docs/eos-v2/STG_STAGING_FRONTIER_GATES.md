# STG_STAGING_FRONTIER_GATES — cadeia até `REAL_STAGING_ACCEPTANCE_PROVEN`

**Data:** 2026-08-24 · **AUTHORIZED_TARGET:** `qsuufuulxfkkeasgxhcv` · **PROHIBITED:** produção (`disljhkypaxpyzvbooge`)
**Reconciliação D1** (`D-STG-SEC-RLS-EXTERNAL-PURE-SQL-01`, thread `01a0366d`):
- `STAGING_OPERATIONAL` **colapsa em `STG-RUNTIME`** (o item já tem essa descrição) — sem gate duplicado.
- `STG-STORAGE-REAL` **≡ alias de `STG-03-DOC-BUCKET`** (sem criar item novo).
- `STG-02-USO` = **umbrella de capacidade** (pré-condição de uso do staging), **não** gate de aceitação.
- `STG-MIG-RECON` = dependência histórica **satisfeita** (DONE), não bloqueante.

> **Estado das journeys:** as jornadas E2E de staging estão **ESPECIFICADAS**, não codadas — dependem
> da **URL do frontend/backend de staging** (ainda não provada; `STG-RUNTIME`). Dependency declarado,
> não fingido. Quando `STG-RUNTIME` provar as URLs, os scripts abaixo são materializados reusando
> `chaveiro-painel/e2e/{cdp,jornadas,run,capturar}.mjs`.

## Cadeia (ordem topológica)

```
STG-SEC-RLS-01 (READY_FOR_EXTERNAL_APPLY)
  └─ STG-RUNTIME  (= STAGING_OPERATIONAL)      ← STG-SEC-RLS-01 + STG-MIG-RECON(DONE)
       ├─ STG-03-DOC-BUCKET (= STG-STORAGE-REAL)   ← STG-02-USO(umbrella)
       ├─ STG-E2E-OWNER / STG-E2E-MANAGER / STG-E2E-EMPLOYEE
       ├─ STG-TENANT-NEGATIVE
       └─ STG-MOBILE
             └─ STG-FINAL-SWEEP  → REAL_STAGING_ACCEPTANCE_PROVEN
```

---

## STG-02-USO — umbrella de capacidade (pré-condição)

- **PURPOSE:** staging **utilizável** por um agente: credenciais presentes, conectividade DB/pooler,
  ref correto, sem produção.
- **PRECONDITIONS:** `.env.staging` (git-ignored) com `DIRECT_URL`/`DATABASE_URL` do admai-staging +
  `STAGING_REF=qsuufuulxfkkeasgxhcv` + `ALLOW_STAGING_WRITES=true`.
- **EXECUTION_METHOD:** trava anti-produção de `validate-staging.mjs` (host/ref/blocklist).
- **REQUIRED_URL:** — · **REQUIRED_ROLE:** — · **REQUIRED_FIXTURE:** — · **REQUIRED_SECRET:**
  `.env.staging` (DB URLs).
- **PASS:** conecta ao ref correto; guardas não abortam. **FAIL:** placeholder, ref divergente, ou
  host casa blocklist.
- **CLEANUP:** — · **DEPENDENCIES:** STG-01-ISOLAMENTO (DONE).

## STG-RUNTIME — `STAGING_OPERATIONAL` (§21)

- **PURPOSE:** provar que o app **opera** contra o admai-staging, sem depender de produção nos paths
  testados.
- **PRECONDITIONS (todas provadas, não "existe"):** Supabase healthy; **backend staging reachable**;
  **frontend staging reachable**; backend aponta para **staging DB**; frontend aponta para **backend
  staging**; feature flags corretas; secrets de staging (nunca produção); **migration 28/28**; storage
  configurado; auth configurado; health endpoints 200; **nenhum ref de produção** nos configs.
- **EXECUTION_METHOD:** `validate-staging.mjs` (DB/pooler + migrate deploy) **+** smoke HTTP do
  backend (`/health` + `/api` autenticado) **+** carregar o frontend staging e confirmar que aponta
  ao backend staging (network trace).
- **REQUIRED_URL:** **backend staging URL** + **frontend staging URL** (a **descobrir/provar** — hoje
  ausentes; bloqueiam a materialização das journeys).
- **REQUIRED_ROLE:** — (health/infra) · **REQUIRED_FIXTURE:** — · **REQUIRED_SECRET:** `.env.staging`.
- **PASS:** todos os itens de PRECONDITIONS verdadeiros e evidenciados. **FAIL:** qualquer um falso ou
  qualquer config apontando a produção.
- **CLEANUP:** — · **DEPENDENCIES:** STG-SEC-RLS-01, STG-MIG-RECON(DONE).

## STG-03-DOC-BUCKET — `STG-STORAGE-REAL`

- **PURPOSE:** Storage real (bucket de documentos) provisionado e operável por `service_role`.
- **PRECONDITIONS:** STG-RUNTIME parcial (Supabase/Storage configurado); service-role key.
- **EXECUTION_METHOD:** `provision-bucket-documentos.mjs` (provisiona) + `smoke-storage.mjs <bucket>
  [private]` (upload/URL/remove).
- **REQUIRED_URL:** `SUPABASE_URL` (staging) · **REQUIRED_ROLE:** `service_role` · **REQUIRED_FIXTURE:**
  PNG 1×1 sintético (embutido no smoke) · **REQUIRED_SECRET:** `SUPABASE_SERVICE_ROLE_KEY`.
- **PASS:** bucket existe; upload+URL(200/signed)+remove OK. **FAIL:** provisionamento ou qualquer
  etapa do smoke falha. Se **sem** service-role key: `VERIFICATION_REQUIRED_EXTERNAL_SECRET` (subgate),
  não bloqueia os demais.
- **CLEANUP:** objeto de teste removido pelo smoke. · **DEPENDENCIES:** STG-02-USO.

## STG-E2E-OWNER / STG-E2E-MANAGER / STG-E2E-EMPLOYEE (§22)

- **PURPOSE:** jornadas **reais em browser/runtime** por papel — ações **permitidas** e **negadas**
  (RBAC), com persistência real.
- **PRECONDITIONS:** STG-RUNTIME PASS (URLs provadas); contas demo/sintéticas por papel no staging.
- **EXECUTION_METHOD:** `chaveiro-painel/e2e/cdp.mjs` + `jornadas.mjs` (CDP browser real) contra a
  **URL de staging**. Estrutura por jornada: `LOGIN → NAVIGATION → DOMAIN READ → DOMAIN WRITE → RBAC
  NEGATIVE → PERSISTENCE → RELOAD → LOGOUT`, adaptada às funções reais (OWNER: dashboard/serviços/
  financeiro/técnicos; MANAGER: GestorHome/aprovações; EMPLOYEE: MeuPainel/ponto).
- **REQUIRED_URL:** frontend staging · **REQUIRED_ROLE:** dono / gestor / funcionário (contas reais de
  staging) · **REQUIRED_FIXTURE:** empresa demo + usuários por papel (seed sintético) ·
  **REQUIRED_SECRET:** senhas sintéticas dos usuários demo (nunca ecoadas; via env de captura).
- **PASS:** cada jornada completa; ações permitidas OK; ações fora do papel **negadas** (não só UI —
  request negada no backend); estado persiste após reload. **FAIL:** qualquer etapa quebra, ou RBAC
  negativa permite.
- **CLEANUP:** writes sintéticos removidos/isolados por fixture dedicada. · **DEPENDENCIES:**
  STG-RUNTIME.

## STG-TENANT-NEGATIVE (§23)

- **PURPOSE:** provar que **Tenant A não lê/muta Tenant B** nos **fluxos reais do app** (authorization
  do backend, não PostgREST).
- **PRECONDITIONS:** STG-RUNTIME PASS; **duas** empresas (A e B) com dados distintos.
- **EXECUTION_METHOD:** (a) mecanismo: `validate-rls-staging.mjs` prova o GUC `app.empresa_id`
  local=true não vaza sob pooler; (b) fluxo real: logar como usuário do Tenant A e tentar
  ler/mutar recursos do Tenant B via API/browser → negado; controle positivo: A acessa A.
- **REQUIRED_URL:** backend staging · **REQUIRED_ROLE:** usuário do Tenant A · **REQUIRED_FIXTURE:**
  **Tenant A** + **Tenant B** (empresas + recursos: serviço, técnico, documento por tenant) ·
  **REQUIRED_SECRET:** `.env.staging` + credenciais sintéticas dos dois tenants.
- **PASS:** A→B negado em read e mutate; A→A permitido; nenhum vazamento cross-tenant. **FAIL:**
  qualquer acesso/mutação cross-tenant, ou GUC vaza entre requisições poolizadas.
- **CLEANUP:** fixtures A/B isoladas, removidas ao fim. · **DEPENDENCIES:** STG-RUNTIME.

## STG-MOBILE (§24)

- **PURPOSE:** fluxos **funcionam** nos viewports oficiais — **BUG_FIX ≠ VISUAL_REDESIGN** (não
  reabrir redesign).
- **PRECONDITIONS:** STG-RUNTIME PASS; jornadas E2E disponíveis.
- **EXECUTION_METHOD:** re-rodar as jornadas por papel em viewports **360, 390** (mobile) e **1440,
  1920** (desktop) via `cdp.mjs` (emulação); `capturar.mjs` para evidência.
- **REQUIRED_URL:** frontend staging · **REQUIRED_ROLE:** os três papéis · **REQUIRED_FIXTURE:**
  mesma dos E2E · **REQUIRED_SECRET:** idem E2E.
- **PASS:** fluxos completam e não estão quebrados em todos os 4 viewports. **FAIL:** fluxo quebra/
  inacessível num viewport. **NÃO** falhar por preferência visual (redesign fora de escopo).
- **CLEANUP:** idem E2E. · **DEPENDENCIES:** STG-RUNTIME.

## STG-FINAL-SWEEP → `REAL_STAGING_ACCEPTANCE_PROVEN`

- **PURPOSE:** sweep global pós-staging: Advisor final, reconciliar ledger/findings/blockers,
  `ZERO_FORGOTTEN_BLOCKER`; então `REAL_STAGING_ACCEPTANCE_PROVEN` + `ADMAI_RELEASE_CANDIDATE_READY`.
  **NÃO** declarar `ADMAI_RELEASE_READY` (LEGAL `DEFERRED_BY_D2`).
- **PRECONDITIONS:** todos os gates acima **PASS** com prova real. Um subgate em
  `VERIFICATION_REQUIRED_EXTERNAL_SECRET` **não** satisfaz esta pré-condição: só uma **decisão D2
  explícita do usuário** aceitando o risco residual pode substituir a prova real desse subgate
  (REVISOR `01a03681` achado 3). Sem prova real e sem D2, `REAL_STAGING_ACCEPTANCE_PROVEN` **não** é
  atingido.
- **EXECUTION_METHOD:** Security Advisor final; `completion-ledger --validar`; conferir todos os
  findings; secret persistence.
- **REQUIRED_URL:** — · **REQUIRED_ROLE:** — · **REQUIRED_FIXTURE:** — · **REQUIRED_SECRET:** —.
- **PASS:** zero blocker esquecido; todos os gates de staging PASS; terminal
  `REAL_STAGING_ACCEPTANCE_PROVEN` atingido. **FAIL:** qualquer gate aberto ou blocker não
  reconciliado.
- **CLEANUP:** — · **DEPENDENCIES:** STG-SEC-RLS-01, STG-RUNTIME, STG-03-DOC-BUCKET, STG-E2E-*,
  STG-TENANT-NEGATIVE, STG-MOBILE.

---

## EXTERNAL_SECRETS_STILL_REQUIRED (por subgate — granular, §28)

| Subgate | Secret necessário | Sem ele |
|---------|-------------------|---------|
| STG-SEC-RLS-01 **E/F/G** | SQL-exec vinculado ao ref (integração) | não aplica/verifica |
| STG-SEC-RLS-01 **H** | anon/publishable key | sem anon negative control |
| STG-SEC-RLS-01 **I** | `STAGING_AUTHENTICATED_JWT` (usuário sem privilégio) | sem authenticated negative control |
| STG-SEC-RLS-01 **J** / STG-03-DOC-BUCKET | `SUPABASE_SERVICE_ROLE_KEY` | `VERIFICATION_REQUIRED_EXTERNAL_SECRET` (subgate isolado) |
| STG-RUNTIME **K** / STG-02-USO | `.env.staging` (DB URLs) + backend/frontend staging URL | sem backend/runtime smoke |
| STG-E2E-* / STG-TENANT-NEGATIVE / STG-MOBILE | credenciais sintéticas dos papéis/tenants + URLs | journeys não materializam |

`LOCAL_AGENT_CAPABILITY_UNAVAILABLE` (Claude) **≠** `EXTERNAL_EXECUTOR_CAPABILITY_AVAILABLE` (executor
externo). `BLOCKED_ITEM ≠ BLOCKED_RUN`.
