# PLAN-A — Foundations (MAR-P2 + MAR-P3)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-09

> **Nada neste documento está implementado.** Todo componente é `PLANNED`, salvo o que estiver
> explicitamente marcado `OBSERVED` como fato do EOS V2 atual. Schemas e pseudocódigo são
> ilustrativos e não executáveis.

---

## A. Escopo

Produzir a linguagem formal (`MAR-P2`) e o modelo de protocolo/snapshot (`MAR-P3`) do EOS
Multi-Agent Runtime, de modo que a implementação futura não precise redesenhar fundamentos.

## B. Entradas do MAR-P1

`docs/eos-v2/MAR_ARCHITECTURE_AUDIT.md` · gate `MAR_ARCHITECTURE_READY` · 29 findings dispostos ·
24 invariantes MAR · matriz de migração de garantias.

**Baseline `OBSERVED`:** branch `fix/seguranca-criticos`, HEAD `30bf5453`, 10 suites do EOS PASS,
`KR-005` e `KR-007` abertos, launcher e MCP intocados.

## C. Premissas congeladas

Codex independente e fora do MCP do Claude · EOS governa · Codex cognitivo · Claude executivo ·
Verification independente · **writer físico único** nesta fase · portabilidade futura · D2 do usuário.
Não reabertas.

## D. Não-objetivos explícitos

Event Core, Event Store, scheduler, adapters, fakes, envelope executável, bootstrap executável,
Verification Runner novo, migração do MCP, código de produto. Nada disso pertence ao PLAN-A.

---

## E. Taxonomia canônica

Nove famílias. Cada tipo tem **uma** definição e **um** dono.

**Runtime** — `Runtime` (instância do EOS num repositório) · `Plane` (Cognitive/Execution/Proof, um
*papel arquitetural*) · `Process` (processo do SO) · `Provider` (Codex, Claude) · `Adapter` (tradutor
protocolo EOS ↔ provider) · `Session` (conversa/thread num provider) · `Role` (função declarada:
`codex.architect`, `claude.backend`) · `AgentIdentity` (`provider + runtime + repositoryId + role`) ·
`Capability` (o que o provider comprovadamente faz).

**Work** — `Run` · `Intent` (pedido do usuário) · `Task` · `Slice` (unidade de responsabilidade com
um Primary Owner) · `Node` (vértice do grafo) · `Join` · `Dependency` · `ExecutionGraph`
(autoritativo, do EOS) · `PlanProposal` / `ArchitectureProposal` (do Codex, **não** autoritativos).

**Knowledge** — `Decision` · `Invariant` · `Evidence` · `Finding` · `KnownRisk` ·
`ArchitectureRecord` · `ImpactRecord` · `Contract` · `TestContract` · `ProofLedger`.

**State** — `RuntimeState` · `AgentState` · `NodeState` · `RunState` · `ContractState` ·
`FindingState` · `SideEffectState` · `VerificationState` · `EnvironmentState`.

**Authority** — `DecisionOwner` · `Recommender` · `ApprovalOwner` · `Executor` · `Verifier` ·
`AuthorityClass` · `ImpactClass` · `ReversibilityClass` · `ConfidenceClass`.

**Security** — `Authorization` (quem pode) · `Enforcement` (o que impede) · `Detection` (o que
percebe) · `Coordination` (o que organiza) · `Verification` (o que prova) · `ContentProvenance` ·
`TrustState` · `SecurityEnvelope` · `RepositorySecurityProfile`.

**Persistence** — `Event` · `Journal` · `Projection` · `Checkpoint` · `Snapshot` · `ArtifactVersion` ·
`RuntimeManifest`.

**Concurrency** — `RepositoryRuntimeLease` · `SliceLease` · `FencingToken` · `Writer` · `Reader` ·
`Ownership` · `Lock`.

**Side Effects** — `SideEffect` · `SideEffectIntent` · `SideEffectObservation` · `Reconciliation` ·
`WriteManifest`.

## F. Relações e distinções obrigatórias

`Plane ≠ Process ≠ Session ≠ Role ≠ Slice ≠ Tool` — um `Process` do Codex pode hospedar várias
`Session`, cada uma servindo vários `Role`; nenhum deles é um `Slice`.

`Runtime Event ≠ Engineering Contract` · `DecisionOwner ≠ Recommender ≠ ApprovalOwner ≠ Executor ≠
Verifier` · `Proposal Authority ≠ Execution Authority` ·
**`Authorization ≠ Enforcement ≠ Detection ≠ Coordination ≠ Verification`** ·
**`Capability Discovered ≠ Capability Proven`** · `Provider Sandbox ≠ EOS Security Policy` ·
`Provider-native Memory ≠ EOS Knowledge System` · `Journal ≠ Projection` ·
`Runtime State ≠ Observed External Reality` · `RepositoryRuntimeLease ≠ SliceLease` ·
**`Single Writer ≠ Filesystem Containment`** · **`Slice Lease ≠ OS-level Write Restriction`** ·
`CODEX_REVIEW_PASS ≠ VERIFICATION_PASS`.

As três em negrito são as que a auditoria mostrou serem confundidas com mais facilidade, e são a
razão de existir a §H.

## G. Modelo de autoridade

`D0` EOS determinístico · `D1` Codex dentro do envelope · `D2` usuário exclusivo — **um eixo** dentro
de um registro maior: `authority · impact · reversibility · confidence · scope · approvalPolicy ·
precedence · source · decisionRefs`.

**Precedência congelada**, com as três posições que a §11 mandou analisar já inseridas:

```
Safety/System Invariant
  > Legal/Compliance Policy          [inserido: não é derivável de nenhuma outra]
  > Security Policy                  [inserido: acima de repo policy, abaixo de invariante]
  > User APPROVED_FROZEN
  > Environment Policy               [inserido: gates de ambiente acima de repo policy]
  > Approved Repository Policy
  > Codex Durable D1
  > Slice-local Implementation Choice
```

`EPHEMERAL_DECISION` vs `DURABLE_DECISION` — promove a durable quando: ultrapassa o Slice, afeta
arquitetura, altera contrato, muda invariante, tem trade-off material, ou pode reaparecer.

## H. Classificação de enforcement — o núcleo do PLAN-A

| Classe | Semântica |
|---|---|
| `HARD_ENFORCED` | Mecanismo externo ao modelo bloqueia tecnicamente a tentativa proibida |
| `POLICY_ENFORCED` | Componente do EOS intercepta e controla a ação antes do efeito |
| `DETECTIVE` | Não impede; detecta a violação depois |
| `COORDINATION_ONLY` | Organiza ownership e concorrência; **não contém fisicamente** |
| `ADVISORY` | Instrução ao agente; **não é boundary de segurança** |
| `UNKNOWN` | Enforcement ainda não comprovado |

**`MAR-INV-025` — nenhuma garantia pode ser descrita como mais forte do que sua `EnforcementClass`
comprovada.** Este invariante é o que impede o sistema de mentir sobre a própria segurança.

Aplicação imediata aos achados do P1: `SliceLease` é `COORDINATION_ONLY` (`F-MAR-027`); fencing sobre
filesystem é `DETECTIVE`, não `HARD_ENFORCED` (`F-MAR-025`); `WriteManifest` é `DETECTIVE`;
`--sandbox read-only` do Codex é `HARD_ENFORCED` **quando `PROVEN`** — hoje está `DISCOVERED`.

## I. Modelo de capability

`UNKNOWN → DISCOVERED → PROBED → PROVEN → DEGRADED → INVALIDATED → UNAVAILABLE`.

Flag exposta pelo CLI é `DISCOVERED`. `PROVEN` exige oráculo positivo **e** negativo em runtime.
Gatilhos de invalidação: versão do provider ou adapter, modo de auth, restart, atualização de
skill/plugin, mudança de política, degradação declarada → `CAPABILITY_REVALIDATION_REQUIRED`.

## J. Content Provenance

Normativos: `SYSTEM_POLICY · USER_EXPLICIT_INSTRUCTION · USER_APPROVED_DECISION ·
APPROVED_REPOSITORY_POLICY · EOS_GENERATED`.
Dados: `UNTRUSTED_REPOSITORY_CODE · UNTRUSTED_REPOSITORY_DOCUMENTATION · UNTRUSTED_TOOL_OUTPUT ·
UNTRUSTED_EXTERNAL_CONTENT`.

`provenance` (de onde veio) · `authority` (o que pode determinar) · `trust` (quanto se confia no
conteúdo) são **três eixos independentes**. `MAR-INV-022`.

## K–L. Modelo de artefato e mutabilidade

Vinte artefatos canônicos: `IntentRecord · DecisionRecord · EvidenceRecord · ArchitectureProposal ·
PlanProposal · ExecutionGraph · ExecutionCapsule · CognitiveCapsule · ContractRecord · TestContract ·
ProofLedger · FindingRecord · CorrectionRequest · CorrectionResult · RepositorySnapshot ·
RuntimeManifest · WriteManifest · SideEffectRecord · VerificationResult · ResourceRecord`.

Cada um declara: `identity · version · producer · consumer · authority · snapshotBinding ·
evidenceDependencies · decisionDependencies · lifecycle · mutability`.

Mutabilidade: `IMMUTABLE` (Evidence, ProofLedger, SideEffectRecord, Snapshot) ·
`VERSIONED_MUTABLE` (Proposals, Contracts, TestContract) · `EPHEMERAL` (heartbeat, progress) ·
`DERIVED` (projeções, ExecutionGraph a partir de PlanProposal + validação).

**Nunca mutação silenciosa de artefato histórico.** Proposta muda → nova versão. `APPROVED_FROZEN`
muda → novo record com supersessão, segundo a authority.

## M–N. Invariantes: registro e mapa de enforcement

Consolidação sem apagar histórico, com relações `SUPERSEDES · REFINES · DEPENDS_ON`.

Cada invariante ganha: `InvariantId · Statement · Domain · Authority · EnforcementClass ·
EnforcementPoint · DetectionPoint · VerificationMethod · ApplicablePhases ·
ViolationFindingCategory`.

**Invariante sem enforcement/detection/verification conhecido é marcado `UNENFORCED`.** Não se finge
proteção.

Famílias exigidas pelas §16–§20 (safety, consistency, concurrency, recovery, verification) mapeadas
integralmente; os invariantes do EOS V2 (`EOS-P01`…`P12`, `EOS-INV-*`) são preservados sem
enfraquecimento e ganham os mesmos campos.

---

## O–T. Protocolos

Sete camadas separadas: `Runtime Event · Artifact Reference · Snapshot · Agent Adapter ·
Contract Transport · Control · Observation`.

**Envelope de evento** — campos mínimos: `schemaVersion · eventId · runId · repositoryId · runtimeId ·
type · source · target · correlationId · causationId · sequence · priority · snapshotRef · payload ·
evidenceRefs · decisionRefs · invariantRefs · contractRefs · artifactRefs · createdAt · expiresAt`.

Condicionais, só quando o tipo exigir: `idempotencyKey`, `sideEffectId`, `securityContextRef`,
`authorityContextRef`.

**Simplificação aplicada (§60):** `traceId` **descartado** — `correlationId` + `causationId` já dão a
cadeia. `securityContextRef` e `authorityContextRef` são **derivados** de `runId + role + snapshotRef`
sempre que possível, e só persistidos quando a derivação não for determinística.

**Classificação de evento — colapsada.** Em vez de dez classes ad hoc, duas dimensões ortogonais:

```
kind:      FACT | REQUEST | RESPONSE | COMMAND | STATE_TRANSITION
concern:   WORK | CONTROL | OBSERVATION | SECURITY | RECOVERY | RESOURCE
durable:   true | false
```

Isso evita o vício que a §74 manda procurar — um enum representando duas dimensões.

**`MAR-INV-026` — `Event Accepted ≠ Action Authorized`.** Transporte não confere permissão; o EOS
resolve autoridade a partir do **próprio estado**, nunca do payload.

**Controle** (`SUBMIT_INTENT · INTERRUPT_AGENT · PAUSE_RUN · RESUME_RUN · CANCEL_SLICE · APPROVE_D2 ·
REJECT_D2`) é `concern: CONTROL` e exige authority check — `F-MAR-029`.
**Observação** (`AGENT_STATE_CHANGED · NODE_STATE_CHANGED · RESOURCE_USAGE_UPDATED · FINDING_CREATED ·
GATE_CHANGED`) é `concern: OBSERVATION`, `durable: false`, e **watcher não recebe autoridade**.

**Erros:** `RETRYABLE · NON_RETRYABLE · POLICY_DENIED · AUTHORITY_DENIED · CAPABILITY_UNAVAILABLE ·
STALE_STATE · INVALID_PROTOCOL · PROVIDER_ERROR · ENVIRONMENT_ERROR · SECURITY_ERROR ·
AMBIGUOUS_SIDE_EFFECT`. Erro textual do provider é **normalizado pelo adapter**, nunca propagado cru.

**ACK:** `RECEIVED · ACCEPTED · EXECUTED · OBSERVED · VERIFIED`. ACK de transporte **não** significa
execução. Dead letter é falha de entrega/processamento que excedeu política — **nunca** D2 aguardando
usuário, rate limit ou bloqueio legítimo.

## U–V. Causalidade e idempotência

`eventId` sempre · `causationId` quando há evento pai · `correlationId` por fluxo lógico ·
`sequence` por `runId`. **Ordem causal ≠ ordem de relógio.** Evento fora de ordem cujo pai não
chegou fica em `PENDING_CAUSATION` até o pai ou até expirar por política.

Quatro idempotências **distintas**: de mensagem (`eventId`), de operação (`idempotencyKey`), de efeito
colateral (`sideEffectId`), de transição de contrato (`transitionId`). Confundi-las foi a origem de
`F-MAR-016`.

## W–Z. Snapshot, staleness e invalidação

`RepositorySnapshot`: `repositoryId · baseCommit · branch · workingTreeFingerprint ·
relevantFilesFingerprint · createdAt`. Avaliados e **adiados por risco**: untracked, index,
submodule, dependency lock, migration state — entram quando um Finding os exigir, não por completude.

**Granularidade — reduzida de quatro para duas + fallback:** `RELEVANT_SURFACE_SNAPSHOT` (padrão) ·
`ARTIFACT_SNAPSHOT` · `FULL_REPOSITORY_SNAPSHOT` (fallback). `ENVIRONMENT_SNAPSHOT` fica para quando
houver staging real. Hashear o repositório inteiro a cada evento seria a "sofisticação além do risco"
que a §60 manda evitar.

`SnapshotId` — requisitos, sem escolher hash agora: determinístico, canonicalizado (ordem de arquivo,
normalização de fim de linha — relevante dado o `CRLF` observado neste repo), e mudança de qualquer
campo de identidade invalida.

**Staleness:** `FRESH · STALE_RELEVANT · STALE_UNRELATED · UNKNOWN`. Mudança não relacionada **não**
bloqueia Capsule. `UNKNOWN` bloqueia — `EOS-P12`.

**Frontier mínima:** `invalidate(E) → dependentes diretos → fecho transitivo restrito às arestas
materiais → reabrir só a fronteira`. Dependências explícitas em todo artefato: `dependsOnEvidence ·
dependsOnDecision · dependsOnContract · dependsOnArtifact · dependsOnSnapshot`.

## AA–AD. Versionamento, manifesto, migração e fronteira de provider

`schemaVersion` **por tipo de mensagem**, não só global — evita travar o protocolo inteiro por uma
mudança local.

`RUN_RUNTIME_MANIFEST` com as dez versões da §38. `eos resume` → `COMPATIBLE ·
COMPATIBLE_WITH_MIGRATION · INCOMPATIBLE · UNKNOWN`, determinado **pelo EOS**, nunca pelo Codex.
`UNKNOWN` bloqueia. Migração é explícita, versionada, testável e auditável; evento v1 nunca é
reinterpretado em silêncio sob semântica v2.

**Fronteira de provider:** `EOS Protocol → Adapter → Provider Protocol`. Nenhum módulo fora do
adapter conhece JSON-RPC do Codex ou representação do Claude. Isso é o que torna
`F-MAR-002`/`F-MAR-009` resolvíveis sem reescrever o núcleo.

## AE–AJ. Contexto de segurança, efeitos, contratos, findings e recursos

**Security context:** `repositoryId · runId · runtimeId · role · authority · environment · leaseRef ·
securityProfileRef`. **Nunca transporta secret.**

**Side effect:** `SIDE_EFFECT_INTENT → STARTED → OBSERVATION → RECONCILIATION → COMPLETED | FAILED`,
com `AMBIGUOUS` explícito. Classificação: `NON_DESTRUCTIVE · REVERSIBLE · DESTRUCTIVE ·
IRREVERSIBLE`. **`AMBIGUOUS + DESTRUCTIVE` → `MANUAL_INTERVENTION_REQUIRED`**, sem auto-retry
(`F-MAR-026`).

**`WriteManifest`:** `sliceId · snapshotBefore · intendedFiles · preWriteFingerprints ·
observedWrites · completionState · snapshotAfter`. **`EnforcementClass: DETECTIVE`** — é evidência e
recuperação, não contenção.

**Contrato:** máquina de estados própria; transição carrega `contractId · contractVersion ·
transitionId · previousState · requestedState`. `CONTRACT_ACCEPTED` duplicado **não** transiciona.

**Finding:** `source` (`CODEX · CLAUDE · VERIFICATION · TOOL · EOS · USER`) permanece **ortogonal** a
`category`. Referências consistentes a Evidence, Slice, Artifact, Snapshot, Correction e Retest.

**Recurso:** todo campo carrega `MEASURED · ESTIMATED · UNAVAILABLE · NOT_APPLICABLE`.
**`UNAVAILABLE` nunca vira `0`** — invariante já provado no EOS V2 (`RES-02`, `OBSERVED`).

## AK. Layout futuro — `PROPOSED`

Estrutura real `OBSERVED`: `tools/eos/{accounting, baseline, engineering, knowledge, proof, risk,
router, runs, selftest, verification}`. Proposta **aditiva**, sem reorganizar o existente:

```
tools/eos/
  protocol/    types/ schemas/ events/ artifacts/ snapshots/ versioning/
  authority/
  provenance/
  invariants/          (consolida o registry hoje em knowledge/registries.mjs)
```

## AL–AN. Estratégia de teste — `PLANNED`

`MAR-P2`: `TYPE-*` `INV-*` `AUTH-*` `ENF-*`. `MAR-P3`: `PROTO-*` `SNAP-*` `VERSION-*` `CAUSAL-*`
`IDEMP-*` `SEC-PROTO-*`.

**Negativos obrigatórios:** repositoryId errado → reject · D1 tentando mutar D2 → reject · capsule
stale → block · capability `DISCOVERED` tratada como `PROVEN` → **fail** · garantia advisory
declarada `HARD_ENFORCED` → **fail de validação de schema** · transição de contrato duplicada → sem
efeito duplo · pedido de side effect duplicado → mesma identidade de intent · conteúdo não confiável
como authority → reject · manifesto incompatível → block resume · artefato apontando snapshot errado
→ stale · **downgrade de protocolo → reject** · **referência de artefato cross-repo → reject**.

**Positivos:** D1 válido · versionamento de artefato · causalidade válida · reuso de snapshot após
mudança não relacionada · entradas de reconstrução de projeção · replay idempotente de contrato ·
`UNAVAILABLE` representado corretamente · resume compatível.

**Adversariais:** replay de evento · spoof de autoridade · downgrade de protocolo · instrução dentro
de Evidence · snapshot obsoleto usado pelo Reviewer · ACK duplicado · causation pai ausente ·
dependência cíclica de artefato · classificação de enforcement forjada · referência cross-repo.

---

## AO. Findings novos do PLAN-A

| ID | Achado | Bloqueia PLAN-A? | Bloqueia fase | Dono |
|---|---|---|---|---|
| **`F-MAR-030`** | **Auto-correção do MAR-P1.** O gate do P1 afirmou que o sandbox do Codex torna `READ_ORIENTED` "imponível pelo SO" com base em `codex --help`. Sob o modelo de capability desta fase, isso é **`DISCOVERED`, não `PROVEN`**. O desenho continua válido; a *força* alegada era prematura | Não | `MAR-P9` (probe) | PLAN-C |
| **`F-MAR-031`** | Autoridade codificada apenas no payload é falsificável. O EOS precisa resolver authority a partir do próprio estado, nunca confiar no evento | Não | `MAR-P4`/`P7` | PLAN-B |
| **`F-MAR-032`** | `artifactRef` sem `repositoryId` permite referência cross-repository | Não | `MAR-P3` impl. | PLAN-A→B |
| **`F-MAR-033`** | Compatibilidade de versão precisa rejeitar **downgrade**, não só incompatibilidade | Não | `MAR-P8` | PLAN-E |
| **`F-MAR-034`** | **Enum misturando dimensões no EOS V2 atual** (`OBSERVED`): `SLICE_STATES` mistura ciclo de vida (`PLANNED`, `READY`, `IN_PROGRESS`) com bloqueio (`BLOCKED`) e com desfecho (`FAILED`, `VERIFIED`) | Não | `MAR-P2` impl. | PLAN-A |
| **`F-MAR-035`** | `ExecutionGraph` é `DERIVED` de `PlanProposal`, mas também é autoritativo. Derivado e autoritativo precisam de regra explícita: é autoritativo **após compilação e validação**, e recompilar exige nova versão | Não | `MAR-P6` | PLAN-B |

**`F-MAR-030` merece destaque:** é o próprio PLAN-A refutando uma afirmação do MAR-P1. A conclusão
arquitetural se mantém; o que muda é a honestidade sobre o grau de prova.

## AP. Dependências de fase

`MAR-P4` precisa de: Event Protocol, Journal boundary, Side Effect records, Error model.
`MAR-P6` precisa de: ExecutionGraph, Node states, Snapshot, Lease.
`MAR-P7` precisa de: Authority model, precedência, provenance.
`MAR-P9` precisa de: Capability model, Adapter boundary, Security context.

## AQ. `PLAN_A_EXPORT_CONTRACT`

Entregue ao PLAN-B, todos `PLANNED`: Canonical Types · Canonical Invariants + Enforcement Map ·
Enforcement Classes · Artifact Model + Mutability · Event Protocol + classificação bidimensional ·
Snapshot Model + staleness + frontier · Version Model + Runtime Manifest · Error Model · Authority
Representation + precedência · Content Provenance · Side Effect Protocol + WriteManifest.

**Incompletos e declarados:** algoritmo de `SnapshotId` (requisitos definidos, hash não escolhido) ·
lista final de views de projeção (esboçada) · política de expiração de `PENDING_CAUSATION`.

## AR–AT. Gates

**`MAR_TAXONOMY_FROZEN`** — os 10 critérios da §23 estão satisfeitos em planejamento.
**`MAR_PROTOCOL_MODEL_READY`** — protocolo, causalidade, idempotência, snapshot, versionamento e
migração definidos sem ambiguidade estrutural.

**`PLAN_A_READY`** · `MAR-P2 PLANNED` · `MAR-P3 PLANNED`.

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-B — EOS Kernel (MAR-P4 + P5 + P6 + P7 + P8)
```
