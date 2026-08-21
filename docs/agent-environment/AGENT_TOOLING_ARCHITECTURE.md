# Arquitetura de Ferramentas do Ambiente de Agentes — AdmAi

**Data:** 2026-08-07 · **Fase Zero + Zero-B** · **Commit-base:** `30bf545` · **Claude Code 2.1.223**

Documentação de ambiente. Não é código do produto e não altera nenhum comportamento do AdmAi.

> **Atualizado pela Fase Zero-B.** O bloqueio estrutural descrito no §1 foi **resolvido**: o pin do
> launcher foi re-baselinizado com proveniência criptográfica verificada, e os resíduos do
> auto-update interrompido foram removidos do perfil dedicado. O preflight passa.
> Histórico completo, diffs e rollback em
> [`LAUNCHER_TOOLING_MIGRATION.md`](./LAUNCHER_TOOLING_MIGRATION.md).
>
> Ferramentas acrescentadas desde a Fase Zero: **`uv`/`uvx` 0.12.2** (winget oficial),
> **Semgrep 1.172.0** (via `uv`, sem Docker e sem instalar Python à parte), **Playwright**
> (usando o Chrome instalado, sem baixar Chromium) e **Serena** (manifesto pronto em
> `.claude/serena-mcp.json`, com allowlist read-only por construção — pendente de aplicar a
> mudança de allowlist no launcher).
>
> **GitHub MCP foi descartado** — o `gh` CLI cobre os casos de uso; não instalar por simetria.

---

## 1. A restrição que define esta arquitetura

O launcher oficial `.claude/start-baseline.ps1` é um guard hermético. Seu preflight **aborta** se
encontrar qualquer um destes:

| Verificação | Linha | Impede |
|---|---|---|
| Hash de `.claude/settings.local.json` | `:100` | Qualquer edição nesse arquivo |
| Hash de `codex-mcp.json`, `codex-mcp-policy.mjs`, config do Codex, binário do Node | `:101-107` | Alterar o handshake Claude↔Codex |
| `throw 'MCP global detectado no perfil dedicado.'` | `:199` | Registrar MCP no perfil |
| `throw 'MCP de projeto detectado no perfil dedicado.'` | `:206` | Registrar MCP por projeto |
| `throw 'Plugin instalado detectado no perfil dedicado.'` | `:214` | Instalar **qualquer** plugin |
| `throw 'Marketplace não aprovado detectado.'` | `:219` | Adicionar marketplace |
| `throw '.mcp.json herdável detectado.'` | `:234` | Criar `.mcp.json` no projeto **ou em qualquer pasta ancestral** |
| `--strict-mcp-config` + `--allowedTools=mcp__codex__*` | `:303` | Carregar ou usar qualquer MCP além do Codex |
| `$blockedExact = @('mcp','/mcp')` e prefixos bloqueados | `:254-257` | Contornar por argumento de linha de comando |

**Consequência:** no ambiente oficial, MCP e plugin são arquitetonicamente impossíveis sem alterar
o launcher — o que o usuário proibiu. Por isso esta fase entrega **CLI + Skills**, que atravessam
o guard sem violá-lo.

### Achado pré-existente, não corrigido

`start-baseline.ps1:96` exige Claude Code **2.1.222**; o instalado é **2.1.223**. **O launcher já
falha no preflight** por auto-update, independentemente desta fase. Não corrigi — corrigir é
alterar o launcher. Reportado para decisão do usuário.

### Dois ambientes divergentes

| | Perfil do launcher | Perfil padrão |
|---|---|---|
| Diretório | `C:\Users\n1iag\.claude-admai` | `C:\Users\n1iag\.claude` |
| MCPs | 1 (`codex`), imposto | 1 global (`codex`) + registros de outro worktree |
| Plugins | Proibidos por assert | `ponytail` (desabilitado em `settings.local.json`) |
| Skills de projeto | **Carregadas** | **Carregadas** |

Skills de projeto e CLIs funcionam nos **dois**. É o único denominador comum — e a razão do desenho
desta fase.

---

## 2. Ferramentas instaladas

| Ferramenta | Tipo | Versão | Origem oficial | Escopo | Finalidade | Auto-route | Write |
|---|---|---|---|---|---|---|---|
| **Context7 CLI** (`ctx7`) | CLI npm global | 0.5.7 | `npmjs.com/package/ctx7` (Upstash) | Global do usuário | Documentação atual de biblioteca/framework/API de terceiro | Sim | Não |
| **admai-tool-router** | Skill de projeto | — | Criada nesta fase | `.claude/skills/` do projeto | Escolher a ferramenta certa; e quando não usar nenhuma | Sim (automática) | Não |

### Configuração

**Context7** — instalado com `npm install -g ctx7`. **Não** foi executado `ctx7 setup`: esse
comando é interativo (trava aguardando entrada) e, no modo MCP, registraria servidor MCP — o que o
launcher rejeita. Os subcomandos usados não precisam de setup nem de login:

```bash
ctx7 library <nome>                 # resolve o ID da biblioteca
ctx7 docs <libraryId> "<pergunta>"  # consulta dirigida
```

Autenticação: **nenhuma**. Funciona no nível anônimo, verificado nesta fase. `CONTEXT7_API_KEY`
(variável de ambiente) apenas eleva o limite de requisições — opcional, e nunca versionada.

**Roteador** — skill de projeto em `.claude/skills/admai-tool-router/SKILL.md`. Carregamento
automático por relevância semântica da `description` (500 bytes de custo permanente); o corpo
(4.407 bytes) só entra no contexto quando acionada.

---

## 3. Ferramentas especificadas e **não** instaladas

Cada uma com comando oficial, o que desbloqueia e por que está bloqueada hoje.

### 3.1 Serena — inteligência semântica de código

- **Finalidade:** símbolo, referência, estrutura e edição simbólica cross-file — operações sobre o
  que o compilador entende, não sobre linhas de texto.
- **Origem oficial:** `github.com/oraios/serena`.
- **Comando:**
  ```bash
  claude mcp add serena -- uvx --from git+https://github.com/oraios/serena \
    serena start-mcp-server --context claude-code --project $(pwd)
  ```
- **Bloqueado por (dois motivos independentes):**
  1. `claude mcp` é bloqueado pelo launcher (`$blockedExact`), e o MCP resultante seria rejeitado
     por `--strict-mcp-config`.
  2. `uvx` não existe nesta máquina — exige `uv` (Astral), que por sua vez exige instalação fora do
     npm. Verificado: **não há distribuição oficial de `uv` no npm** (o pacote `uv` do registro é de
     outro autor).
- **Fallback atual:** `Grep`/`Glob`/`Read`. Perde precisão simbólica; não perde capacidade.
- **Configuração recomendada quando liberado:** contexto `claude-code`; não priorizar shell,
  leitura/escrita genérica nem memória do Serena — o Claude Code já as tem.

### 3.2 GitHub MCP oficial

- **Finalidade:** PR, CI, Actions, issues, code security, comparação local × remoto.
- **Toolsets a habilitar:** `repos`, `pull_requests`, `actions`, `code_security`, `issues`. **Nunca
  `all`.** Read-only durante Discovery.
- **Bloqueado por:** launcher (`--strict-mcp-config`) **e** credencial (PAT ou OAuth, que só o
  usuário cria).
- **Fallback atual e por que é bom:** `gh` CLI **2.96.0 já instalado e autenticado no ambiente**.
  Cobre a íntegra dos casos de uso listados, sem custo de schema. Para a maioria das tarefas o
  ganho do MCP sobre o `gh` é pequeno.

### 3.3 Supabase MCP oficial

- **Finalidade:** schema, logs, advisors, debugging — **desenvolvimento e staging apenas**.
- **Configuração obrigatória:** `--read-only`, project scoping pelo ref do projeto, feature groups
  mínimos (`database`, `debugging`, `development`, `docs`).
- **REGRA ABSOLUTA:** **nunca conectar em produção.** O projeto de produção não recebe escrita pelo
  MCP em nenhuma fase. Existe um projeto de staging (`admai-staging`) preparado e ainda não
  validado — ver `docs/db/STAGING_VALIDATION.md`.
- **Bloqueado por:** launcher **e** credencial (personal access token do Supabase, que só o usuário
  cria) **e** o `.env.staging` que nunca foi preenchido.
- **Fallback atual:** `prisma/schema.prisma` e `prisma/migrations/` — que são a fonte de verdade
  versionada do schema.

### 3.4 Cloudflare MCP oficial

- **Finalidade:** diagnóstico de borda, DNS, cache, segurança, observabilidade.
- **Política:** **read-only**. Nenhuma alteração de Cloudflare nesta configuração.
- **Bloqueado por:** launcher **e** OAuth.
- **Relevância comprovada:** o incidente de 2026-08-05 (login quebrado em produção) nasceu
  exatamente na borda — CSP sem a origem da API, por variável ausente na integração nativa do
  Cloudflare Pages. Há caso de uso real; falta o acesso.

### 3.5 Postman MCP (Minimal)

- **Situação:** **não há coleção nem spec Postman no repositório.** Instalar hoje seria adicionar
  ferramenta sem substrato.
- **Quando reconsiderar:** se e quando existir uma estratégia real de collections/specs.
- **Nunca usar para:** substituir os 28 testes de integração existentes, `curl` simples ou teste
  unitário.

### 3.6 Semgrep

- **Finalidade:** SAST, secrets, supply chain, guardrail para código gerado por agente.
- **Decisão:** **Semgrep, não Snyk.** Nunca os dois — Semgrep vence por já ser o SAST do CI
  (`.github/workflows/security.yml`), então o resultado local bate com o do CI.
- **Semgrep Guardian (plugin oficial) NÃO será instalado**, por dois motivos verificados:
  1. Seu mecanismo é **post-tool hook** após cada escrita — e `.claude/settings.local.json` tem
     `disableAllHooks: true`, decisão que o usuário optou por preservar.
  2. Instalar plugin **quebra o launcher** (`:214`).
- **Caminho escolhido:** Semgrep CLI por invocação explícita, espelhando o CI:
  ```bash
  docker run --rm -v "$(pwd):/src" -w /src semgrep/semgrep semgrep scan \
    --config p/owasp-top-ten --config p/javascript --metrics off \
    chaveiro-bot/src chaveiro-painel/src
  ```
- **Bloqueado hoje por:** **Docker Desktop não está em execução** (`docker pull` falha ao conectar
  no npipe). O caminho alternativo (`pipx`/`uv install semgrep`) exige **Python 3.10+, ausente** —
  só existe o stub da Microsoft Store.
- **Política de uso quando destravado:** durante edição, nada (hooks desligados); **fim de tarefa**,
  scan dos arquivos afetados; **gate de fase**, scan completo. Sempre **resumir antes de detalhar**
  — severidade, arquivo, regra, linha, causa, correção — e só então carregar o detalhe do que for
  agir.

### 3.7 Playwright

- **Decisão:** **CLI + Skill, não MCP.** A documentação oficial (`playwright.dev/docs/getting-started-cli`)
  recomenda o CLI para coding agents que favorecem fluxo skill-based token-efficient, reservando o
  MCP para loops exploratórios com estado persistente.
- **Não instalado como dependência do produto.** `chaveiro-painel` e `chaveiro-bot` **não** têm
  Playwright, e adicioná-lo mexeria em `package.json`/lockfile — mudança que exige gate próprio
  (`AGENTS.md`). Uso previsto: `npx playwright` sob demanda, que baixa na primeira execução.
- **Ordem de preferência:** o repositório já tem harness próprio em `chaveiro-painel/e2e/run.mjs`
  (Chrome headless via CDP, `/api` mockado). Use-o para o que já cobre. Playwright entra onde ele
  não alcança: viewport mobile real, múltiplos navegadores, trace.

---

## 4. Permissões, escopo e ambiente

| Configuração | Escopo escolhido | Por quê |
|---|---|---|
| `ctx7` | Global do usuário (npm) | É um binário, não configuração de projeto; não contamina outros projetos |
| `admai-tool-router` | **Projeto** (`.claude/skills/`) | É específico do AdmAi e precisa funcionar no launcher |
| Credenciais (quando existirem) | **Local**, fora do Git | Nunca versionadas |
| `ENABLE_TOOL_SEARCH` | **Não configurado** | Já é o padrão do Claude Code; o único lugar de projeto seria o `settings.local.json` hasheado |

**Segredos.** Nenhum PAT, access token, API key, OAuth secret, service role ou senha foi gravado em
repositório, `CLAUDE.md`, `.mcp.json`, documentação ou log. Quando as credenciais existirem, o
caminho é variável de ambiente ou arquivo local ignorado pelo Git.

### Limitação: a skill é local, não versionada

`.gitignore:54` ignora `.claude/` inteiro. Consequência verificada: **o roteador existe só nesta
máquina e nesta worktree.** Não é compartilhado com outros clones, outras worktrees nem com o CI.

Isso tem dois lados. A favor: nada de configuração de agente entra no repositório do produto, o que
é coerente com a separação que o projeto já mantém. Contra: o roteamento não é reproduzível por
outra pessoa nem por outra worktree, e some se a pasta for limpa.

**Não alterei o `.gitignore`** — é arquivo versionado e a mudança tem efeito além desta fase. Se
quiser versionar apenas as skills, preservando o resto ignorado, a alteração é de uma linha:

```gitignore
.claude/
!.claude/skills/
```

Decisão do usuário. Enquanto não for tomada, trate o roteador como configuração local desta
máquina, e a documentação em `docs/agent-environment/` (essa sim versionada) como a fonte
reproduzível.

---

## 5. Como atualizar, desabilitar, remover e restaurar

### Atualizar

```bash
npm update -g ctx7        # ou: ctx7 upgrade
```

### Desabilitar sem remover

- **Roteador:** renomeie `.claude/skills/admai-tool-router/` para `admai-tool-router.disabled/`.
- **Context7:** deixe de invocá-lo; ele não roda sozinho.

### Remover

```bash
npm uninstall -g ctx7
rm -rf .claude/skills/admai-tool-router
rm docs/agent-environment/TOOL_ROUTING_MATRIX.md \
   docs/agent-environment/AGENT_TOOLING_ARCHITECTURE.md \
   docs/agent-environment/TOKEN_EFFICIENCY_BASELINE.md
```

### Restaurar o ambiente anterior

Esta fase **não alterou nenhum arquivo pré-existente** — só criou arquivos novos. Não há backup a
restaurar porque nada foi sobrescrito. A reversão completa é a remoção acima.

Estado preservado, verificado por hash antes e depois:

| Arquivo | SHA-256 (inalterado) |
|---|---|
| `.claude/settings.local.json` | `650ded9dde15ec45eb7f22afd9fe49c365d85cbc5e080a2c1248f06e985686f1` |
| `.claude/codex-mcp.json` | `7a1326d882f4d55369a34462283820dfd0fc72277f7d4aa0ee70fb9c52a75713` |
| `.claude/codex-mcp-policy.mjs` | `12784ac9d71e7e7330e9f840dd5a818c3f16e3116e7a6d322b92c6c144464702` |
| `.claude/start-baseline.ps1` | `8c588a0c10b11a248e7d348dd82feffe7d2b83a4f35f122faa1e8f76fee95e30` |
| `.codex/config.toml` | `51fdc7e1fdeb26680fca2bbe9fdc326053a41c71dd94a94bfd66f0313d357f7f` |

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Ferramenta externa consultada sem necessidade, gastando contexto | A regra de fechamento do roteador: nativa primeiro, externa só com ganho |
| Roteamento automático confundido com autorização automática | Seção "Automação ≠ autorização" da matriz; `MANUAL-GATE` para deploy, push, merge, migration, secret e produção |
| MCP de banco tocando produção | Supabase MCP não instalado; quando for, `read_only` + project scoping + proibição explícita |
| Segredo vazando para o repositório | Nada versionado; credenciais só em ambiente/arquivo local |
| Divergência entre os dois perfis de Claude | Só skills de projeto e CLIs, que funcionam nos dois |
| Semgrep local divergir do CI | Mesmos rulesets e mesmos caminhos do `security.yml` |
| Launcher quebrar por algo desta fase | Nenhum arquivo hasheado tocado; nenhum plugin, marketplace, MCP ou `.mcp.json` criado |

---

## 7. Pendências que exigem ação humana

| # | Ferramenta | Ação necessária | Impacto | Bloqueia o resto? |
|---|---|---|---|---|
| 1 | Semgrep | Iniciar o Docker Desktop **ou** instalar Python 3.10+ e `pipx install semgrep` | Sem varredura de segurança local; o CI continua cobrindo no PR | Não |
| 2 | Serena | Instalar `uv` (Astral) e decidir sobre o launcher | Busca simbólica continua por texto | Não |
| 3 | GitHub MCP | PAT ou OAuth + decisão sobre o launcher | Nenhum — `gh` CLI já cobre | Não |
| 4 | Supabase MCP | PAT do Supabase + preencher `.env.staging` + decisão sobre o launcher | Sem logs/advisors; schema versionado já cobre o essencial | Não |
| 5 | Cloudflare MCP | OAuth + decisão sobre o launcher | Diagnóstico de borda continua manual | Não |
| 6 | Launcher | Decidir se aceita alteração (hoje proibida) ou se os MCPs ficam fora | Enquanto não decidir, **nenhum MCP novo é utilizável no ambiente oficial** | **Sim, para todos os MCPs** |
| 7 | Versão do launcher | Preflight exige 2.1.222; instalado 2.1.223 | **O launcher não passa no próprio preflight hoje** | Sim, para iniciar por ele |
