# ROUND-01 — EOS-UX-Mobile-Accessibility

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-UX-Mobile-Accessibility` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | Arquitetura de informação por papel, link direto, preservação de contexto, formulários, estados de tela, mobile-first, acessibilidade, duas camadas de design system, duplicação de componentes |
| Grau de confiança declarado | Alta na leitura estática; **nada foi renderizado em navegador** |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Relançado após o primeiro lançamento ter sido interrompido por limite de sessão.

---

# EOS-UX-Mobile-Accessibility — Rodada 1 · Frente de Descoberta Funcional (AdmAi)

**Modo:** somente leitura. Nenhum arquivo criado, alterado ou removido. Nenhum patch proposto.

---

## 1. Escopo analisado

Painel `chaveiro-painel/` (React 18 + Vite + React Router 6 + Tailwind 3). Analisei roteamento e guards, o manifesto de navegação e seus três consumidores, as 40 telas de `src/pages/`, os primitivos de `src/components/ui/`, os 4 arquivos CSS de `src/styles/`, `index.css`, `tailwind.config.js`, `index.html`, os hooks de estado (`useFormPersist`, `useOffline`, `usePullToRefresh`), o interceptor HTTP (`lib/api.js`) e a configuração da suíte axe/ESLint.

Fora de escopo (não abri em profundidade): `src/components/avaliacoes/*` (Cliente/Google/Solicitação), `MatrizPermissoes.jsx`, `CapturaSelfie.jsx`, `BancoHoras.jsx` além da tabela, `e2e/`, `android/`, backend `chaveiro-bot/`. Nada foi executado em navegador — **não há medição real de viewport, contraste computado ou leitor de tela**; tudo abaixo é leitura estática de código.

---

## 2. Arquivos consultados

| Categoria | Arquivos |
|---|---|
| Roteamento/guards | `src/App.jsx`, `src/components/Guards.jsx`, `src/contexts/AuthContext.jsx`, `src/lib/api.js` |
| Navegação | `src/config/navigation.js`, `src/components/BottomNav.jsx`, `src/components/Sidebar.jsx`, `src/pages/Mais.jsx`, `src/components/BackHeader.jsx`, `src/components/TourGuide.jsx` |
| Listas/contexto | `Servicos.jsx`, `Estoque.jsx`, `Tecnicos.jsx`, `Avaliacoes.jsx`, `Notificacoes.jsx`, `MeusServicos.jsx`, `Catalogo.jsx`, `Aprovacoes.jsx`, `Usuarios.jsx`, `Documentos.jsx`, `Reparticao.jsx`, `PerfilTecnico.jsx`, `MeuPonto.jsx` |
| Formulários | `NovoServico.jsx`, `NovoServicoFuncionario.jsx`, `NovoTecnico.jsx`, `Perfil.jsx`, `Seguranca.jsx`, `TrocarSenha.jsx`, `Login.jsx`, `components/Wizard.jsx`, `hooks/useFormPersist.js` |
| Home por papel | `Dashboard.jsx`, `GestorHome.jsx`, `MeuPainel.jsx`, `Configuracao.jsx`, `ConfiguracaoBot.jsx`, `Ajuda.jsx` |
| Design system | `components/ui/{Button,Field,FeedbackState,Overlay,PageHeader,PanelScope,Surface,index}.jsx`, `components/{EstadoVazio,ErroBanner,Skeleton,Toast}.jsx` |
| Estilos/config | `src/index.css`, `src/styles/panel.css`, `panel-primitives.css`, `panel-rollout.css`, `panel-overlay.css`, `tailwind.config.js`, `index.html`, `eslint.config.js`, `vitest.a11y.config.js`, `src/test/axe.js` |
| Docs | `docs/functionality-discovery/evidence/ROUND-00-MAPPER-FRONTEND.md` |

---

## 3. Evidências com `arquivo:linha`

### 3.1 Arquitetura de informação por papel

Manifesto: `src/config/navigation.js:41-146` (DONO), `:148-244` (GESTOR), `:246-335` (FUNCIONARIO). `MAX_PRIMARY = 4` em `:340`. `buildNavigation` em `:352-370`. Fallback para funcionário em `:353` (`POR_PAPEL[ctx?.papel] ?? FUNCIONARIO`).

Consumidores: `BottomNav.jsx:13-14` (mobile `<lg`, injeta `/mais` como 5º slot **fora do manifesto**), `Sidebar.jsx:47` (desktop `≥lg`, usa `desktopGroups`), `Mais.jsx:29` (usa `moreGroups`).

**DONO** — 11 destinos, todos sempre visíveis (`AuthContext.jsx:108-112`: dono passa em qualquer `pode()`).

| Destino | Rota | Mobile | Sidebar (grupo) | Como se chega |
|---|---|---|---|---|
| Painel | `/` | primary | Visão | tab / sidebar |
| Equipe | `/tecnicos` | primary | Gestão | tab / sidebar |
| Relatórios | `/reparticao` | primary | Visão | tab / sidebar |
| Serviços | `/servicos` | more | Gestão | Mais / sidebar |
| Aprovações | `/aprovacoes` | more | Gestão | Mais / sidebar |
| Avaliações | `/avaliacoes` | more | Visão | Mais / sidebar |
| Materiais | `/materiais` | more | Recursos | Mais / sidebar |
| Estoque | `/estoque` | more | Recursos | Mais / sidebar |
| Usuários | `/configuracao/usuarios` | more | Administração | Mais / sidebar / card em `Configuracao.jsx:70-77` |
| Configurações | `/configuracao` | more | Administração | Mais / sidebar |
| Ajuda | `/ajuda` | more | Administração | Mais / sidebar |

Bottom nav do dono tem **3 primários + "Mais" = 4 slots** — nunca atinge `MAX_PRIMARY=4` porque só 3 destinos declaram `mobile:'primary'` (`navigation.js:50,58,66`).

**GESTOR** — 10 destinos; primários exatamente 4 (`:157,166,175,184`), saturando `MAX_PRIMARY`.

| Destino | Rota | Mobile | Sidebar |
|---|---|---|---|
| Operação | `/` | primary | Operação |
| Aprovações | `/aprovacoes` | primary | Operação |
| Equipe | `/tecnicos` | primary | Equipe |
| Estoque | `/estoque` | primary | Recursos |
| Serviços | `/servicos` | more | Operação |
| Materiais | `/materiais` | more | Recursos |
| Relatórios | `/reparticao` | more | Acompanhamento |
| Avaliações | `/avaliacoes` | more | Acompanhamento |
| Configurações | `/configuracao` | more | Conta |
| Ajuda | `/ajuda` | more | Conta |

**FUNCIONÁRIO** — 9 destinos; 4 primários.

| Destino | Rota | Mobile | Guard |
|---|---|---|---|
| Início | `/` | primary | `sempre` |
| Ponto | `/meu-ponto` | primary | `proprio.bater_ponto` |
| Registrar | `/meus-servicos/novo` | primary | `proprio.registrar_servico` |
| Perfil | `/configuracao/perfil` | primary | `sempre` |
| Meus serviços | `/meus-servicos` | more | `proprio.registrar_servico` |
| Documentos | `/meus-documentos` | more | `proprio.documentos` |
| Segurança | `/configuracao/seguranca` | more | `sempre` |
| Notificações | `/configuracao/notificacoes` | more | `sempre` |
| Ajuda | `/ajuda` | more | `sempre` |

**Consequência estrutural verificada:** `/configuracao` **não está no manifesto do funcionário**, mas as três telas que ele acessa (`Perfil.jsx:82`, `Seguranca.jsx:347`, `Notificacoes.jsx:279`) usam `BackHeader` sem `para`, cujo default é `/configuracao` (`BackHeader.jsx:4`). O funcionário é despejado numa tela que sua navegação não expõe.

### 3.2 Telas alcançáveis só por link direto — e o que o usuário sem permissão vê

Guard de permissão existe em **uma única rota**: `App.jsx:329-340` (`RequirePermissao modulo="usuarios"`). Todas as outras 22 rotas autenticadas só têm `RequireAuth` (`App.jsx:110-325`).

O interceptor `api.js:48-75` trata 401 (refresh→logout), 403 com `codigo=senha_provisoria` e 403 com `codigo=email_nao_verificado`. **Um 403 puro de RBAC cai direto no `Promise.reject` da linha 73** — não há tratamento global. Cada tela decide sozinha.

| Rota | No manifesto? | Entrada in-app | Chamada | O que aparece hoje sem permissão |
|---|---|---|---|---|
| `/configuracao/whatsapp` | **Nenhum papel** | **Nenhuma.** O card WhatsApp em `Configuracao.jsx:45-53` tem `breve:true` e **sem `to`** → `Configuracao.jsx:196-198` dispara `toast('Em breve disponível')`. Única outra referência: `TourGuide.jsx:110-111`, que aponta para `a[href="/configuracao/whatsapp"]` — âncora inexistente | `ConfiguracaoBot.jsx:96` | `:105`: `status===401 ? 'Sem autorização.' : 'Erro ao conectar com o servidor.'` → **403 é rotulado como falha de rede**. Só `parear()` (`:121`) e `desconectar()` (`:140`) tratam 403 corretamente |
| `/mais` | Nenhum (injetado em `BottomNav.jsx:14`) | Só bottom nav (mobile). **No desktop não existe entrada** — mas `Estoque.jsx:101`, `Reparticao.jsx:72` e `Ajuda.jsx:195` mandam o "Voltar" para lá | — | Renderiza `moreGroups` do papel; se vazio, só o botão "Sair" (`Mais.jsx:66-74`) |
| `/servicos` | dono/gestor | `Servicos.jsx` via nav | `:247` GET `/servicos` | `:253-255` → `FeedbackState state="error" announce` "Não foi possível carregar os serviços." + botão **"Tentar novamente"** (`:404-413`) que re-dispara o mesmo 403 → laço |
| `/tecnicos` | dono/gestor | nav | `Tecnicos.jsx:223` | `:225-227` → `ErroBanner` (`:260`). Cabeçalho, contador "0 cadastrados" e **FAB "+" continuam ativos** (`:283-289`), levando a `/tecnicos/novo` |
| `/estoque` | dono/gestor | nav | `Estoque.jsx:84` | `:86-88` → `ErroBanner` (`:131`) **e simultaneamente** `EstadoVazio "Nenhum material cadastrado"` com CTA "Ver catálogo de materiais" (`:138-145`). Dois diagnósticos contraditórios na mesma tela |
| `/materiais` | dono/gestor | nav | `Catalogo.jsx:57` | `:59-61` → `ErroBanner` (`:100`) **+** `EstadoVazio "Toque em + para adicionar"` (`:107-117`) **+** FAB ativo (`:196-202`) |
| `/aprovacoes` | dono/gestor | nav | `Aprovacoes.jsx:107` | `:109-111` → `ErroBanner` (`:155`) **+** `EstadoVazio "Nenhum serviço aguardando aprovação"` (`:160-165`) |
| `/reparticao` | dono/gestor | nav | `Reparticao.jsx:36` (só ao clicar Calcular) | `:38-39` → a tela **abre normal** com `EstadoVazio "Selecione o período"` (`:219-226`); o erro só aparece depois que o usuário preenche datas e clica |
| `/meus-documentos` | só funcionário | nav do funcionário | `Documentos.jsx:65` | `:69-70` trata 404 **e** 403 igualmente → `FeedbackState "Documentos indisponíveis / Este recurso ainda não foi ativado para a sua empresa"` (`:180-185`). **Mensagem factualmente errada** quando a causa é permissão |
| `/meu-ponto` | só funcionário | nav do funcionário | `MeuPonto.jsx:78` | `:80-81` → `ErroBanner` com `err.response.data.erro` (repassa texto do backend, sem controle de UI) |
| `/meus-servicos`, `/meus-servicos/novo` | só funcionário | nav | `MeusServicos.jsx:136` | `:138-139` → `ErroBanner` + `EstadoVazio "Nenhum serviço ainda"` com CTA "Registrar serviço" simultâneos (`:219` + `:279-284`) |
| `/avaliacoes` | dono/gestor | nav | `Cliente/Google/Solicitacao` | **Não verificado** |
| `/configuracao/usuarios` | só dono | nav + card admin | `Guards.jsx:31-36` | Enquanto `permissoes === null` retorna **`null`** (`:33`) → **tela em branco, sem skeleton, sem `aria-busy`**. Ao resolver negado: `<Navigate to="/configuracao" replace />` (`:34`) → **redirect silencioso, sem nenhuma mensagem** |
| `/servicos/novo` | nenhum | `Servicos.jsx:337` e `:422` | POST `/servicos` | Erro só no submit: `toast` (`NovoServico.jsx:170`) |
| `/tecnicos/novo` | nenhum | `Tecnicos.jsx:272,283` | POST `/tecnicos` | `toast` (`NovoTecnico.jsx:144`) |
| `/tecnicos/:id` | nenhum | `Tecnicos.jsx:202` | `PerfilTecnico.jsx` | `:161-162` → `ErroBanner` |
| `/configuracao/perfil`\|`/seguranca`\|`/notificacoes` | só funcionário | cards em `Configuracao.jsx:17,25,32` | — | escopo próprio, sem 403 esperado |
| `/trocar-senha` | nenhum | `Guards.jsx:23-25`, `Login.jsx:154`, `api.js:64-67` | — | tela focada sem Layout |

**O estado `permission-denied` existe e nunca é usado.** Definido em `FeedbackState.jsx:16-19` (título "Acesso não permitido"), ícone `LockKeyhole` em `:27`, estilizado em `panel-primitives.css:299-302`. Busca em toda `src/`: zero ocorrências fora da própria definição. Idem `offline`, `loading`, `updating`, `success` — só `error` e `empty` são consumidos.

### 3.3 Preservação de contexto por tela

| Tela | Filtro/busca/página | Onde vive | Perde no refresh (F5)? | Perde no "Voltar"? |
|---|---|---|---|---|
| `Servicos.jsx` | busca por técnico (`:222`), endereço (`:223`), local (`:221`), painel aberto (`:224`), cursor de paginação (`:216`) | **todos em `useState`** | **Sim, todos.** Volta a `Todos`/vazio e página 1 | Detalhe do serviço **sim** vive na URL (`:229-230`, `?servico=&detalhe=1`); back reverte lista←drawer←página (`:300-313`). Mas os filtros não |
| `Estoque.jsx` | período 7/30/90 (`:74`) | `useState` | Sim → volta a 30d | n/a (sem sub-estados na URL) |
| `Tecnicos.jsx` | nenhum filtro | — | — | — |
| `Avaliacoes.jsx` | aba cliente/google/solicitação (`:16`) | `useState` | Sim → volta a `cliente` | **Sim.** `navigate(-1)` (`:23`) sai da tela inteira; trocar de aba não empilha histórico |
| `Notificacoes.jsx` | aba avisos/preferências (`:275`) | `useState` | Sim → volta a `avisos` | Sim |
| `MeusServicos.jsx` | status | **URL** (`:111,119,126`) — `setSearchParams(..., { replace: true })` | **Não** (sobrevive ao F5) | **Sim para o filtro**: `replace:true` não cria entrada; o back sai da tela |
| `Catalogo.jsx` | busca por nome (`:50`), modal aberto (`:51`) | `useState` | Sim | Sim; modal aberto não é rota → back fecha a tela inteira, não o modal |
| `Aprovacoes.jsx` | nenhum filtro | — | — | — |
| `Dashboard.jsx` | período + datas custom (`:38-40`) | `useState` | Sim | Sim |
| `PerfilTecnico.jsx` | aba, período, início/fim (`:134-143`) | `useState` | Sim | Sim |
| `Reparticao.jsx` | datas + resultado (`:25-27`) | `useState` | Sim — perde inclusive o cálculo feito | Sim |
| `Usuarios.jsx` | modal (`:313`) | `useState` | Sim | Sim |
| `Ajuda.jsx` | acordeão aberto (`:191`) | `useState` | Sim | Sim |

Agravante transversal: `App.jsx:371` usa `key={pathname}`. Qualquer mudança de pathname **desmonta e remonta a árvore inteira** da rota. Isso é intencional para a animação (`panel.css:130-132`), mas significa que voltar de `/servicos/novo` para `/servicos` refaz o fetch e zera todos os `useState` — inclusive scroll. Mudanças só de query string (`?servico=`) não alteram `pathname` e portanto não remontam — é por isso que o drawer de `Servicos` preserva a lista (comentário em `Servicos.jsx:228-230`).

### 3.4 Formulários

| Form | Quando valida | Como mostra erro | Bloqueia avanço | Rascunho | Botão no envio | Duplo clique |
|---|---|---|---|---|---|---|
| `NovoServico.jsx` | **submit por etapa** (`:100-102`, `:109-140`); limpa o erro do campo no `onChange` (`:73,78`) | inline via `Field error` + `announceError` → `<p role="alert">` (`Field.jsx:68`) e foco programático no 1º inválido (`:94`) | **Sim** — `avancar()` só incrementa se `validarPasso` passar (`:101`) | **Sim**, `useFormPersist('admai_novo_servico')` (`:42`), debounce 300 ms (`useFormPersist.js:14-19`); limpo só após sucesso (`:162`) | `Button loading={enviando}` → `disabled` (`Button.jsx:31`) + `aria-busy` (`:32`) | **Protegido** pelo `disabled` do `loading` |
| `NovoServicoFuncionario.jsx` | idem (`:52-63`, `:74-90`) | idem (`:195,213`) | **Sim** (`:66`) | **Sim**, `'admai_novo_servico_func'` (`:33`) | idem (`:289`) | protegido |
| `NovoTecnico.jsx` | **só habilitação de botão**, sem mensagem: `podeAvancar` (`:100-104`) devolve boolean e o `Wizard` apenas desabilita "Próximo" (`Wizard.jsx:98`) | **Nenhuma mensagem inline em lugar nenhum.** Erro de rede vira `toast` (`:144`) | Sim, por botão desabilitado — **sem explicar por quê** | **Não.** `useState` puro (`:59-81`); sair da tela perde tudo, incluindo a foto em base64 | `Wizard` desabilita ambos os botões com `concluindo` (`:89,98`) | protegido |
| `Perfil.jsx` | **submit** (`:60-63`) | **`toast`** ("Nome deve ter ao menos 2 caracteres") — some em 3,5 s (`Toast.jsx:42`), não fica junto ao campo | n/a (form único) | Não | `disabled={salvando \|\| !alterado}` (`:162`); rótulo muda "Salvando…"/"Tudo salvo" (`:163`) | protegido |
| `Seguranca.jsx` (senha) | **change** para o medidor (`:190`) e coincidência (`:384-386`); **submit** para o resto (`:193-202`) | mistura: `<p className="text-danger">` inline para senhas divergentes (`:385`), `toast` para "senha fraca" (`:201`) | n/a | Não | `disabled={salvando \|\| !podeTrocar}` (`:387`) | protegido |
| `Seguranca.jsx` (2FA / exclusão) | comprimento do código (`:241,266,577,660`) | `<p className="text-danger">` inline (`:572,602,656`) | n/a | Não | `disabled` durante ação (`:577,608,624,659`) | protegido |
| `TrocarSenha.jsx` | **change** (medidor `:40-42`, coincidência `:200-202`) + **submit** (`:45-61`) | banner único `<p className="text-danger …">` (`:205-209`) — **não é `role="alert"`**, não é anunciado | n/a | Não | `disabled={carregando \|\| !podeEnviar}` (`:211`) | protegido |
| `Login.jsx` | **submit** (`:65-68`, `:164-174`, `:112-115`, `:207-210`) | `<BannerErro>` (`:749-755`) — **`<p>` sem `role="alert"`**, não anunciado | Sim nos passos 2FA/OTP: `disabled` até 6 dígitos (`:378,490`) | Não | `disabled={carregando}` (`:686`) | protegido |

Detalhes relevantes:
- `NovoServico.jsx:220-222` e `NovoServicoFuncionario.jsx:156-157` usam `noValidate` deliberadamente, para a validação custom rodar antes do balão nativo. Coerente.
- `NovoServico.jsx:124-140` barra o submit quando um material do catálogo está sem quantidade — mas o aviso é **`toast`** e o usuário é jogado de volta ao passo 1 (`:138`), enquanto o `MaterialPicker` está no passo 2 (`:312-321`). Salto de contexto errado.
- Rascunho de `NovoServico` **nunca expira**: `useFormPersist` grava indefinidamente em `localStorage` e só limpa em `clearForm()` após sucesso (`:162`). Não há TTL nem indicação visual de "rascunho recuperado".
- `Login.jsx:188` grava `admai_token` direto no `localStorage` antes do OTP, fora do `AuthContext`.

### 3.5 Estados de tela — inventário

| Tela | Carregando | Vazio | Erro | Offline | Sem permissão |
|---|---|---|---|---|---|
| `Servicos.jsx` | `SkeletonLista` `:415` | `FeedbackState empty` `:417-426` | `FeedbackState error announce` `:404-413` | herdado do Layout | — |
| `GestorHome.jsx` | `SkeletonKpi`/`SkeletonLista` `:150,225,290` | `FeedbackState empty` `:233,292` | `FeedbackState error compact` `:227,288` | — | — |
| `Dashboard.jsx` | `SkeletonKpi` `:229` | — | `ErroBanner` `:198` | — | — |
| `MeuPainel.jsx` | `SkeletonKpi` `:220,317` | `EstadoVazio` `:361` | `ErroBanner` `:199` | — | — |
| `Tecnicos.jsx` | `SkeletonLista` `:265` | `EstadoVazio` `:269-273` | `ErroBanner` `:260` | — | — |
| `Estoque.jsx` | `SkeletonLista` `:136` | `EstadoVazio` `:140-144` | `ErroBanner` `:131` **junto com o vazio** | — | — |
| `Catalogo.jsx` | `SkeletonLista` `:105` | `EstadoVazio` `:109-116` | `ErroBanner` `:100` **junto com o vazio** | — | — |
| `Aprovacoes.jsx` | `SkeletonLista` `:159` | `EstadoVazio` `:161-164` | `ErroBanner` `:155` **junto com o vazio** | — | — |
| `MeusServicos.jsx` | `SkeletonLista` `:278` | `EstadoVazio` ×2 `:280,286` | `ErroBanner` `:219` **junto com o vazio** | — | — |
| `Usuarios.jsx` | `SkeletonLista` `:373` | `EstadoVazio` `:378` | `ErroBanner` `:368` | — | `Guards.jsx:33` → `null` (branco) |
| `Documentos.jsx` | `SkeletonLista` `:176` | `EstadoVazio` `:236` | `ErroBanner` `:172` | — | `FeedbackState empty` disfarçado de "recurso não ativado" `:180-185` |
| `Notificacoes.jsx` (avisos) | `SkeletonLista` `:139` | `EstadoVazio` `:144` | **`toast` apenas** `:91` — some em 3,5 s, sem retry | — | — |
| `Notificacoes.jsx` (prefs) | `SkeletonLista` `:246` | — | **`div role="alert"` à mão** `:230-240` (card vermelho + "Tentar de novo") | — | — |
| `Seguranca.jsx` | `Loader2` inline `:426-429` (só sessões) | texto "Sessão atual" `:430-434` | **`div role="alert"` à mão** `:350-357` | — | — |
| `Configuracao.jsx` | nenhum — `ativo===null` mantém switch desabilitado `:180` | — | **texto dentro do subtítulo do card** `:175-177` | — | — |
| `ConfiguracaoBot.jsx` | `:227` (não verificado o conteúdo) | — | **`div` custom** `:220-224`, sem `role` | — | 403 confundido com erro de rede `:105` |
| `Reparticao.jsx` | `SkeletonLista` `:112` | `EstadoVazio` ×2 `:154,221` | `ErroBanner` `:109` | — | — |
| `PerfilTecnico.jsx` | `SkeletonKpi` + `role="status"` `:233-242` | `EstadoVazio` `:641` | `ErroBanner` `:231` | — | — |
| `MeuPonto.jsx` | `SkeletonLista` `:158` | — | `ErroBanner` `:155` | — | — |
| `Avaliacoes.jsx` | **nada no shell** | **nada** | **nada** | — | — |
| `Ajuda.jsx` | estático | n/a | n/a | — | — |

Offline: existe **um único tratamento**, a faixa global `App.jsx:359-366` (`role="alert"`, "Sem conexão — alguns dados podem estar desatualizados"), alimentada por `useOffline` (`hooks/useOffline.js`). Nenhuma tela tem estado offline próprio; `FeedbackState state="offline"` nunca é usado.

Inconsistências reais deste inventário:
1. **Erro + vazio simultâneos** em 5 telas (`Estoque`, `Catalogo`, `Aprovacoes`, `MeusServicos`, e `Catalogo` ainda mantém o FAB ativo). A condicional de erro é irmã, não excludente da condicional de vazio.
2. **Três dialetos de erro**: `ErroBanner` (10 telas), `FeedbackState state="error"` direto (`Servicos`, `GestorHome`, `DashboardWidgetsOps`), e `<div role="alert">` escrito à mão (`Notificacoes.jsx:233`, `Seguranca.jsx:352`, `ConfiguracaoBot.jsx:221`). Só `Servicos.jsx:405` usa `announce`.
3. **`Notificacoes` (aba Avisos) não tem estado de erro**: `:91` só dispara `toast`; ao falhar, `avisos` fica `[]` e a tela mostra `EstadoVazio "Nenhum aviso"` — **mente sobre o estado**. A aba Preferências tem comentário explícito (`:207-209`) reconhecendo esse mesmo bug e já corrigido lá, mas a correção não foi replicada na aba irmã do mesmo arquivo.
4. `Avaliacoes.jsx` é o único shell de tela grande **sem nenhum dos três estados** — delega inteiramente aos filhos.

### 3.6 Mobile-first concreto

**Viewport / teclado virtual.** `index.html:5`: `content="width=device-width, initial-scale=1.0"` — **sem `interactive-widget=resizes-content`**. No Chrome Android o default é `resizes-visual`, então `100dvh` **não encolhe** quando o teclado abre. O `BottomNav` é `fixed bottom-0` (`BottomNav.jsx:21`) e fica **por baixo do teclado**; formulários longos (`NovoTecnico`, `Seguranca`) empurram o botão de submit para fora da área visível sem que o layout compense.

**Safe areas.** Definidas em `index.css:143-153` (`safe-area-top`, `safe-area-bottom`, `h-safe-area-inset-bottom`) e aplicadas em `App.jsx:358` (top) e `BottomNav.jsx:21` (bottom). O `Overlay` também trata (`panel-overlay.css:7`). `panel.css:100-102` define `.pb-safe` — **nunca usado** em nenhum `.jsx`. Os três FABs (`Tecnicos.jsx:286`, `Catalogo.jsx:199`, `Usuarios.jsx:465`) usam `bottom-24` fixo (96 px), não `env(safe-area-inset-bottom)`.

**Largura mínima suportada de fato.** Não há nenhum `min-width` global. O ponto de ruptura mais estreito que localizei:

| Local | Construção | Risco a 360 px |
|---|---|---|
| `Tecnicos.jsx:170` | `grid grid-cols-4 gap-2` com 4 valores monetários `formatarMoeda` em `text-sm font-bold` | ~68 px por célula para strings tipo `R$ 1.234,56` → quebra/estouro. **O mais crítico** |
| `Reparticao.jsx:162,172,191` | `grid-cols-[1fr_auto_auto_auto]` — 3 colunas dimensionadas por conteúdo monetário; a coluna `1fr` (nome do técnico) **não tem `min-w-0`** | nome longo força overflow horizontal da linha inteira |
| `Servicos.jsx:135` | `grid-cols-3` de `ValorBox` dentro do `Overlay` (padding acumulado de `panel-overlay-root` + `panel-overlay__body`) | ~96 px por caixa, no limite |
| `MeuPainel.jsx:316,327`, `Usuarios.jsx:228`, `PerfilTecnico.jsx:428` | `grid-cols-3` de KPIs | idem |
| `NovoServico.jsx:327`, `NovoServicoFuncionario.jsx:203` | `grid-cols-2` de campos monetários; `panel-field__control` tem `.875rem` de padding lateral (`panel-primitives.css:118`) | rótulo "Valor cobrado (R$)" quebra em 2 linhas |
| `BancoHoras.jsx:178` | `<table className="w-full text-xs min-w-[520px]">` dentro de `overflow-x-auto` (`:174`) | **único caso contido corretamente** — rolagem horizontal intencional |
| `MeusServicos.jsx:254` | `overflow-x-auto scrollbar-hide` com 4 chips de status | contido, mas `scrollbar-hide` (`panel.css:104-110`) **remove qualquer affordance visual** de que há mais conteúdo |

Não há um único `@media` de largura customizado em `src/styles/` além de `panel-primitives.css:325` (`min-width: 48rem`) e `panel-overlay.css:101` (idem). Toda a responsividade é via prefixos Tailwind `sm:`/`lg:`/`xl:`. **Conclusão: a largura mínima suportada nunca foi declarada nem testada; empiricamente o layout começa a comprimir mal abaixo de ~390 px nos grids de 3-4 colunas monetárias.**

**Alvos de toque abaixo de 44 px.** O token existe: `--panel-target: 44px` (`panel.css:27`). Mas ele só é aplicado a `.panel-button*` (`panel-primitives.css:75-86`) e às classes `.btn-*` (`panel.css:75-77`). **Todo botão escrito à mão passa por baixo.** Lista verificada:

| Arquivo:linha | Elemento | Tamanho |
|---|---|---|
| `BackHeader.jsx:8-14` | botão Voltar — **presente em 13 telas** | 36×36 |
| `Avaliacoes.jsx:22-28` | botão Voltar | 36×36 |
| `Tecnicos.jsx:149-155` / `:156-166` | editar / ativar-desativar técnico | 36×36 |
| `Catalogo.jsx:142-148` / `:149-156` | editar / remover material | 36×36 |
| `Catalogo.jsx:161-188` | Entrada / Saída / Ajuste / Histórico (`py-1.5`) | ~30 px de altura; o de histórico tem `w-9` = 36 px |
| `Documentos.jsx:277-288` / `:289-296` | baixar / remover documento | 36×36 |
| `Usuarios.jsx:436` / `:448` | ativar / excluir conta | 36×36 |
| `Dashboard.jsx:127`, `MeuPainel.jsx:193` | atualizar | 36×36 |
| `Notificacoes.jsx:182-188` | remover aviso | 32×32 |
| `Notificacoes.jsx:65-78`, `Configuracao.jsx:114-128`, `Seguranca.jsx:406-417` | switches | 48×28 |
| `Notificacoes.jsx:287-298` | abas Avisos/Preferências (`px-4 py-1.5`) | ~30 px de altura |
| `Avaliacoes.jsx:42-53` | sub-abas (`px-3 py-2.5`) | ~40 px |
| `Estoque.jsx:106-117` | 7d/30d/90d (`px-4 py-2`) | ~38 px |
| `Servicos.jsx:384-395`, `MeusServicos.jsx:259-271` | chips de filtro (`px-3 py-1.5`) | ~30 px |
| `Servicos.jsx:354-363` | toggle "Filtros" (texto puro, sem padding) | ~20 px |
| `Servicos.jsx:186-192` | "Remover serviço" (texto puro) | ~20 px |
| `Aprovacoes.jsx:77-90` | "Sim, rejeitar" / "Cancelar" (`text-xs`, sem padding) | ~16 px |
| `Notificacoes.jsx:150-157` | "Marcar todas como lidas" (`text-xs`, sem padding) | ~16 px |
| `Login.jsx:667-674`, `TrocarSenha.jsx:131-137`, `Seguranca.jsx:85-91` | olho mostrar/ocultar senha (ícone absoluto, sem caixa) | ~18 px |

Conformes: `BottomNav.jsx:26,37` (`min-h-[54px]`), `Sidebar.jsx:16` (`min-h-[44px]`), `Toast.jsx:66` (`min-w-11 min-h-11`), `Mais.jsx:12,68` (`min-h-[56px]`), FABs 56×56.

**Orientação landscape:** zero ocorrências de `orientation`, `landscape` ou `@media (orientation:…)` em toda a base. Não há tratamento algum. O `BottomNav` fixo + `min-h-dvh` em landscape de celular (~360 px de altura) deixa muito pouca área útil para as telas com header alto (`px-4 pt-6 pb-3` + `text-3xl`).

**Pull-to-refresh:** `index.css:9` desliga o nativo com `overscroll-behavior: none` no `html`. O substituto `usePullToRefresh` existe (`hooks/usePullToRefresh.js`) mas é usado em **uma única tela**: `Dashboard.jsx:96`. As outras ~24 telas ficaram sem nenhuma forma de gesto de atualizar.

### 3.7 Acessibilidade transversal

**Landmarks.** `<main>` só em `App.jsx:368`; `<aside>` + `<nav aria-label="Navegação lateral">` em `Sidebar.jsx:51,66-68`; `<nav aria-label="Navegação principal">` em `BottomNav.jsx:18-21`. `PageHeader` emite `<header>` (`PageHeader.jsx:20`), aninhado dentro do `<main>` — não vira landmark `banner`. **Não há skip link** em lugar nenhum (confirmado por busca). Em mobile o `<main>` vem antes do `<nav>` no DOM, o que é bom; no desktop o `<aside>` vem primeiro (`App.jsx:355`), e sem skip link o usuário de teclado percorre até ~12 links de sidebar antes de chegar ao conteúdo, **em toda navegação** (a árvore remonta por `key={pathname}`, `App.jsx:371`).

**Hierarquia de headings.** Todas as 25 telas autenticadas têm exatamente um `h1` — via `BackHeader.jsx:15` (13 telas), via `PageHeader` `headingLevel=1` (`PageHeader.jsx:14,29`; usado em `Servicos.jsx:332` e `GestorHome.jsx:124`), ou via `<h1>` inline (`Tecnicos.jsx:252`, `MeusServicos.jsx:201`, `Documentos.jsx:164`, `Dashboard.jsx:119`, `MeuPainel.jsx:184`, `Mais.jsx:37`, `Avaliacoes.jsx:33`).

Violação confirmada: **`Login.jsx`** tem `<h2>` na vitrine desktop (`:277`) que aparece **antes** do `<h1>` do formulário (`:514`) na ordem do DOM. Salto h2→h1.

Inconsistência: rótulos de seção são `<h2 className="section-label">` em `Reparticao.jsx:121,157`, `PerfilTecnico.jsx:425,579,636`, `GestorHome.jsx:213,279`, `DashboardWidgets.jsx:28,83,134`, `BancoHoras.jsx:175` — mas `<p className="section-label">` em `Estoque`, `Catalogo`, `Notificacoes`, `Configuracao.jsx:167,208`, `Mais.jsx:34,50`, `Seguranca.jsx:361,395,423`, `Tecnicos.jsx:249`, `MeusServicos.jsx:198`. A mesma classe visual representa dois papéis semânticos diferentes.

`Overlay` usa `<h2>` para o título do diálogo (`Overlay.jsx:233`) — correto dentro do escopo do dialog.

**Foco visível.** `panel.css:69-73` define `:focus-visible` com `outline: 3px solid var(--panel-focus)` (`#fde68a`, `panel.css:23`) + `box-shadow`, aplicado a `button, a, input, textarea, select, [tabindex]` — mas **só dentro de `.panel-ui`**. `PanelScope.jsx:2` desativa o escopo quando `active=false`, e `App.jsx:75,81` desliga em `/privacidade`, `/termos`, `/cookies` e na landing. **Nessas 4 superfícies públicas não há estilo de foco algum** além do default do navegador, que Tailwind não reseta globalmente (`index.css:72-77` só faz `focus:outline-none` no `.input`, substituindo por `ring`).

**Navegação por teclado em componentes custom.**
- `Overlay.jsx:144-179`: focus trap completo, Escape, `focusin` guard, `inert`+`aria-hidden` no `#root` (`:21-34`), restauração de foco (`:194-195`), suporte a múltiplos overlays empilhados (`:141-142`). **Sólido.**
- `MaterialPicker.jsx`: combobox ARIA (verificado pela existência de testes dedicados `__tests__/MaterialPicker.test.jsx` e `.qtd.test.jsx`) — não reauditei linha a linha.
- `Servicos.jsx:319-325`: Escape no painel de filtros devolve o foco à busca. Bom padrão, **isolado** — nenhum outro painel expansível faz isso.
- `Ajuda.jsx:158-161`: acordeão tem `aria-expanded` mas **sem `aria-controls`**; o conteúdo é desmontado (`:177`), o que é aceitável.
- `Avaliacoes.jsx:41-53` e `Notificacoes.jsx:283-298`: abas implementadas como `<button>` soltos, **sem `role="tablist"`/`role="tab"`/`aria-selected`/setas**. Não há relação semântica entre o botão e o painel.
- Switches: `Configuracao.jsx:118-121` e `Seguranca.jsx:409-411` têm `role="switch"` + `aria-checked`; **`Notificacoes.jsx:66-72` não tem nenhum dos dois** — são 4 `<button aria-label="Alternar">` idênticos, indistinguíveis no leitor de tela.
- `Wizard.jsx`: barra de progresso é `<div>` decorativa (`:60-67`) sem `aria-current`/`aria-label`; o texto "Etapa X de Y" (`:73-75`) não é live region. Compare com `NovoServico.jsx:197-218`, que usa `<ol aria-label="Progresso do cadastro">` + `aria-current="step"` — **dois wizards, dois níveis de semântica**.

**`aria-live`.** Busca completa: uma única região explícita, `DashboardWidgets.jsx:284` (`<p className="sr-only" role="status" aria-live="polite">`). Todo o resto é implícito via `role="alert"`/`role="status"` (`Toast.jsx:56`, `App.jsx:361`, `FeedbackState.jsx:30-36`, `Skeleton.jsx:4,16,34,52`, `Field.jsx:68`, `Notificacoes.jsx:233`, `Seguranca.jsx:352`, `NovoServico.jsx:261`, `PerfilTecnico.jsx:235`). Os banners de erro de `Login.jsx:749-755` e `TrocarSenha.jsx:205-209` **não têm role** — falha de login não é anunciada.

**Textos alternativos.** 10 `<img>` com `alt`, todas com valor: `Servicos.jsx:176` ("Foto de evidência do serviço"), `Seguranca.jsx:543` ("QR code 2FA"), `ConfiguracaoBot.jsx:254` ("QR Code WhatsApp"), `CapturaSelfie.jsx:121`, `Catalogo.jsx:38`, `NovoTecnico.jsx:387`, `CatalogoModais.jsx:132`. Redundância: `Tecnicos.jsx:101` e `MeuPainel.jsx:172`/`PerfilTecnico.jsx:252` usam `alt={nome}` em avatares que ficam ao lado do nome em texto — dupla leitura. Ícones `lucide` recebem `aria-hidden="true"` de forma **inconsistente**: presente em `BottomNav.jsx:47`, `Sidebar.jsx:23,54`, `Mais.jsx:15,21,71`, `Toast.jsx:12-14,68`; ausente na maioria das páginas (`Tecnicos.jsx:154,165`, `Catalogo.jsx:147,154,166,173,180,187`, `Notificacoes.jsx:170,186`, etc.). Como esses ícones estão dentro de `<button>` sem texto e sem `aria-label` (ex.: `Tecnicos.jsx:149-155` usa só `title=`), **o nome acessível depende de `title`** — que o axe aceita, mas que não aparece em toque.

**Contraste declarado nos tokens.** Dois sistemas coexistem:
- Tailwind (`tailwind.config.js:39-72`): acento **ciano** `#22D3EE`, `muted #9AA3B2`, `dark-500 #333A45`, `success #34D399`, `danger #F87171`, `warning #FBBF24`.
- Panel (`panel.css:2-46`): acento **violeta** `--panel-brand #8b5cf6` / `--panel-brand-strong #c4b5fd`, `--panel-text-secondary #aeb4c8`, `--panel-success #6ee7b7`, `--panel-warning #fcd34d`, `--panel-critical #fda4af`, `--panel-focus #fde68a`.

`panel-rollout.css:107-111` documenta uma decisão de contraste explícita: `.text-accent-400` é remapeado para `--panel-brand-strong` porque `#8b5cf6` "é sub-AA para texto normal". `panel.css:116-123` remapeia `.text-dark-500`/`.text-dark-600` para `--panel-text-secondary` — correção de contraste real. **Mas `success`/`danger`/`warning` do Tailwind não são remapeados**: `panel-rollout.css` não os cobre. Resultado: dentro do painel, um texto `text-success` usa `#34D399` (Tailwind) enquanto um `FeedbackState state="success"` usaria `--panel-success #6ee7b7` — **dois verdes semânticos diferentes na mesma tela**.

**Verificação automatizada:** `src/test/axe.js:14-17` desliga `color-contrast` e `region`. `vitest.a11y.config.js:12` roda **só** `src/**/*.axe.jsx` — são 5 arquivos (`Documentos`, `GestorHome`, `MeuPainel`, `MeusServicos`, `Button`). `src/test/axe.js:35` filtra só `serious`/`critical`. Não há `eslint-plugin-jsx-a11y` (`eslint.config.js:34-36` lista só `react-hooks` e `react`). **Nenhum contraste é verificado por máquina em lugar nenhum.**

### 3.8 Duas camadas de design system

**Qual é a regra hoje para uma tela nova escolher entre `.panel-*` e Tailwind legado: não existe.** Busquei em `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md`, `docs/` — nenhum documento define o critério. A única prosa normativa está em comentários de código: `panel-rollout.css:1-11` diz que o remapeamento faz "a migração página a página para as primitives passar a ser refinamento, não pré-requisito visual" — ou seja, declara explicitamente que **a escolha é opcional**.

Mecânica: `PanelScope.jsx:5` envolve tudo em `.panel-ui`; `panel-rollout.css` remapeia `.card`, `.bg-dark-*`, `.btn-primary`, `.btn-ghost`, `.input`, `.badge`, `.skeleton`, `.text-accent-*` para os tokens `--panel-*` **por especificidade** (`.panel-ui .x` > `.x`), sem `!important`.

**Telas 100% no legado** (zero import de `components/ui`, zero classe `panel-*`):

`Ajuda.jsx`, `Aprovacoes.jsx`, `Avaliacoes.jsx`, `Catalogo.jsx`, `Configuracao.jsx`, `ConfiguracaoBot.jsx`, `Dashboard.jsx`, `DashboardParts.jsx`, `DashboardWidgets.jsx`, `Mais.jsx`, `MeuPainel.jsx`, `MeusServicos.jsx`, `Notificacoes.jsx`, `Perfil.jsx`, `Reparticao.jsx`, `TrocarSenha.jsx`, `Login.jsx`, `Landing.jsx`, `MagicLink.jsx`, `RecuperarSenha.jsx`, `ConviteAceitar.jsx`, `VerificarEmail.jsx` — **22 de 40**.

(Nota: `Aprovacoes`, `MeusServicos`, `Notificacoes`, `Reparticao` etc. importam `EstadoVazio`/`ErroBanner`, que **internamente** renderizam `FeedbackState`. Ou seja, tocam o novo DS por transitividade, sem saber.)

**Telas que misturam as duas camadas — exemplos reais:**

| Tela | Novo | Legado, no mesmo arquivo |
|---|---|---|
| `NovoServico.jsx` | `Field`, `Button` (`:8`), `panel-field` `:312-321`, `panel-surface` `:385` | `card-accent` `:360`, `divide-dark-600` `:387`, `BackHeader` `:193` |
| `Seguranca.jsx` | `Overlay` (`:21,120`) | 18 usos de `.card`/`.input`/`.btn-primary`/`.btn-danger`; switch escrito à mão `:406-417` |
| `Estoque.jsx` | `Overlay` (`:9,42`) | `.input` `:51`, `.btn-ghost`/`.btn-primary` `:61,64`, `.card` `:151` |
| `Tecnicos.jsx` | `Overlay` (`:9,47`) | `.input` `:55,68`, `.btn-ghost`/`.btn-primary` `:79,82`, `.card` `:96` |
| `NovoTecnico.jsx` | `Overlay` (`:22,442`) | 16 usos legados; `Campo` local `:40-50` reimplementando `Field`; `.btn-primary` `:508` |
| `PerfilTecnico.jsx` | `SkeletonKpi`, `EstadoVazio`, `ErroBanner` | 20 usos legados |
| `Servicos.jsx` | `Overlay`, `Field`, `Button`, `Surface`, `Row`, `PageHeader`, `FeedbackState` (`:15-23`) | `.badge` `:46,50,115`, `.kpi-label` `:77`, `.section-label` `:121`, `bg-dark-700` `:73` |
| `Documentos.jsx` | `FeedbackState` `:15` | `.card` `:190,243`, `.input` `:197`, botão inline com 12 utilitários `:220` |

`Servicos.jsx` é o caso mais instrutivo: é a tela mais migrada do painel e **ainda assim** mistura primitives com `.badge`/`.kpi-label`/`bg-dark-700`.

### 3.9 Duplicação de componentes

| Duplicação | Implementação A | Implementação B | Implementação C |
|---|---|---|---|
| **Botão** | `Button`/`IconButton` (`ui/Button.jsx:7,45`) → `.panel-button` | `.btn-primary`/`.btn-ghost`/`.btn-danger`/`.btn-secondary` (`index.css:80-102`, `panel.css:79-98`) — `Perfil.jsx:162`, `Seguranca.jsx:387,468,499,525,578,624,662`, `TrocarSenha.jsx:211`, `Login.jsx:686`, `Estoque.jsx:61,64`, `Tecnicos.jsx:79,82`, `Reparticao.jsx:101,209`, `NovoTecnico.jsx:508`, `Wizard.jsx:90,99`, `Ajuda.jsx:226,232` | Utilitários 100% inline: `MeusServicos.jsx:213,242,301`, `Aprovacoes.jsx:61,69`, `Documentos.jsx:220,264,270`, `Configuracao.jsx:84`, `Mais.jsx:12,68` |
| **Cabeçalho de página** | `PageHeader` (`ui/PageHeader.jsx`) — 2 usos: `Servicos.jsx:332`, `GestorHome.jsx:124` | `BackHeader` (`components/BackHeader.jsx`) — 13 usos | `<div className="px-4 pt-6…"><h1>` à mão — `Tecnicos.jsx:248-258`, `MeusServicos.jsx:196-209`, `Documentos.jsx:160-170`, `Dashboard.jsx:~115`, `MeuPainel.jsx:~180`, `Mais.jsx:33-38`, `Avaliacoes.jsx:21-37` |
| **Switch/Toggle** | `Configuracao.jsx:114-129` — **com** `role="switch"` + `aria-checked` | `Notificacoes.jsx:65-78` — **sem** role, sem `aria-checked`, 4× `aria-label="Alternar"` | `Seguranca.jsx:406-417` — inline, com role + `aria-label` descritivo |
| **Estado vazio** | `FeedbackState state="empty"` direto (`Servicos.jsx:96,418`, `GestorHome.jsx:234,293`, `Documentos.jsx:181`, `DashboardWidgetsOps.jsx:95,130`) | `EstadoVazio` (wrapper, `EstadoVazio.jsx:19-26`) — 11 telas | — |
| **Banner de erro** | `FeedbackState state="error"` direto (`Servicos.jsx:405`, `GestorHome.jsx:228,288`, `DashboardWidgetsOps.jsx:55,92,128`) | `ErroBanner` (wrapper, `ErroBanner.jsx:23-31`) — 10 telas | `<div role="alert">` à mão: `Notificacoes.jsx:233`, `Seguranca.jsx:352`; `<div>` sem role: `ConfiguracaoBot.jsx:221` |
| **Modal** | `Overlay` (`ui/Overlay.jsx`) — usado diretamente em `Servicos.jsx:451`, `Estoque.jsx:42`, `Tecnicos.jsx:47`, `NovoTecnico.jsx:442`, `CatalogoModais.jsx` | `Modal` local re-envolvendo `Overlay` — `Seguranca.jsx:118-124` | — |
| **Campo de formulário** | `Field` (`ui/Field.jsx`) — `NovoServico`, `NovoServicoFuncionario`, `Servicos` | `Campo` local em `NovoTecnico.jsx:40-50` (label+ícone+dica) | `Campo` local em `Login.jsx:737-747` + `<label className="kpi-label">` solto em `Estoque.jsx:45`, `Tecnicos.jsx:50,64`, `Perfil.jsx:110,121,139`, `Reparticao.jsx:80,89`, `Seguranca.jsx:72,487,551,564,594,647` |
| **Campo de senha com olho** | `CampoSenha` local em `Seguranca.jsx:67-95` (usa `useId`) | inline duplicado 3× em `TrocarSenha.jsx:115-203` | inline em `Login.jsx:652-681` |
| **Campo de código 6 dígitos** | `CampoCodigo` local em `Seguranca.jsx:98-115` | inline em `Login.jsx:361-370` (OTP) | inline em `Login.jsx:474-483` (2FA) |
| **FAB** | markup idêntico copiado 3× | `Tecnicos.jsx:283-289`, `Catalogo.jsx:196-202`, `Usuarios.jsx:465` | — |
| **Wizard** | `Wizard.jsx` (`NovoTecnico`) — progresso `<div>` sem semântica | stepper `<ol aria-label>` + `aria-current="step"` em `NovoServico.jsx:197-218` | idem em `NovoServicoFuncionario.jsx:133-154` |
| **Banner de erro de auth** | `BannerErro` local em `Login.jsx:749-755` | `<p className="text-danger …">` idêntico em `TrocarSenha.jsx:205-209` | — |

---

## 4. Comportamento atual (síntese)

A navegação tem **uma fonte de verdade real** (`navigation.js`) alimentando três superfícies, e isso funciona. O que não está no manifesto está fora do sistema: 6 rotas autenticadas não constam de nenhum papel (`/mais`, `/servicos/novo`, `/tecnicos/novo`, `/tecnicos/:id`, `/configuracao/whatsapp`, `/trocar-senha`), e uma delas — `/configuracao/whatsapp` — **não tem nenhuma entrada in-app**: só URL digitada.

A autorização de UI é praticamente inexistente no roteador (1 guard em 23 rotas) e integralmente delegada ao backend. Isso é seguro (o comentário em `navigation.js:36-39` e `Guards.jsx:6-12` reconhece), mas o preço é que **todo 403 aparece ao usuário como falha técnica**, nunca como "você não tem acesso" — o componente que diria isso existe e nunca foi ligado.

Contexto de tela é quase todo efêmero: só `Servicos` (detalhe) e `MeusServicos` (status) escrevem na URL. `key={pathname}` garante que qualquer ida-e-volta de rota zere o resto.

Formulários dividem-se em dois regimes: os dois "Novo serviço" têm validação por etapa com foco e persistência de rascunho; todo o resto valida no submit e comunica por `toast` efêmero ou banner sem `role`.

Mobile-first é uma intenção declarada em tokens (`--panel-target: 44px`, safe-areas, `dvh`) que só se aplica quando o desenvolvedor usa os primitives. Fora deles, a base tem dezenas de alvos de 16 a 40 px.

---

## 5. Problemas identificados

| # | Problema | Evidência | Severidade |
|---|---|---|---|
| P1 | `/configuracao/whatsapp` é uma tela completa e funcional (polling, QR, pareamento) **órfã**: nenhum link a alcança | `Configuracao.jsx:45-53` (`breve:true`, sem `to`), `:196-198`; `TourGuide.jsx:110-111` aponta para âncora inexistente | Alta |
| P2 | 403 nunca é comunicado como falta de permissão; `FeedbackState state="permission-denied"` existe e é código morto | `FeedbackState.jsx:16-19,27`, `panel-primitives.css:299-302`; zero usos | Alta |
| P3 | `RequirePermissao` renderiza **`null`** durante o carregamento e faz **redirect silencioso** ao negar | `Guards.jsx:33-34` | Alta |
| P4 | Erro + vazio renderizados juntos, com CTAs que não podem funcionar | `Estoque.jsx:131`+`:140`, `Catalogo.jsx:100`+`:109`+FAB `:196`, `Aprovacoes.jsx:155`+`:161`, `MeusServicos.jsx:219`+`:280` | Alta |
| P5 | `Notificacoes` aba Avisos: falha vira `EstadoVazio "Nenhum aviso"` — a tela mente | `Notificacoes.jsx:88-95,142-146` (o bug irmão já foi corrigido em `:200-214`, mas não replicado) | Alta |
| P6 | Botão "Voltar" de `/configuracao` navega para `/configuracao` — no-op | `Configuracao.jsx:202` + `BackHeader.jsx:4` (default) | Média |
| P7 | Destinos primários levam "Voltar" a telas de origem falsas: `/estoque` (primário do gestor) → `/mais`; `/reparticao` (primário do dono) → `/mais`; `/aprovacoes` (primário do gestor) → `/configuracao`; `/meu-ponto` (primário do funcionário) → `/configuracao` (rota fora do manifesto dele) | `Estoque.jsx:101`, `Reparticao.jsx:72`, `Aprovacoes.jsx:148`, `MeuPonto.jsx:152` | Média |
| P8 | `/mais` não existe na sidebar; 3 telas mandam o "Voltar" desktop para lá | `BottomNav.jsx:14` vs `Sidebar.jsx:47`; `Estoque:101`, `Reparticao:72`, `Ajuda:195` | Média |
| P9 | Filtros e busca perdidos em refresh e ao voltar em 11 telas | tabela §3.3 | Média |
| P10 | Sem skip link; `key={pathname}` remonta a árvore a cada navegação, refazendo o percurso de teclado | busca vazia por `skip`; `App.jsx:371` | Média |
| P11 | ~25 alvos de toque abaixo de 44 px, incluindo o botão Voltar em 13 telas | tabela §3.6 | Média |
| P12 | Viewport sem `interactive-widget`; teclado virtual cobre `BottomNav` fixo e não encolhe `dvh` | `index.html:5`, `BottomNav.jsx:21` | Média |
| P13 | Grids de 3-4 colunas monetárias sem `min-w-0` estouram abaixo de ~390 px | `Tecnicos.jsx:170`, `Reparticao.jsx:162,172,191` | Média |
| P14 | Foco visível ausente nas 4 superfícies públicas (`PanelScope active=false`) | `panel.css:69` (escopo `.panel-ui`), `App.jsx:75,81`, `PanelScope.jsx:2` | Média |
| P15 | `Notificacoes` Toggle sem `role="switch"`/`aria-checked`, 4 botões com nome idêntico "Alternar" | `Notificacoes.jsx:65-78` vs `Configuracao.jsx:114-128` | Média |
| P16 | Abas (`Avaliacoes`, `Notificacoes`) sem `role="tablist"`/`tab`/`aria-selected`/setas | `Avaliacoes.jsx:41-53`, `Notificacoes.jsx:283-298` | Média |
| P17 | Erro de login não é anunciado (banner sem `role`) | `Login.jsx:749-755`, `TrocarSenha.jsx:205-209` | Média |
| P18 | `Login.jsx` tem `h2` antes do `h1` no DOM | `:277` vs `:514` | Baixa |
| P19 | `Documentos` reporta 403 como "recurso não ativado para a empresa" | `Documentos.jsx:69-70,180-185` | Média |
| P20 | `ConfiguracaoBot` reporta 403 do GET status como "Erro ao conectar com o servidor" | `ConfiguracaoBot.jsx:105` (mas `:121,:140` acertam) | Baixa |
| P21 | Pull-to-refresh nativo desligado globalmente e substituído em 1 de 25 telas | `index.css:9`, `Dashboard.jsx:96` | Baixa |
| P22 | 11 duplicações de componente catalogadas em §3.9 | — | Média |
| P23 | Contraste não é verificado por nada: axe desliga `color-contrast`, não há `jsx-a11y`, e `success`/`danger`/`warning` divergem entre as duas camadas | `src/test/axe.js:15`, `eslint.config.js:34-36`, `panel-rollout.css` (não cobre semânticos) | Média |
| P24 | `.pb-safe` definido e nunca usado; FABs com `bottom-24` fixo ignoram safe-area | `panel.css:100-102`; `Tecnicos.jsx:286`, `Catalogo.jsx:199`, `Usuarios.jsx:465` | Baixa |
| P25 | Rascunho de `NovoServico` em `localStorage` sem TTL e sem aviso de recuperação | `useFormPersist.js:4-19`, `NovoServico.jsx:42` | Baixa |
| P26 | Nenhum tratamento de orientação landscape em toda a base | busca vazia | Baixa |
| P27 | `NovoTecnico`: botão desabilitado sem dizer o que falta; sem persistência (perde foto base64) | `NovoTecnico.jsx:100-104`, `Wizard.jsx:98`, `:59-81` | Média |

---

## 6. Causas prováveis ou confirmadas

**Confirmadas por comentário no próprio código:**
- P2/P3: `navigation.js:36-39` e `Guards.jsx:6-12` declaram explicitamente que "a ocultação aqui é apenas UX; a autorização real permanece no backend". A decisão foi **não** construir um caminho de UI para negação — o `permission-denied` foi criado no primitive mas nunca teve um consumidor porque o modelo mental é "esconder, não negar".
- P4/P5: `Notificacoes.jsx:207-209` documenta o padrão exato do bug ("antes só disparava um toast… a aba virava skeleton permanente") e o corrige na aba Preferências. `Seguranca.jsx:167-172` e `Configuracao.jsx:146-148` documentam a mesma classe de bug em outros pontos. **É uma regressão de classe conhecida, corrigida caso a caso, sem uma varredura sistemática.**
- P22/§3.8: `panel-rollout.css:1-11` declara que o remapeamento existe justamente para que a migração para primitives seja "refinamento, não pré-requisito". A duplicação é o custo aceito conscientemente dessa estratégia — mas nunca foi acompanhada de uma regra de qual camada usar em código novo.

**Prováveis:**
- P1: `/configuracao/whatsapp` provavelmente foi despromovido para "em breve" no card sem que se removesse a rota nem se atualizasse o `TourGuide` — o tour ainda pressupõe a existência do link.
- P6/P7/P8: `BackHeader` nasceu com default `/configuracao` porque suas primeiras telas eram todas subpáginas de configuração; depois foi reusado em telas de topo de hierarquia (`Aprovacoes`, `MeuPonto`, `Estoque`) sem revisar o default. `/mais` como destino de volta pressupõe o modelo mental mobile, aplicado antes de a sidebar desktop existir.
- P9: consequência direta de `key={pathname}` (`App.jsx:369-371`), que foi introduzido pela animação de rota. O comentário reconhece o trade-off para o `RodapeLegal` mas não para o estado das telas.
- P11: `--panel-target: 44px` só é aplicado a `.panel-button*`/`.btn-*` (`panel-primitives.css:75-86`, `panel.css:75-77`). Não há regra que force alvo mínimo em `button` genérico. Sem `jsx-a11y` e com `color-contrast`/`region` desligados no axe, nada detecta.
- P12: viewport nunca foi revisado depois da adoção do `BottomNav` fixo + `dvh`.

---

## 7. Contradições

| # | Contradição |
|---|---|
| C1 | O DS declara `--panel-target: 44px` (`panel.css:27`) como token de sistema, mas o painel entrega alvos de 16-40 px em pelo menos 25 pontos, incluindo o botão Voltar presente em 13 telas (`BackHeader.jsx:11`, 36×36) |
| C2 | `FeedbackState` implementa 7 estados (`FeedbackState.jsx:3-20`) e o CSS estiliza `permission-denied` e `offline` (`panel-primitives.css:299-302`), mas só `error` e `empty` têm consumidor. O sistema descreve uma cobertura de estados que o produto não pratica |
| C3 | `panel-rollout.css:107-111` argumenta contraste AA para escolher `--panel-brand-strong`, mas `src/test/axe.js:15` desliga a regra `color-contrast`. A base raciocina sobre contraste e não o mede |
| C4 | `Notificacoes.jsx:200-214` corrige o bug "erro vira skeleton eterno" na aba Preferências com comentário explicativo, enquanto a aba Avisos **no mesmo arquivo** (`:88-95`) mantém exatamente o padrão condenado |
| C5 | `navigation.js:23-25` chama o manifesto de "fonte única de verdade para BottomNav, Sidebar e Mais" — mas `/mais` é injetado fora dele (`BottomNav.jsx:14`) e não existe no desktop, e 6 rotas reais não constam de nenhum papel |
| C6 | `Servicos.jsx:228-230` documenta a decisão de manter o estado do detalhe na URL "sem novas rotas, para filtros e scroll serem preservados" — mas os **próprios filtros** dessa tela (`:221-224`) continuam em `useState` e são perdidos no refresh |
| C7 | O painel tem dois wizards com semântica de progresso oposta: `<ol aria-label>` + `aria-current="step"` (`NovoServico.jsx:197-218`) e `<div>` decorativa (`Wizard.jsx:60-67`) — decisões conflitantes tomadas no mesmo produto |
| C8 | `index.css:9` desliga `overscroll-behavior` (matando o pull-to-refresh nativo) enquanto `usePullToRefresh` existe e cobre 1 tela. O gesto foi removido de 24 telas para ser reimplementado em 1 |
| C9 | `Guards.jsx:30-35` documenta cuidado para "evitar redirect prematuro durante o fetch", mas a solução escolhida é renderizar `null` — trocando um redirect prematuro por uma tela em branco sem `aria-busy` |
| C10 | `Configuracao.jsx` é a única entrada para `/configuracao/perfil\|seguranca\|notificacoes` de dono/gestor, mas `/configuracao` está ausente do manifesto do funcionário, que é justamente quem tem essas três telas na navegação |

---

## 8. Perguntas que dependem do usuário

Estas são decisões de produto/prioridade — não descobri resposta no repositório e não vou decidir por você.

1. **`/configuracao/whatsapp` (P1):** a tela está pronta e órfã. Ela deve (a) ser religada ao card de Configurações, (b) entrar no manifesto de dono/gestor, ou (c) ser removida junto com o passo do `TourGuide`? Qual é o status real do recurso?
2. **Negação de acesso (P2/P3):** você quer que o painel **diga** "você não tem acesso a esta área" (usando o `permission-denied` que já existe), ou prefere manter a política atual de ocultar e tratar 403 como erro genérico? Isso muda se telas fora do manifesto devem ser acessíveis por URL.
3. **Guard por rota:** vale estender `RequirePermissao` às outras rotas de módulo (`/servicos`, `/tecnicos`, `/reparticao`, `/estoque`, `/materiais`, `/aprovacoes`, `/avaliacoes`), aceitando que a UI passe a bloquear antes do backend — ou o custo de manter dois lugares de verdade é inaceitável?
4. **Preservação de contexto (P9):** quais telas merecem estado na URL? Migrar filtros para query string tem custo (links compartilháveis passam a expor filtros; histórico do navegador enche). Você quer isso em todas as listas, só nas de maior uso (`Servicos`, `Estoque`, `Catalogo`), ou em nenhuma?
5. **Largura mínima suportada (P13):** qual é o piso oficial — 320, 360 ou 390 px? Sem essa decisão não há critério para julgar os grids de 3-4 colunas monetárias.
6. **Alvos de toque (P11):** subir todos para 44 px muda a densidade visual de listas como `Catalogo` e `Usuarios` (4 ações por linha). Você aceita a perda de densidade, prefere agrupar ações num menu, ou aceita o risco atual?
7. **Regra do design system (§3.8):** a partir de agora, tela nova nasce 100% em `.panel-*`? Ou o legado remapeado continua aceitável e a migração é oportunista? Sem isso, cada tela nova aumenta a dívida.
8. **Duas camadas de cor semântica:** `success`/`danger`/`warning` do Tailwind vs `--panel-*`. Unificar em qual direção?
9. **`BackHeader` (P6/P7/P8):** você quer um contrato explícito ("telas de topo do manifesto não têm Voltar; subtelas têm Voltar para o pai declarado"), ou prefere `navigate(-1)` em tudo?
10. **Contraste (P23/C3):** vale religar a regra `color-contrast` num ambiente que a compute (Playwright/axe em browser real), ou fica como débito consciente?
11. **Rascunho sem TTL (P25):** um rascunho de serviço de 3 meses atrás deve ser restaurado silenciosamente ao abrir a tela?
12. **Landscape (P26):** é um cenário de uso real (técnico em campo)? Se não, fica declarado como não suportado.

---

## 9. Alternativas

**Para P2/P3 (negação de acesso):**
- **A.** Estender `RequirePermissao` às rotas de módulo e trocar o `Navigate` por render de `FeedbackState state="permission-denied"` com ação "Voltar ao início". Baixo esforço, resolve na origem. Custo: a UI passa a decidir, e um bug em `permissoes` bloqueia usuário legítimo.
- **B.** Manter guards como estão e tratar 403 no interceptor (`api.js:48-75`), expondo um sinal que as telas consumam. Mais robusto (cobre 403 tardio, permissão revogada em sessão), mas exige refatorar o tratamento de erro de ~14 telas.
- **C.** Só corrigir as mensagens erradas (`Documentos.jsx:70`, `ConfiguracaoBot.jsx:105`) e deixar o resto. Custo quase zero, ganho parcial.

**Para P4 (erro + vazio):**
- **A.** Tornar o erro excludente do vazio em cada tela (`{erro ? <Erro/> : vazio ? <Vazio/> : lista}`). 5 arquivos, mecânico.
- **B.** Criar um componente de "corpo de lista" que receba `{carregando, erro, itens}` e resolva a precedência uma vez. Elimina a classe inteira do bug, custa uma refatoração transversal.

**Para P9 (contexto):**
- **A.** `useSearchParams` com `replace:true` para filtros (sobrevive ao F5, não polui histórico) — é o padrão que `MeusServicos.jsx:126` já usa.
- **B.** `sessionStorage` por rota — sobrevive ao F5 e ao voltar, não aparece na URL, não é compartilhável.
- **C.** Remover `key={pathname}` de `App.jsx:371` e trocar a animação por View Transitions nativas (já há infra em `index.css:46-54`) — preserva estado por padrão, mas muda o comportamento de remontagem de toda a aplicação.

**Para P11 (alvos):**
- **A.** Regra CSS em `panel.css` estendendo `min-height/min-width: var(--panel-target)` a `button:not(.panel-button)` dentro de `.panel-ui`. Uma linha, efeito global, risco de quebrar layouts densos.
- **B.** Migrar os botões de ícone para `IconButton` (`ui/Button.jsx:45`), que já entrega 44 px via `.panel-button--icon` (`panel-primitives.css:81-86`). Correto e alinhado ao DS, mas é edição arquivo a arquivo.
- **C.** Aumentar só a área clicável (pseudo-elemento `::before` expandido) mantendo o visual de 36 px. Preserva a densidade, é o que o WCAG 2.5.8 aceita.

**Para §3.8 (duas camadas):**
- **A.** Congelar o legado: nenhuma tela nova usa `.card`/`.btn-*`/`.input`; migração das 22 telas legadas por lotes.
- **B.** Manter o remapeamento como estado final e **deletar** os primitives redundantes (`panel-button` vs `.btn-primary`), assumindo Tailwind + tokens.
- **C.** Status quo com uma regra escrita de quando usar cada um.

---

## 10. Recomendação

Recomendação, não decisão. A ordem abaixo maximiza redução de risco por unidade de esforço.

**Bloco 1 — verdade da tela (o usuário está vendo informação errada hoje):**
1. P5 (`Notificacoes` aba Avisos mente sobre estado vazio) — 1 arquivo, mesmo padrão já aplicado 14 linhas abaixo.
2. P4 (erro + vazio simultâneos, 5 telas) — via alternativa A agora, B quando houver fôlego.
3. P19/P20 (403 rotulado como "recurso não ativado" e como "erro de rede") — 2 linhas.

**Bloco 2 — navegação que não fecha:**
4. P1 (`/configuracao/whatsapp` órfã) — depende da pergunta 1.
5. P6 (Voltar de `/configuracao` para si mesma) — 1 linha, bug objetivo.
6. P7/P8 (Voltar apontando para origens falsas) — depende da pergunta 9.

**Bloco 3 — acessibilidade de alto retorno:**
7. P17 (erro de login não anunciado) — adicionar `role="alert"` em 2 componentes.
8. P15 (Toggle sem `role="switch"`) — alinhar `Notificacoes.jsx:65-78` com `Configuracao.jsx:114-128`, que já está certo.
9. P10 (skip link) — 1 componente + 1 âncora no `<main>` de `App.jsx:368`.
10. P14 (foco visível fora de `.panel-ui`) — mover a regra de `panel.css:69-73` para escopo global.

**Bloco 4 — decisões estruturais (dependem das perguntas §8):**
11. P2/P3 (negação de acesso) — pergunta 2 e 3.
12. P9 (contexto na URL) — pergunta 4.
13. P11/P13 (alvos e largura mínima) — perguntas 5 e 6.
14. §3.8 (regra do DS) — pergunta 7; **até que ela exista, cada tela nova aumenta a dívida de forma não rastreada**. Este é o item de maior impacto de longo prazo.

**Não recomendo tocar agora:** `Overlay.jsx` (é o componente mais maduro da base), `navigation.js` (o modelo está correto; o problema são as rotas que ficaram de fora), `useFormPersist` (funciona; o débito é de UX, não de código).

---

## 11. Impactos cruzados

| Mudança | Impacta |
|---|---|
| Estender `RequirePermissao` às rotas de módulo | **Backend**: a UI passaria a depender de `/me/permissoes` estar sempre correto e disponível; hoje `AuthContext.jsx:96-98` degrada para `{}` em falha, o que **bloquearia tudo** para não-donos. Precisaria de política de fallback |
| Remover `key={pathname}` (`App.jsx:371`) | Quebra a animação `.panel-route` (`panel.css:130-132`); telas que hoje contam com remontagem para refazer fetch passariam a exibir dados obsoletos; `TourGuide` depende de navegação por rota |
| Forçar 44 px em botões genéricos | Muda densidade de `Catalogo` (4 ações/linha), `Usuarios`, `Tecnicos`, `Documentos`; altera altura do `BackHeader` em 13 telas; pode empurrar conteúdo abaixo da dobra em mobile |
| Migrar filtros para query string | Links compartilhados passam a carregar filtros; `Servicos` já usa `?servico=` — precisa de convenção para não colidir; analytics de rota (`useAnalytics`) passa a ver mais variações |
| Unificar `success`/`danger`/`warning` nos tokens panel | Afeta **toda** a base (badges de status em `MeusServicos`, `Aprovacoes`, `Tecnicos`, `Estoque`, `MeuPonto`) e as superfícies públicas fora de `.panel-ui` |
| Adicionar `interactive-widget=resizes-content` | Muda comportamento de **todas** as telas com `dvh` e do `Overlay` (`panel-overlay.css:14,43`); no app Capacitor o comportamento pode divergir do web |
| Religar `color-contrast` no axe | Exige browser real (jsdom não computa cor, `src/test/axe.js:14-17`); provavelmente exige mover a suíte a11y para Playwright, tocando `vitest.a11y.config.js` e o CI |
| Corrigir `BackHeader` defaults | Afeta as 13 telas simultaneamente; `TourGuide` navega entre rotas e pode depender do comportamento atual |
| Ligar `permission-denied` | Precisa de decisão de copy consistente com o backend (hoje `MeuPonto.jsx:81` e `Aprovacoes.jsx:127` repassam `err.response.data.erro` cru) |

---

## 12. Grau de confiança

| Item do mandato | Confiança | Base |
|---|---|---|
| 1. AI por papel | **Alta** | `navigation.js` lido integralmente; 3 consumidores lidos |
| 2. Telas só por link direto + tratamento sem permissão | **Alta** para o mapeamento de rotas e para o `catch` de cada tela (lido linha a linha). **Média** para o comportamento efetivo, porque depende do status HTTP que o backend devolve — não li `chaveiro-bot/`. Se o backend devolver 200 com lista vazia em vez de 403, o que o usuário vê muda completamente |
| 3. Preservação de contexto | **Alta** | `useState` vs `useSearchParams` verificado por busca exaustiva |
| 4. Formulários | **Alta** para os 7 formulários pedidos, lidos integralmente |
| 5. Estados de tela | **Alta** para as telas lidas; **Baixa** para `Avaliacoes` (filhos não abertos) e `ConfiguracaoBot` (li ~40% do arquivo) |
| 6. Mobile-first | **Alta** para as construções CSS/JSX identificadas. **Baixa** para as larguras de ruptura estimadas — são cálculos de papel, não medições. Nenhum viewport foi renderizado |
| 7. Acessibilidade | **Alta** para landmarks, headings, `role`/`aria-*` e alvos de toque (todos verificáveis estaticamente). **Baixa** para contraste real — nada foi computado, só os tokens declarados foram lidos |
| 8. Duas camadas de DS | **Alta** para o inventário de uso; **Alta** para "não existe regra escrita" (busquei em docs e config) |
| 9. Duplicações | **Alta** — todas com `arquivo:linha` |

---

## 13. Pontos não verificados

1. **Backend.** Nenhum arquivo de `chaveiro-bot/` foi lido. Qual status HTTP cada rota devolve a um papel sem permissão (403 vs 200-vazio vs 404) **não foi verificado** — e isso determina o que o usuário efetivamente vê em toda a §3.2.
2. **Renderização real.** Nada foi executado em navegador. Larguras de ruptura, contrastes computados, comportamento do teclado virtual, safe-areas em dispositivo, e o resultado do focus trap com leitor de tela são **inferências estáticas**.
3. **`src/components/avaliacoes/{Cliente,Google,Solicitacao}.jsx`** — não lidos. Os estados de carregando/vazio/erro de `/avaliacoes` estão em branco no meu inventário.
4. **`ConfiguracaoBot.jsx`** — li linhas 95-224. Não vi `:1-94` nem `:225-360` (blocos `ehSuperAdmin`).
5. **`MaterialPicker.jsx`** — assumi o combobox ARIA como já mapeado; não reauditei o teclado (setas, Home/End, `aria-activedescendant`).
6. **`MatrizPermissoes.jsx`, `CapturaSelfie.jsx`, `BancoHoras.jsx`** (além da tabela `:174-178`), **`Dashboard.jsx`** (li ~40%), **`GestorHome.jsx`** (li por grep), **`MeuPainel.jsx`** (li por grep), **`Usuarios.jsx`** (li `:355-400` e grep), **`PerfilTecnico.jsx`** (grep), **`MeuPonto.jsx`** (li `:60-100`, `:145-175`).
7. **Suíte de testes.** Não executei `npm test`, `npm run test:a11y` nem `npm run lint`. Não sei se passam hoje. Os 5 arquivos `.axe.jsx` foram identificados por nome, não lidos.
8. **App Capacitor.** `capacitor.config.json`, `android/` e `CAPACITOR.md` não foram lidos. Safe-areas, teclado e back-button de hardware no app nativo podem divergir do web.
9. **`public/manifest.webmanifest`** e `public/sw.js` — não lidos. Comportamento offline real do service worker desconhecido (o único offline mapeado é `navigator.onLine` em `useOffline.js`).
10. **Histórico.** Não consultei `git log`/`git blame`. As "causas prováveis" da §6 que não têm comentário de código associado são hipóteses, não fatos.
11. **`e2e/`** — não lido. Pode haver cobertura de fluxos que contradiga ou confirme achados de navegação.
12. **`Landing.jsx`, `PaginaLegal.jsx`, `Privacidade/Termos/Cookies`** — analisados só quanto ao escopo `PanelScope`/foco visível, não quanto a estados ou mobile.
