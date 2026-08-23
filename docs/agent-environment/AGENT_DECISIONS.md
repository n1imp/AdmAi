# Registro de decisoes dos agentes

Use este ledger somente quando uma missao nao possuir plano ou contrato ativo. Decisoes registradas no documento ativo nao devem ser duplicadas aqui.

## Campos obrigatorios

| Campo | Conteudo |
| --- | --- |
| `DECISAO_ID` | Identificador unico e estavel. |
| `MISSAO` | Missao previamente autorizada pelo usuario. |
| `EVIDENCIAS` | Referencias verificaveis a codigo, testes ou documentos. |
| `POSICAO_CLAUDE` | Solucao proposta pelo writer. |
| `POSICAO_CODEX` | Parecer do Decisor. |
| `DECISAO_FINAL` | Consenso ou veredito arbitral aplicado. |
| `THREAD` | Identificador da conversa do Decisor ou Arbitro. |
| `IMPACTO` | Arquivos, contratos ou riscos afetados. |
| `TESTES` | Validacoes obrigatorias e respectivos resultados. |

## Registros

### D-F0-02-RUNTIME-SIDE-EFFECT — 2026-08-23

| Campo | Conteudo |
| --- | --- |
| `DECISAO_ID` | D-F0-02-RUNTIME-SIDE-EFFECT |
| `MISSAO` | F0-02 do programa de release aprovado pelo usuario em 2026-08-23 (plano fora do repo; este ledger e o fallback designado). Gate distingue efeito de runtime da aplicacao de escrita de engenharia na dimensao de artefatos ignorados. |
| `EVIDENCIAS` | uploads-docs=107 / uploads-ponto=68 gravados pela aplicacao nas suites de integracao; produtores server-side com randomUUID(): documentos.js:54-56, tecnicos.js:110-142, inbound.js:321 e estoque.js:128 (este ultimo OMITIDO na minha evidencia e apontado pelo Decisor — verificado antes de implementar). Licao docs/eos-v2/CONTROLE_ARTEFATO.md: allowlist invisivel cega o detector. |
| `POSICAO_CLAUDE` | Opcao B: raiz + forma de nome, classe propria nao-bloqueante sempre visivel. |
| `POSICAO_CODEX` | RESULTADO: CONCORDO (confianca ALTA), com restricoes: UUID v4 ESTRITO (nao o permissivo [0-9a-f-]{36}); somente filhos diretos das raizes; criacao/alteracao/remocao pela mesma regra; listas estruturadas completas preservadas; precedencia bloqueante mantida em resultado misto; limite registrado (nome uuid forjado passa — modelo nao-adversarial ja aceito). Rejeitou A (larga demais, .gitignore 2.0 com relatorio) e C (acoplamento invertido: mudar a aplicacao para servir o instrumento). |
| `DECISAO_FINAL` | B com as restricoes do Decisor, integralmente aplicadas. |
| `THREAD` | Codex DECISOR 01a02cd7-85be-7ca1-9d9e-684815fe10cd |
| `IMPACTO` | tools/admai-delivery/write-set-gate.mjs: FORMAS_DE_RUNTIME + ehEfeitoDeRuntime() + particao em compararRodada + campo efeitosDeRuntime no resultado e no relatorio. Nenhuma mudanca em chaveiro-bot/src (call sites sao proveniencia somente leitura). |
| `TESTES` | 12 controles novos no selftest (121/121): 4 formas validas nao bloqueiam e aparecem na lista; manual.txt/near-misses (versao, variante, extensao, subdiretorio) bloqueiam; caso misto reporta ambos com classe bloqueante prevalecendo; misto com UNDECLARED_WRITE de fonte preserva a classe de fonte; alteracao e remocao cobertas; nome runtime-shaped fora da raiz sem isencao; controle explicito de produto-<uuid>. |
