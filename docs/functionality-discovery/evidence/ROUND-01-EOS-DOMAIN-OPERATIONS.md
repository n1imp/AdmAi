# ROUND-01 — EOS-Domain-Operations

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Agente EOS | `EOS-Domain-Operations` |
| Tipo de subagente | `Explore` (sem ferramenta de escrita — somente leitura por construção) |
| Data | 2026-08-05 |
| Commit-base | `30bf545` |
| Mandato | Ciclo operacional real: estados do serviço, atribuição, aprovação, estoque, comissão, ponto, avaliação, fechamento, dependências entre eventos, lacunas |
| Grau de confiança declarado | Alta (ver §12 do relatório) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Onde o comportamento atual puder ser reverificado no código, o código prevalece.
>
> **Nota de verificação:** o classificador de segurança do harness estava indisponível na
> revisão deste subagente. O orquestrador verificou independentemente os achados que sustentam
> decisões desta rodada (retenção LGPD, aviso de coleta no ponto, ausência de superfície de
> billing no painel) antes de usá-los. Os achados não reverificados seguem marcados como
> evidência de agente.

---

## 1. Escopo analisado

Ciclo operacional end-to-end do AdmAi: máquina de estados de `Servico`, atribuição de trabalho, fila de aprovação, movimentação de estoque, comissão/pagamento, ponto/jornada, avaliação do cliente, relatórios/fechamento, cadeia de dependências entre eventos e lacunas operacionais. Análise **somente leitura**, restrita ao que está implementado no repositório. Nenhuma regra de negócio nova foi proposta; onde a resposta depende do dono do produto, virou pergunta (§8).

---

## 2. Arquivos consultados

| Arquivo | Papel |
|---|---|
| `chaveiro-bot/prisma/schema.prisma` | Modelo de dados (544 linhas) |
| `chaveiro-bot/src/routes/servicos.js` | CRUD/aprovação/dashboard/serviço atual (711) |
| `chaveiro-bot/src/routes/tecnicos.js` | Técnicos, ponto, pagamentos (673) |
| `chaveiro-bot/src/routes/estoque.js` | Materiais, movimentação, PDF (283) |
| `chaveiro-bot/src/routes/account.js` | `/me/metricas`, `/me/servicos` (709) |
| `chaveiro-bot/src/routes/admin.js` | `/config/empresa`, notificações, usuários (491) |
| `chaveiro-bot/src/services/servico.js` | Registro via bot (74) |
| `chaveiro-bot/src/services/estoque.js` | Movimentação/baixa (117) |
| `chaveiro-bot/src/services/ponto.js` | Máquina do dia + banco de horas (200) |
| `chaveiro-bot/src/services/avaliacao.js` | Agendamento/disparo/captura (204) |
| `chaveiro-bot/src/services/relatorio.js` | PDF repartição + PDF/CSV ponto (389) |
| `chaveiro-bot/src/services/notificacao.js` | Avisos, estoque baixo (102) |
| `chaveiro-bot/src/services/agendador.js` | Crons + retenção LGPD (398) |
| `chaveiro-bot/src/services/conversa.js` | Máquina de estados do bot (372) |
| `chaveiro-bot/src/services/inbound.js` | Roteamento WhatsApp → serviço/ponto (333) |
| `chaveiro-bot/src/services/catalogo.js` | Resolução fuzzy de materiais (221) |
| `chaveiro-bot/src/services/permissoes.js` | RBAC (256) |
| `chaveiro-bot/src/services/whatsapp/gateway.js` | Porta de saída WhatsApp (241) |
| `chaveiro-bot/src/db/tenant.js` | Escopo multi-tenant (149) |
| `chaveiro-bot/src/config/env.js` | Feature flags |
| `chaveiro-painel/src/pages/` | `Aprovacoes.jsx`, `MeusServicos.jsx`, `NovoServico.jsx`, `NovoServicoFuncionario.jsx`, `MeuPonto.jsx`, `Estoque.jsx`, `Catalogo.jsx`, `CatalogoModais.jsx`, `Reparticao.jsx`, `Servicos.jsx`, `GestorHome.jsx`, `MeuPainel.jsx` |
| `chaveiro-painel/src/components/avaliacoes/Cliente.jsx` | Aba de avaliações do cliente |
| `docs/decisions.md` | Log de decisões fechadas com o dono |

---

## 3. Evidências com `arquivo:linha`

### 3.1 Estados e transições de `Servico.status`

| # | Transição | Onde | Guarda | Efeitos colaterais |
|---|---|---|---|---|
| T1 | ∅ → `ativo` | `routes/servicos.js:156-243` (`POST /servicos`, dono/gestor) | `podeRegistrarServico` (`:43-47`) | comissão gravada (`:187,213`); baixa de estoque se `materiais` (`:231-232`); agenda avaliação se `clienteTelefone` (`:235-242`) |
| T2 | ∅ → `pendente` | `routes/servicos.js:189-195` | `papel==='funcionario'` **e** `Empresa.aprovacaoServico` | comissão **é gravada** (`:187`) mas não conta; **sem** estoque; **sem** avaliação |
| T3 | ∅ → `ativo` (bot) | `services/servico.js:27-56` via `services/inbound.js:185-202` | `WHATSAPP_HABILITADO==='true'` (`inbound.js:48-49`) | baixa de estoque (`servico.js:58-60`); agenda avaliação (`inbound.js:205-212`); resumo no grupo (`inbound.js:223-243`) |
| T4 | `pendente` → `ativo` | `routes/servicos.js:250-293` (`POST /servicos/:id/aprovar`) | `aprovacoes.aprovar`; 409 se `status!=='pendente'` (`:262-263`) | `aprovadoPor`/`aprovadoEm` (`:267`); baixa de estoque (`:269-276`); agenda avaliação (`:278-285`); **comissão NÃO é recalculada** |
| T5 | `pendente` → `rejeitado` | `routes/servicos.js:295-321` | `updateMany` com `status:'pendente'` (`:302-303`) | grava `aprovadoPor`/`aprovadoEm` (`:304`); **nenhum outro efeito**; **sem motivo, sem notificação** |
| T6 | `ativo` → `em_andamento` | `routes/servicos.js:641-683` (`POST /:id/iniciar`) | flag `SERVICO_ANDAMENTO_ENABLED` (`:608`), próprio técnico (`:663`), 1 por vez → 409 (`:652-656`) | `iniciadoEm`; **sai de todas as agregações** (filtram `'ativo'`) |
| T7 | `em_andamento` → `ativo` | `routes/servicos.js:685-709` (`POST /:id/concluir`) | mesmo guard | `finalizadoEm` |
| T8 | qualquer → ∅ (hard delete) | `routes/servicos.js:323-335` | `servicos.deletar` | `MovimentacaoEstoque.servicoId` vira null (`schema.prisma:202`) — **saldo não é devolvido** |

Estados declarados: `schema.prisma:143-152` (`ativo` default `:147`, `pendente`, `rejeitado`, `em_andamento`).

### 3.2 Diagrama textual de estados

```
                       PAINEL (dono/gestor)              PAINEL (funcionário)                BOT WhatsApp (flag OFF hoje)
                       POST /servicos                    POST /servicos                      "serviço" → 9 passos → sim
                       routes/servicos.js:156            routes/servicos.js:166-181          conversa.js:47-140 → inbound.js:149
                               │                                  │                                     │
                               │                        aprovacaoServico?                               │ (ignora o toggle)
                               ▼                          ┌───────┴────────┐                            ▼
                          ┌─────────┐                    OFF              ON                       ┌─────────┐
                          │  ativo  │◄────────────────────┘                │                       │  ativo  │
                          └────┬────┘                                      ▼                       └─────────┘
       ┌───────────────────────┼──────────────────┐                 ┌───────────┐        efeitos: baixa estoque (catálogo)
       │ (flag M3)             │ DELETE           │  APROVAR        │ pendente  │                 + agenda avaliação
       ▼                       ▼                  │  :250-293       └─────┬─────┘                 + resumo no grupo
┌──────────────┐          ┌────────┐              └────────◄──────────────┤
│ em_andamento │          │ (nada) │                                      │ REJEITAR :295-321
└──────┬───────┘          └────────┘                                      ▼
       │ CONCLUIR :685                                            ┌────────────┐
       └────────► ativo                                           │ rejeitado  │ ◄── ESTADO TERMINAL ABSOLUTO
                                                                  └────────────┘     (sem reabertura, sem edição,
  efeitos na aprovação (T4): baixa estoque + agenda avaliação                          sem PATCH /servicos/:id)
  comissão: SEMPRE snapshot do momento do CREATE (:187)
```

Estados de saída em agregações: **só `ativo` conta** — `routes/servicos.js:76` (lista), `:419` (dashboard), `services/relatorio.js:19` (PDF), `services/agendador.js:51-55` (resumo semanal), `routes/tecnicos.js:193,442,448,458` (técnicos/perfil), `routes/account.js:154,160,165,170` (métricas do funcionário).

### 3.3 Atribuição de trabalho

- Não existe campo de atribuição/despacho: `Servico` tem `tecnicoId` como autor do registro (`schema.prisma:127-128`), sem `dataAgendada`, sem `responsavelId`, sem status "aberto/atribuído" (`schema.prisma:123-169`).
- `valorCobrado` é **obrigatório na criação** (`routes/servicos.js:35`) e a pergunta do bot é literalmente "**O que foi feito?**" (`services/conversa.js:72`) e "Quanto **foi cobrado**?" (`:91`).
- Funcionário só registra o próprio: `tecnicoId` vem de `req.user.tecnicoId`, nunca do cliente (`routes/servicos.js:166-171`; `docs/decisions.md:74-75`).
- Admin informa o técnico **por nome livre** e o sistema **cria o técnico se não existir** (`services/servico.js:7-19`, chamado em `routes/servicos.js:184`) — comportamento de lançamento retroativo, não de cadastro/despacho.
- `iniciar`/`concluir` (F9/M3) atuam sobre um serviço **já registrado com valor e comissão** (`routes/servicos.js:641-709`), atrás de flag desligada por padrão (`config/env.js:105`; 404 em `routes/servicos.js:608-610`).

**Conclusão factual: o produto REGISTRA trabalho já executado. Não despacha trabalho futuro.**

### 3.4 Aprovação

| Aspecto | Evidência |
|---|---|
| Toggle | `Empresa.aprovacaoServico` default `false` (`schema.prisma:27`) |
| Quem liga/desliga | `GET/PATCH /config/empresa` exige `configuracao` (`routes/admin.js:151,164`) → **só o dono** (gestor tem `configuracao:{ver:false,editar:false}`, `services/permissoes.js:86`); UI em `Configuracao.jsx:143,156` |
| Alcance | Só afeta `papel==='funcionario'` (`routes/servicos.js:163,189`). Dono/gestor e **o bot** nunca caem em `pendente` |
| Quem aprova | `aprovacoes.aprovar` → dono e gestor (`services/permissoes.js:84`) |
| Fila | `GET /servicos/pendentes`, `take: 200`, ordem `criadoEm asc` (`routes/servicos.js:128-141`); UI `Aprovacoes.jsx:107,120-144` |
| Rejeitado | Terminal: `/aprovar` exige `pendente` (`:262`), `/rejeitar` idem (`:303`). **Não existe `PATCH /servicos/:id`** — `servicos.editar` está no catálogo RBAC (`permissoes.js:37`) mas **nenhuma rota o consome** (busca em `src/`: zero ocorrências) |
| Motivo da rejeição | **Não existe campo** (`schema.prisma:123-169`); grava-se `aprovadoPor`/`aprovadoEm` também na rejeição (`routes/servicos.js:304`) |
| Notificação ao funcionário | **Nenhuma** — nem `notificar()` nem push nas rotas de aprovar/rejeitar. O funcionário descobre pelo badge em `MeusServicos.jsx:36-44` |
| Prazo / SLA / expiração | **Não existe.** `iniciarAgendamentos()` registra apenas resumo semanal, avaliações, LGPD e sync Google (`services/agendador.js:355-397`) — nada sobre pendentes |
| Visibilidade do pendente | `GET /gestor/indicadores` (`routes/servicos.js:544`), `GestorHome.jsx:201-202`, `/me/metricas.servicosPendentes` (`routes/account.js:163`), `MeuPainel.jsx:158,202-210` |

### 3.5 Estoque

| Aspecto | Evidência |
|---|---|
| Tipos | `"entrada" \| "saida" \| "ajuste"` (`schema.prisma:198`); enum validado em `routes/estoque.js:211` |
| Entrada | Só manual: `POST /materiais/:id/movimentacao` com `estoque.editar` (`routes/estoque.js:202-241`). Sem fornecedor, sem NF, sem ordem de compra |
| Saída | Automática por serviço, `origem:'servico'` (`services/estoque.js:91-108`), disparada em T1/T3/T4 |
| Saldo insuficiente | **Não bloqueia**: `saldoApos = Math.max(0, atual + delta)` (`services/estoque.js:49`) e grava a `quantidadeReal` efetivamente movida (`:50`) — a baixa é silenciosamente truncada e `ServicoMaterial.quantidade` fica maior que o baixado |
| Falha na baixa | Engolida: `try/catch` só loga (`services/estoque.js:109-115`) — o serviço permanece criado mesmo com o material não baixado |
| Concorrência | Resolvida com `increment` atômico (`services/estoque.js:57-61`) |
| Quem movimenta | `estoque.editar` → dono e gestor (`services/permissoes.js:80`). Funcionário: nenhum módulo (`permissoes.js:90-94`) |
| Por que o funcionário não dá baixa | `docs/decisions.md:65-66`: "Funcionário não baixa estoque do catálogo… `materiais=[]` forçado; aprovação de pendente fica trivial". Hoje o backend **recusa explicitamente** (400 `materiais_nao_permitidos`) em vez de zerar em silêncio (`routes/servicos.js:172-181`) |
| Escopo | **Por EMPRESA**: `Material.empresaId` + `@@unique([empresaId, nome])` (`schema.prisma:174,189`). **Não há** estoque por técnico nem por veículo |
| Alerta de mínimo | Só após baixa por serviço (`services/estoque.js:108`); entrada/ajuste manual **não** dispara. Destinatários: `usuario.admin === true` (`services/notificacao.js:53-54`) → **gestor não recebe** |
| Bot + catálogo | Material fora do catálogo **aborta o registro** no WhatsApp (`services/inbound.js:167-174`); valor usa **custo** `precoUnit` (`services/catalogo.js:201-203`) |

### 3.6 Comissão e pagamento

- Fórmula: `valorLiquido = valorCobrado − valorMaterial` (`routes/servicos.js:186`; `services/inbound.js:177`); `comissaoGerada = valorLiquido × comissao/100` arredondado a 2 casas (`routes/servicos.js:187`; `services/inbound.js:181`).
- **É snapshot**, gravado em `Servico.comissaoGerada` no create (`schema.prisma:136`; `routes/servicos.js:213`). Nunca recalculado: `PATCH /tecnicos/:id` altera `comissao` sem tocar em serviços passados (`routes/tecnicos.js:513,532`); a aprovação (T4) só muda `status` (`routes/servicos.js:265-268`).
- Saldo devido = `Σ comissaoGerada (status ativo, sem recorte de período) − Σ Pagamento.valor (histórico inteiro)` → `saldoPendente` (`routes/tecnicos.js:202-220`; `:463-489`; `routes/account.js:177-196`).
- `Pagamento` é mínimo: `valor`, `descricao`, `criadoEm` (`schema.prisma:305-316`). Sem período, sem vínculo a serviços, sem status, **sem estorno/exclusão** (só `POST /pagamentos`, `routes/tecnicos.js:543`; o único `deleteMany` é o expurgo de conta em `routes/account.js:95`).
- **Não existe fechamento de período nem conciliação**: nenhuma entidade de competência, nenhum "travamento" de mês.

### 3.7 Ponto e jornada

| Aspecto | Evidência |
|---|---|
| 4 batidas, ordem fixa | `entrada → almoco_saida → almoco_volta → saida` (`services/ponto.js:147-189`); UI `MeuPonto.jsx:23-28` |
| `RegistroPonto` | Agregado do **dia**, `@@unique([tecnicoId, data])` (`schema.prisma:372-389`) — 4 timestamps + `totalMinutos` + `horaExtraMinutos` |
| `BatidaPonto` | Prova **por evento**: hora do servidor, lat/lng/precisão, selfie, origem (`schema.prisma:394-408`) |
| Cálculo | Só na 4ª batida: `total = (saida−entrada) − (voltaAlmoço−saídaAlmoço)` (`services/ponto.js:176-177`); `HE = max(0, total − jornada)`, `saldo = total − jornada` (`:52-59`); jornada por modalidade `clt 480 / clt_meio 360 / clt_12x36 720` (`:30-34`), `intermitente`/`autonomo` sem banco (`:37-39,55`) |
| Agregação mensal | `resumoMes` itera **apenas os registros existentes** (`services/ponto.js:65-88`) |
| Quem vê | Banco de horas: `ponto.ver` → dono/gestor (`routes/tecnicos.js:378,405`). Funcionário: só o dia (`GET /ponto/hoje`, `routes/tecnicos.js:626-637`) — conforme `docs/decisions.md:38-40` |
| Esquecimento de batida | Dia sem `saidaEm` fica com `totalMinutos = null` → `resumoMes` conta 0 (`ponto.js:71`) → saldo do dia = **−jornada inteira**. Não há alerta nem correção |
| Correção manual | **NÃO EXISTE.** `ponto.editar` está no catálogo (`permissoes.js:40`) mas nenhuma rota o consome (busca em `src/routes`: só `requirePermissao('ponto','ver')` em `tecnicos.js:378,405`) |
| Feriado / falta / atestado / férias | **Nenhum modelo ou campo** (`schema.prisma:372-408`). Dia sem registro simplesmente não existe no cálculo |
| Campos de RH sem uso | `horaExtraPercentual`, `adicionalNoturno`, `salarioBase`, `valorHora`, `jornadaSemanalMin` (`schema.prisma:84-89`) — nenhum entra em `calcularDia` (`ponto.js:52-59`). Não há folha |
| Ponto pelo WhatsApp | `services/inbound.js:93-108`; com telefone em N empresas usa **`vinculos[0]`** (`:99-100`) e **não cria `BatidaPonto`** (só o painel cria, `routes/tecnicos.js:594-605`) |
| Anti-fraude | Selfie + geo obrigatórias no fluxo do painel (`MeuPonto.jsx:122-133`), aviso LGPD na 1ª vez (`:95-119`); expurgo aos 365 dias (`services/agendador.js:168,217-241`) |
| Relatório | PDF/CSV mensal por técnico (`services/relatorio.js:242,358`) com ressalva "**não substitui o ponto oficial para fins trabalhistas/jurídicos**" (`:280`) |

### 3.8 Avaliação do cliente

| Aspecto | Evidência |
|---|---|
| Quando agenda | T1 (`routes/servicos.js:235-242`), T4 (`:278-285`), bot (`services/inbound.js:205-212`) — sempre condicionado a `clienteTelefone` |
| Atraso | `agora + reviewDelayHoras` (default 2h) (`services/avaliacao.js:28-33`; `schema.prisma:47`) |
| Unicidade | `servicoId @unique` (`schema.prisma:341`) + `upsert` idempotente (`services/avaliacao.js:35-46`) |
| Canal | **WhatsApp e nada mais** (`services/avaliacao.js:91` → `whatsapp/gateway.js:73-91`) |
| Disparo | Cron a cada 5 min, lote de 50, `orderBy agendadoPara asc` (`services/avaliacao.js:59-69`; `services/agendador.js:361-372`) |
| Canal desligado (`reviewAtivo=false`) | Marca `'cancelada'` e sai da fila (`services/avaliacao.js:79-85`). Empresa **sem** linha `EmpresaWhatsapp` → `cfg` é null → **envia assim mesmo** (`:79`) |
| Cliente não responde | Fica `'enviada'` **para sempre** — nenhum job seta `'expirada'` (busca global: `'expirada'` só aparece em `schema.prisma:337` como comentário e em `Cliente.jsx:43` como rótulo de UI). Aos 180 dias a LGPD anonimiza telefone/nome/comentário mantendo o status (`services/agendador.js:163,191-194`) |
| Falha de envio | Backoff fixo de 1h, tentativas **infinitas**, sem desistência — o próprio código admite que a política é decisão de produto (`services/avaliacao.js:99-112`) |
| Captura da resposta | Global por telefone, busca `status:'enviada'`, aceita 1–5 ou estrelas (`services/avaliacao.js:132-166,193-201`) |
| Serviço refeito | Sem vínculo de retrabalho — novo `Servico` gera nova `Avaliacao`; o cliente recebe **duas** solicitações e nada indica que é o mesmo trabalho |

### 3.9 Relatórios e fechamento

- PDF de repartição: `gerarRelatorioPDF(inicio, fim, empresaId)` (`services/relatorio.js:15`), filtro `status:'ativo'` + `criadoEm` no intervalo (`:19`).
- Conteúdo: Resumo Geral — Total de Serviços, Receita Bruta, Custo de Materiais, Receita Líquida, Ticket Médio (`:79-85`); "Repartição por Técnico" — Serviços/Bruto/Material/Líquido/% (`:100-167`); Listagem de serviços (`:172-199`). **Não contém comissão nem pagamentos.**
- Quem gera: `GET /relatorio/pdf` exige `financeiro.ver` (`routes/estoque.js:261`) → dono e gestor (`permissoes.js:81`). UI: `Reparticao.jsx:45-67`.
- Período: livre, `inicio`/`fim` obrigatórios (`routes/estoque.js:263-266`); painel abre em início-do-mês → hoje (`Reparticao.jsx:25-26`). Não há período travado.
- Verdade financeira: `valorLiquido = cobrado − material(custo)`; no dashboard `lucro = receitaLiquida − comissões` e `margemLucro` sobre a **bruta** (`routes/servicos.js:456-461`). Não entram salários, impostos, despesas nem o custo das **entradas** de estoque.
- Data usada é sempre `criadoEm` (data do **registro**), não a data de execução — não existe campo de data de execução (`schema.prisma:123-169`).

---

## 4. Comportamento atual (síntese operacional)

1. **O sistema é um livro-caixa de campo, não um despachante.** Todo serviço nasce completo (local, descrição, valor, cliente) e já com comissão calculada. O "ciclo de vida" real tem um único ponto de decisão humana: a aprovação, e ela só existe para o papel `funcionario` com o toggle ligado.
2. **Dois canais de entrada com regras diferentes.** Painel respeita `aprovacaoServico`; o bot WhatsApp não — sempre grava `ativo` (`services/servico.js:27-56`). O bot está inerte por decisão de produto (`services/inbound.js:48-49`; `docs/decisions.md:53-55`).
3. **`ativo` é o único estado que existe financeiramente.** Todos os oito pontos de agregação filtram `status:'ativo'`, incluindo — sem que a decisão esteja registrada — o novo `em_andamento`.
4. **Estoque é da empresa, movimentado só por dono/gestor,** com saída automática amarrada ao ciclo do serviço e entrada exclusivamente manual.
5. **Comissão é imutável por design** (snapshot no create); pagamento é um lançamento livre; o saldo é vitalício e não existe fechamento.
6. **Ponto é uma máquina de 4 passos por dia, sem escape:** sem correção, sem justificativa, sem feriado, sem falta.
7. **Avaliação é WhatsApp-only, em fila por due-time,** com uma avaliação por serviço e sem ciclo de encerramento.

---

## 5. Problemas identificados

| # | Severidade | Problema | Evidência |
|---|---|---|---|
| P1 | **Alta** | Avaliação marcada `'enviada'` sem ter sido enviada. `enviarMensagem` **retorna `null` sem lançar** quando não há instância conectada (`whatsapp/gateway.js:86-89`); o chamador então grava `status:'enviada', enviadoEm` (`services/avaliacao.js:92-95`). Com o WhatsApp desligado — o estado atual do produto — **toda** avaliação agendada vira "enviada" fantasma. O cron roda mesmo com `WHATSAPP_HABILITADO` off (`services/agendador.js:361-372`; a flag só protege o inbound) | ver evidências |
| P2 | **Alta** | `rejeitado` é terminal absoluto: sem edição, sem reabertura, sem motivo e sem notificar o funcionário. O trabalho executado desaparece do sistema financeiro e a única saída é redigitar tudo | `routes/servicos.js:262,303`; ausência de `PATCH /servicos/:id` |
| P3 | **Alta** | Baixa de estoque com saldo insuficiente é **truncada em silêncio** e a falha da baixa é engolida pelo `catch` — o serviço fica registrado com material que nunca saiu do estoque | `services/estoque.js:49-50,109-115` |
| P4 | **Alta** | Não existe correção de ponto. Uma batida esquecida vira −jornada inteira no banco de horas e não há mecanismo algum de ajuste, apesar de `ponto.editar` existir no RBAC | `services/ponto.js:71,176-182`; `permissoes.js:40` sem consumidor |
| P5 | Média | Fila de aprovação sem SLA e com `take: 200`: acima disso a fila trunca sem sinal e pendentes ficam indefinidamente | `routes/servicos.js:134`; `agendador.js:355-397` |
| P6 | Média | `DELETE /servicos/:id` não estorna estoque nem pagamentos: a movimentação sobrevive com `servicoId = null` | `routes/servicos.js:327`; `schema.prisma:202` |
| P7 | Média | Rejeitados são invisíveis no painel do gestor: `GET /servicos` filtra `ativo` por padrão e nenhuma tela envia `?status=` | `routes/servicos.js:76`; `Servicos.jsx:242-247` |
| P8 | Média | Alerta de estoque baixo vai só para `admin:true` — o **gestor**, que é justamente quem repõe, não é notificado; e entrada/ajuste manual nunca dispara reavaliação | `services/notificacao.js:53-54`; `routes/estoque.js:220-227` |
| P9 | Média | `em_andamento` sai de toda agregação financeira: a receita "desaparece" enquanto o serviço está em execução, e isso não está registrado em `decisions.md` | `routes/servicos.js:419,76` vs `docs/decisions.md:49` |
| P10 | Média | Ponto por WhatsApp com telefone em N empresas usa `vinculos[0]` — bate na empresa errada silenciosamente — e não gera `BatidaPonto` (sem prova, invisível na lista do dia) | `services/inbound.js:99-105`; `routes/tecnicos.js:594` |
| P11 | Baixa | `valorMaterial` digitado no painel é independente dos materiais selecionados para baixa — dois números que deveriam concordar e não são conciliados | `routes/servicos.js:36,186` vs `:231-232` |
| P12 | Baixa | Notificação `novo_servico` é oferecida como preferência mas **nunca é emitida** por ninguém | `routes/admin.js:62`; `services/notificacao.js:11` (zero produtores) |
| P13 | Baixa | Data de competência é `criadoEm` (registro), não a data de execução — serviço do dia 30 registrado no dia 1º cai no mês errado | `services/relatorio.js:19`; `schema.prisma:123-169` |

---

## 6. Causas prováveis ou confirmadas

- **Confirmada (P1):** o gateway foi desenhado para ser tolerante a falhas (`logger.warn` + `return null`, `gateway.js:87-88`) enquanto o chamador presume exceção em caso de falha (`avaliacao.js:97` só trata `catch`). Contrato de erro divergente entre camadas.
- **Confirmada (P2/P3, por decisão registrada):** `docs/decisions.md:50-51,65-66` estabeleceu que efeitos colaterais migram para a aprovação e que o funcionário não movimenta estoque. A aprovação foi implementada como um *gate binário*; o caminho de correção nunca foi escopado porque o cenário pressuposto era "aprovação trivial, sem estoque".
- **Confirmada (P9):** `em_andamento` é aditivo e posterior (`schema.prisma:145-146`, F9/M3), enquanto os filtros `status:'ativo'` foram escritos na fase RBAC anterior (`decisions.md:61-64`). O novo estado herdou o comportamento de exclusão sem revisão.
- **Provável (P4/P12):** `ACOES_POR_MODULO` e `PREFERENCIAS_PADRAO` foram definidos como catálogo-alvo do produto, à frente da implementação — `ponto.editar` e `novo_servico` são contratos de UI/RBAC ainda sem back-end.
- **Provável (P5/P7):** a fila de aprovação foi construída como caixa de entrada operacional ("esvaziar hoje"), não como registro auditável — daí `take:200`, ausência de paginação e ausência de tela para o histórico de rejeitados.
- **Confirmada (P8):** `notificarAdmins` filtra `admin:true` (`notificacao.js:54`), campo mantido "por compat = papel dono" (`decisions.md:22`); o papel `gestor` é posterior e não foi incluído nos destinatários.

---

## 7. Contradições

| # | Contradição | Lado A | Lado B |
|---|---|---|---|
| C1 | Status de avaliação | `schema.prisma:337`: `"pendente" → "enviada" → "respondida" \| "expirada"` | Código grava `'cancelada'` (`avaliacao.js:83`) e **nunca** `'expirada'` |
| C2 | Status na UI | `Cliente.jsx:43-48` conhece `expirada` | Não conhece `cancelada`; cai no fallback e exibe **"Agendada"** (`Cliente.jsx:177`) |
| C3 | Estados documentados | `docs/decisions.md:49`: `ativo`/`pendente`/`rejeitado` | `schema.prisma:145-147` acrescenta `em_andamento` |
| C4 | Alcance da aprovação | `decisions.md:48-49`: "toggle por empresa" | O bot ignora o toggle e grava `ativo` (`services/servico.js:27-56`) |
| C5 | Tipo `ajuste` | `schema.prisma:198` e `routes/estoque.js:211` aceitam `'ajuste'` | O painel converte ajuste em entrada/saída **antes** de enviar (`CatalogoModais.jsx:290-302`) → o tipo `'ajuste'` praticamente nunca é gravado pela UI |
| C6 | Semântica de "Repartição" | Tela intitulada "Repartição — **Fechamento por técnico**" (`Reparticao.jsx:72-73`) | Exibe **receita líquida**, não comissão devida nem valor a pagar (`Reparticao.jsx:183`; `relatorio.js:100-167`) |
| C7 | `aprovadoPor` / `aprovadoEm` | `schema.prisma:148`: "Usuario que **aprovou** (auditoria)" | Também gravado na **rejeição** (`routes/servicos.js:304`) |
| C8 | RBAC vs rotas | `permissoes.js:37,40`: `servicos.editar`, `ponto.editar` | Nenhuma rota consome nenhuma das duas |
| C9 | Materiais do funcionário | `decisions.md:66`: "`materiais=[]` forçado" | Backend hoje **recusa com 400** em vez de zerar (`routes/servicos.js:172-180`) — decisão superada, log desatualizado |

---

## 8. Perguntas que dependem do usuário

> Todas as questões abaixo são **decisões de produto**. Tudo o que era descobrível no repositório já foi respondido acima.

**Ciclo do serviço e aprovação**
1. Serviço **rejeitado** deve permitir correção e reenvio pelo funcionário, ou é definitivo? Se permitir: `rejeitado → pendente` com edição, ou novo registro vinculado ao original?
2. A rejeição deve exigir **motivo** e **notificar** o funcionário?
3. Pendente tem **prazo**? O que acontece ao vencer — aprovação automática, escalonamento ou apenas alerta?
4. Serviço registrado pelo **bot** (quando religado) deve respeitar `aprovacaoServico`, ou continua entrando direto?
5. Serviço já `ativo` deve ser **editável** por dono/gestor (valor errado, técnico errado)? Se sim, a comissão recalcula ou o snapshot é preservado?
6. Enquanto o serviço está `em_andamento`, ele deve **sair** da receita do dia (comportamento atual) ou permanecer?

**Estoque**
7. Baixa com saldo insuficiente deve **bloquear** o registro do serviço, permitir estoque negativo, ou continuar clampando em 0 com alerta?
8. O **gestor** deve receber alerta de estoque baixo?
9. Existe necessidade de estoque **por técnico/veículo** (carga do carro), ou o estoque continua único por empresa?
10. Excluir um serviço deve **estornar** a baixa de estoque?

**Comissão e pagamento**
11. Deve existir **fechamento de período** (competência travada) para pagamento de comissão, ou o saldo vitalício atende?
12. O pagamento deve **quitar serviços específicos** (conciliação linha a linha) ou continua sendo um valor livre contra o saldo?
13. Pagamento lançado errado deve ser **estornável**?
14. `valorMaterial` deve ser **derivado** dos materiais do catálogo (hoje é digitado à parte no painel)?

**Ponto**
15. **Correção manual de ponto** por dono/gestor — com trilha de auditoria — deve existir? (`ponto.editar` já está previsto no RBAC.)
16. Batida esquecida: encerrar automaticamente na jornada contratual, marcar "inconsistente" ou manter −jornada?
17. **Feriado, falta, atestado e férias** devem existir como conceito, ou o banco de horas segue só sobre dias com batida?
18. Os campos de RH já modelados (`horaExtraPercentual`, `adicionalNoturno`, `salarioBase`, `valorHora`) devem entrar em algum cálculo, ou são apenas cadastrais?

**Avaliação**
19. Avaliação sem resposta deve **expirar** após N dias (e qual N)? Deve haver **lembrete**?
20. Envio deve ter **limite de tentativas** e desistência definitiva?
21. Deve existir canal alternativo (SMS, e-mail, link copiável no painel) enquanto o WhatsApp estiver desligado?
22. Se o mesmo cliente/serviço for **refeito**, deve haver uma segunda avaliação?

**Relatórios**
23. O PDF de "Repartição" deve incluir **comissão devida e pagamentos** (fechamento financeiro), ou permanece um relatório de receita?
24. A competência deve ser a **data de execução** do serviço (campo novo) em vez de `criadoEm`?

**Lacunas de negócio de campo — confirmar se são escopo** *(ver §10)*
25. Cliente cadastrado, agendamento, orçamento, garantia/retrabalho, recorrência/contrato, ordem de compra, deslocamento/km: quais **entram** e em que ordem?

---

## 9. Alternativas

**A. Correção de serviço rejeitado**
- A1 — `rejeitado → pendente` com edição pelo funcionário (fluxo de ciclo fechado; exige `PATCH /servicos/:id` self-scoped + campo `motivoRejeicao`).
- A2 — Rejeitado imutável + novo registro vinculado (`servicoOriginalId`) — preserva auditoria, duplica digitação.
- A3 — Manter como está e resolver por conversa fora do sistema — custo zero, perde rastreabilidade.

**B. Saldo insuficiente de estoque**
- B1 — Bloquear (409) e devolver a lista de faltantes — coerente com a recusa que o bot já faz para material fora do catálogo (`inbound.js:167-174`).
- B2 — Permitir negativo e sinalizar em `/estoque` — o saldo passa a refletir a realidade do campo.
- B3 — Manter clamp em 0 + notificação obrigatória de divergência — menor mudança, mantém o ledger "mentindo" menos.

**C. Ponto esquecido**
- C1 — Correção manual com auditoria (`AuditLog` já existe, `schema.prisma:530`) — atende compliance, exige tela.
- C2 — Auto-encerramento na jornada contratual com marca "presumido".
- C3 — Marcar o dia como "inconsistente" e excluí-lo do saldo até tratamento — evita penalizar o funcionário por erro de app.

**D. Avaliação sem resposta / canal desligado**
- D1 — Estado `expirada` por cron + limite de tentativas (fecha C1/C2 de uma vez).
- D2 — Não agendar avaliação quando o canal está indisponível (checar `ConexaoBot` antes de `agendarAvaliacao`) — evita o lixo do P1 na origem.
- D3 — Fazer `enviarMensagem` **lançar** quando não houver canal (corrige P1 no ponto exato, com risco de regressão nos demais chamadores: `agendador.js:129`, `inbound.js:238`).

**E. Fechamento financeiro**
- E1 — Entidade `FechamentoPeriodo` (competência travada + snapshot de comissões) — habilita conciliação real.
- E2 — `Pagamento` ganha `periodoInicio/Fim` e vira "quitação de período" sem travar nada — incremento barato.
- E3 — Manter saldo vitalício e apenas exibir o extrato por período no PDF.

---

## 10. Recomendação

**Ordem de ataque proposta (não é decisão tomada; cada item depende das respostas de §8):**

1. **P1 primeiro (D2 + D3).** É o único problema que produz dado **falso** hoje, em produção, sem que ninguém veja: avaliações marcadas como enviadas que nunca saíram. Baixo custo, correção pontual, e destrava qualquer análise futura de satisfação.
2. **P4 (C1) e P2 (A1)** são as duas lacunas que quebram o ciclo operacional para o usuário final — o funcionário fica sem saída em ambos os casos (ponto esquecido, serviço rejeitado). São também os dois pontos onde o RBAC **já** previu a capacidade (`ponto.editar`, `servicos.editar`) e o back-end não entregou: implementá-los fecha C8 sem inventar modelo novo.
3. **P3 (B1 ou B3)** antes de qualquer funcionalidade nova de estoque: enquanto a baixa truncar em silêncio, todo indicador de consumo é aproximação.
4. **Alinhar `decisions.md`** com o código quanto a C3, C4 e C9 antes da próxima rodada — três decisões já superadas pelo código estão registradas como vigentes, e o protocolo diz que decisão registrada não é reinvestigada.
5. **Só então** discutir as lacunas do §10 (cliente, agendamento, orçamento). Introduzir agendamento sobre um modelo que hoje exige `valorCobrado` na criação (`routes/servicos.js:35`) exigirá reescrever a máquina de estados inteira — é a mudança estrutural mais cara do backlog e não deve começar com quatro buracos abertos no ciclo atual.

---

## 11. Impactos cruzados

**Cadeia de causa-efeito real do sistema (mandato #9):**

```
[Cadastro de Material]  ──► precoUnit ──► resolução no bot (catalogo.js:201) ──► valorMaterial
        │                                                                              │
        │ entrada manual (única forma de entrar)                                        ▼
        ▼                                                              valorLiquido = cobrado − material
   quantidadeAtual                                                                     │
        │                                                                              ▼
        │                                                     comissaoGerada = líquido × comissão%  ◄── Tecnico.comissao
        │                                                              (SNAPSHOT, nunca recalculado)   (no instante do create)
        │                                                                              │
        ▼                                                                              ▼
   [Servico criado] ──status?──┬── ativo ─────────────────────────────────────► agregações (8 pontos)
        │                      │       │                                                │
        │                      │       ├──► darBaixaPorServico ──► quantidadeAtual↓ ──► alertarEstoqueBaixo ──► Notificacao(admin:true)
        │                      │       └──► agendarAvaliacao ──► cron 5min ──► enviarMensagem ──► ConexaoBot.instanceName
        │                      │                                                              (null ⇒ P1: "enviada" falso)
        │                      └── pendente ──► fila /servicos/pendentes ──► APROVAR ──► [mesmos 2 efeitos, tardios]
        │                                                             └────► REJEITAR ──► ⛔ fim de linha
        ▼
   DELETE ──► Servico some das agregações │ MovimentacaoEstoque sobrevive com servicoId=null (estoque NÃO volta)

[Batida de ponto] ──► RegistroPonto(dia) + BatidaPonto(prova) ──► 4ª batida ──► totalMinutos ──► calcularDia ──► banco de horas ──► PDF/CSV
        │                                                                                  ▲
        └──► (WhatsApp: não gera BatidaPonto, escolhe vinculos[0])                   Tecnico.modalidade/jornadaDiariaMin
                                                                                     (mudar depois ⇒ recalcula o passado)

[Pagamento] ──► Σ valor (vitalício) ──► saldoPendente = Σ comissaoGerada(ativo) − Σ pagamentos   (sem período, sem conciliação)
```

**Acoplamentos onde funcionalidade futura vai esbarrar:**

| Acoplamento | Onde | Quem esbarra |
|---|---|---|
| `status:'ativo'` replicado em **8 lugares** sem constante compartilhada | `servicos.js:76,419`; `relatorio.js:19`; `agendador.js:53`; `tecnicos.js:193,442,448,458`; `account.js:154,160,165,170` | Qualquer estado novo (`agendado`, `orcamento`, `garantia`) precisará tocar todos os 8 — e o esquecimento é silencioso (foi exatamente o bug corrigido em `agendador.js:48-50`) |
| Comissão como snapshot no `create` | `servicos.js:187`; `inbound.js:181` | Orçamento aprovado ⇒ serviço, ou serviço que muda de valor: exigirá decidir *quando* congelar |
| `valorCobrado` obrigatório na criação | `servicos.js:35`; `conversa.js:91` | **Agendamento** e **orçamento** são incompatíveis com o modelo atual sem mudança estrutural |
| Cliente é texto livre em `Servico` | `schema.prisma:139-140` | Histórico do cliente, recorrência, garantia e reincidência dependem de um `Cliente` que não existe |
| Avaliação `1:1` com serviço | `schema.prisma:341` | Retrabalho/garantia gerará avaliação duplicada ao mesmo cliente |
| `MovimentacaoEstoque` sem `empresaId` (isolado só pela relação) | `db/tenant.js:15-17` | Qualquer relatório de estoque que consulte movimentações diretamente precisa filtrar pelo pai — risco de vazamento cross-tenant |
| Ponto de 4 batidas fixas | `services/ponto.js:147-189` | Múltiplos intervalos, jornada 12x36 real, plantão e sobreaviso não cabem |
| `Empresa.aprovacaoServico` binário e só para `funcionario` | `servicos.js:163,189` | Aprovação por valor, por tipo de serviço ou por cliente exigirá substituir o booleano |
| Gateway WhatsApp como único canal de saída | `gateway.js:73-91` | Toda notificação ao cliente (agendamento, orçamento, garantia) herda o P1 |

---

## 12. Grau de confiança

| Bloco | Confiança | Base |
|---|---|---|
| Estados/transições de `Servico` e efeitos colaterais | **Alta** | Todas as rotas de mutação lidas integralmente; nenhum caminho de escrita de `status` fora dos citados |
| Atribuição vs registro pós-fato | **Alta** | Ausência confirmada de campo de despacho no schema completo + schema Zod das rotas |
| Aprovação (fluxo, permissões, ausência de reabertura/prazo) | **Alta** | Rotas + RBAC + agendador lidos por inteiro |
| Estoque (tipos, clamp, escopo, permissões) | **Alta** | Serviço e rota lidos integralmente |
| Comissão/pagamento (snapshot, saldo vitalício, sem fechamento) | **Alta** | Todos os pontos de cálculo e o único produtor de `Pagamento` verificados |
| Ponto (4 batidas, cálculo, ausência de correção/feriado) | **Alta** | Serviço + rotas + RBAC cruzados; ausência de rota verificada por busca |
| Avaliação (ciclo, canal, `cancelada` vs `expirada`) | **Alta** | Serviço + cron + UI cruzados |
| **P1 (avaliação "enviada" falsa)** | **Alta na leitura do código; Média na manifestação em produção** | O caminho `instanceName === null → return null → update 'enviada'` é inequívoco (`gateway.js:86-89` + `avaliacao.js:91-95`); não foi executado nem testado aqui |
| Relatórios/PDF (conteúdo, período, verdade financeira) | **Alta** | Gerador lido integralmente |
| Lacunas do §10 | **Alta quanto à ausência no código** (busca em schema + rotas); **[INFERÊNCIA] quanto à necessidade do negócio** | Sem acesso à web nesta tarefa |

---

## 13. Pontos não verificados

1. **Comportamento em execução.** Nada foi rodado: P1, P3 e P10 são conclusões por leitura de código, não observações de runtime.
2. **`prisma/migrations/*.sql`** — não confrontei o SQL aplicado com `schema.prisma`; possíveis drifts de coluna/índice não foram checados (o próprio schema admite um índice redundante, `:166-168`).
3. **`prisma/schema.sqlite.prisma`** — só verificado quanto a `aprovacaoServico` e ao comentário de status; divergências de dev vs prod não auditadas.
4. **Suíte de testes de integração** (`chaveiro-bot/test/integration/*`) — vi apenas os nomes e trechos referentes a `aprovacaoServico`; não confirmei quais transições estão cobertas.
5. **`routes/whatsapp.js`** (288 linhas) e `services/whatsapp/cloud-gateway.js` — o caminho `provider='cloud'` de envio de avaliação **não** foi lido; P1 foi verificado no caminho `evolution` (padrão).
6. **Telas não lidas integralmente:** `Estoque.jsx`, `Catalogo.jsx`, `Dashboard*.jsx`, `Tecnicos.jsx`, `PerfilTecnico.jsx`, `Avaliacoes.jsx`, `Configuracao.jsx` (li só os trechos de chamada de API).
7. **`services/billing.js` / `routes/billing.js`** (assinatura Stripe) — fora do mandato; não sei se o status da assinatura bloqueia alguma operação do ciclo operacional.
8. **RLS** (`prisma/rls/enable_rls.sql`) — a existência é citada em `db/tenant.js:59-66` e no schema; não verifiquei se está ativa nem as policies.
9. **`docs/functionality-discovery/evidence/ROUND-00-*.md`** — existem três relatórios da Rodada 0 que **não** foram lidos (só os nomes e duas linhas via busca). Pode haver sobreposição ou divergência com este relatório.
10. **Realidade operacional de empresas prestadoras de serviço** — sem acesso à web. Toda afirmação sobre "o que um negócio de campo tipicamente precisa" está marcada `[INFERÊNCIA]` no §10 e foi convertida na pergunta 25 do §8.

---

## Anexo — §10 do mandato: lacunas operacionais (verificadas antes de afirmar ausência)

| Conceito | Existe? | Verificação | Pergunta ao usuário |
|---|---|---|---|
| **Cliente cadastrado** | **Não.** Só `clienteNome`/`clienteTelefone` como texto livre em `Servico` | `schema.prisma:139-140`; nenhum `model Cliente` (busca `^model ` em todo o schema) | Cliente deve virar entidade (histórico, dedup, reincidência)? |
| **Agendamento / ordem de serviço futura** | **Não.** Nenhum campo de data futura; `valorCobrado` obrigatório na criação | `schema.prisma:123-169`; `routes/servicos.js:35` | O produto deve passar a **despachar** trabalho, além de registrar? |
| **Orçamento / proposta** | **Não.** Nenhum modelo, nenhum status de proposta | busca `orcament` em `src/` e schema: zero | Orçamento aprovado deve virar serviço automaticamente? |
| **Recorrência / contrato** | **Não.** "Contrato" existe apenas como **rótulo de texto** do campo `local` | `services/conversa.js:43`; `NovoServicoFuncionario.jsx:11` | Cliente com contrato mensal deve gerar serviços recorrentes? |
| **Garantia** | **Não.** Nenhum campo de prazo ou vínculo | busca `garantia`: zero em `src/` e schema | Serviço tem prazo de garantia rastreável? |
| **Retrabalho / reincidência** | **Não.** Sem `servicoOriginalId`; retrabalho gera serviço novo, com receita e comissão cheias | `schema.prisma:123-169` | Retrabalho deve ser vinculado e gerar comissão zero/parcial? |
| **Ordem de compra / fornecedor** | **Não.** Entrada de estoque é digitação manual pura | `routes/estoque.js:202-241`; `schema.prisma:172-208` | Reposição deve ter fluxo de compra (fornecedor, custo, NF)? |
| **Deslocamento / km / rota** | **Não.** Existe `endereco` (`schema.prisma:130`) e lat/lng **apenas do ponto** (`:400-401`), nunca do serviço | schema completo | Deslocamento é custo/receita a controlar? |
| **Despesa operacional** | **Não.** O "lucro" é `receitaLíquida − comissões`, sem qualquer despesa | `routes/servicos.js:459` | O sistema deve ser a verdade financeira completa ou só do faturamento de campo? |

*(A coluna "Existe?" é **fato verificado no repositório**. A relevância de cada item para um negócio de campo é `[INFERÊNCIA]` e por isso foi convertida em pergunta — pergunta 25 do §8.)*
