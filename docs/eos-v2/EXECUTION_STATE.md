# EOS Multi-Agent Runtime — Execution State

> **Fonte de verdade para continuidade.** Reconstruível sem memória narrativa (§35): tudo aqui é ID
> concreto, ref de artefato ou comando reexecutável. Se o contexto conversacional divergir deste
> arquivo, do Git, do PLAN-G ou dos planos A–F, **as fontes autoritativas vencem** (§45).

```yaml
runId: EOS-RUN-20260808T030320Z
masterPlanVersion: 1.2.0
amendments: [BOOTSTRAP_EXECUTION_AMENDMENT_001, BOOTSTRAP_EXECUTION_AMENDMENT_002]
authoritativePlan: docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md
planningFreeze: VIGENTE
```

---

## 0. Prioridade global — `ADMAI DELIVERY MODE`

Decisão do usuário. **Substitui `EOS_SLICES_COMPLETED` como sinal principal de progresso.**

```yaml
PRIMARY_GOAL: ADMAI_RELEASE
EOS_ROLE: DELIVERY_INFRASTRUCTURE
principalMetric: ADMAI_RELEASE_READINESS
nextMilestone: ADMAI_RELEASE_READY          # nao EOS_MASTER_DAG_COMPLETE
```

O EOS existe para **entregar o AdmAi**, não o contrário. Ele precisa ser seguro, confiável, barato e
provável o bastante para isso — não perfeito. Uma mudança no EOS só entra no caminho crítico se:

```text
EOS_ALLOWED_CHANGE =
    BLOCKS_ADMAI
 OR BREAKS_VERIFICATION
 OR SECURITY_DEFECT
 OR COST_CONTROL
 OR RELIABILITY_DEFECT
```

Caso contrário: `EOS_VNEXT_DEFERRED`.

### `CORRECTION_LOOP_INSTABILITY` — a regra que congelou o `SL-A-02`

Achados por rodada de revisão independente do `SL-A-02`, e quantos foram defeito nas correções da
própria rodada anterior:

| Rodada | Achados | Defeito de correção |
|---|---|---|
| `R24` | 7 | 2 |
| `R25` | 8 | 4 |
| `R26` | 8 | 2 |
| `R27` | 6 | 3 |
| `R28` | 9 | **7** |

Sem queda, e a origem migrou para dentro do processo de correção. Regra operacional derivada:

```text
IF correctionDefectRate >= 50% FOR 2 consecutive independent review rounds
THEN FREEZE_TARGET -> CLASSIFY_SHARED_CAUSES -> OPEN_STABILITY_SLICE -> STOP_LOCAL_PATCH_LOOP
```

Classe: `DETECTIVE`. É medição sobre rodadas registradas, não imposição automática — nenhum
mecanismo interrompe o loop sozinho, e afirmar `HARD_ENFORCED` aqui seria `MAR-INV-025`.

### `SL-A-02` — estado final, sem equivalência automática com `VERIFIED`

```yaml
implementationState: FROZEN
functionalEvidence: PASS
assurance: LIMITED
riskAcceptance: PRESENT
harnessDependency: SL-H-01
```

`VERIFIED_WITH_DECLARED_LIMITATIONS` **não** é `VERIFIED`. As limitações estão em §6d.

### Backlogs separados

```yaml
ADMAI_RELEASE_BACKLOG:   ATIVO      # produto e release
EOS_BLOCKER_BACKLOG:     ATIVO      # so o que o AdmAi precisa do EOS
  - REVIEW_CACHE          # adiado: numa revisao unica teria hit rate zero
EOS_VNEXT_BACKLOG:       FROZEN     # FROZEN_UNTIL_ADMAI_RELEASE_READY
  - Software Architect
  - Requirement Compiler novo
  - Architecture Knowledge Graph avancado
  - Architecture Challenger novo
  - Goal Verification vNext
  - Architecture Drift avancado
  - Assumption Registry avancado
  - Complexity Budget avancado
  - PROVIDER_MEMORY (maximo: ADVISORY_ACCELERATION_CACHE, nunca source of truth)
```

Enquanto `ADMAI_RELEASE_READY != true`, `EOS_VNEXT_BACKLOG` permanece congelado.

### Política do Codex

`DETERMINISTIC FIRST · CODEX FOR SEMANTIC UNCERTAINTY`. O Codex não é test runner, linter, schema
validator, grep, contador nem revisor manual de irmãos. Modos: `LIGHT` · `DELTA` (padrão após a
primeira revisão) · `DEEP` (nova classe de defeito, arquitetura, security boundary, mudança material)
· `FINAL`. Achado repetido em irmão vira **varredura determinística da classe** — o Codex revisa a
classe, não cada instância.

---

## 1. Estratégia de execução vigente — Amendment 002

```yaml
change: BOOTSTRAP_EXECUTION_AMENDMENT_002
reason: [NEW_EVIDENCE, CAPABILITY_GAP]
architectureChanged: false
finalRuntimeRolesChanged: false
masterDagChanged: false
implementationStrategyChanged: true

CLAUDE: BOOTSTRAP IMPLEMENTATION WRITER (único)
CODEX:  CONCURRENT COGNITIVE / CHALLENGE / REVIEW WORKER (sem autoridade de escrita)
```

Converge com a arquitetura final congelada: `EOS=GOVERN · Codex=THINK · Claude=BUILD ·
Verification=PROVE · User=D2`.

**Encerrado e não reabrir:** a hipótese "Claude escreve ∥ Codex escreve" foi refutada por evidência
(`F-MAR-064`). Não repetir probes de escrita, não usar `--dangerously-bypass-*`, não enfraquecer
launcher ou envelope.

## 2. Estado autoritativo — `OBSERVED`

```yaml
repository: C:/Users/n1iag/dev/admai-worktrees/agent-environment   # worktree VINCULADA
gitCommonDir: C:/Program Files/dev/AdmAi/.git                      # 5 worktrees compartilham objetos
branch: fix/seguranca-criticos
HEAD: 30bf5453d847c17d88197b11c93da965406be53c
expectedHead: idêntico
rollbackPoint: 30bf5453  # nenhum commit criado; todo trabalho é untracked/dirty sobre este HEAD
planningFreezeFingerprint: PLAN-G = c4f70886f7c4 (idêntico nas 3 lanes)
```

**Lanes:**

| Lane | Caminho | Papel | Isolamento |
|---|---|---|---|
| Integração | `agent-environment` | autoritativa, writer serial = 1 | worktree vinculada |
| Claude | `EOS_BUILD_CLAUDE` | implementação | clone próprio, sem alternates |
| Codex | `EOS_BUILD_CODEX` | **`READ_ONLY_ANALYSIS_SNAPSHOT`** | clone próprio, sem alternates |
| Fixture B | `EOS_FIXTURE_REPO_B` | portabilidade (`SL-AC-02`, onda 12) | repo independente, `fixture/portability-b` |

## 3. Progresso — Onda 0 `BASELINE_CAPTURED` **completa**

| Slice | Lane | Estado | Prova |
|---|---|---|---|
| `SL-BOOT-01` | integração | **integrado** | `bootstrap/SL-BOOT-01-BASELINE.md`; 7/7 suites |
| `SL-BOOT-02` | Claude | **integrado** (correção 1 e 2) | `verify-layout.mjs` **45 PASS / 0 FAIL**; `LAY-NEG-01` e `LAY-08` provados por sabotagem |
| `SL-BOOT-03` | Codex→Claude (§62) | **integrado** | `bootstrap/LEGACY_SECURITY_EVIDENCE_SNAPSHOT.md` + `REPOSITORY_SECURITY_PROFILE_ADMAI.md`; teste negativo de segredos com canary |
| `SL-BOOT-04` | Claude | **integrado** | `selftest/fixtures/second-repo/verify.mjs` **6 PASS / 5-5 sabotagens detectadas** |

```yaml
proofRegime: BOOTSTRAP_PROOF          # até PROOF_PLANE_OPERATIONAL (F-MAR-063, MASTER-INV-002)
lastVerifiedGate: BASELINE_CAPTURED
completedSlices: [SL-BOOT-01, SL-BOOT-02, SL-BOOT-03, SL-BOOT-04, SL-A-01]
readyFrontier: [SL-A-09]              # PARALLEL_SAFE; SL-A-07 tem gate proprio (SNAPSHOT_ID_FROZEN)
blockedFrontier: [SL-A-02, SL-A-06]   # ambos implementados e aguardando revisao independente
nextWave: 1 (FOUNDATIONS) -> gate FOUNDATIONS_IMPLEMENTED
unintegratedWork: SL-A-02, SL-A-06 (lane Claude, nao integrados)
```

**Onda 1 em andamento:**

| Slice | Estado | Prova | Write Set |
|---|---|---|---|
| `SL-A-01` | **VERIFIED**, integrado | 13 rodadas de revisão | anterior ao gate de Write Set |
| `SL-A-02` | `BLOCKED_ON_REQUIRED_INDEPENDENT_REVIEW` | 104 PASS · 62-62 sabotagens · INV-PUREZA-01 4/4 · INV-AMBIG-01 6/6 | idem |
| `SL-A-06` | implementado, aguarda revisão | **51 PASS / 0 FAIL**; contrato derivado do PLAN-A §O–T | ~~`MATCH`~~ → `UNKNOWN_DIFFERENCE` (R24-07) |

`SL-A-06` entrega envelope de 21 campos, classificação `kind × concern` com os 30 pares provados
ortogonais, 11 categorias de erro, escada de 5 ACK onde transporte não afirma execução, e
`PENDING_CAUSATION` que **rejeita sem reter** — com o teste de chegada fora de ordem que o PLAN-G
§AA exige nominalmente, e um controle proibindo qualquer campo de retenção aparecer no resultado.

**Comandos de verificação reexecutáveis** (integration lane):
`node tools/eos/verify-layout.mjs` · `node tools/eos/selftest/fixtures/second-repo/verify.mjs` ·
`node tools/eos/{risk/verify,selftest/run,proof/verify,baseline/verify,engineering/verify,knowledge/verify-decisions,accounting/verify}.mjs`

## 4. Gates de bootstrap

| Gate | Estado |
|---|---|
| `BOOTSTRAP_PARALLEL_EXECUTION_PROVEN` | **`REFUTED_BY_CAPABILITY`** · `NOT_REQUIRED_FOR_FINAL_ARCHITECTURE` · **`NON_BLOCKING`** — testava uma estratégia que a realidade refutou; não trava o DAG |
| `BOOTSTRAP_CONCURRENT_COLLABORATION_PROVEN` | **PASS** — ver §5 |

### 5. `BOOTSTRAP_CONCURRENT_COLLABORATION_PROVEN` — evidência da Onda 0, sem refazer o experimento

| # | Critério | Evidência |
|---|---|---|
| 1 | Trabalho útil em intervalos sobrepostos | Codex `00:02:27→00:06:38`; Claude `00:03:42→~00:05:30`. `CONCURRENT_PARTICIPATION: true` |
| 2 | Claude único implementation writer | os quatro slices integrados foram escritos por Claude |
| 3 | Codex produz análise/review independente | review de `SL-BOOT-02` sob `MODO_CODEX: REVISOR`; challenge de `SL-A-01` sob `MODO_CODEX: DECISOR` |
| 4 | Codex sem autoridade de escrita | `F-MAR-064`; clone Codex é `READ_ONLY_ANALYSIS_SNAPSHOT` |
| 5 | **Finding procedente do Codex alterou a implementação** | `LAY-NEG-01` era **vacuamente verdadeiro**; correção levou 29 → 44 → 45 checagens |
| 6 | Integração serial | `maxAuthoritativeIntegrationWriters = 1` em todas as integrações |
| 7 | Prova independente obrigatória | `BOOTSTRAP_PROOF` reexecutado na lane autoritativa após cada integração |
| 8 | Nenhuma fronteira de autoridade enfraquecida | `--dangerously-bypass-*` nunca usado; envelope e launcher intocados |

## 6. Findings desta execução

| ID | Achado | Disposição | Owner | Impacto em gate |
|---|---|---|---|---|
| `F-MAR-064` | `CODEX_BOOTSTRAP_WRITE_CAPABILITY_REFUTED` — Windows restricted-token sandbox + `approval OnRequest` bloqueiam escrita mesmo com `--sandbox workspace-write`, `approval_policy="never"` e `trust_level="trusted"` | `RUNTIME_CAPABILITY_REFUTED` · `NON_BLOCKING_FOR_EOS_ARCHITECTURE` · `SUPERSEDES_BOOTSTRAP_TWO_WRITER_ASSUMPTION` | `security` | refuta gate de bootstrap; **não** bloqueia arquitetura final; evidência antecipada para `SL-CX-01` |
| `F-MAR-065` | `BOOTSTRAP_CAPSULE_CAPABILITY_CONTRADICTION` — cápsula exigia escrita do Codex num ambiente que a bloqueia; e exigia `baseCommit` de 40 hex enquanto proibia 40 hex nos entregáveis | **resolvido** pelo Amendment 002; isenção do SHA público incorporada ao contrato de cápsula | `eosMaintainer` | nenhum |
| **`F-MAR-066`** | **Contrato de layout não detectava diretório de topo não declarado** — `LAY-01` só confirmava presença dos dez, `LAY-03` só restringia os quatro aditivos. Mesma classe do controle negativo vacuoso | **resolvido** — `LAY-08`, provado por sabotagem | `eosMaintainer` | nenhum |
| **`F-MAR-068`** | **`WRITE_SET_DECLARATION_OCCURS_AFTER_MUTATION`** — quatro fatias consecutivas escreveram antes de declarar o Write Set; `WS-02` detectou as quatro e não impediu nenhuma, porque mede o QUE foi tocado e nunca o QUANDO foi declarado. Deixa de ser indisciplina do executor e passa a ser defeito de controle de execução | **mecanismo implementado, evidência da própria fatia `UNKNOWN_DIFFERENCE`** (`R24-07`, reconciliado como risco aceito) — `write-set-gate.mjs` + `docs/eos-v2/WRITE_SET.json` com sha por caminho no instante da declaração; promoção `DECLARED→VALIDATED` é mecânica, não escrita à mão. **Não é `PLAN_DEFECT`**: `SL-K-05` e `SL-K-07` já preveem o mecanismo, mas dependem de `SL-K-02`/`SL-A-03` e são inalcançáveis hoje — sem incremento de `masterPlanVersion` | `eosMaintainer` | bloqueia integração de Slice com `UNDECLARED_WRITE` |

## 6b. `REVIEW_QUEUE` — a revisão independente é o recurso limitante

`IMPLEMENTATION CAPACITY ≠ REVIEW CAPACITY`. O DAG oferecer outra fatia `READY` não autoriza
produzir mais mutação quando quem falta é o revisor.

| # | Slice | Revisor | Revisão | Estado | Prova pendente de revisão |
|---|---|---|---|---|---|
| 1 | `SL-A-02` | — | **ENCERRADA em R28** | `VERIFIED_WITH_DECLARED_LIMITATIONS` | escopo congelado por decisão do usuário; 7 achados do R28 movidos para `SL-H-01` |
| 2 | `SL-A-06` | Codex (`MODO_CODEX: REVISOR`) | primeira | aguardando | 51 PASS / 0 FAIL · Write Set `UNKNOWN_DIFFERENCE`, reconciliado como **risco aceito** (ver 6c) |

```yaml
SL-A-09:
  estado: READY_BUT_REVIEW_BACKPRESSURED
  classe: PARALLEL_SAFE          # escreve sozinho em protocol/schemas/
  dispatch: NOT_DISPATCHED
  motivo: REVIEW_BACKPRESSURE    # implementar criaria a TERCEIRA fatia na mesma fila
  ehFinding: false               # backpressure e Scheduler correto, nao defeito
  ehStopCondition: false         # o Run continua
```

**Tentativa de dispatch registrada:** R21 foi disparado neste checkpoint e recusado —
`CODEX-QUOTA-EXHAUSTED`, reset anunciado para **10:03 de hoje**. Os fingerprints do `SL-A-02` foram
recomputados imediatamente antes da tentativa (lição da R16-01) e a cápsula está montada; quando a
cota voltar, o dispatch é imediato e não precisa de preparação.

**Ordem quando o Codex voltar** — nenhuma fatia nova antes disso:
`R21/SL-A-02` → achados e correções → verificação independente → fechar/reconciliar →
revisar `SL-A-06` → achados e correções → verificação independente → fechar/reconciliar →
**recomputar a fronteira e a capacidade de revisão** → só então decidir o próximo dispatch.

`SL-A-09` não é escolha antecipada: a fronteira é recomputada depois dos dois fechamentos, e o
melhor candidato pode mudar.

### R21 — quatro achados, todos procedentes

| # | Categoria | Achado | Correção |
|---|---|---|---|
| 1 | `GENERATOR_DEFECT` | classe-alvo do `MAR-INV-042` fixa no código enquanto o **D3 a registra** em `EXECUTION_STATE.md`. Meu comentário afirmava "não derivável" — a fonte existia | derivada do D3 (`derivarClasseAlvoDoD3`); registro de decisão passa a ser fonte do gerador e alcançável na lane |
| 2 | `PARSER_DEFECT` | ambiguidade resolvida pela primeira ocorrência **no nível de SEÇÃO**. Duas `## H.` conflitantes, ou duas regras literais, e o parser escolhia | `recortarSecaoUnica` — a regra passa a viver no RECORTE, camada dona de todos os derivadores |
| 3 | `EVALUATOR_DEFECT` | `violacoesDeContrato` lia as constantes do módulo, não o contrato do modelo. Campo novo coerente em documento + oráculo + `modelo.campos` dava zero falhas | contrato entra por parâmetro; constantes viram apenas padrão |
| 4 | `CLAIM_CALIBRATION_DEFECT` | toda divergência atribuída ao PLAN-G, sendo que dois dos três blocos vêm de outras fontes | mensagem nomeia a fonte por bloco |

Dois deles são a **mesma classe que eu já havia corrigido uma camada abaixo** — `AMBIGUITY_REJECTS`
nas listas mas não nas seções; `EVALUATOR_PURITY` em `invariantePorId` mas não em
`violacoesDeContrato`. Corrigi a instância e deixei a irmã, duas vezes.

**Defeito de controle exposto pela correção:** o caso de CRLF comparava o **artefato vivo** com a
derivação corrente, então qualquer mudança legítima de conteúdo o quebrava — e, como o gerador se
recusa a gravar com controle falhando, travava a própria regravação. Agora o texto é sintético: um
controle sobre a propriedade não pode depender de o artefato estar atualizado.

`104 PASS · 62-62 sabotagens · gerador 20/20 · 3/3 blocos` · Write Set da rodada: `UNKNOWN_DIFFERENCE` (R24-07).

### R22 — três achados, e o padrão que eles expuseram

| # | Categoria | Achado | Correção |
|---|---|---|---|
| 1 | `GENERATOR_DEFECT` | `derivarClasseAlvoDoD3` deixava a **última** declaração vencer; duas declarações conflitantes davam bloco idêntico ao caso íntegro | agrupa por ID; ID com mais de um alvo distinto devolve `null` |
| 2 | `EVALUATOR_DEFECT` | `relacoes` ainda vinha do global, e `INV-03e` lia `ENFORCEMENT_STATES` do módulo | ambos passam a vir do modelo |
| 3 | `CLAIM_CALIBRATION_DEFECT` | corrigi o ramo de divergência e deixei o de **sucesso** dizendo "7 planos + auditoria" | contagem nomeia o D3; texto distingue documento congelado de registro de decisão corrente |

**O padrão, dito sem atenuação:** três rodadas seguidas devolveram a mesma classe em irmãs
diferentes — `invariantePorId`, depois `violacoesDeContrato`, depois `relacoes` e `INV-03e`. Nas três
corrigi a instância apontada. No turno anterior escrevi que passaria a tratar achado como classe a
varrer, e em seguida escrevi um parser **novo** com exatamente o buraco de ambiguidade que eu
acabara de mover para a camada compartilhada.

Intenção declarada não alterou o comportamento. Então a checagem deixou de depender de memória:

- **`INV-PUREZA-01`** — laço sobre as dimensões do contrato. As chaves saem de `CONTRATO_PADRAO`,
  não de um literal — o R24-01 mostrou que a versão anterior dizia derivar e não derivava. Dimensão
  presente no contrato entra na varredura mesmo **ausente do modelo**: some da interseção, aparece
  como inerte. Sabotagem de allowlist precisa ESTREITAR, e a falha exigida é a do check dono da
  propriedade (`INV-02c`), não qualquer falha.
- **`INV-AMBIG-01`** — laço sobre os derivadores, reconhecidos em `export function` **e**
  `export const` (R24-04: a forma sintática decidia a cobertura). Isenção para nome inexistente
  reprova, senão a dispensa fica escrita antes de o controle existir.

Os dois entram no critério de saída: dimensão inerte ou derivador permissivo reprovam. Ambos foram
exercitados **nos dois sentidos** — cópia sabotada reprova, fonte real passa.

## 6c. Evidência de Write Set — `F-MAR-068` em operação

| Fatia | Estado | `DECLARED × OBSERVED` | Não declarados | Retroativos |
|---|---|---|---|---|
| `F-MAR-068` | `VALIDATED` | ~~`MATCH`~~ → `UNKNOWN_DIFFERENCE` | indeterminável | 0 |
| `SL-A-06` | `VALIDATED` | ~~`MATCH`~~ → `UNKNOWN_DIFFERENCE` | indeterminável | 0 |
| `SL-A-02/R23` | `CLOSED` | ~~`MATCH`~~ → **`UNDECLARED_WRITE`** | 1 (`gerar-oracle.mjs`) | 0 |
| `SL-A-02/R24` | `CLOSED` | **`UNDECLARED_WRITE`** | 1 (`registry.mjs`) | 0 |
| `SL-A-02/R24-DOC` | `VALIDATED` | pendente | — | 0 |

### `R24-07` — o gate não podia falhar

`GATE_INVOCATION_DEFECT`. A comparação estava correta e os controles unitários dela passavam. O
defeito vivia **entre a observação e a comparação**: eu invocava

```js
compararDeclaradoObservado({ declarado, observado: declarado.filter((c) => sujos.has(c)) })
```

`observado` derivado de `declarado`. Por construção, `naoDeclarados` era sempre vazio e `MATCH` não
era um resultado — era o único resultado possível. Todo `MATCH` acima foi produzido por uma
comparação **estruturalmente incapaz** de detectar escrita não declarada, e por isso vira
`UNKNOWN_DIFFERENCE`: não é que houve violação, é que a evidência nunca teve poder de decidir.

Duas exceções onde a violação é observável e nomeada: o `R23` (o `gerar-oracle.mjs` foi alterado ao
mover o derivador para `verify.mjs` e não constava da declaração) e o próprio `R24` — a rodada que
consertou o gate foi a primeira a ser pega por ele, ao alterar `registry.mjs` sem declarar.

**Nenhum dos dois foi absorvido retroativamente.** O §20 chama isso de
`RETROACTIVE_SCOPE_NORMALIZATION`: as declarações permanecem como foram feitas, e o registro
documenta que foram violadas.

Correção: `observarEscritaDaLane()` deriva a observação de um `baselineDaLane` — sha de **toda** a
lane, congelado no momento da declaração. Um caminho entra por três vias que não consultam
`declarado`: apareceu sujo e não existia no baseline, mudou de sha, ou sumiu dos sujos. Declaração
sem baseline devolve **indisponibilidade**, não lista vazia — vazio afirmaria "nada foi escrito",
que é justamente o que não se pode afirmar sem baseline. Sete controles novos, num repositório git
real, incluindo o que a invocação antiga não podia passar: *com declaração vazia, a observação
precisa ser idêntica*.

### `R24-LANES` — o gate observava uma lane; o trabalho escreve em duas

Descoberto **ao aplicar** a correção do `R24-07`, não por revisão: a rodada seguinte fechou `MATCH`
sobre a lane do EOS enquanto eu escrevia `write-set-gate.mjs` na lane do harness. `MATCH` ali
significava *confere dentro do que foi olhado*, e foi publicado como se significasse *não houve
escrita não declarada*. Mesma falha do `MAR-INV-025`, agora na ferramenta feita para impedi-la.

Por isso a classe nunca mais sai sozinha:

```
classe : OBSERVED_SUBSET
escopo : TODAS_AS_LANES_DECLARADAS (EOS, HARNESS)
```

**Causa raiz do `R24-07`, e ela não é a lógica.** `compararDeclaradoObservado` sempre esteve certa e
seus controles unitários sempre passaram. O que não existia era a comparação **como modo da
ferramenta**: `--comparar` era aceito pelo parser e caía no caminho de validação, então a comparação
real vivia num `node -e` reescrito à mão a cada rodada. Foi ali que `observado: declarado.filter(…)`
entrou, e ali que sobreviveu a três revisões — invocação ad hoc não tem controle negativo. O
conserto que importa não é a linha; é a comparação ter deixado de ser improviso.

**Isenção constitutiva, nomeada.** `WRITE_SET.json` é escrito pelo *ato* de declarar: nenhuma
declaração pode contê-lo, porque ele só existe depois dela. O mesmo vale para
`WRITE_SET_HISTORY.json` no arquivamento. Os dois estão em `ARTEFATOS_DO_GATE`, e um controle
negativo prova que a isenção é estreita — um arquivo de nome parecido na outra lane continua sendo
pego.

38 controles. Os dois que sustentam o resto são contraprovas: *a mesma escrita, observada por uma
lane só, volta a devolver `MATCH`* — sem ele o controle não distingue corrigido de não corrigido — e
*com declaração vazia a observação precisa ser idêntica*, que a invocação antiga não podia passar.

`ORIGINAL_PRE_MUTATION` ≠ `RECONSTRUIDO_DA_EXECUCAO` ≠ `UNKNOWN_DIFFERENCE`. A terceira é nova e é a
mais fraca: registro cuja evidência foi **invalidada por defeito do instrumento**.

**Classe de enforcement, observada e não promovida:**

| Camada | Classe |
|---|---|
| Fluxo pré-mutação | `COORDINATION_ONLY` — `bloqueiosAbertos()` informa; **nada obriga a consultá-lo** antes de integrar (`R26-02`, `F-MAR-071` aberto) |
| Detecção de violação de ordem | `DETECTIVE` — assinatura sha, depois do fato |
| Contenção de filesystem | **`NOT_CLAIMED`** — hooks desligados por política; nada impede escrita direta |

`NO VALIDATED WRITE SET → NO MUTATION_READY`. `reescritaDeclarada` é escape **explícito** com motivo
registrado, nunca bypass silencioso.

**Incidente registrado nesta operação:** ao declarar o checkpoint eu sobrescrevi o artefato do
`SL-A-06` — a perda que eu havia acabado de identificar. Os `sha` pré-escrita não são
reconstruíveis; o desfecho observado foi para `WRITE_SET_HISTORY.json` com provenance
`RECONSTRUIDO_DA_EXECUCAO`, e o arquivamento passou a ser **mecânico** (`arquivar()`), pela mesma
razão que a promoção é: depender de lembrar já falhou. Mesma classe do `evidence-bundle` sem
`--execucoes` — ferramenta que produz evidência não pode destruí-la por omissão.

### `R25` — oito achados, quatro deles frases falsas minhas sobre as correcoes do `R24`

O padrao mudou de forma que vale registrar: os achados nao foram erros de logica. `R25-02` e
`R25-04` sao **afirmacoes** que eu publiquei junto do conserto e que o conserto nao sustentava.

| Achado | O que eu escrevi | O que estava provado |
|---|---|---|
| `R25-02` | "sha de **toda** a lane" | sha do que ja estava **sujo** |
| `R25-04` | "`--verificar` **nao escreve**" | nao reescreve `EVIDENCE_BUNDLE.json`; escrevia dois temporarios na lane |
| `R25-03` | isencao "estreita" | estreita por nome, **larga por autoria** — adulteracao manual sumia junto |
| `R25-06` | "derivadores enumerados da **FONTE**" | dois modulos, e sem `export async function` |

Corrigido em cada caso a frase E o mecanismo:

- **`R25-01`** `arquivar()` executa e persiste `compararRodada`. A comparacao era um modo que eu
  podia esquecer de rodar — a causa sistematica do `R24-07` sobrevivendo um degrau adiante, no
  fechamento. `provenance` deixou de ser cravado em `ARTEFATO_ORIGINAL` e passou a ser derivado.
- **`R25-02`** baseline sobre rastreados **e** nao rastreados (584 e 628 arquivos). Custa 0,1 s: a
  versao estreita nao economizava nada, so tornava a frase falsa. `HEAD` movido desde a declaracao
  agora devolve `UNKNOWN_DIFFERENCE` em vez de classe forte sobre base inexistente.
- **`R25-03`** o livro-razao sai do confronto e **continua visivel** em `livroRazao`. O controle
  antigo (`length === 2 && endsWith('.json')`) era verdadeiro para qualquer par de `.json`; agora
  compara identidade exata.
- **`R25-05`** `gerarAncora` reprova `duplicados`/`naoParseaveis` em vez de descarta-los. O parser
  rejeitava, o gerador nao, e `--conferir` podia ficar verde sobre a ambiguidade que o verificador
  reprova.

**LIMITE QUE PERMANECE, declarado e nao contornado:** a observacao compara **diferenca liquida**
contra o baseline, nao historico de escritas. Arquivo escrito e depois restaurado ao conteudo do
baseline e invisivel. Detectar isso exigiria interceptar a escrita — hooks, proibidos por contrato
neste fluxo. A linha de saida do `--comparar` diz isso toda vez.

**`R25-08` — reconciliacao e materia do usuario. RESOLVIDO.** O revisor foi explicito: revisar o
conteudo de `registry.mjs` fornece evidencia tecnica mas **nao** desfaz nem autoriza retroativamente
a escrita. O usuario decidiu: *reconciliar com registro explicito*. As quatro violacoes receberam
disposicao `CONTEUDO_ACEITO_ORDEM_VIOLADA`, nomeada e justificada; `comparacao` segue
`UNDECLARED_WRITE` **para sempre** em cada uma. `bloqueiosAbertos()` devolve vazio.

**Validacoes que o R25 NAO conseguiu executar**, e que por isso nao contam como confirmadas: o
`--selftest` do `write-set-gate` e o `EV-PRESERVA-01`, ambos bloqueados por `EPERM` no perfil
somente leitura do revisor. Os numeros que reporto para eles sao meus, nao confirmados de forma
independente.

### `F-MAR-070` — duas copias do documento de estado do Run  ·  ABERTO

`docs/eos-v2/EXECUTION_STATE.md` existe nas **duas** lanes e divergiu: a copia do harness ainda
publicava `R23` e `AMBIG 4/4` enquanto a do EOS ja estava em `R24`. Sincronizei o conteudo, mas
duplicacao sincronizada a mao volta a divergir — e escolher qual lane e autoritativa afeta as duas
e o fluxo de integracao. Decisao material, **nao tomada de passagem**; fica registrada como aberta.

### `R26` — oito achados, e o mais grave estava no cabecalho ha seis rodadas

O R26 executou **tudo**, inclusive os dois controles que o R25 nao alcancou por `EPERM`, e
confirmou `R25-04` e `R25-05` de forma independente.

- **`R26-01` `VALIDATION_BYPASS`** — `validarDeclaracao` recebia `sujos` e **nao lia**, e testava
  `shaAtual` so por presenca. Ou seja: `sujoNaDeclaracao` e `shaNaDeclaracao` eram AUTO-DECLARADOS.
  Bastava a declaracao afirmar `sujoNaDeclaracao: false` sobre arquivo sujo, com sha forjado, para
  virar `VALIDATED`. **A correcao do R26 foi PARCIAL e eu a descrevi como completa:** ela so
  disparava quando os campos ESTAVAM presentes, entao omiti-los desligava tudo (`R27-01`). A ancora pre-mutacao — a razao de o modulo existir — dependia da honestidade de
  quem declara. Mesma raiz do `R24-07` noutro campo: confiar no dado declarado em vez de observar.
  A correspondencia de sha vale na **promocao**; depois da mutacao ela diverge por definicao.
- **`R26-02` classe sem ponto de imposicao** — o cabecalho publicava
  `POLICY_ENFORCED — UNDECLARED_WRITE bloqueia integracao`. O revisor procurou o ponto de imposicao:
  `bloqueiosAbertos()` **nao tinha um unico chamador**, e nenhum launcher, CI ou passo de integracao
  invoca o gate obrigatoriamente. A classe real e `COORDINATION_ONLY` — informa, e nada obriga a
  consultar. `MAR-INV-025` violado pela ferramenta feita para impedir essa violacao, no proprio
  cabecalho, por seis rodadas.
- **`R26-03` arquivamento fail-open e destrutivo** — arquivava `INVALIDATED` como registro bom com
  `bloqueiaIntegracao: false`, e o `catch` de historico ilegivel dizia "nao apaga, acrescenta"
  enquanto o `writeFileSync` adiante **substituia** o arquivo. Perda integral confirmada por probe.
- **`R26-04` provenance nao era derivada** — `decl.provenance ??` deixava a DECLARACAO escolher a
  propria forca de evidencia, e `observado !== null` tratava `HEAD` movido como comparacao
  conclusiva. Eu havia publicado "provenance derivada" na rodada anterior.
- **`R26-05` reconciliacao bypassavel** — vinte espacos em branco satisfaziam a justificativa, e
  `{}` contava como disposicao. `bloqueiosAbertos()` devolvia `[]` com historico ausente: silencio
  lido como "nada bloqueia".
- **`R26-06` controle que nao mordia** — o suporte a `export async function` era sintatico e inerte,
  porque nenhum derivador async existe nos modulos varridos. Agora ha fonte SINTETICA exercendo cada
  forma; reinjetar a regressao produz `5/6` nomeando a forma que sumiu.
- **`R26-08`** — `--selftest` nao era reconhecido e caia em `validar`, junto com qualquer flag. E o
  **irmao** da classe que eu havia corrigido no `evidence-bundle` uma rodada antes.

### `F-MAR-071` — `POLICY_ENFORCED` sem ponto de imposicao  ·  ABERTO

Elevar o bloqueio de integracao de `COORDINATION_ONLY` para `POLICY_ENFORCED` exige escolher ONDE a
integracao passa a ser barrada, e tornar essa invocacao obrigatoria. Isso e decisao material sobre o
fluxo — nao uma linha de codigo — e hooks estao proibidos neste fluxo por contrato. Fica aberta.

**O padrao, dito sem atenuar:** seis rodadas seguidas apontaram a mesma forma — trato a instancia
nomeada e deixo o irmao de pe. `R26-08` e a prova mais limpa: corrigi "flag aceita e ignorada" num
modulo e deixei identica no modulo ao lado, na mesma sessao.

### `R27` — a correcao que nao funcionava, e inflacao de evidencia fora do `SL-A-02`

- **`R27-05`** — o mais direto de admitir: eu adicionei `--selftest` a `FLAGS` no `write-set-gate` e
  **nunca liguei o modo**. O seletor continuava mandando para `validar`, e as duas saidas eram byte
  a byte iguais. Reproduzi "parametro aceito e nao aplicado" DENTRO da correcao dessa mesma classe,
  na rodada seguinte a corrigi-la no `evidence-bundle`, e reportei como fechada. Allowlist nao e
  roteamento. Irmaos confirmados e corrigidos em `stale-check`, `snapshot`, `feature-graph` e
  `gerar-oracle` — `snapshot` e `feature-graph` sequer recebiam `argv`.
- **`R27-01`** — as checagens de ancora do R26 so disparavam com o campo PRESENTE. Omitir
  `sujoNaDeclaracao`, `existiaNaDeclaracao` e `shaNaDeclaracao` desligava as tres de uma vez, e
  `lanes: {}` validava produzindo `MATCH` sobre escopo vazio. Verificacao que o verificado pode
  desligar nao e verificacao.
- **`R27-02`** — JSON valido com `declaracoes` fora de lista virava `[]` e era sobrescrito. A
  correcao do R26-03 cobriu erro de SINTAXE e deixou o irmao SEMANTICO de pe.
- **`R27-03`** — rearquivar o mesmo `sliceId` REMOVIA a entrada anterior. Uma violacao registrada
  desaparecia e o bloqueio sumia, contradizendo frontalmente a frase "`UNDECLARED_WRITE` para
  sempre" que eu havia escrito neste documento. Agora a violacao permanece e a entrada nova convive
  com ela, sufixada.
- **`R27-04`** — `UNKNOWN_DIFFERENCE` nao bloqueava. Nao conseguir determinar o que foi escrito saia
  publicado como "nenhum bloqueio" — fail-open no caso em que menos se pode afirmar seguranca.

### `R27-06` — inflacao de evidencia no `feature-graph`  ·  fora do `SL-A-02`

O grafo observa PRESENCA e as conclusoes afirmavam EXECUCAO: `gate.mjs exit 0` porque
`EVIDENCE_BUNDLE.json` existe; `6/6 PASS` porque um arquivo de teste esta no diretorio. O no do
`BILLING_ACCESS_AUDIT` declara `bloqueiaSe: 'o teste dirigido nao executar — escrito nao e
executado'` e promove a `VERIFIED` pela existencia do arquivo **na linha seguinte**. A regra estava
escrita ao lado do codigo que a violava.

Corrigi como CLASSE, nao instancia: `INFLACAO-01` reprova qualquer conclusao do grafo que contenha
afirmacao de execucao (`exit N`, `N/N PASS`, `N PASS`, razao sobre suites), hoje ou numa entrada
futura. Ao ativar, apontou **10 violacoes em 5 nos** — cinco vezes mais que os dois que o revisor
nomeou. As sete conclusoes foram reescritas para descrever presenca.

**Consequencia para relatorios anteriores:** citei `feature-graph 11/11` como bateria e apoiei
`P0 VERIFIED` e `PRODUCT_INTEGRITY 27/27` neste grafo. Os 11/11 mediam transicoes do grafo e nunca
mediram execucao; os numeros de PASS que o grafo exibia eram strings fixas. Os resultados reais das
suites existem e vieram do `test-orchestrator` e do Evidence Bundle — mas o grafo nao era fonte
deles, e eu o citei como se fosse.

**O padrao, na sua forma mais nitida:** `R26-08` corrigiu "flag aceita e ignorada" num modulo e
deixou o irmao no modulo ao lado. `R27-05` mostrou que a propria correcao do R26-08 tinha a mesma
falha. Sete rodadas seguidas na mesma forma.

## 6d. `SL-A-02` — ENCERRADA como `VERIFIED_WITH_DECLARED_LIMITATIONS`

Decisao do usuario apos o `R28`: congelar o escopo no que esta provado, integrar com as limitacoes
escritas, e tratar o restante como fatia propria com orcamento de revisao separado.

**O dado que motivou a decisao.** Quinze rodadas de revisao. Achados por rodada: `R24` 7, `R25` 8,
`R26` 8, `R27` 6, `R28` 9 — sem queda. E a ORIGEM migrou: dos nove do `R28`, **sete eram defeitos
nas minhas proprias correcoes das duas rodadas anteriores**, incluindo uma regressao que eu causei
(a allowlist de flags tornou `--registrar` inalcancavel) e um controle que eu criara na rodada
anterior (`INFLACAO-01`) reproduzindo a inflacao de evidencia que ele policia. O nucleo do
`SL-A-02` — registro, oraculo, derivadores, sabotagens — nao recebe achado desde o `R24`; os
defeitos migraram todos para o harness e para o processo de correcao.

### O QUE ESTA PROVADO, e vale como base

| Bateria | Resultado |
|---|---|
| `invariants/verify.mjs` | 104 PASS / 0 FAIL · 62-62 sabotagens |
| `INV-PUREZA-01` | 4/4 — dimensao do contrato alcanca `INV-02c`; ausente do modelo vira inercia declarada |
| `INV-AMBIG-01` | 6/6 · 5 derivadores enumerados de `verify.mjs` + `gerar-oracle.mjs`, todas as formas sintaticas exercidas por fonte sintetica |
| `gerar-oracle --conferir` | 20/20 controles · 3/3 blocos · reprova fonte ambigua |
| `verify-layout` | 106 PASS / 0 FAIL |
| `selftest/run` | 52/52 (41 negativos) |
| `protocol/events/verify` | 51 PASS / 0 FAIL |

Todos confirmados por execucao independente do revisor em `R26`, `R27` e `R28`.

### O QUE **NAO** ESTA PROVADO — limitacoes que acompanham a integracao

1. **`MAR-INV-025` na propria ferramenta.** O `write-set-gate` e `COORDINATION_ONLY`, nao
   `POLICY_ENFORCED`: `bloqueiosAbertos()` informa e **nada obriga a consulta-lo** antes de
   integrar. Hooks sao proibidos neste fluxo por contrato. `F-MAR-071` aberto.
2. **Observacao e diferenca liquida, nao historico.** Arquivo escrito e depois restaurado ao
   conteudo do baseline e invisivel. Fechar isso exigiria interceptar a escrita.
3. **Sete achados do `R28` seguem ABERTOS** e estao listados em `SL-H-01` abaixo. Entre eles: a
   ancora do Write Set ainda aceita declaracao sem baseline; `UNKNOWN_DIFFERENCE` anterior pode ser
   apagado por rearquivamento; `bloqueiosAbertos` trata historico malformado como vazio;
   `INFLACAO-01` tem falso negativo confirmado; varios modulos ainda ignoram argumentos.
4. **Evidencia de ORDEM de tres fatias e `UNKNOWN_DIFFERENCE`.** `F-MAR-068`, `SL-A-06` e
   `R28-REGRESSAO` foram reconciliados por decisao do usuario — `ACEITO_COMO_RISCO` para os dois
   primeiros. A violacao permanece registrada; nao se afirma que estavam corretos.
5. **Os 13 invariantes preservados continuam `UNKNOWN` + `UNENFORCED`.** Classificar a forca real
   de cada um exigiria evidencia do mecanismo que o impoe, e esta fatia nao a levantou.

### `SL-H-01` — hardening do harness de verificacao  ·  READY, revisao propria

Os 7 achados abertos do `R28`, com orcamento de revisao separado do `SL-A-02`:

| Id | Defeito |
|---|---|
| `R28-01` | ancora aceita declaracao sem `baseCommit`/baseline; `existiaNaDeclaracao` nao e conferido; `lanes` sem validacao de tipo |
| `R28-02` | rearquivar preserva so `UNDECLARED_WRITE` — apaga `UNKNOWN_DIFFERENCE` e reabre o fail-open do `R27-04` |
| `R28-03` | `bloqueiosAbertos` trata historico sem `declaracoes` como vazio; irmao do `R27-02`, que corrigi so em `arquivar` |
| `R28-04` | sufixo `#rearquivado-N` colide: entradas ja sufixadas nao entram na contagem |
| `R28-05` | `evidence-bundle` converte bundle anterior ilegivel em `NENHUMA` sem erro e depois sobrescreve |
| `R28-06` | `--selftest` ainda ignorado em `feature-graph`; modos simultaneos nao recusados; `gate`, `tenant-coverage`, `eos-frontier`, `deepspec`, `run-state`, `metric/*` ignoram argv — `run-state` escreve mesmo com flag desconhecida |
| `R28-07` | `INFLACAO-01` e lista de negacao de 4 regexes, olha so `evidencia`, e **nao declara a propria incompletude** |

**Licao que atravessa as sete rodadas, registrada para a proxima fatia:** corrigir a instancia
nomeada e deixar o irmao foi o padrao dominante, e allowlist escrita a mao foi o veiculo mais comum
— foi assim que quebrei `--registrar`. Onde couber, a lista deve ser DERIVADA da fonte, como o
`FLAGS` do `stale-check` passou a ser.

## 6e. `SL-H-01` — estabilizacao do harness

Escopo FECHADO, entregue. O que mudou de natureza: pela primeira vez nesta frente, os defeitos foram
encontrados pelo USO e pelo proprio instrumento, nao por revisao paga.

### Evidencia FRESH — execucao REAL

| Suite | Estado | exitCode | Duracao |
|---|---|---|---|
| `bot:unit` | PASS | 0 | 35 s |
| `painel:unit` | PASS | 0 | 79 s |
| `bot:lint` | PASS | 0 | 7 s |
| `painel:lint` | PASS | 0 | 11 s |
| **`bot:integration`** | **PASS** | **0** | **775 s** |

`bot:integration` rodou contra **PostgreSQL 16 e Redis 7 reais**, com migrations aplicadas pela
receita do CI. `EVIDENCE_BUNDLE.ambiente.head` confere com o HEAD do repo; `stale-check` = `FRESH`;
`gate.mjs` = **`P0 = VERIFIED`**.

### `DOCKER-ENGINE-UNAVAILABLE` — RESOLVIDO

Bloqueava gates especificos desde o inicio da frente. A recuperacao foi a prevista pelo projeto:
subir o daemon e espelhar a receita do `.github/workflows/ci.yml`. O `.env.test` aponta para a porta
**55432**, nao 5432 — o `postgres` do `docker-compose.yml` do projeto **nao expoe porta ao host** por
endurecimento deliberado (`H8a`), entao ele nao serve a suite de teste. Containers efemeros
`admai-pg-test` e `admai-redis-test`.

### Resultados deterministicos

`cli` 19/19 · `write-set-gate` 97/97 (era 22 no inicio da frente) · `evidence-bundle` 12/12, 10/10,
8/8 · `stale-check` 9/9 e `ST-EVID-01` 11/11 · `feature-graph` 11/11, `INFLACAO-01` ok, `INFLACAO-02`
20/20 · EOS 104/0 intocado · `diff --check` limpo nas duas lanes.

Os quatro totais acima foram publicados uma vez com os numeros de ANTES das correcoes do
`CODEX_FINAL_REVIEW` — drift apontado pelo `H01-DREV-02`. Numero publicado que nao corresponde a
bateria executada e a mesma classe que o `INFLACAO-01` policia, uma camada acima.

Varredura de roteamento sobre 18 modulos: **nenhum modo aceito-e-ignorado**, nenhum `MODO_DE_ACESSO`
faltando. Sao **cinco** modulos `MUTATING` — quatro com modos nao provados por serem mutantes, e
`run-state` sem modo algum a provar. A primeira versao desta secao dizia "quatro", contando so o
recorte e omitindo o quinto: claim quantitativo subafirmado, apontado pelo `CODEX_FINAL_REVIEW`
(`H01-REV-08`). O `cli.mjs` nao varre a si mesmo — autorrecursao —, e isso sai como
`NAO_VARRIDO_POR_AUTORRECURSAO`.

### `CODEX_FINAL_REVIEW` — oito achados, sete deles fail-open dentro do escopo

O revisor executou os controles e sondou os caminhos. Nenhum achado foi sobre a logica principal;
todos foram sobre **caminhos de erro e omissao** que produziam o desfecho mais permissivo.

| Achado | Fail-open |
|---|---|
| `H01-REV-02` | `registrar({ evidencia: { ok: true } })` gravava sem bundle, sem HEAD e sem execucao. Eu criei esse parametro como ponto de injecao de teste, e ele virou o bypass do controle que a funcao existe para impor. Meu controle so exercitava `ok: false`. Agora injeta-se o INSUMO, nunca o VEREDITO. |
| `H01-REV-03` | Arquivo APAGADO que tambem casasse com regra de ignore sumia da observacao. `AGORA_IGNORADO` agora exige que o arquivo AINDA EXISTA com o mesmo sha do baseline. |
| `H01-REV-04` | A exigencia de defeito nomeado morava so no ESCRITOR (`reconciliar`); quem levanta o bloqueio e o LEITOR (`disposicaoValida`). Registro manual passava pela porta que `reconciliar` fechava. |
| `H01-REV-05` | Timeout de UM modo era empurrado para `roteadas` e `provado` virava `true`: o timeout provava o que ele impede de observar. |
| `H01-REV-06` | Declaracao SEM `lanes` caia no fallback de lane unica. Agora exige `lanes` ou `lane`. |
| `H01-REV-07` | `execucoesReais` aceitava id de execucao que FALHOU; e a rede secundaria listava tres campos a mao, entao campo NOVO ficava livre. Agora so aprovada sustenta, e serializa-se o no inteiro menos os estruturais. |
| `H01-REV-08` | Contagem de `MUTATING` subafirmada. |

**Um defeito que apareceu ao corrigir o `H01-REV-02`:** a primeira versao do controle novo chamou
`registrar()` com o estado REAL, caiu na checagem verdadeira, que passou — e **gravou o
`VERIFICATION_RECORD.json` de producao**. Um controle escrito para impedir fabricacao de evidencia
fabricou uma. E o `F-MAR-069` de novo. Corrigido com `destino`, e com o controle que prova que
`destino` e APLICADO e nao apenas aceito — sem ele, os dois controles anteriores passariam mesmo com
a escrita indo para producao, porque ambos recusam antes de escrever.

### Defeitos MEUS descobertos durante a propria fatia

| Defeito | Quem apontou |
|---|---|
| `cli.mjs` derivava modos das proprias fixtures e do proprio comentario de doc | o instrumento |
| loop abortado deixou `metric/verify.mjs` sem migrar | verificacao por modulo |
| fixture do gate declarava `sujoNaDeclaracao: true` contra conjunto vazio de sujos | a checagem nova |
| `INFLACAO-02` assertava contagem exata onde dois padroes casam | a execucao |
| **OPCAO com valor tratada como MODO exclusivo**, recusando `--execucoes X --fecha-gate` | **o USO** |
| assercao comparando `NAO` com `NAO` acentuado | a execucao |

O quinto e o mais instrutivo: e a MESMA classe do `--registrar`, e eu a reintroduzi dentro da
correcao dela. Quem apontou nao foi revisao — foi tentar usar a ferramenta.

### Limitacoes que PERMANECEM

1. `write-set-gate` e `COORDINATION_ONLY`, nao `POLICY_ENFORCED`. `F-MAR-071` ABERTO.
2. Observacao e **diferenca liquida** contra baseline, nao historico de escritas.
3. `provarRoteamento` prova que o modo faz coisa DIFERENTE, nao que faz a coisa CERTA.
4. A lista de padroes do `INFLACAO-01` e de NEGACAO, incompleta por construcao.
5. `F-MAR-070` ABERTO: `EXECUTION_STATE.md` duplicado entre lanes.

### Quarta disposicao — `CLASSIFICACAO_INVALIDADA_POR_DEFEITO_DO_INSTRUMENTO`

Autorizada pelo usuario. As tres anteriores assumem que HOUVE escrita; esta e para quando nao houve
e a comparacao veio de classificador defeituoso. Por negar mais, exige mais: **defeito nomeado e
correcao apontavel**, com cinco controles provando que nao vira atalho. A comparacao permanece
`UNDECLARED_WRITE` no historico, como todas.

## 6f. `HARNESS_STABILIZED` — FECHADO  ·  EOS congelado

```yaml
HARNESS: STABILIZED
EOS_FEATURE_DEVELOPMENT: FROZEN
EOS_VNEXT: DEFERRED
PRIMARY_GOAL: ADMAI_RELEASE
```

### O gate, condicao a condicao

| Condicao | Evidencia |
|---|---|
| suites reais PASS | 5/5 — `bot:unit`, `painel:unit`, `bot:lint`, `painel:lint`, **`bot:integration`** |
| Evidence Bundle FRESH | `ambiente.head` == HEAD do repo; `stale-check` = `FRESH` |
| controles positivos e sabotagens | `cli` 19/19 · `write-set-gate` 97/97 · `evidence-bundle` 12/12 · `stale-check` 9/9 e 11/11 · `feature-graph` 11/11 e 20/20 |
| violacoes historicas preservadas | 12 disposicoes, **12 com a comparacao preservada** |
| zero bloqueio nao resolvido | `bloqueiosAbertos()` = `[]` |
| revisao semantica final | `FINAL` (8 achados) -> `DELTA` (2) -> `DELTA-2` **PASS** |
| gate P0 | `P0 = VERIFIED` |
| `git diff --check` | limpo nas duas lanes |

### O que a revisao que PASSOU de fato cobriu

Precisa ficar escrito, porque a diferenca importa. A ultima revisao **nao** reexaminou o escopo
inteiro: ela se declara *"restrita aos dois achados indicados"*. A cadeia foi:

- `CODEX_FINAL_REVIEW` sobre `H-01.1..H-01.11` completo -> **8 achados**, sete deles fail-open.
- `CODEX_DELTA_REVIEW` sobre as sete correcoes -> **2 achados**; e a frase que importa:
  *"Nao encontrei correcao que atualmente reintroduza a classe corrigida ou crie novo fail-open."*
- `CODEX_DELTA_REVIEW` sobre esses dois -> **PASS**, com os quatro controles novos confirmados
  capazes de falhar e os totais publicados conferidos contra a bateria reexecutada.

Nao ha uma revisao PASS sobre o escopo inteiro em uma unica passada. Ha uma revisao completa cujos
achados foram todos fechados, e duas revisoes delta encadeadas, a ultima limpa. E o que o protocolo
do usuario prescreve (`DELTA_REVIEW` apos correcao, sem repetir FULL sem motivo), e e o que existe.

### O que este gate NAO significa

1. `write-set-gate` continua `COORDINATION_ONLY`. `F-MAR-071` ABERTO.
2. A observacao continua sendo **diferenca liquida** contra baseline.
3. `provarRoteamento` prova modo DIFERENTE, nao modo CERTO.
4. A rede secundaria do `INFLACAO-01` continua incompleta por construcao.
5. `F-MAR-070` ABERTO: `EXECUTION_STATE.md` duplicado entre lanes.
6. `bot:integration` passou **neste ambiente**, com containers efemeros. Nao e prova de CI.

### `EOS_FEATURE_DEVELOPMENT = FROZEN`

Nenhuma slice EOS retoma automaticamente. `SL-A-06`, `SL-A-09`, `SL-A-10` e `SL-K-01` estao READY no
DAG e **nao entram no caminho critico** sem passar pelo `ADMAI_DELIVERY_RELEVANCE_CHECK`.

## 6g. `ADMAI_DELIVERY_RELEVANCE_CHECK` e o Feature Registry

### Relevance check das slices EOS `READY`

Pergunta unica: *esta slice e necessaria para construir, verificar ou entregar o AdmAi com
seguranca?*

| Slice | Escreve em | Veredito |
|---|---|---|
| `SL-A-06` | `protocol/events/` | `DEFER_TO_EOS_VNEXT` — envelope de evento e coordenacao do runtime EOS |
| `SL-A-09` | `protocol/schemas/` | `DEFER_TO_EOS_VNEXT` — maquina de capability do EOS |
| `SL-A-07` | snapshot congelado | `DEFER_TO_EOS_VNEXT` |
| `SL-A-03` / `SL-A-04` | `protocol/artifacts/` | `DEFER_TO_EOS_VNEXT` |
| `SL-K-08` | destino indeterminavel | `DEFER_TO_EOS_VNEXT` |

**Nenhuma entra no caminho critico.** O que o AdmAi precisava do EOS era o harness de verificacao, e
ele esta estabilizado. Nao ha slice EOS `REQUIRED_FOR_ADMAI` aberta.

### `ADMAI_MASTER_FEATURE_REGISTRY` — derivado do repositorio real

`tools/admai-delivery/feature-registry.mjs`. Superficie observada: 12 rotas, 26 modelos Prisma, 69
services, 2 middlewares, 42 paginas, 34 suites de integracao.

```text
MVP FEATURES TOTAL: 22
  SUITE_APROVADA : 17     teto derivavel
  IMPLEMENTADO   : 2
  NAO_INICIADO   : 3      AUDITORIA · OBSERVABILIDADE · STAGING
  DONE           : 0      nao derivavel
```

**Por que `DONE` e zero, e por que isso e o resultado correto.** A primeira versao concedia `DONE`
quando as pecas existiam e a suite dirigida passava. Deu **17 de 22 e zero bloqueador P0 aberto** —
que se le como "quase pronto para vender". Mas `SERVICOS_CRUD` ganhou `DONE` porque duas suites
especificas passam (servico atual, paginacao keyset), nao porque o ciclo
`Cliente -> Servico -> Execucao -> Conclusao -> Financeiro` foi aceito. E `BILLING` ganhou `DONE`
enquanto o proprio criterio exige o veredito do gate comercial definido, e o veredito conhecido e
`BILLING_GATE_ABSENT_WITH_TESTED_SCOPE`.

Suite dirigida provar suas PROPRIEDADES nao e a funcionalidade estar PRONTA. E a mesma inflacao que
o `INFLACAO-01` policia no `feature-graph`, um nivel acima — e desta vez apareceu no produto.
`DONE` saiu da taxonomia derivavel; um controle prova que **nenhuma combinacao de observacao** o
produz.

**Segundo fail-open, na mesma sessao:** `[].every()` e verdadeiro, entao feature que nao declara
peca alguma — `AUDITORIA`, `OBSERVABILIDADE`, `STAGING` — passava por "todas as pernas presentes" e
caia em `IMPLEMENTADO`. Ausencia total de evidencia virando quase-pronto. Corrigido: exige-se ao
menos uma perna aplicavel E presente.

17 controles, incluindo o que verifica que nenhuma feature aponta para artefato inexistente no repo.

### O trabalho restante, pelo Registry

`P0_RELEASE_BLOCKER`: 11 features, todas com suite aprovada e **aceitacao pendente**. A diferenca
entre o que a suite cobre e o que o `acceptanceCriteria` pede E o trabalho.

`NAO_INICIADO` e `P1_MVP_REQUIRED`: `AUDITORIA` (AuditLog existe no schema, sem cobertura),
`OBSERVABILIDADE` (erro em producao ainda nao e detectavel sem acesso ao banco), `STAGING` (deploy
reproduzivel e rollback provado).

## 7. Known Risks

`KR-005` (forks/jsdom) · `KR-007` (residual do classificador) · `KR-MAR-001` (telemetria vazia →
custo `UNAVAILABLE`) · `KR-MAR-002` (mesma conta de SO — `KNOWN_SECURITY_LIMITATION`) ·
`KR-MAR-003` (Verification executa código não confiável) · `KR-MAR-004` (fallback legado permite
patch — `F-MAR-057`).

## 8. Change Requests

`PBCR-001/002/003`, `PDCR-001/002/003` — todos integrados no PLAN-G §E, aditivos, com owner de
implementação e de verificação distintos.

## 9. Regras operacionais em vigor

**Resolução de fonte (§12):** PLAN-G é índice mestre e **não** substitui A–F.
`MAR-P2/P3→PLAN-A` · `P4–P8→PLAN-B` · `P9/P10→PLAN-C` · `P11–P13→PLAN-D` · `P14–P16→PLAN-E` ·
`P17–P19→PLAN-F`. Ler as seções relevantes de **todas** as fontes antes de montar a Capsule.

**Precedência:** Safety/System Invariants > reconciliação explícita do PLAN-G > contratos congelados
A–F > política de repositório > interpretação do worker. Divergência não reconciliada →
`MASTER_PLAN_CONFLICT` / `PLAN_DEFECT`. **Não adivinhar.**

**Controle negativo (§21):** *precisa ser capaz de falhar quando a propriedade que protege é
sabotada.* Controles vacuamente verdadeiros são rejeitados.

**`MAR-INV-025`:** nenhuma claim excede a `EnforcementClass`/evidência demonstrada.
**§23:** `declared` / `materialized` / `observed` / `verified` são campos distintos; não colapsar.

**Ciclo por Slice:** resolver fontes → Capsule → inspecionar realidade → implementar → testes alvo →
Execution Result → review do Codex → `STALE_RESULT_CHECK` → integração serial → Proof → Gate.

**Stop Conditions reais:** `ACTIVE_CUTOVER_READY` (→ `USER_DECISION_PROPOSAL`, D2, **parar**) ·
`USER_EXCLUSIVE_DECISION` · `BLOCKING_SECURITY_GAP` · `BLOCKING_CAPABILITY_GAP` ·
`UNRESOLVED_PLAN_DEFECT` · `UNSAFE_TO_CONTINUE` · `NON_RECOVERABLE_ENVIRONMENT_BLOCKER`.
**Pressão de contexto não é Stop Condition** — o tratamento é `/compact` (§31).

## 10. Análise concorrente do Codex disponível para o próximo Slice

`EOS_BUILD_CODEX/.eos-capsule/CHALLENGE-SL-A-01.txt` — `RESULTADO: CONCORDO`, `CONFIANCA: ALTA`.
Oito defeitos antecipados para `SL-A-01`, dos quais três não estavam na minha lista:

- **força de segurança embutida no tipo errado** — rejeitar construção em que `SliceLease`,
  `WriteManifest` ou capability apenas `DISCOVERED` satisfaça um tipo de garantia forte;
- **escopo antecipado** — `SL-A-01` não pode exportar implementações de `SL-A-02/03/09`;
- **teste vacuamente verdadeiro** — asserção sobre a própria lista implementada não prova o contrato
  documental; exige **fixture externa congelada** com os nove keysets e testes de mutação
  (remove / extra / merge / typo).

Restrição registrada: não transformar cada conceito em enum; preservar eixos separados e
nominalidade onde o PLAN-A §F exige distinção.

### Regra durável — `AUTHORITATIVE_DERIVATION_FIRST`

**Quando um artefato secundário puder ser derivado deterministicamente da fonte autoritativa,
GERE — nunca transcreva.**

Não é preferência de estilo. O `SL-A-02` produziu **três defeitos da mesma classe** em sequência,
e nenhum foi pego por revisão de código — todos por teste, camadas adiante:

| # | O que transcrevi | O que se perdeu | Quem pegou |
|---|---|---|---|
| 1 | as 13 entradas de `knowledge/registries.mjs` | `INV-PROOF-01` perdeu `alwaysApplicable: true`, o statement encurtou e o scope caiu de 5 superfícies para 2 | selftest `ST-29` |
| 2 | o mapa de enforcement do PLAN-G | acentos e crases: `validacao` por `validação`, `RECONSTRUCTION_MODE` sem crases | `INV-04j`, ao ser ligado |
| 3 | a nota do `MAR-INV-042` no oráculo | divergência do texto congelado | o próprio gerador, em `--conferir` |

Aplicações no repositório: `oracle.mjs` é gerado por `gerar-oracle.mjs`; `COM_MAPA` do registro
projeta do oráculo em vez de repetir literais; as entradas preservadas são construídas do oráculo
congelado, não digitadas.

**Corolário obrigatório — gerado por script ≠ correto.** A regra sozinha cria falsa segurança. A
cadeia inteira precisa ser testável:

```
FONTE congelada → PARSER → GERADOR → ARTEFATO → ORÁCULO INDEPENDENTE
```

O gerador tem controles próprios que o atravessam (`gerarAncora` é pura e recebe fontes
fabricadas), inclusive determinismo e "fonte ausente não gera artefato vazio". E, quando a claim é
sobre parsing, a sabotagem **atravessa o parser real** — a lição da R6-02, que custou seis rodadas
no `SL-A-01`.

Limite declarado: a conferência alcança os **blocos gerados**, não o arquivo inteiro. Edição fora
deles não é detectada, e a saída do gerador diz isso em vez de sugerir cobertura total.

**Extensão da R19/R20 — ancorar o NOME não ancora a DEFINIÇÃO.** A R19 ligou os nomes das seis
classes ao PLAN-A §H e eu considerei o elo fechado. A R20 mostrou o que sobrava: alterar a *coluna
de semântica* — o texto que diz o que `HARD_ENFORCED` significa — continuava produzindo zero
falhas, e a frase "não se finge proteção" estava transcrita sem acento e **não era lida por código
nenhum**. Parecia contrato e era decoração. `MAR-INV-025` fala sobre descrever força, e força mora
na definição, não na etiqueta. Um terceiro bloco gerado (`normativoGerado`) fechou isso.

### Regra durável — `AMBIGUITY_REJECTS`

**Fonte normativa que admite mais de uma leitura REPROVA. Nunca se escolhe entre candidatos.**

Escolher é inventar autoridade que o documento não deu. Eu já tinha aplicado isso em `extrairBloco`
na R18-02 — e a R20 encontrou `derivarCamposDoPlano` fazendo exatamente o contrário com `find`:
uma segunda lista de relações, contraditória, entrava no §M-N e o parser mantinha a primeira, sem
rastro. **A regra existir num parser não a coloca nos outros**; cada ponto de leitura precisa dela
explicitamente.

### Regra durável — `EVALUATOR_PURITY`

**O avaliador decide APENAS pelo modelo que recebe. Consulta a estado global torna sabotagem do
modelo invisível.**

`INV-06c` conferia a existência do alvo de relação por `invariantePorId`, ligado à coleção do
módulo. Removendo `MAR-INV-023` do modelo inteiro, `MAR-INV-023A REFINES MAR-INV-023` continuava
"válido": o lookup global respondia por um alvo que o registro avaliado não continha. Um verificador
que consulta o mundo em vez do argumento não testa o argumento.

Corolário medido: **conferir a SOMA não substitui conferir os ITENS**. `INV-06b` comparava
`invariantes.length` com `preservados + arquitetura`, e remoção dupla preserva a soma. `INV-06e`
passou a comparar a subcoleção arquitetural ID a ID.

### Regra durável — `INSTRUMENT_BLINDNESS_GUARD`

**Antes de afirmar que um conteúdo NÃO está presente, prove que ele SERIA encontrado se estivesse.**

Um teste de vazamento que procura o nome do técnico nos bytes de um PDF passa sempre — não porque
não há vazamento, mas porque o instrumento é cego. Aconteceu aqui, em duas camadas empilhadas: o
PDFKit grava o conteúdo com `FlateDecode`, e dentro do stream o texto sai **hex e fatiado por
kerning** (`[<54> 120 <65636e69636f…>]` é `"T"` + `"ecnico …"`). Buscar sem inflar, ou inflar sem
concatenar os grupos hex na ordem, devolve "não encontrei" para texto presente.

O guarda é o controle positivo obrigatório e **anterior** à asserção negativa: o relatório do
próprio dono precisa conter o marcador. Se não contiver, o teste FALHA com `INSTRUMENTO CEGO` em
vez de aprovar em silêncio. Sem isso, o negativo mais tranquilizador do arquivo seria o mais vazio.

### Regra durável — `SCOPE_REACHES_EVERY_ARGUMENT`

**Recortar a entrada principal não recorta o cálculo. Escopo precisa alcançar TODO argumento.**

`producao-por-tecnico` monta uma linha por técnico da empresa, com **zero explícito** para quem não
produziu — de propósito, porque para o dono "não produziu" e "não existe" são coisas diferentes. A
exposição recortava as *linhas de serviço* pelo técnico do token e passava a lista de técnicos
inteira como contexto. Resultado: o funcionário recebia zero valor e a **lista nominal de todos os
colegas** — enumeração de equipe por um endpoint de métrica.

O recorte estava certo no argumento que eu olhei e ausente no que eu não olhei. Uma feature pensada
para o dono virou vetor de exposição para outro papel, sem nenhuma linha de código errada
isoladamente. O teste de escopo `PROPRIO` pegou; nenhuma leitura de código tinha pegado.

### Regra durável — `INSTRUMENT_REPORTING_DEFECT`

**O relator pode errar sobre a própria execução, e isso não é falha de teste nem de ambiente.**

O orquestrador lia `process.env.DATABASE_URL` no *próprio* processo; a suíte lê `.env.test` pelo
`dotenv`, dentro do processo do vitest. Os dois lugares nunca foram o mesmo. A suíte rodava 27/27 e
era registrada como `NAO_EXECUTADA` — um falso negativo que teria contaminado todo Evidence Bundle
montado sobre ele.

A classe importa porque decide a correção: `TEST_FAILURE` mexe no teste, `ENVIRONMENT_FAILURE`
mexe no ambiente, e este mexe na **detecção**. Corrigir o resultado à mão — anotar `PASS` porque eu
tinha visto passar — teria escondido o defeito e transformado evidência em transcrição.

Corolário: a pré-condição precisa resolver a dependência **do mesmo jeito que o executor resolve**.
Qualquer divergência entre os dois é falso negativo esperando acontecer.

### Regra durável — `VALIDATED_IS_NOT_APPLIED`

**Parâmetro aceito pela allowlist e sem efeito no resultado é pior que parâmetro rejeitado.**

`?dimensao=tecnico` era validado contra as dimensões do contrato e depois ignorado: o cálculo
rodava sem agrupar e a resposta trazia o total da empresa. O cliente pedia um recorte, recebia um
número plausível, e **não tinha como saber** que respondia outra pergunta. Rejeitar teria sido
honesto; aceitar e ignorar é a forma silenciosa de mentir.

A regressão que fecha a classe não é "o parâmetro é aceito" — é **dimensões diferentes produzem
agrupamentos diferentes**. Um teste que só verificasse status 200 teria passado o tempo todo.

### Regra durável — `EVIDENCE_MUST_NOT_VANISH_QUIETLY`

**Ferramenta que monta evidência não pode destruí-la por omissão de argumento.**

`evidence-bundle.mjs` sem `--execucoes` sobrescreveu um bundle com cinco suítes — incluindo 19
minutos de integração real — por um vazio, imprimiu `EVIDENCE_BUNDLE_MONTADO` e saiu com 0. Havia
**três** caminhos para o mesmo estrago, e o `catch {}` vazio era o pior: flag ausente, caminho
inexistente e JSON ilegível, todos virando `[]` sem uma palavra.

Regra: sem entrada nova, **preserva**; com entrada declarada e ilegível, **recusa** — ali houve
intenção de fornecer evidência, e falhar calado transforma erro de digitação em apagamento. Vazio
só quando não há anterior, e dito em voz alta.

O gate pegou (`P0 = NOT_VERIFIED`), o que é a rede funcionando. Mas depender do gate para descobrir
que a ferramenta apagou o trabalho é depender da rede em vez do chão.

### Regra durável — `NO_VALIDATED_WRITE_SET, NO_MUTATION`

**Declaração de escopo só é prévia se estiver ancorada a um estado anterior à escrita.**

Enquanto o Write Set foi uma constante em `write-scope.mjs`, "declarei antes" era indistinguível de
"declarei depois": eu editava a constante a qualquer momento e nada registrava quando. Quatro fatias
seguidas inverteram a ordem; o instrumento acertou as quatro e não impediu nenhuma, porque a
propriedade que ele mede não é a ordem.

A âncora é o `sha256` de cada caminho declarado **no instante da declaração**. Daí sai a assinatura
de declaração retroativa: caminho que já diferia do HEAD quando foi declarado **e não mudou depois**
foi escrito antes de ser declarado.

Corolário que impede o gate de virar teatro: a promoção `DECLARED → VALIDATED` é **mecânica**. Se eu
pudesse escrever `"estado": "VALIDATED"` no artefato, a validação voltaria a ser afirmação minha.

E o corolário honesto sobre força: hooks estão desligados e o contrato do repositório proíbe criá-los
aqui, então isto é `POLICY_ENFORCED` na integração e `DETECTIVE` para ordem — **não** contenção de
filesystem. Precondição de control plane e contenção física são coisas diferentes, e confundi-las
seria a sobreafirmação que o `MAR-INV-025` proíbe.

Válvula explícita, não silenciosa: retomar arquivo já modificado exige `reescritaDeclarada` com
motivo. A regra não impede continuar trabalho anterior — impede fazê-lo sem dizer.

### Regra durável — `SENSITIVITY_BELONGS_TO_THE_FIELD`

**Proteção de campo pertence ao CAMPO, não à métrica que por acaso o exibe.**

Ao generalizar o drilldown para servir a segunda vertical, o payload passou a carregar os quatro
campos financeiros para todas as métricas. `servicos-concluidos` não declarava `fieldPolicy`, então
nada era redigido: o campo que o Hub #1 protegia voltaria a sair para quem tem só `servicos.ver`.

A causa não foi esquecimento — foi o lugar errado da política. Amarrada à métrica, ela exige que
cada métrica futura se lembre, e uma delas não vai. `comissaoGerada` é dado financeiro de uma
pessoa em qualquer contexto. Agora há política PADRÃO por campo, e a métrica pode **endurecer**,
nunca afrouxar: a fusão é união de exigências.

Peguei em revisão própria, minutos depois de introduzir. O que a tornou visível foi perguntar
"quem herda isto?" em vez de "isto funciona?".

### Regra durável — `AN_ASSERTION_THAT_CANNOT_FAIL_IS_NOT_COVERAGE`

Três versões da mesma asserção, nesta fatia:

1. `not.toMatch(/50/)` — o escape quebrou no shell e virou `/50<BACKSPACE>/`. Um backspace nunca
   aparece num JSON, então a asserção **passava por ser impossível de violar**;
2. `not.toContain('50')` — não-vácua, e errada: `"50"` casa dentro de `"500"`, reprovando um valor
   legítimo;
3. comparação de **valor**, não de texto: nenhum campo do registro vale a comissão.

A primeira é a perigosa, porque conta como cobertura enquanto não mede nada — e o lint só a pegou
por acaso, via `no-control-regex`. Asserção que não pode falhar é pior que asserção ausente: a
ausente é visível.

### Regra durável — `A_GUARD_THAT_NEVER_FIRES_IS_NOT_A_GUARD`

Dois casos nesta fatia, em minutos:

- o controle que proíbe consulta direta a `BatidaPonto` reprovou o **comentário** que documenta a
  forma proibida — falso positivo por varrer texto que não é código;
- corrigido isso, ele passou a nunca disparar, e um controle que não dispara é indistinguível de um
  controle quebrado.

A saída não é escolher entre os dois: é **provar as duas direções** com fonte sintética — a
violação é detectada, e o código legítimo não é acusado. O mesmo vale para dependência entre
features declarada como literal constante (`'METRIC_FOUNDATION verificada'`): ela nunca resolvia, e
mantinha o Hub bloqueado por um motivo falso mesmo com a fundação verificada.

### Regra durável — `PROXY_SIGNAL_HONESTY`

**Quando o sinal é um proxy do risco e o proxy quebra, reduza a afirmação — não ajuste a
heurística até ela concordar com a sua leitura.**

`classificarExposicao` decidia a classe pelo formato do caminho: sem `:param` e fora de `/me` →
`COLLECTION_LEAKAGE_VECTOR`, por eliminação. A execução do teste desmentiu: `GET /ponto/hoje` não
tem `:param`, não está em `/me`, e devolve UM registro escopado pelo token — a asserção "A lista e
não vê linha de B" era impossível de escrever, e o teste voltou 400.

Tentei afinar a regex (`req.user.tecnicoId`, depois o guard `!req.user.tecnicoId`) e cada versão
concordava comigo em alguns casos e errava em outros — `POST /servicos` guarda condicionalmente,
e o span do extrator atribuiu um middleware à rota anterior. Afinar até concordar seria **ajustar o
instrumento à resposta**. A correção foi exigir *evidência positiva* (`findMany`/`groupBy`/
`aggregate`/`count(`) para afirmar coleção, e mandar o resto para `UNKNOWN` — que erra na direção
segura, porque cobertura falsa é o erro caro.

Onde a análise estática não alcança por construção — `GET /relatorio/pdf` agrega dentro de
`gerarRelatorioPDF`, em outro módulo — a classe é **declarada com motivo registrado**
(`CLASSIFICACAO_DECLARADA`), contestável linha a linha, como já era `FORA_DO_ESCOPO_DE_TENANT`.
Declaração justificada é honesta; heurística esticada não.

### `D3-SL-A-02-ONDE-VIVE-O-REGISTRO` — consolidação, não registro paralelo

**Decisão (Codex Decisor, `RESULTADO: DISCORDO` da minha posição, `CONFIANCA: ALTA`;
thread `01a003bb-4c61-7770-93c6-90d07d5ffb7e`).** Terceira solução `C'`, vinculante.

Minha posição era registro **novo e separado** em `invariants/`, deixando
`knowledge/registries.mjs` intocado. Recusada — e o fundamento derrubou minha premissa: **PLAN-A
§AK diz literalmente `invariants/ (consolida o registry hoje em knowledge/registries.mjs)`**.
Verifiquei: é textual. Registro paralelo contradiz contrato congelado.

O Decisor também **corrigiu dois fatos da evidência que eu submeti**, e conferi os dois:

| Eu afirmei | Verificado |
|---|---|
| 10 entradas em `INVARIANTS` | **13** — 10 `INV-*` e 3 `EOS-INV-*`. Meu `grep` por `id: 'INV-` perdeu o prefixo `EOS-` |
| 17 `MAR-INV` como inventário | 17 é o que **PLAN-G menciona**, e ele se declara "amostra dos críticos". A união de todos os planos dá **34**. Congelar 17 como totalidade seria oráculo errado |

**Forma vinculante do registro:**

- registro canônico único em `tools/eos/invariants/registry.mjs`, reexportado por `index.mjs`;
- `knowledge/registries.mjs` **permanece no caminho** (LAY-05) e **reexporta** — sem segunda cópia
  autoritativa, sem import circular;
- entradas legadas preservadas por ID e texto, enriquecidas **sem inventar enforcement**:
  `enforcementClass: 'UNKNOWN'` e marcação ortogonal `UNENFORCED`; campo desconhecido fica `null`,
  nunca preenchido por inferência;
- **`UNENFORCED` não é uma sétima classe.** É estado ortogonal. `ENFORCEMENT_CLASSES` contém
  exatamente as seis do PLAN-A §H e **deve rejeitar** `UNENFORCED`;
- classe atual, estado atual e classe-alvo em **campos distintos**. `MAR-INV-042`: classe `UNKNOWN`,
  estado `UNENFORCED`, alvo `POLICY_ENFORCED`, materializado por `SL-DU-01`;
- `status: ACTIVE` do legado continua sendo ciclo de vida, não enforcement;
- promoção de classe exige mecanismo, ponto de verificação e teste negativo compatíveis.

Testes obrigatórios fixados: oráculo externo congelado de IDs (remoção/extra/duplicata/typo
reprovam); `knowledge.INVARIANTS` referenciando a coleção canônica com loader preservado; classes
aceitas exatamente as seis; `UNENFORCED` como classe reprova; garantia `ADVISORY`/`UNKNOWN`
declarada `HARD_ENFORCED` reprova; `MAR-INV-042` não promovido pela classe-alvo; entrada sem pontos
conhecidos e sem `UNENFORCED` reprova.

### `D2-SL-A-01-COMPILE-FAIL` — supersessão parcial dos testes obrigatórios

**Origem:** achado **R7-02**. A revisão independente R7 bloqueou o Slice porque
`TESTES_OBRIGATORIOS` do challenge inclui `compile-fail cruzado` e a bateria executada não o
continha. R7 estava correto sob o challenge então vigente.

**Evidência levantada:** a materialização do `SL-A-01` é JavaScript ESM puro — não há `.ts`,
`.d.ts`, `tsconfig.json` nem `jsconfig.json` na lane, nem `package.json` na raiz; e `grep` por
`TypeScript`/`tsc`/`compile-fail` no `PLAN_A_FOUNDATIONS.md` não retorna nada. Os "tipos" do
Slice são **descritores de dados congelados** `{nome, familia, marca}`, não valores de um sistema
de tipos: não existe operação de atribuição que possa reprovar em compilação, porque não existe
compilação.

**Decisão (Codex Decisor, `RESULTADO: DISCORDO` da posição do Claude, `CONFIANCA: ALTA`;
thread `019ffe26-13fd-70d3-9d0a-025d8beb168b`):** `compile-fail cruzado` fica
**`NOT_APPLICABLE`** a esta materialização. Não é `PASS` e não é `SKIP`. A posição do Claude era
implementar nominalidade em runtime (opção B); foi recusada por acrescentar semântica e API não
exigidas pelo contrato, com garantia diferente da pedida. Consenso formado na alternativa.

**Vinculante a partir daqui:**

- nenhuma mensagem do Slice pode prometer garantia estática — a distinção entre tipos é provada
  como **distinção e detecção de colisão de descritores** (`TYPE-04a/b/c/f/g`), garantia de dado;
- proibido introduzir `.d.ts`, JSDoc nominal, `tsconfig`/`jsconfig`, manifesto npm ou dependência;
- se uma API de valores tipados for autorizada no futuro, ela exige decisão própria e
  `compile-fail` próprio — não herda esta supersessão nem entra por outro Slice.

**A metade que não foi supersedida:** o item 5 do challenge pedia fixture de *compilação **ou
importação*** negativa. A importação não depende de compilador e permanecia não executada —
`TYPE-05a/b/c` inspeciona o conteúdo dos descritores, então um módulo canônico continuaria verde
importando um SDK de fornecedor no topo. Implementada como **`TYPE-09`**, e endurecida em duas
rodadas seguintes que atacaram justamente ela.

Formulação atual, calibrada em `R9-02` — **inspeção léxica**, não resolução de grafo:

- `TYPE-09a` a fonte precisa existir; sem ler o módulo não há afirmação sobre imports;
- `TYPE-09b/c` especificador literal começa com `./`, sem `..` e sem vocabulário de fornecedor;
- `TYPE-09d` chamada dinâmica cujo argumento não seja **um único literal** reprova;
- `TYPE-09e` **toda** ocorrência de `import`/`require`/`export … from` precisa cair numa forma
  reconhecida — forma desconhecida reprova em vez de virar ausência de dependência.

**O que `TYPE-09` prova, com o nome exato — calibrado em `R10-01`:** a **superfície textual de
import** dos três módulos. **Não** prova ausência de dependência externa. Contraexemplo medido pela
revisão, JavaScript válido e sem nenhum dos keywords:

```js
const fs = process.getBuiltinModule('node:fs');
```

Ele carrega o builtin de fato e atravessa `TYPE-09` com zero falhas. Enumerar mecanismos de
aquisição (`globalThis`, `createRequire`, `eval`, …) seria lista de negação — incompleta por
construção, que é a lição da R4. Classes honestas:

| Propriedade | Classe |
|---|---|
| superfície textual de import | `DETECTIVE` — provada |
| aquisição sem keyword | `UNKNOWN` — não provada, e não alegada |

Também **não** está provado: o que um arquivo `./` alcança por sua vez (sem resolução de grafo); e
a remoção de comentário é regra estreita (guarda `[^:]` para `https://`), não um lexer. Falso
positivo conhecido, aceito: `const palavra = 'import';`, `{ import: 'interno' }` e `objeto.import`
seriam marcados como não classificados — nenhum módulo atual usa essas formas.

**Sabotagens: 13** — pacote npm, builtin `node:`, subida `../`, vocabulário de fornecedor em
caminho relativo, `import()` dinâmico literal, fonte ausente, fonte parcial (R7); `import(p)` com
variável, concatenação de strings, `require(n)` com expressão (R8); comentário de linha entre
`import` e `(`, nome importado como string, `export … from` com nome entre aspas (R9).

**Controles de parser: 4** — `TYPE-PARSER-01` 12/12, `TYPE-PARSER-02` 9/9, `TYPE-PARSER-03` 11/11,
`TYPE-PARSER-04` 14/14. Os dois últimos medem as **duas direções**: forma desconhecida tem de ser
pega, e forma legítima do repositório não pode ser marcada como desconhecida — inclusive a palavra
"import" em prosa de comentário, que existe de fato no cabeçalho de `index.mjs` e seria o falso
positivo mais provável.


---

## 6h — `P1 ACCEPTANCE SWEEP` e os gaps reais de release

Mesmo método do sweep P0: resolver o critério a partir do que já existe, ler o que a suíte dirigida
**de fato** cobre, e chamar de gap a diferença. Sem escrever requisito novo.

### Quadro de aceitação

| Prioridade | Total | `DONE` | `PARTIAL` | `BLOCKED` | `DESCONHECIDA` |
|---|---|---|---|---|---|
| `P0_RELEASE_BLOCKER` | 11 | 11 | 0 | 0 | 0 |
| `P1_MVP_REQUIRED` | 11 | 8 | 2 | 1 | 0 |
| `P2_POST_LAUNCH` | 5 | 0 | 0 | 0 | 5 |

P2 permanece `DESCONHECIDA` por declaração, não por descuido: o mandato era P0, o P1 foi extensão, e
inventar aceitação para o que ninguém avaliou seria pior que registrar o desconhecido.

### Dois critérios que EU tinha declarado errado

Não foram gaps do produto — foram defeitos do instrumento, e a diferença importa porque um critério
errado mede o caminho errado e reprova código correto.

- **`ESTOQUE`** dizia "baixa ao **concluir** serviço". O gatilho real é registro/aprovação; conclusão
  não dispara nada.
- **`PONTO`** exigia "banco de horas" por esse nome e "antifraude" sem dizer o quê. O banco de horas
  existe como `calcularDia`/`resumoMes`; o antifraude real é `BatidaPonto.em` ser timestamp do
  **servidor** mais geo/selfie capturados para conferência — não rejeição automática, que o
  repositório não implementa e exigir seria inventar requisito.

`OBSERVABILIDADE` lia `NAO_INICIADO` tendo `/health`, logger com redação e Sentry montados: a entrada
não declarava artefato nenhum e o status deriva do que se declara. Feature subdeclarada lendo como
não iniciada é observação falsa. O registry ganhou os campos `u` (suíte de unidade, separada da de
integração de propósito) e `s` (módulo de `services`/`utils`/`config`, porque backend nem sempre é
rota).

### Quatro gaps `VERIFICATION` abertos e fechados na mesma frente

`aprovacao_rejeicao_estoque.test.js` (10), `health_operacional.test.js` (6) e
`inbound_idempotencia.test.js` (7) — 23 casos contra PostgreSQL real, controle positivo antes do
negativo em todos.

- **`GAP-APV-01`** fechado: rejeição tinha só o negativo cross-tenant. Um endpoint que recusasse
  **toda** rejeição passaria naquele teste.
- **`GAP-WPP-01`** fechado, com dois limites registrados em vez de escondidos: a guarda é
  **fail-open** sem Redis, e evento sem `key.id` a pula inteira — que é justamente como a suíte
  antiga montava os eventos, então aquela linha nunca havia sido executada.
- **`GAP-OBS-01`** fechado: `/health` não tinha teste nenhum, e é dele que o `HEALTHCHECK` do
  Dockerfile depende. O ramo degradado nunca roda sozinho, porque em teste o banco está sempre de pé.
- **`GAP-EST-01`** fechou a parte de verificação e **abriu** o que ela escondia — ver abaixo.

### `GAP-EST-02` — o gap funcional que só apareceu ao escrever o teste

A baixa de estoque na **aprovação** é inalcançável pela API. `servicos.js:269` exige serviço
`pendente` **com** materiais, e nenhum caminho produz essa combinação: funcionário pode ficar
`pendente` mas tem `materiais` forçado a `[]`; gestor pode mandar material mas nasce `ativo`;
`/aprovar` não lê corpo. O comentário da própria rota manda "registre-os na aprovação" — caminho que
a aprovação não oferece.

A suíte de unidade passava porque testa a função, e a função está certa. Errado é o caminho que
deveria chamá-la — e só integração revela isso.

### `D-EST-02` — decisão material, em consenso com o Codex Decisor

Thread `01a0278a-aae2-7bd1-bb35-13c67519170d`. Posição do Claude: opção B (funcionário declara
materiais no registro, baixa continua na aprovação). Veredito: `DISCORDO`, aceitando B **com duas
restrições** — ambas fechando furo que o Claude não tinha visto:

1. Materiais do funcionário **só** quando `empresa.aprovacaoServico` estiver ligada. Sem isso o
   serviço nasce `ativo` e `servicos.js:231` daria baixa por ação do próprio funcionário, sem gestor
   nenhum no caminho. B incondicional **reduzia** proteção.
2. Transição `pendente → ativo` **atômica** (`updateMany` filtrando `{ id, empresaId, status:
   'pendente' }`), porque tornar `L269` alcançável expõe uma corrida de dupla aprovação já existente
   — duas aprovações concorrentes dariam duas baixas.

Claude aceitou a alternativa; consenso formado sem árbitro. Escopo: `servicos.js` e a suíte
correspondente. Sem schema, sem migration, sem RBAC, sem tocar em `services/estoque.js`.

**Não fechado por esta decisão:** `NovoServicoFuncionario.jsx` não envia `materiais`. O fluxo do
painel continua aberto; isto fecha a alcançabilidade pela API.

### Fila real de release

| Gap | Impacto | Feature | Estado |
|---|---|---|---|
| `GAP-EST-02` | `FUNCTIONAL` | `ESTOQUE` | em correção sob `D-EST-02` |
| `GAP-OBS-02` | `OPERATIONAL` | `OBSERVABILIDADE` | aberto |
| `GAP-STG-01` | `EXTERNAL_BLOCKER` | `STAGING` | **exige decisão do usuário** |

`GAP-STG-01` é `BLOCKED` por **autoridade**, não por dificuldade: "deploy reproduzível" e "rollback
provado" exigem executar deploy e promoção de ambiente, que a instrução vigente não autoriza. Não
dividi a feature para arrancar um pedaço executável — um checklist escrito sem execução seria
documento, não prova.

### Defeito do próprio instrumento, registrado sem reconstrução

`ADMAI-P1-SWEEP` foi declarada, verificada `MATCH` e **não está no histórico**: `declarar.mjs`
sobrescrevia declaração viva sem arquivar. Um gate cujo registro pode ser apagado pela próxima
escrita não é registro. A recorrência foi fechada (arquiva antes, e recusa se não conseguir); a
lacuna histórica **não** foi reconstruída.


### Dois erros de processo desta rodada, registrados sem suavizar

**Editei `servicos.js` com a bateria de integração rodando.** Vitest importa cada arquivo de teste
quando chega nele: suítes que importaram antes da escrita viram um código, as de depois viram outro.
O resultado daquela corrida não era evidência de nada. Foi descartado e a bateria reiniciada — não
aproveitado "porque a mudança era cosmética". Cosmético não é argumento de verificação.

**A bateria seguinte deu 1 falha em 270**, em `me_metricas.test.js`, no caso multi-tenant. O cursor
apontava a linha do `it(` — assinatura de **timeout**, não de asserção. `testTimeout` é 20s e os
helpers desse arquivo são pesados de bcrypt: isolado, 4 casos levam 74s. A corrida que falhou levou
1023s; a seguinte, limpa, 878s.

Reexecutado: **40 arquivos, 270 testes, exit 0**. Portanto a falha era flake sob carga — carga que
esta frente aumentou. Não é "nada": uma suíte que cai 1 em 2 execuções sob carga é fragilidade real
de verificação, e fica registrada com a assinatura exata para não ser redescoberta como mistério.
Não foi corrigida aqui porque corrigir `testTimeout` ou os helpers é escopo próprio.
