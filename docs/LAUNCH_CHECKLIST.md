# AdmAi — Checklist de Lançamento

Guia passo a passo para configurar todos os serviços externos e fazer o deploy do zero.
Execute na ordem abaixo. Seções marcadas com ⚠️ bloqueiam o lançamento se puladas.

---

## 1. Dependências ⚠️

```bash
# Backend
cd chaveiro-bot
npm install

# Frontend
cd ../chaveiro-painel
npm install
```

Pacotes novos: `resend`, `stripe`, `cookie-parser` (backend) · `posthog-js`, `zod` (frontend).

---

## 2. Banco de dados (Supabase + Prisma) ⚠️

### 2.1 Criar o banco

1. Acesse [supabase.com](https://supabase.com) → **New project**
2. Anote a **Connection string** em *Settings → Database → Connection string → URI*
3. No `.env` do backend, defina:

```env
DATABASE_URL="postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres"
```

### 2.2 Rodar as migrations

```bash
cd chaveiro-bot
npx prisma migrate deploy    # produção (aplica migrations existentes)
# OU em desenvolvimento:
npx prisma migrate dev --name launch-ready
```

Modelos novos criados nesta migration:
- `CodigoRecuperacaoTotp` — códigos de backup do 2FA
- `Assinatura` — plano/billing por empresa
- `ConviteUsuario` — convites por e-mail
- `AuditLog` — log de ações privilegiadas
- `SessaoUsuario` — rastreamento de sessões ativas
- `RefreshToken` — tokens de renovação de sessão (HttpOnly cookie)

### 2.3 Gerar o client Prisma

```bash
npx prisma generate
```

---

## 3. E-mail transacional (Resend) ⚠️

### 3.1 Criar conta e API key

1. Acesse [resend.com](https://resend.com) → **Add API Key** → escopo *Full access*
2. Copie a chave (`re_...`)

### 3.2 Configurar domínio de envio

1. Em Resend → **Domains** → **Add Domain** → `barbers-flow.com`
2. Adicione os registros DNS indicados (SPF, DKIM, DMARC) no painel do seu registrador
3. Aguarde verificação (geralmente < 10 min)

### 3.3 Variáveis de ambiente

```env
RESEND_API_KEY="re_..."
FROM_EMAIL="noreply@barbers-flow.com"
SUPPORT_EMAIL="suporte@barbers-flow.com"
FRONTEND_URL="https://painel.barbers-flow.com"
```

> **Teste**: após o deploy, crie uma conta de teste e verifique se o e-mail de boas-vindas chega.

---

## 4. Pagamentos (Stripe) ⚠️

### 4.1 Criar conta e ativar

1. Acesse [dashboard.stripe.com](https://dashboard.stripe.com)
2. Complete a ativação da conta (dados da empresa, banco)

### 4.2 Criar o produto/preço

1. **Products** → **Add product**
   - Nome: `AdmAi Pro`
   - Preço: escolha o valor mensal (ex.: R$ 97/mês) → **Recurring**
2. Copie o **Price ID** (`price_...`)

### 4.3 Configurar webhook

1. **Developers → Webhooks** → **Add endpoint**
   - URL: `https://api.barbers-flow.com/webhook/stripe`
   - Eventos a escutar:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
2. Copie o **Signing secret** (`whsec_...`)

### 4.4 Variáveis de ambiente

```env
STRIPE_SECRET_KEY="sk_live_..."        # use sk_test_ em dev
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_PRO="price_..."
```

> **Teste em dev**: use `stripe listen --forward-to localhost:3000/webhook/stripe` (Stripe CLI).

---

## 5. Redis (para BullMQ e rate limiting) ⚠️

Use [Railway Redis](https://railway.app) ou [Upstash](https://upstash.com):

```env
REDIS_URL="redis://default:[SENHA]@[HOST]:6379"
```

---

## 6. Segurança — variáveis críticas ⚠️

```env
JWT_SECRET="[string aleatória >= 64 chars]"
ENCRYPTION_KEY="[string aleatória de exatamente 64 hex chars]"
```

Gere com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Execute duas vezes: uma para cada variável.

---

## 7. CORS — cookie de refresh token ⚠️

Com a implementação de refresh tokens, o backend precisa saber o origin exato do frontend para enviar `Access-Control-Allow-Credentials: true`. **Sem isso o login automático por cookie não funciona.**

```env
ALLOWED_ORIGIN="https://painel.barbers-flow.com"
```

Em desenvolvimento local (sem Docker):
```env
ALLOWED_ORIGIN="http://localhost:5173"
```

---

## 8. Suporte ao cliente (Crisp Chat)

### 8.1 Criar conta

1. Acesse [crisp.chat](https://crisp.chat) → **Start for free**
2. Crie um *Workspace* → copie o **Website ID** (`xxxxxxxx-xxxx-...`)

### 8.2 Variável de ambiente (frontend)

No painel da Cloudflare Pages → **Settings → Environment variables**:
```
VITE_CRISP_ID = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> O chat aparece automaticamente no canto inferior direito. Sem a variável, o script não carrega.

---

## 9. Analytics (PostHog)

### 9.1 Criar conta e projeto

1. Acesse [posthog.com](https://posthog.com) → **New project**
2. Copie a **Project API Key** (`phc_...`) e o **Host** (geralmente `https://app.posthog.com`)

### 9.2 Variáveis de ambiente (frontend)

```
VITE_POSTHOG_KEY  = phc_...
VITE_POSTHOG_HOST = https://app.posthog.com
```

### 9.3 Configurar NPS Survey (sem código)

1. PostHog → **Surveys** → **New Survey**
   - Tipo: **NPS**
   - Pergunta: *"O quanto você recomendaria o AdmAi para outro chaveiro?"*
   - Trigger: **After X days** → `7`
   - Repeat: **Every 90 days**
   - Display: **All pages**
2. Ativar a survey

---

## 10. Status page (BetterStack)

1. Acesse [betterstack.com](https://betterstack.com) → **Uptime** → **New Monitor**
   - URL: `https://api.barbers-flow.com/health`
   - Intervalo: 1 minuto
   - Alerta: e-mail + (opcional) Slack
2. **Status pages** → criar página pública
   - Adicione o monitor `AdmAi API`
   - Configure domínio personalizado: `status.barbers-flow.com`
3. No DNS: adicione CNAME `status` → endereço fornecido pelo BetterStack

---

## 11. Verificação de e-mail (gate opcional)

Por padrão o gate de e-mail verificado está **desligado**. Ligue quando estiver pronto para exigir verificação de novos usuários:

```env
REQUIRE_EMAIL_VERIFICATION="true"
```

> Usuários existentes sem e-mail verificado serão bloqueados ao definir isso. Considere fazer um script de migração antes.

---

## 12. Deploy — Backend (Railway)

### 12.1 Configurar serviço

1. Railway → **New Project** → **Deploy from GitHub** → `AdmAi` → `chaveiro-bot`
2. Adicione as variáveis de ambiente listadas nas seções acima
3. **Settings → Deploy** → Start command: `node src/server.js`
4. Configure domínio: `api.barbers-flow.com`

### 12.2 Checklist de variáveis do backend

```env
# Banco
DATABASE_URL=

# Cache / Filas
REDIS_URL=

# Segurança
JWT_SECRET=
ENCRYPTION_KEY=
ALLOWED_ORIGIN=https://painel.barbers-flow.com

# E-mail
RESEND_API_KEY=
FROM_EMAIL=noreply@barbers-flow.com
SUPPORT_EMAIL=suporte@barbers-flow.com
FRONTEND_URL=https://painel.barbers-flow.com

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PRO=

# WhatsApp (Evolution API)
EVOLUTION_HOST=
EVOLUTION_API_KEY=

# Sentry (opcional mas recomendado)
SENTRY_DSN=

# Feature flags
NODE_ENV=production
REQUIRE_EMAIL_VERIFICATION=false
PORT=3000
```

---

## 13. Deploy — Frontend (Cloudflare Pages)

### 13.1 Conectar repositório

1. Cloudflare → **Pages** → **Create a project** → **Connect to Git** → `chaveiro-painel`
2. Build settings:
   - **Framework**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`

### 13.2 Checklist de variáveis (Cloudflare Pages)

```
VITE_API_URL      = https://api.barbers-flow.com/api
VITE_CRISP_ID     = (ID do Crisp)
VITE_POSTHOG_KEY  = phc_...
VITE_POSTHOG_HOST = https://app.posthog.com
```

> **Atenção**: variáveis `VITE_*` são embutidas no bundle no momento do build — uma mudança exige rebuild.

### 13.3 Domínio personalizado

Pages → seu projeto → **Custom domains** → `painel.barbers-flow.com`

---

## 14. Legal — placeholders pendentes ⚠️

Abra `chaveiro-painel/src/lib/legal.js` e substitua:

| Placeholder | O que colocar |
|---|---|
| `[NOME DA EMPRESA]` | Razão social (ex.: *Chaveiro Bot LTDA*) |
| `[CNPJ]` | CNPJ registrado |
| `[CIDADE/UF]` | Foro (ex.: *São Paulo/SP*) |
| `[NOME]` (DPO) | Nome do Encarregado de Dados (pode ser o fundador) |
| `[valor]` | Teto de responsabilidade contratual (consulte advogado) |

> ⚠️ Faça revisão jurídica dos documentos antes de publicar. Os textos de Termos e Privacidade têm validade legal.

---

## 15. Smoke tests pós-deploy

Execute manualmente após o primeiro deploy em produção:

- [ ] `GET https://api.barbers-flow.com/health` retorna `{ "status": "ok" }`
- [ ] Criar uma conta nova → receber e-mail de verificação
- [ ] Clicar no link do e-mail → conta verificada
- [ ] Login → token renovado silenciosamente em < 1h (testar com JWT curto em dev)
- [ ] "Esqueci a senha" → receber e-mail com link → redefinir com sucesso
- [ ] Ativar 2FA → receber 10 códigos de recuperação
- [ ] Clicar "Entrar sem senha" → receber magic link → login sem senha
- [ ] Plano Pro: clicar "Assinar" → ir para Stripe Checkout → retornar com `status: active`
- [ ] Webhook Stripe: verificar log do Railway após checkout → `Assinatura` criada no banco
- [ ] Cookie banner aparece na primeira visita; PostHog só rastreia após "Aceitar todos"
- [ ] Crisp chat abre ao clicar "Falar com suporte" em `/ajuda`
- [ ] `https://status.barbers-flow.com` carrega a status page pública
- [ ] Convidar usuário por e-mail → link funciona → novo usuário criado

---

## Resumo de domínios/subdomínios

| Subdomínio | Serviço | Tipo DNS |
|---|---|---|
| `painel.barbers-flow.com` | Cloudflare Pages | CNAME |
| `api.barbers-flow.com` | Railway | CNAME |
| `status.barbers-flow.com` | BetterStack | CNAME |
