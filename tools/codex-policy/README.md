# Política de aprovação do Codex (MCP)

Decisão de aprovação para requisições que o **Codex inicia** em direção ao cliente
MCP. Este diretório é versionado; o que é específico da máquina (launcher,
wrapper, perfis, pins de hash, caminhos absolutos) fica em `.claude/`, fora do
versionamento.

## Como as peças se encaixam

```
Claude Code  ──stdio──>  .claude/codex-mcp-policy.mjs  ──stdio──>  codex mcp-server
 (cliente MCP)            (shim: I/O, caminhos da máquina)          (servidor MCP)
                                    │
                                    └── importa ──> tools/codex-policy/approval-policy.mjs
                                                    (decisão pura, versionada)
```

O shim faz duas coisas distintas:

1. **Cliente → servidor**: restringe as ferramentas expostas a `codex` e
   `codex-reply` e fixa os argumentos (`cwd`, `approval-policy`, `config`).
2. **Servidor → cliente**: intercepta os pedidos de aprovação e **responde ele
   mesmo**, sem repassar ao Claude Code.

O item 2 é o motivo deste módulo existir.

## O bug que originou tudo

O shim original só tratava o fluxo cliente→servidor. Uma mensagem vinda do
servidor com `method` **e** `id` (um `elicitation/create`) caía no caminho de
resposta e era encaminhada ao Claude Code, que respondia no formato MCP padrão
(`{action, content}`). O Codex espera a extensão `{decision}`, não reconhecia, e
ficava esperando até o `MCP_TOOL_TIMEOUT` de 120s.

Havia ainda um segundo defeito no mesmo trecho: o `pending.delete(id)` rodava
sem verificar se a mensagem era resposta. Os contadores de `id` do cliente e do
servidor são independentes, então um `elicitation/create` com `id` colidente
removia do mapa `pending` um `tools/call` em voo.

## Contrato do protocolo

Extraído do binário `codex` 0.144.1 (`grep -a` sobre as strings embutidas), não
de documentação — as strings estão no executável.

### Resposta

```
struct ExecApprovalResponse with 1 element   →  { "decision": <ReviewDecision> }
struct ApplyPatchApprovalResponse            →  idem
```

`ReviewDecision` é string em snake_case:

| Valor | Uso |
|---|---|
| `approved` | libera esta operação |
| `approved_for_session` | libera e não pergunta mais na sessão |
| `denied` | recusa |
| `abort` | interrompe a tarefa |

Também existem `approved_execpolicy_amendment`, `network_policy_amendment` e
`timed_out`. Esta política usa apenas `approved` e `denied`.

### Requisição

Dois transportes, mesma decisão:

| Protocolo | Método |
|---|---|
| `codex mcp-server` | `elicitation/create` com campos `codex_*` |
| app-server | `execCommandApproval` / `applyPatchApproval` |

Campos dos params:

| Tipo | Campos |
|---|---|
| exec | `codex_elicitation`, `codex_mcp_tool_call_id`, `codex_event_id`, `codex_call_id`, `codex_command`, `codex_cwd`, `codex_parsed_cmd` |
| patch | `codex_elicitation`, `codex_mcp_tool_call_id`, `codex_event_id`, `codex_call_id`, `codex_reason`, `codex_grant_root`, `codex_changes` |

A detecção é por **presença de campo** (`codex_command` / `codex_changes`), não
pelo discriminador — assim o mesmo código serve aos dois protocolos.

Um `elicitation/create` que **não** seja aprovação (pergunta genérica ao usuário)
recebe o `ElicitResult` padrão do MCP: `{ "action": "decline" }`.

## Por que allowlist, e não denylist

A primeira versão negava por categoria (rede, Docker, git destrutivo…) com regex
sobre a linha de comando. Uma revisão adversarial **aprovou 45 de 45 comandos
perigosos** contra ela:

| Bypass | Causa |
|---|---|
| `git -c core.pager=cat push` | a regex exigia `git` adjacente ao verbo |
| `certutil -urlcache`, `bitsadmin`, `iex (irm …)`, `powershell -enc` | não estavam na lista de "rede" |
| `pip install`, `cargo install`, `go get`, `npx --yes <pacote>` | não estavam na lista de "dependência" |
| `rm -rf`, `reg add …\Run`, `netsh advfirewall … off` | não havia categoria de destruição |
| `cat .env` | a checagem de caminho protegido só rodava no ramo de patch |

Denylist de shell **falha aberta**: não há como enumerar o perigoso. Hoje só
passa o que está listado; o resto é negado.

## Regras em vigor

**Comandos** — `git` (só subcomandos de leitura), `npm test`, `npm run <script da
lista>`, e verificadores locais (`prettier`, `eslint`, `vitest`, `tsc`).

- metacaractere de shell (`;`, `&&`, `|`, `>`, `` ` ``, `$(`, quebra de linha) → nega;
  testado sobre o texto **original**, porque separar por espaço em branco
  consumiria o `\n` e esconderia o encadeamento;
- flag antes do subcomando → nega;
- `npm run` restrito a uma lista fixa, porque os `package.json` do projeto expõem
  `prisma:migrate`, `validate:staging` e `bucket:provision`;
- flags que redirecionam diretório/execução (`-C`, `--prefix`, `--config`, `-e`) → nega.

**Caminhos** — precisam estar sob a raiz da worktree e fora das áreas protegidas
(`.env*`, `.envrc`, `.git/`, `.claude/`, `.codex/`).

Duas armadilhas específicas do Windows, ambas com teste dedicado:

- **nome curto 8.3**: `CLAUDE~1` resolve para `.claude` e `GIT~1` para `.git`
  neste volume. Sem rejeitar o padrão `~N`, um patch em `GIT~1/hooks/pre-commit`
  seria execução de código aprovada;
- **junction/symlink**: a verificação de raiz precisa resolver o caminho real
  (`realpath`). Puramente léxica, ela aprova escrita fora da worktree através de
  uma junction criada dentro dela.

**Padrão** — negar. Requisição sem comando e sem mudanças é recusada, e método
iniciado pelo servidor fora do conjunto conhecido recebe erro `-32601`
**enviado ao servidor**. Silêncio nunca é resposta: trava o Codex até o timeout.

## Testes

```bash
node --test tools/codex-policy/approval-policy.test.mjs
```

29 casos. Os de ataque vieram da revisão adversarial — cada bypass encontrado
virou caso de teste. Inclui controle positivo (9 comandos legítimos seguem
aprovados), para que endurecer a política não a torne inútil na prática.
