# 🔑 ChaveiroBot — Plataforma SaaS de Gestão para Chaveiros via WhatsApp

> Plataforma **multi-empresa (SaaS)** onde os técnicos registram serviços **conversando
> com um robô no WhatsApp** e o dono acompanha receita, comissões, estoque e avaliações
> por um **painel web** (desktop + mobile).

`Node 20` · `Express` · `Prisma 5` · `PostgreSQL 16` · `React 18` · `Vite 7` · `Evolution API`

---

## 📑 Índice

1. [O que é](#-o-que-é)
2. [Arquitetura](#-arquitetura)
3. [Stack](#-stack)
4. [Modelo de domínio](#-modelo-de-domínio)
5. [Fluxo do bot (registro de serviço)](#-fluxo-do-bot-registro-de-serviço)
6. [Autenticação & Segurança](#-autenticação--segurança)
7. [API REST — endpoints](#-api-rest--endpoints)
8. [Painel — rotas](#-painel--rotas)
9. [Setup & execução](#-setup--execução)
10. [Variáveis de ambiente](#-variáveis-de-ambiente)
11. [Testes & CI](#-testes--ci)
12. [Estrutura de pastas](#-estrutura-de-pastas)
13. [🤖 Guia para IAs & Agentes](#-guia-para-ias--agentes)
14. [Roadmap](#-roadmap)

---

## 🎯 O que é

ChaveiroBot resolve a dor de **registrar e contabilizar serviços de campo** sem fricção:

- **Técnico** abre o WhatsApp, manda `serviço` no privado do robô e responde uma pergunta
  por vez (local, valor, cliente, foto…). Ao confirmar, o serviço é salvo e um resumo é
  postado no grupo da empresa.
- **Dono / admin** abre o painel e vê dashboard com receita líquida, ticket médio,
  comparativo de período, ranking de técnicos, comissões, estoque de materiais e
  avaliações dos clientes — exporta PDF de fechamento.

Cada **empresa é um _tenant_ isolado**: todos os dados de negócio são escopados por
`empresaId`, então múltiplas empresas usam a mesma instância com dados estanques.

---

## 🏗 Arquitetura

```
┌──────────────┐   mensagens     ┌───────────────┐  webhook/:empresaId   ┌──────────────────────┐
│  WhatsApp    │ ◄────────────►  │  Evolution    │ ────────────────────► │  Backend (Express)   │
│  (técnico /  │   (1 instância  │  API          │   HMAC / token        │                      │
│   cliente)   │    por empresa) │  multi-inst.  │ ◄──────────────────── │  routes/whatsapp.js  │
└──────────────┘                 └───────────────┘   envia respostas     │        │             │
                                                                          │        ▼             │
                                                          inbound.js → conversa.js (state machine)│
                                                                          │        │             │
                                                                          │        ▼             │
┌──────────────┐   GET/POST /api/*  (JWT)                ┌──────────────┐ │   Prisma (tenant)    │
│  Painel      │ ◄──────────────────────────────────────│  routes/     │ │   PostgreSQL 16      │
│  React/Vite  │                                         │  api.js      │ └──────────────────────┘
└──────────────┘                                         └──────────────┘
       ▲                                                       ▲
       │                       node-cron (agendador.js)        │     Observabilidade:
       └───────────── avaliações agendadas, resumos ───────────┘     Sentry · Prometheus /metrics · Pino
```

**Caminho de uma mensagem inbound:** Evolution chama `POST /webhook/whatsapp/:empresaId`
→ valida HMAC/token → [`inbound.js`](chaveiro-bot/src/services/inbound.js) roteia o evento
→ [`conversa.js`](chaveiro-bot/src/services/conversa.js) avança a máquina de estados →
ao confirmar, grava via Prisma e agenda a avaliação do cliente.

**Camada WhatsApp (dois modos):**
- **Evolution API multi-instância** (recomendado / multi-tenant): cada empresa tem sua
  própria instância e webhook. Ativado quando `EVOLUTION_HOST` está definido.
- **Baileys legado** (grupo único): fallback ativado por `GROUP_JID` quando não há
  Evolution. Mantido para não quebrar o ambiente antigo.

---

## 🧱 Stack

| Camada | Backend (`chaveiro-bot`) | Frontend (`chaveiro-painel`) |
|---|---|---|
| Runtime / build | Node.js 20, ESM | Vite 7 |
| Framework | Express 4 | React 18 |
| Dados | Prisma 5 + PostgreSQL 16 | — |
| WhatsApp | Evolution API v2 + Baileys (legado) | — |
| Auth | jsonwebtoken, jose (OIDC), bcryptjs, otplib (TOTP) | React Router 6 (guards) |
| Agendamento | node-cron | — |
| Validação | Zod | — |
| Arquivos | pdfkit (relatórios), qrcode | — |
| UI | — | Tailwind CSS, Recharts, lucide-react, driver.js (tour) |
| Observabilidade | @sentry/node, prom-client, pino, winston | — |
| Segurança HTTP | helmet, express-rate-limit | — |
| Testes | Vitest + Supertest | Vitest + Testing Library |

---

## 🗃 Modelo de domínio

Definido em [`prisma/schema.prisma`](chaveiro-bot/prisma/schema.prisma). **Tudo que é de
negócio carrega `empresaId`** e é isolado por tenant.

| Model | Papel |
|---|---|
| **Empresa** | O _tenant_. Raiz de isolamento — todo dado de negócio referencia `empresaId`. |
| **EmpresaWhatsapp** | Conexão WhatsApp da empresa (instância Evolution, QR, grupo de resumo, link/atraso de avaliação, segredos cifrados). |
| **Usuario** | Conta de acesso ao painel (admin/comum). Senha opcional (contas só-social não têm), 2FA TOTP, `tokenValidoApos` p/ invalidar sessões. |
| **ContaSocial** | Vínculo de login social `(provedor, sub)` → Usuario (Google/Microsoft/Apple). |
| **Tecnico** | Quem executa o serviço. Comissão %, meta mensal, telefone WhatsApp. Único por `(empresaId, telefone)`. |
| **Servico** | Registro central: valores (cobrado, material, líquido, comissão), local, cliente, foto de evidência. |
| **Material** | Catálogo + saldo real de estoque (`quantidadeAtual`, `estoqueMinimo`). Único por `(empresaId, nome)`. |
| **MovimentacaoEstoque** | Histórico de entrada/saída/ajuste com `saldoApos` (auditoria). |
| **ServicoMaterial** | Materiais consumidos por serviço (dispara baixa de estoque). |
| **Avaliacao** | Pesquisa de satisfação 1–5 enviada ao cliente após o serviço (fila por `agendadoPara`). |
| **Notificacao** | Inbox de avisos do usuário (estoque baixo, resumo, meta…). |
| **Pagamento** | Pagamentos de comissão ao técnico (calcula saldo pendente). |
| **SessaoConversa** | Estado da conversa do bot no privado (sobrevive a restart / escala horizontal). |

---

## 💬 Fluxo do bot (registro de serviço)

Implementado como **máquina de estados** em
[`conversa.js`](chaveiro-bot/src/services/conversa.js). O técnico inicia mandando
**`serviço`** no privado do robô. O bot então pergunta **um campo por vez** e valida cada
resposta:

```
local → endereço → descrição → material → valor cobrado →
nome do cliente → telefone do cliente → foto (evidência) → confirmação
```

- **Local** é um menu numerado: `Casa do cliente | Contrato | Ponto da loja | Outro`.
- **Comandos globais** em qualquer passo: `cancelar` (encerra) e `voltar` (passo anterior).
- A **sessão** é persistida em `SessaoConversa` e **expira após 30 min** de inatividade.
- Só técnicos **cadastrados** (telefone vinculado na empresa) iniciam o fluxo.
- Ao confirmar, o serviço é gravado, o **resumo é postado no grupo** da empresa e a
  **avaliação do cliente é agendada** (atraso configurável em `reviewDelayHoras`).

O cadastro manual pelo painel (`POST /api/servicos`) usa a mesma regra de cálculo e
agendamento de avaliação.

---

## 🔐 Autenticação & Segurança

- **JWT** (HS256) emitido no login; o middleware `requireAuth` valida e usa o `empresaId`
  **autoritativo do banco** (nunca o do token) — ver [`routes/api.js`](chaveiro-bot/src/routes/api.js).
- **`tokenValidoApos`**: troca de senha ou _logout-all_ invalida todos os tokens antigos.
- **2FA TOTP** (app autenticador, 6 dígitos): setup → ativar → no login a senha-OK devolve
  um **desafio de 5 min** trocado pelo código por um token de sessão.
- **Login social OIDC** (Google / Microsoft / Apple): cada provedor só aparece se a
  `*_CLIENT_ID` estiver configurada. Vincula por e-mail **verificado** (anti-takeover).
- **Rate limiting** dedicado: login (5/15min por IP), registro (3/h), oauth (20/15min),
  `/api` geral (120/min), webhook (600/min).
- **Helmet + CSP**, **HSTS**, **CORS** com allow-list (`ALLOWED_ORIGIN`; curinga só fora
  de produção).
- **Segredos cifrados em repouso** (`ENCRYPTION_KEY`): apikey de instância e `webhookSecret`.
- **Webhook autenticado** por HMAC `x-hub-signature-256` **ou** token, comparados em
  **tempo constante** (`timingSafeEqual`) — ver [`whatsapp/crypto.js`](chaveiro-bot/src/services/whatsapp/crypto.js).

---

## 🌐 API REST — endpoints

Base: `/api`. Salvo as rotas públicas abaixo, **todas exigem** `Authorization: Bearer <JWT>`.
As rotas de negócio são **escopadas por empresa** via `req.db`.

### Públicas (sem auth)
| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/api/auth/login` | Login por usuário/senha (pode devolver desafio 2FA) |
| `POST` | `/api/auth/login/2fa` | 2ª etapa: troca desafio + código TOTP por token |
| `POST` | `/api/setup` | Cria o 1º admin/empresa (bloqueia se já houver usuário) |
| `POST` | `/api/auth/register` | Auto-cadastro público (cria empresa + admin) |
| `GET` | `/api/auth/providers` | Provedores de login social habilitados |
| `POST` | `/api/auth/oauth/:provedor` | Login/cadastro social (google/microsoft/apple) |

### Conta do usuário (`/me`)
| Método | Rota | Descrição |
|---|---|---|
| `GET` `PATCH` | `/api/me` | Lê / atualiza nome, e-mail, telefone |
| `PATCH` | `/api/me/senha` | Troca de senha (invalida sessões antigas) |
| `POST` | `/api/me/2fa/setup` · `/ativar` · `/desativar` | Configura/ativa/desativa TOTP |
| `POST` | `/api/me/logout-all` | Encerra sessões em todos os dispositivos |
| `GET` `PATCH` | `/api/me/notificacoes` | Preferências de notificação (toggles) |

### Notificações (inbox)
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/notificacoes` · `/nao-lidas` | Lista / contador para badge |
| `PATCH` | `/api/notificacoes/:id/lida` | Marca como lida |
| `POST` | `/api/notificacoes/ler-todas` | Marca todas como lidas |
| `DELETE` | `/api/notificacoes/:id` | Remove aviso |

### Serviços, dashboard, técnicos
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/servicos` | Lista com filtros (`tecnico,local,endereco,inicio,fim,page,limit`) |
| `GET` | `/api/servicos/:id` | Detalhe |
| `POST` | `/api/servicos` | Cadastro manual (baixa estoque + agenda avaliação) |
| `DELETE` | `/api/servicos/:id` | Remove (**admin**) |
| `GET` | `/api/dashboard` | Métricas do período (`periodo=hoje\|semana\|mes\|custom`) + comparativo |
| `GET` | `/api/tecnicos` | Lista com totais e saldo de comissão |
| `POST` | `/api/tecnicos` | Cria técnico |
| `GET` | `/api/tecnicos/:id/perfil` | Perfil + histórico + meta |
| `PATCH` | `/api/tecnicos/:id` | Atualiza/ativa/desativa |
| `POST` | `/api/pagamentos` | Registra pagamento de comissão |

### Materiais & estoque
| Método | Rota | Descrição |
|---|---|---|
| `GET` `POST` | `/api/materiais` | Lista / cria material |
| `POST` | `/api/materiais/upload` | Upload de imagem do material |
| `PATCH` `DELETE` | `/api/materiais/:id` | Atualiza / remove |
| `GET` | `/api/estoque` | Saldos + alertas de estoque mínimo |
| `POST` | `/api/materiais/:id/movimentacao` | Entrada/saída/ajuste manual |
| `GET` | `/api/materiais/:id/movimentacoes` | Histórico de movimentações |

### Avaliações, relatório, usuários
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/avaliacoes` | Lista + média e distribuição de notas |
| `GET` | `/api/relatorio/pdf` | PDF de fechamento do período |
| `GET` `POST` | `/api/usuarios` | Lista / cria usuário (**admin**) |
| `PATCH` `DELETE` | `/api/usuarios/:id` | Atualiza / remove (**admin**) |

### Gateway WhatsApp & infraestrutura
| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/whatsapp/status` | Estado da conexão + QR (se aguardando) |
| `POST` | `/api/whatsapp/conectar` · `/desconectar` | Provisiona / encerra a instância |
| `GET` | `/api/whatsapp/grupos` | Grupos da instância (escolher o de resumo) |
| `GET` `PATCH` | `/api/whatsapp/config` | Grupo de resumo, link/atraso de avaliação |
| `POST` | `/webhook/whatsapp/:empresaId` | **Webhook inbound** da Evolution (HMAC/token) |
| `GET` | `/health` | Health check (checa o banco; 503 ao desligar) |
| `GET` | `/metrics` | Métricas Prometheus (scraping) |

---

## 🖥 Painel — rotas

Definidas em [`App.jsx`](chaveiro-painel/src/App.jsx). `RequireAuth` protege as rotas
logadas; `RequireAdmin` restringe gestão de usuários. **Sidebar** no desktop (≥ lg),
**bottom-nav** no mobile.

| Rota | Tela |
|---|---|
| `/login` | Autenticação (senha, 2FA, login social) |
| `/` | Dashboard (KPIs, gráficos, comparativo) |
| `/servicos` · `/servicos/novo` | Lista / cadastro manual |
| `/reparticao` | Fechamento de período + PDF |
| `/tecnicos` · `/tecnicos/:id` | Gestão / perfil do técnico |
| `/avaliacoes` | Avaliações dos clientes |
| `/materiais` · `/estoque` | Catálogo / controle de estoque |
| `/mais` · `/ajuda` | Menu "mais" / ajuda e tour |
| `/configuracao` | Configurações (hub) |
| `/configuracao/perfil` · `/seguranca` · `/notificacoes` · `/whatsapp` | Conta, segurança/2FA, preferências, conexão WhatsApp |
| `/configuracao/usuarios` | Gestão de usuários (**admin**) |

**Identidade visual:** tema dark com destaque âmbar/dourado; display **Barlow Condensed**,
corpo **DM Sans**; mobile-first (375–428px) com layout responsivo até desktop.

---

## ⚙️ Setup & execução

### Pré-requisitos
- Node.js 20+
- Docker + Docker Compose
- Uma conta WhatsApp (para parear via QR Code na Evolution API)

### Opção A — Docker Compose (tudo de uma vez)

```bash
cd chaveiro-bot
cp .env.example .env          # edite com seus valores reais
docker-compose up -d          # postgres + redis + evolution-api + backend + painel
```

Sobe: Postgres (interno), Redis, Evolution API (`:8080`), backend (`:3000`) e o painel
servido por nginx (`:8081`).

### Opção B — Desenvolvimento local

```bash
# 1) Infra de apoio
cd chaveiro-bot
docker-compose up -d postgres redis evolution-api

# 2) Backend (porta 3000)
npm install
npx prisma migrate dev
npm run dev

# 3) Frontend (porta 5173) — em outro terminal
cd ../chaveiro-painel
npm install
npm run dev
```

Painel: **http://localhost:5173** · API: **http://localhost:3000**

### Primeiro acesso
- Defina `ADMIN_USERNAME` + `ADMIN_PASSWORD` no `.env` e o backend cria o admin + empresa
  no boot (idempotente, **só em banco vazio** — ver [`bootstrap.js`](chaveiro-bot/src/services/bootstrap.js)); **ou**
- Use `POST /api/setup` / a tela de cadastro para criar o primeiro admin/empresa.

### Conectar o WhatsApp
Pelo painel em **Configuração → WhatsApp**: clique em **Conectar**, escaneie o QR Code e
escolha o grupo que receberá os resumos. O webhook é registrado automaticamente apontando
para `PUBLIC_URL` + `/webhook/whatsapp/:empresaId`.

---

## 🔧 Variáveis de ambiente

Validadas por Zod no boot — ver [`config/env.js`](chaveiro-bot/src/config/env.js). Boot
**falha rápido** se algo obrigatório faltar.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | String de conexão Postgres |
| `JWT_SECRET` | ✅ | Segredo do JWT (mín. 32 chars) |
| `API_TOKEN` | ✅ | Token de API legado |
| `PORT` · `NODE_ENV` | — | Padrão `3000` / `development` |
| `ALLOWED_ORIGIN` | prod | Origem do painel (CORS) |
| `EVOLUTION_HOST` | gateway | Host da Evolution API (ativa o modo multi-tenant) |
| `EVOLUTION_API_KEY` | se `EVOLUTION_HOST` | API key global da Evolution |
| `ENCRYPTION_KEY` | se `EVOLUTION_HOST` | Chave mestra p/ cifrar segredos por empresa (≥16; ≥32 recomendado) |
| `PUBLIC_URL` | recomendada | URL pública do backend (monta o webhook) |
| `GROUP_JID` | legado | Ativa o fluxo Baileys de grupo único (sem Evolution) |
| `GOOGLE_CLIENT_ID` · `MICROSOFT_CLIENT_ID` · `MICROSOFT_TENANT` · `APPLE_CLIENT_ID` | — | Habilitam login social por provedor |
| `ADMIN_USERNAME` · `ADMIN_PASSWORD` · `ADMIN_NOME` · `ADMIN_EMPRESA` | — | Bootstrap de admin em banco vazio |
| `SENTRY_DSN` · `LOG_LEVEL` · `APP_VERSION` | — | Observabilidade (ausente = Sentry off) |

> Em produção, lembrar também de `DIRECT_URL` (migrations via Session pooler do Supabase) e `WHATSAPP_PROVIDER` — ver `instrucoes-deploy.md`.

---

## ✅ Testes & CI

```bash
# Backend (chaveiro-bot)
npm test                 # unitários (Vitest)
npm run test:integration # integração (Supertest + Postgres real)

# Frontend (chaveiro-painel)
npm test                 # Vitest + Testing Library
npm run build            # build de produção (Vite)
```

O pipeline [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda, em cada push/PR
para `main`/`master`: **backend** (unit + integração contra um Postgres de serviço +
`npm audit --audit-level=high`) e **frontend** (testes + build + audit).

---

## 📁 Estrutura de pastas

```
AdmAi/
├── chaveiro-bot/                  # Backend Node.js (ESM)
│   ├── src/
│   │   ├── server.js              # Entry point: Sentry, listen, WhatsApp, cron, shutdown
│   │   ├── app.js                 # Monta o Express (importável em testes, sem abrir porta)
│   │   ├── config/
│   │   │   ├── env.js             # Validação de env (Zod)
│   │   │   ├── sentry.js          # Observabilidade de erros
│   │   │   └── metrics.js         # Métricas Prometheus
│   │   ├── db/
│   │   │   ├── prisma.js          # Cliente Prisma singleton (global)
│   │   │   └── tenant.js          # prismaParaEmpresa() — client escopado por tenant
│   │   ├── routes/
│   │   │   ├── api.js             # API REST do painel (auth, serviços, dashboard, …)
│   │   │   └── whatsapp.js        # Gateway + webhook inbound por empresa
│   │   └── services/
│   │       ├── auth.js  oauth.js  totp.js  senha.js   # autenticação
│   │       ├── baileys.js  whatsapp/gateway.js  whatsapp/crypto.js  whatsapp/evolution-client.js
│   │       ├── inbound.js  conversa.js                # roteamento + máquina de estados
│   │       ├── parser.js  servico.js                  # parsing e CRUD de serviço
│   │       ├── estoque.js  catalogo.js                # materiais e estoque
│   │       ├── avaliacao.js  notificacao.js  agendador.js  # avaliações, avisos, cron
│   │       ├── busca.js                                # helper de busca case-insensitive (Postgres/SQLite)
│   │       ├── relatorio.js  bootstrap.js
│   │   └── utils/ (logger.js, formatar.js)
│   ├── prisma/schema.prisma + migrations/
│   ├── scripts/backup-db.sh · backup-uploads.sh · restore.sh · restore-uploads.sh
│   ├── docker-compose.yml · docker-compose.prod.yml · Dockerfile · .env.example
│
└── chaveiro-painel/               # Frontend React + Vite
    ├── src/
    │   ├── App.jsx  main.jsx       # Roteamento + guards + layout responsivo
    │   ├── contexts/AuthContext.jsx
    │   ├── lib/ (api.js, moeda.js, senha.js)
    │   ├── hooks/ (usePullToRefresh, useFormPersist, useOffline, useAnalytics)
    │   ├── components/ (Sidebar, BottomNav, Toast, MaterialPicker, TourGuide, …)
    │   └── pages/ (Dashboard, Servicos, NovoServico, Reparticao, Tecnicos,
    │               PerfilTecnico, Avaliacoes, Catalogo, Estoque, Notificacoes,
    │               Configuracao, Perfil, Seguranca, ConfiguracaoBot, Usuarios, …)
    └── Dockerfile (nginx)
```

---

## 🤖 Guia para IAs & Agentes

> Esta seção é a referência completa pra qualquer agente (orquestrador ou subagente) que
> for trabalhar neste projeto — tanto as regras específicas do ChaveiroBot quanto a
> política geral de como planejar, executar e reportar qualquer tarefa. Ela incorpora o
> que antes vivia separado num `CLAUDE.md`, então este README passa a ser a referência
> única — não é mais necessário consultar um arquivo separado de orquestração. Pra
> infraestrutura de deploy (VPS, Supabase, Docker em produção), consultar também
> `instrucoes-deploy.md`, que é um documento companheiro e específico de infra.

### 13.1 Regras específicas deste projeto

**Regra de ouro: multi-tenancy.**
Toda query de dados de negócio usa `req.db`, não o `prisma` global. `req.db` é um
client Prisma **escopado à empresa do usuário** (`prismaParaEmpresa(empresaId)` em
[`db/tenant.js`](chaveiro-bot/src/db/tenant.js)), injetado por `requireAuth`. Usar o
`prisma` global para dados escopados **vaza dados entre empresas (IDOR)**.

- ✅ `req.db.servico.findMany(...)` — isolado por empresa automaticamente.
- ⚠️ `prisma.*` direto **só** para entidades não escopadas (ex.: `Usuario`, `Empresa`,
  `Notificacao` por `usuarioId`) ou onde já se filtra explicitamente por `empresaId`.
- Ao receber IDs do cliente (ex.: `materiais[].materialId`), **valide que pertencem à
  empresa** antes de usar — veja o padrão em `POST /api/servicos`.

**Onde colocar o quê**
- **Rotas/HTTP** → `chaveiro-bot/src/routes/`. **Regra de negócio** → `src/services/`.
- **Validação de input** com **Zod no boundary** (toda rota que recebe body).
- **Schema** em `prisma/schema.prisma` → **sempre gere uma migration** (`npx prisma migrate dev`).
- **Frontend**: páginas em `src/pages/`, chamadas de API centralizadas em `src/lib/api.js`.

**Padrões a reusar (não reinventar)**
- `requireAuth`, `adminOnly` — [`routes/api.js`](chaveiro-bot/src/routes/api.js)
- `construirFiltroPeriodo` / `construirFiltroPeriodoAnterior` — filtros de data + comparativo
- `buscarOuCriarTecnico` (`services/servico.js`), `movimentarEstoque`/`darBaixaPorServico`
  (`services/estoque.js`), `agendarAvaliacao` (`services/avaliacao.js`),
  `resolverPreferencias` (`services/notificacao.js`)
- `contemInsensivel` / `igualInsensivel` (`services/busca.js`) — busca case-insensitive que
  já detecta o provider (Postgres vs SQLite). **Use sempre este helper** em vez de
  `mode: 'insensitive'` direto no Prisma — é exatamente o ponto que já causou uma
  regressão de busca case-sensitive em produção uma vez.
- TOTP: `gerarSegredoTotp`, `verificarCodigo`, `cifrarSegredo`/`decifrarSegredo` (`services/totp.js`)
- WhatsApp/cripto: `verificarHmac`, `compararToken` (`services/whatsapp/crypto.js`)

**Segurança — não regredir**
- **Nunca logue** senhas, tokens, segredos TOTP ou apikeys.
- **401 vs 400**: nos fluxos de **2FA e OAuth**, falhas de código/token retornam **400**
  (não 401) de propósito — o interceptor do painel redireciona para `/login` em qualquer
  401, o que descartaria o passo. Mantenha esse contrato.
- Segredos por empresa ficam **cifrados** (`ENCRYPTION_KEY`); nunca persista em claro.
- Não enfraqueça os rate limiters de `auth/*` nem a validação HMAC/token do webhook.
- `app.set('trust proxy', N)` deve refletir o número real de proxies na frente do backend
  (hoje: Caddy → nginx → backend = 2). Se a cadeia mudar, esse número precisa mudar junto
  — senão rate-limit e logs passam a usar o IP errado.

**Convenções do projeto**
- **Idioma pt-BR** em código, comentários, mensagens de UI/bot e commits.
- Arquivos **< 500 linhas**; prefira **editar** a criar; **não** crie docs sem pedido.
- **Não** commite secrets/`.env`. **Sem** trailer `Co-Authored-By` salvo se
  `.claude/settings.json` habilitar.

**Checklist antes de concluir uma mudança**
1. Li o arquivo antes de editar.
2. Queries de negócio passam por `req.db` (tenant), e IDs do cliente foram validados.
3. Input validado com Zod no boundary.
4. Mudou o schema? Criei a migration.
5. Busca textual usa `busca.js`, não `mode: 'insensitive'` direto.
6. `npm test` (e `test:integration` se mexi em rota/DB) passam no backend.
7. `npm test` + `npm run build` passam no painel.

---

### 13.2 Como toda tarefa deve ser conduzida

Cada seção abaixo existe porque resolve um problema real de operar múltiplos agentes sem
supervisão constante: gastar token sem necessidade, alucinar um "concluído" que não
aconteceu, ou tomar uma decisão irreversível sem o contexto certo.

**Fluxo obrigatório: planejamento → execução → relatório, sempre nessa ordem.**
O custo de pensar errado é ínfimo; o custo de executar errado é real (regressão em
produção, dado perdido, comissão calculada errada pra um técnico de verdade). Separar as
duas fases garante que o raciocínio caro acontece antes de qualquer ação irreversível.

#### Fase 1 — Planejamento

Nenhuma alteração é feita nesta fase. Para cada tarefa, produzir:

**Análise da solicitação** — o que precisa ser feito (e o que está explicitamente fora do
escopo), por que precisa ser feito, benefícios esperados (mensuráveis quando possível),
riscos envolvidos especificamente nesta tarefa, e impacto esperado (quais services/rotas/
models são tocados direta ou indiretamente — ex: mexer em `servico.js` toca cálculo de
comissão, estoque e agendamento de avaliação ao mesmo tempo).

**Estratégia de execução** — sequência exata e por quê essa ordem (ex: migration antes do
código que a usa), dependências entre etapas, critérios de sucesso definidos *antes* de
executar, e alternativas consideradas e descartadas (com o motivo, pra não reconsiderar a
mesma alternativa rejeitada numa tarefa futura).

**Recrutamento de agentes** — decidir quais agentes são necessários, nem mais nem menos.
Para cada um: nome/função, responsabilidade específica (uma frase — se precisa de
parágrafo, são dois agentes), objetivo, entradas, saídas esperadas, e critérios de
validação **concretos e verificáveis** ("testes passam", "lint sem warnings", nunca "parece
correto").

```
Agent: System Architect
Objetivo: Definir arquitetura da solução.
Entradas: especificação da feature, schema.prisma atual, docs/blueprint/ existente.
Saídas: documento arquitetural + plano técnico.
Critérios de validação: plano revisado por pelo menos 1 agente revisor antes da execução.
```

**Teto de paralelismo: 5 agentes simultâneos por tarefa.** Acima disso exige justificativa
explícita no plano — caso contrário, recrutar o mínimo necessário.

**Sugestões e alternativas** — quando houver mais de uma abordagem razoável, apresentar
antes de escolher: prós, contras, custo computacional, consumo estimado de tokens
(ordem de grandeza basta), complexidade, e recomendação final com justificativa de uma
linha.

**Seleção de modelo** — mapeamento concreto pra este projeto:

| Modo | Quando usar aqui | Modelo |
|---|---|---|
| Deep Thinking | Mudança de arquitetura multi-tenant, schema do Prisma, fluxo de auth/2FA/OAuth, lógica de comissão | Opus |
| Fast Execution | Ajuste de UI no painel, texto de mensagem do bot, formatação, boilerplate | Haiku |
| Research Mode | Investigar comportamento da Evolution API, bibliotecas (`jose`, `otplib`), docs externas | Sonnet |
| Validation Mode | Validar cálculo de comissão/estoque, revisar isolamento de tenant | Sonnet (Opus se tocar cálculo financeiro real) |
| Refactoring Mode | Reestruturar `conversa.js`/`inbound.js` sem mudar comportamento observável | Sonnet |

Heurística geral: comece pelo modelo mais barato que provavelmente resolve a tarefa; suba
de tier só quando a tarefa exigir, nunca "por garantia". A diferença de custo por token
entre tiers é de uma ordem de grandeza — usar o tier errado sistematicamente é o maior
alavancador de custo deste documento. Confirme taxas atuais em platform.claude.com/docs
antes de qualquer cálculo de orçamento, já que mudam com o tempo.

**Gestão de contexto e memória**
- Contra alucinação: nenhuma tarefa é reportada como concluída sem evidência anexada
  (diff real, output de teste, log de build). Sem isso, o item não é válido.
- Contexto obsoleto (de tarefa já concluída e não relacionada) é descartado, não
  acumulado. Informação já estabelecida (ex: "produção usa Supabase via session pooler")
  não é reinvestigada — fica registrada uma vez num log persistente.
- Decisões importantes (arquitetura, trade-off aceito, alternativa descartada) vão num log
  persistente (`docs/decisions.md` ou equivalente), não só no relatório da tarefa.
- Incerteza é explicitada, nunca preenchida com suposição silenciosa. Se não houver como
  validar e a tarefa depender disso, é gatilho de bloqueio técnico real (ver abaixo).

#### Fase 2 — Execução

Começa automaticamente após o plano estar pronto. Seguir o plano rigorosamente, validar
cada etapa antes de avançar, corrigir falhas imediatamente (não "ver no final").

**Paralelismo:** executar em paralelo tarefas sem dependência entre si, respeitando o teto
de 5 agentes simultâneos.

**Falha de agente:**
1. Primeira falha: uma única retentativa automática, corrigindo o que for possível (ex:
   contexto que faltou).
2. Segunda falha na mesma tarefa: não tentar de novo sem mudar a abordagem — isso é
   bloqueio técnico real, reportado pra decisão humana.
3. Falha de um agente nunca é silenciosamente contornada por outro sem registro.

**Continuidade operacional:** ao concluir uma tarefa, identificar o próximo gargalo e
seguir sem esperar instrução nova. Fontes válidas: testes falhando, erros de lint/build
pendentes, itens do backlog/blueprint, dependências que acabaram de ser destravadas.

### 13.3 Política de autonomia operacional

Os agentes têm autonomia máxima pra executar o necessário, sem pedir confirmação
intermediária quando a próxima ação é inferível com segurança a partir do contexto, do
plano aprovado, da documentação existente ou de melhores práticas técnicas.

**Por quê isso é a configuração certa na maioria dos casos:** a maior parte das ações de
desenvolvimento (ler um arquivo, rodar um teste, corrigir um lint) é reversível sem custo —
pedir confirmação nelas só desperdiça tempo sem reduzir risco real.

**Autorizado sem confirmação:** ler, criar, modificar e reorganizar arquivos do projeto;
executar comandos locais; instalar dependências (via gerenciador do projeto, respeitando o
lockfile); corrigir erros; refatorar; criar e executar testes; atualizar documentação;
criar scripts auxiliares; pesquisar o necessário; coordenar múltiplos agentes; tomar
decisões técnicas compatíveis com os objetivos do projeto.

**A execução continua sem intervenção até uma destas quatro condições:**

1. **Todos os objetivos concluídos**, pelos critérios de sucesso definidos na Fase 1 — não
   por impressão do agente.
2. **Sem tarefas pendentes identificáveis** nas fontes válidas de "próximo gargalo".
3. **Bloqueio técnico real** — deliberadamente restrito, pra não virar desculpa: falta uma
   credencial que só você tem (Meta, Sentry, SSH); dependência externa fora do ar; a
   especificação é genuinamente ambígua de um jeito que duas leituras válidas levam a
   resultados diferentes; documentos em conflito direto; a mesma tarefa falhou duas vezes.
4. **Decisão estratégica que exige participação humana** — ações irreversíveis em
   produção, onde o erro não é retrabalho de código, é cliente real sem conseguir usar o
   sistema ou dado perdido sem recuperação. Concretamente, neste projeto:
   - Deploy direto em produção (fora de staging), sem ter passado pela validação
     combinada (ex: CSP em modo enforced, smoke test).
   - `git push --force`, rebase de histórico compartilhado.
   - Apagar backup existente (Postgres ou volume `backend_uploads` com as fotos de
     evidência dos serviços) antes de confirmar que o novo backup foi gerado com sucesso.
   - Migration destrutiva (`DROP`, `TRUNCATE`, remoção de coluna) em produção sem backup
     confirmado nas últimas 24h — especialmente arriscado em `Servico`, `Pagamento` e
     `MovimentacaoEstoque`, que são dados financeiros e de auditoria.
   - Alterar ou remover `ENCRYPTION_KEY`, `JWT_SECRET`, `API_TOKEN`, ou segredos da
     Evolution/Meta/Sentry/GHCR no `.env` de produção. Perder `ENCRYPTION_KEY` em
     particular torna os segredos cifrados por empresa (apikey de instância,
     `webhookSecret`) irrecuperáveis — não tem como decifrar de volta.
   - Pausar, deletar ou alterar o plano do projeto Supabase.
   - Qualquer mudança na lógica de cálculo de comissão/valor líquido (`servico.js`,
     `relatorio.js`) que afete serviços já registrados — é dinheiro real de técnicos
     reais.
   - Enfraquecer rate limiters de auth/webhook ou a validação HMAC/token do webhook.

   Nesses casos, o agente planeja e prepara tudo normalmente — só pausa exatamente nesse
   ponto pra um "ok" explícito antes de executar, sem isso interromper o resto do fluxo
   autônomo ao redor.

**Critério de escolha entre alternativas válidas** (quando não é caso do item 4): qualidade,
velocidade, custo computacional, consumo de tokens, facilidade de manutenção — com
desempate pela mesma ordem das Diretrizes de Eficiência abaixo (precisão > confiabilidade >
economia de tokens > velocidade > escalabilidade). Toda escolha feita assim é registrada no
relatório, com a alternativa descartada.

### 13.4 Relatórios obrigatórios

**Quando gerar:** ao final da tarefa de cada agente recrutado; imediatamente antes de
qualquer ação da categoria "decisão estratégica" (mesmo que a execução ainda não tenha
acontecido); a cada bloco de 5+ arquivos alterados numa tarefa longa, pra visibilidade
incremental.

**Estrutura:**
- **Resumo executivo** — o que foi realizado, status atual.
- **Alterações executadas** — arquivos modificados, componentes afetados, configs alteradas.
- **Justificativa** — por que cada alteração foi feita, benefícios obtidos.
- **Validação (com evidência obrigatória)** — como foi validado + resultado real anexado
  (output de teste, diff, log de build). Sem evidência, o item não conta como completo.
- **Próximos passos** — pendências, melhorias futuras, recomendações.

### 13.5 Diretrizes de eficiência

Prioridades, em ordem, usadas pra resolver qualquer empate de decisão: **precisão >
confiabilidade > economia de tokens > velocidade > escalabilidade.**

Evitar, concretamente: execuções redundantes (re-validar algo que não mudou desde a última
validação); leitura desnecessária de arquivo já no contexto ativo ou já resumido; reanálise
de algo já registrado no log de decisões; criação de agentes além do teto sem justificativa
explícita.

### 13.6 Critério de excelência

Considerar a tarefa concluída só quando: todos os objetivos do plano foram atendidos (não
"a maior parte"); os resultados foram validados com evidência, não inferidos; os relatórios
foram gerados nos gatilhos certos; não existem erros conhecidos *não documentados* (um erro
documentado em "próximos passos" é aceitável; omitido não é); e a solução entregue é a mais
eficiente considerando custo, desempenho e manutenção futura — não necessariamente a
primeira que funcionou.

---

## 🗺 Roadmap

- **Resumo automático semanal** no grupo (ranking de receita por técnico, destaque da semana)
- **Validação de líquido** no bot (recalcular e avisar divergências de cobrado − material)
- **Histórico por endereço** (detectar clientes recorrentes e alertar o admin)
- **Verificação de e-mail/telefone** (OTP) ligada à estrutura já existente em `Usuario`
- **App Android nativo** (PWA → React Native + Expo)
- **Integração contábil** (exportação em planilha compatível com MEI)