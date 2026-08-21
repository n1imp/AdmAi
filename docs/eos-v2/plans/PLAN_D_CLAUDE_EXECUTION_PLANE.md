# PLAN-D — Claude Execution Plane (MAR-P11 + MAR-P12 + MAR-P13)

**Run:** `EOS-RUN-20260808T030320Z` · **Estado:** `PLANNED` · **Data:** 2026-08-11

> Nada aqui está implementado. Marcações: `OBSERVED` (comando/arquivo/saída), `INFERRED`,
> `PROPOSED`, `UNKNOWN`. Nenhum componente é `IMPLEMENTED`, `OPERATIONAL` ou `PROVEN`.

---

## A. Escopo

Projetar o probe de capability do runtime Claude (`MAR-P11`), o adapter de execução (`MAR-P12`) e o
Execution Plane (`MAR-P13`) como **consumidores** do Kernel. Nenhum runtime iniciado, nenhuma config,
auth, perfil, launcher ou MCP mutado, nenhuma autoridade nova concedida.

## B. Importações do PLAN-A

`PLAN_A_EXPORT_CONTRACT` integralmente. Preservados: as seis `EnforcementClass` e **`MAR-INV-025`**;
o modelo de capability de sete estados; provenance de nove categorias; as vinte famílias de artefato e
sua mutabilidade; o protocolo de evento bidimensional; `MAR-INV-026`; snapshot, staleness e frontier
mínima; as quatro idempotências distintas; `WriteManifest` como `DETECTIVE`.

Herdadas em negrito e usadas o tempo todo neste plano: **`Authorization ≠ Enforcement ≠ Detection ≠
Coordination ≠ Verification`**, **`Capability Discovered ≠ Capability Proven`**, **`Single Writer ≠
Filesystem Containment`**, **`Slice Lease ≠ OS-level Write Restriction`**.

## C. Importações do PLAN-B

`PLAN_B_EXPORT_CONTRACT` integralmente. Consumidos sem recriar: Event Journal e integridade
`DETECTIVE`; projeções e `ProjectionCursor`; `MAR-INV-027` (Kernel opera sem provider);
`MAR-INV-028` (replay nunca reproduz efeito); domínios de verdade e a escada
`INTENDED → ATTEMPTED → OBSERVED → VERIFIED`; sete estados de efeito colateral; Plan Compiler e
`ExecutionGraph`; os **quatro eixos de estado de node** (`lifecycle · stage · blockingReason ·
outcome`); Scheduler determinístico e `MAR-INV-029`; `RepositoryRuntimeLease` com
`pid + processStartIdentity`; `SliceLease` `COORDINATION_ONLY`; Authority Validator; Recovery e
`MAR-INV-030`; hooks de recurso.

## D. Importações do PLAN-C

`PLAN_C_EXPORT_CONTRACT`. Reusados **sem duplicar**: o `Deterministic Context Broker` do Kernel
(`PBCR-001`) serve também à montagem do `ExecutionCapsule`; a fronteira de instrução
(`política confiável` acima de `evidência não confiável`); a regra de aprovação
`provider approval ≠ EOS approval`; `MAR-INV-031` (output de modelo nunca é estado autorizado);
`MAR-INV-034` (análise de modelo não é evidência); `F-MAR-045` (agente não escolhe o próprio papel).

O Codex é **consumidor** deste plano em dois pontos apenas: `D1_DECISION_PROPOSAL` quando a execução
descobre decisão material (§AG) e `RootCause` quando a correção falha repetidamente (§AW).

## E. Findings atribuídos

| Finding | Onde é tratado |
|---|---|
| `F-MAR-012` | §AL — intent durável + reconciliação observada |
| `F-MAR-013`, `F-MAR-025` | §AA — lease coordena; fencing em filesystem é `DETECTIVE` |
| `F-MAR-015` | §AU + §BR — meta-verificação quando `claude.eosMaintainer` altera o instrumento |
| `F-MAR-017` | §AK — escrita parcial |
| `F-MAR-019` | §O + §BI — conteúdo de repositório é dado, nunca norma |
| `F-MAR-021` | §AA — writer físico único e `RepositoryRuntimeLease` |
| `F-MAR-023` | §AE + §AX — o mundo é autoritativo sobre efeito |
| `F-MAR-026` | §AL + §AP — ambíguo destrutivo nunca auto-retenta |
| `F-MAR-027` | §Q — `SliceLease` não contém Bash |
| `F-MAR-028` | §AS — self-check não pode sujar o snapshot que valida |
| `F-MAR-030`, `F-MAR-041` | §J–§S — grau **e** escopo de capability |
| `F-MAR-031` | §O + §AR — autoridade nunca vem do payload |
| `F-MAR-034` | §AR + §BE — mapeamento aos quatro eixos |
| `F-MAR-036` … `F-MAR-040` | §BG (fakes sob o mesmo envelope), §AI (lag de projeção), §AA, §BQ |
| `F-MAR-042` | §V — aprovação auto-concedida |
| `F-MAR-043` | §J — revalidação de capability na criação de sessão |
| `F-MAR-044` | §AF + §AU — `EVIDENCE_CANDIDATE` no construtor |
| `F-MAR-045` | §Z — o EOS determina o papel |

## F. Premissas

Congeladas dos planos anteriores e não reabertas: EOS governa; Codex cognitivo; Claude executivo;
Verification independente; **writer físico único** nesta fase; D2 do usuário; portabilidade
multi-repositório como alvo.

## G. Não-objetivos

Adapter implementado; runtime Claude novo iniciado; instalação do SDK; mutação de launcher, auth,
perfil, `CLAUDE_CONFIG_DIR` ou MCP; `ExecutionCapsule` implementada; múltiplos writers; código de
produto; migration; desativação do fluxo atual (é do PLAN-F); Verification (é do PLAN-E).

---

## H. Papel do Claude no EOS

`CLAUDE = EXECUTION PLANE`. Responsável por: inspeção do repositório necessária à execução,
implementação, refatoração, implementação de testes, depuração, correção, implementação de
integração, migration autorizada, invocação autorizada de build/lint/typecheck, e contribuição de
fatos ao Proof Ledger.

**Não é:** Governor, Scheduler, Plan Compiler, autoridade D1 ou D2, autoridade de Verification,
fechador de Finding, autoridade de arquitetura, de contrato ou de Environment Gate.

Dois princípios que atravessam todo o documento:

```
Execution Capability  ≠  Execution Authority
Execution Authority   ≠  Execution Containment
```

O primeiro diz que o Claude ser tecnicamente capaz não significa que o EOS autorizou. O segundo diz
que autorizado não é contido — a operação ainda precisa ser classificada pela `EnforcementClass`
**real** do caminho por onde ela acontece.

**`MAR-INV-035` — o executor nunca é a fonte autoritativa sobre o que ele próprio mudou.** Toda
afirmação do executor sobre mutação é `EVIDENCE_CANDIDATE`; o estado observado do repositório é a
autoridade. Este invariante é a resposta direta a `F-MAR-050` (§BM).

---

## I. MAR-P11 — candidatos de runtime

`OBSERVED` — `npm ls -g`: `@anthropic-ai/claude-code@2.1.225`, `@openai/codex@0.144.1`, `ctx7@0.5.7`.
`claude --version` → `2.1.225 (Claude Code)`.

| Candidato | Estado | Razão |
|---|---|---|
| **Claude Code CLI headless** — `-p/--print`, `--output-format json\|stream-json`, `--input-format stream-json`, `--session-id <uuid>`, `--json-schema`, `--max-budget-usd` (`OBSERVED`) | **`DISCOVERED` — único a probar** | Presente, dirigível por processo, saída estruturada e validável por schema, identidade de sessão atribuível pelo EOS |
| Background agents — `--bg`, `claude agents --json` (`OBSERVED`) | **Não é candidato separado** | Mesmo binário, mesma superfície de permissão; é **modo de vida do processo**, decidido pelo adapter. Tratá-lo como segundo candidato duplicaria a matriz sem diferença de garantia |
| Claude Agent SDK local | **`UNAVAILABLE`** | `OBSERVED`: ausente do `npm ls -g`. Instalar é dependência nova e exige autorização. Reavaliar só se o probe refutar o headless |
| Cloud/remoto — `--cloud`, `--environment ccpool_…` (`OBSERVED`) | **`DEFERRED`** | Move a worktree para fora da máquina do usuário; muda ambiente, rede e superfície de secret. É matéria de D2, não escolha técnica |
| Sessão Claude atual | **Desqualificado** | Seria o orquestrador executando a si mesmo — o executor viraria o próprio Governor |

Quatro categorias conceituais colapsam em **um runtime a probar** e três disposições declaradas.

## J. Matriz de probe de capability

Sete estados do PLAN-A. Flag anunciada no `--help` produz no máximo `DISCOVERED`.

| Capability | Estado | Probe | Oráculo positivo | Oráculo negativo | Bloqueia |
|---|---|---|---|---|---|
| Processo headless dirigível | `DISCOVERED` (`-p` `OBSERVED`) | executar em fixture | resultado no stdout, exit 0 | — | P12 |
| Saída estruturada | `DISCOVERED` (`--output-format json`, `--json-schema`) | schema deliberadamente violado | resultado conforme | **saída fora do schema é rejeitada, não aceita** | P12 |
| Identidade de sessão atribuída pelo EOS | `DISCOVERED` (`--session-id <uuid>`) | passar UUID conhecido | sessão usa o UUID | provider ignora e cria outro | P12 |
| Leitura de filesystem | `DISCOVERED` | ler arquivo do escopo | conteúdo correto | leitura fora do escopo **falha** | P11 |
| **Escrita — file tool** (`Edit`/`Write`) | **`UNKNOWN`** | §S | arquivo permitido muda | **arquivo proibido não muda** | **P13** |
| **Escrita — shell** (`Bash`) | **`UNKNOWN`** | §R | comando permitido roda | **redirecionamento fora do escopo falha** | **P13 — `F-MAR-041`** |
| **Escrita — patch/apply** | **`UNKNOWN`** | §S | patch aplicado no escopo | patch fora do escopo rejeitado | **P13** |
| **Escrita — subprocesso filho** | **`UNKNOWN`** | §R | — | **filho de comando permitido não escreve fora** | **P13** |
| Restrição de diretório (`--add-dir`) | `DISCOVERED` | acessar fora do dir | acesso dentro funciona | **acesso fora falha por tool e por shell** | P13 |
| Restrição de tool (`--tools`, `--allowedTools`, `--disallowedTools`) | `DISCOVERED` | pedir tool negada | tool permitida funciona | **tool negada não executa** | P13 |
| Visibilidade de aprovação (`--permission-mode`) | **`UNKNOWN`** | §V | pedido chega ao adapter | **auto-concedida sem chegar** | **P13 — `F-MAR-048`** |
| Rede | `UNKNOWN` | §T | requisição autorizada funciona | requisição não autorizada falha | P13 |
| Interrupção | `UNKNOWN` | sinal durante execução | processo termina | continua escrevendo após sinal | P12 |
| Semântica de crash | `UNKNOWN` | matar no meio da escrita | exit code observável | escrita continua após morte | P12 |
| Resume | `DISCOVERED` (`--resume`, `--fork-session`) | §Y | contexto preservado | retoma sob snapshot obsoleto | — (fora do MVEP) |
| Isolamento entre repositórios | **`UNKNOWN`** | §W | B não vê A | **contexto de A visível em B** | P13 |
| Rate limit informado | `UNKNOWN` | provocar limite | estado exposto | silencioso | P13 |
| Telemetria de uso | `UNKNOWN` | inspecionar `--output-format json` | uso exposto | ausente → `UNAVAILABLE` | — |
| Teto de gasto (`--max-budget-usd`) | `DISCOVERED` | orçamento minúsculo | execução para no teto | ultrapassa silenciosamente | — |
| Persistência desligável (`--no-session-persistence`) | `DISCOVERED` | executar e inspecionar perfil | nada gravado em `sessions/` | grava mesmo assim | P13 |

**`F-MAR-043` aplicado:** revalidação não é só no boot. Mudança de versão do CLI, de `--settings`, de
plugin, de agente ou de política dispara `CAPABILITY_REVALIDATION_REQUIRED`, verificado **ao criar
cada sessão**.

## K. Oráculos positivos e negativos

Regra geral: **capability material ao Execution Plane exige os dois**. O positivo prova que o caminho
funciona; o negativo prova que o caminho proibido **realmente falha e não deixa resíduo**.

Para escrita, o oráculo negativo tem três verificações obrigatórias, nesta ordem: (1) a operação
retorna erro; (2) o filesystem não mudou — fingerprint idêntico; (3) o Git não mudou — nem working
tree, nem index, nem untracked. Falhar (1) e passar (2)(3) é `POLICY_ENFORCED`. Passar (1) e falhar
(2) é **`CAPABILITY_CLAIM_REFUTED`**, e o caminho é reclassificado para `DETECTIVE` ou `NONE`.

Ausência de oráculo negativo mantém a capability em `PROBED`, nunca `PROVEN`.

## L. Critérios de seleção do runtime

Ordenados; os quatro primeiros são **eliminatórios**.

1. **O EOS controla a identidade da sessão** — sem isso não há correlação confiável entre Slice,
   evento e resultado.
2. **A saída é estruturada e validável por schema** — narrativa livre não é `ExecutionResult`.
3. **A superfície de tool é restringível por papel** — sem isso `allowedChangeScope` é só um comentário.
4. **Aprovação é observável pelo EOS, ou desnecessária por pré-autorização** — `F-MAR-048`.
5. Crash e exit são observáveis.
6. Recurso é mensurável, ou declarado `UNAVAILABLE` sem virar `0`.
7. Estado do provider é isolável por repositório.
8. O executor não é o próprio orquestrador.

**Se nenhum candidato satisfizer 1–4:** `CLAUDE_RUNTIME_CAPABILITY_GAP`, com capacidades ausentes,
propriedades exigidas, mitigações possíveis e fase bloqueada. **Não se adapta o EOS para baixo em
silêncio** — reduzir proteção para caber no runtime disponível é decisão do usuário, não do plano.

---

## M. `ExecutionRuntimeAdapter`

O contrato canônico, compartilhado por `FakeClaude` (PLAN-B) e pelo futuro `ClaudeRuntimeAdapter`.
Cada método candidato da §15 foi questionado:

| Método | Veredito |
|---|---|
| `capabilities` | **Mantido** — absorve `health` e `rateLimitStatus`, como no PLAN-C |
| `createSession` | **Mantido** — recebe o `SecurityContext` e o `sessionId` atribuído pelo EOS |
| `execute` | **Mantido** — recebe `ExecutionCapsule`, devolve `ExecutionResult` |
| `stream` | **Mantido** — eventos normalizados (§AQ) |
| `interrupt` | **Mantido** — §BB lista sete gatilhos reais |
| `stop` | **Mantido** — encerramento ordenado de sessão |
| `revalidateCapabilities` | **Mantido** — `F-MAR-018`/`F-MAR-043` |
| `start` | **Removido** | 
| `handshake` | **Removido** |
| `resumeSession` | **Diferido** |

`start` e `handshake` existem no plano cognitivo porque o Codex é um processo longo que hospeda
sessões. No runtime executivo headless o processo **é** a execução; manter os dois métodos seria
simetria com o Codex sem consumidor — exatamente o que a §15 manda cortar. Ciclo de vida do processo
passa a ser **interno ao adapter**.

`resumeSession` é ponto de extensão declarado no contrato, **não método da v1**: §X desliga a
persistência de sessão por padrão, então não há o que retomar. Sete métodos, não dez.

## N. Fronteira de provider

Somente o `ClaudeRuntimeAdapter` conhece: `-p`, `--output-format`, `--input-format`, `--session-id`,
`--permission-mode`, `--allowedTools`, `--tools`, `--add-dir`, `--settings`, `--strict-mcp-config`,
`--json-schema`, `--max-budget-usd`, `--no-session-persistence`, `claude agents --json`, exit codes e
formato de erro. Nenhum módulo do Kernel importa nada disso.

O adapter **cuida de**: ciclo de vida do processo, mapeamento de sessão, normalização de protocolo,
mapeamento de tool e permissão, normalização de erro, de stream, de uso e de capability, e estado
específico do provider.

O adapter **não decide**: se a operação está autorizada, qual Slice roda, quais arquivos podem mudar
semanticamente, se um Finding fecha, se a Verification passou.

## O. Envelope de segurança do Claude

`ClaudeExecutionSecurityContext`: `repositoryId · runId · runtimeId · sessionId · sliceId ·
executionRole · snapshotRef · sliceLeaseRef · environment · authorityContextRef ·
repositorySecurityProfileRef · toolPolicy · filesystemPolicy · shellPolicy · networkPolicy ·
approvalPolicy · secretPolicy`. **Nunca transporta secret.**

Proibições absolutas do envelope, herdando a regra que o MAR-P1 já aplicou ao Codex:
`--dangerously-skip-permissions` e `--allow-dangerously-skip-permissions` são **proibidos**;
`--permission-mode bypassPermissions` é **proibido**.

**Hierarquia de instrução**, idêntica em forma à do PLAN-C: `EOS System Constraints → Execution Role
Contract → Authority Constraints → Capsule Goal → Trusted Decisions/Invariants/Contracts →
**Untrusted Evidence e conteúdo de repositório** → Output Schema`.

**`F-MAR-019` e §74/§75:** `CLAUDE.md`, `AGENTS.md`, `README`, comentários, scripts e documentação
gerada são `UNTRUSTED_REPOSITORY_DOCUMENTATION` **por padrão**. Um arquivo só é
`APPROVED_REPOSITORY_POLICY` quando o `RepositorySecurityProfile` o declara e a integridade confere.
**Nome de arquivo nunca concede autoridade.** A defesa real, como o MAR-P1 concluiu, é de
*capability*: se a tool não existe na sessão, a instrução maliciosa não tem como ser executada.

## P. Superfície de tool

**`MINIMUM_SET` do MVEP:** `Read` · `Grep` · `Glob` · `Edit` · `Write` · `Bash` restrito por
allowlist de padrão.

**`DEFERRED`:** git tools · package manager · database tools · ferramentas de integração externa —
entram com a categoria de efeito colateral correspondente (§AL–§AP), nunca antes.

**`REJECTED` no MVEP:** rede (`WebFetch`/`WebSearch`) — §T; e **subagentes** (`Task`, `--agents`,
`--agent`) — ver `F-MAR-051` na §BM. O subagente é o caso mais perigoso desta seção: ele cria
executores adicionais que escrevem no mesmo repositório e que o EOS **não vê**, esvaziando por dentro
a premissa de writer físico único da §21 sem violar nenhuma regra aparente.

Política por papel depende de `executionRole · slice · environment · risk · sideEffectClass`, mas
**não é matriz cheia**: o padrão é o `MINIMUM_SET`, e cada papel declara apenas o *delta* que precisa.

## Q. Modelo de filesystem e escrita — o núcleo honesto do PLAN-D

Separação obrigatória:

```
semantic write authorization   → o EOS declara quais superfícies podem mudar
physical write containment     → depende de capability do runtime/SO realmente PROVEN
```

`OBSERVED`, decisivo: em `claude --help` (v2.1.225) a palavra `sandbox` aparece **duas vezes**, ambas
na frase *"Recommended only for sandboxes with no internet access"* — descrevendo um sandbox
**externo** dentro do qual rodar o Claude. **Não existe flag `--sandbox`.** O Codex expõe
`-s/--sandbox <read-only|workspace-write|danger-full-access>`; o Claude não expõe equivalente.

> **A assimetria:** o plano **cognitivo**, que não precisa escrever, tem primitiva de contenção mais
> forte disponível que o plano **executivo**, que escreve de verdade. É `F-MAR-046`.

Classificação por caminho — nenhuma classe elevada sem probe:

| Caminho de escrita | Melhor classe disponível |
|---|---|
| `Edit`/`Write` (file tool) | `POLICY_ENFORCED` **pendente de probe** — check em processo |
| `Bash` direto | `POLICY_ENFORCED` **apenas no casamento da string** — `F-MAR-047` |
| Subprocesso filho de comando permitido | **`UNKNOWN`, esperado `NONE`** |
| Fora de `--add-dir` | `UNKNOWN` por tool; **`NONE` por shell** |
| `SliceLease` | **`COORDINATION_ONLY`** — `F-MAR-027` |
| Fencing sobre filesystem | **`DETECTIVE`** — `F-MAR-025` |
| `WriteManifest` e fingerprint pós-escrita | **`DETECTIVE`** |

**`MAR-INV-025` aplicado:** o PLAN-D não pode descrever nenhuma dessas garantias como mais forte que
sua classe comprovada, e nenhuma está `PROVEN` hoje.

## R. Modelo de shell

Classificação **antes** da execução: `READ_ONLY · REPOSITORY_MUTATING · ENVIRONMENT_MUTATING ·
EXTERNAL_MUTATING · DESTRUCTIVE · UNKNOWN`. `UNKNOWN` **não é auto-executado** em contexto sensível;
exige classificação explícita, como os tipos de efeito do PLAN-B (que não têm `OTHER`).

**`F-MAR-047`:** `--allowedTools "Bash(git *)"` (`OBSERVED` na documentação da própria flag) casa a
**string do comando**, não o **efeito**. `git reset --hard`, `git clean -fdx`, `git push --force` e
`git checkout -- .` passam todos no mesmo padrão. Um allowlist sintático sobre um risco semântico é
`POLICY_ENFORCED` quanto à forma e `NONE` quanto à consequência. Por isso a §AM move mutação de Git
para efeito mediado pelo EOS, e não para padrão de allowlist.

Comando é permitido somente quando `authority` **e** `environment` **e** `sideEffectPolicy` **e**
`securityProfile` permitirem. **O Claude sugerir um comando não autoriza o comando.**

## S. Modelo de edit direto e patch

Três caminhos distintos, três probes distintos, pela lição do `F-MAR-041`: `Edit`/`Write` (ferramenta
de arquivo), aplicação de patch, e escrita via shell. Provar um **não** prova os outros.

Fixture de probe: repositório descartável com arquivo permitido, arquivo proibido dentro do repo,
caminho fora do repo, e um arquivo protegido do `RepositorySecurityProfile`. Cada caminho é tentado
contra cada alvo, e o resultado alimenta a matriz da §J. Nove combinações, uma tabela de Evidence.

## T. Modelo de rede

`DISCOVERED ≠ PROVEN`. Rede é capability **separada** e não decorre de o processo ter acesso à
internet do usuário. Padrão do MVEP: **negada**. Resolução de pacote (§AN) é o primeiro caso legítimo
e entra por tarefa autorizada, com a categoria de efeito correspondente — nunca por conveniência.

## U. Modelo de secret

`ExecutionCapsule` **nunca carrega secret bruto**; carrega `secretRef`. Injeção, quando necessária,
é do ambiente sob política.

`OBSERVED`, sem leitura de conteúdo: `~/.claude-admai/.credentials.json` existe (504 B). Consequência
para o envelope: o diretório de perfil entra em `protected paths`, e nenhuma sessão de execução recebe
tool de leitura sobre ele. Secret só é entregue quando **exigido**, **autorizado**, com **ambiente
apropriado** e **escopo limitado**. O PLAN-E aprofunda a verificação de manuseio.

## V. Modelo de aprovação do provider

`OBSERVED`: `--permission-mode` aceita `acceptEdits · auto · bypassPermissions · manual · dontAsk ·
plan`.

**`F-MAR-048`:** quatro desses modos concedem sem interação. Se a concessão não chega ao adapter, o
EOS **não vê a decisão que autorizou a mutação** — o mesmo defeito que o `F-MAR-042` levantou para o
Codex, aqui com modos documentados e fáceis de ligar.

Política: `provider approval ≠ EOS approval`, sempre. Os únicos modos admissíveis são os que (a)
expõem o pedido ao adapter, ou (b) são tão restritos que nenhuma aprovação chega a ser necessária
porque a tool simplesmente não está na sessão. O probe decide qual dos dois é alcançável. Adapter que
não souber interpretar um pedido → **DENY**. Fail closed, sem fallback permissivo.

## W. Isolamento de estado do runtime

`provider identity ≠ repository execution context` — `MAR-INV-023A`, agora aplicado ao Claude.

`OBSERVED` (somente nomes e tamanhos): `~/.claude-admai/` contém `projects/`, `sessions/`,
`file-history/`, `shell-snapshots/`, `tasks/`, `plans/`, `session-env/`, `settings.json`,
`.claude.json` (42.959 B) e **`history.jsonl` (17.391 B)** — todos **por perfil, não por
repositório**. `telemetry/` está **vazio**.

**`F-MAR-049`:** `history.jsonl` é arquivo plano na raiz do perfil, cross-repository por construção —
o análogo Claude do `F-MAR-009`/`F-MAR-010`, que a auditoria só havia observado no lado do Codex.
Se `projects/` e `sessions/` são particionados por caminho é `UNKNOWN` e faz parte do probe.

Estratégia de `CLAUDE_CONFIG_DIR` — **`PENDING_MAR_P11_PROBE`**, três alternativas ordenadas, iguais
em forma às do PLAN-C: (A) identidade compartilhada + estado por repositório, **preferida** se o probe
confirmar; (B) auth compartilhada + perfil de estado isolado/efêmero, **fallback**; (C) perfil
totalmente isolado, aceitável com custo de duplicação de auth.

Oráculo de isolamento: executar em `Repository A`, depois em `B`; `B` não pode observar sessão, goal,
histórico, referência de arquivo, decisão ou continuação de `A`. Vazamento bloqueia integração ativa.

## X. Modelo de sessão

**Slice-scoped**, `sessionId` atribuído pelo EOS via `--session-id <uuid>` (`OBSERVED`), e
`--no-session-persistence` (`OBSERVED`) como **padrão**.

Três consequências, todas simplificações reais:

1. Contexto de Slice antigo não contamina Slice novo — por construção, não por disciplina.
2. `session lost ≠ Slice lost` (§63) fica trivialmente verdadeiro: **não há sessão a perder**.
   A recuperação reconstrói de repositório, journal, `WriteManifest`, efeitos e snapshot — nunca da
   sessão do provider.
3. Contexto crescente indefinidamente (§60) deixa de ser um risco a administrar.

Sessão de correção **não** reusa a sessão da implementação: a correção parte de um `FindingRef` e de
um snapshot novo.

## Y. Resume e invalidação de sessão

`--resume` e `--fork-session` existem (`OBSERVED`), mas **resume está fora do MVEP**. Se um probe
futuro mostrar necessidade, a habilitação passa por: validação de snapshot, de lease, de validade da
Capsule e de compatibilidade do `RUN_RUNTIME_MANIFEST`.

**`MAR-INV-032` do PLAN-C vale aqui sem alteração:** o provider poder retomar não significa que o EOS
deva retomar.

## Z. Modelo de papel de execução

`OBSERVED` no roster atual (`tools/eos/engineering/responsibility.mjs`): treze áreas — `backend ·
frontend · data · mobile · security · integration · performance · accessibility · observability ·
release · testInfrastructure · externalIntegrations · eosMaintainer` — mais variantes de concern.

**Papel não é processo, não é sessão, não é executor físico.** É **política dentro da
`ExecutionCapsule`**: superfície de tool, `allowedChangeScope`, reviewer exigido, `sideEffectPolicy`,
política de ambiente. Custa um registro de política, não um runtime. Por isso os treze permanecem sem
custo de implementação distinta, e o PLAN-D **não cria tipo novo de papel**.

**`F-MAR-045` aplicado:** o Execution Router é determinístico do EOS e usa `Surface · Concern ·
ChangeIntent · RequiredCapability · Ownership · Risk · Slice` — o vetor que o roster já implementa.
**Não se pergunta ao Claude qual papel ele quer assumir.**

Duas regras preservadas: atribuição de papel **não elimina Required Reviewer**, especialmente em
`security`, `data`, `integration` e `release`; e `claude.securityImplementation` **pode implementar**
correção de segurança e **não pode certificá-la** — `Verification` é de outro plano.

`claude.eosMaintainer` pode alterar o EOS, mas alteração no Verification Runner, no Authority System,
no Security Envelope ou no Journal exige **meta-verificação** (`F-MAR-015`, `MAR-INV-020`).

## AA. Modelo de writer físico

`maxPhysicalWriters = 1` para mutações do repositório; Claude é o único execution writer físico
inicialmente. Isso reduz corrida write-write, conflito de merge e ambiguidade de mutação entre Slices.

**Não elimina:** escrita fora de escopo, leitor com estado obsoleto, escrita parcial, escrita por
subprocesso — e, acrescentado por este plano, **escrita por subagente** (`F-MAR-051`).

`maxPhysicalWriters=1` é `COORDINATION_ONLY` no escalonamento; só vira `HARD_ENFORCED` quando houver
mecanismo de SO `PROVEN`. Multi-writer futuro (§91) permanece **apenas ponto de extensão**: exigiria
worktrees isoladas, política de integração, estratégia de merge, enforcement de lease de writer e
tratamento de conflito, nenhum deles com necessidade comprovada. Concorrência de escrita **não** é
aumentada para otimizar tempo.

`--worktree` (`OBSERVED`) é a única primitiva que daria separação real de diretório sem SO, mas move
o repositório e colide com o binding de `RepositorySnapshot`. **`DEFERRED` para o multi-writer**, não
usado no MVEP.

---

## AB. `ExecutionCapsule`

`capsuleId · capsuleVersion · repositoryId · runId · sliceId · snapshotRef · sliceLeaseRef ·
executionRole · goal · allowedChangeScope · forbiddenChangeScope · inputArtifacts · evidenceRefs ·
decisionRefs · invariantRefs · contractRefs · architectureRefs · acceptanceCriteria ·
testRequirements · verificationRequirements · knownRisks · sideEffectPolicy · environmentPolicy ·
resourceBudget`, mais `correctionOf` opcional (§AV).

**Montada pelo `Deterministic Context Broker`** do Kernel (`PBCR-001`), não por um modelo.

## AC. Escopo da Capsule

O Claude **não recebe** a conversa de planejamento, o raciocínio do Codex nem o histórico do
repositório. Recebe o necessário à execução.

`allowedChangeScope` transporta o escopo autorizado; **o executor não pode ampliá-lo**. Descoberta de
necessidade nova durante a execução emite `SCOPE_EXPANSION_REQUIRED` com justificativa, superfície
pretendida e evidência — e **para**, aguardando o EOS.

`forbiddenChangeScope` é explícito e sempre inclui, no mínimo: `protected paths` do perfil, o
diretório do Journal do EOS, `WriteManifest`, checkpoints e o diretório de perfil do provider.

§39 é respeitada: não se exige lista perfeita de arquivos antes da inspeção quando isso for
artificial; exige-se **superfícies esperadas** e um pedido explícito para expandir.

## AD. Validação de snapshot

Antes de qualquer mutação: `FRESH · STALE_UNRELATED · STALE_RELEVANT · UNKNOWN`.

`STALE_RELEVANT` → **não executar**. `UNKNOWN` → **bloqueia** (`EOS-P12`). `STALE_UNRELATED` →
continua, desde que a **frontier mínima de invalidação** do PLAN-A prove independência; a
independência é *computada*, não presumida.

## AE. Observação pré-execução

O executor confirma a realidade mínima necessária antes de mutar — arquivos alvo, símbolos, estado do
Git, config relevante, testes relevantes — **conforme a Capsule**. Não refaz auditoria completa; não
refaz arquitetura, planejamento, análise de impacto ou raciocínio de contrato (§107) sem
`EVIDENCE_CONFLICT` ou pedido explícito.

## AF. `EVIDENCE_CONFLICT`

`expected · observed · affectedArtifactRefs · affectedSlice · snapshotRef · severity ·
evidenceCandidate`.

Observação do executor **não vira Evidence autoritativa**: produz `EVIDENCE_CANDIDATE`, e o Evidence
System registra e normaliza. **`F-MAR-044` aplicado no construtor** — o artefato `EvidenceRecord`
recusa estruturalmente `producer = execution runtime` sem passar pelo normalizador. Provenance de
execução: `EXECUTION_OBSERVATION`, jamais `OBSERVED_EVIDENCE` direto.

Se a divergência significar que o **plano** está errado: `PLAN_DEFECT_CANDIDATE`. O EOS decide
invalidação e replanejamento; **o executor não replaneja o Run** (§109, §BK-16).

## AG. Descoberta de dependência de decisão

`DECISION_DEPENDENCY_FOUND`. `D0` → o EOS resolve deterministicamente. `D1` → Codex Decision Analyst,
pelo caminho do PLAN-C, com o Authority Validator no meio. `D2` → usuário, `WAITING_USER`, **nunca**
resolução automática.

O executor **não decide acima da própria autoridade local**, e o silêncio nunca é uma escolha
implícita.

## AH. Autoridade local de implementação

Permitido dentro da Capsule: nome de variável local, extração de helper pequeno, detalhe equivalente
de implementação, estrutura de fixture local.

Proibido sem decisão: arquitetura, contrato compartilhado, comportamento de produto além do objetivo
aprovado, política de segurança, `TestContract`, invariante, decisão registrada.

Microdecisão local é **`EPHEMERAL`** — não polui o Decision Registry. Se a escolha ultrapassar o
Slice, vira `DURABLE_DECISION_CANDIDATE`, com os critérios de promoção já congelados no PLAN-A §G.

---

## AI. `WriteManifest`

Ciclo: `PLANNED_WRITES → PRE_WRITE_SNAPSHOT → OBSERVED_WRITES → POST_WRITE_STATE →
COMPLETE | PARTIAL | DIVERGENT`.

**`PBCR-002` (§BO):** o **produtor é o Kernel**, não o executor. `preWriteFingerprints` derivam do
`RepositorySnapshot` já computado — sem re-hash independente, que seria duplicação — e
`observedWrites` e `postWriteFingerprints` são computados pelo Kernel a partir do filesystem e do Git,
**nunca aceitos do executor**. `MAR-INV-035`.

Leitura decisória do manifesto vai ao journal ou exige cursor alcançado — `F-MAR-037` vale aqui como
vale no scheduler.

`EnforcementClass: DETECTIVE`. Não contém; evidencia e recupera.

## AJ. Escrita fora de escopo

Arquivo mutado fora de `allowedChangeScope` → `OUT_OF_SCOPE_WRITE`: Finding, caminho de Recovery, e o
Slice **não pode ser tratado como verificado**. Não se aceita porque "a implementação funcionou".

**Limite declarado:** a detecção é `DETECTIVE`. Prevenção dura só será alegada se um probe a provar —
§Q diz que hoje não há mecanismo para isso no runtime observado.

## AK. Escrita parcial

`F-MAR-017`. Três de sete arquivos escritos e o runtime cai → **`PARTIAL_EXECUTION`**, nunca
`FAILED → retry cego`.

Não se finge transação ACID sobre filesystem. O que existe: conjunto de mutação observado,
`WriteManifest`, snapshot antes e depois, e registros de efeito — suficiente para recuperação, e
honesto sobre o que é. Rollback **não** é automático; avalia-se `continue · restore · supersede ·
manual` conforme reversibilidade.

## AL. Efeitos colaterais

Nenhum efeito relevante sem `SideEffectIntent` correspondente. Os oito tipos do PLAN-B, sem `OTHER`.
Fluxo: `DURABLE_INTENT → EXECUTE → OBSERVE REALITY → RECONCILE`. **Nunca** retry por ausência de
registro de conclusão sem observar a realidade (`F-MAR-012`).

`AMBIGUOUS + (DESTRUCTIVE | IRREVERSIBLE)` → **`NO_AUTOMATIC_RETRY`**. O Execution Plane **não ganha
exceção** a essa regra (`F-MAR-026`).

## AM. Mutações de Git

**Mediadas pelo EOS**, não liberadas por padrão de allowlist — a razão está na §R: `Bash(git *)` casa
string, não efeito. `commit`, `reset` destrutivo, `clean`, `checkout --`, `push` e `rebase` exigem
authority, intent durável e, quando destrutivos, aprovação explícita. Observação pós-efeito consulta
o **Git**, não o output do comando (`F-MAR-023`).

## AN. Gerência de pacotes

Quatro efeitos distintos, não um: mutação de declaração de dependência, mutação de lockfile,
download/cache, instalação no nível do sistema. Tratar tudo como "escrita de arquivo" perderia os
dois últimos. Rede é capability separada (§T); `AGENTS.md` já exige confirmação de ambiente e
autorização antes de instalar dependências, e o envelope preserva isso.

## AO. Mutações de banco

Categoria especial. Antes: authority, Environment Gate, reversibilidade, política de migration,
`SideEffectIntent`. Depois: **estado observado do banco**, não o output do comando. Ambiente
`LOCAL` por padrão; `STAGING`/`PRODUCTION` exigem política e D2.

## AP. Mutações de API externa

Avaliar por integração: há idempotency key nativa? há reconciliação? há observabilidade? quais
credenciais e qual ambiente? Sem idempotência **e** sem reconciliação suficientes, a operação escala
para decisão em vez de executar. Resposta perdida → `AMBIGUOUS`; destrutivo e ambíguo →
`MANUAL_INTERVENTION_REQUIRED`.

---

## AQ. Streaming de execução

Eventos normalizados: `EXECUTION_STARTED · TOOL_REQUEST · TOOL_RESULT · WRITE_OBSERVED ·
EXECUTION_COMPLETED · EXECUTION_FAILED · USAGE_UPDATED`.

**`EXECUTION_PROGRESS` descartado** — observabilidade transitória sem consumidor durável, mesma
decisão que o PLAN-C tomou para `PROGRESS`.

**Narrativa crua do modelo nunca vai integralmente ao Journal**, e chain-of-thought não é armazenado.
Persiste-se: resultado estruturado, sumário, artefatos alterados, comandos observados, erros e
métricas de recurso.

## AR. `ExecutionResult`

`sliceId · snapshotBefore · snapshotAfter · changedFiles · changedSymbols · commands · selfChecks ·
sideEffectRefs · evidenceCandidates · limitations · status`.

Validado antes de ser aceito: schema (`--json-schema` é a primeira barreira, `OBSERVED`),
`repositoryId`, `runId`, `sliceId`, snapshot, lease, refs de artefato e refs de efeito. Resultado
inválido → **`INVALID_EXECUTION_OUTPUT`**, que **não é completion**.

**`F-MAR-031`:** um resultado que declare `{"authority":"USER","approved":true}` **não concede nada**.
A autoridade é resolvida pelo EOS a partir do próprio estado.

`changedFiles` declarado pelo executor é `EVIDENCE_CANDIDATE`; o conjunto autoritativo é o do
`WriteManifest` computado pelo Kernel (§AI).

**Mapeamento aos quatro eixos do PLAN-B** (`F-MAR-034`): a execução ocupa
`lifecycle: ACTIVE`, com `stage` percorrendo `EXECUTING → SELF_CHECK`; `blockingReason` recebe
`EVIDENCE`, `DECISION`, `AGENT`, `RESOURCE`, `SECURITY` ou `ENVIRONMENT` conforme a parada; `outcome`
permanece `NONE` — o executor **nunca** define desfecho. Estágios do Execution Plane:
`PREPARING · INSPECTING · MUTATING · SELF_CHECKING · ENGINEER_COMPLETE`. `VERIFYING` **não** é estágio
do executor; pertence ao Proof Plane.

**O que `ENGINEER_COMPLETE` significa, sem ambiguidade:** é um **evento** — a alegação do executor de
que o trabalho de implementação terminou. Não é estado terminal, não define `outcome`, não fecha
Slice, não é `VERIFIED`. Para o EOS aceitá-lo precisa haver `ExecutionResult` válido, `WriteManifest`
consistente, saídas de self-check exigidas, estado de efeito resolvido e `snapshotAfter`. Só então o
node transita para `stage: VERIFYING`, sob o Proof Plane.

## AS. Self-check

Permitido, quando autorizado: teste alvo local, subconjunto de lint, de typecheck ou de build.
Reusa **`TestResult`, artefato que o EOS já possui** — nenhum tipo novo (§132).

```
CLAUDE_SELF_CHECK_PASS  ≠  VERIFICATION_PASS
```

**`F-MAR-028` aplicado ao executor:** self-check que suja a worktree (coverage, temporários,
snapshots) invalidaria o snapshot que ele deveria sustentar. Ou o comando roda sem sujar, ou suas
saídas são declaradas fora do `relevantFilesFingerprint`. Sem uma das duas, o self-check não conta.

## AT. Fronteira do Test Contract

O executor pode **escrever testes conforme** o `TestContract`. Não pode enfraquecê-lo, remover
requisito de aceite que está falhando, silenciar teste para obter verde, nem alterar comportamento
esperado de produto sem decisão.

Se a execução demonstrar que o contrato está errado: **`TEST_CONTRACT_CONFLICT`** — nunca alteração
silenciosa. O owner externo revisa.

## AU. Contribuição ao Proof Ledger

O executor produz **fatos**: arquivos alterados, comandos executados, resultados de self-check,
limitações conhecidas, `snapshotAfter`. O `ProofLedger` final é artefato do EOS/Verification.

`F-MAR-015`: quem mantém o instrumento não é seu único certificador. Isso vale duplamente quando o
papel é `claude.eosMaintainer`.

## AV. Finding e correção

O executor pode criar `FINDING_CANDIDATE`. **Não fecha Finding** — só Verification fecha.

`CORRECTION_REQUEST`: `findingRef · currentSnapshot · ownerRole · requiredCorrection ·
forbiddenChanges · retestRequirements`.

**`CorrectionCapsule` é rejeitado como tipo separado** (§132): é `ExecutionCapsule` com `correctionOf`
e `forbiddenChangeScope` preenchidos. Mesmo contrato, menos tipos.

Correção age na **menor camada responsável**. O executor não usa um Finding local como oportunidade
para refatoração grande, reescrita de arquitetura ou limpeza não relacionada.

## AW. Escalada de causa raiz

Correção falhando repetidamente → **`ROOT_CAUSE_REQUIRED`**, e o EOS encaminha ao modo Root Cause do
Codex (PLAN-C §Y–§AI). O executor **não aumenta o próprio escopo** para "resolver de vez". As guardas
de laço do PLAN-B (`maxRetry · maxRecoveryAttempt · maxReconciliationAttempt · maxReplan`) governam a
transição para `ESCALATION_REQUIRED`.

---

## AX. Recuperação de crash

Crash do processo executor **≠** falha do Slice. Antes de qualquer reexecução, o EOS **observa a
realidade**: Git, filesystem, `WriteManifest`, registros de efeito, estado de processo.

Classificação: `NOT_STARTED · NO_MUTATION_OBSERVED · PARTIAL_MUTATION ·
MUTATION_COMPLETE_RESULT_MISSING · AMBIGUOUS_SIDE_EFFECT · FAILED_CONFIRMED`.

Política de restart: **`observe → classify → reconcile → decide`**. Nunca "crashou → reenvia o
prompt". `MAR-INV-030`: falha de agente não é falha de Run.

## AY. Recuperação de sessão

Com `--no-session-persistence` como padrão (§X), sessão perdida é o caso comum e **não é evento
notável**: a reconstrução usa repositório, journal, `WriteManifest`, efeitos, snapshot e
`ExecutionCapsule`. Nenhuma recuperação depende de estado interno do provider — o que também protege
contra `F-MAR-049`.

## AZ. Rate limit

`AVAILABLE · RATE_LIMITED · UNAVAILABLE · DEGRADED`. `RATE_LIMITED` é **disponibilidade
operacional**, não Finding e não falha de Run. Nodes mutantes dependentes esperam; cognição do Codex
continua; o Kernel continua (`MAR-INV-027`).

## BA. Indisponibilidade do provider executivo

`EXECUTION_PROVIDER_UNAVAILABLE`. **Não se promove Codex a writer. Não se promove Verification a
executor.** Somente trabalho não dependente continua. Simétrico ao `MAR-INV-033` do PLAN-C, agora no
sentido inverso.

## BB. Interrupção e cancelamento

Gatilhos: Run cancelado, Slice superseded, snapshot ficou materialmente obsoleto, violação de
segurança, autoridade revogada, Environment Gate mudou, consumo descontrolado de recurso.

**Interrupção durante escrita é o caso crítico: interromper não é fazer rollback.** Depois de
interromper: observar o repositório, atualizar o `WriteManifest`, classificar o estado parcial.

Cancelamento distingue `TURN_CANCELLED · SESSION_CANCELLED · SLICE_CANCELLED · RUN_CANCELLED`, e
**cancelamento não apaga efeito já produzido**.

## BC. Hooks de recurso

Emissão apenas; consumo é do PLAN-E. Duração de sessão, wall time de execução, chamadas de tool,
comandos de shell, mutações de arquivo, self-checks, retries, tentativas de correção, bytes de
contexto, uso quando disponível, tempo ocioso e de espera.

Cada campo carrega `MEASURED · ESTIMATED · UNAVAILABLE · NOT_APPLICABLE`. **`UNAVAILABLE` nunca vira
`0`.**

## BD. Hooks de `H-MAR-001`

**Claude Execution Focus** — conceito, fórmula **não congelada**:

```
numerador   = trabalho de execução (inspeção necessária, mutação, teste, depuração, self-check)
denominador = trabalho total do Claude no Run
```

Também emitidos: retrabalho, pesquisa repetida, replans solicitados, rodadas de correção, findings
originados na execução, bytes de contexto, chamadas de tool, wall time.

**Revisão honesta de `F-MAR-020`:** `~/.claude-admai/telemetry` está vazio (`OBSERVED`), o que
sustenta a previsão de `UNAVAILABLE` para `tokenEfficiency` e `monetaryCost`. Mas `--max-budget-usd` e
o corpo de `--output-format json` são fonte **distinta e `UNKNOWN`** — custo pode vir a ser `MEASURED`
em headless. Isso é **refinamento da previsão, não refutação**; a decisão fica com o probe da §J.

## BE. MVEP — Minimum Viable Execution Plane

Menor conjunto que comprova `EOS governa + Claude executa + escopo é rastreado + estado é
recuperável`:

* **um** papel de execução — `claude.backend`, superfície já exercitada por `DOG-001`;
* **um** Slice mutante, real;
* `ExecutionCapsule` + validação de snapshot;
* `WriteManifest` computado **pelo Kernel**;
* `ExecutionResult` validado por schema;
* **um** self-check alvo;
* **um** drill de recuperação: matar o processo no meio da escrita e reconciliar.

**Fora do MVEP, explicitamente:** loop de correção, papéis além de um, efeitos além de
`FILESYSTEM_WRITE`, resume de sessão, rede, subagentes, worktree por Slice. O roster completo só é
ativado **depois** do MVEP provado (§140).

---

## BF. Plano de teste — `MAR-P11`

`CL-CAP-*` (uma família por linha da §J) · `CL-RUNTIME-*` (candidatos, lifetime, crash) ·
`CL-SEC-PROBE-*` (as nove combinações caminho × alvo da §S) · `CL-ISO-*` (A→B, perfil, history) ·
`CL-AUTH-*` (visibilidade de aprovação, modos proibidos).

Cobertura mínima da §111: leitura de filesystem, escrita de filesystem, comando de shell de leitura,
mutação por shell, mutação por file tool, mutação por patch, restrição de diretório de trabalho,
rede, interrupção, resume, isolamento de sessão, rate limit, telemetria de uso, visibilidade de
aprovação.

## BG. Plano de teste — `MAR-P12`

`CL-ADAPTER-*` · `CL-CONF-*` · `CL-STREAM-*` · `CL-ERR-*` · `CL-SESSION-*`.

**`CL-CONF-*` é a suíte de conformidade compartilhada:** `FakeClaude` do PLAN-B e o
`ClaudeRuntimeAdapter` real satisfazem **o mesmo** contrato canônico — mesma interface, mesmos erros
normalizados, mesma semântica de ciclo de vida, mesmo schema de resultado. Diferença de provider fica
atrás do adapter. `F-MAR-036` preservado: **o fake roda sob o mesmo envelope de segurança do real**;
fake com filesystem livre provaria o Kernel sob condições que a produção não terá.

## BH. Plano de teste — `MAR-P13`

`CL-EXEC-*` · `CL-CAPSULE-*` · `CL-WRITE-*` · `CL-SIDEFX-*` · `CL-CORR-*` · `CL-REC-*` · `CL-ROLE-*`.

Positivos: Capsule válida com snapshot fresco e Slice autorizado → execução prossegue, escopo
respeitado, `WriteManifest` completo, `ExecutionResult` válido (§113). Mudança não relacionada no
snapshot → continua quando a frontier mínima prova independência (§115).

Negativos: Capsule stale relevante → **nenhuma mutação** (§114). Papel lógico tentando ampliar
capability automaticamente → negado; `claude.release` **não** implica autoridade de deploy (§127).

## BI. Plano de teste de segurança

Escrita fora de escopo (§116) — detectar, classificar, bloquear gate, recuperar; **sem alegar
prevenção dura enquanto o probe não provar**. Bypass por Bash (§117). Escrita por subprocesso filho.
Escrita cross-repo. Spoof de autoridade (§124). Capsule stale. Auto-aprovação do provider (§V).
Vazamento de secret. Instrução não confiável do repositório (§125). Rede não controlada. Mutação de
banco sem intent. Mutação de Git sem authority. Contaminação de sessão (§126). E o teste que fecha a
seção: **o provedor de execução tentando virar Governor de fato**.

Oráculo negativo de escrita, sempre em três verificações (§K): erro retornado, filesystem inalterado,
Git inalterado.

## BJ. Plano de teste de recuperação

Crash do processo · perda de sessão · restart do EOS · escrita parcial · resultado perdido · lease
obsoleto · rate limit. Cada um exige `observe → classify → reconcile → decide`, e nenhum admite
retry cego.

## BK. Cenários adversariais — os 16 da §134

| # | Cenário | Representação |
|---|---|---|
| 1 | Escreve arquivo não listado com Capsule fresca | `OUT_OF_SCOPE_WRITE` → Finding; Slice não verifica (§AJ) — **detecção**, não prevenção |
| 2 | Usa Bash para escrever fora do escopo | classificação de comando (§R) + `WriteManifest`; classe real declarada em §Q |
| 3 | Subprocesso continua após expiração do lease | `F-MAR-025`/`F-MAR-027`: **detectado, não contido**; limite declarado |
| 4 | Termina 3 de 7 arquivos e cai | `PARTIAL_EXECUTION` (§AK); sem retry cego |
| 5 | Conclui a mudança e o `ExecutionResult` se perde | `MUTATION_COMPLETE_RESULT_MISSING` (§AX); reconstrói do repositório |
| 6 | Descobre D2 no meio da implementação | `DECISION_DEPENDENCY_FOUND` → `WAITING_USER` (§AG) |
| 7 | Tenta editar o `TestContract` | `TEST_CONTRACT_CONFLICT` (§AT); violação de política |
| 8 | README manda fazer deploy | `UNTRUSTED_REPOSITORY_DOCUMENTATION` (§O); sem elevação; a tool de deploy nem existe na sessão |
| 9 | Runtime anuncia sandbox e o edit tool ignora | é exatamente `F-MAR-041`/`F-MAR-046`: três probes separados (§S) |
| 10 | Resume sobre snapshot stale | resume fora do MVEP (§Y); habilitação exige validação |
| 11 | Aprovação auto-concedida sem callback | `F-MAR-048` (§V); modos permissivos proibidos pelo envelope |
| 12 | Rate-limited enquanto o Codex continua | §AZ; Run não falha |
| 13 | Claude indisponível e há trabalho cognitivo | §BA; nenhuma promoção de plano |
| 14 | Resultado declara `VERIFICATION PASS` | `CLAUDE_SELF_CHECK_PASS ≠ VERIFICATION_PASS` (§AS); campo inexistente no schema |
| 15 | Migration executada e a conexão cai antes do resultado | `AMBIGUOUS` (§AO/§AP); destrutivo → `MANUAL_INTERVENTION_REQUIRED` |
| 16 | Papel tenta ampliar a própria autoridade | papel é política da Capsule (§Z); `F-MAR-045`; roteamento é do EOS |

## BL. Revisão de simplicidade

**Cortados:** `start` e `handshake` do adapter executivo · `resumeSession` diferido ·
`CorrectionCapsule` como tipo próprio · `EXECUTION_PROGRESS` · artefato novo de self-check (reusa
`TestResult`) · background agents como candidato separado · re-hash independente em
`preWriteFingerprints` · matriz cheia de tool por papel (só o *delta*) · persistência de sessão ·
`--worktree` por Slice no MVEP.

**Mantido apesar de parecer excesso:** as **quatro** linhas separadas de escrita na matriz da §J —
file tool, shell, patch, subprocesso. `F-MAR-041` mostrou que provar uma não prova as outras, e §Q
mostra que aqui não há sandbox para cobrir nenhuma delas.

**Respostas diretas às perguntas da §132:** `CorrectionCapsule` separado — não. Todos os papéis
lógicos necessários — sim, porque custam política e não runtime. Sessão persistente — não.
Todas as tools diretas — não; alto impacto é mediado (§79/§80). Categorização de efeito complexa
demais — não, os oito tipos vêm do PLAN-B e cada um tem estratégia de idempotência distinta.
`ExecutionCapsule` com dado duplicado — não, após derivar fingerprints do snapshot.
Self-check com artefato novo — não. `WriteManifest` duplicando Snapshot — não: snapshot é identidade
do repositório, manifesto é intenção e observação por Slice.

## BM. Findings novos

| ID | Achado | Sev. | Bloqueia PLAN-D? | Owner |
|---|---|---|---|---|
| **`F-MAR-046`** | **Assimetria de contenção.** `OBSERVED`: `claude --help` v2.1.225 não expõe flag de sandbox; as duas ocorrências de "sandbox" recomendam rodar o Claude *dentro* de um sandbox externo. O plano que escreve tem primitiva mais fraca que o plano que só lê. Toda contenção de escrita do Claude é `POLICY_ENFORCED` na melhor hipótese e `UNKNOWN` para subprocesso | HIGH | Não | MAR-P11 |
| **`F-MAR-047`** | **Allowlist sintático sobre risco semântico.** `--allowedTools "Bash(git *)"` casa a string do comando, não o efeito: `git reset --hard`, `git clean -fdx`, `git push --force` e `git checkout -- .` passam no mesmo padrão | HIGH | Não | MAR-P13 |
| **`F-MAR-048`** | **Aprovação auto-concedida.** `--permission-mode` aceita `acceptEdits`, `auto`, `dontAsk` e `bypassPermissions`; nesses modos o EOS pode não ver a decisão que autorizou a mutação. Análogo Claude do `F-MAR-042`, com modos documentados | HIGH | Não | MAR-P11 |
| **`F-MAR-049`** | **Estado de perfil cross-repository.** `~/.claude-admai/history.jsonl` (17.391 B, `OBSERVED`) é arquivo plano na raiz do perfil; `projects/`, `sessions/`, `file-history/`, `shell-snapshots/` são por perfil. Análogo do `F-MAR-009`/`F-MAR-010`, que a auditoria só observou no Codex | MEDIUM | Não | MAR-P11 |
| **`F-MAR-050`** | **O executor pode forjar a própria prova.** Executor e Kernel rodam sob a mesma conta; o executor tem acesso de escrita ao Journal, checkpoints e `WriteManifest` do EOS. `F-MAR-038` disse que a integridade do journal é `DETECTIVE`; aqui isso deixa de ser abstrato. Correção: caminhos do EOS em `forbiddenChangeScope` e `protected paths`, e **o Kernel computa o manifesto em vez de aceitá-lo** | HIGH | Não | MAR-P12/P13 |
| **`F-MAR-051`** | **Subagentes criam writers invisíveis.** `--agents`, `--agent` e a tool de subagente (`OBSERVED` no CLI) permitem que o executor gere executores adicionais que escrevem no mesmo repositório e que o EOS não vê — esvaziando por dentro `maxPhysicalWriters = 1` sem violar nenhuma regra aparente. Correção: subagentes fora do `MINIMUM_SET`, negados pelo envelope no MVEP | HIGH | Não | MAR-P13 |

`F-MAR-046` e `F-MAR-051` são os dois que mais mudam o desenho: o primeiro porque proíbe qualquer
linguagem de contenção física para o Claude, o segundo porque é a única forma descoberta de burlar o
writer único **sem** burlar nenhuma regra escrita.

`MAR-INV-035` (§H) nasce de `F-MAR-050` e é o invariante novo deste plano.

## BN. `PLAN_A_CHANGE_REQUEST`

**Nenhum.** As seis `EnforcementClass` cobriram todos os caminhos de escrita observados;
`POLICY_ENFORCED` descreve corretamente um check em processo, e `UNKNOWN` cobre o subprocesso.

## BO. `PLAN_B_CHANGE_REQUEST`

> **`PBCR-002`** — o **produtor do `WriteManifest` é o Kernel**, não o executor. Motivo: `F-MAR-050`
> e `MAR-INV-035` — o executor não pode ser a fonte autoritativa sobre o que ele próprio mudou. O
> PLAN-B §Q definiu os campos e não atribuiu produtor. Artefato afetado: contrato do `WriteManifest` e
> do Side Effect Coordinator. Impacto de compatibilidade: **aditivo** — nenhum campo muda, apenas
> ganha `producer: EOS_KERNEL` e a regra de que `observedWrites` e `postWriteFingerprints` são
> computados do filesystem. **Bloqueia?** Não; bloqueia a implementação do `MAR-P13`, não este plano.

## BP. `PLAN_C_CHANGE_REQUEST`

**Nenhum.** O `Deterministic Context Broker` (`PBCR-001`) já é componente do Kernel e serve à
montagem da `ExecutionCapsule` sem alteração de contrato.

## BQ. `PLAN_D_IMPLEMENTATION_GRAPH`

```
                 Runtime candidate evaluation (§I)
                              │
        ┌──────────┬──────────┼──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼
   lifecycle   write-path  isolation  approval   resource
     probe       probe×4     probe      probe      probe     ← paralelos
        └──────────┴──────────┼──────────┴──────────┘
                              ▼
                    capability model + report
                              ▼
                  RUNTIME SELECTION BY EVIDENCE          ← fecha MAR-P11
                              │
                              ▼
                        Adapter core
                       /            \
              session mapping    security mapping
                       \            /
                     conformance CL-CONF-*                ← fecha MAR-P12
                              │
                              ▼
                     Execution Capsule
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   Write/WriteManifest integration    SideEffect integration
              └───────────────┬───────────────┘
                              ▼
                            MVEP                          ← §BE
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
     Correction + Recovery            Execution Roles (roster)
              └───────────────┬───────────────┘
                              ▼
                    resource instrumentation              ← fecha MAR-P13
```

Os cinco probes são **paralelizáveis** — não há dependência entre eles, e o probe de caminho de
escrita já contém quatro variantes internas independentes. A ordem `P11 → P12 → P13` só é verdadeira
nos três joins marcados; tudo o mais tem paralelismo real.

## BR. Gates de fase

**Planejamento, satisfeitos agora:** `CLAUDE_RUNTIME_PROBE_MODEL_READY` · `CLAUDE_ADAPTER_MODEL_READY`
· `CLAUDE_EXECUTION_MODEL_READY`.

**Execução futura:**
`CLAUDE_RUNTIME_SELECTED_BY_EVIDENCE` — os quatro critérios eliminatórios da §L satisfeitos com
oráculo positivo e negativo, e nenhum caminho de escrita descrito acima da classe comprovada.
`CLAUDE_ADAPTER_OPERATIONAL` — sete métodos, `CL-CONF-*` completa contra fake e real, erros
normalizados, sessão atribuída pelo EOS, crash observável.
`CLAUDE_EXECUTION_PLANE_OPERATIONAL` — MVEP provado, `WriteManifest` produzido pelo Kernel,
`OUT_OF_SCOPE_WRITE` detectado em teste, escrita parcial recuperada em drill real,
`CLAUDE_SELF_CHECK_PASS ≠ VERIFICATION_PASS` provado por teste, e meta-verificação exercitada quando
o papel for `claude.eosMaintainer`.

## BS. `PLAN_D_EXPORT_CONTRACT`

Para **PLAN-E**: `ExecutionResult` · fatos candidatos ao `ProofLedger` · semântica de self-check e a
fronteira `implementação completa ≠ verificação completa` · `WriteManifest` e `snapshotAfter` ·
semântica de `EvidenceConflict` e `EVIDENCE_CANDIDATE` · semântica de correção e retest ·
`ROOT_CAUSE_REQUIRED` · estados de crash e recuperação · hooks de recurso · **resultados de probe de
segurança exigidos antes de qualquer alegação de contenção** · fronteira de meta-verificação para
`claude.eosMaintainer`.

Para **PLAN-F**: como o Claude participa do Shadow Mode · o que muda no Dual · quando o fluxo atual
permanece fallback · como a autoridade de execução é transferida · o que a indisponibilidade do
provider faz com o cutover · critérios de Active Mode do lado executivo.

Contrato comum a ambos: `ExecutionRuntimeAdapter` (sete métodos) · `ExecutionCapsule` ·
`ExecutionResult` · integração do `WriteManifest` · interface de execução de efeito colateral ·
papéis de execução · ciclo de vida de sessão · `OutOfScopeWrite` · `DecisionDependencyFound` ·
contrato de capability do runtime Claude.

## BT. Dependências futuras

Seleção de runtime → `PENDING_MAR_P11_PROBE` · estratégia de `CLAUDE_CONFIG_DIR` →
`PENDING_MAR_P11_PROBE` · contenção dura de escrita → depende de mecanismo `PROVEN` que **hoje não
existe no runtime observado** · `SnapshotId` congelado antes do `MAR-P6` (herdado do PLAN-B) ·
`F-MAR-028` aprofundado no PLAN-E · instalação do Agent SDK, se um dia necessária, é autorização do
usuário.

## BU. Estado do Git

`OBSERVED`: branch `fix/seguranca-criticos`, HEAD `30bf5453`. Apenas documentação nova. Zero runtime,
zero auth, zero perfil, zero launcher, zero MCP, zero produto, zero commit. Nenhum conteúdo de
`.credentials.json` foi lido — apenas a existência e o tamanho do arquivo foram observados.

## BV. Gate

Os 31 critérios da §153 estão satisfeitos em planejamento. As 24 perguntas da §157 têm resposta
formalizada e testável no documento, e nenhuma exige redesenho durante `MAR-P11/P12/P13`.

**`PLAN_D_READY`** · `MAR-P11 PLANNED` · `MAR-P12 PLANNED` · `MAR-P13 PLANNED`

```
NEXT_ALLOWED_PLANNING_BLOCK:
PLAN-E — Proof + Resilience (MAR-P14 + MAR-P15 + MAR-P16)
```
