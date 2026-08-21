# evidence/ — Relatórios individuais dos agentes

Um arquivo por agente, por rodada: `ROUND-XX-<AGENTE>.md`.

## Regra de escrita

`[EVIDÊNCIA DO REPOSITÓRIO]` O repositório não possui `.claude/agents/`, e criar arquivos de
definição de agente violaria a regra de escrita desta sessão (só documentos Markdown da
descoberta são editáveis). Os papéis EOS são instanciados **por prompt**.

Os agentes operam **somente em leitura** e **retornam** seus relatórios. O orquestrador os
persiste **verbatim** aqui. Isso preserva o writer único exigido pelo `CLAUDE.md`, elimina risco
de edição concorrente e não perde fidelidade do relatório.

Relatório persistido verbatim **não é verdade estabelecida**: é evidência de um agente. Quando o
comportamento atual puder ser verificado diretamente no código, o código prevalece
(`00_EOS_DISCOVERY_PROTOCOL.md` §3).

## Contrato obrigatório de cada agente

Todo prompt de agente cola este contrato, e todo relatório entrega os 10 itens:

1. Escopo analisado.
2. Arquivos e evidências consultados.
3. Comportamento atual.
4. Necessidades ou riscos encontrados.
5. Contradições.
6. Perguntas que dependem do usuário.
7. Alternativas possíveis.
8. Recomendação fundamentada.
9. Grau de confiança.
10. Pontos não verificados.

Agentes não implementam código. Agentes não decidem em nome do usuário. Agentes não editam
documentos.

## Cabeçalho de cada relatório

```text
# ROUND-XX — <AGENTE>

| Campo | Valor |
|---|---|
| Rodada | |
| Agente EOS | |
| Tipo de subagente usado | Explore | general-purpose |
| Data | |
| Commit-base | |
| Mandato | |
| Grau de confiança | ALTA | MÉDIA | BAIXA |
```

## Índice atual

| Arquivo | Rodada | Mandato |
|---|---|---|
| `ROUND-00-MAPPER-BACKEND.md` | 00 (bootstrap) | Inventário factual do backend `chaveiro-bot` |
| `ROUND-00-MAPPER-FRONTEND.md` | 00 (bootstrap) | Inventário factual do painel `chaveiro-painel` |
| `ROUND-00-MAPPER-TESTS-CI-DOCS.md` | 00 (bootstrap) | Testes, CI/CD, ambientes e documentação |
| `ROUND-01-EOS-REPOSITORY-MAPPER.md` | 01 | Regras transversais no código: autorização legada, navegação, Voltar, estado, atualização, validação, erro, formatos, uploads, notificações, exclusão, auditoria, a11y, mobile, ambientes, i18n |
| `ROUND-01-EOS-DATA-ARCHITECTURE.md` | 01 | Conceitos transversais de dados: identidade/conta/usuário, usuário/técnico, papel/vínculo, empresa/unidade, escopo de tenant, histórico, soft delete, eventos, retenção, campos compartilhados |
| `ROUND-01-EOS-UX-MOBILE-ACCESSIBILITY.md` | 01 | Arquitetura de informação por papel, link direto, Voltar, preservação de contexto, formulários, estados de tela, mobile-first, acessibilidade, duas camadas de design system |
| `ROUND-01-EOS-PRODUCT-DISCOVERY.md` | 01 | Proposta de valor declarada vs. implementada, pagante vs. usuário, jobs-to-be-done por papel, especialização em chaveiro, complexidade, papéis não modelados |
| `ROUND-01-EOS-DOMAIN-OPERATIONS.md` | 01 | Ciclo operacional real: estados do serviço, atribuição, aprovação, estoque, comissão, ponto, avaliação, fechamento, dependências entre eventos |
| `ROUND-01-EOS-SECURITY-PRIVACY.md` | 01 | Restrições que o baseline de segurança e a LGPD impõem às decisões funcionais; inventário de dado pessoal por titular |

### Tipo de subagente — decisão do orquestrador

Todos os agentes desta frente rodam como subagente `Explore`, que **não possui ferramenta de
escrita**. A escolha é deliberada: torna a regra "agentes são somente-leitura" uma garantia
estrutural, não apenas uma instrução de prompt. A síntese interpretativa fica com o
orquestrador, que é o writer único.

### Agentes previstos e ainda não executados na Rodada 1

| Agente | Quando entra | Motivo de não ter entrado agora |
|---|---|---|
| `EOS-QA-Acceptance` | Depois que existirem decisões aprovadas | Não há o que converter em critério de aceite antes das respostas do Lote 1 |
| `EOS-Adversarial-Reviewer` | Quando a especificação estiver madura | É o gate obrigatório antes da aprovação do usuário; rodar agora não teria alvo |
| `EOS-Official-Research` | Nos lotes que dependam de fonte oficial | O Lote 1 trata de posicionamento de produto, matéria exclusiva do usuário; nenhuma pergunta dele depende de fonte externa |
