# USER_DECISION_PROPOSAL — PROMOTE_ADMAI_TO_PRODUCTION

**Data:** 2026-08-24 (pós D2 amendment) · **Branch:** `fix/seguranca-criticos` · **Escopo:** ADMAI_SCOPE_FREEZE v1.0.0
**Terminal do ciclo:** `ADMAI_RELEASE_CANDIDATE_READY`

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

## Bloqueios entre CANDIDATE e RELEASE_READY / PRODUÇÃO — 6

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
- **Nota:** isolamento já provado (STG-01: staging≠prod). Obter os secrets pelo dashboard os
  traria ao transcript (proibido) — por isso o uso via `--env-file` sem ecoar é o caminho seguro.

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
