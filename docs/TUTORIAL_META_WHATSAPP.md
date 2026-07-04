# Tutorial — WhatsApp Cloud API (developers.facebook.com)

Passo a passo para obter as credenciais da Meta e ligar o AdmAi à **API oficial do
WhatsApp (Cloud API)**. Ao final você terá tudo que o código precisa.

> **O que só você pode fazer:** criar a conta, verificar telefone, aceitar Termos e gerar os
> tokens — tudo exige seu login/identidade. Este guia te leva clique a clique.
> **Tempo:** ~30–40 min. **Custo:** grátis para o beta (número de teste + 1.000 conversas de
> serviço grátis/mês).

---

## Antes de começar — o que vamos coletar

| Credencial | Onde aparece | Vai para |
|---|---|---|
| **App Secret** | App → Configurações → Básico | `.env` → `META_APP_SECRET` |
| **Verify Token** | *você inventa* (já gerei um abaixo) | `.env` → `WHATSAPP_VERIFY_TOKEN` |
| **Phone Number ID** | WhatsApp → Configuração da API | painel (tela de credenciais) |
| **WhatsApp Business Account ID (WABA)** | WhatsApp → Configuração da API | painel |
| **Access Token permanente** | Business Settings → Usuário do sistema | painel (cifrado no banco) |

Verify token já gerado (pode usar este):
```
WHATSAPP_VERIFY_TOKEN=24e2f222c9f2c8e571d21712b359273103c79b1815014caf
```

---

## Parte 1 — Conta e App

1. Acesse **https://business.facebook.com** e crie uma **conta Meta Business** (use seu
   Facebook como admin). Dê um nome à empresa.
2. Acesse **https://developers.facebook.com** → canto superior direito **Meus Apps** →
   **Criar app**.
3. Em *"Do que seu app precisa?"*, escolha o caso de uso **"Conectar-se a clientes pelo
   WhatsApp"** (ou tipo **Empresa/Business**).
4. Preencha **nome do app** (ex.: `AdmAi`) e **e-mail de contato**; vincule à sua
   **conta Business**. Clique em **Criar app** (pode pedir sua senha do Facebook).

---

## Parte 2 — Adicionar o WhatsApp e pegar os IDs

1. No painel do app, em **Adicionar produtos**, encontre **WhatsApp** → **Configurar**.
   - Isso cria automaticamente uma **WABA de teste** + um **número de teste grátis**.
2. Vá em **WhatsApp → Configuração da API** (*API Setup*). Nesta tela você vê:
   - um **token de acesso temporário (24h)** — serve só para testes rápidos;
   - **Identificação do número de telefone** = **Phone Number ID** → **copie e guarde**;
   - **Identificação da conta do WhatsApp Business** = **WABA ID** → **copie e guarde**;
   - um campo para enviar uma mensagem de teste (útil para confirmar que está vivo).
3. *(Mais tarde, fora do beta)* clique em **Adicionar número de telefone** para registrar
   seu **número real** (precisa ser um número **não usado** no WhatsApp comum) e verifique
   por **SMS/ligação**.

> Guarde **Phone Number ID** e **WABA ID** — você vai colá-los no painel do AdmAi.

---

## Parte 3 — App Secret (`META_APP_SECRET`)

1. No menu esquerdo: **Configurações do app → Básico**.
2. No campo **Chave Secreta do App**, clique em **Mostrar** (pede sua senha do Facebook).
3. **Copie** o valor → é o seu **`META_APP_SECRET`** (valida a assinatura do webhook).

---

## Parte 4 — Token de acesso **permanente** (System User)

O token de 24h não serve para produção. Gere um permanente:

1. Acesse **https://business.facebook.com/settings** (Configurações do Business).
2. Menu esquerdo → **Usuários → Usuários do sistema** → **Adicionar**.
   - Nome: `chaveiro-bot`; Função: **Admin** (ou Funcionário com acesso a ativos).
3. Com o usuário do sistema selecionado → **Adicionar ativos** → aba **Apps** → marque o seu
   app → permissão **Controle total**. Repita em **Contas do WhatsApp** marcando sua **WABA**.
4. Clique em **Gerar novo token** → escolha o **app** → marque as permissões:
   - **`whatsapp_business_messaging`**
   - **`whatsapp_business_management`**
5. **Copie o token gerado AGORA** (ele não é exibido de novo). Esse é o **access token** que
   você cola no painel.

> Token de System User **não expira** (a menos que você o revogue) — ideal para produção.

---

## Parte 5 — Webhook (recebimento de mensagens)

> Pré-requisito: seu backend já no ar com HTTPS (`https://api.SEU_DOMINIO`) — ver
> [DEPLOYMENT.md](DEPLOYMENT.md). Para testar local, use um túnel (ex.: `ngrok http 3000`).

1. No painel do app: **WhatsApp → Configuração** (*Configuration*) → seção **Webhook** →
   **Editar**.
2. Preencha:
   - **URL de callback:** `https://api.SEU_DOMINIO/webhook/whatsapp/cloud/1`
     *(o `1` é o `empresaId`; ajuste por empresa quando tiver mais de uma)*
   - **Token de verificação:** o `WHATSAPP_VERIFY_TOKEN` (o gerado acima).
3. Clique em **Verificar e salvar**. A Meta faz um **GET** de handshake — o backend responde
   automaticamente (rota já implementada). Se der erro, veja *Troubleshooting*.
4. Em **Campos do webhook**, clique em **Gerenciar** e **assine** o campo **`messages`**.

---

## Parte 6 — Template de mensagem (avaliação)

Mensagens proativas (fora da janela de 24h) exigem **template aprovado**:

1. Acesse o **WhatsApp Manager** → **Modelos de mensagem** → **Criar modelo**.
2. Categoria **Utilitário** (mais barato), idioma **Português (BR)**. Exemplo:
   > `Olá {{1}}! Como foi nosso atendimento? Responda de 1 a 5. ⭐`
3. Envie para aprovação (leva de minutos a algumas horas). Anote o **nome do template**.

> Quando o template estiver aprovado, me avise — eu **ligo ele no fluxo de avaliação** do bot.

---

## Parte 7 — Onde colar no AdmAi

**No servidor** (`chaveiro-bot/.env`):
```dotenv
WHATSAPP_PROVIDER=cloud
META_APP_SECRET=<App Secret da Parte 3>
WHATSAPP_VERIFY_TOKEN=24e2f222c9f2c8e571d21712b359273103c79b1815014caf
WHATSAPP_API_VERSION=v21.0
ENCRYPTION_KEY=<já gerado no deploy>
PUBLIC_URL=https://api.SEU_DOMINIO
```
Depois reinicie o backend: `docker compose ... up -d backend`.

**No painel** (por empresa) — cole o **Phone Number ID**, **WABA ID** e **access token**.
Hoje o backend já aceita via:
```
POST /api/whatsapp/cloud/credenciais
{ "phoneNumberId": "...", "wabaId": "...", "accessToken": "..." }
```
*(A tela visual no painel para isso é um dos itens que eu finalizo — me avise quando tiver as
credenciais.)* O token fica **cifrado** no banco.

---

## Parte 8 — Testar

1. Mande uma mensagem do **seu WhatsApp** para o **número de teste** (no beta, adicione seu
   número como destinatário permitido na tela *API Setup*).
2. No backend, confira os logs: deve aparecer `Webhook inbound recebido` e o bot responder.
3. Registre um serviço de ponta a ponta pelo fluxo do bot.

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| Webhook "URL de callback inválida" | Verify token diferente, ou backend fora do ar | Confira `WHATSAPP_VERIFY_TOKEN` igual nos dois lados; teste `GET https://api.SEU_DOMINIO/webhook/whatsapp/cloud/1?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=123` (deve devolver `123`) |
| Mensagens não chegam | Campo `messages` não assinado | Webhook → Campos → assine **messages** |
| `401` no envio | Token errado/expirado | Use o **token permanente** (System User), não o de 24h |
| Não envia fora de 24h | Falta template aprovado | Crie/aprovar template (Parte 6) |
| Não envia para grupo | Cloud API **não** suporta grupos | Resumo em grupo precisa de outra estratégia (já sinalizado no código) |

**Sources:** [Meta — WhatsApp Cloud API Get Started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started) ·
[Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers)
