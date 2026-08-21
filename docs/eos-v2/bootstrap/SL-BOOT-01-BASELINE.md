# SL-BOOT-01 — Execution Baseline Capture

**Slice:** `SL-BOOT-01` · **Onda:** 0 · **Gate:** `BASELINE_CAPTURED` ·
**`proofRegime`:** `BOOTSTRAP_PROOF` · **Owner:** `eosMaintainer` · **RR:** `release`
**`masterPlanVersion`:** 1.1.0 · **Run:** `EOS-RUN-20260808T030320Z`

> Objetivo (PLAN-G §Y): capturar branch, HEAD, worktree, ponto de rollback e o estado das suites
> antes de qualquer código novo, para que a implementação não seja construída sobre baseline móvel
> (§46 do Master Plan).

---

## 1. Identidade do repositório — `OBSERVED`

| Campo | Valor |
|---|---|
| Branch | `fix/seguranca-criticos` |
| HEAD | `30bf5453d847c17d88197b11c93da965406be53c` |
| `.claude/expected-head.txt` | `30bf5453d847c17d88197b11c93da965406be53c` — **confere** |
| Worktree autoritativa | `C:/Users/n1iag/dev/admai-worktrees/agent-environment` |
| Stashes | 0 |

## 2. Topologia de repositório — descoberta desta execução

`OBSERVED`: a worktree autoritativa é uma **worktree vinculada**, não um clone standalone. `.git` é um
arquivo de 1,0 KB apontando para `C:/Program Files/dev/AdmAi/.git/worktrees/agent-environment`.

**Cinco worktrees compartilham o mesmo object database:**

```
C:/Program Files/dev/AdmAi                                759c2d9  [feat/painel-axe-bloqueante]
C:/Users/n1iag/dev/admai-worktrees/agent-environment      30bf545  [fix/seguranca-criticos]  ← autoritativa
C:/Users/n1iag/dev/admai-worktrees/TASK-023-teste-cobertura  d07085c
C:/Users/n1iag/dev/admai-worktrees/TASK-024-codex-autonomia  ada6257
C:/Users/n1iag/dev/admai-worktrees/TASK-025-plugin-autonomy  45bdc1d
```

**Consequência direta:** `git worktree` **não** serve como boundary de isolamento entre writers — é
exatamente o que o `F-MAR-058` já havia estabelecido para o Shadow, e que o amendment §15 exige para o
bootstrap. Object database: 8,5 MB (`size-pack` 7,84 MiB + 671 KiB soltos). Disco livre: 151 GB.

## 3. Estado dirty e untracked — classificado (§5 do amendment)

**Nenhum `UNKNOWN`.**

| Caminho | Classe |
|---|---|
| `docs/eos-v2/` (16 arq.) · `docs/agent-environment/*.md` (5) · `docs/functionality-discovery/` | `PLANNING_ARTIFACT` |
| `tools/eos/` (37 arq.) · `tools/codex-policy/` | `EXPECTED_BASELINE_ARTIFACT` |
| `.gitignore` (M) | `EXPECTED_BASELINE_ARTIFACT` |
| `chaveiro-bot/src/routes/documentos.js` (M) + `__tests__/documentos-storage-key.test.js` | `PRODUCT_CHANGE` — DOG-001 |
| `chaveiro-painel/src/pages/Tecnicos.jsx` (M) + `__tests__/Tecnicos.test.jsx` | `PRODUCT_CHANGE` — DOG-002 |
| `.claude/` · `.codex/` · `.serena/` | `RUNTIME_CHANGE` — **não sai da integration lane** |

**O Planning Freeze inteiro está untracked.** `git clone` não o captura — daí o
`BOOTSTRAP_SOURCE_SNAPSHOT` e a cópia explícita da §4.

## 4. Estado das suites — `BOOTSTRAP_PROOF` de referência

`OBSERVED`, executadas nesta captura: `risk/verify`, `selftest/run`, `proof/verify`,
`baseline/verify`, `engineering/verify`, `knowledge/verify-decisions`, `accounting/verify` — **7/7
PASS**. Este é o oráculo de bootstrap contra o qual toda onda anterior a
`PROOF_PLANE_OPERATIONAL` será medida (`F-MAR-063`, `MASTER-INV-002`).

## 5. Findings e riscos em aberto na captura

63 Findings `F-MAR-001`…`F-MAR-063`, todos com disposição no PLAN-G §F. Known Risks ativos:
`KR-005`, `KR-007`, `KR-MAR-001`…`KR-MAR-004`. Change Requests integrados: `PBCR-001/002/003`,
`PDCR-001/002/003`.

**Observação de higiene do repositório, não causada por esta execução:** `git count-objects -v`
reporta 12 objetos de garbage (241 KiB) e onze `.idx` sem `.pack` correspondente em
`C:/Program Files/dev/AdmAi/.git/objects/pack/`. Não afeta a integridade dos objetos alcançáveis —
os clones foram criados e verificados com sucesso — mas fica registrado como estado observado.

## 6. Ponto de rollback

| Item | Valor |
|---|---|
| Commit de rollback | `30bf5453d847c17d88197b11c93da965406be53c` |
| Método | nenhum commit foi criado; todo o trabalho é untracked ou dirty sobre este HEAD |
| Workspaces de worker | descartáveis por construção — `EOS_BUILD_CLAUDE`, `EOS_BUILD_CODEX` |
| Reversão | remover os diretórios criados por esta execução; nenhum arquivo pré-existente foi alterado |

## 7. Gate

Os quatro itens exigidos pelo PLAN-G §AS para `BASELINE_CAPTURED` — branch, HEAD, suites e evidência
legada registrados — estão satisfeitos nesta captura mais o `SL-BOOT-03` (evidência legada), que corre
em paralelo.

**`SL-BOOT-01: ENGINEER_COMPLETE`** · `lifecycle: ACTIVE` · `stage: SELF_CHECK` · `outcome: NONE`
