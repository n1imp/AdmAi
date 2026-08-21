---
name: admai-tool-router
description: Escolhe a ferramenta certa para tarefas no AdmAi — documentação de biblioteca/framework/API externa (React, Vite, Node, Express, Prisma, Postgres, Supabase, Redis, Google APIs), busca de símbolo e referência no código interno, pull request / CI / GitHub Actions / issues, schema e logs de banco, varredura de segurança e vulnerabilidade, navegador e teste E2E, contrato de API. Use antes de chamar qualquer ferramenta externa, e para decidir quando NÃO usar nenhuma.
---

# Roteador de ferramentas do AdmAi

**Regra que governa tudo:** não use ferramenta externa porque ela existe. Use quando reduzir
tokens, aumentar precisão, dar acesso externo que não existe localmente, ou produzir evidência
melhor que a nativa. Na dúvida, resolva com a ferramenta nativa.

## Decisão

| A tarefa é sobre… | Use | Nunca use |
|---|---|---|
| Símbolo de **nome distintivo** no código do AdmAi | `Grep` nativo | Serena — o grep já é exato aqui (medido: 481 B, zero ruído) |
| Símbolo de **nome curto/comum** (`pode`, `registrar`, `criar`) | Serena `find_symbol` / `find_referencing_symbols` | `Grep` — medido: 84-93% de falso positivo |
| Estrutura de um arquivo antes de lê-lo inteiro | Serena `get_symbols_overview` | `Read` do arquivo completo |
| Comportamento atual de **biblioteca/framework de terceiro** | `ctx7` | Memória do modelo quando a versão importa |
| **PR, CI, Actions, issue, estado remoto** | `gh` CLI | `git` local para dado que só existe no remoto |
| **Estado local do repositório** | `git` | `gh` — é rede sem ganho |
| **Schema e migrations** | `prisma/schema.prisma`, `prisma/migrations/`, `docs/db/*` | Conectar em banco só para ler estrutura |
| **Logs, advisors, estado real do banco** | Supabase MCP read-only *(quando houver credencial)* | Produção. Sempre |
| **Vulnerabilidade, secret, SAST** | Semgrep espelhando o CI | Varredura ampla sem alvo |
| **Viewport mobile, multi-browser, a11y renderizada** | Playwright CLI | O harness — ele não emula device |
| **Fluxo E2E dos módulos M1–M4** | `chaveiro-painel/e2e/run.mjs` | Playwright — o harness já cobre, com mock determinístico |
| **Contrato/coleção de API** | Testes de integração existentes | Postman — não há coleção no repo |
| Qualquer coisa que `Read`, `Grep`, `git` ou `node` resolvem | A nativa | Qualquer externo |

## Comandos

**Documentação de terceiro** — anônimo, sem login:

```bash
ctx7 library <nome>                 # resolve o ID
ctx7 docs <libraryId> "<pergunta>"  # ex.: ctx7 docs /prisma/prisma "transactions"
```

**GitHub** — `gh pr view`, `gh run list`, `gh run view --log-failed`, `gh issue list`.
Somente leitura em Discovery. Nunca `gh pr merge` / `gh release` sem autorização explícita.

**Segurança** — mesmos rulesets e caminhos de `.github/workflows/security.yml`, para o resultado
local bater com o do CI:

```bash
semgrep scan --config p/owasp-top-ten --config p/javascript --metrics off \
  chaveiro-bot/src chaveiro-painel/src
```

Gate (só ERROR): acrescente `--severity ERROR --error`.
**Resuma primeiro** — severidade, arquivo, regra, linha, causa, correção — e só então carregue o
detalhe do que for agir.

**Navegador** — decida pela capacidade, não pelo hábito:

```bash
cd chaveiro-painel && npm run build && npm run e2e   # fluxos M1-M4, API mockada
```

Playwright só para o que o harness não faz: emulação de device, multi-browser, trace, a11y
renderizada. Não adicione Playwright ao `package.json` do produto.

## Ambiente

`DISCOVERY` só leitura, nenhuma escrita externa · `LOCAL` nativas + testes + Semgrep + Playwright ·
`STAGING` Playwright + banco de staging + CI · `PRODUÇÃO` só leitura explicitamente segura,
**nenhum MCP de banco**.

Rotear é automático. **Executar efeito colateral não é.** Deploy, push, merge, exclusão, migration,
secret e produção seguem o gate manual do `AGENTS.md`, mesmo com a ferramenta disponível.

## Serena — só as 6 ferramentas de leitura

`find_symbol` · `find_referencing_symbols` · `find_declaration` · `find_implementations` ·
`get_symbols_overview` · `get_diagnostics_for_file`.

Tudo o mais fica fora da allowlist por construção: escrita, shell, memória, e leitura genérica de
arquivo/diretório — que as ferramentas nativas já fazem melhor e sem custo de MCP.

## Ainda não disponíveis

GitHub MCP (descartado — `gh` cobre), Supabase MCP (aguardando PAT), Cloudflare MCP (aguardando
OAuth), Postman (sem coleção). Detalhe em `docs/agent-environment/AGENT_TOOLING_ARCHITECTURE.md`.
