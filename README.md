# 🔑 ChaveiroBot — Sistema de Gestão via WhatsApp

Sistema completo de gestão operacional para empresas de chaveiro. Os técnicos registram serviços enviando uma mensagem padronizada no grupo WhatsApp; o bot extrai os dados, salva no banco e confirma. O dono acompanha tudo pelo painel mobile.

---

## Visão Geral da Arquitetura

```
WhatsApp Group
     │  mensagem template
     ▼
Evolution API  ──►  POST /webhook  ──►  Parser
                                          │
                                    PostgreSQL (Prisma)
                                          │
                          GET /api/*  ◄──┘
                               │
                        React Frontend
                      (painel mobile-first)
```

---

## Pré-requisitos

- Node.js 20+
- Docker + Docker Compose
- Conta WhatsApp (para conectar ao Evolution API via QR Code)

---

## Instalação e Setup

### 1. Clone e configure as variáveis de ambiente

```bash
# Backend
cp chaveiro-bot/.env.example chaveiro-bot/.env
# Edite chaveiro-bot/.env com seus valores reais
```

### 2. Suba o banco de dados e a Evolution API

```bash
cd chaveiro-bot
docker-compose up -d postgres evolution-api
```

Aguarde ~30 segundos para o Postgres inicializar.

### 3. Instale dependências e rode as migrations

```bash
# Backend
cd chaveiro-bot
npm install
npx prisma migrate dev --name init

# Frontend
cd ../chaveiro-painel
npm install
```

### 4. Inicie os servidores

```bash
# Terminal 1 — Backend (porta 3000)
cd chaveiro-bot
npm run dev

# Terminal 2 — Frontend (porta 5173)
cd chaveiro-painel
npm run dev
```

Acesse o painel em: **http://localhost:5173**

---

## Configurando o WhatsApp (Evolution API)

### 1. Crie a instância

Após o `docker-compose up`, acesse `http://localhost:8080` e crie uma instância com o nome `chaveiro` (mesmo valor de `EVOLUTION_INSTANCE` no `.env`).

### 2. Conecte o WhatsApp via QR Code

Na interface da Evolution API, clique em **"Conectar"** e escaneie o QR Code com o WhatsApp do número que será o bot.

### 3. Configure o Webhook

Na Evolution API, configure o webhook da instância `chaveiro` para apontar para:

```
URL: http://SEU_IP_OU_DOMINIO:3000/webhook
Eventos habilitados: MESSAGES_UPSERT
```

> Em desenvolvimento local com o Evolution API no Docker, use o IP da rede interna do Docker ou exponha o backend com ngrok.

### 4. Descubra o GROUP_JID do grupo

```bash
curl -X GET "http://localhost:8080/group/fetchAllGroups/chaveiro?getParticipants=false" \
  -H "apikey: SUA_API_KEY_AQUI"
```

Encontre o grupo desejado na resposta e copie o campo `"id"` (formato: `120363xxxxxx@g.us`).
Coloque esse valor em `GROUP_JID` no `.env`.

### 5. Fixe o template no grupo

Pin no grupo WhatsApp o template abaixo para que os técnicos sempre tenham como referência:

```
✅ SERVIÇO CONCLUÍDO
Técnico: [nome do técnico]
Local: [Casa do cliente | Contrato | Ponto da loja | Outro]
Endereço: [endereço completo ou N/A]
Serviço: [descrição do que foi feito]
Material: [descrição e valor do material ou "Nenhum"]
Valor cobrado: R$[valor]
Valor do material: R$[valor ou 0]
Líquido: R$[valor]
```

---

## API REST — Endpoints

Todas as rotas `/api/*` exigem o header:
```
Authorization: Bearer SEU_API_TOKEN
```

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/servicos` | Lista serviços com filtros e paginação |
| `GET` | `/api/servicos/:id` | Busca serviço por ID |
| `POST` | `/api/servicos` | Cadastro manual de serviço |
| `DELETE` | `/api/servicos/:id` | Remove serviço |
| `GET` | `/api/dashboard` | Métricas consolidadas por período |
| `GET` | `/api/tecnicos` | Lista técnicos com totais |
| `PATCH` | `/api/tecnicos/:id` | Ativa/desativa técnico |
| `GET` | `/api/relatorio/pdf` | Gera PDF do período |
| `GET` | `/health` | Health check |

### Parâmetros do dashboard

```
?periodo=hoje|semana|mes|custom
?inicio=2024-01-01&fim=2024-01-31  (somente com periodo=custom)
```

### Parâmetros dos serviços

```
?tecnico=Iago
?local=Casa do cliente
?inicio=2024-01-01&fim=2024-01-31
?page=1&limit=20
```

---

## Painel Administrativo

### Telas disponíveis

| Rota | Tela |
|------|------|
| `/login` | Autenticação por token |
| `/` | Dashboard com KPIs e gráficos |
| `/servicos` | Lista de serviços com filtros |
| `/servicos/novo` | Cadastro manual de serviço |
| `/reparticao` | Fechamento de período + exportar PDF |
| `/tecnicos` | Gestão de técnicos |

### Identidade visual

- **Tema:** Dark, com destaque âmbar/dourado
- **Fonte display:** Barlow Condensed (números e títulos)
- **Fonte corpo:** DM Sans
- **Mobile-first:** otimizado para 375–428px

---

## Estrutura de Pastas

```
AdmAi/
├── chaveiro-bot/          # Backend Node.js
│   ├── src/
│   │   ├── server.js      # Entry point + Express
│   │   ├── config/env.js  # Validação de variáveis de ambiente
│   │   ├── routes/
│   │   │   ├── webhook.js # Recebe eventos do WhatsApp
│   │   │   └── api.js     # API REST para o painel
│   │   ├── services/
│   │   │   ├── parser.js  # Extrai dados do template
│   │   │   ├── whatsapp.js# Envia mensagens + fila de retry
│   │   │   ├── servico.js # CRUD de serviços e técnicos
│   │   │   └── relatorio.js # Geração de PDF
│   │   ├── db/prisma.js   # Cliente Prisma (singleton)
│   │   └── utils/logger.js# Winston logger estruturado
│   ├── prisma/schema.prisma
│   ├── docker-compose.yml
│   └── .env.example
│
└── chaveiro-painel/       # Frontend React
    ├── src/
    │   ├── App.jsx        # Roteamento + layout
    │   ├── lib/api.js     # Axios + formatadores
    │   ├── hooks/usePullToRefresh.js
    │   ├── components/
    │   │   ├── BottomNav.jsx
    │   │   ├── Toast.jsx
    │   │   ├── Skeleton.jsx
    │   │   ├── EstadoVazio.jsx
    │   │   └── ErroBanner.jsx
    │   └── pages/
    │       ├── Login.jsx
    │       ├── Dashboard.jsx
    │       ├── Servicos.jsx
    │       ├── NovoServico.jsx
    │       ├── Reparticao.jsx
    │       └── Tecnicos.jsx
    └── package.json
```

---

## Roadmap — Próximas Versões

- **Resumo automático semanal:** todo domingo às 18h, o bot envia no grupo um ranking da semana (receita por técnico, total de serviços, destaque do melhor)
- **Foto de evidência:** técnico envia foto junto com o template; bot salva a URL da mídia no registro do serviço
- **Validação de líquido:** bot recalcula e avisa se o valor líquido informado não bate com cobrado − material
- **Histórico por endereço:** detecta serviços no mesmo endereço e alerta o admin sobre clientes recorrentes
- **Meta mensal por técnico:** configura meta individual e exibe barra de progresso no painel
- **App Android nativo:** migrar o PWA para React Native + Expo para publicar na Play Store
- **Integração contábil:** exportação de serviços em formato de planilha compatível com declaração MEI
- **Multi-grupo:** suporte a múltiplos grupos WhatsApp (ex: grupo geral + grupo de contratos separado)

---

## Tecnologias

| Camada | Stack |
|--------|-------|
| Runtime | Node.js 20 |
| Framework | Express.js |
| ORM | Prisma 5 |
| Banco | PostgreSQL 16 |
| WhatsApp | Evolution API v2 |
| PDF | PDFKit |
| Validação | Zod |
| Log | Winston |
| Frontend | React 18 + Vite |
| Estilo | Tailwind CSS |
| Gráficos | Recharts |
| Roteamento | React Router v6 |
| HTTP | Axios |
| Ícones | Lucide React |
