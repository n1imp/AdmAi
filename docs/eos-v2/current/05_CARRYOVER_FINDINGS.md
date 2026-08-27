# 05_CARRYOVER_FINDINGS — findings VIVOS que atravessam a transição

## SEC-HB-STG-INTEGRATION-FIXTURE-DESTRUCTION
- CLASSIFICATION: ENGINEERING_BACKLOG / TEST_INFRA_DEBT
- IMPACT: a suíte de integração TRUNCATE CASCADE destrói fixtures E2E quando aponta ao
  mesmo DB da aceitação; obriga re-seed e proíbe rodar a suíte entre seed e E2E.
- CURRENT_STATE: mitigado operacionalmente (ordem de fases + re-seed); causa raiz aberta.
- WHEN_TO_REVISIT: antes do próximo ciclo de aceitação que reutilize staging; correção =
  lifecycle isolado (schema/DB dedicado) ou guard `ALLOW_DESTRUCTIVE_INTEGRATION`.
- SOURCE: `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` + `AGENT_DECISIONS.md` (buscar o ID).

## SEC-HB-STG-INTEGRATION-SECURITY-CLEANUP
- CLASSIFICATION: ENGINEERING_BACKLOG / TEST_INFRA_DEBT
- IMPACT: fase de teste que altera boundary de segurança sem cleanup em finally/trap pode
  deixar staging degradado em abort (aconteceu: FORCE+policies v1 sobre v2).
- CURRENT_STATE: recorrência bloqueada p/ o caso conhecido (skip estrutural do rls.test via
  pooler decide ANTES dos hooks); princípio geral pendente.
- WHEN_TO_REVISIT: ao tocar test-infra ou adicionar testes que mutem boundary.
- SOURCE: idem acima; restauração de referência: `chaveiro-bot/scripts/restore-rls-v2-noforce.mjs`.

## DESKTOP-LOGOUT-CONTROL-MISSING (audit alias: `AUD-INPUT-DESKTOP-LOGOUT`)
- CLASSIFICATION: FUNCTIONAL_PRODUCT_AUDIT_INPUT
- IMPACT: desktop não expõe controle de logout (único "Sair" vive em `/mais`, aba do nav
  mobile); higiene de sessão em máquina compartilhada.
- CURRENT_STATE: registrado como entrada inicial do audit ledger; sem correção ainda.
- WHEN_TO_REVISIT: durante a auditoria da capability AUTH/SESSÃO.
- SOURCE: `docs/eos-v2/ADMAI_FUNCTIONAL_PRODUCT_AUDIT_LEDGER.json` (`entradasIniciais`) +
  backlog.
