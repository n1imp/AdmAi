# 01 — Forense do EOS legado

**Data:** 2026-08-07 · **Branch:** `fix/seguranca-criticos` · **HEAD:** `30bf5453`
**Natureza:** documento de análise. Nenhum código de produto foi lido para alteração, nenhum
arquivo fora de `docs/eos-v2/` foi tocado por este documento.

> **Regra deste documento.** Toda afirmação sobre estado executável cita o comando que a provou.
> Onde não houve verificação, está escrito `NÃO VERIFICADO`. A distinção entre *existe arquivo* e
> *funcionalidade existe* é o eixo do documento inteiro.

---

## 1. Onde o EOS legado estava — e por que não foi encontrado pelo nome

Primeira busca, por nome de arquivo, em todas as refs:

```bash
git log --all --diff-filter=A --name-only --format="" | grep -iE "eos" | sort -u
```

Resultado: **um único arquivo**, `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md` — que é o
contrato da frente atual, criado nesta linha de trabalho. **Nenhum artefato legado usa o nome EOS.**

O sistema que o usuário chama de "EOS anterior" existe sob outro nome: a **arquitetura de governança
Claude-Codex**, construída entre 2026-07-30 e 2026-08-02.

### Topologia real: linear, não paralela

As três branches não são frentes concorrentes. São **estágios sucessivos** da mesma linha:

```
62b921f3 (merge-base)
   └── 19bcd9e  2026-07-30  chore(agent-env): configure isolated Claude and Codex workflow
        └── d07085c  2026-07-30  ── ponta de ai/codex/TASK-023-teste-cobertura
             └── 4eb77c2 … 1af5182 … 866c233 … 49e20c9
                  └── ada6257  2026-08-02  ── ponta de ai/claude/TASK-024-codex-autonomia
                       └── 50ff4e4 … f2ac9aa … ae41f0a … 5f6782c … 5ed3523 … 8f6d1e0 … 98e48fb
                            └── 45bdc1d  2026-08-02  ── ponta de ai/claude/TASK-025-plugin-autonomy
```

Verificado com `git log 62b921f3..<branch> --format="%h %ad %an %s" --date=short`.

**Consequência:** `ai/claude/TASK-025-plugin-autonomy` (`45bdc1d`) contém tudo. É a **única ponta que
precisa ser examinada** — TASK-023 e TASK-024 são estados intermediários dela. Autor único em todos
os commits: `n1imp`.

---

## 2. O teste decisivo — o sistema legado nunca executou

Cinco verificações independentes. **Cada uma, sozinha, já impede a execução.** As cinco juntas
tornam a conclusão categórica.

| # | Pergunta | Comando | Resultado |
|---|---|---|---|
| 1 | O código dos plugins existe no HEAD atual? | `git cat-file -e HEAD:tools/claude-plugins/plugin-lock.json` | **Não existe** |
| 2 | A branch foi integrada? | `git merge-base --is-ancestor ai/claude/TASK-025-plugin-autonomy HEAD` | **Não é ancestral** |
| 3 | Os hooks estão ligados? | leitura de `.claude/settings.local.json` | **`disableAllHooks: true`** |
| 4 | Há plugins/marketplaces habilitados? | leitura de `~/.claude.json` e `settings.local.json` | **zero marketplaces, zero plugins** (`enabledPlugins: {"ponytail@ponytail": false}`) |
| 5 | O MCP de memória funciona? | `git log` de `45bdc1d` | **`fix(memoria): desativa Chroma incompatível no Windows`** |

Verificação 3 merece destaque: `settings.local.json` tem **hash pinado** pelo launcher
(`start-baseline.ps1:132`). O `disableAllHooks: true` não é acidente de configuração — está dentro
do baseline de integridade assinado. O hook roteador não dispara, por desenho.

Verificação 5 é autoconfissão: o último commit da branch desliga o próprio subsistema de memória.

Camada adicional, posterior ao legado: mesmo que tudo acima fosse revertido, o launcher hoje impõe
`--strict-mcp-config` com allowlist **por ferramenta** (`mcp__codex__*` e seis ferramentas Serena
nominais). `admai-claude-mem-mcp` não está na lista e não seria carregável.

### Veredito

> O EOS legado é **100% artefato de projeto e 0% funcionalidade em execução.**

Isto não é depreciação do trabalho — o desenho tem valor real, documentado na seção 4. É a
constatação de que **não há runtime a desligar, conflito de execução a resolver, nem dado a migrar.**
A migração para o V2 é de **conteúdo**, não de **sistema**.

---

## 3. Inventário forense — `tools/claude-plugins/` (25 arquivos)

Todos em `ai/claude/TASK-025-plugin-autonomy`, ausentes do HEAD.
Obtido com `git ls-tree -r -l ai/claude/TASK-025-plugin-autonomy tools/claude-plugins`.

### 3.1 `admai-domains` — roteador + 12 skills de domínio

| Arquivo | Bytes | Função | Estado executável |
|---|---|---|---|
| `hooks/route-prompt.mjs` | 2.416 | Roteador determinístico por regex sobre o prompt | **Inerte** (hooks desligados) |
| `hooks/hooks.json` | 314 | Registra o hook em `UserPromptSubmit`, timeout 10 s | **Inerte** |
| `.claude-plugin/plugin.json` | 185 | Manifesto | **Não carregado** |
| `skills/backend-api/SKILL.md` | 549 | Engenharia de API Express | **Não carregada** |
| `skills/frontend-ui/SKILL.md` | 632 | React/Vite/painel | **Não carregada** |
| `skills/auth-security/SKILL.md` | 603 | Autenticação e autorização | **Não carregada** |
| `skills/billing/SKILL.md` | 587 | Stripe, trial, entitlement | **Não carregada** |
| `skills/ci-ops/SKILL.md` | 556 | CI, deploy, observabilidade | **Não carregada** |
| `skills/docs-governance/SKILL.md` | 538 | Documentação e governança | **Não carregada** |
| `skills/integrations/SKILL.md` | 507 | WhatsApp, Meta, Google, storage | **Não carregada** |
| `skills/data-prisma/SKILL.md` | 489 | Prisma, Postgres, multi-tenant | **Não carregada** |
| `skills/accessibility/SKILL.md` | 461 | a11y, axe, ARIA | **Não carregada** |
| `skills/mobile-capacitor/SKILL.md` | 451 | Capacitor, Android, deep link | **Não carregada** |
| `skills/queues-workers/SKILL.md` | 443 | Redis, BullMQ, jobs | **Não carregada** |
| `skills/tests-quality/SKILL.md` | 412 | Testes, cobertura, lint | **Não carregada** |

**Qualidade do conteúdo das skills — verificada por leitura.** Não são genéricas. `backend-api`
diz, textualmente: *"Rotas autenticadas devem reutilizar `requireAuth`, `requirePermissao` e
`req.db`"*, *"valide entradas com Zod no boundary"*, *"Corrija a causa no helper compartilhado
quando todos os chamadores passam por ele"*. São **os invariantes reais deste repositório**, os
mesmos que o `AGENTS.md` vigente impõe. Conteúdo aproveitável.

### 3.2 `admai-claude-mem-mcp` — proxy de memória

| Arquivo | Bytes | Função | Estado |
|---|---|---|---|
| `scripts/mcp-filter.mjs` | 2.016 | Proxy JSON-RPC que filtra ferramentas do MCP de memória | **Inerte** |
| `.claude-plugin/plugin.json` | 177 | Manifesto | **Não carregado** |

O filtro é tecnicamente bom e vale registro:

```js
export const ALLOWED_TOOLS = new Set(["search", "timeline", "get_observations"]);
// qualquer outra tools/call -> { code: -32601, "Memory tool not allowed by AdmAi policy" }
// e tools/list é reescrito para expor somente as permitidas
```

É um **proxy MCP somente-leitura por allowlist**, que filtra tanto a chamada quanto a listagem —
padrão correto, e conceitualmente idêntico ao `--allowedTools` por ferramenta que o launcher atual
usa. O subsistema que ele protegia (Chroma) foi desativado por incompatibilidade com Windows.

### 3.3 `admai-security-guidance-lite`

| Arquivo | Bytes | Função | Estado |
|---|---|---|---|
| `hooks/security-patterns.mjs` | 2.673 | Padrões de segurança em hook | **Inerte** |
| `hooks/hooks.json` | 417 | Registro do hook | **Inerte** |
| `NOTICE.md` | 543 | Atribuição | — |
| `.claude-plugin/plugin.json` | 223 | Manifesto | **Não carregado** |

### 3.4 Infraestrutura

| Arquivo | Bytes | Função | Estado |
|---|---|---|---|
| `plugin-lock.json` | 4.517 | Registro de extensões, orçamentos e runtimes | **Não aplicado** |
| `lab-preflight.mjs` | 6.090 | Preflight do laboratório isolado | `NÃO EXECUTADO` nesta análise |
| `domain-routing-smoke.mjs` | 4.937 | **Teste automatizado do roteamento** | `NÃO EXECUTADO` nesta análise |

**`domain-routing-smoke.mjs` é o achado mais subestimado do legado.** Ele não é um teste de mesa:
instancia `claude.exe` com um perfil isolado (`~/.claude-admai-plugin-lab`), roda casos e inspeciona
a sessão para verificar **quais skills foram de fato invocadas** (`skillsFromSession`). É um
precursor direto do *self-test* e do *dogfooding* que o EOS V2 exige.

**`plugin-lock.json` contém medição real de orçamento:**

```json
"budgets": { "alwaysOnTokens": 1000, "automaticMemoryTokens": 2500, "measuredAlwaysOnTokens": 880 }
"runtimeTools": { "bun": {"version":"1.3.12","archiveSha256":"841FF9C5…"},
                  "uv":  {"version":"0.11.7","archiveSha256":"FE0C7815…"} }
"forbiddenPlugins": ["feature-dev","pr-review-toolkit","code-review",
                     "code-simplifier","ponytail","context7","playwright"]
```

`measuredAlwaysOnTokens: 880` contra um teto de 1.000 é **número medido, não estimado** — dado
legítimo para o Tool Cost Registry. `forbiddenPlugins` gera um conflito com a política vigente,
tratado no documento 04.

---

## 4. A sobrevivência seletiva — o achado que reordena a classificação

A pergunta óbvia é: o trabalho foi abandonado por quê? A resposta muda a leitura do legado.

`AGENTS.md` **existe no HEAD** e **existe na TASK-025**, com blobs diferentes:

| Ref | Blob de `AGENTS.md` |
|---|---|
| `HEAD` | `b34f136a` |
| `ai/claude/TASK-025-plugin-autonomy` | `ac0efb48` |

O `AGENTS.md` da linha principal entrou por um commit próprio — `bbb8382`
*"chore(agent-env): enable Claude-Codex governance"*, **que é ancestral do HEAD**
(`git merge-base --is-ancestor bbb8382 HEAD` → verdadeiro).

O diff entre as duas versões é de **2 inserções e 12 remoções**. O que ficou de fora:

```
REMOVIDO: ## Plugins e memoria
REMOVIDO: - A unica allowlist de extensoes e `tools/claude-plugins/plugin-lock.json`;
          drift de fonte, hash, hook, MCP ou executavel bloqueia o launcher.
REMOVIDO: - Skills podem selecionar contexto e orientar a execucao, mas nao ampliam
          escopo ou autoridade.
REMOVIDO: - Memoria local e apenas indice auxiliar. […]
REMOVIDO: - Claude-mem nao importa transcripts antigos […] proxy `admai-claude-mem-mcp`
          bloqueia ferramentas MCP fora de `search`, `timeline` e `get_observations`.
REMOVIDO: - Nenhum plugin cria agentes writers. […]
REMOVIDO: Politicas completas: TOKEN_POLICY.md, MEMORY_POLICY.md, PERMISSIONS.md,
          WORKTREE_POLICY.md.
```

**Leitura.** A governança — protocolo DECISOR/REVISOR/ÁRBITRO, writer único, gates — **atravessou
para a linha principal e está viva hoje**. A maquinaria de plugins, skills-como-extensão e memória
**não atravessou**, e as quatro políticas que a sustentavam também não:

| Documento | HEAD | TASK-025 |
|---|---|---|
| `TOKEN_POLICY.md` | ausente | 2.485 B |
| `MEMORY_POLICY.md` | ausente | 2.407 B |
| `PERMISSIONS.md` | ausente | 2.320 B |
| `WORKTREE_POLICY.md` | ausente | 1.851 B |

Isso **não é o retrato de um trabalho interrompido no meio**. É o retrato de uma **escolha**: a parte
de governança foi promovida; a parte de extensões foi deixada para trás junto com sua própria
política. Reabrir a maquinaria de plugins por custo afundado seria reverter uma decisão, não retomar
uma pendência.

`NÃO VERIFICADO`: a intenção declarada por trás dessa separação. Não há registro escrito do motivo
em nenhum commit ou documento examinado. A inferência acima é do padrão de commits, não de
declaração do autor.

---

## 5. Os 53 documentos de ambiente

`git ls-tree -r ai/claude/TASK-025-plugin-autonomy docs/agent-environment` → 53 arquivos.
Interseção com o HEAD, via `comm -12`: **exatamente 1** — `AGENT_DECISIONS.md`.

> **52 dos 53 documentos de ambiente do legado nunca chegaram à linha principal.**

Classificação por natureza (o conteúdo integral de cada um não foi lido; a classificação usa nome,
tamanho e amostragem de cabeçalhos — declarado como amostragem, não leitura exaustiva):

| Grupo | Qtd. | Exemplos | Classificação |
|---|---|---|---|
| Relatórios de rodada B1/B2/B3 | ~30 | `B2_R2E_BATTERY_REPORT.md`, `B1_INDEPENDENT_REVIEW.md` | **Histórico** — registro de execução passada, sem valor normativo |
| Políticas efetivas | 4 | `TOKEN_POLICY.md`, `MEMORY_POLICY.md`, `PERMISSIONS.md`, `WORKTREE_POLICY.md` | **Nunca vigoraram** na linha principal |
| Propostas | 4 | `*_PROPOSAL.md` | **Superadas** — nunca aprovadas |
| Desenho de arquitetura | 4 | `TARGET_ARCHITECTURE.md` (9.909 B), `CHANGE_PLAN.md` (13.000 B), `TOOL_DECISIONS.md` (13.472 B), `CLAUDE_CODEX_ARCHITECTURE.md` (985 B) | **A examinar** — maior densidade de desenho reaproveitável |
| Incidentes | 3 | `B2_MCP_ISOLATION_INCIDENT.md`, `REMOTE_SECRET_HISTORY_INCIDENT.md` | **Lição durável** — preservar como evidência |
| Estado / operação | ~8 | `EXECUTION_STATE.md`, `ROLLBACK.md`, `CLEANUP_MANIFEST.md`, `ENVIRONMENT_AUDIT.md` (18.675 B) | **Obsoletos como estado**, úteis como referência |

`NÃO VERIFICADO`: o conteúdo integral de `TARGET_ARCHITECTURE.md`, `CHANGE_PLAN.md` e
`TOOL_DECISIONS.md`. São os três com maior chance de conter desenho reaproveitável e estão marcados
para leitura dirigida na fase de execução da migração, não nesta análise.

---

## 6. `tools/codex-policy/`

Presente em TASK-023, TASK-024 e TASK-025; ausente do HEAD. O que dele sobreviveu foi o **conteúdo
normativo**, absorvido pelo `AGENTS.md` vigente: modos `DECISOR`/`REVISOR`/`ÁRBITRO`, Codex delegado
somente leitura, negação de patches. Os commits `8f6d1e0` *"torna Codex delegado somente leitura"* e
`98e48fb` *"nega patches Codex pelo protocolo"* descrevem exatamente as regras hoje escritas em
`AGENTS.md`.

O mecanismo atual equivalente vive no launcher — `codex-mcp-policy`, `approval-policy.mjs`,
`.codex/config.toml` —, todos com hash pinado e verificados íntegros nesta sessão.

---

## 7. Resumo executável

| Componente legado | Existe arquivo | Funcionalidade existe | Onde |
|---|---|---|---|
| Protocolo de governança Claude-Codex | ✅ | ✅ **vigente** | `AGENTS.md`, `CLAUDE.md` no HEAD |
| Política Codex (read-only, nega patch) | ✅ | ✅ **vigente** | `AGENTS.md` + launcher |
| Roteador por domínio (`route-prompt.mjs`) | ✅ | ❌ | TASK-025, hooks desligados |
| 12 skills de domínio | ✅ | ❌ | TASK-025, não carregadas |
| Proxy de memória (`mcp-filter.mjs`) | ✅ | ❌ | TASK-025, Chroma desativado |
| Hooks de segurança | ✅ | ❌ | TASK-025, hooks desligados |
| `plugin-lock.json` (orçamentos, runtimes) | ✅ | ❌ | TASK-025, não aplicado |
| Smoke test de roteamento | ✅ | ❓ `NÃO EXECUTADO` | TASK-025 |
| 4 políticas (token, memória, permissões, worktree) | ✅ | ❌ | TASK-025, nunca vigoraram |
| 52 documentos de ambiente | ✅ | — | TASK-025, fora da linha principal |

**Conclusão da forense:** há um corpo substancial de **desenho** legado, do qual a parte de
governança já foi promovida e está viva, e a parte de extensões foi deliberadamente deixada para
trás. O que resta a decidir no documento 02 é quanto desse desenho — não do código — o EOS V2 deve
herdar.
