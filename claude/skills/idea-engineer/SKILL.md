---
name: idea-engineer
description: |
  Atua como engenheiro de prompts para ideias de negócios, produtos digitais e
  automações. Quando o usuário compartilha uma ideia, executa um pipeline de 4
  agentes especializados que produzem um veredicto comercial baseado em dados,
  uma arquitetura técnica respeitando restrições reais, e dois prompts master
  finais — um para IA, outro para desenvolvedor humano.

  Ative para frases como "tive uma ideia de…", "e se eu construísse…",
  "quero criar um…", "como eu construiria X…", "estou pensando em fazer um
  produto…", ou qualquer ideia de negócio, produto, app, site, automação ou
  serviço digital para o qual o usuário busca planejamento estruturado. Não
  ative para perguntas operacionais ("como faço deploy de X?"), feedback
  rápido informal sobre ideias, ou ajuda pontual em features de projetos já
  planejados.
---

# Idea Engineer

Pipeline de 4 agentes que transforma uma ideia em blueprint executável, com veredicto comercial honesto e arquitetura técnica adequada às restrições reais do operador.

## Visão geral

```
USUÁRIO → ideia + (opcional) arquivos do projeto + contexto livre
   ↓
[ PRÉ-FILTRO ]                  (responsabilidade do Artifact, antes da Fase 0)
   ↓
FASE 0 — Context Analyst         (extrai a realidade do contexto)
   ↓
FASE 1 — Business Strategist     (estressa a viabilidade comercial)
   ↓                          ↓
   COMPLETE                  STOP/PIVOT → decisão do usuário
   ↓
FASE 2 — Tech Architect          (projeta arquitetura técnica)
   ↓
FASE 3 — Synthesis               (compõe 2 prompts master finais)
   ↓
USUÁRIO ← Prompt A (para IA) + Prompt B (para humano)
```

Cada fase é uma chamada separada à API Anthropic, com system prompt próprio, dentro de um Artifact HTML/JS interativo que orquestra o fluxo.

## Quando ativar

- O usuário compartilha uma ideia de produto, negócio, app, site, automação ou serviço digital.
- O usuário usa frases gatilho: "tive uma ideia de…", "e se eu construísse…", "quero criar um…", "como eu construiria…", "estou pensando em fazer…", "imagina um produto que…".
- O usuário pede ajuda para **estruturar, validar ou planejar** uma ideia que claramente envolverá construir algo digital.

## Quando NÃO ativar

- O usuário pergunta sobre uma ideia abstrata (filosófica, científica, conceitual) que não vira produto.
- O usuário quer feedback rápido informal sobre uma ideia, sem precisar de plano completo.
- O usuário já tem o plano e só quer ajuda pontual com uma feature específica.
- A "ideia" é, na verdade, uma pergunta operacional ("como faço deploy de X?", "qual a melhor lib para Y?").
- O usuário está em meio a um projeto e quer ajuda com debugging, refactor ou code review.

Em qualquer destes casos: responda normalmente, sem ativar o pipeline.

## Estrutura de arquivos

```
idea-engineer/
├── SKILL.md                          ← este arquivo (gatilhos, fluxo)
└── references/
    ├── context-analyst-prompt.md     ← system prompt da Fase 0
    ├── business-strategist-prompt.md ← system prompt da Fase 1
    ├── tech-architect-prompt.md      ← system prompt da Fase 2
    ├── synthesis-prompt.md           ← system prompt da Fase 3
    ├── pipeline-orchestration.md     ← especificação do Artifact (pré-filtro, estado, transições)
    ├── schemas.ts                    ← validações estruturais e de lógica cruzada (Zod)
    └── artifact-template.jsx         ← React artifact pronto, com placeholders para os 4 prompts
```

## Como executar

Quando esta skill ativar, Claude executa estes passos, em ordem:

1. **Ler todos os arquivos de `references/` antes de qualquer outra coisa.** Os 4 prompts são o coração da skill; o template React é o invólucro; a especificação de orquestração contém regras que o template precisa respeitar.

2. **Confirmar a ideia com o usuário em uma frase**, se ela ainda estiver vaga. Não fazer mini-entrevista — a Fase 0 e a Fase 1 já têm `NEEDS_INPUT` para isso. Só checar se entendeu o suficiente para produzir o artifact.

3. **Criar o artifact React** a partir de `references/artifact-template.jsx`, com a seguinte modificação obrigatória:
   - As 4 constantes em `SYSTEM_PROMPTS` (`phase0`, `phase1`, `phase2`, `phase3`) devem receber o **conteúdo bruto e completo** dos respectivos arquivos em `references/`, dentro de template literals.
   - Substitua cada placeholder `[Cole aqui o conteúdo completo de references/...]` pelo conteúdo real do arquivo correspondente.
   - **Não resuma, não comprima, não omita seções dos prompts.** Cada prompt foi escrito com regras estritas; cortar partes quebra contratos entre fases.
   - **Escape backticks** (`` ` ``) e `${` dentro dos prompts, ou use uma string concatenada para evitar conflito com template literals do JS.

4. **Não modificar o resto do template** sem motivo declarado. O componente React tem 14 sub-componentes ajustados às renderizações específicas de cada fase. Mudanças cosméticas tudo bem; mudanças no fluxo de orquestração (NEEDS_INPUT, halt/pivot, validações) seguem o protocolo de `pipeline-orchestration.md`.

5. **Apresentar o artifact ao usuário** com 1-2 frases curtas sobre o que ele faz. Não recontar o pipeline inteiro — o artifact se explica.

### Sobre os system prompts inline

Cada prompt pesa entre 2.000 e 6.000 palavras. Inline, eles aumentam significativamente o tamanho do artifact, mas isso é intencional: o artifact precisa ser auto-contido para o usuário poder salvá-lo, modificá-lo e executá-lo fora do contexto da skill. Não tente carregar dinamicamente — isso quebraria a portabilidade.

### Sobre validação de schemas

O artifact tem validação estrutural simplificada inline (já em `artifact-template.jsx`). As validações de **lógica cruzada** mais rigorosas (LTV/CAC bate com aritmética, todas as integrations obrigatórias presentes nas fases seguintes, etc.) estão em `references/schemas.ts` como referência opcional. Se o usuário pedir uma versão mais rigorosa do artifact, porte essas funções (`validateBusinessStrategistLogic`, `validateTechArchitectLogic`, `validateSynthesisLogic`) para dentro do componente React.

### Comportamento sem chave da API

O artifact usa `fetch` direto para `https://api.anthropic.com/v1/messages`. No ambiente de artifacts do Claude (`claude.ai`), isso funciona sem chave manual — o sandbox lida com autenticação. Em outros ambientes (export manual para servidor próprio), o usuário precisa adicionar header `x-api-key` ao `fetch` em `callClaude`.

## Princípios transversais do pipeline

- **Honestidade epistêmica:** cada agente declara o que sabe vs o que está inferindo (`unverified_assumptions`, `_confidence`). O Artifact renderiza essa distinção visivelmente — não esconde em modais.
- **Fontes visíveis:** Fases 1 e 2 emitem `sources` com publisher + ano + URL. O Artifact mostra todas, agrupadas por seção.
- **Direito de matar a ideia:** a Fase 1 pode declarar `verdict: "stop"`. O Artifact respeita — não chama a Fase 2 sem decisão explícita do usuário.
- **Contexto regional como primeira classe:** quando `user_region = BR` (default no Brasil), todas as recomendações se adaptam (PIX, MEI/ME, marketplaces locais, logística BR, NFe, LGPD).
- **Sem inventar contexto:** quando informação falta, o agente pede (`NEEDS_INPUT`) ou declara `null`. Nunca preenche com chute confiante.
- **Contratos explícitos entre fases:** cada prompt declara o schema que recebe e o schema que emite. Mudar um schema sem atualizar os consumers quebra o pipeline — e o Artifact detecta na validação.

## Saídas finais

Ao final do pipeline, o usuário recebe **dois prompts auto-contidos**:

- **Prompt A (400-600 palavras):** system prompt denso para IAs ou IDEs com IA (Claude, GPT, Cursor, Windsurf, Copilot). Pronto para colar.
- **Prompt B (500-700 palavras):** briefing técnico profissional para entregar a um desenvolvedor freelancer ou contratado. Inclui contexto, decisões, timeline, riscos e plano de escala.

Ambos sem referências ao histórico das fases — funcionam do zero para quem ler.
