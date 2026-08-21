# 02 — Mapa legado → EOS V2

**Data:** 2026-08-07 · **Base:** documento `01_LEGACY_EOS_FORENSICS.md`

> **Duas regras do usuário governam esta matriz.**
> 1. Não preservar por custo afundado — esforço já gasto não é argumento.
> 2. Não remover código que funciona só porque o V2 usa outro nome.
>
> Onde as duas colidem, vence a evidência de funcionamento verificado.

**Categorias:** `REUSE_AS_IS` · `REUSE_WITH_MODIFICATION` · `MIGRATE` · `DEPRECATE` · `REMOVE` ·
`MISSING` · `UNKNOWN`

`DEPRECATE` ≠ `REMOVE`. **`DEPRECATE`** = não levar adiante como mecanismo, preservando o artefato
onde está (branch não mesclada) como registro. **`REMOVE`** = apagar ativamente. Como nenhum
artefato legado está na linha principal, **nada nesta matriz exige `REMOVE`** — a branch
`ai/claude/TASK-025-plugin-autonomy` permanece intacta como evidência histórica.

---

## 1. Matriz principal

| # | Artefato legado | Subsistema V2 | Categoria | Nível | Justificativa | Evidência |
|---|---|---|---|---|---|---|
| 1 | Protocolo DECISOR/REVISOR/ÁRBITRO (`AGENTS.md`) | **Decisão** | `REUSE_AS_IS` | L1 | Já é normativo e está em uso nesta própria sessão. Substituí-lo por vocabulário V2 seria renomear o que funciona | `AGENTS.md` no HEAD, blob `b34f136a`; `bbb8382` ancestral do HEAD |
| 2 | Autoridade de writer único + gates | **Decisão** | `REUSE_AS_IS` | L2 | Regra de segurança operacional vigente; o V2 não propõe nada que a substitua | `AGENTS.md` §Autoridade |
| 3 | Política Codex read-only / nega patches | **Decisão** / **Ambiente** | `REUSE_AS_IS` | L2 | Imposta hoje pelo launcher com hash pinado, não apenas por documento | `codex-mcp-policy`, `approval-policy.mjs` — hashes verificados íntegros 2026-08-07 |
| 4 | **12 skills de domínio** (`admai-domains/skills/*`) | **Engenharia** (Engineers) | `REUSE_WITH_MODIFICATION` | L2 | Conteúdo cita os invariantes reais do repo (`requireAuth`, `requirePermissao`, `req.db`, Zod no boundary). O que muda é o **acionamento**: deixam de ser skills sempre-obrigatórias e passam a ser papéis acionados por risco | `01`, §3.1; leitura de `backend-api/SKILL.md` |
| 5 | `route-prompt.mjs` — **a ideia** de roteamento determinístico e auditável | **Decisão** (EOS Router) | `REUSE_WITH_MODIFICATION` | L2 | Roteamento determinístico é correto e desejável: é auditável e reproduzível | `01`, §3.1 |
| 6 | `route-prompt.mjs` — **o mecanismo** (regex obrigatória via hook) | **Decisão** (EOS Router) | `DEPRECATE` | L2 | Impõe profundidade fixa por palavra-chave, não por risco. Colide com P01 e P09. Detalhe no documento 04 | Código: *"REGRA OBRIGATORIA: sua primeira acao deve ser invocar… Nao analise nem responda antes"* |
| 7 | `mcp-filter.mjs` — **o padrão** de proxy MCP com allowlist | **Ambiente** | `REUSE_WITH_MODIFICATION` | L2 | Padrão correto: filtra `tools/call` **e** reescreve `tools/list`. Hoje o launcher já faz o equivalente com `--allowedTools` por ferramenta — o padrão vale como referência, não como código a reintroduzir | `01`, §3.2; launcher `--allowedTools=mcp__codex__*,mcp__serena__…` |
| 8 | `admai-claude-mem-mcp` — o subsistema de memória | **Conhecimento** | `DEPRECATE` | L3 | Nunca funcionou: o próprio autor desativou o backend. E a política vigente já decidiu que estado durável vive em `docs/` versionado | `45bdc1d fix(memoria): desativa Chroma incompatível no Windows`; `TOOL_ROUTING_MATRIX.md` §4 |
| 9 | `plugin-lock.json` — **orçamentos medidos** | **Ambiente** (Tool Cost Registry) | `MIGRATE` | L1 | `measuredAlwaysOnTokens: 880` é medição real, não estimativa. Exatamente o tipo de dado que o registro V2 exige | `01`, §3.4 |
| 10 | `plugin-lock.json` — **runtimes pinados** (`bun`, `uv` + SHA256) | **Ambiente** | `MIGRATE` | L2 | Padrão de pinagem por hash é o mesmo do launcher vigente e comprovadamente eficaz | `01`, §3.4 |
| 11 | `plugin-lock.json` — **`forbiddenPlugins`** | **Ambiente** | `REUSE_WITH_MODIFICATION` | L2 | **Conflito aparente, resolvido por evidência.** As proibições legadas eram **condicionais**, e cada condição foi satisfeita ou evitada — ver §4.1 | `TOOL_DECISIONS.md:111-125`; `TOKEN_EFFICIENCY_BASELINE.md` §4-B |
| 12 | `domain-routing-smoke.mjs` | **Verificação** (self-test) | `REUSE_WITH_MODIFICATION` | L2 | Testa comportamento real, não configuração: instancia `claude.exe` em perfil isolado e inspeciona quais skills foram invocadas. É o precursor direto do self-test do V2 | `01`, §3.4 |
| 13 | `lab-preflight.mjs` | **Verificação** | `UNKNOWN` | L1 | `NÃO EXECUTADO`; conteúdo não lido integralmente. Provável sobreposição com o preflight do launcher vigente | `01`, §3.4 |
| 14 | `admai-security-guidance-lite` (hooks) | **Verificação** | `DEPRECATE` | L2 | Depende de hooks, desligados por baseline pinado. O papel é melhor coberto pelo Semgrep, que já roda no CI e localmente com custo medido de 2.679 B | `01`, §3.3; `TOKEN_EFFICIENCY_BASELINE.md` §4-B |
| 15 | `TOKEN_POLICY.md` | **Ambiente** | `REUSE_WITH_MODIFICATION` | L1 | Nunca vigorou, mas o tema é central ao V2. Superado em parte por `TOKEN_EFFICIENCY_BASELINE.md`, que tem medições reais | `01`, §4 |
| 16 | `MEMORY_POLICY.md` | **Conhecimento** | `DEPRECATE` | L2 | Governa um subsistema que o item 8 depreca | `01`, §4 |
| 17 | `PERMISSIONS.md` | **Decisão** | `REUSE_WITH_MODIFICATION` | L3 | Tema de segurança; o `AGENTS.md` vigente cobre parte. Requer leitura integral antes de classificar em definitivo | `01`, §5 — `NÃO VERIFICADO` |
| 18 | `WORKTREE_POLICY.md` | **Ambiente** | `REUSE_WITH_MODIFICATION` | L2 | Worktree dedicada + writer único é regra vigente do `AGENTS.md`; a política legada a detalha | `AGENTS.md` §Contexto e operação |
| 19 | `TARGET_ARCHITECTURE.md` (9.909 B) | transversal | `UNKNOWN` | L2 | Maior densidade provável de desenho reaproveitável. **Leitura dirigida obrigatória** antes de fechar a migração | `01`, §5 — `NÃO VERIFICADO` |
| 20 | `CHANGE_PLAN.md` (13.000 B) · `TOOL_DECISIONS.md` (13.472 B) | **Ambiente** | `UNKNOWN` | L2 | Idem. `TOOL_DECISIONS.md` provavelmente explica a origem de `forbiddenPlugins` (item 11) | `01`, §5 — `NÃO VERIFICADO` |
| 21 | ~30 relatórios B1/B2/B3 | **Evidência** | `REUSE_AS_IS` | L0 | Registro histórico de execução. Valor como evidência é justamente serem imutáveis; permanecem onde estão | `01`, §5 |
| 22 | 3 documentos de incidente | **Evidência** / **Conhecimento** | `MIGRATE` | L2 | Lição durável sobre falhas reais (isolamento de MCP, segredo em histórico remoto). É o tipo de conhecimento que o V2 quer reter | `01`, §5 |
| 23 | `EXECUTION_STATE.md`, `ROLLBACK.md`, `CLEANUP_MANIFEST.md`, `ENVIRONMENT_AUDIT.md` | **Ambiente** | `DEPRECATE` | L1 | Descrevem um estado de ambiente que não existe mais. Substituídos por `AGENT_TOOLING_ARCHITECTURE.md` e `TOOL_ROUTING_MATRIX.md` | `01`, §5 |
| 24 | 4 documentos `*_PROPOSAL.md` | — | `DEPRECATE` | L0 | Propostas nunca aprovadas, cujas versões efetivas também não vigoraram | `01`, §5 |

---

## 2. O que o V2 exige e o legado **não** tem

Marcado `MISSING`. Nenhum destes tem precursor no legado — são construção nova.

| Subsistema V2 | Componente ausente | Nível | Observação |
|---|---|---|---|
| **Evidência** | Proof Ledger — registro de provas ligado a decisões | L2 | O legado tem relatórios avulsos, não um ledger consultável |
| **Evidência** | Distinção formal entre prova determinística e inferência (P08) | L2 | Nenhum artefato legado a formaliza |
| **Decisão** | Vetor de risco e níveis L0–L3 | L2 | O roteador legado não tem noção de risco — é o cerne do conflito do documento 04 |
| **Decisão** | Escalada progressiva (P09) | L2 | Ausente |
| **Verificação** | Verification Engineer separado do implementador (P04) | L3 | O `AGENTS.md` tem o Codex REVISOR, que cobre **parte**: é revisor externo, mas humano-acionado e não cobre todos os níveis |
| **Verificação** | Finding Router + Correction Loop | L2 | Ausente |
| **Conhecimento** | Knowledge System (*research once, reuse many*, P03) | L2 | A tentativa legada (memória Chroma) morreu; nada a substitui |
| **Engenharia** | Contract Bus entre engenheiros | L2 | As 12 skills não se comunicam entre si — são orientações isoladas |
| **Engenharia** | Ownership explícito por engenheiro | L1 | Ausente |
| **Ambiente** | Sequenciamento local → staging → produção (P05) | L2 | Parcial: `TOOL_ROUTING_MATRIX.md` §2 já define perfis operacionais |

---

## 3. O que existe e o V2 **não** prevê

| Item vigente | Situação | Recomendação |
|---|---|---|
| Launcher `start-baseline.ps1` com cadeia de integridade pinada | Vigente e funcionando | **Preservar.** O V2 não descreve nada equivalente; remover seria perda líquida de segurança |
| `--strict-mcp-config` + allowlist por ferramenta | Vigente | **Preservar** |
| Skill `admai-tool-router` (500 B permanentes / 4.407 B sob demanda) | Vigente e versionada | Absorver no Tool Router V2 — é o único roteador **em execução** hoje |
| Harness E2E `chaveiro-painel/e2e/run.mjs` | Vigente, código de produto | **Não tocar.** Fora do escopo do EOS |

---

## 4. Decisões materiais pendentes de consulta

Conforme `AGENTS.md`, classificações L2/L3 que afetem segurança ou arquitetura não se fecham por
decisão unilateral do Claude. Ficam registradas aqui como **pendentes**:

| ID | Questão | Posição do Claude | Itens |
|---|---|---|---|
| **D-01** | A maquinaria de plugins/hooks deve ser retomada ou deprecada em definitivo? | `DEPRECATE` do mecanismo, `REUSE_WITH_MODIFICATION` do conteúdo — com base na evidência de remoção deliberada (`01` §4), não em custo afundado | 4, 5, 6, 14 |
| **D-02** | ~~`forbiddenPlugins` proíbe `context7`/`playwright`; a matriz vigente os adota. Qual prevalece?~~ | **RESOLVIDA por evidência** — ver §4.1 | 11, 20 |
| **D-03** | O subsistema de memória deve ser reconstruído como Knowledge System? | `DEPRECATE` do legado; o Knowledge System V2 é construção nova sobre `docs/` versionado | 8, 16 |

### 4.1 D-02 — resolvida: as proibições legadas eram condicionais

A suspeita era de que uma decisão de segurança tivesse sido revertida sem exame. A leitura de
`TOOL_DECISIONS.md` mostra que **não houve reversão**: as proibições nunca foram absolutas.

| Ferramenta | Texto legado (`TOOL_DECISIONS.md`) | Condição | Situação hoje |
|---|---|---|---|
| **Context7** | *"manter não instalado; **usar somente em fase que demonstre lacuna** e sem código privado desnecessário"* | Lacuna demonstrada | **Satisfeita.** A Fase Zero mediu a lacuna: `ctx7 docs` devolveu 5.332 B dirigidos sobre a API de transações do Prisma, onde a memória do modelo é insuficiente e sensível a versão |
| **Playwright** | *"Não existe no produto. **Adicioná-lo mudaria dependências/lockfiles** sem necessidade, enquanto CI já executa E2E com Chrome"* | Não poluir dependências | **Evitada por construção.** Instalado fora do `package.json` do produto, sem alterar lockfile, com `channel:'chrome'` — 0 bytes de dependência no produto, ~150 MB de download evitados |
| **Semgrep** | *"não aparecem configurados; **não instalar preventivamente**"* | Não ser preventivo | **Condição mudou.** Semgrep hoje é o SAST oficial do CI; o uso local espelha os mesmos rulesets, ao custo medido de 2.679 B |
| (geral) | *"GitHub MCP e Context7 **sem tarefa concreta**"*, *"LSP adicional **sem lacuna medida**"* | Tarefa concreta / lacuna medida | Mesma lógica. E o GitHub **MCP** segue não instalado — usa-se o `gh` CLI |

**Conclusão.** A política legada e a matriz vigente aplicam **o mesmo critério** — não adotar
ferramenta sem lacuna demonstrada. O legado registrou o veredito de um momento em que a lacuna não
existia; a Fase Zero mediu lacunas e as documentou. `forbiddenPlugins` é portanto
`REUSE_WITH_MODIFICATION`: **preservar o mecanismo de lista negativa e o critério**, atualizando as
entradas conforme a medição. O que migra é a regra, não a lista congelada.

Restam bloqueadas no legado, e continuam bloqueadas hoje, sem divergência: segundo orquestrador
(Ruflo/Claude Flow), filesystem MCP redundante, memory MCP / knowledge graph (Mem0, Zep, Weaviate),
aprovação `never`, bypass de sandbox, auto-push, auto-commit e deploy automático.

**Nenhuma decisão material permanece aberta para consulta ao Codex DECISOR nesta análise.** D-01 e
D-03 têm evidência direta e convergente (remoção deliberada em `01` §4; subsistema desativado pelo
próprio autor). A consulta obrigatória se aplica à **execução** da migração, não a este inventário.

---

## 5. Contagem

| Categoria | Itens |
|---|---|
| `REUSE_AS_IS` | 4 |
| `REUSE_WITH_MODIFICATION` | 8 |
| `MIGRATE` | 3 |
| `DEPRECATE` | 7 |
| `REMOVE` | **0** — nada na linha principal a remover |
| `UNKNOWN` | 3 — todos por leitura pendente, nenhum por ambiguidade irredutível |
| `MISSING` (documento V2) | 10 |

**Leitura:** o legado contribui com desenho reaproveitável em 14 dos 24 itens, e com **zero linhas
de código executável** — coerente com a forense, que provou que nada dele executava.
