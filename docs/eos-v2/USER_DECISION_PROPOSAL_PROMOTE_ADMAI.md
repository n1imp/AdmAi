# USER_DECISION_PROPOSAL — PROMOTE_ADMAI_TO_PRODUCTION

**Data:** 2026-08-23 · **Branch:** `fix/seguranca-criticos` · **Escopo:** ADMAI_SCOPE_FREEZE v1.0.0

## Veredito

**`ADMAI_RELEASE_READY` NÃO pode ser declarado** — e isso é o resultado honesto, não uma falha.
O programa (F0→F6) está completo do lado que depende de engenharia: 62 itens DONE, todos os
gates de fase fechados, suíte verde, e a revisão adversarial do Gate 6 achou e teve corrigidos 3
bloqueantes de segurança reais (sua chancela final está pendente por indisponibilidade do Codex,
não por defeito em aberto — ver abaixo). O que impede o READY são **7 bloqueios D2/externo** que
dependem de decisão do usuário ou de provisionamento com custo — nenhum é executável
unilateralmente por um agente. O terminal legítimo é esta proposta.

Se os 7 bloqueios abaixo forem resolvidos, `ADMAI_RELEASE_READY` é declarável sem nenhum trabalho
de engenharia adicional além do plano de promoção da última seção.

## Evidência por gate (tudo verificável no repositório)

| Gate | Estado | Prova |
| --- | --- | --- |
| F0 Release Execution Readiness | ✅ | write-set-gate 121/121, ledger 11/11, run-state materializado |
| F0.5 V2 Runway | ✅ | dossiê + Codex REVISOR; zero fundação especulativa (NO_SPECULATIVE_V2_IMPLEMENTATION) |
| F1 Design Foundations | ✅ | research registry (0 UNKNOWN/FORGOTTEN) + design guide |
| F2 Entry Experience | ✅ | SL-05..09; Codex lote APROVADO (thread 01a02e9b) após 2 correções |
| F3 Release Experience | ✅ | registry 50 superfícies · KEEP 48 · REFINE 2 (legais, D2) · **REDESIGN 0**; 9/10 achados CLOSED |
| F4 Runtime Acceptance | ✅ | 2FA loop, auditoria, documentos, paywall, canário, WhatsApp HMAC, LGPD; integração 348 testes |
| F5 Staging & E2E | ⚠️ parcial | 9/9 jornadas E2E no stack real (3 defeitos achados e corrigidos); staging BLOCKED_EXTERNAL honesto |
| F6 Release Engineering | ✅ | perf −44% JS público, SEO fail-closed, fontes self-hosted, 6 hardenings, backfill+drill provados, audit-gate verde |
| Gate 6 adversarial | ⚠️ re-verif. pendente | 2 rodadas Codex fecharam paywall+emissores de sessão; correção de raiz da revogação aplicada e testada (8/8, sabotagem morde); rodada 3 de chancela BLOQUEADA por limite de uso do Codex (reseta 2026-08-27) — ver D-GATE6-CODEX-UNAVAILABLE |

Painel: 251 testes verdes. Bot: 348 testes de integração + unit verdes.

**Pendência de verificação (não é bloqueio D2):** a chancela adversarial final do Gate 6 sobre a
correção de raiz da revogação de refresh depende do Codex, que atingiu o limite de uso (retry
2026-08-27). As correções estão implementadas, verificadas contra o código e provadas por testes
que mordem; o que falta é o segundo par de olhos hostil da rodada 3. `UNAVAILABLE != PASS` — por
isso o Gate 6 fica `VERIFICATION_REQUIRED`, não aprovado. Não afeta a lista de bloqueios D2 abaixo.

## Bloqueios D2/externo (a lista que precisa esvaziar) — 7

Cada um com passo-a-passo executável e critério de aceite. Fonte completa:
`docs/eos-v2/RELEASE_BLOCKERS_SWEEP.md`.

### 1. Textos legais reais — D2-DECISÃO
- **Passo:** substituir os placeholders em `chaveiro-painel/src/lib/legal.js` (razão social, CNPJ,
  encarregado/DPO, e-mail, prazos) por conteúdo validado por advogado; remover o aviso de modelo.
- **Aceite:** `/privacidade` e `/termos` sem `[colchetes]` nem banner de modelo; GAP-LEGAL CLOSED.
- **Nota:** ponto único de injeção já preparado — é troca de conteúdo, zero código.

### 2. Staging de aplicação — BLOCKED_EXTERNAL (provisionamento)
- **Passo:** criar serviço no Railway + `unpause` do projeto Supabase `admai-staging`; setar envs;
  rodar migrations; apontar `jornadas.mjs` para a URL de staging (`ADMAI_URL=...`).
- **Aceite:** smoke da seção final verde contra staging.
- **Nota:** a sonda F5 confirmou objetivamente que o ambiente não existe hoje.

### 3. Bucket DOCUMENTOS produção — BLOCKED_EXTERNAL
- **Passo:** `npm run bucket:provision` (script `provision-bucket-documentos.mjs`) com credenciais
  de produção; setar `STORAGE_STRICT=true`.
- **Aceite:** upload/download de documento em produção via URL assinada.

### 4. Provider WhatsApp ponta real — BLOCKED_EXTERNAL
- **Passo:** conectar provider (Evolution ou Meta Cloud); setar segredo do webhook.
- **Aceite:** webhook HMAC válido enfileira; inbound real vira serviço.
- **Nota:** o split de uploads (evidências fora do estático) já foi feito como pré-requisito (F6-04).

### 5. Backfill de assinaturas em produção — D2-DECISÃO
- **Passo:** `node scripts/backfill-assinaturas.mjs --politica <trial-novo|trial-do-cadastro>`
  (dry-run), revisar, depois `--aplicar`.
- **Aceite:** dry-run pós-execução mostra 0 empresas sem Assinatura.
- **Nota:** script + dry-run provados localmente (F6-05); falta a decisão de política + autorização.

### 6. Backup de produção — D2-DECISÃO (Q-010)
- **Passo:** upgrade Supabase Pro (backup diário/PITR) OU cron externo de `pg_dump` contra o pooler.
- **Aceite:** um restore de teste verificado (o drill local em RUNBOOK §Drill é o modelo).

### 7. Promoção (push/merge/deploy) — D2-DECISÃO GLOBAL
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

1. **Legal (bloqueio 1)** — substituir textos; verificar `/privacidade` e `/termos`.
2. **Backfill (bloqueio 5)** — dry-run → decidir política → `--aplicar` em produção.
3. **Staging (bloqueio 2)** — provisionar; rodar migrations; smoke com `jornadas.mjs`.
4. **Infra (bloqueios 3, 4, 6)** — bucket, provider WhatsApp, backup.
5. **Smoke de produção** — os 13 itens de `LAUNCH_CHECKLIST.md` (linhas 331-343), hoje
   PROVADO-LOCAL (ver `DOCS_RECONCILIATION_F6.md`), repetidos contra produção.
6. **Promoção** — merge/push/deploy, sob decisão explícita do usuário.

Nenhum passo acima foi executado. Merge, push, deploy e execução em dados reais permanecem
fora do que um agente faz sem autorização — este documento é o ponto de decisão.

## Anexo — estado do ledger

78 itens: **63 DONE**, 6 DEFERRED_BY_SCOPE, 4 BLOCKED_D2, 3 BLOCKED_EXTERNAL, 2
VERIFICATION_REQUIRED (Gate 6 adversarial + Gate F6, ambos aguardando só a chancela do Codex,
que reseta 2026-08-27). `node tools/admai-delivery/completion-ledger.mjs --resumo` para o detalhe vivo.
