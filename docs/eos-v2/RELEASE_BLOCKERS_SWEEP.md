# Sweep global de bloqueios — ADMAI_RELEASE_CANDIDATE_READY  (2026-08-24, pós ciclo STG-UNBLOCK)

Reconstrução de TODAS as fontes do que ainda impede o release, sob o D2 amendment de 2026-08-23
(LEGAL → DEFERRED_BY_D2; WhatsApp → SUPERINTEGRATION POST_MVP; staging existente autorizado).
Invariante `ZERO_FORGOTTEN_BLOCKER`: todo bloqueio tem fonte, tipo e revisitCondition.

**Terminal do ciclo: `ADMAI_RELEASE_CANDIDATE_READY`** — não `ADMAI_RELEASE_READY`, porque
`LEGAL_ACCEPTANCE = NOT_ACCEPTED` (D2-LEGAL DEFERRED_BY_D2). A fronteira de trabalho seguro está
**vazia**: nada resta em NOT_READY/READY/IN_PROGRESS; os itens abaixo dependem de decisão do
usuário, credenciais ou provisionamento.

## Bloqueios do RELEASE_CANDIDATE (o que precisa esvaziar para chegar lá) — nenhum

O candidato técnico está **atingido**: todo o trabalho de engenharia local e autorizado do MVP
está DONE e verificado. Não há bloqueio técnico pendente para `ADMAI_RELEASE_CANDIDATE_READY`.

## Bloqueios entre CANDIDATE e RELEASE_READY / PRODUÇÃO — 8

| # | Bloqueio | Tipo | Fonte | Destrava |
| --- | --- | --- | --- | --- |
| 1 | Aceitação legal (Termos/Privacidade reais) | DEFERRED_BY_D2 | D2-LEGAL · GAP-LEGAL-MODELO-01 | conteúdo validado por advogado OU novo D2; finding preservado, `NOT_ACCEPTED`, nunca PASS |
| 2 | Uso do staging (migrations, runtime, E2E real) | BLOCKED_CAPABILITY | STG-02-USO | canal secret-safe do usuário: `.env.staging` local (já git-ignored) **ou** env vars locais; uso via `--env-file`, sem ler/ecoar |
| 2b | **Segurança de staging (STG-SEC-RLS-01)** — RLS off + grants anon/authenticated nas 26 | BLOCKED_CAPABILITY (finding BLOQUEANTE ABERTO) | STG-SEC-RLS-01 | artefato **repo APROVADO** (Codex REVISOR); aplicar no admai-staging via `apply-rls-lockdown.mjs` + verify + negative control (anon key) + Advisor. Depende de #2 |
| 2c | Reconciliação de migration do staging (baseline não rastreado) | BLOCKED_CAPABILITY | STG-MIG-RECON | estratégia pronta (baseline via `migrate resolve`, sem `deploy` cego); depende de #2 e do boundary 2b |
| 3 | Bucket de documentos no staging + matriz real | BLOCKED_CAPABILITY | STG-03-DOC-BUCKET | idem #2 (Storage já é compatível com Supabase; comportamento provado local em F4-03) |
| 4 | Backfill de assinaturas em produção | BLOCKED_D2 | D2-BACKFILL-PROD | autorização + política; script + dry-run provados (F6-05) |
| 5 | Backup de produção (Supabase Free) | BLOCKED_D2 | D2-Q010-BACKUP | upgrade Pro/PITR ou cron externo; drill local provado (F6-07) |
| 6 | Promoção (push/merge/deploy) | BLOCKED_D2 | D2-PROMOTION | resolução do #1 + decisão explícita do usuário |

`D2-DOC-BUCKET` (bucket de **produção**) permanece BLOCKED_EXTERNAL, distinto do #3 (staging).

### STG-SEC-RLS-01 — finding BLOQUEANTE de segurança (staging) — repo APROVADO

Evidência direta do `admai-staging` (ref `qsuufuulxfkkeasgxhcv`): 26 tabelas `public` com RLS
DISABLED + grants full de `anon`/`authenticated` (Advisor `rls_disabled_in_public` ERROR/EXTERNAL)
⇒ qualquer um com a anon key lê/escreve tudo via PostgREST, contornando o backend. Auditoria:
todas as 26 são PRISMA_ONLY; `anon`/`authenticated` não são usados pela app ⇒ revogar tem risco
ZERO. **Decisão D1** (Codex, thread 01a03164): REVOKE integral de anon/authenticated/PUBLIC +
ENABLE RLS (NO FORCE, sem policy). **Artefato versionado APROVADO** pelo Codex REVISOR (thread
01a03185, após 3 deltas): `prisma/rls/lockdown_public_access.sql` + `verify_lockdown.sql` +
`scripts/apply-rls-lockdown.mjs` (guard vinculado à conexão) + `staging-rls-negative-control.mjs`
+ `RUNBOOK_lockdown.md`; validado contra Postgres 16 local (A–E PASS). **`PRODUCTION_RLS_STATE =
UNKNOWN`** (produção não tocada). Finding **ABERTO** até aplicar no staging + negative control com
anon key + re-run do Advisor. Detalhe: `docs/eos-v2/STG_SEC_RLS_01_ACCESS_MODEL.md`.

**`READY_FOR_EXTERNAL_APPLY` (§51):** re-provado local no HEAD `405d5cf` (verify A–E PASS + backend-owner
operacional pós-lockdown + anon negado). Pacote de aplicação externa (ref, artefatos+hashes, comandos,
pós-condições, estado esperado do Advisor, negative controls, zero-produção):
`docs/eos-v2/STG_SEC_RLS_01_HANDOFF.md`. Não é PASS — só a aplicação real fecha o finding.

## Diferidos por escopo (não bloqueiam; com revisita) — 8

- **WHATSAPP_SUPERINTEGRATION** (D2-WPP-PROVIDER) — POST_MVP por decisão do usuário; implementação
  preservada atrás do flag `WHATSAPP` (OFF). Não-bloqueio do MVP **provado** (D2-WPP-GATING).
- **CLOUD-INBOUND-FILA** — robustez de fila do inbound Cloud, condicionada ao provider (POST_MVP).
- **SEC-HB restantes, EV-057, F-MAR-070, V2-PREP-RECEPCAO-DURAVEL, V2-RISK-FLOAT-MONETARIO,
  P2-CHECKOUT-CONCORRENTE** — todos com revisitCondition própria no ledger.

## Isolamento de staging (CONFIRM_STAGING_ISOLATION) — provado

`STG-01-ISOLAMENTO` DONE: `admai-staging` e `AdmAi` (prod) são projetos Supabase **distintos** na
org n1imp (nomes/refs diferentes ⇒ DB e credenciais próprios de cada um). O projeto de produção
**não foi tocado** — só a lista da org foi lida, zero secrets, `NO_PRODUCTION_CUSTOMER_IMPACT`.
A comparação byte a byte de credenciais exigiria lê-las (secrets) e não foi feita por política.

## Descoberta secret-safe de credenciais (ciclo STG-UNBLOCK, 2026-08-24) — exaurida

A diretiva STAGING UNBLOCK exige tentar todas as fontes seguras (§11) antes de declarar
`BLOCKED_CAPABILITY`. Feito, sem tocar produção e sem expor nenhum valor (só nomes/estados):

| Fonte (prioridade §11) | Resultado |
| --- | --- |
| `.env.staging` local | ABSENT (só o template `.env.staging.example`) |
| Secret store por env (7 nomes) | TODOS ABSENT (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DATABASE_URL`, `DATABASE_URL`, `DIRECT_URL`, `STAGING_REF`) |
| CLI/provider auth | `supabase` CLI **ABSENT**; `~/.supabase` ABSENT; sem projeto linkado / `config.toml` |
| Mecanismo provider-native sem exposição | Inexistente: sem CLI para invocar; e a **senha do banco** do `admai-staging` é **não-recuperável** por CLI/API após a criação (só reset — mutação não autorizada). O dashboard exporia service-role em screenshot/transcript (§13/§16). |

`missingVariableNames = {DATABASE_URL, DIRECT_URL, SUPABASE_SERVICE_ROLE_KEY}` do `admai-staging`.
Conclusão: `STAGING_CREDENTIALS = BLOCKED_CAPABILITY` — bloqueio de **capacidade**, não de trabalho.
`STAGING_CREDENTIALS_READY` **não** foi atingido; todo o encadeamento §21–§51 (migrations → runtime →
bucket → E2E real) permanece bloqueado no primeiro gate. **`REAL_STAGING_ACCEPTANCE_PROVEN` não é
alcançável neste ciclo.**

### Estado autoritativo reconstruído neste HEAD (`c876527`) — §2/§68

Não confiei nos números do último estado; re-executei o que é local e determinístico:
Gate 6 (lock + correções) **13/13** — inclui a regressão TOCTOU de 2 conexões que **morde**;
selftests write-set-gate **121/121**, completion-ledger **11/11**, EOS **52/52**. As versões
**reais em staging** dessas provas continuam bloqueadas por credencial; a postura de segurança
**local** está verde e defendida.

## Reconciliação com o freeze + amendment

Registry: 50 superfícies, KEEP 48, REFINE 2 (só as legais, agora DEFERRED_BY_D2), REDESIGN 0.
Achados: 9 de 10 CLOSED; o único aberto é GAP-LEGAL (= bloqueio #1). Nada fora do escopo
congelado; WhatsApp permanece implementado mas gated. Gate 6 adversarial APROVADO.
