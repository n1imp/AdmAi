# Matriz de Roteamento de Ferramentas — AdmAi

**Data:** 2026-08-07 · **Fase:** Fase Zero (Arquitetura de Ferramentas) · **Commit-base:** `30bf545`

Documentação de ambiente, **não** código do produto. A implementação executável desta matriz é a
skill `.claude/skills/admai-tool-router/SKILL.md`; este arquivo é a referência completa, com o
raciocínio que a skill comprime.

**Regra que governa a matriz:** não usar ferramenta externa porque ela existe. Usar quando reduzir
tokens, aumentar precisão, dar acesso externo inexistente localmente, ou produzir evidência melhor
que a nativa.

**Legenda de custo de contexto:** `nulo` (nativa, já carregada) · `baixo` (CLI, saída curta e
controlável) · `médio` (CLI com saída volumosa se não filtrada) · `alto` (MCP com schemas
carregados, ou saída de árvore/relatório inteiro).

---

## 1. Matriz

| # | Categoria da tarefa | Primária | Fallback | Quando chamar | Quando **não** chamar | R/W | Risco | Ambiente permitido | Custo | Observações |
|---|---|---|---|---|---|---|---|---|---|---|
| 1a | Símbolo de **nome distintivo** no código do AdmAi | `Grep` nativo | — | Sempre | Serena — medido: `Grep` já dá 481 B com **zero** ruído | R | Nulo | Todos | nulo | Busca semântica não acrescenta nada aqui |
| 1b | Símbolo de **nome curto/comum** (`pode`, `registrar`) | Serena `find_symbol` / `find_referencing_symbols` | `Grep` + filtro manual | Quando o nome gera falso positivo | — | R | Nulo | Todos | baixo | Medido: `Grep` devolve 84-93% de ruído e até 7 KB onde a resposta são 9 linhas |
| 1c | Estrutura de um arquivo antes de abri-lo | Serena `get_symbols_overview` | `Read` parcial | Arquivo grande e desconhecido | Arquivo pequeno | R | Nulo | Todos | baixo | Evita ler 700 linhas para achar 3 |
| 2 | Comportamento atual de **biblioteca/framework/API de terceiro** | `ctx7 library` / `ctx7 docs` | Memória do modelo, **declarando a incerteza** | Quando a resposta depender da versão atual da lib | Para código interno; para pergunta trivial e estável | R | Baixo (rede externa) | Todos | baixo | Funciona anônimo. `CONTEXT7_API_KEY` só eleva rate limit |
| 3 | **PR, CI, Actions, issues, estado remoto** | `gh` CLI (2.96.0) | *(GitHub MCP, quando liberado)* | Dado que só existe no remoto | Para diff/log/branch local — `git` resolve melhor e sem rede | R (W sob gate) | Médio — pode escrever no remoto | Todos para leitura | baixo | `gh run view --log-failed` em vez de baixar log inteiro |
| 4 | **Estado local do repositório** | `git` | — | Sempre | Nunca substituir por `gh` | R | Baixo | Todos | nulo | `git diff --stat` antes de `git diff` |
| 5 | **Schema, migrations, modelo de dados** | `prisma/schema.prisma`, `prisma/migrations/`, `docs/db/*` | *(Supabase MCP, quando liberado)* | Sempre — a fonte de verdade está versionada | Conectar em banco só para ler schema | R | Nulo | Todos | nulo | O schema no repo é autoritativo; o banco não acrescenta |
| 6 | **Logs, advisors, estado real do banco** | *(Supabase MCP, quando liberado)* | Nenhum hoje | Só em staging/local | **Nunca em produção** | R | **Alto** | Local e staging | médio | `read_only=true`, project scoping, feature groups mínimos |
| 7 | **SAST, secret, vulnerabilidade** | Semgrep 1.172.0 (via `uv`) | `npm audit`, `gh` para o workflow `Security` | Fim de tarefa e gate de fase | Varredura ampla sem alvo | R | Baixo | Todos | **baixo** | Medido: relatório completo = 2.679 B. Mesmos rulesets e caminhos do CI, então o resultado bate |
| 8a | **Fluxo E2E dos módulos M1–M4** | `chaveiro-painel/e2e/run.mjs` | — | Fluxo com papéis e API mockada | Playwright — o harness já cobre e é mais barato | R | Baixo | Local | baixo | Serve `dist/` + mocks determinísticos; papéis por JWT falso |
| 8b | **Viewport mobile, multi-browser, a11y renderizada** | Playwright CLI | — | O que exige renderização real | O harness — verificado: zero `setDeviceMetrics`, `Emulation`, `axe`, `trace` | R | Médio | Local e staging | médio | Usar `channel:'chrome'` (evita baixar Chromium). Resumir; nunca despejar árvore nem screenshot |
| 9 | **Contrato / coleção de API** | Nenhuma hoje | `curl`, teste de integração existente | Só se existir coleção real | Para substituir teste de integração já existente | R | Baixo | Local e staging | — | Não existe coleção Postman no repo |
| 10 | **DNS, cache, borda** | *(Cloudflare MCP, quando liberado)* | Painel Cloudflare (humano) | Diagnóstico de borda | Qualquer alteração automática | R | **Alto** | Diagnóstico apenas | médio | Read-only por política. O incidente de 2026-08-05 nasceu na borda |
| 11 | Qualquer coisa resolvível por `Read`/`Grep`/`git`/`node` | A nativa | — | Sempre | Qualquer externo | R | Nulo | Todos | nulo | Caso mais comum. É a regra, não a exceção |

---

## 2. Perfis operacionais

| Perfil | Permitido | Proibido |
|---|---|---|
| **DISCOVERY** | Leitura nativa · `ctx7` · `gh` leitura · pesquisa web · *(Serena read, Supabase read-only quando liberados)* | Qualquer escrita externa; qualquer conexão a produção |
| **LOCAL DEVELOPMENT** | Nativas · testes do repo · Semgrep · Playwright · banco local | Escrita em staging ou produção |
| **STAGING VALIDATION** | Playwright · banco de staging · `gh` para CI · Semgrep · observabilidade | Escrita em produção; dado real de cliente |
| **PRODUCTION VALIDATION** | Somente leitura explicitamente segura (ex.: `GET /health`), smoke não destrutivo | **Nenhum MCP de banco.** Nenhuma alteração automática |

---

## 3. Automação ≠ autorização

| Nível | Significado | Exemplo |
|---|---|---|
| **AUTO-ROUTE** | Escolho a ferramenta sozinho | Decidir entre `ctx7` e `Grep` |
| **AUTO-READ** | Consulta somente leitura, sem perguntar | `gh run view`, `ctx7 docs`, `git log` |
| **CONTROLLED-WRITE** | Escrita só dentro da fase e do ambiente permitidos | Editar código em `LOCAL DEVELOPMENT` |
| **MANUAL-GATE** | Exige autorização explícita do usuário, sempre | Push, merge, deploy, migration, exclusão, secret, produção |

Rotear é automático. **Executar efeito colateral não é.** Uma ferramenta estar disponível nunca
substitui o gate do `AGENTS.md`.

---

## 4. O que ficou de fora, e por quê

| Ferramenta | Motivo |
|---|---|
| Filesystem MCP | `Read`/`Write`/`Glob` nativos cobrem, com custo zero |
| Shell MCP | `Bash`/`PowerShell` nativos cobrem |
| Git MCP genérico | `git` CLI é mais preciso e não consome schema |
| Memory MCP | Estado durável do projeto vive em `docs/`, versionado e auditável |
| Sequential Thinking MCP | Capacidade nativa de raciocínio |
| PostgreSQL MCP genérico | Redundante com o Supabase MCP oficial, e sem project scoping |
| Prisma MCP | Gestão de banco por agente colide com o gate de migration do `AGENTS.md` |
| Navegadores alternativos | Um caminho de navegador basta; mais de um é sobreposição |
| Múltiplos MCPs de busca web | `WebSearch`/`WebFetch` nativos bastam |
| Snyk **e** Semgrep juntos | Duplicação explícita. Semgrep vence por já ser o SAST do CI |
| Playwright MCP permanente | Custo de contexto sem necessidade comprovada de sessão persistente |
| Docker Hub MCP | Sem caso de uso no projeto |

---

## 5. Testes do roteador — 2026-08-07

Solicitações simuladas, **sem nenhuma modificação funcional no produto**.

| # | Solicitação | Ferramenta escolhida | Resultado | Justificativa do roteamento |
|---|---|---|---|---|
| 1 | "Encontre todas as referências de `MODELOS_ESCOPADOS`" | **`Grep` nativo** *(Serena seria a primária se liberado)* | ✅ 3 ocorrências: `db/tenant.js:24`, `:114`, `routes/tecnicos.js:351` | Código interno. Context7 não conhece este repo; MCP não traria ganho para uma busca literal |
| 2 | "Qual é a API atual do Prisma para transações?" | **`ctx7`** | ✅ `ctx7 library prisma` → `/prisma/prisma`; `ctx7 docs` retornou 5.332 bytes dirigidos | Comportamento de lib de terceiro, sensível a versão. Memória do modelo é insuficiente |
| 3 | "Qual foi o resultado da Action do PR X?" | **`gh` CLI** *(GitHub MCP seria a primária se liberado)* | ✅ Autenticado como `n1imp`; `gh run list` retornou 3 execuções com conclusão | Dado que só existe no remoto. `git` local não alcança |
| 4 | "Liste as tabelas do staging" | **`prisma/schema.prisma` + `migrations/`** *(Supabase MCP se liberado)* | ⚠️ Fallback aplicado — MCP não instalado, `.env.staging` nunca preenchido | O schema versionado é a fonte de verdade; o banco só acrescenta quando a pergunta for sobre **estado real**, não estrutura |
| 5 | "Verifique vulnerabilidades deste arquivo" | **Semgrep via Docker** | ❌ Bloqueado — Docker daemon parado; Python ausente para o caminho `pipx`/`uv` | Fallback: `npm audit` e o workflow `Security` no PR |
| 6 | "Abra localmente a tela e valide o fluxo" | **Harness `e2e/run.mjs`**, e Playwright CLI onde ele não alcança | ⚠️ Não exercitado — exigiria build e execução do painel, fora do escopo desta fase | Harness primeiro por já existir e ser mais barato; Playwright só para viewport real, multi-browser e trace |

**Leitura dos testes:** dos seis, **três roteiam para ferramenta nativa ou já instalada e
funcionaram** (1, 2, 3). Um usa fallback documentado (4). Dois estão bloqueados por dependência
externa que exige ação humana (5, 6) — nenhum deles por erro de roteamento.

O padrão que emerge confirma o desenho: **a maioria das tarefas não precisa de MCP.** Dos seis
casos, apenas dois (4 e 6) teriam ganho real com uma ferramenta externa que ainda não existe.
