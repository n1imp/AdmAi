# Governanca automatica Claude-Codex no AdmAi

Este repositorio e a fonte de verdade. Em caso de conflito, prevalecem: a instrucao atual do usuario, o contrato ou plano ativo, as decisoes registradas, este arquivo e, por fim, o codigo e os testes atuais.

As regras abaixo governam o fluxo orquestrado por Claude. Elas nao ampliam permissoes de escrita, commit, merge, rede ou operacoes externas.

## Modos delegados do Codex

Toda delegacao enviada por Claude deve declarar exatamente um modo:

- `MODO_CODEX: DECISOR`: resolve uma decisao tecnica material em modo somente leitura.
- `MODO_CODEX: REVISOR`: revisa uma implementacao pronta em uma conversa nova e somente leitura.
- `MODO_CODEX: ARBITRO`: desempata Claude e Codex em uma conversa nova e somente leitura.

Nos tres modos, Codex nao edita arquivos, nao executa mutacoes, nao cria commits, nao amplia escopo e nao aprova o proprio trabalho.

Se a mensagem se identificar como delegacao do Claude, ou usar o protocolo abaixo, mas omitir `MODO_CODEX`, responda somente `MODO_OBRIGATORIO` e nao aja. Sem indicio de delegacao, um pedido direto do usuario ao Codex segue normalmente e prevalece sobre este roteamento.

## Autoridade

- Claude e o unico writer no fluxo orquestrado. Ele investiga, implementa e testa dentro da missao autorizada.
- Claude decide detalhes tecnicos triviais, reversiveis e ja definidos pelos padroes do repositorio.
- Antes de perguntar ao usuario sobre uma decisao tecnica material, Claude consulta o Codex Decisor.
- Sao materiais decisoes que afetem seguranca, autenticacao, cobranca, dados, schema, API, contratos, multiplos chamadores, arquitetura ou criterios de teste.
- Codex pode escolher ou exigir a alternativa segura. Reduzir protecao ou aceitar risco exige decisao do usuario.
- O usuario decide regras de negocio, custos, duracao de trial, mudanca de escopo, aceitacao de risco, dados pessoais, operacoes irreversiveis, merge, push, deploy e acoes externas.
- Codex decide como executar uma missao ja autorizada; nunca decide que uma nova missao esta autorizada.
- Permissao para editar ou criar commit continua dependendo do contrato ativo. Esta governanca nao a concede.

## Contexto e operacao

Antes de agir, leia `CLAUDE.md` quando usar Claude Code e o contrato ativo. Nesta frente, o contrato e `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`. Leia `.ai/PROJECT_CONTEXT.md`, `.ai/coordination.yaml` ou `docs/agent-environment/EXECUTION_STATE.md` somente quando existirem.

Confirme raiz, branch, commit-base, worktree, status, locks, writer e gates antes de escrever. Toda implementacao usa worktree dedicada e exatamente um writer. Pare diante de branch desconhecida, conflito de paths, mudanca concorrente ou necessidade de stash, reset ou rebase.

O repositorio possui dois modulos Node.js independentes:

- `chaveiro-bot/`: API Express, workers, integracoes e Prisma/PostgreSQL.
- `chaveiro-painel/`: painel React/Vite e aplicativo Android via Capacitor.

Use Node.js 20+ e npm no modulo correspondente. Nao existe manifest na raiz.

| Finalidade | `chaveiro-bot/` | `chaveiro-painel/` |
| --- | --- | --- |
| Instalar | `npm ci` | `npm ci` |
| Desenvolvimento | `npm run dev` | `npm run dev` |
| Testes rapidos | `npm test` | `npm test` |
| Integracao | `npm run test:integration` | nao existe |
| Lint | `npm run lint` | `npm run lint` |
| Build | `docker build -t admai-bot:local .` | `npm run build` |
| Formatacao | `npm run format:check` | `npm run format:check` |

Integracao exige PostgreSQL e migrations; o runtime usa Redis. Nao instale dependencias nem execute integracao, Docker, migrations, staging, deploy ou auditoria online sem confirmar dependencias, ambiente e autorizacao. O CI oficial esta em `.github/workflows/ci.yml`.

## Protocolo do Decisor

Claude envia Markdown estruturado com todos os campos:

```text
MODO_CODEX: DECISOR
DECISAO_ID:
MISSAO_AUTORIZADA:
PERGUNTA_TECNICA:
EVIDENCIAS:
ARQUIVOS_E_LINHAS:
OPCOES:
POSICAO_CLAUDE:
LIMITES_DE_ESCOPO:
```

Codex inspeciona a evidencia disponivel e responde:

```text
RESULTADO: CONCORDO | DISCORDO | EVIDENCIA_INSUFICIENTE | USUARIO_NECESSARIO
DECISAO:
JUSTIFICATIVA:
RESTRICOES_DE_IMPLEMENTACAO:
TESTES_OBRIGATORIOS:
ESCOPO_CONFIRMADO:
CONFIANCA: ALTA | MEDIA | BAIXA
```

- `CONCORDO`: Claude implementa a posicao apresentada.
- `DISCORDO`: Claude pode aceitar a alternativa e formar consenso.
- Se Claude nao aceitar, coleta evidencia nova e usa `codex-reply` uma unica vez.
- Se a divergencia persistir, Claude abre um novo `codex`, nunca `codex-reply`, em modo `ARBITRO`.
- `EVIDENCIA_INSUFICIENTE`: Claude investiga e retorna; nao transfere automaticamente a pergunta ao usuario.
- `USUARIO_NECESSARIO`: Claude formula uma unica pergunta limitada a materia reservada ao usuario.
- Se Codex estiver indisponivel, uma decisao material fica bloqueada. Nao existe fallback silencioso.

## Protocolo do Arbitro

A solicitacao inclui a pergunta original, as duas posicoes, a evidencia nova e os pontos de discordancia. O Arbitro responde:

```text
VEREDITO_ARBITRAL: POSICAO_CLAUDE | POSICAO_CODEX | TERCEIRA_SOLUCAO | USUARIO_NECESSARIO
DECISAO_VINCULANTE:
JUSTIFICATIVA:
RESTRICOES:
TESTES:
```

O veredito tecnico e vinculante. `USUARIO_NECESSARIO` somente e valido para materia reservada ao usuario.

## Protocolo do Revisor

A revisao usa uma conversa Codex nova, sem o historico do Decisor ou do Arbitro. O Revisor inspeciona diretamente commits, diff e resultados de testes; nao confia apenas no resumo do Claude.

```text
VEREDITO: APROVADO | CORRECOES_NECESSARIAS | USUARIO_NECESSARIO
ACHADOS:
VALIDACOES_CONFIRMADAS:
VALIDACOES_NAO_EXECUTADAS:
RISCO_RESIDUAL:
```

Nao existe aprovacao condicional. Teste obrigatorio nao executado mantem `CORRECOES_NECESSARIAS` ou o gate pendente. O Revisor nunca altera a implementacao que revisa.

## Registro

Decisoes tecnicas materiais sao registradas no plano ou contrato ativo. Se nenhum existir, use `docs/agent-environment/AGENT_DECISIONS.md`.

Cada registro inclui ID, missao, evidencias, posicao do Claude, posicao do Codex, decisao final, thread do Decisor ou Arbitro, impacto e testes. Nunca atribua ao usuario uma frase, aprovacao ou decisao sem evidencia literal verificavel.

## Regras duraveis do repositorio

- Preserve mudancas existentes; nao use reset destrutivo, clean, stash automatico, rebase ou reescrita de historico.
- Leia os arquivos relevantes antes de editar e prefira a menor correcao que atinja todos os chamadores reais.
- Nunca leia, exponha, registre ou versione secrets, PII, `.env`, chaves ou credenciais.
- Valide entradas com Zod nos boundaries.
- Dados multi-tenant usam `req.db` e IDs validados; nao use Prisma global em queries tenant.
- Autenticacao e autorizacao sao impostas no backend por `requireAuth` e `requirePermissao`; preserve self-scope e contratos de 2FA/OAuth.
- Mudancas em schema, auth, API, dependencias, lockfiles, CI e componentes compartilhados exigem gate especifico e trabalho sequencial.
- Declare validacoes nao executadas; limitacao ambiental nunca equivale a teste aprovado.
- Nenhum agente faz merge, push, deploy, release, migration ou operacao remota sem autorizacao explicita do usuario.

Uma tarefa termina somente com escopo e criterios atendidos, diff revisado, `git diff --check` limpo e validacoes aplicaveis registradas. Atualize o plano ou contrato ativo com handoff, review, gates e limitacoes reais.
