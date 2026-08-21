# PLAN-B — EOS Kernel (MAR-P4 … MAR-P8)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-09

> Nada aqui está implementado. Todo componente é `PLANNED`. Fatos do EOS V2 atual são marcados
> `OBSERVED`. Schemas e pseudocódigo são ilustrativos, não executáveis.

---

## A. Escopo

Projetar o Kernel do EOS — Event Core, Fake Runtimes, Scheduler, Authority e Recovery — de modo que a
implementação futura não redesenhe fundamentos durante a execução.

## B. Importações do PLAN-A

`PLAN_A_EXPORT_CONTRACT` integralmente. Preservados sem alteração: as seis `EnforcementClass`;
**`MAR-INV-025`** (nenhuma garantia descrita como mais forte que sua classe comprovada); o modelo de
capability `UNKNOWN → DISCOVERED → PROBED → PROVEN → DEGRADED → INVALIDATED → UNAVAILABLE`; as quatro
idempotências distintas; provenance; artefatos e mutabilidade.

**Exports incompletos do PLAN-A — disposição** (§93):

| Export | PLAN-B precisa? | Resolução |
|---|---|---|
| Algoritmo de `SnapshotId` | **Não para P4**; **sim antes de P6** | `snapshotRef` é ID **opaco** no journal; P4 só exige estabilidade de identidade e igualdade. Comparação de staleness (P6) exige o algoritmo congelado. **Owner: execução do MAR-P3, antes do MAR-P6** |
| Lista final de views de projeção | **Sim** | Resolvida em §J com poda explícita |
| Política de expiração de `PENDING_CAUSATION` | **Sim** | Resolvida em §U com a opção mais simples |

## C. Findings atribuídos ao PLAN-B

| Finding | Componente que resolve |
|---|---|
| `F-MAR-011` | §H+§J+§K — journal autoritativo, projeção derivada, cursor persistido |
| `F-MAR-012` | §M–§O — intent durável + reconciliação observada |
| `F-MAR-013`, `F-MAR-025` | §AC+§AD — lease como coordenação; fencing `DETECTIVE` no filesystem |
| `F-MAR-014` | §AE — aging |
| `F-MAR-016` | §AH (PLAN-A) + máquina de estado de contrato com `transitionId` |
| `F-MAR-017` | §Q+§AO — Write Manifest e recuperação de escrita parcial |
| `F-MAR-021`, `F-MAR-024` | §AB — Repository Runtime Lease com identidade de processo |
| `F-MAR-023` | §G — domínios de verdade |
| `F-MAR-026` | §P — destrutivo ambíguo nunca auto-retenta |
| `F-MAR-027` | §AA — writer único é escalonamento, não contenção |
| `F-MAR-028` | §AT — verificação declara mutação esperada (aprofunda no PLAN-E) |
| `F-MAR-029` | §AV — caminho de controle com authority check |
| `F-MAR-031` | §AG — autoridade resolvida do estado, nunca do payload |
| `F-MAR-032` | §H — `repositoryId` obrigatório em todo registro e referência |
| `F-MAR-033` | §AQ — downgrade rejeitado explicitamente |
| `F-MAR-034` | §W — dimensões ortogonais de estado |
| `F-MAR-035` | §V — `ExecutionGraph` derivado **e** autoritativo após compilação |

## D–E. Premissas e não-objetivos

Premissas congeladas do PLAN-A e do MAR-P1, não reabertas. **Não-objetivos:** qualquer código de
runtime, SQLite, adapters reais, processos independentes, migração do MCP ou do launcher, código de
produto.

## F. Princípios do Kernel

**`MAR-INV-027` — o Kernel permanece operacional sem disponibilidade de provider cognitivo ou
executivo.** Codex e Claude são *workers*, não infraestrutura. Nenhuma decisão de consistência,
ordenação, autoridade ou recuperação depende de um modelo.

Corolário de `F-MAR-030`: o Kernel **não pode depender** de sandbox do Codex, restrição de tool do
Claude, isolamento de filesystem do provider ou resume do provider para a própria consistência. Todas
essas capacidades estão `DISCOVERED` ou `UNKNOWN`.

---

## G. Domínios de verdade — resolução de `F-MAR-023`

| Domínio | Fonte autoritativa |
|---|---|
| Runtime (ciclo de vida, decisões, grafo, gates) | **Event Journal** |
| Repositório (HEAD, working tree, arquivos) | **Git e filesystem** |
| Provider (disponibilidade, capability) | **Probe/runtime do provider** |
| Ambiente | **Estado do ambiente** |
| Externo (APIs, serviços) | **O serviço** |

Uma fonte por domínio. O journal é verdade sobre **o que o EOS soube, decidiu e tentou** — nunca
sobre o que o mundo fez.

**Escada de asserção**, obrigatória em toda afirmação sobre efeito externo:

```
INTENDED   → o EOS registrou intenção
ATTEMPTED  → o EOS executou a chamada
OBSERVED   → o mundo foi consultado e respondeu
VERIFIED   → a observação satisfaz o critério de aceite
```

O journal **nunca** afirma `git commit exists`; afirma `INTENDED/ATTEMPTED`, e só o Git produz
`OBSERVED`.

## H–I. Event Journal e integridade

`JournalRecord`: `sequence · eventId · repositoryId · runId · runtimeId · generation · type ·
payloadRef · schemaVersion · createdAt · checksum · prevChecksum`.

`repositoryId` é **obrigatório** em todo registro e em toda referência de artefato — fecha
`F-MAR-032`.

Requisitos: append durável, commit crash-safe, ordem total por `runId`, namespaces de repositório /
runtime / run, detecção de corrupção por cadeia de checksum, migração explícita.

Candidato preferencial: **SQLite + WAL** — satisfaz durabilidade, ordenação e replay sem broker.
`OBSERVED`: o repositório já usa SQLite em outros contextos; nenhuma dependência nova de
infraestrutura.

**Integridade é `DETECTIVE`, não `HARD_ENFORCED`** — o arquivo vive no filesystem do usuário; a
cadeia de checksum detecta adulteração, não a impede (`F-MAR-038`).

**Caminho de escrita:** `recebe → valida schema → valida repositório/run → valida envelope de
autoridade quando aplicável → append durável → commit → aplica projeção → elegível para dispatch`.

## J. Projeções — podadas

**Mantidas** (necessárias à operação, caras de derivar a cada leitura):
`CurrentRuntime · CurrentRun · CurrentAgents · CurrentExecutionGraph · CurrentNodes ·
CurrentSideEffects · CurrentGates`.

**Podadas** (deriváveis sob demanda, sem custo operacional):
`CurrentDecisions`, `CurrentContracts`, `CurrentFindings`, `CurrentResources` — consultadas por
varredura do journal ou pelo Knowledge System já existente. Criar projeção para elas seria a
duplicação que a §91 manda evitar.

Toda projeção é `DERIVED · REBUILDABLE · NON_AUTHORITATIVE`.

## K–L. Replay e checkpoint — resolução de `F-MAR-011`

**A "dual write" dissolve-se porque não há duas autoridades.** Journal é verdade; projeção é cache
com `ProjectionCursor` persistido. Crash entre append e projeção → cursor atrasado → alcança no
restart. Nenhuma transação distribuída é necessária.

Modos: `FULL_REPLAY` (corrupção ou migração) · `CHECKPOINT_REPLAY` (restart normal) ·
`PARTIAL_PROJECTION_REBUILD` (uma view divergente).

**`MAR-INV-028` — reproduzir história NUNCA reproduz efeito colateral.**
Mecanismo: execução de efeito exige precondição **operacional** — lease vivo na `generation` atual e
intent em estado `READY`. Replay roda em `RECONSTRUCTION_MODE`, onde essa precondição é
estruturalmente insatisfazível. Não é uma flag que alguém lembra de checar; é o modo do runtime.

Checkpoint **acelera replay**; nunca é segunda verdade. Pontos: grafo materializado, decisão aceita,
contrato congelado, slice concluído, efeito reconciliado, gate alterado.

## M–P. Efeitos colaterais

**Estados — revisados e podados.** `READY` foi removido (redundante com `INTENT_RECORDED` + lease);
sete restam:

```
INTENT_RECORDED → EXECUTING → OBSERVED_SUCCESS | OBSERVED_FAILURE | AMBIGUOUS
AMBIGUOUS → RECONCILING → COMPLETED | FAILED | MANUAL_INTERVENTION_REQUIRED
```

**Tipos:** `FILESYSTEM_WRITE · GIT_MUTATION · PROCESS_EXECUTION · PACKAGE_MANAGER ·
DATABASE_MUTATION · EXTERNAL_API · ENVIRONMENT_MUTATION · DEPLOYMENT`. **Sem `OTHER`** — tipo
desconhecido exige classificação explícita antes de executar.

**Três eixos independentes:** `EffectType` × `Destructiveness` (`NON_DESTRUCTIVE · DESTRUCTIVE`) ×
`Reversibility` (`REVERSIBLE · IRREVERSIBLE`).

**Estratégias de idempotência**, declaradas por tipo: `NATIVE_IDEMPOTENCY_KEY · PRECONDITION_CHECK ·
POSTCONDITION_CHECK · UNIQUE_OPERATION_MARKER · EXPECTED_STATE_COMPARE · RECONCILIATION ·
MANUAL_ONLY`. Um tipo sem estratégia disponível cai em `MANUAL_ONLY`.

**Resolução de `F-MAR-012`:** domínio transacional compartilhado → `ATOMIC`. Caso contrário →
`DURABLE_INTENT → EXECUTE → OBSERVE REALITY → RECONCILE`. **Nunca** retry por ausência de registro de
conclusão sem observar a realidade.

**Resolução de `F-MAR-026`:** `AMBIGUOUS + (DESTRUCTIVE | IRREVERSIBLE)` →
**`NO_AUTOMATIC_RETRY`**. Saídas permitidas: `RECONCILIATION_WITHOUT_MUTATION` (só leitura),
`USER_DECISION_REQUIRED`, `MANUAL_INTERVENTION_REQUIRED`. Ausência de evento de conclusão **nunca**
infere permissão para repetir destruição.

## Q. Write Manifest

`sliceId · snapshotBefore · intendedFiles · preWriteFingerprints · observedWrites ·
postWriteFingerprints · completion`. Detecção de "3 de 7": comparar `observedWrites` com
`intendedFiles` e os fingerprints pós-escrita.

**`EnforcementClass: DETECTIVE`.** É evidência e recuperação, não contenção.

---

## R–T. Fake Runtimes

Três fakes implementam **exatamente** as mesmas interfaces dos adapters reais —
`CognitiveRuntimeAdapter`, `ExecutionRuntimeAdapter`, `VerificationRuntimeAdapter`. Interface
divergente invalidaria a prova.

Comportamentos programáveis: `SUCCESS · DELAY · TIMEOUT · RATE_LIMIT · CRASH_BEFORE_ACK ·
CRASH_AFTER_ACK · MALFORMED_RESPONSE · DUPLICATE_RESPONSE · STALE_RESPONSE · AUTHORITY_VIOLATION ·
EVIDENCE_CONFLICT · CAPABILITY_LOSS · RECOVERABLE_ERROR · FATAL_ERROR`.

Cenários declarativos, determinísticos, sem rede e sem quota. Capability simulável em todos os sete
estados, para exercitar o modelo do PLAN-A.

**`F-MAR-036` (novo):** os fakes devem rodar sob o **mesmo** envelope de segurança do runtime real.
Um fake com acesso irrestrito ao filesystem provaria o Kernel sob condições que a produção não terá.

**Conformance suite** comum a fakes e reais: `start · handshake · health · capabilities ·
createSession · resumeSession · send · stream · interrupt · stop · timeout · rateLimit · usage ·
errorNormalization · reconnect`.

## U–V. Plan Compiler e Execution Graph

`PLAN_PROPOSAL → EOS PLAN COMPILER → EXECUTION_GRAPH → EOS SCHEDULER`.

O Compiler valida: schema, autoridade, readiness, dependências de decisão, risco, ownership,
capabilities, requisitos de segurança, contratos, dependências entre nodes, ausência de ciclo,
restrições de recurso, política de writer, política de ambiente.

**Resolução de `F-MAR-035`:** `PlanProposal` é `VERSIONED_MUTABLE` e **advisory**. `ExecutionGraph` é
`DERIVED` da proposta **e autoritativo após compilação e validação**. Recompilar produz **nova
versão**; a anterior permanece imutável. Producer: EOS Plan Compiler. Authority: EOS.

**`PENDING_CAUSATION` — resolvido pela via mais simples (§95):** o Kernel é local e in-process com
journal durável; chegada fora de ordem é rara. **Rejeitar** evento cujo pai é desconhecido, com
retry limitado no transporte. **Sem buffer** — buffer seria uma segunda fila com política própria,
exatamente a complexidade que a §91 manda cortar.

## W. Dimensões de estado do node — resolução de `F-MAR-034`

`OBSERVED` no EOS V2 atual: `SLICE_STATES = ['PLANNED','READY','BLOCKED','IN_PROGRESS',
'ENGINEER_COMPLETE','IN_VERIFICATION','FAILED','VERIFIED']` mistura três coisas.

**Testei a decomposição de três eixos proposta e ela é insuficiente** — `ENGINEER_COMPLETE` e
`IN_VERIFICATION` são estágios distintos dentro de `ACTIVE` e se perderiam. Quatro eixos ortogonais:

```
lifecycle:      PLANNED | READY | ACTIVE | TERMINAL
stage:          NONE | EXECUTING | SELF_CHECK | VERIFYING     (só em ACTIVE)
blockingReason: NONE | EVIDENCE | DECISION | CONTRACT | AGENT | RESOURCE | SECURITY | ENVIRONMENT
outcome:        NONE | SUCCESS | FAILURE | CANCELLED | SUPERSEDED   (só em TERMINAL)
```

Mapeamento: `BLOCKED` → `lifecycle` + `blockingReason ≠ NONE`; `VERIFIED` → `TERMINAL/SUCCESS`.

## X–Z. Scheduler

`isNodeReady(node, state)` — **função determinística**, sem LLM: dependências satisfeitas, autoridade
concedida, contratos aceitos, capabilities `PROVEN` quando exigidas, ambiente compatível, snapshot
`FRESH` ou `STALE_UNRELATED`, lease disponível, desfecho anterior compatível.

**`MAR-INV-029` — node bloqueado ≠ run bloqueado.** O scheduler continua buscando outros `READY`.

**Join:** apenas `ALL` + condições explícitas. `ANY`, `QUORUM` e `CONDITIONAL` **não** entram sem
caso de uso real — §37 pediu para questionar, e não há evidência de necessidade.

## AA–AD. Writer, leases e os limites honestos

`maxPhysicalWriters = 1` para mutações. Nodes classificados `READ_ONLY_NODE` ou `MUTATING_NODE`.

**`RepositoryRuntimeLease`:** `repositoryId · runtimeId · pid · processStartIdentity · host ·
startedAt · heartbeat · generation`. **`F-MAR-024`:** PID sozinho não basta — este projeto já viu PID
reciclado em produção (`OBSERVED`: PID 6008 pertencia ao updater e depois ao Cursor). Liveness usa
`pid + processStartIdentity`, e takeover incrementa `generation`.

Segunda instância: `ATTACH` · `WATCH` · `SUBMIT_CONTROL_REQUEST` · `RUNTIME_ALREADY_ACTIVE`.
**Nunca** cria segundo writer em silêncio.

**`SliceLease`:** `leaseId · sliceId · owner · issuedAt · expiresAt · generation · snapshotRef`.

**Limites declarados, não elevados:**

| Garantia | Classe real |
|---|---|
| `SliceLease` | **`COORDINATION_ONLY`** — não contém escrita de Bash (`F-MAR-027`) |
| Fencing em filesystem | **`DETECTIVE`** — o filesystem não valida token (`F-MAR-025`) |
| `WriteManifest` | **`DETECTIVE`** |
| Integridade do journal | **`DETECTIVE`** |
| `maxPhysicalWriters=1` | **`COORDINATION_ONLY`** no escalonamento; `HARD_ENFORCED` só quando houver mecanismo de SO `PROVEN` |

Três níveis para o futuro: **prevenção por escalonamento** (hoje) → **detecção** (hoje) →
**contenção dura** (quando um mecanismo de provider/SO estiver `PROVEN`).

## AE–AF. Starvation e backpressure

`effectivePriority = basePriority + aging + dependencyUnblockWeight`. Fórmula não congelada.
**Propriedade congelada:** *um node continuamente `READY` recebe execução em tempo finito, salvo
impedimento explícito de política ou recurso.*

Backpressure considera capacidade do agente, tamanho de fila, orçamento, disponibilidade de writer,
rate limit e restrição de ambiente. Adapter indisponível **não** gera fila infinita.

---

## AG–AK. Authority System

**Resolução de `F-MAR-031`:** autoridade é **resolvida pelo EOS a partir do próprio estado** —
identidade do ator, run, política, role, registro de decisões, contexto de segurança. Um payload
declarando `{"authority":"D1"}` **não concede nada**. `MAR-INV-026`.

`D0` — determinístico do EOS: roteamento, transições, readiness, retry, ciclo de lease, gates,
dependências, mecânica do scheduler. **Codex não altera essas regras por proposta.**

`D1` — `D1_DECISION_REQUEST → PROPOSAL → VALIDATION → ACCEPTED | REJECTED`. Toda decisão do Codex
passa pelo Authority Validator do EOS.

`D2` — `USER_DECISION_REQUEST → PROPOSAL → RESULT`. Timeout → `WAITING_USER`, **nunca** resolução
automática.

**Resultados não booleanos:** `AUTHORIZED · DENIED · WAITING_DECISION · POLICY_CONFLICT ·
AUTHORITY_AMBIGUOUS · INVALID_CONTEXT`.

**`Authority ≠ Enforcement`:** operação autorizada não é operação contida. Authority decide *se
pode*; o Security Envelope determina *o que impede*; Verification *prova*.

O evaluator de precedência detecta: conflito, supersessão, decisão ausente, decisão adiada,
dependência exclusiva do usuário — reusando o Decision Readiness Gate já `OBSERVED` no EOS V2.

## AL–AS. Recovery

Recovery **observa a realidade primeiro**; nunca pergunta a um modelo o que aconteceu.

**Crash do EOS:** `novo processo → identifica repositório → inspeciona RepositoryRuntimeLease →
estabelece morte do anterior → adquire nova generation → carrega RuntimeManifest → checa
compatibilidade → abre Journal → valida integridade → carrega checkpoint → replay →
reconcilia efeitos ambíguos → restaura grafo → retoma tarefas seguras`.

**Compatibilidade (`F-MAR-033`):** `COMPATIBLE · COMPATIBLE_WITH_MIGRATION · INCOMPATIBLE ·
DOWNGRADE_REJECTED · UNKNOWN`. Downgrade **não** é compatível por omissão; `UNKNOWN` bloqueia.

**Crash de worker executivo:** antes de reexecutar, observar Git, filesystem, `WriteManifest`,
registros de efeito e estado de processo. Classificar: `NOT_STARTED · PARTIAL ·
COMPLETED_NOT_RECORDED · AMBIGUOUS · FAILED`.

**Escrita parcial (`F-MAR-017`):** rollback **não** é automático. Avaliar `continue · restore ·
supersede · manual` conforme reversibilidade do efeito.

**`MAR-INV-030` — falha de agente ≠ falha de Run.** Classificação de falha: `TRANSIENT ·
RECOVERABLE · AMBIGUOUS · FATAL · MANUAL_REQUIRED · USER_REQUIRED`. `RATE_LIMITED` é
**disponibilidade operacional**, não Finding e não falha de Run.

**Heartbeat** é `OBSERVATIONAL`: `HEALTHY · SUSPECT · UNAVAILABLE`. Nunca `DEAD` por um batimento
perdido.

**Guardas de laço:** `maxRetry · maxRecoveryAttempt · maxReconciliationAttempt · maxReplan` →
`ESCALATION_REQUIRED`. **Ciclos:** o Plan Compiler detecta `DEPENDENCY_CYCLE` na compilação; o
`WaitForGraph` é **derivado sob demanda** para diagnóstico, não persistido — evita a segunda estrutura
de estado que a §91 manda questionar.

## AT–AV. Recursos, observabilidade e controle

**Hooks de recurso** (emissão apenas, consumo no PLAN-E): espera em fila, espera de node, tempo de
execução, retries, rodadas de reconciliação, duração de agente indisponível, operações de journal,
lag de projeção, decisões do scheduler. Nenhuma telemetria sem consumidor previsto.

**Observabilidade** (`eos status/events/agents/findings/watch`) é `concern: OBSERVATION` e **não
concede autoridade**.

**Controle** (`SUBMIT_INTENT · PAUSE_RUN · RESUME_RUN · CANCEL_SLICE · APPROVE_D2 · REJECT_D2`) exige
identidade de runtime, identidade de repositório e authority check — `F-MAR-029`.

**Topologia:** processo único do Kernel com Journal, Projections, Scheduler, Authority, Recovery e
Adapter Manager in-process. Event bus **in-process** + journal durável. **Sem broker, sem consenso
distribuído, sem eleição de líder** — o primeiro Kernel é local.

---

## AW. Revisão de segurança — findings novos

| ID | Achado | Severidade | Bloqueia PLAN-B? | Owner |
|---|---|---|---|---|
| **`F-MAR-036`** | Fakes com acesso irrestrito provariam o Kernel sob condições que a produção não terá | HIGH | Não | MAR-P5 |
| **`F-MAR-037`** | **Lag de projeção cria janela de leitura obsoleta**: o scheduler poderia despachar node cuja dependência acabou de falhar. Leitura decisória deve ir ao journal ou exigir cursor alcançado | HIGH | Não | MAR-P4/P6 |
| **`F-MAR-038`** | Journal é arquivo com permissão do usuário: integridade é `DETECTIVE`, não `HARD_ENFORCED` | MEDIUM | Não | MAR-P4 |
| **`F-MAR-039`** | Requisição de controle de segunda CLI precisa de vínculo de identidade local; sem isso qualquer processo local controla o runtime | HIGH | Não | MAR-P6/P7 |
| **`F-MAR-040`** | **Ordem de fases proposta está errada** — ver §BG | MEDIUM | Não | PLAN-B |

`F-MAR-037` é o mais sutil: é a `MAR-INV-021` (projeção não-autoritativa) valendo também para
*leitura*, não só para escrita.

## AX. Revisão de simplicidade — o que foi cortado

Quatro projeções podadas · `READY` removido dos estados de efeito · `ANY`/`QUORUM`/`CONDITIONAL`
descartados do Join · `WaitForGraph` derivado em vez de persistido · buffer de `PENDING_CAUSATION`
descartado em favor de rejeição · broker externo descartado em favor de dispatch in-process.

Mantido apesar de parecer excesso: os quatro eixos de estado de node (§W) — três não cobrem o modelo
real; e os sete estados de efeito — cada um tem transição distinta.

## AY–BD. Estratégia de teste

`MAR-P4`: `JOURNAL-* PROJ-* REPLAY-* SIDEFX-* STATE-*` · `MAR-P5`: `FAKE-CX-* FAKE-CL-* FAKE-VFY-*
ADAPTER-CONFORMANCE-*` · `MAR-P6`: `SCHED-* DAG-* JOIN-* BLOCK-* STARVE-* BACKPRESSURE-*` ·
`MAR-P7`: `AUTH-* DECISION-* PRECEDENCE-* D0-* D1-* D2-*` · `MAR-P8`: `REC-* LEASE-* HB-* CRASH-*
AMBIG-* RESUME-*`.

**Negativos obrigatórios:** schema inválido · repositório errado · run errado · registro corrompido ·
crash de projeção · replay após crash · protocolo antigo · manifesto incompatível · **downgrade** ·
efeito duplicado · **ambíguo destrutivo** · reconciliação inconclusiva · ciclo · dependência ausente ·
node não autorizado · capability ausente · snapshot obsoleto · conflito de writer · starvation ·
agente morto · **autoridade forjada no payload** · Codex tentando D2 · decisão local sobrepondo
`APPROVED_FROZEN` · conteúdo de repo tentando elevar autoridade · ator de repositório errado.

**Cenários adversariais da §108 — todos representáveis:**

| # | Cenário | Representação |
|---|---|---|
| 1 | EOS morre após commit, antes do registro | `ATTEMPTED` + observação do Git → `COMPLETED_NOT_RECORDED` |
| 2 | Projeção 10 eventos atrás | `ProjectionCursor`; leitura decisória bloqueia (`F-MAR-037`) |
| 3 | Worker morre após 3 de 7 arquivos | `WriteManifest` → `PARTIAL` |
| 4 | `PLAN_PROPOSAL` com D2 embutido | Compiler valida autoridade → `REJECTED` |
| 5 | Segundo `eos` no mesmo repo | `RepositoryRuntimeLease` → `ATTACH`/`RUNTIME_ALREADY_ACTIVE` |
| 6 | PID reciclado | `pid + processStartIdentity` |
| 7 | FakeClaude devolve resposta duplicada | `eventId` idempotente |
| 8 | Transição de contrato duas vezes | `transitionId` + estado anterior |
| 9 | Node de baixa prioridade `READY` há muito | aging |
| 10 | Worker `RATE_LIMITED` | disponibilidade operacional, não falha |
| 11 | Resume com downgrade | `DOWNGRADE_REJECTED` |
| 12 | Evento de outro `repositoryId` | rejeitado na validação |
| 13 | Capability `DISCOVERED`, não `PROVEN` | `isNodeReady` exige `PROVEN` |
| 14 | Lease expirado, processo antigo escrevendo | detectado por `WriteManifest`; **não contido** — limite declarado |

O caso 14 é o mais importante: a resposta honesta é *detecção*, não prevenção.

## BE–BF. Findings e mudanças ao PLAN-A

Cinco findings novos (`F-MAR-036`…`040`), nenhum bloqueando o PLAN-B.
**`PLAN_A_CHANGE_REQUEST` — nenhum.** O PLAN-B coube inteiramente na Foundation; os quatro eixos de
estado (§W) refinam `F-MAR-034` sem alterar tipo do PLAN-A.

## BG. DAG de implementação — `F-MAR-040`

A sequência sugerida `P4 → P5 → P6 → P7 → P8` **está errada em dois pontos**, e a §96 pediu para
questionar:

1. O caminho de escrita do journal (§12) valida envelope de autoridade → **P4 depende da
   *representação* de autoridade**, que estava em P7.
2. `isNodeReady` consulta autoridade → **P6 depende do *evaluator* de autoridade**, ou seja, P7 vem
   **antes** de P6, não depois.

DAG corrigido, com paralelismo real:

```
P7a Authority Representation
      ↓
P4 Event Core ────────────┬──────────────→ P5 Fake Runtimes
      ↓                   ↓                      ↓
P7b Authority Evaluator   └──────────────────────┤
      ↓                                          ↓
P6 Multivector Scheduler ←───────────────────────┘
      ↓
P8 Recovery
```

Joins: P6 exige P4 + P7b + P5. P8 exige P4 + P6.
Paralelizável: P5 corre em paralelo a P7b assim que P4 fecha.

## BH. Gates de planejamento

`EVENT_CORE_MODEL_READY` · `FAKE_RUNTIME_MODEL_READY` · `SCHEDULER_MODEL_READY` ·
`AUTHORITY_MODEL_EXECUTABLE_IN_DESIGN` · `RECOVERY_MODEL_READY` — todos satisfeitos em planejamento.

## BI. `PLAN_B_EXPORT_CONTRACT`

**Kernel Runtime Interface:** `start · stop · resume · status · submitControl`.
**Adapter Runtime Interface** · **Event/Journal Contract** · **Scheduler Contract** ·
**Authority Contract** · **Recovery Contract** · **Side Effect Contract** · **Lease Contract** ·
**Fake Runtime Contract** · **Resource Hook Contract** · **Security Hooks**. Todos `PLANNED`.

**Para o PLAN-C:** como o adapter cognitivo se registra; como `PLAN_PROPOSAL` entra pelo Compiler;
representação de capability; efeito de rate limit no scheduling; entrada de decisões do Codex na
validação de autoridade.

**Para o PLAN-D:** registro do adapter executivo; despacho de `ExecutionCapsule`; obtenção de acesso
de writer; criação do `WriteManifest`; retorno de `EvidenceConflict`; representação de execução
parcial.

**Para o PLAN-E:** ciclo de vida da verificação; caminho de resultado independente; regras de replay;
eventos de recurso; hooks de chaos; fronteira de meta-verificação.

## BJ. Dependências futuras

`SnapshotId` congelado **antes do MAR-P6** (owner: execução do MAR-P3) · `F-MAR-028` aprofundado no
PLAN-E · contenção dura depende de mecanismo `PROVEN` (PLAN-C/D).

## BK. Gate

Os 24 critérios da §114 estão satisfeitos em desenho. Os três bloqueadores de MAR-P4 têm resolução
inequívoca: `F-MAR-011` em §K, `F-MAR-012` em §M–O, `F-MAR-026` em §P.

**`PLAN_B_READY`** · `MAR-P4` a `MAR-P8` `PLANNED`.

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-C — Codex Cognitive Plane (MAR-P9 + MAR-P10)
```
