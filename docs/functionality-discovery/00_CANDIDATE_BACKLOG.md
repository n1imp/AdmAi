# 00 — Catálogo de Candidatos

> **Este documento não aprova nada.** Cada item é uma `[HIPÓTESE]` ou `[PENDENTE]` derivada de
> evidência real do repositório, oferecida como material para o usuário escolher o tema da
> Rodada 1. Nenhum item aqui é decisão do usuário, e nenhum é decisão do orquestrador.
>
> Criado por `[DECISÃO DO USUÁRIO]` DEC-000.1.

**Filtro de admissão:** `[DECISÃO DO USUÁRIO]` DEC-000.3 — a frente cobre funcionalidades novas
**e** amadurecimento das existentes.

**Data do levantamento:** 2026-08-05 · **Commit-base:** `30bf545` (código idêntico à tag
`project-baseline-v1`).

---

## C1 — Funcionalidades prontas, porém desligadas por variável de ambiente

`[EVIDÊNCIA DO REPOSITÓRIO]` Não existe sistema de feature flags. São strings de ambiente
comparadas a `'true'`, validadas em `chaveiro-bot/src/config/env.js`. Quando desligada, a rota
responde **404** e o painel feature-detecta pelo 404/403.

| Flag | Funcionalidade construída | Consumo |
|---|---|---|
| `SERVICO_ANDAMENTO_ENABLED` | Serviço em andamento: `/me/servico-atual`, iniciar, concluir (`Servico.status = 'em_andamento'`, `iniciadoEm`/`finalizadoEm`) | `routes/servicos.js:608` |
| `DOCUMENTOS_ENABLED` | Documentos do funcionário (`DocumentoTecnico`, bucket privado, URL assinada) | `routes/documentos.js:50` |
| `GOOGLE_REVIEWS_ENABLED` | Avaliações do Google Business Profile + análise por IA | `services/google/businessClient.js:22`, `agendador.js:249` |
| `WHATSAPP_HABILITADO` | Canal WhatsApp inteiro (ver C4) | `services/inbound.js:48` |

Há código de produto completo por trás de cada uma — rotas, serviços, models, telas e testes.
`[PENDENTE]` O valor efetivo de cada flag na produção real (Railway) não é verificável a partir
do repositório — Q-002.

**Por que é um candidato de descoberta, não de implementação:** decidir *se*, *para quem* e *sob
qual condição* cada recurso é ligado é decisão de produto, e cada um tem pré-requisitos
diferentes (bucket provisionado, credenciais Google, número de WhatsApp).

---

## C2 — Retenção e expurgo da selfie e geolocalização do ponto — **CORRIGIDO**

> **Correção de 2026-08-05 (Rodada 1).** A redação original deste candidato afirmava que a
> retenção **não estava implementada**, apoiada em `docs/decisions.md:84-102`. **Essa afirmação
> era falsa.** O registro em `docs/decisions.md` é de 2026-06-21, a funcionalidade foi
> implementada depois e o documento nunca foi atualizado. Erro do orquestrador: usou relatório
> como prova de comportamento atual, contrariando `00_EOS_DISCOVERY_PROTOCOL.md` §3. Corrigido
> por leitura direta do código.

`[EVIDÊNCIA DO REPOSITÓRIO]` **A retenção está implementada e agendada.**
`chaveiro-bot/src/services/agendador.js`:

- `RETENCAO_PONTO_DIAS = 365` (`:168`), com o comentário declarando a finalidade — descartar a
  PII sensível após o prazo de contestação trabalhista, mantendo a batida/hora como prova de
  jornada.
- `expurgarProvasPonto(corte)` (`:216-240`): apaga o arquivo da selfie no storage privado
  (`removerImagem('selfies-ponto', …)`) e nos dois diretórios de disco (atual `./uploads-ponto`
  e legado `./uploads`), e depois zera `selfieUrl`, `lat`, `lng` e `precisao` da batida. Usa
  `path.basename` contra path traversal. Idempotente.
- `limparDadosAntigos()` (`:183`) roda no cron `30 3 * * *` (`:374`), TZ São Paulo, sob lock
  distribuído no Redis. Também remove `SessaoConversa` com mais de 7 dias (`:164`) e anonimiza a
  PII do cliente final em `Avaliacao` após 180 dias (`:163`, zera `clienteTelefone`,
  `clienteNome` e `comentario`).

**O que continua genuinamente aberto:**

1. `[PENDENTE]` O prazo de **365 dias foi fixado no código**, sem registro de aprovação do
   usuário nem de validação profissional. A justificativa ("prazo de contestação trabalhista")
   está num comentário de código, não numa decisão registrada. → Q-022.
2. `[EVIDÊNCIA DO REPOSITÓRIO]` **A Política de Privacidade publicada não menciona selfie,
   localização, geolocalização nem biometria em nenhum ponto** — busca por esses termos em
   `chaveiro-painel/src/lib/legal.js` retorna zero. A seção "8. Retenção e descarte"
   (`legal.js:70-75`) lista apenas Conta (12 meses), Clientes finais `[180 dias]` e Logs técnicos
   `[90 dias]`. Ou seja: o código retém e expurga a categoria mais sensível, e o documento legal
   publicado silencia sobre ela.
3. `[EVIDÊNCIA DO REPOSITÓRIO]` **Sem retenção implementada:** `DocumentoTecnico` (documentos do
   funcionário) e `Servico.fotoEvidencia` — nenhum dos dois aparece em `limparDadosAntigos`.

---

## C3 — Transparência no momento da coleta — **CORRIGIDO**

> **Correção de 2026-08-05 (Rodada 1).** A redação original afirmava que a captura ocorre "sem
> tela de aviso prévio". **Falso.** Mesma causa-raiz de C2: `docs/decisions.md:84-102` usado como
> prova do estado atual.

`[EVIDÊNCIA DO REPOSITÓRIO]` **O aviso prévio está implementado** em
`chaveiro-painel/src/pages/MeuPonto.jsx`:

- estado `mostrarAviso` (`:73`), comentado como "consentimento LGPD (1ª vez)";
- modal `ariaLabel="Coleta de selfie e localização"` (`:303-330`), exibido **antes da primeira
  captura**, declarando que são coletadas selfie e localização (GPS) no momento da batida, com
  link para a Política de Privacidade;
- texto permanente na própria tela (`:250-252`): "Ao bater, capturamos uma selfie e sua
  localização para comprovar a jornada", também com link para a política;
- a finalidade declarada no código (`:93`) é "comprovação de jornada/anti-fraude".

**O que continua aberto:** o aviso in-app aponta para uma Política de Privacidade que **não
descreve** essa coleta (ver C2, item 2). A transparência está completa na tela e incompleta no
documento legal — e o documento legal é o instrumento que vale perante o titular. Depende de C12.

---

## C4 — Futuro do canal WhatsApp `[PENDENTE]` `[ADIADO PARA RODADA FUTURA]`

> **Atualização de 2026-08-05 (COND-001):** o usuário declarou que **o WhatsApp não é tratado
> nesta sessão**. O candidato sai da pauta da Rodada 1 e de qualquer lote dela. `Q-003` migra para
> "Adiadas" em `00_OPEN_QUESTIONS.md` — adiar não é decidir, então a questão continua aberta.
>
> **Atenção normativa preservada:** o usuário escolheu "novas + amadurecer existentes" e **não**
> escolheu a alternativa que incluía a reativação do WhatsApp (DEC-000.3). Não interpretar
> "amadurecer existentes" como autorização implícita.
>
> Toda a evidência abaixo permanece válida e intacta — o adiamento é de **quando** tratar, não de
> **se** o achado é verdadeiro.

`[EVIDÊNCIA DO REPOSITÓRIO]`
- `README.md` apresenta o WhatsApp como **o** diferencial do produto ("os técnicos registram
  serviços conversando com um robô no WhatsApp").
- `docs/decisions.md:53-56`: estrutura preservada atrás de flag, tela "Em breve" no painel, bot
  inerte (webhook responde 200 sem processar). Religar = trocar o export + ligar
  `WHATSAPP_HABILITADO=true`.
- `ConfiguracaoBot.jsx` mantém a implementação real como `ConfiguracaoBotLegado`; o `default` é
  a tela "Em breve".
- Dois provedores implementados: Evolution API (multi-instância) e WhatsApp Cloud API da Meta.
- TODO real: `services/whatsapp/cloud-gateway.js:127` — só texto é tratado na Cloud API.
- Pré-requisito de segurança já registrado: item 2 do `SECURITY_HARDENING_BACKLOG.md` exige
  resolver `/uploads` estático sem autenticação **antes** de reativar o WhatsApp, não depois.

**Tensão a resolver com o usuário:** o produto se descreve publicamente por um canal que está
desligado.

---

## C5 — As oito lacunas de produto ainda abertas em `docs/db/01-discovery.md`

`[EVIDÊNCIA DO REPOSITÓRIO]` Uma descoberta anterior (de banco/arquitetura) deixou 8 itens
marcados `⚠️ BLOQUEANTE/CONFIRMAR` que só o dono do produto resolve:

1. Volume atual (nº de empresas/serviços/batidas) e projeção 12/24/36 meses.
2. RNF: SLA, p95 alvo, RPO/RTO, janela de manutenção.
3. Base legal por finalidade + prazo de retenção `N` + DPO (cruza com C2).
4. Papéis futuros: haverá "contador", "franqueado", multi-loja por dono?
5. Internacionalização: outro país, moeda, idioma, fuso?
6. Storage: volume mensal de selfies, provedor.
7. Isolamento por plano: enterprise exigiria banco dedicado?
8. Frescor exigido dos relatórios: tempo real vs. diário.

`[INFERÊNCIA]` Vários desses respondem perguntas que **qualquer** rodada de funcionalidade vai
esbarrar (papéis futuros afeta RBAC; i18n afeta toda tela; retenção afeta todo dado pessoal).

**Dono da resposta:** USUÁRIO (Q-005).

---

## C6 — `POST /me/documentos` retorna 500 em produção real

`[EVIDÊNCIA DO REPOSITÓRIO]` `PROJECT_BASELINE_V1.md` §12, Gate 7: smoke test real em produção,
11 de 12 passos OK; `POST /me/documentos` → **500**, causa raiz **não diagnosticada** (a
aplicação não expõe stack trace e não houve acesso aos logs do Railway). Registrado como
pendência objetiva, não corrigido.

`[HIPÓTESE]` Cruza com C1: a rota responderia 404 se `DOCUMENTOS_ENABLED` estivesse off, então
a flag provavelmente **está ligada** em produção e a falha é posterior ao gate — candidata
natural: o bucket privado `documentos-tecnico` do Supabase Storage. Não verificado.

Estado do módulo: implementado ponta a ponta (rota, `DocumentoTecnico`, `services/storage.js`,
`Documentos.jsx`, 7 testes de integração, 6 de componente, 1 de axe, cobertura E2E M4).

---

## C7 — Ausência de staging de aplicação

`[EVIDÊNCIA DO REPOSITÓRIO]` Confirmado por três fontes independentes: `deploy.yml` publica
apenas `--project-name=admai-painel --branch=master`, sem `environment:` nem branch alternativa;
zero ocorrência de staging/preview/homologação em `.github/workflows/`; `docs/CI_CD.md` lista só
três destinos.

O que **existe** é um projeto Supabase de banco (`admai-staging`, ref `qsuufuulxfkkeasgxhcv`,
Healthy) com kit de validação pronto (`scripts/validate-staging.mjs`, trava anti-produção por
allowlist de ref) que **nunca foi executado** — falta o usuário preencher `.env.staging`
(`docs/db/STAGING_VALIDATION.md`).

**Por que está neste catálogo:** a constituição exige que toda especificação tenha estratégia
local → staging → produção e proíbe tratar local como equivalente a staging. Isso torna a
criação do staging um pré-requisito estrutural de toda rodada, não um item opcional (Q-006).

---

## C8 — Roadmap declarado e nunca especificado

`[EVIDÊNCIA DO REPOSITÓRIO]` `README.md` §Roadmap lista, sem especificação:

- Resumo automático semanal no grupo (ranking de receita por técnico, destaque da semana) — há
  um cron `0 18 * * 0` e testes em `agendador.test.js`, ou seja, **parte já existe**.
- Validação de líquido no bot (recalcular cobrado − material e avisar divergências).
- Histórico por endereço (detectar clientes recorrentes e alertar o admin).
- Verificação de e-mail/telefone por OTP sobre a estrutura já existente em `Usuario` — há OTP de
  telefone implementado (`services/otp.js`) e `REQUIRE_EMAIL_VERIFICATION` como flag.
- App Android nativo (PWA → React Native + Expo) — hoje é Capacitor/WebView.
- Integração contábil (exportação compatível com MEI).

`[INFERÊNCIA]` Três destes têm infraestrutura parcial já construída; especificá-los é mais
"amadurecer existente" do que "criar novo". Dois (React Native, integração contábil) são
mudanças de porte e provavelmente rodadas próprias.

---

## C9 — Duas camadas de design system convivendo

`[EVIDÊNCIA DO REPOSITÓRIO]`
- Camada legada: Tailwind 3 com paleta grafite/ciano (`tailwind.config.js`, classes `.card`,
  `.btn-primary` em `src/index.css`).
- Camada nova "Aurora": tokens `--panel-*` com marca violeta (`src/styles/panel.css`),
  primitives próprias (`panel-primitives.css`, `panel-overlay.css`).
- `src/styles/panel-rollout.css:1-11` **remapeia** as classes Tailwind legadas para os tokens
  novos, mas só dentro do escopo `.panel-ui` — landing e páginas legais ficam fora e mantêm a
  identidade antiga, por decisão de escopo (`ui/PanelScope.jsx`, `App.jsx:84`).
- Tema dark-only, sem alternância clara/escura.

**Por que importa numa frente de funcionalidades:** toda tela nova precisa declarar em qual
camada nasce; sem essa decisão, a divergência visual cresce a cada funcionalidade.

---

## C10 — Lacunas estruturais de acessibilidade

`[EVIDÊNCIA DO REPOSITÓRIO]` A base é sólida — focus trap e `inert` no `Overlay`, combobox ARIA
APG no `MaterialPicker`, live regions, alternativa textual de gráficos, alvos de toque de 44/54px,
`prefers-reduced-motion`, suíte axe **bloqueante** no CI. As lacunas são específicas:

- **Não existe skip link** ("pular para o conteúdo") em nenhum arquivo.
- **Não existe `eslint-plugin-jsx-a11y`** — `eslint.config.js:26` carrega só `react` e
  `react-hooks`.
- **Contraste não é verificado automaticamente** — `color-contrast` e `region` estão desligadas
  em `src/test/axe.js:13-16` por limitação do jsdom.
- A cobertura axe alcança 5 arquivos; telas grandes como `Login.jsx` (763 linhas),
  `Seguranca.jsx` (671) e `PerfilTecnico.jsx` (686) não têm teste algum.

Referência aplicável: WCAG 2.2 `[PESQUISA EXTERNA]` a consultar na rodada correspondente.

---

## C11 — Leads funcionais nunca reproduzidas

`[EVIDÊNCIA DO REPOSITÓRIO]` `docs/BUGLIST.md` (diagnóstico de 2026-07-07) tem 3 leads ainda
marcadas "a verificar", nunca reproduzidas:

- **L2 — captura mobile em device real:** câmera e GPS usam APIs web (`getUserMedia`,
  `navigator.geolocation`), **não** plugins Capacitor (o painel não tem `@capacitor/camera` nem
  `@capacitor/geolocation`). Não há automação de device real; o E2E existente mocka `/api`.
- **L4 — performance de paginação/agregação:** `take:10000` em JS em vez de no banco; a
  `FUNCTIONALITY_MATRIX_V1.md` registra que não foi confirmado corrigido. Há paginação keyset
  implementada em `/servicos` (`servicos_keyset.test.js`), mas `/avaliacoes` segue citado.
- **L5 — observabilidade:** Sentry DSN vazio no cenário observado, sem handler global de
  `unhandledrejection`. Nota A: sem Redis, o rate limiter derruba toda `/api` em vez de degradar.

`[INFERÊNCIA]` L2 é a que mais afeta a frente de funcionalidades: o produto é mobile-first e o
fluxo mais sensível (bater ponto com selfie + geo) nunca foi validado num aparelho real.

---

## C12 — Textos legais ainda são modelo com `[placeholders]`

`[EVIDÊNCIA DO REPOSITÓRIO]` `docs/legal/POLITICA_DE_PRIVACIDADE.md` e `TERMOS_DE_USO.md` abrem
com aviso de que são **modelo**, com campos `[NOME DA EMPRESA OPERADORA]`, `[CNPJ]`, `[DPO]`,
`[DD/MM/AAAA]`. `docs/GO_LIVE_CHECKLIST.md` FASE B (B1-B3) mantém os três itens em aberto.

As páginas `/privacidade`, `/termos` e `/cookies` são públicas e servidas de
`chaveiro-painel/src/lib/legal.js`. Há `CookieBanner` gravando consentimento e o PostHog é
gated por esse consentimento.

**Dependência:** C3 precisa apontar para uma política real; C2 precisa que a política declare o
prazo de retenção. `[PROFISSIONAL]` — exige validação jurídica, nunca concluída aqui.

---

## C13 — Planos, assinatura, trial, cobrança e controle de acesso comercial `[PENDENTE]` `[ADIADO PARA RODADA FUTURA]`

> **Criado em 2026-08-05 por COND-001.** O usuário declarou que planos e cobrança não são tratados
> nesta sessão. Este candidato existe para **preservar a evidência já levantada** e garantir que
> ela chegue inteira à rodada que tratar do assunto. **Nenhuma pergunta de implementação de
> billing é feita na Rodada 1.**

`[EVIDÊNCIA DO REPOSITÓRIO]` — levantado por `EOS-Product-Discovery` e verificado independentemente
pelo orquestrador antes do relatório:

| Achado | Evidência |
|---|---|
| **Não existe caminho no produto para o cliente assinar ou gerenciar a assinatura** | Grep por `billing\|assinatura\|checkout\|portal` em `chaveiro-painel/src` retorna **uma única ocorrência**: o card "Plano e cobrança / Assinatura e faturas" marcado `breve: true` em `Configuracao.jsx:56-67`, que dispara `toast('Em breve disponível')` (`:196-198`). Nenhum manifesto de navegação tem destino de billing (`navigation.js`, os 3 papéis) |
| O backend **está pronto e testado** | `POST /billing/checkout` e `/billing/portal` (`routes/billing.js:18,29`, `adminOnly`), `GET /billing/status` (`:46`, só `requireAuth`); 3 arquivos de teste |
| Titular da assinatura é a **empresa**, preço único | `schema.prisma:468-482` (`empresaId @unique`); `STRIPE_PRICE_ID_PRO` único (`billing.js:48`) |
| Trial de 14 dias em **4 caminhos** de criação de empresa, com teste de integração | `services/billing.js:8` (`TRIAL_DIAS = 14`); `bootstrap.js:55-59`, `auth.js:369-373,409-413,841-845`; `test/integration/assinatura_cadastro.test.js:64-113` |
| **O trial não expira na prática** | Grep exaustivo: `Assinatura.status` é escrito pelos webhooks e lido **apenas** em `/billing/status` e `/billing/portal`. **Nenhum middleware, rota ou service lê o status para bloquear qualquer funcionalidade** |
| O paywall está nomeado no próprio código como tarefa futura | `routes/auth.js:407`, `:840`; `services/__tests__/bootstrap.test.js:10` — "o paywall (T-BILL-04, **futuro**)" |
| O e-mail de recibo aponta para **rota inexistente** | `services/email.js:203` linka `/configuracao/billing`; a rota não existe em `App.jsx:88-342`; o catch-all redireciona para `/` |
| `GET /billing/status` é legível por **qualquer autenticado**, inclusive funcionário | `routes/billing.js:46` |
| A matriz funcional v1 afirmava que billing era "surfaced via `Configuracao.jsx`/`Mais.jsx`" — **incorreto** | `FUNCTIONALITY_MATRIX_V1.md:30` vs. `Mais.jsx:29` (deriva 100% de `buildNavigation`, que não tem billing) |

**Questão adiada correspondente:** Q-023 em `00_OPEN_QUESTIONS.md`.

---

## C14 — Inconsistência de identidade de marca `[HIPÓTESE]` sobre a causa, `[EVIDÊNCIA DO REPOSITÓRIO]` sobre o fato

Separado de C13 de propósito: **não é assunto de cobrança** e não deve ser adiado junto com ele.

`[EVIDÊNCIA DO REPOSITÓRIO]` Três identidades coexistem no produto servido:

- **"AdmAi"** — `README.md:23`, rodapé de e-mail (`services/email.js:83`).
- **"CHAVEIROBOT"** — renderizado na tela de troca de senha (`chaveiro-painel/src/pages/TrocarSenha.jsx:96`).
- **`barbers-flow.com`** — domínio de suporte, privacidade e remetente (`chaveiro-bot/src/config/env.js:117-118`; `Ajuda.jsx:18,231`; `lib/legal.js:81`).

**Consequência concreta:** o titular que quiser exercer direito de exclusão de dados escreve para
o domínio de outro produto.

`[HIPÓTESE]` A explicação de que "a base foi reaproveitada de uma vertical anterior" é plausível
e foi levantada pelo `EOS-Product-Discovery` já marcada como inferência — **mas o domínio sozinho
não a prova**. O que está provado é a inconsistência, não a história. Confirmar ou refutar a
origem depende de resposta do usuário, não de leitura de código.

**Destino:** rodada de identidade/comunicação, ou junto de C12 (textos legais), porque o canal de
privacidade é justamente um dos pontos afetados.

---

## Classificação pela Rodada 1

> **Classificar não é aprovar.** Nenhum item abaixo virou escopo autorizado. A Rodada 1 apenas
> determina **como** cada candidato se relaciona com a constituição funcional: se vira princípio
> transversal, se vira dependência, ou se sai para rodada própria.

| # | Classificação na Rodada 1 | Onde é resolvido |
|---|---|---|
| C1 | Vira **princípio transversal** — a Rodada 1 define a política de produto para funcionalidade indisponível/desativada/em teste/parcial, não o sistema de flags | Lote 12; §16 do prompt de abertura. A implementação do sistema de flags fica `[FORA DE ESCOPO]` |
| C2 | Vira **dependência de política de dados** — a Rodada 1 fixa princípios de coleta e retenção; o prazo `N` é decisão do usuário com validação profissional | Lote 10 · Q-022 (absorve Q-004) |
| C3 | Idem C2, no eixo de **transparência na coleta** | Lote 10 · depende de C12 para o texto |
| C4 | **`[ADIADO PARA RODADA FUTURA]` por COND-001** — o WhatsApp não é tratado nesta sessão | Q-003, migrada para "Adiadas" |
| C5 | **Decomposto nesta rodada** em 16 questões rastreáveis | Q-007 a Q-022 em `00_OPEN_QUESTIONS.md` |
| C6 | **Sai para rodada própria.** Bug real em produção, não é matéria constitucional | Rodada futura; cruza com Q-002 |
| C7 | **Resolvido como gate estrutural** | **DEC-002** — pré-requisito de toda promoção |
| C8 | **Especificação posterior.** Cada item do roadmap vira rodada ou entra numa rodada temática. **Os itens de relatório ficam adiados junto com Q-024** (COND-001: relatórios não são tratados nesta sessão) | Fora da Rodada 1; herda as regras transversais dela |
| C13 | **`[ADIADO PARA RODADA FUTURA]` por COND-001** — criado nesta correção para preservar a evidência de billing | Q-023 |
| C14 | **Rodada de identidade/comunicação** — não é billing e não foi adiado junto | Depende de resposta do usuário sobre a origem |
| C9 | Vira **regra global** — a Rodada 1 decide em qual camada uma tela nova nasce; não altera nenhum CSS | Lote 7 |
| C10 | Vira **critério global** — a Rodada 1 fixa o nível de acessibilidade exigível e verificável; não implementa correção | Lote 7 |
| C11 | Entra na **estratégia de qualidade** — validação em dispositivo real vira item declarado da seção 26/27 de toda rodada | §27 da Rodada 1 · DEC-002 |
| C12 | É **dependência, não detalhe opcional** — nenhuma funcionalidade que colete dado pessoal novo pode ser aprovada apontando para texto legal que ainda é modelo | Lote 10 |

---

## Como usar este catálogo

O usuário escolhe o tema da Rodada 1. O catálogo não impõe ordem, mas registra três dependências
factuais que afetam sequenciamento:

- **C2 e C3 andam juntos** — retenção e transparência são a mesma pendência registrada em
  `docs/decisions.md`, e ambos dependem de C12 para o texto.
- **C5 destrava várias rodadas** — papéis futuros afeta RBAC, i18n afeta toda tela, retenção
  afeta todo dado pessoal.
- **C7 é pré-requisito de promoção de qualquer rodada**, não um tema concorrente.

`[PENDENTE]` Q-001 — o tema da Rodada 1 é decisão do usuário.
