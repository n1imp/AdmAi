# ROUND-01 — EOS-Security-Privacy

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-Security-Privacy` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | Quais restrições o baseline de segurança e a LGPD impõem às decisões funcionais transversais da Rodada 1 |
| Restrição explícita | **Não reabrir a Frente de Segurança.** Não é caça a vulnerabilidade nova |
| Grau de confiança declarado | Alta no inventário; nenhuma conclusão jurídica |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Relançado após o primeiro lançamento ter sido interrompido por limite de sessão.
>
> **Nota do orquestrador:** o §12 deste relatório registra explicitamente que qualquer
> enquadramento jurídico está fora do mandato e exige validação profissional. Nenhuma conclusão
> de conformidade legal deve ser extraída deste documento.

---

# Relatório EOS-Security-Privacy — Rodada 1, Frente de Descoberta Funcional

**Mandato:** quais restrições o baseline de segurança e a LGPD impõem às decisões funcionais transversais da Rodada 1.
**Modo:** somente leitura. Nenhum arquivo criado/editado. A frente de segurança **não** foi reaberta — nada aqui é caça a vulnerabilidade nova.

---

## 1. Escopo analisado

Cobri, de ponta a ponta, os pontos onde dado pessoal **entra**, **é lido**, **é editado**, **é exportado** e **sai** do sistema, mais os mecanismos transversais que condicionam qualquer funcionalidade futura:

- **Modelo de dados completo** — `chaveiro-bot/prisma/schema.prisma` (544 linhas, 24 models), campo a campo, para montar o inventário de dado pessoal.
- **Telas de coleta do painel** — cadastro de funcionário (RH), cadastro de serviço (dono e funcionário), batida de ponto (selfie + GPS), perfil próprio, documentos.
- **Superfície HTTP inteira** — 11 arquivos de rota do backend, cada handler classificado por guard (`requireAuth` / `requirePermissao` / `adminOnly` / `podeProprio` / flag).
- **Mecanismos transversais** — RBAC (`permissoes.js`), isolamento multi-tenant (`db/tenant.js`), sessão/JWT/refresh, auditoria (`auditoria.js`), retenção (`agendador.js`), storage privado vs. disco público, redação de PII em log/Sentry, cifra em repouso.
- **Autorização no frontend** — guards de rota, construção de menu, interceptor HTTP, contexto de auth.
- **Feature flags** — comportamento observável de cada uma quando desligada.
- **Governança já fechada** — `SECURITY_BASELINE_v1.md` e os 16 itens de `SECURITY_HARDENING_BACKLOG.md`, lidos **apenas** para classificar quais condicionam decisão funcional.

**Fora do escopo (por instrução):** busca de vulnerabilidade nova, proposta de patch, conclusão jurídica definitiva.

---

## 2. Arquivos consultados

**Backend — modelo e infraestrutura:** `chaveiro-bot/prisma/schema.prisma`, `src/app.js`, `src/config/env.js`, `src/config/sentry.js`, `src/utils/logger.js`, `src/db/tenant.js`.

**Backend — auth, RBAC, auditoria:** `src/middlewares/auth.js`, `src/services/permissoes.js`, `src/services/auth.js`, `src/services/auditoria.js`, `src/services/totp.js`, `src/services/whatsapp/crypto.js` (parcial).

**Backend — rotas:** `src/routes/admin.js`, `account.js`, `tecnicos.js`, `servicos.js`, `documentos.js`, `auth.js` (parcial dirigida), `whatsapp.js`, `google.js`, `billing.js`, `estoque.js` (mapa de guards).

**Backend — serviços de domínio:** `src/services/agendador.js`, `storage.js`, `relatorio.js`, `avaliacao.js`, `inbound.js` (parcial), `ponto.js`, `notificacao.js` (parcial).

**Painel:** `src/lib/api.js`, `src/contexts/AuthContext.jsx`, `src/components/Guards.jsx`, `src/config/navigation.js` (parcial), `src/App.jsx`, `src/pages/MeuPonto.jsx`, `NovoTecnico.jsx`, `NovoServico.jsx`, `NovoServicoFuncionario.jsx`, `Documentos.jsx`, `Seguranca.jsx`, `Perfil.jsx`, `Servicos.jsx`, `PerfilTecnico.jsx`, `ConfiguracaoBot.jsx`, `src/components/BancoHoras.jsx`, `src/hooks/useFormPersist.js`, `src/lib/legal.js`.

**Governança:** `docs/agent-environment/SECURITY_BASELINE_v1.md`, `SECURITY_HARDENING_BACKLOG.md`, `AGENTS.md`.

Nenhum `.env` real foi lido. Nenhum segredo é reproduzido neste relatório.

---

## 3. Evidências com `arquivo:linha`

### 3.1 — INVENTÁRIO DE DADO PESSOAL *(entrega central do mandato)*

Legenda de titular: **D** = dono/usuário do painel · **F** = funcionário/técnico · **C** = cliente final (nunca cria conta).

#### Bloco A — Titular: dono / usuário do painel

| # | Dado | Tit. | Onde é coletado | Finalidade aparente no código | Obrig.? | Quem lê | Quem edita | Retenção atual | Exclusão / anonimização | Auditado? |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | `Usuario.nome` | D | `routes/auth.js:133-143` (auto-cadastro); `routes/admin.js:204-240` (dono cria); painel `Perfil.jsx:66-69` | Identificação da conta; vai no payload do JWT (`services/auth.js:12-25`) | **Sim** (`min(2)`) | Próprio (`account.js:106-118` + `SELECT_ME` `account.js:44-59`); quem tem `usuarios.ver` (`admin.js:190-202`, `SELECT_USUARIO` `admin.js:30-42`) | Próprio (`PATCH /me`, `account.js:244-297`); quem tem `usuarios.editar` (`admin.js:259-363`) | **Nenhuma** | Só na exclusão de conta (`account.js:372-425`; cascata `account.js:82-104`) | Criação `admin.js:242-250`; exclusão `admin.js:383-391`. **Auto-edição via `PATCH /me` não é auditada** |
| A2 | `Usuario.email` | D | `auth.js:140` (registro, obrigatório); `account.js:258-279` (troca com confirmação no e-mail antigo); OIDC `ContaSocial.email` (`schema.prisma:281`) | Login, recuperação de senha, magic link, convite, código de exclusão de conta | **Sim** no registro; opcional depois | Próprio (`SELECT_ME` `account.js:48`). **Não** exposto a terceiros: `SELECT_USUARIO` (`admin.js:30-42`) omite `email` | Próprio (`account.js:258-279`) | **Nenhuma** | Exclusão de conta | **Não** |
| A3 | `Usuario.telefone` | D | `auth.js:141` (registro, obrigatório); `account.js:280-284` | Identidade no robô de número único; OTP/2FA por WhatsApp (`account.js:507-520`) | **Sim** no registro | Próprio; quem tem `usuarios.ver` (`admin.js:34`) | Próprio (`account.js:280-284`) | **Nenhuma** | Exclusão de conta | **Não** |
| A4 | **IP de sessão** `SessaoUsuario.ip` | D/F | `middlewares/auth.js:56-69` — upsert automático **em toda requisição autenticada**, sem aviso ao titular | Listar "sessões ativas" em Segurança | Automático (não há opt-out) | **Só o próprio** (`GET /me/sessoes`, `account.js:617-630`, `take:10`) | Ninguém | **NENHUMA** — ver §5.3 | `POST /me/logout-all` (`account.js:632-646`) ou cascata da exclusão do usuário (`schema.prisma:504`) | **Não** |
| A5 | **User-agent de sessão** `SessaoUsuario.userAgent` | D/F | `middlewares/auth.js:64` (truncado em 300 chars; `schema.prisma:508`) | Idem A4 | Automático | Idem A4 | Ninguém | **NENHUMA** | Idem A4 | **Não** |
| A6 | **IP em auditoria** `AuditLog.ip` | D | `admin.js:249, 333, 354, 390, 437` (`req.ip`) | Rastro de ação privilegiada | Automático | **NINGUÉM** — nenhum endpoint lê `AuditLog` (única referência: `services/auditoria.js:15`) | Ninguém | **NENHUMA** | **Nenhuma** — não é apagado nem pela exclusão da empresa (`account.js:82-104` não inclui `auditLog`) | n/a |
| A7 | `Usuario.preferencias` / `notificacoes` | D | `account.js:680-707`; `admin.js:57-78` | Preferências de UI e de aviso | Não | Próprio | Próprio | Nenhuma | Exclusão de conta | **Não** |
| A8 | `ConviteUsuario.email` | D | `admin.js:400-449` (`:425-431`) | Convidar pessoa para a empresa | Sim | Quem tem `usuarios.editar` | — | **NENHUMA** (linha persiste após aceite/expiração) | **Nenhuma** rotina | Envio auditado (`admin.js:437-444`) |

#### Bloco B — Titular: funcionário / técnico (pode não ter conta)

| # | Dado | Tit. | Onde é coletado | Finalidade aparente no código | Obrig.? | Quem lê | Quem edita | Retenção atual | Exclusão / anonimização | Auditado? |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | `Tecnico.nome` | F | `routes/tecnicos.js:49, 246`; painel `NovoTecnico.jsx`; auto-criação em `servicos.js:184` e `account.js:563-571` | Identificar quem executou o serviço; comissão | **Sim** | `tecnicos.ver` (`tecnicos.js:188-228`); próprio via `/me/metricas` (`account.js:186-192`) | `tecnicos.editar` (`tecnicos.js:507-541`) | **Nenhuma** | Só cascata da empresa (`account.js:98`) | **Não** |
| B2 | `Tecnico.telefone` / `telefoneDisplay` | F | `tecnicos.js:50, 246-247`; canonizado por `canonizarTelefone` | Identidade no robô; login por telefone | Não (mas sem ele não há acesso ao painel: `tecnicos.js:321-324`) | `tecnicos.ver` (`tecnicos.js:207-208`) | `tecnicos.editar` (`tecnicos.js:516-531`) | **Nenhuma** | Cascata da empresa | **Não** |
| B3 | **CPF** `Tecnico.cpf` | F | Zod `tecnicos.js:53`; gravação `tecnicos.js:250`; formulário `NovoTecnico.jsx:61, 111, 188-189` | **NENHUMA no código** — grep em todo `chaveiro-bot/src` só encontra a gravação (`tecnicos.js:250`). Nunca lido por regra de negócio | Não | Qualquer um com `tecnicos.ver` via `GET /tecnicos/:id/perfil` → `tecnicos.js:485` devolve `...tecnico` **inteiro**. O painel **não renderiza** o campo | **NINGUÉM** — o schema do `PATCH /tecnicos/:id` (`tecnicos.js:511-518`) não aceita `cpf` | **NENHUMA** | **Nenhuma** rotina; só cascata da empresa | **Não** |
| B4 | **Data de nascimento** `Tecnico.dataNascimento` | F | `tecnicos.js:54, 251`; `NovoTecnico.jsx:63, 113, 207-208` | **NENHUMA no código** | Não (mas a Zod rejeita data malformada: `tecnicos.js:69-82`) | Idem B3 (`tecnicos.js:485`) | **Ninguém** | **NENHUMA** | Cascata da empresa | **Não** |
| B5 | **Endereço do funcionário** `Tecnico.endereco` | F | `tecnicos.js:55, 252` (`max(300)`); `NovoTecnico.jsx:64, 114, 214-215` | **NENHUMA no código** | Não | Idem B3 | **Ninguém** | **NENHUMA** | Cascata da empresa | **Não** |
| B6 | **Salário / valor-hora** `salarioBase`, `valorHora`, `dataAdmissao`, `horaExtraPercentual`, `adicionalNoturno` | F | `tecnicos.js:58-63, 255-260`; `NovoTecnico.jsx:67-68, 76, 121-131` | **NENHUMA no código** — o cálculo de ponto usa só `modalidade`/`jornadaDiariaMin` (`services/ponto.js:42-44`) | Não | Idem B3 — devolvidos em `GET /tecnicos/:id/perfil` a quem tem `tecnicos.ver` (**gestor tem**, `permissoes.js:80`) | **Ninguém** | **NENHUMA** | Cascata da empresa | **Não** |
| B7 | **Foto de perfil** `Tecnico.fotoPerfil` | F | `tecnicos.js:87-99` (valida data-URI, ≤2 MB, magic-bytes) → gravada **como base64 na coluna do banco** (`tecnicos.js:263`), não em storage | Exibição no painel | Não | `tecnicos.ver` (`tecnicos.js:211`); próprio (`account.js:191`) | **Ninguém** (o `PATCH` não aceita o campo) | **NENHUMA** | Cascata da empresa | **Não** |
| B8 | **Selfie de ponto** `BatidaPonto.selfieUrl` | F | `POST /ponto/bater` — `tecnicos.js:571-624`; gravação `salvarSelfiePonto` `tecnicos.js:110-142`; UI `MeuPonto.jsx` + `components/CapturaSelfie.jsx` | Prova de jornada / anti-fraude (`schema.prisma:391-393`) | Zod diz **opcional** (`tecnicos.js:185`); o painel torna **de facto obrigatória** (`MeuPonto.jsx:94-107`) | Próprio técnico **ou** quem tem `ponto.ver` — checagem em `tecnicos.js:647-652`; serve via URL assinada de 60 s (`tecnicos.js:656-662`) | Ninguém | **365 dias** (`services/agendador.js:168`), expurgo em `agendador.js:217-241` | Expurgo automático apaga storage + 2 diretórios de disco e zera a coluna. **Não há botão de apagar sob demanda** | **Não** — só `logger.info('ponto_batido_painel', …)` booleano (`tecnicos.js:606-611`) |
| B9 | **Geolocalização de ponto** `BatidaPonto.lat/lng/precisao` | F | `tecnicos.js:181-186, 599-601`; captura no navegador com `enableHighAccuracy:true` (`MeuPonto.jsx:55-58`) | Idem B8 | Opcional no schema; o painel pede sempre | Idem B8 — devolvida em `carregarPontoHoje` (`tecnicos.js:173-174`) e exibida como ícone (`MeuPonto.jsx:281-288`) | Ninguém | **365 dias** (`agendador.js:168, 236-239`) | Idem B8 | **Não** |
| B10 | **Registro de jornada** `RegistroPonto` (horários) | F | `services/ponto.js` via `tecnicos.js:580-584` | Banco de horas | Automático na batida | Próprio (`/ponto/hoje`, `tecnicos.js:626-637`); `ponto.ver` (`tecnicos.js:378-403`) | `ponto.editar` existe no catálogo (`permissoes.js:40`) mas **não há endpoint de ajuste** | **NENHUMA** (só as provas são expurgadas) | Cascata da empresa (`account.js:90`) | **Não** |
| B11 | **Documentos do funcionário** `DocumentoTecnico` (contrato, RG, CPF, CNH, comprovante) | F | `routes/documentos.js:90-134`; tipos em `:37`; bucket privado `documentos-tecnico` (`:34`) ou disco `./uploads-docs` (`:35, 117-118`) | Guarda de documento pessoal do próprio funcionário | Não | **Só o próprio técnico** (`documentos.js:141-143`) — nem o dono lê | Só o próprio (upload/delete) | **NENHUMA** | `DELETE /me/documentos/:id` (`documentos.js:174-197`) apaga banco + objeto. Sem rotina automática | **Não** |
| B12 | `Tecnico.comissao` / `metaMensal` | F | `tecnicos.js:51-52, 248-249` | Cálculo de comissão e meta | `comissao` default 0 | `tecnicos.ver`; próprio (`account.js:186-192`) | `tecnicos.editar` (`tecnicos.js:513-514`) | Nenhuma | Cascata | **Não** |
| B13 | `Pagamento` (valor pago ao técnico) | F | `tecnicos.js:543-569` | Registro de pagamento de comissão | Sim | `tecnicos.ver` (`tecnicos.js:499`); `financeiro.editar` para criar | — | Nenhuma | Cascata (`account.js:95`) | **Não** — só `logger.info` (`tecnicos.js:560-563`) |

#### Bloco C — Titular: cliente final (não tem conta, não tem login, não recebe aviso)

| # | Dado | Tit. | Onde é coletado | Finalidade aparente no código | Obrig.? | Quem lê | Quem edita | Retenção atual | Exclusão / anonimização | Auditado? |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | `Servico.clienteNome` | C | Painel dono `NovoServico.jsx:23, 157, 365-366`; painel funcionário `NovoServicoFuncionario.jsx:19, 99`; backend `routes/servicos.js:33, 215`; WhatsApp `services/inbound.js:197` | Personalizar a mensagem de pedido de avaliação (`services/avaliacao.js:170-178`) | Não | `servicos.ver` (`servicos.js:66, 143`) — objeto `Servico` devolvido **inteiro**, sem filtro de campo | `servicos.editar` (não há endpoint de PATCH de serviço) | **NENHUMA** | `POST /lgpd/anonimizar-cliente` (`admin.js:451-489`) → `null` | **Não** |
| C2 | `Servico.clienteTelefone` | C | Idem C1 (`servicos.js:34, 216`; `inbound.js:198`) | Destino do disparo de avaliação (`avaliacao.js:91`) | Não | Idem C1; indexado (`schema.prisma:165`) | — | **NENHUMA** | `admin.js:451-489` → `null` | **Não** |
| C3 | `Avaliacao.clienteNome` / `clienteTelefone` | C | `services/avaliacao.js:25-45` (agendamento a partir do serviço) | Enviar e casar a resposta da avaliação | `clienteTelefone` **é NOT NULL** (`schema.prisma:342`) | `avaliacoes.ver` (`servicos.js:337-362`) | — | **180 dias** (`agendador.js:163, 191-194`) | Anonimização automática (`clienteTelefone:''`, `clienteNome:null`, `comentario:null`) + `admin.js:451-489` | **Não** |
| C4 | `Avaliacao.nota` / `comentario` (texto livre do cliente) | C | `services/avaliacao.js:141-158` — recebido por WhatsApp, cortado em 500 chars (`:156`) | Nota e comentário do atendimento | — | `avaliacoes.ver` | — | **180 dias** | Idem C3 | **Não** |
| C5 | **Endereço do serviço** `Servico.endereco` + `Servico.local` | C | `servicos.js:30, 206-207`; `NovoServico.jsx:18, 152, 282-283` (o `local` default é literalmente `'Casa do cliente'` — `NovoServico.jsx:17`) | Localizar o atendimento; filtro de busca (`servicos.js:78-79`) | `local` **sim** (`min(2)`); `endereco` não | `servicos.ver`; **indexado** (`schema.prisma:163-164`) e pesquisável por substring | — | **NENHUMA** | **NÃO É ANONIMIZADO** por `/lgpd/anonimizar-cliente` — ver §5.1 | **Não** |
| C6 | **Foto de evidência de serviço** `Servico.fotoEvidencia` | C | **Só via WhatsApp**: `services/inbound.js:196` → `services/servico.js:39`. O painel **não coleta** (o `schemaServico` de `servicos.js:27-41` não tem o campo) mas **exibe** (`Servicos.jsx:167-175`) | Prova visual do serviço (`schema.prisma:137`) | Não | Servida por `express.static('./uploads')` **sem auth e sem escopo de tenant** — `src/app.js:79` | — | **NENHUMA** | **Nenhuma** — nem o expurgo de ponto (`agendador.js:217-241`) toca este campo | **Não** |
| C7 | `Servico.msgOriginal` / `remetenteWpp` | C/F | Painel: `servicos.js:217-218` (`'painel-func:<id>'`); WhatsApp: `inbound.js:200-201` (texto cru + telefone do técnico) | Rastro de origem | Automático | `servicos.ver` — devolvido inteiro | — | **NENHUMA** | **Não anonimizado** por `/lgpd/anonimizar-cliente` | **Não** |
| C8 | `AvaliacaoGoogle.autorNome` / `comentario` / `analiseJson` | C | Sync do Google Business (`agendador.js:247-290`), atrás de `GOOGLE_REVIEWS_ENABLED` | Listar/responder avaliação pública | — | `avaliacoes.ver` (`routes/google.js:216-218`) | `avaliacoes.editar` (resposta) | **NENHUMA** | **Nenhuma**; e o model está **fora** de `MODELOS_ESCOPADOS` (`db/tenant.js:24-34`) — backlog item 6 | **Não** |
| C9 | `SessaoConversa.jid` + `dadosParciais` | C/F | `schema.prisma:321-334`; escrita pelo fluxo de conversa do bot | Máquina de estados do registro por WhatsApp | Automático | Bot | Bot | **7 dias** (`agendador.js:164, 188-190`) | `deleteMany` automático | **Não** |
| C10 | `Notificacao.titulo` / `mensagem` | D/F | `services/notificacao.js:41` | Inbox de avisos | Automático | Só o destinatário (`admin.js:80-95`) | Destinatário marca lida / apaga (`admin.js:138-149`) | **NENHUMA** | Só ação manual do usuário | **Não** |

---

### 3.2 — Evidências dos demais pontos do mandato

**Retenção implementada (base do orquestrador, reconfirmada):** `services/agendador.js:163` (`RETENCAO_AVALIACAO_DIAS=180`), `:164` (`RETENCAO_SESSAO_DIAS=7`), `:168` (`RETENCAO_PONTO_DIAS=365`), orquestrador `:183-210`, expurgo de prova de ponto `:217-241`, cron `30 3 * * *` em `:374`.

**Regras codificadas do baseline:**
- Zod nos boundaries — `AGENTS.md:130`; exemplos: `servicos.js:27-41`, `tecnicos.js:47-82`, `documentos.js:42-46`, `admin.js:452-455`, e o próprio env em `config/env.js:12-199`.
- `req.db` para dado de tenant — `AGENTS.md:131`; implementação `db/tenant.js:97-144`; injeção `middlewares/auth.js:53`; lista escopada `db/tenant.js:24-34`.
- `requireAuth` / `requirePermissao` no backend — `AGENTS.md:132`; `middlewares/auth.js:17-86, 93-98`; declaração explícita "esconder no front não é segurança" em `services/permissoes.js:15`.
- Self-scope via `req.user.tecnicoId`, nunca por input — `middlewares/auth.js:48`; usos: `tecnicos.js:575, 589, 613, 630`; `documentos.js:53, 75, 122, 142, 179, 184`; `account.js:138, 143, 230, 233`; `servicos.js:611, 622`.
- Segredos cifrados em repouso (AES-256-GCM) — `services/whatsapp/crypto.js:15, 22-26, 37`; consumido por `services/totp.js:2`, `schema.prisma:57`, `:418-419`, `:255`.
- PII nunca logada — `utils/logger.js:6-28` (28 chaves redigidas) + `:33-48` (redator recursivo); Sentry `config/sentry.js:62-73`.

**Sessão:** access token HS256 com `expiresIn:'1h'` (`services/auth.js:23`); refresh opaco de 7 dias (`services/auth.js:36`), hash SHA-256 (`:31-33`), cookie `httpOnly` + `sameSite:'strict'` + `path:'/api/auth'` (`routes/auth.js:69-73, 81-85`); rotação a cada uso (`routes/auth.js:715-716`); corte global `tokenValidoApos` (`services/auth.js:51-55`, checado em `middlewares/auth.js:29-31`), setado em troca de senha (`account.js:319`) e logout-all (`account.js:635`).

**Autorização no painel é UX declarada:** `Guards.jsx:8-11` ("estes guards são apenas UX. A autorização real é imposta no backend"); menu montado por permissão em `navigation.js:344-345, 352-353`.

**Feature flags:** `DOCUMENTOS_ENABLED` → `documentos.js:49-57`; `SERVICO_ANDAMENTO_ENABLED` → `servicos.js:607-615`; `GOOGLE_REVIEWS_ENABLED` → `routes/google.js:25-26` e `services/google/businessClient.js:22`; `WHATSAPP_HABILITADO` → `services/inbound.js:44-49`.

**Exportação:** PDF/CSV de banco de horas em `routes/tecnicos.js:405-430` (gera `services/relatorio.js:242-353` e `:358-389`); PDF financeiro em `routes/estoque.js:261-275`. UI: `components/BancoHoras.jsx:72-90`, renderizado **apenas** dentro de `PerfilTecnico.jsx:298`.

---

## 4. Comportamento atual

### 4.1 Titulares que não são usuários — o que `POST /api/lgpd/anonimizar-cliente` faz exatamente

`routes/admin.js:451-489`.

- **Quem pode chamar:** `adminOnly` (`admin.js:451`) → exige `req.user.admin === true` (`middlewares/auth.js:88-91`), flag mantida em sincronia com `papel === 'dono'` (`admin.js:235, 314`). **Gestor não pode**, mesmo com `avaliacoes.editar`.
- **Entrada:** `{ telefone: string ≥8 }` validado por Zod (`admin.js:452-455`). Expande para o conjunto `{bruto, só-dígitos, variantesTelefone(bruto)}` (`admin.js:463-466`).
- **O que muda, exatamente:**
  - `Servico` → `clienteNome = null`, `clienteTelefone = null` (`admin.js:467-470`).
  - `Avaliacao` → `clienteNome = null`, `clienteTelefone = ''`, `comentario = null` (`admin.js:471-474`).
- **Escopo:** ambas usam `req.db` (`admin.js:468, 471`), e `Servico`/`Avaliacao` estão em `MODELOS_ESCOPADOS` (`db/tenant.js:26, 30`) → restrita ao tenant do chamador.
- **O que NÃO toca:** `Servico.endereco`, `Servico.local`, `Servico.descricao`, `Servico.msgOriginal`, `Servico.remetenteWpp`, `Servico.fotoEvidencia`, `AvaliacaoGoogle.autorNome/comentario`, `SessaoConversa.dadosParciais`.
- **Rastro:** `logger.info('lgpd_anonimizar_cliente', …)` (`admin.js:475-479`) — **não gera `AuditLog`**.
- **UI:** `Seguranca.jsx:476-506` (só para `isAdmin`), ação em `:303-325`, confirmação em `:615-630`.

### 4.2 Autorização frontend vs. backend

**Regra atual, confirmada:** o painel **esconde**, o backend **impõe**. O padrão é aplicado com disciplina — cada rota de módulo tem `requirePermissao`, e cada rota de escopo próprio tem `podeProprio` **dentro** do handler.

**Pontos onde o painel dá impressão de proteção mas não protege** (nenhum é vulnerabilidade — são desalinhamentos de contrato que precisam virar regra explícita):

1. **`GET /tecnicos/:id/perfil` devolve o `Tecnico` inteiro** — `tecnicos.js:485` faz `{...tecnico}`, incluindo `cpf`, `dataNascimento`, `endereco`, `salarioBase`, `valorHora`, `dataAdmissao`. O painel **não renderiza nenhum desses campos**. Quem tem `tecnicos.ver` — **inclusive o gestor** (`permissoes.js:80`) — recebe o dado sensível de RH no JSON e nunca o vê na tela.
2. **`GET /servicos` e `GET /servicos/:id` devolvem o `Servico` inteiro** — `servicos.js:104-112, 147`: `clienteTelefone`, `endereco`, `msgOriginal`, `remetenteWpp`, `fotoEvidencia` vão para qualquer um com `servicos.ver`. Não há projeção de campo por papel.
3. **`/configuracao/whatsapp` não tem guard de rota no painel** — `App.jsx:313-322` envolve `ConfiguracaoBot` só em `RequireAuth`, e `GET /api/bot/whatsapp/status` é `requireAuth` puro (`routes/whatsapp.js:93`). O QR é redigido para não-super-admin (`whatsapp.js:99`) e conectar/desconectar são super-admin (`whatsapp.js:111, 128`) — a proteção real existe, mas o **menu sugere** que a tela é de configuração.
4. **`GET /billing/status` é `requireAuth` puro** — `routes/billing.js:46`: qualquer usuário lê o plano/status da assinatura da empresa. Checkout e portal são `adminOnly` (`:18, 29`).
5. **Rotas de escopo próprio sem guard de rota no painel** — `/meu-ponto`, `/meus-servicos`, `/meus-documentos` estão só em `RequireAuth` (`App.jsx:181-220`). Um funcionário com `proprio.bater_ponto=false` vê a tela e leva 403 do backend (`tecnicos.js:573-574`).
6. **`Documentos.jsx:69-71` colapsa 404 e 403 no mesmo estado "indisponível"** — o backend distingue (`documentos.js:50-56`), mas a UI não. É um desalinhamento **na direção segura**.

**Onde o painel falha fechado (correto):** `AuthContext.jsx:96-98` — se `GET /me/permissoes` falha, `permissoes` vira `{}` e `pode()` retorna `false` para tudo, exceto dono.

### 4.3 Sessão — comportamento observável

| Mecanismo | Valor / arquivo:linha |
|---|---|
| Access token (JWT) | HS256, **1 hora** — `services/auth.js:23` |
| Refresh token | opaco de 32 bytes, **7 dias** — `services/auth.js:27-37`; cookie `httpOnly`/`sameSite:'strict'`/`path:'/api/auth'` — `routes/auth.js:69-73, 81-85` |
| Rotação de refresh | delete + insert a cada uso — `routes/auth.js:715-716` |
| `tokenValidoApos` | corte global; `middlewares/auth.js:29-31`; setado em `account.js:319` e `account.js:635` |
| `SessaoUsuario` | upsert por `(usuarioId, jwtIat)` em **toda** requisição autenticada — `middlewares/auth.js:56-69`; listagem própria `take:10` — `account.js:617-630` |
| Logout-all | `tokenValidoApos = now` + apaga todos os `RefreshToken` e `SessaoUsuario` + limpa cookie — `account.js:632-646` |

**O que o usuário observa no meio de um formulário quando a sessão expira — há dois caminhos, e eles divergem:**

- **Caminho A (chamada de API):** o interceptor pega o 401, chama `POST /auth/refresh` uma única vez (deduplicado) e **repete a requisição original** — `lib/api.js:29-59`. Se o refresh também falha, `limparSessao()` + `window.location.href = '/login'` (`api.js:60-63`). Isso é **navegação dura do browser**: todo estado React em memória é perdido.
- **Caminho B (navegação de rota):** `RequireAuth` avalia `tokenExpirado()` a cada render (`Guards.jsx:17-21`), que só olha o `exp` do JWT no `localStorage` (`AuthContext.jsx:17-22`). Se o access token passou de 1 h, ele **chama `logout()` e redireciona para `/login` sem nunca tentar o refresh** — mesmo com o cookie de refresh ainda válido por até 7 dias.

**Consequência prática:** um funcionário que preenche o cadastro de técnico por mais de 1 h e então navega é deslogado sem aviso e sem tentativa de renovação. O único formulário protegido contra perda é o de serviço, por `useFormPersist` — `hooks/useFormPersist.js:14-19`, usado em `NovoServico.jsx:42` e `NovoServicoFuncionario.jsx:33`. **Efeito colateral de privacidade:** esse hook grava nome e telefone do cliente final em `localStorage` em texto claro.

### 4.4 Feature flags — comportamento atual quando desligadas

| Flag | Default | Comportamento observável quando OFF | Onde |
|---|---|---|---|
| `DOCUMENTOS_ENABLED` | off | **404** com corpo `{erro:'Recurso não disponível'}` — avaliado **antes** da checagem de capacidade | `documentos.js:49-52` |
| `SERVICO_ANDAMENTO_ENABLED` | off | **404** com corpo `{erro:'Recurso não disponível'}`, idem | `servicos.js:607-610` |
| `GOOGLE_REVIEWS_ENABLED` | off | **200 com MOCK/fixtures** — as rotas respondem normalmente; o cron de sync vira no-op | `routes/google.js:25-26`; `services/google/businessClient.js:22`; `agendador.js:249` |
| `WHATSAPP_HABILITADO` | off | Webhook **responde 200** e descarta: `{tratado:false, ignorado:'whatsapp_desabilitado'}` — inerte, não 404 | `services/inbound.js:44-49` |
| `STORAGE_STRICT` | off | Upload cai para disco local em falha/ausência de storage | `services/storage.js:28-30, 129-151` |
| `RLS_ENABLED` | off | Só filtro app-level; sem GUC `app.empresa_id` | `db/tenant.js:64-65, 120-125` |
| `REQUIRE_EMAIL_VERIFICATION` | off | Sem gate de e-mail; quando on, 403 com `codigo:'email_nao_verificado'` | `middlewares/auth.js:32-40, 8-15` |

**Sobre não-confirmação de existência do recurso:** **não há**. As três formas são distinguíveis por um cliente:

- Rota inexistente → `404 {erro:'Rota não encontrada'}` (`app.js:200`).
- Rota existente com flag off → `404 {erro:'Recurso não disponível'}` (`documentos.js:51`, `servicos.js:609`).
- Rota existente com flag on e sem permissão → `403 {erro:'Sem permissão para …'}` (`documentos.js:54`, `servicos.js:612`).

Ou seja: o 404 de flag confirma que o endpoint existe, e o par 404/403 permite ao cliente inferir se **teria** permissão caso a flag fosse ligada. `GOOGLE_REVIEWS_ENABLED` e `WHATSAPP_HABILITADO` seguem um terceiro padrão (200 com mock/inércia), incompatível com os dois anteriores.

### 4.5 Auditoria — o que gera `AuditLog` e o que não gera

**O `AuditLog` só é escrito de um lugar** (`services/auditoria.js:15`) e há **exatamente 5 call sites**, todos em `routes/admin.js`: `usuario.criado` (`:242-250`), `usuario.desativado` (`:327-334`), `usuario.permissoes_alteradas` (`:346-355`), `usuario.excluido` (`:383-391`), `convite.enviado` (`:437-444`).

**Operações sensíveis que NÃO geram `AuditLog`:**
- `POST /lgpd/anonimizar-cliente` — destruição irreversível de dado pessoal (`admin.js:451-489`, só `logger.info`).
- `DELETE /me/conta` e a cascata que apaga a empresa inteira (`account.js:372-425`, só `logger.info`).
- Criação/reset de credencial de técnico com PIN devolvido em claro (`tecnicos.js:294-331`, `:333-376`).
- Toda a coleta e leitura de dado sensível de ponto: `POST /ponto/bater` (`tecnicos.js:571-624`), `GET /ponto/selfie/:arquivo` (`tecnicos.js:639-671`) — **quem viu a selfie de quem não fica registrado**.
- Upload/leitura/exclusão de documento (`documentos.js:90, 136, 174`).
- Criação, aprovação, rejeição e exclusão de serviço (`servicos.js:156, 250, 295, 323`).
- Exportação de relatório PDF/CSV (`tecnicos.js:405-430`, `estoque.js:261-275`).
- Edição de RH de técnico (`tecnicos.js:507-541`) e `PATCH /me` (`account.js:244-297`).
- Ativação/desativação de 2FA (`account.js:447, 483`).

**Além disso, o `AuditLog` é write-only:** nenhum endpoint o lê, e o painel não tem tela de auditoria. O model também está fora de `MODELOS_ESCOPADOS` (`db/tenant.js:24-34`; backlog item 6).

### 4.6 Exportação e portabilidade

| O que | Formato | Endpoint | Quem pode | Conteúdo |
|---|---|---|---|---|
| Banco de horas de um técnico | PDF e CSV | `GET /tecnicos/:id/ponto/relatorio` — `tecnicos.js:405-430` | `requirePermissao('ponto','ver')` | Nome do técnico, mês, horários diários, totais — `relatorio.js:242-353` (PDF), `:358-389` (CSV) |
| Relatório financeiro por período | PDF | `GET /relatorio/pdf` — `estoque.js:261-275` | `requirePermissao('financeiro','ver')` | Agregados de serviço/receita |
| Documento próprio | Arquivo original | `GET /me/documentos/:id/arquivo` — `documentos.js:136-172` | Só o próprio técnico | O arquivo que ele mesmo subiu |

**Não existe hoje:**
- Exportação de dado pessoal para o **próprio titular**. O funcionário **não consegue exportar o próprio banco de horas**: `BancoHoras` só é montado em `PerfilTecnico.jsx:298`, tela sob `RequirePermissao modulo="tecnicos"`, e o endpoint exige `ponto.ver`, que o preset `funcionario` não tem (`permissoes.js:90-94`).
- Exportação para o cliente final (que nem tem conta).
- Qualquer formato estruturado e interoperável (JSON/CSV do conjunto pessoal).
- O PDF de ponto traz aviso explícito de que **não** substitui ponto oficial (`relatorio.js:279-282`).

O funcionário também **não vê** o próprio CPF, endereço, salário ou modalidade: `SELECT_ME` (`account.js:44-59`) não inclui nada de `Tecnico`, e `GET /me/metricas` só devolve `id`, `nome`, `comissao`, `metaMensal`, `fotoPerfil` (`account.js:186-192`).

---

## 5. Problemas identificados

*(Todos são achados de **completude funcional e de contrato**, não de segurança. Nenhum reabre a frente encerrada.)*

### 5.1 A anonimização de cliente é parcial e o painel promete mais do que entrega
`Seguranca.jsx:481-484` diz: *"Remove os dados pessoais de um cliente (nome, telefone, comentário) dos serviços e avaliações da sua empresa — atende ao direito ao esquecimento."*
O endpoint (`admin.js:467-474`) zera esses três campos, mas **deixa intactos** `Servico.endereco` (endereço residencial do cliente — default `'Casa do cliente'`), `Servico.local`, `Servico.descricao`, `Servico.msgOriginal` e `Servico.fotoEvidencia`.

### 5.2 Categorias inteiras sem retenção nenhuma
Confirmado por ausência: `agendador.js:183-210` só cobre `SessaoConversa`, `Avaliacao` e `BatidaPonto`.

| Categoria | Cresce sem expurgo? | Evidência da ausência |
|---|---|---|
| `DocumentoTecnico` (RG, CNH, contrato) | **Sim** | só `DELETE /me/documentos/:id` manual (`documentos.js:174-197`) |
| `Servico.fotoEvidencia` | **Sim** | nenhum call site de remoção em todo `chaveiro-bot/src` |
| `Servico.endereco` / `clienteNome` / `clienteTelefone` | **Sim** | `agendador.js:191-194` anonimiza **`Avaliacao`**, não `Servico` |
| `AuditLog` | **Sim** | Nenhum `deleteMany`; nem na cascata (`account.js:82-104`) |
| `Notificacao` | **Sim** | Só apagada manualmente (`admin.js:138-149`) |
| `AvaliacaoGoogle` | **Sim** | `agendador.js:275+` faz upsert; nenhum expurgo |
| `SessaoUsuario` (IP + user-agent) | **Sim** | Ver §5.3 |
| `RefreshToken` expirado mas não usado | **Sim** | Apagado só em rotação/logout/logout-all |
| `ConviteUsuario` aceito/expirado | **Sim** | `admin.js:425-431` cria; nenhum delete |
| `RegistroPonto` (horários) | **Sim** | O expurgo só zera as **provas** da `BatidaPonto` |

### 5.3 `SessaoUsuario` acumula IP e user-agent indefinidamente, sem aviso ao titular
`middlewares/auth.js:56-69` faz upsert em **toda** requisição autenticada, chaveado por `jwtIat`. Como o access token dura 1 h e o refresh rotaciona, **cada renovação cria uma linha nova** com IP e user-agent. Só `POST /me/logout-all` apaga. A tela mostra apenas as 10 mais recentes (`account.js:623`), o que **esconde do titular** o volume real. Nenhuma tela informa que IP e user-agent são coletados.

### 5.4 Dado sensível de RH é coletado, nunca usado, nunca exibido e não pode ser corrigido nem apagado
CPF, data de nascimento, endereço, salário base, valor-hora, data de admissão (`tecnicos.js:250-260`) são: **coletados** num wizard de 4 etapas; **nunca lidos** por regra de negócio; **nunca exibidos**; **impossíveis de editar** (o `PATCH` aceita só `ativo`, `comissao`, `metaMensal`, `nome`, `telefone`, `telefoneDisplay`); **impossíveis de apagar** isoladamente; **invisíveis ao próprio titular**; **legíveis por terceiros** (devolvidos inteiros em `tecnicos.js:485` a quem tem `tecnicos.ver`, incluindo gestor).

O funcionário não pode confirmar, acessar, corrigir nem eliminar dado que a empresa tem sobre ele. Isso tangencia LGPD art. 18, I–VI (**matéria jurídica — exige validação profissional**).

### 5.5 Nenhum aviso de coleta fora do ponto
`MeuPonto.jsx:73, 92-118, 250-252, 303-330` implementa aviso e texto permanente para selfie + GPS. **Não há aviso equivalente em nenhum outro ponto de coleta**: `NovoTecnico.jsx` (CPF, endereço, salário), `NovoServico.jsx`/`NovoServicoFuncionario.jsx` (nome, telefone e endereço do **cliente final**), `Documentos.jsx`. Grep por `privacidade|LGPD|consentimento` nessas três telas retorna zero.

### 5.6 A auditoria não cobre nada de dado pessoal
Ver §4.5. Quem viu a selfie ou a geolocalização de um colega, quem exportou o banco de horas de quem, quem anonimizou o cliente e quem apagou a empresa inteira não deixam rastro estruturado. E o `AuditLog` existente **não tem leitor**.

### 5.7 A cascata de exclusão de conta é incompleta
`account.js:82-104` apaga 13 tabelas. **Não apaga** `AuditLog` (sem FK) nem `ConviteUsuario` (sem FK). Ambas guardam PII. Além disso, os **objetos de storage** de documentos e selfies não são removidos: `tecnico.deleteMany` cascateia a linha de `DocumentoTecnico`, mas nada chama `removerImagem` no bucket.

### 5.8 PII de cliente final gravada em `localStorage` do dispositivo
`useFormPersist.js:14-19` grava o formulário inteiro — incluindo `clienteNome` e `clienteTelefone` — em `localStorage`, em claro, com debounce de 300 ms. Em dispositivo compartilhado, a PII do cliente do atendimento anterior sobrevive ao logout (`AuthContext.jsx:61-66` remove só `admai_token`).

### 5.9 Os três padrões de flag desligada são mutuamente incompatíveis
404-com-corpo-próprio (documentos, serviço atual), 200-com-mock (Google) e 200-inerte (WhatsApp). Ver §4.4.

### 5.10 A Política de Privacidade publicada não descreve o que o sistema faz
`lib/legal.js` não menciona selfie, localização, geolocalização nem biometria; a seção "8. Retenção e descarte" (`legal.js:70-75`) lista Conta (12 meses), Clientes finais `[180 dias]` e Logs técnicos `[90 dias]` — com **placeholders entre colchetes ainda no texto servido em produção**, e sem linha alguma para os 365 dias de prova de ponto nem para as categorias sem retenção da §5.2. Como o aviso de ponto remete o funcionário a `/privacidade` (`MeuPonto.jsx:250-252, 322-327`), o link entrega uma página que **não fala** do que ele acabou de consentir. *(Interpretação jurídica exige validação profissional.)*

---

## 6. Causas prováveis ou confirmadas

| # | Causa | Status |
|---|---|---|
| 1 | **Retenção foi desenhada por caso de uso, não por inventário.** `agendador.js:160-210` cobre exatamente três coisas que foram os três casos discutidos. Não existiu um passo "listar toda categoria de dado pessoal e decidir prazo para cada" | **Confirmada** por ausência |
| 2 | **O RH do técnico foi construído para uma feature de folha que não chegou.** Os campos existem no schema e no wizard, mas só `modalidade`/`jornadaDiariaMin`/`horaExtraAtiva` foram consumidos | **Confirmada** por ausência de leitura |
| 3 | **`AuditLog` foi criado como remediação pontual de EV-060**, não como trilha de dado pessoal. Os 5 call sites são todos de gestão de usuário/papel | **Confirmada** pelos comentários |
| 4 | **A distinção 404-vs-200 nas flags reflete a idade da feature.** WhatsApp/Google são anteriores e escolheram "inerte/mock"; documentos e serviço-atual são F9 e escolheram 404 | **Provável** |
| 5 | **`useFormPersist` foi feito para resolver perda de dados por expiração de sessão**, sem considerar que o payload contém PII de terceiro | **Provável** |
| 6 | **A Política de Privacidade foi escrita antes de selfie/GPS existirem** e nunca foi revisitada. Os placeholders indicam que o texto nunca passou por revisão de fechamento | **Provável** |
| 7 | **Os dois caminhos de expiração de sessão foram implementados em momentos distintos** — o interceptor com refresh é posterior ao guard puro, e o guard nunca foi atualizado | **Provável** |

---

## 7. Contradições

1. **Painel promete anonimização completa; endpoint entrega parcial.** `Seguranca.jsx:481-484` vs. `admin.js:467-474`.
2. **A UI diz "guardados pelo prazo da nossa política e depois descartados"** (`MeuPonto.jsx:317-321`) **e linka para uma política que não tem esse prazo** (`legal.js:70-75`).
3. **Dois mecanismos de expiração de sessão discordam.** `api.js:54-59` tenta refresh antes de deslogar; `Guards.jsx:17-21` + `AuthContext.jsx:17-22` deslogam direto no `exp` do JWT.
4. **Selfie é "opcional" no contrato e obrigatória na prática.** `tecnicos.js:181-186` vs. `MeuPonto.jsx:94-107`.
5. **A `Avaliacao` exige telefone e a anonimização o esvazia para `''`, não `null`.** `schema.prisma:342` é NOT NULL; `admin.js:472` e `agendador.js:193` gravam `''`. O sentinela "anonimizado" é indistinguível de erro de gravação — e o índice `[clienteTelefone, status]` (`schema.prisma:354`) agrupa todos os anonimizados numa chave só.
6. **`ponto.editar` existe no catálogo e não tem endpoint.** `permissoes.js:40` documenta "editar = ajustar pontos"; nenhuma rota implementa.
7. **`AuditLog` é chamado de "auditoria imutável"** (`schema.prisma:529`) **mas ninguém pode lê-lo.**
8. **`crossOriginResourcePolicy: 'cross-origin'` justificado por `/uploads`** (`app.js:64`) — política afrouxada globalmente para servir um diretório que o backlog (item 2) classifica como sem auth nem escopo de tenant.
9. **O funcionário não vê nem exporta o próprio banco de horas**, mas o PDF/CSV desse mesmo dado é gerado para o gestor.

---

## 8. Perguntas que dependem do usuário

*(Só decisões de produto/negócio/jurídico.)*

**Sobre o inventário e finalidade**
1. **CPF, data de nascimento, endereço, salário e valor-hora do funcionário: mantêm ou removem?** Hoje são coletados, nunca usados, nunca exibidos, não editáveis e não apagáveis (§5.4). Três caminhos: (a) remover do wizard; (b) manter e construir a feature de folha que os justifique; (c) manter e construir acesso/retificação/eliminação.
2. **Qual o prazo de retenção de cada categoria hoje sem expurgo** (documentos, foto de evidência, endereço do cliente, `AuditLog`, notificação, avaliação Google, sessão)? *(Prazos com obrigação legal exigem validação jurídica profissional.)*
3. **Endereço do serviço entra ou não na anonimização de cliente?** Se entrar, a busca por endereço e os índices perdem os registros antigos.

**Sobre titulares que não são usuários**
4. **Quem, além do dono, deve poder atender a um pedido de exclusão de cliente final?** Hoje é `adminOnly`; o gestor, que opera avaliações no dia a dia, não pode.
5. **Como o cliente final descobre que existe dado dele no sistema?** *(Base legal e forma de informação — matéria jurídica.)*

**Sobre auditoria e sessão**
6. **Quais operações sobre dado pessoal devem gerar `AuditLog`** — e **quem deve poder ler a trilha**?
7. **Duração desejada do access token e comportamento na expiração:** renovar silenciosamente enquanto o refresh valer, ou deslogar em 1 h?
8. **Por quanto tempo guardar IP e user-agent de sessão** (§5.3)?

**Sobre flags e política**
9. **Qual dos três padrões de flag desligada vira regra:** 404, 403, ou 200-inerte/mock? E o 404 deve ser indistinguível de rota inexistente?
10. **A Política de Privacidade será atualizada nesta rodada** para cobrir selfie, geolocalização, documentos e os prazos reais? *(Redação final é matéria jurídica.)*

**Sobre exportação**
11. **O titular (funcionário) deve poder exportar os próprios dados**, e em qual formato?

---

## 9. Alternativas

**Para o inventário e retenção (§5.2)**
- **A1 — Retenção por categoria, tabelada em um só lugar.** Estender `agendador.js:160-210` com uma constante por categoria e um único job. *Prós:* usa o mecanismo já provado e o cron já existente, com lock por réplica. *Contras:* exige decisão de prazo por categoria — bloqueado pela pergunta 2.
- **A2 — Retenção como propriedade do model:** nenhum campo de PII entra no schema sem prazo declarado. *Prós:* impede a dívida de crescer. *Contras:* não resolve o passivo atual.
- **A3 — Não fazer nada nesta rodada e só documentar.** *Contras:* o passivo cresce com o uso.

**Para RH do funcionário (§5.4)**
- **B1 — Remover os campos não usados.** Minimização real. *Contras:* joga fora trabalho de UI feito.
- **B2 — Manter e construir "Meus dados"** (leitura + retificação + solicitação de eliminação). *Contras:* superfície nova a construir e proteger.
- **B3 — Manter e só fechar a exposição** (projeção de campo em `tecnicos.js:485`). Barato, mas mantém coleta sem finalidade.

**Para anonimização de cliente (§5.1)**
- **C1 — Ampliar o conjunto de campos e alinhar o texto do painel.** *Contras:* decide-se destruir dado operacional (endereço).
- **C2 — Manter o conjunto e corrigir o texto do painel.** Honesto e barato; não avança no direito do titular.
- **C3 — Transformar em "pedido de eliminação" com registro em `AuditLog`.** Ganha rastreabilidade.

**Para autorização (§4.2)**
- **D1 — Regra transversal explícita:** "o painel esconde, o backend impõe; e nenhuma resposta carrega campo que a tela não renderiza". *Contras:* toca muitos handlers.
- **D2 — Só documentar a regra atual.** Zero custo agora, mantém a sobre-exposição de JSON.

**Para flags (§5.9)**
- **E1 — 404 genérico idêntico ao de rota inexistente.** Máxima não-confirmação. *Contras:* dificulta diagnóstico em staging.
- **E2 — 404 com corpo próprio**, como já fazem documentos e serviço-atual. Uniformiza a maioria. *Contras:* confirma a existência do recurso.
- **E3 — 200 com payload vazio/inerte.** Melhor para UI, pior para clareza de contrato.

**Para sessão (§7.3)**
- **F1 — Unificar no refresh:** o guard consulta o refresh antes de deslogar.
- **F2 — Manter os dois e documentar** que a sessão efetiva é 1 h em navegação e 7 dias em chamada de API. *Contras:* comportamento inexplicável para o usuário.

---

## 10. Recomendação

**Regras transversais que a Rodada 1 deveria fixar** (ordenadas por quanto travam decisão funcional posterior):

**R1 — Toda categoria de dado pessoal nasce com prazo de retenção declarado.** O mecanismo já existe e é confiável; o que falta é a tabela de prazos. É a regra que mais destrava as outras. *(Prazos com obrigação legal exigem validação jurídica profissional.)*

**R2 — Todo ponto de coleta de dado pessoal tem aviso de coleta, no padrão já implementado em `MeuPonto.jsx`.** Aplicar a cadastro de funcionário, cadastro de serviço (dado do cliente final) e documentos. É o padrão de mais baixo custo do repositório e já validado em teste.

**R3 — A Política de Privacidade descreve o que o código faz.** Antes de qualquer feature nova de dado pessoal, `legal.js` cobre selfie, geolocalização, documentos, IP/user-agent de sessão, e os prazos reais, sem placeholders. *(Redação: validação jurídica profissional.)*

**R4 — "O painel esconde, o backend impõe" — e nenhuma resposta carrega campo que a tela não renderiza.** A primeira metade já é a regra de facto. A segunda é a lacuna real (`tecnicos.js:485`, `servicos.js:104-112`).

**R5 — Toda operação que cria, lê em nome de terceiro, exporta, anonimiza ou elimina dado pessoal gera `AuditLog`; e a trilha tem leitor.** Sem isso, a Rodada 1 **não pode prometer** funcionalidade de "histórico de acesso", "quem viu meus dados" ou "comprovante de exclusão".

**R6 — Um único padrão de flag desligada.** Recomendo **E2** (404 com corpo próprio), porque já é o padrão das duas features mais recentes e o painel já o trata. Se não-confirmação for requisito, então **E1**.

**R7 — Antes de reativar o WhatsApp, resolver `/uploads`.** Não é recomendação minha: é a condição de retorno já escrita no item 2 do `SECURITY_HARDENING_BACKLOG.md:15-21`. Fica registrado como **pré-condição funcional**, porque o WhatsApp é o único caminho de coleta de `fotoEvidencia`.

**R8 — Unificar o comportamento de expiração de sessão** (alternativa F1).

**Sequência sugerida:** R1 e R3 primeiro, depois R2 e R6, depois R4 e R5, R7 quando o WhatsApp voltar à pauta, R8 quando houver formulário longo novo.

---

## 11. Impactos cruzados

**Ponto / Jornada:** retenção de 365 dias destrói selfie e GPS mas mantém o horário — feature futura de "contestação com prova visual" tem janela máxima de 12 meses. Não há endpoint de ajuste de ponto apesar de `ponto.editar` no catálogo. O funcionário não exporta o próprio banco de horas.

**Serviços / Clientes:** retenção zero em `Servico` significa que CRM, histórico de cliente, reincidência e base de recompra operariam sobre dado que nunca expira. `Servico.endereco` é indexado e pesquisável — se R1 decidir anonimizá-lo, busca por endereço e roteirização histórica perdem base. `fotoEvidencia` só existe via WhatsApp; "anexar foto pelo painel" é caminho de coleta **novo** e cai no backlog item 2.

**RH / Funcionário:** §5.4 é bloqueante para qualquer feature de folha, holerite, admissão ou eSocial. `DocumentoTecnico` só é legível pelo próprio — "o RH valida o contrato" exige mudança de modelo de acesso e provavelmente de base legal.

**Multi-tenant / Escala:** 6 models com `empresaId` fora de `MODELOS_ESCOPADOS` (backlog item 6). `STORAGE_STRICT` precisa estar ligado antes de escalar réplicas.

**Onboarding / Billing:** `apagarEmpresaEmCascata` já teve de ser corrigida por FK de `Assinatura`. Toda tabela nova com FK para `Empresa` precisa entrar nessa transação.

**Observabilidade:** a redação de PII é por **nome de chave** (`utils/logger.js:6-28`). `cpf`, `endereco`, `clienteTelefone`, `lat`, `lng`, `selfieUrl` **não estão na lista**. Log estruturado novo pode vazar PII sem violar nenhuma regra escrita.

**UX / App:** R8 e §5.8 afetam todo fluxo de formulário longo — o cadastro de funcionário é o mais exposto e **não** tem persistência, então perde tudo na expiração.

---

## 12. Grau de confiança

| Afirmação | Confiança | Base |
|---|---|---|
| Inventário de dado pessoal (§3.1) | **Alta** | Schema lido integralmente; cada linha rastreada a `arquivo:linha` de gravação e leitura |
| `POST /lgpd/anonimizar-cliente` (§4.1) | **Alta** | Handler lido integralmente |
| Categorias sem retenção (§5.2) | **Alta** | `agendador.js` é o único arquivo com rotina de expurgo; greps dirigidos por model |
| `AuditLog` tem 5 call sites e nenhum leitor (§4.5) | **Alta** | Grep exaustivo nos dois módulos |
| CPF/salário/endereço nunca lidos por regra de negócio (§5.4) | **Alta** | Grep por cada nome de campo, excluindo testes |
| "O painel esconde, o backend impõe" (§4.2) | **Alta** | Mapa completo de guards por handler nos 11 arquivos de rota |
| Parâmetros de sessão (§4.3) | **Alta** | Todos lidos diretamente |
| Comportamento das flags quando desligadas (§4.4) | **Alta** | Cada gate lido; três padrões confirmados |
| Exportação (§4.6) | **Alta** | Grep por `Content-Disposition` (3 ocorrências) + rastreio da UI |
| **Contradição §7.3 (dois caminhos de expiração)** | **Média-alta** | O código é inequívoco. A **frequência** com que o caminho B dispara depende do padrão de re-render do React, que **não executei** |
| §5.7 — `AuditLog` e `ConviteUsuario` sobrevivem à exclusão da empresa | **Média-alta** | `account.js:82-104` não os inclui e nenhum tem FK. Não executei a transação |
| Objetos de storage órfãos após exclusão (§5.7) | **Média** | Inferido: nenhum `removerImagem` no caminho. Não verifiquei lifecycle do bucket no Supabase |
| Enquadramento jurídico de qualquer achado | **Não aplicável** | **Fora do meu mandato — exige validação profissional.** Todas as menções a LGPD são descritivas do que o código faz ou deixa de fazer |

---

## 13. Pontos não verificados

**Não executei nada.** Toda a análise é leitura estática.

1. **Nenhum teste rodado.** Comportamento em runtime não foi observado.
2. **Nenhuma requisição HTTP real.** Os códigos de resposta de §4.4 e §4.2 vêm da leitura dos handlers.
3. **Frequência real do caminho B de expiração de sessão** (§7.3) — não medida.
4. **Estado do storage em produção.** Não sei se os buckets existem, se são privados, nem se há política de lifecycle.
5. **Conteúdo de `.env` real** — não lido por instrução. **Não sei quais flags estão ligadas em produção.**
6. **Migrations e estado real do banco.** Li `schema.prisma`, não `prisma/migrations/` nem `enable_rls.sql`.
7. **`services/inbound.js` lido apenas em trechos dirigidos.** O fluxo completo do bot não foi mapeado exaustivamente.
8. **`routes/auth.js` lido em trechos.** OAuth, recuperação de senha e aceite de convite foram vistos só por grep.
9. **`config/navigation.js` lido parcialmente.**
10. **Não avaliei o app Capacitor/Android.**
11. **`monitoring/`, `tools/`, `scripts/`** não analisados.
12. **Fora do mandato — registrado e não perseguido:** os desalinhamentos de §5.7, §5.8 e a lista de `CHAVES_SENSIVEIS` sem `cpf`/`endereco`/`lat`/`lng`/`selfieUrl` (`utils/logger.js:6-28`). **Não os classifiquei como vulnerabilidade e não investiguei nessa direção** — a frente de segurança está encerrada. Registro-os como fatos observados sobre completude funcional, para que o orquestrador decida se algum merece encaminhamento próprio.
13. **Nenhuma conclusão jurídica.** **Qualquer afirmação sobre suficiência ou insuficiência legal exige validação profissional** e não deve ser lida deste documento.
