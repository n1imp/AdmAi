# ROUND-01 — EOS-Repository-Mapper

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-Repository-Mapper` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | 17 eixos transversais: autorização legada, identidade técnico/usuário, navegação, Voltar, preservação de estado, atualização de dados, validação, erro, formatos, uploads, notificações, exclusão, auditoria, acessibilidade, mobile, ambientes, i18n |
| Grau de confiança declarado | Alta na maioria dos eixos (ver §12 do relatório) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Onde o comportamento atual puder ser reverificado no código, o código prevalece.
>
> **Nota de verificação:** o classificador de segurança do harness estava indisponível na
> revisão deste subagente. O orquestrador verificou independentemente os achados que sustentam
> decisões desta rodada antes de usá-los.

---

# EOS-Repository-Mapper — Rodada 1 — Regras Transversais

## 1. Escopo analisado

17 eixos transversais do mandato, cobrindo os dois módulos. Foco no que vale para **várias telas/módulos**: autorização legada, identidade técnico/usuário, navegação, histórico, preservação de estado, atualização de dados, validação, erro, formatação, uploads, notificações, exclusão, auditoria, acessibilidade, mobile, ambientes e i18n.

Fora de escopo (não aprofundado): regra de negócio de cada tela isolada, cobertura de testes, CI/CD, design system (já mapeados na Rodada 0).

## 2. Arquivos consultados

**Backend (`chaveiro-bot`)** — `src/middlewares/auth.js`, `src/services/permissoes.js`, `src/services/auditoria.js`, `src/services/notificacao.js`, `src/services/credenciais.js`, `src/services/senha.js`, `src/services/storage.js`, `src/services/parser.js`, `src/utils/upload.js`, `src/config/env.js`, `src/routes/tecnicos.js`, `src/routes/admin.js`, `src/routes/account.js`, `src/routes/billing.js`, `src/routes/documentos.js`, `src/routes/estoque.js`, `src/routes/servicos.js`, `prisma/schema.prisma`.

**Frontend (`chaveiro-painel`)** — `src/App.jsx`, `src/main.jsx`, `index.html`, `capacitor.config.json`, `android/app/src/main/AndroidManifest.xml`, `public/sw.js`, `package.json`, `src/config/navigation.js`, `src/components/{BackHeader,BottomNav,Sidebar,Guards,ErroBanner,ErrorBoundary}.jsx`, `src/components/ui/{PageHeader,FeedbackState}.jsx`, `src/contexts/AuthContext.jsx`, `src/lib/{api,senha,moeda}.js`, `src/hooks/{useFormPersist,usePullToRefresh,useOffline}.js`, `src/pages/{Mais,Servicos,MeusServicos,Dashboard,Avaliacoes,Notificacoes,NovoTecnico,ConviteAceitar,ConfiguracaoBot,Configuracao,Documentos}.jsx`, `src/index.css`.

## 3. Evidências com `arquivo:linha`

### 3.1 — Papéis reais e autorização legada

| Mecanismo | Local | Fonte de verdade |
|---|---|---|
| `adminOnly` | `chaveiro-bot/src/middlewares/auth.js:88-91` | `req.user.admin` (booleano legado), **sem fallback para `papel`** |
| `requirePermissao` | `chaveiro-bot/src/middlewares/auth.js:93-98` | `pode()` → `papel ?? (admin ? 'dono' : 'funcionario')` (`permissoes.js:123`) |

**Todos os 3 usos de `adminOnly`:** `routes/billing.js:18` (checkout), `routes/billing.js:29` (portal), `routes/admin.js:451` (`POST /lgpd/anonimizar-cliente`).

**Pontos onde `Usuario.admin` ainda decide comportamento (fora de `adminOnly`):**

| Local | Decisão | Se usasse `papel` seria igual? |
|---|---|---|
| `services/notificacao.js:54` | `where: { admin: true, ativo: true }` — quem recebe notificação | **Não** — gestor nunca recebe |
| `routes/account.js:405-408` | `adminsAtivos <= 1 && usuario.admin` → apaga a EMPRESA inteira | Equivalente hoje |
| `routes/billing.js:155,175` | `where: { papel: 'dono' }` — destinatário de billing | Mecanismo **diferente** do notificacao.js |
| `routes/tecnicos.js:213` | `ehDono: t.usuario?.admin === true` (exibição) | Equivalente hoje |
| `chaveiro-painel/src/components/Sidebar.jsx:48` | `user?.admin ? 'Administrador' : PAPEL_LABEL[papel]` | Rótulo divergente (ver 3.17) |
| `chaveiro-painel/src/contexts/AuthContext.jsx:110,117` | `papel === 'dono' \|\| admin` → `pode()` retorna true | Superconjunto — OR, não AND |

**Sincronia `admin` ⇄ `papel`** (todos os caminhos de escrita mantêm o par): `routes/auth.js:377`, `:423-424`, `:854-855`; `routes/admin.js:235`, `:314`; `services/credenciais.js:70`; `services/bootstrap.js:67-68`. O schema Zod do `PATCH /usuarios/:id` (`admin.js:263-269`) **não aceita** `admin`, então não há rota que dessincronize.

**Persistência:** `Usuario.admin Boolean @default(false) // legado/compat: equivale a papel == "dono"` — `prisma/schema.prisma:232`; `papel String @default("funcionario")` — `:235`.

### 3.2 — `Tecnico` vs `Usuario`

| Aspecto | Evidência |
|---|---|
| Ligação | `prisma/schema.prisma:73-74` — `usuarioId Int? @unique` + `onDelete: SetNull`; lado inverso `Usuario.tecnico Tecnico?` em `:264` |
| Injeção na sessão | `middlewares/auth.js:25` (include) e `:48` (`tecnicoId: usuario.tecnico?.id ?? null`) |
| Criação via painel | `services/credenciais.js:46-77` — cria `Usuario` com PIN e faz `tecnico.update({ usuarioId })` em `:75` |
| Auto-vínculo do dono | `routes/account.js:546-572` — na verificação do telefone, cria ou vincula um `Tecnico` ao dono |
| Criação implícita pelo bot | `services/servico.js:11-15` — cria `Tecnico` só com `nome`, **sem** `Usuario` |
| Consumo do `tecnicoId` | `routes/tecnicos.js:575`, `:630`, `:649`; `routes/documentos.js:122` |

**`Tecnico.nivelAcesso`** — `prisma/schema.prisma:79`: `nivelAcesso String? // papel no painel (ex.: "tecnico" | "gestor")`.

**Todos os usos do campo (busca exaustiva):**

| Local | Uso |
|---|---|
| `routes/tecnicos.js:56` | validação `z.string().max(40).optional().nullable()` — string livre |
| `routes/tecnicos.js:253` | persistência crua |
| `routes/tecnicos.js:269` | **único consumidor lógico**: `req.user.papel === 'dono' && d.nivelAcesso === 'gestor' ? 'gestor' : 'funcionario'` |
| `chaveiro-painel/src/pages/NovoTecnico.jsx:32-36` | `NIVEIS = [{value:'tecnico'},{value:'gerente'},{value:'admin'}]` |
| `NovoTecnico.jsx:79` | default `'tecnico'` |
| `NovoTecnico.jsx:115,367-368,433` | envio e exibição |

**Papel `tecnico` não existe no RBAC:** `services/permissoes.js:55` — `PAPEIS = ['dono','gestor','funcionario']`. `CAPACIDADES_PROPRIO` em `:47-53`.

**Segundo caminho, contrato diferente:** `POST /tecnicos/:id/acesso` lê `req.body.papel === 'gestor'` (`routes/tecnicos.js:301-302`), não `nivelAcesso`.

**`PATCH /tecnicos/:id`** (`routes/tecnicos.js:511-518`) não aceita `nivelAcesso` — o campo não é editável após a criação.

### 3.3 — Navegação (`src/config/navigation.js`, 371 linhas, lido integralmente)

**Estrutura de um destino** (contrato documentado em `:27-39`):
```
{ to, label, descricao?, icon, end?, mobile: 'primary'|'more', group, guard }
```

**Guards suportados** — `navigation.js:342-347`:

| Guard | Resolução |
|---|---|
| `{ sempre: true }` | sempre visível (`:343`) |
| `{ proprio: 'x' }` | `ctx.podeProprio(x)` (`:344`) |
| `{ modulo, acao? }` | `ctx.pode(modulo, acao ?? 'ver')` (`:345`) |
| ausente / desconhecido | `return true` (`:346`) — **fail-open** |

**Grupos por papel:**

| Papel | `groupOrder` | Destinos | `primary` declarados |
|---|---|---|---|
| DONO (`:41-146`) | Visão, Gestão, Recursos, Administração | 11 | 3 (`/`, `/tecnicos`, `/reparticao`) |
| GESTOR (`:148-244`) | Operação, Equipe, Recursos, Acompanhamento, Conta | 10 | 4 (`/`, `/aprovacoes`, `/tecnicos`, `/estoque`) |
| FUNCIONARIO (`:246-335`) | Meu trabalho, Conta | 9 | 4 (`/`, `/meu-ponto`, `/meus-servicos/novo`, `/configuracao/perfil`) |

**Papel desconhecido** — `navigation.js:353`: `POR_PAPEL[ctx?.papel] ?? FUNCIONARIO`. Fallback silencioso para o manifesto mais restritivo. Combina com `AuthContext.jsx:31` (`payload.papel ?? (payload.admin ? 'dono' : 'funcionario')`).

**`MAX_PRIMARY = 4`** (`:340`); overflow calculado por `!primarySet.has(d.to)` (`:358`), então `primary` excedente cai em "Mais" — correto. `desktopGroups` usa **todos** os visíveis (`:368`).

**Consumidores:**

| Componente | Superfície | Flag de carregando |
|---|---|---|
| `BottomNav.jsx:13` | `.primary` + item fixo `/mais` (`:14`) | `papel !== 'dono' && permissoes === null` (`:11`) |
| `Sidebar.jsx:47` | `.desktopGroups` | idem (`:46`) |
| `Mais.jsx:29` | `.moreGroups` | idem (`:28`) |

- `Mais.jsx:66-74` acrescenta um botão **"Sair"** que **não está no manifesto**; `Sidebar.jsx` **não tem logout** algum.
- `/configuracao/notificacoes` só existe no manifesto do FUNCIONARIO (`:316-324`). Dono e gestor chegam apenas via `/configuracao` → `Configuracao.jsx:33`.
- Nenhum item da navegação tem badge de não-lidas, apesar de `GET /notificacoes/nao-lidas` existir (`routes/admin.js:99-107`).

### 3.4 — Botão Voltar / histórico

`BackHeader.jsx:4,9`: `function BackHeader({ titulo, para = '/configuracao' })` → `onClick={() => navigate(para)}`. **É `navigate(rota)`, ou seja PUSH — não é `navigate(-1)` nem `replace`.**

**4 padrões distintos:**

| # | Padrão | Evidência | Telas |
|---|---|---|---|
| A | Rota fixa **implícita** → `/configuracao` | `BackHeader.jsx:4` (default) | `Aprovacoes.jsx:148`, `Configuracao.jsx:202`, `ConfiguracaoBot.jsx:60`+`:194`, `MeuPonto.jsx:152`, `Notificacoes.jsx:279`, `Perfil.jsx:82`, `Seguranca.jsx:347`, `Usuarios.jsx:359` |
| B | Rota fixa **explícita** | prop `para=` | `Ajuda.jsx:195`→`/mais`, `Estoque.jsx:101`→`/mais`, `Reparticao.jsx:72`→`/mais`, `Catalogo.jsx:86`→`/`, `PerfilTecnico.jsx:228`→`/tecnicos`, `NovoTecnico.jsx:162`→`/tecnicos`, `NovoServico.jsx:193`→`/servicos`, `NovoServicoFuncionario.jsx:130`→`/meus-servicos` |
| C | **Histórico real** `navigate(-1)` | `Avaliacoes.jsx:23` | 1 tela em todo o app |
| D | **Sem voltar** | `PageHeader` sem `onBack` | `Servicos.jsx:332-341`, `GestorHome.jsx:124`; e telas sem header algum: `Dashboard`, `Tecnicos`, `MeuPainel`, `MeusServicos`, `Documentos`, `Mais` |

`PageHeader` **suporta** `onBack` (`components/ui/PageHeader.jsx:15,22-26`), mas a busca por `onBack` em `src/` retorna **apenas o próprio componente e o teste** (`ui/__tests__/Structure.test.jsx:60-65`) — nenhuma página o usa.

**Navegação programática com `replace:true`** (troca de sessão/contexto, correto): `Login.jsx:122,154,158,216,238`; `TrocarSenha.jsx:67,82`; `Seguranca.jsx:296,338`; `ConviteAceitar.jsx:67`; `MagicLink.jsx:113`; `App.jsx:327,328,342`; `Guards.jsx:21,24,34`.

**Push que altera URL sem trocar rota** (histórico do drawer): `Servicos.jsx:303,306,309,312` — comentado em `:300-301` como intencional.

### 3.5 — Preservação de estado

| Tela | Mecanismo | Preserva ao sair/voltar? |
|---|---|---|
| `Servicos.jsx` | detalhe em URL `?servico=&detalhe=1` (`:229-230`, `:302-313`); filtros em `useState` (`:221-224`) | detalhe **sim**; filtros **não** |
| `MeusServicos.jsx` | `?status=` com `{replace:true}` (`:126`) | filtro **sim**, mas sem entrada de histórico |
| `NovoServico.jsx` | `useFormPersist('admai_novo_servico')` (`:42`) | rascunho **sim** |
| `NovoServicoFuncionario.jsx` | `useFormPersist('admai_novo_servico_func')` (`:33`) | rascunho **sim** |
| `NovoTecnico.jsx` | `useState` puro (`:59-81`) | **não** — wizard de RH de ~20 campos |
| `Dashboard.jsx` | período/datas em `useState` (`:38-40`) | **não** |
| `MeuPonto.jsx` | só o aceite LGPD (`localStorage 'ponto_aviso_lgpd'`, `:99,113`) | parcial |
| `DashboardWidgets` | `useWidgetPrefs` — localStorage + sync server (`hooks/useWidgetPrefs.js:22,38,61`) | **sim**, cross-device |

- `useFormPersist` (`hooks/useFormPersist.js:3-24`): hidrata com merge (`:6`), debounce na gravação (`:13-16`), `clear` remove (`:22`). **Sem TTL e sem versionamento de schema.**
- **Scroll restoration: não existe** (busca por `scrollRestoration` → 0 ocorrências em `src/`).
- `App.jsx:371` usa `key={pathname}` no wrapper de conteúdo — **remonta a árvore a cada navegação**, destruindo estado local e posição de scroll por design.
- Chaves de `localStorage` em uso: `admai_token`, `admai_dashboard_widgets`, `admai_cookies_consent`, `admai_novo_servico`, `admai_novo_servico_func`, `ponto_aviso_lgpd`, chave do tour (`TourGuide.jsx:136`), chave do WelcomeCard (`WelcomeCard.jsx:16`). O `logout()` (`AuthContext.jsx:61-66`) remove **somente `admai_token`**.

### 3.6 — Atualização de dados

| Mecanismo | Onde | Cobertura |
|---|---|---|
| `useEffect` no mount + guard de cancelamento | `Dashboard.jsx:78-85`, `Servicos.jsx:265-273`, `Notificacoes.jsx:97-99`, `ConviteAceitar.jsx:24-35` | padrão dominante |
| Atualização **otimista** pós-mutação (sem refetch) | `Servicos.jsx:284-285`, `Notificacoes.jsx:105,118,127` | padrão dominante |
| Pull-to-refresh | `hooks/usePullToRefresh.js:10` (threshold 80px) — usado em `Dashboard.jsx:96` | **1 tela** |
| Botão "Atualizar" manual | `Dashboard.jsx:100-108,123-130` | **1 tela** |
| Polling | `ConfiguracaoBot.jsx:164` (`setInterval` 4s), pausado por `visibilitychange` (`:167-175,180`) | **1 tela** |
| Refetch ao voltar o foco | `ConfiguracaoBot.jsx:171` | **1 tela** |
| WebSocket / SSE | **nenhum** no app (`e2e/run.mjs:144` é driver CDP de teste) | 0 |
| Indicador de "última atualização" | `ConfiguracaoBot.jsx:330-332`; `components/avaliacoes/Google.jsx:421-423` | **2 pontos**, nenhum em tela de negócio |

`chaveiro-bot/src/server.js:87` (`setInterval` 30s) é métrica de fila BullMQ, não afeta o painel.

### 3.7 — Validação compartilhada

**Backend:** Zod inline por rota. **Não existe pasta de schemas** (`chaveiro-bot/src/schemas` inexistente). Contagem de `z.object` por arquivo: `auth.js` 6, `account.js` 6, `admin.js` 4, `servicos.js` 3, `google.js` 3, `tecnicos.js` 2, `estoque.js` 2, `whatsapp.js` 1, `documentos.js` 1, `middlewares/rateLimiters.js` 1.

**Painel:** `zod` está em `package.json:39` mas é importado em **um único arquivo**: `ConviteAceitar.jsx:3`. Todo o resto é validação manual por tela (ex.: `NovoTecnico.jsx:100-104` `podeAvancar`).

**Duplicações de regra confirmadas:**

| Regra | Backend | Frontend | Situação |
|---|---|---|---|
| Força de senha | `services/senha.js:12-27` | `lib/senha.js:11-23` | **Código idêntico em 2 arquivos**; comentário do painel (`:2`) admite "espelha" |
| Regex de username | `routes/admin.js:211` | `ConviteAceitar.jsx:45` | duplicada |
| Moeda ↔ número | `z.number().nonnegative()` | `lib/moeda.js:16-53` | máscara só no front |
| Telefone | `parser.js:41-47` (`canonizarTelefone`) | `NovoTecnico.jsx:112` `.replace(/\D/g,'')` | canonização só no back |

**Divergência dentro do próprio backend:** `POST /usuarios` aceita `senha: z.string().min(6)` (`admin.js:212`) e **não** chama `avaliarForcaSenha`; `PATCH /usuarios/:id` exige `avaliarForcaSenha().valida` (mín. 8 + 3 critérios) em `admin.js:272-276`. `ConviteAceitar.jsx:46` usa `min(8)`.

**CPF/CNPJ:** `cpf: z.string().max(20)` (`routes/tecnicos.js:53`); input livre no painel (`NovoTecnico.jsx:186-190`). **Não existe validação de dígito verificador em nenhum dos dois módulos.** `CNPJ` não existe no schema.

### 3.8 — Tratamento de erro

**Formato do corpo do backend:** `{ erro: string }` universal. Variantes:
- `detalhes: parse.error.format()` — `tecnicos.js:234`, `admin.js:218`, `tecnicos.js:553`.
- **`codigo` existe em apenas 5 pontos:** `middlewares/auth.js:38` (`email_nao_verificado`), `middlewares/auth.js:108` (`senha_provisoria`), `routes/servicos.js:178` (`materiais_nao_permitidos`), `routes/account.js:362` (`email_indisponivel`), `routes/account.js:400` (`confirmacao_necessaria`).

**Interceptor axios** (`lib/api.js:48-75`):
- 401 + `!_retry` → `tentarRefresh()` deduplicado (`:29-44`) → falha ⇒ `limparSessao()` + `window.location.href='/login'` (`:61-62`, **hard reload**).
- 403 + `senha_provisoria` → `/trocar-senha` (`:64-67`).
- 403 + `email_nao_verificado` → `/verificar-email` (`:68-71`).
- **O front conhece 2 dos 5 códigos.** 503 (`middlewares/auth.js:84`) não tem tratamento — cai no catch genérico de cada tela.

**Componentes:**

| Componente | Papel | Evidência |
|---|---|---|
| `FeedbackState` | 7 estados (`loading/updating/empty/error/success/offline/permission-denied`), `role` alert/status por estado | `ui/FeedbackState.jsx:3-36` |
| `ErroBanner` | wrapper fino de `FeedbackState state="error"` + retry | `ErroBanner.jsx:22-32` |
| `ErrorBoundary` | classe, `getDerivedStateFromError`, reporta via `monitoring.js` | `ErrorBoundary.jsx:16-22` |

`ErrorBoundary` é montado **uma única vez, na raiz e fora do `BrowserRouter`** (`main.jsx:24-28`). Recuperação = `window.location.reload()` (`:38`) ou `<a href="/">` (`:41`).

**Padrão dominante em tela:** `catch { toast('Erro ao …','error') }` com mensagem genérica, **descartando** o `erro` do backend — `Notificacoes.jsx:91,108,120,130`; `Servicos.jsx:289`. Exceções que leem `e.response?.data?.erro`: `NovoTecnico.jsx:144`, `ConfiguracaoBot.jsx:123,142`, `ConviteAceitar.jsx:69`.

### 3.9 — Formato de dados

| Domínio | Implementação | Locais |
|---|---|---|
| Data | `Intl.DateTimeFormat('pt-BR', { …, timeZone:'America/Sao_Paulo' })` | `lib/api.js:100-119` (`formatarData`, `formatarDataCurta`); backend `utils/formatar.js:2-8`, `services/ponto.js:15,104,112`, `services/relatorio.js:207-221`, `services/agendador.js:17,71`; front `MeuPonto.jsx:33-36`, `BancoHoras.jsx:32,43` |
| Data **sem TZ** | usa o fuso do dispositivo | `Seguranca.jsx:455`, `ConfiguracaoBot.jsx:332`, `Dashboard.jsx:33` e `Reparticao.jsx:14` (`toLocaleDateString('en-CA')` para "hoje") |
| Moeda | `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})` | `lib/api.js:93-98` **e** `chaveiro-bot/src/utils/formatar.js:13` (duplicado); `billing.js:160` é o único com `currency` variável |
| Máscara monetária | centavos-como-inteiro | `lib/moeda.js:16-28` (`formatarMoedaInput`), `:37-53` (`moedaParaNumero`) |
| **Tipo do dinheiro no banco** | **`Float`** (não `Decimal`) | `schema.prisma:133-136` (Servico), `:181-182` (Material), `:311` (Pagamento), `:82,87` (Tecnico) |
| Telefone | 3 representações | `Tecnico.telefone` canônico + `Tecnico.telefoneDisplay` livre (`schema.prisma:66-67`); `Usuario.telefone` canônico `@unique` global (`:230`) |
| Canonização | `canonizarTelefone` (`parser.js:41-47`), `variantesTelefone` (`:56-70`, tolerância ao 9º dígito) | só backend |
| Heurística de exibição | `t.telefoneDisplay ?? (t.telefone && t.telefone.length <= 13 ? t.telefone : null)` | `routes/tecnicos.js:207` |
| Endereço | **campo único de texto livre** | `Servico.endereco String?` (`schema.prisma:130`); `Tecnico.endereco String?` (`:78`, `z.string().max(300)` em `tecnicos.js:55`) |
| CPF | sem validação de dígito | `tecnicos.js:53` |

### 3.10 — Uploads

| Fluxo | Entrada | Limite | Magic bytes | Destino |
|---|---|---|---|---|
| Foto de perfil do técnico | data-URI base64 no JSON | **2 MB** (`tecnicos.js:88`) | sim (`:97`) | **coluna do banco** — `Tecnico.fotoPerfil String` (`schema.prisma:70`); o data-URI inteiro é persistido |
| Selfie de ponto | data-URI base64 (`tecnicos.js:111`) | **5 MB** (`:118`) | sim (`:123`) | bucket **privado** `selfies-ponto` (`:133`) com fallback pro disco `./uploads-ponto` (`:139-140`) |
| Documentos do técnico | base64 | **5 MB** (`documentos.js:36`) | sim (`utils/upload.js:23-25`) | bucket privado `documentos-tecnico` / disco (`documentos.js:111`) |
| Imagem de material / foto de serviço | — | — | — | `uploadComFallback` → bucket **público** (`storage.js:129-152`) |

- Magic bytes: `utils/upload.js:10-29` cobre JPEG, PNG, WEBP, GIF, PDF.
- **Tipos aceitos divergem**: foto de perfil aceita `webp` (`tecnicos.js:87`); documentos **não** (`documentos.js:39`: pdf/jpeg/png).
- URL assinada: `storage.js:84-94` (`urlAssinada`, default 60s); consumo com `302` + `Cache-Control: private, no-store` em `tecnicos.js:656-661`.
- `STORAGE_STRICT=true` desliga o fallback pro disco (`storage.js:28-30,134-148`).
- Validação no cliente: `NovoTecnico.jsx:90` (2 MB), `Documentos.jsx:89` (5 MB) + `accept="application/pdf,image/jpeg,image/png"` (`:210`).

### 3.11 — Notificações

| Aspecto | Evidência |
|---|---|
| Model | `schema.prisma:289-302` — `tipo, titulo, mensagem, link String?, lida`, FK `onDelete: Cascade` (`:291`) |
| Tipos declarados | `schema.prisma:293` — `estoque_baixo \| resumo \| novo_servico \| meta \| sistema` |
| Preferências | `Usuario.notificacoes Json?` (`schema.prisma:261`); `PREFERENCIAS_PADRAO` cobre **4** tipos (`services/notificacao.js:8-13`) — **`sistema` está ausente** |
| Gate de preferência | `if (prefs[tipo] === false) return null` (`notificacao.js:39`) — `sistema` é `undefined`, logo sempre passa |
| Emissores | `notificar` (`:32`), `notificarAdmins` (`:49`), `alertarEstoqueBaixo` (`:74-102`); chamadores: `services/agendador.js:135` (resumo) e `:97` (estoque) |
| Público-alvo | `where: { admin: true, ativo: true }` (`:54`) |
| Deep link | `Notificacao.link` (`schema.prisma:296`) → `navigate(aviso.link)` em `Notificacoes.jsx:111`, **sem validar rota nem permissão** |
| Retenção / expurgo | **inexistente** — só delete manual (`admin.js:138-149`) e cascade ao apagar usuário |
| Rotas | `GET /notificacoes/nao-lidas` (`admin.js:99-107`), `PATCH /:id/lida` (`:109`), `POST /ler-todas` (`:125`), `DELETE /:id` (`:138`) |
| Push nativo | inexistente (nenhum plugin Capacitor; `AndroidManifest.xml` não declara `POST_NOTIFICATIONS`) |

### 3.12 — Exclusão / desativação / arquivamento

| Entidade | Como "some" | Restauração |
|---|---|---|
| `Usuario` | DELETE real (`admin.js:381`) **ou** flag `ativo:false` (`admin.js:265`, schema `:244`) | `ativo` reversível pelo mesmo PATCH; delete **não** |
| Conta própria | DELETE real (`account.js:418`) | não |
| `Empresa` | cascata manual de 13 tabelas (`account.js:89-102`) quando o último admin se exclui (`:405-410`) | não |
| `Tecnico` | **só** flag `ativo` (schema `:71`; `tecnicos.js:512`) — não há rota DELETE | **sim** |
| `Servico` | DELETE real (`servicos.js:327`) | não |
| `Material` | DELETE real (`estoque.js:153`) | não |
| `Notificacao` | DELETE real (`admin.js:142`) | não |
| `DocumentoTecnico` | DELETE real (`documentos.js:183`) | não |
| Cliente (PII em `Servico`/`Avaliacao`) | **anonimização** — `clienteNome:null, clienteTelefone:null` (`admin.js:466-473`) | não |
| `RefreshToken` / `SessaoUsuario` | delete (`account.js:636-637`) | n/a |

- **Nenhum model tem soft delete** (`deletedEm`/`arquivadoEm` inexistentes no `schema.prisma`).
- `Empresa.ativo` existe (`schema.prisma:24`) — não encontrei consumidor.
- O mais próximo de arquivamento é `Servico.status = 'rejeitado'` (`schema.prisma:143-147`).

### 3.13 — Auditoria

`services/auditoria.js:4-30` — `registrar({empresaId, usuarioId, acao, entidade, entidadeId, antes, depois, ip})`. **Best-effort**: engole exceção (`:27-29`). Model `AuditLog` em `schema.prisma:530-544`.

**Todos os 5 pontos de chamada (todos em `routes/admin.js`):**

| Linha | `acao` |
|---|---|
| `admin.js:242` | `usuario.criado` |
| `admin.js:327` | `usuario.desativado` |
| `admin.js:346` | `usuario.permissoes_alteradas` |
| `admin.js:383` | `usuario.excluido` |
| `admin.js:437` | `convite.enviado` |

**Não auditadas** (só `logger.info`, ou nada): anonimização LGPD (`admin.js:451-489`, só `:475`), exclusão de conta/empresa (`account.js:410-419`), criação e reset de PIN de técnico (`tecnicos.js:312`, `:369`), delete de serviço (`servicos.js:327`), delete de material (`estoque.js:153`), `PATCH /config/empresa` (`admin.js:164`), login/logout, troca de senha, 2FA.

**Não há rota GET de leitura do `AuditLog`** — o dono não consegue consultar a própria auditoria pelo painel.

### 3.14 — Acessibilidade transversal

| Item | Estado | Evidência |
|---|---|---|
| `lang` | **existe**, global | `index.html:2` — `<html lang="pt-BR">` |
| **Skip link** | **não existe** | busca por `skip-link`/`Pular para` em `src/` e `index.html` → 0 |
| Landmarks | parciais | `<main>` `App.jsx:368`; `<nav aria-label="Navegação principal">` `BottomNav.jsx:19-20`; `<nav aria-label="Navegação lateral">` `Sidebar.jsx:66-67`; `<aside>` `Sidebar.jsx:51`; `<header>` `ui/PageHeader.jsx:20`. Sem `role="contentinfo"` explícito |
| Foco na mudança de rota | **não existe** | `App.jsx:371` remonta com `key={pathname}` mas nenhum `focus()`/anúncio de rota em todo o `src/` |
| `prefers-reduced-motion` | **parcial** | `index.css:48-54` cobre **apenas** `::view-transition-*`; `panel-overlay.css:125`; `ui/Overlay.jsx:98`; `TourGuide.jsx:155`. **Não cobre** `animate-fade-in` (`Avaliacoes.jsx:19`, `Dashboard.jsx:112`), `animate-pulse-glow` (`Notificacoes.jsx:176`), `animate-shimmer` (`index.css:125`), `animate-rise` |
| Alvos de toque | inconsistentes | ≥44px: `BottomNav.jsx:26,37` (54px), `Sidebar.jsx:16` (44px), `Mais.jsx:12,68` (56px). <44px: `BackHeader.jsx:11` (36px), `Dashboard.jsx:127` (36px), `Notificacoes.jsx:184` (**32px**) |
| Anúncio de estado | por componente | `ui/FeedbackState.jsx:30-36` mapeia `role` alert/status + `aria-busy`; `aria-busy` na nav (`BottomNav.jsx:20`, `Sidebar.jsx:68`, `Mais.jsx:40`) |
| Div clicável | presente | `Notificacoes.jsx:162-165` — `<div onClick>` sem `role`/`tabIndex` |
| Testes axe | 6 superfícies | `vitest.a11y.config.js`; `*.axe.jsx` para `Documentos`, `GestorHome`, `MeuPainel`, `MeusServicos`, `Button`; `Servicos.a11y.test.jsx` |

### 3.15 — Mobile / Capacitor

| Aspecto | Evidência |
|---|---|
| Config | `capacitor.config.json` — `appId com.admai.app`, `webDir dist`, `androidScheme https`, **`CapacitorHttp.enabled: true`** |
| Plataformas | **só Android** (`android/`, `@capacitor/android` em `package.json:28`); não há `ios/` |
| Base da API | `import.meta.env.VITE_API_URL \|\| '/api'` (`lib/api.js:3`, comentário `:7`) |
| Permissões nativas | `INTERNET`, `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`; `camera required=false` — `AndroidManifest.xml`, bloco "Permissions" |
| Uso das permissões | **APIs web**, não plugins: `navigator.geolocation.getCurrentPosition` (`MeuPonto.jsx:56-57`), `navigator.mediaDevices.getUserMedia` (`CapturaSelfie.jsx:32-33`) |
| Degradação | negação vira `resolve(null)` (`MeuPonto.jsx:56`) e `setEstado('semCamera')` (`CapturaSelfie.jsx:48`) — sem explicação ao usuário |
| Safe areas | `.safe-area-top/bottom/h-safe-area-inset-bottom` (`index.css:145-152`); `env(safe-area-inset-*)` em `panel.css:101`, `panel-overlay.css:7`; aplicadas em `App.jsx:358` e `BottomNav.jsx:21` |
| Service worker | registrado **só em PROD** (`main.jsx:32-36`); `public/sw.js` — navegação network-first (`:40-52`), assets SWR (`:55+`), **`/api`, `/uploads`, `/health`, `/metrics` nunca interceptados** (`:29-37`) |
| Offline | `useOffline` só detecta (`hooks/useOffline.js:3-18`) e exibe faixa (`App.jsx:359-366`). **Sem fila de escrita e sem cache de leitura** |
| Deep link nativo | `launchMode singleTask`, **sem `<intent-filter>` de `VIEW`/App Links** → convite, magic-link e verificação de e-mail não abrem o app |

### 3.16 — Ambientes

**Backend** — `NODE_ENV` validado como enum em `config/env.js:23`. O que muda:

| Comportamento | Evidência |
|---|---|
| Arquivo `.env` vs `.env.test` | `config/env.js:8` |
| Nível e transporte de log | `utils/logger.js:53,66` |
| Cookie `secure` do refresh | `routes/auth.js:83` |
| Rate limit desligado em test | `app.js:107` (`skip: () => env.NODE_ENV === 'test'`) |
| Exigências extras em produção | `env.js:130` (RESEND_API_KEY), `:137` (FRONTEND_URL), `:144` (ALLOWED_ORIGIN ≠ `*`) |
| Sentry `environment` | `config/sentry.js:59,81` |

**Frontend** — só o par DEV/PROD do Vite:

| Uso | Evidência |
|---|---|
| `PROD` → registra service worker | `main.jsx:32` |
| `DEV` → avisos de a11y em console | `ui/Button.jsx:51`, `ui/Overlay.jsx:201` |
| `DEV` → analytics desativado | `hooks/useAnalytics.js:5` |
| `MODE` → environment do Sentry | `lib/monitoring.js:17` |

**Feature flags** são env strings comparadas a `'true'`: `documentos.js:50`, `servicos.js:608`, `storage.js:23,30`, `middlewares/auth.js:33`. Definidas em `env.js:58,72,86,97,100,105,110,121`. **O painel não recebe nenhuma flag** — feature-detecta por 404 (comentário em `App.jsx:212`).

### 3.17 — Internacionalização / localização

**Nenhuma biblioteca de i18n** — `chaveiro-painel/package.json:27-40` não tem `i18next`, `react-intl` nem `formatjs`. Nenhum arquivo de tradução no repositório. 100% das strings de UI são literais pt-BR no JSX.

**Pontos hardcoded:**

| Constante | Ocorrências |
|---|---|
| Locale `'pt-BR'` | `lib/api.js:94,102,114`; `lib/moeda.js:26`; `MeuPonto.jsx:33`; `BancoHoras.jsx:40`; `Seguranca.jsx:455`; `ConfiguracaoBot.jsx:332`; `utils/formatar.js:2,13`; `agendador.js:71`; `relatorio.js:211,220`; `ponto.js:104,112`; `billing.js:160` |
| Currency `'BRL'` | `lib/api.js:96`; `utils/formatar.js:13` |
| TZ `'America/Sao_Paulo'` | `lib/api.js:108,117`; `MeuPonto.jsx:36`; `BancoHoras.jsx:32,43`; `utils/formatar.js:8`; `agendador.js:17`; `relatorio.js:207`; `ponto.js:15` |
| DDI `'55'` | `parser.js:44,45,64,66` |
| `'en-CA'` como hack de data ISO local | `Dashboard.jsx:33`; `Reparticao.jsx:14`; `ponto.js:94` |
| `lang="pt-BR"` | `index.html:2` |
| `android:supportsRtl="true"` | `AndroidManifest.xml` — sem suporte real a RTL |

**Rótulos de papel duplicados em 3 arquivos:** `Sidebar.jsx:6` (`{dono:'Dono',gestor:'Gestor',funcionario:'Funcionário'}`) + `:48` (usa **'Administrador'** quando `admin`), `Usuarios.jsx:16,21,26`, `ConviteAceitar.jsx:9`.

## 4. Comportamento atual (resumo)

1. **Autorização**: dois mecanismos coexistem. `requirePermissao` (RBAC real, 10 módulos) governa quase tudo; `adminOnly` (`Usuario.admin`) governa 3 endpoints. Os dados nunca dessincronizam pelos caminhos da aplicação, mas o **público de notificações** e a **decisão de apagar a empresa** dependem exclusivamente do campo legado.
2. **Identidade**: `Tecnico` é a entidade de RH/operação; `Usuario` é a credencial. Ligação 1-1 opcional, criada por 3 caminhos distintos (painel, verificação de telefone do dono, bot). `nivelAcesso` é texto livre que a UI popula com valores que o backend nunca reconhece.
3. **Navegação**: manifesto único bem construído, 3 consumidores derivados dele, fallback silencioso para funcionário em papel desconhecido, e 1 destino ("Sair") fora do manifesto.
4. **Voltar**: 4 padrões, sendo o dominante (`BackHeader` sem `para`) um **push para `/configuracao`** — não é histórico.
5. **Estado**: preservação existe pontualmente (URL em 2 telas, rascunho em 2 telas, widgets no servidor); o `key={pathname}` do `App.jsx` garante que todo o resto é descartado.
6. **Atualização**: mount-only em quase tudo; 1 polling, 1 pull-to-refresh, 1 botão manual, 0 websockets, 0 indicadores de frescor em telas de negócio.
7. **Validação**: Zod inline no backend, manual no painel, com a única regra realmente compartilhada (senha) existindo como duas cópias.
8. **Erro**: `{erro}` com `codigo` opcional em 5 lugares; o interceptor conhece 2.
9. **Formato**: pt-BR / BRL / America-São_Paulo hardcoded; dinheiro em `Float`; endereço em texto livre; CPF sem validação.
10. **Uploads**: 4 fluxos com limites e destinos diferentes; magic bytes em todos.
11. **Notificações**: inbox com deep link e preferências, público restrito a `admin`, sem expurgo.
12. **Exclusão**: hard delete é a regra; `ativo` é a exceção (2 entidades); anonimização só para PII de cliente.
13. **Auditoria**: 5 ações, todas de gestão de usuário, sem leitura pelo painel.

## 5. Problemas identificados

| # | Problema | Severidade | Evidência |
|---|---|---|---|
| P1 | **`nivelAcesso` é um contrato quebrado**: painel envia `tecnico\|gerente\|admin` (`NovoTecnico.jsx:32-36`), backend só reconhece `'gestor'` (`tecnicos.js:269`). Escolher "Administrador" cria um **funcionário**, silenciosamente | Alta | `NovoTecnico.jsx:35` vs `tecnicos.js:269` |
| P2 | **`notificarAdmins` exclui gestores** — filtro `admin:true` (`notificacao.js:54`). Gestor com `estoque.ver/editar` nunca recebe alerta de estoque baixo | Alta | `notificacao.js:54` vs `permissoes.js:79` |
| P3 | **`BackHeader` sem `para` empurra para `/configuracao`** — 8 telas, incluindo `MeuPonto`, `Notificacoes` e `Aprovacoes`. Para um funcionário, `/configuracao` não está no manifesto dele (`navigation.js:246-334`) e não é guardada (`App.jsx:276-285`): o botão "Voltar" o leva a uma tela órfã | Alta | `BackHeader.jsx:4` + as 8 chamadas |
| P4 | **`key={pathname}` destrói estado e scroll em toda navegação** (`App.jsx:371`), anulando qualquer preservação que não esteja em URL ou localStorage | Alta | `App.jsx:369-372` |
| P5 | **Senha: 2 regras no mesmo backend** — `POST /usuarios` aceita 6 chars sem força (`admin.js:212`); `PATCH` exige 8+ (`admin.js:272`) | Alta | `admin.js:212` vs `:272` |
| P6 | **Dinheiro em `Float`** em 8 colunas — erro de arredondamento acumulável em comissão/repartição | Alta | `schema.prisma:133-136,181-182,311` |
| P7 | **Anonimização LGPD e exclusão de empresa não vão para o `AuditLog`** — as duas ações mais irreversíveis do sistema | Alta | `admin.js:475`; `account.js:410-419` |
| P8 | **Sem skip link e sem gestão de foco na troca de rota** — a navegação por teclado/leitor de tela não é anunciada | Alta | ausência em `index.html`/`src/`; `App.jsx:371` |
| P9 | **`prefers-reduced-motion` só cobre View Transitions** (`index.css:48-54`); as animações Tailwind legadas continuam | Média | `index.css:48-54` vs `:125`, `Notificacoes.jsx:176` |
| P10 | **Filtros de lista não sobrevivem à navegação** (`Servicos.jsx:221-224`); wizard de RH sem rascunho (`NovoTecnico.jsx:59-81`) | Média | idem |
| P11 | **Mensagem de erro do backend descartada** pelo padrão `catch { toast('Erro ao…') }` na maioria das telas | Média | `Notificacoes.jsx:91,108,120,130` |
| P12 | **3 dos 5 `codigo` de erro não são tratados** pelo interceptor; 503 do `requireAuth` também não | Média | `lib/api.js:64,68` vs `servicos.js:178`, `account.js:362,400`, `middlewares/auth.js:84` |
| P13 | **Notificações sem retenção** — a tabela cresce indefinidamente; sem badge na navegação apesar do endpoint existir | Média | `schema.prisma:289-302`; `admin.js:99-107` |
| P14 | **Deep link de notificação não é validado** — rota inexistente cai no catch-all `*` → `/` (`App.jsx:342`); nem checa permissão | Média | `Notificacoes.jsx:111` |
| P15 | **`logout()` não limpa rascunhos, consentimento e tour** — vazam para o próximo usuário do mesmo dispositivo | Média | `AuthContext.jsx:61-66` |
| P16 | **Foto de perfil do técnico persistida como data-URI em coluna do banco** (até 2 MB por linha), enquanto os outros 3 fluxos usam storage | Média | `tecnicos.js:263` + `schema.prisma:70` |
| P17 | **CPF sem validação de dígito** nos dois módulos | Média | `tecnicos.js:53`; `NovoTecnico.jsx:186-190` |
| P18 | **Endereço em texto livre único** — impede geocódigo, roteirização e filtro estruturado (o filtro atual é `LIKE` em texto) | Média | `schema.prisma:78,130` |
| P19 | **`AuditLog` sem rota de leitura** — auditoria existe mas é invisível ao dono | Média | ausência de GET em `routes/` |
| P20 | **Deep links nativos não abrem o app Android** (sem `intent-filter` VIEW) — convite/magic-link forçam navegador | Média | `AndroidManifest.xml` |
| P21 | **Offline é só um aviso** — sem fila de escrita; funcionário em campo sem sinal não bate ponto nem registra serviço | Média | `useOffline.js`; `sw.js:29-37` |
| P22 | **Alvos de toque abaixo de 44px** em ações recorrentes (32px em `Notificacoes.jsx:184`, 36px em `BackHeader.jsx:11`) | Média | idem |
| P23 | **`sistema` não está em `PREFERENCIAS_PADRAO`** — tipo não desligável (funciona por acidente do `=== false`) | Baixa | `notificacao.js:8-13,39` |
| P24 | **Guard desconhecido em `navigation.js` é fail-open** (`return true`, `:346`) | Baixa | `navigation.js:342-347` |
| P25 | **"Sair" fora do manifesto** (`Mais.jsx:66-74`) e ausente na Sidebar — desktop não tem logout | Baixa | idem |
| P26 | **`ErrorBoundary` único na raiz** — erro em qualquer tela derruba o app inteiro; recuperação só por reload | Baixa | `main.jsx:24-28`; `ErrorBoundary.jsx:38` |
| P27 | **`toLocaleDateString('en-CA')` para "hoje"** usa o fuso do dispositivo (`Dashboard.jsx:33`, `Reparticao.jsx:14`) — divergindo do `America/Sao_Paulo` do resto | Baixa | idem |
| P28 | **Rótulo "Administrador" na Sidebar** para o papel `dono` — 4º nome para o mesmo conceito | Baixa | `Sidebar.jsx:48` |

## 6. Causas prováveis ou confirmadas

| Problema | Causa | Status |
|---|---|---|
| P1 | `nivelAcesso` foi criado como campo de RH (`schema.prisma:79` diz "papel no painel") e depois recebeu uma regra de negócio em `tecnicos.js:269` sem alinhar o vocabulário com a UI. Zod `z.string().max(40)` não fecha o domínio | **Confirmada** por leitura dos 3 pontos |
| P2, P28 | Migração incompleta de `admin` → `papel`: os gates foram migrados, os consumidores não-gate ficaram | **Confirmada** (`docs/db/04-data-model.md:75` já registra a dívida) |
| P3 | `para = '/configuracao'` foi um default razoável quando `BackHeader` só servia às subtelas de Configuração; foi reusado em telas de topo sem revisar o default | **Provável** |
| P4 | `key={pathname}` foi introduzido para a transição de rota funcionar (comentário `App.jsx:369-370`) — efeito colateral não considerado | **Confirmada** pelo próprio comentário |
| P5 | `POST /usuarios` é anterior a `services/senha.js`; o `PATCH` foi endurecido depois sem retroagir | **Provável** |
| P6 | `Float` é o default de `Number` no Prisma; nunca houve decisão explícita por `Decimal` | **Provável** |
| P7, P19 | `auditoria.js` nasceu na remediação EV-060 (gestão de usuários) e não foi generalizado | **Provável** |
| P8, P9, P22 | A11y foi tratada por componente (`FeedbackState`, `Button`, `Overlay`) e por tela testada, sem uma camada global de shell | **Confirmada** pela distribuição das evidências |
| P12 | `codigo` foi introduzido por necessidade pontual (2 redirects) e virou convenção informal | **Confirmada** |
| P16 | Foto de perfil vinha do WhatsApp como URL (`schema.prisma:70` diz "URL da foto"); o upload manual do painel reusou a coluna com data-URI | **Provável** |
| P21 | Service worker deliberadamente não intercepta `/api` (`sw.js:29-37`) — decisão de não servir dado obsoleto, sem contrapartida de fila | **Confirmada** pelo comentário |

## 7. Contradições

| # | Contradição | Lados |
|---|---|---|
| C1 | Painel promete 3 níveis de acesso ao técnico; backend implementa 2 e nenhum dos rótulos casa | `NovoTecnico.jsx:32-36` × `tecnicos.js:269` |
| C2 | RBAC define gestor com `estoque: {ver, editar}`, mas o alerta de estoque baixo só vai para `admin` | `permissoes.js:79` × `notificacao.js:54` |
| C3 | Dois mecanismos para "achar o dono": `admin:true` e `papel:'dono'` | `notificacao.js:54` × `billing.js:155,175` |
| C4 | Força de senha na criação (6 chars, sem score) × na edição (8+, score ≥3) × no convite (8) | `admin.js:212` × `admin.js:272` × `ConviteAceitar.jsx:46` |
| C5 | `Servicos.jsx:227-228` afirma "a lista nunca é desmontada, filtros e scroll preservados", mas `App.jsx:371` remonta o filho a cada `pathname` — a afirmação só vale para mudanças de query string | comentário × `App.jsx:371` |
| C6 | `navigation.js:38-39` diz "o Dono não recebe destinos de autosserviço", mas o manifesto DONO simplesmente não os lista — a regra é implícita, não codificada; um override que ligasse `proprio` não mudaria nada | `navigation.js:38-39` × `:41-146` |
| C7 | `Guards.jsx:34` redireciona "sem permissão" para `/configuracao`, mesmo destino do "Voltar" padrão do `BackHeader` — dois significados na mesma rota | `Guards.jsx:34` × `BackHeader.jsx:4` |
| C8 | Rótulo do papel `dono`: "Dono" (`Usuarios.jsx:16`, `ConviteAceitar.jsx:9`, `Sidebar.jsx:6`) × "Administrador" (`Sidebar.jsx:48`) × manifesto `DONO` | 4 fontes |
| C9 | `webp` aceito em foto de perfil, recusado em documentos | `tecnicos.js:87` × `documentos.js:39` |
| C10 | Timezone: `America/Sao_Paulo` explícito em 10 pontos × fuso do dispositivo em 4 | `lib/api.js:108` × `Dashboard.jsx:33` |
| C11 | `zod` é dependência de produção do painel mas serve a 1 arquivo, enquanto 30+ telas validam à mão | `package.json:39` × `ConviteAceitar.jsx:3` |
| C12 | `PREFERENCIAS_PADRAO` promete controlar `novo_servico` e `meta`, mas não localizei emissor para nenhum dos dois | `notificacao.js:8-13` × ausência de chamador (**não verificado exaustivamente**) |

## 8. Perguntas que dependem do usuário

Somente decisões que o código **não** responde:

1. **Papel do técnico** — "Técnico" deve virar um 4º papel de RBAC, ou `nivelAcesso` deve ser eliminado e a atribuição de papel unificada em `POST /tecnicos/:id/acesso`? (o código mostra dois caminhos incompatíveis; qual é a intenção de produto é sua)
2. **Gestor e notificações** — gestor deve receber alertas operacionais (estoque baixo, resumo)? Se sim, o público passa a ser derivado de permissão (`pode(modulo,'ver')`) ou de papel?
3. **`Usuario.admin`** — aceita depreciar agora (migração + remoção do campo) ou mantém como compat indefinidamente? Há consumidor externo (integração, relatório, script) que leia `admin`?
4. **Semântica do "Voltar"** — o produto quer voltar-para-histórico (comportamento de navegador/app nativo) ou voltar-para-pai (hierarquia fixa)? A escolha muda ~20 telas.
5. **Preservação de filtros** — filtros de lista devem ir para a URL (compartilháveis, sobrevivem a refresh) ou para localStorage por usuário (persistem entre sessões)? São efeitos diferentes.
6. **Frescor de dado** — qual o requisito real: polling em telas operacionais (Aprovações, Estoque), push, ou apenas pull-to-refresh universal + timestamp visível?
7. **Dinheiro em `Float`** — migrar para `Decimal`/inteiro-em-centavos é uma migração de dados com janela. Vale o custo agora ou fica registrado como dívida com teto de erro aceito?
8. **Retenção de notificações e de `AuditLog`** — quanto tempo guardar? Há requisito legal/contratual que você conheça?
9. **Auditoria** — quais ações **precisam** ser auditáveis para o seu negócio/compliance além de gestão de usuários? (exclusão de serviço? anonimização LGPD? reset de PIN?)
10. **Nível de acessibilidade alvo** — WCAG 2.1 AA é meta declarada? Isso define se skip link, foco de rota e alvos de 44px viram bloqueadores ou melhorias.
11. **Offline em campo** — o funcionário precisa bater ponto e registrar serviço sem sinal? Se sim, é uma feature de fila offline, não um ajuste.
12. **iOS** — está no roadmap? Muda decisões de safe area, permissões e deep link.
13. **i18n / outros países** — há intenção de operar fora do Brasil? Se não, hardcode de BRL/TZ/DDI é decisão consciente e não dívida.
14. **Endereço estruturado** — há intenção de roteirização, mapa ou relatório por região? Só isso justifica quebrar o campo único.

## 9. Alternativas

**Autorização legada (P1, P2, C1, C2, C3)**
- (a) Deprecação completa: remover `Usuario.admin`, migrar consumidores para `papel`/`permissoes`, `adminOnly` vira `requirePermissao('configuracao','editar')`. Custo: migração + 3 rotas + teste. Risco: quebrar clientes externos.
- (b) Deprecação parcial: manter a coluna, tornar `adminOnly` um alias de `papel === 'dono'`, e trocar `notificarAdmins` por `notificarPorPermissao(modulo, acao)`. Menor custo, mantém a dívida.
- (c) Só documentar como invariante testado. Custo mínimo, problema permanece.

**`nivelAcesso` (P1)**
- (a) Remover o campo e o seletor; papel se atribui só em `POST /tecnicos/:id/acesso` com `z.enum(PAPEIS)`.
- (b) Manter como campo de RH puro, renomear para `cargo`, e desacoplar de `tecnicos.js:269`.
- (c) Fechar o domínio com `z.enum(['funcionario','gestor'])` e alinhar o seletor do painel.

**Voltar (P3, C7)**
- (a) `BackHeader` passa a exigir `para` (sem default) e todas as telas declaram o pai — hierarquia explícita, previsível, testável.
- (b) `BackHeader` usa `navigate(-1)` com fallback para `para` quando não há histórico (`window.history.length <= 1`) — comportamento de app nativo.
- (c) Migrar tudo para `PageHeader` com `onBack` e centralizar a política num hook `useVoltar()`.

**Estado e scroll (P4, P10)**
- (a) Remover `key={pathname}` e mover a transição de rota para CSS por `View Transitions API` (já há suporte parcial em `index.css:46-54`).
- (b) Manter `key` e adicionar `<ScrollRestoration>` + filtros na URL nas listas.
- (c) Adotar uma camada de cache de servidor (TanStack Query) que torna remontagem barata e resolve simultaneamente P4, P6-de-frescor, P11 e P12.

**Erro (P11, P12)**
- (a) Padronizar o envelope: `{ erro, codigo, detalhes? }` com `codigo` obrigatório, e um `mensagemDeErro(e)` central no painel.
- (b) Manter o formato e só criar o helper no painel (custo baixo, ganho imediato).

**Auditoria (P7, P19)**
- (a) Middleware genérico que audita toda mutação em rotas marcadas.
- (b) Chamadas explícitas nos ~8 pontos críticos + rota `GET /auditoria` paginada.

## 10. Recomendação

**Recomendação, não decisão.** Ordenada por razão dano/custo, com base apenas no que está evidenciado acima.

**Faixa 1 — corrigir contrato quebrado (baixo custo, dano ativo)**
1. Fechar `nivelAcesso` (P1). Hoje a UI mente para o dono: ele escolhe "Administrador" e cria um funcionário. Alternativa (c) é a mais barata; (a) é a mais limpa.
2. Unificar a regra de senha no backend (P5) — `POST /usuarios` deve chamar `avaliarForcaSenha` como o `PATCH` já faz.
3. Trocar o público de `notificarAdmins` (P2) — alternativa (b).

**Faixa 2 — coerência transversal (custo médio, dano difuso e permanente)**
4. Decidir a semântica do Voltar (P3) e aplicar em uma passada. É a inconsistência mais visível ao usuário e a mais barata de padronizar depois de decidida.
5. Remover `key={pathname}` ou adotar cache de servidor (P4). Enquanto ele existir, qualquer trabalho de "preservar estado" é desfeito na navegação seguinte.
6. Helper central de mensagem de erro + tratar os 3 `codigo` faltantes e o 503 (P11, P12).

**Faixa 3 — fundações que ficam mais caras com o tempo**
7. Auditar anonimização LGPD, exclusão de conta/empresa e reset de PIN (P7); expor `GET /auditoria` (P19).
8. Skip link + foco na troca de rota + estender `prefers-reduced-motion` às animações legadas (P8, P9). São 3 mudanças pequenas no shell que valem para 37 telas.
9. Migrar dinheiro para `Decimal`/centavos (P6) — quanto mais dados, mais cara a migração.

**Faixa 4 — depende de decisão sua** (P18 endereço, P21 offline, P20 deep link, P13 retenção) — não recomendo mexer antes das respostas do item 8.

## 11. Impactos cruzados

| Mudança | Atinge |
|---|---|
| Depreciar `Usuario.admin` | `middlewares/auth.js:45,88`; `services/auth.js:17-18`; `routes/auth.js:92-93`; `services/permissoes.js:123,133,140,156,216-217,231`; `services/notificacao.js:54`; `routes/account.js:123,405-408`; `routes/tecnicos.js:213,355`; `routes/admin.js:225,287,306,314,378,411`; `AuthContext.jsx:30-31,110,117,125`; `Sidebar.jsx:48`; `Perfil.jsx:100`; JWT em circulação (payload muda) e `test/integration/auth.test.js:28` |
| Padronizar o Voltar | 20 telas (todas as listadas em 3.4) + `BackHeader.jsx` + `PageHeader.jsx` + `Guards.jsx:34` (destino de "sem permissão") |
| Remover `key={pathname}` | `App.jsx:369-372`; a transição `.panel-route` (`styles/panel-rollout.css`, não verificado); todas as telas passam a manter estado — pode expor bugs de estado obsoleto hoje mascarados pela remontagem |
| Fechar `nivelAcesso` | `schema.prisma:79` (+migração), `tecnicos.js:56,253,269`, `NovoTecnico.jsx:32-36,79,115,367,433`, `schema.sqlite.prisma:80` |
| `Float` → `Decimal` | 8 colunas em 4 models; toda agregação (`tecnicos.js:202,216-220,463-465`, `routes/dashboard`, `services/relatorio.js`), `lib/moeda.js`, serialização JSON (Decimal vira string no Prisma) e os gráficos Recharts |
| Envelope de erro `{erro,codigo}` | 11 arquivos de rota do backend + `lib/api.js:48-75` + todos os `catch` de tela |
| Fila offline | `sw.js`, `lib/api.js`, `useOffline.js`, `MeuPonto.jsx`, `NovoServicoFuncionario.jsx`, e exige idempotência nas rotas de escrita (hoje `POST /ponto/bater` é idempotente por design — `tecnicos.js:585` — mas `POST /servicos` não foi verificado) |
| Skip link + foco de rota | `index.html`, `App.jsx:349-384`, `index.css` (estilo do link), e afeta os 6 testes axe existentes |
| Retenção de notificações | `services/agendador.js` (novo job), `schema.prisma:289-302` (índice por `criadoEm` já existe em `:301`) |

## 12. Grau de confiança

| Eixo | Confiança | Base |
|---|---|---|
| 1. Papéis / `adminOnly` | **Alta** | Busca exaustiva por `adminOnly`/`.admin`; leitura integral de `middlewares/auth.js` e `permissoes.js:1-125` |
| 2. `Tecnico` × `Usuario` / `nivelAcesso` | **Alta** | Busca exaustiva do campo; leitura integral de `tecnicos.js` e `credenciais.js` |
| 3. Navegação | **Alta** | `navigation.js` lido integralmente (371 linhas); os 3 consumidores lidos integralmente |
| 4. Voltar / histórico | **Alta** | Busca exaustiva por `navigate(-1)`, `useNavigate`, `BackHeader`, `replace`, `onBack` |
| 5. Preservação de estado | **Alta** | Busca exaustiva por `useSearchParams`, `localStorage`, `useFormPersist`, `scroll` |
| 6. Atualização de dados | **Alta** | Busca exaustiva por `setInterval`, `WebSocket`, `visibilitychange`, `usePullToRefresh` |
| 7. Validação | **Alta** (backend/painel), **Média** (mapeamento campo a campo) | Contagem de `z.object`; leitura dos dois `senha.js` |
| 8. Erro | **Alta** | Busca exaustiva por `codigo:`; leitura integral do interceptor e dos 3 componentes |
| 9. Formato de dados | **Alta** | Busca exaustiva por `Intl.`, `toLocale`, `timeZone`; leitura do schema |
| 10. Uploads | **Alta** | Leitura de `upload.js`, `storage.js`, `tecnicos.js`; grep em `documentos.js` |
| 11. Notificações | **Alta** (modelo/emissores), **Média** (emissores de `novo_servico`/`meta`) | Leitura integral de `notificacao.js` |
| 12. Exclusão | **Alta** | Busca por `delete`/`deleteMany`/`ativo` em `routes/` |
| 13. Auditoria | **Alta** | Busca exaustiva por `registrarAudit`/`registrar(` |
| 14. Acessibilidade | **Média-Alta** | Buscas por padrões-chave; não inspecionei contraste computado nem `RodapeLegal.jsx` |
| 15. Mobile / Capacitor | **Média-Alta** | Config, manifest e SW lidos; comportamento em runtime não executado |
| 16. Ambientes | **Alta** | `env.js` lido; busca por `NODE_ENV`/`import.meta.env` |
| 17. i18n | **Alta** | `package.json` + busca por locale/currency/TZ |

## 13. Pontos não verificados

1. **Contraste real de cores** — não computei relações de contraste dos tokens `--panel-*` nem das cores Tailwind legadas.
2. **`RodapeLegal.jsx`** — não lido; não sei se há `role="contentinfo"`.
3. **`styles/panel-rollout.css`, `panel-primitives.css`, `panel.css`** — lidos apenas por grep de `safe-area`/`sr-only`/`reduced-motion`.
4. **Emissores de `novo_servico` e `meta`** — não localizei chamador; não afirmei que não existem, apenas que não os encontrei.
5. **Comportamento do `CapacitorHttp: true`** com o cookie HttpOnly do refresh (`lib/api.js:35`) — risco identificado, não testado em runtime.
6. **Se o `DELETE /me/documentos/:id`** remove o objeto do bucket além da linha do banco (`documentos.js:183`) — não li o corpo completo da rota.
7. **Idempotência de `POST /servicos`** — relevante para fila offline, não verificada.
8. **Telas não abertas individualmente** para checar padrão de refetch e preservação: `Tecnicos.jsx`, `Estoque.jsx`, `Catalogo.jsx`, `Aprovacoes.jsx`, `Reparticao.jsx`, `Documentos.jsx`, `MeuPainel.jsx`, `GestorHome.jsx`. Afirmei apenas o que grep confirmou.
9. **`chaveiro-bot/src/routes/dashboard.js`** e demais rotas de leitura de KPI — não lidas nesta rodada.
10. **Consumidor de `Empresa.ativo`** (`schema.prisma:24`) — não localizado; pode existir fora de `routes/`.
11. **Conteúdo de `Configuracao.jsx`** além dos 2 links confirmados (`:33` notificações, `:71` usuários) — não sei se lista WhatsApp, Estoque etc. por papel.
12. **`prisma/schema.sqlite.prisma`** — verifiquei apenas `nivelAcesso:80`; não confirmei paridade completa com o schema Postgres.
13. **Nenhum comando de execução foi rodado** — todas as afirmações vêm de leitura estática. Não executei testes nem subi a aplicação.
14. **Arquivos `.env` reais não foram lidos** (regra do mandato); as flags foram lidas apenas em `config/env.js`.
