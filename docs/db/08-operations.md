# F8 — Planejamento Operacional (Dia-2 / DBRE)

> Operabilidade, recuperabilidade e evolução segura em produção — a área onde o AdmAi já sentiu dor
> (drift B7, migração Prisma 7 não validada). Complementa [`../RUNBOOK.md`](../RUNBOOK.md),
> [`../CI_CD.md`](../CI_CD.md), [`../DEPLOYMENT.md`](../DEPLOYMENT.md) no recorte **banco de dados**.

## Backup / DR / PITR

| Item | Situação | Ação |
|---|---|---|
| Backup | gerenciado pelo Supabase | ⚠️ **confirmar cadência** e testar restauração (backup não-restaurado ≠ backup) |
| PITR | recurso do Supabase (depende do plano) | ⚠️ confirmar janela de PITR (rede contra "DELETE sem WHERE") |
| RPO/RTO | não definidos | ⚠️ **F0**: fixar alvo, depois validar com **drill** de restauração real |
| DR drill | nunca executado | ⚠️ agendar drill: restaurar em ambiente isolado e medir tempo ≤ RTO |

> **Não executável aqui:** o drill de restauração e a confirmação de PITR exigem acesso ao projeto
> Supabase e uma janela combinada. Entregável = **protocolo de drill** pronto para rodar.

## Política de migração (Prisma Migrate)

- **Forward-only** (Prisma não gera `down` automático).
- **Drift-check no CI:** `migrate diff --exit-code` já adicionado (lição **B7** — nunca schema sem
  migration). Manter como gate obrigatório.
- **Expand/Contract** para mudanças sem downtime — o padrão para os itens de F4:
  1. **Expand:** adiciona coluna nova nullable (ex.: `valor_decimal`, `currency`) — não quebra nada.
  2. **Backfill:** popula + **reconcilia** (para dinheiro, conferir soma antiga vs nova).
  3. **Contract:** troca leitura/escrita para a nova, torna obrigatória, dropa a antiga em release posterior.
- **Migração destrutiva** só precedida de **backup + plano de reversão escrito**.

### Fila de migrações evolutivas (derivada de F4, ordenada por risco/valor)

| Ordem | Mudança | Padrão | ADR |
|---|---|---|---|
| 1 | Dinheiro `Float`→`Decimal` (17 colunas) | Expand/Contract + reconciliação | ADR-002 |
| 2 | `CHECK` de domínio em `status`/`tipo` + `quantidade>=0` | aditiva | F4 |
| 3 | Dropar índice redundante `Servico([criadoEm])` | aditiva (drop seguro) | A6 |
| 4 | Deprecar colunas legadas (`twoFactorSecret`, e a redundância `admin` vs `papel`) | Contract | A8/F4 |
| 5 | QR base64 → efêmero/storage | Expand/Contract | ADR-006 |

## Rollback

- Estratégia corporativa = **forward-fix** (nova migração corretiva), pois não há `down` automático.
- **Rede de segurança:** backup pré-migração + PITR. Toda migração destrutiva documenta o passo de reversão.

## Observabilidade (banco)

- **Já existe:** `src/db/prisma.js` emite evento de **query lenta (>100 ms)**; `/metrics` (Prometheus).
- **Adicionar:** dashboards + alertas para conexões no pooler, locks, cache hit ratio, replicação,
  tamanho/bloat por tabela, top slow-queries. **Métrica por tenant** (achar noisy neighbor — F7).

## Manutenção

- `VACUUM`/`ANALYZE` (autovacuum tunado para tabelas quentes `Servico`/`BatidaPonto`/`AuditLog`),
  `REINDEX` periódico, revisão de bloat. Janelas de manutenção a combinar (F0).

## Ambiente de staging fiel (destrava 3 pendências de uma vez)

O maior gap operacional é a **ausência de staging que replique o pooler pgbouncer transaction mode** de
prod. Ele é pré-requisito de:
- **ADR-005 / Prisma 7** — validar prepared statements no pooler (branch `chore/prisma-7`).
- **ADR-004 / RLS** — validar `RLS_ENABLED=true` + role dedicado + jobs cross-tenant.
- **F5** — `EXPLAIN ANALYZE` e teste de carga sob volume realista.

Montar esse staging (um projeto Supabase dedicado, **não** o AdmAi de prod) é a **próxima ação de maior
alavancagem** desta trilha. Requer a senha do banco via `chaveiro-bot/.env.staging` (arquivo, `--env-file`,
nunca no chat).

**✅ F8:** política de migração (Expand/Contract + drift-check) ✓ · fila evolutiva ordenada ✓ · rollback ✓ ·
plano de observabilidade ✓. **⚠️ Pendente:** confirmar backup/PITR, drill de DR, montar staging fiel (você).
