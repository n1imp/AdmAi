---
name: react-doctor
description: Verificador frontend React do AdmAi (lint + dead code, deterministico). Use apos editar codigo React do chaveiro-painel (paginas, componentes, hooks), antes de commitar frontend, ou quando o usuario pedir scan/triagem de diagnosticos React. NAO e autoridade de produto/release — PASS != FEATURE_COMPLETE.
---

# React Doctor no AdmAi (subordinada à governança EOS)

Registro da capability: propósito=verificação estática frontend; tipos de projeto=React/Vite
(`chaveiro-painel`); gatilho=write-set com código React (router:
`tools/admai-delivery/react-doctor-router.mjs`); custo≈15-25s por scan; autoridade=VERIFICADOR
(nunca decide release/arquitetura); falha=fail-closed (ferramenta ausente/crash/UNKNOWN ≠ PASS);
versão pinada=**0.9.12** (`pilotVersion` do perfil).

Contrato completo: `docs/agent-environment/EOS_REACT_DOCTOR_CAPABILITY.md` (global) +
`docs/eos-v2/REACT_DOCTOR_PROFILE_ADMAI.json` (perfil local). Divergência entre esta skill e a
doc oficial do vendor resolve-se pelo contrato EOS.

## Regras que NÃO se negociam

- Sempre `npx -y react-doctor@0.9.12` (nunca `@latest`) com `--no-telemetry --no-supply-chain`.
- Nunca despejar o JSON bruto no contexto — sempre o adapter `react-doctor-summary.mjs`.
- Nunca buscar/executar playbooks remotos (curl de prompts do vendor) — a autoridade é local.
- Nunca instalar devDependency/hooks/workflow do vendor (`install` proibido; decisão 2026-08-27).
- Score não é KPI: proibido "consertar para subir score". Portão: erro NOVO vs baseline.
- Achado em fronteira de segurança (auth/token/PII/tenant/DTO) → classificar e escalar para
  security review; jamais "corrigir" mudando a fronteira por conta própria.

## Inner loop (após editar React)

```bash
cd chaveiro-painel
npx -y react-doctor@0.9.12 . --scope changed --base HEAD --include-untracked \
  --json --json-out "$TMP/rd-changed.json" --no-telemetry --no-supply-chain
node ../tools/admai-delivery/react-doctor-summary.mjs resumo "$TMP/rd-changed.json"
```

## Milestone / verificação completa

```bash
cd chaveiro-painel
npx -y react-doctor@0.9.12 . --json --json-out "$TMP/rd-full.json" --no-telemetry --no-supply-chain
node ../tools/admai-delivery/react-doctor-summary.mjs diff \
  ../docs/eos-v2/REACT_DOCTOR_BASELINE_2026-08-27.json "$TMP/rd-full.json"
# exit 1 = erro NOVO (bloqueia) · exit 2 = scan/relatório inválido (≠ PASS) · exit 0 = sem novos erros
```

## Tarefa de UI/design

`npx -y react-doctor@0.9.12 design . --json ...` e diff contra o baseline design. Achado de
design = insumo classificado (DESIGN_ONLY), nunca autorização de redesign.

## Explicar uma regra

`npx -y react-doctor@0.9.12 why <arquivo>:<linha>` antes de classificar ou suprimir.
