# ROUND-01 — EOS-Data-Architecture

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-Data-Architecture` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | Conceitos transversais de dados: identidade/conta/usuário, usuário/técnico, papel/vínculo, empresa/unidade, escopo de tenant, histórico, soft delete, eventos, retenção, dinheiro, flags, sincronização |
| Grau de confiança declarado | Alta global (ver §12 do relatório) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Onde o comportamento atual puder ser reverificado no código, o código prevalece.
>
> **Nota de verificação:** o classificador de segurança do harness estava indisponível na
> revisão deste subagente. O orquestrador verificou independentemente os achados que sustentam
> decisões desta rodada antes de usá-los.

---

# EOS-Data-Architecture — Rodada 1 · Conceitos Transversais de Dados

## 1. Escopo analisado

Mandato: identificar as **decisões conceituais transversais** de dados que a Rodada 1 precisa fixar. Não é redesenho de banco. Cobri os 13 itens do mandato sobre `chaveiro-bot` (backend + schema + migrations + RLS) e, onde o conceito atravessa a UI, sobre `chaveiro-painel`.

| Item | Cobertura | Método |
|---|---|---|
| 1. Identidade/conta/usuário | Completa | Schema + constraints + migrations + fluxos de login/OAuth/convite/credenciais |
| 2. Usuário vs. técnico | Completa | Schema + varredura de todos os caminhos de exclusão/desativação |
| 3. Papel/vínculo/cargo/capacidade | Completa | Schema + `permissoes.js` + rotas |
| 4. Empresa vs. unidade | Completa | Schema + varredura lexical (filial/unidade/equipe/loja/setor) em backend+painel |
| 5. Escopo multi-tenant | Completa | `tenant.js` × schema × call sites reais × `enable_rls.sql` |
| 6. Histórico e imutabilidade | Completa | Schema + serviços de cálculo + `auditoria.js` |
| 7. Soft delete | Completa | Schema + `onDelete` reais nas migrations |
| 8. Eventos de domínio | Completa | Varredura por outbox/event bus + leitura dos handlers |
| 9. Campos "contrato compartilhado" | Completa | Grep de consumidores backend+frontend |
| 10. Retenção | Completa | `agendador.js` + varredura de expurgos |
| 11. Dinheiro | Completa | Contagem de colunas + ADR |
| 12. Feature flags e dados | Parcial | Varredura de toggles persistidos; `Empresa.ativo` não rastreado exaustivamente (§13) |
| 13. Sincronização entre módulos | Completa | Leitura dos pontos de recálculo |

Schema confirmado: **26 models** (`chaveiro-bot/prisma/schema.prisma`, `Empresa`:20 … `AuditLog`:530). Modo estritamente leitura — nenhum arquivo criado, alterado ou removido.

---

## 2. Arquivos consultados

**Schema, migrations e RLS**
- `chaveiro-bot/prisma/schema.prisma`
- `chaveiro-bot/prisma/rls/enable_rls.sql`
- `chaveiro-bot/prisma/migrations/20260524204642_/migration.sql`
- `chaveiro-bot/prisma/migrations/20260531124110_evolucao_v2/migration.sql`
- `chaveiro-bot/prisma/migrations/20260604132207_estoque_saldo_real/migration.sql`
- `chaveiro-bot/prisma/migrations/20260604142936_notificacoes_inbox/migration.sql`
- `chaveiro-bot/prisma/migrations/20260605000000_multitenant_empresa/migration.sql`
- `chaveiro-bot/prisma/migrations/20260612000000_login_social/migration.sql`
- `chaveiro-bot/prisma/migrations/20260613100000_numero_unico_fase1/migration.sql`
- `chaveiro-bot/prisma/migrations/20260615000000_rh_ponto_google_reviews/migration.sql`
- `chaveiro-bot/prisma/migrations/20260620000000_rbac_ponto_painel/migration.sql`
- `chaveiro-bot/prisma/migrations/20260621000000_fix_tecnico_telefone_unique/migration.sql`
- `chaveiro-bot/prisma/migrations/20260705000000_session_auth_tables/migration.sql`
- `chaveiro-bot/prisma/migrations/20260707000000_add_codigo_recuperacao_totp/migration.sql`
- `chaveiro-bot/prisma/migrations/20260717000001_documentos_tecnico/migration.sql`
- `chaveiro-bot/prisma/migrations/20260803000000_usuario_telefone_unique/migration.sql`

**Backend**
- `chaveiro-bot/src/db/prisma.js`, `chaveiro-bot/src/db/tenant.js`
- `chaveiro-bot/src/middlewares/auth.js`
- `chaveiro-bot/src/routes/`: `api.js`, `auth.js`, `account.js`, `admin.js`, `servicos.js`, `tecnicos.js`, `estoque.js`, `google.js`, `billing.js`
- `chaveiro-bot/src/services/`: `permissoes.js`, `credenciais.js`, `identidade.js`, `servico.js`, `estoque.js`, `ponto.js`, `avaliacao.js`, `agendador.js`, `auditoria.js`, `notificacao.js`, `relatorio.js`, `inbound.js`
- `chaveiro-bot/src/queues/mensagens.js`, `chaveiro-bot/src/config/env.js`

**Painel (só para consumidores de contrato)**
- `chaveiro-painel/src/pages/MeusServicos.jsx`, `Aprovacoes.jsx`, `NovoServicoFuncionario.jsx`, `Configuracao.jsx`

**Documentação**
- `docs/db/02-domain-model.md`, `docs/db/03-adrs.md`, `docs/db/04-data-model.md`, `docs/db/06-security-lgpd.md`
- `docs/decisions.md`
- `docs/functionality-discovery/00_DEPENDENCY_MAP.md`, `docs/functionality-discovery/evidence/ROUND-00-MAPPER-BACKEND.md`
- `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`, `docs/agent-environment/EV063_REMEDIATION_REPORT.md`, `docs/agent-environment/EV065_VALIDATION_REPORT.md`

---

## 3. Evidências com `arquivo:linha`

### 3.1 — Identidade vs. conta vs. usuário

| Constraint exata | Local | O que permite / impede |
|---|---|---|
| `username String @unique` | `schema.prisma:228` | Username é **global**, não por empresa |
| `email String? @unique` | `schema.prisma:229` | Uma pessoa NÃO pode ter 2 contas com o mesmo e-mail, nem em empresas diferentes |
| `telefone String? @unique` | `schema.prisma:230` | Uma pessoa NÃO pode ter 2 contas com o mesmo telefone **exato**, nem em empresas diferentes |
| `empresaId Int` (sem par único) | `schema.prisma:226` | **Não existe** `@@unique([empresaId, username])` — a unicidade nunca é por tenant |
| `@@index([empresaId])`, `@@index([telefone])` | `schema.prisma:270-271` | Índices, não constraints |
| `ContaSocial @@unique([provedor, provedorSub])` | `schema.prisma:284` | 1 identidade social ↔ 1 `Usuario`; `usuarioId` FK `onDelete: Cascade` (`schema.prisma:277`) |
| `Tecnico @@unique([empresaId, telefone])` + `@@index([telefone])` | `schema.prisma:97,100` | Telefone de **técnico** É repetível entre empresas — por desenho do "número único" |

- A constraint global de telefone foi adicionada em `prisma/migrations/20260803000000_usuario_telefone_unique/migration.sql:21`, com o cabeçalho declarando ser **"Decisão explícita do usuário — aceita o risco de uma constraint de schema sem caso de uso documentado que a contraindique"** e **"NÃO validada contra um banco com dados reais nesta worktree"** (linhas 3-9 do mesmo arquivo). Contexto em `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md:161` (EV-059, commit `27ce4a9`).
- O login **ainda implementa** o cenário "mesma pessoa em N empresas": `routes/auth.js:178-185` busca `usuario.findMany({ where: { telefone: { in: variantes } } })` e `routes/auth.js:198-209` devolve `{ desambiguacao: [...] }` com lista de empresas. `docs/agent-environment/EV063_REMEDIATION_REPORT.md:20` registra que esse caminho **só continua alcançável por variantes do 9º dígito**, porque `variantesTelefone()` gera duas strings distintas para o mesmo número lógico.
- `services/credenciais.js:23-24` carrega o comentário **"o mesmo telefone pode existir em empresas diferentes"** — premissa hoje falsa para `Usuario`.
- `services/credenciais.js:63-74` cria o `Usuario` do técnico com o telefone canônico → colisão global levanta P2002. `routes/tecnicos.js:279-284` captura a falha em `logger.warn` e devolve **201 com `acesso: null`** — o técnico é criado, o acesso silenciosamente não.
- OAuth: `routes/auth.js:821-829` vincula por e-mail verificado a um `Usuario` existente **de qualquer empresa**; não havendo, `routes/auth.js:834-846` cria **uma Empresa nova** + `Assinatura` trial + `Usuario` `papel:'dono'`.

### 3.2 — Usuário vs. técnico

| Fato | Evidência |
|---|---|
| `Tecnico.usuarioId Int? @unique`, `onDelete: SetNull` | `schema.prisma:73-74`; FK real em `migrations/20260613100000_numero_unico_fase1/migration.sql:14` |
| Técnico **sem** usuário é normal | `services/servico.js:15` — `buscarOuCriarTecnico` cria `Tecnico` só com `nome` + `empresaId` |
| Usuário **sem** técnico é normal | `schema.prisma:264` (`tecnico Tecnico?`); `routes/admin.js:229` cria `Usuario` sem `Tecnico` |
| **Não existe rota de exclusão de técnico** | Única ocorrência de `tecnico.deleteMany` é `routes/account.js:98` (cascata de exclusão de empresa) |
| Desligamento é `ativo: false` no `Tecnico` | `routes/tecnicos.js:511-533` — `req.db.tecnico.updateMany`; **nada toca `Usuario`** |
| `Servico → Tecnico` é `ON DELETE RESTRICT` | `migrations/20260524204642_/migration.sql:33` |
| Excluir `Usuario` deixa `Tecnico` **órfão e ativo** | `routes/admin.js:381` `usuario.deleteMany` → `SetNull` em `Tecnico.usuarioId`; histórico de `Servico` intacto |
| Recriar acesso é possível depois | `routes/tecnicos.js:294-331` — bloqueia só se `tecnico.usuarioId` já existir (`:300`) |
| Painel checa `usuario.ativo`, **nunca** `tecnico.ativo` | `middlewares/auth.js:27`; `tecnicoId` vem de `usuario.tecnico?.id` sem filtro (`middlewares/auth.js:48`) |
| Bot checa `tecnico.ativo`, **nunca** `usuario.ativo` | `services/identidade.js:27` (`where: { telefone: {...}, ativo: true }`) |

### 3.3 — Papel vs. vínculo vs. cargo vs. capacidade

| Natureza | Campos | Local |
|---|---|---|
| **Acesso / autorização** | `admin` (legado), `papel`, `permissoes Json?` | `schema.prisma:232,235,238` |
| Vocabulário de acesso | `PAPEIS = ['dono','gestor','funcionario']`; `MODULOS` (10); `ACOES_POR_MODULO`; `CAPACIDADES_PROPRIO` (5) | `services/permissoes.js:55,19-30,33-44,47-53` |
| **Vínculo trabalhista (RH)** | `cpf`, `dataNascimento`, `endereco`, `modalidade`, `salarioBase`, `dataAdmissao`, `horaExtraAtiva`, `horaExtraPercentual`, `adicionalNoturno`, `valorHora`, `jornadaDiariaMin`, `jornadaSemanalMin` | `schema.prisma:76-89` |
| Domínio de `modalidade` | `['clt','clt_meio','clt_12x36','intermitente','autonomo']` — só no Zod, sem CHECK no banco | `routes/tecnicos.js:32` |
| **Remuneração variável** | `Tecnico.comissao`, `Tecnico.metaMensal` | `schema.prisma:68-69` |
| **Cargo / função nomeada** | **Não existe.** Único candidato: `Tecnico.nivelAcesso String?` — string livre (`z.string().max(40)`), gravada em `:253`, lida **uma única vez** para escolher o papel na criação do acesso, nunca em gate algum | `schema.prisma:79`; `routes/tecnicos.js:56,253,268-269` |
| Papel `tecnico` **não existe** no RBAC | `services/permissoes.js:55`; já registrado em `docs/functionality-discovery/00_DEPENDENCY_MAP.md:107` |

### 3.4 — Empresa vs. unidade

`Empresa` tem exatamente 6 colunas de negócio: `id`, `nome`, `slug @unique`, `ativo`, `aprovacaoServico`, `criadoEm` (`schema.prisma:20-37`). **Zero** noção de filial/unidade/loja/equipe/setor/departamento — varredura lexical em `chaveiro-bot/src`, `chaveiro-bot/prisma` e `chaveiro-painel/src` retorna apenas: `Material.unidade` (unidade de medida, `schema.prisma:179`), "loja" como o **local do Google Business** (`routes/google.js:129`, `services/google/businessClient.js:87`) e "equipe" num assunto de e-mail (`services/email.js:182`). **O tenant é plano.**

Se houvesse multiunidade, os models afetados (apenas listagem, sem desenho): `Tecnico`, `Servico`, `Material`, `MovimentacaoEstoque`, `Pagamento`, `RegistroPonto`, `DocumentoTecnico`, `Avaliacao`, `Usuario` (escopo do gestor), `EmpresaWhatsapp` (`grupoJid` é 1 por empresa — `schema.prisma:45-46`), `GoogleConta` (`empresaId @unique`, `schema.prisma:414`), `AnaliseAvaliacoes` (`empresaId @unique`, `:448`), `AuditLog`. Além do schema: `src/db/tenant.js:24-34` e `prisma/rls/enable_rls.sql:38-41`.

### 3.5 — Escopo multi-tenant

`MODELOS_ESCOPADOS` (`src/db/tenant.js:24-34`): `Tecnico`, `Servico`, `Material`, `Pagamento`, `EmpresaWhatsapp`, `Avaliacao`, `SessaoConversa`, `RegistroPonto`, `DocumentoTecnico` — **9**.

Models **com `empresaId` e FORA do escopo automático — 7**:

| Model | `empresaId` | FK p/ `Empresa`? | Call sites reais filtram? | Evidência |
|---|---|---|---|---|
| `Usuario` | `:226` | **Sim** (RESTRICT, `migrations/20260605000000_multitenant_empresa/migration.sql:89-90`) | **Sim, manualmente, em todas as rotas de tenant** | `admin.js:193,229(create),292-293,319-320,371-372,381`; `tecnicos.js:353-354` (comentário `:350-352` documenta o motivo); `account.js:405` |
| `GoogleConta` | `:414 @unique` | **Não** | Sim — sempre por `empresaId` (chave única) | `google.js:44-45,61-62,97-99,146-148`; job cross-tenant `agendador.js:251` (por desenho) |
| `AvaliacaoGoogle` | `:429` | **Não** | Parcial | `google.js:228,236` (filtra); `google.js:293-294` — `findUnique({where:{reviewId}})` **sem** `empresaId`, seguido de checagem explícita `existente.empresaId === empresaId` antes do `update` |
| `AnaliseAvaliacoes` | `:448 @unique` | **Não** | Sim | `google.js:61-62` |
| `Assinatura` | `:471 @unique` | **Sim** (RESTRICT, `migrations/20260705000000_session_auth_tables/migration.sql:107`) | Sim no painel; webhook Stripe é cross-tenant por chave externa | `billing.js:31,51`; webhook `billing.js:126,138,150,169` |
| `ConviteUsuario` | `:487` | **Não** | Sim na escrita; leitura é por token (capability) | `admin.js:420-421`; `auth.js:617-619,652-654` |
| `AuditLog` | `:532` | **Não** | Sim na escrita (é write-only) | `services/auditoria.js:15-17` |

Achados adicionais desta seção:

1. **`admin.js:324`** faz `prisma.usuario.findUnique({ where: { id } })` **sem** `empresaId` — é seguro **apenas** porque o `updateMany` escopado imediatamente anterior (`admin.js:319-323`) já provou a posse via `r.count === 0`. É segurança por ordenação de statements, não por construção.
2. **8 models carregam `empresaId` sem nenhuma FK para `Empresa`**: `SessaoConversa` (`:323`), `Avaliacao` (`:340`), `RegistroPonto` (`:373`), `GoogleConta` (`:414`), `AvaliacaoGoogle` (`:429`), `AnaliseAvaliacoes` (`:448`), `ConviteUsuario` (`:487`), `AuditLog` (`:532`). Confirmado pelas back-relations declaradas em `Empresa` — apenas 8 (`schema.prisma:28-35`) — e pela ausência dessas tabelas na varredura de `FOREIGN KEY ... REFERENCES "Empresa"` nas migrations.
3. **`SessaoConversa` diverge entre as duas camadas de isolamento**: está em `MODELOS_ESCOPADOS` (`tenant.js:31`), mas seu `empresaId` é **nullable** (`schema.prisma:323`) e ela está **deliberadamente fora da RLS** (`prisma/rls/enable_rls.sql:120-122`: *"RLS com igualdade excluiria as linhas null e quebraria o bot"*). O filtro app-level tem exatamente o mesmo efeito de excluir as linhas `null` — só que sem o comentário.
4. `enable_rls.sql:38-41` cobre 8 tabelas com `empresaId` direto (as 9 escopadas **menos** `SessaoConversa`) + 4 por relação (`:59,73,87,101`). `RLS_ATIVA` é off por padrão (`tenant.js:64`).
5. `update`/`delete`/`upsert` **unitários não são escopados** por desenho (`tenant.js:48-52`).

### 3.6 — Histórico e imutabilidade

**Preservam histórico**

| Entidade / campo | Evidência | Natureza |
|---|---|---|
| `MovimentacaoEstoque.saldoApos` | `schema.prisma:200`; escrita em `services/estoque.js:63-73` | Ledger append-only |
| `BatidaPonto` (`em`, `lat`, `lng`, `selfieUrl`, `origem`) | `schema.prisma:394-408` | Ledger de provas |
| `AuditLog` (`antes`/`depois` Json) | `schema.prisma:530-544` | Trilha |
| `Servico.aprovadoPor` / `aprovadoEm` | `schema.prisma:148-149`; gravados em `routes/servicos.js:267,304` | Marca de aprovação |
| `Servico.iniciadoEm` / `finalizadoEm` | `schema.prisma:151-152`; `routes/servicos.js:664,691` | Marcas de execução |
| `Avaliacao` (`agendadoPara`,`enviadoEm`,`respondidoEm`) | `schema.prisma:347-350` | Máquina de estados datada |
| **Snapshots financeiros congelados** — `Servico.valorLiquido`, `Servico.comissaoGerada` | `schema.prisma:135-136`; calculados na escrita em `routes/servicos.js:186-187` e `services/inbound.js:181` | **Correto**: mudar `Tecnico.comissao` não reescreve o passado. Justificado em `docs/db/04-data-model.md:72` |

**Só `@updatedAt`** (7): `EmpresaWhatsapp.atualizadoEm` `:58`, `SessaoConversa.atualizadoEm` `:329`, `ConexaoBot.atualizadoEm` `:366`, `GoogleConta.atualizadoEm` `:423`, `AnaliseAvaliacoes.atualizadoEm` `:452`, `Assinatura.atualizadoEm` `:480`, `SessaoUsuario.ultimaAtividadeEm` `:509`.

**Sobrescrito, sem histórico, com impacto em relatório**

| Mudança | Onde sobrescreve | Efeito em relatório histórico |
|---|---|---|
| `Tecnico.comissao` | `routes/tecnicos.js:513,532` | **Nenhum no passado** (snapshot em `comissaoGerada`). Mas a mudança em si não é auditada — `AuditLog` não cobre |
| `Material.precoUnit` / `precoVenda` | `routes/estoque.js:125-126,132` | **Perda real**: `ServicoMaterial` guarda só `quantidade` e `descricao` (`schema.prisma:211-221`), sem preço. O custo histórico por item é irrecuperável |
| `Tecnico.modalidade` / `jornadaDiariaMin` / `jornadaSemanalMin` | `routes/tecnicos.js:57,64-65` (POST); não há PATCH desses campos hoje | **Perda retroativa grave** — ver abaixo |
| `Empresa.aprovacaoServico` | `routes/admin.js:168-172` | Sem auditoria; muda a semântica de todos os serviços futuros |
| `Usuario.papel` / `permissoes` | `routes/admin.js:312-317` | **Auditado** (`admin.js:346-355`) |

**O achado mais sério deste item**: `services/ponto.js:65-88` (`resumoMes`) **recalcula** `horaExtraMinutos` e `saldoMinutos` chamando `calcularDia(tecnico, total)` com o `Tecnico` **atual**, **ignorando** o `RegistroPonto.horaExtraMinutos` já persistido no fechamento do dia (`services/ponto.js:179-182`, `schema.prisma:383`). Consumidores: `routes/tecnicos.js:393` (aba Banco de Horas) e `services/relatorio.js:4` (PDF/CSV oficial de ponto). Consequência: **mudar a modalidade contratual de um técnico reescreve retroativamente o banco de horas de todos os meses já fechados**, incluindo os que já geraram relatório assinado. Assimetria direta com o tratamento da comissão, que é congelada.

**`AuditLog` é write-only e cobre 5 ações**: nenhuma rota lê a tabela (única ocorrência: `services/auditoria.js:15` `create`). Ações registradas: `usuario.criado` (`admin.js:245`), `usuario.desativado` (`:330`), `usuario.permissoes_alteradas` (`:349`), `usuario.excluido` (`:386`), `convite.enviado` (`:440`). Aprovação e rejeição de serviço — decisões financeiras — vão **só para o logger** (`routes/servicos.js:286,314`), não para `AuditLog`.

### 3.7 — Soft delete

**Confirmado ausente.** Nenhum model tem `deletedAt`/`excluidoEm` (varredura em `schema.prisma`; convergente com `docs/functionality-discovery/00_DEPENDENCY_MAP.md:110` e `docs/functionality-discovery/evidence/ROUND-00-MAPPER-BACKEND.md:178`). O que existe são flags de desativação lógica: `Empresa.ativo` `:24`, `Tecnico.ativo` `:71`, `Usuario.ativo` `:244`.

**`onDelete` reais (schema + migration que os criou)**

| Relação | Política | Evidência |
|---|---|---|
| `Servico → Tecnico` | **RESTRICT** | `migrations/20260524204642_/migration.sql:33` |
| `Pagamento → Tecnico` | RESTRICT | `migrations/20260531124110_evolucao_v2/migration.sql:68` |
| `ServicoMaterial → Servico` | CASCADE | `.../20260531124110.../migration.sql:62`; `schema.prisma:213` |
| `ServicoMaterial → Material` | RESTRICT | `.../20260531124110.../migration.sql:65` |
| `MovimentacaoEstoque → Material` | **CASCADE** | `.../20260604132207.../migration.sql:26`; `schema.prisma:196` |
| `MovimentacaoEstoque → Servico` | SET NULL | `.../20260604132207.../migration.sql:29`; `schema.prisma:202` |
| `Notificacao → Usuario` | CASCADE | `.../20260604142936.../migration.sql:25` |
| `ContaSocial / RefreshToken / SessaoUsuario / CodigoRecuperacaoTotp → Usuario` | CASCADE | `.../20260612000000.../migration.sql:30`; `.../20260705000000.../migration.sql:110,113`; `.../20260707000000.../migration.sql:21` |
| `Tecnico → Usuario (usuarioId)` | **SET NULL** | `.../20260613100000.../migration.sql:14`; `schema.prisma:74` |
| `RegistroPonto → Tecnico` | **CASCADE** | `.../20260615000000.../migration.sql:47`; `schema.prisma:375` |
| `BatidaPonto → RegistroPonto` | CASCADE | `.../20260620000000.../migration.sql:45`; `schema.prisma:396` |
| `DocumentoTecnico → Tecnico` | **CASCADE** | `.../20260717000001.../migration.sql:28`; `schema.prisma:111` |
| `EmpresaWhatsapp → Empresa` | CASCADE | `.../20260605000000.../migration.sql:86-87` |
| `Usuario / Tecnico / Servico / Material / Pagamento / DocumentoTecnico / Assinatura → Empresa` | RESTRICT | `.../20260605000000.../migration.sql:89-102`; `.../20260717000001.../migration.sql:25`; `.../20260705000000.../migration.sql:107` |

**Resposta direta: o que acontece com `Servico` quando o `Tecnico` é deletado?** **Nada — a exclusão é impossível.** O FK é RESTRICT (`migrations/20260524204642_/migration.sql:33`) e, independente disso, **não existe rota que delete um `Tecnico`**. O único `tecnico.deleteMany` do código é `routes/account.js:98`, dentro de `apagarEmpresaEmCascata`, e ali funciona porque `servico.deleteMany` e `pagamento.deleteMany` rodam antes na mesma `$transaction` (`account.js:95-98`).

**Cascades destrutivos que existem hoje**

| Cascade | Risco conceitual |
|---|---|
| `RegistroPonto → Tecnico` CASCADE + `BatidaPonto → RegistroPonto` CASCADE | Excluir um técnico apagaria **toda a prova de jornada** — dado com prazo de contestação trabalhista. Hoje inalcançável (RESTRICT do `Servico`), mas o dia em que um técnico sem serviços for excluído, o ponto vai junto |
| `DocumentoTecnico → Tecnico` CASCADE (`schema.prisma:111`) | Mesma coisa para contrato/RG/CNH |
| `MovimentacaoEstoque → Material` CASCADE (`schema.prisma:196`) | Excluir material apaga o **ledger** dele. `routes/estoque.js:150-152` bloqueia o delete se houver `ServicoMaterial`, mas **não** se houver apenas movimentações (entradas manuais, ajustes) |

**Órfãos por exclusão de empresa**: `apagarEmpresaEmCascata` (`routes/account.js:82-104`) apaga 13 tabelas, mas **não** apaga `ConviteUsuario` nem `AuditLog` — e nenhum dos dois tem FK para `Empresa`. Após `DELETE /me/conta` com escopo `empresa` (`account.js:409-417`), essas linhas **sobrevivem apontando para um `empresaId` inexistente**, incluindo `AuditLog.antes/depois` com dados pessoais (`docs/db/04-data-model.md:62` classifica esses campos como "contém pessoal").

### 3.8 — Eventos de domínio

**Não existe mecanismo de evento nem outbox.** Varredura por `outbox`, `domainEvent`, `eventBus`, `emitirEvento`, `publish(` em `chaveiro-bot/src` → **zero** ocorrências. As filas BullMQ existentes são de **transporte de entrada**, não de domínio: `queues/mensagens.js:10` (`'mensagens-inbound'`, webhook do WhatsApp) e `queues/email.js`.

Todos os efeitos colaterais são **chamadas diretas dentro do handler**:

| Gatilho | Efeitos | Onde está codificado |
|---|---|---|
| Aprovar serviço | `status='ativo'` + `aprovadoPor`/`aprovadoEm` + baixa de estoque **na mesma transação**; agendamento de avaliação **fora** dela, fire-and-forget | `routes/servicos.js:264-277` (transação) e `:278-285` (`.catch` que só loga) |
| Registrar serviço (painel) | create + baixa condicional a `status==='ativo'` + agendar avaliação | `routes/servicos.js:196-234`, `:231-232`, `:235-242` |
| Registrar serviço (bot) | create + baixa, ambos em `$transaction` | `services/servico.js:26-65`, `:59` |
| Baixa de estoque | update atômico (`increment`) + linha no ledger + alerta de estoque baixo | `services/estoque.js:57-73`, `:108` |
| Estoque baixo | `Notificacao` por admin ativo da empresa | `services/notificacao.js:47-64`, `:69+` |
| Rejeitar serviço | só muda `status` | `routes/servicos.js:302-305` |
| Cron | resumo semanal, avaliações vencidas, retenção LGPD, sync Google | `services/agendador.js:355-398` |

**Fragilidade estrutural**: `services/estoque.js:93-116` engole exceção **por item** (`catch` na linha `:109`) e só loga. O serviço é confirmado (201) mesmo com a baixa de estoque falhando — divergência silenciosa entre `Material.quantidadeAtual` e a realidade, sem sinal para o usuário.

### 3.9 — Campos "contrato compartilhado"

| Campo | Consumidores reais |
|---|---|
| **`Servico.status`** (`schema.prisma:147`) | Backend: `routes/servicos.js:76,130,188-194,231,262,302-304,310,419,430,443,458,622,648,663,690`; `routes/tecnicos.js:192,442,448,458`; `services/relatorio.js:19`; `services/agendador.js:53`. Painel: `pages/MeusServicos.jsx:29,39,49-51,121`, `pages/Aprovacoes.jsx:138`, `pages/NovoServicoFuncionario.jsx:105`. **String livre, sem CHECK no banco** (`docs/db/04-data-model.md:91-93`) |
| **`Empresa.aprovacaoServico`** (`schema.prisma:27`) | `routes/admin.js:155,157,166,171`; `routes/servicos.js:192-194`; painel `pages/Configuracao.jsx:143,156`. **Só 1 leitor de decisão** |
| **`Usuario.permissoes`** (`schema.prisma:238`) | `services/permissoes.js:122-126,154-180,236-256`; `routes/admin.js:236,317,357`; `middlewares/auth.js:50`; painel `components/Guards.jsx`, `Sidebar.jsx`, `BottomNav.jsx`, `contexts/AuthContext.jsx`, `pages/Usuarios.jsx`, `pages/Mais.jsx` |
| **`Usuario.papel` + `Usuario.admin`** (`:235`,`:232`) | `permissoes.js:123,133,140,216-218,231`; `admin.js:225,235,306,314,378`; `middlewares/auth.js:88-91` (`adminOnly`); `routes/billing.js:18,29`; `routes/admin.js:451`; `routes/tecnicos.js:269,302`. **Dois mecanismos coexistindo** — `docs/functionality-discovery/00_DEPENDENCY_MAP.md:108` |
| **`Tecnico.comissao`** (`:68`) | `routes/servicos.js:187`; `services/inbound.js:181,278`; `routes/tecnicos.js:51,209,248,513`; `routes/account.js:189`; painel `Tecnicos.jsx`, `PerfilTecnico.jsx`, `NovoTecnico.jsx`, `MeuPainel.jsx`, `DashboardWidgets.jsx`, `Aprovacoes.jsx` |
| **`Tecnico.telefone`** (canônico, `:66`) | `services/identidade.js:26` (resolução da empresa pelo remetente); `routes/tecnicos.js:242,526-531`; `services/credenciais.js:52-54`. `routes/tecnicos.js:521-524` documenta a regressão já ocorrida quando o PATCH gravava o valor cru |
| **`Tecnico.modalidade` / `jornadaDiariaMin`** (`:81`,`:88`) | `services/ponto.js:30-45,52-59,65-88`; `routes/tecnicos.js:393,396`; `services/relatorio.js:4` |
| **`Material.quantidadeAtual`** (`:183`) | `services/estoque.js:44-61,75`; `routes/estoque.js:170-180` |

### 3.10 — Retenção

**Existe expurgo automático**: `limparDadosAntigos` (`services/agendador.js:183-210`), cron diário 03:30 America/Sao_Paulo (`services/agendador.js:374`), sob lock distribuído (`agendador.js:325-345`).

| Dado | Política | Prazo | Evidência |
|---|---|---|---|
| `SessaoConversa` | **DELETE** | 7 dias | `agendador.js:164,188-190` |
| `Avaliacao` (PII do cliente) | **Anonimização** (`clienteTelefone=''`, `clienteNome=null`, `comentario=null`); linha permanece | 180 dias | `agendador.js:163,191-194` |
| `BatidaPonto` (selfie + geo) | **Expurgo da prova**; hora/batida permanece | 365 dias | `agendador.js:168,217-241` |

**Sob demanda**: `POST /api/lgpd/anonimizar-cliente` (`routes/admin.js:451-489`, anonimiza `Servico` + `Avaliacao` por telefone); `DELETE /me/conta` (`routes/account.js:372-425`).

**Crescem indefinidamente (sem nenhum expurgo)**, por titular:

| Titular | Entidades sem expurgo |
|---|---|
| **Empresa** (dado de negócio) | `Servico`, `MovimentacaoEstoque`, `ServicoMaterial`, `Pagamento`, `Material`, `AuditLog` (write-only, `auditoria.js:15`), `AvaliacaoGoogle`, `Assinatura`, `ConviteUsuario` (expirados nunca apagados — `auth.js:617` só filtra na leitura) |
| **Funcionário** | `RegistroPonto` (linha), `BatidaPonto` (linha), `DocumentoTecnico` (contrato/RG/CNH em bucket privado), `Notificacao`, `SessaoUsuario`, `RefreshToken`, `CodigoRecuperacaoTotp`, `ContaSocial` |
| **Cliente final** | `Servico.clienteNome`/`clienteTelefone` (só some por ação manual do dono, `admin.js:451`); `Avaliacao` (anonimizada aos 180d, linha permanece); `AvaliacaoGoogle.autorNome`/`comentario` (**nunca** expurgado) |

`RefreshToken`/`SessaoUsuario` só são apagados por ação do usuário (`account.js:636-637`, `auth.js:715,730`); **não há job que limpe tokens expirados** (`RefreshToken.expiraEm`, `schema.prisma:523`, é usado apenas como filtro de leitura em `auth.js:706`).

`docs/db/06-security-lgpd.md:77-79` já registra que o prazo `N` de retenção é **decisão do dono + jurídico**, e `:90` que a base legal por finalidade está pendente.

### 3.11 — Dinheiro

**Tipo: `Float` (IEEE-754). `Decimal`: zero ocorrências no schema.** 20 colunas `Float` no total, das quais **12 são monetárias ou percentuais**:

| Coluna | Linha | Natureza |
|---|---|---|
| `Tecnico.comissao` | `:68` | % |
| `Tecnico.metaMensal` | `:69` | R$ |
| `Tecnico.salarioBase` | `:82` | R$ |
| `Tecnico.horaExtraPercentual` | `:85` | % |
| `Tecnico.valorHora` | `:87` | R$ |
| `Servico.valorCobrado` | `:133` | R$ |
| `Servico.valorMaterial` | `:134` | R$ |
| `Servico.valorLiquido` | `:135` | R$ (derivado) |
| `Servico.comissaoGerada` | `:136` | R$ (derivado) |
| `Material.precoUnit` | `:180` | R$ |
| `Material.precoVenda` | `:181` | R$ |
| `Pagamento.valor` | `:311` | R$ |

As 8 restantes são quantidade (`Material.estoqueMinimo` `:182`, `Material.quantidadeAtual` `:183`, `MovimentacaoEstoque.quantidade` `:199`, `MovimentacaoEstoque.saldoApos` `:200`, `ServicoMaterial.quantidade` `:217`) e geolocalização (`BatidaPonto.lat/lng/precisao` `:400-402`).

**Sim, é risco documentado em ADR**: `docs/db/03-adrs.md:25-35` — **ADR-002 "Valores monetários em `Decimal`, nunca `Float`"**, status **"Aceito (recomendação forte)"**, com plano de migração Expand/Contract. O ADR fala em **17 colunas**; a contagem real hoje é **20 Float / 12 monetárias** — o número do ADR não bate com o schema atual.

Agravante operacional: o arredondamento é feito ad hoc com `parseFloat((...).toFixed(2))` espalhado — `routes/servicos.js:187`, `services/inbound.js:181`, `routes/account.js:194,196,200,209,216`, `routes/tecnicos.js:471`, `routes/servicos.js:502,504`.

### 3.12 — Feature flags e dados

**Existe exatamente 1 toggle de funcionalidade por tenant persistido em banco**: `Empresa.aprovacaoServico Boolean @default(false)` (`schema.prisma:27`). **Não existe tabela de feature flags.**

| Categoria | Item | Local |
|---|---|---|
| Toggle de funcionalidade por tenant | `Empresa.aprovacaoServico` | `schema.prisma:27`; leitura de decisão em `routes/servicos.js:192-194` |
| Toggles de **comportamento** por tenant (não de funcionalidade) | `EmpresaWhatsapp.reviewAtivo` `:49`, `EmpresaWhatsapp.provider` `:54` (`'evolution'`\|`'cloud'`), `Assinatura.status` `:476` (paywall), `Empresa.ativo` `:24` | idem |
| Flags **globais** de ambiente | `GOOGLE_REVIEWS_ENABLED` (`config/env.js:72`), `RLS_ENABLED` (`:86`), `SERVICO_ANDAMENTO_ENABLED` (`:105`), `DOCUMENTOS_ENABLED` (`:110`) | Gate em `routes/servicos.js:608`; `services/agendador.js:249` |
| Preferências por **usuário** (não são flags de tenant) | `Usuario.preferencias Json?` `:240`, `Usuario.notificacoes Json?` `:261` | `routes/account.js:686-693`; `services/notificacao.js:16-18` |

Consequência: uma funcionalidade nova que precise ser ligada por empresa **não tem onde morar** — hoje ou vira coluna nova em `Empresa`, ou vira variável de ambiente global (ligada para todos ou para ninguém).

### 3.13 — Sincronização entre módulos

| Mudança em | O que precisa ser recalculado | Onde vive hoje | Regime |
|---|---|---|---|
| `Tecnico.comissao` | Nada no passado (congelado em `Servico.comissaoGerada`); saldo do técnico é derivado on-the-fly | `routes/tecnicos.js:202-220`, `:463-489` (`aggregate` `_sum.comissaoGerada` − `Σ Pagamento.valor`) | **Snapshot** |
| `Tecnico.modalidade` / `jornada*` | Banco de horas **inteiro**, retroativamente | `services/ponto.js:65-88`; consumido por `routes/tecnicos.js:393` e `services/relatorio.js:4` | **Live (retroativo)** |
| Serviço criado/aprovado | Saldo de estoque + ledger + alerta de estoque baixo + agendamento de avaliação | `services/estoque.js:57-73,108`; `services/avaliacao.js:25-53` | Direto, no handler |
| Movimentação de estoque | `Material.quantidadeAtual` por `increment` atômico; **nada reconstrói do ledger** | `services/estoque.js:57-61` (comentário `:52-56` narra o lost-update já corrigido) | Projeção mutável |
| Qualquer serviço | Dashboard, indicadores do gestor, resumo semanal | `routes/servicos.js:423-452` e `:543-565` (`aggregate`/`groupBy` por request, **sem cache**); `services/agendador.js:47-57` | Live |
| `EmpresaWhatsapp.reviewDelayHoras` | Nada no que já está agendado — o delay é lido **no agendamento** | `services/avaliacao.js:28-33` | **Snapshot** |
| `EmpresaWhatsapp.reviewAtivo`/`reviewLink`/`reviewTemplate` | Aplicado **no envio**, sobre avaliações já agendadas | `services/avaliacao.js:73-90` | **Live** |
| Avaliações do Google | Cache incremental por watermark `criadoEmGoogle` | `services/agendador.js:260-268`; análise IA `:295` | Eventual |

---

## 4. Comportamento atual (síntese)

1. **Uma pessoa = um `Usuario` global**, ancorado em três chaves globais (`username`, `email`, `telefone`). O tenant (`empresaId`) é atributo, não parte da identidade. Mas **uma pessoa = N `Tecnico`**, um por empresa, ancorado em `@@unique([empresaId, telefone])`. São dois modelos de identidade conflitantes no mesmo sistema.
2. **`Tecnico` e `Usuario` são entidades independentes** ligadas por um `usuarioId` opcional. Nenhuma operação sincroniza os estados `ativo` das duas. Desligar um técnico não corta o painel; desativar o usuário não corta o WhatsApp.
3. **Papel de acesso e vínculo trabalhista estão separados por acidente de tabela** (`Usuario` vs `Tecnico`), não por conceito. Não existe cargo/função nomeada. `Tecnico.nivelAcesso` é uma terceira nomenclatura de "o que a pessoa é", string livre, praticamente morta.
4. **O tenant é plano.** `Empresa` é a única unidade organizacional.
5. **O isolamento multi-tenant é de duas velocidades**: 9 models são escopados automaticamente; 7 dependem de disciplina em cada call site. Nos 7, os call sites de tenant **de fato filtram** — mas via 4 padrões diferentes (chave única por `empresaId`, filtro explícito, `updateMany` + `count`, checagem pós-leitura).
6. **Dinheiro é congelado, tempo não.** Comissão vira snapshot no serviço; jornada é recalculada a cada leitura de relatório.
7. **Não existe soft delete** e a exclusão real é praticamente impossível para as entidades centrais (RESTRICT), exceto pela rota de exclusão de empresa, que é uma cascata manual de 13 `deleteMany` e deixa 2 tabelas órfãs.
8. **Não existe evento de domínio.** Todo efeito colateral é uma chamada direta no handler que originou a ação.
9. **Existe 1 toggle de funcionalidade por empresa** e ele não é respeitado por um dos dois caminhos de criação de serviço.
10. **Retenção automática cobre 3 categorias**; o resto cresce sem teto.

---

## 5. Problemas identificados

| # | Problema | Gravidade conceitual | Evidência |
|---|---|---|---|
| P1 | `Usuario.telefone`/`email` globais **contradizem** o fluxo de desambiguação de login por empresa, que continua implementado | Alta | `schema.prisma:229-230` vs `routes/auth.js:178-209`; `EV063_REMEDIATION_REPORT.md:20` |
| P2 | Criar acesso a um técnico cujo telefone já existe em outra empresa **falha silenciosamente**: 201 + `acesso: null` | Alta | `routes/tecnicos.js:279-286`; `services/credenciais.js:63-74` |
| P3 | **`Empresa.aprovacaoServico` é ignorado no fluxo do bot** — serviço via WhatsApp nasce `ativo` e baixa estoque/gera comissão sem aprovação | Alta | `services/servico.js:27-54` (sem `status`, default `'ativo'` em `schema.prisma:147`) vs `routes/servicos.js:189-195` |
| P4 | **Banco de horas é retroativamente reescrito** por mudança de modalidade/jornada; o valor persistido no fechamento do dia é ignorado | Alta | `services/ponto.js:65-88` vs `services/ponto.js:179-182` / `schema.prisma:383` |
| P5 | `Tecnico.ativo` e `Usuario.ativo` são **dois interruptores desconectados** para o mesmo desligamento | Alta | `routes/tecnicos.js:511-533`; `routes/admin.js:311-322`; `middlewares/auth.js:27,48`; `services/identidade.js:27` |
| P6 | **8 models têm `empresaId` sem FK** para `Empresa` — nenhuma integridade referencial de tenant | Média-alta | `schema.prisma:323,340,373,414,429,448,487,532` vs back-relations `:28-35` |
| P7 | `apagarEmpresaEmCascata` deixa **`ConviteUsuario` e `AuditLog` órfãos** (inclui PII em `antes`/`depois`) | Média-alta | `routes/account.js:82-104`; `schema.prisma:485-498,530-544` |
| P8 | **Custo histórico de material é perdido**: `ServicoMaterial` não guarda preço; `Material.precoUnit/precoVenda` são sobrescritos | Média-alta | `schema.prisma:211-221`; `routes/estoque.js:125-126,132` |
| P9 | **`AuditLog` é write-only e cobre 5 ações**; aprovação/rejeição de serviço não é auditada em banco | Média-alta | `services/auditoria.js` (único `create`); `routes/servicos.js:286,314` |
| P10 | `Servico.status` é **string livre sem CHECK**, consumida por ~30 pontos + 3 telas | Média | `schema.prisma:147`; `docs/db/04-data-model.md:91-93` |
| P11 | Dinheiro em `Float` (12 colunas) com arredondamento ad hoc espalhado | Média | `schema.prisma:68-311`; ADR-002 `docs/db/03-adrs.md:25-35` |
| P12 | **Sem lugar para ligar/desligar funcionalidade por empresa** além de coluna nova em `Empresa` | Média | `schema.prisma:27` é o único toggle; flags restantes em `config/env.js:72,86,105,110` |
| P13 | **Sem eventos de domínio** — módulo novo que precise reagir a "serviço aprovado" precisa editar o handler existente | Média | Varredura sem resultado; `routes/servicos.js:264-285` |
| P14 | Baixa de estoque **engole exceção por item**; serviço confirma mesmo com estoque não baixado | Média | `services/estoque.js:93-116` (`catch` em `:109`) |
| P15 | Cascades destrutivos latentes sobre prova trabalhista (`RegistroPonto`/`BatidaPonto`/`DocumentoTecnico` → `Tecnico`) e sobre o ledger (`MovimentacaoEstoque` → `Material`) | Média | `schema.prisma:111,196,375,396`; `routes/estoque.js:150-152` não cobre movimentações |
| P16 | `SessaoConversa` escopada no app-level mas fora da RLS, com `empresaId` nullable — as duas camadas divergem | Média | `db/tenant.js:31` + `schema.prisma:323` vs `prisma/rls/enable_rls.sql:120-122` |
| P17 | Três vocabulários paralelos de "o que a pessoa é": `Usuario.papel`, `Usuario.admin`, `Tecnico.nivelAcesso` | Média | `schema.prisma:232,235,79`; `00_DEPENDENCY_MAP.md:107-108` |
| P18 | Sem expurgo de `RefreshToken`/`SessaoUsuario` expirados, `ConviteUsuario` vencido, `AvaliacaoGoogle` (PII de terceiro) | Média | `agendador.js:183-210` não os cobre |

---

## 6. Causas prováveis ou confirmadas

| Problema | Causa | Status |
|---|---|---|
| P1 | Constraint adicionada como **mitigação de segurança** (anti-abuso de trial, EV-057), não como decisão de modelagem de identidade. O comentário da migration reconhece o risco | **Confirmada** — `migrations/20260803000000_.../migration.sql:3-9`; `EOS_SECURITY_CLOSURE_V2_PLAN.md:159,161` |
| P2 | Consequência direta de P1 sobre um caminho escrito antes dela (`credenciais.js:23-24` documenta a premissa antiga) | **Confirmada** |
| P3 | O toggle nasceu no fluxo do painel-funcionário (`docs/decisions.md:47`, "Serviço registrado pelo funcionário") e nunca foi propagado ao caminho do bot, que é anterior | Provável |
| P4 | `resumoMes` foi escrito como função pura sobre `(tecnico, registros)` para ser testável; ao receber o técnico atual, virou "live" sem que ninguém tenha decidido isso | Provável |
| P5 | `Tecnico` e `Usuario` nasceram em momentos diferentes: `Tecnico` no domínio de operação, `Usuario` no de acesso; o vínculo `usuarioId` foi adicionado depois (`migrations/20260613100000_numero_unico_fase1`) como ponte, não como unificação | **Confirmada** pela ordem das migrations |
| P6, P7 | Models criados sem `@relation` para `Empresa` (só a coluna escalar) — padrão que se repetiu de `SessaoConversa` (`:323`) em diante | **Confirmada** por leitura do schema |
| P8, P9 | Ausência de decisão explícita sobre "o que é imutável"; o ledger foi aplicado ao estoque e ao ponto, mas não a preço nem a aprovação | Provável |
| P11 | Escolha original de `Float`, já diagnosticada e com plano registrado, mas não executada | **Confirmada** — ADR-002 `docs/db/03-adrs.md:25-35` |
| P13 | Porte do sistema (NANO, `ADR-003`) não exigiu desacoplamento até agora | Provável |
| P16 | Consequência de `empresaId` ser nullable em `SessaoConversa` por causa da desambiguação do número único | **Confirmada** — `enable_rls.sql:120-122` explica |

---

## 7. Contradições

| # | Contradição | Lados |
|---|---|---|
| C1 | "Uma pessoa pode ter conta em mais de uma empresa" | **Código de login**: `routes/auth.js:198-209` implementa a desambiguação. **Schema**: `schema.prisma:230` proíbe (telefone global). **Comentário**: `services/credenciais.js:23-24` afirma que pode. **Doc de segurança**: `EV063_REMEDIATION_REPORT.md:20` diz que só sobrevive por variantes do 9º dígito |
| C2 | Unicidade global de `Usuario` | `docs/db/04-data-model.md:89-90` lista como "unicidade global legítima" apenas `username`/`email` e afirma no `:87-88` que **"nenhuma unicidade global onde o conceito é por-empresa"** — `telefone @unique` (agosto/2026) não está no documento |
| C3 | Domínio de `Avaliacao.status` | `schema.prisma:337` documenta `pendente → enviada → respondida \| expirada`; `services/avaliacao.js:82` grava `'cancelada'`, valor não previsto; `'expirada'` nunca é gravado por nenhum código |
| C4 | Aprovação de serviço é "toggle por empresa" | `schema.prisma:25-27` afirma que serviços de funcionários entram como pendente; `services/servico.js:27-54` (bot) ignora o toggle |
| C5 | Contagem de colunas monetárias | ADR-002 diz **17** (`docs/db/03-adrs.md:27`); o schema tem **20 Float**, das quais **12** são dinheiro/percentual |
| C6 | Escopo de `SessaoConversa` | `db/tenant.js:31` escopa; `prisma/rls/enable_rls.sql:120-122` a exclui explicitamente com o argumento de que o filtro por igualdade quebraria o bot — argumento que se aplica igualmente ao filtro app-level |
| C7 | Imutabilidade | `docs/db/02-domain-model.md:44-46` afirma "event-sourcing parcial onde importa (estoque, ponto)". No ponto, o agregado persistido (`RegistroPonto.horaExtraMinutos`) **não é a fonte da verdade** — `services/ponto.js:72` recalcula |
| C8 | `Tecnico.nivelAcesso` | `schema.prisma:79` documenta como "papel no painel (ex.: `tecnico` \| `gestor`)"; `services/permissoes.js:55` não tem papel `tecnico`; o campo só é lido em `routes/tecnicos.js:269` para escolher `'gestor'` vs `'funcionario'` |

---

## 8. Perguntas que dependem do usuário

Apenas o que **não é descobrível no repositório** — são decisões de produto/negócio, não de leitura de código.

| # | Pergunta | Por que só você decide | O que trava se ficar aberto |
|---|---|---|---|
| Q1 | **Uma mesma pessoa física pode ter conta em mais de uma empresa do AdmAi?** Se sim, a identidade é a pessoa (com N vínculos) ou a conta é por empresa (N contas)? | É modelo de negócio (franquia? prestador multi-cliente? chaveiro que atende duas lojas?), não fato do código | Bloqueia P1/P2/C1/C2. Qualquer módulo novo que toque login, convite ou cadastro de funcionário escolherá um lado por conta própria |
| Q2 | **Empresa terá filial/unidade/equipe no roadmap dos próximos 12 meses?** | Só você sabe o perfil do cliente-alvo | Se sim, cada model criado agora nasce com o discriminador errado. Se não, dá para fixar "tenant é plano" como invariante |
| Q3 | **Quando um funcionário é desligado, o que deve acontecer com o histórico dele e com o acesso?** (a) some tudo; (b) histórico fica, acesso morre; (c) fica visível mas marcado como ex-funcionário | É decisão trabalhista/contábil, não técnica | P5, P15 e qualquer definição de soft delete dependem disso |
| Q4 | **Mudar a modalidade contratual de um técnico deve reescrever o banco de horas dos meses já fechados, ou só valer para frente?** | É decisão trabalhista com efeito legal | P4. Hoje reescreve, sem ninguém ter decidido |
| Q5 | **Aprovação de serviço deve valer também para o registro via WhatsApp?** | É decisão de processo do dono | P3/C4. Hoje o toggle vale só metade |
| Q6 | **Quais ações precisam de trilha de auditoria em banco (não só log)?** Mínimo sugerido para triagem: aprovar/rejeitar serviço, alterar comissão, alterar preço de material, ajustar ponto, excluir serviço | É decisão de compliance/contestação | P9 |
| Q7 | **Por quanto tempo cada categoria deve ser retida?** (`Servico`+PII de cliente; `RegistroPonto`/`BatidaPonto`; `DocumentoTecnico`; `AuditLog`; `AvaliacaoGoogle`) | `docs/db/06-security-lgpd.md:77-79,90` já declara que o prazo `N` é decisão sua + jurídico | P18 e o RIPD |
| Q8 | **Preço de material deve ficar congelado no serviço (custo histórico) ou o relatório pode usar o preço atual?** | É decisão contábil | P8 |
| Q9 | **Funcionalidade nova deve poder ser ligada por empresa (piloto/plano) ou é sempre tudo-ou-nada global?** | É decisão de go-to-market (planos? beta com clientes selecionados?) | P12. Define se a Rodada 1 precisa fixar um conceito de flag por tenant antes das rodadas de features |
| Q10 | **Migração de `Float` → `Decimal` entra no escopo desta frente ou fica em backlog?** ADR-002 já está "Aceito" mas não executado | É decisão de priorização/risco | P11/C5 |

---

## 9. Alternativas

Alternativas para as decisões acima. **Nenhuma é recomendação; são os caminhos possíveis com o custo real de cada um.**

**A. Identidade (Q1)**

| Opção | O que implica | Custo |
|---|---|---|
| A1 — Conta por empresa | Trocar `email`/`telefone` globais por `@@unique([empresaId, email])` etc.; login passa a exigir seleção de empresa ou desambiguação por senha | Migration de constraints + revisão de `auth.js` (login, OAuth, magic link, recuperação) + reabre EV-057 (abuso de trial), que foi fechado com essa constraint |
| A2 — Identidade global, vínculo separado | `Usuario` global sem `empresaId`; nova entidade de vínculo (`Usuario × Empresa × papel`) | Mudança estrutural grande; toca RBAC, JWT, `req.db`, RLS, todas as rotas |
| A3 — Manter global e **remover** o fluxo de desambiguação | Assume "uma pessoa = uma empresa"; simplifica tudo | Perde o caso de uso do técnico multi-empresa, que o bot (`services/identidade.js`) já suporta no lado `Tecnico` |
| A4 — Manter como está e documentar como invariante conhecida | Zero custo agora | Mantém C1/P2 vivos; toda rodada futura vai reencontrar isso |

**B. Multiunidade (Q2)**

| Opção | Implicação |
|---|---|
| B1 — Fixar "tenant plano" como invariante da Rodada 1 | Nenhum model novo carrega `unidadeId`; se surgir demanda, é migração grande |
| B2 — Reservar o conceito sem implementar | Registrar a decisão de que, se vier, entra como `unidadeId` nullable nos models de operação; nada muda hoje |
| B3 — Implementar agora | Toca 13 models + `tenant.js` + RLS; sem demanda confirmada é over-engineering (mesmo argumento do ADR-007) |

**C. Desligamento de funcionário (Q3)**

| Opção | Implicação |
|---|---|
| C1 — Um único ato de desligamento | Uma operação transacional que desativa `Tecnico` **e** `Usuario`; histórico intacto; sem soft delete novo |
| C2 — Soft delete formal | `desligadoEm` em `Tecnico`; todas as queries de operação passam a filtrar; ~15 pontos de leitura |
| C3 — Manter dois interruptores e documentar | Zero custo; mantém P5 |

**D. Imutabilidade (Q4, Q6, Q8)**

| Opção | Implicação |
|---|---|
| D1 — Congelar por snapshot, como já se faz com a comissão | `RegistroPonto` passa a ser lido do valor persistido; `ServicoMaterial` ganha preço no momento do consumo. Padrão já existente e comprovado no código |
| D2 — Versionar as entidades de política (comissão, jornada, preço) com vigência | Mais correto e mais caro; introduz o conceito de "vigência", que hoje não existe em lugar nenhum |
| D3 — Só documentar que é live e aceitar | Zero custo, risco trabalhista/contábil permanece |

**E. Eventos de domínio (P13)**

| Opção | Implicação |
|---|---|
| E1 — Manter chamadas diretas | Zero custo; cada módulo novo edita handlers existentes |
| E2 — Outbox transacional | Tabela de eventos escrita na mesma transação + worker (BullMQ já existe, `queues/mensagens.js`). Resolve também P14 (baixa de estoque que falha silenciosamente) |
| E3 — Event emitter em memória | Barato, mas perde evento em crash — pior que E1 para dinheiro/estoque |

**F. Flags por tenant (Q9)**

| Opção | Implicação |
|---|---|
| F1 — Coluna nova em `Empresa` por flag | O que já se faz; não escala, mas é honesto e visível |
| F2 — `Empresa.recursos Json?` | Mesmo padrão já usado em `Usuario.permissoes`/`preferencias`; barato, sem migration por flag |
| F3 — Tabela de flags por empresa | Mais completo (rollout %, auditoria); custo desproporcional ao porte atual |

---

## 10. Recomendação

**Recomendação, não decisão.** O que segue é o que eu proporia se a decisão fosse minha — ela não é.

**Prioridade 1 — o que a Rodada 1 precisa fixar antes de qualquer rodada de funcionalidade** (são conceitos, não implementação):

1. **Fixar a resposta de Q1 (identidade)** antes de qualquer coisa. É o único item que, se ficar aberto, faz duas rodadas seguintes criarem dois conceitos de "pessoa". Minha inclinação: **A3 ou A4** — declarar "uma pessoa = uma empresa" como invariante atual e **remover ou marcar como morto** o fluxo de desambiguação (`routes/auth.js:198-209`), porque hoje ele é uma promessa que o schema não cumpre. A4 (só documentar) é aceitável se houver dúvida de roadmap, desde que P2 seja tratado — o 201 silencioso com `acesso: null` é o pior dos mundos.
2. **Fixar Q2 (multiunidade) como B1 ou B2.** B2 custa nada e evita retrabalho.
3. **Fixar Q3 (desligamento) como C1.** "Desligar funcionário" precisa ser **um** conceito, não dois interruptores. Isso não exige soft delete.
4. **Fixar Q4 e Q8 como D1** (congelar por snapshot). É o padrão que o próprio código já escolheu para a comissão (`docs/db/04-data-model.md:72` até justifica a desnormalização exatamente assim). O ponto e o preço de material estão fora desse padrão por acidente, não por decisão.
5. **Fixar Q9 como F2** (`Empresa.recursos Json?`). Sem isso, cada funcionalidade nova das próximas rodadas vira uma coluna booleana em `Empresa` ou uma env var global.

**Prioridade 2 — decisões que podem esperar mas devem ser registradas agora:**

6. **Q5 (aprovação no bot)**: a divergência entre os dois caminhos de criação de serviço é a mais provável de virar bug de negócio — o dono liga o toggle achando que cobre tudo.
7. **Q6 (auditoria)**: `AuditLog` existe, é write-only e cobre 5 ações administrativas. Definir o conjunto mínimo (aprovação, comissão, preço, ponto) é barato agora e caro depois.
8. **Q7 (retenção)**: já é pendência formal registrada em `docs/db/06-security-lgpd.md:90`.

**Prioridade 3 — registrar como dívida com gatilho, não resolver agora:**

9. **P11 / Q10 (Float → Decimal)**: ADR-002 já existe e está "Aceito". Recomendo **não** puxar para esta frente; recomendo **corrigir o número no ADR** (17 → 20 colunas / 12 monetárias) para o documento não perder credibilidade.
10. **P13 (outbox)**: E1 é defensável no porte atual. Mas se a decisão de Q6 for "auditar aprovação de serviço", o gatilho para E2 chega junto.
11. **P6/P7 (FKs ausentes e órfãos)**: são correções pontuais de integridade, não conceitos transversais. Registrar, não decidir aqui.

---

## 11. Impactos cruzados

| Decisão | Impacta |
|---|---|
| **Q1 (identidade)** | Login (`auth.js` inteiro), OAuth (`auth.js:810-865`), convite (`auth.js:636-694`), criação de acesso de técnico (`credenciais.js`, `tecnicos.js:294-331`), RBAC (`middlewares/auth.js:41-53`), JWT (`services/auth.js`), painel (`AuthContext.jsx`), **e** a mitigação de segurança EV-057 (`EOS_SECURITY_CLOSURE_V2_PLAN.md:159`) — reverter a constraint reabre um risco fechado por decisão sua |
| **Q2 (multiunidade)** | 13 models, `db/tenant.js:24-34`, `prisma/rls/enable_rls.sql:38-41`, todo agregado de dashboard (`servicos.js:423-452`), relatórios (`relatorio.js`), resumo semanal (`agendador.js:113-158`) |
| **Q3 (desligamento)** | `Tecnico.ativo`/`Usuario.ativo`, `identidade.js:27` (bot), `middlewares/auth.js:27` (painel), `tecnicos.js:190` (listagem), `servicos.js:545` (indicadores do gestor), cascades de `RegistroPonto`/`DocumentoTecnico` |
| **Q4 (ponto retroativo)** | `services/ponto.js:65-88`, `routes/tecnicos.js:378-430` (2 endpoints), `services/relatorio.js` (PDF e CSV oficiais), painel de banco de horas |
| **Q5 (aprovação no bot)** | `services/servico.js`, `services/inbound.js:185-246`, `services/estoque.js` (quando a baixa acontece), `services/avaliacao.js:25` (quando a avaliação é agendada), dashboard (`status:'ativo'` filtra tudo) |
| **Q6 (auditoria)** | `services/auditoria.js`, `routes/servicos.js:264-321`, `routes/tecnicos.js:507-541`, `routes/estoque.js:115-142`, e cria demanda de **leitura** de `AuditLog` (hoje inexistente) |
| **Q7 (retenção)** | `services/agendador.js:183-241`, storage privado (`services/storage.js`), RIPD e `docs/legal/*` |
| **Q8 (preço histórico)** | `ServicoMaterial` (schema), `services/estoque.js`, `routes/estoque.js`, relatórios de margem (`servicos.js:459-461` calcula lucro/margem) |
| **Q9 (flags por tenant)** | `Empresa`, `routes/admin.js:151-178` (`/config/empresa`), painel `Configuracao.jsx`, e todo módulo novo das rodadas seguintes |
| **Q10 (Decimal)** | 12 colunas, `services/ponto.js`, todos os `aggregate`/`groupBy`, serialização JSON do painel, ADR-002 |

**Dependência entre decisões**: Q1 → Q3 (se identidade for por empresa, "desligamento" é local; se for global, é revogação de vínculo). Q6 → P13 (auditar efeitos colaterais é o gatilho natural do outbox). Q4 + Q8 → mesma decisão-mãe: **"o que é congelado e o que é recalculado"** — recomendo tratar as duas como uma só decisão.

---

## 12. Grau de confiança

| Item | Confiança | Justificativa |
|---|---|---|
| 1 Identidade / constraints | **Alta** | Constraints lidas no schema, na migration que as criou e nos fluxos consumidores |
| 2 Usuário vs. técnico | **Alta** | Varredura exaustiva de `delete`/`deleteMany` de `Tecnico`; FKs lidas nas migrations |
| 3 Papel/vínculo/cargo | **Alta** | Enumeração completa dos campos; `nivelAcesso` rastreado em todos os seus usos |
| 4 Empresa vs. unidade | **Alta** | Varredura lexical em backend + schema + painel, com inspeção dos falsos positivos |
| 5 Escopo multi-tenant | **Alta** para o inventário de models; **Média-alta** para "todos os call sites filtram" — verifiquei os call sites de rota de tenant dos 7 models, mas não exaustivamente cada leitura de cada serviço |
| 6 Histórico e imutabilidade | **Alta** para o inventário; **Alta** para o achado do ponto (li `resumoMes`, `registrarPonto` e os 2 consumidores) |
| 7 Soft delete / `onDelete` | **Alta** | Cada política confirmada na migration que a criou, não só no schema |
| 8 Eventos de domínio | **Alta** | Varredura por 5 termos distintos, zero resultados; handlers lidos |
| 9 Campos compartilhados | **Média-alta** | Greps de consumidores backend + frontend; possível haver consumidor indireto não capturado por nome literal |
| 10 Retenção | **Alta** | `limparDadosAntigos` lido integralmente; ausências confirmadas por grep |
| 11 Dinheiro | **Alta** | Contagem linha a linha; ADR lido |
| 12 Feature flags | **Média-alta** | Toggles persistidos varridos; ver §13 sobre `Empresa.ativo` |
| 13 Sincronização | **Alta** | Cada ponto de recálculo lido no código |

Grau global: **Alta**. Todas as afirmações sobre o estado atual têm `arquivo:linha`; onde não tive certeza, está declarado na §13.

---

## 13. Pontos não verificados

1. **`Empresa.ativo` (`schema.prisma:24`)** — não rastreei exaustivamente se algum gate de autenticação/autorização lê esse campo. Não apareceu nas leituras de `middlewares/auth.js`, `routes/auth.js` (login) nem `routes/billing.js` (paywall) que fiz, mas **não fiz um grep dedicado** ao campo. Se ninguém lê, é um toggle morto — o que muda a resposta do item 12.
2. **Testes** — não li `chaveiro-bot/src/**/__tests__/**` nem `chaveiro-bot/test/`. Pode haver comportamento travado por teste que contradiga alguma leitura minha do código de produção (especialmente sobre P3 — aprovação no bot — e P4 — ponto retroativo).
3. **Estado real do banco de produção** — não consultado (nem consultável em modo leitura de repositório). Especificamente: se existem `Usuario` duplicados por telefone que impediriam a migration `20260803000000` de aplicar (a própria migration declara isso como pendência, `:9-17`); se existem `ConviteUsuario`/`AuditLog` já órfãos.
4. **`prisma/schema.sqlite.prisma`** — vi que existe e que espelha o schema principal em alguns pontos (`:29`, `:80`, `:149`), mas **não comparei os dois arquivos**. Pode haver drift entre o schema de dev/teste e o de produção.
5. **Consumidores frontend completos** de `Servico.status`, `Usuario.permissoes` e `Tecnico.comissao` — mapeei por grep de literais e nomes de arquivo; não li cada componente. A lista da §3.9 é um piso, não um teto.
6. **`routes/documentos.js` e `routes/whatsapp.js`** — não lidos integralmente. `documentos.js` foi citado a partir de `00_DEPENDENCY_MAP.md:112` (único router autenticado sem `senhaProvisoria`), não por leitura direta minha. `DocumentoTecnico` entra nas minhas conclusões apenas via schema e migration.
7. **Se `AuditLog` é lido por algum consumidor fora do backend** (query direta no Supabase, dashboard externo) — verifiquei apenas o código do repositório.
8. **Comportamento sob `RLS_ENABLED=true`** — a análise do item 5 descreve o caminho app-level (default, `db/tenant.js:64`). Não simulei o caminho RLS; `ADR-004` (`docs/db/03-adrs.md:51-62`) declara que ele nunca foi validado em staging.
9. **Se `Servico` é criado com `status='pendente'` em algum caminho além de `routes/servicos.js:194`** — verifiquei os dois caminhos que conheço (painel e bot); não descartei um terceiro em `services/conversa.js`, que não li integralmente.
10. **Volumetria** — nenhuma afirmação sobre "cresce indefinidamente" foi quantificada contra dados reais; são conclusões sobre **ausência de rotina de expurgo**, não sobre tamanho observado.
