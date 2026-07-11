# AdmAi — Plano de Evolução de Arquitetura (escala, resiliência, HA)

> **Escopo:** unir (a) o planejamento de banco já existente em `docs/db/` + `DB_ARCHITECTURE_PLAN.md`,
> (b) o estado real da implementação, (c) os 10 requisitos de escala solicitados, e (d) as observações
> de arquitetura levantadas. **É planejamento — nada é implementado aqui.** Cada decisão é aterrada em
> evidência do código/infra ou marcada como premissa a validar.

---

## 1. Análise minuciosa do estado atual (com evidência)

| Camada | Estado real | Evidência |
|---|---|---|
| Backend | Node 20 ESM, Express 4, **1 réplica**, região **US West** (Railway), em **trial** | Railway dashboard: "1 Replica · US West · 24 days or $4.83 left" |
| Banco | PostgreSQL 16 (Supabase, **sa-east-1**), Prisma 7 (driver adapter + `pg`), pooler pgbouncer validado | Deploy #60 live; validação em `admai-staging` |
| Multi-tenant | Shared-schema (`empresaId`) + extensão `prismaParaEmpresa` + **RLS pronta mas desligada** | `src/db/tenant.js`, `prisma/rls/enable_rls.sql`, `RLS_ENABLED` default off |
| Redis | `ioredis` — usado p/ **rate-limit** (RedisStore) + **filas BullMQ**; **não** como cache de dados | `src/app.js:24`, `src/queues/*`, `src/workers/*` |
| Assíncrono | **BullMQ**: e-mail, mensagens, inbound-worker, agendador (cron) | `src/queues/email.js`, `mensagens.js`, `workers/*`, `services/agendador.js` |
| Frontend | React 18/Vite em **Cloudflare Pages** (CDN global) | `deploy.yml` |
| Uploads | **Volume local** `/app/uploads` (selfies/fotos) | `Dockerfile` (`mkdir /app/uploads`), `.gitignore` (`uploads-ponto/`) |
| Observabilidade | `/metrics` (Prometheus/prom-client), logs `pino`, slow-query >100ms, Sentry | `src/app.js`, `src/db/prisma.js` |
| Rate limiting | `express-rate-limit` + `rate-limit-redis`, por IP, distribuído | `src/app.js:89-121` |
| Dados sensíveis | dinheiro em **`Float`**, geo+selfie (LGPD), PKs **`Int`** | `schema.prisma` (F1/F4) |

### Veredito dos 10 requisitos (placar: ✅ 3 · 🟡 5 · ❌ 2)

| # | Requisito | Estado | Lacuna principal |
|---|---|---|---|
| 1 | Load Balancer | ❌ | 1 réplica; sem distribuição |
| 2 | Escala horizontal | 🟡 | **bloqueado por uploads em volume local** + cron singleton |
| 3 | Cache (Redis) | 🟡 | Redis só p/ rate-limit/filas; **sem cache de dados** |
| 4 | CDN | ✅ | Cloudflare Pages (estáticos) |
| 5 | Assíncrono | ✅ | BullMQ (não Kafka/SQS, mas cumpre) |
| 6 | Banco escalável | 🟡 | pooling ✅; **sem réplica de leitura / sharding** |
| 7 | Rate limiting | ✅ | ok, distribuído |
| 8 | Payloads leves | 🟡 | `take:10000`, paginação OFFSET |
| 9 | Observabilidade | 🟡 | sem **tracing**; Sentry DSN vazio em prod (lead #8) |
| 10 | Alta disponibilidade | ❌ | 1 réplica, single region, trial |

---

## 2. Premissas questionadas e inconsistências (antes de qualquer solução)

1. **"O projeto já atende aos 10 requisitos."** — Refutado com evidência: atende 3, parcial 5, falha 2 (tabela acima). Planejar sobre a premissa errada geraria retrabalho.
2. **Inconsistência crítica de região:** backend em **US West** e banco em **sa-east-1** — **toda query cruza EUA↔Brasil** (~150–200 ms RTT). Isso sabota os ganhos de cache/CDN e infla a latência de tudo. É o **maior gargalo atual** e o mais barato de corrigir. *Conflito direto com os requisitos de latência (#3, #8).*
3. **"Escala horizontal é ligar réplicas."** — Falso: **uploads em volume local** (`/app/uploads`) tornam o serviço **stateful**; com N réplicas, uma selfie salva na réplica A não é servida pela B. **Bloqueia #1 e #2.** Precisa de object storage ANTES.
4. **Cron/agendador com N réplicas:** `services/agendador.js` roda `node-cron` no processo; com N réplicas, o cron dispara **N vezes** (envio duplicado de avaliações). Precisa de **lock distribuído** ou **separar worker do web**.
5. **"Precisamos de Kafka/RabbitMQ/SQS" (req. #5).** — **Over-engineering** no volume atual (instância NANO). BullMQ/Redis já entrega filas com retry/idempotência. Migrar p/ Kafka agora é custo sem ganho (YAGNI). Gatilho futuro, não fase inicial.
6. **"Sharding" (req. #6).** — Prematuro e **bloqueado pela decisão de chave** (`Int` autoincrement, ADR-001). Sharding com PK sequencial em shared-schema é caríssimo. Réplica de leitura + particionamento por gatilho cobrem o horizonte; sharding é gatilho distante.
7. **HA num trial (req. #10).** — Contradição: exigir alta disponibilidade enquanto prod roda em **trial que expira** e em **1 réplica single-region**. HA real exige billing + multi-AZ primeiro.
8. **Dinheiro em `Float` (DB plan F4)** — dívida financeira que **não escala com o negócio** (erro de arredondamento em relatórios/comissão). Ortogonal à infra, mas pré-requisito de qualquer analytics financeiro.
9. **Réplica de leitura ≠ plug-and-play:** Prisma não roteia read/write automaticamente de forma robusta; exige um client separado p/ réplica + disciplina no código. Custo real de refatoração.

---

## 3. Decisões arquiteturais — comparação de abordagens (trade-offs)

### D1 — Onde rodar o backend (região + plataforma)
| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Railway pago em sa-east-1** (co-localizar com o DB) | mata latência cross-region; mínimo esforço; mantém stack | lock-in Railway; LB/replicas limitados | ✅ **Recomendado (curto prazo)** |
| Migrar p/ AWS/GCP (ECS/Cloud Run + ALB) | LB nativo, multi-AZ, autoscaling | esforço alto, IaC, ops | Gatilho (quando Railway limitar) |
| Serverless (Lambda/Cloud Run) | escala a zero, HA gerenciado | cold start, WebSocket/bot inviável, refactor | Rejeitado (bot/estado) |
**Critério:** latência p95 e custo de migração. Co-localizar em sa-east-1 é o maior ganho/menor esforço.

### D2 — Cache de dados
| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Redis cache-aside** (KPIs/consultas caras) + invalidação por evento | reusa o Redis existente; controle fino; barato | precisa disciplina de invalidação | ✅ **Recomendado** |
| Materialized views (Postgres) | consistência no banco; sem app-cache | refresh custoso; carga no DB | Complemento (dashboards pesados) |
| Réplica de leitura só | tira leitura do primário | não reduz nº de queries; custo | Fase posterior (D5) |
**Critério:** reduzir nº de queries caras. Cache-aside primeiro; materialized view/réplica se o cache não bastar.

### D3 — Object storage (uploads)
| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Supabase Storage** | mesma stack/credencial; URLs assinadas; RLS | acoplado ao Supabase | ✅ **Recomendado** |
| S3 / Cloudflare R2 | barato, CDN nativo (R2) | +1 provedor/credencial | Alternativa forte (R2 se quiser CDN de mídia) |
**Critério:** destravar statelessness com menor atrito. Supabase Storage por afinidade; R2 se mídia precisar de CDN.

### D4 — Filas
| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Manter BullMQ/Redis** | já funciona; retry/idempotência; simples | acoplado a Redis; não é streaming | ✅ **Recomendado** |
| Kafka/RabbitMQ/SQS | throughput/streaming, durabilidade | operação/custo altos; over-engineering agora | Gatilho (alto volume/event-sourcing) |
**Critério:** volume atual. BullMQ cobre; migrar só sob gatilho de escala.

### D5 — Banco escalável
| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Pooler (já) + réplica de leitura + índices/keyset** | tira leitura pesada do primário; ganho real | roteamento read/write no app | ✅ **Recomendado (nesta ordem)** |
| Particionamento (Servico/BatidaPonto/AuditLog por tempo) | tabelas quentes sob controle | complexidade | Gatilho numérico (F7 do DB plan) |
| Sharding | escala "infinita" | caríssimo; bloqueado por Int PK | Rejeitado agora |
**Critério:** custo vs ganho. Réplica + índices já cobrem o médio prazo; partição/sharding por gatilho.

---

## 4. Plano em fases (ordem prioriza estabilidade e menor retrabalho)

> Princípio de ordenação: **fundação → destravar statelessness → escalar → resiliência → HA**. Não se
> escala o que é instável nem se replica o que é stateful. Itens do `DB_ARCHITECTURE_PLAN.md` entram
> onde são pré-requisito.

### Fase 0 — Fundação e correção de latência *(bloqueia todo o resto)*
- **Objetivo:** eliminar o risco de disponibilidade (trial) e o gargalo de latência cross-region; garantir observabilidade mínima real.
- **Justificativa técnica:** escalar sobre uma base em trial + cross-region amplifica custo e latência de cada fase seguinte. É o maior ganho/menor esforço.
- **Componentes/arquivos:** billing Railway (infra); **realocar serviço p/ sa-east-1** (config Railway); `SENTRY_DSN` em prod (env); confirmar scrape do `/metrics`.
- **Dependências:** nenhuma (raiz).
- **Riscos & mitigação:** realocar região implica breve downtime → fazer em janela; validar `/health db=ok` pós-move. Trial→pago exige cartão (ação do dono).
- **Critérios de conclusão:** prod em plano pago; backend na mesma região do DB; p95 de latência DB medível; Sentry recebendo eventos.
- **Impacto:** ⬆️ desempenho (latência), ⬆️ disponibilidade; segurança/manutenibilidade neutras.

### Fase 1 — Tornar o app *stateless* (destrava LB e escala horizontal)
- **Objetivo:** remover todo estado local do processo web.
- **Justificativa técnica:** LB/replicas só são corretos se qualquer réplica atende qualquer request. Hoje uploads locais quebram isso.
- **Componentes/arquivos:** **object storage** para selfies/fotos (ADR-006) — tocar `routes/tecnicos.js` (upload/retrieval de selfie), `services/*` de mídia, `Dockerfile` (remover dependência do volume); **separar web × worker** (novo serviço/processo p/ BullMQ + agendador) — `services/agendador.js`, `workers/*`; **lock distribuído** no cron (Redis) enquanto não separado.
- **Dependências:** F0 (região, p/ storage co-localizado).
- **Riscos & mitigação:** migração de selfies existentes (backfill + fallback de leitura durante transição, Expand/Contract); cron duplicado se worker não isolado → lock Redis antes de subir N réplicas.
- **Critérios de conclusão:** nenhuma escrita em disco local no caminho de request; web roda com N réplicas sem duplicar jobs/cron; selfies servidas via URL assinada.
- **Impacto:** ⬆️ escalabilidade (destrava #1/#2), ⬆️ manutenibilidade (web/worker desacoplados), ⬆️ segurança (URL assinada + retenção LGPD).

### Fase 2 — Load balancer + escala horizontal
- **Objetivo:** rodar N réplicas do web atrás de LB, sem ponto único.
- **Justificativa técnica:** com o app stateless (F1), replicar é seguro e elimina SPOF do web.
- **Componentes/arquivos:** config Railway (replicas + LB nativo) ou migração p/ ECS/Cloud Run+ALB (D1); `/health` já existe como readiness.
- **Dependências:** F1 (statelessness), F0 (billing/HA).
- **Riscos & mitigação:** sessão/rate-limit já em Redis (ok); sticky não necessário. WhatsApp (`ConexaoBot` singleton) só quando religado → manter num único worker.
- **Critérios de conclusão:** ≥2 réplicas ativas; derrubar 1 réplica não causa indisponibilidade; rate-limit consistente entre réplicas.
- **Impacto:** ⬆️ escalabilidade, ⬆️ disponibilidade (atende #1/#2/#10 parcial).

### Fase 3 — Cache de dados + payloads leves *(reduz carga antes de escalar o DB)*
- **Objetivo:** reduzir nº e peso das queries caras.
- **Justificativa técnica:** mais réplicas web sem reduzir carga por request só empurra o gargalo pro DB. Cache + fix de query é pré-requisito.
- **Componentes/arquivos:** **cache-aside Redis** p/ KPIs/dashboards com invalidação por evento (D2, F5); **matar `take:10000`** → `groupBy`/`aggregate` no banco (`routes/servicos.js`, `tecnicos.js`, `account.js`); **paginação keyset** (`routes/servicos.js:90` e listas); `select` enxuto consistente.
- **Dependências:** F0 (Redis co-localizado). Independe de F2 (paraleliza).
- **Riscos & mitigação:** cache stale → TTL curto + invalidação por evento de domínio; mudança de agregação → cobrir com testes de valor.
- **Critérios de conclusão:** zero `take:10000`; p95 de dashboard dentro do SLO; cache hit medível; payloads reduzidos.
- **Impacto:** ⬆️⬆️ desempenho, ⬆️ escalabilidade (atende #3/#8), ⬆️ manutenibilidade.

### Fase 4 — Banco escalável (leitura) + qualidade de dados
- **Objetivo:** separar leitura pesada do primário e sanar dívidas que travam analytics.
- **Justificativa técnica:** relatórios/dashboards competem com escrita; réplica de leitura isola. Decimal e RLS são pré-requisitos de correção/segurança.
- **Componentes/arquivos:** **réplica de leitura** Supabase + **client Prisma de leitura** roteado no app (D5); **índices validados por EXPLAIN** (F5); **`Float`→`Decimal`** via Expand/Contract (F4/ADR-002); **ligar RLS** em staging→prod (F6/ADR-004); retenção LGPD selfie/geo (F6).
- **Dependências:** F0 (billing p/ réplica), F3 (cache reduz necessidade), decisão de chave (ADR-001) antes de qualquer sharding.
- **Riscos & mitigação:** replication lag → rotear só leitura tolerante a defasagem (não dinheiro); backfill de Decimal com reconciliação; RLS fail-closed → cobrir jobs cross-tenant antes (documentado no `enable_rls.sql`).
- **Critérios de conclusão:** leitura pesada na réplica; dinheiro em Decimal reconciliado; RLS ativa e IDOR verde; retenção com job de expurgo.
- **Impacto:** ⬆️ escalabilidade (atende #6), ⬆️⬆️ segurança (RLS+LGPD), ⬆️ correção financeira.

### Fase 5 — Observabilidade completa + tolerância a falhas
- **Objetivo:** enxergar e sobreviver a falhas de dependências.
- **Justificativa técnica:** operar N réplicas + réplica de DB + filas sem tracing é cego; integrações externas sem timeout/retry propagam falha.
- **Componentes/arquivos:** **OpenTelemetry** (traces API→DB→Redis→fila); dashboards/alertas por **SLO e por tenant** (métricas já existem); **timeouts/retries/circuit breaker + idempotência** nas integrações (Stripe, Google, Resend, WhatsApp) — `services/*`, webhooks.
- **Dependências:** F0 (Sentry), idealmente após F2 (há o que observar).
- **Riscos & mitigação:** overhead de tracing → amostragem; retries sem idempotência → chave de idempotência nos webhooks.
- **Critérios de conclusão:** trace ponta a ponta; alertas por SLO ativos; falha de dependência externa não derruba a API.
- **Impacto:** ⬆️ manutenibilidade/operabilidade (atende #9), ⬆️ tolerância a falhas.

### Fase 6 — Alta disponibilidade (multi-AZ) e DR testado
- **Objetivo:** sobreviver à queda de uma zona; recuperação garantida.
- **Justificativa técnica:** fecha #10 de verdade — só faz sentido após base estável (F0–F5).
- **Componentes/arquivos:** réplicas em ≥2 zonas; DB em plano com HA/failover; **backup + PITR testado com drill** (F8); runbooks.
- **Dependências:** F0–F2 (billing, statelessness, LB), F4 (réplica/PITR).
- **Riscos & mitigação:** custo → dimensionar por SLA acordado; failover não testado ≠ HA → drill obrigatório.
- **Critérios de conclusão:** queda de 1 zona sem indisponibilidade; RTO/RPO medidos ≤ alvo; drill de DR dentro do RTO.
- **Impacto:** ⬆️⬆️ disponibilidade (atende #10). Multi-região = gatilho futuro (exige decisão de chave UUID + réplicas geo).

---

## 5. Melhorias/refatorações não solicitadas (mas recomendadas)

- **Bounded contexts (DDD, F2 do DB plan):** separar web/worker (F1) é o 1º passo natural p/ isolar contextos (Engajamento/WhatsApp pode virar serviço próprio no futuro sem big-bang).
- **`Tecnico` acumula 3 responsabilidades** (RH + identidade WhatsApp + conta) — extrair `DadosTrabalhistas` (ADR-007) quando RH crescer.
- **Ledger append-only como fonte da verdade do estoque** (ADR-008) — remove corrida de baixa concorrente; casa com escala de escrita.
- **`qrCode` base64 no banco** → efêmero/storage (ADR-006) — tira blob do backup/replicação.
- **Padronizar "AdmAi"** (resíduo "ChaveiroBot") — linguagem ubíqua.
- **Decisão de chave `Int`→`UUIDv7/ULID`** (ADR-001) — pré-requisito de qualquer multi-região/sharding; decidir o gatilho agora.

## 6. Gargalos futuros previstos

1. **DB primário** vira o teto assim que o web escala (por isso F3 antes de F2 concluir carga real).
2. **Tabelas quentes** (`Servico`/`BatidaPonto`/`AuditLog`) → particionamento por gatilho (F7 DB plan).
3. **Redis único** vira SPOF de cache+fila+rate-limit → avaliar Redis gerenciado com HA quando crítico.
4. **Cron/worker único** → se o volume de filas crescer, escalar workers (BullMQ suporta) com concorrência controlada.
5. **Multi-região** (se houver expansão geográfica) → bloqueado por Int PK; caro se adiado.

## 7. Revisão crítica (como arquiteto sênior) — o que reordenei e por quê

- **Region colocation (F0) veio ANTES de cache (F3):** não adianta cachear se cada miss ainda paga 200 ms cross-region; corrigir a região dá ganho imediato a *todas* as fases. *(inconsistência que o pedido original não priorizava.)*
- **Statelessness (F1) ANTES de LB (F2):** ligar réplicas com uploads locais criaria bug de mídia intermitente — SPOF disfarçado. Object storage é pré-condição, não item paralelo.
- **Cache (F3) ANTES de réplica de leitura (F4):** cache reduz o *número* de queries; réplica só redistribui. Ordem reduz custo (talvez a réplica nem seja necessária no curto prazo).
- **Kafka/sharding removidos das fases iniciais:** viravam retrabalho e complexidade sem ganho no volume atual — rebaixados a gatilhos explícitos (evita over-engineering).
- **SPOFs eliminados na ordem:** trial (F0) → web single-replica (F2) → DB leitura (F4) → zona única (F6). Cada fase remove um ponto único sem depender do próximo.
- **Modularidade/crescimento:** a separação web/worker (F1) + bounded contexts deixam o sistema pronto p/ extrair serviços por contexto sob demanda, sem reescrita.

## 8. Roadmap consolidado (ordem final recomendada)

```
F0  Fundação: billing + região (sa-east-1) + Sentry/metrics      ← destrava tudo, maior ROI
F1  Stateless: object storage + separar web/worker + lock cron   ← pré-req de escala
F2  LB + réplicas web                                            ← #1/#2
F3  Cache-aside + matar take:10000 + keyset (paraleliza c/ F2)   ← #3/#8, alivia o DB
F4  Réplica de leitura + Decimal + RLS + retenção LGPD           ← #6 + segurança/correção
F5  OpenTelemetry + alertas SLO + circuit breakers               ← #9 + tolerância a falhas
F6  HA multi-AZ + PITR/DR testado                                ← #10
--- gatilhos futuros: particionamento, UUIDv7, Kafka/SQS, multi-região ---
```

**Critério de aprovação global:** cada fase fecha só com evidência (métrica/SLO/teste), sem "está ok"
sem prova — mesma filosofia do projeto. Nada é implementado até este plano ser aprovado.
