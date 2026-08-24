# Sweep global de bloqueios — ADMAI_RELEASE_CANDIDATE_READY  (2026-08-24, pós D2 amendment)

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

## Bloqueios entre CANDIDATE e RELEASE_READY / PRODUÇÃO — 6

| # | Bloqueio | Tipo | Fonte | Destrava |
| --- | --- | --- | --- | --- |
| 1 | Aceitação legal (Termos/Privacidade reais) | DEFERRED_BY_D2 | D2-LEGAL · GAP-LEGAL-MODELO-01 | conteúdo validado por advogado OU novo D2; finding preservado, `NOT_ACCEPTED`, nunca PASS |
| 2 | Uso do staging (migrations, runtime, E2E real) | BLOCKED_CAPABILITY | STG-02-USO | `.env.staging` local com credenciais do admai-staging (uso via `--env-file`, sem expor) |
| 3 | Bucket de documentos no staging + matriz real | BLOCKED_CAPABILITY | STG-03-DOC-BUCKET | idem #2 (Storage já é compatível com Supabase; comportamento provado local em F4-03) |
| 4 | Backfill de assinaturas em produção | BLOCKED_D2 | D2-BACKFILL-PROD | autorização + política; script + dry-run provados (F6-05) |
| 5 | Backup de produção (Supabase Free) | BLOCKED_D2 | D2-Q010-BACKUP | upgrade Pro/PITR ou cron externo; drill local provado (F6-07) |
| 6 | Promoção (push/merge/deploy) | BLOCKED_D2 | D2-PROMOTION | resolução do #1 + decisão explícita do usuário |

`D2-DOC-BUCKET` (bucket de **produção**) permanece BLOCKED_EXTERNAL, distinto do #3 (staging).

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

## Reconciliação com o freeze + amendment

Registry: 50 superfícies, KEEP 48, REFINE 2 (só as legais, agora DEFERRED_BY_D2), REDESIGN 0.
Achados: 9 de 10 CLOSED; o único aberto é GAP-LEGAL (= bloqueio #1). Nada fora do escopo
congelado; WhatsApp permanece implementado mas gated. Gate 6 adversarial APROVADO.
