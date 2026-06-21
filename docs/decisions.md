# Log de decisões — ChaveiroBot

Registro persistente das decisões de arquitetura/trade-off (conforme o Guia para IAs do
README). Decisão registrada aqui não é reinvestigada em tarefas futuras.

---

## 2026-06-20 — RBAC, contas de funcionário, ponto pelo painel e WhatsApp "Em breve"

Feature grande (branch `feat/numero-unico-rh-ponto-avaliacoes-google`). Foco: tornar o
**painel** o canal principal (WhatsApp vira feature futura, desligado mas com estrutura
pronta). Decisões fechadas com o dono do produto:

### Permissões (RBAC)
- **Modelo:** papéis (`dono` / `gestor` / `funcionario`) **+ toggles por módulo**
  customizáveis pelo dono. Não foi escolhido ACL por ação avulsa (complexo demais) nem
  papéis 100% fixos (inflexível).
- **Preset Gestor (aprovado):** vê/edita serviços, técnicos, estoque, avaliações, ponto e
  aprovações; **vê** financeiro (não edita); **não** gerencia usuários nem configuração.
- **Dono é imutável:** sempre grant total; overrides nunca reduzem o dono (evita o dono se
  trancar pra fora). Implementado em `services/permissoes.js`.
- **`admin` (booleano) mantido por compat** = `papel === 'dono'`. Backfill da migration:
  `admin=true → dono`, demais → `gestor`. Funcionário é o papel novo.
- **Segurança:** permissão é **sempre** checada no servidor (`requirePermissao`); esconder
  no front não é segurança. Funcionário é **self-scoped** no backend (`req.user.tecnicoId`),
  nunca confia em `tecnicoId` vindo do cliente.

### Contas de funcionário
- **Todo técnico vira usuário** (`Tecnico.usuarioId`, papel `funcionario`).
- **Login por telefone + PIN provisório**, com **troca de senha forçada no 1º acesso**
  (`Usuario.senhaProvisoria`). Decidido assim porque o WhatsApp (que entregaria OTP) está
  desligado. Técnicos antigos ganham botão "criar acesso".
- Telefone repetível entre empresas (modelo número único) → login resolve por telefone e,
  se houver vínculo em mais de uma empresa, **desambigua** (mesma filosofia do bot).

### Escopo do painel do funcionário
- Pode: **bater ponto**, **registrar os próprios serviços**, **ver as próprias métricas**,
  **editar o próprio perfil** (foto/dados).
- **NÃO vê o banco de horas** (saldo/hora extra) — só as **batidas do dia** (confirmação).
  O banco de horas é exclusivo do dono/gestor.

### Ponto pelo painel
- **Botão + geolocalização + selfie** (anti-fraude forte). Prova por batida na nova tabela
  `BatidaPonto` (hora do servidor + lat/lng + selfie), agregado do dia continua em
  `RegistroPonto`. Reusa o cálculo de `services/ponto.js`.

### Serviço registrado pelo funcionário
- **Toggle por empresa** (`Empresa.aprovacaoServico`): "entra direto" **ou** "fica pendente
  até aprovação" do dono/gestor. `Servico.status` (`ativo`/`pendente`/`rejeitado`).
- Serviço `pendente` **não** gera comissão nem baixa estoque — os efeitos colaterais
  acontecem **na aprovação**. Não altera a matemática de serviços já existentes.

### WhatsApp
- **Estrutura preservada atrás de flag**; no painel aparece **"Em breve" desabilitado**.
  Bot fica inerte (webhook responde 200 sem processar). Religar é tarefa futura.

### Execução
- Fases A→G, multiagente (ruflo/Agent tool). Migration **aditiva** (sem DROP) — segura.

### Decisões tomadas durante a execução (registro)
- **Agregações de dinheiro filtram `status:'ativo'`** (dashboard, `/tecnicos`, perfil do técnico,
  relatório PDF). Não altera serviços já existentes (todos nascem/migram como `ativo`) — só
  impede que pendentes/rejeitados inflem receita/comissão. Efeitos colaterais (baixa de
  estoque + agendamento de avaliação) migram do cadastro para a **aprovação**.
- **Funcionário não baixa estoque do catálogo** ao registrar serviço (não tem acesso a
  estoque): `materiais=[]` forçado; aprovação de pendente fica trivial (sem estoque).
- **Ordem de rota**: `GET /servicos/pendentes` declarado ANTES de `/servicos/:id` (senão
  `:id` captura "pendentes").
- **Login do funcionário**: username gerado `tec<digitos do telefone>` (chave interna única);
  o login de fato é por telefone + PIN. Desambiguação por empresa quando o telefone repete.
- **WhatsApp**: a implementação real de `ConfiguracaoBot` foi preservada como
  `ConfiguracaoBotLegado` no mesmo arquivo; o `default` virou a tela "Em breve". Religar =
  trocar o export + ligar `WHATSAPP_HABILITADO=true`.
- **Self-scope do funcionário** é sempre derivado de `req.user.tecnicoId` (do banco), nunca
  de input do cliente — vale para ponto, métricas, próprios serviços e registro de serviço.

### Status: implementação concluída (Fases A–G)
Backend: 166 testes unitários ✓, 0 erros de lint. Painel: build ✓, 19 testes ✓.
Pendências conhecidas em "próximos passos" do resumo final (ex.: rodar `test:integration`
contra Postgres real; aplicar a migration em staging).
