# USER_DECISION_PROPOSAL — PROMOTE_ADMAI_TO_PRODUCTION

**Data:** 2026-08-24 (pós ciclo STG-UNBLOCK) · **Branch:** `fix/seguranca-criticos` · **Escopo:** ADMAI_SCOPE_FREEZE v1.0.0
**Terminal do ciclo:** `ADMAI_RELEASE_CANDIDATE_READY`

> **Ciclo STG-UNBLOCK (2026-08-24):** a diretiva de desbloqueio de staging foi executada até o
> limite seguro. A descoberta secret-safe de credenciais (§11) foi **exaurida** sem tocar produção
> nem expor secret — `supabase` CLI, token, env store e projeto linkado **todos ausentes**; a senha
> do banco do `admai-staging` é não-recuperável por CLI/API (só reset). Logo `STAGING_CREDENTIALS`
> permanece `BLOCKED_CAPABILITY` e **`REAL_STAGING_ACCEPTANCE_PROVEN` não foi alcançável**. O estado
> autoritativo foi reconstruído neste HEAD: Gate 6 lock+correções **13/13** (regressão TOCTOU morde),
> selftests **121/121 · 11/11 · 52/52**. Uma única ação do usuário desbloqueia todo o encadeamento
> de staging — ver bloqueio #2 abaixo.
>
> **Ciclo STG-SECURITY (2026-08-24):** com a evidência do `admai-staging` (RLS off + grants
> anon/authenticated nas 26 tabelas), abriu-se o finding **BLOQUEANTE STG-SEC-RLS-01**. O artefato de
> correção (REVOKE + RLS no-force + verify + wrapper de aplicação + negative control + runbook) foi
> implementado, validado contra Postgres 16 local (A–E PASS) e **APROVADO pelo Codex REVISOR** (thread
> 01a03185: DECISOR + REVISOR + 3 deltas). Aplicação no staging + negative control com anon key +
> re-run do Advisor seguem **BLOCKED_CAPABILITY** (credenciais); o finding continua **ABERTO** até isso.
> Produção não foi tocada (`PRODUCTION_RLS_STATE = UNKNOWN`).

## Veredito

**`ADMAI_RELEASE_CANDIDATE_READY` ATINGIDO** — o terminal técnico do ciclo sob o D2 amendment de
2026-08-23. Todo o trabalho de engenharia local e autorizado do MVP está DONE e verificado; a
fronteira de trabalho seguro está **vazia**. O Gate 6 adversarial foi **APROVADO** pelo Codex
(6 rodadas: 3 bloqueantes de segurança + 2 corridas sutis, corrigidos na raiz).

**`ADMAI_RELEASE_READY` NÃO é declarável** — por decisão soberana, `LEGAL_ACCEPTANCE = NOT_ACCEPTED`
(GAP-LEGAL DEFERRED_BY_D2). Não é falha: é o limite D2 escolhido pelo usuário. O caminho de
CANDIDATE → READY → PRODUÇÃO passa pelos 6 bloqueios abaixo, todos dependentes de decisão do
usuário, credenciais de staging ou provisionamento — nenhum executável unilateralmente por um
agente.

O **WhatsApp** saiu do escopo do release (SUPERINTEGRATION POST_MVP): implementação preservada
atrás do flag `WHATSAPP` (OFF), com não-bloqueio do MVP provado (9/9 jornadas sem provider).

## Evidência por gate (tudo verificável no repositório)

| Gate | Estado | Prova |
| --- | --- | --- |
| F0 Release Execution Readiness | ✅ | write-set-gate 121/121, ledger 11/11, run-state materializado |
| F0.5 V2 Runway | ✅ | dossiê + Codex REVISOR; zero fundação especulativa (NO_SPECULATIVE_V2_IMPLEMENTATION) |
| F1 Design Foundations | ✅ | research registry (0 UNKNOWN/FORGOTTEN) + design guide |
| F2 Entry Experience | ✅ | SL-05..09; Codex lote APROVADO (thread 01a02e9b) após 2 correções |
| F3 Release Experience | ✅ | registry 50 superfícies · KEEP 48 · REFINE 2 (legais, D2) · **REDESIGN 0**; 9/10 achados CLOSED |
| F4 Runtime Acceptance | ✅ | 2FA loop, auditoria, documentos, paywall, canário, WhatsApp HMAC, LGPD; integração 348 testes |
| F5 Staging & E2E | ✅ local / ⚠️ staging | 9/9 jornadas E2E (core+negativo+mobile) no stack real, SEM provider WhatsApp; CONFIRM_STAGING_ISOLATION provado (staging≠prod); uso de staging BLOCKED_CAPABILITY (credenciais ausentes) |
| F6 Release Engineering | ✅ | perf −44% JS público, SEO fail-closed, fontes self-hosted, 6 hardenings, backfill+drill provados, audit-gate verde |
| D2 amendment | ✅ | LEGAL→DEFERRED_BY_D2 (finding preservado, NOT_ACCEPTED); WhatsApp→POST_MVP atrás de flag com 5 provas de não-bloqueio; staging isolado |
| Gate 6 adversarial | ✅ APROVADO | 6 rodadas Codex (thread 01a02fb6): paywall Google/WhatsApp gateado; 2FA não contornável (magic-link/OAuth/phone2fa); revogação de refresh com lock FOR UPDATE serializando rotação×credencial; JWT com corte exato (iatMs); checkout sem 2ª assinatura. Regressão executável do lock (sabotagem morde). Residuais: P3 JWT legado (<1h), P2 checkout concorrente registrado |

Painel: 252 testes verdes. Bot: 348+ testes de integração + unit verdes. Fronteira de trabalho seguro: VAZIA.

## Bloqueios entre CANDIDATE e RELEASE_READY / PRODUÇÃO — 8

(WhatsApp saiu da lista: POST_MVP.)

Cada um com passo-a-passo executável e critério de aceite. Fonte completa:
`docs/eos-v2/RELEASE_BLOCKERS_SWEEP.md`.

### 1. Aceitação legal (Termos/Privacidade reais) — DEFERRED_BY_D2 (LEGAL_ACCEPTANCE=NOT_ACCEPTED)
- **Passo:** substituir os placeholders em `chaveiro-painel/src/lib/legal.js` (razão social, CNPJ,
  encarregado/DPO, e-mail, prazos) por conteúdo validado por advogado; remover o aviso de modelo.
- **Aceite:** `/privacidade` e `/termos` sem `[colchetes]` nem banner de modelo; GAP-LEGAL CLOSED.
- **Nota:** ponto único de injeção já preparado — é troca de conteúdo, zero código.

### 2. Uso do staging (migrations, runtime, E2E real) — BLOCKED_CAPABILITY
- **Passo:** colocar as credenciais do `admai-staging` (DATABASE_URL/DIRECT_URL +
  SUPABASE_SERVICE_ROLE_KEY) num `.env.staging` LOCAL fora do git; despausar o projeto; rodar
  `prisma migrate deploy` e `jornadas.mjs` com `ADMAI_URL`/`DATABASE_URL` de staging.
- **Aceite:** migrations aplicadas + 9/9 jornadas contra staging.
- **Nota:** isolamento já provado (STG-01: staging≠prod). Canal secret-safe (qualquer um dos dois):
  (a) escrever as credenciais num `.env.staging` LOCAL — já **git-ignored** (verificado neste ciclo:
  `git check-ignore` confirma bot/painel/raiz); ou (b) exportá-las como env vars locais antes de me
  invocar. Uso via `--env-file`/env, sem nunca ler nem ecoar o conteúdo. Obter os secrets pelo
  dashboard os traria ao transcript (proibido); e a senha do banco **não** é recuperável por CLI/API
  (só reset), então não existe caminho automático — é a única coisa que depende de você.
- **Nota (migration):** o staging já tem as 26 tabelas mas `_prisma_migrations` vazio ⇒ **não**
  rodar `migrate deploy` cego; usar o baseline do bloqueio **2c**.

### 2b. Segurança de staging (STG-SEC-RLS-01) — BLOCKED_CAPABILITY · finding BLOQUEANTE ABERTO
- **O quê:** 26 tabelas `public` do `admai-staging` com RLS off + grants full de `anon`/`authenticated`
  (Advisor `rls_disabled_in_public` ERROR/EXTERNAL) — exposição externa direta via PostgREST/anon key.
- **Passo (com o `.env.staging` do #2):** `node scripts/apply-rls-lockdown.mjs` (guard vinculado à
  conexão aplica `prisma/rls/lockdown_public_access.sql` + `verify_lockdown.sql`); depois
  `node scripts/staging-rls-negative-control.mjs --expect-open` (antes, prova a exposição) e sem flag
  (depois, prova negação) com a anon key; re-rodar o Security Advisor.
- **Aceite:** 26/26 RLS on; anon/authenticated sem privilégio; Data API nega as 26; Advisor zera
  `rls_disabled_in_public`; fluxo backend (Prisma/Express) segue funcionando.
- **Nota:** artefato **repo APROVADO** pelo Codex REVISOR (thread 01a03185) + re-validado local (PG16,
  verify A–E PASS + backend-owner operacional pós-lockdown + anon negado). `READY_FOR_EXTERNAL_APPLY` —
  pacote de aplicação (ref/artefatos+hashes/comandos/pós-condições/Advisor/zero-produção) em
  `docs/eos-v2/STG_SEC_RLS_01_HANDOFF.md`. `enable_rls.sql` (isolamento inter-tenant) fica intacto.
  Produção não tocada (`PRODUCTION_RLS_STATE = UNKNOWN`). Access model:
  `docs/eos-v2/STG_SEC_RLS_01_ACCESS_MODEL.md`.

### 2c. Reconciliação de migration do staging — BLOCKED_CAPABILITY
- **Passo (com o `.env.staging` do #2, após 2b):** `prisma migrate diff` (preflight); se vazio,
  baseline via `prisma migrate resolve --applied` para as 28 migrations (sem DDL); se drift → Codex D1.
- **Aceite:** `_prisma_migrations` populado, `migrate status` "up to date", sem DDL destrutivo.
- **Nota:** estratégia pronta em `docs/eos-v2/STG_MIGRATION_RECONCILIATION.md`. **Nunca** `migrate
  deploy` cego (o schema já existe).

### 3. Bucket de documentos no staging + matriz real — BLOCKED_CAPABILITY
- **Passo:** com o `.env.staging` do #2, `npm run bucket:provision` no projeto staging; rodar a
  matriz (UPLOAD / AUTHORIZED_READ / UNAUTHORIZED_DENIED / CROSS_TENANT_DENIED / DELETE) contra o
  Supabase Storage real.
- **Aceite:** os 5 casos PASS no bucket real.
- **Nota:** Storage já é compatível com Supabase; o comportamento está provado local (F4-03). O
  bucket de **produção** é item separado (D2-DOC-BUCKET), pós-promoção.

### 4. Backfill de assinaturas em produção — D2-DECISÃO
- **Passo:** `node scripts/backfill-assinaturas.mjs --politica <trial-novo|trial-do-cadastro>`
  (dry-run), revisar, depois `--aplicar`.
- **Aceite:** dry-run pós-execução mostra 0 empresas sem Assinatura.
- **Nota:** script + dry-run provados localmente (F6-05); falta a decisão de política + autorização.

### 5. Backup de produção — D2-DECISÃO (Q-010)
- **Passo:** upgrade Supabase Pro (backup diário/PITR) OU cron externo de `pg_dump` contra o pooler.
- **Aceite:** um restore de teste verificado (o drill local em RUNBOOK §Drill é o modelo).

### 6. Promoção (push/merge/deploy) — D2-DECISÃO GLOBAL
- **Passo:** a sequência da última seção, após 1–6.
- **Aceite:** decisão explícita do usuário + `ADMAI_RELEASE_READY` atingido.

## Riscos residuais aceitos (não bloqueiam; com revisita)

- **SEC-HB restantes** (enumeração 409, unsafe-inline CSP, trust-proxy): risco baixo, revisita por
  condição em `SECURITY_HARDENING_BACKLOG.md`.
- **EV-057** abuso de cadastro em massa: risco aceito pelo usuário (EV-058).
- **Desafio 2FA stateless reutilizável até expirar (5 min)** e **OTP de telefone com janela de
  verificação concorrente**: P3 do Gate 6 — exigem já possuir o fator; sem acesso unilateral.
- **V2-RISK-FLOAT-MONETARIO**: valores em Float — ARCHITECTURAL_RISK nomeado, sem consumidor no
  escopo congelado (dossiê F0.5).
- **deepmerge-ts / ip-address**: advisories allowlisted com justificativa e `reviewBy`
  (`audit-allowlist.json`); alcançáveis só por input do repositório, não de atacante.

## Plano de promoção (NÃO executado — requer autorização)

1. **Staging (bloqueio 2 + 3)** — `.env.staging` local; migrations no admai-staging; 9/9 jornadas
   + matriz de documentos contra o bucket real. (Desbloqueia a validação real de staging.)
2. **Legal (bloqueio 1)** — substituir textos por conteúdo validado; verificar `/privacidade` e
   `/termos`; `LEGAL_ACCEPTANCE` passa a ACCEPTED → habilita `ADMAI_RELEASE_READY`.
3. **Backfill (bloqueio 4)** — dry-run → decidir política → `--aplicar` em produção.
4. **Backup (bloqueio 5)** — Supabase Pro/PITR ou cron externo; restore de teste verificado.
5. **Smoke de produção** — os 13 itens de `LAUNCH_CHECKLIST.md` (linhas 331-343), hoje
   PROVADO-LOCAL (ver `DOCS_RECONCILIATION_F6.md`), repetidos contra produção.
6. **Promoção (bloqueio 6)** — merge/push/deploy, sob decisão explícita do usuário.

POST_MVP (fora deste release): conectar o provider WhatsApp e ligar o flag `WHATSAPP`.

Nenhum passo acima foi executado. Merge, push, deploy e execução em dados reais permanecem
fora do que um agente faz sem autorização — este documento é o ponto de decisão.

## Anexo — estado do ledger

83 itens: **67 DONE**, 8 DEFERRED_BY_SCOPE (inclui WhatsApp POST_MVP), 3 BLOCKED_D2, 3
BLOCKED_CAPABILITY (staging), 1 DEFERRED_BY_D2 (legal), 1 BLOCKED_EXTERNAL (bucket prod). Zero
NOT_READY/READY/IN_PROGRESS — **fronteira de trabalho seguro vazia**. Todos os gates de fase +
Gate 6 adversarial fechados; `ADMAI_RELEASE_CANDIDATE_READY` atingido.
`node tools/admai-delivery/completion-ledger.mjs --resumo` para o detalhe vivo.
