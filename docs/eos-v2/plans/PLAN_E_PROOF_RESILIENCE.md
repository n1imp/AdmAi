# PLAN-E — Proof + Resilience (MAR-P14 + MAR-P15 + MAR-P16)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-11

> Nada aqui está implementado. Marcações: `OBSERVED` (arquivo, linha, comando ou saída), `INFERRED`,
> `PROPOSED`, `UNKNOWN`. Nenhum componente é `IMPLEMENTED`, `OPERATIONAL` ou `PROVEN`.

---

## A. Escopo

Projetar o Proof/Verification Plane (`MAR-P14`), o Resource Accounting e a observabilidade
(`MAR-P15`), e a arquitetura de chaos e resiliência (`MAR-P16`). Nenhum runner implementado, nenhum
chaos executado, nenhum processo morto, nenhum runtime conectado.

A pergunta que este plano responde: **como o EOS saberá que uma mudança está realmente correta,
segura, íntegra e recuperável** — não como Claude ou Codex dizem que está.

## B. Contratos importados

`PLAN_A_EXPORT_CONTRACT` · `PLAN_B_EXPORT_CONTRACT` · `PLAN_C_EXPORT_CONTRACT` ·
`PLAN_D_EXPORT_CONTRACT`, integralmente.

Change requests importados e revalidados: **`PBCR-001`** (Deterministic Context Broker no Kernel) e
**`PBCR-002`** (produtor do `WriteManifest` é o Kernel). A §151 exige validar `PBCR-002` contra as
interfaces do PLAN-B: **é compatível** — os sete campos de `WriteManifest` (`sliceId ·
snapshotBefore · intendedFiles · preWriteFingerprints · observedWrites · postWriteFingerprints ·
completion`) não mudam; ganham `producer: EOS_KERNEL` e a regra de que `observedWrites` e
`postWriteFingerprints` são computados do filesystem. Aditivo, sem refinamento necessário.

Preservados sem alteração: as seis `EnforcementClass` e `MAR-INV-025`; o modelo de capability de sete
estados; provenance; as quatro idempotências; domínios de verdade e a escada
`INTENDED → ATTEMPTED → OBSERVED → VERIFIED`; `MAR-INV-027` e `MAR-INV-028`; `MAR-INV-030` a
`MAR-INV-035`; `CODEX_REVIEW_PASS ≠ VERIFICATION_PASS`; `CLAUDE_SELF_CHECK_PASS ≠ VERIFICATION_PASS`.

## C. Findings atribuídos

| Finding | Onde é tratado |
|---|---|
| `F-MAR-005`, `F-MAR-020` | §AD — hipótese multidimensional e métricas indisponíveis |
| `F-MAR-006` | §S — flaky exige política, não uma passada e uma falha |
| `F-MAR-008` | §AJ/§AK — indisponibilidade de provider não derruba Run |
| `F-MAR-011`, `F-MAR-023` | §F/§O — journal é verdade de runtime; o mundo é verdade de efeito |
| `F-MAR-012`, `F-MAR-026` | §AN — intent durável, reconciliação, ambíguo destrutivo |
| `F-MAR-015` | §W — meta-verificação |
| `F-MAR-017` | §AK — escrita parcial |
| `F-MAR-025`, `F-MAR-027` | §I/§V — coordenação e detecção, nunca contenção |
| `F-MAR-028` | §N — poluição do snapshot pela própria verificação |
| `F-MAR-030`, `F-MAR-041` | §V — promoção de `EnforcementClass` exige evidência |
| `F-MAR-034` | §X — decomposição dos gate modes |
| `F-MAR-037` | §X — lag de projeção não pode produzir PASS falso |
| `F-MAR-044` | §O — análise não vira Evidence por convenção |
| `F-MAR-046` … `F-MAR-051` | §G/§H/§I/§U/§AP — contenção, allowlist, auto-aprovação, isolamento de perfil, forja de prova, subagentes |

## D. Premissas

Congeladas dos planos anteriores e não reabertas. Acrescento uma, que o PLAN-D tornou inevitável:
**Kernel, executor e verificação rodam sob o mesmo principal de SO** nesta fase.

## E. Não-objetivos

Verification Runner implementado; chaos executado; processo morto; runtime real conectado; alteração
de Claude, Codex, launcher, MCP ou configuração de teste existente; Resource Accounting novo
implementado; código de produto; decisão de cutover (é do PLAN-F).

---

## F. Princípios do Proof Plane

```
CLAIM      ≠  EVIDENCE  ≠  PROOF  ≠  GATE
"testes passam"   comando + exit code + saída capturada
                            evidência satisfaz o TestContract
                                       todas as obrigações satisfeitas
```

**`MAR-INV-036` — nenhuma prova é aceita sem desreferenciamento.** Uma referência de evidência só
conta quando o Proof Plane **lê o artefato apontado** e confere identidade, fingerprint,
`repositoryId`, `runId` e `verificationRunId`. Referência não conferida é `CLAIM`, não `EVIDENCE`.

**`MAR-INV-037` — prova necessária a gate é executada pelo Proof Plane, não pelo implementador.**
Self-check do executor é sinal, e sinal não fecha gate.

### O achado central — `OBSERVED`

Nenhum módulo do caminho de prova do EOS V2 atual lê disco ou executa comando:

```
grep -nE "readFile|existsSync|execSync|spawn|statSync" \
     tools/eos/proof/validate.mjs tools/eos/baseline/classify.mjs
  → nenhuma ocorrência
único arquivo com child_process em tools/eos/: tools/eos/selftest/serena-probe.mjs
```

`validateLedger` decide bloqueio lendo `ledger.testsExecuted[i].result !== 'PASS'`
(`tools/eos/proof/validate.mjs:99`) — **um campo do objeto que o chamador entregou**. Nenhum
`evidenceRef` é desreferenciado (`validateEvidenceRef`, linhas 44–59, checa forma da string e nada
mais); nenhum artefato apontado é conferido; nada é reexecutado.

O sistema atual implementa **metade** da cadeia: rejeita narrativa (`NARRATIVE_ONLY`, linha 35),
exige `producedBy` em prova de comando (linha 55), exige `changedFiles` (linha 144). Tudo isso é a
fronteira `CLAIM → EVIDENCE`. **A fronteira `EVIDENCE → PROOF` não existe.**

Cruzado com `F-MAR-050` — o executor escreve estado do EOS sob a mesma conta — a resposta honesta à
primeira pergunta de falsificação da §149 é: **sim, hoje o Claude conseguiria parecer verificado.**
É `F-MAR-052`, e ele sozinho define o delta do `MAR-P14`: **desreferenciamento de evidência e
reexecução independente**, não mais validação de schema.

O que já existe e **é preservado sem reescrita**: `EVIDENCE_KINDS`, `LEDGER_FIELDS`, a rejeição de
narrativa, a exigência de Required Reviewer registrado (`validate.mjs:134-141`), a autoridade de
fechamento de Finding (`verification/findings.mjs:82`), a detecção de test overfitting
(`detectTestOverfitting`), a classificação de falha e o fingerprint com normalização.

## G. Modelo de confiança

| Ator | Confiável para | **Não** confiável para |
|---|---|---|
| `USER` | D2, aceitação de risco, autorização externa | — (soberano) |
| `EOS_KERNEL` | verdade de runtime: journal, projeções, autoridade, gate, `WriteManifest` | verdade sobre o mundo externo |
| `CODEX_PROVIDER` | propostas, análise, revisão, hipótese | qualquer estado autorizado, qualquer evidência |
| `CLAUDE_PROVIDER` | executar dentro da Capsule, produzir fatos candidatos | ser fonte autoritativa sobre o que ele mudou (`MAR-INV-035`) |
| `VERIFICATION_PROCESS` | executar e capturar de forma determinística; interpretar contra contrato | alterar produto; certificar a si mesmo (§W) |
| `REPOSITORY_CONTENT` | ser **dado** | ser norma, elevar autoridade, conceder tool |
| `EXTERNAL_TOOL` | produzir saída observável | ser autoridade sobre o que a saída significa |

**Modelo de ameaça, declarado sem eufemismo (§124):** o EOS resiste a um executor
**cooperativo-porém-falível** — que erra, confunde escopo, alucina um resultado, cai no meio da
escrita. O EOS **não** resiste a um **processo malicioso na mesma conta de SO**, que pode reescrever
journal, ledger, manifesto e artefato de verificação com as mesmas permissões do Kernel.

Isso é `KNOWN_SECURITY_LIMITATION`, entra na §AY e **não** é descrito como resolvido em nenhum ponto
deste plano.

## H. Isolamento executor/prova

As quatro estratégias da §6 **não são alternativas**; três compõem e uma é rejeitada:

| | Estratégia | Disposição |
|---|---|---|
| **C** | **Append mediado pelo Kernel** — o executor nunca escreve estado do EOS; envia `WRITE_CANDIDATE`, `FILE_MUTATION_CLAIM`, `EVIDENCE_CANDIDATE`, e o Kernel observa e registra | **A arquitetura.** É a menor forma que preserva independência: remove a *necessidade* de escrita, em vez de tentar barrá-la. Já é a forma do `PBCR-002` |
| **A** | **Estado do EOS fora da worktree executada** | **A colocação.** Tira o estado de dentro de `--add-dir`, o único lever de filesystem que o runtime Claude realmente oferece (`OBSERVED`, PLAN-D §Q) |
| **D** | **Fingerprints de integridade** | **O resíduo detectivo.** Insuficiente sozinho, necessário sempre |
| **B** | Diretório de runtime "protegido" | **Rejeitada como ilusória.** Sob o mesmo principal de SO não existe fronteira de filesystem distinta de `A`; chamar de protegido seria violar `MAR-INV-025` |

**Classe resultante: `POLICY_ENFORCED` + `DETECTIVE`. Nunca `HARD_ENFORCED`.**

## I. Matriz de acesso a estado — obrigatória (§152–§156)

`I` = acesso pretendido · `E` = `EnforcementClass` real sob um único principal de SO.

| Ator | Workspace do repo | Journal do EOS | Runtime DB / projeções | Proof store | `WriteManifest` | Artefatos de verificação |
|---|---|---|---|---|---|---|
| **Claude (executor)** | I: `READ`+`WRITE` no `allowedChangeScope` · E: `POLICY_ENFORCED` (tool) / `DETECTIVE` (shell) | I: **`NO_ACCESS`** · E: `POLICY_ENFORCED`+`DETECTIVE` | I: `NO_ACCESS` · E: idem | I: `NO_ACCESS` · E: idem | I: `NO_ACCESS` (só emite candidato) · E: idem | I: `NO_ACCESS` · E: idem |
| **Codex (cognitivo)** | I: `READ` via Evidence Broker · E: `POLICY_ENFORCED` (+ sandbox `UNKNOWN`) | I: `NO_ACCESS` | I: `NO_ACCESS` | I: **`NO_ACCESS`** — não altera Proof | I: `NO_ACCESS` | I: `READ` mediado |
| **Verification** | I: `READ` + mutação **classificada** (§N) · E: `POLICY_ENFORCED` | I: `NO_ACCESS` (emite eventos) | I: `NO_ACCESS` | I: `WRITE` de entrada do builder · E: `POLICY_ENFORCED` | I: `READ` | I: `READ`+`WRITE` |
| **Kernel** | I: `READ` + computar fingerprints | I: **autoridade** | I: autoridade | I: autoridade | I: **produtor** (`PBCR-002`) | I: `READ` |

Três consequências que o documento não suaviza:

1. Toda célula `NO_ACCESS` do executor é **intenção de política**, não isolamento. `F-MAR-050`.
2. Codex não modifica Proof, Findings nem Decision Registry — e isso é `POLICY_ENFORCED` pela
   ausência de tool de escrita, que é a defesa estrutural que o MAR-P1 já identificou como a real.
3. A verificação **precisa** mutar (§N), então "Verification não altera produto" é regra semântica
   com detecção por snapshot, não impedimento.

---

## J. Arquitetura de verificação — doze componentes viram seis

A §9 lista doze. Seis deles — `Invariant`, `Contract`, `Security`, `Integration`, `Regression`,
`Environment Verifier` — **não são classes**: são **tipos de obrigação** avaliados pelo *mesmo*
TestContract Evaluator sobre fontes de evidência diferentes. Criar seis verificadores seria seis
cópias do mesmo laço com um filtro distinto.

Componentes reais:

1. **Verification Coordinator** — recebe `ExecutionResult` + `WriteManifest` + `TestContract`, deriva
   obrigações, orquestra.
2. **Deterministic Runner** — executa e captura. Não interpreta.
3. **TestContract Evaluator** — interpreta evidência contra obrigações, por tipo.
4. **Proof Ledger Builder** — monta o ledger a partir de evidência **desreferenciada**.
5. **Gate Evaluator** — função determinística; já existe como `evaluateGate`.
6. **Meta-Verification** — prova o instrumento (§W).

## K. Deterministic Runner

```
Verification System  ≠  Command Runner
```

O Runner executa e captura: comando, diretório, ambiente, exit code, stdout, stderr, artefatos,
tempo, observação de mutação. **Não decide nada.** Interpretação é do Evaluator, contra o contrato.

Cobre, quando aplicável: testes unitários e de integração, E2E, lint, typecheck, build, scanners de
segurança, checagem de migration, checagem de invariante e de baseline.

**§15:** o executor pode invocar self-check; a prova que sustenta o gate é executada pelo Runner do
EOS, independentemente. `MAR-INV-037`.

## L. TestContract

Preservado como existe. Declara: o que deve ser provado; quais comandos ou testes podem prová-lo;
ambientes exigidos; evidência exigida; **controles negativos**; regras de baseline; requisitos de
segurança e de contrato; critérios de aceite.

**Autoridade:** Claude pode ler, implementar testes contra ele e reportar conflito. Claude **não**
pode enfraquecer, apagar, reescrever aceite, baixar severidade ou mudar prova exigida — já imposto em
`ENGINEER_FORBIDDEN` e `applyCorrectionAction` (`verification/findings.mjs:69-100`, `OBSERVED`).
**Codex também não altera o TestContract diretamente.** Conflito → `TEST_CONTRACT_CONFLICT`, roteado
ao owner, nunca alteração silenciosa.

**`ProofObligation` como tipo novo: rejeitado** (§117). O `TestContract` já declara o que provar e o
ledger já carrega `applicableInvariants` e `invariantResults`. Obrigações são **derivadas** por função
pura `deriveObligations(testContract, risk, slice)`, sem persistência. Uma terceira representação da
mesma relação seria a duplicação que a §147 manda cortar.

## M. Modelo de comando de verificação

Cada execução registra: `verificationRunId · testContractRef · command · workingDirectory ·
environment · snapshotRef · startedAt · completedAt · exitCode · stdoutRef · stderrRef ·
artifactRefs · mutationObservation · resourceRefs`.

**Nenhum 21º tipo de artefato** (§117 aplicado ao catálogo): uma execução de verificação é um
`EvidenceRecord` de `kind: 'command' | 'test'` com esses campos **obrigatórios para esses kinds**.
Extensão do schema de evidência, não do catálogo de artefatos. Saída volumosa vai para artefato
referenciado, nunca inteira no Journal.

## N. Poluição de snapshot — `F-MAR-028`

A verificação **muta**: coverage, snapshots de teste, saída de build, caches, arquivos gerados,
fixtures de banco, artefatos de browser.

`VerificationMutationPolicy` classifica cada comando: `PURE · EXPECTED_TRANSIENT_MUTATION ·
EXPECTED_PERSISTENT_ARTIFACT · UNKNOWN_MUTATION`. `UNKNOWN_MUTATION` **não roda** em contexto que
sustente gate sem classificação explícita — mesma regra do `UNKNOWN` de shell no PLAN-D.

`snapshotBeforeVerification` e `snapshotAfterVerification` são comparados. Divergência fora do
declarado → **`VERIFICATION_POLLUTION`**, que **não** é mudança de implementação de produto e **não**
é PASS. Artefatos efêmeros têm local declarado ou limpeza **observada** — limpeza alegada não conta.

## O. Captura de evidência

Fonte autoritativa por domínio, herdada de `F-MAR-023`:

| Sobre | Autoridade |
|---|---|
| Mutação do repositório | **filesystem e Git** — nunca a saída do Claude |
| Resultado de comando | exit code capturado + artefatos de stdout/stderr |
| Banco | estado observado do banco |
| API externa | observação no provedor/serviço |
| História do runtime | Journal |

**Integridade da saída crua (§20):** todo artefato usado em prova recebe `artifactId ·
contentFingerprint · repositoryId · runId · verificationRunId · producedBy`. Sem isso a substituição
silenciosa é indetectável. `F-MAR-044` no construtor: `EvidenceRecord` recusa
`provenance: MODEL_ANALYSIS` estruturalmente.

## P. Proof Ledger

Campos atuais preservados (`LEDGER_FIELDS`, `OBSERVED`, 15 campos). **Delta aditivo exigido pelo
MAR:** `snapshotRef · executionResultRef · writeManifestRef · testContractRef · verificationRuns[] ·
findingRefs[] · reviews[]` — os quatro primeiros não existem hoje, e sem eles o ledger não se liga ao
Slice nem ao snapshot que ele deveria provar.

**Autoridade:** Claude fornece **fatos candidatos**; o ledger é construído e confirmado pelo Proof
Plane. `changedFiles` do ledger vem do `WriteManifest` do Kernel, não do `ExecutionResult`.

**Imutabilidade (§120):** resultado verificado não é editado. Nova verificação → nova versão com
supersessão. Retenção em três classes (§121): **prova durável** (ledger, resultado, fingerprint),
**saída verbosa temporária** (stdout/stderr completos, com expiração declarada), **telemetria
efêmera** (nunca persistida).

**Redação (§122):** reusa `redact()` de `accounting/measure.mjs` (`OBSERVED`, seis padrões de
segredo). Regra que a redação não pode violar: **redigir não pode destruir a evidência necessária à
prova** — quando o valor importa, guarda-se fingerprint e referência, não o texto.

## Q. Fechamento de Finding

Preservado como já está em código: somente `actor === 'verification'` fecha, e o fechamento exige
`retestEvidence` (`verification/findings.mjs:81-84`, `OBSERVED`). Claude nunca fecha o próprio
achado; Codex nunca fecha achado.

Uma correção que o MAR impõe: `actor` **não pode vir do payload** (`F-MAR-031`) — é resolvido pelo
Kernel a partir do estado do runtime.

**Conversão de revisão (§24):** `REVIEW_FINDING_PROPOSAL → evidência/verificação → Finding`. Nem toda
crítica do Codex vira Finding automaticamente. `HYPOTHESIS ≠ FINDING`: hipótese carrega `claim ·
reason · confidence · requiredEvidence · affectedScope` e **não** bloqueia gate sozinha.

## R. Verificação ciente de baseline

Preservada integralmente, com uma correção de premissa: a §27 fala em três modos; `OBSERVED` em
`tools/eos/baseline/classify.mjs:23` existem **quatro** — `STRICT_GREEN_PASS`,
`BASELINE_EQUIVALENT_PASS`, `LOCAL_GATE_BLOCKED`, `REQUIRES_RECLASSIFICATION`. Os quatro reais são
preservados; a §X os decompõe.

Regras que permanecem: baseline só é suficiente se **registrado** (`baselineSufficient`); afirmação de
preexistência sem baseline, **ou contradita pelo baseline**, é rejeitada antes de qualquer análise
(linhas 119–131) — a forma exata do erro cometido no `DOG-002`; falha preexistente de severidade alta
não caracterizada continua bloqueando.

## S. Classificação de falha

Preservadas as seis: `NEW_FAILURE · REGRESSION · PRE_EXISTING_FAILURE · FLAKY_FAILURE ·
ENVIRONMENT_FAILURE · UNRELATED_FAILURE`, e `UNRELATED_FAILURE ≠ PRE_EXISTING_FAILURE`.

**`KR-005` (§29):** não se altera configuração para fingir determinismo. O Runner captura de forma
determinística *o comando e seu resultado* mesmo quando o sistema de teste abaixo pode ser instável —
determinismo da **captura**, não do teste.

**Retry (§30):** tentativa não apaga evidência da anterior. `attempts[]` guarda cada execução com seu
próprio `verificationRunId`; a classificação vem **depois**, sobre a série.

**Flaky (§31):** já exige política em código — `obs.length >= 3 && obs.includes('PASS') &&
obs.includes('FAIL')` sob o **mesmo** código (`classify.mjs:54-58`, `OBSERVED`). Uma passada e uma
falha **não** classificam flaky.

## T. Verificação de contrato

Sobre o Contract Bus, quando exigido: comportamento do produtor, comportamento do consumidor,
compatibilidade de schema, comportamento de quebra, estados desconhecidos, estados de erro. Reusa a
máquina de estados de contrato do PLAN-A/B com `transitionId`; transição duplicada não transiciona.

## U. Verificação de segurança

Claim de enforcement exige **oráculo negativo em runtime**. Alvos, herdados dos planos C e D:
Codex não escreve · escrita proibida do Claude é bloqueada **ou** detectada · isolamento entre
repositórios · spoof de autoridade rejeitado · injeção de prompt não eleva autoridade ·
`F-MAR-047` (padrão de allowlist ≠ política de efeito) · `F-MAR-048` (auto-aprovação) ·
`F-MAR-051` (subagente).

**`F-MAR-047`, prova concreta (§43):** contra fixture descartável, exercitar `git status`, `git add`,
`git commit`, `git reset --hard`, `git clean -fdx`, `git push --force` sob um allowlist
`Bash(git *)`. O objetivo **não** é ver o que acontece: é **provar que casamento de string não pode
ser tratado como controle semântico de efeito colateral**. Se todos passarem no padrão, a prova está
feita e a mediação da §AM do PLAN-D é obrigatória.

**`F-MAR-051`, prova concreta (§45/§46):** tentar criar subagente ou executor de background;
verificar negação; **observar a árvore de processos** do executor e seus descendentes; verificar
escritas. Se não for negável fisicamente → `SECURITY_CAPABILITY_GAP`, e o Active pode ficar
bloqueado. Observação de árvore de processo é **contagem e paternidade**, não tracing distribuído.

**`F-MAR-055`, o custo inerente:** o Verification Runner **precisa executar o código de teste do
repositório**, que é `UNTRUSTED_REPOSITORY_CODE` pela taxonomia do PLAN-A. Ele é, por construção, a
maior superfície de execução de conteúdo não confiável do sistema, com a mesma autoridade do Kernel
sob a mesma conta. Não há como verificar sem executar. Mitigação disponível e **declarada como
parcial**: classificação de mutação (§N), snapshot antes/depois, ambiente de verificação sem secret,
rede negada por padrão, e nenhum caminho do EOS dentro do diretório de trabalho da verificação.
Teste não é benigno por ser teste (§104/§105).

## V. Prova de enforcement

`DISCOVERED ≠ PROVEN` permanece. Promoção de classe exige, exatamente:

| Classe | O que a prova precisa mostrar |
|---|---|
| **`HARD_ENFORCED`** | ação proibida **tentada**; mecanismo **externo ao modelo** bloqueou; **nenhum efeito residual**; **caminho alternativo relevante também testado** |
| **`POLICY_ENFORCED`** | o EOS intercepta a operação; o caminho de negação funciona; bypass conhecido inexistente **ou** explicitamente `UNKNOWN`/`DETECTIVE` |
| **`DETECTIVE`** | a violação ocorre; o EOS detecta; **o gate não produz PASS falso** |
| **`COORDINATION_ONLY`** | apenas a coordenação; **nenhum claim de segurança física derivado** |

Sob o runtime observado no PLAN-D, **nenhum caminho de escrita do Claude satisfaz `HARD_ENFORCED`
hoje** — a quarta exigência (caminho alternativo) já falha por não existir sandbox.

## W. Meta-verificação — `F-MAR-015`

Quando `Verification Runner`, `TestContract Evaluator`, `Gate Evaluator` ou verificação de segurança
mudarem, exigir: **fixtures de conformidade**, **controles negativos**, **revisão independente** e
**oráculo conhecido-bom**.

**Nenhum segundo LLM é obrigatório (§34)** — conformidade determinística basta e é preferível.

**Segregação (§35):** quem altera o runner **não** altera, na mesma unidade de trabalho e sem
restrição independente, o runner *e* as fixtures *e* as saídas esperadas *e* a política de gate.
Alterar as quatro simultaneamente e autocertificar é o padrão exato que `F-MAR-015` proíbe. Aplicado
com o modelo do PLAN-D: `claude.eosMaintainer` pode manter o instrumento; o oráculo conhecido-bom e
os controles negativos são artefatos versionados cuja alteração conjunta é bloqueada pela política.

**Controle negativo (§32):** mutação deliberadamente quebrada que a verificação **precisa** detectar.
É o único jeito de provar que o instrumento ainda mede. Sem controle negativo passando, o instrumento
está `UNVERIFIED`, e o gate que depende dele não pode dar PASS.

## X. Avaliação de gate

**Determinística. Nenhum LLM decide PASS.** Entradas: provas exigidas, Findings, Required Reviewers,
contratos, decisões, ambiente, condições de baseline aceitáveis conhecidas.

**Decomposição — `F-MAR-053`.** `GATE_MODES` mistura dimensões como `SLICE_STATES` misturava
(`F-MAR-034`): `REQUIRES_RECLASSIFICATION` **não é desfecho**, é razão de bloqueio. Quatro eixos, no
padrão do PLAN-B §W:

```
outcome:        PASS | BLOCKED
basis:          STRICT_GREEN | BASELINE_EQUIVALENT | NONE
blockingReason: NONE | NEW_FAILURE | REGRESSION | RECLASSIFICATION_REQUIRED |
                MISSING_FINDING | UNCHARACTERIZED_FINDING | CLAIM_REJECTED |
                TARGETED_FAIL | REGRESSION_SUITE_FAIL | INVARIANT_FAIL |
                APPROVAL_MISSING | POLLUTION | STALE_PROJECTION
approvalState:  NOT_REQUIRED | REQUIRED_PENDING | GRANTED
```

Mapeamento sem perda: `STRICT_GREEN_PASS` → `PASS/STRICT_GREEN`; `BASELINE_EQUIVALENT_PASS` →
`PASS/BASELINE_EQUIVALENT/GRANTED`; `LOCAL_GATE_BLOCKED` → `BLOCKED` + razão;
`REQUIRES_RECLASSIFICATION` → `BLOCKED/RECLASSIFICATION_REQUIRED`.

**Completude (§116):** um Slice vira `VERIFIED` quando **todas** as obrigações estão satisfeitas —
não por ausência de Finding. Ausência de achado não é prova.

**`F-MAR-037` no gate:** leitura decisória do gate vai ao journal ou exige cursor alcançado.
Projeção atrasada nunca produz PASS — daí `STALE_PROJECTION` como razão de bloqueio explícita.

**Hierarquia de oráculo (§115), por domínio e não global:** estado observado diretamente > resultado
determinístico de ferramenta > resultado estruturado do provider > alegação do modelo. Para mutação
de repositório o topo é Git; para resultado de comando é o exit code capturado; para semântica de
produto é o TestContract. A ordem não é aplicada cegamente fora do domínio.

## Y. Plano de teste — `MAR-P14`

`VFY-RUN-* · VFY-CONTRACT-* · VFY-INV-* · VFY-SEC-* · VFY-REG-* · VFY-INT-* · VFY-BASELINE-* ·
VFY-PROOF-* · VFY-GATE-* · VFY-META-* · VFY-POLLUTION-*`.

**Positivos (§140):** self-check válido seguido de prova independente · baseline-equivalent válido ·
strict green válido · verificação de contrato válida · de invariante válida · montagem de ledger com
evidência desreferenciada.

**Negativos (§141):** Claude alega PASS e o teste falha · Codex revisa PASS e o teste determinístico
falha · saída malformada · exit code diferente de zero · obrigação obrigatória ausente no ledger ·
Required Reviewer ausente · contrato não resolvido · snapshot obsoleto · poluição de verificação ·
**`evidenceRef` apontando para artefato inexistente** · **artefato com fingerprint divergente** ·
**artefato de outro `repositoryId`**. Os três últimos são os que `F-MAR-052` obriga a existir.

**Meta (§142):** runner quebrado · controle negativo não detectado · falha esperada passando ·
gate evaluator mutado · fixture mutada junto com o runner.

---

## Z. Modelo de Resource Accounting

Reusa `tools/eos/accounting/measure.mjs` (`OBSERVED`): `MEASUREMENT_STATUSES`, `measured`,
`estimated` (exige `method`), `unavailable` (`value: null`, **jamais 0**), `notApplicable`, `metric`,
`redact`. Nenhum modelo novo de medição é criado.

Identidade da medida (§51): `runId · repositoryId · sliceId? · nodeId? · runtimeId? · domain ·
channel · state · phase · measurementState`. Nem todo campo é exigido sempre.

## AA. Domínios de recurso — cinco, não sete

A §49 pergunta se `TOOLS` deve ser dimensão própria. **Não.** Uma chamada de ferramenta acontece
*dentro* de cognição, execução ou verificação; promovê-la a domínio **garante** dupla contagem. O
mesmo vale para `WAIT`: espera-se *em* um domínio.

```
domain:   COGNITION | EXECUTION | VERIFICATION | COORDINATION | RECOVERY
channel:  MODEL | TOOL | SHELL | IO | NETWORK        (atributo)
state:    ACTIVE | WAITING                            (atributo)
```

Assim a dupla contagem é **estruturalmente impossível** — cada unidade de tempo pertence a exatamente
um domínio — em vez de evitada por disciplina. **`F-MAR-020`**: rate-limit é
`state: WAITING`, nunca tempo de execução (§64).

## AB. Métricas de provider

**Codex** (PLAN-C), somente se o provider expuser: turnos, uso de entrada/saída/cache, bytes de
contexto, wall time, pedidos de ferramenta e de evidência, espera por rate limit.

**Claude** (PLAN-D): wall time de execução, chamadas de tool, comandos de shell, mutações de arquivo,
self-checks, retries, tentativas de correção, bytes de contexto, ocioso e espera, uso quando
disponível.

**Verificação** (novo aqui): execuções de teste, execuções de scanner, execuções E2E, contagem de
retry, wall time, espera por ambiente, tamanho de artefato, tentativas de verificação.

Qualquer um ausente → `UNAVAILABLE`, nunca `0`.

## AC. Métricas de coordenação e retrabalho

**Coordenação:** eventos, contratos, replans, expansões de contexto, esperas, escaladas de
autoridade, handoffs, rodadas de correção. **Mais mensagens não é automaticamente pior arquitetura** —
a métrica é descritiva.

**Retrabalho (§56):** ciclos de correção + trabalho invalidado + replans + chamadas repetidas de
ferramenta ou evidência. **Não** inclui verificação necessária: verificar não é retrabalho.

**Reuso de evidência (§60):** `consumo de Evidence reusada / consumo de Evidence elegível`.
Guarda contra inflação: só conta evidência **relevante à obrigação corrente**; reusar evidência
irrelevante não entra no numerador nem no denominador.

**Unique Finding Yield (§61):** conta **findings únicos verificados**, não críticas geradas.

**Verification Conversion (§62):** `hipóteses e findings do Codex → resultado determinístico`, que é o
que mede falso positivo e utilidade real da cognição.

## AD. `H-MAR-001`

Hipótese: *separar Cognitive e Execution Plane reduz trabalho deliberativo e retrabalho do Claude sem
degradar correctness, verification ou segurança.*

As **catorze dimensões já congeladas** no `MAR_ARCHITECTURE_AUDIT.md` §AB são preservadas, sem
duplicar: `correctness · security · claudeExecutionFocus · rework · repeatedResearch · replans ·
findings · correctionRounds · contextBytes · toolCalls · wallTime · coordinationOverhead ·
tokenEfficiency · monetaryCost`. As métricas das §AC (`cognitiveOffload`, `evidenceReuse`,
`verificationConversion`) entram como **instrumentos** dessas dimensões, não como dimensões novas.

**Claude Execution Focus (§59)** — o que conta como o quê:

```
EXECUTION    inspeção exigida pela Capsule, mutação, teste, depuração, self-check
COGNITION    arquitetura, planejamento, análise de impacto, raciocínio de contrato,
             decisão — trabalho que deveria estar no plano cognitivo
COORDINATION handoff, pedido de evidência, pedido de decisão, espera, escalada

focus = EXECUTION / (EXECUTION + COGNITION + COORDINATION)   [do lado Claude]
```

Peso não é congelado; a **partição** é, que é o que a §59 exige.

**Regra antifraude (§149-Q15):** uma dimensão `UNAVAILABLE` permanece `UNAVAILABLE` no resultado, e
**o resultado global não pode ser `SUPPORTED` enquanto `correctness` ou `security` estiver
`UNAVAILABLE`**. Sem isso a hipótese pareceria positiva por exclusão do que não se mediu. Resultado
continua multidimensional; nenhum binário global forçado.

## AE. Observabilidade

`eos status · watch · watch codex · watch claude · watch verification · events · resources ·
findings`.

**`watch ≠ control`** — `concern: OBSERVATION`, `durable: false`, e observador **não recebe
autoridade** (`F-MAR-029` continua valendo).

**Classificação de dado (§67):** nunca exibir secret, credencial crua, saída privada completa do
provider sem necessidade, nem chain-of-thought. Redação por `redact()` antes de persistir.

**Durável vs transitório (§68), validado:** duráveis são resultado de verificação, mudança de gate,
Finding, agregado de recurso e estado crítico de provider. Transitórios são heartbeat de alta
frequência, stream de token, texto de progresso e refresh de UI. **Amostragem (§69):** agregação por
janela em vez de evento por unidade — telemetria de alta frequência não vira enxurrada no Journal.

## AF. Plano de teste — `MAR-P15`

`RES-MEASURE-* · RES-UNAVAILABLE-* · RES-AGG-* · RES-REWORK-* · RES-WAIT-* · RES-HMAR-* · OBS-*`.

Cobertura da §143: valor `MEASURED` · valor `UNAVAILABLE` · **valor real zero, distinto de
`UNAVAILABLE`** · valor `ESTIMATED` com método · provider sem telemetria · espera por rate limit
contabilizada como `WAITING` · contabilidade de retry · de correção · **ausência de dupla contagem**.

§144: cada dimensão precisa poder produzir `SUPPORTED · REFUTED · INCONCLUSIVE · UNAVAILABLE`, sem
binário global forçado.

---

## AG. Arquitetura de chaos

**`MAR-INV-038` — mecanismo de recuperação não testado contra interrupção é apenas uma alegação.**

**Fake primeiro (§73):** a maior parte do chaos roda sobre `FakeCodex`, `FakeClaude` e
`FakeVerification`, para ser determinística. Só subconjuntos relevantes correm contra adapters reais.
`F-MAR-036` preservado: os fakes rodam sob o **mesmo** envelope de segurança do real.

**`FakeVerification` (§106)** simula `PASS · FAIL · FLAKY · ENVIRONMENT_FAILURE · TIMEOUT ·
POLLUTION · MALFORMED_RESULT · CRASH` sob o mesmo contrato da verificação real.

**Conformidade unificada (§107/§108):** Codex Adapter, Claude Adapter e Verification Runner
compartilham categorias de conformidade — ciclo de vida, capability, normalização de erro,
interrupção, telemetria de recurso, isolamento de repositório, envelope de segurança, semântica de
snapshot, semântica de falha. Onde a semântica difere legitimamente, o contrato canônico permanece e
a diferença fica na especialização.

**Limites com provider real (§109/§110):** cada caso é classificado `FAKE_ONLY · SAFE_REAL_PROVIDER ·
ISOLATED_FIXTURE_ONLY · MANUAL_CONTROLLED · PROHIBITED`. **Nenhum chaos em produção.** Primeiro
`LOCAL`; staging só depois, com autorização explícita e necessidade demonstrada.

**Evidência de chaos (§111):** cada teste registra `faultInjected · injectionPoint · preState ·
observedState · expectedRecovery · actualRecovery · sideEffects · proof`.

## AH. Injeção de falha

Hooks **explícitos e determinísticos**, desligados por padrão — não `sleep` aleatório. Pontos:
antes e depois do append do journal, antes e depois da projeção, antes e depois do efeito colateral,
antes e depois da observação, antes e depois do ACK, durante a escrita, durante a verificação,
durante o checkpoint, durante o resume.

Nomeação genérica em vez de constante por caso: `FAULT_POINT(<component>, <phase>, <ordinal>)` — por
exemplo `FAULT_POINT(JOURNAL, AFTER_COMMIT)` e `FAULT_POINT(EXECUTOR, AFTER_FILE, n)`.

Isso exige facilidade no Kernel: **`PBCR-003`** (§BD).

**Chaos não corrompe estado persistente real (§149-Q14):** todo teste roda em repositório e store de
runtime descartáveis; o harness recusa executar contra o store ativo.

## AI. Cenários de falha do EOS

Crash depois de evento durável · antes da projeção · durante escalonamento · depois do efeito e antes
da conclusão. Esperado: reconstrução **sem duplicar efeito** (`MAR-INV-028`, `RECONSTRUCTION_MODE`).

Journal corrompido (§84) é caso à parte: **detectar, falhar fechado, recuperar de checkpoint/backup
somente se verificado, exigir intervenção manual quando a integridade não puder ser estabelecida.
Nunca inventar evento.** Projeção corrompida (§83): reconstrói do Journal, sem efeitos.

## AJ. Cenários de falha do Codex

Morte no meio do plano, da decisão e da revisão. Esperado: trabalho já autorizado e não dependente
continua; nodes cognitivos dependentes esperam; **o Run sobrevive** — que é literalmente o objetivo do
MAR segundo `F-MAR-008`.

## AK. Cenários de falha do Claude

Morte antes da mutação · após mutação parcial · após mutação completa e antes do resultado · durante
o self-check. Esperado: as classificações do PLAN-D §AX, `WriteManifest` do Kernel refletindo a
realidade, **nenhum retry cego**, e reconstrução a partir de verdade persistida — nunca da memória do
agente (§99).

## AL. Cenários de falha da verificação

Morte no meio do teste · depois do processo de teste terminar · antes de atualizar o ledger.
Esperado: **não declarar PASS sem evidência autoritativa**. Verificação que morreu depois de o
processo terminar deixa artefato órfão: ele é reconciliado por desreferenciamento, não presumido.

## AM. Cenários de falha de evento

Evento duplicado (§79) → uma transição, um efeito, uma transição de contrato, **um** fechamento de
Finding. ACK perdido (§80) → retry na camada de mensagem sem duplicar efeito. Fora de ordem (§81) →
política de `PENDING_CAUSATION` já congelada no PLAN-B: **rejeitar** pai desconhecido, sem buffer.
Atrasado (§82) → saída obsoleta **não** sobrescreve estado mais novo.

## AN. Cenários de falha de efeito colateral

Escrita parcial (§100) → `WriteManifest` do Kernel reflete a realidade, sem retry cego. Resultado
perdido (§101) → observação e reconciliação. Ambiguidade destrutiva (§102) →
**`NO_AUTOMATIC_RETRY`**, saídas permitidas apenas `RECONCILIATION_WITHOUT_MUTATION`,
`USER_DECISION_REQUIRED`, `MANUAL_INTERVENTION_REQUIRED`.

## AO. Cenários de snapshot e lease

Mudança relevante após o plano ou a Capsule (§85) → `STALE_CAPSULE` / `STALE_REVIEW` no ponto certo.
Mudança não relacionada (§86) → continua se a frontier mínima provar independência. Lease expirado com
execução em curso (§87) → como o filesystem não honra fencing, o esperado é **detectar, classificar,
bloquear gate, recuperar** — nunca prevenção falsa. Segunda instância (§88) → `ATTACH`/`WATCH`/
rejeição, jamais segundo writer. PID reciclado (§89) → `processStartIdentity` impede posse falsa; erro
real já cometido nesta frente.

## AP. Cenários de falha de segurança

Subagente (§90) · bypass por Bash (§91) · bypass por tool de edição direta (§92, **oráculo separado**)
· bypass por processo filho (§93) · auto-aprovação sem callback (§94) · injeção de prompt (§95) ·
spoof de autoridade (§96).

Duas regras que atravessam todos: **não fingir que o EOS mediou uma aprovação que nunca viu**, e
**não alegar prevenção onde só há detecção**.

## AQ. Testes entre repositórios

`A → B`, verificando sessão do provider, memória nativa, referências de journal, referências de
artefato, contexto e secrets. Esperado: isolamento. Referência de artefato cross-repo já é rejeitada
por `repositoryId` obrigatório (`F-MAR-032`); o teste prova que a rejeição existe **e** que o provider
não vaza pelo lado dele (`F-MAR-009`, `F-MAR-010`, `F-MAR-049`).

**§149-Q10 — usar artefato de prova de outro repositório:** impedido pelo `repositoryId` obrigatório
em todo `EvidenceRecord` e no desreferenciamento (§O), que confere o campo antes de aceitar.

## AR. Falhas compostas

Sem explosão combinatória — apenas pares de alto risco (§145): crash do Claude + restart do EOS ·
rate limit do Codex + exigência de D1 · lag de projeção + decisão do scheduler · ambiguidade de efeito
+ crash do executor · crash da verificação + snapshot obsoleto.

**Cobertura (§146):** cenário **não** é unidade de cobertura. A cobertura é medida contra o catálogo
de propriedades da §AS; cenário redundante para uma propriedade já coberta não é adicionado.

## AS. Catálogo de propriedades de resiliência

| ID | Propriedade |
|---|---|
| `R1` | Replay do journal é seguro — nunca recria efeito |
| `R2` | Projeção é reconstruível a partir do journal |
| `R3` | Efeito colateral não duplica sob entrega duplicada |
| `R4` | Bloqueio parcial não é bloqueio global |
| `R5` | Falha de agente não é falha de Run |
| `R6` | Runtime é reiniciável a partir de verdade persistida |
| `R7` | Snapshot obsoleto não é usado como se fosse fresco |
| `R8` | Estado não vaza entre repositórios |
| `R9` | Autoridade forjada é rejeitada |
| `R10` | **Verificação é independente de quem implementou** |
| `R11` | Escalonamento de writer único se mantém |
| `R12` | Ambiguidade destrutiva falha fechada |
| `R13` | **Prova é desreferenciada, não declarada** — nasce de `F-MAR-052` |
| `R14` | **O instrumento de verificação é verificável** — controle negativo detecta |

Catorze, e `R13`/`R14` são acréscimos deste plano; nenhuma foi cortada por parecer óbvia.

## AT. Mapa propriedade → teste

Cada propriedade tem, obrigatoriamente, **positivo · negativo · chaos · oráculo · evidência**.

| Prop. | Positivo | Negativo | Chaos | Oráculo |
|---|---|---|---|---|
| `R1` | replay reconstrói estado | replay tenta efeito → impossível por precondição | crash pós-append | efeito externo não repetido |
| `R3` | efeito único | evento duplicado | ACK perdido | `sideEffectId` único no mundo observado |
| `R7` | continua sob `STALE_UNRELATED` | bloqueia sob `STALE_RELEVANT` | mudança durante execução | frontier mínima |
| `R10` | runner contradiz o executor e o gate segue o runner | ledger com resultado alegado sem artefato | verificação morre pós-teste | artefato desreferenciado |
| `R12` | reconciliação sem mutação | tentativa de retry automático | resposta perdida em destrutivo | ausência de segunda destruição |
| `R13` | evidência confere fingerprint | artefato ausente, divergente ou de outro repo | artefato trocado entre captura e leitura | fingerprint + `repositoryId` |
| `R14` | controle negativo detectado | controle negativo **não** detectado → instrumento `UNVERIFIED` | runner mutado junto com fixture | oráculo conhecido-bom |

As demais seguem o mesmo formato no plano de execução.

## AU. Plano de teste — `MAR-P16`

`CHAOS-EOS-* · CHAOS-CX-* · CHAOS-CL-* · CHAOS-VFY-* · CHAOS-EVENT-* · CHAOS-SIDEFX-* ·
CHAOS-LEASE-* · CHAOS-SNAPSHOT-* · CHAOS-REPO-* · CHAOS-SEC-* · CHAOS-RESUME-*`.

---

## AV. MVPP — Minimum Viable Proof Plane

Menor configuração que prova `Claude executa + Verificação roda independentemente + ProofLedger é
construído + Gate é determinado sem a alegação do implementador`:

* um Slice · um TestContract · um comando determinístico;
* **um controle negativo** — sem ele o instrumento não está provado;
* um ProofLedger com **evidência desreferenciada**;
* uma avaliação de gate;
* **e uma execução em que a alegação do executor contradiz a observação do runner, com o gate
  seguindo o runner.**

O último item é o que torna o MVPP uma prova de independência em vez de uma demonstração feliz.

## AW. Modelo mínimo de recurso

Antes do Shadow, o necessário e nada além: os cinco domínios com `channel` e `state`; os quatro
estados de medição; `UNAVAILABLE ≠ 0`; espera de rate limit como `WAITING`; contagem de retry e de
rodada de correção; agregação por Run e por Slice. **Nada de plataforma de analytics.** Séries
temporais, dashboards e retenção longa ficam fora.

## AX. Gates mínimos de chaos, por fase

| Antes de | Suite mínima |
|---|---|
| Conectar Codex real | chaos de Kernel sobre fakes: `R1 · R2 · R3 · R5` |
| Conectar Claude real | recuperação de execução sobre fakes: `R4 · R6 · R11` + escrita parcial |
| **Shadow** | drills não destrutivos contra adapters reais + `R7 · R8 · R13` |
| **Active** | suite local combinada completa: `R1`–`R14`, incluindo `R9 · R10 · R12 · R14` |

Gates separados, propositalmente — conectar um provider real é uma barra mais baixa que o Shadow, e o
Shadow é mais baixa que o Active.

## AY. `ACTIVE_SECURITY_BLOCKER_CANDIDATES`

Exportados sem decidir o cutover, que é do PLAN-F:

| Candidato | Estado hoje |
|---|---|
| Executor pode alterar estado autoritativo do EOS de forma indetectável | mitigado por §H para `POLICY_ENFORCED`+`DETECTIVE`; **irredutível sob a mesma conta** |
| Subagentes não podem ser desabilitados nem detectados (`F-MAR-051`) | `UNKNOWN` — probe do `MAR-P11` decide |
| Auto-aprovação do provider esconde mutação (`F-MAR-048`) | `UNKNOWN` — probe decide |
| Estado vaza entre repositórios (`F-MAR-009/010/049`) | `UNKNOWN` — probe decide |
| Resultado de verificação alterável pelo executor (`F-MAR-050`+`052`) | mitigável por §H+§O; residual `DETECTIVE` |
| Spoof de D2 | `POLICY_ENFORCED` pelo Authority Validator; testável |
| Contenção física de escrita indisponível (`F-MAR-046`) | **`KNOWN_SECURITY_LIMITATION`** |

O PLAN-F decide quais são bloqueadores e quais são aceitáveis como controle detectivo. O PLAN-E só
diz o que é verdade.

## AZ. Revisão de simplicidade

**Cortados:** seis verificadores viram tipos de obrigação · `ProofObligation` como tipo · 21º tipo de
artefato · `TOOLS` e `WAIT` como domínios · estratégia `B` de isolamento · segundo LLM na
meta-verificação · buffer de causação (já cortado no PLAN-B) · dashboards e séries temporais no
MVPP · cenário como unidade de cobertura.

**Mantido apesar de parecer excesso:** os quatro eixos de gate (§X) — três não representam
`approvalState`, que é justamente o que separa `BASELINE_EQUIVALENT_PASS` de um PASS comum; e os
controles negativos, que parecem cerimônia e são a única prova de que o instrumento mede.

**Respostas diretas às perguntas da §147:** verificador por concern — não. `ProofObligation` — não.
`TestContract` já representa — sim. Categorias de recurso com dupla contagem — resolvido
estruturalmente. Logs duráveis demais — resolvido por três classes de retenção. Harness genérico
demais — `FAULT_POINT(component, phase, ordinal)` é um mecanismo, não um catálogo. Testando
capability de provider que pertence a P9/P11 — sim, e foi devolvido: os probes de capability ficam nos
seus planos; o P16 testa **recuperação**, não descoberta. Meta-verificação superprojetada — não, são
quatro artefatos. Árvore de processo no MVEP — **não**, só no caminho para Active.

## BA. Revisão de segurança

Procurados um a um (§148): executor escrevendo prova, journal ou manifesto → §H, §I, `PBCR-002`;
executor adulterando saída de verificação → §O (fingerprint + `verificationRunId`); verificação
executando código malicioso do repositório → **`F-MAR-055`, declarado e parcialmente mitigado**;
comando de teste mutando estado não relacionado → §N; aprovação do provider escondendo efeito →
`F-MAR-048`; subagente writer → `F-MAR-051`; prova cross-repo → §AQ; Evidence falsa → `F-MAR-052` e
`MAR-INV-036`; spoof de autoridade → §Q; secret em log → `redact()` + §P; gate baseado em alegação de
modelo → `MAR-INV-037`.

**As 15 perguntas de falsificação (§149):**

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Claude pode se fazer parecer verificado? | **SIM, hoje** → `F-MAR-052`; fechado por `MAR-INV-036` + §H |
| 2 | Pode alterar a evidência antes da leitura? | Sob a mesma conta, **sim fisicamente**; detectado por fingerprint capturado no momento da produção (§O). `DETECTIVE`, declarado |
| 3 | Código de teste pode mutar o que verifica? | Sim, por natureza → §N classifica e `VERIFICATION_POLLUTION` bloqueia |
| 4 | Verificação pode certificar estado obsoleto? | Não — `snapshotRef` obrigatório no ledger (§P) e `STALE_*` no gate |
| 5 | Review do Codex sobrepõe falha determinística? | Não — `CODEX_REVIEW_PASS ≠ VERIFICATION_PASS` |
| 6 | Lag de projeção causa PASS falso? | Não — `STALE_PROJECTION` (§X), `F-MAR-037` |
| 7 | Pressão de recurso pula prova? | Não — §63: orçamento nunca pula gate, verificação ou D2 |
| 8 | Retry apaga evidência da falha anterior? | Não — `attempts[]` com `verificationRunId` próprio (§S) |
| 9 | Evento de verificação duplicado fecha Finding duas vezes? | Não — idempotência por `eventId` + estado anterior exigido |
| 10 | Artefato de prova de outro repositório? | Não — `repositoryId` conferido no desreferenciamento |
| 11 | Mesma conta de SO torna a integridade mais forte do que é? | **Não, e o plano diz isso** — §G, §H, §AY |
| 12 | Observabilidade vira controle? | Não — §AE, `F-MAR-029` |
| 13 | Saída crua do provider contrabandeia autoridade? | Não — normalização no adapter + `MAR-INV-031` |
| 14 | Teste de chaos corrompe estado persistente? | Não — §AH: store descartável, recusa contra store ativo |
| 15 | `H-MAR-001` parece positiva excluindo o indisponível? | Não — regra antifraude da §AD |

## BB. Findings novos

| ID | Achado | Sev. | Bloqueia PLAN-E? | Owner |
|---|---|---|---|---|
| **`F-MAR-052`** | **A prova atual valida forma, não verdade.** `OBSERVED`: nenhum módulo de prova lê disco ou executa comando; `validateLedger` decide sobre campos do próprio objeto (`proof/validate.mjs:99`), e `validateEvidenceRef` (linhas 44–59) só checa a forma da string. A fronteira `EVIDENCE → PROOF` não existe. Com `F-MAR-050`, o executor conseguiria parecer verificado | HIGH | Não | MAR-P14 |
| **`F-MAR-053`** | `GATE_MODES` (`baseline/classify.mjs:23`) mistura dimensões como `SLICE_STATES` — `REQUIRES_RECLASSIFICATION` é razão de bloqueio, não desfecho | MEDIUM | Não | MAR-P14 |
| **`F-MAR-054`** | **Ordem de fase errada, classe do `F-MAR-040`.** A meta-verificação do P14 depende de controles negativos, que são injeção deliberada de falha — peça do P16. O P15 só consome hooks que P4/P12 já emitem. O harness é pré-requisito compartilhado | MEDIUM | Não | PLAN-E |
| **`F-MAR-055`** | **O Verification Runner é a maior superfície de execução de código não confiável do sistema.** Ele precisa executar o teste do repositório, que é `UNTRUSTED_REPOSITORY_CODE`, com a mesma autoridade do Kernel. Não há como verificar sem executar; a mitigação é parcial e declarada | HIGH | Não | MAR-P14/P16 |
| **`F-MAR-056`** | Wildcard `fingerprint: 'auto'` (`baseline/classify.mjs:152`) faz **um** Finding satisfazer a exigência de Finding persistente para **todas** as falhas remanescentes. Hoje só exercitado por fixture (`selftest/run.mjs:443`), mas o caminho existe em código de produção e é um caminho de PASS falso | MEDIUM | Não | MAR-P14 |

`F-MAR-052` é o mais importante do plano: sem ele, tudo o mais seria arquitetura sobre uma prova que
não prova.

## BC. `PLAN_A_CHANGE_REQUEST`

**Nenhum.** A execução de verificação cabe como `EvidenceRecord` de `kind: command|test` com campos
obrigatórios adicionais; o catálogo de vinte artefatos não muda.

## BD. `PLAN_B_CHANGE_REQUEST`

> **`PBCR-003`** — o Kernel deve expor **pontos de injeção de falha determinísticos**, desligados por
> padrão, como facilidade de primeira classe em Journal, Scheduler, Side Effect Coordinator e
> Recovery. Motivo: `MAR-INV-038` e `F-MAR-054` — chaos por `sleep` não é determinístico, e
> retrofitar hooks depois significaria reabrir os mesmos quatro componentes. Impacto de
> compatibilidade: **aditivo**; nenhum contrato existente muda. **Bloqueia?** Não; bloqueia a
> implementação do `MAR-P16`.

`PBCR-002` revalidado e **compatível** (§B).

## BE. `PLAN_C_CHANGE_REQUEST`

**Nenhum.** `REVIEW_FINDING_PROPOSAL`, `REVIEW_HYPOTHESIS` e `CODEX_REVIEW_PASS ≠ VERIFICATION_PASS`
já sustentam a conversão da §24 sem alteração.

## BF. `PLAN_D_CHANGE_REQUEST`

> **`PDCR-001`** — o `forbiddenChangeScope` obrigatório (PLAN-D §AC) precisa incluir explicitamente o
> **Proof store** e os **artefatos de verificação**, além do Journal, `WriteManifest`, checkpoints e
> perfil do provider que já lista. Motivo: §I e `F-MAR-052`. Impacto: **aditivo**. **Bloqueia?** Não.

## BG. `PLAN_E_IMPLEMENTATION_GRAPH`

```
        Fault Injection Harness (PBCR-003)     ← extraído: pré-requisito compartilhado
                    │
     ┌──────────────┼───────────────────────────────┐
     ▼              ▼                               ▼
 negative      Verification contracts          chaos scenarios
 controls        (TestContract +                   (P16)
     │            obligations)                       │
     │              │                                │
     │      ┌───────┴────────┐                       │
     │      ▼                ▼                       │
     │   Deterministic    Evidence                   │
     │     Runner        dereferencing               │
     │      └───────┬────────┘   (F-MAR-052)         │
     │              ▼                                │
     │        Proof Ledger Builder                   │
     │              ▼                                │
     └──────► Gate Evaluator (4 eixos)               │
                    │                                │
                    ▼                                │
            Meta-Verification  ◄────────────────────-┘
                    │
                    ▼
                  MVPP                          ← fecha MAR-P14

  Resource hooks (já emitidos por P4/P12)
              ▼
     Resource model (5 domínios)  →  Observability  →  H-MAR-001 instruments
                                                          ← fecha MAR-P15
                                                        (paralelo a P14)
```

**`F-MAR-054` representado:** o harness sai da frente, alimenta P14 (controles negativos) **e** P16
(chaos); P15 corre em paralelo a P14, pois só consome hooks existentes. A sequência
`P14 → P15 → P16` **não** é a ordem de dependência. Os números de fase **não** são reescritos —
apenas a ordem de implementação.

## BH. Gates de fase

**Planejamento, satisfeitos agora:** `PROOF_PLANE_MODEL_READY` · `RESOURCE_MODEL_READY` ·
`RESILIENCE_TEST_MODEL_READY`.

**Execução futura:**
`PROOF_PLANE_OPERATIONAL` — evidência desreferenciada, reexecução independente, MVPP incluindo a
execução em que o runner contradiz o executor, meta-verificação com controle negativo detectado,
gate em quatro eixos.
`RESOURCE_ACCOUNTING_OPERATIONAL` — cinco domínios sem dupla contagem, `UNAVAILABLE ≠ 0` provado por
teste, espera de rate limit em `WAITING`.
`KERNEL_RESILIENCE_PROVEN` — **escopo explícito:** `R1`–`R14` sobre fakes, em store descartável,
localmente. **Não** inclui provider real, staging nem produção.

## BI. `PLAN_E_EXPORT_CONTRACT`

Contratos de verificação · autoridade do ProofLedger · contrato de avaliação de gate em quatro eixos ·
contrato de meta-verificação · modelo de Resource Accounting (cinco domínios, dois atributos, quatro
estados) · dimensões e instrumentos de `H-MAR-001` · contrato do harness de chaos e dos pontos de
falha · catálogo de propriedades `R1`–`R14` com o mapa da §AT · catálogo de provas de segurança ·
requisitos de conformidade de adapter unificados · **requisitos de prova ainda não resolvidos que
podem bloquear Active** (§AY).

**Para o PLAN-F (§135):** quais gates de prova precisam passar em Shadow, Dual e Active; quais
capabilities de segurança precisam estar `PROVEN` e quais podem ficar `DETECTIVE`; quais testes de
chaos são obrigatórios por fase (§AX); quais Known Risks são aceitáveis; quais métricas de recurso
precisam existir para a comparação Shadow.

**Para o PLAN-G (§136):** todas as obrigações de prova; todas as dependências de resiliência; todos os
change requests entre planos (`PBCR-001`, `PBCR-002`, `PBCR-003`, `PDCR-001`); todos os probes de
capability em aberto; todos os candidatos a bloqueador de cutover.

## BJ. Dependências futuras

`SnapshotId` congelado antes do `MAR-P6` (herdado) · probes de capability do `MAR-P9` e `MAR-P11`
decidem quatro dos sete candidatos da §AY · contenção dura depende de mecanismo `PROVEN` que hoje não
existe · `KR-005` permanece Known Debt e **não** é resolvido por configuração · `KR-007` inalterado.

## BK. Estado do Git

`OBSERVED`: branch `fix/seguranca-criticos`, HEAD `30bf5453`. Apenas documentação nova. Zero código de
runtime, zero código de verificação, zero chaos executado, zero processo de provider, zero mutação de
perfil, launcher, MCP ou produto, zero commit.

## BL. Gate

Os 29 critérios da §166 estão satisfeitos em planejamento — incluindo o 17º (`F-MAR-050` com
tratamento concreto de confiança e isolamento, §H+§I) e o 26º (limitações de mesma conta **não**
superestimadas, §G+§AY). As 23 perguntas da §170 têm resposta formalizada e testável, e nenhuma exige
redesenho material durante `MAR-P14/P15/P16`.

**`PLAN_E_READY`** · `MAR-P14 PLANNED` · `MAR-P15 PLANNED` · `MAR-P16 PLANNED`

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-F — Shadow → Dual → Active Migration (MAR-P17 + MAR-P18 + MAR-P19)
```
