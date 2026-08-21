# Baseline de Eficiência de Contexto — AdmAi

**Data:** 2026-08-07 · **Fase Zero** · **Claude Code 2.1.223**

> **Regra deste documento:** só entram medidas **observadas nesta execução**. Nenhum número de
> token é estimado, extrapolado ou copiado de material de terceiros. Onde não houve como medir,
> está escrito que não houve.

---

## 1. O que foi medido

| ID | Medida | Valor observado | Como foi obtido |
|---|---|---|---|
| M1 | Resposta de `ctx7 docs /prisma/prisma "interactive transactions"` | **5.332 bytes** | `ctx7 docs … > arquivo; wc -c` |
| M2a | `description` da skill `admai-tool-router` — **custo permanente**, carregado em toda sessão | **500 bytes** | `awk` sobre o frontmatter |
| M2b | Corpo da skill — carregado **só quando acionada** | **4.407 bytes** | `wc -c` do arquivo |
| M3a | MCPs no perfil padrão (`~/.claude`), escopo global | **1** (`codex`) | `~/.claude.json` |
| M3b | MCPs efetivos no perfil do launcher | **1** (`codex`), imposto por `--strict-mcp-config` | `.claude/start-baseline.ps1:303` |
| M4 | Imagem Docker do Semgrep | **não baixada** — daemon parado | `docker pull` falhou ao conectar no npipe |

**Leitura de M2:** a skill custa 500 bytes permanentes e entrega 4.407 bytes de decisão apenas
quando relevante — razão de ~1:9 entre custo fixo e conteúdo. É o motivo de existir **uma** skill
de roteamento em vez de uma por ferramenta: cada skill adicional somaria sua `description` ao custo
permanente de toda sessão.

---

## 2. Tool Search — estado verificado

Tool Search **já está ativo** nesta sessão. A evidência é direta e observável: as ferramentas
chegam como lista de nomes diferidos, com schema carregado sob demanda via `ToolSearch`, e não como
definições completas.

Ferramentas diferidas observadas nesta sessão, por origem:

| Origem | Contagem observada |
|---|---|
| Nativas diferidas (Cron*, Task*, Web*, Monitor, SendMessage, ExitPlanMode, …) | 22 |
| `mcp__codex__*` | 2 |
| `mcp__filesystem__*` | 12 |
| `mcp__token-bridge__*` | 9 |
| `mcp__claude-in-chrome__*` | 22 |
| **Total** | **67** |

**Não configurei `ENABLE_TOOL_SEARCH`.** Dois motivos, ambos verificados:

1. A documentação oficial do Claude Code descreve Tool Search como **ligado por padrão**, e o
   comportamento observado confirma.
2. O único lugar de escopo de projeto onde a variável caberia é `.claude/settings.local.json` — e
   esse arquivo tem **hash pinado** pelo launcher (`start-baseline.ps1:100`). Escrever nele
   **quebraria o launcher**. Pôr no escopo de usuário contaminaria outros projetos, contra a
   diretriz de escopo do próprio pedido.

**Não meço economia de tokens do Tool Search** porque não tenho o cenário contrafactual: não
consigo rodar a mesma sessão com a feature desligada para comparar. Qualquer número aqui seria
inventado.

---

## 3. Ferramenta consumindo contexto sem uso

Levantamento no perfil padrão (`~/.claude.json`): há MCPs registrados para **outro** worktree,
`C:/Program Files/dev/AdmAi` — `playwright`, `filesystem`, `open-design`, `token-bridge`, `penpot`,
`codex` — e para `C:/Windows/system32`.

| Fato | Consequência |
|---|---|
| Nenhum desses está registrado para `admai-worktrees/agent-environment` | Não pesam sobre este projeto pelo registro |
| Mas a **sessão atual** os expõe como tools diferidas (M2 acima) | Custam nomes no contexto, não schemas |
| `filesystem`, `playwright` e `token-bridge` são exatamente categorias que a matriz classifica como redundantes | Candidatos a remoção |

**Não os removi.** Pertencem a outro projeto e a instrução desta fase é preservar o ambiente
existente e não sobrescrever configuração alheia. Fica registrado como recomendação, com a decisão
sendo do usuário.

---

## 4. O que não foi possível medir

| Item | Motivo |
|---|---|
| Economia real do Tool Search | Sem cenário contrafactual executável |
| Custo de contexto do Serena, GitHub, Supabase e Cloudflare MCP | Não instalados |
| Tamanho de relatório do Semgrep | Docker daemon parado |
| Comparação Playwright CLI × MCP neste projeto | Nenhum dos dois exercitado aqui |
| Chamadas por tarefa antes/depois | A fase não executou tarefas de desenvolvimento |

---

## 4-B. Medições da Fase Zero-B (2026-08-07)

### Serena vs. `Grep` — a medição que decidiu o roteamento

Base: 67 arquivos `.js`, 11.988 linhas em `chaveiro-bot/src`.

| Símbolo | Ocorrências em texto | Chamadas reais | Ruído | Volume |
|---|---|---|---|---|
| `MODELOS_ESCOPADOS` | 3 | — | **0** | 481 B |
| `notificar` | 5 | 2 | 3 (60%) | 666 B |
| `registrar` | 15 | 1 | 14 (93%) | 1.816 B |
| `pode` | 57 | 9 | **48 (84%)** | 6.937 B |

**Leitura:** para símbolo de nome distintivo, `Grep` já é ótimo — 481 bytes, zero ruído, e nada a
ganhar com busca semântica. Para nome curto/comum, `Grep` devolve 84-93% de falso positivo e até
~7 KB onde a resposta útil são 9 linhas. É **só nesse segundo caso** que o roteador manda usar
Serena.

**Limitação declarada:** o lado Serena da comparação **não foi medido** — exige o MCP ativo, que
depende da mudança de allowlist do launcher e de reiniciar por ele. O que está medido é a linha de
base nativa e o ruído que o Serena promete eliminar.

### Semgrep local — custo de contexto real

| Medida | Valor |
|---|---|
| Gate ERROR (`--severity ERROR --error`) | exit **0** — passa, igual ao CI |
| Relatório completo, todas as severidades | **2.679 bytes / 44 linhas** |
| Cobertura | 74 regras sobre 232 arquivos |
| Achados | 1, severidade WARNING |

O achado é `chaveiro-bot/src/routes/documentos.js:158` — `res.sendFile` com caminho montado a
partir de `doc.storageKey`. **Não é novo:** o CI roda os mesmos rulesets e já o imprime no passo de
relatório não-bloqueante. `storageKey` vem do banco, escopado ao próprio técnico, então não é
entrada direta de usuário.

**Conclusão de custo:** 2,7 KB para o relatório inteiro é barato. Semgrep local se paga — e o
resultado bate com o do CI por usar os mesmos rulesets e caminhos.

### Playwright — custo evitado

| Decisão | Efeito |
|---|---|
| `channel: 'chrome'` em vez de baixar Chromium | **~150 MB de download evitados** |
| Pacote `playwright` sem `npx playwright install` | Só o pacote npm |
| Sem dependência no `package.json` do produto | `package.json` e lockfile intocados |

Saída do teste: 5 linhas de resumo. O screenshot (265.375 bytes) foi gerado em memória e
**não** entrou no contexto nem foi salvo em disco — é assim que o roteador manda usar.

---

## 5. Como medir de novo

```bash
# custo permanente de uma skill = tamanho da description
awk '/^description:/{print length($0)}' .claude/skills/<skill>/SKILL.md

# tamanho real de uma resposta de ferramenta
ctx7 docs <libraryId> "<pergunta>" > /tmp/out.txt && wc -c /tmp/out.txt

# MCPs registrados por projeto
node -e "const j=require(require('os').homedir()+'/.claude.json');\
for(const [k,v] of Object.entries(j.projects||{}))\
if(Object.keys(v.mcpServers||{}).length) console.log(k, Object.keys(v.mcpServers));"
```

Reavalie quando qualquer MCP for liberado: uma ferramenta que não justifica o próprio custo de
contexto deve ser desabilitada, conforme a diretriz desta fase.
