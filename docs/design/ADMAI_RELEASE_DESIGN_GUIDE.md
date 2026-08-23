# ADMAI_RELEASE_DESIGN_GUIDE

Consolida o que **existe** — tokens Aurora, primitives, motion, contratos de layout — em regras
que as fatias de F2/F3 seguem. Não é um design system novo: é o mapa do que já foi aprovado, mais
as três decisões que faltavam (breakpoint, paleta de charts, identidade única). Fonte da verdade
dos valores: `chaveiro-painel/src/styles/panel.css` (tokens), `tailwind.config.js` (escalas
legadas), `src/components/ui/` (primitives). Se este guia divergir do código, o código ganha e o
guia é corrigido.

## 1. Identidade — UMA, por decisão do usuário (2026-08-23)

**Aurora em tudo.** Violeta `--panel-brand #8b5cf6` (bordas/fundos) e `--panel-brand-strong
#c4b5fd` (texto/botão primário — o #8b5cf6 é sub-AA para texto e fica proibido nesse papel,
`panel-rollout.css:107-108`). A fronteira `PUBLIC_SURFACES` de estilo (App.jsx:78) **morre**:
Landing e páginas legais entram no escopo `.panel-ui` (SL-09/SL-14). O ciano `accent-*` do
Tailwind vira legado em extinção — **nenhuma fatia introduz ciano novo**; o remap de
`panel-rollout.css` segue cobrindo classes legadas até cada página ser tocada.

Leftovers já nomeados para SL-08: hover ciano no botão do tour (`TourGuide.jsx:38-39`), sombra
violeta hardcoded sobre classe ciano no FAB (`BotaoFlutuante.jsx:37`).

## 2. Princípio de produto

Ferramenta de trabalho usada **em campo, a 360px, com uma mão**. Contraste e legibilidade vencem
estética; densidade no desktop é usar a largura para INFORMAÇÃO, nunca para ornamento. Todo texto
de dado numérico usa `.tnum`.

## 3. Tokens (panel.css — valores completos no arquivo)

| Grupo | Tokens |
| --- | --- |
| Superfícies | `canvas #0f1018 · canvas-soft · surface #191b28 · surface-raised · surface-hover` |
| Bordas | `border #34384d · border-strong` |
| Texto | `text #f8f9ff · text-soft · text-secondary` |
| Marca | `brand #8b5cf6 (borda/fundo) · brand-strong #c4b5fd (texto/primário) · brand-ink` |
| Dados | `data-blue · data-teal · data-violet · data-pink · data-orange` |
| Semânticos | `success #6ee7b7 · warning #fcd34d · critical #fda4af · focus #fde68a` |
| Raios | `radius-control 10px · radius-surface 16px · radius-elevated 24px` |
| Alvos | `target 44px · control-height 48px · nav-target 54px` |
| Motion | `fast 150ms · base 280ms · slow 340ms · distance 12px` + easings `standard/emphasized (0.2,0,0,1) · decelerate (entrada) · accelerate (saída)` |

**Decisão — paleta de charts**: `--panel-data-*` (CSS) é a fonte; `CORES_METRICA`
(`MetricPrimitives.jsx:29`) é espelho JS **declarado como espelho** — SL-11 acrescenta o comentário
de vínculo bidirecional; unificação mecânica (ler computed style) é recusada: custo > benefício
para 6 cores estáveis.

## 4. Breakpoints — a decisão que faltava

Coexistem hoje **768px** (`@media 48rem` no CSS do painel) e **`lg` 1024px** (troca de layout no
JSX: Sidebar/BottomNav, `App.jsx:402`). **Decisão**: a fronteira mobile↔desktop do PRODUTO é
`lg 1024` — é onde a navegação troca, e navegação define o modo de uso. Trabalho novo usa `lg`.
Os `48rem` existentes são ajuste de densidade INTERNA de componente (legítimo em `md`) — ficam,
mas toda media query nova declara em comentário se é *troca de modo* (`lg`) ou *densidade* (`md`).

## 5. Primitives — o vocabulário obrigatório

Página nova ou refeita usa **estes**, nunca reimplementa: `PageHeader` (h1 clampado, eyebrow,
ações, onBack) · `Surface`/`Row` · `Button`/`IconButton` (IconButton EXIGE `label` — é o que
fecha GAP-UX-A11Y-NOME-01 por construção) · `Field` (label fixo + `aria-describedby`; label
flutuante recusado — R-12) · `Overlay` (foco, inert, saída coreografada) · `FeedbackState`
(**o vocabulário completo de estado**: loading/updating/empty/error/success/offline/
permission-denied — página não inventa estado fora dele) · `Skeleton*` para listas ·
`EstadoVazio` com `cta` · `ErroBanner` com retry · Toast via `useToast`.

## 6. Contrato da pilha fixa (provado por varredura — 0 oclusões permanentes em 152 capturas)

Ordem a partir da base: `BottomNav` (publica `--admai-nav-h`) → banner de consentimento (senta em
`bottom: var(--admai-nav-h)`, publica `--admai-consent-h`) → FAB (`bottom: nav + consent +
1.5rem`). O layout reserva o espaço: `.min-h-dvh` desconta `--admai-consent-h`; `body` e o `main`
do painel ganham o padding equivalente. **Elemento fixo novo ENTRA na pilha publicando/consumindo
as variáveis — nunca um offset numérico.**

## 7. Motion — CSS-first, e por quê cada regra existe

- Tokens e easings do §3; **nenhuma biblioteca** (R-02/R-03 rejeitadas com evidência).
- Transição de rota é **opacity-only de propósito**: transform/filter no ancestral criaria
  containing block e quebraria todo `position:fixed` da página (`panel.css:126-129`). Não "melhorar".
- Dois kill-switches de reduced-motion (CSS em `panel-overlay.css:125-154` e `index.css:88-94`)
  + branches JS no Overlay e no tour. Animação nova respeita os DOIS caminhos.
- Hover/press: `translateY(-1px)`/retorno — já no `.panel-button`; não inventar variações.
- `ANIMATION requires UX_VALUE`: animação que não comunica estado é recusada em review.

## 8. Acessibilidade — piso inegociável (a sonda mede 1–3)

1. Alvo de toque ≥ 44px no mobile (token `--panel-target`); rodapé legal e "Saiba mais" incluídos.
2. Todo controle interativo com nome acessível (texto, `aria-label` ou `title`).
3. Exatamente um `h1` por página, nomeando a TAREFA (não a marca).
4. Foco visível (`--panel-focus`); trap correto só em Overlay.
5. axe (`*.axe.jsx`) para página tocada; violações serious/critical = zero.

## 9. Densidade e formulários no desktop

Shell do painel: `lg:max-w-6xl` centrado. **Formulário de fluxo** (novo serviço/técnico):
conteúdo útil ≥ 60% da largura disponível em `lg` — o padrão atual de coluna ~520px em viewport
de 1568px é o defeito medido (achado local; SL-12). Solução preferida: etapas lado a lado ou
duas colunas de campos relacionados — **nunca** esticar campo de texto a 100% de 1100px (linha
ilegível também é defeito). Listas/tabelas: identificador NUNCA trunca enquanto houver largura
ociosa (lição do REDESIGN de /tecnicos).

## 10. Estados de página (obrigatórios por fatia)

Toda superfície tocada entrega: loading (skeleton), empty (com guia de próxima ação quando o
usuário PODE agir), error (com retry quando reexecutável), e o caminho feliz. O exemplar de empty
correto é `/aprovacoes`; o contra-exemplo medido é o dashboard R$ 0,00 sem guia (SL-11).

## 11. Prova visual (regra de fechamento de fatia)

`PROBE + CAPTURE + INTERACTION`: sonda re-executada nas superfícies tocadas (4 viewports — 360,
390, 1440, 1920) com os campos do achado zerados; capturas BEFORE/AFTER arquivadas; axe verde;
testes do painel verdes. Medição sozinha não é prova visual; olho sozinho não é prova
determinística. Página vazia nunca produz PASS (guard no capturador).
