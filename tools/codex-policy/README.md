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

### Envoltório de shell — descoberto em execução real

No Windows o Codex **nunca** envia o comando cru. A forma real, capturada de um
pedido de aprovação de verdade:

```json
{
  "codex_command":    ["C:\\...\\powershell.exe", "-Command", "node --test tools/..."],
  "codex_parsed_cmd": [{ "type": "unknown", "cmd": "node --test tools/..." }],
  "codex_cwd":        "C:\\Users\\...\\agent-environment"
}
```

A primeira versão da allowlist analisava o token 0 — o envoltório — cujo caminho
fica fora da worktree. Resultado: **negava tudo**, inclusive `npm test`. Os
testes unitários não pegaram porque usavam comandos idealizados (`"npm test"`);
só a validação operacional expôs a diferença.

Hoje `desembrulharShell` reconhece `powershell`, `pwsh`, `cmd`, `bash` e `sh`,
extrai o comando de dentro do `-Command` / `/c` / `-c`, e aplica a allowlist a
ele. `-enc` / `-EncodedCommand` são negados: base64 esconde o comando de
qualquer análise. A detecção de metacaractere roda sobre o texto que contém o
comando interno, então encadeamento dentro do envoltório também é pego.

`codex_parsed_cmd` chega como `[{type, cmd}]`; a detecção de metacaractere usa
`textoParaAnalise`, que extrai o `cmd` em vez de serializar o objeto — o JSON
traria `{` e `}` e negaria todo comando nessa forma por falso positivo.

### Regras de comando

**Comandos** — `git` (só subcomandos de leitura), `npm test`, `npm run <script da
lista>`, e verificadores locais (`prettier`, `eslint`, `vitest`, `tsc`, `node`).

`node` entrou porque rodar arquivo de teste da worktree é trabalho legítimo e
não amplia o risco: aplicar patch já foi aprovado antes, e `vitest` executa
código do repositório do mesmo jeito. Quem contém isso é o sandbox
(`workspace-only`, rede desligada), não a lista. Execução inline (`-e`,
`--eval`, `-p`, `--print`) segue negada.

- metacaractere de shell (`;`, `&&`, `|`, `>`, `` ` ``, `$(`, quebra de linha) → nega;
  testado sobre o texto **original**, porque separar por espaço em branco
  consumiria o `\n` e esconderia o encadeamento;
- flag antes do subcomando → nega;
- `npm run` restrito a uma lista fixa, porque os `package.json` do projeto expõem
  `prisma:migrate`, `validate:staging` e `bucket:provision`;
- flags que redirecionam diretório/execução (`-C`, `--prefix`, `--config`, `-e`) → nega.

### Flag com valor colado — a classe que virou RCE

Uma segunda revisão adversarial conseguiu **execução de código fora da
worktree**, provada ponta-a-ponta com o Codex real:

```
npm test --prefix=C:\Users\Public\rce_probe   →  approved  →  código executou fora
```

A causa: `FLAGS_PROIBIDAS` comparava o **token inteiro**. `--prefix` casava,
mas `--prefix=<valor>` é um token único e não casava nada — passava como
argumento comum. A mesma classe abria `--cwd=`, `--config=`, `--output=`,
`--outputFile=`, `--outDir=`, `--output-file=`.

Hoje todo argumento passa por `nomeDaFlag` (compara `--prefix`, não
`--prefix=X`) e por `candidatosDeCaminho`, que extrai:

| Forma | Candidato a caminho |
|---|---|
| `--output=saida.txt` | `saida.txt` |
| `git show HEAD:.env` | `.env` (o trecho após `:`) |
| `arquivo.js` | ele próprio |

O `:` só conta quando não é letra de unidade — `C:\x` não vira candidato.

Consequências fechadas na mesma rodada:

- `git diff --output=<path>` escrevia arquivo arbitrário, inclusive
  `.git/hooks/pre-commit`. Argumentos começados com `-` pulavam a checagem de
  caminho protegido;
- `node --require=`, `--import=`, `--experimental-loader`, `--env-file`,
  `--input-type`, `--conditions` carregavam código externo — `--env-file` ainda
  lia `.env` driblando a proteção;
- `git show HEAD:.env` exfiltrava segredo, porque `caminhoProtegido` exigia
  início ou separador antes de `.env` e o `:` não contava;
- `git --exec-path=<dir> status` executava `git-*` plantado.

**Caminhos** — precisam estar sob a raiz da worktree e fora das áreas protegidas
(`.env*`, `.envrc`, `.git/`, `.claude/`, `.codex/`).

Escrita tem proteção **adicional**: `tools/codex-policy/` não pode ser alterado
por patch. A política aprovava reescrever a si mesma e aos próprios testes; o
pin de hash só reavalia no próximo start, então um Codex comprometido poderia
enfraquecer os testes para esconder uma mudança futura. Leitura e execução
continuam livres — `node --test tools/codex-policy/...` é trabalho legítimo.

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
