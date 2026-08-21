# 06 — Estado da implementação do EOS V2

**EOS Run:** `EOS-RUN-20260808T030320Z` · **Branch:** `fix/seguranca-criticos` · **HEAD:** `30bf5453`
**Claude Code:** 2.1.225 (re-baseline com proveniência verificada)

> Este documento distingue **implementado e verificado** de **especificado** e de **não feito**.
> Nada aqui está marcado como pronto sem o comando que o provou.

---

## 1. Achado que definiu a forma da implementação

`disableAllHooks: true` é uma decisão aprovada, não um resíduo. Quatro fontes independentes:

| Fonte | Evidência |
|---|---|
| `TARGET_ARCHITECTURE.md` — critérios de prontidão | *"a arquitetura estará pronta somente quando… hooks mutáveis, browser e memória automática estiverem desligados"* |
| `TARGET_ARCHITECTURE.md` — configuração | *"auto memory desligada e hooks desligados"* |
| `CHANGE_PLAN.md` — tabela de decisões do gate | *"Desligar auto memory/hooks no AdmAi · **Sim** · se negada: fonte de verdade e zero mutação não são atendidos"* |
| `.claude/settings.local.json` | `disableAllHooks: true`, **hash pinado** pelo launcher |

**Consequência:** o EOS V2 é implementado como **módulos executáveis + contratos versionados**, nunca
como hooks ou plugins. Fazê-lo por hook exigiria reverter uma decisão do usuário, quebrar um hash
pinado e reproduzir a causa de morte do EOS legado.

**Efeito colateral favorável, medido:** custo de contexto permanente = **0 B**. Os módulos rodam por
`node` quando invocados; nenhum ocupa a janela de contexto de toda sessão.

---

## 2. O que está implementado e verificado

| Componente | Arquivo | Bytes | Verificação | Resultado |
|---|---|---|---|---|
| **Risk Vector + níveis L0–L3** | `tools/eos/risk/classify.mjs` | 13.272 | `node tools/eos/risk/verify.mjs` | **14/14 PASS** |
| Oráculo externo de risco | `tools/eos/risk/fixtures.json` | 7.023 | escrito **antes** do classificador | — |
| **Artifact Registry + Proof Ledger** | `tools/eos/proof/validate.mjs` | 6.188 | `node tools/eos/proof/verify.mjs` | **13/13 PASS**, 12 negativos |
| **Tool Router** | `tools/eos/router/tools.mjs` | 4.576 | ST-06, ST-07, ST-07b, ST-08 | **PASS** |
| **Finding System + Router + Correction Loop** | `tools/eos/verification/findings.mjs` | 4.984 | ST-09, ST-16 a ST-19 | **PASS** |
| **Self-test mestre** | `tools/eos/selftest/run.mjs` | 10.395 | `node tools/eos/selftest/run.mjs` | **20/20 PASS** |
| Sonda do Serena | `tools/eos/selftest/serena-probe.mjs` | — | execução real | **PASS** |

### 2.1 Risk System

Nove dimensões em escala 0–3. **Composição não é soma** — soma permitiria que muitas dimensões
baixas simulassem risco alto, e diluiria uma dimensão crítica entre irrelevantes. As regras:

1. Dimensão crítica saturada (`security`, `data`, `reversibility`, `environment` = 3) → **L3 sozinha**.
2. Duas dimensões críticas ≥ 2 → L3.
3. Incerteza máxima → L2. **Nunca reduz.**
4. Matéria reservada ao usuário → L2 no mínimo.
5. Alcance transversal → L2.

**Direção de falha declarada:** na dúvida, escala. Subclassificar entrega menos escrutínio do que o
risco exige — falha grave. Superclassificar custa tokens — falha leve. O runner separa as duas.

**Os dois casos que provam que a palavra-chave deixou de decidir** (§24 do contrato):

| Caso | Pedido | Nível | Por quê |
|---|---|---|---|
| RF-09 | *"Altere o **texto** do aviso de consentimento de coleta de dados pessoais"* | **L3** | "texto" não rebaixou: domínio juridicamente protegido sobrevive à ação cosmética |
| RF-10 | *"Corrija o erro de digitação na palavra `'autenticacao'` no título da página de ajuda"* | **L0** | "autenticação" não escalou: menção entre aspas, em superfície de documentação |

### 2.2 Proof System

**Texto livre não é prova.** O validador rejeita `funciona`, `testei`, `está ok` como narrativa, e
exige que toda prova aponte para uma das sete origens: `command`, `test`, `log`, `diff`, `scanner`,
`environment`, `artifact`. Prova do tipo `command` exige `producedBy` com o comando exato.

Doze caminhos negativos, todos bloqueados: prova ausente · teste falho · invariante falho · Finding
bloqueante aberto · narrativa como prova · invariante sem resultado · invariante aprovado sem prova ·
nenhum teste executado · escopo não declarado · origem fora do catálogo · `securityResult=PASS` sem
prova · campo obrigatório ausente.

O validador é pessimista por construção: `status: VERIFIED` sem sustentação retorna
`effectiveStatus: BLOCKED`. **Silêncio nunca vira aprovação.**

### 2.3 Verification System — parcial

Implementado: as 14 categorias exatas de Finding, o Finding Router determinístico, o Correction Loop
com porteiro de autoridade, e a escalada por reincidência (mesmo Finding, contador sobe, nunca
duplica).

As cinco proteções da §21 do contrato estão ativas e testadas: Engineer não fecha o próprio Finding ·
Verification não fecha sem evidência de reteste · critério de aceite não é alterável · contrato de
teste não é enfraquecível · decisão de produto não é do loop.

---

## 3. Medição que corrigiu uma regra minha

A sonda do Serena (`serena-probe.mjs`, JSON-RPC direto, sem gastar tokens de sessão) mediu o lado que
faltava — e **refutou a regra de roteamento que eu havia escrito**.

| Símbolo | Grep (usos) | Serena (definição) |
|---|---|---|
| `MODELOS_ESCOPADOS` | 481 B · 3 ocorrências · 0% ruído | **241 B** · `Constant` · `db/tenant.js:23-33` |
| `registrar` | 1.816 B · 93% ruído | **240 B** · `Function` · `services/auditoria.js:3-29` |
| `pode` | 6.937 B · 84% ruído | **240 B** · `Function` · `services/permissoes.js:131-135` |

A regra anterior — *"símbolo distintivo → Grep, símbolo comum → Serena"* — estava errada na premissa.
As duas ferramentas **não respondem a mesma pergunta**: Grep devolve *onde é usado*, Serena devolve
*onde é definido*, com tipo e faixa de linhas exata. Regra corrigida:

| Necessidade | Ferramenta | Justificativa medida |
|---|---|---|
| **Definição** de símbolo | Serena `find_symbol` | ~240 B, menor que Grep **mesmo para símbolo distintivo** |
| **Usos** de símbolo distintivo | Grep | 481 B, 0% de ruído, cobre todos os sítios |
| **Usos** de símbolo curto/comum | Serena `find_referencing_symbols` | Grep devolve 84–93% de falso positivo |

---

## 4. Fase 0 — dívidas fechadas

### T-01 — fechado, sem falsificar atestado

O `.update.lock` continha o PID 6008. Uma checagem ingênua o daria como **vivo** — e teria
bloqueado a remoção indevidamente. O PID havia sido **reciclado**: pertencia ao `Cursor.exe`,
iniciado às 23:06:33, **3h13m depois** de o lock ser criado às 19:53:24. Três provas independentes
de que era órfão: processo original inexistente · PID reciclado · arquivo abriu em modo exclusivo,
logo nenhum processo o mantinha.

Removido o lock, o **updater oficial** (`claude update`) foi reexecutado e escreveu ele próprio o
atestado — `version_from: 2.1.224`, `version_to: 2.1.225`. **Nenhum valor de atestado foi escrito à
mão.** Proveniência de 2.1.225 verificada antes do re-pin: `sha512` do tarball igual ao
`dist.integrity` publicado, e `claude.exe` extraído (287.053.472 B) bit-idêntico ao instalado.

`start-baseline.ps1 -PreflightOnly` → **exit 0**.

### T-02 — fechado parcialmente

Sonda do Serena: **PASS**. O servidor expõe 21 ferramentas; as **6 da allowlist estão presentes** e
respondem. Medição obtida (§3).

`NÃO EXECUTADO`: o teste negativo de allowlist no nível do launcher — verificar que uma ferramenta
Serena fora das 6, ou outro MCP, **falha fechado** dentro de uma sessão real. Exige subprocesso
`claude` autenticado; não executado nesta sessão.

---

## 5. O que **não** foi implementado

| Fase | Componente | Estado |
|---|---|---|
| **3** | Engineering Roster (12+ Engineers como Skills) | **Não implementado.** Especificado em `03` §3 e `05` |
| **3** | Contract Bus | **Não implementado** |
| **4** | Verification Engineer como agente (Change Contract → Test Contract) | **Não implementado.** Só o Finding System existe |
| **4** | Ratificação L3 pelo Codex | **BLOQUEADO** — ver §6 |
| **5** | Knowledge System (9 componentes) | **Não implementado** |
| **6** | EOS Router completo (Impact Graph) | **Parcial** — Risk Vector e Tool Router existem; falta Impact Graph |
| **§42–44** | Dogfooding em mudança real do AdmAi | **Não executado** |

---

## 6. Decisão material bloqueada

**`EOS-V2-D04-CORRECTION-LOOP-AUTHORITY`** — quem pode alterar um critério de aceite depois de um
Finding aberto?

Consulta ao Codex DECISOR emitida e **recusada por limite de uso da conta**. Conforme `AGENTS.md`:
*"Se Codex estiver indisponível, uma decisão material fica bloqueada. Não existe fallback
silencioso."*

**Estado atual da implementação:** opção conservadora — nega a **todos**, inclusive ao Verification
Engineer. Um critério errado exige novo ciclo com `SPEC_DEFECT` ou `TEST_DEFECT`, não correção dentro
do loop que ele governa. A proteção está de pé; o que falta é a **ratificação do gate L3**, não a
proteção.

Reduzir essa proteção exigiria decisão do usuário, não do Claude.

---

---

# PARTE II — continuação do mesmo Run (2026-08-08)

Mesmo `EOS-RUN-20260808T030320Z`. Estado de entrada revalidado antes de escrever: 9 artefatos
presentes, 3 suites reexecutadas e passando, pin sem drift. **Zero divergências.**

## 8. Fases 3 e 5 — implementadas e verificadas

| Componente | Arquivo | Verificação |
|---|---|---|
| Engineering Roster (13 papéis) | `tools/eos/engineering/roster.mjs` | ENG-01…ENG-10 |
| Execution Slice + ownership | `tools/eos/engineering/slice.mjs` | ST-22, ST-26, ST-27 |
| Execution Router | `tools/eos/engineering/router.mjs` | **ENG 10/10** |
| Contract Bus | `tools/eos/engineering/contract-bus.mjs` | ST-23, ST-24, ST-25 |
| Knowledge (8 registros) | `tools/eos/knowledge/registries.mjs` | ST-29, ST-30 |
| Knowledge Loader (slicing) | `tools/eos/knowledge/loader.mjs` | ST-28, ST-34 |

**Slicing medido** — registro completo 9.125 B:

| Nível | Fatia | Fração |
|---|---|---|
| L0 | **620 B** | 6,8 % |
| L1 | 2.562 B | 28,1 % |
| L2 | 4.097 B | 44,9 % |
| L3 | 4.939 B | 54,1 % |

É P01 medido em bytes: o custo do contexto cresce com o risco, não com o tamanho do registro.

## 9. Ratificação L3 — **obtida**

`EOS-V2-D04-CORRECTION-LOOP-AUTHORITY`, Codex DECISOR, thread `019fdf77`:
**`RESULTADO: CONCORDO`**, `CONFIANCA: ALTA`. Opção A confirmada — ninguém altera critério de aceite
dentro do Correction Loop, nem o Verification Engineer.

Codex exigiu um teste que não existia: *"um `TEST_DEFECT` deve permitir corrigir o teste, mas
continuar negando `changeAcceptanceCriterion` e `weakenTestContract`"*. Implementado como **ST-33**.

`L3_INDEPENDENT_REVIEW_PENDING` — **encerrado**.

## 10. Dogfooding EOS-sobre-EOS — 3 defeitos reais

Alvo declarado: restringir o filtro de decisões do Knowledge Loader. O fluxo completo do EOS foi
executado sobre si mesmo e encontrou **três** defeitos, dois deles não previstos.

| ID | Defeito | Como apareceu | Correção |
|---|---|---|---|
| **F-001** | Fatia entregava decisão fora do escopo: tarefa L1 de frontend recebia `DEC-ADM-002` (gate de staging) | alvo planejado | Escopo da decisão precisa intersectar a superfície; `DEC-ADM-002` reclassificada de `admai` para `infra` |
| **F-002** | Mudança no próprio EOS recebia ownership de **frontend**, porque "filtro" casava o sinal `ui` | achado **pelo** dogfooding | Superfície `eos` criada; papel `eosMaintainer` adicionado ao roster |
| **F-003** | **Achado real do Semgrep sobre `res.sendFile` classificava L0** | teste de candidatos do §33 | Ausência de sinal deixou de significar ausência de risco |

**F-003 é o mais grave e o mais instrutivo.** Era subclassificação — a direção de falha contra a qual
eu havia declarado ter projetado o sistema. A causa era de desenho: sem sinal reconhecido, o vetor
ficava zerado e o resultado caía em L0. Correção estrutural: **L0 passou a ser conquistado, nunca
herdado** — exige prova positiva de trivialidade (ação cosmética sem domínio protegido). Sem ela, o
classificador declara que não entendeu e escala.

Efeito medido: achado do Semgrep **L0 → L2**; "worker falha no retry" **L0 → L1**; e o caso
genuinamente cosmético permanece L0.

**Nenhum dos 34 testes anteriores pegou os três.** Nenhum cobria mudança no próprio EOS. As três
regressões estão travadas em ST-34, ST-35 e ST-36.

## 11. Estado dos self-tests

**37/37 PASS · 26 negativos.** Nenhum removido; os 20 originais continuam passando.

## 12. O que falta

| Item | Estado | Próximo passo determinístico |
|---|---|---|
| Dogfooding AdmAi (§33) | **não executado** | Candidatos já classificados: achado Semgrep (L2, 1 superfície) · estado vazio na lista de técnicos (L1) · retry do worker (L1). Nenhum atinge 2 superfícies. Escolher com o usuário ou aceitar 1 superfície |
| `MCP_NEGATIVE_RUNTIME_TEST_PENDING` | pendente | Exige sessão limpa; `-DiagnoseOnly` bloqueado por desenho com sessão ativa |
| `PENDING_EXTERNAL_CREDENTIAL` | pendente | PAT do Supabase |
| Discovery funcional | pausado | Lote 1 aguarda respostas; confrontado com Decision Log e confirmado |

## 12-B. Dogfooding real no AdmAi — `DOG-001` · **LOCAL VERIFIED**

Achado Semgrep `express-res-sendfile` em `chaveiro-bot/src/routes/documentos.js`.

**Veredito: falso positivo para path traversal.** A regra afirma *"the application processes
user-input"*; a premissa é falsa. `storageKey` é `doc-${randomUUID()}.${DOC_MIME[mime]}` — gerado
integralmente no servidor, com extensão de tabela fechada e mime validado por regex literal e magic
bytes. Único ponto de escrita no repositório (`:111`), nunca exposto ao cliente (`:59`).

**O defeito real era outro:** zero testes cobriam a rota. Classificado `TEST_DEFECT`, não
`SECURITY_DEFECT`.

| Artefato | Resultado |
|---|---|
| Risk Vector | `security:2 functional:2` → **L2**, confiança ALTA |
| Engineers | `security` (Primary) + `backend` — ver F-004 |
| Knowledge slice | 3.465 B / 9.125 (38%) |
| Finding | `F-DOG-001` `TEST_DEFECT` → owner `verification` |
| Test overfitting | não — o diff toca produto **e** teste |
| Testes novos | 6/6 PASS |
| Suíte completa | **43 arquivos, 406 testes, PASS** |
| Lint | 0 erros |
| Semgrep | WARNING **mantido**, zero supressão |
| Proof Ledger | `ok=true`, `VERIFIED` |
| **Local Gate** | **PASS** |

Mudança de produto: 2 arquivos. `documentos.js` +17/−1 (extração de `gerarStorageKey`, **zero
mudança de comportamento**) e 1 arquivo de teste novo.

`format:check` acusa 147 arquivos, incluindo `documentos.js` — **pré-existente**: a versão original
em `HEAD` já falhava, e o diff acusa todas as 229 linhas, o que indica fim-de-linha, não conteúdo.

## 12-C. F-004 — achado sobre o próprio EOS

O Execution Router deu `security` como Primary; o esperado era `backend`. Causa: `pickPrimary` usa
precedência fixa que põe `security` à frente sempre que presente — o comportamento contra o qual o
próprio contrato alertava ("Security não deve assumir ownership automaticamente apenas porque o
finding veio do Semgrep").

**Não corrigido nesta execução, deliberadamente:** alterar a regra de ownership no meio da execução
que a avalia contaminaria o dogfooding. Próximo passo determinístico: fazer `pickPrimary` considerar
a **superfície alterada** e não só a presença do especialista.

## 12-D. F-004 — **FECHADO**

`PLAN_DEFECT` → `executionGraph`. Categoria determinada pelo próprio Finding Router, não imposta.

**Causa raiz:** `router.mjs`, função `pickPrimary` — ordenava Engineers por array de precedência fixa
com `security` em segundo lugar. Presente `security`, ele vencia sempre. **O EOS confundia
importância do risco com responsabilidade de execução.**

**Correção:** `tools/eos/engineering/responsibility.mjs` (novo). Ownership passa a derivar de
`Surface + Concern + Change Intent + Required Capability`. Risk Domains geram **review**, nunca
autoria. A precedência fixa virou `fallbackPrimary` — último desempate, e todo uso é marcado
`OWNERSHIP_FALLBACK_USED` com `confidence: BAIXA`, escalando em L2/L3.

Duas regras que o modelo agora impõe:

- **Arquivo não é ownership.** O mesmo `middleware/auth.js` tem dono diferente conforme a intenção:
  autorização → `security`; instrumentação → `observability`; refatoração → `backend`. (ST-38)
- **Risco não é ownership.** Risco de segurança sobre concern de aplicação → `REQUIRED_REVIEWER`. (ST-37)

**Exceção deliberada no código:** `securityRemediation` só torna `security` Primary quando o
**concern alterado também é um controle de segurança**. Sem isso, F-004 voltaria por outra porta.

### Replay do DOG-001 — 11/11

| | Antes | Depois |
|---|---|---|
| Primary | `security` | **`backend`** |
| Security | `PRIMARY_OWNER` | **`REQUIRED_REVIEWER`** |
| Verification | — | `VERIFICATION_OWNER` |
| Risco | L2 | **L2** — preservado |
| `CONTRACT_REQ` | 0 | **0** |
| Fallback | — | não usado, derivação convergiu |

Required Reviewer é bloqueante de verdade: sem review registrado o Ledger vai a `BLOCKED`; com
`REVIEW_PASS` e evidência, sustenta `VERIFIED`.

**Zero alterações adicionais no produto.** Apenas os 2 arquivos já do DOG-001.

**Fechamento:** negado a `eosMaintainer`; negado a `verification` sem evidência de reteste;
permitido a `verification` com evidência → `CLOSED`.

## 12-E. Suíte após F-004

| Suite | Resultado |
|---|---|
| `risk/verify` | PASS |
| `proof/verify` | PASS |
| `engineering/verify` (ENG-01…10) | **PASS — sem regressão** |
| `engineering/verify-ownership` (OWN-01…12 + CB-NOOP) | **14/14 PASS** |
| `selftest/run` | **42/42 PASS · 31 negativos** |

Nenhum teste removido ou enfraquecido. 37 → 42 self-tests (+5).

## 12-F. Verification Hardening — Baseline-Aware Verification

### Correção material ao relatório do DOG-002

Eu classifiquei a falha de `MeuPainel.test.jsx` como **pré-existente. Estava errado.**

A suíte completa com paralelismo de arquivo no padrão dá **29/29 arquivos, 135/135 testes PASS**. A
falha só aparecia com `--no-file-parallelism`, **contorno meu**, não configuração do repo: com os
arquivos em série no mesmo worker, `MeuPainel.test.jsx` e `Tecnicos.test.jsx` colidem no registro de
módulos ao mockar `formatarMoeda` com formatos diferentes.

Eu tinha "acoplamento zero" e "passa isolado" — e **nenhuma das duas prova preexistência.** Faltava
baseline. É o erro que este trabalho existe para tornar impossível, e `BASE-NEG-01` o codifica.

### Causas raiz

| Finding | Classificação | Evidência |
|---|---|---|
| `F-DOG-002-B` — contaminação do MeuPainel | `ENVIRONMENT_FAILURE` induzido por flag · **FECHADO** (`KR-006`) | verde com config padrão; falha só com a flag |
| `F-DOG-002-C` — timeout do pool `forks` | `ENVIRONMENT_FAILURE` · **ABERTO** como Verification Debt (`KR-005`) | `EstadoVazio` (leve) passa em `forks`; páginas React expiram. `setup 45s`, `environment 53s` para 5 testes; `environment 344s` na suíte |
| **`F-005`** — Router não roteia infraestrutura de verificação | **ABERTO**, não corrigido (§25) | devolveu 0 Engineers e `OWNERSHIP_FALLBACK_USED` para esta própria requisição |

**`vite.config.js` não foi alterado.** A causa é do ambiente, não do repositório — e a §11 proíbe
trocar pool como correção sem prova de que é a escolha tecnicamente correta.

### Implementação

`tools/eos/baseline/` — `fingerprint.mjs`, `classify.mjs`, `fixtures.json`, `verify.mjs`.

Seis classificações (`NEW_FAILURE`, `REGRESSION`, `PRE_EXISTING_FAILURE`, `FLAKY_FAILURE`,
`ENVIRONMENT_FAILURE`, `UNRELATED_FAILURE`) **ortogonais** a `FindingCategory`: a primeira descreve
relação temporal/causal com a mudança, a segunda a natureza do defeito.

Três modos de gate: `STRICT_GREEN_PASS` · `BASELINE_EQUIVALENT_PASS` (registrado como modo distinto,
nunca equiparado) · `LOCAL_GATE_BLOCKED`, mais `REQUIRES_RECLASSIFICATION`.

**Afirmação de preexistência é rejeitada em dois casos**, não um: sem baseline, e — o mais afiado —
**contradita pelo baseline**. O segundo é a forma exata do meu erro.

`EOS-P11` e `INV-UX-01` no Decision Index; `KR-005`/`KR-006` como Verification Debt em `KNOWN_RISKS`,
sem registry novo (§22).

### Resultados

| | |
|---|---|
| `BASE-01`…`BASE-10` + `BASE-NEG-01`…`03` | **13/13 PASS**, 5 negativos |
| Self-test mestre | **46/46 PASS**, 35 negativos (era 42/31) |
| Suíte do painel, 3 execuções | **29/29 e 135/135 nas três** |
| Suítes do EOS | 6/6 PASS |
| Produto e config alterados | **zero** |

### Reclassificação formal do DOG-002 (§33)

Sob as regras novas: **`STRICT_GREEN_PASS`**. A falha reportada não pertencia ao baseline nem à
mudança.

### `VERIFICATION_HEALTH`

**`DEGRADED_BY_KNOWN_BASELINE_FINDINGS`** — a suíte está verde e é reproduzível em 3 execuções, mas
`KR-005` segue aberto e o pool oficial (`forks`) não pôde ser validado aqui.

## 12-G. F-005 — **FECHADO**

### Causa raiz — quatro lacunas, não uma

O vetor saiu **inteiramente nulo**: `surface: null · concern: null · changeIntent: null`.

| # | Causa | Evidência |
|---|---|---|
| 1 | `SURFACE_MAPPING_GAP` | não havia superfície para infraestrutura de teste |
| 2 | `ROUTER_LOGIC_DEFECT` | **`\b` final em radical de verbo português é inalcançável**: `/\bimplement\b/` não casa "implementar", `/\badicion\b/` não casa "adicione", `/\bcorrig\b/` não casa "corrigir" |
| 3 | `ROSTER_GAP` | nenhum papel cobria runner, pool, isolamento, fixtures, harness |
| **4** | **`TAXONOMY_DEFECT` — Primary Root Cause** | zero candidatos e ambiguidade compartilhavam o mesmo caminho |

As três primeiras produziram zero candidatos; foi a **quarta** que transformou isso em fallback
silencioso. A causa 2 era dívida latente que quebrava a derivação de intent para quase todo verbo
flexionado — invisível porque `ENG-01`…`ENG-10` exercitam `selectEngineers`, não `deriveVector`.

### Correção

| Candidatos | Estado | Fallback |
|---|---|---|
| 1 | `OWNED` | não |
| >1 com vencedor semântico | `OWNED` | não |
| >1 sem vencedor | `OWNERSHIP_AMBIGUOUS` | **permitido só aqui** |
| **0** | **`CAPABILITY_GAP`** com `missingMapping` e `escalationTarget` | **proibido** |

**Engineer novo: `testInfrastructure`.** Os 9 critérios da §9 se sustentam; o decisivo é o terceiro —
dar infraestrutura de teste ao Verification Engineer o tornaria **autor do instrumento que ele
certifica**.

Fronteiras: CI → `release` · runner e harness locais → `testInfrastructure` · `tools/eos/**` →
`eosMaintainer` (superfície exclusiva, domina o concern) · política de PASS/FAIL → `eosMaintainer`.

`EOS-INV-OWN-002` registrado, severidade HIGH.

### Fixture corrigida — declarado, não silencioso

`OWN-12` e `ST-39` diziam testar "caso ambíguo", mas o **input tinha zero candidatos**. O rótulo
nunca correspondeu à entrada, e a expectativa codificava o próprio defeito. **Assertions preservadas
na íntegra**; só a entrada passou a ser de fato ambígua. O caso de zero candidatos ganhou cobertura
nova e oposta em `CAP-01` e `ST-46`. Cobertura líquida aumentou.

### Resultados

| | |
|---|---|
| `CAP-01`…`CAP-14` + matriz de não sobreposição | **14/14 PASS**, matriz OK |
| Self-test mestre | **48/48**, 37 negativos (era 46/35) |
| 7 suites do EOS | **PASS** |
| Replay F-005 | **5/5** — `OWNED`, `testInfrastructure`, zero fallback, L1 preservado |
| Produto alterado | **zero** nesta fase |

## 12-H. DOG-003 — **BLOQUEADO por ausência de candidato**

### Candidatos analisados

| Candidato | Boundary material? | Veredito |
|---|---|---|
| **Contrato de capacidades** — backend expõe flags, painel consome | **Sim.** EOS: **L2**, `integration` Contract Owner, `CONTRACT_REQ: 1` | **Bloqueado por decisão de produto pendente** |
| `TODO` de WhatsApp (`cloud-gateway.js:127`) | externa | adiado por `COND-001` |
| Backlog `C1`–`C14` | não — é política | fora de escopo |
| Frente de segurança | parcial | L3, majoritariamente fechada |
| Semgrep / estado vazio | não | consumidos em DOG-001 e DOG-002 |

**Motivo exato do bloqueio.** O menu oferece "Documentos" guardado por permissão
(`guard: { proprio: 'documentos' }`), não por capacidade; a tela degrada limpo no 404
(`Documentos.jsx:69-70`). Corrigir exige decidir **se o menu esconde, desabilita ou degrada** — e
`C1` registra que *"a Rodada 1 define a política de produto para funcionalidade
indisponível/desativada/em teste/parcial, **não o sistema de flags**"*, Lote 12.

A parte implementável **é a política congelada**. Executar anteciparia decisão do usuário.

Exaustão da busca: **um único `TODO` no repositório inteiro**, zero no painel.

### F-006 — o EOS errou aqui

O classificador deu `requiresUserDecision: false` para esse candidato. **Está errado** — ele depende
de decisão formalmente adiada. Causa: o Risk Classifier não enxerga o backlog do discovery, então
não distingue "não exige decisão" de "exige uma que já foi congelada". Foi a investigação humana que
pegou.

Registrado como `KR-007`, **não corrigido** nesta execução (§40).

### Entregue — independe do candidato

| Item | Resultado |
|---|---|
| `EOS-P12` — Explicit Uncertainty Before Plausible Guessing | registrado; três instâncias reais: F-004, F-005 e a atribuição do DOG-002 |
| `EOS-INV-VERIFY-001` — `UNRELATED ≠ PRE_EXISTING` | registrado, HIGH |
| **`CB-REAL-01`…`CB-REAL-10`** | **10/10 PASS**, 7 negativos |
| `contractFingerprint` · `detectBreakingChange` · `detectContractDrift` · `checkConsumerAcceptance` · `findRedundantRequests` · `checkContractOwnerAction` | implementados |
| 8 suites do EOS | **PASS** |
| Produto alterado | **zero** |

**Limite declarado:** os guards estão prontos e provados. Isso **não é** o Contract Bus exercitado
numa boundary real — a §45 exige uso real, e não houve.

## 12-I. F-006 — **FECHADO** · Decision Readiness Gate

**Causa raiz:** o EOS sabia avaliar a mudança tecnicamente, mas não sabia verificar se estava
**autorizado** a executá-la pelas decisões vigentes. O booleano `requiresUserDecision` não conseguia
distinguir *"nenhuma decisão necessária"* de *"decisão necessária que ninguém registrou"*.

**Separação preservada:** Risk responde *"qual o risco técnico?"*; Readiness responde *"existe
decisão suficiente para isto ser executável?"*. O backlog **não** entrou no Risk Classifier.

`Intent → Decision Dependency Resolution → Readiness Gate → Risk → Evidence → Engineering`.
O gate bloqueia o **Execution Graph**, não a classificação de risco.

| Eixo | Estados |
|---|---|
| Decisão | `APPROVED_FROZEN` (mapeia `ACTIVE` legado) · `PENDING` · `DEFERRED` · `SUPERSEDED` · `CONFLICTING` · `NOT_FOUND` |
| Requisito | `NONE` · `EXISTING_DECISION_APPLIES` · `PENDING_DECISION` · `DEFERRED_DECISION` · `CONFLICTING_DECISIONS` · `MISSING_DECISION` |
| Readiness | `READY` + cinco `BLOCKED_BY_*` |

`requiresUserDecision` **deixou de ser fonte de verdade** — agora é derivado do requisito.

**`C1` registrada no Decision Index** como `DEFERRED`/Lote 12. Foi essa ausência de dado — não um
defeito de algoritmo — que deixou F-006 invisível até a investigação humana.

### Replay — 7/7

| | Antes | Depois |
|---|---|---|
| `requiresUserDecision` | `false` (fonte de verdade) | `true` (**derivado**) |
| `decisionRequirement` | — | **`DEFERRED_DECISION`** |
| `readiness` | — | **`BLOCKED_BY_DEFERRED_DECISION`** |
| `executionAllowed` | — | `false` |
| **`riskLevel`** | L2 | **L2 — preservado** |
| Roteamento | — | `userDecisionGate` · `PRODUCT_DECISION_REQUIRED` |

Replay sintético: com `C1 = APPROVED_FROZEN` → `READY`. **`C1` não foi resolvida de verdade.**

`DEC-01`…`DEC-14`: **14/14 PASS**, 3 negativos.

## 12-J. Resource Accounting — `OPERATIONAL_WITH_LIMITATIONS`

**Observabilidade verificada, não presumida.** `~/.claude-admai/telemetry` está **vazio** e não há
arquivo de uso no perfil.

| Grandeza | Status |
|---|---|
| Bytes de contexto, chamadas de ferramenta, Findings, correções, contratos, wall time | **`MEASURED`** |
| **Tokens** (input/output/cache) | **`UNAVAILABLE`** |
| **Créditos e custo monetário** (Claude e Codex) | **`UNAVAILABLE`** |

**Completude: `PARTIAL`** — nunca `COMPLETE`, porque há lacuna conhecida.

Regras que o código impõe: `UNAVAILABLE` nunca é zero — zero é medido, ausência não é · estimativa
carrega método e não se passa por medida · sem atribuição por agente, `TOKEN_ATTRIBUTION_UNAVAILABLE`
sem rateio · alvos herdados são `ADVISORY_TARGET`, não bloqueiam · segredo nunca entra no registro,
só hash e contagem · crédito **nunca** derivado de token.

Retroativo: DOG-001 e DOG-002 importados com o que foi de fato medido, marcados
`RETROACTIVE_PARTIAL`. **Zero token reconstruído.**

`RES-01`…`RES-15`: **15/15 PASS**, 6 negativos.

### Resultados

| | |
|---|---|
| 10 suites do EOS | **PASS** |
| Self-test mestre | **52/52**, 41 negativos (era 48/37) |
| Produto alterado | **zero** |

## 13. Como reverificar (Parte II)

```bash
node tools/eos/engineering/verify.mjs   # ENG-01..ENG-10
node tools/eos/selftest/run.mjs         # ST-01..ST-36, 37 casos
```

---

## 7. Como reverificar

```bash
node tools/eos/risk/verify.mjs        # 14 casos contra oráculo externo
node tools/eos/proof/verify.mjs       # 13 casos, 12 negativos
node tools/eos/selftest/run.mjs       # ST-01..ST-19, 20 casos
node tools/eos/selftest/serena-probe.mjs   # sonda MCP, sem tokens de sessão
powershell -File .claude/start-baseline.ps1 -PreflightOnly   # cadeia de integridade
```
