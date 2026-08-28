# ADMAI_PRODUCT_DESIGN_PRINCIPLES

Regras do novo produto frontend (Refoundation). Aurora = LEGACY (sem V2/refresh/rename). O novo
sistema não tem nome estilizado até a linguagem de produto existir.

## Contexto de uso que governa tudo

AdmAi é software **operacional para chaveiros**: usado no balcão atendendo cliente, em campo,
no celular com uma mão, e em revisão administrativa no desktop. Prioridades:
`speed · clarity · scanability · touch · poucos passos · baixa carga cognitiva · alto sinal`.

## Princípios (ordem de precedência)

1. `PRODUCT BEFORE AESTHETICS` — cada superfície nasce do job (fluxo obrigatório: capability →
   job → papel → dados → regras → ação primária → secundárias → estados → referência → pattern
   → design → implementar → verificar; nunca PROMPT→JSX).
2. `REFERENCE BEFORE INVENTION` — pesquisar por problema; cada referência termina em
   ADOPTED/ADAPTED/NOT_APPLICABLE/DEFERRED/REJECTED_WITH_EVIDENCE.
3. `DESIGN SYSTEM FIRST` (após foundations aceitas) e `CONSISTENCY != UNIFORMITY` — compartilhar
   fundações/interação/linguagem/navegação/feedback/a11y; permitir patterns por job (Ponto não é
   Auditoria; Financeiro não é Ajuda).
4. `PROGRESSIVE DISCLOSURE` — DTO ≠ estrutura de tela: a experiência inicial mostra o que decide;
   o resto se revela.
5. `CLEAR HIERARCHY` + `CLEAR PRIMARY CTA` — uma ação primária por superfície; secundárias
   subordinadas.
6. `MOBILE FIRST` e `MOBILE != SHRUNK DESKTOP` — mesma capability, composição própria; alvos de
   toque ≈44px onde aplicável; provar 360/390/tablet/1440/1920.
7. `COMPLETE STATES` — INITIAL/LOADING/SUCCESS_EMPTY/SUCCESS_WITH_DATA/ERROR_RECOVERABLE/
   ERROR_FATAL/PERMISSION_DENIED/DISABLED/SUBMITTING/SUCCESS_FEEDBACK. Nunca "0" durante loading
   (lição real do flash-of-empty dos ciclos 1-2).
8. `ACCESSIBILITY BY DEFAULT` — HTML semântico, nomes acessíveis, teclado, foco visível,
   contraste, relações de erro de formulário, foco de diálogo, reduced motion.
9. `FUNCTIONAL MOTION` — motion revela/foca/relaciona/confirma/preserva contexto; nunca decora;
   `prefers-reduced-motion` respeitado (padrão já existente no Overlay).
10. `PERFORMANCE IS DESIGN` — baseline medido (JS 1079KB/13 chunks, CSS 62KB em 2026-08-28);
    novo frontend não regride materialmente sem justificativa; capability grande = rota lazy.
11. `NO FAKE SUCCESS` — sucesso = confirmado pelo servidor + UI reflete + reload persiste;
    mutações críticas (finanças, aprovação, segurança, ponto, documentos) SEM optimistic update.
12. `UX RISK CLASSES` — LOW/MEDIUM/HIGH; confirmação e feedback proporcionais (HIGH: finanças,
    segurança, aprovação, destrutivas). Danger só para perigo material.
13. Identidade vem do DOMÍNIO (lifecycle de serviço, aprovação, técnico, ponto, finanças,
    estoque) — não de decoração. Teste anti-genérico: *"esta tela poderia pertencer, inalterada,
    a qualquer SaaS genérico?"* Se sim, desafiar o design.

## ANTI-AI DESIGN POLICY (operacional)

Rejeitados como default: excesso de cards · grids genéricos de dashboard SaaS · radius uniforme
gigante · gradientes gratuitos · glassmorphism · bordas brilhantes · badges decorativos · ícones
aleatórios · sombras decorativas · hero patterns genéricos · whitespace excessivo · bento sem
justificativa · texto animado sem função · dashboards-template · card uniforme para todo domínio.

**Gate por elemento relevante**: `QUE PROBLEMA DE PRODUTO/COMUNICAÇÃO/INTERAÇÃO ESTE ELEMENTO
RESOLVE?` Sem resposta concreta → REMOVE OR RECONSIDER. Aplicado em review de toda slice de
superfície (registrado na slice, não em doc à parte).

Corolários específicos: cor tem semântica (sem carnaval de badges; metadata não vira chip);
elevation só com layering real (popover/dialog/overlay); radius sóbrio (large = raro; container
grande pode não ter); brand accent não pinta o app inteiro (ordem: neutral → semantic → accent →
dataviz → interactive states).

## Referências → disposição (pesquisa por problema, 2026-08-28)

| problema | referência | padrão útil | disposição |
| --- | --- | --- | --- |
| densidade de coleções operacionais | IBM Carbon data-table | 3 modos NOMEADOS de densidade; "tall" só com 2 linhas reais por row | **ADAPTED** → density contextual comfortable/compact/dense do nosso foundations; Auditoria/Admin densos, Onboarding confortável |
| coleção com filtro/ação em massa | Shopify Polaris IndexTable | filtros persistentes, bulk actions, estados completos de tabela | **ADAPTED** → pattern ResourceCollection (sem bulk até haver job real que exija) |
| navegação de admin | GitLab Pajamas + AWS Cloudscape side-nav | agrupar por INTENÇÃO/modelo mental (nunca org chart); consistência do topo entre contextos; sidebar 240-300px | **ADOPTED** como princípio; nomes dos grupos = decisão DDR própria (não copiar taxonomia) |
| navegação por intenção (clusters) | prática comum (Workspace/Content/Reporting/Admin) | clusters por objetivo do usuário | **ADAPTED** — clusters do AdmAi derivam dos jobs reais D/G/F da CAPABILITY_SURFACE_MATRIX |
| motion funcional | Motion.dev docs | (fonte para FR-MOTION) | **DEFERRED** → consultar na fase FR-MOTION |
| componentes prontos (21st.dev/ReactBits/Uiverse) | — | catálogos de componentes | **NOT_APPLICABLE nesta fase** — foundations primeiro; catálogo de componente não define linguagem. Reavaliar por problema em FR-13+ |
| table→stacked no mobile | Carbon/Polaris responsive | coleção vira blocos semânticos empilhados (não card ornamental por item) | **ADOPTED** para ResourceCollection mobile |

`REFERENCE != CLONE · TREND != JUSTIFICATION`. Uso de referência em slice registra:
problema → referência → padrão útil → decisão → adaptação AdmAi.
