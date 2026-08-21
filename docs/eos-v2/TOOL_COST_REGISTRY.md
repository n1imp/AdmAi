# Tool Cost Registry — EOS V2

**Data:** 2026-08-07 · **Herda a estrutura de** `tools/claude-plugins/plugin-lock.json`
(`ai/claude/TASK-025-plugin-autonomy`)

> **Regra vinculante deste registro, imposta pelo usuário:**
> *"Não invente números exatos de tokens quando não houver medição."*
>
> Toda linha traz **como** o valor foi obtido. Onde não houve medição, o campo diz `NÃO MEDIDO` —
> e isso é informação legítima, não lacuna a preencher com estimativa. **Unidade: bytes**, porque
> é o que foi efetivamente medido; converter bytes em tokens exigiria um tokenizador que não foi
> executado, e o resultado seria inventado.

---

## 1. Orçamentos

Herdados de `plugin-lock.json`, que já praticava a distinção entre teto e medição:

| Campo | Valor | Origem |
|---|---|---|
| `alwaysOnTokens` (teto) | 1.000 | `plugin-lock.json` legado |
| `measuredAlwaysOnTokens` | **880** | **Medido** pelo legado; método não documentado — `MÉTODO NÃO VERIFICADO` |
| `automaticMemoryTokens` (teto) | 2.500 | `plugin-lock.json` legado; **obsoleto** — o subsistema de memória foi deprecado (`02` item 8) |

**Teto proposto para o V2:** o custo permanente de todo o EOS V2 deve caber em orçamento declarado
e medido antes de cada expansão do roster. O precedente legado — 880 medidos contra teto de 1.000 —
é o padrão de rigor a manter, não necessariamente o número.

---

## 2. Custo de contexto — valores medidos nesta linha de trabalho

| ID | Item | Valor | Natureza | Como foi obtido |
|---|---|---|---|---|
| C-01 | `description` da skill `admai-tool-router` — **custo permanente, toda sessão** | **500 B** | Medido | `awk '/^description:/{print length($0)}'` |
| C-02 | Corpo da skill — carregado **só quando acionada** | **4.407 B** | Medido | `wc -c` |
| C-03 | Relatório completo do Semgrep, todas as severidades | **2.679 B** (44 linhas) | Medido | Execução real: 74 regras sobre 232 arquivos |
| C-04 | `ctx7 docs /prisma/prisma "interactive transactions"` | **5.332 B** | Medido | `ctx7 docs … > arquivo; wc -c` |
| C-05 | `Grep` de símbolo distintivo (`MODELOS_ESCOPADOS`) | **481 B**, 0% ruído | Medido | 3 ocorrências, todas relevantes |
| C-06 | `Grep` de símbolo curto (`pode`) | **6.937 B**, **84% ruído** | Medido | 57 ocorrências em texto, 9 chamadas reais |
| C-07 | `Grep` de símbolo comum (`registrar`) | **1.816 B**, **93% ruído** | Medido | 15 ocorrências, 1 chamada real |
| C-08 | Saída resumida do teste Playwright | 5 linhas | Medido | Screenshot de 265.375 B gerado em memória e **não** inserido no contexto |
| C-09 | Ferramentas diferidas na sessão (Tool Search ativo) | 67 nomes | Observado | Nativas 22 · `codex` 2 · `filesystem` 12 · `token-bridge` 9 · `claude-in-chrome` 22 |

**A razão C-01 : C-02 é o achado de desenho mais importante do registro** — 1 : 9 entre custo fixo
e conteúdo entregue. É o argumento quantitativo para **um roteador único** em vez de N skills: cada
skill adicional soma sua `description` ao custo permanente de toda sessão, enquanto o corpo só custa
quando é realmente necessário.

**C-05 a C-07 justificam o roteamento condicional para Serena**: em símbolo distintivo, `Grep` é
ótimo e nada a ganhar; em símbolo curto, devolve 84–93% de falso positivo. É o único caso em que a
busca semântica se paga — e **apenas esse** caso está no roteador.

---

## 3. Custo de execução — runtimes pinados

Herdado de `plugin-lock.json`, `runtimeTools`:

| Runtime | Versão | SHA256 do arquivo | Situação hoje |
|---|---|---|---|
| `bun` | 1.3.12 | `841FF9C5DFFCAA3A2620D1E3F87EE500F32A4CA830B001CADE7A3479609D4A89` | Não usado na linha vigente |
| `uv` | 0.11.7 | `FE0C7815ACF4FC45F8A5EFF58ED3CF7AE2E15C3CF1DCEADBD10C816EC1690CC1` | **Em uso** — instala Semgrep e Serena |

O padrão de pinagem por hash é o mesmo do launcher vigente e comprovadamente eficaz — mantido
(`02` item 10).

---

## 4. Custo evitado — decisões que economizaram sem perder capacidade

| Decisão | Economia | Natureza |
|---|---|---|
| Playwright com `channel:'chrome'` em vez de baixar Chromium | **~150 MB** de download | Medido |
| Playwright fora do `package.json` do produto | 0 B de dependência no produto; lockfile intocado | Verificado |
| Screenshot gerado em memória, nunca salvo nem inserido | **265.375 B** fora do contexto | Medido |
| Um roteador em vez de uma skill por ferramenta | Cada skill evitada economiza sua `description` em **toda** sessão | Derivado de C-01 |
| `gh run view --log-failed` em vez do log completo | `NÃO MEDIDO` | Princípio aplicado |

---

## 5. `NÃO MEDIDO` — declarado, não estimado

| Item | Por que não foi medido |
|---|---|
| Custo de contexto do **Serena** MCP | Nunca exercitado. Exige reinício do launcher com zero sessões ativas — impossível de dentro de uma sessão (T-02) |
| Ganho real do Serena sobre `Grep` | Idem. O que está medido é **só a linha de base nativa** (C-05 a C-07) e o ruído que o Serena promete eliminar |
| Economia do **Tool Search** | Sem cenário contrafactual: não é possível rodar a mesma sessão com a feature desligada |
| Custo do GitHub, Supabase e Cloudflare MCP | Não instalados |
| Conversão bytes → tokens de qualquer linha | Nenhum tokenizador foi executado. Converter seria inventar |
| Método por trás de `measuredAlwaysOnTokens: 880` | O legado registra o número, não o procedimento |
| Chamadas por tarefa antes/depois do EOS V2 | O V2 não existe; não há "depois" |

---

## 6. Lista negativa — ferramentas bloqueadas

Herdada de `forbiddenPlugins` e da seção de rejeitados de `TOOL_DECISIONS.md`. **O que migra é o
critério, não a lista congelada** (`02` §4.1): bloqueio vale enquanto a condição que o motivou
valer.

### 6.1 Bloqueio permanente — por conflito de arquitetura ou segurança

| Item | Motivo |
|---|---|
| Segundo orquestrador (Ruflo, Claude Flow) | Colide com writer único |
| Memory MCP / knowledge graph (Mem0, Zep, Weaviate, Chroma) | Estado durável vive em `docs/` versionado. Decidido duas vezes de forma independente |
| Aprovação `never`, bypass de sandbox | Anula o modelo de gates |
| Auto-push, auto-commit, deploy automático | Reservado ao usuário |
| Filesystem MCP, Shell MCP, Git MCP genérico | Nativas cobrem com custo zero |
| Múltiplos MCPs de busca web | `WebSearch`/`WebFetch` bastam |
| Snyk **junto** com Semgrep | Duplicação explícita |
| Prisma MCP | Colide com o gate de migration do `AGENTS.md` |

### 6.2 Bloqueio condicional — reabre se a condição mudar

| Item | Condição de reabertura | Situação |
|---|---|---|
| Context7 | "usar somente em fase que demonstre lacuna" | **Reaberto** — lacuna medida (C-04) |
| Playwright | "não mudar dependências/lockfiles" | **Reaberto** — condição evitada por construção |
| Semgrep | "não instalar preventivamente" | **Reaberto** — hoje é o SAST oficial do CI |
| GitHub MCP | Capacidade que o `gh` CLI não cubra | **Segue bloqueado** — `gh` 2.96.0 cobre |
| Supabase MCP | Credencial + escopo staging | Preparado, `AGUARDANDO CREDENCIAL` |
| Cloudflare MCP | Tarefa concreta de borda | Segue bloqueado |
| Playwright **MCP** (distinto do CLI) | Necessidade comprovada de sessão persistente | Segue bloqueado |

---

## 7. Como medir de novo

```bash
# custo permanente de uma skill = tamanho da description
awk '/^description:/{print length($0)}' .claude/skills/<skill>/SKILL.md

# tamanho real de uma resposta de ferramenta
ctx7 docs <libraryId> "<pergunta>" > out.txt && wc -c out.txt

# ruído de uma busca textual
rg -n "<simbolo>" chaveiro-bot/src | wc -l   # ocorrências em texto
# comparar manualmente com as chamadas reais

# MCPs registrados por projeto
node -e "const j=require(require('os').homedir()+'/.claude.json');\
for(const [k,v] of Object.entries(j.projects||{}))\
if(Object.keys(v.mcpServers||{}).length) console.log(k, Object.keys(v.mcpServers));"
```

**Regra de manutenção:** quando qualquer MCP hoje bloqueado for liberado, medir antes de manter.
Ferramenta que não justifica o próprio custo de contexto é desabilitada — critério que já vale na
matriz vigente e continua valendo no V2.
