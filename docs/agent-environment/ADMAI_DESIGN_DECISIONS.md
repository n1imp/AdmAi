# ADMAI_DESIGN_DECISIONS — DDRs da Refoundation

Decisões estruturais VINCULANTES do novo frontend. Autoridade: Codex DECISOR
`FRD-ARQUITETURA-DESIGN-BUNDLE` (thread `01a04abb`, 2026-08-28) — alternativas geradas,
desafiadas e selecionadas conforme §117; consenso formado (Claude aceitou as 5 correções do
DECISOR sobre a proposta provisória). Mudança em qualquer DDR = novo DECISOR
(DESIGN_SYSTEM_CHANGE_GATE para fundações globais).

## DDR-1 — Navegação / Information Architecture (CONFIANÇA ALTA)

**Decisão**: 1 App Shell autenticado; sidebar desktop 256px (≥1024px); bottom-nav mobile com 4
destinos por papel + `Mais` (overflow do shell, não capability); auth/landing/legais em
`PublicFrame` (não um segundo shell). Sidebar, bottom-nav, `Mais` e guards de rota são
**projeções do MESMO capability registry** — pipeline único
`enabled/lifecycle → role → permission → navigation`; autorização real continua no backend.

**Grupos canônicos** (derivados dos jobs reais da matrix; não a taxonomia genérica):
- Dono: **Negócio** (`/`, `/reparticao`) · **Operação** (`/servicos*`, `/aprovacoes`) ·
  **Equipe** (`/tecnicos*`) · **Materiais e estoque** (`/materiais`, `/estoque`) ·
  **Administração** (`/configuracao`, `/configuracao/usuarios`, `/configuracao/auditoria`) ·
  **Conta e suporte** (perfil, segurança, ajuda)
- Gestor: **Operação** (`/` GestorHome, serviços, aprovações) · **Equipe** · **Materiais e
  estoque** · **Administração** (só com permissão) · **Conta e suporte**
- Funcionário: **Meu trabalho** (`/` MeuPainel, `/meu-ponto`, `/meus-servicos*`) ·
  **Minha conta e suporte** (`/meus-documentos`, perfil, segurança, ajuda)

**Bottom-nav**: D = Visão·Financeiro·Aprovações·Equipe·Mais | G = Hoje·Serviços·Aprovações·
Equipe·Mais (corrige Serviços escondido em Mais) | F = Hoje·Ponto·Registrar·Serviços·Mais
(corrige Perfil ocupando slot primário).

Futuro: AGENDA contribui a Operação/Meu trabalho; CLIENTES/CONVERSAS podem criar
**Relacionamento** por metadado do registry. Nenhum grupo vazio/placeholder agora.
Rejeitados: catálogos por papel duplicados (navigation.js atual); ifs espalhados; framework de
plugins.

**Restrições**: registro = capabilityId/lifecycleState/rotas lazy/papéis/permissão/modo/nav;
capability desligada sem nav/rota/CTA/deep-link; grupos vazios desaparecem; sem pathname
hardcoded no shell; sem flash de itens não autorizados; a home-por-papel declarada no registry.

## DDR-2 — Surface Modes (CONFIANÇA MÉDIA-ALTA)

**Decisão**: exatamente 5 modos como contratos ortogonais de composição (1 modo-base por
superfície; densidade/drawer/dialog NÃO criam modos):
- **STANDARD** — fluxo focado/linear: auth, onboarding, troca de senha, novos Serviço/Técnico,
  Meu Ponto, Documentos, Configuração, Perfil, Segurança, Ajuda, Mais, legais, MeuPainel.
- **WIDE** — coleções/entidades largas sem panes persistentes: Técnicos+perfil, Meus Serviços,
  Materiais, Estoque, Usuários, Auditoria, GestorHome (cockpit operacional, não análise).
- **MASTER_DETAIL** — seleção+detalhe no mesmo contexto (mobile promove detalhe a rota):
  **Serviços D/G** (o drawer atual já é semanticamente isso) e **Aprovações**.
- **ANALYTICAL** — filtros temporais/agregados/séries/drilldown: Dashboard do Dono, Repartição;
  Metric Hubs quando reabilitados.
- **WORKSPACE** — 2-3 panes independentes: **nenhuma superfície MVP**; contrato + fixture
  dev/test apenas (pressões WhatsApp/Agenda).

Rejeitados: só STANDARD/WIDE; modo-por-página; variantes “lite/drawer/detail”.
**Restrições**: modo vem de metadata do registry (nunca pathname); MASTER_DETAIL preserva
filtros/rolagem/seleção/histórico; scroll/header/largura pertencem ao shell.

## DDR-3 — Foundations Philosophy (CONFIANÇA MÉDIA)

- **Densidade**: 3 modos por PATTERN/SUPERFÍCIE (não preferência do usuário neste ciclo):
  comfortable (auth/onboarding/wizards/Meu Ponto/Segurança/Documentos/legais) · compact
  (Serviços/Aprovações/Técnicos/Materiais/Estoque/dashboards operacionais) · dense
  (Auditoria/matriz de permissões/breakdown financeiro). Touch ≥ ~44px em qualquer densidade.
- **Radius**: escala `0 / 2 / 4 / 8px` — 0 estruturas/tabelas/containers grandes; 2 controles
  compactos; 4 inputs/botões; 8 dialogs/popovers (raro); `full` só avatar/indicador circular.
- **Elevation**: `none / popover / dialog / overlay` — painéis usam contraste de superfície e
  borda, não sombra; backdrop/z-index são tokens separados.
- **Tipografia**: 9 papéis — display (raro) / page-title / section-title / component-title /
  body / body-compact / label / caption-meta / **numeric-data** (`tabular-nums`+`lining-nums`;
  dinheiro nunca perde centavos). Sem fonte nova "para personalidade".
- **Cor/tema** *(REVISADO no Cycle 2 — a soberana revogou o dark-first; decisão nova
  PRODUCT_EVIDENCE_DRIVEN, DECISOR `01a04ba8` CONCORDO/ALTA)*: **LIGHT-DOMINANT
  single-theme**, `color-scheme: light`, com TOKENS FUNCIONAIS (`surface`, `text`, `border`,
  `danger`, `attention`, `success`, `accent`). Evidência (2026-08-29): 7 composições × 2
  direções com dados reais (Serviços/Financeiro/Ponto-390/Auditoria + fixtures workspace/
  analytical/temporal); contraste WCAG medido 11/11 pares AA em AMBAS (a11y não desempata);
  light venceu nos contextos determinantes — Ponto em campo/luz do dia, Financeiro com
  hierarquia de documento (dark comprime valores secundários), leitura densa da Auditoria;
  anti-AI: "dark SaaS violeta" é a convenção de template que a política rejeita — light
  sóbrio com violeta CONTIDO é a cara de ferramenta de trabalho do AdmAi. DARK-DOMINANT
  rejeitada (sem evidência de uso noturno dominante); MIXED rejeitada (duas direções de QA
  sem benefício). Restrições: sem toggle; sem `prefers-color-scheme`; sem exceções dark por
  superfície; seam semântico preservado para futura decisão SEM implementar/testar dark
  agora; accent só em ação primária/seleção/foco; componentes novos NÃO conhecem
  `--panel-*`/`.panel-ui`/escalas cromáticas literais. Ordem: neutral → semantic → accent →
  dataviz → interaction.
- Migração não depende de AURORA_USAGE=0; cada slice proíbe usos novos e reduz o baseline (1566).

## DDR-4 — Application Layer / Server State (CONFIANÇA ALTA)

**Decisão**: **híbrido — TanStack Query somente nas superfícies migradas**; axios permanece o
único transporte (interceptors de refresh/401/402/403 preservados). A dependência entra junto
da PRIMEIRA superfície com server state (FR-15), não como scaffolding no shell.
Rejeitados: big-bang (44 arquivos/101 call sites); hooks caseiros (reimplementar
cache/dedupe/retry com menos prova).

**Restrições**: queries/mutations no application layer por capability (componentes não
interpretam DTO/erro cru); query keys por domínio+escopo de empresa/usuário; cache limpo em
logout/troca de identidade; invalidações = grafo literal da matrix; retry limitado a falha
transitória (nunca 4xx); mutations `retry: 0`; finanças/aprovação/segurança/ponto/documentos
SEM optimistic; sucesso só pós-confirmação do servidor; AbortSignal até o axios; domain/form
state fora do Query; nenhuma state library global nova; um dono por recurso por superfície;
unidade de migração = capability/journey; auth imperativo (sessão não é query cache);
Capacitor validado para reconnect/retomada (câmera do Ponto não pode disparar refetch mutante).

## DDR-5 — Ordem de migração (CONFIANÇA MÉDIA-ALTA)

FR-13 Foundations+App Shell (tokens, modes, registry completo, sidebar/bottom-nav/Mais,
frames público/auth — SEM redesenhar as 45 páginas) → FR-14 Auth (login/2FA/magic-link/
recovery/convite/verificação/guards) → FR-15 **Jornada nuclear de Serviço** (Serviços+Novo D/G,
Meus Serviços+registro F, Aprovações; entra TanStack/forms/ResourceCollection/master-detail/
invalidação) → FR-16 Dia do funcionário (MeuPainel, Meu Ponto, Documentos; mobile one-hand,
câmera/geo/offline) → FR-17 Equipe e recursos (Técnicos*, Materiais, Estoque) → FR-18 Negócio
e dados (Dashboard D, GestorHome, Repartição; ANALYTICAL/dataviz lazy) → FR-19 Administração e
conta (Config, Usuários/RBAC, Auditoria, Perfil, Segurança; dense/HIGH-risk) → FR-20
Secundárias MVP (Ajuda etc.) → FR-21 Público/legal (Landing/privacidade/termos/cookies) →
FR-LEGACY (retirada de PanelScope/tokens Aurora quando nenhuma capability MVP depender).
Diferidas (Avaliações, Notificações, Assinatura, WhatsApp, Metric Hubs) NÃO são migradas —
ficam inacessíveis atrás das flags. Cada slice termina funcionalmente completa antes da
próxima; cada fase registra referências+disposição próprias.

## Testes obrigatórios globais (resumo vinculante do DECISOR)

Registry/IA tabular D/G/F×enabled×role×permission; nenhuma rota sem registro e vice-versa;
diferida sem nav/rota/deep-link (regressão específica p/ `/configuracao/whatsapp`); shell em
360/390/tablet/1440/1920 + safe areas Capacitor; MASTER_DETAIL preserva estado; fixtures
dev-only para WORKSPACE/temporal/ANALYTICAL; fitness questions todas NO; axe+teclado+foco+AA+
44px+reduced-motion; novos componentes sem `--panel-*`; query keys cobrem o grafo; sem retry
em mutation/4xx; sem optimistic crítico; logout limpa cache; reload persiste; journeys E2E
(Serviço→Aprovação→Financeiro→Indicadores; Login→Ponto→Registrar→status; Usuário→Permissões→
efeito→Auditoria; Documento→assinada→gestor); perf: TanStack ≤15KB gz atribuível, delta do
chunk inicial do shell ≤20KB gz, recharts fora de landing/auth, capabilities grandes lazy;
gates de fechamento: test/a11y/lint/typecheck/build/format + `git diff --check` + smoke
Android/Capacitor (Ponto/câmera/geo/offline/retomada).
