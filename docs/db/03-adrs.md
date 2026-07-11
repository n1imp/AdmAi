# F3 — Architecture Decision Records (ADRs)

> Formato **Nygard** (*Status · Context · Decision · Consequences*). Um arquivo por decisão é a
> convenção ideal; consolidados aqui por concisão — podem ser separados em `docs/db/adr/NNN-*.md`.
> Precursor informal: [`../decisions.md`](../decisions.md) (RBAC/ponto/aprovação). Estes ADRs cobrem
> as decisões de **arquitetura de dados** ainda não registradas. **Status:** `Proposto` = aguarda seu
> aval; `Aceito` = recomendação forte já suportada por evidência; `Em validação` = depende de staging.

---

## ADR-001 — Chaves primárias: manter `Int autoincrement` agora, migrar a `UUIDv7/ULID` no gatilho de escala
**Status:** Proposto
**Context:** Todos os 25 modelos usam `Int @default(autoincrement())`. Prós: compacto, legível, índice
pequeno. Contras: **enumerável** (superfície de IDOR — hoje mitigada por `empresaId` + `prismaParaEmpresa`),
e hostil a sharding/multi-região/merge de bases (colisão de sequência). UUIDv4 fragmenta o índice
(aleatório); **UUIDv7/ULID** é ordenável no tempo (bom para B-tree) e globalmente único.
**Decision:** **Manter `Int` enquanto for shared-schema single-region** (troca cara e sem ganho hoje).
**Gatilho de migração** para UUIDv7/ULID: decisão de sharding/multi-região **ou** exposição de IDs a
terceiros sem escopo. Registrar o gatilho em F7.
**Consequences:** + Zero custo agora. − Dívida latente: migração de PK é cara (FKs, dados) → por isso o
gatilho é explícito e monitorado, não deixado ao acaso.

---

## ADR-002 — Valores monetários em `Decimal`, nunca `Float`
**Status:** Aceito (recomendação forte)
**Context:** 17 colunas de dinheiro são `Float` (IEEE-754): `Servico.valorCobrado/valorLiquido/comissaoGerada`,
`Tecnico.comissao/salarioBase/valorHora/horaExtraPercentual`, `Material.precoUnit/precoVenda`,
`Pagamento.valor`, etc. Float acumula **erro de arredondamento** em soma — inaceitável para comissão/folha
(risco financeiro e trabalhista). Referência: sempre usar tipo decimal exato para moeda.
**Decision:** Migrar para **`Decimal @db.Decimal(12,2)`** (Prisma `Decimal`), tratando dinheiro como VO
(valor+moeda, ver ADR-003/i18n). Migração via **Expand/Contract** (F8): coluna nova → backfill validado
(reconciliação) → troca de leitura/escrita → drop da antiga.
**Consequences:** + Correção financeira. − Toca cálculo (`services/ponto.js`, agregações), precisa
backfill cuidadoso e reteste dos valores; `Decimal` do Prisma não é `number` JS (ajuste de serialização).

---

## ADR-003 — Multi-tenancy: shared database / shared schema com discriminador `empresaId`
**Status:** Aceito (retroativo — documenta o existente)
**Context:** Isolamento por coluna `empresaId` + extensão Prisma `prismaParaEmpresa` (`src/db/tenant.js`)
que injeta o filtro e reescreve `findUnique→findFirst`. Alternativas: schema-por-tenant e db-por-tenant
(mais isolamento, muito mais custo operacional no porte NANO atual).
**Decision:** Manter shared-schema; reforçar com **RLS** no banco (ADR-004) como 2ª camada.
**Reavaliar** db/schema dedicado **por plano enterprise** (cliente que exija isolamento físico/SLA).
**Consequences:** + Densidade/custo ótimos, operação simples. − Blast-radius de bug de isolamento é alto
→ mitigado por RLS + testes IDOR (F6). "Noisy neighbor" possível → observabilidade por tenant (F8).

---

## ADR-004 — Ligar Row Level Security (RLS) em produção
**Status:** Proposto (Em validação — precisa staging + role dedicado)
**Context:** `prisma/rls/enable_rls.sql` já existe, é **fail-closed**, usa `FORCE ROW LEVEL SECURITY`,
cobre 7 tabelas com `empresaId` direto + 4 por relação (`BatidaPonto`, `MovimentacaoEstoque`,
`ServicoMaterial`, `Notificacao`), e está **fora das migrations de propósito** (aplicar cego pode bricar
prod). Exige role `NOBYPASSRLS` dedicado e tratamento dos **jobs cross-tenant** (`services/agendador.js`
usa `prisma` base, sem GUC).
**Decision:** Ligar RLS em prod como defesa em profundidade, **após**: (1) `RLS_ENABLED=true` validado em
staging com o painel inteiro funcionando; (2) role `app_rw` sem BYPASSRLS no `DATABASE_URL` de runtime;
(3) jobs cross-tenant em conexão privilegiada ou setando o GUC por empresa.
**Consequences:** + Vazamento cross-tenant vira impossível no banco, não só no ORM. − Se um job não for
coberto, ele "some" (fail-closed) → por isso a ordem do checklist é obrigatória. Roteiro: `TUTORIAL_RLS_DAST.md`.

---

## ADR-005 — Camada de conexão Prisma 7: driver adapter (`@prisma/adapter-pg`) + pooler pgbouncer
**Status:** ✅ Validado em staging (2026-07-09) — branch `chore/prisma-7` pronto para merge/deploy
**Context:** Prisma 7 tira a conexão do schema; runtime usa `PrismaPg({connectionString})` (`src/db/prisma.js`)
e migrations usam `datasource.url` no `prisma.config.ts` (conexão direta 5432). Runtime pode usar o
**pooler pgbouncer transaction mode (6543)**. O `pg` usa prepared statements **não-nomeados** (compatíveis
com transaction pooling) — mas isso **não foi validado contra o pooler real** (Postgres local é session mode).
**Decision:** Não mergear/deployar até validar em **Supabase de staging** com o pooler: `migrate deploy`
(via direta) + `test:integration` (IDOR/auth) + smoke do painel apontando ao pooler.
**Consequences:** + Engine Rust sai do caminho crítico, conexão moderna. − Risco de erro só-em-prod se
prepared statements quebrarem no pooler → mitigado pela validação em staging (mesmo staging do ADR-004/F8).

---

## ADR-006 — Arquivos (selfie/foto/QR) em object storage, não como blob no banco
**Status:** Proposto
**Context:** `selfieUrl`/`fotoEvidencia`/`imagemUrl` já são referências (bom), mas `ConexaoBot.qrCode`
guarda **base64 no banco**. Blobs incham backup/replicação e custam I/O; QR é efêmero (pareamento).
**Decision:** QR vira efêmero (Redis/memória) ou storage; padronizar **todas** as mídias em object
storage (Supabase Storage/S3) com o banco guardando só a chave + metadados. Aplicar TTL de retenção às
selfies (cruza com F6/LGPD).
**Consequences:** + Backup/replicação enxutos, storage barato para mídia. − Precisa de política de acesso
assinado (URL temporária) e do job de expurgo (retenção).

---

## ADR-007 — Refino do agregado `Tecnico` (extrair dados trabalhistas)
**Status:** Proposto (baixa prioridade)
**Context:** `Tecnico` acumula RH (`cpf`, `salarioBase`, `modalidade`, `jornada*`, `dataAdmissao`),
identidade WhatsApp (`telefone`/LID) e vínculo de conta (`usuarioId`) — 3 responsabilidades (viola coesão
de contexto, cf. F2).
**Decision:** Avaliar extrair um bloco `DadosTrabalhistas` (1:1 com `Tecnico`) quando o contexto RH
crescer (folha, férias, eSocial). Não fazer agora sem demanda — evita over-engineering (YAGNI).
**Consequences:** + Coesão futura do contexto RH. − Custo de migração; só compensa com roadmap de RH real.

---

## ADR-008 — Consistência forte no núcleo transacional; ledger como fonte da verdade do estoque
**Status:** Proposto
**Context:** Estoque tem `Material.quantidadeAtual` (projeção mutável) + `MovimentacaoEstoque` (ledger com
`saldoApos`). Baixa concorrente pode causar *lost update* (A10). Núcleo (dinheiro/estoque) precisa de ACID
forte; bordas (KPIs, sync Google) toleram eventual (BASE/CAP).
**Decision:** Toda mutação de estoque roda em **transação** com o incremento derivado do ledger
(optimistic locking ou `SELECT … FOR UPDATE`); `quantidadeAtual` é projeção reconstruível do ledger.
Classificar por fluxo o que é consistência forte vs eventual (matriz em F5).
**Consequences:** + Sem estoque negativo por corrida; auditabilidade total (ledger). − Transações mais
longas no caminho de escrita (aceitável no volume atual).
