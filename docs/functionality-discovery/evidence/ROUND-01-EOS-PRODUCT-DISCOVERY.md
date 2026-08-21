# ROUND-01 — EOS-Product-Discovery

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-Product-Discovery` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | Proposta de valor declarada vs. implementada; pagante vs. usuário; jobs-to-be-done por papel; especialização em chaveiro; complexidade; papéis não modelados; prioridade histórica; necessidade vs. preferência |
| Grau de confiança declarado | Muito alta nos achados de billing e WhatsApp; nenhuma para afirmação de mercado (sem web) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. O orquestrador verificou independentemente, antes de lançar este agente, que o
> painel não possui nenhuma chamada a `/billing/*`; o relatório confirma o achado pelos dois
> lados e o amplia.
>
> **Nota de verificação:** este agente foi relançado após o primeiro ter sido interrompido por
> limite de sessão do serviço. Nenhum resultado parcial do primeiro lançamento foi usado.

---

# Relatório EOS-Product-Discovery — Rodada 1 · Frente de Descoberta Funcional (AdmAi)

---

## 1. Escopo analisado

Descoberta funcional de produto sobre o repositório `admai-worktrees/agent-environment`, cobrindo os 8 pontos do mandato: (1) proposta de valor declarada vs. implementada; (2) titularidade da assinatura, trial e paywall; (3) jobs-to-be-done por papel (`dono`/`gestor`/`funcionario`); (4) grau real de especialização em chaveiro; (5) levantamento factual de complexidade; (6) papéis de usuário ainda não modelados; (7) sinais de prioridade embutidos no código; (8) necessidade estrutural vs. conforto.

**Fora de escopo (deliberado):** auditoria de segurança nova, performance, decisão de posicionamento/priorização (matéria do dono do produto) e qualquer afirmação sobre mercado real — não há acesso à web nesta tarefa.

---

## 2. Arquivos consultados

**Documentação**
- `README.md` (integral)
- `docs/decisions.md`
- `docs/db/01-discovery.md`
- `docs/agent-environment/FUNCTIONALITY_MATRIX_V1.md`

**Backend (`chaveiro-bot`)**
- `prisma/schema.prisma` (models `Empresa`, `EmpresaWhatsapp`, `Tecnico`, `Servico`, `Material`, `MovimentacaoEstoque`, `Assinatura`, `ConviteUsuario`, `DocumentoTecnico`)
- `src/services/billing.js`, `src/routes/billing.js`
- `src/services/permissoes.js`, `src/middlewares/auth.js`
- `src/services/inbound.js`, `src/services/conversa.js`, `src/services/whatsapp/gateway.js`
- `src/services/agendador.js`, `src/services/avaliacao.js`
- `src/routes/auth.js`, `src/routes/tecnicos.js`, `src/routes/admin.js`, `src/routes/estoque.js`, `src/routes/documentos.js`, `src/routes/servicos.js`
- `src/services/bootstrap.js`, `src/services/email.js`, `src/config/env.js`, `src/services/google/analise.js`, `src/services/google/businessClient.js`
- `test/integration/assinatura_cadastro.test.js`, `src/services/__tests__/bootstrap.test.js`, `src/routes/__tests__/billing.test.js`

**Frontend (`chaveiro-painel`)**
- `src/App.jsx`, `src/config/navigation.js`
- `src/pages/Landing.jsx`, `Ajuda.jsx`, `Configuracao.jsx`, `ConfiguracaoBot.jsx`, `MeuPainel.jsx`, `GestorHome.jsx`, `Dashboard.jsx`, `NovoTecnico.jsx`, `Mais.jsx`, `TrocarSenha.jsx`
- `src/lib/legal.js`, `src/components/BancoHoras.jsx`

---

## 3. Evidências com `arquivo:linha`

### 3.1 Proposta de valor: o que é prometido

| # | Evidência | Conteúdo |
|---|---|---|
| E-01 | `README.md:25-27` | "Plataforma multi-empresa (SaaS) onde os técnicos registram serviços **conversando com um robô no WhatsApp**" |
| E-02 | `README.md:56-58` | "Técnico abre o WhatsApp, manda `serviço` no privado do robô…" |
| E-03 | `chaveiro-painel/src/pages/Landing.jsx:18-22` | Primeiro card de recurso: "WhatsApp integrado — Técnicos registram serviços conversando no chat — sem app extra." |
| E-04 | `Landing.jsx:51-55` | Os **3** passos do "Como funciona" começam no WhatsApp ("O técnico manda 'serviço' no WhatsApp…") |
| E-05 | `Landing.jsx:91-94` | Hero: "Registre serviços pelo WhatsApp e acompanhe receita, comissões, estoque e avaliações num painel só." |
| E-06 | `Landing.jsx:33-38` | "Avaliações automáticas — O cliente recebe a pesquisa de satisfação sozinho, após o serviço." |
| E-07 | `Landing.jsx:44-48` | "Fechamento em PDF — Relatório de período pronto para enviar ao contador." |

### 3.2 Proposta de valor: o que é entregue

| # | Evidência | Conteúdo |
|---|---|---|
| E-08 | `chaveiro-bot/src/services/inbound.js:44-49` | `if (env.WHATSAPP_HABILITADO !== 'true') return { tratado: false, ignorado: 'whatsapp_desabilitado' }` — bot inerte |
| E-09 | `chaveiro-painel/src/pages/ConfiguracaoBot.jsx:53-80` | O `export default` é a tela "Em breve"; comentário: "Para religar: trocar o export default por `ConfiguracaoBotLegado` e ligar a flag" |
| E-10 | `ConfiguracaoBot.jsx:74-76` | Texto ao usuário: "Por enquanto, tudo é feito pelo painel: serviços, ponto e avaliações." |
| E-11 | `README.md:317` | O próprio README marca `/configuracao/whatsapp` como **"Em breve" — robô desligado** |
| E-12 | `docs/decisions.md:53-55` | Decisão registrada: "Estrutura preservada atrás de flag; no painel aparece 'Em breve' desabilitado." |
| E-13 | `chaveiro-bot/src/services/avaliacao.js:88-91` | O envio da pesquisa usa `enviarMensagem(aval.clienteTelefone, texto)` — gateway WhatsApp |
| E-14 | `chaveiro-bot/src/services/whatsapp/gateway.js:29-48` | O gateway exige `EVOLUTION_HOST`, `EVOLUTION_API_KEY`, `ENCRYPTION_KEY`; `configWhatsappFaltando()` reporta config incompleta |
| E-15 | `chaveiro-bot/src/services/agendador.js:361-372` | Cron de 5 em 5 min chama `dispararAvaliacoesPendentes()` — **não** gatilhado por `WHATSAPP_HABILITADO` (a flag só existe em `inbound.js:48`, confirmado por grep: 3 ocorrências no `src/`, todas em `env.js:58`, `inbound.js:44`, `inbound.js:48`) |
| E-16 | `chaveiro-painel/src/pages/Ajuda.jsx:26-57` | A ajuda descreve outro fluxo: "O técnico envia a mensagem padronizada **no grupo** do WhatsApp. O bot lê, extrai os dados e registra" |
| E-17 | `README.md:144-159` + `chaveiro-bot/src/services/conversa.js:43` | O fluxo real é máquina de estados no **privado**, uma pergunta por vez; `LOCAIS = ['Casa do cliente','Contrato','Ponto da loja','Outro']` |
| E-18 | `Ajuda.jsx:66-77` | Instrui o usuário a ir em "Mais → Configurações → WhatsApp → Conectar" e escanear QR — tela que hoje é "Em breve" (E-09) |

### 3.3 Quem paga vs. quem usa

| # | Evidência | Conteúdo |
|---|---|---|
| E-19 | `prisma/schema.prisma:468-482` | `model Assinatura` — `empresaId Int @unique`. **O titular é a Empresa (tenant), não uma pessoa.** Status default `"trialing"`; campos `trialFimEm`, `periodoFimEm`, `canceladoEm` |
| E-20 | `chaveiro-bot/src/services/billing.js:8` | `export const TRIAL_DIAS = 14` — duração fixa, centralizada |
| E-21 | `src/services/bootstrap.js:55-59`; `src/routes/auth.js:369-373`; `auth.js:409-413`; `auth.js:841-845` | Os **4** caminhos que criam Empresa gravam `Assinatura{status:'trialing', trialFimEm:+14d}` |
| E-22 | `test/integration/assinatura_cadastro.test.js:64-113` | 3 testes de integração cobrindo `/api/setup`, `/auth/register`, `/auth/oauth/:provedor` |
| E-23 | `src/routes/billing.js:18` e `:29` | `/billing/checkout` e `/billing/portal` exigem `requireAuth, adminOnly` |
| E-24 | `src/middlewares/auth.js:88-91` | `adminOnly` = `req.user.admin`; e `src/routes/admin.js:235` grava `admin: papel === 'dono'` → **só o dono assina e gerencia** |
| E-25 | `src/routes/billing.js:46` | `/billing/status` exige apenas `requireAuth` — qualquer usuário autenticado, inclusive `funcionario`, lê o status do plano da empresa |
| E-26 | `src/routes/billing.js:154-155` e `:175` | Recibo e aviso de falha de pagamento vão para `prisma.usuario.findFirst({ where: { papel: 'dono' } })` |
| E-27 | **grep exaustivo por `assinatura\|Assinatura\|trialFimEm\|past_due\|trialing` em `chaveiro-bot/src`** | `Assinatura.status` é **escrito** (webhooks) e **lido apenas** em `/billing/status` (`billing.js:51-59`) e em `/billing/portal` (`billing.js:31-36`, para achar o `stripeCustomerId`). **Nenhum middleware, rota ou service lê o status para bloquear qualquer funcionalidade.** |
| E-28 | `src/routes/auth.js:407`; `auth.js:840`; `src/services/__tests__/bootstrap.test.js:10` | Comentários do próprio código: "o **paywall (T-BILL-04)** trataria…", "…no paywall (T-BILL-04)", "…o paywall (T-BILL-04, **futuro**) entrar no ar" |
| E-29 | `chaveiro-painel/src/pages/Configuracao.jsx:56-67` | Card "Plano e cobrança / Assinatura e faturas" com `breve: true` → `Configuracao.jsx:196-198` dispara `toast('Em breve disponível')` |
| E-30 | `chaveiro-painel/src/config/navigation.js:41-146` (manifesto do `dono`) | Os 11 destinos do dono são `/`, `/tecnicos`, `/reparticao`, `/servicos`, `/aprovacoes`, `/avaliacoes`, `/materiais`, `/estoque`, `/configuracao/usuarios`, `/configuracao`, `/ajuda`. **Nenhum destino de billing em nenhum dos 3 papéis.** Isso corrige a `FUNCTIONALITY_MATRIX_V1.md:30`, que afirma "surfaced via `Configuracao.jsx`/`Mais.jsx`" — `Mais.jsx:29` deriva 100% de `buildNavigation`, que não tem billing |
| E-31 | `chaveiro-bot/src/services/email.js:203` | O e-mail de recibo linka `${baseUrl()}/configuracao/billing` — rota **inexistente** em `App.jsx` (lista completa nas linhas 88-341); o catch-all `App.jsx:342` redireciona para `/` |

### 3.4 Jobs-to-be-done por papel

| # | Evidência | Conteúdo |
|---|---|---|
| E-32 | `App.jsx:49-65` | Raiz por papel: `funcionario → MeuPainel`, `gestor → GestorHome`, demais → `Dashboard` |
| E-33 | `src/services/permissoes.js:19-30` | 10 módulos: dashboard, servicos, tecnicos, estoque, financeiro, avaliacoes, ponto, aprovacoes, usuarios, configuracao |
| E-34 | `permissoes.js:33-44` | 27 pares módulo×ação (`ponto:['ver','editar']` com comentário "ver = banco de horas de TODOS") |
| E-35 | `permissoes.js:47-53` | 5 capacidades `proprio`: `bater_ponto`, `ver_metricas`, `editar_perfil`, `registrar_servico`, `documentos` |
| E-36 | `permissoes.js:76-88` | Preset gestor: vê financeiro (`editar:false`), sem `usuarios` e sem `configuracao` |
| E-37 | `permissoes.js:124` | `if (papel === 'dono') return grantTotal()` — dono é imutável |
| E-38 | `GestorHome.jsx:97-101` | Gestor consome `/servicos?limit=5`, `/gestor/indicadores`, `/avaliacoes` |
| E-39 | `GestorHome.jsx:210-255` | Widget "Presença do time hoje" com status `trabalhando/almoco/encerrado/ausente` |
| E-40 | `MeuPainel.jsx:122` | Funcionário consome `/me/metricas?periodo=` |
| E-41 | `MeuPainel.jsx:411-429` | Os 3 atalhos do funcionário: "Bater ponto", "Registrar serviço", "Meus serviços" |
| E-42 | `MeuPainel.jsx:223-234` | KPI de destaque: "Comissão a receber / aguardando repasse" (`dados.saldoPendente`) |
| E-43 | `docs/decisions.md:39-41` | Decisão explícita: funcionário **NÃO vê o banco de horas** — só as batidas do dia |
| E-44 | `docs/decisions.md:65-66` | Funcionário **não baixa estoque** do catálogo: `materiais=[]` forçado |
| E-45 | `navigation.js:246-335` | Funcionário tem 9 destinos: `/`, `/meu-ponto`, `/meus-servicos/novo`, `/configuracao/perfil`, `/meus-servicos`, `/meus-documentos`, `/configuracao/seguranca`, `/configuracao/notificacoes`, `/ajuda` |
| E-46 | `src/routes/estoque.js:261` | `GET /relatorio/pdf` exige `requirePermissao('financeiro','ver')` |

### 3.5 Especialização em chaveiro — inventário completo do que é literal de domínio

| # | Evidência | Conteúdo |
|---|---|---|
| E-47 | `Landing.jsx:86`, `:89`, `:152` | "GESTÃO PARA CHAVEIROS · BETA"; "Sua operação de chaveiro sob controle"; "grupo pequeno de chaveiros" |
| E-48 | `chaveiro-painel/src/lib/legal.js:17`, `:33`, `:81` | Textos legais: "empresas de chaveiro"; "Clientes finais do chaveiro"; "direcione à empresa de chaveiro (Controladora)" |
| E-49 | `chaveiro-bot/src/services/email.js:83` | Rodapé de e-mail: "AdmAi — Gestão inteligente para chaveiros" |
| E-50 | `chaveiro-bot/src/services/google/analise.js:39` | Prompt de IA: "analisa avaliações de clientes de uma empresa de chaveiro no Brasil" |
| E-51 | `README.md:23` | Título: "Plataforma SaaS de Gestão para Chaveiros via WhatsApp" |
| E-52 | `chaveiro-painel/src/pages/TrocarSenha.jsx:96` | Marca renderizada na tela: **"CHAVEIROBOT"** |
| E-53 | `chaveiro-painel/src/pages/Dashboard.jsx:89` | Flag de localStorage: `chaveiro_tour_done` |
| E-54 | Nomes de diretório | `chaveiro-bot/`, `chaveiro-painel/` |

**E o que é genérico (o resto do produto):**

| # | Evidência | Conteúdo |
|---|---|---|
| E-55 | `prisma/schema.prisma:123-169` (`model Servico`) | Campos: `local`, `endereco`, `descricao`, `material` (texto livre), `valorCobrado`, `valorMaterial`, `valorLiquido`, `comissaoGerada`, `fotoEvidencia`, `clienteNome`, `clienteTelefone`, `status`. **Não existe `categoria`/`tipoServico`** — grep por `categoria` no schema retorna 1 única ocorrência, e é comentário em `DocumentoTecnico` (`schema.prisma:113`). Nada de fechadura, chave, veículo, segredo, cilindro |
| E-56 | `prisma/schema.prisma:172-191` (`model Material`) | `nome`, `descricao`, `imagemUrl`, `unidade` (`un, m, kg, l`), `precoUnit`, `precoVenda`, `estoqueMinimo`, `quantidadeAtual` — catálogo de insumo genérico |
| E-57 | `conversa.js:43` | Único menu de domínio do bot inteiro: `['Casa do cliente','Contrato','Ponto da loja','Outro']` — serve qualquer prestador com loja física e contratos |
| E-58 | `chaveiro-bot/src/routes/documentos.js:37` | `TIPOS = ['contrato','rg','cpf','cnh','comprovante','outro']` — RH brasileiro genérico |
| E-59 | `chaveiro-painel/src/pages/NovoTecnico.jsx:24-30` | `MODALIDADES`: CLT, CLT meio período, CLT 12x36, Intermitente, Autônomo — legislação trabalhista BR, não chaveiro |
| E-60 | `docs/db/01-discovery.md:13` | O próprio documento de descoberta de banco já classifica o objetivo como **"Gestão de prestadores de serviço"** |
| E-61 | `Ajuda.jsx:18` e `:231`; `legal.js:81`; `chaveiro-bot/src/config/env.js:117-118` | Domínio de suporte/privacidade/remetente: **`barbers-flow.com`** (`suporte@`, `privacidade@`, `noreply@`) — resíduo de outra vertical |

### 3.6 Complexidade — números medidos

| # | Evidência | Medida |
|---|---|---|
| E-62 | `ls chaveiro-painel/src/pages/*.jsx` | **39** arquivos, dos quais 4 são componentes auxiliares (`DashboardParts`, `DashboardWidgets`, `DashboardWidgetsOps`, `CatalogoModais`) → **35 páginas** |
| E-63 | `App.jsx:88-342` | **36** declarações `<Route>` = 33 destinos reais + 2 redirects + 1 catch-all |
| E-64 | `permissoes.js:19-53` | 10 módulos × até 4 ações = **27 toggles de módulo** + **5** capacidades `proprio` = **32 chaves de permissão por usuário** |
| E-65 | `NovoTecnico.jsx:59-81` | **17 campos** no estado do formulário |
| E-66 | `NovoTecnico.jsx:167` | Wizard de **5 etapas**: Dados, Vínculo, Condições, Acesso, Confirmação |
| E-67 | `wc -l` em `pages/` | Login.jsx **763**, PerfilTecnico.jsx **686**, Seguranca.jsx **671**, NovoTecnico.jsx **526**, Usuarios.jsx **482**, Servicos.jsx **473**. Total de `pages/`: **11.043 linhas** |
| E-68 | `README.md:547` | Convenção declarada: "Arquivos **< 500 linhas**" — 4 páginas violam |
| E-69 | Contagem de handlers por arquivo de rota | `account.js` 20, `auth.js` 19, `admin.js` 16, `servicos.js` 15, `tecnicos.js` 12, `google.js` 9, `estoque.js` 9, `whatsapp.js` 7, `documentos.js` 4, `billing.js` 4 → **115 endpoints** |
| E-70 | `README.md:211-224` | Superfície de auth: senha, TOTP, 2FA por telefone (OTP), 3 provedores OIDC, magic link, convite, recuperação, logout-all |

### 3.7 Papéis não modelados

| # | Evidência | Conteúdo |
|---|---|---|
| E-71 | `Landing.jsx:47` | Promete relatório "pronto para enviar ao **contador**" |
| E-72 | `README.md:726` | Roadmap: "**Integração contábil** (exportação em planilha compatível com MEI)" |
| E-73 | `chaveiro-painel/src/components/BancoHoras.jsx:220` | Disclaimer defensivo: "…não substitui folha de pagamento nem orientação jurídica/**contábil**" |
| E-74 | `docs/db/01-discovery.md:16` | Lacuna já registrada: "⚠️ Haverá '**contador**'/'**franqueado**'/**multi-loja** por dono?" |
| E-75 | `prisma/schema.prisma:20-37` (`model Empresa`) | Sem `paiId`, sem `redeId`, sem `unidadeId` — **não há hierarquia de empresa**. Um dono com 2 lojas = 2 tenants sem consolidação |
| E-76 | `docs/decisions.md:33-34` | "Telefone repetível entre empresas (modelo número único) → login resolve por telefone e, se houver vínculo em mais de uma empresa, desambigua" — a **pessoa** já é multi-empresa; a **empresa** não é multi-unidade |
| E-77 | `NovoTecnico.jsx:32-36` | `NIVEIS = [{tecnico},{gerente},{admin}]` — a UI oferece 3 níveis de acesso |
| E-78 | `chaveiro-bot/src/routes/tecnicos.js:268-269` | `const papel = req.user.papel === 'dono' && d.nivelAcesso === **'gestor'** ? 'gestor' : 'funcionario'` — o backend só reconhece a string `'gestor'` |
| E-79 | `tecnicos.js:253` | `nivelAcesso: d.nivelAcesso ?? null` — o valor escolhido é gravado como texto livre em `Tecnico.nivelAcesso`, sem efeito de autorização |
| E-80 | `avaliacao.js:132-136` | Única superfície do cliente final: `tentarCapturarResposta(telefone, texto)` — responder a nota **por WhatsApp**. Não há rota pública de avaliação nem portal do cliente em `App.jsx` |
| E-81 | `prisma/schema.prisma:337-354` + `README.md:285` | O cliente final é titular de dados (`clienteTelefone`, `clienteNome`, `comentario`) e tem direito LGPD atendido por `POST /api/lgpd/anonimizar-cliente` — exercido **pelo admin**, não por ele |
| E-82 | `prisma/schema.prisma:485-498` (`ConviteUsuario`) | `papel String @default("funcionario")` — o convite por e-mail nasce no papel mais baixo |

---

## 4. Comportamento atual

### 4.1 O produto que existe hoje (não o que está escrito)

**AdmAi é hoje um painel web de gestão de equipe de campo, 100% operado por navegador, com trial de 14 dias que não expira na prática e sem caminho para pagar.**

O canal WhatsApp — que é o diferencial declarado em E-01…E-05 — está inerte por flag (E-08) e sem superfície de conexão (E-09). Toda a máquina de estados (`conversa.js`), o roteamento por telefone (`inbound.js`), a Evolution API e a Cloud API da Meta existem, são testadas e estão parqueadas de propósito (E-12).

### 4.2 Quem paga vs. quem usa

- **Titular:** a `Empresa`. Uma assinatura por tenant (E-19). Não existe conceito de "assento" ou cobrança por técnico — `STRIPE_PRICE_ID_PRO` é um preço único (`billing.js:48`).
- **Quem pode assinar/gerenciar:** exclusivamente o `dono` (E-23/E-24). O `gestor` não vê nem pode.
- **Quem recebe recibo/aviso de falha:** o primeiro `Usuario` com `papel:'dono'` da empresa (E-26).
- **Duração do trial:** 14 dias corridos, gravados em todos os 4 caminhos de criação de empresa, com cobertura de teste (E-20…E-22).
- **O que acontece quando o trial expira: nada.** `Assinatura.status` nunca é lido para bloquear (E-27). O código nomeia o paywall como tarefa futura, `T-BILL-04` (E-28). No dia 15, o cliente continua usando 100% do produto.
- **Caminho para assinar: não existe.** O card de billing é `breve: true` (E-29) e nenhum manifesto de navegação tem destino de plano (E-30). Cruza exatamente com o fato já verificado pelo orquestrador.
- **Consequência operacional:** se um cliente pagasse (via link Stripe manual), o e-mail de recibo o levaria a uma rota morta (E-31).

### 4.3 O que cada papel consegue fazer hoje

**`dono` — 11 destinos (E-30), `grantTotal` (E-37)**
- Realiza: acompanha KPIs do período com comparativo (`Dashboard.jsx:62-68`), fecha período e exporta PDF (`/reparticao` + `E-46`), cadastra técnico com vínculo trabalhista (E-65/E-66), registra pagamento de comissão, aprova serviços pendentes, gere estoque e materiais, cria contas e edita a matriz de permissões.
- **Trabalho que contrata o produto para fazer:** fechar o mês sem planilha — saber quanto entrou, quanto é de material, quanto é comissão de quem, e emitir a prova.
- **O que falta para o trabalho ficar completo:** (a) pagar pelo produto — não há tela; (b) o canal que ele comprou na landing (WhatsApp) não existe no produto; (c) o PDF sai por download autenticado, mas o destinatário prometido (contador, E-71) não tem forma de acesso.

**`gestor` — 10 destinos, preset em E-36**
- Realiza: home operacional com KPIs do período, contagem de aprovações pendentes, presença do time hoje, satisfação e fila de 5 serviços recentes (E-38/E-39); aprova/rejeita; edita técnicos, estoque e avaliações; **vê** financeiro sem editar.
- **Trabalho:** manter o dia rodando — quem está em campo, o que precisa de aval, o que falta no estoque.
- **O que falta:** (a) **não há agenda/escala** — `Servico` só nasce depois do fato; `iniciadoEm`/`finalizadoEm` existem mas são de uma feature atrás de flag (`schema.prisma:145-152`, `SERVICO_ANDAMENTO_ENABLED`), então "o que está marcado para amanhã" não é representável; (b) não pode criar acesso de gestor — só o dono pode (E-78, `tecnicos.js:301-302`); (c) não vê o custo real do dia (não edita financeiro).

**`funcionario` — 9 destinos (E-45), preset zerado em módulos de empresa (`permissoes.js:90-94`)**
- Realiza: bate ponto com selfie + geo, registra o próprio serviço, vê as próprias métricas e a comissão a receber (E-40…E-42), sobe documentos pessoais, edita perfil e segurança.
- **Trabalho:** provar que trabalhou e conferir se vai receber certo.
- **O que falta:** (a) não vê banco de horas — decisão consciente (E-43); (b) vê `saldoPendente` mas **não vê o extrato de `Pagamento`** — sabe quanto falta, não sabe o que já recebeu e quando; (c) não pode consumir material do catálogo no próprio serviço (E-44), então o líquido do serviço dele é sempre estimado por texto livre.

### 4.4 Especialização em chaveiro

A especialização é **superficial e textual**. São exatamente **8 pontos de código** com a palavra "chaveiro" (E-47…E-54), e **nenhum** deles está em entidade, campo, índice, cálculo, migration ou regra de negócio.

Nada no modelo de dados é de chaveiro:
- `Servico` não tem categoria de serviço (E-55) — não sabe distinguir "abertura de porta" de "cópia de chave" de "troca de segredo". Não há taxonomia nenhuma.
- `Material` é catálogo genérico com unidade `un/m/kg/l` (E-56).
- O único menu de domínio do bot inteiro é `LOCAIS` (E-57), e "Contrato" / "Ponto da loja" servem qualquer prestador com loja e carteira de contratos.
- O módulo de RH (modalidade CLT/12x36/intermitente/autônomo, documentos RG/CNH/contrato — E-58/E-59) é legislação brasileira, não vertical.

O próprio `docs/db/01-discovery.md:13` já descreve o sistema como "Gestão de prestadores de serviço". E o domínio de e-mail em produção é `barbers-flow.com` (E-61) — resíduo literal de outra vertical, o que é evidência de que a base já foi reaproveitada ao menos uma vez.

**[INFERÊNCIA]** Trocar de vertical (climatização, elétrica, dedetização, refrigeração, TI de campo) exigiria alterar os 8 pontos de E-47…E-54 — copy da landing, textos legais, rodapé de e-mail, um prompt de IA, o título do README, uma marca hardcoded, uma chave de localStorage e dois nomes de diretório. **Zero migrations, zero entidades, zero regras.** Isto é uma contagem de pontos de código, não uma afirmação sobre viabilidade comercial em outro mercado — essa parte eu não sei.

### 4.5 Complexidade — a tensão, apresentada sem julgamento

O produto tem **35 páginas / 33 rotas** (E-62/E-63), **115 endpoints** (E-69), **32 chaves de permissão por usuário** (E-64), 2FA em dois fatores independentes + 3 provedores sociais + magic link (E-70), ponto com selfie e geolocalização, estoque com ledger de movimentação e auditoria de saldo, e billing.

Ao mesmo tempo:
- O formulário de cadastro de técnico tem **17 campos em 5 etapas** (E-65/E-66) — mais campos do que o formulário de cadastro de um serviço, que é o evento que gera receita.
- As 4 maiores telas somam **2.646 linhas** e todas violam a convenção de 500 linhas do próprio projeto (E-67/E-68).
- `Login.jsx` (763 linhas) é o **maior arquivo do frontend inteiro** — a tela de entrar é mais complexa que a tela de operar.
- `Seguranca.jsx` tem 671 linhas; o fluxo de cobrar o cliente tem **0**.

Não afirmo que isso seja demais — não é decisão minha. Registro os números.

### 4.6 Sinais de prioridade histórica (ranking factual por módulo)

| Rank | Módulo | Endpoints | Telas | Testes dedicados |
|---|---|---|---|---|
| 1 | **Auth + Conta + Segurança** | 39 (`auth.js` 19 + `account.js` 20) | 8 (Login, Seguranca, RecuperarSenha, TrocarSenha, VerificarEmail, ConviteAceitar, MagicLink, Perfil) | 6 unit (`auth`, `otp`, `totp`, `senha`, `codigosRecuperacao`, `confirmacaoExclusaoConta`) + 8 integração |
| 2 | **Serviços + Dashboard/Relatórios** | 15 (`servicos.js`) | 9 (Servicos, NovoServico, NovoServicoFuncionario, MeusServicos, Dashboard + 3 parts, GestorHome, Reparticao, Aprovacoes) | 7 frontend + 5 integração |
| 3 | **Técnicos / RH / Ponto / Documentos** | 16 (`tecnicos.js` 12 + `documentos.js` 4) | 6 (Tecnicos, NovoTecnico, PerfilTecnico, MeuPonto, Documentos, BancoHoras) | `ponto.test.js` + `e2e_rbac_ponto` + `tecnico_criacao` + `documentos` + `takeover_reset_pin` |
| 4 | **RBAC / Admin / Usuários** | 16 (`admin.js`) | 2 (Usuarios, Configuracao) | `permissoes.test.js` + `rbac_privilege_escalation` + `idor` |
| 5 | **Estoque / Materiais** | 9 (`estoque.js`) | 3 (Estoque, Catalogo, CatalogoModais) | `estoque.test.js` + `catalogo.test.js` |
| 6 | **Google / Avaliações** | 9 (`google.js`) | 1 (Avaliacoes) | `oauth.test.js`, `avaliacao.test.js`, `billing_google_auth` |
| 7 | **WhatsApp / Bot** | 7 (`whatsapp.js`) | 1 — **desligada** | `parser.test.js` + `inbound_numero_unico` |
| 8 | **Billing** | 4 (`billing.js`) | **0** | 2 arquivos (`routes/__tests__/billing`, `services/__tests__/billing`) + `assinatura_cadastro` |

**Leitura:** o discurso (README:23-27, Landing) coloca o WhatsApp como headline; o investimento real está em **autenticação, RBAC e RH**. O roadmap do README (`README.md:719-726`) lista 6 itens, dos quais 3 dependem do canal desligado ("resumo automático semanal no grupo", "validação de líquido no bot", "verificação por OTP"). O módulo que sustenta a receita do negócio (billing) é o **último** em investimento de interface — com endpoints e testes, mas sem nenhuma porta de entrada.

---

## 5. Problemas identificados

**P1 — Não há caminho para receber dinheiro.** Fato já verificado pelo orquestrador, agora confirmado pelos dois lados: backend pronto e testado (E-21…E-26), frontend sem nenhuma superfície (E-29/E-30), e o único link existente aponta para rota morta (E-31). Severidade: existencial para o produto como SaaS.

**P2 — O trial é decorativo.** 14 dias gravados, testados, e sem nenhuma consequência (E-27/E-28). O produto hoje é gratuito e ilimitado por construção.

**P3 — A promessa central da landing não é entregável.** WhatsApp é o 1º recurso, os 3 passos do "como funciona" e a frase do hero (E-03…E-05), e está inerte sem caminho de religar pela UI (E-08/E-09).

**P4 — "Avaliações automáticas" (E-06) dependem de um canal indisponível.** O cron roda a cada 5 min (E-15) e chama `enviarMensagem` (E-13) num gateway que exige env vars de Evolution (E-14). Note a assimetria: `WHATSAPP_HABILITADO` gatilha **apenas o inbound** (`inbound.js:48`) — o outbound não é gatilhado, então o job continua tentando enviar e falha na camada de gateway, em vez de ser um no-op explícito.

**P5 — A tela de Ajuda documenta um produto que não existe.** `Ajuda.jsx:26-57` descreve parsing de mensagem padronizada em grupo (E-16), quando o fluxo real é conversa guiada no privado (E-17); e manda conectar WhatsApp numa tela "Em breve" (E-18). Um cliente que abre "Como usar" recebe instruções falsas.

**P6 — O seletor "Nível de acesso" do cadastro de técnico é inerte.** A UI oferece Técnico/Gerente/Administrador (E-77); o backend só reage a `'gestor'` (E-78). Escolher "Gerente" ou "Administrador" grava a string em `Tecnico.nivelAcesso` (E-79) e cria a conta como `funcionario`. O dono acredita ter promovido alguém e não promoveu.

**P7 — Identidade de marca fragmentada em produção.** "AdmAi" (E-51), "CHAVEIROBOT" na tela de troca de senha (E-52), e e-mails de suporte/privacidade/remetente em `barbers-flow.com` (E-61). O cliente que pedir exclusão de dados escreve para o domínio de outro produto.

**P8 — Não há superfície para o destinatário do relatório.** A landing promete PDF "para o contador" (E-71) e o roadmap promete integração contábil (E-72); hoje o PDF só existe como download autenticado com `financeiro.ver` (E-46).

**P9 — O funcionário não tem extrato de pagamento.** Vê `saldoPendente` (E-42) mas não o histórico de `Pagamento` — o dado que mais gera atrito em equipe de campo. **[INFERÊNCIA]** sobre o atrito; o fato verificado é a ausência da tela.

**P10 — `/billing/status` é legível por qualquer autenticado** (E-25), incluindo funcionário, expondo o estado comercial da empresa a quem não o titulariza. Impacto baixo hoje (nenhuma UI consome), mas é um contrato que endurece quando a tela existir.

---

## 6. Causas prováveis ou confirmadas

**Confirmadas (registradas no próprio repositório):**
- P3, P4, P5 → decisão deliberada de 2026-06-20: "tornar o painel o canal principal (WhatsApp vira feature futura, desligado mas com estrutura pronta)" (`docs/decisions.md:10-12`, `:53-55`). A landing e o README simplesmente **não foram atualizados junto**.
- P1, P2 → sequenciamento de tarefas: `T-BILL-06` (criar `Assinatura` no cadastro) foi entregue; `T-BILL-04` (paywall) foi nomeado e **não** entregue (E-28). A UI de billing nunca teve tarefa correspondente.

**Prováveis (inferência a partir da evidência, marcadas como tal):**
- P7 → **[INFERÊNCIA]** a base foi bifurcada de um produto anterior de barbearia; os defaults de `env.js:117-118` e os textos legais nunca foram migrados. Sustentado por: domínio literal em 4 arquivos + `docs/db/01-discovery.md:13` descrever o sistema em termos genéricos de prestador.
- P6 → **[INFERÊNCIA]** a UI de `NovoTecnico` foi escrita com o vocabulário antigo (`tecnico/gerente/admin`) e o RBAC formalizou outro (`dono/gestor/funcionario`, `docs/decisions.md:14-26`) sem reconciliar o wizard.
- Complexidade acumulada (4.5) → **[INFERÊNCIA]** a Frente de Segurança recente (`FUNCTIONALITY_MATRIX_V1.md:3`, commit-base `fix/seguranca-criticos`) concentrou investimento em auth; isso explica `Login.jsx` ser o maior arquivo do frontend.

---

## 7. Contradições

| # | Contradição | Evidência |
|---|---|---|
| C1 | O README **vende** e **desliga** o WhatsApp no mesmo documento | `README.md:25-27` vs. `README.md:317` + `inbound.js:48` |
| C2 | A landing pública vende um canal inexistente | `Landing.jsx:18-22,51-55,92` vs. `ConfiguracaoBot.jsx:57-80` |
| C3 | A Ajuda descreve um fluxo de bot que não é o implementado | `Ajuda.jsx:26-57` vs. `README.md:144-159` + `conversa.js:43` |
| C4 | A Ajuda instrui a usar uma tela marcada "Em breve" | `Ajuda.jsx:66-77` vs. `ConfiguracaoBot.jsx:65` |
| C5 | "Avaliações automáticas" prometidas dependem de canal off | `Landing.jsx:33-38` vs. `avaliacao.js:91` + `gateway.js:29-48` |
| C6 | Três marcas coexistindo em produção | `README.md:23` (AdmAi) vs. `TrocarSenha.jsx:96` (CHAVEIROBOT) vs. `env.js:117-118` + `Ajuda.jsx:18,231` + `legal.js:81` (barbers-flow.com) |
| C7 | Billing tem 4 endpoints, 3 arquivos de teste, trial em 4 caminhos e **0 telas** | `billing.js` vs. `Configuracao.jsx:56-67` + `navigation.js:41-146` |
| C8 | O e-mail de recibo aponta para uma rota que não existe | `email.js:203` (`/configuracao/billing`) vs. `App.jsx:88-342` |
| C9 | `Assinatura.status` tem 5 estados documentados e nenhum consumidor de bloqueio | `schema.prisma:475-476` vs. grep exaustivo (E-27) |
| C10 | O wizard oferece 3 níveis de acesso; o backend reconhece 1 | `NovoTecnico.jsx:32-36` vs. `tecnicos.js:268-269` |
| C11 | Convenção "< 500 linhas" violada pelas 4 maiores telas | `README.md:547` vs. E-67 |
| C12 | Promete-se entrega ao contador sem papel nem canal | `Landing.jsx:47` + `README.md:726` vs. `estoque.js:261` + `permissoes.js:19-30` |
| C13 | A matriz funcional afirma que billing é "surfaced via `Configuracao.jsx`/`Mais.jsx`" | `FUNCTIONALITY_MATRIX_V1.md:30` vs. `Mais.jsx:29` + `navigation.js` (sem destino de billing) |

---

## 8. Perguntas que dependem do usuário

> Nenhuma destas é respondível pelo repositório. Todas são decisão de produto.

**Sobre monetização (bloqueantes para o produto virar SaaS de verdade)**

1. **No dia 15, o que o cliente pode fazer?** Escolha um regime: (a) bloqueio total; (b) somente leitura — vê histórico, não registra nada novo; (c) degradação por módulo — quais módulos continuam? (d) nada muda (estado atual). Se (b) ou (c): o **funcionário** continua batendo ponto quando a empresa está inadimplente? Isso tem consequência trabalhista para o seu cliente.
2. **Preço único ou faixas?** Hoje há um único `STRIPE_PRICE_ID_PRO` (`billing.js:48`). A cobrança deve variar por nº de técnicos ativos, por volume de serviços, ou é flat?
3. **Quem pode assinar e gerenciar cobrança?** Hoje: só o `dono` (E-24). O `gestor` deve ver o status do plano? E o `funcionario` — hoje `/billing/status` responde a ele (E-25); deve continuar?
4. **Trial de 14 dias é o número certo** para o ciclo de decisão do seu comprador, ou foi um default? (Não sei o comportamento de compra do seu cliente — você sabe.)

**Sobre o canal WhatsApp (decide o valor da landing)**

5. **Religar ou remover?** Três caminhos: (a) religar — a estrutura está pronta e testada, é trocar o export e a flag (`decisions.md:71-73`); (b) manter parqueado e **reescrever landing + README + Ajuda** para vender o painel; (c) manter a promessa como roadmap explícito ("em breve") na própria landing. Hoje o produto está no pior estado dos três: promete sem entregar e sem avisar.
6. Se (b) ou (c): **as avaliações automáticas migram para qual canal?** SMS, e-mail (`services/email.js` já existe e funciona), ou link web público?

**Sobre posicionamento (matéria exclusivamente sua)**

7. **Chaveiro é a vertical definitiva ou o nicho de entrada?** O código está a 8 strings de ser genérico (E-47…E-54, E-55…E-60). A decisão muda o que se investe: taxonomia de serviço de chaveiro (que hoje não existe) vs. configurabilidade de vertical.
8. **Qual é o perfil de contratação do seu cliente-alvo: CLT ou autônomo?** Isto decide metade da complexidade. Se o alvo é chaveiro autônomo/MEI, o módulo de RH inteiro (5 modalidades, banco de horas, 12x36, adicional noturno, documentos RG/CNH — E-58/E-59) é peso morto. Se é empresa com carteira assinada, é o coração.
9. **Marca:** "AdmAi" é definitivo? Migra-se `barbers-flow.com` para domínio próprio (afeta e-mails transacionais e o canal de exercício de direitos LGPD)?

**Sobre papéis a criar**

10. **Contador:** merece papel próprio com acesso somente-leitura a financeiro/relatórios, ou basta o dono exportar e enviar por fora? (A landing já vendeu a promessa — E-71.)
11. **Multi-unidade / franquia:** um dono com 3 lojas deve ter 3 contas separadas (estado atual) ou 1 conta com 3 unidades e visão consolidada? Esta é a decisão **mais cara** do documento: hoje `Empresa` é a raiz de isolamento de tudo (`schema.prisma:20-37`, `db/tenant.js`), e introduzir hierarquia toca multi-tenancy inteiro.
12. **Cliente final:** ganha superfície própria (link web para avaliar, acompanhar o serviço, ver histórico) ou permanece apenas como destinatário de mensagem?
13. **"Gerente" e "Administrador" do wizard (P6):** viram um 4º papel real, são mapeados para `gestor`, ou saem da UI?

**Sobre completude de trabalho**

14. **O funcionário deve ver o extrato do que já recebeu** (P9), ou o repasse é conversa fora do sistema?
15. **Existe agenda/escala no futuro do produto?** Hoje o serviço só é registrado depois de feito; o gestor não consegue planejar o dia. Isso é lacuna ou é intencional?

---

## 9. Alternativas

> Apresento **quatro apostas coerentes**, com o custo em superfície de código. A escolha entre elas é sua.

**Alternativa A — Fechar o loop de monetização**
Construir a tela de Plano (consome `/billing/status`, `/billing/checkout`, `/billing/portal` — todos prontos), adicionar destino em `navigation.js`, corrigir o link morto (`email.js:203`), e implementar o paywall `T-BILL-04` conforme o regime que você escolher na Q1.
*Custo:* 1 página nova + 1 middleware + 1 entrada de navegação + 1 correção de link. O backend já existe e é testado.
*Prós:* é o único item cuja ausência impede o negócio de existir; independe de todas as outras decisões.
*Contras:* nenhum identificado — nas quatro alternativas, cobrar continua necessário.

**Alternativa B — Honrar a landing: religar o WhatsApp**
Trocar o export de `ConfiguracaoBot` (`ConfiguracaoBot.jsx:56` documenta o procedimento), ligar `WHATSAPP_HABILITADO=true`, provisionar `EVOLUTION_HOST`/`EVOLUTION_API_KEY`/`ENCRYPTION_KEY`/`PUBLIC_URL`, e reescrever `Ajuda.jsx:26-57` para o fluxo real.
*Prós:* recupera o diferencial vendido; a estrutura já está pronta e testada (`inbound_numero_unico.test.js`, `parser.test.js`).
*Contras:* dependência operacional externa (Evolution/Meta) e custo de suporte de um canal não-oficial; `docs/decisions.md:10-12` mostra que a decisão de desligar foi tomada com o dono do produto — reverter precisa do mesmo nível de decisão.

**Alternativa C — Assumir "prestador de serviço de campo" e despecializar**
Trocar os 8 pontos de E-47…E-54, tornar `Servico` categorizável, e vender horizontal.
*Prós:* o código já é genérico (E-55…E-60); `docs/db/01-discovery.md:13` já descreve assim.
*Contras:* **[INFERÊNCIA]** produto horizontal costuma competir em terreno mais disputado que nicho — mas eu **não tenho dado de mercado** para afirmar isso no seu caso. Esta é exatamente a decisão que não é minha.

**Alternativa D — Alinhar a comunicação sem mudar o produto**
Reescrever landing, README e Ajuda para descrever o painel (o produto que existe), marcando WhatsApp como roadmap explícito.
*Prós:* elimina C1…C5 e C12 sem tocar em nenhuma regra de negócio; é a intervenção mais barata do documento.
*Contras:* enfraquece o pitch — o painel sem o bot é um gestor de campo entre outros. **[INFERÊNCIA]** sobre a força relativa do pitch.

**Combinação livre.** A e D são compatíveis com todas as outras e entre si. B e D são mutuamente exclusivas no texto (ou o WhatsApp volta, ou a landing muda). C é ortogonal a A/B/D.

---

## 10. Recomendação

**Não recomendo posicionamento, público-alvo nem prioridade — isso é seu.** Recomendo apenas o que é verdadeiro sob **qualquer** das quatro alternativas:

**R1 — A superfície de billing é necessária em todos os cenários.** Em A, B, C ou D, a empresa precisa receber. É o único item do relatório cuja construção não depende de nenhuma resposta às perguntas do item 8, exceto o **regime de expiração** (Q1) — e mesmo esse pode ser entregue em fases: primeiro a tela de assinar (que só precisa do que já existe no backend), depois o paywall.

**R2 — As contradições de comunicação (C3, C4, C6, C8, C10) custam zero em posicionamento e são corrigíveis já.** `Ajuda.jsx` descrevendo um fluxo inexistente, "CHAVEIROBOT" na tela de senha, o link de recibo para rota morta e o seletor de nível de acesso inerte não dependem de nenhuma decisão sua — são divergências entre o que o código faz e o que a interface diz que faz.

**R3 — Responda Q8 (CLT vs. autônomo) antes de investir mais em qualquer módulo.** É a pergunta com maior alavancagem do documento: ela determina se o módulo de RH (5 modalidades, banco de horas, 12x36, adicional noturno, documentos, ponto com selfie/geo — o **3º maior investimento do repositório**, E-69/tabela 4.6) é o coração do produto ou peso morto. Nenhum outro item de escopo tem esse tamanho de consequência.

**R4 — Trate Q11 (multi-unidade) como decisão arquitetural, não de feature.** `Empresa` é a raiz de isolamento de todo o sistema (`README.md:497-507`); introduzir hierarquia depois de ter clientes é substancialmente mais caro do que decidir agora. Não estou dizendo qual escolher — estou dizendo que o custo de adiar não é linear.

---

## 11. Impactos cruzados

- **Billing × RBAC:** se o paywall for por módulo (Q1c), ele passa a ser um **segundo eixo de autorização** cruzando com os 32 toggles de `permissoes.js` (E-64). A combinação `papel × override × status da assinatura` multiplica a superfície de teste. Um paywall global (tudo ou nada) é ortogonal ao RBAC e não cria esse cruzamento.
- **Billing × exclusão de conta:** `routes/account.js:85-89` já documenta que `Assinatura` tem FK obrigatória com `RESTRICT` e precisa ser apagada antes da empresa. Qualquer mudança em billing toca o fluxo de autoexclusão (LGPD).
- **WhatsApp × Avaliações × Google:** religar o bot (B) reativa o envio de pesquisa (`avaliacao.js:88-91`), a captura de resposta (`avaliacao.js:132-136`) e o resumo semanal no grupo (`agendador.js:113-158`) — três features param de ser inertes ao mesmo tempo. Manter desligado (D) exige decidir o canal alternativo dessas três.
- **Papel novo (contador/franqueado/supervisor) × `permissoes.js`:** `PAPEIS` (`permissoes.js:55`) é ordenado e o **índice é o nível de autoridade** (`nivelDoPapel`, linhas 189-192). Inserir um papel no meio do array **reordena a hierarquia inteira** e afeta `podeGerenciarUsuario` e `podeAtribuirPapel` — que são exatamente as funções que fecharam a escalada de privilégio documentada em `permissoes.js:196-206`. Papel novo é mudança de segurança, não de UI.
- **Despecialização (C) × textos legais:** `lib/legal.js:17,33,81` define a empresa-cliente como Controladora e o AdmAi como Operador em termos de "empresa de chaveiro". Mudar a vertical exige revisão jurídica — e `FUNCTIONALITY_MATRIX_V1.md:40` já registra que os textos legais são placeholders pendentes de revisão.
- **Multi-unidade (Q11) × multi-tenancy:** `prismaParaEmpresa()` escopa tudo por `empresaId`. Hierarquia de empresa exige decidir se a consolidação é query cross-tenant (fura o isolamento) ou agregação em camada superior. Toca a regra de ouro do projeto (`README.md:497-501`).
- **Extrato de pagamento ao funcionário (Q14) × `MeuPainel`:** é a única lacuna do item 5 que se resolve com **um endpoint self-scoped** reusando o padrão de `/me/servicos` — sem tocar RBAC, sem migration.

---

## 12. Grau de confiança

| Afirmação | Confiança | Base |
|---|---|---|
| Não há paywall; `Assinatura.status` nunca bloqueia nada | **Muito alta** | Grep exaustivo em `chaveiro-bot/src` (E-27) + comentários que nomeiam o paywall como futuro (E-28) |
| Não há superfície de billing no painel | **Muito alta** | `Configuracao.jsx:56-67` + `navigation.js` completo (E-29/E-30) + fato já verificado pelo orquestrador |
| Trial = 14 dias em todos os caminhos de criação de empresa | **Muito alta** | 4 call-sites + 4 testes (E-20…E-22) |
| Titular da assinatura é a Empresa; só o dono gerencia | **Muito alta** | `schema.prisma:471` + `billing.js:18,29` + `middlewares/auth.js:88-91` + `admin.js:235` |
| WhatsApp inerte e sem caminho de religar pela UI | **Muito alta** | `inbound.js:48` + `ConfiguracaoBot.jsx:57-80` + `decisions.md:53-55` |
| Especialização em chaveiro é apenas textual (8 pontos) | **Alta** | Grep case-insensitive nos dois pacotes + leitura de `Servico`/`Material`/`conversa.js`. Pode haver alguma string em arquivo `.md` ou fixture não coberta |
| Seletor de nível de acesso é inerte (P6) | **Alta** | `NovoTecnico.jsx:32-36` + `tecnicos.js:268-269`. Não executei o fluxo |
| Ranking de investimento por módulo (4.6) | **Alta** | Contagem programática de handlers + `ls` de testes + `wc -l`. É proxy, não medida de esforço real |
| Cron de avaliação tenta enviar e falha no gateway | **Média** | `agendador.js:361-372` + `avaliacao.js:91` + `gateway.js:29-48`. Não executei; o comportamento exato depende de env vars de produção que não li |
| Gestor não tem agenda/escala | **Alta** | Ausência de modelo de agendamento no schema; `iniciadoEm/finalizadoEm` atrás de flag (`schema.prisma:145-152`) |
| Qualquer afirmação sobre mercado, concorrentes ou comportamento de chaveiros | **Nenhuma** | Sem acesso à web. Todas marcadas `[INFERÊNCIA]` ou convertidas em pergunta |

---

## 13. Pontos não verificados

1. **Estado real de produção.** Não sei quais env vars estão setadas em Railway/Supabase: `WHATSAPP_HABILITADO`, `EVOLUTION_HOST`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_PRO`, `STRIPE_WEBHOOK_SECRET`. Toda a análise é sobre o código; o comportamento observável em produção depende dessa configuração.
2. **Se existe algum cliente pagante hoje** e por qual mecanismo (link Stripe manual, gratuidade, etc.).
3. **Volume real:** nº de empresas, técnicos, serviços e batidas. `docs/db/01-discovery.md:17` marca isto como **BLOQUEANTE** e ainda não respondido.
4. **Não executei nenhum fluxo** — nem o wizard de técnico (P6), nem checkout, nem o bot. Tudo é leitura estática.
5. **Não li integralmente:** `Login.jsx` (763), `PerfilTecnico.jsx` (686), `Seguranca.jsx` (671), `Servicos.jsx`, `Usuarios.jsx`, `MeuPonto.jsx`, `Reparticao.jsx`, `routes/servicos.js`, `routes/account.js`, `services/relatorio.js`, `services/ponto.js`. Podem conter jobs-to-be-done ou promessas que não capturei.
6. **Conteúdo do PDF de fechamento** (`services/relatorio.js`) — não verifiquei se ele já traz formato adequado a contador/MEI, o que afeta a Q10.
7. **`docs/BUGLIST.md`, `SECURITY_HARDENING_BACKLOG.md`, `GO_LIVE_CHECKLIST.md`, `PROJECT_BASELINE_V1.md`** — não lidos nesta rodada (fora das fontes designadas); podem conter decisões de produto já tomadas que eu reapresentei como pergunta.
8. **Histórico Git** — não consultei `git log`. A ordem cronológica real de investimento por módulo pode diferir do proxy que usei (endpoints/telas/testes).
9. **App mobile (Capacitor).** `FUNCTIONALITY_MATRIX_V1.md:41` registra que o comportamento em device Android real nunca foi confirmado. Não investiguei — pode haver superfícies ou limitações de produto exclusivas do mobile.
10. **Se `ConfiguracaoBotLegado` ainda funciona.** `decisions.md:71-73` afirma que religar é "trocar o export + ligar a flag", mas não validei que o código parqueado ainda casa com a API atual de `/bot/whatsapp/status` (`ConfiguracaoBot.jsx:96`).
