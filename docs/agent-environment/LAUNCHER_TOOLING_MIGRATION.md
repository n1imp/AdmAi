# Migração do Launcher e do Ambiente de Ferramentas — Fase Zero-B

**Data:** 2026-08-07 · **Branch:** `fix/seguranca-criticos` · **HEAD:** `30bf5453…`
**Launcher:** `.claude/start-baseline.ps1` (não versionado — `.claude/` é gitignored)

---

## 1. Estado antigo e por que estava bloqueado

O launcher não passava no próprio preflight. Falhava em `Binário Claude divergente` (linha 95),
**antes** mesmo de chegar ao teste de versão.

| Item pinado | Pin | Real | Situação |
|---|---|---|---|
| Branch | `fix/seguranca-criticos` | idem | ✅ |
| HEAD | `30bf5453…` | idem | ✅ |
| `node.exe` | `9A4EB5F1…` | idem | ✅ |
| `settings.local.json` | `650DED9D…` | idem | ✅ |
| `settings.json` (perfil) | `0A5CD703…` | idem | ✅ |
| Cadeia Codex (5 arquivos) | — | inalterada | ✅ |
| **`claude.exe`** | `032CB799…` | `A708BA81…` | ❌ |
| **Versão** | `2.1.222` | `2.1.223` | ❌ |

E, no perfil dedicado, dois resíduos que o preflight também rejeitava:

- `.update.lock` — arquivo com PID **13176**, processo morto. Lock órfão.
- `.last-update-result.json` — registrava `2.1.220 → 2.1.222`, de 05/08.

### Causa raiz

**Um auto-update interrompido.** O processo 13176 começou a atualizar em 06/08 às 05:08,
**instalou o 2.1.223** (binário com mtime 06/08 05:11) e **morreu antes de finalizar a
escrituração** — não removeu o próprio lock nem escreveu o registro de resultado. O perfil
compartilhado (`~/.claude`) está ainda mais defasado: último registro de **05/07**,
`2.1.195 → 2.1.201`.

O launcher não tinha defeito. Ele detectou corretamente uma inconsistência real do ambiente.

---

## 2. Natureza do pin — a pergunta que precedia a troca

**O pin não é guarda de compatibilidade. É baseline de integridade de toolchain.**

Evidência, do próprio launcher:

1. Pina o **hash do `claude.exe`**, não só a versão. Um guarda de compatibilidade não precisaria do
   hash.
2. Pina o **hash do `node.exe`** — que não tem relação nenhuma com comportamento do Claude Code.
3. Pina settings, wrapper, policy e approval-policy do Codex, branch e HEAD.
4. Os comentários usam a linguagem explicitamente: *"seria um furo no mecanismo de integridade"*.

**Consequência:** atualizar o pin não é "aceitar uma versão nova" — é **re-estabelecer confiança**
num binário novo. A validação correta é de proveniência, não de comportamento.

---

## 3. Validação de proveniência executada antes da troca

A verificação ingênua daria **falso negativo**, e a armadilha merece registro: o `bin/claude.exe`
publicado no pacote principal tem **500 bytes** e é um script que apenas imprime *"claude native
binary not installed"*. O executável real (280 MB) vem da **dependência opcional por plataforma**.

Pela via correta:

| Passo | Resultado |
|---|---|
| `npm pack @anthropic-ai/claude-code-win32-x64@2.1.223` | Baixado do registro |
| sha512 do tarball baixado | `sha512-0lPycg4DKLKcPxF4EYSKdgTjAbv0RJRVOP85h8fV8jYza+L8k2yuxm2S/CrxTv9TCTB4w0pp+zi86fRtcCk4rg==` |
| `dist.integrity` publicado no registro | **idêntico** |
| SHA-256 do `claude.exe` extraído do tarball verificado | `A708BA811C4CC46907DF358E22F2AA6DA3DBC28192747E4D3C4A0869752FE722` |
| SHA-256 do `claude.exe` instalado | **idêntico** |

**Conclusão:** o binário instalado é bit-idêntico ao artefato oficialmente publicado. A divergência
do pin era upgrade legítimo, **não adulteração**. Re-baselinizar ficou justificado com evidência.

---

## 4. Estado novo

### 4.1 Aplicado

| Alvo | Mudança |
|---|---|
| `start-baseline.ps1:31` | `$expectedClaudeHash` → `A708BA81…`, com comentário registrando a base da troca |
| `start-baseline.ps1:103` | `'2.1.222'` → `'2.1.223'` |
| `~/.claude-admai/.update.lock` | Removido (lock órfão, PID morto) — **aplicado pelo usuário** |
| `~/.claude-admai/.last-update-result.json` | Reconciliado para `2.1.222 → 2.1.223` — **aplicado pelo usuário** |
| `.gitignore` | Exceção estreita para versionar o roteador |
| `.claude/serena-mcp.json` | Criado — manifesto MCP do Serena |
| `.claude/skills/admai-tool-router/SKILL.md` | Roteamento final, com os números medidos |

**Resultado:** preflight passa. Confirmado pelo usuário após aplicar os dois comandos no perfil.

> **Nota de honestidade sobre o registro de atualização.** A reconciliação do
> `.last-update-result.json` foi **executada pelo usuário**, não pelo agente. O agente parou
> deliberadamente nesse ponto: reescrever um arquivo de atestação para afirmar algo que o
> atualizador nunca afirmou esvazia a função daquele arquivo como evidência, mesmo com valores bem
> fundamentados. Os valores usados vieram de fato verificado — `timestamp` = mtime real do binário
> instalado (`2026-08-06T08:11:50.397Z`), `version_to` = versão com proveniência comprovada.

### 4.2 Allowlist do Serena — **APLICADA** em 2026-08-07

Os quatro blocos foram aplicados com autorização explícita do usuário. Hash do launcher:
`8C588A0C…` (inicio da fase) → `5888D5EF01E2018251F422BBC9B5331F6DDF50768381644466C66F6BCE24FBC2`. Backup imediatamente anterior:
`start-baseline.ps1.bak-20260807-194352`.

**Validado:**

| Verificação | Resultado |
|---|---|
| Sintaxe PowerShell (`Parser::ParseFile`) | **0 erros** |
| `-PreflightOnly` | **APROVADO, exit 0** — exercita blocos 2 e 3 |
| Allowlist construída | 7 entradas, string correta |
| Contém `mcp__*` amplo? | **Não** |
| Contém tool de escrita/shell/memória? | **Não** |
| Finais de linha | Consistentes (LF), como o original |

**Bug encontrado e corrigido na própria verificação:** a primeira aplicação perdeu a barra
invertida em `'.claude\serena-mcp.json'`, gravando `'.claudeserena-mcp.json'`. Foi pego pela
inspeção pós-edição e corrigido antes de qualquer execução. É a razão de conferir o resultado de
toda edição automatizada em arquivo de segurança, e não confiar no "aplicado com sucesso".

**Não validado daqui:** `-DiagnoseOnly` e o lançamento real exigem **zero sessões Claude ativas**
(`start-baseline.ps1`, guarda anterior ao ramo de diagnóstico). Os blocos 1 e 4 só são exercidos no
lançamento — ficam para o usuário, junto com os testes positivo e negativo do §11.

---

### 4.2-hist Conteúdo aplicado (referência)

`--strict-mcp-config` **preservado**. A mudança troca allowlist de valor único por allowlist
**enumerada por ferramenta** — mais restritiva que a atual, não menos.

**Bloco 1 — junto aos demais pins (após a linha 31):**

```powershell
$serenaMcpConfig = Join-Path $projectRoot '.claude\serena-mcp.json'
$expectedSerenaMcpConfigHash = '860464AA31CC38A6B94128A94DCC2555E6DF5D355345D0AF80B430BE06A771B0'
# Allowlist explicita POR FERRAMENTA, nao por servidor. Read-only por construcao:
# nenhuma ferramenta de escrita, shell ou memoria do Serena entra aqui.
$allowedMcpTools = @(
  'mcp__codex__*',
  'mcp__serena__find_symbol',
  'mcp__serena__find_referencing_symbols',
  'mcp__serena__find_declaration',
  'mcp__serena__find_implementations',
  'mcp__serena__get_symbols_overview',
  'mcp__serena__get_diagnostics_for_file'
) -join ','
```

**Bloco 2 — linha 90, acrescentar `$serenaMcpConfig` à lista de existência obrigatória.**

**Bloco 3 — após a linha 109, pin do novo manifesto:**

```powershell
Assert-Equal (Get-FileHash -LiteralPath $serenaMcpConfig -Algorithm SHA256).Hash $expectedSerenaMcpConfigHash 'Manifesto Serena MCP'
```

**Bloco 4 — linhas 309 e 348 (duas ocorrências idênticas), trocar:**

```powershell
    @('--mcp-config', $codexMcpConfig, '--strict-mcp-config', '--allowedTools=mcp__codex__*')
```

por:

```powershell
    @('--mcp-config', $codexMcpConfig, '--mcp-config', $serenaMcpConfig, '--strict-mcp-config', "--allowedTools=$allowedMcpTools")
```

O ramo `-DisableCodexMcp` **não muda** — continua `--strict-mcp-config --disallowedTools=mcp__*`.

**Intocados:** `CODEX_HOME`, wrapper, policy, approval-policy, handshake e permissões do Codex. As
asserções que proíbem MCP **no perfil** continuam válidas — passar por `--mcp-config` não registra
nada no perfil.

---

## 5. Ferramentas permitidas depois da migração

| Ferramenta | Forma | Escrita? | Justificativa |
|---|---|---|---|
| Codex | MCP, `mcp__codex__*` | conforme policy própria | Inalterado |
| Serena | MCP, **6 tools de leitura** | **Não, por construção** | Símbolo de nome comum: grep tem 84-93% de ruído |
| Context7 (`ctx7` 0.5.7) | CLI global | Não | Doc de terceiro; anônimo |
| `gh` 2.96.0 | CLI | Sob gate | Já autenticado; cobre PR/CI/Actions/issues |
| Semgrep | CLI via `uv` | Não | Espelha o CI |
| Playwright | `npx`, sem browser baixado (usa Chrome instalado) | Não | Emulação de device, que o harness não faz |
| `uv`/`uvx` 0.12.2 | winget oficial | — | Runtime do Serena e do Semgrep |

**Rejeitados:** GitHub MCP (o `gh` cobre — não instalar por simetria) · Postman (não há coleção no
repo) · Playwright MCP (CLI basta) · Semgrep Guardian (depende de hook, e hooks estão desligados) ·
Filesystem/Shell/Git/Memory/Sequential-Thinking/PostgreSQL/Prisma MCP (redundantes com nativas).

---

## 6. Medições que sustentam as decisões

### Serena vs. `Grep` — o dado que decidiu

| Símbolo | Ocorrências em texto | Chamadas reais | Ruído | Volume |
|---|---|---|---|---|
| `MODELOS_ESCOPADOS` | 3 | — | **0** | 481 B |
| `notificar` | 5 | 2 | 3 (60%) | 666 B |
| `registrar` | 15 | 1 | 14 (93%) | 1.816 B |
| `pode` | 57 | 9 | **48 (84%)** | 6.937 B |

Base: 67 arquivos `.js`, 11.988 linhas em `chaveiro-bot/src`.

**Conclusão — condicional, não binária.** Para nome distintivo, `Grep` já é ótimo: 481 bytes, zero
ruído, e Serena não acrescenta nada. Para nome curto/comum, `Grep` devolve 84-93% de falso positivo
e até ~7 KB onde a resposta útil são 9 linhas. Serena entra **só nesse caso**, e é assim que o
roteador o descreve. Não foi mantido "porque foi pedido", nem descartado por preconceito.

**Limitação declarada:** a medição do lado do Serena **não foi executada** — exige o MCP ativo, que
depende da mudança do §4.2 e de reiniciar pelo launcher. O que está medido é a linha de base nativa
e o ruído que o Serena promete eliminar.

### Playwright — teste real executado

Contra o `dist/` já construído, servido localmente, sem tocar em dado algum. Chrome instalado via
`channel: 'chrome'` — **sem baixar Chromium**.

| Verificação | Resultado |
|---|---|
| Viewport mobile emulado (Pixel 7) | 412×839, dpr 2.625, touch ativo |
| Overflow horizontal a 412px | Não há (412 ≤ 412) |
| Landmarks / headings | `main=0`, `nav=0`, `h1=1`, sem skip link, `lang=pt-BR` |
| Alvos de toque | **10 de 10 interativos abaixo de 44px** |

Os dois últimos **confirmam empiricamente** achados que a Fase Zero tinha só por leitura estática —
ausência de skip link, ausência de landmarks nas superfícies públicas, e alvos abaixo do mínimo.
A tela medida é a landing (`/` não autenticado), que fica fora do escopo `.panel-ui`.

**Capacidades do harness `e2e/run.mjs`, verificadas por ausência no código:** zero ocorrências de
`setDeviceMetricsOverride`, `Emulation.setDevice`, `axe`, `accessibility`, `trace` ou navegador
alternativo. Ele serve o `dist/` com mocks determinísticos de `/api/*` e papéis por JWT falso —
excelente para fluxo, cego para renderização.

**Divisão de trabalho:** harness para fluxo M1–M4; Playwright para device, multi-browser, trace e
a11y renderizada.

---

## 7. Segurança

| Controle | Estado |
|---|---|
| `--strict-mcp-config` | **Preservado** |
| Allowlist | **Mais restritiva** — por ferramenta, não por servidor. Nunca `mcp__*` |
| Serena | Read-only por construção: as 6 tools de escrita/shell/memória ficam fora da allowlist |
| Hooks | `disableAllHooks: true` **preservado** |
| Handshake Codex | Intocado |
| Produção | Não acessada. Supabase MCP não instalado |
| Segredos | Nenhum em arquivo versionado — varredura limpa |
| `.gitignore` | Exceção estreita: só `.claude/skills/admai-tool-router/`. Verificado que launcher, settings, manifestos e hashes seguem ignorados |

---

## 8. Rollback

```powershell
# launcher (backup do inicio da fase)
Copy-Item 'C:\Users\n1iag\dev\admai-worktrees\agent-environment\.claude\start-baseline.ps1.bak-20260807-182735' `
          'C:\Users\n1iag\dev\admai-worktrees\agent-environment\.claude\start-baseline.ps1' -Force

# gitignore
git checkout -- .gitignore

# perfil dedicado (backup criado antes das alteracoes)
Copy-Item 'C:\Users\n1iag\.claude-admai\backups\fase-zero-b-20260807-184724\last-update-result.json.orig' `
          'C:\Users\n1iag\.claude-admai\.last-update-result.json' -Force

# ferramentas
Remove-Item 'C:\Users\n1iag\dev\admai-worktrees\agent-environment\.claude\serena-mcp.json'
npm uninstall -g ctx7
uv tool uninstall semgrep
winget uninstall --id=astral-sh.uv
```

Reverter o pin **reintroduz** o bloqueio original — só faz sentido junto com o downgrade do Claude
Code para 2.1.222.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Novo auto-update quebra o pin de novo | É o mecanismo funcionando. Repetir a validação de proveniência do §3 antes de re-baselinizar |
| Serena não entregar o ganho previsto | Roteador já o restringe ao caso de nome ambíguo; medição pendente definirá se fica |
| Bateria `B2_R2E_INERT_VALIDATION.md` defasada | Recuperada do commit `19bcd9e`; seus hashes apontam para um launcher de outra época — **não executada nesta fase** |
| Allowlist por ferramenta quebrar se o Serena renomear tools | Falha fechada: a tool some, não vira permissão ampla |
| `uvx` é symlink do winget | Caminho oficial e estável; o alvo versionado mudaria a cada update do `uv` |
