# ADMAI_V2_ARCHITECTURAL_RUNWAY — dossiê

**Propósito**: garantir que o MVP congelado seja `SMALL ENOUGH TO SHIP + STRUCTURED ENOUGH TO
EVOLVE` — **sem implementar a V2**. Gate `NO_SPECULATIVE_V2_IMPLEMENTATION`: nenhum write set desta
fase toca `chaveiro-bot/src/**` ou `chaveiro-painel/src/**` (verificável no `WRITE_SET_HISTORY`).

Snapshot: branch `fix/seguranca-criticos`, pós-`c9287a8`. Evidência arquitetural verificada em
2026-08-23 com file:line (exploração desta frente + verificações pontuais).

---

## 1. Arquitetura atual — os fatos que decidem tudo abaixo

| Fato | Evidência |
| --- | --- |
| 26 modelos Prisma, **todos** `Int @id @default(autoincrement())` | `chaveiro-bot/prisma/schema.prisma` (única exceção: singleton `ConexaoBot`) |
| **Não existem**: `Cliente`, `Orcamento`, `Agendamento`, `Lead/Oportunidade`, unidade/filial, event/outbox, tabela de idempotência, período de fechamento de comissão, histórico de invoice | schema completo |
| Cliente final é **inline**: `Servico.clienteNome/clienteTelefone`, duplicado em `Avaliacao`; identidade por casamento de telefone com tolerância de 9º dígito | `schema.prisma:139-140,342-343`; `variantesTelefone` em `avaliacao.js:133`, `admin.js:463` |
| O plano de métricas **já declara o futuro**: 12 métricas, 4 não-servíveis porque `sourceEntities` nomeia modelos inexistentes (`taxa-recompra`→Cliente; `taxa-conversao-orcamento`→Orcamento; `ocupacao-agenda`→Agendamento; família `CRM_FUTURE`→Lead/Oportunidade), com taxonomia `REQUIRES_CUSTOMER/SCHEDULING/BUDGET/WARRANTY/CRM` | `src/services/metricas/registro.js:381-456`, `contrato.js:45-56` |
| A classe de disponibilidade é **DERIVADA do schema**, não anotada: entidade nova no schema satisfaz o **pré-requisito NOMINAL** da métrica sem tocar o plano — a própria ferramenta avisa que isso não confirma campos nem fórmula (`availability.mjs:180`); um modelo `Cliente` vazio produziria falso verde, e é por isso que a virada real exige a camada de cálculo | `tools/admai-delivery/metric/availability.mjs` |
| Comissão é coluna denormalizada computada na escrita (`comissaoGerada`); a **taxa usada não é gravada**; pendente = `sum(comissaoGerada) − sum(Pagamento.valor)` derivado em leitura | `servicos.js:202`, `tecnicos.js:463-465` |
| Idempotência é **Redis-only e fail-open** (`marcarSeNovo`, SET NX), usada só para dedup de webhook Stripe/WhatsApp; sem `Idempotency-Key` em endpoint de escrita | `services/idempotencia.js:8-38`; `billing.js:86`, `inbound.js:61` |
| Quase-idempotência de negócio por **constraint + claim**: `Avaliacao.servicoId @unique` + upsert; aprovação por `updateMany {status:'pendente'}` atômico (corrida provada por sonda de mutação); estoque por `increment` atômico | `avaliacao.js:35`; `servicos.js:277-293` + `aprovacao_rejeicao_estoque.test.js:462`; `services/estoque.js:57-61` |
| `AuditLog` é **write-only** (7 ações, sem endpoint de leitura, sem requestId/papel/UA); falha de auditoria nunca derruba a operação; trilha sobrevive à exclusão do tenant (deliberado) | `services/auditoria.js:4-29`; `auditoria_dado_pessoal.test.js` |
| Tenant scoping por **extensão Prisma** (9 modelos; `findUnique→findFirst`; single-record update/delete fora — convenção `updateMany+count`); RLS opcional fora da cadeia de migrations | `db/tenant.js:24-135`; `prisma/rls/enable_rls.sql` |
| WhatsApp: **dois providers atrás de um gateway** (Evolution global single-number; Meta Cloud por-empresa via import dinâmico); Cloud inbound ainda inline sem fila e sem mídia | `services/whatsapp/gateway.js:14-80`, `cloud-gateway.js:126-162` |
| Uploads são data-URI base64 pelo body JSON (teto 10 MB); storage atrás de `services/storage.js` com bucket privado + fallback de disco | `app.js:75`; `storage.js:22-78` |
| IA já é dependência instalada e usada (`@anthropic-ai/sdk`, análise de avaliações em cache) | `package.json`; `AnaliseAvaliacoes` |

## 2. A regra das 7 condições — e onde o corte REALMENTE acontece

`PREPARE_NOW` exige TODAS: (1) capacidade futura estrategicamente aprovada; (2) retrofit posterior
com custo material; (3) fundação não expõe feature incompleta; (4) custo agora < retrabalho
provável depois; (5) risco/fronteira concreto existente; (6) não enfraquece segurança/confiabilidade;
(7) migração/reversibilidade clara.

**A condição 1 é satisfeita pelas 17 capacidades** — a diretiva as lista como *Approved Future
Capabilities* (roadmap). O corte vem das outras: para quase tudo aqui, **o retrofit posterior é
ADITIVO** (tabela nova + FK opcional + backfill documentado), o que derruba a condição 2; onde o
retrofit teria custo material (offline), o custo AGORA é maior ainda e não há fronteira concreta
(condições 4 e 5). Resultado honesto: **zero fundações implementadas nesta fase.**

O mecanismo que torna esse diferimento SEGURO já está construído e testado: o registro de métricas
nomeia as entidades ausentes e `availability.mjs` deriva a classe do schema — quando `Cliente`
nascer, `taxa-recompra` sai de `REQUIRES_CUSTOMER` sozinha, **no plano nominal** (a ferramenta
avisa que não confirma campos nem fórmula; a camada de cálculo continua sendo trabalho declarado).

## 3. Future Capability Registry — as 17

Colunas: **Readiness** (`READY_BY_CURRENT_ARCHITECTURE · MINOR_EXTENSION_REQUIRED ·
FOUNDATION_REQUIRED_NOW · DEFERRED_SAFELY · ARCHITECTURAL_RISK · UNKNOWN`) · **Decisão**
(`PREPARE_NOW · DEFER · RESEARCH_REQUIRED`).

| # | Capacidade | Dependências conhecidas | Pontos de extensão que JÁ existem | O que falta | Riscos (migração/acoplamento/segurança/dado) | Readiness | Decisão |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `CRM` | Cliente, Lead, Oportunidade | família `CRM_FUTURE` no plano de métricas; identidade por telefone com anonimização LGPD funcionando | modelo Cliente + resolução de identidade | migração = extração por casamento de telefone (backfill documentado §5); dado pessoal concentra | DEFERRED_SAFELY | DEFER |
| 2 | `ORÇAMENTOS` | Orcamento + máquina de estados | `taxa-conversao-orcamento` declarada REQUIRES_BUDGET; `Servico.valorCobrado` | modelo + fluxo aprovar→converter | aditivo puro | DEFERRED_SAFELY | DEFER |
| 3 | `AGENDA` | Agendamento | `ocupacao-agenda` REQUIRES_SCHEDULING; jornada do técnico já modelada (`Tecnico.jornada*`) | modelo + conflito de horário | aditivo; conflito exige constraint pensada | DEFERRED_SAFELY | DEFER |
| 4 | `DESPACHO` | Agenda + geo | `BatidaPonto.lat/lng` já existe; `Servico.tecnicoId` é a atribuição | roteirização/fila | depende de 3; geo do ponto é client-asserted (limite conhecido) | DEFERRED_SAFELY | DEFER |
| 5 | `GARANTIAS` | vínculo a Servico | classe REQUIRES_WARRANTY na taxonomia; `finalizadoEm` | modelo Garantia + prazos | aditivo | DEFERRED_SAFELY | DEFER |
| 6 | `OFFLINE_SYNC` | IDs estáveis client-generated + idempotência por operação + resolução de conflito | chaves de ARTEFATO já são uuid server-side (`doc-<uuid>`), padrão isolado | uuid por ENTIDADE sincronizável, `Idempotency-Key`, clock/merge | **26 modelos em Int autoincrement**: é a maior distância arquitetural do sistema. Retrofit = colunas uuid ADITIVAS só nas tabelas que sincronizam + unique, não big-bang | **ARCHITECTURAL_RISK** | DEFER — com o caminho aditivo registrado em §5; preparar agora violaria as condições 4 e 5 |
| 7 | `PAGAMENTOS` (cliente final) | entidade de transação de serviço | Stripe SDK/webhook/idempotência de evento já operacionais para o SaaS | Transacao de serviço + conciliação | não confundir com billing do SaaS (separação já limpa) | DEFERRED_SAFELY | DEFER |
| 8 | `FINANCEIRO_AVANCADO` | período de fechamento, extrato imutável | `MovimentacaoEstoque` prova que o padrão ledger é da casa; `Pagamento` + derivação de pendente funcionam | entidade de fechamento; **taxa de comissão não é snapshotada** (recuperável por divisão `comissaoGerada/valorLiquido`, com ressalva de arredondamento a 2dp) | mudar `Tecnico.comissao` não reescreve histórico (certo), mas a taxa vigente à época só existe por inferência | MINOR_EXTENSION_REQUIRED | **PREPARADA** (`FIX-COMISSAO-SNAPSHOT`); fechamento de período segue DEFER |
| 9 | `FORNECEDORES` | Fornecedor + compra | `Material.preco/unidade` | modelo + entrada de compra ligada à movimentação | aditivo | DEFERRED_SAFELY | DEFER |
| 10 | `ESTOQUE_AVANCADO` | multi-depósito, lote, inventário | **ledger append-only já existe** (`MovimentacaoEstoque` com `saldoApos`, baixa atômica, origem rastreada) | localização/lote como dimensões novas | aditivo sobre ledger existente | MINOR_EXTENSION_REQUIRED | DEFER |
| 11 | `PORTAL_CLIENTE` | Cliente + ator externo autenticado | avaliação pública por link já exercita acesso não-autenticado controlado | modelo de principal externo (hoje só `Usuario` interno) | fronteira de segurança NOVA — nunca improvisar sobre `Usuario` | DEFERRED_SAFELY | DEFER |
| 12 | `WHATSAPP_AVANCADO` | paridade Cloud, mídia, multi-instância | **gateway com 2 providers atrás de uma interface** — o ponto de extensão certo já existe | fila no Cloud inbound; mídia; instância por empresa no Evolution | item `CLOUD-INBOUND-FILA` no ledger (robustez de feature INCLUÍDA, não V2) | MINOR_EXTENSION_REQUIRED | DEFER |
| 13 | `INTEGRACOES` | ports/adapters | padrão já estabelecido caso a caso: gateway (WhatsApp), storage, filas de e-mail | **nada** — framework genérico de ports sem consumidor é exatamente o overengineering proibido | — | READY_BY_CURRENT_ARCHITECTURE | DEFER |
| 14 | `MULTIUNIDADE` | unidade entre Empresa e recursos | `Servico.local` (texto livre) é a costura semântica que os usuários já usam | `unidadeId` aditivo em Tecnico/Servico/Material + escopo | tenant scoping precisa de segunda dimensão — mexe na extensão Prisma; migração aditiva mas transversal | DEFERRED_SAFELY | DEFER |
| 15 | `FISCAL` | emissor externo, CNPJ/endereço | `Empresa` tem os campos cadastrais básicos | integração + numeração | domínio regulatório; nada a preparar sem decisão de produto | DEFERRED_SAFELY | DEFER |
| 16 | `BI_AVANCADO` | drill-down, séries, export | **plano de métricas com contrato executável** (registro + disponibilidade derivada + drilldown contratado com 501 explícito) | implementar os drilldowns declarados | o contrato já impede drill mais permissivo que o agregado (MET-05) | READY_BY_CURRENT_ARCHITECTURE | DEFER |
| 17 | `AI_AUTOMATION` | — | `@anthropic-ai/sdk` instalado e usado (análise de avaliações com cache por empresa) | casos de uso | custo/quotas; PII em prompt exige política | MINOR_EXTENSION_REQUIRED | DEFER |

**Zero `PREPARE_NOW`. Zero `RESEARCH_REQUIRED`** (nenhuma incerteza que bloqueie o release — as
incertezas listadas são da V2, e a V2 não está autorizada).

## 4. As 12 áreas de desafio (§26 da diretiva) — veredito por área

| # | Área | Veredito | Por quê (condição que decide) |
| --- | --- | --- | --- |
| 1 | IDs estáveis/client-generated | DEFER | c4/c5: converter 26 modelos agora é o maior custo do sistema para capacidade sem data; caminho aditivo registrado |
| 2 | Idempotência | **CORRIGIDA NO PRODUTO** (`FIX-IDEMP-PERDA`, consenso pós-revisão) | O Revisor derrubou o DEFER original: marcar-antes-de-processar DESCARTAVA o evento quando o handler falhava (o reenvio caía em "duplicado" por 24h). Remédio menor consensuado: desmarcar-na-falha nos dois consumidores + timeouts explícitos no cliente (sem eles, fail-open era espera indefinida). Recepção durável fica como preparação V2 com gatilho: incidente real, volume relevante ou necessidade de replay/auditoria. Modos residuais documentados no próprio serviço |
| 3 | Domain events/outbox | DEFER | c1-consumidor/c3: nenhum consumidor; outbox sem leitor é infraestrutura exposta |
| 4 | Fronteira de Cliente | DEFER | c2: extração é aditiva com backfill por telefone (§5); LGPD já opera no modelo atual |
| 5 | Histórico/relações de serviço | DEFER | `Servico` já carrega ciclo completo (aprovação, início, fim, materiais, comissão) |
| 6 | Fronteira de atribuição | DEFER | `tecnicoId` + claim atômico de aprovação cobrem o MVP |
| 7 | Fronteira de transação financeira | **PREPARADA em parte** (`FIX-COMISSAO-SNAPSHOT`) | O Revisor provou que a "recuperação por divisão" era mentira aritmética (toFixed(2): líquido 1,01 a 5% grava 0,05 → divisão devolve 4,95%; líquido zero nem divide). `comissaoTaxaAplicada` agora é snapshot imutável nos dois produtores; histórico anterior fica NULL — lacuna honesta. **Risco nomeado**: todo valor monetário é `Float` — classificado `ARCHITECTURAL_RISK` (conversão a decimal exato NÃO autorizada agora; item no ledger com revisita) |
| 8 | Movimentos de inventário | **ESTAVA DECLARADO E NÃO ENTREGUE — corrigido** (`FIX-ESTOQUE-CORRIDA`) | O dossiê original repetiu a promessa do comentário do código; o Revisor provou que o piso e o `saldoApos` eram computados contra leitura stale (duas saídas de 7 sobre 10 → saldo real −4 com dois ledgers dizendo 3; sabotagem reproduziu −11). Agora: `SELECT FOR UPDATE` serializa movimentos do mesmo material; concorrência provada em integração |
| 9 | Tenant vs unidade | DEFER | c5: sem risco concreto; costura (`local`) identificada |
| 10 | Extensibilidade de ator/principal | DEFER | c3: principal externo sem portal é superfície de ataque sem produto |
| 11 | Integration ports/adapters | **JÁ FEITO** (caso a caso) | gateway WhatsApp prova o padrão; generalizar sem consumidor é proibido pelo anti-overengineering |
| 12 | Audit USER/SYSTEM/INTEGRATION/AI | DEFER | freeze: endpoint/campos novos = feature nova; lacunas (requestId/papel/UA) registradas como DEFERRED no ledger; F4-02 prova o que EXISTE |

## 5. Notas de migração (o preço de cada DEFER, escrito antes de esquecê-lo)

- **Cliente** (capacidades 1/11/7): criar `Cliente {id, empresaId, nome, telefone canônico}` +
  FK opcional `Servico.clienteId` (mantendo os inline por transição); backfill agrupando por
  `variantesTelefone` dentro do tenant; `Avaliacao` passa a referenciar; anonimização LGPD muda de
  `updateMany` por telefone para delete/anonimize por entidade. Reversível: colunas novas são
  aditivas; os campos inline só saem depois de duas releases de convivência.
- **Offline/IDs** (6): NUNCA big-bang. Por tabela sincronizável: `publicId String @unique @default(uuid())`
  aditivo; API aceita `publicId` no write com `Idempotency-Key`; conflito por `updatedAt` +
  regra por campo. Enquanto isso não existir, offline é impossível — e está tudo bem, porque foi
  DIFERIDO, não esquecido.
- **Fechamento financeiro** (8): entidade `FechamentoComissao {periodo, tecnicoId, totais}` +
  congelamento dos serviços do período. Se o Codex confirmar a suficiência da recuperação por
  divisão, nenhum snapshot de taxa entra agora.
- **Multiunidade** (14): `Unidade {empresaId}` + `unidadeId` opcional em Tecnico/Servico/Material;
  a extensão de tenant ganha o segundo filtro com semântica EXPLÍCITA de posse: papéis com
  escopo global são NOMEADOS; para os demais, associação de unidade obrigatória e ausência =
  NEGAR (correção do Revisor: "ausência = empresa inteira" não é fail-closed em relação ao
  escopo de unidade — é o furo com outro nome).
- **Cloud/mídia** (12): enfileirar o inbound Cloud na MESMA `filaMensagens` (produtor já existe);
  normalizar mídia no cloud-gateway antes do `inbound.js` (que não muda).

## 6. Revisão Codex — RESOLVIDA (thread 01a02cf7 + rodada de evidência)

Veredito: `CORRECOES_NECESSARIAS` — três achados ALTA, todos VERIFICADOS no código antes de
aceitos, todos corrigidos como fatias de produto FORA de F0.5 (`FIX-IDEMP-PERDA`,
`FIX-COMISSAO-SNAPSHOT`, `FIX-ESTOQUE-CORRIDA`) com sabotagem provando que cada teste morde.
Na rodada de evidência, o remédio menor da idempotência foi CONSENSUADO (a tabela durável ficou
como preparação V2 com gatilho). Dois achados MÉDIA absorvidos neste documento (números 12/4 e
semântica nominal da disponibilidade; fail-closed da multiunidade). Os demais DEFER foram
confirmados pelo Revisor como defensáveis. Registro completo: D-F05-REV-01 em
`AGENT_DECISIONS.md`.

## 7. Invariantes arquiteturais que a V2 NÃO pode quebrar

1. Tenant scoping via extensão (`req.db`) + convenção `updateMany+count` para single-record.
2. Tetos de RBAC (`podeAtribuirPapel`/`limitarPermissoesAoAtor`) valem na CRIAÇÃO do vetor
   (convite decide papel na emissão — EV-060).
3. Paywall por ordem de mount com allowlist explícita acima da linha; semântica D-12 (F4-05).
4. Flags fail-closed: recurso desligado responde 404 inerte, nunca 403/500.
5. Auditoria best-effort nunca derruba operação; trilha sobrevive ao tenant.
6. Estoque só muda por operação atômica (increment / claim de aprovação).
7. Roteamento WhatsApp por telefone→tenant com dedup de mensagem (best-effort declarado).
8. Segredos cifrados em repouso (AES-256-GCM) — TOTP e tokens de provider compartilham o módulo.

## 8. Orçamento de complexidade

Zero abstração sem consumidor. Migração só aditiva. Toda entidade futura nasce com a classe de
disponibilidade flipando SOZINHA (`availability.mjs`). Framework genérico de qualquer coisa é
recusado por padrão — o repositório já provou o custo do contrário.

## 9. Gates

- `NO_SPECULATIVE_V2_IMPLEMENTATION`: **PASS por construção** — o único write set desta fase
  (`F05-RUNWAY-DOSSIER`) declara apenas este arquivo. Verificação: `WRITE_SET_HISTORY.json`.
- `ADMAI_V2_ARCHITECTURAL_RUNWAY_READY`: **PASS** — revisão executada, correções aplicadas e
  provadas, decisão arquivada. Nota de honestidade do gate NO_SPECULATIVE: as três correções
  tocaram `src/**`, mas NÃO são fundações especulativas nem write sets desta fase — são defeitos
  de features INCLUÍDAS descobertos PELA revisão, executados como fatias de release (fase F0 no
  ledger), cada um com teste que morde provado por sabotagem.
