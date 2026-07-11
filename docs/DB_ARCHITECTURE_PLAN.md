# AdmAi — Planejamento de Arquitetura de Banco de Dados (nível corporativo)

> **Papel:** Principal Data Architect. **Missão:** planejar — **não** criar tabelas, **não** escrever SQL.
> Entregável: um roteiro passo a passo para levar o banco do AdmAi de "funciona em produção" a
> **arquitetura corporativa** (robusta, escalável, segura, manutenível e evolutiva), como uma equipe
> de arquitetura faria **antes** de implementar.

## Context — por que este plano existe

O AdmAi **já está em produção** (Supabase Postgres 16, painel em `admai-painel.pages.dev`, backend
Railway). O banco nasceu de forma incremental — **23 migrations**, **25 modelos** — e cresceu por
feature, não por desenho arquitetural único. Isso é normal e saudável para um MVP, mas deixa dívidas
que só aparecem sob escala/auditoria. Esta trilha de estabilização já expôs três sintomas dessa origem:

- **B7** — a tabela `CodigoRecuperacaoTotp` existia no schema **sem migration** → *drift* schema↔banco
  (o `migrate deploy` de prod não a criava; 2FA quebraria). Corrigido + `migrate diff --exit-code` no CI.
- **B8** — `Material.nome` tinha `UNIQUE` **global** em vez de por-tenant → colisão cross-empresa.
- **Prisma 7** — a camada de conexão foi reescrita (driver adapter + pooler pgbouncer) e ainda **não
  foi validada contra o pooler real** (branch `chore/prisma-7`, pausada).

O objetivo deste documento **não** é redesenhar o que funciona, e sim dar à equipe um **método
auditável** para: (1) fotografar o estado atual com evidência, (2) decidir conscientemente cada
trade-off arquitetural (com critério, não por acidente), e (3) evoluir o schema sem grandes
reestruturações. Escopo: **o banco real do AdmAi**, não uma metodologia genérica.

**Filosofia herdada do projeto (respeitada aqui):** diagnóstico antes de correção; backend antes de
frontend; um passo de ponta a ponta com reteste; **toda afirmação precisa de evidência**. Nenhuma
decisão abaixo é tomada por suposição — cada uma cita ou o schema real, ou uma prática reconhecida,
ou é marcada explicitamente como **"a levantar na Descoberta"**.

### Estado atual aterrado (fatos, lidos do `schema.prisma` — base de todas as decisões)

| Dimensão | Estado real hoje | Implicação arquitetural |
|---|---|---|
| SGBD | PostgreSQL 16 (Supabase), pooler pgbouncer (6543) no runtime, direta (5432) nas migrations | Relacional ACID; pooler exige cuidado com prepared statements |
| Chaves primárias | `Int @default(autoincrement())` em todos os 25 modelos | Enumeráveis; hostis a sharding/multi-região; ver §3/§4 |
| Valores monetários | `Float` (`valorCobrado`, `valorLiquido`, `comissao`, `salarioBase`, `precoUnit`…) | **Erro de arredondamento** — dinheiro nunca deve ser float (ver §4) |
| Multi-tenant | Discriminador `empresaId` + extensão Prisma `prismaParaEmpresa` + **RLS opcional** (`RLS_ENABLED`, GUC `app.empresa_id`) | Shared-schema; isolamento em 2 camadas (app + banco) |
| Auditoria | `AuditLog` (`antes`/`depois` Json, append-only por convenção) | Boa base; falta imutabilidade forçada + retenção |
| Dados sensíveis (LGPD) | `BatidaPonto.lat/lng/selfieUrl`, `Tecnico.cpf/salarioBase/endereco`, `clienteTelefone` | Consentimento, retenção, minimização, direito ao esquecimento |
| Segredos | Cifrados em repouso (`accessTokenEnc`, `refreshTokenEnc`, `totpSecret`, `telefoneOtpHash`) | Falta gestão/rotação de chave (KMS) |
| Arquivos | `selfieUrl`, `fotoEvidencia`, `imagemUrl` = referências; **`qrCode`/base64 no banco** (`ConexaoBot`) | Blobs no banco = anti-padrão; mover para object storage |
| Concorrência | `Material.quantidadeAtual` (saldo) + `MovimentacaoEstoque` (ledger com `saldoApos`) | Corrida em baixa de estoque concorrente (ver §5) |
| Índices | Compostos por `empresaId` já presentes; 1 redundante sinalizado no schema | Boa cobertura tenant; refinar por evidência (EXPLAIN) |
| Crescimento | `Servico`, `BatidaPonto`, `AuditLog`, `AvaliacaoGoogle` crescem sem limite | Candidatos a particionamento no futuro (ver §7) |

### Glossário de boas práticas referenciadas (citadas de forma compacta ao longo do doc)

- **Normalização (1NF–3NF/BCNF)** — elimina anomalias de inserção/atualização/exclusão; base da modelagem lógica (§4). Desnormalização é **exceção justificada por performance**, não regra.
- **ACID** — garantias transacionais do Postgres; âncora das regras de consistência (estoque, comissão, ponto) (§3/§5).
- **BASE / CAP / PACELC** — vocabulário para decidir consistência-vs-disponibilidade **quando** um componente distribuído entrar (cache, réplica de leitura, fila) (§3/§7).
- **DDD (Domain-Driven Design)** — entidades, agregados, eventos, *bounded contexts*; guia a modelagem de domínio (§2).
- **SOLID** (aplicável à camada de acesso, não ao schema) — sobretudo SRP/DIP na fronteira de dados (repositórios, o `prismaParaEmpresa`) (§2/§6).
- **ADR (Architecture Decision Record)** — registrar *por que* de cada decisão, com contexto/alternativas/consequências (§9). Referência: Michael Nygard.
- **LGPD** (Lei 13.709/2018) — base legal, minimização, retenção, titular, DPO, RIPD (§6).
- **Expand/Contract (migração evolutiva)** — como mudar schema sem downtime (§8). Também: *ledger/event-sourcing* como padrão para estoque/financeiro (§5).

> **Como este documento satisfaz o pedido:** as 12 seções são os **pilares temáticos**. Cada seção
> fecha com o quarteto **📦 Entregáveis · ✅ Critérios de validação · 🔗 Dependências**. A **§10
> (Cronograma)** sequencia tudo em fases executáveis ordenadas. Nenhuma linha de SQL/DDL é escrita —
> apenas *o que* modelar e *por quê*.

---

## 1. Descoberta do Negócio

**Objetivo:** levantar tudo que condiciona decisões técnicas **antes** de tocá-las. O AdmAi já tem
respostas *implícitas* no código; esta fase as torna **explícitas e confirmadas com o negócio** —
porque decisão de arquitetura tomada sobre premissa não-verbalizada é a origem de B7/B8.

**Por que cada bloco de informação importa** (cada item vira uma pergunta ao dono/stakeholder):

| Informação a levantar | Pergunta-guia | Por que muda a arquitetura |
|---|---|---|
| Objetivo do sistema | Qual a proposta de valor central (gestão de serviços + bot WhatsApp + avaliações)? | Define o *core domain* (§2) e o que é suporte |
| Problema resolvido | Que dor operacional o AdmAi elimina para o prestador de serviço? | Prioriza integridade das entidades de receita (Servico, Comissao) |
| Processos de negócio | Fluxo serviço→aprovação→comissão→pagamento; ponto→banco de horas | Modela eventos e máquinas de estado (já há `status`, `estadoAtual`) |
| Usuários e volume | Quantas empresas/usuários/técnicos hoje e em 12–36 meses? | **Entrada de §5 e §7** — sem isso, capacidade é chute |
| Perfis de acesso | `dono`/`gestor`/`funcionario` cobrem o real? Haverá "contador"/"franqueado"? | Modela RBAC e RLS (§6) |
| Fluxo das informações | De onde os dados entram (painel, bot, Cloud API Meta, Google) e para onde vão | Define fronteiras de integração e idempotência (§3) |
| Regras de negócio | Comissão = `valorLiquido × %`; estoque baixa só em serviço `ativo`; aprovação por-empresa | Viram *invariants* protegidas por transação/constraint (§4/§5) |
| Requisitos funcionais | Relatórios, PDF, dashboards, notificações, 2FA, billing | Define entidades e caminhos de leitura críticos |
| Requisitos não-funcionais (RNF) | Latência-alvo, uptime (SLA), RPO/RTO, janelas de manutenção | **Metas mensuráveis** de §5, §7, §8 (sem número, não há critério de aprovação) |
| Crescimento esperado | Taxa de novas empresas/serviços por mês; sazonalidade | Dispara decisão de particionamento/arquivamento (§7) |
| Integrações externas | WhatsApp (Evolution/Cloud), Google Business, Stripe, Resend, Sentry | Cada uma exige token cifrado + idempotência + retenção (§3/§6) |
| Requisitos legais (LGPD) | Base legal para geo+selfie+CPF+salário; retenção; DPO; transferência internacional | **Bloqueante** — molda §6 inteira e o RIPD |
| Auditoria | Que ações precisam de trilha imutável e por quanto tempo? | Define escopo/retenção do `AuditLog` (§6) |
| Histórico de dados | Precisa versionar registros (ex.: histórico de salário, de comissão)? | Decide *temporal tables*/SCD vs. só `updatedAt` (§4) |
| Relatórios | Quais, com que granularidade e frescor (real-time vs. diário)? | Decide réplica de leitura / tabelas agregadas (§5/§7) |
| Indicadores (KPIs) | Receita, comissão, meta, ranking técnico, NPS de avaliações | Define materialização/cache de agregados (§5) |
| Notificações | Canais (inbox, WhatsApp, e-mail) e criticidade | Decide fila/mensageria vs. cron (§3) — já há `Notificacao` + BullMQ |
| Armazenamento de arquivos | Volume de selfies/fotos; retenção; LGPD | **Tira blob do banco** → object storage (§3/§7) |
| Internacionalização (i18n) | Haverá outro país/idioma/moeda/fuso? | Decide `locale`/`currency`/timezone e tipo monetário desde já (§4/§7) |
| Multiempresa (multi-tenant) | Modelo de isolamento aceitável (shared vs. isolado) e SLA por plano | **Confirma §3** — já é shared-schema por `empresaId` |

**Fontes que já existem (não re-levantar do zero, apenas confirmar):** `progress.md`, `docs/LAUNCH_PLAN.md`,
`docs/GO_LIVE_CHECKLIST.md`, o próprio `schema.prisma` e as 23 migrations são **evidência primária** do
domínio atual — a descoberta aqui é *validar e preencher lacunas*, não inventar.

**📦 Entregáveis:** documento de *Business Discovery* (respostas + premissas), tabela de RNF com metas
numéricas, matriz de integrações. **✅ Validação:** cada premissa técnica do doc rastreável a uma
resposta do negócio (zero "achismo"); RNF com números, não adjetivos. **🔗 Dependências:** nenhuma — é a raiz.

---

## 2. Modelagem do Domínio

**Objetivo:** entender o domínio como *modelo mental de negócio* (DDD) antes de tocar em tabelas —
identificar entidades, agregados, eventos e **fronteiras de contexto**, e confrontar isso com os 25
modelos que já existem para achar acoplamentos e responsabilidades misturadas.

**Por que antes da modelagem física:** o schema físico é consequência do domínio. Modelar direto em
tabela (como o AdmAi cresceu) mistura conceitos — ex.: `Tecnico` hoje carrega **RH** (cpf, salário,
modalidade CLT, jornada) *e* **identidade WhatsApp** (telefone/LID) *e* **vínculo com Usuario**. São
três responsabilidades num agregado só; DDD ajuda a decidir se é um agregado legítimo ou se pede split.

**Como identificar cada elemento (método):**

- **Entidades / objetos de negócio** — substantivos com identidade e ciclo de vida próprios. No AdmAi:
  `Empresa` (raiz do tenant), `Usuario`, `Tecnico`, `Servico`, `Material`, `Avaliacao`, `Assinatura`.
- **Objetos de valor (Value Objects)** — sem identidade própria, definidos pelos atributos: *dinheiro*
  (valor+moeda), *geolocalização* (lat/lng/precisão de `BatidaPonto`), *endereço*, *período*. Hoje
  estão como colunas soltas; DDD sugere tratá-los como conceitos (impacta §4 — ex.: dinheiro nunca float).
- **Eventos de domínio** — fatos consumados no passado: *ServiçoRegistrado*, *ServiçoAprovado/Rejeitado*,
  *EstoqueMovimentado*, *PontoBatido*, *AvaliaçãoRespondida*, *AssinaturaAtualizada*. O código já os
  materializa como `status`/máquinas de estado e ledgers (`MovimentacaoEstoque`, `AuditLog`).
- **Agregados** — cluster de objetos com uma raiz que garante *invariants* transacionais. Candidatos:
  `Servico`+`ServicoMaterial`+`MovimentacaoEstoque` (a baixa de estoque é invariant do serviço);
  `RegistroPonto`+`BatidaPonto` (o dia é a raiz; as batidas são provas). Regra DDD: **uma transação
  não deve cruzar dois agregados** — critério direto para §5.
- **Relacionamentos** — cardinalidade e regra de exclusão (cascade vs. set-null vs. restrict). O schema
  já expressa `onDelete: Cascade/SetNull` — a fase revisa se cada um reflete a regra de negócio real.
- **Regras críticas (invariants)** — "estoque não fica negativo", "comissão = líquido × %", "1 avaliação
  por serviço", "telefone único por empresa". Cada uma precisa de guardião: constraint no banco (§4),
  transação (§5), ou ambos.
- **Bounded Contexts** — agrupar o domínio em contextos coesos com linguagem própria. Proposta a validar:
  **Identidade & Acesso** (Usuario, ContaSocial, Sessao, RefreshToken, 2FA), **Operação de Serviços**
  (Servico, Tecnico, Material, Estoque), **RH & Ponto** (dados trabalhistas + RegistroPonto/BatidaPonto),
  **Engajamento** (Avaliacao, Google, WhatsApp), **Billing** (Assinatura/Stripe), **Auditoria/Compliance**
  (AuditLog, LGPD). Isso **não** obriga a quebrar o banco — orienta ownership, evolução modular e §7.

**Como validar o modelo com a equipe/cliente:** *Event Storming* (workshop mapeando eventos→comandos→
agregados em post-its), glossário de *Ubiquitous Language* (o mesmo termo no código, no banco e na fala
do dono — hoje há ruído "ChaveiroBot" vs "AdmAi"), e walkthrough dos fluxos reais (registro de serviço
via bot, aprovação, ponto) confirmando que cada passo tem entidade/evento correspondente.

**📦 Entregáveis:** mapa de contextos (context map), catálogo de entidades×agregados×eventos, glossário
de linguagem ubíqua, lista de invariants com seu guardião previsto. **✅ Validação:** todo modelo do
`schema.prisma` mapeia a exatamente um agregado/contexto; toda invariant tem guardião designado;
Event Storming assinado pelo dono. **🔗 Dependências:** §1 (regras e processos de negócio).

---

## 3. Escolha da Arquitetura

**Objetivo:** tornar **explícitas e justificadas** as decisões arquiteturais — algumas já tomadas de
fato no AdmAi (e que devem virar ADR retroativo), outras a decidir para a fase corporativa. Regra:
cada decisão declara **critério** e **alternativa rejeitada**.

| Decisão | Escolha atual/recomendada | Critério & referência |
|---|---|---|
| Relacional vs NoSQL | **Relacional (Postgres)** permanece o núcleo | Dados fortemente relacionais e transacionais (serviço↔comissão↔estoque) exigem **ACID** e integridade referencial; NoSQL só entraria para caso específico (ver abaixo) |
| Uso pontual de NoSQL/JSON | Manter `Json` para *schemaless legítimo* (`permissoes`, `dadosParciais` da sessão do bot, `analiseJson` da IA) | Documento onde o schema é volátil/idiossincrático; **não** usar Json para dados consultáveis/relacionais (evita perder integridade) |
| Modelo multi-tenant | **Shared database, shared schema** com discriminador `empresaId` | Custo/densidade e simplicidade operacional vs. isolamento; mitiga blast-radius com **RLS** (§6). Alternativas (schema-por-tenant, db-por-tenant) rejeitadas por custo operacional no volume atual — **reavaliar por plano enterprise** |
| Estratégia de consistência | **Consistência forte** no núcleo transacional (ACID); **eventual** só nas bordas (cache de KPIs, réplica de leitura, sync Google) | **CAP/PACELC**: onde o dado é dinheiro/estoque, priorizar consistência; onde é analítico/externo, tolerar defasagem (**BASE**) |
| Alta disponibilidade | Postgres gerenciado (Supabase) com failover; definir RPO/RTO em §1 | Terceiriza HA; o crítico é validar RPO/RTO contra o SLA prometido |
| Réplica de leitura | **Avaliar** quando relatórios/dashboards competirem com escrita | Separar OLTP de leitura pesada; critério: quando p95 de escrita degradar sob carga de relatório |
| Particionamento | **Ainda não; planejar gatilho** (§7) para `Servico`/`BatidaPonto`/`AuditLog` | Introduzir só quando volume/idade justificar — complexidade não gratuita |
| Cache | Redis já presente (rate-limit, BullMQ). **Estender** para cache de KPIs/consultas caras | Reduz carga de agregações `take:10000` (lead #7). Invalida por evento (§2) |
| Filas / mensageria | **BullMQ/Redis** já em uso (avaliações agendadas, resumos) | Desacopla trabalho assíncrono; garante retry/idempotência para integrações externas |
| Armazenamento de arquivos | **Object storage** (Supabase Storage/S3) para selfies/fotos; banco guarda só a referência | Blob no banco infla backup/replicação e custa I/O; `qrCode` base64 em `ConexaoBot` é dívida a migrar |
| Escalabilidade de conexão | Pooler pgbouncer (transaction mode) + driver adapter (Prisma 7) | **Risco aberto**: validar prepared statements no pooler antes de shipar (branch `chore/prisma-7`) |

**📦 Entregáveis:** conjunto de **ADRs** (um por decisão acima), diagrama de arquitetura de dados
(fontes→banco→consumidores), matriz CAP/consistência por fluxo. **✅ Validação:** cada decisão tem ADR
com contexto/alternativas/consequências; nenhuma decisão "órfã" (sem critério); revisão por par da
equipe. **🔗 Dependências:** §1 (RNF, volume, integrações) e §2 (contextos).

---

## 4. Planejamento da Modelagem de Dados

**Objetivo:** definir *como* se chega do domínio (§2) ao schema físico, com **critério de qualidade em
cada nível** — e corrigir os *smells* já identificados no schema real.

- **Modelagem conceitual** — diagrama ER de alto nível (entidades + relacionamentos, sem tipos). Deriva
  direto do context map (§2). *Critério:* toda entidade rastreável a um conceito de negócio validado.
- **Modelagem lógica** — atributos, tipos lógicos, chaves, **normalização até 3NF/BCNF** por padrão.
  *Por quê:* 3NF elimina anomalias de atualização (ex.: `Servico` guarda `comissaoGerada`/`valorLiquido`
  **derivados** — decidir conscientemente se é desnormalização por performance/histórico ou redundância a
  remover). *Critério:* cada desnormalização tem justificativa escrita (performance mensurada ou
  necessidade de *snapshot* histórico), nunca acidental.
- **Modelagem física** — mapeamento para tipos Postgres via Prisma, índices, partições. *Critério:*
  tipos corretos para o domínio (ver "smells" abaixo).
- **Definição de chaves** — decisão a registrar em ADR: **`Int autoincrement` (atual) vs `UUIDv7`/`ULID`**.
  Trade-off: Int é compacto e legível, mas **enumerável** (superfície de IDOR, hoje mitigada por
  `empresaId`) e hostil a merge/sharding/multi-região; UUIDv7/ULID é globalmente único, ordenável no
  tempo e não-enumerável, ao custo de 16 bytes. *Critério:* decisão alinhada ao gatilho de escala (§7).
- **Restrições (constraints)** — as *invariants* de §2 viram `UNIQUE`/`CHECK`/`NOT NULL`/FK. **Lição B8:**
  todo `UNIQUE` num tenant deve ser **composto com `empresaId`** (o schema já corrige `@@unique([empresaId, nome])`).
  *Critério:* nenhuma unicidade global onde o conceito é por-empresa; regras representáveis no banco ficam
  **no banco**, não só na aplicação (defesa em profundidade).
- **Índices** — cobrir os caminhos de acesso reais (já há compostos por `empresaId`). Remover o
  redundante já sinalizado (`[criadoEm]` vs `[empresaId, criadoEm]`). *Critério:* todo índice justificado
  por uma query real (medida em §5), nenhum índice órfão (custo de escrita sem leitura que o use).
- **Integridade referencial** — revisar cada `onDelete` (`Cascade`/`SetNull`/`Restrict`) contra a regra
  de negócio (ex.: apagar `Empresa` deve cascatear? ou bloquear se há histórico financeiro?). *Critério:*
  cada FK com política de exclusão que reflita o domínio, não o default.

**Smells de modelagem já detectados no schema (a tratar, justificados):**
1. **Dinheiro em `Float`** (`valorCobrado`, `valorLiquido`, `comissao`, `salarioBase`, `precoUnit`, `precoVenda`)
   → migrar para **`Decimal`** (`@db.Decimal(12,2)`). *Por quê:* float causa erro de arredondamento em
   soma de dinheiro — inaceitável para comissão/folha (viola a correção transacional esperada).
2. **`qrCode`/base64 no banco** (`ConexaoBot`) → mover para object storage/efêmero (§3).
3. **Derivados persistidos** (`valorLiquido`, `comissaoGerada`, `saldoApos`) → decidir *snapshot histórico*
   (mantém, com trigger/serviço garantindo coerência) vs. *cálculo em leitura* (remove redundância).
4. **Flags 2FA legadas** (`twoFactorSecret` booleano antigo vs. `totpSecret`) convivendo → plano de
   deprecação de coluna (§8).

**📦 Entregáveis:** ER conceitual + lógico + físico, **dicionário de dados** (§9), *checklist* de
normalização com justificativa de cada exceção, plano de tipagem monetária (Decimal). **✅ Validação:**
schema em 3NF salvo exceções documentadas; zero `UNIQUE` global indevido; dinheiro em Decimal; `migrate
diff` sem drift (lição B7). **🔗 Dependências:** §2 (agregados/invariants), §3 (decisão de chaves e SGBD).

---

## 5. Planejamento de Performance

**Objetivo:** definir *como medir e garantir* performance com números, não adjetivos — ancorado nas
consultas reais do AdmAi.

**O que avaliar e como:**

- **Volume esperado & crescimento anual** — de §1: nº de serviços/batidas/avaliações por empresa por mês
  × nº de empresas. Sem isso, capacidade é chute. *Método:* projeção 12/24/36 meses por tabela quente.
- **Concorrência** — pico de escritas simultâneas (registro de serviço via bot + ponto + painel).
  **Ponto crítico ACID:** baixa de estoque concorrente em `Material.quantidadeAtual` → risco de *lost
  update*. *Recomendação:* tratar `MovimentacaoEstoque` como **ledger append-only** (fonte da verdade) e
  o saldo como projeção, ou proteger a baixa com transação + *optimistic locking*/`SELECT … FOR UPDATE`.
- **Consultas críticas** — identificadas na leitura do código (lead #7): dashboards/`tecnicos` agregam em
  JS com `take:10000`; `/avaliacoes` lê sem `take`. *Recomendação:* empurrar agregação para o banco
  (`groupBy`/agregações SQL) + paginação obrigatória (keyset/cursor, não OFFSET em tabela grande).
- **Leitura vs escrita** — classificar cada endpoint; caminhos de leitura pesada (relatórios/PDF) são
  candidatos a **réplica de leitura** e/ou **tabelas agregadas materializadas** atualizadas por evento.
- **Paginação** — padronizar *keyset pagination* nas listagens grandes (serviços, avaliações, auditoria).
  *Por quê:* OFFSET degrada linearmente; keyset é O(log n) com índice adequado.
- **Índices** — validar cada um com **`EXPLAIN ANALYZE`** sob dados realistas (não em tabela vazia).
  *Critério:* consultas quentes usando *index scan*, não *seq scan*; sem índice redundante.
- **Cache** — Redis para KPIs e consultas caras estáveis; **invalidação por evento de domínio** (§2).
- **Otimizações futuras** — materialized views para dashboards, particionamento (§7), arquivamento de
  frios. *Critério:* introduzidas só quando uma métrica real cruzar o gatilho (evita otimização prematura).

**Metas (SLO) a fixar com o negócio (§1):** p95 de leitura de listagem, p95 de escrita transacional,
tempo de geração de relatório/PDF, teto de *slow query* (o `prisma.js` já loga queries >100ms — usar
esse sinal como termômetro contínuo).

**📦 Entregáveis:** catálogo de consultas críticas com plano de execução (EXPLAIN), matriz leitura/escrita,
SLOs numéricos, plano de índices/cache/paginação. **✅ Validação:** toda consulta quente com plano
verificado sob volume realista; SLOs definidos e medidos em teste de carga; nenhum `take:10000` load-all
remanescente. **🔗 Dependências:** §1 (volume/RNF), §4 (índices/chaves), §2 (eventos p/ invalidação de cache).

---

## 6. Planejamento de Segurança

**Objetivo:** garantir confidencialidade, integridade e conformidade — crítico porque o AdmAi é
**multi-tenant** (vazamento cross-empresa é o pior cenário) e coleta **dados sensíveis LGPD**.

- **Autenticação** — já: JWT HS256 (1h) + refresh token rotacionado (SHA-256, HttpOnly), 2FA TOTP e
  OTP por telefone, login social OIDC. *Planejar:* política de expiração/rotação, revogação de sessão
  (já há `SessaoUsuario`/`tokenValidoApos`), e rotação do segredo JWT.
- **Autorização (RBAC)** — papéis `dono`/`gestor`/`funcionario` + overrides granulares (`Usuario.permissoes` Json)
  via `requirePermissao(modulo, acao)`. *Critério:* toda rota de mutação exige permissão explícita
  (esta trilha corrigiu B1/B2/B3 justamente por rotas só com `requireAuth`). Aplicar **princípio do
  menor privilégio** e testar como cada papel (regressão de RBAC).
- **Isolamento de tenant (defesa em profundidade)** — camada 1: extensão `prismaParaEmpresa` injeta
  `empresaId` e reescreve `findUnique→findFirst` (evita IDOR por id). Camada 2: **RLS Postgres** opcional
  (`RLS_ENABLED`, GUC `app.empresa_id` cravado por transação com `local=true` — correto sob pooler). *Recomendação
  corporativa:* **ligar RLS em produção** como rede de segurança independente do ORM; validar com o
  `idor.test.js` estendido (whatsapp/google/selfie) e o roteiro de `docs/TUTORIAL_RLS_DAST.md`.
- **Criptografia** — em trânsito (TLS, ok); em repouso: Supabase cifra o volume, e segredos de app
  (`accessTokenEnc`, `refreshTokenEnc`, `totpSecret`, `telefoneOtpHash`) são cifrados no app; senhas em
  bcrypt. *Planejar:* **gestão de chaves (KMS)** e rotação — hoje a chave de cifra vive em env; corporativo
  pede custódia e rotação. Avaliar *column-level encryption* para CPF/salário.
- **Auditoria & rastreabilidade** — `AuditLog` (`antes`/`depois`, `ip`, ator). *Planejar:* torná-lo
  **append-only de fato** (sem UPDATE/DELETE por role de app), retenção definida, e cobertura de todas as
  ações privilegiadas (papel alterado, exclusão de usuário, mudança de billing, acesso a selfie).
- **Proteção contra perda de dados** — cruza com §8 (backup/PITR). *Critério:* RPO/RTO definidos e testados.
- **Conformidade (LGPD)** — dados sensíveis reais: `BatidaPonto.lat/lng/selfieUrl` (biometria/geo),
  `Tecnico.cpf/salarioBase/dataNascimento/endereco`, `clienteTelefone/Nome`. *Planejar:* base legal por
  finalidade, **minimização** (coletar só o necessário), **retenção com TTL** (ex.: selfies/geo expiram),
  **direito do titular** (export/exclusão — já há trilha de LGPD no plano de estabilização), registro de
  consentimento, e **RIPD/DPIA** para o ponto com selfie+geo (tratamento de alto risco). Referência: LGPD
  arts. 6 (princípios), 18 (direitos do titular), 37/38 (registro e relatório de impacto).

**📦 Entregáveis:** modelo de ameaças (STRIDE) focado em cross-tenant, política de RBAC+RLS, plano de
gestão de chaves, política de retenção/minimização LGPD, RIPD do ponto, plano de cobertura do `AuditLog`.
**✅ Validação:** testes de isolamento (IDOR) verdes para *todos* os módulos; RLS ativa e validada; toda
ação privilegiada auditada; DPO/jurídico aprova o tratamento de dados sensíveis. **🔗 Dependências:**
§1 (requisitos legais), §2 (o que é sensível), §3 (modelo de tenant).

---

## 7. Planejamento de Escalabilidade

**Objetivo:** garantir que o banco cresça de MVP a milhões de registros/usuários e novos países/moedas
**sem reestruturação grande** — decidindo *agora* os pontos que são caros de mudar depois.

- **Milhões de registros** — tabelas quentes (`Servico`, `BatidaPonto`, `AuditLog`, `AvaliacaoGoogle`,
  `MovimentacaoEstoque`) crescem sem teto. *Plano:* definir **gatilhos** (ex.: >50M linhas ou consultas
  degradando) para **particionamento** — por `empresaId` (hash/list) e/ou por tempo (range em `criadoEm`),
  além de **arquivamento** de dados frios. Introduzir só no gatilho (evita complexidade prematura).
- **Milhões de usuários/tenants** — o shared-schema aguenta densidade, mas o custo de mudar **chave**
  cresce com o tempo → é o argumento mais forte para decidir **UUIDv7/ULID já** (§4) se o horizonte
  aponta sharding/multi-região. *Critério:* alinhar ao horizonte de §1.
- **Expansão de funcionalidades / novos módulos** — os **bounded contexts** (§2) permitem crescer por
  contexto sem tocar no núcleo; um contexto que escale sozinho (ex.: Engajamento/avaliações) pode virar
  serviço/banco próprio no futuro sem big-bang.
- **Múltiplos países / moedas / idiomas (i18n)** — decidir *cedo*: **moeda** como parte do value object
  monetário (valor+`currency`) desde §4; **timezone** — o ponto usa timestamp do servidor (armazenar em
  UTC, apresentar no fuso da empresa); **idioma** — `locale` por empresa/usuário. Retrofit de moeda/fuso
  depois é caro e arriscado.
- **Múltiplas organizações (multi-tenant)** — já é o eixo central; escalar significa: RLS ligada,
  políticas por plano (limites/quotas por empresa), e observabilidade **por tenant** (achar noisy neighbor).

**📦 Entregáveis:** estratégia de particionamento/arquivamento com gatilhos numéricos, decisão de chave
(ADR), estratégia de i18n/moeda/fuso, plano de crescimento por bounded context. **✅ Validação:** teste
de carga projetando volume de 24–36 meses sem degradar SLO; caminho de i18n sem migração destrutiva
prevista. **🔗 Dependências:** §1 (crescimento/i18n), §3 (arquitetura), §4 (chaves/tipos).

---

## 8. Planejamento Operacional (Dia-2 / DBRE)

**Objetivo:** garantir que o banco seja operável, recuperável e evoluível em produção com segurança —
área onde o AdmAi já sentiu dor (drift B7, migração Prisma 7).

- **Backup** — confirmar cadência dos backups gerenciados (Supabase) e testá-los (backup não-restaurado
  não é backup). *Critério:* backup diário + verificação de restauração periódica.
- **Recuperação de desastre (DR) & RPO/RTO** — definir com o negócio (§1) e **validar com um drill** de
  restauração real. *Critério:* tempo de restauração medido ≤ RTO acordado.
- **Recuperação pontual (PITR)** — confirmar janela de PITR do Supabase; é a rede contra "DELETE sem WHERE".
- **Monitoramento** — métricas de banco (conexões no pooler, locks, cache hit ratio, replicação, tamanho
  de tabela, *slow queries*). O `prisma.js` já emite *slow query* (>100ms) e há `/metrics` (Prometheus).
  *Plano:* dashboards + alertas por limiar.
- **Logs** — query log estruturado (já via pino), separando erro de query lenta; retenção definida.
- **Métricas de negócio×banco** — crescimento por tabela, top queries, uso por tenant.
- **Versionamento do banco / migrações** — **Prisma Migrate**, forward-only. *Padrão a adotar:*
  **Expand/Contract** para mudanças sem downtime (adiciona coluna nullable → *backfill* → torna
  obrigatória → remove antiga em release posterior). *Critério:* toda migração revisada, idempotente e
  com `migrate diff --exit-code` no CI (**lição B7** — nunca schema sem migration).
- **Rollback** — Prisma não gera *down* automático; a estratégia corporativa é **forward-fix** (nova
  migração corretiva) + backup/PITR como rede. *Critério:* toda migração destrutiva precedida de backup e
  de um plano de reversão escrito.
- **Manutenção** — `VACUUM`/`ANALYZE` (autovacuum tunado para tabelas quentes), *reindex*, revisão de
  bloat; janelas de manutenção acordadas em §1.
- **Ambientes** — **staging que replique a topologia de prod** (pooler pgbouncer transaction mode). O
  gap atual (Prisma 7 não validado no pooler) é exatamente a ausência disso; corporativo exige staging fiel.

**📦 Entregáveis:** runbook de backup/DR/PITR, plano de observabilidade (dashboards+alertas), política de
migração (Expand/Contract + revisão + drift-check), estratégia de rollback, ambiente de staging fiel.
**✅ Validação:** drill de restauração dentro do RTO; CI barra drift; migração testada em staging fiel
antes de prod. **🔗 Dependências:** §1 (RPO/RTO/janelas), §3 (topologia/pooler).

---

## 9. Documentação

**Objetivo:** produzir a documentação que torna a arquitetura *auditável e transferível* — não
burocracia, mas o que reduz o custo do próximo B7/B8. Boa parte já existe em `docs/`; a fase consolida.

| Documento | Conteúdo | Estado no AdmAi |
|---|---|---|
| Documento de arquitetura de dados | Visão geral, decisões, diagrama de fluxo | **a criar** (este plano é o insumo) |
| Diagrama ER | Conceitual/lógico/físico | a gerar do `schema.prisma` |
| Dicionário de dados | Cada tabela/coluna: significado, tipo, restrições, sensibilidade LGPD | a criar (o schema tem comentários ricos — bom ponto de partida) |
| Regras de negócio / invariants | Lista com guardião (constraint/transação) | parcial (código) → consolidar |
| Fluxos | Registro de serviço, aprovação, ponto, avaliação, billing | parcial (`progress.md`) |
| Convenções de nomenclatura | PascalCase modelos, camelCase campos, sufixos (`Enc`, `Hash`, `Em`) | de-facto no schema → formalizar |
| Padrões de desenvolvimento de dados | Como criar migration, escopar por tenant, tratar dinheiro/data | a criar (previne regressões) |
| **ADRs** | Uma decisão por arquivo: contexto, opções, escolha, consequências | **a criar** — retroativos (Int PK, shared-schema, RLS, Prisma 7, Decimal) + futuros |

**Por que ADR:** decisões arquiteturais sem registro são reabertas e revertidas por quem não conhece o
contexto (formato Nygard: *Status/Context/Decision/Consequences*). Ancorar cada decisão de §3–§7 num ADR
é o que impede regressão silenciosa.

**📦 Entregáveis:** os documentos acima em `docs/`. **✅ Validação:** todo modelo no dicionário; toda
decisão de §3–§7 com ADR; diagrama ER gerado do schema real (sem divergir). **🔗 Dependências:** §2–§8
(documentam suas saídas).

---

## 10. Cronograma (sequência lógica de fases)

**Por que esta ordem:** segue a dependência natural *negócio → domínio → arquitetura → modelo → qualidades
transversais → operação → aprovação*. Diagnóstico antes de decisão; decisão registrada (ADR) antes de
mudança; segurança/performance dependem do modelo estar definido; operação fecha o ciclo. Espelha a
filosofia do projeto: **diagnóstico antes de correção, um passo com validação antes do próximo.**

| Fase | Nome | Depende de | Entregável-chave | Critério de conclusão |
|---|---|---|---|---|
| **F0** | Descoberta do Negócio (§1) | — | Business Discovery + RNF numéricos | Premissas confirmadas pelo dono |
| **F1** | Auditoria do estado atual | F0 | Relatório do schema real (smells: Float$, drift, blobs, UNIQUE) com evidência | `migrate diff` limpo; smells catalogados |
| **F2** | Modelagem de Domínio (§2) | F0 | Context map + agregados + invariants | Event Storming aprovado |
| **F3** | Decisões de Arquitetura (§3) | F1, F2 | ADRs (SGBD, tenant, chaves, RLS, cache, storage) | Cada decisão com ADR e critério |
| **F4** | Modelagem de Dados (§4) | F2, F3 | ER + dicionário + plano Decimal/chaves/constraints | 3NF salvo exceções documentadas |
| **F5** | Performance (§5) | F4 | SLOs + EXPLAIN das quentes + plano índices/cache | Consultas quentes com plano verificado |
| **F6** | Segurança & LGPD (§6) | F2, F3 | RBAC+RLS + retenção/minimização + RIPD | IDOR verde; RLS validada; DPO ok |
| **F7** | Escalabilidade (§7) | F4, F5 | Gatilhos de partição/arquivamento + i18n/moeda | Teste de carga 24–36m sem violar SLO |
| **F8** | Operacional (§8) | F3 | Runbooks backup/DR/PITR + política de migração + staging fiel | Drill de restauração dentro do RTO |
| **F9** | Documentação (§9) | F2–F8 | Docs + ADRs + diagrama ER + dicionário | Cobertura 100% dos modelos/decisões |
| **F10** | Aprovação (§12) | F1–F9 | Checklist assinado | Todos os itens do §12 verdes |

> Fases F5–F8 podem correr **em paralelo parcial** após F4 (dependem do modelo estável, não umas das
> outras), o que encurta o caminho crítico sem violar dependências.

---

## 11. Riscos

| # | Risco | Impacto | Prob. | Prevenção | Mitigação |
|---|---|---|---|---|---|
| R1 | **Vazamento cross-tenant** (falha de isolamento) | Crítico (LGPD + confiança) | Média | RLS ligada + extensão `prismaParaEmpresa` + testes IDOR em todo módulo | Rotação de credenciais, notificação ANPD, trilha no `AuditLog` |
| R2 | **Drift schema↔banco** (repete B7) | Alto (feature quebra em prod) | Média | `migrate diff --exit-code` no CI + revisão de migração | Migração corretiva forward-fix + PITR |
| R3 | **Dinheiro em Float** (arredondamento de comissão/folha) | Alto (erro financeiro/legal) | Alta (já presente) | Migrar para Decimal (§4) com backfill validado | Reconciliação contábil; auditoria de valores |
| R4 | **Pooler pgbouncer + prepared statements** (Prisma 7 não validado) | Alto (erro em runtime de prod) | Média | Staging fiel + validar antes de merge/deploy | Rollback para conexão direta/config anterior |
| R5 | **Perda de dados** (sem DR testado) | Crítico | Baixa | Backup + PITR + **drill de restauração** | Restauração PITR; comunicação de incidente |
| R6 | **Corrida em baixa de estoque** (lost update) | Médio | Média | Ledger append-only + transação/lock (§5) | Reconciliação via `MovimentacaoEstoque.saldoApos` |
| R7 | **Consultas load-all `take:10000`** degradam sob volume | Médio | Alta (já presente) | Agregação no banco + paginação keyset + cache | Réplica de leitura; índice/materialized view |
| R8 | **Não-conformidade LGPD** (geo+selfie sem base/retenção) | Crítico (multa/ANPD) | Média | RIPD + retenção/minimização + consentimento | Expurgo dos dados; regularização com DPO |
| R9 | **Migração destrutiva sem rollback** | Alto | Baixa | Expand/Contract + backup pré-migração | Forward-fix + restore |
| R10 | **Otimização prematura** (particionar/sharding cedo demais) | Médio (complexidade/custo) | Média | Gatilhos numéricos (§7) antes de agir | Reverter para modelo simples |
| R11 | **Blobs no banco** (`qrCode` base64) incham backup/replicação | Baixo/Médio | Presente | Mover para object storage/efêmero | Limpeza + referência externa |

---

## 12. Critérios para Aprovação da Arquitetura (checklist de saída)

A arquitetura só é liberada para a fase de implementação quando **todos** os itens abaixo estiverem
verdes com **evidência** (não auto-declaração):

- **Qualidade** — [ ] Schema em 3NF salvo exceções com justificativa escrita · [ ] `migrate diff` sem drift · [ ] dinheiro em Decimal · [ ] nenhum `UNIQUE` global indevido.
- **Segurança** — [ ] RLS ativa e validada em staging · [ ] testes IDOR verdes em todos os módulos · [ ] RBAC de menor privilégio testado nos 3 papéis · [ ] gestão/rotação de chave definida.
- **Desempenho** — [ ] SLOs numéricos definidos · [ ] consultas quentes com `EXPLAIN` sob volume realista · [ ] paginação keyset · [ ] zero load-all `take:10000`.
- **Escalabilidade** — [ ] gatilhos de partição/arquivamento definidos · [ ] decisão de chave (ADR) · [ ] i18n/moeda/fuso decididos · [ ] teste de carga 24–36m dentro do SLO.
- **Consistência** — [ ] invariants com guardião (constraint/transação) · [ ] estoque/financeiro sob transação sem lost-update · [ ] estratégia de consistência (forte/eventual) documentada por fluxo.
- **Manutenibilidade** — [ ] convenções de nomenclatura formalizadas · [ ] política de migração (Expand/Contract) · [ ] bounded contexts mapeados.
- **Documentação** — [ ] ER + dicionário de dados + regras de negócio · [ ] um ADR por decisão de §3–§7 · [ ] runbooks operacionais.
- **Conformidade** — [ ] base legal LGPD por finalidade · [ ] retenção/minimização · [ ] RIPD do ponto (selfie+geo) · [ ] direitos do titular (export/exclusão) implementáveis · [ ] DPO/jurídico aprovaram.
- **Operacional** — [ ] backup + PITR confirmados · [ ] drill de DR dentro do RTO · [ ] staging fiel ao pooler de prod · [ ] observabilidade por tenant.

---

## Roteiro passo a passo (resumo executável)

1. **Descobrir** (F0/§1) — entrevistar o negócio, fixar RNF numéricos e requisitos LGPD; confirmar as premissas hoje implícitas no código.
2. **Auditar o real** (F1) — fotografar o schema atual com evidência (drift, Float$, blobs, UNIQUE, `take:10000`); nada de opinião sem `EXPLAIN`/`migrate diff`.
3. **Modelar o domínio** (F2/§2) — Event Storming → context map, agregados, invariants, linguagem ubíqua.
4. **Decidir e registrar** (F3/§3) — ADRs para SGBD, modelo de tenant, chaves (Int vs ULID), RLS, cache, storage, consistência (CAP/BASE).
5. **Modelar os dados** (F4/§4) — ER conceitual→lógico→físico, normalização 3NF, Decimal para dinheiro, constraints por-tenant, índices justificados; dicionário de dados.
6. **Planejar performance** (F5/§5) — SLOs, `EXPLAIN ANALYZE` das quentes, paginação keyset, cache com invalidação por evento.
7. **Planejar segurança & LGPD** (F6/§6) — RBAC menor-privilégio, RLS ligada, KMS, `AuditLog` append-only, retenção/minimização, RIPD.
8. **Planejar escala** (F7/§7) — gatilhos de partição/arquivamento, i18n/moeda/fuso, crescimento por contexto.
9. **Planejar operação** (F8/§8) — backup/PITR/DR com drill, observabilidade, política de migração Expand/Contract, staging fiel.
10. **Documentar** (F9/§9) — arquitetura, ER, dicionário, ADRs, runbooks, convenções.
11. **Aprovar** (F10/§12) — rodar o checklist; só então liberar a implementação.

---

## Verificação (como saberemos que o *planejamento* está pronto)

- [ ] Toda premissa técnica rastreável a uma resposta de negócio (§1) — zero suposição não-justificada.
- [ ] Cada decisão de §3–§7 tem um **ADR** com contexto/alternativas/consequências.
- [ ] Os *smells* reais do schema (Float$, drift, blobs, UNIQUE global, `take:10000`) estão endereçados com plano — cada afirmação com evidência (`schema.prisma`, `EXPLAIN`, `migrate diff`).
- [ ] O checklist do §12 está completo e assinável pelo dono + (para LGPD) DPO/jurídico.
- [ ] Nenhuma tabela criada, nenhum SQL escrito — o entregável é **plano**, conforme as regras.

---

> **Nota de escopo:** este é um documento de **planejamento** — não cria tabela nem escreve SQL. A
> validação do **Prisma 7 no pooler de staging** (branch `chore/prisma-7`, pausada) é insumo de F8
> (staging fiel) e permanece aberta — recomenda-se retomá-la como parte desta trilha operacional.
