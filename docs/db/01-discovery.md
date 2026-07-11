# F0 — Descoberta do Negócio + F1 — Auditoria do estado atual

> **Método:** o AdmAi já está em produção, então boa parte da "descoberta" é **arqueologia com
> evidência**: derivo as respostas do código/schema e marco cada lacuna que só o dono resolve.
> Nada aqui é suposição — ou tem `arquivo:linha`, ou está rotulado **⚠️ CONFIRMAR**.

## F0 — Descoberta do Negócio

### Respostas derivadas do código (a validar)

| Tópico | Resposta derivada (evidência) | Lacuna a confirmar |
|---|---|---|
| Objetivo do sistema | Gestão de prestadores de serviço: registro de serviços, comissão, estoque, ponto (RH), avaliações (cliente + Google), billing. Canais: painel React + bot WhatsApp (`schema.prisma`, `decisions.md`) | ⚠️ Qual o *core domain* prioritário para o negócio hoje? |
| Problema resolvido | Formalizar receita/comissão por técnico e jornada (banco de horas) com prova anti-fraude | ⚠️ Confirmar dor #1 |
| Processos de negócio | serviço→(aprovação opcional)→comissão+baixa de estoque; ponto entrada→almoço→saída→banco de horas; avaliação agendada pós-serviço (`decisions.md`, `services/ponto.js`, `services/avaliacao.js`) | — |
| Usuários / perfis | 3 papéis: `dono`/`gestor`/`funcionario` + overrides (`Usuario.papel`/`permissoes`, `services/permissoes.js`) | ⚠️ Haverá "contador"/"franqueado"/multi-loja por dono? |
| **Volume atual e crescimento** | prod é instância **NANO** (Supabase, sa-east-1) — porte pequeno | ⚠️ **BLOQUEANTE:** nº de empresas/serviços/batidas hoje e projeção 12/24/36m |
| Regras de negócio | comissão = `valorLiquido × %`; estoque baixa só em `status='ativo'` (`decisions.md:61`); 1 avaliação por serviço (`Avaliacao.servicoId @unique`); telefone único por empresa (`@@unique([empresaId, telefone])`) | — |
| **RNF (latência/uptime/RPO/RTO)** | não versionados no repo | ⚠️ **BLOQUEANTE:** definir SLA, p95 alvo, RPO/RTO, janela de manutenção |
| Integrações externas | WhatsApp Evolution + Cloud API (Meta), Google Business Profile, Stripe, Resend, Sentry (`package.json`, `schema.prisma`) | ⚠️ Quais têm SLA contratual? |
| Requisitos legais (LGPD) | coleta geo+selfie (`BatidaPonto`), CPF/salário (`Tecnico`), telefone de cliente. Pendência já registrada em `decisions.md:84` | ⚠️ **BLOQUEANTE:** base legal por finalidade + prazo de retenção `N` + DPO |
| Auditoria | `AuditLog` (antes/depois, ip, ator) já existe | ⚠️ Quais ações são obrigatórias por lei/contrato reter e por quanto tempo? |
| Histórico de dados | hoje só `updatedAt`/snapshots derivados (ex.: `Servico.comissaoGerada`) | ⚠️ Precisa histórico versionado de salário/comissão? |
| Relatórios / KPIs | PDF (`services/relatorio.js`), dashboard (receita/comissão/meta/ranking), NPS de avaliações | ⚠️ Frescor exigido (tempo-real vs diário)? |
| Notificações | inbox (`Notificacao`) + WhatsApp + e-mail; agendador BullMQ (`services/agendador.js`) | — |
| Armazenamento de arquivos | selfies/fotos como URL; **`qrCode` base64 no banco** (`ConexaoBot`) | ⚠️ Volume mensal de selfies? provedor de storage? |
| Internacionalização | 100% pt-BR, moeda implícita BRL, timestamps de servidor | ⚠️ Haverá outro país/moeda/idioma/fuso? |
| Multi-tenant | shared-schema por `empresaId` + RLS opcional pronta (`enable_rls.sql`) | ⚠️ SLA/isolamento por plano (enterprise pede DB dedicado)? |

### Entregável de F0 pendente de você
Um **workshop/entrevista curta** para fechar os 8 itens ⚠️ **BLOQUEANTE/CONFIRMAR**. Sem os números
(volume, RNF, retenção LGPD), F5/F7/F8 usam *placeholders* explicitamente marcados.

---

## F1 — Auditoria do estado atual (foto com evidência) {#f1}

**Escopo:** 25 modelos, 23 migrations, Postgres 16 (Supabase). Objetivo: catalogar dívidas **reais**,
cada uma com evidência e severidade — insumo direto de F4 (modelagem) e F5 (performance).

### Achados catalogados

| # | Achado | Evidência | Sev. | Fase que trata |
|---|---|---|---|---|
| A1 | **Dinheiro em `Float`** — 17 colunas monetárias | `schema.prisma`: `Servico.valorCobrado/valorLiquido/comissaoGerada`, `Tecnico.comissao/salarioBase/valorHora`, `Material.precoUnit/precoVenda`, `Pagamento.valor`… | **Alto** | F4 / ADR-002 |
| A2 | **Load-all-then-reduce em JS** (`take: MAX_AGREGACAO`) | `routes/account.js:88-90`, `routes/servicos.js:300-301`, `routes/tecnicos.js:255,299-302` | Médio | F5 |
| A3 | **Paginação OFFSET** (degrada em tabela grande) | `routes/servicos.js:90` (`skip/take`) | Médio | F5 |
| A4 | **Leituras sem teto explícito de negócio** | `routes/servicos.js:244` (avaliações `take:100`), `admin.js:142` (usuários sem take) | Baixo | F5 |
| A5 | **Blob no banco** — QR base64 | `schema.prisma` `ConexaoBot.qrCode` | Baixo/Médio | F4 / ADR-006 |
| A6 | **Índice redundante** | `schema.prisma` `Servico @@index([criadoEm])` vs `@@index([empresaId, criadoEm])` (comentado no próprio schema) | Baixo | F4 |
| A7 | **Chaves `Int autoincrement`** enumeráveis, hostis a shard | todos os 25 modelos | Médio (estratégico) | F4 / ADR-001 |
| A8 | **Colunas 2FA legadas convivendo** | `Usuario.twoFactorSecret` (bool antigo) vs `totpSecret` | Baixo | F4 / F8 (deprecação) |
| A9 | **RLS pronta mas desligada** | `prisma/rls/enable_rls.sql` completo, fora das migrations de propósito; `RLS_ENABLED` default off | Médio (segurança) | F6 |
| A10 | **Baixa de estoque sujeita a corrida** | `Material.quantidadeAtual` mutável + ledger `MovimentacaoEstoque.saldoApos` | Médio | F5 / F6 (invariant) |
| A11 | **Jobs cross-tenant usam `prisma` base** (sem escopo/GUC) | `services/agendador.js:43,99,186,218` (findMany sem empresaId de sessão) | Info (por design) | F6 (tratar antes de ligar RLS) |

### Drift schema↔banco (lição B7)
Já sanado nesta trilha: `migrate diff --exit-code` no CI + migrations B7/B8 adicionadas
(`AUDIT.md`). **Critério de F1 atendido:** drift = zero. Reconfirmar após qualquer mudança de F4.

### O que a foto NÃO cobre (honestidade)
- **Números reais de volume/cardinalidade** por tabela → precisa consultar o banco (staging/prod read-only).
- **Planos de execução reais** (`EXPLAIN ANALYZE`) → precisa staging com dados realistas (F5).
