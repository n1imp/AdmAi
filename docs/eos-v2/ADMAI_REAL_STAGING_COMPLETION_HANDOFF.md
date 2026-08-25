# ADMAI_REAL_STAGING_COMPLETION_HANDOFF

**Data:** 2026-08-24 · **Branch:** `fix/seguranca-criticos` · **Finding:** `STG-SEC-RLS-01`
**AUTHORIZED_TARGET:** `admai-staging` / `qsuufuulxfkkeasgxhcv` · **PROHIBITED:** `disljhkypaxpyzvbooge` (produção) e qualquer outro ref
**Papéis:** Claude = BUILD/PREPARE · Codex = D1/REVISOR (read-only) · **Executor Externo = APPLY/OBSERVE/MEASURE/PROVE**
**Decisão D1:** Codex DECISOR `D-STG-SEC-RLS-EXTERNAL-PURE-SQL-01`, thread `01a0366d-fe7d-7fa1-8288-63b69c27cfe0` (CONFIANÇA ALTA)

> **Estado:** o RLS v2 está **APROVADO** (REVISOR DELTA-2 `01a03654`, commit `c61ca07`) e re-provado
> localmente. Falta **exclusivamente a aplicação/prova no staging real**, que Claude **não pode**
> executar (sem credenciais) mas o **executor externo autorizado pode** (acesso direto ao
> admai-staging via integração Supabase). Isto **NÃO é PASS** — `STG-SEC-RLS-01` permanece **ABERTO**
> até TODAS as provas reais A–M passarem. `LOCAL_PROOF ≠ STAGING_PROOF`.

---

## 1. ARTIFACT_INVENTORY (enumerado; bytes = fonte de verdade nos anexos)

SHA-256 = dos **bytes LF canônicos** (blob git). No checkout Windows o on-disk pode ser CRLF — o
hash canônico é o abaixo; use os **anexos** (LF).

| # | PATH | PURPOSE | SHA256_GIT_BLOB_LF | MUTATES_DB | REQUIRES_SECRET | ORDER |
|---|------|---------|--------------------|------------|-----------------|-------|
| 1 | `chaveiro-bot/prisma/rls/lockdown_public_access_v2.pure.sql` | Lockdown v2 forma **PURE_SQL** (API-executor) | `98afc04f3058aba175605f0ebdda9800a46a4f5e7208a191321fc4ff1761c245` | **YES** (COMMIT) | SQL-exec **vinculado ao ref** | **E** |
| 2 | `chaveiro-bot/prisma/rls/verify_lockdown_v2.pure.sql` | Verify v2 A–G forma **PURE_SQL** | `c2f49d7ddf3d075e85393b2c34d7d82f3e91cccea63795756792e2999a7bdc58` | NO (BEGIN…ROLLBACK) | SQL-exec | **G** |
| 3 | `chaveiro-bot/scripts/staging-rls-negative-control.mjs` | Negative control PostgREST (anon **e** authenticated) | `32b71872cc0bf36d1989b3c2fed5ada95ea04d22f2b6bd79bb7829f618d879ed` | NO | anon key (+ `STAGING_AUTHENTICATED_JWT`) | **D2 / H / I** |
| 4 | `chaveiro-bot/scripts/smoke-storage.mjs` | Positive smoke Storage via `service_role` | `4a0ba0914266fa5bd3cfc11d30b8bd18590f894466636ab87d1c081452be6e8c` | YES (fixture, limpa) | `SUPABASE_SERVICE_ROLE_KEY` | **J** |
| 5 | `chaveiro-bot/scripts/validate-staging.mjs` | Backend smoke: Prisma migrate deploy+generate+integration (pooler) | `5dfd6681e988e9b3006ce6f0fdd3b506f24483322bada4f50fc604e1672ec7e9` | schema (deploy) | `.env.staging` | **K** |
| 6 | `chaveiro-bot/scripts/validate-rls-staging.mjs` | GUC `app.empresa_id` sob pooler (base do STG-TENANT-NEGATIVE) | `0a4ddbe394232ea2bd173b99861ce95eefc6f78dde0dd34b8afc5a6b4bc5fe2b` | NO | `.env.staging` | (frontier) |
| 7 | `chaveiro-bot/prisma/rls/lockdown_public_access_v2.sql` | Lockdown v2 **psql** (fonte/referência; NÃO usar via API) | `bdf5c0f09747296e9d0f85fff28c79b9e14ede6888e9888b6186cd750c75a8eb` | — | psql `-v staging_ref` | (ref) |
| 8 | `chaveiro-bot/prisma/rls/verify_lockdown_v2.sql` | Verify v2 **psql** (fonte/referência) | `74f3e565a030cca50f222e49ea57c9f2c69189f71063573a0fab4417a2070f3f` | — | psql | (ref) |
| 9 | `docs/eos-v2/ADMAI_REAL_STAGING_COMPLETION_HANDOFF.md` | Este pacote | — | NO | — | — |
| 10 | `docs/eos-v2/STG_STAGING_FRONTIER_GATES.md` | Specs do próximo frontier até `REAL_STAGING_ACCEPTANCE_PROVEN` | — | NO | — | (frontier) |

**Consolidações declaradas (o "artifact esperado" que não existe como arquivo separado):**
- O negative control de `anon` **e** de `authenticated` é **um único** script (#3) parametrizado por
  principal — não há dois arquivos. O modo `--expect-open` (passo **D2**) e o fechado (H/I) são o
  mesmo binário.
- O apply wrapper `apply-rls-lockdown-v2.mjs` (node, exige `DIRECT_URL`) **não** é para o executor
  externo por API — serve ao caminho psql/node local. O executor externo usa os `.pure.sql` (#1/#2).

---

## 2. PURE_SQL_TRANSFORMATION (§7) — YES

**Por que existe:** a integração Supabase aplica SQL por API e **não** interpreta meta-comandos psql
(`\set`, `\if`, `\echo`, `\quit`, `\gset`). As formas psql v2 (#7/#8) permanecem **congeladas e
byte-intactas**; as formas PURE (#1/#2) são **derivadas deterministicamente**.

**Regra de derivação (sem edição manual do corpo):** remover SOMENTE as linhas cujo conteúdo (após
`trim`) começa com `\` **ou** é **exatamente** a linha do guard que termina em `\gset`
(`SELECT :'staging_ref' = 'qsuufuulxfkkeasgxhcv' AS ref_ok \gset`). Todo o resto — incluindo `BEGIN`,
`COMMIT`, `ROLLBACK`, `NOTIFY pgrst` e todo o corpo SQL/PLpgSQL — é preservado **byte-a-byte**, e o
corpo derivado é **exatamente** `não-meta(fonte)` (sem LF excedente). Cada `.pure.sql` traz no header
a fonte, o SHA-256 da fonte e a regra.

**Prova de equivalência (local, executada):**
- **Byte-level:** `corpo_derivado == não-meta(fonte)` byte-a-byte, para os dois arquivos; zero
  meta-comando remanescente; `BEGIN/COMMIT/NOTIFY` (lockdown) e `BEGIN/ROLLBACK` (verify) presentes
  exatamente 1×.
- **Comportamental (end-to-end nos próprios `.pure.sql`):** clone `TEMPLATE` de um Postgres 16 com o
  schema real, "buraco" injetado (RLS off + grants anon/auth + defaults de `supabase_admin`), aplicou
  o **pure lockdown** (COMMIT próprio) e rodou o **pure verify** → **A/A2/B/B2v2/C/D/E/F/G todos
  PASS**; sabotagem de view homônima → verify **FALHA** (G morde). DB descartado.
- **Atomicidade (fault injection):** injeção de erro antes do `COMMIT` no pure lockdown → transação
  aborta com **zero estado parcial** (anon SELECT/USAGE e RLS permanecem no estado do "buraco").

### TARGET_GUARD (§7) — RELOCADO, não removido (D1 + REVISOR `01a03681`)
A forma psql abortava se `staging_ref != qsuufuulxfkkeasgxhcv` (`-v staging_ref=…` + `\gset`). A forma
PURE **não** carrega esse guard. **Substituição vinculante:** o executor externo DEVE aplicar a
escrita por uma **sessão/conexão mecanicamente vinculada** ao `project_ref=qsuufuulxfkkeasgxhcv`,
**incapaz de atingir** `disljhkypaxpyzvbooge`. **Se essa vinculação mecânica não puder ser garantida
na própria chamada de escrita, ABORTAR — não aplicar.** Confirmação humana isolada **não basta**, e
um preflight imediatamente anterior **não substitui** a identidade do alvo. Re-provar o projeto na
**mesma sessão vinculada** logo antes de E é **defesa-em-profundidade adicional**, nunca substituto
da vinculação. O preflight in-band (26 tabelas + zero policies) é **defesa shape-based**, NÃO prova de
identidade (o shape pode existir em outro projeto). Não há fingerprint SQL in-band confiável entre os
projetos (`current_database()='postgres'` em ambos) — inventar um daria falsa segurança.

---

## 3. EXTERNAL_APPLY_ORDER (§8) — A–M vinculante (D1 O2)

Aplicar cada `.sql` como **UM ÚNICO batch/sessão** (proibido splitter ingênuo de statements).

| Passo | Ação | Critério |
|-------|------|----------|
| **A1** | Provar, pela própria integração, o projeto selecionado | `project_ref == qsuufuulxfkkeasgxhcv` |
| **A2** | Negar explicitamente o ref de produção | `!= disljhkypaxpyzvbooge`; abortar se casar |
| **B** | Preflight catálogo | 28/28 migrations concluídas (0 failed/rolled-back); 26 tabelas (incl. `DocumentoTecnico`); **zero policies** nas 26 |
| **C** | Baseline exata | 26 tabelas + `_prisma_migrations` como `relkind r/p`; **nenhuma** relação `r/p/v/m/f` fora da baseline |
| **D1** | Estado atual | capturar grants efetivos, memberships, default ACLs (incl. `supabase_admin`), roles críticos, USAGE de schema |
| **D2** | **Prova pré-apply** que o controle morde | `staging-rls-negative-control.mjs --expect-open`: sensíveis respondem **200** (há o que fechar) |
| **E** | **Vincular ref + aplicar** | aplicar por **sessão mecanicamente vinculada** a `qsuufuulxfkkeasgxhcv` (**abortar** se a vinculação não puder ser garantida); reconfirmar `project_ref` na mesma sessão; aplicar `lockdown_public_access_v2.pure.sql` (1 batch) → COMMIT |
| **F** | Leitura independente do catálogo | nova chamada; conferir POSTCONDITIONS (§4) direto no catálogo |
| **G** | Verify A–G | `verify_lockdown_v2.pure.sql` → todos A/A2/B/B2v2/C/D/E/F/G PASS (transação revertida) |
| **H** | Negative control **anon** | `staging-rls-negative-control.mjs` (sem flag): 26 negadas; POST/PATCH/DELETE negados |
| **I** | Negative control **authenticated** | mesmo script com `STAGING_AUTHENTICATED_JWT`; `/auth/v1/user==200` antes; 26 negadas |
| **J** | Positive smoke `service_role`/Storage | `smoke-storage.mjs` upload/URL/remove OK |
| **K** | **Backend smoke (Prisma/Express)** | `validate-staging.mjs` verde — **ANTES** do Advisor |
| **L** | Security Advisor | zero `rls_disabled_in_public` nas 26 (ver §11) |
| **M** | Classificar/fechar finding | somente com o close-criteria integral (ver §13) |

> Nota D1: o **backend (K) ocorre antes do Advisor (L)**; e o passo **D2 `--expect-open`** é
> obrigatório (prova que o harness morde antes do apply).

---

## 4. POSTCONDITIONS concretas (§9) — verificáveis no catálogo (passo F/G)

Para **cada uma** das 26 tabelas de domínio (`Empresa, EmpresaWhatsapp, Tecnico, DocumentoTecnico,
Servico, Material, MovimentacaoEstoque, ServicoMaterial, Usuario, ContaSocial, Notificacao, Pagamento,
SessaoConversa, Avaliacao, ConexaoBot, RegistroPonto, BatidaPonto, GoogleConta, AvaliacaoGoogle,
AnaliseAvaliacoes, CodigoRecuperacaoTotp, Assinatura, ConviteUsuario, SessaoUsuario, RefreshToken,
AuditLog`):

- `pg_class.relrowsecurity = TRUE`
- `pg_class.relforcerowsecurity = FALSE`
- policies = **0** (`pg_policies`)
- `anon` grants diretos = **0**; `authenticated` grants diretos = **0** (tabela **e coluna**)
- `PUBLIC` grants inseguros = **0**
- sequence privileges (anon/auth/PUBLIC) = **0**; routine `EXECUTE` (anon/auth/PUBLIC) = **0**

Schema `public`:
- `PUBLIC` sem `CREATE`; `PUBLIC`/`anon`/`authenticated` **sem `USAGE` efetivo** (choke point)
- `postgres`, executor, `service_role`, `supabase_admin` (quando existirem) **COM `USAGE`**

`service_role`: **preservado exatamente** — nada revogado dele; `USAGE` = true (Storage depende).

Novos objetos (defaults): não concedem a `anon`/`authenticated`/`PUBLIC` (tabela/coluna/sequence/
EXECUTE). Única exceção de catálogo tolerada: defaults de `supabase_admin` — **inócuos pelo choke
point** (ver §10).

---

## 5. VERIFY_V2_CONTRACT (§11) — `verify_lockdown_v2.pure.sql`

Tudo em `BEGIN…ROLLBACK` (nada persiste, nem probes/canários). Qualquer controle que falhe → `RAISE
EXCEPTION` → transação revertida.

| Parte | PROPERTY | MECHANISM | EXPECTED | FAIL |
|-------|----------|-----------|----------|------|
| **A** | RLS on / FORCE off nas 26 | `pg_class.relrowsecurity/relforcerowsecurity` | 26/26 on, force off | qualquer `RLS off`/`FORCE on` |
| **A2** | zero policies | `pg_policies` count por tabela | 0 em todas | qualquer policy |
| **B** | privilégio efetivo zero | `has_table/any_column/sequence/function_privilege` p/ anon/auth/PUBLIC | nenhum privilégio | qualquer priv efetivo (incl. coluna/seq/EXECUTE) |
| **B2v2** | choke point de USAGE | `has_schema_privilege` | PUBLIC/anon/auth **sem** USAGE; postgres/executor/service_role/supabase_admin **com** USAGE | anon/auth com USAGE, ou role crítico sem USAGE |
| **C** | defaults limpos + exceção única | cria probe table/seq/fn + varre `pg_default_acl` (global/public), OID 0 = PUBLIC normalizado | novos objetos limpos; única exceção tolerada = `supabase_admin` (WARNING) | default de qualquer OUTRO role concedendo a anon/auth/PUBLIC |
| **D** | negative control comportamental | `SET LOCAL ROLE anon/authenticated` → SELECT(26)/INSERT/UPDATE/DELETE/EXECUTE | tudo `42501 insufficient_privilege` | qualquer operação PERMITIDA |
| **E** | RLS deny-all NÃO-vácuo | canário próprio com 1 linha; anon com grant+USAGE efêmeros | dono vê 1; anon vê 0; grants efêmeros revogados | anon vê ≠0, ou limpeza falha |
| **F** | canário adversarial do choke point | objeto novo com grants MÁXIMOS a anon/auth/PUBLIC, RLS off | acesso **negado (42501)** só por falta de USAGE | qualquer acesso ao canário |
| **G** | baseline == inventário | `pg_class` r/p/v/m/f vs baseline; **presença exige `relkind IN ('r','p')`** | 26 + `_prisma_migrations` presentes como tabela; nenhuma relação fora da baseline (exceto probes exatas) | tabela ausente (ou view homônima), ou relação inesperada |

---

## 6. ANON_NEGATIVE_CONTROL (§12) — `staging-rls-negative-control.mjs`

Usa a **anon/publishable key** (pública por design). **Proibido** aceitar `200 []` como deny.

- **D2 (`--expect-open`, ANTES do apply):** as tabelas sensíveis (`Usuario, RefreshToken,
  SessaoUsuario, CodigoRecuperacaoTotp, Pagamento, AuditLog`) devem responder **200** (prova que há o
  que fechar; o controle morde). Sai ≠0 se já estiver fechado.
- **H (fechado, DEPOIS do apply):** matriz por principal `anon`:
  - **GET** nas 26 tabelas → negado (`401/403/404`); **nunca** `200` nem `200 []`.
  - **POST** `Usuario` → `401/403/404`.
  - **PATCH** `Usuario?id=eq.-999999` → `401/403/404`.
  - **DELETE** `Usuario?id=eq.-999999` → `401/403/404`.
  - Negação exigida por **autorização** (401/403/404), não "qualquer não-2xx".

---

## 7. AUTH_NEGATIVE_CONTROL (§13) — mesmo script, principal `authenticated`

Distinguir **autenticação Supabase** de **autorização AdmAi**. Contrato (D1 v2/DELTA):
- `STAGING_AUTHENTICATED_JWT` **ausente** (modo fechado) = **FALHA** (exit≠0) — o gate é obrigatório.
- JWT **inválido/expirado** (`GET /auth/v1/user != 200`) = **FALHA** — não prova o boundary.
- JWT **válido**: primeiro **controle positivo** `GET /auth/v1/user == 200` (principal vivo); só então
  a matriz `authenticated` (GET 26 + POST/PATCH/DELETE) → tudo negado (`401/403/404`), nunca `200 []`.

O JWT deve ser de um usuário **autenticado SEM privilégios** (o boundary é "authenticated-unprivileged
não acessa o domínio protegido via Data API"). Nunca ecoar o token.

---

## 8. SERVICE_ROLE_STORAGE_SMOKE (§14) — `smoke-storage.mjs`

`deny-all` **não pode** quebrar o runtime legítimo (Storage via `service_role`, server-side).
- **Operação:** upload de um PNG 1×1 num bucket (arg 1; default `estoque`), confirmar URL (pública
  `GET 200` ou signed URL se privado), e **remover** o objeto de teste (fixture limpa).
- **Credential:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (nunca ecoados).
- **PASS:** upload OK + URL acessível + remoção OK. **FAIL:** upload/sign/get/remove com erro.
- **Prova de capability preservada:** `service_role` continua com `USAGE` e sem revogação (§4).
- **Se o executor NÃO tiver a service-role key:** marcar **somente este subgate** como
  `VERIFICATION_REQUIRED_EXTERNAL_SECRET`. Isso permite **continuar os demais subgates** (não os
  bloqueia), **mas NÃO fecha** `STG-SEC-RLS-01` nem alcança `REAL_STAGING_ACCEPTANCE_PROVEN` sem a
  prova real de J **ou** uma **decisão D2 explícita do usuário** aceitando o risco residual (REVISOR
  `01a03681` achado 3). Bucket de documentos: `provision-bucket-documentos.mjs` (STG-03-DOC-BUCKET).

---

## 9. BACKEND_STAGING_SMOKE (§15) — `validate-staging.mjs`

`RLS_ENABLED ≠ BACKEND_RUNTIME_PROVEN`. Prova que o Prisma (owner/BYPASSRLS) segue operando:
- `prisma migrate deploy` (DIRECT_URL 5432) → `prisma generate` → `test:integration` (pooler 6543 —
  valida o P7 sob Supavisor). Trava anti-produção embutida (`ALLOW_STAGING_WRITES`, `STAGING_REF`,
  `PROD_HOST_BLOCKLIST`).
- **Dependency declarado:** um smoke de app **HTTP** (health/auth/tenant-scoped read/CRUD seguro)
  exige a **URL do backend de staging**, ainda **não provada** — ver `STG-RUNTIME` no frontier
  (§frontier). Enquanto ausente, o backend smoke = `validate-staging.mjs` (DB/pooler), e o smoke HTTP
  fica declarado como pendência de `STG-RUNTIME`, não fingido.

---

## 10. PROVIDER_DEFAULT_PRIVILEGES_MODEL (§10)

- **Fecha (v2):** todos os objetos ATUAIS (REVOKE tabelas/colunas/sequences/routines + schema
  CREATE/USAGE de PUBLIC) e os defaults dos criadores **administráveis** (ADP FOR ROLE).
- **Não tenta alterar:** os **defaults de `supabase_admin`** (role de plataforma; o `postgres` hosted
  não tem authority — `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` aborta). É a **única exceção
  tolerada** (hard-assert + WARNING; qualquer OUTRO role não-administrável ⇒ ROLLBACK).
- **Choke point substitui a authority ausente:** `REVOKE USAGE ON SCHEMA public FROM PUBLIC` +
  snapshot/regrant atômico do USAGE a todos os roles atuais **exceto** anon/authenticated. Sem USAGE
  de schema, objetos **futuros** nascidos dos defaults de `supabase_admin` (ou de qualquer grant
  futuro) **não são alcançáveis** por anon/authenticated.
- **Como B2v2 detecta regressão:** falha fail-closed se `PUBLIC`/`anon`/`authenticated` readquirirem
  `USAGE` efetivo (inclusive por membership).
- **Cenário adversarial que reabriria exposição:** um `GRANT USAGE ON SCHEMA public` futuro a
  PUBLIC/anon/authenticated, mudança de membership, ou drift equivalente. **Mitigação:** re-rodar
  `verify_lockdown_v2.pure.sql` após qualquer alteração de grants/roles no schema `public`. Correção
  dos defaults na origem = `BLOCKED_CAPABILITY_NON_BLOCKING` (provider/Supabase Support).
- **Não** transformar limitação de provider em PASS sem enforcement — o enforcement é o choke point,
  provado pelo canário F.

---

## 11. ADVISOR_EXPECTATION (§16)

- **Esperado:** **zero** `rls_disabled_in_public` (level ERROR) nas 26.
- `rls_enabled_no_policy` **é esperado** (deny-all puro) — **NÃO** criar policy só para limpar o
  Advisor.
- Qualquer **novo** ERROR: classificar individualmente (NEW_BLOCKER / NON_BLOCKING /
  EXPECTED_BY_ARCHITECTURE / FALSE_ASSUMPTION). `UNKNOWN ≠ PASS`.

---

## 12. NEGATIVE_PROOF (§17) — já PROVADO local × falta prova de estado real

| Propriedade | Prova local (feita) | Falta no staging real |
|-------------|---------------------|-----------------------|
| Deny-all não-vácuo | verify **E** (canário 1 linha; anon vê 0) | rodar verify no staging |
| Choke point neutraliza defaults futuros | verify **F** (canário grants máximos → 42501) | rodar verify no staging |
| G morde view/objeto homônimo | sabotagem local (AuditLog/`_prisma_migrations` → FALHA) | — (mecânico, já provado) |
| Atomicidade (zero estado parcial) | fault injection antes do COMMIT (buraco intacto) | comportamento igual via API (1 batch) |
| Derivação pure = fonte | byte-equivalence + A–G end-to-end nos `.pure.sql` | — |
| anon negado externamente | — (exige Data API real) | **H** (staging) |
| authenticated negado externamente | — | **I** (staging) |
| Storage/service_role opera | — | **J** (staging) |
| Backend Prisma opera | — | **K** (staging) |
| Advisor limpo | — | **L** (staging) |

Não repetir no staging as sabotagens puramente mecânicas já provadas localmente; o staging prova o
**estado real** (H/I/J/K/L) e re-roda A–G contra o catálogo real.

---

## 13. STG_SEC_RLS_CLOSE_CRITERIA (§18) — granular

`STG-SEC-RLS-01` só vira PASS total com **TODAS**:
1. **REAL APPLY** (E) com `project_ref` vinculado + COMMIT.
2. **CATALOG POSTSTATE** (F) = §4.
3. **VERIFY V2 PASS** (G) = A–G.
4. **ANON NEGATIVE CONTROL PASS** (H).
5. **AUTHENTICATED NEGATIVE CONTROL PASS** (I) com `/auth/v1/user==200`.
6. **ADVISOR ACCEPTABLE** (L).
7. **SERVICE_ROLE/RUNTIME POSITIVE PROOF** (J/K) conforme capability necessária.

Se algum subgate **não puder rodar** (ex.: sem service-role key), **não** declarar PASS total:
usar status granular por subgate (`VERIFICATION_REQUIRED_EXTERNAL_SECRET`), mantendo o finding
**ABERTO**. **Fechar `STG-SEC-RLS-01` (ou declarar `REAL_STAGING_ACCEPTANCE_PROVEN`) com J/K não
provados exige decisão D2 explícita do usuário aceitando o risco residual — não é decisão do executor
externo nem do Claude.** `BLOCKED_ITEM ≠ BLOCKED_RUN`.

---

## 14. RESTRIÇÕES DE EXECUÇÃO (D1 vinculante)

- v1 e v2 **psql** permanecem byte-intactos; os `.pure.sql` sem edição manual do corpo.
- A chamada **E** deve estar **mecanicamente vinculada** ao ref de staging (sessão incapaz de atingir
  produção); confirmação humana isolada não basta e preflight anterior não substitui identidade. **Se
  a vinculação mecânica não puder ser garantida, ABORTAR — não aplicar.** Re-provar o projeto na mesma
  sessão vinculada antes de E é defesa adicional, nunca substituto (REVISOR `01a03681` achado 1).
- Cada arquivo como **1 batch/sessão**; proibido splitter ingênuo de statements.
- Falha **antes do COMMIT** ⇒ rollback/encerramento comprovado da sessão (zero estado parcial).
- Falha do `NOTIFY` ocorre **após** o commit ⇒ classificar como **reload pendente**, nunca rollback
  do lockdown.
- Falha de smoke **não** autoriza regrant/rollback automático que reabra a exposição.
- Nenhuma policy permissiva, `FORCE RLS`, enfraquecimento do choke point, ou operação em produção.

---

## 15. Depois de fechar STG-SEC-RLS-01

Recomputar o READY_FRONTIER e seguir a cadeia até `REAL_STAGING_ACCEPTANCE_PROVEN` — specs em
`docs/eos-v2/STG_STAGING_FRONTIER_GATES.md`. Auditoria de funcionalidades permanece **DEFERRED** até
`REAL_STAGING_ACCEPTANCE_PROVEN`.
