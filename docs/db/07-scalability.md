# F7 — Planejamento de Escalabilidade

> Crescer de MVP (instância NANO) a milhões de registros/tenants **sem reestruturação grande**,
> decidindo agora só o que é caro de mudar depois. Regra: complexidade (partição/shard) entra por
> **gatilho numérico**, não por antecipação (evita otimização prematura).

## Tabelas quentes e gatilhos de particionamento

Candidatas (crescem sem teto, cf. F1/F5):

| Tabela | Eixo de partição proposto | Gatilho para introduzir |
|---|---|---|
| `Servico` | range por `criadoEm` (mês/ano) e/ou list por `empresaId` | > ~50M linhas **ou** p95 de agregação/listagem acima do SLO |
| `BatidaPonto` | range por `criadoEm` | idem (time-series; ainda expurga por retenção LGPD → volume controlado) |
| `AuditLog` | range por `criadoEm` | idem + política de retenção |
| `MovimentacaoEstoque` | list por `empresaId` | idem |
| `AvaliacaoGoogle` | list por `empresaId` | idem |

**Arquivamento de frios:** mover partições antigas (ex.: serviços > 24 meses) para storage barato/tabela
de arquivo, mantendo o OLTP enxuto. Só ligar junto com o particionamento.

> **Por que gatilho, não agora:** particionar cedo adiciona complexidade de manutenção sem ganho no porte
> atual. O sinal de query lenta (>100 ms, já instrumentado no `prisma.js`) + o volume real (F0) definem
> quando cruzar o gatilho.

## Chave e sharding (liga com ADR-001)

O custo de trocar PK cresce com o tempo → **decidir o gatilho já**: se o horizonte de negócio (F0)
apontar sharding/multi-região, migrar a `UUIDv7/ULID` **antes** do volume tornar a migração inviável.
Caso contrário, `Int` permanece. Decisão explícita, monitorada — não deixada ao acaso.

## Internacionalização (decidir cedo — retrofit é caro)

| Dimensão | Estado atual | Decisão proposta |
|---|---|---|
| **Moeda** | BRL implícito, `Float` sem campo de moeda | VO Dinheiro = `Decimal` + `currency` (ADR-002). Adicionar `currency` já evita retrofit destrutivo |
| **Fuso** | ponto usa timestamp do **servidor** (`BatidaPonto.em`) | **armazenar em UTC**, apresentar no fuso da empresa. Confirmar que a captura já é UTC no banco |
| **Idioma** | 100% pt-BR (inclui textos "ChaveiroBot" residuais) | `locale` por empresa/usuário quando houver 2º idioma; padronizar termo "AdmAi" |

⚠️ **Bloqueante F0:** só faz sentido investir em i18n se houver plano real de outro país/moeda. Confirmar.

## Crescimento por bounded context

Os contextos de F2 permitem escalar **por parte** sem big-bang: um contexto que cresça sozinho (ex.:
**Engajamento** — avaliações/Google/WhatsApp, que já é assíncrono via BullMQ) pode, no futuro, virar
serviço/banco próprio, sem tocar no núcleo transacional (Operação de Serviços). Isso é consequência de
manter os limites de contexto limpos agora — não exige ação hoje.

## Multi-tenant em escala

- **RLS ligada** (ADR-004) vira pré-requisito de densidade segura.
- **Quotas por plano** (limites de serviços/usuários/storage por `Empresa`/`Assinatura`) para conter
  *noisy neighbor* — modelar quando houver planos diferenciados (F0).
- **Observabilidade por tenant** (F8): achar a empresa que consome desproporcional.

**✅ F7:** gatilhos de partição/arquivamento propostos ✓ · decisão de chave amarrada ao gatilho (ADR-001) ✓ ·
estratégia i18n/moeda/fuso ✓ · crescimento por contexto ✓. **⚠️ Pendente:** números de F0 e teste de carga
(staging) para validar que o volume projetado cabe no SLO.
