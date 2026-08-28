# ADMAI_FRONTEND_FUTURE_EXPANSION_CONTRACT

Pressões futuras CONHECIDAS sobre a arquitetura frontend. Regras absolutas:
`FUTURE-PROOF FOR KNOWN PRESSURES, NOT UNKNOWN POSSIBILITIES` ·
`PREPARE ARCHITECTURE != IMPLEMENT NOW` · `NO_PREMATURE_FUTURE_IMPLEMENTATION` (nada de rota,
nav, CTA, "em breve", entidade sem backend) · `FUTURE ABSTRACTION MUST FIRST SOLVE A CURRENT
REAL PROBLEM`. Tipos: **A**=módulo · **B**=cross-cutting · **C**=workspace/layout ·
**D**=evolução de domínio.

## Capabilities futuras

### WHATSAPP — POST_MVP · tipo B+C
Propósito conhecido: conversas do negócio ligadas a serviço/cliente (conversation + business
context — NÃO clone do WhatsApp Web). Relações: Serviço, futuro Cliente, notificações.
Pressões: layout WORKSPACE (primary pane + secondary + context pane opcional); ações
contextuais em superfícies de serviço/cliente; utilities globais (indicador de conexão).
**Seams AGORA**: App Shell hospeda modo WORKSPACE; registry com lifecycleState; rota lazy por
capability; seam de contribuições contextuais (spec, não implementação).
**NÃO implementar**: inbox, conversas, provider UI. Abertas: modelo de atendimento multi-usuário.

### METRIC_HUBS — DEFERRED_BY_SCOPE · tipo A+C
Propósito: análise profunda por hub temático. Regra dura: `Metric Hub → METRIC_FOUNDATION →
métrica semântica de backend`; NUNCA o frontend calcula verdade nova. Pressões: modo ANALYTICAL
(filtros de contexto, canvas largo, séries, drilldown, comparação, breakdown).
**Seams AGORA**: modo ANALYTICAL no shell; tokens de dataviz no design system (metric, trend,
comparison, série, tabular numerals). **NÃO**: dashboards novos, hub page. Abertas: quais hubs.

### GOOGLE_REVIEWS — DEFERRED_BY_SCOPE · tipo A+B
Propósito: reputação ligada a serviço concluído (`serviço concluído → pedido de review`).
Pressões: ação contextual em serviço; atividade no futuro cliente; contribuição de atenção no
dashboard. **Seams AGORA**: mesmos seams de contribuição do WhatsApp; nada de UI.
**NÃO**: fluxo de pedido, central de reviews. (Implementação parcial existente fica atrás da
flag atual.)

### NOTIFICACOES — DEFERRED_BY_SCOPE · tipo B
Propósito: central de avisos (≠ toast ≠ atenção operacional — distinção preservada:
`TOAST != NOTIFICATION != ATTENTION`). Pressões: slot `GlobalUtilities` no header do shell.
**Seams AGORA**: GlobalUtilities existe com as funções atuais; sino NÃO existe até a capability
voltar. **NÃO**: sino fake, badge, centro vazio.

### SUBSCRIPTIONS_BILLING — DEFERRED_BY_SCOPE (1.1.0, D2) · tipo A+B
Propósito futuro: ciclo comercial (trial→plano). Implementação COMPLETA já existe dormente
(flags `VITE_FEATURE_SUBSCRIPTIONS_BILLING` + `ASSINATURA_ENFORCEMENT_ENABLED`). Pressões:
página de plano; gating de entitlement; provider boundary (Stripe NUNCA vaza para a UI além da
capability — `Frontend → Product Capability Contract → Backend → Provider`).
**Seams AGORA**: já materializados (fronteira única de flag; interceptor condicionado).
**NÃO**: reexpor, pedir chave, modelo comercial novo.

### CLIENTES — futuro domínio · tipo A+D
Propósito: o grafo do produto evolui de Serviço-cêntrico para
`Cliente ├─ Serviço ├─ Orçamento ├─ Agendamento ├─ Conversa ├─ Documento ├─ Garantia └─ Review`.
Pressões: detalhe de entidade com recursos relacionados; rotas profundas (`/clientes/:id/...`);
atividade/histórico; busca no shell. **Seams AGORA**: pattern `RelatedResource` extraído dos
casos ATUAIS (Serviço→Técnico, Serviço→Documento, Técnico→Ponto/Docs — evidência real);
arquitetura de rota que suporta profundidade; espaço estrutural para busca no shell (sem campo
fake). **NÃO**: schema, API, página, card de cliente.

### AGENDA / AGENDAMENTOS — futuro domínio · tipo A+C
Pressões: layout temporal (WORKSPACE variante), fundações de data/hora (formatação central,
política de timezone ÚNICA), responsividade de canvas temporal.
**Seams AGORA**: fundações temporais no design system (formatadores centrais já existem em
`lib/api.js` — consolidar no language system); modo WORKSPACE. **NÃO**: calendário, slots, API.

### ORCAMENTOS — futuro domínio · tipo A+D
Fluxo futuro provável: `orçamento → aceito → serviço` (conversão de entidade).
Pressões: lifecycle representável (StatusProgression), forms compostos reutilizáveis, relação
com serviço. **Seams AGORA**: form architecture composable (o wizard de serviço já é multi-etapa
— não engessar); pattern de lifecycle nascendo do lifecycle REAL do serviço
(rascunho→aguardando→aprovado/rejeitado). **NÃO**: entidade, conversão, página.

### GARANTIAS + RETRABALHO — futuro domínio · tipo D
Pressões: relações serviço↔serviço (retrabalho vinculado), janelas temporais (garantia),
histórico. **Seams AGORA**: RelatedResource + fundações temporais (mesmos de cima).
**NÃO inventar**: duração de garantia, finanças de retrabalho, qualidade por técnico — regras
de domínio/backend futuras.

### CATALOGO / CATEGORIAS — futuro domínio · tipo D
Pressão única AGORA: o formulário de Serviço não pode ser rígido a ponto de impedir
`tipo de serviço / categoria / defaults / duração estimada / materiais` no futuro.
**Seam**: schema do form em camada (zod) + seções componíveis. **NÃO**: criar os campos.

### E2E expansion — engenharia · (sem superfície)
Playwright/harness por capability com seletores semânticos (role/nome acessível). Entra no
verification profile, não no produto.

## Impact Matrix

| capability | nav | shell | design patterns | backend rel. | preparar AGORA | depois |
| --- | --- | --- | --- | --- | --- | --- |
| WHATSAPP | +1 grupo op. | WORKSPACE | conversa+contexto | Serviço/Cliente | modo+registry+contrib seam | tudo |
| METRIC_HUBS | +hub em análise | ANALYTICAL | dataviz completo | METRIC_FOUNDATION | modo+tokens dataviz | hubs |
| GOOGLE_REVIEWS | ação contextual | — | atividade/atenção | Serviço | contrib seam | fluxo |
| NOTIFICACOES | — | GlobalUtilities | lista de avisos | eventos | slot | centro |
| SUBSCRIPTIONS | +Plano (flag) | — | página de plano | Assinatura | pronto (flags) | ciclo comercial |
| CLIENTES | +Relacionamento | rotas profundas | entity detail+related | novo domínio | RelatedResource dos casos atuais | domínio |
| AGENDA | +Agenda | WORKSPACE temporal | temporal | novo domínio | fundações data/hora | calendário |
| ORCAMENTOS | +Orçamentos | — | lifecycle+forms | Serviço | forms componíveis | entidade |
| GARANTIAS/RETRAB. | (dentro de serviço) | — | relações+tempo | Serviço | idem CLIENTES/AGENDA | regras |
| CATALOGO | (dentro de serviço) | — | form evolutivo | Serviço | schema em camada | campos |

## Fitness questions (§107) — a arquitetura só está pronta quando TODAS = NO

Adicionar Clientes exige trocar o App Shell? · Agenda exige trocar a navegação? · WhatsApp
quebra o layout global? · Notificações exige reconstruir o header? · Metric Hubs exige trocar o
design system? · Orçamentos exige reescrever a arquitetura do form de Serviço? · Garantia/
Retrabalho exige hacks ad-hoc de relação? · Reviews exige flags espalhadas? · Subscriptions
exige reintroduzir conceitos Stripe pela UI? — Provas: fitness tests sintéticos (§105) +
protótipos de pressão dev-only (§108: inbox workspace, agenda temporal, superfície analítica),
nunca rotas de produto.
