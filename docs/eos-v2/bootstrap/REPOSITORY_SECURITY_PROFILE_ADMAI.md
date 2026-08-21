# `REPOSITORY_SECURITY_PROFILE` — AdmAi

**Slice:** `SL-BOOT-03` · **Estado:** `PROPOSED` — perfil planejado, **não** ativo ·
**`proofRegime`:** `BOOTSTRAP_PROOF` · **Owner:** `security` · **RR:** `release`
**Change Requests materializados:** `PDCR-002`, `PDCR-003`

> Nada aqui está implementado ou em vigor. Este é o perfil que o EOS novo usará, derivado do
> `LEGACY_SECURITY_EVIDENCE_SNAPSHOT` e do MAR-P1 §L. Cada controle declara sua `EnforcementClass`
> **real**, não a pretendida (`MAR-INV-025`).
>
> **Nenhum valor de hash, credencial ou token aparece neste documento.** Pins de integridade são
> descritos por papel e contagem.

---

## 1. Identidade

| Campo | Valor |
|---|---|
| `repositoryId` | `admai/agent-environment` |
| `trustState` | `TRUSTED_ESTABLISHED` — perfil derivado de mecanismo observado, não assumido |
| Branch autorizada | `fix/seguranca-criticos` (pin único; divergência aborta) |
| Commit esperado | pin em `.claude/expected-head.txt`, verificado no start |
| Boundary do repositório | a raiz da worktree; **é uma worktree vinculada**, não um clone standalone |

**Nota estrutural que o perfil precisa carregar:** cinco worktrees compartilham o mesmo object
database. `git worktree` **não** é boundary de isolamento neste repositório — consequência direta do
`F-MAR-058`.

## 2. Caminhos protegidos

Contra leitura e uso em comando: `.env`, `.envrc`, `.git`, `.claude`, `.codex`.
Contra escrita, além dos acima: `tools/codex-policy` — a própria política de aprovação, que de outra
forma poderia aprovar a reescrita de si mesma e dos próprios testes.

Acrescentados pelo `PDCR-001` para o EOS novo: **Proof store, artefatos de verificação, Journal,
checkpoints, `WriteManifest`** e o diretório de perfil do provider.

Guarda de forma: nome curto 8.3 (`~1`) é rejeitado — sem isso, toda proteção baseada em nome de
diretório é contornável.

## 3. Política de ferramentas

| Caminho | Política |
|---|---|
| MCP legado | allowlist de duas ferramentas; qualquer outra → erro `-32601` |
| Serena | seis ferramentas, todas de leitura de símbolo |
| EOS novo — Codex | `MINIMUM_SET` congelado no PLAN-C: `evidence.request`, `knowledge.query`, `symbol.query` |
| EOS novo — Claude | `MINIMUM_SET` do PLAN-D: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash` restrito |
| **Subagentes** | **negados** — `F-MAR-051`, fora do MVEP |
| Rede | negada por padrão; liberada por tarefa autorizada |

## 4. Política de escrita — classificada honestamente

| Caminho | Classe real |
|---|---|
| Codex via MCP legado | `POLICY_ENFORCED` **permissivo** — aprova patch na worktree (`F-MAR-057`) |
| Codex via `codex exec` | **escrita bloqueada** pelo sandbox da plataforma (`F-MAR-064`) |
| Claude — ferramenta de arquivo | `POLICY_ENFORCED` pendente de probe |
| Claude — shell | `POLICY_ENFORCED` **apenas no casamento da string** (`F-MAR-047`) |
| Claude — subprocesso | `UNKNOWN`, esperado `NONE` |
| `SliceLease` | `COORDINATION_ONLY` (`F-MAR-027`) |
| `WriteManifest` | `DETECTIVE`, produzido pelo Kernel (`PBCR-002`) |
| Contenção física de escrita | **inexistente** (`F-MAR-046`) — `KNOWN_LIMITATION` |

**A capacidade de escrita do Codex depende do transporte, não do provider.** O `SL-CX-01` do Master
DAG precisa probar os dois caminhos.

## 5. Cadeia de integridade — `PDCR-002`

Verificada no start, **fail-closed** (divergência lança e aborta):

- **nove** pins SHA-256: binário do Claude, `package.json`, runtime Node, manifesto e wrapper do MCP
  Codex, política do MCP, decisão de aprovação, config local do Codex, manifesto do Serena;
- pin de `expected-head` e de branch;
- allowlist de **nomes** de item do diretório de perfil — detecta arquivo inesperado;
- `Assert-NoReparsePoint` sobre worktree e perfil — bloqueia junction e symlink.

Classe: `DETECTIVE` quanto à detecção, com efeito de aborto no start. **Valores não são reproduzidos
aqui.**

## 6. Controles de sessão — `PDCR-002`

`permissions.defaultMode: "default"` — **não** auto-aprovador · `disableAllHooks: true` ·
`autoMemoryEnabled: false` · `disableClaudeAiConnectors: true`.

O primeiro é a resposta legada ao `F-MAR-048` e **não pode regredir** na migração.

## 7. Controles de invocação — `PDCR-003`

Quatro controles que nenhum plano anterior representava:

1. **Política no Registry** — `HKLM`/`HKCU\SOFTWARE\Policies\ClaudeCode` presente → aborta.
2. **Conflito de `CLAUDE_CONFIG_DIR`** → aborta.
3. **Bloqueio de override em argumento do usuário** — `--mcp-config`, `--settings`,
   `--setting-sources`, `--plugin-dir`, **`--add-dir`**, `--allowedTools`, `--disallowedTools`,
   `--strict-mcp-config`, `--dangerously-skip-permissions`, `mcp`, `/mcp`.
4. **Allowlist de item do perfil.**

O terceiro é o mais relevante para o EOS novo: o PLAN-D apoiou-se em `--add-dir` como lever de
filesystem, e no legado **o usuário não pode passá-lo**.

## 8. Política de ambiente, secrets e isolamento

Ambiente `LOCAL` por padrão; `STAGING` e `PRODUCTION` exigem política e D2 do usuário.
Secrets: somente por referência; nunca no Journal, no ledger, em log ou em cápsula; menor privilégio;
o diretório de perfil do provider entra em caminhos protegidos.

**Isolamento de estado do provider:** hoje **inexistente** — `CODEX_HOME` e o perfil do Claude são por
instalação, não por repositório. Alvo: derivado de `repositoryId`. **`MAR-INV-023A`:** identidade de
provider compartilhada **não** implica contexto de repositório compartilhado. Exigido `PROVEN` antes
do Active.

## 9. Invariantes do repositório

`EOS-P01`–`P12` e `EOS-INV-*` preservados sem enfraquecimento e sem renumeração · `MAR-INV-001`–`044`
· `MASTER-INV-001`–`002` · as quatro `BOOTSTRAP-INV-PAR-*` do amendment, válidas apenas durante o
bootstrap.

## 10. Comportamento fail-closed

Divergência de hash, branch, HEAD, reparse point, política no Registry, `CLAUDE_CONFIG_DIR` ou nome de
item do perfil → **aborta antes de iniciar**. Ferramenta MCP fora da allowlist → erro. Override de
segurança em argumento → exceção. Comando de shell com metacaractere → negado.

**Nenhum desses controles é descrito como mais forte do que a evidência sustenta.** Onde a garantia é
apenas detectiva, o perfil diz detectiva; onde é inexistente, diz inexistente.
