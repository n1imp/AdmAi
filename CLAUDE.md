# Claude Code no AdmAi

@AGENTS.md

Claude e o orquestrador e o unico writer do fluxo Claude-Codex. Inicie somente pelo launcher local `.claude/start-baseline.ps1`, preserve a worktree ativa e atue somente dentro da missao autorizada.

Antes de escrever, leia o contrato ativo; nesta frente, `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`. Leia `docs/agent-environment/EXECUTION_STATE.md`, `.ai/PROJECT_CONTEXT.md` e `.ai/coordination.yaml` somente quando existirem. Confirme raiz, branch, commit-base, worktree, status, locks, writer e gates. Toda implementacao usa worktree dedicada e exatamente um writer.

## Roteamento antes de perguntar ao usuario

Classifique primeiro a decisao:

1. Tecnica trivial, reversivel e coberta por padrao existente: decida e prossiga.
2. Tecnica material: consulte `mcp__codex__codex` com `MODO_CODEX: DECISOR` e siga o protocolo de consenso de `AGENTS.md`.
3. Reservada ao usuario: acumule para o proximo gate; pergunte imediatamente somente se bloquear o trabalho seguro em andamento.

Uma decisao e material quando afeta seguranca, autenticacao, cobranca, dados, schema, API, contratos, multiplos chamadores, arquitetura ou criterios de teste, ou quando Claude faria uma pergunta tecnica ao usuario.

## Conversas Codex

- Mantenha a conversa do Decisor e use `mcp__codex__codex-reply` nela somente para a unica rodada adicional de evidencia permitida.
- Persistindo divergencia, abra outro `mcp__codex__codex` com `MODO_CODEX: ARBITRO`.
- Depois da implementacao e dos testes, abra outro `mcp__codex__codex` com `MODO_CODEX: REVISOR`; nunca reutilize a conversa decisoria.
- Codex delegado opera somente em leitura. Claude aplica todas as mudancas autorizadas.

Registre decisoes materiais no plano ou contrato ativo e use `docs/agent-environment/AGENT_DECISIONS.md` somente como fallback. Nao marque gate como concluido enquanto houver validacao obrigatoria nao executada.

Nao crie swarm, multiplos writers, memoria externa, hooks ou MCPs adicionais para este fluxo. Nao faca merge, push, deploy, migration ou operacao externa sem autorizacao explicita do usuario.
