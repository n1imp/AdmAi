# 00 — Questões Abertas

Toda pergunta que ainda não tem resposta, com o **dono da resposta** explícito. Uma questão só
sai desta lista quando é respondida (vira registro no `00_DECISION_LOG.md`), refutada por
evidência, ou explicitamente marcada `[ADIADO]`/`[FORA DE ESCOPO]` pelo usuário.

**Legenda de marcadores:** `[DECISÃO DO USUÁRIO]` · `[EVIDÊNCIA DO REPOSITÓRIO]` ·
`[PESQUISA EXTERNA]` · `[INFERÊNCIA]` · `[HIPÓTESE]` · `[PENDENTE]` · `[ADIADO]` ·
`[FORA DE ESCOPO]` · `[DECISÃO SUBSTITUÍDA]`

**Dono da resposta:**
- `USUÁRIO` — regra de negócio, custo, duração de trial, escopo, aceitação de risco, dados
  pessoais, operação irreversível, merge/push/deploy.
- `INVESTIGAÇÃO` — resolvível por leitura de código ou reprodução; não pode ser transferida ao
  usuário sem antes ser investigada.
- `PESQUISA EXTERNA` — depende de fonte oficial (lei, norma, documentação de terceiro).
- `PROFISSIONAL` — exige validação jurídica, contábil ou trabalhista; nunca concluída aqui.

**Regra do protocolo:** não perguntar ao usuário o que o repositório responde. Cada questão
abaixo cujo **estado atual** é descobrível no código já nasce com esse estado anexado — a
pergunta ao usuário fica restrita à **intenção**, que é decisão dele.

---

## Abertas

### Q-BOOT — Bootstrap

| ID | Questão | Dono | Marcador | Origem | Status | Bloqueia |
|---|---|---|---|---|---|---|
| Q-002 | Quais funcionalidades atrás de flag (`SERVICO_ANDAMENTO_ENABLED`, `DOCUMENTOS_ENABLED`, `GOOGLE_REVIEWS_ENABLED`, `WHATSAPP_HABILITADO`) estão ligadas **na produção real**? O valor efetivo no Railway não é verificável a partir do repositório | INVESTIGAÇÃO → USUÁRIO | `[PENDENTE]` | C1 · `chaveiro-bot/src/config/env.js`; consumo em `routes/servicos.js:608`, `routes/documentos.js:50`, `services/google/businessClient.js:22`, `services/inbound.js:48` | Aberta | Priorização de C1 e C6; Lote 12 |
| Q-004 | Qual o prazo de retenção das provas de ponto (selfie + geolocalização) e a suficiência do texto de transparência? | USUÁRIO + PROFISSIONAL + PESQUISA EXTERNA | `[PENDENTE]` | C2/C3 — **reformulada** após a correção do candidato: retenção (365 dias) e aviso de coleta **estão implementados**; segue aberta a aprovação do prazo e a lacuna da Política de Privacidade | Aberta | Especificação de C2/C3; refinada por Q-022 |

> **Nota sobre Q-002 (COND-001):** `WHATSAPP_HABILITADO` sai do escopo desta questão. O canal
> WhatsApp não é tratado nesta sessão; a flag volta junto com o candidato C4.

### Q-R1 — Rodada 1: decomposição de Q-005

`Q-005` era ampla demais para ser respondida ou rastreada. Por instrução do usuário, foi
**decomposta** nas 16 questões abaixo. `Q-005` recebe `[DECISÃO SUBSTITUÍDA]` e permanece
registrada na seção "Substituídas" desta página — não foi apagada.

O **estado atual** de cada item, quando descobrível no repositório, está na coluna própria. A
pergunta ao usuário é sempre sobre **intenção futura**, nunca sobre o estado atual.

| ID | Questão (intenção) | Estado atual no repositório | Dono | Origem | Status | Bloqueia |
|---|---|---|---|---|---|---|
| Q-007 | Qual o volume atual (empresas ativas, serviços/mês, batidas de ponto/mês, usuários) e a projeção para 12/24/36 meses? | Não descobrível no repositório — depende do banco de produção. Instância Supabase é porte pequeno (`docs/db/01-discovery.md`) | USUÁRIO | Q-005 · `docs/db/01-discovery.md` | Aberta | Dimensionamento de listas, paginação, relatórios; Lote 11 |
| Q-008 | Qual o SLA de disponibilidade que o produto se compromete a entregar? | Nenhum SLA versionado. Sem uptime externo confirmado (`docs/RUNBOOK.md §6`) | USUÁRIO | Q-005 | Aberta | Critérios de aceite de RNF; Lote 11 |
| Q-009 | Qual a meta de latência aceitável (ex.: p95 de uma tela de lista) e o limite a partir do qual é falha? | Sem alvo definido; `docs/db/05-performance.md` propõe SLOs com placeholders | USUÁRIO | Q-005 | Aberta | Critério objetivo de "rápido"; Lote 11 |
| Q-010 | Qual o RPO — quanto de dado é tolerável perder num incidente? | **Hoje o RPO é indefinido e o risco é total**: o plano Supabase Free não inclui backup nem PITR, confirmado no painel em 2026-08-05 (`PROJECT_BASELINE_V1.md` §12 Gate 8) | USUÁRIO | Q-005 | Aberta | Toda funcionalidade que crie dado relevante; Lote 11 |
| Q-011 | Qual o RTO — em quanto tempo o serviço precisa voltar? | Rollback existe (redeploy Railway / rollback Cloudflare), mas sem tempo alvo declarado (`docs/RUNBOOK.md`) | USUÁRIO | Q-005 | Aberta | Plano de rollback de cada rodada; Lote 11 |
| Q-012 | Existe janela de manutenção aceitável? Qual? | Nenhuma declarada; deploy é contínuo em `master` | USUÁRIO | Q-005 | Aberta | Migrations e mudanças destrutivas futuras; Lote 11 |
| Q-013 | Haverá papéis além de `dono`, `gestor` e `funcionario` (ex.: contador, supervisor, administrativo, cliente final com acesso)? | RBAC tem exatamente 3 papéis (`services/permissoes.js:55`). Não existe papel `tecnico`. `Tecnico.nivelAcesso` é campo de RH livre, não usado no gate | USUÁRIO | Q-005 · `docs/db/01-discovery.md` | Aberta | Lote 2 (papéis) — decisão estrutural de RBAC |
| Q-014 | O produto precisará de multiunidade / multiloja / franquia dentro de uma mesma empresa? | Tenant é **plano**: `empresaId` é a única raiz de isolamento; não há filial, unidade ou equipe no schema | USUÁRIO | Q-005 | Aberta | Lote 2 e modelagem futura de toda entidade |
| Q-015 | O produto atenderá outros países? | Nenhuma evidência de suporte a outro país; telefone e documentos são brasileiros (`services/parser.js`, CPF em `Tecnico`) | USUÁRIO | Q-005 | Aberta | Lote 11; formato de dados (§14.2 do prompt) |
| Q-016 | O produto precisará de outros idiomas? | 100% pt-BR hardcoded; não há biblioteca de i18n; `lang="pt-BR"` em `index.html:2` | USUÁRIO | Q-005 | Aberta | Lote 11; padrão de textos de UI |
| Q-017 | O produto precisará de outra moeda? | BRL implícito — `formatarMoeda` em `chaveiro-painel/src/lib/api.js` usa pt-BR; valores monetários sem campo de moeda no schema | USUÁRIO | Q-005 | Aberta | Lote 11; regra transversal de moeda |
| Q-018 | O produto precisará de mais de um fuso horário? | `America/Sao_Paulo` fixo — formatação no painel e TZ dos crons em `services/agendador.js`. Ponto usa hora do servidor | USUÁRIO | Q-005 | Aberta | Lote 11; ponto eletrônico e relatórios |
| Q-019 | Qual o crescimento esperado de storage (selfies de ponto, fotos de evidência, documentos) e qual o teto de custo aceitável? | Buckets Supabase `documentos-tecnico` (privado) e `selfies-ponto`; sem expurgo implementado — cresce indefinidamente (`docs/decisions.md:84-102`) | USUÁRIO | Q-005 | Aberta | Q-022; Lote 10 e 11 |
| Q-020 | Haverá isolamento diferenciado por plano (ex.: banco dedicado para cliente enterprise)? | Shared-schema por `empresaId` para todos; RLS existe mas está desligada (`RLS_ENABLED`, `db/tenant.js:64`). `Assinatura` não tem noção de plano com isolamento | USUÁRIO | Q-005 | Aberta | Lote 11 e 12; modelo comercial |
| Q-021 | Qual frescor os relatórios e indicadores precisam ter (tempo real, minutos, diário)? | Agregação sob demanda a cada request (`GET /api/dashboard`, `/gestor/indicadores`); sem cache, sem materialização, sem "última atualização" na UI | USUÁRIO | Q-005 | Aberta | Lote 5 (atualização) e Lote 11 |
| Q-022 | Qual a retenção por **categoria** de dado (selfie de ponto, geolocalização, foto de evidência, documento do funcionário, dado do cliente final, log de auditoria, sessão)? | Só há expurgo automático na rotina de retenção do `services/agendador.js` (cron `30 3 * * *`); selfie/geo e documentos não têm prazo. Textos legais são modelo com `[placeholders]` | USUÁRIO + PROFISSIONAL | Q-005 · `docs/decisions.md:84-102` | Aberta | Lote 10; refina e absorve Q-004 |

---

## Respondidas

| ID | Questão | Resposta | Decisão | Data |
|---|---|---|---|---|
| Q-001 | Qual o tema da Rodada 1? | Constituição Funcional do Produto, Papéis, Navegação e Regras Transversais | **DEC-001** | 2026-08-05 |
| Q-006 | Criar o staging de aplicação é pré-requisito aceito antes de qualquer especificação chegar a produção? | Sim — pré-requisito obrigatório; local não substitui staging; cadeia local → validação local → staging → validação em staging → produção → validação pós-produção | **DEC-002** | 2026-08-05 |

---

## Substituídas

| ID | Questão original | Motivo | Substituída por |
|---|---|---|---|
| Q-005 | "As 8 lacunas ⚠️ BLOQUEANTE/CONFIRMAR de `docs/db/01-discovery.md` continuam abertas?" | `[DECISÃO SUBSTITUÍDA]` — ampla e genérica demais para ser respondida ou rastreada; cada lacuna tem dono, bloqueio e lote diferentes. Decomposição determinada pelo usuário na abertura da Rodada 1 | Q-007 a Q-022 |

---

## Adiadas / fora de escopo

> **Adiar não é decidir.** Uma questão adiada continua aberta como questão — o que foi decidido é
> apenas **quando** ela será tratada. Por isso nenhuma delas migra para "Respondidas" nem gera
> decisão funcional no `00_DECISION_LOG.md`.

| ID | Questão | Marcador | Motivo | Volta quando |
|---|---|---|---|---|
| Q-003 | A reativação do canal WhatsApp entra nesta frente? | `[ADIADO]` | **COND-001** — o usuário declarou que o WhatsApp não é tratado nesta sessão | Rodada futura dedicada ao canal (candidato C4) |
| Q-023 | Planos, assinatura, trial, cobrança e controle de acesso comercial: qual o modelo, quem titulariza, o que acontece quando o período comercial termina? | `[ADIADO]` | **COND-001** — planos e cobrança não são tratados nesta sessão. A pergunta que eu havia feito no Lote 1 (`L1-Q2` original) era de implementação, não de constituição | Rodada futura dedicada (candidato **C13**), que herda toda a evidência já levantada |
| Q-024 | Relatórios: formato, destinatário, periodicidade, competência e exportação | `[ADIADO]` | **COND-001** — relatórios não são tratados nesta sessão | Rodada futura; herda os achados de `ROUND-01-EOS-DOMAIN-OPERATIONS.md` §3.9 |

**Nenhum achado foi removido por causa do adiamento.** Toda a evidência de billing está
preservada em `00_CANDIDATE_BACKLOG.md` C13 e em `evidence/ROUND-01-EOS-PRODUCT-DISCOVERY.md`; a
de WhatsApp em C4; a de relatórios em C8 e no relatório de operações.
