# `LEGACY_SECURITY_EVIDENCE_SNAPSHOT`

**Slice:** `SL-BOOT-03` · **Onda:** 0 · **Gate:** `BASELINE_CAPTURED` ·
**`proofRegime`:** `BOOTSTRAP_PROOF` · **Owner:** `security` · **RR:** `release`
**`masterPlanVersion`:** 1.1.0 · **Estado:** `OBSERVED` — registro de evidência, não implementação

> **Fonte de verdade (PLAN-G §9):** mecanismo executado > configuração executável > código de política
> > documentação > comentário. Onde a documentação e o mecanismo divergem, **o mecanismo vence** para
> classificação de capability e enforcement.
>
> **`MASTER-INV-001`:** equivalência de migração é avaliada contra enforcement legado **observado**,
> nunca contra intenção documentada.
>
> **Nenhum valor de hash, credencial, token ou conteúdo de `.env` é reproduzido neste documento.**
> Pins de integridade são referenciados por papel e contagem, jamais por valor.

---

## A. Reconciliação da matriz de garantias do MAR-P1 §J

| # | Garantia | Alegação documentada | Mecanismo observado | Veredito | `EnforcementClass` real | Finding |
|---|---|---|---|---|---|---|
| 1 | Codex somente leitura | "read-only" | perfil `workspace-only` define `"." : "write"` **e** `decidirPatch` retorna aprovado | **`MISLABELED`** | `POLICY_ENFORCED` permissivo | `F-MAR-057` |
| 2 | Codex não cria patch | "Política do MCP nega patches" (`OBSERVED`) | `approval-policy.mjs` **aprova** patch na worktree; nega apenas caminho protegido, nome curto 8.3, grant root fora da raiz e patch sem caminho | **`FALSE`** | `POLICY_ENFORCED` permissivo | `F-MAR-057` |
| 3 | Config estrita de MCP | `--strict-mcp-config` | passado nos **dois** ramos do launcher | **`CONFIRMED`** | `POLICY_ENFORCED` | — |
| 4 | Allowlist por ferramenta | allowlist de tools MCP | `mcp__codex__*` + seis ferramentas Serena, todas de leitura | **`CONFIRMED`** | `POLICY_ENFORCED` | — |
| 5 | Sem bypass de aprovação | "ausência de `--dangerously-*`" | **não é ausência**: o flag está na lista de prefixos bloqueados e o launcher **lança exceção** se o usuário o passar | **`UNDERSTATED`** | `POLICY_ENFORCED` | `F-MAR-062` |
| 6 | Integridade por hash | "cadeia pinada" | **nove** pins SHA-256 + `expected-head` + branch + allowlist de nomes de item do perfil | **`CONFIRMED`** e maior | `DETECTIVE` | — |
| 7 | Fail-closed em drift | "aborta" | `Assert-Equal` **lança** em divergência | **`CONFIRMED`** | `DETECTIVE` → aborta | — |
| 8 | Escopo de worktree | raiz e branch pinadas | `$projectRoot`, `$expectedBranch`, `$expectedHead` + `Assert-NoReparsePoint` em worktree e perfil | **`CONFIRMED`** | `DETECTIVE` | — |
| 9 | Isolamento entre repositórios | "não existe hoje" | `CODEX_HOME` e perfil do Claude são **por instalação**, não por repositório | **`CONFIRMED`** | inexistente | `F-MAR-009/010/049` |

## B. Controles reais não representados em nenhum plano — `F-MAR-062`

Quatro controles existem no mecanismo e **não** apareciam em PLAN-A…F. Aqui o legado é **mais forte**
do que os planos registravam; migrar sem mapeá-los perderia proteção real.

| Controle | Mecanismo | Veredito | Classe |
|---|---|---|---|
| Detecção de política no Registry | verifica `HKLM`/`HKCU\SOFTWARE\Policies\ClaudeCode` e **lança** se presente | **`UNREPRESENTED`** | `DETECTIVE` → aborta |
| Conflito de `CLAUDE_CONFIG_DIR` | compara com o perfil dedicado e **lança** em divergência | **`UNREPRESENTED`** | `POLICY_ENFORCED` |
| Bloqueio de override em argumento do usuário | lança para `--mcp-config`, `--settings`, `--setting-sources`, `--plugin-dir`, **`--add-dir`**, `--allowedTools`, `--disallowedTools`, `--strict-mcp-config`, `--dangerously-skip-permissions`, `mcp`, `/mcp` | **`UNREPRESENTED`** | `POLICY_ENFORCED` |
| Allowlist de nomes de item do perfil | compara o conteúdo do diretório de perfil com uma lista esperada | **`UNREPRESENTED`** | `DETECTIVE` |

**`--add-dir` bloqueado importa em particular:** o PLAN-D apoiou-se nele como o único lever de
filesystem do runtime Claude, e no legado **o usuário não pode passá-lo**.

## C. Controles de `settings.local.json` — `F-MAR-061`

| Controle | Valor observado | Veredito | Classe |
|---|---|---|---|
| `permissions.defaultMode` | `"default"` — **não** é modo auto-aprovador | **`UNREPRESENTED`** | `POLICY_ENFORCED` |
| `disableAllHooks` | `true` | **`UNREPRESENTED`** | `POLICY_ENFORCED` |
| `autoMemoryEnabled` | `false` | **`UNREPRESENTED`** | `POLICY_ENFORCED` |
| `disableClaudeAiConnectors` | `true` | **`UNREPRESENTED`** | `POLICY_ENFORCED` |

`defaultMode: "default"` é a resposta legada ao `F-MAR-048`: **o sistema atual não usa modo
auto-aprovador**, e regredir nisso seria perda de garantia.

## D. Evidência antecipada sobre o provider Codex — `F-MAR-064`

`OBSERVED` nesta execução, fora do caminho MCP: `codex exec` v0.144.1 em `windows-x86_64` **não
escreve** no workspace mesmo com `--sandbox workspace-write`, `approval_policy="never"` e
`trust_level="trusted"`. `codex doctor` reporta *"restricted fs + restricted network · approval
OnRequest"*, e o sandbox da plataforma é *"Windows restricted token"*.

**Contraste que importa para a migração:** o caminho **MCP legado** permite patch na worktree
(§A linha 2); o caminho **`codex exec` direto** não permite escrita alguma. A capacidade de escrita do
Codex neste ambiente é, portanto, **uma propriedade do transporte**, não do provider. Isso reforça a
conclusão do `F-MAR-057`: a garantia real depende de qual caminho está ativo, e o `SL-CX-01` do Master
DAG precisa probar **os dois**.

## E. Síntese

| Direção | Contagem | Consequência |
|---|---|---|
| Documentação **mais forte** que o mecanismo | 2 (linhas 1 e 2) | `F-MAR-057` — o fallback legado **não** é read-only-safe |
| Mecanismo **mais forte** que a documentação | 9 (§B + §C + linha 5) | `F-MAR-061`, `F-MAR-062` — migrar sem mapear perde proteção |
| Confirmados | 6 | migram como equivalentes |
| Inexistentes | 1 (isolamento entre repos) | ganho novo do EOS, exigido antes do Active |

**Nenhuma garantia é descrita aqui como mais forte do que a evidência sustenta** (`MAR-INV-025`).
