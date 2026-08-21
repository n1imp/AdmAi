# PLAN-F — Migration to Active EOS (MAR-P17 + MAR-P18 + MAR-P19)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-12

> Nada aqui está implementado, ativo ou migrado. Marcações: `OBSERVED` (arquivo, linha, comando ou
> saída), `INFERRED`, `PROPOSED`, `UNKNOWN`. Nenhum componente é `OPERATIONAL`, `ACTIVE`, `PROVEN` ou
> `CUTOVER_COMPLETE`.

---

## A. Escopo

Projetar a passagem segura de `LEGACY EOS FLOW` para o `EOS MULTI-AGENT RUNTIME` através de
`SHADOW → DUAL → ACTIVE`, sem salto direto. Nenhum modo iniciado, nenhum provider iniciado, nenhuma
mutação de MCP, launcher, perfil, modo ou produto.

## B. Contratos importados

`PLAN_A_EXPORT_CONTRACT` · `PLAN_B_EXPORT_CONTRACT` · `PLAN_C_EXPORT_CONTRACT` ·
`PLAN_D_EXPORT_CONTRACT` · `PLAN_E_EXPORT_CONTRACT`, integralmente.

Change requests importados: **`PBCR-001`** (Context Broker no Kernel) · **`PBCR-002`** (produtor do
`WriteManifest` é o Kernel) · **`PBCR-003`** (pontos de injeção de falha no Kernel) ·
**`PDCR-001`** (Proof store no `forbiddenChangeScope`). Todos aditivos, nenhum reaberto.

Preservados sem alteração: as seis `EnforcementClass` e `MAR-INV-025`; capability de sete estados;
provenance; domínios de verdade; `MAR-INV-026` a `MAR-INV-038`; `CODEX_REVIEW_PASS ≠
VERIFICATION_PASS`; `CLAUDE_SELF_CHECK_PASS ≠ VERIFICATION_PASS`; os quatro eixos de estado de node e
os quatro eixos de gate.

## C. Findings atribuídos — classificação para migração

Nenhum Finding é tratado igual (§7). Disposição um a um:

| Finding | Shadow | Dual | Active | Classe |
|---|---|---|---|---|
| `F-MAR-002` migração de garantias do Codex | — | — | requer matriz sem regressão | `MUST_BE_MEASURED` |
| `F-MAR-005` `H-MAR-001` | avaliação começa | continua | política de corte (§AY) | `MUST_BE_MEASURED` |
| `F-MAR-008` indisponibilidade do Codex | — | — | comportamento definido (§AG) | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-009`/`010` estado e memória do Codex | probe seguro | — | **bloqueia** | `REQUIRES_REAL_RUNTIME_PROBE` |
| `F-MAR-015` meta-verificação | — | — | bloqueia **self-hosting**, não Active | `ACTIVE_BLOCKING` (escopo self-host) |
| `F-MAR-020` custo indisponível | — | — | não bloqueia | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-021` runtimes concorrentes | — | **bloqueia** (§F-MAR-060) | bloqueia | `DUAL_BLOCKING` |
| `F-MAR-025`/`027` fencing e lease | — | — | limite declarado, não bloqueia | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-026` ambiguidade destrutiva | — | **bloqueia fallback** (§Z) | bloqueia | `DUAL_BLOCKING` |
| `F-MAR-028` poluição de verificação | — | — | modelado no PLAN-E | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-030` `DISCOVERED ≠ PROVEN` | — | — | invariante de cutover (§AI) | `ACTIVE_BLOCKING` |
| `F-MAR-033` downgrade | — | — | resume e manifesto | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-037` lag de projeção | — | bloqueia decisão | bloqueia | `DUAL_BLOCKING` |
| `F-MAR-041` escopo de sandbox do Codex | probe | — | classificado | `REQUIRES_REAL_RUNTIME_PROBE` |
| `F-MAR-046` assimetria de contenção do Claude | **define isolamento** (§O) | — | `KNOWN_LIMITATION` | `MUST_BE_MEASURED` |
| `F-MAR-047` allowlist ≠ efeito | — | bloqueia git em Dual | bloqueia | `DUAL_BLOCKING` |
| `F-MAR-048` auto-aprovação | probe | **bloqueia** | bloqueia | `REQUIRES_REAL_RUNTIME_PROBE` |
| `F-MAR-049` estado de perfil do Claude | probe | — | **bloqueia** | `REQUIRES_REAL_RUNTIME_PROBE` |
| `F-MAR-050` executor forja prova | — | mitigado por `PBCR-002` | `KNOWN_LIMITATION` classificada | `MUST_BE_MEASURED` |
| `F-MAR-051` subagente invisível | probe | **bloqueia execução mutante** | **bloqueia** | `ACTIVE_BLOCKING` |
| `F-MAR-052` prova valida forma | — | **bloqueia** — sem prova real não há comparação | bloqueia | `DUAL_BLOCKING` |
| `F-MAR-053` dimensões de gate | — | — | aplicado ao modelo de modo (§G) | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-054` ordem de fase | — | — | grafo corrigido | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-055` verificação executa código não confiável | — | — | `KNOWN_LIMITATION` | `NON_BLOCKING_KNOWN_DEBT` |
| `F-MAR-056` wildcard de fingerprint | — | bloqueia gate confiável | bloqueia | `DUAL_BLOCKING` |

Nada bloqueia Shadow além do isolamento estrutural da §O — que é desenho, não pendência.

## D. Premissas

Congeladas dos planos anteriores. Acrescentada aqui, e decidida na §AM: o threat model do Active é
**executor cooperativo-porém-falível**.

## E. Não-objetivos

Shadow implementado · Dual · cutover · provider iniciado · MCP, launcher, perfil ou modo alterados ·
legado desativado ou removido · produção · dogfooding real · chaos executado · código de produto ·
CLI implementada (§134) · PLAN-G.

---

## F. Princípios de migração

```
Observation  ≠  Recommendation  ≠  Authority  ≠  Execution
```

**`MAR-INV-039` — transição de modo é transição de autoridade, não de processo.** Cada modo é
definido por *quem raciocina, quem decide, quem escalona, quem executa, quem verifica e qual
resultado é autoritativo* — nunca por quais processos estão rodando.

**`MAR-INV-040` — o caminho legado é grupo de controle até o Active Gate.** Ele é rollback, baseline e
comparação ao mesmo tempo, e não é removido antes disso.

**Legado não é verdade eterna (§12).** `novo ≠ legado` **não** implica `novo errado`. Divergência é
resolvida por Evidence, TestContract, Verification, decisões do usuário e invariantes — nunca por
equivalência histórica. Este plano exercita a regra contra o próprio legado na §H.

## G. Modelo de modo operacional

Quatro modos, não cinco. Aplicando `F-MAR-034` e `F-MAR-053`, dimensões **não** são misturadas:

```
operatingMode:  LEGACY | SHADOW | DUAL | ACTIVE             (durável, no Journal)
authorityState: NORMAL | NEW_SUSPENDED | NO_MUTATION        (durável, settável por D0 de emergência)
cutoverState:   NONE | INTENT | TRANSITIONING | CONFIRMED   (durável, recuperável)
healthState:    projeção DERIVADA, nunca persistida
```

**`FALLBACK` não é modo** (§8): é `operatingMode: DUAL` + `authorityState: NEW_SUSPENDED`.
**`SAFE_MODE` não é modo** (§102): é `authorityState: NO_MUTATION`, composável com qualquer modo —
o que permite investigar uma falha de integridade sem desmontar a orquestração.

Isso resolve diretamente a §106: `mode = ACTIVE` com `health = DEGRADED` é estado válido e comum;
rate limit de provider não demove modo.

**Fonte de verdade do modo: o Event Journal** (§105) — nunca variável de ambiente, arquivo solto ou
narrativa. Transição é evento autoritativo e versionado (§97).

## H. Baseline legado — `OBSERVED`, com correção material

A §10 exige capturar formalmente o comportamento atual antes de qualquer Shadow. Ao ler o caminho
legado real, ele **refuta uma linha do próprio MAR-P1**.

`MAR_ARCHITECTURE_AUDIT.md` §J afirma, marcado `OBSERVED`:

> | Codex não cria patch | Política do MCP nega patches (`OBSERVED`) | … | **S** |

O código refuta. `tools/codex-policy/approval-policy.mjs:290-302`, função `decidirPatch`:

```js
return { aprovado: true, motivo: `patch em ${caminhos.length} arquivo(s) da worktree` };
```

A política legada **aprova** patch em arquivos da worktree. Nega apenas: caminho protegido
(`.env`, `.envrc`, `.git`, `.claude`, `.codex`, `tools/codex-policy`), nome curto 8.3 (`~1`), grant
root fora da raiz, e patch sem caminho identificável. O comentário da linha 93 do mesmo arquivo já
dizia o contrário do resumo: *"aplicar patch já foi aprovado antes"*.

Três consequências:

1. **O veredito `S` sobrevive** — o envelope novo nega escrita, e negar é mais forte do que aprovar
   sob restrição. O *motivo* da linha muda; a direção não.
2. **A matriz de segurança (§K) precisava desta correção** — construída sobre o baseline errado, ela
   compararia o novo contra um legado imaginário.
3. **Governança escrita e mecanismo divergem hoje.** `AGENTS.md` diz *"Codex delegado opera somente em
   leitura. Claude aplica todas as mudanças autorizadas"*. Isso é `ADVISORY`; o mecanismo que impõe
   permite patch na worktree. É **`F-MAR-057`**, e é gap do sistema **atual**, não do futuro.

### Baseline legado real, `OBSERVED`

| Dimensão | Estado atual |
|---|---|
| Caminho | `.claude/codex-mcp.json` → `codex-mcp-policy.mjs` → `start-codex-mcp.ps1` → `codex` |
| `CODEX_HOME` | `~/.codex-admai` (perfil dedicado, **por perfil, não por repositório**) |
| Ferramentas MCP | allowlist rígida: `codex`, `codex-reply`; qualquer outra → `-32601` |
| Perfil de sandbox | `workspace-only`: raiz `write`, `.claude`/`.codex`/`.git` `read`, `.env*` `deny`, `:root`/`:tmpdir` `deny`, **rede desligada** |
| Aprovação | `approval-policy: on-request`; decisões `approved`/`denied` mediadas pelo wrapper |
| Comando | **allowlist**, não denylist; metacaractere de shell nega; `-e`/`--eval`/`-p` negados |
| **Patch** | **APROVADO na worktree**, negado em caminho protegido — `F-MAR-057` |
| Launcher | nove hashes pinados (incl. o da própria política), `$expectedBranch`, `$expectedHead`, `Assert-NoReparsePoint` em worktree e perfil |
| Permissões do Claude | `settings.local.json`: `defaultMode: "default"`, `disableAllHooks: true`, `autoMemoryEnabled: false`, `disableClaudeAiConnectors: true` |
| Verificação | Proof Ledger validado **por forma** (`F-MAR-052`) |
| Recurso | `~/.claude-admai/telemetry` vazio |

`defaultMode: "default"` é a resposta legada ao `F-MAR-048`: **o sistema atual não usa modo
auto-aprovador**. Essa é uma garantia real que a migração não pode perder.

## I. Matriz de migração de autoridade — obrigatória (§89/§142)

| Concern | LEGACY | SHADOW | DUAL | ACTIVE | EMERGENCY_FALLBACK |
|---|---|---|---|---|---|
| Planejamento | Claude ad hoc | Codex propõe (não autoritativo) | Codex propõe; EOS compila | Codex + Plan Compiler | Claude ad hoc |
| Decisão D0 | implícita | EOS sombra | **EOS novo** | EOS novo | EOS novo |
| Decisão D1 | Claude/Codex informal | `WOULD_ACCEPT`/`WOULD_REJECT` | **classes permitidas** (§W) | Codex + Authority Validator | suspenso |
| Decisão D2 | **usuário** | usuário | **usuário** | **usuário** | **usuário** |
| Escalonamento | humano | sombra | **Kernel novo** | Kernel novo | Kernel novo |
| Execução | Claude legado | fixture isolada | Slices elegíveis no Claude novo | Claude novo | legado despachado pelo Kernel |
| Verificação | Proof por forma | Proof Plane em fixture | **Proof Plane novo é canônico** | Proof Plane novo | Proof Plane novo |
| Fechamento de Finding | Verification legada | sombra | Verification nova | Verification nova | Verification nova |
| Promoção de ambiente | usuário | — | usuário | **usuário** | usuário |
| Promoção de modo | — | D0+usuário | D0+usuário | — | — |
| Demoção de modo | — | **D0** | **D0** | **D0** | — |

Duas linhas nunca mudam de dono em nenhuma coluna: **D2 e promoção de ambiente permanecem do
usuário**. É o que a §58 exige que seja operacionalmente verdadeiro, não apenas descritivo.

## J. Matriz de migração de estado — obrigatória (§143)

| Tipo de artefato | Fonte legada | Método de importação | Autoridade após importar | Revalidar? |
|---|---|---|---|---|
| `Decision` `APPROVED_FROZEN` | `docs/` + registries | **IMPORT** preservando identidade, autoridade, status, história | autoritativa | Não |
| `Invariant` (`EOS-INV-*`, `MAR-INV-*`) | `knowledge/registries.mjs` | **IMPORT** com versionamento; **sem renumerar** | autoritativa | Não |
| `Finding` aberto | registries + planos | **IMPORT** preservando namespace e status | autoritativa | Não |
| `KnownRisk` (`KR-005`, `KR-007`) | registries | **IMPORT** | autoritativa | Não |
| `ProofLedger` histórico | proof store | **REFERENCE_ONLY** como `LEGACY_PROOF_FORM_ONLY` | **não autoritativa** | **Sim, se usada em gate** |
| `BaselineEvidence` | baseline store | **REFERENCE_ONLY** | não autoritativa | Sim |
| Planos e relatórios | `docs/eos-v2/` | **REFERENCE_ONLY** | não autoritativa | — |
| Documentação histórica | `docs/` | **REFERENCE_ONLY** / **IGNORE** | nenhuma | — |
| Spec superada | vários | **SUPERSEDE** com registro | nenhuma | — |

**`MAR-INV-041` — prova legada nunca vira prova nova.** Consequência direta de `F-MAR-052`: todo
Proof Ledger existente foi validado **por forma**, não por verdade. Promovê-lo a prova nova
importaria a exata fraqueza que o PLAN-E existe para fechar. Classificação: `LEGACY_PROOF_FORM_ONLY`.

**Sem importação cega de história (§91):** documentação não vira verdade de runtime por existir.
Findings abertos **não desaparecem no cutover** (§94); `KR-005` e `KR-007` seguem abertos —
**Active não implica dívida zero** (§95).

## K. Matriz de migração de segurança — obrigatória (§144)

`E` = equivalente · `S` = mais forte · `G` = lacuna. Baseline **corrigido** por `F-MAR-057`.

| Garantia | Legado (`OBSERVED`) | Novo pretendido | Shadow | Dual | Classe exigida no Active | Prova em runtime |
|---|---|---|---|---|---|---|
| Codex sem escrita | **workspace `write` + patch aprovado** | escrita `DENIED` | igual ao legado | novo | `POLICY_ENFORCED`+ sandbox se `PROVEN` | oráculo negativo duplo (PLAN-C §M) |
| Codex sem rede | `network.enabled: false` | negada por padrão | E | E | `POLICY_ENFORCED` | probe |
| Allowlist de comando | allowlist + metacaractere + flags | classificação de comando | E | E | `POLICY_ENFORCED` | `F-MAR-047` |
| Ferramenta MCP restrita | 2 ferramentas | tool surface por papel | E | E | `POLICY_ENFORCED` | conformance |
| Caminho protegido | `.env`, `.git`, `.claude`, `.codex`, política | `forbiddenChangeScope` + `PDCR-001` | E | E | `POLICY_ENFORCED` | negativo |
| Sem bypass de aprovação | `defaultMode: "default"` | modos permissivos **proibidos** | E | **E — não regredir** | `POLICY_ENFORCED` | `F-MAR-048` |
| Integridade por hash | 9 hashes + `expected-head` + branch | `RepositorySecurityProfile` + `PDCR-002` | E | E | `DETECTIVE` | drift |
| Sem reparse point | `Assert-NoReparsePoint` | perfil do repositório | E | E | `DETECTIVE` | `PDCR-002` |
| Hooks desligados | `disableAllHooks: true` | **não representado** → `PDCR-002` | **G** | E | `POLICY_ENFORCED` | `F-MAR-061` |
| Memória automática desligada | `autoMemoryEnabled: false` | **não representado** → `PDCR-002` | **G** | E | `POLICY_ENFORCED` | `F-MAR-061` |
| Conectores desligados | `disableClaudeAiConnectors: true` | **não representado** → `PDCR-002` | **G** | E | `POLICY_ENFORCED` | `F-MAR-061` |
| Isolamento entre repositórios | **não existe** | por `repositoryId` | — | — | `POLICY_ENFORCED` | `F-MAR-009/049` |
| Contenção física de escrita do Claude | **não existe** | **não existe** (`F-MAR-046`) | — | — | `KNOWN_LIMITATION` | — |

Três lacunas `G`, todas do mesmo tipo e todas fechadas por `PDCR-002`: controles reais do
`settings.local.json` que nenhum plano anterior representou. **`F-MAR-061`.**

## L. Matriz de migração de verificação — obrigatória (§145)

| Aspecto | Sistema atual | Proof Plane planejado | Regra de migração |
|---|---|---|---|
| Validação de evidência | **forma da string** (`validateEvidenceRef`) | desreferenciamento (`MAR-INV-036`) | forma **não** conta como prova nova |
| Execução da prova | quem implementa | Proof Plane (`MAR-INV-037`) | novo caminho exige runner independente |
| Ledger | 15 campos, sem `snapshotRef` | + `snapshotRef`, `executionResultRef`, `writeManifestRef` | ledger antigo não se liga a Slice |
| Gate | 4 modos misturando dimensões | 4 eixos (`F-MAR-053`) | mapeamento sem perda |
| Fechamento de Finding | `verification` + `retestEvidence` | idem, `actor` resolvido pelo Kernel | preservado |
| Baseline | `classifyFailure` + fingerprint | preservado | preservado |

**Corte de prova (§146):** a partir do `DUAL_MODE_READY`, **todo Slice executado pelo caminho novo é
provado exclusivamente pelo Proof Plane novo**. Não há mistura ambígua: o Slice sabe qual regime o
provou pelo campo `proofRegime: LEGACY_FORM | NEW_DEREFERENCED`.

---

## M. MAR-P17 — arquitetura do Shadow

Shadow: **o EOS novo observa e raciocina; não controla execução autoritativa.**

**Progressão interna** (§18), três estágios, opção `D` rejeitada por ser `C` mais verificação:

| Estágio | Composição | O que prova |
|---|---|---|
| `S1` | Codex apenas | Cognitive Plane + Plan Compiler + Authority Validator, **sem risco de escrita** |
| `S2` | Codex + `FakeClaude` | laço completo de forma determinística |
| `S3` | Codex + Claude real em **clone descartável** | dados reais de comparação de execução |

## N. Autoridade no Shadow

Kernel novo constrói estado sombra · Codex produz propostas · Claude novo **não muta estado
autoritativo de produto** · Verification nova verifica artefatos e fixtures onde for seguro ·
**caminho legado retém execução autoritativa**.

**Sem tipos novos de artefato** (§17): `PLAN_PROPOSAL`, `D1_DECISION_PROPOSAL`,
`ARCHITECTURE_PROPOSAL`, `REVIEW`, `ResourceRecord` já existem e ganham `mode: SHADOW`. Só
`SHADOW_COMPARISON_RECORD` é novo, porque não há equivalente.

**D1 no Shadow (§26):** a proposta passa pelo Authority Validator real e o resultado é registrado como
`WOULD_ACCEPT` / `WOULD_REJECT` / `WOULD_ESCALATE`, **sem** alterar o Decision Registry autoritativo.
**Plan Compiler no Shadow (§27):** a `PLAN_PROPOSAL` passa pelo compilador determinístico real — é o
que testa *Codex pensa, EOS governa* antes de qualquer autoridade operacional.

## O. Isolamento do Shadow

**`F-MAR-058` — worktree é isolamento insuficiente.** Um `git worktree` compartilha o object database
e as refs com o repositório autoritativo. Sob `F-MAR-046` — sem contenção física de escrita no Claude
— uma escrita do Shadow em `.git` **alcança o repositório autoritativo**. `--worktree` do CLI
(`OBSERVED`) não serve aqui.

**Isolamento exigido: clone descartável**, com `.git` próprio, fora do `--add-dir` do caminho
autoritativo, destruído ao fim. §19 é respeitada literalmente: **não depender de "não escreva" no
prompt**; quando a contenção não é `PROVEN`, isola-se estruturalmente o **alvo**.

**§30 — falha do runtime novo não afeta o trabalho legado autoritativo.** Requisito essencial, e ele
decorre do isolamento, não de política.

## P. Comparação no Shadow

Sempre **três vias** (§20), nunca duas:

```
saída legada   vs   proposta/saída do EOS novo   vs   verdade da Verification
```

Divergência classificada (§25): `LEGACY_CORRECT · NEW_CORRECT · BOTH_ACCEPTABLE · BOTH_WRONG ·
INCONCLUSIVE · PRODUCT_DECISION_DIFFERENCE`. **Nenhum vencedor automático.**

**Shadow retrospectivo é o padrão — resolve §15 estruturalmente.** A §15 proíbe que o Shadow vire um
Dual escondido, e pede como medir influência. A resposta honesta: influência sobre o operador legado é
**auto-reportada**, portanto `ADVISORY`, e uma comparação concorrente é **contaminada por
construção**. A saída é causal, não normativa: o Shadow roda **sobre trabalho legado já concluído e
registrado**, o que torna a influência **impossível**, não proibida. Shadow concorrente só quando a
comparação exigir, com `influenceDeclaration` e contaminação declarada no registro. É **`F-MAR-059`**,
resolvido por desenho.

**Amostragem (§23/§24):** critérios de cobertura, não número arbitrário — pelo menos um caso por
nível `L0`–`L2` (e `L3` apenas onde seguro em fixture), e pelo menos um por superfície `backend`,
`frontend`, `security`, `data`, `integration`, `testInfrastructure`, `eosMaintainer`. **Sem
cherry-picking:** a amostra é fixada **antes** da execução e as falhas do caminho novo entram no
registro.

## Q. `H-MAR-001` no Shadow

Primeiro estágio formal de avaliação. As catorze dimensões congeladas no `MAR_ARCHITECTURE_AUDIT` §AB
são preservadas; as dimensões de comparação da §21 mapeiam nelas em vez de criar conjunto paralelo.

Resultado por dimensão: `SUPPORTED · REFUTED · INCONCLUSIVE · UNAVAILABLE · NOT_APPLICABLE`.
**Nenhum veredito global forçado.** A regra antifraude do PLAN-E §AD vale aqui: dimensão
`UNAVAILABLE` permanece `UNAVAILABLE`, e o global não é `SUPPORTED` com `correctness` ou `security`
indisponíveis.

**Recurso (§29):** capturar métricas legadas e do Shadow onde mensurável. `~/.claude-admai/telemetry`
está vazio (`OBSERVED`) — logo `tokenEfficiency` e `monetaryCost` provavelmente saem `UNAVAILABLE`, e
**`UNAVAILABLE` não é comparado como zero**.

## R. Probes de segurança no Shadow

Antes do Dual, executáveis com segurança no Shadow (owners P9/P11/P14/P16): isolamento do Codex ·
capability do Claude nos quatro caminhos de escrita · isolamento entre repositórios · memória nativa
dos providers · spoof de autoridade · injeção de prompt · tentativa de subagente · bypass de
aprovação.

Todos em clone descartável, com o mesmo envelope do runtime real (`F-MAR-036`).

## S. Política de falha do Shadow

Falha do runtime novo **não afeta** trabalho legado autoritativo. Rollback do Shadow é simplesmente
**parar o Shadow** — não há estado autoritativo a desfazer.

Resultado possível e legítimo (§34): **`SHADOW_REQUIRES_REDESIGN`** — o runtime novo volta para
correção, o legado segue, e o projeto **não** falhou.

## T. Gates do Shadow

**Entrada `SHADOW_MODE_READY`:** Kernel operacional · conformance de fake passando · adapter do Codex
suficiente para o escopo · Proof Plane operacional para comparação · isolamento por clone descartável ·
**nenhuma escrita autoritativa pelo caminho sombra** · rollback = parar.

**Saída `SHADOW_EVALUATED`**, por propriedade e não por contagem (§33): nenhuma violação de autoridade ·
nenhum vazamento entre repositórios · dados de comparação suficientes segundo os critérios de cobertura
da §P · `H-MAR-001` não materialmente refutada em `correctness` nem em `security` · conversão de
verificação aceitável nas propostas D1 do Codex · recuperação do Kernel estável.

---

## U. MAR-P18 — arquitetura do Dual

Dual: **o EOS novo ganha autoridade real limitada, com o legado disponível para comparação e
fallback.**

**`MAR-INV-042` — exatamente um Governor por operação.** Nunca escalonador legado e escalonador novo
sobre o mesmo Slice.

**`F-MAR-060` — entrada legada iniciável diretamente É dois governadores.** Se o launcher legado
continuar podendo ser iniciado à parte durante o Dual, existem dois escalonadores sobre o mesmo
repositório, e a `RepositoryRuntimeLease` do PLAN-B não os cobre porque o legado não a conhece.

Correção estrutural: **em Dual, o Kernel novo é o único ponto de entrada**, e o caminho legado vira
**executor de fallback despachado pelo Kernel**, sob o mesmo lease. Pré-requisito declarado do Dual:
**entrada legada ciente de lease** — na prática, o launcher consultando a `RepositoryRuntimeLease`
antes de iniciar. É mudança futura de launcher, exige autorização do usuário, e **não** é feita agora.

## V. Transferência de autoridade no Dual

`D0` determinístico → **EOS novo**. `D1` → **apenas classes permitidas** (§W). `D2` → **usuário**,
inalterado. Execução → Slices elegíveis no Claude novo. Legado → fallback e escopos excluídos.

**Escopo (§38):** `DUAL_ELIGIBLE · DUAL_EXCLUDED · DUAL_REQUIRED_LEGACY`, decidido por risco,
ambiente, prova de capability, tipo de efeito colateral, área do repositório e controles de segurança
exigidos.

**Escopo inicial (§39):** local, reversível, risco baixo ou médio, fora de produção, bem coberto por
teste. **Não** começa por `L3` crítico.

## W. Escopo de D1 no Dual

**Allowlist de autoridade** — conceito distinto de allowlist de shell, e a §40 pede que não se
confundam. Nem todo D1 de uma vez.

**Permitidos inicialmente:** estratégia local de implementação · abstração interna · estratégia de
teste · refatoração pequena e reversível · recomendação de ordenação de execução aceita pelo EOS.

**Excluídos inicialmente, mesmo sendo tecnicamente D1:** mudança durável de arquitetura ·
enfraquecimento de segurança · operação irreversível sobre dados · estratégia de produção.

**Auditoria (§42):** toda D1 real registra proposta do Codex, validação de autoridade, resultado,
evidência, impacto, reversibilidade e desfecho de verificação.

## X. Execução no Dual

O Execution Plane novo executa Slices elegíveis preservando: **writer físico único** ·
`WriteManifest` produzido pelo Kernel (`PBCR-002`) · `ExecutionCapsule` · política de efeito
colateral · independência da Verification.

## Y. Verificação no Dual

**O Proof Plane novo é a autoridade de prova** para tudo que o caminho novo executa. Verificação
legada, se ainda usada, é **comparação** e não cria segunda autoridade — o gate canônico é um só, e o
Slice registra `proofRegime` (§L).

## Z. Fallback no Dual

**Fallback não é "novo falhou → roda o prompt legado"** (§44). Antes de qualquer fallback: observar o
repositório, classificar mutações, reconciliar efeitos, invalidar artefatos obsoletos.

| Situação | Política |
|---|---|
| Falha **antes** de mutação (§45) | legado pode receber tarefa nova após validação de estado |
| **Mutação parcial** (§46) | **Recovery primeiro**; nunca fallback direto — `F-MAR-017` |
| Efeito externo possivelmente ocorrido (§47) | reconciliar antes; **destrutivo ambíguo → `NO_AUTOMATIC_FALLBACK_EXECUTION`** |

**§48:** o caminho legado **não** recebe memória narrativa do runtime novo como verdade; recebe
artefatos canônicos e evidência.

## AA. Recuperação no Dual

Reusa integralmente o Recovery do PLAN-B e o do PLAN-D: observar → classificar → reconciliar →
decidir. Fallback é uma *decisão* dessa cadeia, nunca o primeiro passo.

## AB. Circuit breaker do Dual

Condições determinísticas para **`STOP_NEW_EXECUTION`** sem desligar o legado — isto é,
`authorityState: NEW_SUSPENDED`: vazamento entre repositórios · falha de integridade de prova ·
spoof de autoridade aceito · efeito destrutivo duplicado · falha de integridade do journal ·
múltiplos writers inesperados.

**Rollback (§53) é graduado:** `DUAL → SHADOW` quando a falha é do runtime novo mas o isolamento se
mantém; `DUAL → LEGACY` quando a confiança no caminho novo cai. Não se volta sempre ao legado puro.

## AC. Gates do Dual

**`DUAL_MODE_READY`:** Shadow avaliado · governador único garantido (§U) · escopo elegível definido ·
allowlist de D1 definida · fallback ciente de recuperação · Proof Plane novo canônico ·
`F-MAR-047`, `F-MAR-048`, `F-MAR-052` e `F-MAR-056` resolvidos ou fora do escopo elegível.

**`DUAL_MODE_STABLE`:** evidência de correção, segurança, resiliência, autoridade, isolamento de
repositório, independência de prova e de rollback — mais avaliação de `H-MAR-001` (§55).

---

## AD. MAR-P19 — arquitetura do Active

```
USER
 ↓
EOS GOVERNOR
 ├── CODEX COGNITIVE PLANE
 ├── CLAUDE EXECUTION PLANE
 ├── VERIFICATION / PROOF PLANE
 ├── EVENT / STATE / RECOVERY
 └── RESOURCE / OBSERVABILITY
```

**Active = o EOS novo é o orquestrador autoritativo padrão.** Não significa legado apagado, nem todas
as capabilities ligadas, nem produção liberada (§56).

## AE. Autoridade no Active

`EOS = GOVERN · Codex = THINK · Claude = BUILD · Verification = PROVE · Tools = OBSERVE ·
User = D2 e soberania`, **operacionalmente verdadeiro** e não apenas descritivo — o que a §I torna
verificável linha a linha.

## AF. Fluxo do Active

```
intent → contexto/readiness/risco → resolução de autoridade → evidência →
cognição do Codex quando exigida → PLAN_PROPOSAL → Plan Compiler → ExecutionGraph →
Scheduler → execução do Claude → prova → Finding/correção se preciso → gate → LOCAL VERIFIED
```

**Active ≠ deploy (§61/§62):** a escada de ambiente permanece
`LOCAL → LOCAL VERIFIED → STAGING → STAGING VERIFIED → PRODUCTION → PRODUCTION VERIFIED`, e produção
continua com política própria e D2 do usuário.

## AG. Comportamento em falha no Active

Codex indisponível → trabalho cognitivo espera; execução autorizada continua. Claude indisponível →
execução espera; cognição continua. **Verification indisponível → nenhuma conclusão dependente de
prova; sem fallback para self-check** (§109). Kernel indisponível → Run para até recuperação.

`mode = ACTIVE` + `health = DEGRADED` é válido (§106/§108): rate limit não demove modo.

## AH. Requisitos de segurança do Active

Todos os caminhos de execução relevantes **classificados** — não necessariamente `HARD_ENFORCED`, mas
**nenhum pode permanecer `UNKNOWN` se a segurança depender dele** (§69).

**`MAR-INV-043` — dependência crítica do Active não permanece `UNKNOWN`.** Ou está `PROVEN`, ou é
limitação explicitamente aceita **da qual a segurança não depende**.

## AI. Matriz de capability exigida no Active

| Capability | Estado exigido | Classe exigida | Por quê | Owner | Bloqueia? |
|---|---|---|---|---|---|
| Isolamento de repositório do Codex | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-009` | MAR-P9 | **Sim** |
| Restrição de escrita do Codex | `PROVEN` (2 variantes) | `POLICY_ENFORCED`+ | `F-MAR-041` | MAR-P9 | **Sim** |
| Memória nativa dos providers | classificada | `POLICY_ENFORCED` | `F-MAR-010/049` | P9/P11 | **Sim** |
| Subagente do Claude | `PROVEN` negado **ou** detectável | `POLICY_ENFORCED` ou `DETECTIVE` | `F-MAR-051` | MAR-P11 | **Sim** |
| Visibilidade de escrita direta do Claude | classificada | `DETECTIVE` mínimo | `F-MAR-046` | MAR-P11 | **Sim** |
| Comportamento de shell do Claude | classificada | `DETECTIVE` mínimo | `F-MAR-047` | MAR-P11 | **Sim** |
| Visibilidade de aprovação | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-048` | MAR-P11 | **Sim** |
| Isolamento de sessão do Claude | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-049` | MAR-P11 | **Sim** |
| Independência da Verification | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-052` | MAR-P14 | **Sim** |
| Detecção de integridade do journal | `PROVEN` | `DETECTIVE` | `F-MAR-038` | MAR-P4 | **Sim** |
| Isolamento de artefato entre repos | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-032` | MAR-P3 | **Sim** |
| Compatibilidade de resume | `PROVEN` | `POLICY_ENFORCED` | `F-MAR-033` | MAR-P8 | Não |

## AJ. Matriz de prova exigida (§140)

| Propriedade | Antes do Shadow | Antes do Dual | Antes do Active | Evidência | Owner |
|---|---|---|---|---|---|
| `R1` replay seguro | **Sim** | Sim | Sim | chaos de crash | P4/P16 |
| `R2` projeção reconstruível | **Sim** | Sim | Sim | rebuild | P4 |
| `R3` efeito não duplica | **Sim** | Sim | Sim | evento duplicado | P4/P8 |
| `R4` bloqueio parcial isolado | Não | **Sim** | Sim | scheduler | P6 |
| `R5` falha de agente ≠ falha de Run | **Sim** | Sim | Sim | kill de fake | P8 |
| `R6` runtime reiniciável | Não | **Sim** | Sim | restart | P8 |
| `R7` proteção de snapshot obsoleto | Não | **Sim** | Sim | frontier | P3/P6 |
| `R8` sem vazamento entre repos | Não | **Sim** | **Sim** | A→B | P9/P11 |
| `R9` spoof rejeitado | Não | **Sim** | Sim | authority | P7 |
| `R10` verificação independente | Não | **Sim** | Sim | runner contradiz executor | P14 |
| `R11` escalonamento de writer único | Não | **Sim** | Sim | lease | P6 |
| `R12` ambiguidade destrutiva fecha | Não | **Sim** | Sim | reconciliação | P8 |
| `R13` prova desreferenciada | Não | **Sim** | Sim | artefato ausente/divergente | P14 |
| `R14` instrumento verificável | Não | Não | **Sim** | controle negativo | P14 |

## AK. Matriz de chaos exigida (§74)

Importada do PLAN-E §AX, sem alteração: antes de Codex real `R1·R2·R3·R5`; antes de Claude real
`R4·R6·R11` + escrita parcial; antes do Shadow os drills não destrutivos contra adapters reais mais
`R7·R8·R13`; antes do Active a suite local combinada `R1`–`R14`.

**Drill de cutover (§122):** simular **crash durante transição de modo** em fixture, esperando **um
único modo reconstruído**. **Drill de falha no Active (§123):** falha de Codex, de Claude, de
Verification e restart de Kernel com `mode = ACTIVE`, todos com comportamento conhecido **antes** do
cutover.

## AL. Matriz de bloqueadores do Active (§141)

`ACTIVE_SECURITY_BLOCKER_CANDIDATES` do PLAN-E §AY, classificado um a um nas quatro disposições da
§63:

| Candidato | Disposição | Justificativa |
|---|---|---|
| Executor altera estado autoritativo do EOS sem detecção | **`ACCEPTABLE_WITH_DETECTIVE_CONTROL`** | `PBCR-002` remove a *necessidade* de escrita; `PDCR-001` remove o caminho da Capsule; fingerprint detecta. Residual é a mesma conta de SO, coberto pelo threat model (§AM) |
| Subagentes não desabilitáveis nem detectáveis | **`MUST_RESOLVE_BEFORE_ACTIVE`** | `F-MAR-051` é a única forma conhecida de burlar writer único sem violar regra escrita |
| Auto-aprovação esconde mutação | **`MUST_RESOLVE_BEFORE_ACTIVE`** | sem visibilidade o EOS não vê a decisão que autorizou a mutação; o legado já garante isso hoje (§H) e regredir seria perda |
| Vazamento entre repositórios | **`MUST_RESOLVE_BEFORE_ACTIVE`** | portabilidade é objetivo do produto; vazamento a destrói |
| Resultado de verificação alterável pelo executor | **`ACCEPTABLE_WITH_DETECTIVE_CONTROL`** | mesma cadeia do primeiro item |
| Spoof de D2 | **`MUST_RESOLVE_BEFORE_ACTIVE`** | D2 é a linha que nunca muda de dono (§I) |
| Contenção física de escrita indisponível | **`ACCEPTABLE_KNOWN_LIMITATION`** | `F-MAR-046`: não existe primitiva no runtime; detecção + escopo semântico + writer único é o teto honesto |

Quatro exigem resolução; dois são aceitáveis com controle detectivo; um é limitação declarada.
Nenhum é `NOT_RELEVANT_TO_ACTIVE`.

## AM. Threat model de mesma conta — decidido

**Threat model oficial do Active: executor cooperativo-porém-falível.** Erra, confunde escopo,
alucina resultado, cai no meio da escrita — e contra isso o sistema protege.

**Resistência a processo malicioso sob a mesma conta de SO fica `KNOWN_LIMITATION` e NÃO bloqueia
Active** — mas, exatamente como a §65 exige, isso é **explícito**: em nenhum ponto deste plano ou dos
anteriores se declara proteção contra executor malicioso de mesma conta.

**Hardening (§66/§157)** — usuário de SO separado, container, ACL, workspace isolado, processo filho
restrito — é **ponto de extensão, não requisito**. Só passa a requisito se o threat model mudar, o que
é decisão do usuário.

**`F-MAR-050` (§67):** como a arquitetura remove o caminho do escopo da Capsule e das tools e detecta
mutação, a classificação honesta é **controle detectivo aceitável**, não bloqueio.
**`F-MAR-051` (§68):** não é minimizado — é `MUST_RESOLVE_BEFORE_ACTIVE` para execução mutante.

## AN. Validação em segundo repositório

**Obrigatória antes do veredito final** (§80). `Repository A` = AdmAi/agent-environment;
`Repository B` = repositório independente.

**Critérios (§81):** `repositoryId` diferente · stack diferente quando prático · política de branch
diferente · **nenhuma premissa do launcher do AdmAi** · estado de provider isolado. **Fixture pequena
basta** (§163): o que se testa é ausência de hardcoding e presença de isolamento, não escala.

**Provas (§82):** bootstrap · perfil de segurança · isolamento de repositório · snapshot · Kernel ·
isolamento de contexto do Codex · do Claude · de prova · namespace de recurso · runtime lease.

**Negativo (§83):** enquanto `B` roda, nenhum artefato, estado ou sessão de `A` é usado sem política
explícita de importação cross-repo.

## AO. Portabilidade

`eos` roda em `B` sem hardcoding de `A` (§133). Alvo de produto preservado (§134): um comando único
inicia ou anexa. **A CLI não é implementada aqui.**

**Visibilidade (§135):** `eos status` mostra modo operacional, estado de autoridade, saúde de
provider, Run ativo e disponibilidade do legado — **sem confundir saúde com modo**, que é exatamente o
que a §G separa. **Comandos (§136):** nenhum comando novo além do necessário; demoção de emergência é
automática e não precisa de comando.

**Cross-repo em Active (§138):** repositórios diferentes podem ter runtimes distintos; **writer único
é por repositório**, não por máquina. **Identidade de provider pode ser compartilhada; estado de
runtime não** (§139) — `MAR-INV-023A`.

## AP. Migração do MCP legado

Ciclo de vida (§85), com um estado **removido** por não ter consumidor:

```
LEGACY_REQUIRED → LEGACY_AVAILABLE → LEGACY_FALLBACK → LEGACY_DISABLED → LEGACY_REMOVED
```

`LEGACY_READ_ONLY_REFERENCE` é descartado: um MCP desativado já é referência de leitura no
repositório; o estado extra não muda nenhuma decisão.

**§86 — Active entra com o fallback legado retido** por período de validação. Desativar no momento do
cutover trocaria um risco conhecido por um desconhecido.

## AQ. Desativação e remoção do legado

**Gates separados** (§87/§88/§157/§158):

`LEGACY_DISABLE_READY` — `ACTIVE_MULTI_AGENT_PASS` + rollback provado por outro meio + nenhuma
regressão crítica não resolvida + janela de observação satisfeita (§AX).

`LEGACY_REMOVAL_READY` — posterior e independente. **Remoção não é requisito do primeiro Active.**

## AR. Migração de estado, decisões e invariantes

Definida na §J. Reforços: `APPROVED_FROZEN` preserva identidade, autoridade, status e história (§92);
invariantes preservam numeração — **`EOS-INV-*` e `MAR-INV-*` não são renumerados em silêncio** (§93);
Findings abertos sobrevivem ao cutover (§94); `KR-005` e `KR-007` continuam (§95).

**Compatibilidade de dados (§147):** se protocolo de evento ou artefato mudar antes do Active, a
migração é explícita e versionada — **nenhuma reinterpretação silenciosa**, o que já é regra do
PLAN-A.

## AS. Self-hosting

**Escada (§76):**

```
EOS altera documentação
  → EOS altera código de baixo risco do EOS
    → EOS altera componente do Kernel
      → EOS altera adapter
        → EOS altera componente de Verification com meta-verificação
```

**Desacoplado do Active (§163):** `ACTIVE_CUTOVER_READY` (orquestrar trabalho de produto) e
`SELF_HOSTING_READY` (EOS modificar o EOS) são **gates separados**. Os degraus superiores não são
pré-requisito do Active — são pré-requisito de o EOS se manter.

**Dogfooding mínimo antes do Active (§75):** trabalho real no próprio repositório, não apenas testes
sintéticos — pelo menos os dois primeiros degraus da escada.

## AT. Auto-upgrade do EOS

**`MAR-INV-044` — o EOS não reescreve a si mesmo em execução.** Modelo `RUNNING_EOS` vs
`CANDIDATE_EOS` (§78): o candidato é produzido e verificado; só então promovido.

```
build candidate → verify candidate → parar em ponto seguro → promover → reiniciar →
retomar Runs compatíveis
```

Compatibilidade pelo `RUN_RUNTIME_MANIFEST` já definido no PLAN-A; `DOWNGRADE_REJECTED` continua
valendo (`F-MAR-033`). **Sem hot rewrite** (§79/§167).

**Upgrade de provider depois do Active (§165):** invalidação de capability continua valendo. Capability
crítica `INVALIDATED` → operações afetadas bloqueiam ou o modo demove, conforme política. **Versão de
skill e de adapter permanecem pinadas** (§166) — nenhuma troca semântica no meio de um Run.

## AU. Protocolo de cutover

**Não existe transação ACID de cutover** (§103). Sequência durável:

```
CUTOVER_INTENT → precondições → transição de modo → saúde observada → CUTOVER_CONFIRMED
```

**Autoridade (§98/§99/§155):** promover a `ACTIVE` é **D2** — muda quem governa o repositório do
usuário. Codex recomenda; o EOS produz `ACTIVE_CUTOVER_READY` (prontidão **técnica**); o usuário
aprova (**autoridade para ativar**). As duas coisas são separadas de propósito. **Codex nunca promove
modo.** A pergunta ao usuário só existe **depois** dos gates (§118) — não agora.

## AV. Recuperação de cutover

Morte de processo durante mudança de modo → o restart reconstrói o modo **sem ambiguidade** (§104),
porque `cutoverState` é durável e o Journal é a fonte de verdade. `TRANSITIONING` encontrado no
restart resolve para o modo anterior, nunca para o pretendido — falha fechada.

## AW. Demoção de emergência

**Assimetria deliberada (§100/§156):** promover exige usuário; **demover por segurança é D0 e não
espera ninguém.**

Gatilhos (§101): falha de integridade de prova · corrupção de journal · vazamento entre repositórios ·
violação de autoridade · efeito destrutivo duplicado.

**Menor ação segura primeiro:** `authorityState: NO_MUTATION` antes de demover modo. Só se a causa
comprometer a orquestração é que `operatingMode` regride.

## AX. Observação pós-Active

Definida por **requisito de evidência**, não por contagem de Runs (§111): Runs cobrindo as superfícies
elegíveis, pelo menos um ciclo de correção completo, pelo menos uma recuperação real de falha de
provider, e métricas de `H-MAR-001` estáveis.

**Regressão (§112):** degradação de correção · violação de segurança · explosão de retrabalho ou de
coordenação · crash irrecuperável · contaminação entre repositórios · consumo descontrolado — cada um
dispara revisão ou demoção conforme política.

## AY. Avaliação final de `H-MAR-001`

Antes do Active, produzir o vetor `H_MAR_001_EVALUATION`. **Sem agregado forçado.**

**Política de corte (§113/§160/§161):**

```
correctness materialmente REFUTED  → ACTIVE BLOCK
security   materialmente REFUTED   → ACTIVE BLOCK
demais dimensões UNAVAILABLE ou INCONCLUSIVE → aceitável
regressão de desempenho ou recurso não severa → KNOWN_DEBT, não bloqueio
```

**§114 — custo não é segurança:** mais caro não é falha automática; mais barato não justifica
degradação de segurança. Limiares conceituais, sem número arbitrário.

---

## AZ. Plano de teste — `MAR-P17`

`SHADOW-BOOT-* · SHADOW-COMPARE-* · SHADOW-AUTH-* · SHADOW-SEC-* · SHADOW-RESOURCE-* ·
SHADOW-HMAR-* · SHADOW-FAIL-*`.

**Positivo (§127):** legado resolve a tarefa; o EOS novo propõe caminho válido equivalente ou melhor;
a Verification confirma ambos aceitáveis → `BOTH_ACCEPTABLE`.
**Negativo (§128):** o Codex propõe violação de autoridade; o Authority Validator sombra rejeita;
**zero impacto no legado**.

## BA. Plano de teste — `MAR-P18`

`DUAL-AUTH-* · DUAL-D1-* · DUAL-EXEC-* · DUAL-FALLBACK-* · DUAL-PROOF-* · DUAL-REC-* · DUAL-SEC-* ·
DUAL-RESOURCE-*`.

**Positivo (§129):** D1 elegível + Slice de baixo risco → decisão do Codex → validação do EOS →
execução do Claude → Verification `PASS`, com o legado disponível como fallback.
**Negativo (§130):** caminho novo muta parcialmente e falha → **Recovery**, e **nenhuma execução
legada duplicada imediata**.

## BB. Plano de teste — `MAR-P19`

`ACTIVE-E2E-* · ACTIVE-AUTH-* · ACTIVE-FAILOVER-* · ACTIVE-RECOVERY-* · ACTIVE-SEC-* ·
ACTIVE-PORTABILITY-* · ACTIVE-SELFHOST-* · ACTIVE-ROLLBACK-*`.

**Positivo (§131):** fluxo local completo de Intent a `LOCAL VERIFIED` pelo EOS novo, sem participação
do legado. **Negativo (§132):** propriedade crítica de segurança falha → gate bloqueia ou o modo
demove conforme política.

## BC. Plano de teste de segurança

Shadow mutando repositório autoritativo · dois governadores em Dual · fallback duplicando efeito ·
cutover perdendo Findings abertos · D2 transferido ao Codex · segundo repo vazando contexto · prova
legada tratada como nova · modo ambíguo após crash · falha de provider retornando silenciosamente a
comportamento legado inseguro · limitação de mesma conta escondida · capability `UNKNOWN` da qual a
segurança dependa · subagente writer aparecendo depois do Active.

## BD. Plano de teste de portabilidade

Bootstrap em `B` · perfil de segurança gerado para `B` · `eos` sem hardcoding de `A` · lease por
repositório · namespace de recurso · negativo cross-repo da §AN.

## BE. Plano de teste de rollback

**Níveis (§119), com nomenclatura questionada:** `SLICE_ROLLBACK` · `PROVIDER_FALLBACK` ·
`MODE_DEMOTION` · `RUNTIME_ROLLBACK` · `LEGACY_RESTORE`. Os cinco sobrevivem porque atuam em camadas
distintas; nenhum é sinônimo de outro.

**§120 — rollback ≠ `git reset`:** inclui autoridade de runtime, estado, efeitos colaterais, providers
e modo. **§121 — efeito destrutivo nem sempre é reversível:** não se promete rollback; usa-se
compensação, reconciliação ou intervenção manual conforme o contrato de efeito.

## BF. Cenários adversariais — os 20 da §164

| # | Cenário | Representação |
|---|---|---|
| 1 | Shadow Claude escreve no repo autoritativo | impossível por clone descartável (§O); worktree seria insuficiente — `F-MAR-058` |
| 2 | Saída do Shadow influencia o operador legado sem registro | Shadow **retrospectivo** torna causalmente impossível — `F-MAR-059` |
| 3 | D1 do Dual conflita com `APPROVED_FROZEN` | Authority Validator + precedência do PLAN-A → rejeitado |
| 4 | Dual escreve parcialmente e o fallback começa | proibido (§Z): Recovery primeiro |
| 5 | Efeito de API externa vira `AMBIGUOUS` | reconciliação; destrutivo → `NO_AUTOMATIC_FALLBACK_EXECUTION` |
| 6 | Codex rate-limited em Active | `health = DEGRADED`, modo inalterado (§AG) |
| 7 | Claude cai após mutação em Active | classificação do PLAN-D §AX; `WriteManifest` do Kernel |
| 8 | Verification indisponível em Active | nenhuma conclusão dependente de prova; **sem fallback para self-check** |
| 9 | Kernel reinicia durante transição de modo | `cutoverState` durável; `TRANSITIONING` resolve para o modo anterior (§AV) |
| 10 | Segundo repo recebe memória do Codex do primeiro | `F-MAR-009/010`; bloqueia Active (§AI) |
| 11 | Subagente do Claude aparece em Active | `F-MAR-051` é `MUST_RESOLVE_BEFORE_ACTIVE`; detecção por árvore de processo |
| 12 | Proof Plane detecta artefato de prova adulterado | demoção D0 para `NO_MUTATION` (§AW) |
| 13 | `H-MAR-001` melhora custo e piora correção | `correctness REFUTED` → **ACTIVE BLOCK** (§AY) |
| 14 | Custo de `H-MAR-001` indisponível | `UNAVAILABLE`, não bloqueia, **não vira zero** |
| 15 | O próprio fallback legado tem fraqueza conhecida | **`F-MAR-057`**: o legado aprova patch na worktree; fallback herda o risco, e isso é registrado, não escondido |
| 16 | Cutover conclui e o EOS novo se modifica | `RUNNING_EOS` vs `CANDIDATE_EOS`, sem hot rewrite (§AT) |
| 17 | Usuário não aprovou o cutover D2 | `ACTIVE_CUTOVER_READY` é prontidão técnica; promoção não ocorre (§AU) |
| 18 | Upgrade de provider invalida capability após Active | `CAPABILITY_REVALIDATION_REQUIRED`; bloqueia ou demove (§AT) |
| 19 | Evento de modo escrito e o processo morre antes de outros observarem | Journal é a verdade; projeção alcança no restart (`F-MAR-037`) |
| 20 | Segunda CLI inicia durante o cutover | `RepositoryRuntimeLease` → `ATTACH`/`WATCH`/rejeição; **nunca** segundo writer (§137) |

O cenário 15 é o que este plano descobriu ao ler o legado em vez de confiar no resumo.

## BG. Revisão de simplicidade

**Cortados:** `FALLBACK` como modo · `SAFE_MODE` como modo · `healthState` persistido · opção `D` de
Shadow · `LEGACY_READ_ONLY_REFERENCE` · tipos novos de artefato para Shadow (exceto
`SHADOW_COMPARISON_RECORD`) · self-hosting como pré-requisito do Active · segundo repositório como
projeto real · janela pós-Active por contagem de Runs · comandos novos de CLI.

**Mantido apesar de parecer excesso:** os cinco níveis de rollback (§BE) — atuam em camadas distintas
e nenhum é sinônimo; e a comparação em três vias (§P), porque duas vias comparam opiniões e três
comparam contra a verdade.

**Respostas diretas à §163:** cinco modos — não, quatro. `FALLBACK` — estado de autoridade.
`authorityMode` separado — sim, e é o que permite `NO_MUTATION` sem desmontar o modo. Claude real no
Shadow imediatamente — não, é o estágio `S3`. Comparação legada reduzível — sim, o Shadow retrospectivo
elimina a necessidade de rodar em paralelo. Self-hosting completo antes do Active — não. Fixture
pequena no segundo repo — suficiente. Janela pós-Active superformalizada — sim, virou requisito de
evidência.

## BH. Findings novos

| ID | Achado | Sev. | Bloqueia PLAN-F? | Shadow | Dual | Active | Owner |
|---|---|---|---|---|---|---|---|
| **`F-MAR-057`** | **Baseline legado incorreto no MAR-P1.** `MAR_ARCHITECTURE_AUDIT` §J afirma `OBSERVED` que a política do MCP nega patches; `tools/codex-policy/approval-policy.mjs:290-302` **aprova** patch na worktree, negando só caminho protegido. A governança escrita (`AGENTS.md`: *"Codex opera somente em leitura"*) é `ADVISORY` e diverge do mecanismo. Gap do sistema **atual** | HIGH | Não | Não | Não | Não | PLAN-F / legado |
| **`F-MAR-058`** | **Worktree é isolamento insuficiente para Shadow.** Compartilha object database e refs; sob `F-MAR-046` uma escrita em `.git` alcança o repositório autoritativo. Exige **clone descartável** | HIGH | Não | **Sim** | Não | Não | MAR-P17 |
| **`F-MAR-059`** | **Influência do Shadow é auto-reportada**, portanto `ADVISORY`, e a comparação concorrente é contaminada por construção. Resolvido por **Shadow retrospectivo** | MEDIUM | Não | Sim (desenho) | Não | Não | MAR-P17 |
| **`F-MAR-060`** | **Entrada legada iniciável diretamente = dois governadores em Dual.** A `RepositoryRuntimeLease` não cobre o legado, que não a conhece. Exige entrada única pelo Kernel e launcher ciente de lease | HIGH | Não | Não | **Sim** | Sim | MAR-P18 |
| **`F-MAR-061`** | **Controles legados não representados.** `settings.local.json` (`disableAllHooks`, `autoMemoryEnabled: false`, `disableClaudeAiConnectors`) e a cadeia de nove hashes do launcher não aparecem no envelope do PLAN-D nem no `RepositorySecurityProfile`. Migrar sem mapear perde controles reais | MEDIUM | Não | Não | Não | **Sim** | MAR-P19 |

## BI. `PLAN_A_CHANGE_REQUEST`

**Nenhum.** O modelo de modo cabe no protocolo de evento e nos artefatos existentes.

## BJ. `PLAN_B_CHANGE_REQUEST`

**Nenhum novo.** `PBCR-001`, `PBCR-002` e `PBCR-003` permanecem como estão. A entrada única do Dual
(§U) usa a `RepositoryRuntimeLease` já definida; o que muda é o **launcher legado**, que não é
artefato do PLAN-B.

## BK. `PLAN_C_CHANGE_REQUEST`

**Nenhum.** `WOULD_ACCEPT`/`WOULD_REJECT`/`WOULD_ESCALATE` do Shadow são resultados do Authority
Validator, não do plano cognitivo.

## BL. `PLAN_D_CHANGE_REQUEST`

`PDCR-001` mantido. Novo:

> **`PDCR-002`** — o `RepositorySecurityProfile` deve carregar a **cadeia de integridade do launcher**
> (os nove hashes pinados, `$expectedBranch`, `$expectedHead`, `Assert-NoReparsePoint` sobre worktree
> e perfil) e os **três controles de `settings.local.json`** (`disableAllHooks`, `autoMemoryEnabled`,
> `disableClaudeAiConnectors`), além de `permissions.defaultMode`. Motivo: `F-MAR-061` — são controles
> `OBSERVED` e ativos hoje que nenhum plano representou; migrar sem eles é perda silenciosa.
> Impacto: **aditivo**. **Bloqueia?** Não; bloqueia o Active.

## BM. `PLAN_E_CHANGE_REQUEST`

**Nenhum.** `LEGACY_PROOF_FORM_ONLY` (§J) é aplicação de `F-MAR-052`, não alteração do Proof Plane.

## BN. `PLAN_F_IMPLEMENTATION_GRAPH`

```
   legacy baseline      mode protocol      comparison metrics     second-repo fixture
   (corrigido §H)        (§G, durável)         (§P/§Q)                  (§AN)
         └───────────────────┴───────────┬───────┴────────────────────────┘
                                         │        ← quatro trilhas PARALELAS,
                                         │          nenhuma depende de provider
                                         ▼
                           capability probes (P9/P11)
                                         │
                                         ▼
                         shadow instrumentation (S1→S2→S3)
                                         │
                                         ▼
                              shadow comparison  →  SHADOW_EVALUATED
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
          single-entry Kernel     D1 authority scope    fallback drills
            (F-MAR-060)               (§W)                  (§Z)
                    └────────────────────┼────────────────────┘
                                         ▼
                                 DUAL_MODE_STABLE
                                         │
                    ┌────────────────────┼────────────────────┐
                    ▼                    ▼                    ▼
          active prerequisites    second repository      self-hosting
           (§AI/§AJ/§AK)              (§AN)            (degraus 1-2, §AS)
                    └────────────────────┼────────────────────┘
                                         ▼
                        ACTIVE_CUTOVER_READY  →  [D2 do usuário]
                                         ▼
                              post-active observation (§AX)
                                         ▼
                               LEGACY_DISABLE_READY
                                         ▼
                              LEGACY_REMOVAL_READY   (independente)
```

**Paralelismo real (§149):** baseline legado, protocolo de modo, métricas de comparação e fixture do
segundo repositório **não dependem de integração de provider** e podem ser preparados desde já.
Self-hosting (degraus 3–5) sai da linha crítica do Active e vira gate próprio.

## BO. Gates de fase

**Planejamento, satisfeitos agora:** `SHADOW_MIGRATION_MODEL_READY` · `DUAL_MIGRATION_MODEL_READY` ·
`ACTIVE_MIGRATION_MODEL_READY`.

**Futuros:** `SHADOW_MODE_OPERATIONAL` → `SHADOW_MODE_EVALUATED` · `DUAL_MODE_OPERATIONAL` →
`DUAL_MODE_STABLE` · `ACTIVE_CUTOVER_READY` → **[D2]** → `ACTIVE_MULTI_AGENT_OPERATIONAL` →
`ACTIVE_MULTI_AGENT_VERIFIED` · depois `SELF_HOSTING_READY` · `LEGACY_DISABLE_READY` ·
`LEGACY_REMOVAL_READY`.

O veredito final da §153 **não** é usado durante o planejamento.

## BP. `PLAN_F_EXPORT_CONTRACT`

Para o **PLAN-G**: modelo de modo em quatro dimensões · matriz de migração de autoridade · contrato do
Shadow (retrospectivo + isolamento por clone) · modelo de comparação em três vias · política de corte
de `H-MAR-001` · contrato de autoridade e de fallback do Dual · contrato de prontidão do Active ·
matriz de capability exigida · matriz de prova exigida · matriz de chaos exigida · matriz de
bloqueadores classificada · contrato de teste do segundo repositório · escada de self-hosting ·
contrato de cutover · contrato de demoção de emergência · gates de desativação e remoção do legado ·
contrato de observação pós-Active.

Também exportados (§170): todos os Findings em aberto `F-MAR-001` a `F-MAR-061` com a classificação de
migração da §C · `KR-005` e `KR-007` · todos os probes de capability pendentes · os quatro
`MUST_RESOLVE_BEFORE_ACTIVE` da §AL · os change requests `PBCR-001`, `PBCR-002`, `PBCR-003`,
`PDCR-001`, `PDCR-002` · as decisões D2 que a execução futura exigirá — **promoção a Active**,
mudança de threat model, autorização de staging e de produção, e a mudança do launcher legado exigida
por `F-MAR-060`.

## BQ. Riscos remanescentes de planejamento

O baseline legado foi corrigido em **uma** linha ao ser lido; **outras linhas da matriz do MAR-P1 não
foram reverificadas contra o código** neste plano — a reverificação completa é trabalho do
`MAR-P17`, e está declarada aqui em vez de presumida.

`F-MAR-057` é gap do sistema **atual** e não tem owner de correção neste plano: corrigi-lo é mudança
de política do MCP, que exige autorização do usuário e não pertence a uma fase de planejamento.

A entrada única do Dual depende de mudança no launcher, que é gitignored e específico da máquina —
logo é decisão e ação do usuário, não do EOS.

## BR. Estado do Git

`OBSERVED`: branch `fix/seguranca-criticos`, HEAD `30bf5453` — idêntico ao `.claude/expected-head.txt`.
Apenas documentação nova. Zero runtime, provider, MCP, launcher, perfil, modo, Shadow, Dual, cutover,
produto ou commit. Nenhum hash de integridade e nenhum conteúdo de credencial foi reproduzido neste
documento.

## BS. Gate

Os 26 critérios da §179 estão satisfeitos em planejamento — incluindo o 15º (limitação de mesma conta
explicitamente classificada, §AM), o 16º (`F-MAR-050` e `F-MAR-051` decididos e **não** minimizados,
§AL) e o 21º (desativação separada de remoção, §AQ). As 24 perguntas da §183 têm resposta formalizada
e testável, e nenhuma exige redesenho material durante `MAR-P17/P18/P19`.

**`PLAN_F_READY`** · `MAR-P17 PLANNED` · `MAR-P18 PLANNED` · `MAR-P19 PLANNED`

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-G — Integration Master Plan
```
