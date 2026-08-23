# Sweep global de bloqueios — ADMAI_RELEASE_READY  (2026-08-23)

Reconstrução de TODAS as fontes (ledger, surface-registry, findings, DOCS_RECONCILIATION_F6,
SECURITY_HARDENING_BACKLOG) do que ainda impede `ADMAI_RELEASE_READY`. Invariante:
`ZERO_FORGOTTEN_BLOCKER` — todo bloqueio tem fonte-de-verdade, tipo e condição de revisita.

`ADMAI_RELEASE_READY` **não** pode ser declarado enquanto esta lista de bloqueios D2/externo
não estiver vazia. O terminal legítimo é `USER_DECISION_PROPOSAL`, não um READY maquiado.

## Bloqueios que impedem o READY (7)

| # | Bloqueio | Tipo | Fonte-de-verdade | Destrava |
| --- | --- | --- | --- | --- |
| 1 | Textos legais reais (razão social, CNPJ, DPO, prazos) | D2-DECISÃO | GAP-LEGAL-MODELO-01 (registry) · D2-LEGAL (ledger) | conteúdo validado por advogado; ponto único de injeção já preparado (`lib/legal.js`) |
| 2 | Staging de aplicação verificado | BLOCKED_EXTERNAL | F5-03-STAGING-VALIDA · sonda F5 | provisionar Railway service + unpause Supabase `admai-staging` (custo → decisão) |
| 3 | Bucket DOCUMENTOS produção | BLOCKED_EXTERNAL | D2-DOC-BUCKET · GAP-DOC-01 | `npm run bucket:provision` com credenciais prod |
| 4 | Provider WhatsApp ponta real | BLOCKED_EXTERNAL | D2-WPP-PROVIDER · GAP-WPP-RT | provider Evolution/Cloud conectado (split de uploads F6-04 já feito como pré-requisito) |
| 5 | Backfill de assinaturas em produção | D2-DECISÃO | D2-BACKFILL-PROD · Gate 5 | usuário autoriza execução + escolhe política (`--politica`); script + dry-run provados (F6-05) |
| 6 | Backup de produção (Supabase Free sem cobertura) | D2-DECISÃO | D2-Q010-BACKUP · RUNBOOK §3 | upgrade Pro/PITR ou cron externo; drill local provado (F6-07) |
| 7 | Promoção (push/merge/deploy) | D2-DECISÃO | D2-PROMOTION | `ADMAI_RELEASE_READY` atingido **E** decisão explícita do usuário |

## Diferidos por escopo (não bloqueiam; ficam com revisita) — 6

- **SEC-HB-RESTANTES** — itens C do backlog (enumeração 409, unsafe-inline CSP, trust-proxy, etc.):
  risco baixo, revisita por condição própria em `SECURITY_HARDENING_BACKLOG.md`.
- **EV-057-ABUSO-CADASTRO** — abuso de cadastro em massa: risco aceito pelo usuário (EV-058).
- **F-MAR-070-DEDUP** — EXECUTION_STATE duplicado entre worktrees (lane EOS congelada).
- **CLOUD-INBOUND-FILA** — paridade de fila no Meta Cloud inbound: robustez de feature INCLUÍDA,
  condicionada ao provider (#4).
- **V2-PREP-RECEPCAO-DURAVEL / V2-RISK-FLOAT-MONETARIO** — capacidades V2 (dossiê F0.5): DEFER;
  Float monetário é ARCHITECTURAL_RISK nomeado, sem consumidor no escopo congelado.

## Reconciliação com o freeze (ADMAI_SCOPE_FREEZE v1.0.0)

- **Nada fora do escopo foi construído.** Todo trabalho desta execução caiu dentro das 49
  superfícies + os fluxos de runtime já existentes; a única superfície NOVA (`/assinatura`, SL-10)
  é a "superfície mínima de billing" que o usuário aprovou explicitamente (2026-08-23), sobre 3
  endpoints que já existiam.
- **Registry final**: 50 superfícies · KEEP 48 · REFINE 2 (só as legais, exceção D2) · REDESIGN 0.
- **Achados compartilhados**: 9 de 10 CLOSED; o único aberto é GAP-LEGAL (= bloqueio #1).
- **Escopo negado permanece negado**: CRM, Orçamentos, Agenda, Offline etc. continuam fora — zero
  linha de código adicionada para eles.

## Estado dos gates de fase

F0 · F0.5 · F1 · GATE-F2-ENTRY · GATE-F3-EXPERIENCE · GATE-F4-RUNTIME · GATE-F5-STAGING (parcial,
staging BLOCKED_EXTERNAL honesto): **DONE**. Falta apenas GATE-F6-RELEASE-ENG (depende do Gate 6
adversarial) antes do terminal.
