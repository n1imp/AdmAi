# ADMAI_RESEARCH_RECOMMENDATION_REGISTRY

Toda recomendação de pesquisa visual termina em exatamente um desfecho — `ADOPTED · ADAPTED ·
NOT_APPLICABLE · DEFERRED · REJECTED_WITH_EVIDENCE` — e **nunca** `FORGOTTEN`. Reconciliação
obrigatória antes do release (`F6-08-RESEARCH-RECON`): zero UNKNOWN, zero sem desfecho.

**Nota de acesso às fontes (evidência, não desculpa)**: 21st.dev, ReactBits e Uiverse são catálogos
JS-heavy; fetch estático devolve o shell da SPA (tentado em 2026-08-23 — motion.dev devolveu só o
índice de navegação; reactbits.dev só o título). A avaliação abaixo usa o catálogo conhecido dessas
fontes + os princípios que elas ensinam, aplicados aos NOSSOS tokens. `REFERENCE != COPY` valeria de
qualquer forma: nenhuma recomendação aqui é "copiar componente" — é decisão sobre padrão.

**Vínculos que decidem tudo**: motion CSS-first (zero libs instaladas — verificado em
`package.json`; dependência nova só por gate com caso concreto, política do usuário); identidade
única Aurora (decisão do usuário, 2026-08-23); toda mudança precisa ser verificável pela sonda
(oclusão/alvo/truncamento/nome) ou por captura comparada.

| # | Recomendação (fonte) | Desfecho | Evidência / onde aterrissa |
| --- | --- | --- | --- |
| R-01 | Micro-interações de feedback em controles — hover/press com deslocamento sutil (Motion.dev como referência de *timing*, não de biblioteca) | **ADOPTED — já existe** | `.panel-button:hover { translateY(-1px) }` + tokens `--panel-motion-*` com 4 easings e kill-switch de reduced-motion (`panel-primitives.css:25-31`, `panel-overlay.css:125-154`). Nada a instalar; o que faltar em página nova usa os MESMOS tokens |
| R-02 | Biblioteca Motion/framer para orquestração de animação | **REJECTED_WITH_EVIDENCE** | O produto tem UMA transição de rota (opacity-only, e o comentário em `panel.css:126-129` explica por quê: transform no ancestral criaria containing block e quebraria todo `position:fixed`). Orquestração de springs não tem consumidor; dependência nova sem caso concreto viola a política registrada. Revisitável por gate se um caso concreto surgir (`DEFERRED` implícito no gate de dependências) |
| R-03 | GSAP para a Landing (scroll-reveal, parallax) | **REJECTED_WITH_EVIDENCE** | A Landing tem 5 seções e conversão por CTA único; scroll-reveal ali é ornamento com custo de bundle e de acessibilidade. O reveal essencial (fade do herói) é uma `animation` CSS de 3 linhas com os tokens existentes — entra em SL-09 SE a captura mostrar ganho, sem lib |
| R-04 | Three.js / cenas 3D | **NOT_APPLICABLE** | Default da diretiva (§31) confirmado: nenhum benefício concreto num painel de gestão de chaveiros |
| R-05 | Anime.js para casos específicos | **DEFERRED** | Nenhum caso específico existe hoje. Revisita: se um slice de F3 identificar animação inviável em CSS puro (condição registrada; nenhuma prevista) |
| R-06 | Padrão "bento grid" para dashboards (21st.dev) | **ADAPTED** | O dashboard já é grade de KPIs; a adaptação real é a de SL-11: hierarquia do herói (lucro) preservada, rótulos sem quebra desalinhada, empty-state com guia. Grade nova não entra — retrabalho sem defeito medido |
| R-07 | Estados vazios com ação (padrão de catálogo: ilustração + frase + CTA) | **ADOPTED** | `FeedbackState state="empty"` + `EstadoVazio` com `cta` JÁ implementam o padrão; SL-11 aplica ao caso medido (dashboard R$ 0,00 sem guia — achado local do inventário). /aprovacoes já é o exemplar correto (captura de 2026-08-22) |
| R-08 | Skeleton loading em vez de spinner para listas | **ADOPTED — já existe** | `Skeleton.jsx` (Card/Kpi/Servico/Lista) + shimmer token; BottomNav usa esqueleto estável para não piscar (`BottomNav.jsx`) |
| R-09 | FAB com pilha de elementos fixos coordenada | **ADOPTED — já existe** | `BotaoFlutuante` desloca por `--admai-nav-h + --admai-consent-h + 1.5rem` — contrato provado por varredura (152 capturas, 0 oclusões permanentes). Qualquer elemento fixo novo ENTRA na pilha, regra do guia §6 |
| R-10 | Tour guiado por biblioteca dedicada | **ADOPTED — já existe** | `driver.js` já instalado e integrado (TourGuide, 7 passos, opt-in, reduced-motion respeitado). Correções de SL-08 são de conteúdo (hover ciano; alvo de passo que o hub não renderiza — GAP-UX-CONFIG-PROMESSA-01), não de ferramenta |
| R-11 | Glassmorphism / gradientes de fundo animados (Uiverse) | **REJECTED_WITH_EVIDENCE** | O produto é ferramenta de trabalho usada em campo, 360px, luz de rua: contraste e legibilidade mandam (guia §2). O backdrop-blur pontual do banner de consentimento permanece; expandir a estética é ruído |
| R-12 | Inputs com label flutuante | **REJECTED_WITH_EVIDENCE** | `Field` usa label FIXO acima com hint/erro ligados por `aria-describedby` — padrão mais legível e já testado por axe. Trocar por label flutuante regrediria acessibilidade sem defeito medido que justifique |
| R-13 | Tipografia display condensada para títulos + sans legível para corpo | **ADOPTED — já existe** | Saira Condensed (display) + Sora (body) + JetBrains Mono (dados), carregadas com `display=swap` (`index.html:16-21`); `.tnum` para colunas numéricas |
| R-14 | View Transitions API para navegação | **DEFERRED** | O guard de reduced-motion já existe (`index.css:88-94`) mas `startViewTransition` nunca é chamado. Sem defeito que a exija; revisita pós-release se a transição de rota atual se mostrar insuficiente em teste com usuários |

## Reconciliação

| Desfecho | Quantas |
| --- | --- |
| ADOPTED (já existente ou aplicado em slice) | 6 |
| ADAPTED | 1 |
| REJECTED_WITH_EVIDENCE | 4 |
| DEFERRED (com condição de revisita) | 2 |
| NOT_APPLICABLE | 1 |
| UNKNOWN / FORGOTTEN | **0** |
