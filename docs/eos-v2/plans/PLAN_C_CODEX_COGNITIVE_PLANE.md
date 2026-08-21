# PLAN-C — Codex Cognitive Plane (MAR-P9 + MAR-P10)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-09

> Nada aqui está implementado. Marcações: `OBSERVED` (comando/arquivo/saída), `INFERRED`,
> `PROPOSED`, `UNKNOWN`. Nenhum componente é `IMPLEMENTED`, `OPERATIONAL` ou `PROVEN`.

---

## A. Escopo

Projetar o adapter do Codex (`MAR-P9`) e o plano cognitivo (`MAR-P10`) como **consumidores** do
Kernel. Nenhum processo iniciado, nenhuma config mutada, nenhuma autoridade nova concedida.

## B–C. Importações

`PLAN_A_EXPORT_CONTRACT` e `PLAN_B_EXPORT_CONTRACT` integralmente. Preservados: as seis
`EnforcementClass` e `MAR-INV-025`; o modelo de capability de sete estados; provenance de nove
categorias; `MAR-INV-026` (evento aceito ≠ ação autorizada); `MAR-INV-027` (Kernel opera sem
provider); domínios de verdade; `CognitiveCapsule` como artefato do PLAN-A.

Do PLAN-B, consumidos sem recriar: Journal, Projections, Plan Compiler, Scheduler, Authority
Validator, Recovery, Side Effect Coordinator, Leases.

## D. Findings atribuídos

| Finding | Onde é tratado |
|---|---|
| `F-MAR-002` | §L — envelope específico do Codex |
| `F-MAR-008` | §AN–§AO — rate limit e fallback |
| `F-MAR-009` | §N — oráculo de isolamento A→B |
| `F-MAR-010` | §O — probe e política de memória nativa |
| `F-MAR-018` | §J — invalidação de capability |
| `F-MAR-019` | §AL — fronteira de injeção |
| `F-MAR-020` | §AR — telemetria só onde mensurável |
| `F-MAR-030`, `F-MAR-041` | §J–§M — `DISCOVERED ≠ PROVEN` e escopo do sandbox |
| `F-MAR-031` | §AK — autoridade nunca vem do payload |
| `F-MAR-032` | §AK — validação de namespace |
| `F-MAR-033` | §BF — downgrade de provider |
| `F-MAR-035` | §AA — `PLAN_PROPOSAL ≠ ExecutionGraph` |
| `F-MAR-040` | §BC — grafo de implementação |

## E–F. Premissas e não-objetivos

Premissas congeladas dos planos anteriores. **Não-objetivos:** adapter implementado, processo do
Codex, mutação de MCP/launcher/`CODEX_HOME`, instalação de plugin ou skill, desativação do MCP legado
(é do PLAN-F), qualquer código de produto.

## G. Papel do Codex

`CODEX = COGNITIVE PLANE`. Responsável por compreensão, raciocínio arquitetural, propostas de plano,
decisões técnicas delegadas, análise de impacto, raciocínio sobre contratos, contestação adversarial,
análise de causa raiz e revisão independente.

**Não é:** Governor, Scheduler, autoridade sobre `ExecutionGraph`, writer de filesystem, worker de
implementação, autoridade de Verification ou de Environment Gate.

**`MAR-INV-031` — output do Codex nunca é estado autorizado.** Todo output é `PROPOSAL`, `ANALYSIS`,
`DECISION_CANDIDATE`, `REVIEW` ou `HYPOTHESIS` até passar pelo componente do EOS competente.

---

## H–I. Fronteira do provider e adapter

Somente `CodexRuntimeAdapter` conhece comandos, protocolo, IDs de thread, erros, telemetria, pedidos
de aprovação e configuração do provider. O resto do EOS usa tipos canônicos do PLAN-A.

**Interface, com cada método questionado (§7):**

| Método | Veredito |
|---|---|
| `start · handshake · capabilities · createSession · send · stop` | **Mantidos** — núcleo mínimo |
| `health` | **Fundido em `capabilities`** — o handshake já retorna estado; método separado duplicava |
| `resumeSession` | **Mantido**, mas §Q: provider poder retomar ≠ EOS dever retomar |
| `stream` | **Mantido**, com normalização (§AQ) |
| `interrupt` | **Mantido** — §AP lista sete gatilhos reais |
| `rateLimitStatus` | **Fundido em `capabilities`** — é estado de disponibilidade, não método próprio |
| `usage` | **Mantido**, condicional a exposição real |
| `revalidateCapabilities` | **Mantido** — `F-MAR-018` |

Resultado: **oito métodos**, não treze.

## J–K. Modelo e matriz de capability

Sete estados do PLAN-A. Uma flag anunciada pelo CLI produz no máximo `DISCOVERED`.

| Capability | Estado | Probe | Oráculo positivo | Oráculo negativo | Bloqueia |
|---|---|---|---|---|---|
| Processo independente | `DISCOVERED` (`OBSERVED`: `codex-cli 0.144.1` no PATH) | iniciar em fixture | responde ao handshake | — | P9 |
| **Read-only — shell** | `DISCOVERED` | `-s read-only` | comando de leitura funciona | **tentativa de escrita via shell falha** | P9 |
| **Read-only — ferramenta de arquivo** | **`UNKNOWN`** | ver §M | leitura funciona | **tentativa de edição por ferramenta falha** | **P9 — `F-MAR-041`** |
| Isolamento de estado por repo | `UNKNOWN` | §N | A não vaza para B | contexto de A visível em B | P9 |
| Memória nativa | `DISCOVERED` (`OBSERVED`: `memories_1.sqlite`) | §O | desligável | reaparece após restart | P9 |
| Sessão/thread e resume | `UNKNOWN` | criar, parar, retomar | contexto preservado | retoma sob snapshot obsoleto | P9 |
| Rate limit informado | `UNKNOWN` | provocar limite | estado exposto | silencioso | P10 |
| Telemetria de uso | `UNKNOWN` | inspecionar resposta | contagem exposta | ausente → `UNAVAILABLE` | P10 |
| Aprovação | `UNKNOWN` | pedir operação sensível | pedido chega ao adapter | **auto-concedida sem chegar** | P9 |
| `--strict-config` | `DISCOVERED` | config inválida | erro | aceita silenciosamente | P9 |

## L–M. Envelope de segurança do Codex

`CodexSecurityContext`: `repositoryId · runId · runtimeId · sessionId · role · snapshotRef ·
allowedEvidenceScope · toolPolicy · filesystemPolicy · networkPolicy · environmentPolicy ·
authorityPolicy`. **Nunca transporta secret.**

Postura pretendida: `READ_ORIENTED`, escrita em produto/repositório `DENIED` — classificado como
**`POLICY INTENT`**, não enforcement, até prova.

**Prova de read-only exige duas variantes (`F-MAR-041`).** `OBSERVED`, texto literal:
`-s, --sandbox` — *"Select the sandbox policy to use when executing **model-generated shell
commands**"*. O escopo é shell. A ferramenta de edição de arquivo do agente é caminho **distinto** e
não coberto por essa flag.

Procedimento, ambas as variantes: fixture isolada → snapshot → iniciar sob modo pretendido →
solicitar tentativa controlada de alteração → verificar filesystem, Git, exit code e output →
comprovar ausência de escrita → registrar Evidence. Escrita ocorrida → `CAPABILITY_CLAIM_REFUTED`.

**Defesa em profundidade (§15), independente do resultado:** o EOS não entrega Slice mutável ao
Codex, não o trata como executor, valida todo output antes de materializar ação, e não converte
aprovação do provider em aprovação do EOS.

## N–O. Isolamento e memória

**Oráculo de isolamento:** Codex trabalha em `Repository A`; depois inicia em `B`; testa se `B`
observa sessão, goal, memória, contexto, artefato ou estado de `A`. Vazamento →
`F-MAR-009 CONFIRMED_RUNTIME`, e **bloqueia integração ativa**.

**Estratégia de `CODEX_HOME` — `PENDING_MAR_P9_PROBE`**, três alternativas ordenadas:

| | Estratégia | Preferência |
|---|---|---|
| A | Identidade compartilhada + estado por repositório suportado pelo provider | **PREFERRED** se o probe confirmar |
| B | Material de auth compartilhado + perfil de estado isolado/efêmero | **FALLBACK** |
| C | Perfil totalmente isolado por repositório | Aceitável; custo de duplicação de auth |

**`MAR-INV-023A`** preservado: identidade compartilhada **não** implica contexto compartilhado.

**Memória nativa:** probe descobre o que existe, se desliga, se escopa, quem escreve, quem lê, e se o
resume depende dela. Estados: `DISABLED` (padrão pretendido) · `ISOLATED_NON_AUTHORITATIVE` ·
`UNAVOIDABLE_BUT_CONTAINED` · `UNSAFE` · `UNKNOWN`. Nenhuma memória nativa é fonte de decisions,
invariants, arquitetura, política de produto, riscos, contratos ou findings — o Knowledge System é
autoritativo.

## P–Q. Sessões

Um processo do Codex hospeda várias sessões; cada sessão serve papéis. **Não** há processo por papel.

Estratégia inicial mínima: `Run-scoped` (arquitetura, plano) · `Task-scoped efêmera` (decisão) ·
`Finding-scoped` (causa raiz) · `Snapshot-scoped` (review). Quatro escopos, não oito.

Estados: `SESSION_VALID · REQUIRES_REFRESH · STALE · INVALID`. Invalidam: mudança de snapshot,
supersessão de decisão ou arquitetura, upgrade do provider, mudança de política, invalidação de
capability, troca de repositório.

**`MAR-INV-032` — provider poder retomar sessão ≠ EOS dever retomar.** O EOS valida snapshot,
autoridade e contexto antes de aceitar resume.

## R–U. Cápsula, contexto e evidência

`CognitiveCapsule`: `runId · repositoryId · snapshotRef · role · goal · question · authorityEnvelope ·
relevantDecisions · relevantInvariants · relevantEvidence · architectureRefs · impactRefs ·
contractRefs · findingRefs · testRefs · resourceBudget`. **Nenhum campo é preenchido por padrão** —
cada um entra quando o papel o exige.

Orçamentos relativos: `MINIMAL → STANDARD → EXPANDED → ESCALATED`. Sem limite absoluto de token
congelado sem evidência.

Escalada: cápsula mínima → Codex devolve `NEEDS_EVIDENCE`/`NEEDS_CONTEXT` → EOS avalia → refs
adicionais → próximo turno. **Nada é enviado preventivamente.**

**Evidência:** `Codex → EVIDENCE_REQUEST → Evidence Broker → Tool Router → EvidenceRecord → Codex`.
**Leitura direta do repositório pelo Codex: não permitida na primeira versão** — não há benefício
que o Broker não entregue, e leitura direta escaparia de provenance, snapshot binding e logging.

## V–X. Superfície de ferramenta, plugin e skills

**`MINIMUM_SET`:** `eos.evidence.request` · `eos.knowledge.query` (decisões, invariantes, riscos numa
única consulta parametrizada) · `eos.symbol.query`.
**`DEFERRED`:** `eos.impact.query` · `eos.contract.query` · `eos.testRegistry.query` — entram quando
o papel condicional correspondente for ativado.
**`REJECTED`:** `eos.decision.query`, `eos.invariant.query`, `eos.architecture.query`,
`eos.finding.query`, `eos.resource.query` — todos redundantes com `eos.knowledge.query`
parametrizado; superfície separada seria custo sem ganho.

**Plugin: `NOT_JUSTIFIED_YET`.** Contrato de papel + protocolo do adapter cobrem o comportamento
necessário. Criar plugin porque o provider suporta plugin é adotar mecanismo sem problema.

**Skills:** cada uma com `skillId · skillVersion · protocolCompatibility`, pinadas no
`RUN_RUNTIME_MANIFEST`. **`Role ≠ Skill`** — papel é conceito do EOS; skill é uma implementação
possível no provider. Isso evita lock-in.

## Y–AI. Papéis — consolidação

Nove responsabilidades, **quatro papéis permanentes**:

| Responsabilidade | Disposição |
|---|---|
| `contextCurator` | **Movido ao Kernel** como **Deterministic Context Broker**. Seleção de contexto é lookup de dependência e filtro de artefato, snapshot e autoridade — não exige raciocínio semântico |
| `architect · planner · decisionAnalyst · challenger` | **Permanentes** — quatro contratos de saída distintos |
| `impactAnalyst` | **Condicional** — Impact Graph e Dependency Graph já existem (`OBSERVED`); só aciona quando falta aresta |
| `contractAnalyst` | **Condicional** — só com boundary material |
| `reviewer` + `rootCauseAnalyst` | **`ROLE_CONSOLIDATION`** — mesmo mecanismo, **dois contratos de saída preservados**: Reviewer é ligado a snapshot e diff; Root Cause é ligado a Finding ao longo de tentativas |

**Contratos de saída:**

`Architect` → `ARCHITECTURE_PROPOSAL` (`proposalId · snapshotRef · goal · boundaries · dependencies ·
alternatives · selectedRecommendation · rejectedAlternatives · tradeoffs · assumptions · risks ·
evidenceRefs · decisionRefs · invariantRefs · confidence`). Nunca `ARCHITECTURE_APPROVED`. Proibido:
editar código, migration, alterar decisão do usuário ou invariante, declarar Verification, gerar
grafo autoritativo.

`Planner` → `PLAN_PROPOSAL` (nodes, arestas, donos sugeridos, paralelismo sugerido, necessidades de
contrato e verificação, riscos, premissas, refs). **`suggestedParallelism ≠ decisão do Scheduler`** —
o Codex diz que A e B *parecem* independentes; o EOS decide se podem executar juntos.

`Decision Analyst` → `D1_DECISION_PROPOSAL` ou **`CODEX_DECISION_UNCERTAIN`**. Campos: pergunta,
recomendação, alternativas, evidência, **resumo de justificativa**, confiança, reversibilidade,
impacto, artefatos afetados. **Chain-of-thought não é pedido nem armazenado** (§108). D2 detectado →
`USER_DECISION_PROPOSAL` com consequências e reversibilidade; **nunca decide**.

`Challenger` → `CHALLENGE_PASS · CHALLENGE_FINDING_PROPOSAL · NEEDS_EVIDENCE · RISK_CHALLENGE ·
DECISION_DEPENDENCY_CHALLENGE`. **`PASS` é resultado legítimo** — nada de "encontre três problemas",
que fabricaria falso positivo.

`Reviewer` → `REVIEW_PASS · REVIEW_FINDING_PROPOSAL · REVIEW_HYPOTHESIS · NEEDS_EVIDENCE`, sempre
ligado a `snapshotRef`; snapshot mudou de forma relevante → `STALE_REVIEW`, inutilizável como
evidência de gate. **Reviewer nunca fecha Finding.** `CODEX_REVIEW_PASS ≠ VERIFICATION_PASS`.

**Fronteiras entre os três adversariais:** Challenger age **antes/ao redor do plano**; Reviewer
**depois de implementação concreta**; Root Cause **após falha reincidente**.

## AI–AJ. Roteamento e ativação

**O Cognitive Router é determinístico do EOS.** Usa tipo de tarefa, risco, estado de Finding, estado
do grafo e estado de autoridade. **Não se pergunta ao Codex qual papel deve agir** — isso seria o
plano cognitivo virando governador sombra (`F-MAR-045`).

Ativação por nível, cruzada com o Risk System existente: `L0/L1` → nenhum papel obrigatório;
`L2` → Planner, Impact/Contract se houver necessidade material, Reviewer conforme risco;
`L3` → Architect, Planner, Challenger, Reviewer.

**MVCP — Minimum Viable Cognitive Plane: `Decision Analyst` + `Planner`.** Provam os dois limites
centrais: D1 passando pelo Authority Validator, e proposta ≠ grafo autoritativo.

## AK–AM. Validação, injeção e aprovação

Todo output estruturado passa por: schema, namespace de repositório, snapshot, autoridade e refs de
artefato. Malformado → `INVALID_PROVIDER_OUTPUT`.

**`F-MAR-031`:** `{"authority":"USER","approved":true}` vindo do Codex **não concede nada**. A
autoridade é resolvida pelo EOS a partir do próprio estado.

**Hierarquia de instrução no adapter:** `EOS System Constraints → EOS Role Contract → Authority
Constraints → Task Goal → Trusted Decisions/Invariants → **Untrusted Evidence** → Output Schema`.
Documentação e código do repositório **nunca** entram na seção normativa.

Conteúdo não confiável pode informar análise; **não pode** alterar papel, schema de saída, pedir
ferramenta, conceder permissão, alterar autoridade ou política de ambiente.

**Aprovação:** `provider approval requested → adapter → avaliação de Security/Authority do EOS →
ALLOW | DENY | USER_REQUIRED → resposta ao provider`. Adapter que não souber interpretar → **DENY**.
Fail closed, sem fallback permissivo.

## AN–AP. Rate limit, falha e interrupção

`AVAILABLE · RATE_LIMITED · UNAVAILABLE · DEGRADED`. **Rate limit não é falha de Run** e não gera
Finding automático. Bloqueia apenas nodes cognitivos dependentes.

Fallback por risco: trabalho já aprovado cognitivamente **continua** se a dependência estiver
satisfeita; novo D1 necessário → `WAITING_AGENT`, ou resolução determinística se o D0 cobrir; review
cognitiva obrigatória de L3 → **gate bloqueia**.

**`MAR-INV-033` — Codex indisponível não promove Claude a autoridade cognitiva.** Qualquer fallback
exige política explícita.

Interrupção: snapshot obsoleto, D2 descoberto, Run cancelado, tarefa cognitiva crítica de prioridade
maior, violação de segurança, provider descontrolado, orçamento excedido.
Cancelamento distingue `TURN_CANCELLED · SESSION_CANCELLED · ROLE_TASK_SUPERSEDED · RUN_CANCELLED`.

## AQ–AS. Streaming, recursos e H-MAR-001

Eventos normalizados: `TURN_STARTED · TOOL_REQUEST · TOOL_RESULT · TURN_COMPLETED · TURN_FAILED ·
USAGE_UPDATED`. **`PROGRESS` descartado** — é observabilidade transitória sem consumidor durável.

**Output cru do provider nunca vai integralmente ao Journal.** Persiste-se artefato normalizado;
o stream é efêmero. Evita persistência de secret, explosão de contexto e acoplamento a provider.

Recursos, só onde mensurável: turnos, uso de entrada/saída/cache, tempo, pedidos de ferramenta e de
evidência, bytes de contexto, contagem de sessões, duração de rate limit. `MEASURED · ESTIMATED ·
UNAVAILABLE`. **Token não vira crédito; crédito não vira custo.**

Métricas preparadas para `H-MAR-001` (não testadas agora): Codex Decision Yield, Unique Finding
Yield, Cognitive Offload, Evidence Reuse, Replan Rate, Context Consumption, Coordination Overhead.

## AT. Comparação com o MCP legado

O MCP atual é **caminho legado, comparação e rollback** — não arquitetura do novo adapter. Estados
`LEGACY_AVAILABLE · LEGACY_FALLBACK · LEGACY_DISABLED`; **o PLAN-C não desativa nada**.

Matriz futura por garantia: `Guarantee · Legacy Enforcement · New Intended Enforcement ·
EnforcementClass · Capability State · Probe · Result · Regression?`. `F-MAR-002` só é comprovado em
runtime quando essa matriz passar **sem regressão**.

## AU–AX. Testes e cenários

`MAR-P9`: `CX-BOOT-* CX-CONF-* CX-CAP-* CX-SEC-* CX-ISO-* CX-MEM-* CX-RATE-* CX-SESSION-* CX-USAGE-*`.
`MAR-P10`: `CX-ARCH-* CX-PLAN-* CX-DEC-* CX-IMPACT-* CX-CONTRACT-* CX-CHALLENGE-* CX-RCA-*
CX-REVIEW-* CX-CONTEXT-* CX-ROUTER-*`.

**Os 15 cenários adversariais da §131:**

| # | Cenário | Representação |
|---|---|---|
| 1 | Codex afirma autoridade D2 | payload ignorado; autoridade resolvida do estado (`F-MAR-031`) |
| 2 | README tenta mudar papel | conteúdo entra como evidência não confiável; papel vem do contrato |
| 3 | Read-only ainda escreve via shell | `CAPABILITY_CLAIM_REFUTED`; bloqueia P9 |
| 4 | Estado de A aparece em B | `F-MAR-009 CONFIRMED_RUNTIME`; bloqueia integração ativa |
| 5 | Memória nativa reaparece após restart | probe classifica `UNSAFE` ou `UNAVOIDABLE_BUT_CONTAINED` |
| 6 | Rate limit no meio do planning | `WAITING_AGENT`; Run não falha |
| 7 | Resume possível, snapshot obsoleto | `SESSION_STALE` — `MAR-INV-032` |
| 8 | Planner gera ciclo | Plan Compiler → `DEPENDENCY_CYCLE` |
| 9 | Reviewer tenta fechar Finding | negado; só Verification fecha |
| 10 | Challenger inventa defeito | `PASS` é saída legítima; sem cota de achados |
| 11 | Ferramenta fora do envelope | negada pelo `toolPolicy`; fail closed |
| 12 | Provider muda de versão no Run | `CAPABILITY_REVALIDATION_REQUIRED` + manifesto |
| 13 | Skill atualizada muda semântica | `skillVersion` pinada; verificada ao criar sessão (`F-MAR-043`) |
| 14 | Texto válido, schema errado | `INVALID_PROVIDER_OUTPUT` |
| 15 | Análise registrada como Evidence | impedido no **construtor** do artefato (`F-MAR-044`) |

**`MAR-INV-034` — análise do modelo não é evidência sobre o runtime ou o repositório.** Provenance:
`MODEL_ANALYSIS · MODEL_PROPOSAL · MODEL_HYPOTHESIS · MODEL_REVIEW`, jamais `OBSERVED_EVIDENCE`.

## AY. Revisão de simplicidade

**Cortados:** `contextCurator` como LLM · `health` e `rateLimitStatus` como métodos · cinco
ferramentas redundantes · plugin · `PROGRESS` no stream · quatro escopos de sessão em vez de oito ·
leitura direta do repositório · dois papéis fundidos num mecanismo.

**Mantido apesar de parecer excesso:** os quatro papéis permanentes — cada um tem contrato de saída e
momento de ativação distintos; e as duas variantes do oráculo de read-only, porque `F-MAR-041`
mostrou que uma não cobre a outra.

## AZ. Findings novos

| ID | Achado | Severidade | Bloqueia PLAN-C? | Owner |
|---|---|---|---|---|
| **`F-MAR-041`** | **Escopo do sandbox.** `--sandbox` cobre *model-generated shell commands*; o caminho de ferramenta de arquivo é distinto e não coberto. Read-only exige **duas** provas | HIGH | Não | MAR-P9 |
| **`F-MAR-042`** | Aprovação auto-concedida por config do provider **nunca chega ao adapter** — o EOS não veria a decisão. O probe precisa confirmar que o modo de aprovação exige interação | HIGH | Não | MAR-P9 |
| **`F-MAR-043`** | Versão de skill precisa ser verificada **ao criar sessão**, não só ao iniciar o Run — senão uma atualização muda semântica no meio | MEDIUM | Não | MAR-P10 |
| **`F-MAR-044`** | Análise virando Evidence por convenção é frágil; a proibição precisa estar no **construtor** do artefato, não na disciplina de quem escreve | MEDIUM | Não | MAR-P2/P10 |
| **`F-MAR-045`** | Se o Router perguntar ao Codex qual papel acionar, o plano cognitivo vira governador sombra | HIGH | Não | MAR-P10 |

`F-MAR-041` é a segunda correção da mesma alegação minha do `MAR-P1`: `F-MAR-030` corrigiu o **grau**
(`DISCOVERED`, não `PROVEN`); este corrige o **escopo**.

## BA–BB. Change requests

**`PLAN_A_CHANGE_REQUEST`: nenhum.** **`PLAN_B_CHANGE_REQUEST`: um.**

> **`PBCR-001`** — o `Deterministic Context Broker` (§Y) é componente do **Kernel**, não do plano
> cognitivo. O PLAN-B não o previu. Motivo: seleção de contexto é determinística e não deve custar
> uma chamada de modelo. Artefato afetado: contrato do Kernel. Impacto de compatibilidade:
> **aditivo** — nenhum contrato existente muda.

## BC. Grafo de implementação

```
                    Adapter interface mapping
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
   lifecycle   security   isolation   memory    approval
     probe       probe      probe      probe     probe      ← paralelos
        └──────────┴──────────┼──────────┴──────────┘
                              ▼
                       capability model
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
          transport adapter        security adapter
                  └───────────┬───────────┘
                              ▼
                     conformance tests          ← fecha MAR-P9
                              │
                              ▼
              Deterministic Context Broker (PBCR-001)
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
          Decision Analyst            Planner        ← MVCP
                  └───────────┬───────────┘
                              ▼
                    Cognitive Router (determinístico)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
          Architect      Challenger     Reviewer/RootCause
              │               │               │
              └───────────────┴───────────────┘
                              ▼
              Impact · Contract (condicionais)
                              ▼
                   resource instrumentation
```

Os cinco probes são **paralelizáveis** — não há dependência entre eles. O MVCP é um join de dois
papéis, não de nove.

## BD. Gates

**Planejamento:** `CODEX_ADAPTER_MODEL_READY` · `CODEX_COGNITIVE_MODEL_READY` — satisfeitos.

**Execução futura:** `CODEX_ADAPTER_OPERATIONAL` exige processo independente sem dependência do MCP,
handshake, capability model com read-only `PROVEN` **nas duas variantes**, isolamento comprovado,
memória classificada, aprovação chegando ao adapter, conformance completa.
`CODEX_COGNITIVE_PLANE_OPERATIONAL` exige MVCP funcionando, roteamento determinístico, D1 validado
pelo EOS, D2 preservado, e `REVIEW_PASS ≠ VERIFICATION_PASS` provado por teste.

## BE. `PLAN_C_EXPORT_CONTRACT`

Para **PLAN-D**: contrato do `CognitiveRuntimeAdapter` · integração do capability model ·
`CognitiveCapsule` · fronteira de segurança do Codex · contratos dos papéis · `PlanProposal` ·
`ArchitectureProposal` · `D1_DECISION_PROPOSAL` · `ImpactProposal` · `ContractProposal` ·
`ChallengeResult` · `ReviewResult` · `RootCauseResult` · protocolo de expansão de contexto · estados
de disponibilidade · hooks de recurso.

Para **PLAN-E**: semântica de review e de hipótese · fronteira de revisão independente · métricas ·
saídas dos probes de segurança e conformance.

Para **PLAN-F**: outputs de Shadow Mode · métricas de comparação · regras de ativação de D1 ·
fallback de falha do Codex · caminho de comparação com o MCP legado · critérios de Active Mode.

## BF. Dependências futuras

Escolha de `CODEX_HOME` → `PENDING_MAR_P9_PROBE` · read-only `PROVEN` nas duas variantes → MAR-P9 ·
downgrade de provider rejeitado por omissão (`F-MAR-033`) · `SnapshotId` congelado antes do MAR-P6
(herdado do PLAN-B).

## BG–BH. Git e Gate

`OBSERVED`: branch `fix/seguranca-criticos`, HEAD `30bf5453`; apenas documentação; zero runtime, zero
config, zero produto.

Os 25 critérios da §135 estão satisfeitos em planejamento.

**`PLAN_C_READY`** · `MAR-P9 PLANNED` · `MAR-P10 PLANNED`

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-D — Claude Execution Plane (MAR-P11 + MAR-P12 + MAR-P13)
```
