# PLAN-G — Integration Master Plan + Planning Freeze

**Run:** `EOS-RUN-20260808T030320Z` · **`masterPlanVersion: 1.0.0`** · **Data:** 2026-08-12

> Nada aqui está implementado, executado ou ativo. Marcações: `OBSERVED` (arquivo, linha, comando ou
> saída), `INFERRED`, `PROPOSED`, `UNKNOWN`. Nenhum componente é `IMPLEMENTED`, `OPERATIONAL`,
> `ACTIVE` ou `PROVEN`.

---

## A. Escopo

Reconciliar PLAN-A a PLAN-F, resolver dependências e ciclos de bootstrap, consolidar Findings,
Change Requests, invariantes, artefatos, eventos, capabilities e gates, produzir o
`EOS_MASTER_IMPLEMENTATION_PLAN` e, se todos os critérios forem satisfeitos, declarar
`PLANNING_FREEZE_READY`.

**PLAN-G não é PLAN-H disfarçado:** nenhuma camada arquitetural nova, nenhum subsistema novo. A única
pergunta é se A–F bastam para um executor chegar com segurança a `ACTIVE_MULTI_AGENT_VERIFIED`.

## B. Estado de planejamento

`MAR-P0` PASS · `MAR-P1` PASS · `MAR_ARCHITECTURE_READY`. PLAN-A a PLAN-F `READY`; `MAR-P2` a
`MAR-P19` `PLANNED`. **`OBSERVED`:** branch `fix/seguranca-criticos`, HEAD `30bf5453` — idêntico a
`.claude/expected-head.txt`. Dez suites do EOS PASS.

## C. Planos importados

| Plano | Bytes | Fases | Gate |
|---|---|---|---|
| `MAR_ARCHITECTURE_AUDIT.md` | 19.418 | P0–P1 | `MAR_ARCHITECTURE_READY` |
| `PLAN_A_FOUNDATIONS.md` | 20.408 | P2–P3 | `PLAN_A_READY` |
| `PLAN_B_EOS_KERNEL.md` | 25.815 | P4–P8 | `PLAN_B_READY` |
| `PLAN_C_CODEX_COGNITIVE_PLANE.md` | 25.969 | P9–P10 | `PLAN_C_READY` |
| `PLAN_D_CLAUDE_EXECUTION_PLANE.md` | 58.508 | P11–P13 | `PLAN_D_READY` |
| `PLAN_E_PROOF_RESILIENCE.md` | 56.391 | P14–P16 | `PLAN_E_READY` |
| `PLAN_F_ACTIVE_MIGRATION.md` | 58.206 | P17–P19 | `PLAN_F_READY` |

## D. `MASTER_IMPORT_REGISTRY`

| Export | Produtor | Consumidores | Fases consumidoras | Status | Campos não resolvidos |
|---|---|---|---|---|---|
| Canonical Types | A | B,C,D,E,F | P4–P19 | `FROZEN_IN_DESIGN` | — |
| Invariants + Enforcement Map | A | B,C,D,E,F | P4–P19 | `FROZEN_IN_DESIGN` | — |
| Enforcement Classes | A | B,C,D,E,F | P4–P19 | `FROZEN_IN_DESIGN` | — |
| Artifact Model + Mutability | A | B,C,D,E | P4–P16 | `FROZEN_IN_DESIGN` | — |
| Event Protocol | A | B,C,D,E | P4–P16 | `FROZEN_IN_DESIGN` | — |
| Snapshot Model | A | B,C,D,E | P4–P16 | **`INCOMPLETE`** | **algoritmo de `SnapshotId`** |
| Version Model + RuntimeManifest | A | B,E,F | P4,P8,P17–19 | `FROZEN_IN_DESIGN` | — |
| Error Model | A | B,C,D | P4–P13 | `FROZEN_IN_DESIGN` | — |
| Authority Representation | A | B,C,D,F | P4,P7,P10,P18 | `FROZEN_IN_DESIGN` | — |
| Content Provenance | A | C,D,E | P9–P16 | `FROZEN_IN_DESIGN` | — |
| Side Effect Protocol + WriteManifest | A | B,D,E | P4,P8,P13,P14 | `FROZEN_IN_DESIGN` | — |
| Kernel Runtime Interface | B | C,D,E,F | P9–P19 | `FROZEN_IN_DESIGN` | — |
| Adapter Runtime Interface | B | C,D,E | P9,P12,P14 | `FROZEN_IN_DESIGN` | — |
| Event/Journal Contract | B | C,D,E,F | P9–P19 | `FROZEN_IN_DESIGN` | — |
| Scheduler Contract | B | C,D,F | P10,P13,P18 | `FROZEN_IN_DESIGN` | — |
| Authority Contract | B | C,D,F | P10,P13,P18 | `FROZEN_IN_DESIGN` | — |
| Recovery Contract | B | D,E,F | P13,P16,P18 | `FROZEN_IN_DESIGN` | — |
| Side Effect Contract | B | D,E | P13,P14 | `FROZEN_IN_DESIGN` | — |
| Lease Contract | B | D,F | P13,P18 | `FROZEN_IN_DESIGN` | — |
| Fake Runtime Contract | B | C,D,E | P9–P16 | `FROZEN_IN_DESIGN` | — |
| Resource Hook Contract | B | E | P15 | `FROZEN_IN_DESIGN` | — |
| Security Hooks | B | C,D,E | P9–P16 | `FROZEN_IN_DESIGN` | — |
| `CognitiveRuntimeAdapter` | C | D,E,F | P12,P14,P17 | `FROZEN_IN_DESIGN` | — |
| `CognitiveCapsule` | C | D,F | P13,P17 | `FROZEN_IN_DESIGN` | — |
| Contratos dos 4 papéis + condicionais | C | E,F | P14,P17,P18 | `FROZEN_IN_DESIGN` | — |
| `PlanProposal`/`ArchitectureProposal`/`D1_DECISION_PROPOSAL` | C | B,E,F | P6,P14,P17 | `FROZEN_IN_DESIGN` | — |
| `ChallengeResult`/`ReviewResult`/`RootCauseResult` | C | E,F | P14,P17 | `FROZEN_IN_DESIGN` | — |
| Estratégia de `CODEX_HOME` | C | F | P17 | **`PENDING_PROBE`** | **decidida pelo probe P9** |
| `ExecutionRuntimeAdapter` (7 métodos) | D | E,F | P14,P17 | `FROZEN_IN_DESIGN` | — |
| `ExecutionCapsule` | D | E,F | P14,P17 | `FROZEN_IN_DESIGN` | — |
| `ExecutionResult` | D | E,F | P14,P17 | `FROZEN_IN_DESIGN` | — |
| Integração do `WriteManifest` | D | E,F | P14,P18 | `FROZEN_IN_DESIGN` | — |
| Semântica de self-check e correção | D | E,F | P14,P18 | `FROZEN_IN_DESIGN` | — |
| Papéis de execução | D | F | P18,P19 | `FROZEN_IN_DESIGN` | — |
| Estados de crash e recuperação | D | E,F | P16,P18 | `FROZEN_IN_DESIGN` | — |
| Seleção de runtime Claude | D | F | P17 | **`PENDING_PROBE`** | **decidida pelo probe P11** |
| Contratos de verificação | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Autoridade do ProofLedger | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Gate evaluator (4 eixos) | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Contrato de meta-verificação | E | F | P19 | `FROZEN_IN_DESIGN` | — |
| Modelo de Resource Accounting | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Métricas de `H-MAR-001` | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Contrato do harness de chaos | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Catálogo `R1`–`R14` + mapa | E | F | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Modelo de modo (4 dimensões) | F | — | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Matriz de migração de autoridade | F | — | P17–P19 | `FROZEN_IN_DESIGN` | — |
| Contrato do Shadow | F | — | P17 | `FROZEN_IN_DESIGN` | — |
| Matrizes de capability/proof/chaos/blocker | F | — | P19 | `FROZEN_IN_DESIGN` | — |
| Contrato de cutover e demoção | F | — | P19 | `FROZEN_IN_DESIGN` | — |

**Três exports incompletos, todos com owner e gate** (§48, §D.SNAP): `SnapshotId` → `SL-A-07`, gate
antes do Scheduler; `CODEX_HOME` → probe `SL-CX-02`; seleção de runtime Claude → probe `SL-CL-02`.
Nenhum outro campo pendente. **Nenhum export sem consumidor** (§149).

## E. `MASTER_CHANGE_REQUEST_REGISTRY`

| ID | Origem | Alvo | Razão | Tipo | Compat. | Aceito | Resolvido no Master | Impl. owner | Verif. owner | Bloqueia execução? |
|---|---|---|---|---|---|---|---|---|---|---|
| `PBCR-001` | C | B | Context Broker é determinístico, não cabe ao plano cognitivo | Reposicionamento | Aditivo | Sim | `SL-K-09` | `eosMaintainer` | `testInfrastructure` | Não |
| `PBCR-002` | D | B | Executor não é fonte autoritativa do que mudou (`MAR-INV-035`) | Ownership | Aditivo | Sim | `SL-K-07` | `eosMaintainer` | `security` | Não |
| `PBCR-003` | E | B | Hooks de falha determinísticos como facilidade de primeira classe | Facilidade | Aditivo | Sim | `SL-K-10` | `eosMaintainer` | `testInfrastructure` | Não |
| `PDCR-001` | E | D | Proof store e artefatos de verificação no `forbiddenChangeScope` | Escopo | Aditivo | Sim | `SL-CL-08` | `security` | `eosMaintainer` | Não |
| `PDCR-002` | F | D | Cadeia de integridade do launcher + controles de `settings.local.json` no `RepositorySecurityProfile` | Escopo | Aditivo | Sim | `SL-BOOT-03` | `security` | `release` | Não |
| **`PDCR-003`** | **G** | **D** | **Quatro controles legados observados que nenhum plano representa (`F-MAR-062`)** | **Escopo** | **Aditivo** | Sim | `SL-BOOT-03` | `security` | `release` | Não |

Seis CRs, todos aditivos, todos com owner de implementação **e** de verificação distintos, todos
resolvidos em slice nomeado. **Nenhum CR pendente** (§148).

`PDCR-003` é o único novo, e nasce da reconciliação da §I.

## F. `FINDING_MASTER_REGISTRY`

Sessenta e três Findings. Disposições possíveis: `RESOLVED_IN_SPEC · IMPLEMENTATION_SLICE_ASSIGNED ·
RUNTIME_PROBE_ASSIGNED · KNOWN_DEBT · REJECTED · USER_DECISION · SUPERSEDED`. **Nenhum
`UNASSIGNED`** (§146).

| Finding | Origem | Disposição | Slice/Probe | Impl. owner | Verif. owner | Bloqueia Shadow/Dual/Active |
|---|---|---|---|---|---|---|
| `F-MAR-001` | P1 | `RESOLVED_IN_SPEC` | — | — | — | — |
| `F-MAR-002` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-SH-05` | `security` | `release` | Active (matriz sem regressão) |
| `F-MAR-003` | P1 | `RESOLVED_IN_SPEC` | `SL-K-11` | `eosMaintainer` | `security` | — |
| `F-MAR-004` | P1 | `RESOLVED_IN_SPEC` | `SL-BOOT-03` | `security` | `release` | — |
| `F-MAR-005` | P1 | `KNOWN_DEBT` (hipótese `H-MAR-001`) | `SL-RES-04` | `eosMaintainer` | `testInfrastructure` | Active (política de corte) |
| `F-MAR-006` | P1 | `KNOWN_DEBT` (`KR-005`) | `SL-PF-06` | `testInfrastructure` | `eosMaintainer` | — |
| `F-MAR-007` | P1 | **`REJECTED`** | — | — | — | — |
| `F-MAR-008` | P1 | `RESOLVED_IN_SPEC` | `SL-K-13` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-009` | P1 | `RUNTIME_PROBE_ASSIGNED` | `SL-CX-02` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-010` | P1 | `RUNTIME_PROBE_ASSIGNED` | `SL-CX-03` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-011` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-02`,`SL-K-03` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-012` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-05` | `eosMaintainer` | `security` | Dual |
| `F-MAR-013` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-06` | `eosMaintainer` | `security` | — |
| `F-MAR-014` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-12` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-015` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-PF-07` | `testInfrastructure` | `security` | Self-hosting |
| `F-MAR-016` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-05` | `eosMaintainer` | `integration` | — |
| `F-MAR-017` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-07`,`SL-K-14` | `eosMaintainer` | `security` | Dual |
| `F-MAR-018` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-09` | `eosMaintainer` | `security` | — |
| `F-MAR-019` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-CL-07` | `security` | `eosMaintainer` | — |
| `F-MAR-020` | P1 | `KNOWN_DEBT` | `SL-RES-02` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-021` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-06`,`SL-DU-01` | `eosMaintainer` | `security` | **Dual** |
| `F-MAR-022` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-08` | `eosMaintainer` | `release` | — |
| `F-MAR-023` | P1 | `RESOLVED_IN_SPEC` | `SL-K-01` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-024` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-06` | `eosMaintainer` | `security` | — |
| `F-MAR-025` | P1 | `KNOWN_DEBT` (limite declarado) | `SL-K-06` | `eosMaintainer` | `security` | — |
| `F-MAR-026` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-05` | `eosMaintainer` | `security` | **Dual** |
| `F-MAR-027` | P1 | `KNOWN_DEBT` (limite declarado) | `SL-K-06` | `eosMaintainer` | `security` | — |
| `F-MAR-028` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-PF-04` | `testInfrastructure` | `eosMaintainer` | — |
| `F-MAR-029` | P1 | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-15` | `eosMaintainer` | `security` | — |
| `F-MAR-030` | A | `RESOLVED_IN_SPEC` + probe | `SL-CX-01` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-031` | A | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-11` | `eosMaintainer` | `security` | — |
| `F-MAR-032` | A | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-04` | `eosMaintainer` | `security` | **Active** |
| `F-MAR-033` | A | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-08` | `eosMaintainer` | `release` | — |
| `F-MAR-034` | A | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-02` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-035` | A | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-11` | `eosMaintainer` | `security` | — |
| `F-MAR-036` | B | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-FK-04` | `testInfrastructure` | `security` | — |
| `F-MAR-037` | B | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-03`,`SL-K-12` | `eosMaintainer` | `testInfrastructure` | **Dual** |
| `F-MAR-038` | B | `KNOWN_DEBT` (`DETECTIVE`) | `SL-K-02` | `eosMaintainer` | `security` | **Active** (detecção) |
| `F-MAR-039` | B | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-15` | `security` | `eosMaintainer` | — |
| `F-MAR-040` | B | `RESOLVED_IN_SPEC` (DAG) | §W | — | — | — |
| `F-MAR-041` | C | `RUNTIME_PROBE_ASSIGNED` | `SL-CX-01` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-042` | C | `RUNTIME_PROBE_ASSIGNED` | `SL-CX-04` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-043` | C | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-09` | `eosMaintainer` | `security` | — |
| `F-MAR-044` | C | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-A-03` | `eosMaintainer` | `security` | — |
| `F-MAR-045` | C | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-CG-01` | `eosMaintainer` | `security` | — |
| `F-MAR-046` | D | **`KNOWN_DEBT` declarado** | `SL-CL-01` | `security` | `eosMaintainer` | Active (`KNOWN_LIMITATION`) |
| `F-MAR-047` | D | `RUNTIME_PROBE_ASSIGNED` | `SL-CL-03` | `security` | `eosMaintainer` | **Dual** |
| `F-MAR-048` | D | `RUNTIME_PROBE_ASSIGNED` | `SL-CL-05` | `security` | `eosMaintainer` | **Dual/Active** |
| `F-MAR-049` | D | `RUNTIME_PROBE_ASSIGNED` | `SL-CL-06` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-050` | D | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-K-07`,`SL-PF-02`,`SL-CL-08` | `security` | `eosMaintainer` | Active (detectivo aceito) |
| `F-MAR-051` | D | `RUNTIME_PROBE_ASSIGNED` | `SL-CL-04` | `security` | `eosMaintainer` | **Active** |
| `F-MAR-052` | E | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-PF-02`,`SL-PF-03` | `eosMaintainer` | `security` | **Dual** |
| `F-MAR-053` | E | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-PF-05` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-054` | E | `RESOLVED_IN_SPEC` (DAG) | §W | — | — | — |
| `F-MAR-055` | E | **`KNOWN_DEBT` declarado** | `SL-PF-08` | `security` | `testInfrastructure` | Active (`KNOWN_LIMITATION`) |
| `F-MAR-056` | E | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-PF-06` | `testInfrastructure` | `security` | **Dual** |
| `F-MAR-057` | F | `KNOWN_DEBT` + `USER_DECISION` | §I, §AO | **usuário** | `security` | ver §AO |
| `F-MAR-058` | F | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-SH-01` | `eosMaintainer` | `security` | **Shadow** |
| `F-MAR-059` | F | `RESOLVED_IN_SPEC` (retrospectivo) | `SL-SH-02` | `eosMaintainer` | `testInfrastructure` | — |
| `F-MAR-060` | F | `IMPLEMENTATION_SLICE_ASSIGNED` + `USER_DECISION` | `SL-DU-01` | **usuário** + `security` | `eosMaintainer` | **Dual** |
| `F-MAR-061` | F | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-BOOT-03` | `security` | `release` | **Active** |
| **`F-MAR-062`** | **G** | `IMPLEMENTATION_SLICE_ASSIGNED` | `SL-BOOT-03` | `security` | `release` | **Active** |
| **`F-MAR-063`** | **G** | `RESOLVED_IN_SPEC` (§U) | §U, todos os gates | `eosMaintainer` | `testInfrastructure` | — |

Um `REJECTED` (`F-MAR-007`), oito `KNOWN_DEBT`, nove `RUNTIME_PROBE_ASSIGNED`, dois com componente de
`USER_DECISION`, o restante com slice. **Zero sem owner.**

## G. `KNOWN_RISK_REGISTRY`

| ID | Descrição | Impacto em gate | Owner de monitoramento |
|---|---|---|---|
| `KR-005` | `forks`/`jsdom` no runner de teste | Nenhum gate bloqueado; a captura é determinística mesmo com teste instável (§S do PLAN-E) | `testInfrastructure` |
| `KR-007` | Residual do classificador (F-006) | Nenhum gate bloqueado | `eosMaintainer` |
| `KR-MAR-001` | `~/.claude-admai/telemetry` vazio → custo `UNAVAILABLE` | `H-MAR-001` parcial; não bloqueia Active (§AQ) | `eosMaintainer` |
| `KR-MAR-002` | Mesma conta de SO para Kernel, executor e verificação | `KNOWN_SECURITY_LIMITATION`; não bloqueia Active (§R) | `security` |
| `KR-MAR-003` | Verification executa código não confiável do repositório (`F-MAR-055`) | `KNOWN_LIMITATION`; mitigação parcial (§AD) | `security` |
| `KR-MAR-004` | Fallback legado permite patch na worktree (`F-MAR-057`) | Impede tratar o fallback como read-only-safe (§AO) | `security` |

**`Known Risk ≠ Finding`** (§94), mas nenhum risco crítico fica sem owner (§95).

## H. `DECISION_REGISTRY`

`APPROVED_FROZEN` preservadas do usuário e **não reabertas**: Codex roda independente e fora do MCP do
Claude · EOS coordena · planos separados · Verification independente · **writer físico único** nesta
fase · portabilidade multi-repositório · D2 exclusivo do usuário · sem WhatsApp, planos, cobrança ou
relatórios nesta frente · Supabase MCP nunca em produção · nunca versionar secret.

Decisões D1 duráveis registradas nos planos: quatro papéis cognitivos permanentes · MVCP =
Decision Analyst + Planner · sete métodos no `ExecutionRuntimeAdapter` · sessão slice-scoped sem
persistência · quatro modos operacionais · Shadow retrospectivo · isolamento por clone descartável ·
threat model cooperativo-porém-falível · self-hosting desacoplado de Active.

`DEFERRED`: plugin do Codex (`NOT_JUSTIFIED_YET`) · Claude cloud/remoto · Agent SDK · multi-writer ·
resume de sessão · ferramentas condicionais do Codex · `--worktree` por Slice.

## I. Reconciliação de evidência legada — §8, §155

`F-MAR-057` provou que uma alegação marcada `OBSERVED` no MAR-P1 estava incorreta. A §8 exige
revalidar **as garantias de segurança legadas usadas como baseline de migração** — não o projeto
inteiro. Fonte de verdade da §9: **mecanismo executado > configuração executável > código de política
> documentação > comentário.**

Resultado da revalidação linha a linha da matriz do MAR-P1 §J:

| # | Linha do audit | Veredito | Evidência |
|---|---|---|---|
| 1 | "Codex somente leitura" | **MISLABELED** | perfil `workspace-only` define `"." : "write"` (`codex-mcp-policy.mjs`) **e** `decidirPatch` aprova (`approval-policy.mjs:301`). Dois mecanismos de escrita independentes. A coluna de veredito já dizia "read-only < workspace-write"; o **nome** da garantia é que mente |
| 2 | "Codex não cria patch" | **FALSO** | `approval-policy.mjs:290-302` — `F-MAR-057` |
| 3 | `--strict-mcp-config` | **CONFIRMADO** | `start-baseline.ps1:338,340,377,379` — passado nos dois ramos |
| 4 | Allowlist por ferramenta | **CONFIRMADO** | `:71-79` — `mcp__codex__*` + seis ferramentas Serena de leitura |
| 5 | "Ausência de `--dangerously-*`" | **SUBESTIMADO** | `:292-305` — não é ausência: está em `$blockedPrefixes` e **lança** se o usuário passar |
| 6 | Integridade por hash | **CONFIRMADO e maior** | `:120-153` — nove hashes + `expected-head` + branch + allowlist de nomes de item do perfil |
| 7 | Fail-closed em drift | **CONFIRMADO** | `:81-85` — `Assert-Equal` lança |
| 8 | Escopo de worktree | **CONFIRMADO** | `:17,24,116-126` + `Assert-NoReparsePoint` |
| 9 | Sem isolamento entre repositórios | **CONFIRMADO** | `CODEX_HOME` e perfil são por instalação |

**Quatro controles reais que nenhum plano representa** — `OBSERVED` em `start-baseline.ps1`:

1. **Detecção de política no Registry** — `HKLM`/`HKCU\SOFTWARE\Policies\ClaudeCode` → lança (`:285-289`).
2. **Conflito de `CLAUDE_CONFIG_DIR`** → lança (`:307-314`).
3. **Bloqueio de override em argumento do usuário** (`:292-305`) — `--mcp-config`, `--settings`,
   `--setting-sources`, `--plugin-dir`, **`--add-dir`**, `--allowedTools`, `--disallowedTools`,
   `--strict-mcp-config`, `--dangerously-skip-permissions`, `mcp`, `/mcp`.
4. **Allowlist de nomes de item do perfil** (`:147+`) — detecta arquivo inesperado no perfil.

O terceiro importa em particular: o PLAN-D apoiou-se em `--add-dir` como o único lever de filesystem
do runtime Claude, e no legado **o usuário não pode passá-lo**. É **`F-MAR-062`** — inventário de
controles legados incompleto, e na direção oposta ao `F-MAR-061`: aqui o legado é **mais forte** do
que qualquer plano registrou, e migrar sem mapear perderia proteção real.

**Relatório de erro anterior (§155), completo:** além do `F-MAR-057` já registrado, esta reconciliação
encontrou **um rótulo enganoso** (linha 1, mesma raiz do `F-MAR-057`), **uma subestimação** (linha 5,
na direção segura) e **quatro controles não inventariados**. Nenhuma outra alegação `OBSERVED` dos
planos A–F foi encontrada incorreta.

**`MASTER-INV-001` — equivalência de migração é avaliada contra enforcement legado observado, nunca
contra intenção documentada.**

## J. `LEGACY_GUARANTEE_MIGRATION_MATRIX`

| Garantia legada real | Enforcement legado | Enforcement novo | Fase de impl. | Oráculo de verificação | Exigido antes de |
|---|---|---|---|---|---|
| Codex escreve na worktree (**não** é read-only) | `POLICY_ENFORCED` permissivo | escrita `DENIED` | P9 | oráculo negativo duplo | Dual |
| Codex sem rede | `POLICY_ENFORCED` | negada por padrão | P9 | probe | Dual |
| Allowlist de comando + metacaracteres + flags | `POLICY_ENFORCED` | classificação de comando | P13 | `F-MAR-047` | Dual |
| Duas ferramentas MCP | `POLICY_ENFORCED` | tool surface por papel | P10/P13 | conformance | Shadow |
| Caminhos protegidos | `POLICY_ENFORCED` | `forbiddenChangeScope` + `PDCR-001` | P13 | negativo | Dual |
| `defaultMode: "default"` | `POLICY_ENFORCED` | modos permissivos proibidos | P12 | `F-MAR-048` | **Dual** |
| Nove hashes + `expected-head` + branch | `DETECTIVE` | `RepositorySecurityProfile` + `PDCR-002` | Bootstrap | drift | Active |
| `Assert-NoReparsePoint` | `DETECTIVE` | perfil do repositório | Bootstrap | negativo | Active |
| `disableAllHooks` | `POLICY_ENFORCED` | `PDCR-002` | Bootstrap | negativo | Active |
| `autoMemoryEnabled: false` | `POLICY_ENFORCED` | `PDCR-002` | Bootstrap | negativo | Active |
| `disableClaudeAiConnectors` | `POLICY_ENFORCED` | `PDCR-002` | Bootstrap | negativo | Active |
| **Registry policy detection** | `DETECTIVE` | **`PDCR-003`** | Bootstrap | negativo | Active |
| **Conflito de `CLAUDE_CONFIG_DIR`** | `POLICY_ENFORCED` | **`PDCR-003`** | Bootstrap | negativo | Active |
| **Bloqueio de override de argumento** | `POLICY_ENFORCED` | **`PDCR-003`** | Bootstrap | negativo | **Active** |
| **Allowlist de item do perfil** | `DETECTIVE` | **`PDCR-003`** | Bootstrap | drift | Active |
| Isolamento entre repositórios | **não existe** | por `repositoryId` | P9/P11 | A→B | **Active** |
| Contenção física de escrita do Claude | **não existe** | **não existe** | — | — | `KNOWN_LIMITATION` |

**§130 — fraqueza legada não vira requisito novo.** O legado permitir patch **não** significa que o
EOS novo deva permitir. O objetivo é preservar ou fortalecer as garantias úteis pretendidas,
registrando com exatidão o comportamento legado real.

---

## K. Reconciliação de taxonomia entre planos

Auditoria da §14, procurando conceito com nomes diferentes, nome com significados diferentes, enum
misturando dimensões, artefato duplicado, estado duplicado e tipo específico de provider vazando para
o Kernel.

| Verificação | Resultado |
|---|---|
| Mesmo conceito, nomes diferentes | **Um caso**: "Context Broker" (C) e "Deterministic Context Broker" (D/E). Canônico: **`DeterministicContextBroker`** |
| Mesmo nome, significados diferentes | **Nenhum**. `Capsule` é sempre qualificada (`Cognitive`/`Execution`); `Session` tem definição única no PLAN-A §E |
| Enum misturando dimensões | **Três casos, todos já corrigidos**: `SLICE_STATES` (`F-MAR-034` → 4 eixos), `GATE_MODES` (`F-MAR-053` → 4 eixos), modo operacional (`F-MAR-053` aplicado → 4 dimensões) |
| Artefato duplicado | **Nenhum**. `ProofObligation` foi rejeitado como tipo (E §L); execução de verificação é `EvidenceRecord` estendido (E §M); `CorrectionCapsule` rejeitado (D §AV) |
| Estado duplicado | **Nenhum**. `WaitForGraph` derivado (B); `healthState` derivado (F) |
| Tipo de provider vazando ao Kernel | **Nenhum**. A fronteira de adapter (A §AD, C §I, D §N) mantém `codex --sandbox` e `claude --permission-mode` fora do núcleo |

Vinte artefatos canônicos do PLAN-A **mais** `SHADOW_COMPARISON_RECORD` (F §N), único tipo novo em
seis planos. Nenhum outro acréscimo ao catálogo.

## L. Conjunto canônico de invariantes

**`EOS-P01`–`P12`** e **`EOS-INV-*`** preservados sem enfraquecimento e **sem renumeração**.

**`MAR-INV-001`** a **`MAR-INV-024`** do MAR-P1 · **`025`** enforcement honesto (A) · **`026`** evento
aceito ≠ ação autorizada (A) · **`027`** Kernel sem provider (B) · **`028`** replay não reproduz
efeito (B) · **`029`** node bloqueado ≠ run bloqueado (B) · **`030`** falha de agente ≠ falha de Run
(B) · **`031`** output do modelo nunca é estado autorizado (C) · **`032`** poder retomar ≠ dever
retomar (C) · **`033`** Codex indisponível não promove Claude (C) · **`034`** análise não é evidência
(C) · **`035`** executor não é fonte autoritativa do que mudou (D) · **`036`** prova exige
desreferenciamento (E) · **`037`** prova de gate é do Proof Plane (E) · **`038`** recuperação não
testada é alegação (E) · **`039`** transição de modo é transição de autoridade (F) · **`040`** legado
é grupo de controle até o Active Gate (F) · **`041`** prova legada nunca vira prova nova (F) ·
**`042`** exatamente um Governor por operação (F) · **`043`** dependência crítica do Active não fica
`UNKNOWN` (F) · **`044`** o EOS não se reescreve em execução (F).

**Novos do PLAN-G, e apenas dois:**

**`MASTER-INV-001`** — equivalência de migração avalia enforcement **observado**, nunca intenção
documentada (§I).
**`MASTER-INV-002`** — **todo gate declara o regime de prova que o valida** (§U).

Classificação da §90: todos `CANONICAL` exceto `MAR-INV-023A` (`REFINES` `023`) e `MAR-INV-018`
refinado no MAR-P1 (`REFINES`). **Nenhum `DUPLICATE`, nenhum `DEPRECATED`, nada excluído do
histórico.**

## M. Matriz de enforcement de invariantes

Amostra dos críticos; o registro completo é derivado por `SL-A-02`. Todo invariante tem ponto de
implementação, `EnforcementClass`, ponto de verificação e teste negativo — ou é marcado `UNENFORCED`
explicitamente (§91).

| Invariante | Impl. | Classe | Verificação | Teste negativo |
|---|---|---|---|---|
| `MAR-INV-025` | `SL-A-02` | `POLICY_ENFORCED` | validação de schema | garantia advisory declarada `HARD_ENFORCED` → falha |
| `MAR-INV-026` | `SL-K-11` | `POLICY_ENFORCED` | Authority Validator | payload com `authority` → ignorado |
| `MAR-INV-028` | `SL-K-04` | `POLICY_ENFORCED` | `RECONSTRUCTION_MODE` | replay tentando efeito → precondição insatisfazível |
| `MAR-INV-035` | `SL-K-07` | `POLICY_ENFORCED` | produtor do manifesto | executor enviando `observedWrites` → recusado |
| `MAR-INV-036` | `SL-PF-02` | `POLICY_ENFORCED` | desreferenciamento | artefato ausente/divergente/de outro repo → bloqueia |
| `MAR-INV-037` | `SL-PF-03` | `POLICY_ENFORCED` | Runner | self-check como prova de gate → recusado |
| `MAR-INV-042` | `SL-DU-01` | **`UNENFORCED` até `SL-DU-01`** | fencing de controle legado | duas entradas ativas → detectado |
| `MAR-INV-043` | `SL-AC-01` | `POLICY_ENFORCED` | gate do Active | capability `UNKNOWN` crítica → bloqueia |
| `MAR-INV-044` | `SL-SH-08` | `POLICY_ENFORCED` | promoção de candidato | hot rewrite → recusado |
| `MASTER-INV-002` | §AS | `POLICY_ENFORCED` | registro de gates | gate sem `proofRegime` → inválido |

**Nenhum invariante crítico sem slice** (§92). `MAR-INV-042` é o único `UNENFORCED` hoje, e tem slice
e gate nomeados.

## N. Matriz produtor/consumidor de artefatos

| Artefato | Definido por | Produtor | Consumidor | Autoritativo | Durável | Ligado a snapshot | Versionado | Verificação |
|---|---|---|---|---|---|---|---|---|
| `IntentRecord` | A | usuário/CLI | Kernel | Sim | Sim | Não | Sim | schema |
| `DecisionRecord` | A | Authority Validator | Kernel, Codex, Claude | Sim | Sim | Sim | Sim | precedência |
| `EvidenceRecord` | A | Evidence Broker, Runner | Codex, Proof Plane | Sim | Sim | Sim | Não (imutável) | desreferenciamento |
| `ArchitectureProposal` | A | Codex | EOS | **Não** | Sim | Sim | Sim | schema + autoridade |
| `PlanProposal` | A | Codex | Plan Compiler | **Não** | Sim | Sim | Sim | compilação |
| `ExecutionGraph` | A | Plan Compiler | Scheduler | **Sim, após validar** | Sim | Sim | Sim | ciclo, autoridade |
| `CognitiveCapsule` | A | Context Broker | Codex | Não | Não | Sim | Sim | escopo |
| `ExecutionCapsule` | A | Context Broker | Claude | Não | Sim | Sim | Sim | snapshot, escopo |
| `ContractRecord` | A | Contract Bus | ambos os planos | Sim | Sim | Não | Sim | `transitionId` |
| `TestContract` | A | usuário/EOS | Proof Plane, Claude | Sim | Sim | Não | Sim | obrigações |
| `FindingRecord` | A | qualquer fonte | Verification | Sim | Sim | Sim | Sim | fechamento |
| `WriteManifest` | A | **Kernel** (`PBCR-002`) | Proof Plane, Recovery | Sim | Sim | Sim | Não | fingerprint |
| `ExecutionResult` | D | Claude | Kernel, Proof Plane | **Não** (candidato) | Sim | Sim | Não | schema + refs |
| `VerificationResult` | E | Proof Plane | Gate Evaluator | Sim | Sim | Sim | Sim | desreferenciamento |
| `ProofLedger` | A | Proof Ledger Builder | Gate Evaluator | Sim | Sim | Sim | Sim (supersessão) | obrigações |
| `RepositorySnapshot` | A | Kernel | todos | Sim | Sim | — | Não | `SnapshotId` |
| `RuntimeManifest` | A | Kernel | Recovery, resume | Sim | Sim | Não | Sim | compatibilidade |
| `ResourceRecord` | A | todos os planos | Accounting | Sim | Sim | Não | Não | estado de medição |
| `SideEffectRecord` | A | Side Effect Coordinator | Recovery, Proof | Sim | Sim | Sim | Não (imutável) | reconciliação |
| `CorrectionRequest` | A | Verification | Claude | Sim | Sim | Sim | Sim | escopo |
| `SHADOW_COMPARISON_RECORD` | F | Shadow harness | `H-MAR-001` | Não | Sim | Sim | Sim | três vias |

**Verificação de órfãos (§16):** nenhum produtor sem consumidor; nenhum consumidor sem produtor;
nenhuma autoridade sem verificador; nenhuma durabilidade sem identidade; nenhuma dependência de
snapshot sem invalidação. **Zero órfãos.**

## O. `MASTER_EVENT_FLOW_MATRIX`

| Evento | Produtor | Consumidor | Durável | Autoridade | Replay | Idempotência | Efeito | Falha |
|---|---|---|---|---|---|---|---|---|
| `SUBMIT_INTENT` | CLI/usuário | Kernel | Sim | **Sim** | não reexecuta | `eventId` | Não | rejeita |
| `NODE_STATE_CHANGED` | Scheduler | Projections, watch | Sim | Não | reconstrói | `eventId` | Não | replay |
| `D1_DECISION_REQUEST` | Kernel | Codex | Sim | Sim | não reexecuta | `eventId` | Não | `WAITING_AGENT` |
| `D1_DECISION_PROPOSAL` | Codex | Authority Validator | Sim | **Não** | reavalia | `eventId` | Não | rejeita |
| `USER_DECISION_REQUEST` | Kernel | usuário | Sim | Sim | não reexecuta | `eventId` | Não | `WAITING_USER` |
| `EXECUTION_STARTED` | Claude adapter | Kernel | Sim | Não | não reexecuta | `eventId` | Não | crash path |
| `WRITE_OBSERVED` | **Kernel** | WriteManifest | Sim | Sim | não reexecuta | fingerprint | Sim (observado) | reconcilia |
| `SIDE_EFFECT_INTENT` | Side Effect Coord. | executor | Sim | Sim | **não reexecuta** | `sideEffectId` | Sim | `AMBIGUOUS` |
| `VERIFICATION_COMPLETED` | Proof Plane | Gate Evaluator | Sim | Sim | não reexecuta | `verificationRunId` | Não | bloqueia gate |
| `GATE_CHANGED` | Gate Evaluator | watch, Kernel | Sim | Sim | reconstrói | `eventId` | Não | replay |
| `FINDING_CREATED` | qualquer | Verification | Sim | Não | reconstrói | `eventId` | Não | replay |
| `MODE_CHANGED` | Kernel | todos | Sim | **Sim** | reconstrói | `eventId` | Não | resolve para modo anterior |
| `CAPABILITY_REVALIDATION_REQUIRED` | adapter | Kernel | Sim | Não | reavalia | `eventId` | Não | bloqueia |
| `RESOURCE_USAGE_UPDATED` | todos | Accounting | **Não** | Não | descarta | — | Não | ignora |
| `AGENT_STATE_CHANGED` | adapters | watch | **Não** | Não | descarta | — | Não | ignora |

**Nenhum evento autoritativo sem consumidor definido** (§17). **Controle vs observação (§18)
reconfirmado transversalmente:** `SUBMIT_INTENT`, `PAUSE_RUN`, `RESUME_RUN`, `CANCEL_SLICE`,
`APPROVE_D2`, `REJECT_D2`, `MODE_CHANGED` exigem authority check; toda a família `*_STATE_CHANGED`,
`RESOURCE_USAGE_UPDATED` e `watch` é observação e **não concede autoridade**. Nenhum caso novo do tipo
"observação virando controle" foi encontrado em A–F.

## P. Auditoria de autoridade entre planos

`EOS = GOVERN · Codex = THINK · Claude = BUILD · Verification = PROVE · Tools = OBSERVE ·
User = D2 soberano`.

**Codex ganha implicitamente algo? (§20)** — escalonamento: **não** (Scheduler é do Kernel, B §X);
roteamento de papel: **não** (`F-MAR-045`, Router determinístico); atribuição de autoridade: **não**
(`MAR-INV-031`); materialização do `ExecutionGraph`: **não** (`F-MAR-035`, só o Compiler);
fechamento de Finding: **não** (`findings.mjs:82`); `VERIFICATION PASS`: **não**
(`CODEX_REVIEW_PASS ≠ VERIFICATION_PASS`). **Zero desvios.**

**Claude ganha implicitamente algo? (§21)** — replanejamento global: **não** (D §AF,
`PLAN_DEFECT_CANDIDATE`); D1 durável: **não** (`DURABLE_DECISION_CANDIDATE` vai ao EOS); D2: **não**;
expansão de escopo: **não** (`SCOPE_EXPANSION_REQUIRED`); mutação do `TestContract`: **não**
(`ENGINEER_FORBIDDEN`); fechamento de Finding: **não**; autoridade de gate: **não**. **Zero desvios.**

**Uma ressalva declarada:** em Dual, se a entrada legada permanecer iniciável, o **legado** vira um
segundo Governor — `F-MAR-060`. É o único desvio de autoridade encontrado em toda a auditoria, e tem
slice, owner e gate (`SL-DU-01`).

## Q. Auditoria de prova entre planos

**Pode virar prova acidentalmente? (§22)** — self-check do Claude: **não**
(`CLAUDE_SELF_CHECK_PASS ≠ VERIFICATION_PASS`, campo inexistente no schema de `ExecutionResult`);
review do Codex: **não**; `ProofLedger` legado: **não** (`MAR-INV-041`, `LEGACY_PROOF_FORM_ONLY`);
output do provider: **não** (normalizado no adapter, `MAR-INV-034`).

**Fluxo mestre `CLAIM → EVIDENCE → PROOF → GATE`** (§23), com o slice que introduz cada fronteira:

```
CLAIM                    "os testes passam"            ← Claude, hoje aceito por validate.mjs:99
  │ SL-PF-01 Runner determinístico executa e captura
EVIDENCE                 comando + exit code + artefato + fingerprint
  │ SL-PF-02 desreferenciamento — MAR-INV-036  ← fecha F-MAR-052
PROOF                    evidência satisfaz o TestContract
  │ SL-PF-03 TestContract Evaluator + obrigações derivadas
PROOF LEDGER             obrigações satisfeitas, com refs desreferenciadas
  │ SL-PF-05 Gate Evaluator em quatro eixos
GATE                     PASS/BLOCKED com base e razão
```

**Caminho de implementação do `F-MAR-052` (§24):** `SL-PF-02` substitui validação de forma por
desreferenciamento; `SL-PF-03` substitui `result === 'PASS'` fornecido pelo chamador por reexecução
independente. **O gate que prova o fechamento é `PROOF_PLANE_OPERATIONAL`**, cujo critério inclui o
teste negativo *"executor alega PASS, o runner observa FAIL, e o gate segue o runner"* (MVPP, E §AV).

**`F-MAR-056` (§25):** o wildcard `fingerprint: 'auto'` (`baseline/classify.mjs:152`) permite que um
Finding satisfaça a exigência de Finding persistente para **todas** as falhas remanescentes.
Owner `testInfrastructure`, slice `SL-PF-06`, teste negativo obrigatório: duas falhas distintas, um
Finding → **deve bloquear**.

## R. `SECURITY_ENFORCEMENT_MASTER_MATRIX`

| Propriedade | Classe pretendida | Classe atual | Mecanismo | Probe | Oráculo negativo | Modo de bloqueio |
|---|---|---|---|---|---|---|
| Codex não escreve (shell) | `HARD_ENFORCED` | **`DISCOVERED`** | `--sandbox read-only` | `SL-CX-01` | escrita por shell falha | Active |
| Codex não escreve (file tool) | `POLICY_ENFORCED` | **`UNKNOWN`** | tool surface | `SL-CX-01` | edição por tool falha | Active |
| Isolamento de repositório do Codex | `POLICY_ENFORCED` | `UNKNOWN` | `CODEX_HOME` | `SL-CX-02` | contexto de A em B | Active |
| Memória nativa contida | `POLICY_ENFORCED` | `DISCOVERED` | desligar/isolar | `SL-CX-03` | reaparece após restart | Active |
| Aprovação do Codex visível | `POLICY_ENFORCED` | `UNKNOWN` | adapter | `SL-CX-04` | auto-concedida | Active |
| Claude não escreve fora do escopo (tool) | `POLICY_ENFORCED` | `UNKNOWN` | `--tools`/`--add-dir` | `SL-CL-03` | arquivo proibido muda | Dual |
| Claude não escreve fora do escopo (shell) | `POLICY_ENFORCED` | `UNKNOWN` | classificação | `SL-CL-03` | redirecionamento fora | Dual |
| Claude não escreve por subprocesso | `DETECTIVE` | `UNKNOWN` | manifesto + árvore | `SL-CL-03` | filho escreve fora | Active |
| Sem subagente writer | `POLICY_ENFORCED` ou `DETECTIVE` | `UNKNOWN` | envelope + árvore | `SL-CL-04` | subagente criado e escreve | **Active** |
| Aprovação do Claude visível | `POLICY_ENFORCED` | `UNKNOWN` | `--permission-mode` | `SL-CL-05` | modo permissivo silencioso | **Dual** |
| Isolamento de sessão do Claude | `POLICY_ENFORCED` | `UNKNOWN` | `--session-id`, sem persistência | `SL-CL-06` | contexto de A em B | Active |
| Executor não altera Proof | `POLICY_ENFORCED`+`DETECTIVE` | `UNKNOWN` | `PBCR-002`+`PDCR-001`+ colocação | `SL-PF-02` | escrita direta detectada | Active |
| Integridade do journal | `DETECTIVE` | `PLANNED` | cadeia de checksum | `SL-K-02` | adulteração detectada | Active |
| Isolamento de artefato entre repos | `POLICY_ENFORCED` | `PLANNED` | `repositoryId` obrigatório | `SL-A-04` | ref cross-repo rejeitada | Active |
| Governador único em Dual | `POLICY_ENFORCED` | **`UNENFORCED`** | fencing de controle legado | `SL-DU-01` | duas entradas ativas | **Dual** |
| Contenção física de escrita | — | **inexistente** | — | — | — | `KNOWN_LIMITATION` |

**Nenhuma linha reporta `HARD_ENFORCED` antes do probe** (§26). A única com classe pretendida
`HARD_ENFORCED` está em `DISCOVERED` e assim permanece até `SL-CX-01`.

**Threat model (§31/§32):** cooperativo-porém-falível. **`KNOWN_SECURITY_LIMITATION`** para processo
malicioso de mesma conta. Mas isso **não é desculpa** (§32): sobrescrita acidental de prova, mutação
acidental de journal, writer oculto acidental e contexto cross-repo acidental **são** tratados —
`PBCR-002`, `PDCR-001`, colocação fora da worktree, árvore de processo e `repositoryId` obrigatório
existem exatamente para o caso acidental.

**`F-MAR-050` explícito (§33):** *Claude nunca produz `WriteManifest` autoritativo. Claude nunca
produz `VerificationResult` autoritativo. Claude nunca decide Gate.* Estado autoritativo do runtime
fica **fora do workspace de execução** entregue ao Claude (`SL-PF-02`, pré-requisito de `SL-CL-09`).

## S. `CRITICAL_CAPABILITY_REGISTRY`

| Capability | Estado atual | Estado necessário | Probe | Fase mais cedo | Shadow | Dual | Active | Fallback |
|---|---|---|---|---|---|---|---|---|
| Codex read-only (shell) | `DISCOVERED` | `PROVEN` | `SL-CX-01` | P9 | — | — | **Sim** | isolamento estrutural |
| Codex read-only (file tool) | `UNKNOWN` | `PROVEN` | `SL-CX-01` | P9 | — | — | **Sim** | tool surface mínima |
| Isolamento de repo do Codex | `UNKNOWN` | `PROVEN` | `SL-CX-02` | P9 | probe | — | **Sim** | perfil isolado (estratégia C) |
| Memória nativa do Codex | `DISCOVERED` | classificada | `SL-CX-03` | P9 | probe | — | **Sim** | desligar |
| Aprovação do Codex | `UNKNOWN` | `PROVEN` | `SL-CX-04` | P9 | probe | — | **Sim** | tool surface sem necessidade de aprovação |
| Escrita do Claude — 4 caminhos | `UNKNOWN` | classificada | `SL-CL-03` | P11 | probe | **Sim** | **Sim** | detecção + escopo |
| Subagente do Claude | `UNKNOWN` | `PROVEN` negado ou detectável | `SL-CL-04` | P11 | probe | **Sim** | **Sim** | **nenhum** → bloqueia |
| Aprovação do Claude | `UNKNOWN` | `PROVEN` | `SL-CL-05` | P11 | probe | **Sim** | **Sim** | modo restrito |
| Isolamento de sessão do Claude | `UNKNOWN` | `PROVEN` | `SL-CL-06` | P11 | probe | — | **Sim** | sem persistência |
| Independência da Verification | `PLANNED` | `PROVEN` | `SL-PF-03` | P14 | — | **Sim** | **Sim** | **nenhum** → bloqueia |
| Detecção de integridade do journal | `PLANNED` | `PROVEN` | `SL-K-02` | P4 | — | — | **Sim** | — |
| Isolamento de artefato entre repos | `PLANNED` | `PROVEN` | `SL-A-04` | P3 | — | **Sim** | **Sim** | — |
| Compatibilidade de resume | `PLANNED` | `PROVEN` | `SL-A-08` | P3 | — | — | Não | bloqueio de resume |

**Toda capability exigida para Shadow, Dual ou Active tem probe e owner** (§150).
**`MAR-INV-043`:** nenhuma dependência crítica do Active permanece `UNKNOWN` no cutover (§132).

**Consolidação sem duplicar prova equivalente:** os probes do Codex (§28) são quatro slices, não oito
— read-only cobre shell e file tool na mesma fixture com alvos distintos. Os do Claude (§29) são
cinco, com `SL-CL-03` cobrindo os quatro caminhos de escrita numa matriz única de nove combinações
caminho × alvo. Os de prova (§30) são dois — `SL-PF-02` (desreferenciamento, anti-forja, isolamento
cross-repo de prova) e `SL-PF-04` (poluição, controles negativos).

## T. `ACTIVE_BLOCKER_REGISTRY`

Importado do PLAN-F §AL, reconciliado com o estado dos Findings (§79):

| Bloqueador | Disposição | Findings | Slice de resolução | Estado |
|---|---|---|---|---|
| Subagentes não negáveis nem detectáveis | `MUST_RESOLVE_BEFORE_ACTIVE` | `F-MAR-051` | `SL-CL-04` | `UNKNOWN` |
| Auto-aprovação esconde mutação | `MUST_RESOLVE_BEFORE_ACTIVE` | `F-MAR-048` | `SL-CL-05` | `UNKNOWN` |
| Vazamento entre repositórios | `MUST_RESOLVE_BEFORE_ACTIVE` | `F-MAR-009`,`010`,`049` | `SL-CX-02`,`SL-CL-06` | `UNKNOWN` |
| Spoof de D2 | `MUST_RESOLVE_BEFORE_ACTIVE` | `F-MAR-031` | `SL-K-11` | `PLANNED` |
| Executor altera estado do EOS | `ACCEPTABLE_WITH_DETECTIVE_CONTROL` | `F-MAR-050` | `SL-K-07`,`SL-PF-02` | `PLANNED` |
| Prova alterável pelo executor | `ACCEPTABLE_WITH_DETECTIVE_CONTROL` | `F-MAR-050`,`052` | `SL-PF-02` | `PLANNED` |
| Contenção física indisponível | `ACCEPTABLE_KNOWN_LIMITATION` | `F-MAR-046` | — | declarado |

**§131 — os quatro `MUST_RESOLVE_BEFORE_ACTIVE` precisam estar resolvidos *e verificados*, não apenas
planejados**, antes de `ACTIVE_CUTOVER_READY`. **§133 —** onde o PLAN-F aceitou controle detectivo, a
limitação e a resposta de gate correspondente são preservadas.

## U. Problemas de bootstrap — resolvidos

A §134 aponta a cadeia `Proof → Chaos → Fault Hooks → Kernel → Proof`. A aresta que fecha o ciclo é
**qual regime prova o gate do Kernel**. Se for o Proof Plane novo, o ciclo é real e o DAG não é
executável. Nenhum plano A–F declarou isso — é **`F-MAR-063`**.

**Resolução: dois regimes de prova durante a implementação.**

```
BOOTSTRAP_PROOF   as 10 suites determinísticas atuais (OBSERVED: todas PASS) + controles negativos
                  + fixtures known-good + evidência independente de ferramenta
                  → governa tudo até PROOF_PLANE_OPERATIONAL, inclusive a prova do próprio runner

NEW_PROOF         Proof Plane com desreferenciamento (MAR-INV-036)
                  → governa de PROOF_PLANE_OPERATIONAL em diante
```

`F-MAR-052` **não** invalida o bootstrap: aquela fraqueza é sobre **confiar em resultado fornecido
pelo chamador**, não sobre `node --test` funcionar. Verificar o *código* do runner novo com teste
determinístico é legítimo; o que fecha o laço é o **controle negativo** — mutação deliberadamente
quebrada que o runner tem de detectar (`SL-PF-04`). Sem controle negativo passando, o instrumento
fica `UNVERIFIED` e o gate não passa.

**`MASTER-INV-002` — todo gate declara seu `proofRegime`.** Sem esse campo, o DAG é cíclico.

**Bootstrap de autoridade (§136):** o sistema de Authority novo não pode autorizar a própria
construção. A governança **atual** — `CLAUDE.md`, `AGENTS.md`, protocolo Decisor, D2 do usuário —
autoriza toda a fase de implementação. A transferência começa em
`LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED` (autoridade nova governa trabalho do caminho novo em fixture) e
completa-se no Dual. Fronteira explícita, não implícita.

**Bootstrap de journal (§137):** antes do Journal existir, o trabalho de implementação não pode
depender dele. A orquestração da implementação permanece no fluxo atual (worktree dedicada, um writer,
documentos do EOS) até o cutover.

**Auto-referência (§138/§139/§140):** o Claude de desenvolvimento **atual** edita código do futuro
Execution Plane — isso **não** significa que o Execution Plane esteja operacional. O Codex legado via
MCP **não** é prova de que o adapter futuro funcione. *O sistema construído ≠ o sistema que constrói.*
Todo artefato de evidência carrega a fase em que foi produzido.

Os seis ciclos restantes da §158 estão resolvidos por ordenação, não por regime:

| Ciclo | Resolução |
|---|---|
| Snapshot antes do Kernel | `SL-A-07` na onda 1, gate antes do Scheduler |
| Scheduler ↔ Authority | DAG do PLAN-B §BG: `P7a → P4 → P7b → P6` |
| Proof ↔ fault hooks | `PBCR-003`: hooks entram com o Kernel (`SL-K-10`), antes do Proof |
| Context Broker ↔ Codex | `PBCR-001`: Broker é do Kernel (`SL-K-09`), antes do plano cognitivo |
| Claude MVEP ↔ proteção de estado | `SL-PF-02` (colocação do estado) é pré-requisito de `SL-CL-09` |
| Shadow ↔ Git compartilhado | `SL-SH-01`: clone descartável, nunca worktree |

## V. Princípios de implementação do Master Plan

1. **Número de fase ≠ ordem de execução** (§39) — `MAR-Px` preserva identidade; a ordem vem do DAG.
2. **Fake-first** (§53) — nenhum provider real antes de o Kernel passar integralmente com os três
   fakes.
3. **Probe antes de dependência** — nenhuma decisão se apoia em capability não probada.
4. **Mínimo viável antes do completo** — MVP do Kernel, MVCP, MVEP, MVPP antes de expandir.
5. **Gate por prova, nunca por contagem de arquivo** (§106).
6. **Bloqueio parcial não é bloqueio global** (§108, `MAR-INV-029`).
7. **Paralelismo lógico ≠ escrita concorrente** (§109) — writer físico único vale para mutação do
   repositório; leitura, planejamento e verificação paralelizam.
8. **Pressão de recurso não remove prova nem segurança** (§110).

## W. `EOS_MASTER_IMPLEMENTATION_DAG`

Tabela de dependências verificável por máquina; validação topológica na §AZ.

```
WAVE-0  BASELINE
  SL-BOOT-01 ← (nenhum)
  SL-BOOT-02 ← SL-BOOT-01
  SL-BOOT-03 ← SL-BOOT-01
  SL-BOOT-04 ← SL-BOOT-01

WAVE-1  FOUNDATIONS                          [P2+P3]
  SL-A-01 ← SL-BOOT-02
  SL-A-02 ← SL-A-01        SL-A-03 ← SL-A-01        SL-A-04 ← SL-A-01
  SL-A-05 ← SL-A-03        SL-A-06 ← SL-A-01        SL-A-07 ← SL-A-01
  SL-A-08 ← SL-A-06        SL-A-09 ← SL-A-01        SL-A-10 ← SL-A-02

WAVE-2  KERNEL PRIMITIVES                    [P4 + P7a + PBCR-001/003]
  SL-K-01 ← SL-A-02, SL-A-06
  SL-K-02 ← SL-K-01, SL-A-04       SL-K-03 ← SL-K-02
  SL-K-04 ← SL-K-03                SL-K-05 ← SL-K-02, SL-A-03
  SL-K-06 ← SL-K-02                SL-K-07 ← SL-K-05, SL-A-07
  SL-K-08 ← SL-A-01                SL-K-09 ← SL-K-02, SL-A-07
  SL-K-10 ← SL-K-02                SL-K-15 ← SL-K-08

WAVE-3  FAKE RUNTIME PROOF                   [P5]
  SL-FK-01 ← SL-K-08       SL-FK-02 ← SL-K-08       SL-FK-03 ← SL-K-08
  SL-FK-04 ← SL-FK-01, SL-FK-02, SL-FK-03

WAVE-4  SCHEDULER / AUTHORITY / RECOVERY     [P7b + P6 + P8]
  SL-K-11 ← SL-K-08, SL-K-02       SL-K-12 ← SL-K-11, SL-K-03, SL-A-07, SL-FK-04
  SL-K-13 ← SL-K-12                SL-K-14 ← SL-K-12, SL-K-07, SL-K-06

WAVE-5  PROOF PLANE                          [P14]   ── frente paralela A
  SL-PF-01 ← SL-K-14       SL-PF-02 ← SL-PF-01, SL-K-07
  SL-PF-03 ← SL-PF-02      SL-PF-04 ← SL-PF-03, SL-K-10
  SL-PF-05 ← SL-PF-03      SL-PF-06 ← SL-PF-05
  SL-PF-07 ← SL-PF-04, SL-PF-05    SL-PF-08 ← SL-PF-01
  SL-PF-09 ← SL-PF-05, SL-PF-06, SL-PF-07          (MVPP)

WAVE-5' RESOURCE / OBSERVABILITY             [P15]   ── frente paralela B
  SL-RES-01 ← SL-K-14      SL-RES-02 ← SL-RES-01
  SL-RES-03 ← SL-RES-01    SL-RES-04 ← SL-RES-02, SL-RES-03

WAVE-6  CODEX PLANE                          [P9+P10] ── frente paralela C
  SL-CX-01 ← SL-K-14       SL-CX-02 ← SL-CX-01      SL-CX-03 ← SL-CX-01
  SL-CX-04 ← SL-CX-01      SL-CX-05 ← SL-CX-01..04
  SL-CG-01 ← SL-CX-05, SL-K-09     SL-CG-02 ← SL-CG-01, SL-K-11      (MVCP)

WAVE-7  CLAUDE PLANE                         [P11+P12+P13] ── frente paralela D
  SL-CL-01 ← SL-K-14       SL-CL-02 ← SL-CL-01      SL-CL-03 ← SL-CL-02
  SL-CL-04 ← SL-CL-02      SL-CL-05 ← SL-CL-02      SL-CL-06 ← SL-CL-02
  SL-CL-07 ← SL-CL-03..06                           SL-CL-08 ← SL-CL-07, SL-K-09
  SL-CL-09 ← SL-CL-08, SL-K-07, SL-PF-02            (MVEP)

WAVE-8  INTEGRATED LOCAL RUNTIME
  SL-INT-01 ← SL-PF-09, SL-CG-02, SL-CL-09, SL-RES-04
  SL-INT-02 ← SL-INT-01

WAVE-9  CHAOS SUBSET                         [P16]
  SL-CH-01 ← SL-K-10, SL-FK-04     SL-CH-02 ← SL-CH-01, SL-INT-02

WAVE-10 SHADOW                               [P17]
  SL-SH-01 ← SL-INT-02             SL-SH-02 ← SL-SH-01
  SL-SH-03 ← SL-SH-02, SL-CH-02    SL-SH-04 ← SL-SH-03
  SL-SH-05 ← SL-SH-04, SL-BOOT-03

WAVE-11 DUAL                                 [P18]
  SL-DU-01 ← SL-SH-05              SL-DU-02 ← SL-DU-01, SL-K-11
  SL-DU-03 ← SL-DU-02, SL-K-14     SL-DU-04 ← SL-DU-03

WAVE-12 ACTIVE PREREQUISITES
  SL-AC-01 ← SL-DU-04, SL-CX-05, SL-CL-07
  SL-AC-02 ← SL-BOOT-04, SL-INT-02          (segundo repositório)
  SL-AC-03 ← SL-INT-02                      (self-hosting degraus 1-2)
  SL-AC-04 ← SL-AC-01, SL-AC-02, SL-AC-03   → ACTIVE_CUTOVER_READY → [D2]

WAVE-13 ACTIVE + PÓS
  SL-AC-05 ← SL-AC-04 + D2         SL-AC-06 ← SL-AC-05
  SL-SH-08 ← SL-AC-06              (self-upgrade, candidato)
  SL-LG-01 ← SL-AC-06              SL-LG-02 ← SL-LG-01
  SL-CLI-01 ← SL-AC-06             (meta de produto: `eos` / `eos run "intent"`)
```

`SL-BOOT-04` (fixture do segundo repositório) prepara-se na onda 0 e só é consumido na onda 12 —
paralelismo real, não caminho crítico.

## X. Ondas de implementação

| Onda | Nome | Gate | `proofRegime` |
|---|---|---|---|
| 0 | Execution Baseline | `BASELINE_CAPTURED` | `BOOTSTRAP_PROOF` |
| 1 | Foundations | `FOUNDATIONS_IMPLEMENTED` | `BOOTSTRAP_PROOF` |
| 2 | Kernel Primitives | `KERNEL_PRIMITIVES_IMPLEMENTED` | `BOOTSTRAP_PROOF` |
| 3 | Fake Runtime Proof | `KERNEL_FAKE_VERIFIED` | `BOOTSTRAP_PROOF` |
| 4 | Scheduler/Authority/Recovery | `KERNEL_OPERATIONAL` | `BOOTSTRAP_PROOF` |
| 5 | Proof Plane | **`PROOF_PLANE_OPERATIONAL`** | `BOOTSTRAP_PROOF` → **regime muda aqui** |
| 5' | Resource/Observability | `RESOURCE_ACCOUNTING_OPERATIONAL` | `NEW_PROOF` |
| 6 | Codex Plane | `CODEX_ADAPTER_OPERATIONAL` · `CODEX_COGNITIVE_PLANE_OPERATIONAL` | `NEW_PROOF` |
| 7 | Claude Plane | `CLAUDE_RUNTIME_SELECTED_BY_EVIDENCE` · `CLAUDE_ADAPTER_OPERATIONAL` · `CLAUDE_EXECUTION_PLANE_OPERATIONAL` | `NEW_PROOF` |
| 8 | Integrated Local Runtime | **`LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED`** | `NEW_PROOF` |
| 9 | Chaos subset | `KERNEL_RESILIENCE_PROVEN` (escopo local/fakes) | `NEW_PROOF` |
| 10 | Shadow | `SHADOW_MODE_OPERATIONAL` → `SHADOW_MODE_EVALUATED` | `NEW_PROOF` |
| 11 | Dual | `DUAL_MODE_OPERATIONAL` → `DUAL_MODE_STABLE` | `NEW_PROOF` |
| 12 | Active prerequisites | **`ACTIVE_CUTOVER_READY`** → **[D2 do usuário]** | `NEW_PROOF` |
| 13 | Active + pós | `ACTIVE_MULTI_AGENT_OPERATIONAL` → `ACTIVE_MULTI_AGENT_VERIFIED` → `SELF_HOSTING_READY` → `LEGACY_DISABLE_READY` → `LEGACY_REMOVAL_READY` | `NEW_PROOF` |

**`LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED` não é Shadow** (§70/§71): é infraestrutura integrada em
fixture, sem migração de autoridade.

## Y. `MASTER_SLICE_REGISTRY`

Quarenta e nove slices. Campos completos por slice estão no formato da §42; a tabela lista o núcleo.
`RR` = Required Reviewer.

| ID | Objetivo | Owner | RR | Findings | Gate |
|---|---|---|---|---|---|
| `SL-BOOT-01` | Capturar branch, HEAD, worktree, ponto de rollback, 10 suites | `eosMaintainer` | `release` | — | `BASELINE_CAPTURED` |
| `SL-BOOT-02` | Layout aditivo `tools/eos/{protocol,authority,provenance,invariants}` | `eosMaintainer` | `testInfrastructure` | — | idem |
| `SL-BOOT-03` | Snapshot de evidência de segurança legada + `RepositorySecurityProfile` do AdmAi | `security` | `release` | `057`,`061`,`062` | idem |
| `SL-BOOT-04` | Fixture do segundo repositório (preparada cedo, usada tarde) | `testInfrastructure` | `security` | — | idem |
| `SL-A-01` | Tipos canônicos das nove famílias | `eosMaintainer` | `testInfrastructure` | — | `FOUNDATIONS_IMPLEMENTED` |
| `SL-A-02` | Registro de invariantes + `EnforcementClass` + mapa | `eosMaintainer` | `security` | `034` | idem |
| `SL-A-03` | Modelo de artefato + mutabilidade + construtor de Evidence | `eosMaintainer` | `security` | `044` | idem |
| `SL-A-04` | `repositoryId` obrigatório em registro e referência | `eosMaintainer` | `security` | `032` | idem |
| `SL-A-05` | Máquina de estados de contrato + `transitionId` | `eosMaintainer` | `integration` | `016` | idem |
| `SL-A-06` | Protocolo de evento bidimensional + envelope + erros | `eosMaintainer` | `testInfrastructure` | — | idem |
| `SL-A-07` | **Modelo de snapshot + decisão e implementação do `SnapshotId`** | `eosMaintainer` | `testInfrastructure` | — | **`SNAPSHOT_ID_FROZEN`** |
| `SL-A-08` | Versionamento + `RuntimeManifest` + rejeição de downgrade | `eosMaintainer` | `release` | `022`,`033` | idem |
| `SL-A-09` | Modelo de capability + gatilhos de revalidação | `eosMaintainer` | `security` | `018`,`043` | idem |
| `SL-A-10` | Provenance de nove categorias | `eosMaintainer` | `security` | — | idem |
| `SL-K-01` | Domínios de verdade + escada de asserção | `eosMaintainer` | `testInfrastructure` | `023` | `KERNEL_PRIMITIVES_IMPLEMENTED` |
| `SL-K-02` | Event Journal + cadeia de checksum + caminho de escrita | `eosMaintainer` | `security` | `011`,`038` | idem |
| `SL-K-03` | Projeções + `ProjectionCursor` + leitura decisória | `eosMaintainer` | `testInfrastructure` | `011`,`037` | idem |
| `SL-K-04` | Replay + checkpoint + `RECONSTRUCTION_MODE` | `eosMaintainer` | `security` | `028` | idem |
| `SL-K-05` | Side Effect Coordinator + 7 estados + ambíguo destrutivo | `eosMaintainer` | `security` | `012`,`026` | idem |
| `SL-K-06` | `RepositoryRuntimeLease` + `SliceLease` + limites declarados | `eosMaintainer` | `security` | `013`,`021`,`024`,`025`,`027` | idem |
| `SL-K-07` | **`WriteManifest` produzido pelo Kernel** (`PBCR-002`) | `eosMaintainer` | `security` | `017`,`050` | idem |
| `SL-K-08` | Contratos de adapter (cognitivo, execução, verificação) | `eosMaintainer` | `integration` | — | idem |
| `SL-K-09` | **`DeterministicContextBroker`** (`PBCR-001`) | `eosMaintainer` | `testInfrastructure` | — | idem |
| `SL-K-10` | **Pontos de injeção de falha** (`PBCR-003`) | `eosMaintainer` | `testInfrastructure` | — | idem |
| `SL-K-11` | Authority Validator + precedência + D0/D1/D2 | `eosMaintainer` | `security` | `003`,`031`,`035` | `KERNEL_OPERATIONAL` |
| `SL-K-12` | Plan Compiler + `ExecutionGraph` + Scheduler + aging | `eosMaintainer` | `testInfrastructure` | `014`,`037` | idem |
| `SL-K-13` | Backpressure + disponibilidade + rate limit | `eosMaintainer` | `testInfrastructure` | `008` | idem |
| `SL-K-14` | Recovery + classificação de falha + guardas de laço | `eosMaintainer` | `security` | `017` | idem |
| `SL-K-15` | Superfície de controle e observação com authority check | `security` | `eosMaintainer` | `029`,`039` | idem |
| `SL-FK-01` | `FakeCodex` com 14 comportamentos | `testInfrastructure` | `eosMaintainer` | — | `KERNEL_FAKE_VERIFIED` |
| `SL-FK-02` | `FakeClaude` idem | `testInfrastructure` | `eosMaintainer` | — | idem |
| `SL-FK-03` | `FakeVerification` com 8 comportamentos | `testInfrastructure` | `eosMaintainer` | — | idem |
| `SL-FK-04` | Conformance comum + fakes sob o mesmo envelope | `testInfrastructure` | `security` | `036` | idem |
| `SL-PF-01` | Deterministic Runner — executa e captura, não interpreta | `eosMaintainer` | `testInfrastructure` | — | `PROOF_PLANE_OPERATIONAL` |
| `SL-PF-02` | **Desreferenciamento de evidência** + colocação do estado do EOS | `eosMaintainer` | `security` | **`052`**,`050` | idem |
| `SL-PF-03` | TestContract Evaluator + obrigações derivadas | `eosMaintainer` | `security` | `052` | idem |
| `SL-PF-04` | `VerificationMutationPolicy` + controles negativos | `testInfrastructure` | `eosMaintainer` | `028` | idem |
| `SL-PF-05` | Proof Ledger Builder + Gate Evaluator em 4 eixos | `eosMaintainer` | `testInfrastructure` | `053` | idem |
| `SL-PF-06` | Baseline + fingerprint + **remoção do wildcard `auto`** | `testInfrastructure` | `security` | `006`,`056` | idem |
| `SL-PF-07` | Meta-verificação + segregação de alteração | `testInfrastructure` | `security` | `015` | idem |
| `SL-PF-08` | Política de execução de teste não confiável | `security` | `testInfrastructure` | `055` | idem |
| `SL-PF-09` | **MVPP** — runner contradiz executor, gate segue o runner | `eosMaintainer` | `security` | `052` | idem |
| `SL-RES-01` | 5 domínios × channel × state, sem dupla contagem | `eosMaintainer` | `testInfrastructure` | — | `RESOURCE_ACCOUNTING_OPERATIONAL` |
| `SL-RES-02` | 4 estados de medição, `UNAVAILABLE ≠ 0` | `eosMaintainer` | `testInfrastructure` | `020` | idem |
| `SL-RES-03` | Observabilidade read-only + redação + retenção | `observability` | `security` | — | idem |
| `SL-RES-04` | Instrumentos de `H-MAR-001` + regra antifraude | `eosMaintainer` | `testInfrastructure` | `005` | idem |
| `SL-CX-01` | **Probe de read-only do Codex — shell e file tool** | `security` | `eosMaintainer` | `030`,`041` | `CODEX_ADAPTER_OPERATIONAL` |
| `SL-CX-02` | Probe de isolamento A→B + estratégia de `CODEX_HOME` | `security` | `eosMaintainer` | `009` | idem |
| `SL-CX-03` | Probe de memória nativa | `security` | `eosMaintainer` | `010` | idem |
| `SL-CX-04` | Probe de visibilidade de aprovação | `security` | `eosMaintainer` | `042` | idem |
| `SL-CX-05` | `CodexRuntimeAdapter` (8 métodos) + envelope + conformance | `integration` | `security` | `002` | idem |
| `SL-CG-01` | Cognitive Router determinístico + contratos de papel | `eosMaintainer` | `security` | `045` | `CODEX_COGNITIVE_PLANE_OPERATIONAL` |
| `SL-CG-02` | **MVCP** — Decision Analyst + Planner | `eosMaintainer` | `security` | `003` | idem |
| `SL-CL-01` | Avaliação de candidatos de runtime Claude | `security` | `eosMaintainer` | `046` | `CLAUDE_RUNTIME_SELECTED_BY_EVIDENCE` |
| `SL-CL-02` | Probes de lifecycle, sessão, schema, crash | `security` | `eosMaintainer` | — | idem |
| `SL-CL-03` | **Probe dos 4 caminhos de escrita** — 9 combinações | `security` | `eosMaintainer` | `046`,`047` | idem |
| `SL-CL-04` | **Probe de subagente / writer oculto** + árvore de processo | `security` | `eosMaintainer` | **`051`** | idem |
| `SL-CL-05` | Probe de visibilidade de aprovação | `security` | `eosMaintainer` | **`048`** | idem |
| `SL-CL-06` | Probe de isolamento de sessão e de perfil | `security` | `eosMaintainer` | `049`,`019` | idem |
| `SL-CL-07` | `ClaudeRuntimeAdapter` (7 métodos) + envelope + conformance | `integration` | `security` | `019` | `CLAUDE_ADAPTER_OPERATIONAL` |
| `SL-CL-08` | `ExecutionCapsule` + `forbiddenChangeScope` (`PDCR-001`) | `security` | `eosMaintainer` | `050` | `CLAUDE_EXECUTION_PLANE_OPERATIONAL` |
| `SL-CL-09` | **MVEP** — um papel, um Slice mutante, drill de crash | `backend` | `security` | `017` | idem |
| `SL-INT-01` | Runtime local integrado em fixture: EOS+Codex+Claude+Verification | `integration` | `security` | — | `LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED` |
| `SL-INT-02` | Bootstrap global + `RepositorySecurityProfile` portável | `eosMaintainer` | `security` | — | idem |
| `SL-CH-01` | Harness de chaos + catálogo por propriedade `R1`–`R14` | `testInfrastructure` | `eosMaintainer` | — | `KERNEL_RESILIENCE_PROVEN` |
| `SL-CH-02` | Subset obrigatório antes do Shadow | `testInfrastructure` | `security` | — | idem |
| `SL-SH-01` | **Isolamento por clone descartável** — nunca worktree | `eosMaintainer` | `security` | **`058`** | `SHADOW_MODE_OPERATIONAL` |
| `SL-SH-02` | **Shadow retrospectivo** + `SHADOW_COMPARISON_RECORD` | `eosMaintainer` | `testInfrastructure` | **`059`** | idem |
| `SL-SH-03` | Comparação em três vias + amostragem fixada antes | `eosMaintainer` | `testInfrastructure` | — | idem |
| `SL-SH-04` | Coleta de `H-MAR-001` com metodologia versionada | `eosMaintainer` | `testInfrastructure` | `005` | `SHADOW_MODE_EVALUATED` |
| `SL-SH-05` | Probes de segurança no Shadow + matriz sem regressão | `security` | `release` | `002` | idem |
| `SL-DU-01` | **Fencing de controle legado — governador único** | `security` | `eosMaintainer` | **`060`**,`021` | `DUAL_MODE_OPERATIONAL` |
| `SL-DU-02` | Allowlist de autoridade D1 + rampa | `eosMaintainer` | `security` | — | idem |
| `SL-DU-03` | Execução Dual em escopo elegível | `backend` | `security` | — | idem |
| `SL-DU-04` | Fallback ciente de estado, recuperação e efeito | `eosMaintainer` | `security` | `012`,`017`,`026`,`057` | `DUAL_MODE_STABLE` |
| `SL-AC-01` | Reconciliação das matrizes de capability/proof/chaos | `security` | `release` | os 4 `MUST_RESOLVE` | `ACTIVE_CUTOVER_READY` |
| `SL-AC-02` | **Validação no segundo repositório** | `testInfrastructure` | `security` | `009`,`049` | idem |
| `SL-AC-03` | Self-hosting degraus 1–2 (doc e código de baixo risco) | `eosMaintainer` | `security` | — | idem |
| `SL-AC-04` | Protocolo de cutover + `cutoverState` + drill de crash | `release` | `security` | — | idem → **[D2]** |
| `SL-AC-05` | Ativação após D2 + demoção de emergência D0 | `release` | `security` | — | `ACTIVE_MULTI_AGENT_OPERATIONAL` |
| `SL-AC-06` | Observação pós-Active por requisito de evidência | `eosMaintainer` | `release` | — | `ACTIVE_MULTI_AGENT_VERIFIED` |
| `SL-SH-08` | `RUNNING_EOS` vs `CANDIDATE_EOS`, sem hot rewrite | `eosMaintainer` | `security` | — | `SELF_HOSTING_READY` |
| `SL-LG-01` | Desativação do legado | `release` | `security` | `057` | `LEGACY_DISABLE_READY` |
| `SL-LG-02` | Remoção do legado (independente) | `release` | `security` | — | `LEGACY_REMOVAL_READY` |
| `SL-CLI-01` | `eos` / `eos run "intent"` — entrega da meta de produto | `eosMaintainer` | `release` | — | pós-Active |

**Tamanho (§145):** cada slice é pequeno o bastante para ser verificado sozinho e grande o bastante
para produzir uma propriedade. Nenhum é "implementar o Kernel"; nenhum é microtarefa de um arquivo.

## Z. Ownership e Required Reviewers

**Roster existente reusado sem inventar `EngineerId`** (§43). Distribuição: `eosMaintainer` 38 ·
`security` 19 · `testInfrastructure` 14 · `integration` 4 · `release` 8 · `backend` 2 ·
`observability` 1.

**Reviewer obrigatório (§44/§116):** todo slice de segurança, autoridade, journal, verificação e
migração tem `RR` **diferente** do owner. **O implementador nunca é o reviewer.** Em particular, o
controle negativo que certifica o Proof Plane (`SL-PF-04`) tem owner `testInfrastructure` e `RR`
`eosMaintainer` — ninguém controla sozinho o instrumento que o certifica.

## AA–AH. Implementação por camada

**AA. Foundations** (`SL-A-*`) — tipos canônicos, invariantes com classe, artefatos com mutabilidade,
autoridade (representação), protocolo, snapshot com `SnapshotId` decidido, versionamento, manifesto,
capability, provenance. **`SL-A-07` é o gate `SNAPSHOT_ID_FROZEN`**, exigido antes do Scheduler (§48).
**`PENDING_CAUSATION`** (§49) implementa a rejeição decidida no PLAN-B, com teste de chegada fora de
ordem em `SL-A-06`.

**AB. Kernel** (`SL-K-*`) — na ordem de dependência real do PLAN-B §BG, não na ordem numérica.
`SL-K-03` implementa a guarda de `F-MAR-037` (§51): leitura decisória vai ao journal ou exige cursor
alcançado. `SL-K-04` implementa `RECONSTRUCTION_MODE` com teste negativo de replay tentando efeito
(§52).

**AC. Fakes** (`SL-FK-*`) — o gate `KERNEL_FAKE_VERIFIED` (§53/§54) exige journal e replay, autoridade,
scheduler, não duplicação de efeito, recuperação, bloqueio parcial, perda de capability, rate limit,
crash e evento duplicado. **Nenhum provider real antes disso.**

**AD. Proof Plane** (`SL-PF-*`) — sub-DAG derivado, não a ordem `P14→P15→P16` (`F-MAR-054`): os hooks
de falha já vieram em `SL-K-10` (§55), então runner → desreferenciamento → evaluator → controles
negativos → ledger/gate → meta-verificação. `SL-PF-08` trata `F-MAR-055` (§57/§58): a política de
execução de teste declara quando o Runner pode executar script do repositório e quais controles
mínimos existem — sem sandbox duro, com risco explícito.

**AE–AF. Codex** (`SL-CX-*`, `SL-CG-*`) — probes antes de qualquer dependência (§59); **MVCP antes de
todos os papéis** (§60). `SL-K-09` (Broker, `PBCR-001`) precede a `CognitiveCapsule` real (§61).
**Plugin permanece `NOT_JUSTIFIED_YET`** (§62). **Tool surface = `MINIMUM_SET` congelado**; deferred
continua deferred; rejected não reaparece (§63).

**AG–AH. Claude** (`SL-CL-*`) — probe antes de seleção de runtime (§64); **MVEP antes do roster
completo** (§65). **Subagentes explicitamente desabilitados no MVEP** (§66). Sessão slice-scoped com
`sessionId` do EOS e sem persistência; **resume fora do MVEP** (§67). `PDCR-001` implementado e
testado em `SL-CL-08` (§68). **`SL-PF-02` (estado do EOS fora do workspace) é pré-requisito de
`SL-CL-09`** (§69) — sem isso o MVEP mutante roda antes de o estado estar protegido.

## AI. Runtime local integrado

`LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED` (§70) prova, **em fixture**, EOS + Codex + Claude +
Verification coordenados sob contratos reais. **Não é Shadow e não migra autoridade** (§71).

## AJ. Chaos e resiliência

Catálogos de PLAN-B, E e F reconciliados e **deduplicados por propriedade**, não por contagem (§120).
Quatorze propriedades `R1`–`R14`; cada cenário mapeia a pelo menos uma; cenário redundante não é
adicionado. Limiares por fase preservados (§72/§121): antes do Shadow roda apenas o subset marcado
obrigatório — **a suite do Active não é antecipada**, e nenhum chaos destrutivo contra provider real é
antecipado.

## AK–AM. Shadow, Dual, Active

**Shadow** (§73/§74) — retrospectivo, clone descartável, **`.git` nunca compartilhado**. Coleta de
`H-MAR-001` começa; **a metodologia é versionada antes de ver resultado**.

**Dual** (§75–§78) — só após `SHADOW_MODE_EVALUATED`. **`F-MAR-060` resolvido em `SL-DU-01` antes do
primeiro Slice autoritativo.** Rampa de D1 progressiva. Fallback ciente de estado, recuperação e
efeito — **nunca cego**.

**Active** (§79–§88) — matrizes do PLAN-F reconciliadas em `SL-AC-01`. **`F-MAR-057` implica que o
fallback legado não é read-only-safe** (§80, §AO). Segundo repositório é **precondição**, nunca
pós-validação (§81/§82). Cutover é **D2**; readiness técnica é do EOS (§83); **não se pergunta agora**
(§84). Demoção de emergência é **D0** (§85). Desativação do legado é separada do primeiro Active
(§86). Self-hosting desacoplado (§87), sem hot rewrite (§88).

## AN. Segundo repositório

`SL-BOOT-04` prepara a fixture na onda 0; `SL-AC-02` a consome na onda 12. Critérios: `repositoryId`
diferente, sem premissa do launcher do AdmAi, estado de provider isolado. Prova bootstrap, perfil de
segurança, isolamento, snapshot, Kernel, contexto do Codex, contexto do Claude, prova, namespace de
recurso e lease. Negativo: nada de `A` acessível enquanto `B` roda.

## AO. Migração do legado e `F-MAR-057`

**Classificação em três partes distintas** (§10):

| Aspecto | Classificação | Disposição |
|---|---|---|
| Inconsistência de documentação e governança | `GOVERNANCE_INCONSISTENCY` | `AGENTS.md` diz "somente leitura"; o mecanismo permite patch. Corrigir o **texto** é trivial e é decisão do usuário |
| Gap de segurança do legado | `LEGACY_SECURITY_GAP` | O Codex legado pode escrever na worktree por dois mecanismos |
| Correção do baseline de migração | `MIGRATION_BASELINE_CORRECTION` | Já aplicada na §I e na §J |

**Owner de execução (§11) — decidido:** **não é automático que o legado precise ser reparado se será
substituído.** O caminho novo nega escrita ao Codex desde o P9. Portanto:

- **Antes do Shadow:** não exigido — o Shadow roda em clone descartável.
- **Antes do Dual:** **exigido registrar**, não necessariamente reparar. `SL-DU-04` obriga que a
  Authority/Security Policy do Dual carregue as **capacidades reais** do fallback legado. *Fallback
  inseguro não pode ser tratado como fallback seguro.*
- **Antes do Active:** não bloqueia, porque o caminho novo é o autoritativo.
- **Reparar o texto de governança:** decisão do usuário, fora desta fase.

**Ciclo de vida do MCP legado** (§85 do PLAN-F): `LEGACY_REQUIRED → LEGACY_AVAILABLE →
LEGACY_FALLBACK → LEGACY_DISABLED → LEGACY_REMOVED`.

**§129/§130:** proteções do launcher viram políticas de repositório e runtime **sem perda silenciosa**
(`PDCR-002`, `PDCR-003`); **fraquezas legadas não viram requisitos** do EOS novo.

## AP. Rollback

| Nível | Escopo | Por onda |
|---|---|---|
| `SLICE_ROLLBACK` | código do slice | todas |
| `PROVIDER_FALLBACK` | provider indisponível | 6+ |
| `MODE_DEMOTION` | `authorityState` → modo | 10+ |
| `RUNTIME_ROLLBACK` | versão do runtime + estado reconstruído | 4+ |
| `LEGACY_RESTORE` | caminho legado retomado | 10+ |

Por onda maior (§113): rollback de código, reconstrução de estado de runtime, rollback de config de
provider e disponibilidade do caminho legado. **§114 — nunca voltar a configuração legada insegura sem
registrar a consequência**; `F-MAR-057` importa aqui, e é por isso que `SL-DU-04` registra as
capacidades reais do fallback. **§121 — efeito destrutivo nem sempre reverte**: compensação,
reconciliação ou intervenção manual.

## AQ. Recurso e `H-MAR-001`

Métricas consolidadas de PLAN-E §AB–§AD; **nenhuma telemetria inventada** (§122). `UNAVAILABLE`
permanece de primeira classe e **não invalida a avaliação de correção e segurança** (§123).

**§124 — dado histórico legado:** como o Proof legado é `LEGACY_PROOF_FORM_ONLY`, ele sustenta
**apenas** dimensões observáveis fora do ledger — wall time, rodadas de correção, replans, findings
registrados, bytes de contexto. **Não** sustenta `correctness` nem `security`, porque um `PASS`
antigo não é equivalente a prova determinística futura.

## AR. Mapeamento de testes e gates

**Pirâmide consolidada sem duplicação** (§115): unit · contract · integration · negative ·
conformance · security oracle · chaos · dogfooding · portability.

Famílias por fase, já congeladas nos planos: `TYPE-* INV-* AUTH-* ENF-*` (A) · `PROTO-* SNAP-*
VERSION-* CAUSAL-* IDEMP-* SEC-PROTO-*` (A) · `JOURNAL-* PROJ-* REPLAY-* SIDEFX-* STATE-* FAKE-*
ADAPTER-CONFORMANCE-* SCHED-* DAG-* JOIN-* BLOCK-* STARVE-* BACKPRESSURE-* AUTH-* DECISION-*
PRECEDENCE-* D0-* D1-* D2-* REC-* LEASE-* HB-* CRASH-* AMBIG-* RESUME-*` (B) · `CX-*` (C) · `CL-*`
(D) · `VFY-* RES-* OBS-* CHAOS-*` (E) · `SHADOW-* DUAL-* ACTIVE-*` (F).

**Cada família mapeia a Slice, Finding, invariante e gate** (§117). **Nenhum teste órfão** (§118):
teste sem propriedade ou gate consumidor é questionado e removido. **Nenhum invariante crítico sem
oráculo** (§119) — se faltar, o gate correspondente bloqueia.

## AS. `GATE_REGISTRY`

| Gate | Onda | Critério objetivo | `proofRegime` |
|---|---|---|---|
| `BASELINE_CAPTURED` | 0 | branch, HEAD, suites, evidência legada registrados | `BOOTSTRAP_PROOF` |
| `FOUNDATIONS_IMPLEMENTED` | 1 | tipos, invariantes, artefatos, protocolo com testes positivos e negativos | `BOOTSTRAP_PROOF` |
| `SNAPSHOT_ID_FROZEN` | 1 | algoritmo escolhido, determinístico, canonicalizado, com teste de CRLF | `BOOTSTRAP_PROOF` |
| `KERNEL_PRIMITIVES_IMPLEMENTED` | 2 | journal, projeção, replay, efeitos, leases, manifesto, hooks | `BOOTSTRAP_PROOF` |
| `KERNEL_FAKE_VERIFIED` | 3 | os 10 critérios da §54 sob os três fakes | `BOOTSTRAP_PROOF` |
| `KERNEL_OPERATIONAL` | 4 | autoridade, compiler, scheduler, recovery, controle | `BOOTSTRAP_PROOF` |
| **`PROOF_PLANE_OPERATIONAL`** | 5 | desreferenciamento, reexecução, MVPP com contradição, controle negativo detectado, gate em 4 eixos | `BOOTSTRAP_PROOF` → **muda aqui** |
| `RESOURCE_ACCOUNTING_OPERATIONAL` | 5' | 5 domínios sem dupla contagem, `UNAVAILABLE ≠ 0`, rate limit em `WAITING` | `NEW_PROOF` |
| `CODEX_ADAPTER_OPERATIONAL` | 6 | 8 métodos, read-only `PROVEN` nas 2 variantes, isolamento, memória, aprovação, conformance | `NEW_PROOF` |
| `CODEX_COGNITIVE_PLANE_OPERATIONAL` | 6 | MVCP, router determinístico, D1 validado, D2 preservado | `NEW_PROOF` |
| `CLAUDE_RUNTIME_SELECTED_BY_EVIDENCE` | 7 | 4 critérios eliminatórios com oráculo duplo | `NEW_PROOF` |
| `CLAUDE_ADAPTER_OPERATIONAL` | 7 | 7 métodos, conformance com fake e real, crash observável | `NEW_PROOF` |
| `CLAUDE_EXECUTION_PLANE_OPERATIONAL` | 7 | MVEP, manifesto do Kernel, out-of-scope detectado, escrita parcial recuperada | `NEW_PROOF` |
| `LOCAL_MULTI_AGENT_RUNTIME_INTEGRATED` | 8 | 4 planos coordenados em fixture sob contratos reais | `NEW_PROOF` |
| `KERNEL_RESILIENCE_PROVEN` | 9 | `R1`–`R14` sobre fakes, store descartável, local | `NEW_PROOF` |
| `SHADOW_MODE_OPERATIONAL` | 10 | clone isolado, retrospectivo, nenhuma escrita autoritativa | `NEW_PROOF` |
| `SHADOW_MODE_EVALUATED` | 10 | os 6 critérios por propriedade do PLAN-F §T | `NEW_PROOF` |
| `DUAL_MODE_OPERATIONAL` | 11 | governador único provado, escopo elegível, allowlist D1, fallback recuperativo | `NEW_PROOF` |
| `DUAL_MODE_STABLE` | 11 | evidência de correção, segurança, resiliência, autoridade, isolamento, prova e rollback | `NEW_PROOF` |
| **`ACTIVE_CUTOVER_READY`** | 12 | 4 `MUST_RESOLVE` resolvidos **e verificados**, matrizes reconciliadas, segundo repo, self-hosting 1–2 | `NEW_PROOF` |
| `ACTIVE_MULTI_AGENT_OPERATIONAL` | 13 | **após D2 do usuário** | `NEW_PROOF` |
| `ACTIVE_MULTI_AGENT_VERIFIED` | 13 | observação pós-Active por requisito de evidência | `NEW_PROOF` |
| `SELF_HOSTING_READY` | 13 | escada completa com meta-verificação | `NEW_PROOF` |
| `LEGACY_DISABLE_READY` | 13 | Active estável + rollback provado por outro meio | `NEW_PROOF` |
| `LEGACY_REMOVAL_READY` | 13 | independente e posterior | `NEW_PROOF` |

**Todo gate tem critério objetivo e `proofRegime`** — nenhuma prosa do tipo "quando parecer estável"
(§151). **Toda transição de autoridade tem caminho de rollback ou demoção** (§152).

## AT. `FUTURE_D2_REGISTRY`

Decisões que a execução futura provavelmente alcançará — **nenhuma inventada** (§97):

| D2 | Quando | Gatilho |
|---|---|---|
| **Promoção a `ACTIVE`** | onda 12 | `ACTIVE_CUTOVER_READY` |
| Mudança do launcher legado para fencing de controle | onda 11 | `SL-DU-01` / `F-MAR-060` |
| Correção do texto de governança sobre o Codex legado | qualquer momento | `F-MAR-057` |
| Autorização de commit/push durante a implementação | onda 1+ | §AU |
| Instalação de dependência nova, se algum probe exigir | onda 6/7 | probe |
| Promoção a staging ou produção | pós-Active | política de ambiente |
| Mudança do threat model para malicioso de mesma conta | pós-Active | `KR-MAR-002` |
| Claude cloud/remoto, multi-writer, remoção do legado | pós-Active | §AX |

## AU. Condições de parada da execução

O executor futuro percorre o DAG **sem voltar ao usuário a cada fase** e para **apenas** por (§107,
§167): `USER_EXCLUSIVE_DECISION` · `BLOCKING_SECURITY_GAP` · `BLOCKING_CAPABILITY_GAP` ·
`UNRESOLVED_PLAN_DEFECT` · `UNSAFE_TO_CONTINUE` · `NON_RECOVERABLE_ENVIRONMENT_BLOCKER`.

Todo o resto: **Finding → menor camada responsável → correção → reteste → retomar o DAG**.
**Bloqueio parcial não congela a implementação** (§108, `MAR-INV-029`): o DAG mostra o trabalho
independente que continua.

**Política de commit (§111/§112):** commits em **checkpoints de onda verificada**, não por
microtarefa — e **somente com autorização do usuário**, que hoje não existe. `push`, `merge` e
`deploy` têm gates separados e **não são presumidos**. A implementação inicial pode permanecer local.

## AV. Procedimento de defeito de plano

```
execução detecta divergência
  ↓ PLAN_DEFECT Finding, na MENOR camada responsável
  ↓ pausa da fronteira dependente (não do Run)
  ↓ correção do Master Plan com incremento de masterPlanVersion
  ↓ revalidação dos slices downstream afetados (frontier mínima)
  ↓ retomada do DAG
```

Camada responsável: taxonomia/protocolo → PLAN-A · kernel → PLAN-B · cognição → PLAN-C · execução →
PLAN-D · prova/resiliência → PLAN-E · migração → PLAN-F · integração/ordem → PLAN-G.

## AW. Regras do congelamento

**`PLANNING_FREEZE` significa: sem mudança silenciosa** — não significa que evidência jamais mude o
plano (§101). Depois do freeze, `MAR-P2`…`P19` **não são replanejados individualmente** (§168); o
Master Plan é o plano de implementação autoritativo.

Mudanças permitidas apenas por: `PLAN_DEFECT` · `NEW_EVIDENCE` · `CAPABILITY_GAP` ·
`SECURITY_FINDING` · `USER_D2` (§99). Toda mudança incrementa `masterPlanVersion` (§102), e o Run
futuro registra `masterPlanVersion`, `protocolVersion`, `policyVersion`, versões de adapter, de skill
e do perfil do repositório no `RuntimeManifest` (§103).

**Estado de slice (§104):** derivado dos **quatro eixos** já definidos (`lifecycle · stage ·
blockingReason · outcome`). Rótulos humanos como `NOT_STARTED`, `IN_PROGRESS`, `ENGINEER_COMPLETE`,
`VERIFIED` são **derivados**, nunca um enum monolítico autoritativo.

## AX. `POST_ACTIVE_DEFERRED`

Multi-writer · Claude cloud/remoto · Agent SDK · ferramentas condicionais do Codex
(`impact`, `contract`, `testRegistry`) · plugin do Codex · sessões persistentes do Claude · resume ·
`--worktree` por Slice · self-hosting degraus 3–5 · desativação e remoção do legado · CLI completa
além de `SL-CLI-01` · staging e produção.

**Distinção do §163:** `Kernel MVP` (ondas 2–4) · `MVCP` (`SL-CG-02`) · `MVEP` (`SL-CL-09`) ·
`MVPP` (`SL-PF-09`) · **Initial ACTIVE** (onda 13) · **Post-ACTIVE** (esta lista). Isso é o que impede
a implementação inicial de crescer indefinidamente.

## AY. Revisão de simplicidade

**Respostas diretas à §157:** slices redundantes — não, após fundir os probes do Codex de oito em
quatro e os do Claude de nove combinações em um slice. Dois gates provando a mesma propriedade — não;
`KERNEL_FAKE_VERIFIED` e `KERNEL_OPERATIONAL` provam coisas distintas. Artefato ou estado duplicado —
não (§K). Capabilities não necessárias antes do Active — removidas para `POST_ACTIVE_DEFERRED`.
Features deferidas entrando pela porta dos fundos — não; `MINIMUM_SET` e a lista deferida são
verificadas em `SL-CX-05` e `SL-CL-07`. Um teste provando várias propriedades — sim, e é legítimo:
o MVPP prova `R10` e `R13` de uma vez. Overfitting no AdmAi — evitado; o AdmAi é o **primeiro perfil
de repositório**, e `SL-INT-02` separa o bootstrap global do perfil (§127/§128). Resolvendo ameaça
maliciosa de mesma conta apesar do threat model — não. Segurando o legado além do necessário — não;
`LEGACY_DISABLE_READY` é gate próprio. Implementando todos os papéis lógicos de uma vez — não; MVEP é
um papel.

**Cortado nesta fase:** `EOS_IMPLEMENTATION_MANIFEST` legível por máquina (§142) — **não justificado
agora**: o Master Plan já é a fonte, e um manifesto derivado seria uma segunda representação sem
consumidor até a implementação existir. Fica em `POST_ACTIVE_DEFERRED` como possibilidade.

## AZ. Validação topológica e cenários adversariais

**Validação do DAG (§159):** a tabela da §W foi verificada por **ordenação topológica de Kahn**
executada sobre o próprio texto do documento. **85 slices, 128 arestas, ordenação completa, 0
ciclos.** Raiz única: `SL-BOOT-01`. Toda aresta aponta de dependência para dependente; nenhum slice
depende de onda posterior. Os seis ciclos potenciais da §158 estão quebrados pelas resoluções da §U, e
o sétimo — o ciclo de gate do `F-MAR-063` — está quebrado por `MASTER-INV-002`.

**`MASTER_CRITICAL_PATH`** (§160) — **caminho mais longo computado**, não estimado à mão, para
entender dependência e não para estimar tempo:

```
SL-BOOT-01 → SL-BOOT-02 → SL-A-01 → SL-A-02 → SL-K-01 → SL-K-02 → SL-K-03
  → SL-K-12 → SL-K-14 → SL-PF-01 → SL-PF-02 → SL-PF-03 → SL-PF-04 → SL-PF-07
  → SL-PF-09 → SL-INT-01 → SL-INT-02 → SL-SH-01 → SL-SH-02 → SL-SH-03
  → SL-SH-04 → SL-SH-05 → SL-DU-01 → SL-DU-02 → SL-DU-03 → SL-DU-04
  → SL-AC-01 → SL-AC-04 → [D2] → SL-AC-05 → SL-AC-06 → SL-LG-01 → SL-LG-02
```

**Trinta e dois slices** no caminho crítico. Três leituras que só a computação revelou:
o caminho passa por `SL-K-03` (projeção) e **não** por `SL-K-05`/`SL-K-07`, que ficam em ramo
paralelo; passa pelos quatro slices do Shadow em série, o que faz do Shadow o trecho mais longo
depois do Proof Plane; e **`SL-PF-02` continua sendo o ponto de maior alavancagem** — é onde
`F-MAR-052` fecha e o regime de prova muda.

**`PARALLEL_FRONTIERS`** (§161), respeitando writer físico único para mutação:

```
FRONTIER-1  Proof Plane (SL-PF-*)          após SL-K-14
FRONTIER-2  Resource/Observability          após SL-K-14
FRONTIER-3  Codex probes + adapter          após SL-K-14
FRONTIER-4  Claude probes + adapter         após SL-K-14
FRONTIER-5  Fixture do segundo repositório  após SL-BOOT-01  (a mais longa e a mais barata)
```

Paralelismo **lógico**; a mutação do repositório continua serializada.

**Os 25 cenários adversariais da §158:**

| # | Cenário | Representação |
|---|---|---|
| 1 | Ciclo de bootstrap de prova | §U — `BOOTSTRAP_PROOF` + controle negativo (`F-MAR-063`) |
| 2 | Ciclo de bootstrap de autoridade | §U — governança atual autoriza a implementação |
| 3 | Snapshot não congelado | `SL-A-07`, gate `SNAPSHOT_ID_FROZEN` antes do Scheduler |
| 4 | Inversão Scheduler ↔ Authority | DAG do PLAN-B §BG: `P7a → P4 → P7b → P6` |
| 5 | Ciclo Proof ↔ fault hooks | `PBCR-003`: `SL-K-10` na onda 2 |
| 6 | Context Broker depois do Codex | `PBCR-001`: `SL-K-09` na onda 2 |
| 7 | MVEP antes de proteger o estado | `SL-PF-02` é pré-requisito de `SL-CL-09` |
| 8 | Shadow com `.git` compartilhado | `SL-SH-01`, clone descartável (`F-MAR-058`) |
| 9 | Dois governadores | `SL-DU-01` antes do primeiro Slice Dual (`F-MAR-060`) |
| 10 | Fallback legado inseguro | §AO — capacidades reais registradas em `SL-DU-04` (`F-MAR-057`) |
| 11 | Capability `UNKNOWN` no Active | `MAR-INV-043` + §S; gate bloqueia |
| 12 | Verificação confiando em PASS do chamador | `SL-PF-02`/`SL-PF-03` (`F-MAR-052`); MVPP prova |
| 13 | Executor adultera prova | §R + `PBCR-002` + `PDCR-001`; residual `DETECTIVE` declarado |
| 14 | Subagente cria writer oculto | `SL-CL-04`; `MUST_RESOLVE_BEFORE_ACTIVE` |
| 15 | Vazamento entre repositórios | `SL-CX-02`, `SL-CL-06`, `SL-AC-02` |
| 16 | Inversão por número de fase | §V.1 + `F-MAR-040`/`054`; DAG governa |
| 17 | Portabilidade tarde demais | `SL-BOOT-04` na onda 0; `SL-AC-02` **antes** do cutover |
| 18 | Auto-promoção sem D2 | §AU: `USER_EXCLUSIVE_DECISION` é condição de parada |
| 19 | Demoção esperando o usuário | §AM: demoção é D0, promoção é D2 |
| 20 | Bloqueio local congela tudo | `MAR-INV-029`; frentes paralelas da §AZ continuam |
| 21 | Defeito de plano no meio | §AV: menor camada, `masterPlanVersion`, frontier mínima |
| 22 | Upgrade de provider durante a execução | `SL-A-09`: `CAPABILITY_REVALIDATION_REQUIRED` |
| 23 | Garantia legada perdida | `PDCR-002` + `PDCR-003` (`F-MAR-061`, `F-MAR-062`) |
| 24 | Fraqueza legada virando requisito | §J/§AO — `F-MAR-057` registrado, **não replicado** |
| 25 | `H-MAR-001` positiva por omissão | regra antifraude (`SL-RES-04`); `UNAVAILABLE` permanece |

## BA. Findings novos do PLAN-G

| ID | Achado | Sev. | Categoria | Planos afetados | Bloqueia freeze? | Owner |
|---|---|---|---|---|---|---|
| **`F-MAR-062`** | **Inventário de controles legados incompleto.** Quatro controles `OBSERVED` no launcher — detecção de política no Registry, conflito de `CLAUDE_CONFIG_DIR`, bloqueio de override de argumento (incluindo **`--add-dir`**, sobre o qual o PLAN-D se apoiou) e allowlist de item do perfil — não aparecem em nenhum plano. Direção oposta ao `F-MAR-061`: o legado é **mais forte** que o registrado, e migrar sem mapear perde proteção | MEDIUM | Migração de segurança | D, F | **Não** — resolvido por `PDCR-003` | `security` |
| **`F-MAR-063`** | **Regime de prova não declarado.** Nenhum plano A–F disse **qual regime valida a implementação do próprio Proof Plane**, criando dependência circular latente de gate: o gate do Kernel exigiria a prova nova, que exige chaos, que exige hooks, que exigem o Kernel | HIGH | Dependência de gate | B, E, G | **Não** — resolvido por `MASTER-INV-002` e §U | `eosMaintainer` |

Registrado sem número novo: **`F-MAR-057` cobre também a linha 1 da matriz do MAR-P1** — mesma
realidade (o Codex legado escreve por **dois** mecanismos independentes), rótulo distinto.

## BB. `EOS_MASTER_IMPLEMENTATION_PLAN` — resumo

`masterPlanVersion: 1.0.0` · 14 ondas · **85 slices** · **128 arestas** · **0 ciclos** (Kahn,
verificado) · 25 gates, todos com critério objetivo e `proofRegime` · 63 Findings com disposição ·
6 Change Requests integrados · 44 invariantes `MAR-INV` + 2 `MASTER-INV` + os `EOS-*` preservados ·
13 capabilities críticas com probe e owner · 5 frentes paralelas · caminho crítico de **32 slices** ·
1 D2 futuro obrigatório.

## BC. Limitações remanescentes

1. **Contenção física de escrita do Claude não existe** — `KNOWN_LIMITATION`, não bloqueia Active.
2. **Mesma conta de SO** — threat model cooperativo-porém-falível; resistência a processo malicioso
   **não é declarada**.
3. **Verification executa código não confiável** — `F-MAR-055`, mitigação parcial declarada.
4. **Custo e eficiência de token provavelmente `UNAVAILABLE`** — não invalida correção nem segurança.
5. **Nove capabilities em `UNKNOWN`** — todas com probe, owner e fase; nenhuma usada como premissa de
   segurança antes de ser probada.
6. **`F-MAR-057` permanece no sistema atual** — registrado, com dono de decisão no usuário, e o
   fallback legado não pode ser descrito como read-only-safe.
7. **A reconciliação da §I cobriu a matriz de garantias legadas**, conforme a §8 pediu — **não** foi
   uma reauditoria do projeto inteiro, e isso está declarado.

## BD. Contrato da próxima execução

```
EOS MULTI-AGENT RUNTIME — IMPLEMENTATION EXECUTION
masterPlanVersion: 1.0.0

Autoridade: docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md e os contratos A–F.
Percorrer o EOS_MASTER_IMPLEMENTATION_DAG a partir de SL-BOOT-01, respeitando ondas,
frentes paralelas, gates e proofRegime. Não replanejar MAR-P2…P19 individualmente.

Parar APENAS por:
  USER_EXCLUSIVE_DECISION · BLOCKING_SECURITY_GAP · BLOCKING_CAPABILITY_GAP
  UNRESOLVED_PLAN_DEFECT · UNSAFE_TO_CONTINUE · NON_RECOVERABLE_ENVIRONMENT_BLOCKER

Todo o resto: Finding → menor camada responsável → correção → reteste → retomar.
Mudança do plano apenas por PLAN_DEFECT, NEW_EVIDENCE, CAPABILITY_GAP, SECURITY_FINDING
ou USER_D2, com incremento de masterPlanVersion.

Sem commit, push, merge, deploy, migration ou operação externa sem autorização explícita.
Parada obrigatória em ACTIVE_CUTOVER_READY para D2.
```

## BE. Estado do Git

`OBSERVED`: branch `fix/seguranca-criticos`, HEAD `30bf5453` — idêntico a `.claude/expected-head.txt`.
Apenas documentação nova. Zero runtime, provider, MCP, launcher, perfil, modo, Shadow, Dual, Active,
chaos, produto ou commit. **`F-MAR-057` não foi corrigido no código.** Nenhum hash de integridade e
nenhum conteúdo de credencial reproduzido.

## BF. Gate final

Os 27 critérios da §164 estão satisfeitos. As 25 perguntas da §171 são respondíveis a partir do Master
Plan e de seus contratos, e nenhuma exige redesenho arquitetural substancial.

**`PLAN_G_READY`**

**`EOS_MASTER_IMPLEMENTATION_PLAN_READY`**

**`PLANNING_FREEZE_READY`**

```
NEXT_ALLOWED_ACTION:
EOS MULTI-AGENT RUNTIME — IMPLEMENTATION EXECUTION
```
