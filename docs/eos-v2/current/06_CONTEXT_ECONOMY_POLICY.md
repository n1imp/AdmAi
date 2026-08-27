# 06_CONTEXT_ECONOMY_POLICY — política de economia de contexto (todas as sessões)

## Regra de ouro
**DO NOT READ A DOCUMENT BECAUSE IT EXISTS.** Antes de abrir um artefato grande, responda:
*que incerteza isto resolve?* Nenhuma ⇒ NÃO leia.

## Preferências de busca
símbolo exato → arquivo exato → seção exata → capability exata. NUNCA varredura de repositório
inteiro como primeiro movimento.

## READ-ON-DEMAND
Leia CURRENT primeiro (`docs/eos-v2/current/`). HISTÓRICO só se: (a) o estado atual o
referencia; (b) evidência atual é contraditória; (c) root-cause de regressão exige;
(d) decisão não pode ser tomada sem ele. Verdade atual > narrativa histórica. Não pré-carregar
documentos linkados.

## Context budget de abertura de sessão
Ler SOMENTE: `01_SESSION_BOOTSTRAP.md` + `02_CURRENT_STATE.md` + audit ledger. Depois
`03_PROJECT_INDEX.md` apenas como navegação; `04`/`05` quando relevantes; histórico sob demanda.

## Targeted code discovery (auditoria funcional)
Por capability: 1) ler entrada do ledger → 2) localizar superfície frontend → 3) localizar
rota/serviço backend → 4) localizar testes existentes → 5) EXECUTAR a capability no staging →
6) classificar → 7) corrigir só se a fase permitir → 8) atualizar ledger → 9) próxima.
**NUNCA "entender o codebase inteiro primeiro".**

## Estado > transcript
`CHAT_TRANSCRIPT_IS_NOT_PROJECT_STATE`. Fonte de verdade para continuar: CURRENT_STATE +
AUDIT_LEDGER + CÓDIGO + EVIDÊNCIA. Chat é contexto histórico opcional.

## Checkpoints
Persistir RESULTADOS semânticos, não cronologia. Bom: `SERVICOS_CRUD USER_REAL_CAN_USE=YES
evidence=<run/arquivo> commit=<sha>`. Ruim: "rodei grep/abri arquivo/cliquei botão".

## Evidência
Nunca duplicar blobs; usar pointers (arquivo, commit, run de CI, artefato de teste, URL de
staging, registro do ledger). O pacote deve responder "onde inspeciono a evidência?" sem
embutir a evidência.

## Anti-padrões de espera
Background rodando ≠ saudável; long-running ≠ progredindo; mesmo-erro-sem-informação-nova ⇒
não repetir idêntico; caminho crítico com stall ⇒ diagnosticar/terminar (progress-timeout);
nunca `| tail` em task longa de background (esconde progresso).
