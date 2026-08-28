# EOS_REACT_DOCTOR_CAPABILITY — verificador frontend determinístico

Capability GLOBAL do EOS. Nada aqui é específico de um repositório: o que é local (versão
pinada, raízes, baselines, classificações aceitas, supressões) mora no PERFIL do projeto —
no AdmAi, `docs/eos-v2/REACT_DOCTOR_PROFILE_ADMAI.json`.

## Autoridade e limites

O React Doctor é um **verificador especializado de frontend React** (lint estático via oxlint +
dead code via Knip). Ele **não** é autoridade de arquitetura, de produto, de completude nem de
release:

| invariante | significado |
| --- | --- |
| `REACT_DOCTOR_PASS != FEATURE_COMPLETE` | passar no scan não prova que o usuário real consegue usar |
| `REACT_DOCTOR_FAIL != PRODUCT_FAILURE` | diagnóstico estático novo não reabre capability provada em runtime (`STATIC_DIAGNOSTIC != REAL_FUNCTIONAL_REGRESSION`) |
| `SCORE != KPI_SOBERANO` | proibido caçar 100/100 e proibido "consertar" para subir score; a política é `NO_NEW_BLOCKING_REACT_DOCTOR_DIAGNOSTIC` + `NO_UNEXPLAINED_SCORE_REGRESSION` |
| fronteiras de segurança | achado que toque DTO/auth/tokens/PII/tenant/`dangerouslySetInnerHTML` NÃO muda a fronteira automaticamente — exige security review; um linter jamais consome decisão D2 |

## Invocação (sempre pela versão pinada do perfil)

```bash
npx -y react-doctor@<pin> <dir> --json --json-out <arquivo> <flags do perfil>
npx -y react-doctor@<pin> <dir> --scope changed --base <ref> [--include-untracked] ...  # inner loop
npx -y react-doctor@<pin> design <dir> --json ...                                      # superfícies de UI
npx -y react-doctor@<pin> why <arquivo>:<linha>                                        # explicar regra
```

Scopes: `full` (milestones/baseline) · `changed`/`lines` (inner loop, pré-commit) · `staged`
(hook manual) · `design` (tarefas de UI; regras design são opt-in no scan geral). O relatório é
JSON `schemaVersion 3`; **nunca** despeje o relatório bruto no contexto de um LLM — use o
adapter (`tools/admai-delivery/react-doctor-summary.mjs`):

```bash
node tools/admai-delivery/react-doctor-summary.mjs resumo   <report.json>              # métricas compactas
node tools/admai-delivery/react-doctor-summary.mjs baseline <report.json> <out.json>   # baseline versionável (ids)
node tools/admai-delivery/react-doctor-summary.mjs diff     <baseline.json> <report.json>  # exit 1 = erro NOVO
```

Pipeline de economia: JSON → filtro determinístico → diff contra baseline → só achados novos ou
materiais chegam ao agente.

## Roteamento automático

`tools/admai-delivery/react-doctor-router.mjs` decide por write-set (perfil fornece raízes/
extensões/sinais): arquivo React sob raiz frontend → capability selecionada; backend/Prisma/
SQL/docs/infra-only → não; página/componente de UI → também `design`. Testes/e2e sozinhos não
disparam. Selftest cobre os quatro casos canônicos.

## Classificação de diagnóstico (obrigatória antes de agir)

Todo diagnóstico triado recebe: regra · arquivo · severidade · classificação · razão · ação.
Classes: `TRUE_POSITIVE` · `FALSE_POSITIVE` · `LEGACY_DEBT` · `ACCEPTED_ARCHITECTURE` ·
`NEW_REGRESSION`; risco: `CORRECTNESS_RISK` / `SECURITY_RISK` / `ACCESSIBILITY_RISK` /
`PERFORMANCE_RISK` / `MAINTAINABILITY_ONLY` / `DESIGN_ONLY`.

Prioridade de ação: SECURITY → CORRECTNESS → ACCESSIBILITY → PERFORMANCE → MAINTAINABILITY →
DESIGN. Correção só quando D0/D1, reversível e material — **sem campanha de limpeza em massa**.
Processo por achado: REPRODUCE → DECLARE WRITE SET → FIX mínimo → TARGETED TEST → re-scan →
lint → build → prova de browser/E2E se comportamento mudou → COMMIT (um achado ≠ outro achado).

## Baseline e portão

O baseline versionado (gerado pelo adapter) carrega os `id`s estáveis
(`arquivo::linha:coluna::plugin/regra::hash`). O portão inicial: **bloqueia somente diagnóstico
NOVO de severidade `error`** (o `diff` sai 1). Avisos novos são reportados e triados; legado não
bloqueia; score não bloqueia. Edição que desloca linhas renomeia ids — o adapter marca pares
novo+resolvido da mesma regra/arquivo como `deslocamentoProvavel` para triagem barata.
Regenerar baseline **somente** após mudança auditada; nunca para silenciar achado novo.

## Supressão

Entender a regra (`why`/`rules explain`) → corrigir a causa quando material → classificar →
só então suprimir, no escopo mais estreito possível e com razão registrada no perfil
(`supressoes`). Proibido desligar categoria inteira para calar um achado.

## Semântica de falha (fail-closed)

| condição | veredito |
| --- | --- |
| ferramenta indisponível / npx falhou | `TOOL_UNAVAILABLE != PASS` |
| scan crashou / `ok != true` / schema desconhecido | `SCAN_CRASH != PASS` (adapter sai 2) |
| resultado não interpretável | `UNKNOWN != PASS` |
| diagnóstico novo bloqueante | `!= PASS` (diff sai 1) |
| diagnóstico legado | `!= FAIL automático` |
| score caiu | `!= FAIL automático` — exige explicação, não pânico |

## Versão e privacidade

A versão é **pinada** no perfil (`@latest` proibido em gate crítico). Upgrade = re-baseline +
revalidação do adapter (schema) + controle negativo re-executado + registro. Flags de
privacidade do perfil (ex.: `--no-telemetry`, `--no-supply-chain`) são obrigatórias em toda
invocação — nenhum dado do repo sai para score API/share/Socket.dev sem decisão explícita do
usuário.

## Controle negativo (prova de detector vivo)

Ao adotar a capability num repo (e a cada upgrade de pin): injetar antipadrão documentado em
arquivo temporário não-versionado → scan detecta (incluindo 1 classe `error` para exercitar o
exit 1) → restaurar exato → re-scan → diff zero → `git status` limpo →
`SYNTHETIC_REGRESSION_RESIDUAL=0`. Piloto AdmAi 2026-08-27: PROVADO (secret warning + eval
error; restore limpo).
