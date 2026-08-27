# NEXT_SESSION_PROMPT (copie/cole numa sessão NOVA do Claude)

```
EOS — ADMAI FUNCTIONAL PRODUCT AUDIT — SESSION BOOT

1. Leia, NESTA ordem, e nada além disso para começar:
   - docs/eos-v2/current/01_SESSION_BOOTSTRAP.md
   - docs/eos-v2/current/02_CURRENT_STATE.md
   - docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json

2. Verifique: git branch --show-current · git status · git rev-parse HEAD.
   Compare com CURRENT_STATE. Divergência ⇒ classifique
   (EXPECTED_NEW_COMMIT / UNCOMMITTED_WORK / STALE_CURRENT_STATE / UNKNOWN)
   antes de qualquer leitura histórica. Nunca resete branch por nome.

3. Use docs/eos-v2/current/03_PROJECT_INDEX.md SOB DEMANDA para navegar;
   04_DECISION_INVARIANTS.md e 05_CARRYOVER_FINDINGS.md quando relevantes;
   histórico = READ_ON_DEMAND_ONLY (política em 06_CONTEXT_ECONOMY_POLICY.md).

4. Execute o READY_FRONTIER: ADMAI_FUNCTIONAL_PRODUCT_AUDIT, começando por
   FUNCTIONAL_CAPABILITY_INVENTORY, persistindo progresso no audit ledger
   (checkpoints semânticos; CHAT != estado do projeto).

Regras duras:
- FEATURE_DONE = USER_REAL_CAN_USE (backend pronto ≠ feature pronta; testes
  passando ≠ feature pronta).
- Staging está ACEITO (baseline tag admai-staging-accepted-2026-08-27):
  NÃO reabrir sem regressão objetiva.
- PRODUÇÃO PROIBIDA sem D2 explícito (Supabase ref disljhkypaxpyzvbooge = DENY).
- WHATSAPP = POST_MVP. Escopo: ADMAI_SCOPE_FREEZE.md MANDA.
- Mutação requer write set validado (tools/admai-delivery/), fechado antes do commit.
- Decisão técnica material ⇒ Codex DECISOR (AGENTS.md) antes de perguntar ao usuário.
```
