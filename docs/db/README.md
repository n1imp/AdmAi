# Arquitetura de Dados do AdmAi — execução do plano

Esta pasta é a **execução** do roteiro de [`../DB_ARCHITECTURE_PLAN.md`](../DB_ARCHITECTURE_PLAN.md)
(12 seções, papel de Principal Data Architect). Cada arquivo é um entregável de uma fase, **aterrado
no código real** (`schema.prisma`, `src/`, migrations, `prisma/rls/enable_rls.sql`) — com evidência
`arquivo:linha`, sem SQL de criação de tabela e sem suposição não-justificada.

> **Regra de honestidade:** distingo o que foi **produzido com evidência do código** do que **depende
> de você (negócio)** ou de **infra que não posso rodar aqui** (staging/prod, EXPLAIN sob carga, drill
> de DR). O segundo grupo fica com entregável *preparado* (questionário, protocolo, checklist) pronto
> para ser preenchido/rodado — não inventado.

## Status por fase

| Fase | Entregável | Arquivo | Status |
|---|---|---|---|
| F0 — Descoberta | Questionário + respostas **derivadas do código** + lacunas | [`01-discovery.md`](./01-discovery.md) | ✅ derivado · ⚠️ **precisa você** confirmar/numerar RNF |
| F1 — Auditoria do estado atual | Foto do schema real com evidência (smells, drift, índices) | [`01-discovery.md#f1`](./01-discovery.md) + [`04-data-model.md`](./04-data-model.md) | ✅ feito com evidência |
| F2 — Modelagem de domínio | Context map, agregados, invariants, eventos, linguagem ubíqua | [`02-domain-model.md`](./02-domain-model.md) | ✅ feito |
| F3 — Decisões (ADR) | ADR-001..008 em formato Nygard | [`03-adrs.md`](./03-adrs.md) | ✅ feito (proposto) · ⚠️ algumas **aguardam seu aval** |
| F4 — Modelagem de dados | ER (mermaid) + dicionário de dados + achados de normalização | [`04-data-model.md`](./04-data-model.md) | ✅ feito com evidência |
| F5 — Performance | Catálogo de consultas quentes + SLOs propostos + plano índices/cache | [`05-performance.md`](./05-performance.md) | ✅ catálogo com evidência · ⚠️ **EXPLAIN/carga** exigem staging |
| F6 — Segurança & LGPD | STRIDE + RBAC/RLS (aterrado no `enable_rls.sql`) + mapa LGPD + RIPD | [`06-security-lgpd.md`](./06-security-lgpd.md) | ✅ feito · ⚠️ **DPO/jurídico** e ligar RLS = ação sua |
| F7 — Escalabilidade | Gatilhos de partição/arquivamento + i18n/moeda | [`07-scalability.md`](./07-scalability.md) | ✅ feito (gatilhos propostos) |
| F8 — Operacional | Runbook backup/DR/PITR + política de migração + rollback | [`08-operations.md`](./08-operations.md) | ✅ política feita · ⚠️ **drill de DR** = ação sua |
| F9 — Documentação | Este índice + consolidação | este arquivo | ✅ feito |
| F10 — Aprovação | Checklist de saída (§12 do plano) | [`../DB_ARCHITECTURE_PLAN.md#12`](../DB_ARCHITECTURE_PLAN.md) | ⬜ a rodar quando F0–F9 fecharem |

## Documentos relacionados que já existiam (não duplicados, referenciados)

- [`../decisions.md`](../decisions.md) — log informal de decisões (RBAC, ponto, aprovação) + **pendência LGPD já registrada** (retenção/transparência de selfie+geo, art. 15/16). É o precursor informal dos ADRs desta pasta.
- [`../legal/POLITICA_DE_PRIVACIDADE.md`](../legal/POLITICA_DE_PRIVACIDADE.md), [`../legal/TERMOS_DE_USO.md`](../legal/TERMOS_DE_USO.md) — base legal existente (insumo de F6).
- [`../RUNBOOK.md`](../RUNBOOK.md), [`../CI_CD.md`](../CI_CD.md), [`../DEPLOYMENT.md`](../DEPLOYMENT.md) — operação atual (insumo de F8).
- [`../AUDIT.md`](../AUDIT.md), [`../BUGLIST.md`](../BUGLIST.md) — achados da estabilização (B7/B8 são as lições que ancoram F1/F8).

## O que precisa de você (bloqueios reais, não resolvíveis autonomamente)

1. **Números de negócio (F0/F5/F7):** volume atual e projeção 12/24/36 meses, SLA/uptime alvo, RPO/RTO. Sem eles, capacidade e SLO ficam como *placeholder*.
2. **LGPD (F6):** aprovar o prazo de retenção `N` de selfie/geo e o texto jurídico (já pendente em `decisions.md`); aval do DPO/jurídico.
3. **Infra (F5/F6/F8):** um **Supabase de staging fiel** (pooler pgbouncer) para rodar EXPLAIN sob volume, validar RLS ligada + role dedicado, e o drill de restauração. É o mesmo staging que destrava a validação do Prisma 7 (`chore/prisma-7`).
