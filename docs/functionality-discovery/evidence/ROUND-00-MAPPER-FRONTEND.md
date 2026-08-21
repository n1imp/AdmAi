# ROUND-00 — EOS-Repository-Mapper (painel / mobile)

| Campo | Valor |
|---|---|
| Rodada | 00 (bootstrap, pré-Rodada 1) |
| Agente EOS | `EOS-Repository-Mapper` (com insumo para `EOS-UX-Mobile-Accessibility`) |
| Tipo de subagente usado | `Explore` (somente leitura, busca "very thorough") |
| Data | 2026-08-05 |
| Commit-base | `30bf545` (código idêntico à tag `project-baseline-v1`) |
| Mandato | Inventário factual do painel `chaveiro-painel`: rotas, navegação por papel, páginas, componentes, camada de dados, auth do cliente, Capacitor/mobile, acessibilidade, design system, testes |
| Grau de confiança | ALTA (tudo com `arquivo:linha`) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Onde o comportamento atual puder ser reverificado no código, o código prevalece.
> O orquestrador reverificou independentemente `src/App.jsx` na íntegra e confirma a tabela de
> rotas e o achado sobre `RequirePermissao`.

---

# Inventário factual — `chaveiro-painel` (frontend)

Base: `chaveiro-painel`
Stack: React 18 + Vite 8 + React Router 6 + Tailwind 3 + axios. **Sem** react-query/SWR/Redux/Zustand. 40 páginas, ~86 arquivos-fonte.

---

## 1. Rotas

Roteador: **React Router DOM v6**, `<BrowserRouter>` em `src/main.jsx:24`; `<Routes>` em `src/App.jsx:87-343`.

| Rota | Componente | Proteção | App.jsx:linha |
|---|---|---|---|
| `/login` | `Login` | pública | 88 |
| `/trocar-senha` | `TrocarSenha` | `RequireAuth` (sem `Layout`) | 90-97 |
| `/privacidade` | `Privacidade` | pública | 99 |
| `/termos` | `Termos` | pública | 100 |
| `/cookies` | `Cookies` | pública | 101 |
| `/verificar-email` | `VerificarEmail` | pública | 103 |
| `/recuperar-senha` | `RecuperarSenha` | pública | 104 |
| `/redefinir-senha` | `RecuperarSenha` (mesmo comp.) | pública | 105 |
| `/convite/:token` | `ConviteAceitar` | pública | 106 |
| `/magic-link` | `MagicLink` | pública | 107 |
| `/` | `Home` → `Landing` (sem user) / `MeuPainel` (funcionario) / `GestorHome` (gestor) / `Dashboard` (dono/admin) | `RequireAuth` só quando logado | 109 (fn em 49-65) |
| `/servicos` | `Servicos` | `RequireAuth` | 110-119 |
| `/servicos/novo` | `NovoServico` | `RequireAuth` | 120-129 |
| `/reparticao` | `Reparticao` | `RequireAuth` | 130-139 |
| `/tecnicos` | `Tecnicos` | `RequireAuth` | 140-149 |
| `/tecnicos/novo` | `NovoTecnico` | `RequireAuth` | 150-159 |
| `/tecnicos/:id` | `PerfilTecnico` | `RequireAuth` | 160-169 |
| `/avaliacoes` | `Avaliacoes` | `RequireAuth` | 170-179 |
| `/meu-ponto` | `MeuPonto` | `RequireAuth` | 180-189 |
| `/meus-servicos` | `MeusServicos` | `RequireAuth` | 192-201 |
| `/meus-servicos/novo` | `NovoServicoFuncionario` | `RequireAuth` | 202-211 |
| `/meus-documentos` | `Documentos` | `RequireAuth` (feature-detecta flag por 404/403) | 213-222 |
| `/aprovacoes` | `Aprovacoes` | `RequireAuth` | 223-232 |
| `/materiais` | `Catalogo` | `RequireAuth` | 235-244 |
| `/estoque` | `Estoque` | `RequireAuth` | 245-254 |
| `/mais` | `Mais` | `RequireAuth` | 256-265 |
| `/ajuda` | `Ajuda` | `RequireAuth` | 266-275 |
| `/configuracao` | `Configuracao` | `RequireAuth` | 276-285 |
| `/configuracao/perfil` | `Perfil` | `RequireAuth` | 286-295 |
| `/configuracao/seguranca` | `Seguranca` | `RequireAuth` | 296-305 |
| `/configuracao/notificacoes` | `Notificacoes` | `RequireAuth` | 306-315 |
| `/configuracao/whatsapp` | `ConfiguracaoBot` | `RequireAuth` | 316-325 |
| `/configuracao/estoque` | `Navigate → /estoque` | — (redirect legado) | 327 |
| `/configuracao/catalogo` | `Navigate → /materiais` | — (redirect legado) | 328 |
| `/configuracao/usuarios` | `Usuarios` | `RequireAuth` + **`RequirePermissao modulo="usuarios"`** | 329-340 |
| `*` | `Navigate → /` | — | 342 |

**Fato relevante:** `/configuracao/usuarios` é a **única** rota com guard por permissão/papel. Todas as demais rotas internas são apenas *authenticated*; a segregação por papel acontece só na **navegação** (itens somem do menu) e no backend.

Guards: `src/components/Guards.jsx`
- `RequireAuth` (:14-27) — sem user ou token expirado → `Navigate /login`; `senhaProvisoria` prende em `/trocar-senha` (:23-25).
- `RequirePermissao` (:31-36) — dono passa direto; não-dono espera `permissoes !== null` (retorna `null` enquanto carrega, :33); sem permissão → `Navigate /configuracao`.
- Comentário explícito (:8-11): guards são **apenas UX**, autorização real no backend.

`Layout` (`App.jsx:349-384`): Sidebar (desktop) + banner offline `role="alert"` (:359-366) + `<main>` com `key={pathname}` para transição `.panel-route` (:371) + `RodapeLegal` + `BottomNav` só `<lg` (:379-381).

`PanelScope` (`App.jsx:84`) desativa o tema "panel-ui" em `/privacidade`, `/termos`, `/cookies` e na landing (`PUBLIC_SURFACES`, :75-81).

---

## 2. Navegação

**Fonte única de verdade:** `src/config/navigation.js` — manifesto por papel; consumido por `BottomNav`, `Sidebar` e `Mais`.

- `buildNavigation(ctx)` (`navigation.js:352-370`) retorna `{ primary, moreGroups, desktopGroups }`.
- Filtro por guard (`permite`, :342-347): `{sempre:true}` → sempre; `{proprio:'x'}` → `podeProprio(x)`; `{modulo,acao}` → `pode(modulo, acao ?? 'ver')`.
- `MAX_PRIMARY = 4` (:340); 5º slot da bottom nav é sempre "Mais".
- Papel desconhecido cai no manifesto de **funcionário** (fallback, :353).
- Itens sem permissão **somem** (não ficam desabilitados) — testado em `src/config/__tests__/navigation.test.js:35-42`.

### Destinos por papel

**DONO** (`navigation.js:41-146`), grupos `Visão / Gestão / Recursos / Administração`:
- Primary (mobile): `/` Painel · `/tecnicos` Equipe · `/reparticao` Relatórios (3 itens; `navigation.test.js:21`)
- Mais: `/servicos`, `/aprovacoes`, `/avaliacoes`, `/materiais`, `/estoque`, `/configuracao/usuarios`, `/configuracao`, `/ajuda`
- **Não recebe** `/meu-ponto` nem `/meus-servicos` mesmo com `podeProprio()===true` (regra explícita, :37-39; testada :24-26)

**GESTOR** (`navigation.js:148-244`), grupos `Operação / Equipe / Recursos / Acompanhamento / Conta`:
- Primary: `/`, `/aprovacoes`, `/tecnicos`, `/estoque`
- Mais: `/servicos`, `/materiais`, `/reparticao`, `/avaliacoes`, `/configuracao`, `/ajuda`

**FUNCIONARIO** (`navigation.js:246-335`), grupos `Meu trabalho / Conta`:
- Primary: `/` Início, `/meu-ponto` (guard `proprio:bater_ponto`), `/meus-servicos/novo` (guard `proprio:registrar_servico`), `/configuracao/perfil`
- Mais: `/meus-servicos`, `/meus-documentos` (guard `proprio:documentos`), `/configuracao/seguranca`, `/configuracao/notificacoes`, `/ajuda`

### Superfícies
- **BottomNav mobile** — `src/components/BottomNav.jsx`: `nav aria-label="Navegação principal"` (:19), grid dinâmico (:23), skeleton estável enquanto `permissoes === null` para não-dono (`carregando`, :11, :24-30), `aria-busy` (:20). Alvo mínimo `min-h-[54px]` (:26,:37).
- **Sidebar desktop** — `src/components/Sidebar.jsx`: `hidden lg:flex w-64 sticky` (:51), `nav aria-label="Navegação lateral"` (:67), grupos ordenados por `groupOrder` (:77), rodapé com nome + rótulo de papel (:80-90; `PAPEL_LABEL` :6, admin → "Administrador" :48). Alvo `min-h-[44px]` (:16).
- **Página "Mais"** — `src/pages/Mais.jsx`: cards por grupo a partir de `moreGroups` (:29,:48-64) + botão **Sair** (`logout`) ao final (:66-74).
- **BackHeader** — `src/components/BackHeader.jsx` (20 linhas), usado em Ajuda, Aprovacoes, Catalogo, Configuracao, ConfiguracaoBot e outras.

---

## 3. Páginas (`src/pages/`) — 40 arquivos

| Arquivo (linhas) | O que faz |
|---|---|
| `Ajuda.jsx` (241) | Tutorial/passo-a-passo estático do app (`Como usar`, conteúdo em const na :22) |
| `Aprovacoes.jsx` (181) | Fila de serviços pendentes (`GET /servicos/pendentes`), aprovar/rejeitar (`POST /servicos/:id/aprovar\|rejeitar`, :123,:136) |
| `Avaliacoes.jsx` (63) | Casca com abas → delega a `components/avaliacoes/{Cliente,Google,Solicitacao}.jsx` |
| `Catalogo.jsx` (227) | Materiais: lista `GET /materiais`, remove `DELETE /materiais/:id` (:72); modais em `CatalogoModais.jsx` |
| `CatalogoModais.jsx` (469) | Modais de material/estoque: criar, upload de imagem (`POST /materiais/upload`), editar (`PATCH /materiais/:id` :82), movimentação (:315), histórico — todos sobre `Overlay` |
| `Configuracao.jsx` (219) | Hub SaaS de configurações (conta/segurança/integrações); `PATCH /config/empresa`; cards `to` e `breve:true` |
| `ConfiguracaoBot.jsx` (391) | WhatsApp bot: status/conectar/desconectar (`/bot/whatsapp/*`), QR base64; marcado como **feature futura / "Em breve"** (:53-54) |
| `ConviteAceitar.jsx` (187) | Aceite de convite por token (`POST /convite/:token/aceitar`) |
| `Cookies.jsx` (6) | Documento legal via `PaginaLegal` + `lib/legal.js` |
| `Dashboard.jsx` (280) | Dashboard do Dono: `GET /dashboard?...`, `GET /avaliacoes`; monta `TourGuide` e `WelcomeCard` |
| `DashboardParts.jsx` (126) | Apresentacionais do dashboard: `KpiCard`, `TooltipMoeda`, `Variacao`, `CardSatisfacao` |
| `DashboardWidgets.jsx` (289) | Widgets de gráfico (recharts) + personalização reordenável/ocultável (F4d); alternativa textual dos gráficos (`sr-only`, `aria-live`) |
| `DashboardWidgetsOps.jsx` (170) | Widgets operacionais auto-suficientes (`/servicos/pendentes`, `/estoque`, `/servicos`); widget oculto não monta → não busca |
| `Documentos.jsx` (306) | Documentos do próprio funcionário (`/me/documentos`): upload data-URI (PDF/JPEG/PNG, ≤5MB), download, remoção; 404/403 → estado "Documentos indisponíveis" (:70-71) |
| `Estoque.jsx` (197) | Saldo/movimentações (`GET /estoque?periodo=`), ajuste de estoque mínimo (`PATCH /materiais/:id`) |
| `GestorHome.jsx` (325) | Home operacional do Gestor: `/gestor/indicadores`, `/servicos?limit=5`, `/avaliacoes`, presença do time |
| `Landing.jsx` (163) | Landing pública (visitante não autenticado em `/`) |
| `Login.jsx` (763) | Login (`POST /auth/login`), 2FA, OTP de telefone (`/me/telefone/otp/*`), login social via `BotoesSociais`, `RodapeLegal` |
| `MagicLink.jsx` (139) | Solicita/consome magic link (`POST /auth/magic-link`) |
| `Mais.jsx` (78) | Overflow de navegação por papel + logout |
| `MeuPainel.jsx` (433) | Home do funcionário: KPIs de `/me/metricas?periodo=`, atalhos grandes (bater ponto, registrar, meus serviços) |
| `MeuPonto.jsx` (354) | Bater ponto (`GET /ponto/hoje`, `POST /ponto/bater`), 4 etapas do dia, geolocalização best-effort (:56-57) e selfie (`CapturaSelfie`) |
| `MeusServicos.jsx` (314) | Serviços próprios (`/me/servicos`, `/me/servico-atual`), iniciar/concluir (:166,:182), filtro por status |
| `Notificacoes.jsx` (306) | Lista `/notificacoes`, marcar lida / ler-todas / excluir, toggles de preferência (`PATCH /me/notificacoes`) |
| `NovoServico.jsx` (422) | Wizard completo de serviço (`POST /servicos`) com `MaterialPicker` |
| `NovoServicoFuncionario.jsx` (298) | Versão simplificada do registro de serviço para funcionário (`POST /servicos`) |
| `NovoTecnico.jsx` (526) | Cadastro de técnico via `Wizard` multi-etapas (`POST /tecnicos`) |
| `Perfil.jsx` (170) | Dados pessoais (`GET/PATCH /me`) |
| `PerfilTecnico.jsx` (686) | Perfil do técnico: `/tecnicos/:id/perfil`, edições `PATCH /tecnicos/:id`, pagamentos (`POST /pagamentos`), `BancoHoras` |
| `Privacidade.jsx` (6) | Documento legal via `PaginaLegal` |
| `RecuperarSenha.jsx` (240) | Recuperar + redefinir senha (`/auth/recuperar-senha`, `/auth/redefinir-senha`) |
| `Reparticao.jsx` (229) | Faturamento/repartição por período custom (`/dashboard?periodo=custom&...`) + `GET /relatorio/pdf` |
| `Seguranca.jsx` (671) | Senha (`PATCH /me/senha`), 2FA setup/ativar/desativar, sessões (`/me/sessoes`), logout-all, LGPD anonimizar cliente, excluir conta |
| `Servicos.jsx` (473) | Lista de serviços com **paginação keyset (cursor)**, filtros recolhíveis, drawer ↔ tela-cheia via URL (`?detalhe=1`), `DELETE /servicos/:id` |
| `Tecnicos.jsx` (296) | Lista de técnicos (`GET /tecnicos`), edição inline/modal (`PATCH /tecnicos/:id`) |
| `Termos.jsx` (6) | Documento legal via `PaginaLegal` |
| `TrocarSenha.jsx` (232) | Tela focada de troca forçada de senha (PIN provisório), `PATCH /me/senha` |
| `Usuarios.jsx` (482) | CRUD de usuários + `MatrizPermissoes` (`/permissoes/catalogo`, `/usuarios`, `PATCH/DELETE /usuarios/:id`) |
| `VerificarEmail.jsx` (79) | Verificação de e-mail por token |

---

## 4. Componentes compartilhados (`src/components/`)

### Primitives de UI (`src/components/ui/`) — barrel em `ui/index.js`
| Arquivo | Papel |
|---|---|
| `Button.jsx` (68) | `Button` (variants primary/secondary/ghost/danger, sizes, `loading` com `aria-busy` + spinner + texto sr-only :36-38) e `IconButton` (exige `label`/`aria-label`; `console.error` em DEV :51-52) |
| `Field.jsx` (76) | Campo com label associado, `hint`/`error` via `aria-describedby` (:28-29), `aria-invalid` (:38), `role="alert"` opcional (:68), `visuallyHiddenLabel` |
| `Overlay.jsx` (255) | **Modal/dialog acessível**: portal, `role="dialog" aria-modal`, focus trap Tab/Shift+Tab (:144-174), `focusin` guard (:176-179), Escape (:147-151), `inert`+`aria-hidden` no `#root` com contador de overlays empilhados (:18-48), restauração de foco (:194-195), saída coreografada respeitando `prefers-reduced-motion` (:96-101) |
| `FeedbackState.jsx` (78) | Estado unificado: `loading / updating / empty / error / success / offline / permission-denied` com `role`+`aria-busy` semânticos (:30-36) |
| `PageHeader.jsx` (38) | Cabeçalho com eyebrow/título/subtítulo, `headingLevel` configurável, botão voltar |
| `Surface.jsx` (57) | `Surface` (elevações) e `Row` (auto-escolhe `a`/`button`/`div`, trata `disabled` :30, :49-51) |
| `PanelScope.jsx` (9) | Envelope `.panel-ui` que ativa a identidade "Aurora" |

### Componentes de domínio / infra
| Arquivo | Papel |
|---|---|
| `Guards.jsx` | `RequireAuth`, `RequirePermissao` |
| `BottomNav.jsx` / `Sidebar.jsx` | Navegação mobile/desktop |
| `Toast.jsx` (82) | `ToastProvider`/`useToast`; auto-dismiss 3,5 s (:42), `role="alert"` p/ erro senão `role="status"` (:56), portal fora do `#root` inert (:78-79) |
| `Skeleton.jsx` (63) | `SkeletonCard`, `SkeletonKpi`, `SkeletonServico`, `SkeletonLista` com `role="status"`/`aria-busy` opcional |
| `EstadoVazio.jsx` (27) | Empty state (wrapper de `FeedbackState state="empty"`) com CTA link/botão |
| `ErroBanner.jsx` (33) | Banner de erro (wrapper de `FeedbackState state="error"`) com `onRetry` + ação opcional |
| `ErrorBoundary.jsx` (47) | Class boundary; evita tela branca; ponto de plug do Sentry |
| `MaterialPicker.jsx` (289) | **Combobox ARIA APG** (`role="combobox"`, `aria-expanded/controls/activedescendant`, listbox+options, setas/Enter/Escape) |
| `MatrizPermissoes.jsx` (159) | Matriz de toggles (módulo × ação) + capacidades próprias — usado só em `Usuarios.jsx` |
| `Wizard.jsx` (115) | Wizard multi-etapas reutilizável — usado em `NovoTecnico.jsx` |
| `CapturaSelfie.jsx` (179) | Câmera frontal via `getUserMedia` → canvas → JPEG; fallback `<input capture="user">`; sempre encerra tracks |
| `BancoHoras.jsx` (227) | Banco de horas do técnico (`/tecnicos/:id/ponto`, relatório) |
| `BotoesSociais.jsx` (330) | Login social Google/Microsoft/Apple; SDKs por `<script>` sob demanda; `POST /auth/oauth/:provedor` |
| `TourGuide.jsx` (275) | Onboarding com `driver.js`, navigation-aware (navega por rota antes de destacar) |
| `WelcomeCard.jsx` (67) | Card de boas-vindas no Dashboard |
| `CookieBanner.jsx` (71) | Banner LGPD (grava `admai_cookies_consent`) — montado em `App.jsx:86` |
| `PaginaLegal.jsx` (75) | Layout de documentos legais a partir de `lib/legal.js` |
| `RodapeLegal.jsx` (26) | Links Privacidade/Termos |
| `BackHeader.jsx` (20) | Header com voltar |
| `avaliacoes/{Cliente,Google,Solicitacao,Estrelas}.jsx` | Abas da página Avaliações (WhatsApp, Google Business Profile + IA, config de solicitação) |

---

## 5. Estado / dados

**Não há biblioteca de data-fetching.** Nenhum `react-query`/`@tanstack`/`swr` em `package.json` nem no código.

- **Cliente HTTP:** `src/lib/api.js` — instância axios única.
  - `baseURL = import.meta.env.VITE_API_URL || '/api'` (:3-8), `timeout: 30000` (:9).
  - Request interceptor injeta `Bearer` de `localStorage['admai_token']` (:13-19).
  - Response interceptor (:48-75):
    - **401** → tenta `POST /auth/refresh` com `withCredentials` (cookie HttpOnly), **uma vez por request** (`_retry`, :54-55), com **deduplicação global** via `_refreshPromise` (:30-44); falhando → `limparSessao()` + `window.location.href='/login'`.
    - **403 `codigo: senha_provisoria`** → redireciona a `/trocar-senha` (:64-67).
    - **403 `codigo: email_nao_verificado`** → redireciona a `/verificar-email` (:68-72).
  - `limparSessao()` (:23-27) remove o token e dispara `window.dispatchEvent(new Event('admai:logout'))`.
  - Helpers `formatarMoeda`, `formatarData`, `formatarDataCurta` (pt-BR / America/Sao_Paulo, :93-119) e `register()` (:86-89).
- **Padrão de fetch por página:** `useState` + `useCallback` + `useEffect` com guard de "ainda ativo" (não `AbortController`). Exemplo canônico `src/pages/Servicos.jsx:236-278` (`guard`/`estaAtivo`) e :265-273 (`useEffect` com `let active = true`).
- **Erro:** string local por página + `ErroBanner`/`FeedbackState state="error"`; **retry é manual** (botão "Tentar novamente" — `ErroBanner.jsx:15`, `Servicos.jsx:410`, `MaterialPicker.jsx:247`). Não há retry automático/backoff em nenhum lugar (o único `_retry` é o do refresh 401).
- **Cache:** nenhum cache de dados em memória. Cache só de assets no service worker.
- **Offline:**
  - `src/hooks/useOffline.js` — listeners `online`/`offline`; banner global em `App.jsx:359-366`.
  - `public/sw.js` — registrado só em PROD (`main.jsx:32-36`). Navegação **network-first** com fallback ao `/` em cache (:40-51); assets same-origin **stale-while-revalidate** (:53-64); `/api`, `/uploads`, `/health`, `/metrics` **nunca** interceptados (:29-37).
  - `src/hooks/useWidgetPrefs.js` — localStorage + sync best-effort `GET/PUT /me/preferencias/dashboard`, degradando em silêncio em 404/offline (:36-76).
  - `src/hooks/useFormPersist.js` — rascunho de formulário em localStorage com debounce 300 ms.
  - `src/hooks/usePullToRefresh.js` — gesto touch (threshold 80 px).
- **Estado global:** somente `AuthContext` e `ToastContext`. Preferências: `localStorage` (`admai_token`, `admai_dashboard_widgets`, `admai_cookies_consent`).
- **Observabilidade:** `src/lib/monitoring.js` — Sentry **lazy** e só com `VITE_SENTRY_DSN`; `src/hooks/useAnalytics.js` — PostHog lazy, **gated por consentimento** (`admai_cookies_consent === 'all'`, :17-23), `autocapture:false`, `capture_pageview:false`.

---

## 6. Auth no cliente

`src/contexts/AuthContext.jsx`:
- **Token:** JWT em `localStorage['admai_token']`. Refresh token em **cookie HttpOnly** (só usado por `api.js:35`).
- `decodeJWT` (:7-14) — decodifica payload base64url sem verificar assinatura.
- `tokenExpirado()` (:17-22) — compara `payload.exp * 1000` com `Date.now()`.
- `carregarUserInicial()` (:37-47) — hidrata o usuário do token no boot; se expirado, remove o token.
- `usuarioDoPayload` (:26-35) — `{ id, nome, admin, papel (fallback: admin?'dono':'funcionario'), senhaProvisoria, empresaId }`.
- `login(token)` (:55-59) grava e decodifica; `logout()` (:61-66) limpa token + permissões + `analyticsReset()`.
- **Expiração de sessão:** no mount, `if (tokenExpirado()) logout()` (:72-74); listener de `'admai:logout'` (:79) zera o estado quando o interceptor limpa a sessão. Em `RequireAuth`, o efeito derruba a sessão e redireciona (`Guards.jsx:18-21`). **Não há timer/refresh proativo** — a renovação só ocorre reativamente no 401.
- **Permissões:** `GET /me/permissoes` quando há user e não está em senha provisória (:85-102); `null` = carregando. `pode(modulo, acao)` (:108-112) e `podeProprio(cap)` (:115-119) — dono/admin sempre `true`.
- Contexto expõe: `user, isAdmin, papel, ehFuncionario, senhaProvisoria, permissoes, pode, podeProprio, login, logout` (:123-133).
- **Redirecionamentos:** `/login` (401/sem sessão), `/trocar-senha` (senha provisória), `/verificar-email` (e-mail não verificado), `/configuracao` (sem permissão de módulo).

---

## 7. Mobile / Capacitor

`capacitor.config.json`:
```json
{ "appId": "com.admai.app", "appName": "AdmAi", "webDir": "dist",
  "server": { "androidScheme": "https" },
  "plugins": { "CapacitorHttp": { "enabled": true } } }
```

- Plugins npm instalados: **apenas** `@capacitor/core` e `@capacitor/android` (v8.4.1) + `@capacitor/cli` e `@capacitor/assets` em dev (`package.json:28-29,42-43`). **Não há** `@capacitor/camera` nem `@capacitor/geolocation`.
- Câmera e GPS usam **APIs web**: `navigator.mediaDevices.getUserMedia` (`src/components/CapturaSelfie.jsx:32-33`) e `navigator.geolocation.getCurrentPosition` (`src/pages/MeuPonto.jsx:56-57`). Permissões declaradas em `android/app/src/main/AndroidManifest.xml` (`CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) — ver `CAPACITOR.md:42-58`.
- **Nenhum `import { Capacitor }` no código-fonte** — não existe branch `isNativePlatform()`. A única diferença web × app é a **base da API**:
  - Web: `/api` (mesma origem, proxy nginx — `nginx.conf`, `vite.config.js:56-63`).
  - App: `VITE_API_URL` absoluto definido no build (`api.js:3,7`; `CAPACITOR.md:16-30`).
  - `CapacitorHttp` ativado faz as requests saírem pela camada nativa → **sem CORS** (`CAPACITOR.md:28-30`).
- PWA: `public/manifest.webmanifest`, `public/icons/*`, `public/_redirects`, meta `apple-mobile-web-app-*` em `index.html:7-9`.
- Safe areas: utilitários `.safe-area-top/.safe-area-bottom/.h-safe-area-inset-bottom` (`src/index.css:143-154`), aplicados em `App.jsx:358` e `BottomNav.jsx:21`.
- Scripts: `cap:sync`, `cap:open`, `cap:assets` (`package.json:23-25`).

---

## 8. Acessibilidade

**Sim, há testes axe.** Suíte dedicada:
- `vitest.a11y.config.js` — config **standalone** que roda só `src/**/*.axe.jsx`; script `npm run test:a11y` (`package.json:17`). Separada do `npm test` para poder ser gate não-bloqueante no CI.
- `src/test/axe.js` — usa `axe-core` direto (sem `vitest-axe`): `checarA11y()`, `violacoesRelevantes()` (filtra `serious`/`critical`), `formatarViolacoes()`. Regras `color-contrast` e `region` desligadas por limitação do jsdom (:13-16).
- Arquivos `.axe.jsx` (5): `src/components/ui/__tests__/Button.axe.jsx`, `src/pages/__tests__/Documentos.axe.jsx`, `GestorHome.axe.jsx`, `MeuPainel.axe.jsx`, `MeusServicos.axe.jsx`.

Padrões já aplicados (com arquivo):
- **Focus trap / inert / restauração de foco / Escape** — `ui/Overlay.jsx:110-197`; testes em `ui/__tests__/Overlay.test.jsx` (12 testes).
- **Combobox ARIA APG** — `components/MaterialPicker.jsx:7-11`; testes `MaterialPicker.test.jsx` ("combobox acessível (O-10)").
- **Nome acessível obrigatório** — `IconButton` e `Overlay` fazem `console.error` em DEV sem label/título (`Button.jsx:51-52`, `Overlay.jsx:201-203`).
- **Live regions** — `role="status"`/`role="alert"` em `Toast.jsx:56`, `App.jsx:361`, `FeedbackState.jsx:30-36`, `Skeleton.jsx`, `Notificacoes.jsx`, `NovoServico.jsx`, `PerfilTecnico.jsx`, `Seguranca.jsx`; `aria-live` em `DashboardWidgets.jsx`.
- **Alternativa textual de gráficos** — `sr-only` em `DashboardWidgets.jsx`, testado em `pages/__tests__/DashboardWidgets.test.jsx` (O-11).
- **`aria-busy` em navegação carregando** — `BottomNav.jsx:20`, `Sidebar.jsx:68`, `Mais.jsx:40`.
- **Erros de campo associados** — `ui/Field.jsx:26-38,62-71`.
- **Alvos de toque** — tokens `--panel-target: 44px`, `--panel-control-height: 48px`, `--panel-nav-target: 54px` (`styles/panel.css:27-29`); classes `min-h-[44px]`/`min-h-[54px]`/`min-w-11 min-h-11`.
- **Movimento reduzido** — `@media (prefers-reduced-motion: reduce)` para view transitions (`src/index.css:48-54`), desmontagem imediata do Overlay (`Overlay.jsx:96-100`), teste `ui/__tests__/Motion.test.jsx`.
- **`lang="pt-BR"`** em `index.html:2`.

Lacunas observadas: **não existe skip link** ("pular para o conteúdo") em nenhum arquivo; **não há `eslint-plugin-jsx-a11y`** (`eslint.config.js:26` só carrega `react` e `react-hooks`); `color-contrast` não é verificado automaticamente.

---

## 9. Design system

**Duas camadas convivendo:**

**(a) Tailwind 3 legado** — `tailwind.config.js`
- Fontes: `display` Saira Condensed/Oswald, `body` Sora/IBM Plex Sans, `mono` JetBrains Mono (:6-13).
- Cores: escala `dark.950→500` (grafite), `accent.300→600` (ciano `#22D3EE`), `amber.*` como **alias legado de accent** (:33-37), `success/danger/warning/muted` (:38-41).
- `boxShadow.panel` e `boxShadow.glow`, `backgroundImage.grid`, animações `shimmer/fade-in/slide-up/rise/pulse-glow` (:43-80). Sem plugins (:83).
- Classes de componente em `src/index.css:56-141`: `.card`, `.card-accent`, `.input`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-social`, `.badge`, `.skeleton`, `.kpi-value`, `.kpi-label`, `.section-label`, `.tnum`.

**(b) Tokens `--panel-*` "Aurora"** (camada nova) — `src/styles/panel.css:1-43`
- Superfícies: `--panel-canvas #0f1018`, `--panel-canvas-soft`, `--panel-surface`, `--panel-surface-raised`, `--panel-surface-hover`, `--panel-border`, `--panel-border-strong`.
- Texto: `--panel-text`, `--panel-text-soft`, `--panel-text-secondary`.
- Marca: `--panel-brand #8b5cf6` (violeta), `--panel-brand-strong`, `--panel-brand-ink`.
- Dados: `--panel-data-{blue,teal,violet,pink,orange}`; semânticas `--panel-success/warning/critical/focus`.
- Raios (`control 10px`, `surface 16px`, `elevated 24px`), alvos, motion (`fast 150ms`, `base 280ms`, `slow 340ms`) e easings, sombras.
- `src/styles/panel-primitives.css` (329 l) implementa `.panel-button[--primary|--secondary|--ghost|--danger|--small|--icon]`, `.panel-field*`, `.panel-feedback*`, `.panel-page-header*`, `.panel-row`, `.panel-surface[--raised]`, `.panel-sr-only`.
- `src/styles/panel-overlay.css` (154 l) implementa `.panel-overlay-root`, `.panel-overlay`, `__header/__title/__description/__body`.
- `src/styles/panel-rollout.css` (156 l) **remapeia** as classes Tailwind legadas (`.card`, `.bg-dark-*`, `.btn-primary`, `.border-dark-*`) para os tokens `--panel-*` **dentro de `.panel-ui`** — landing e páginas legais ficam de fora e mantêm a identidade ciano/grafite (:1-11).
- Escopo controlado por `PanelScope` (`ui/PanelScope.jsx`) via `App.jsx:84`.

**Tema:** dark-only (não há toggle claro/escuro nem `prefers-color-scheme`). Ícones: `lucide-react`. Gráficos: `recharts` (chunk próprio, `vite.config.js:47`).

---

## 10. Testes

Configs: `vite.config.js:7-36` (suíte principal, jsdom, `include: src/**/*.test.{js,jsx}`, timeouts 15 s, coverage v8 com thresholds **statements 30 / branches 31 / functions 29 / lines 29**) e `vitest.a11y.config.js` (suíte axe). Setup: `src/test/setup.js` (`asyncUtilTimeout: 5000`).

**Unit/integração (`*.test.js[x]`) — 24 arquivos, ~132 `it`:**

| Arquivo | Testes | Cobre |
|---|---|---|
| `src/config/__tests__/navigation.test.js` | 7 | `buildNavigation` por papel, MAX_PRIMARY, itens somem sem permissão, invariantes (sem duplicatas, primary ∩ more = ∅), fallback de papel desconhecido |
| `src/components/__tests__/Guards.test.jsx` | 9 | `RequireAuth` (sem user, expirado, senha provisória) e `RequirePermissao` (dono, loading, negado) |
| `src/components/__tests__/MaterialPicker.test.jsx` | 4 | Combobox acessível (O-10) |
| `src/components/__tests__/MaterialPicker.qtd.test.jsx` | 5 | Regras de quantidade |
| `src/components/__tests__/EstadoVazio.test.jsx` | 3 | Empty state + CTA |
| `src/components/ui/__tests__/Overlay.test.jsx` | 12 | Focus trap, Escape, inert, empilhamento, restauração de foco |
| `src/components/ui/__tests__/FeedbackState.test.jsx` | 7 | Estados + adapters legados (`ErroBanner`/`EstadoVazio`) |
| `src/components/ui/__tests__/Field.test.jsx` | 4 | Label/hint/erro/`aria-describedby` |
| `src/components/ui/__tests__/Button.test.jsx` | 3 | Variants, loading, IconButton |
| `src/components/ui/__tests__/Structure.test.jsx` | 5 | `Surface`, `Row`, `PageHeader` |
| `src/components/ui/__tests__/Motion.test.jsx` | 1 | Movimento reduzido no tour |
| `src/hooks/__tests__/useFormPersist.test.js` | 4 | Persistência de rascunho (F8) |
| `src/hooks/__tests__/useWidgetPrefs.test.js` | 6 | Ordem/visibilidade + sync (F4d/M5) |
| `src/lib/__tests__/api.test.js` | 5 | `formatarMoeda`, `formatarData`, `formatarDataCurta` |
| `src/lib/__tests__/senha.test.js` | 4 | `avaliarForcaSenha` |
| `src/pages/__tests__/Servicos.test.jsx` | 1 | Paginação keyset (cursor) |
| `src/pages/__tests__/Servicos.a11y.test.jsx` | 8 | Filtros recolhíveis (FI4), drawer acessível (O-02), drawer ↔ tela-cheia ↔ lista via URL (DT4) |
| `src/pages/__tests__/Dashboard.test.jsx` | 4 | Estados (F8) |
| `src/pages/__tests__/DashboardWidgets.test.jsx` | 1 | Alternativa textual dos gráficos (O-11) |
| `src/pages/__tests__/DashboardWidgetsOps.test.jsx` | 3 | Widgets ops + integridade do registro |
| `src/pages/__tests__/GestorHome.test.jsx` | 5 | Indicadores + presença (F7/M2) |
| `src/pages/__tests__/MeuPainel.test.jsx` | 4 | Desempenho por período + erro com retry (M1) |
| `src/pages/__tests__/MeusServicos.test.jsx` | 8 | Lista, filtros, iniciar/concluir |
| `src/pages/__tests__/MeuPonto.test.jsx` | 3 | Batida de ponto |
| `src/pages/__tests__/Documentos.test.jsx` | 6 | Upload/download/remoção + degradação por flag (M4) |
| `src/pages/__tests__/Aprovacoes.test.jsx` | 3 | Aprovar/rejeitar |
| `src/pages/__tests__/NovoServico.test.jsx` | 2 | Wizard (FO3) |
| `src/pages/__tests__/NovoServicoFuncionario.test.jsx` | 3 | Fluxo simplificado (FO3) |

**A11y (`*.axe.jsx`) — 5 arquivos, 6 testes:** `Button.axe.jsx` (2), `Documentos.axe.jsx`, `GestorHome.axe.jsx`, `MeuPainel.axe.jsx`, `MeusServicos.axe.jsx`.

**E2E — `e2e/run.mjs` + `e2e/README.md`:** Chrome headless via **CDP** (sem Playwright/Cypress). O harness sobe servidor HTTP próprio que serve `../dist` com SPA fallback, mocka `/api/*` deterministicamente e devolve **404 em `/sw.js`** para o service worker não interceptar os mocks. Papéis simulados por JWT falso em `localStorage`. Cobertura atual: **M1** (MeuPainel/funcionário) e **M4** (Documentos, flag on/off). Rodar: `VITE_API_URL=/api npm run build && npm run e2e`. No CI é **não-bloqueante** (`continue-on-error`). Screenshot de falha em `e2e/e2e-falha.png`.

**Não testado:** `App.jsx` (composição de rotas), `AuthContext.jsx` diretamente, `lib/api.js` interceptors (401/refresh/403), `BottomNav`/`Sidebar` renderizados, `Login.jsx` (763 linhas), `Seguranca.jsx` (671), `PerfilTecnico.jsx` (686), `Usuarios.jsx` (482), `NovoTecnico.jsx` (526), `Catalogo/CatalogoModais`, `Estoque`, `Tecnicos`, `Reparticao`, `ConfiguracaoBot`, `avaliacoes/*`, `BotoesSociais`, `TourGuide`.
