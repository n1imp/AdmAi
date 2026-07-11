# F5 — Planejamento de Performance

> Números, não adjetivos. Catálogo de consultas quentes **com evidência `arquivo:linha`**, SLOs
> propostos (marcados como *placeholder* onde faltam números de negócio), e plano de
> índices/paginação/cache. Referência: `EXPLAIN ANALYZE`, keyset pagination, agregação no banco.

## Catálogo de consultas quentes (evidência real)

| Consulta | Local | Padrão | Risco sob volume | Ação proposta |
|---|---|---|---|---|
| Dashboard — serviços do período | `routes/servicos.js:300-301` | `findMany take: MAX_AGREGACAO` → reduz em JS | **Alto** (carrega tudo p/ somar) | `groupBy`/`aggregate` no banco |
| Perfil do técnico — receita/comissão | `routes/tecnicos.js:299-302` | idem `MAX_AGREGACAO` (4 queries) | **Alto** | agregação no banco + cache |
| Meu painel (funcionário) | `routes/account.js:88-90` | idem `MAX_AGREGACAO` | Médio | `aggregate` no banco |
| Ponto do técnico (período) | `routes/tecnicos.js:255` | `take: MAX_AGREGACAO` | Médio | filtro por range de data já existe; medir |
| Lista de serviços (paginada) | `routes/servicos.js:90` | **OFFSET** (`skip/take`) | Médio (OFFSET degrada) | **keyset** (cursor por `criadoEm,id`) |
| Avaliações da empresa | `routes/servicos.js:244` | `take:100` sem paginação real | Baixo/Médio | paginação + índice `[empresaId, criadoEm]` |
| Lista de usuários | `routes/admin.js:142` | `findMany` **sem take** | Baixo (cresce c/ tenant) | paginação defensiva |
| Movimentações de material | `routes/estoque.js:173` | `take:50` | OK | manter |
| Agendador (cron) | `services/agendador.js:43,186,218` | `findMany` cross-tenant | Info | índice `[status, agendadoPara]` já existe em `Avaliacao` ✓ |

**`MAX_AGREGACAO`** é o "`take:10000`" (lead #7 da estabilização): o app **puxa até 10k linhas e agrega
em JavaScript**. Funciona no porte NANO atual, mas é O(n) em memória/rede e escala mal. É o alvo #1 de F5.

## Consistência forte vs eventual (matriz — CAP/BASE)

| Fluxo | Classe | Justificativa |
|---|---|---|
| Baixa de estoque, comissão, aprovação de serviço | **Forte (ACID)** | dinheiro/inventário — erro é inaceitável (ADR-008) |
| Ponto / banco de horas | **Forte** | prova trabalhista |
| Dashboard/KPIs, ranking | **Eventual (cache)** | tolera segundos de defasagem → cachear |
| Sync avaliações Google, análise IA | **Eventual** | dado externo, assíncrono (BullMQ) |

## SLOs propostos (⚠️ números a fixar com o negócio — F0)

| Métrica | Alvo proposto (placeholder) | Como medir |
|---|---|---|
| p95 leitura de listagem | ≤ 300 ms | teste de carga em staging |
| p95 escrita transacional (serviço/ponto) | ≤ 500 ms | idem |
| Geração de relatório PDF | ≤ 3 s | idem |
| Slow-query (limiar já instrumentado) | 0 acima de 100 ms em caminho quente | `prisma.js` já loga `>100ms` → alerta |

> O `src/db/prisma.js` **já emite evento de query lenta (>100 ms)** — usar como termômetro contínuo em
> prod (F8: alerta). Isso é infraestrutura de medição que já existe; falta só o alvo numérico.

## Plano de índices / paginação / cache

1. **Agregação no banco:** trocar os `MAX_AGREGACAO` por `aggregate`/`groupBy` (soma/contagem no Postgres).
   Ganho: memória O(1) no app, rede mínima. Validar cada um com `EXPLAIN ANALYZE`.
2. **Keyset pagination** nas listagens grandes (serviços, avaliações, auditoria): cursor por
   `(criadoEm, id)` com índice composto — substitui OFFSET. Ganho: O(log n) estável.
3. **Índices:** manter os `[empresaId, …]`; **dropar o redundante** `Servico([criadoEm])` (A6);
   **validar** `[local]/[endereco]/[clienteTelefone]` com EXPLAIN antes de manter.
4. **Cache (Redis já disponível):** KPIs de dashboard e ranking com TTL curto + **invalidação por evento**
   (ServiçoAprovado/PontoBatido). Não cachear dinheiro transacional.
5. **Materialized views / tabelas agregadas:** só se o cache não bastar e sob gatilho de volume (F7).

## O que precisa de infra (não executável aqui — honestidade)
- **`EXPLAIN ANALYZE` sob dados realistas** e **teste de carga** exigem um **staging fiel** (pooler) com
  volume semeado. Sem isso, os itens acima são *plano validado por leitura de código*, não por medição.
  Protocolo pronto para rodar assim que o staging existir (mesmo que destrava o Prisma 7 e a RLS).

**✅ F5:** catálogo com evidência ✓ · matriz de consistência ✓ · plano de índices/paginação/cache ✓.
**⚠️ Pendente:** SLOs numéricos (F0) e EXPLAIN/carga (staging).
