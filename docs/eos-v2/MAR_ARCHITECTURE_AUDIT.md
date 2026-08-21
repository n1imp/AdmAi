# MAR — Auditoria arquitetural do EOS Multi-Agent Runtime

**Run:** `EOS-RUN-20260808T030320Z` · **Fase:** `MAR-P0` + `MAR-P1` · **Data:** 2026-08-09

> **Regra de evidência.** Toda afirmação sobre o ambiente é marcada `OBSERVED` (comando/arquivo/saída),
> `INFERRED` (dedução a partir de observação), `PROPOSED` (desenho, não comportamento existente) ou
> `UNKNOWN`. Nada `PROPOSED` é apresentado como existente.

---

## A. Escopo

Auditar adversarialmente a arquitetura do EOS Multi-Agent Runtime, corrigir a especificação e decidir
o gate. **Nenhuma implementação de runtime.** Sem Event Core, scheduler, adapters, Codex ou Claude
independentes, envelope executável ou código de produto.

---

## B. Baseline — MAR-P0 · `OBSERVED`

| Item | Valor |
|---|---|
| Branch | `fix/seguranca-criticos` |
| HEAD | `30bf5453d847c17d88197b11c93da965406be53c` |
| Worktree | `admai-worktrees/agent-environment` |
| Stashes | 0 |
| **10 suites do EOS** | **PASS** (risk, proof, engineering, ownership, capability, contract, baseline, decisions, accounting, selftest) |
| Findings abertos | `KR-005` (forks/jsdom), `KR-007` (F-006 residual do classificador) |
| Caminho MCP | `.claude/codex-mcp.json` + wrapper + `approval-policy.mjs`, com hash pinado |
| Launcher | `start-baseline.ps1`, `$projectRoot` e `$expectedBranch` pinados |
| Rollback | worktree limpo; nenhum arquivo de runtime criado nesta fase |

---

## C. Arquitetura sob revisão

`EOS = GOVERN` · `CODEX = THINK` · `CLAUDE = BUILD` · `VERIFICATION = PROVE` ·
`TOOLS = OBSERVE` · `USER = SOVEREIGN`.

Decisões do usuário preservadas e **não reabertas**: Codex roda independente e fora do MCP do Claude;
EOS coordena; planos separados; Verification independente; **writer físico único** nesta fase;
portabilidade multi-repositório como alvo; D2 exclusivo do usuário.

---

## D–F. Achados preliminares — disposição

### E. Rejeitado

**`F-MAR-007` · snapshot prematuro sob writer único · `REJECTED`**
Contra-modelo do usuário é causalmente correto: `Plan@SnapshotA` → Claude altera worktree para
`SnapshotB` → Reviewer segue operando sobre `A`. Writer único elimina corrida **write-write**, não
staleness **read-after-write** com leitores assíncronos. Snapshot Model preservado integralmente.

### F. Reclassificados

| ID | Classe final | Razão |
|---|---|---|
| `F-MAR-001` | `GOVERNANCE_SPEC_MIGRATION` | Três planos sob governador único não é *swarm*; §46 já impõe writer único; persistência operacional ≠ memória semântica externa |
| `F-MAR-005` | `RESEARCH_HYPOTHESIS` → `H-MAR-001` | Ausência de evidência não é evidência de ausência |
| `F-MAR-006` | `KNOWN_DEBT` | *Runner captura resultado deterministicamente* ≠ *ambiente de teste é determinístico*. `KR-005` só vira pré-requisito com evidência causal |
| `F-MAR-008` | `OPERATIONAL_RISK` | Provar que Codex indisponível não derruba o Run **é** o objetivo do MAR |

### G. Confirmados e corrigidos na especificação

**`F-MAR-003` · `BLOCKING_AUTHORITY` → `SPEC_CORRECTED`**
Fluxo obrigatório: `Codex Planner → PLAN_PROPOSAL → EOS PLAN COMPILER` (valida authority, risk,
readiness, dependencies, ownership, capabilities, concurrency, leases) `→ EXECUTION_GRAPH → EOS
Scheduler`. Architecture também produz proposta. **`MAR-INV-016`**.

**`F-MAR-002` · `BLOCKING_SECURITY` → `SPEC_CORRECTED`** — ver §I e §J.
**`F-MAR-004` · `BLOCKING_ARCHITECTURE` → `SPEC_CORRECTED`** — ver §K e §L.

---

## H. Achados novos

| ID | Categoria | Severidade | Classe |
|---|---|---|---|
| `F-MAR-009` | Cross-repository leakage | HIGH | `SPEC_CORRECTED` |
| `F-MAR-010` | Concurrent source of truth | HIGH | `SPEC_CORRECTED` |
| `F-MAR-011` | Dual-write consistency | HIGH | `PHASE_BLOCKER` (MAR-P4) |
| `F-MAR-012` | Side effect duplication | HIGH | `SPEC_CORRECTED` |
| `F-MAR-013` | Lease race | MEDIUM | `SPEC_CORRECTED` + limite em `F-MAR-025` |
| `F-MAR-014` | Starvation | MEDIUM | `SPEC_CORRECTED` |
| `F-MAR-015` | Meta self-certification | HIGH | `SPEC_CORRECTED` |
| `F-MAR-016` | Contract idempotency | MEDIUM | `SPEC_CORRECTED` |
| `F-MAR-017` | Partial multi-file write | HIGH | `SPEC_CORRECTED` |
| `F-MAR-018` | Capability staleness | MEDIUM | `SPEC_CORRECTED` |
| `F-MAR-019` | Prompt injection | HIGH | `SPEC_CORRECTED` + limite em §Y |
| `F-MAR-020` | Hypothesis measurability | MEDIUM | `RESEARCH_HYPOTHESIS` |
| `F-MAR-021` | Runtime concurrency | HIGH | `SPEC_CORRECTED` |
| `F-MAR-022` | Runtime version resume | HIGH | `SPEC_CORRECTED` |

**Evidência de `F-MAR-009` e `F-MAR-010` · `OBSERVED`** — conteúdo de `~/.codex-admai`:
`memories_1.sqlite` (40 KB), `goals_1.sqlite` (tabela `thread_goals`, **sem escopo de repositório
detectável**), `state_5.sqlite` (553 KB), `logs_2.sqlite`, `sessions/`, `skills/`. Todos **por perfil,
não por repositório**.

### Terceira passada — incongruências introduzidas pelas próprias correções

| ID | Achado | Severidade | Classe |
|---|---|---|---|
| **`F-MAR-023`** | `MAR-INV-021` (journal = fonte de verdade) colide com `MAR-INV-010` (recuperar do estado observado) quando o journal diz "efeito aplicado" e o mundo discorda | HIGH | `SPEC_CORRECTED` |
| **`F-MAR-024`** | `REPOSITORY_RUNTIME_LEASE` é mantido pelo runtime que ele protege: runtime morto deixa lease órfão indistinguível de saudável | HIGH | `SPEC_CORRECTED` |
| **`F-MAR-025`** | **Fencing token não é imponível sobre filesystem.** Fencing funciona quando o *recurso* valida o token; o filesystem não valida nada. Um writer obsoleto com handle aberto ainda escreve | HIGH | `SPEC_CORRECTED` com **limite declarado** |
| **`F-MAR-026`** | Reconciliation de efeito **destrutivo** em estado `AMBIGUOUS` pode repetir a destruição | HIGH | `SPEC_CORRECTED` |
| **`F-MAR-027`** | **Slice Lease não é imponível no nível de ferramenta do Claude.** Um Bash pode gravar fora do lease; a garantia é de *escalonamento*, não de *contenção* | HIGH | `SPEC_CORRECTED` com **limite declarado** |
| **`F-MAR-028`** | Verification Runner determinístico pode sujar o worktree (coverage, temp, snapshots) e invalidar o próprio snapshot que valida | MEDIUM | `SPEC_CORRECTED` |
| **`F-MAR-029`** | `ATTACH`/`SUBMIT INTENT` de segunda instância é canal de **controle**, não de observabilidade — precisa de authority check | MEDIUM | `SPEC_CORRECTED` |

**`F-MAR-025` e `F-MAR-027` são os achados mais importantes desta passada**, porque revelam que duas
garantias propostas são parcialmente **inexequíveis**. A correção não é fingir que funcionam: é
declarar o limite e mover a imposição para onde ela é real.

---

## I. `EOS_AGENT_SECURITY_ENVELOPE` · `PROPOSED`

Envelope **não depende do sandbox do provider** — usa-o como uma das camadas.

**Capacidade real do provider · `OBSERVED`** (`codex --help`): o CLI expõe
`-s, --sandbox <read-only | workspace-write | danger-full-access>`, `codex sandbox`,
`--strict-config`, `-c sandbox_permissions=[...]`, `-p <profile>` sobre `$CODEX_HOME`, e
`--dangerously-bypass-approvals-and-sandbox` (que o envelope **proíbe**).

Isso é decisivo: **`READ_ORIENTED` do Codex é imponível no nível do SO**, não por instrução.

| Dimensão | Política inicial |
|---|---|
| **Identity** | `provider · runtime · repositoryId · runId · sessionId · role` |
| **Filesystem** | Codex: leitura no repo, **escrita `DENIED`**. Claude: escrita só sob `Slice Lease` + política de ambiente. `protected paths` do perfil do repositório |
| **Shell** | Classes permitidas por allowlist; destrutivas exigem `SIDE_EFFECT_INTENT` + aprovação |
| **Network** | Negada por padrão no plano cognitivo; liberada por tarefa aprovada |
| **Tools** | `allow` / `deny` / `conditional`, por role e por ambiente |
| **Environment** | `LOCAL` default; `STAGING`/`PRODUCTION` exigem política e D2 |
| **Secrets** | Só referências; sem persistência no journal; menor privilégio |
| **Approvals** | `D0` EOS · `D1` Codex dentro do envelope · `D2` usuário · `policy-denied` |

**`MAR-INV-017 — Provider Sandbox ≠ EOS Security Policy`**: o sandbox do provider é *uma* camada;
a política do EOS é a autoridade, e a ausência de sandbox no provider **não** relaxa a política.

---

## J. Matriz de migração de garantias

`E` = equivalente · `S` = mais forte · `G` = lacuna.

| Garantia atual | Ponto de imposição atual | Ponto futuro | Veredito |
|---|---|---|---|
| Codex somente leitura | `approval-policy.mjs` + perfil `workspace-only` no wrapper (`OBSERVED`) | `--sandbox read-only` + envelope; escrita `DENIED` | **S** — read-only < workspace-write |
| Codex não cria patch | Política do MCP nega patches (`OBSERVED`) | Filesystem write `DENIED` no envelope + sandbox | **S** |
| Config estrita | `--strict-mcp-config` (`OBSERVED`) | `--strict-config` do codex + validação do adapter | **E** |
| Allowlist por ferramenta | `--allowedTools=mcp__codex__*,mcp__serena__…` (`OBSERVED`) | Tools allow/deny por role no envelope | **E** |
| Sem bypass de aprovação | Ausência de `--dangerously-*` no launcher (`OBSERVED`) | `--dangerously-bypass-approvals-and-sandbox` **proibido** pelo envelope | **E** |
| Integridade de binário e config por hash | Cadeia pinada no launcher (`OBSERVED`) | Global Runtime Integrity (§K) | **E** — desde que a cadeia seja portada, não abandonada |
| Fail-closed em drift | `Assert-Equal` aborta o launcher (`OBSERVED`) | Bootstrap aborta em drift de integridade | **E** |
| Escopo de worktree | `$projectRoot` e `$expectedBranch` pinados (`OBSERVED`) | `REPOSITORY_SECURITY_PROFILE` (§L) | **E** por repositório |
| Isolamento entre repositórios | **Não existe hoje** — perfil único (`OBSERVED`) | `CODEX_HOME` derivado de `repositoryId` (§M) | **S** — ganho novo |

**Nenhuma garantia é silenciosamente perdida.** Duas ficam mais fortes; uma passa a existir.

---

## K. `EOS_BOOTSTRAP` · `PROPOSED`

**Global Runtime Integrity** — identidade do runtime e dos adapters, compatibilidade de protocolo,
integridade de política. Herda o padrão de proveniência já validado nesta frente (verificar
integridade publicada em vez de comparar contra constante congelada — a lição do `KR-001`).

**Repository Security Profile** — §L.

Repositório novo sem `.eos/`: `DISCOVERED_UNTRUSTED → profile gerado → política resolvida → READY`.
**Confiança nunca é assumida.**

---

## L. `REPOSITORY_SECURITY_PROFILE` · `PROPOSED`

`repositoryId · trustState · branches permitidas · protected paths · tools · política de escrita ·
política de ambiente · política de secrets · invariantes do repositório · isolamento de estado do
provider`.

**Rota do AdmAi** (mapeamento apenas; launcher **não** alterado): `$expectedBranch` → `branches
permitidas`; `$projectRoot` → `repository boundary`; hashes de settings/manifests → `protected paths`
+ integridade; allowlist de MCP → `tools`; ausência de bypass → `approvals`. Nenhuma proteção
desaparece para tornar o `eos` genérico.

---

## M. Isolamento de estado do provider · `MAR-INV-023A`

**Provider Identity** (installation, auth, conta) *pode* ser compartilhada.
**Repository Runtime State** (sessions, threads, working memory, goals, artefatos, caches, memória por
repo) **precisa** ser isolado.

`OBSERVED`: `CODEX_HOME` e `-p <profile>` existem no CLI → **shared identity + isolated runtime state
é alcançável** sem perfil efêmero por repositório. Decisão final após probe do `MAR-P9`; a spec já
não depende do resultado.

## N. Memória nativa do provider · `MAR-INV-018` refinado

`memories_1.sqlite` (`OBSERVED`) é conhecimento **não versionado e não auditável**. Padrão:
**`DISABLED`**; onde tecnicamente inevitável, `ISOLATED_AND_NON_AUTHORITATIVE`. Nunca duas fontes
concorrentes para decisions, architecture, invariants, product state ou Known Risks. Cache técnico é
permitido se não cruzar repositórios, não tiver autoridade, for invalidável e não substituir o
Knowledge System.

---

## O–P. Journal e projeção · `MAR-INV-021`

`event → durable append → commit → projection update`. Crash entre os dois: `restart → replay →
rebuild/reconcile`. Projeção **não tem autoridade independente**. Componentes: append transacional,
cursor de projeção, replay, checkpoint, detecção de corrupção, reconstrução determinística.
Objetivo é *histórico durável + estado reconstruível*, não event sourcing acadêmico.

**`F-MAR-023` — escopo da autoridade do journal.** O journal é autoritativo sobre **intenção e
história do runtime**; o **mundo** é autoritativo sobre **resultado de efeito externo**. `MAR-INV-010`
e `MAR-INV-021` não colidem quando cada um tem seu domínio, e a reconciliação (§Q) é a ponte.

---

## Q. Modelo de side effect · `MAR-INV-019` reformulado

Mesmo domínio transacional → `ATOMIC_COMMIT`. Domínios distintos →
`SIDE_EFFECT_INTENT` (persistido) → `EXECUTION` (idempotency/fencing quando houver) →
`OBSERVATION` (reconciliação) → `COMPLETED`.

Máquina de estados: `INTENT_RECORDED · EXECUTING · OBSERVED_SUCCESS · OBSERVED_FAILURE · AMBIGUOUS ·
RECONCILING · COMPLETED · FAILED · MANUAL_INTERVENTION_REQUIRED`.

`AMBIGUOUS` **nunca** vira automaticamente FAIL ou SUCCESS.

**`F-MAR-026`:** efeito **destrutivo** em `AMBIGUOUS` vai direto a
`MANUAL_INTERVENTION_REQUIRED` — **nunca** reconciliação automática, porque reconciliar destruição
pode destruir de novo.

## R. Escrita parcial multi-arquivo · `F-MAR-017`

**Escolha: `Write Manifest`** — menor solução que detecta "3 de 7". Registra arquivos pretendidos,
fingerprints pré-escrita, conjunto de mutação, escritas observadas e conclusão. Staging temporário
(opção B) foi descartado por exigir publish atômico que o filesystem não garante — mesma raiz do
`F-MAR-025`.

Estados: `MANIFEST_RECORDED · PARTIALLY_APPLIED · FULLY_APPLIED · DIVERGENT · ROLLED_BACK`.
`PARTIALLY_APPLIED` **impede** o Slice de ser tratado como completo.

## S. Snapshot e invalidação

Preservado (`F-MAR-007` rejeitado). `RepositorySnapshot` · `STALE_CAPSULE` · `MINIMAL_INVALIDATION_FRONTIER`.
`MAR-INV-005`.

**`F-MAR-028`:** o Verification Runner deve executar sem sujar o worktree, ou declarar suas saídas
como fora do `relevantFilesFingerprint` — senão o instrumento invalida o snapshot que valida.

---

## T. `REPOSITORY_RUNTIME_LEASE` · `MAR-INV-023`

`repositoryId · runtimeId · pid · host · startedAt · heartbeat · fencingToken`. Segundo `eos`:
detecta runtime saudável → `ATTACH`/`WATCH`/`SUBMIT INTENT`, ou `RUNTIME_ALREADY_ACTIVE`. **Nunca**
cria segundo writer em silêncio.

**`F-MAR-024` — liveness não pode depender do próprio lease.** Detecção usa `pid` **mais**
`process start time` (evita PID reciclado — erro real cometido no `T-01` desta frente), heartbeat com
janela, e takeover explícito com incremento de `fencingToken`.

## U. Slice Lease e fencing · limite declarado

`leaseId · fencingToken · owner · repositoryId · sliceId · snapshot · issuedAt · expiresAt`.
Escrita valida token; token antigo → `STALE_FENCING_TOKEN`.

**`F-MAR-025` e `F-MAR-027` — o que NÃO é imponível.** Fencing token só funciona se o **recurso**
valida o token; o filesystem não valida nada, e um Bash do Claude pode gravar fora do lease. Logo:

> Single writer e Slice Lease são garantias de **escalonamento e detecção**, não de **contenção**.

Imposição real disponível: writer físico único por `REPOSITORY_RUNTIME_LEASE`; verificação
pós-escrita contra o `Write Manifest`; detecção de divergência via snapshot. **A especificação não
pode alegar contenção que o SO não entrega** — alegar seria segurança dependente de comportamento de
LLM, que a §42 manda rejeitar.

## V. Starvation · `F-MAR-014`

`effectivePriority = basePriority + aging + dependencyUnblockWeight + riskWeight`. Fórmula não
congelada; **propriedade** congelada: *um Slice permanentemente `READY` não espera indefinidamente só
porque trabalho de maior prioridade continua chegando.*

## W. Idempotência de contrato · `F-MAR-016`

Ciclo próprio: `OPEN · ACCEPTED · REJECTED · NEEDS_DECISION · FULFILLED · SUPERSEDED`. Transição
valida estado anterior **e** `contractEventId`. Event Bus é transporte; a semântica é da máquina de
estados. `MAR-INV-002` preservado.

## X. Invalidação de capability · `F-MAR-018`

Gatilhos: versão do provider, versão do adapter, modo de autenticação, restart, atualização de
skill/plugin relevante, mudança de política de segurança, degradação de saúde declarada. Efeito:
`CAPABILITY_REVALIDATION_REQUIRED`. Nenhum plano novo depende de capability materialmente obsoleta.

## Y. Proveniência e injeção · `MAR-INV-022`

Canais **normativos**: `SYSTEM_POLICY · USER_APPROVED_DECISION · APPROVED_REPOSITORY_POLICY ·
EOS_GENERATED`. Todo o resto — `UNTRUSTED_REPOSITORY_CODE · UNTRUSTED_REPOSITORY_DOCUMENTATION ·
UNTRUSTED_TOOL_OUTPUT · UNTRUSTED_EXTERNAL_CONTENT` — é **dado**.

Conteúdo de repositório nunca eleva authority, altera política, libera tool/shell/filesystem, muda
Environment Gate, D0/D1/D2 ou envelope, nem concede segredo.

**Limite honesto (`F-MAR-019`):** a proveniência é metadado do EOS; o provider recebe texto. A
imposição **real** é por **capability** — se o Codex está em `--sandbox read-only` e sem tool de
escrita, uma instrução maliciosa no README **não tem como** ser executada, independentemente do que
o modelo "decida". A defesa é estrutural; a rotulagem é auxiliar.

## Z. Meta-verificação · `MAR-INV-020`

`claude.eosMaintainer` **pode** manter o Verification Runner. Mudança nele exige:
`Conformance Fixtures → Negative Controls → Independent Review → Meta-Verification → Runner Accepted`.

Runner produz `command · environment · exitCode · stdout/stderr artifacts · resultFingerprint` — sem
interpretação narrativa do implementador. Conformance determinístico basta; **nenhum LLM adicional
obrigatório**.

Separação preservada: `Verification Policy` (EOS) ≠ `Runner` (executa) ≠ `Test Infrastructure`
(mantida por `testInfrastructure`) ≠ `Result` ≠ `Interpretation`.

## AA. `RUN_RUNTIME_MANIFEST` · `F-MAR-022`

`eosVersion · eventProtocolVersion · policyVersion · authorityPolicyVersion · codexAdapterVersion ·
claudeAdapterVersion · verificationAdapterVersion · skillVersions · repositoryProfileVersion ·
schemaVersions`. `eos resume` → `COMPATIBLE · COMPATIBLE_WITH_MIGRATION · INCOMPATIBLE`. Incompatível
→ `BLOCKED_RUNTIME_VERSION`. Run ativo é **pinado**; upgrade do EOS não reinterpreta Run antigo.

## AB. `H-MAR-001` — resultado multidimensional

*Separar Cognitive e Execution Plane reduz trabalho deliberativo e retrabalho do Claude sem degradar
correctness, verification ou segurança.*

Eixos, cada um com `SUPPORTED · INCONCLUSIVE · REFUTED · UNAVAILABLE · NOT_APPLICABLE`:
correctness · security · claudeExecutionFocus · rework · repeatedResearch · replans · findings ·
correctionRounds · contextBytes · toolCalls · wallTime · coordinationOverhead · tokenEfficiency ·
monetaryCost.

**Previsão honesta (`F-MAR-020`)**: `tokenEfficiency` e `monetaryCost` sairão `UNAVAILABLE` —
`~/.claude-admai/telemetry` está vazio (`OBSERVED`). Critérios de interpretação global declarados
**antes** do Shadow Mode; `REFUTED` em correctness ou security revisa a arquitetura.

## AC. Migração de governança · `F-MAR-001`

| Regra atual | Disposição |
|---|---|
| Proibição de *swarm* | **UPDATED** — passa a "múltiplos runtimes especializados sob governador único" |
| Proibição de múltiplos writers | **UNCHANGED** — writer físico único permanece nesta fase |
| Proibição de memória externa (semântica) | **UNCHANGED** — reforçada por `MAR-INV-018` |
| Persistência operacional (journal) | **UPDATED** — distinta de memória semântica; recuperável e descartável |
| Proibição de MCPs adicionais | **SUPERSEDED** por adapters sob envelope |
| Writer único = Claude | **UNCHANGED** |
| D2 do usuário | **UNCHANGED** |

`CLAUDE.md`, `AGENTS.md`, launcher e MCP **não alterados** nesta fase.

## AD. Invariantes consolidados

`MAR-INV-001` Plane ≠ Process ≠ Session ≠ Role ≠ Slice ≠ Tool ·
`002` Runtime Event ≠ Engineering Contract ·
`003` DecisionOwner ≠ Recommender ≠ ApprovalOwner ≠ Executor ≠ Verifier ·
`004` Codex não eleva a própria autoridade ·
`005` Artifact@SnapshotA ≠ Artifact@SnapshotB ·
`006` Duplicate Event ≠ Duplicate Side Effect ·
`007` Capability descoberta, não assumida ·
`008` CODEX_REVIEW_PASS ≠ VERIFICATION_PASS ·
`009` Partial Block ≠ Global Block ·
`010` Recuperar do estado observado (escopo: resultado de efeito externo) ·
`011` Agent Failure ≠ Run Failure ·
`012` Repository Content ≠ Runtime Authority ·
`016` Proposal Authority ≠ Execution Authority ·
`017` Provider Sandbox ≠ EOS Security Policy ·
`018` Provider-native memory ≠ EOS Knowledge System ·
`019` Efeito externo exige intent durável + reconciliação observável antes de retry ·
`020` Quem mantém o instrumento de verificação não é seu único certificador ·
`021` Event Journal = fonte de verdade do runtime; Projection = estado derivado reconstruível ·
`022` Content Provenance ≠ Instruction Authority ·
`023` Single Writer é propriedade do repositório, não do scheduler ·
`023A` Shared Provider Identity não implica Shared Repository Context ·
`024` Run semantics são pinadas por versão.

Sem reuso de ID com significado diferente. Invariantes do EOS V2 preservados sem enfraquecimento.

---

## AE. Blockers restantes

**Nenhum `BLOCKING_ARCHITECTURE`, `BLOCKING_SECURITY`, `BLOCKING_AUTHORITY` ou `BLOCKING_RECOVERY`
sobrevive sem correção de especificação.**

**Blockers que dependem de decisão do usuário: `none`.**

## AF. Débito por fase

| ID | Bloqueia |
|---|---|
| `F-MAR-011` | `MAR-P4` — consistência journal/projeção precisa ser provada, não só desenhada |
| `F-MAR-012`, `F-MAR-026` | `MAR-P4`/`MAR-P8` — reconciliação executável |
| `F-MAR-025`, `F-MAR-027` | Nenhuma fase — mas **proíbem** alegar contenção; a spec já declara o limite |
| `F-MAR-009`, `F-MAR-010` | `MAR-P9` — confirmar isolamento no probe real |
| `F-MAR-020` | `MAR-P17` — eixos de custo sairão `UNAVAILABLE` |
| `KR-005`, `KR-007` | Known Debt, inalterados |

## AG. Gate

Os 14 critérios da §37 estão satisfeitos em nível de especificação. Os dois blockers de segurança e
arquitetura fecharam com **evidência observada**, não com promessa: o sandbox nativo do Codex torna
`READ_ORIENTED` imponível pelo SO, e `CODEX_HOME` torna o isolamento por repositório alcançável.

**`MAR_ARCHITECTURE_READY`**

`NEXT_ALLOWED_PHASE: MAR-P2 — Taxonomy + Invariants`
