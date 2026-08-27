# 04_DECISION_INVARIANTS — decisões fechadas (NÃO redescobrir, NÃO relitigar)

1. **FEATURE_DONE ⟺ USER_REAL_CAN_USE** (critérios mínimos no `01_SESSION_BOOTSTRAP.md` §F).
2. **STAGING = ACCEPTED**; reabrir somente com regressão OBJETIVA observada. Fonte:
   `docs/eos-v2/STAGING_ACCEPTANCE_BASELINE.md`.
3. **WHATSAPP = POST_MVP** (não auditar/implementar nesta fase).
4. **VISUAL F1–F3 = CLOSED**; `BUG_FIX != VISUAL_REDESIGN` — nenhum redesign visual
   intencional durante reparo funcional, salvo usabilidade exigir E o escopo permitir.
5. **Produção exige D2 explícito** (qualquer mutação); ref `disljhkypaxpyzvbooge` = DENY.
6. **`ADMAI_SCOPE_FREEZE.md` é a autoridade de escopo** (SCOPE_FREEZE WINS).
7. **URLs/topologia atuais**: backend Railway `admai-staging-staging-c42d.up.railway.app`
   (projeto `admai-staging`, env `staging`) · frontend CF Pages
   `staging.admai-painel.pages.dev` (produção do projeto Pages = master; staging = branch
   preview custom com exclusão nativa) · Supabase staging `qsuufuulxfkkeasgxhcv`.
8. **Cobertura de contrato de API ≠ completude de feature** (registry de contratos é
   insumo, não prova de USER_REAL_CAN_USE).
9. **Suíte de integração é DESTRUTIVA** (truncate) e roda contra o DB apontado — nunca
   entre re-seed e E2E; `rls.test.js` tem skip estrutural via pooler (não remover).
10. **Fluxo Claude-Codex**: decisão técnica MATERIAL ⇒ Codex DECISOR antes de perguntar ao
    usuário; revisão de implementação ⇒ REVISOR em conversa nova (protocolos em `AGENTS.md`).
11. **Mutação exige write set validado** (`tools/admai-delivery/write-set-declarar.mjs`),
    fechado ANTES do commit (ordem declare→write→close→commit).
12. **app_rw**: role staging existe com senha ROTACIONADA (não é a fixture do repo); é papel
    previsto do design F4-RLS (`src/db/prisma.js` · `DATABASE_URL_APP`); não remover.

## Frontend Policy (síntese; política canônica veio por DIRETIVA DE CHAT — não há doc
único versionado; se um for criado, ele passa a mandar)

referência antes de invenção · design system primeiro · nada de UI genérica "cara de IA" ·
progressive disclosure · hierarquia/CTA claros · mobile-first · states completos
(loading/error/empty) · acessibilidade · motion funcional · performance.
**A auditoria funcional prioriza CORREÇÃO DE USABILIDADE antes de redesign.**
