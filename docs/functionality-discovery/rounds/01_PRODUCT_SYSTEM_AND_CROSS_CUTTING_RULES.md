# ROUND-01 — Constituição Funcional do Produto, Papéis, Navegação e Regras Transversais

## 1. Identificação e status

| Campo | Valor |
|---|---|
| Rodada | 01 |
| Tema | Constituição Funcional do Produto, Papéis, Navegação e Regras Transversais (**DEC-001**) |
| Estado | `AGUARDANDO RESPOSTA DO USUÁRIO` — Lote 1 entregue |
| Data de abertura | 2026-08-05 |
| Commit-base | `30bf545` (código idêntico à tag `project-baseline-v1`) |
| Worktree / branch | `admai-worktrees/agent-environment` · `fix/seguranca-criticos` |
| Agentes utilizados | 6 (ver §5) |
| Aprovação do usuário | **Não aprovada.** Nenhuma decisão de conteúdo desta rodada foi tomada |

**Decisões já registradas nesta rodada:** DEC-001 (tema) e DEC-002 (staging como gate obrigatório) — `00_DECISION_LOG.md`. Ambas respondem, respectivamente, Q-001 e Q-006.

---

## 2. Objetivo da rodada

Fixar as regras estruturais comuns que todas as rodadas seguintes (Login, Cadastro, Painel, Serviços, Equipe, Estoque, Relatórios, IA) terão de respeitar. A rodada **não** desenha essas funcionalidades — constrói a constituição funcional que impede que elas produzam soluções contraditórias entre si.

Ao final, precisam estar definidos e aprovados os 26 itens listados no prompt de abertura: posicionamento, público, problema central, prioridade dos objetivos, escopo empresarial, modelo de papéis, distinção identidade/conta/papel/cargo/função/vínculo, acesso e navegação por papel, política de Voltar, preservação de estado, atualização automática, formulários, validação, mensagens de erro, carregamento, notificações, busca e filtros, exclusão/arquivamento/desativação, formatos de dado, mobile-first, acessibilidade, RNF mínimos, feature flags, limites de coleta de dado pessoal, condições local/staging/produção e critérios de prontidão para planejamento técnico.

---

## 3. Escopo

Regras **transversais**: valem para mais de um módulo e condicionam qualquer especificação futura. Cada regra desta rodada precisa ser enunciável como uma frase que uma rodada futura possa citar e cumprir.

---

## 4. Fora de escopo

### 4.1 Fora de escopo da **sessão** inteira — COND-001

`[DECISÃO DO USUÁRIO]` (escopo de sessão, não de produto): **WhatsApp · planos · cobrança ·
relatórios** não são tratados nesta sessão. Não entram em nenhum lote desta rodada nem de
qualquer outra rodada desta sessão.

Consequência aplicada nesta correção: a `L1-Q2` original — *"Quem é o usuário pagante, e o produto
passa a ter caminho para cobrar?"* — foi **retirada**. Ela transformava um achado em pergunta de
implementação, que é matéria de rodada futura. Substituída por uma pergunta transversal sobre
papéis de decisão e de uso, que não toca em tela de cobrança nem paywall.

**Nenhum achado foi removido.** Toda a evidência de billing está preservada no candidato **C13**
(`00_CANDIDATE_BACKLOG.md`), a de WhatsApp em **C4**, a de relatórios em **C8** e em
`evidence/ROUND-01-EOS-DOMAIN-OPERATIONS.md` §3.9. As questões correspondentes (Q-003, Q-023,
Q-024) estão em "Adiadas" — **adiar não é decidir**: o que se decidiu foi *quando* tratar, não se
o achado é verdadeiro.

### 4.2 Fora de escopo da **rodada**

Reafirmado do prompt de abertura, sem exceção:

layout final do Login · etapas finais do Cadastro · máquina de estados detalhada dos Serviços ·
cadastro de membros · modalidades trabalhistas · gráficos específicos · IA de materiais · criação
técnica do staging · correção do `POST /me/documentos` · implementação de retenção · atualização
de textos jurídicos · alterações no design system · implementação de acessibilidade · correção de
bugs.

Esses assuntos aparecem nesta rodada **apenas** para definir regra transversal, dependência ou
rodada futura. **A aparição não é autorização de implementação.**

---

## 5. Agentes utilizados

Todos rodaram como subagente `Explore`, que **não possui ferramenta de escrita** — a regra "agentes são somente-leitura" vira garantia estrutural, não apenas instrução de prompt. Os relatórios foram **retornados** pelos agentes e persistidos verbatim pelo orquestrador, que é o writer único.

| Agente | Relatório | Confiança declarada |
|---|---|---|
| `EOS-Repository-Mapper` | `evidence/ROUND-01-EOS-REPOSITORY-MAPPER.md` | Alta na maioria dos 17 eixos |
| `EOS-Data-Architecture` | `evidence/ROUND-01-EOS-DATA-ARCHITECTURE.md` | Alta global |
| `EOS-UX-Mobile-Accessibility` | `evidence/ROUND-01-EOS-UX-MOBILE-ACCESSIBILITY.md` | Alta na leitura estática; **nada renderizado em navegador** |
| `EOS-Product-Discovery` | `evidence/ROUND-01-EOS-PRODUCT-DISCOVERY.md` | Muito alta em billing/WhatsApp; **nenhuma** para mercado |
| `EOS-Domain-Operations` | `evidence/ROUND-01-EOS-DOMAIN-OPERATIONS.md` | Alta |
| `EOS-Security-Privacy` | `evidence/ROUND-01-EOS-SECURITY-PRIVACY.md` | Alta no inventário; **nenhuma conclusão jurídica** |

**Não executados nesta passada, com motivo registrado:**

| Agente | Quando entra | Por que não agora |
|---|---|---|
| `EOS-QA-Acceptance` | Após as primeiras decisões aprovadas | Não há decisão a converter em critério de aceite antes das respostas do Lote 1 |
| `EOS-Adversarial-Reviewer` | Quando a especificação estiver madura | É o gate obrigatório antes da aprovação; rodar agora não teria alvo |
| `EOS-Official-Research` | Nos lotes que dependam de fonte oficial | O Lote 1 é posicionamento de produto — matéria exclusiva do usuário; nenhuma pergunta dele depende de fonte externa |

**Limitação real desta execução:** três agentes (`EOS-UX-Mobile-Accessibility`, `EOS-Security-Privacy`, `EOS-Product-Discovery`) foram interrompidos por limite de sessão do serviço no primeiro lançamento e **relançados do zero**. Nenhum resultado parcial foi aproveitado. O classificador de segurança do harness esteve indisponível na revisão de três subagentes — o orquestrador verificou independentemente os achados que sustentam decisões desta rodada antes de usá-los (ver §6, bloco "Verificação direta do orquestrador").

---

## 6. Evidências do repositório

Os seis relatórios em `evidence/ROUND-01-*` são a evidência primária desta rodada. Esta seção registra apenas o que o **orquestrador verificou diretamente** e os achados convergentes que sustentam o Lote 1.

### 6.1 Verificação direta do orquestrador

| Achado | Como verifiquei | Consequência |
|---|---|---|
| **O painel não tem nenhuma chamada a `/billing/*`** | `grep -i "billing\|assinatura\|checkout\|portal"` em `chaveiro-painel/src` → única ocorrência é o card "Plano e cobrança" com `breve: true` em `Configuracao.jsx:56-65` | Não existe caminho no produto para o cliente assinar ou gerenciar a assinatura. Confirmado depois pelos dois lados no relatório do `EOS-Product-Discovery` |
| **A retenção de selfie/geo do ponto ESTÁ implementada** | Leitura direta de `chaveiro-bot/src/services/agendador.js:160-241,374` — `RETENCAO_PONTO_DIAS=365`, `expurgarProvasPonto` apaga o arquivo no storage e nos 2 diretórios de disco e zera `selfieUrl`/`lat`/`lng`/`precisao`; cron `30 3 * * *` | **Corrigiu o candidato C2**, que afirmava o contrário com base em `docs/decisions.md:84-102` (registro de 2026-06-21, nunca atualizado) |
| **O aviso prévio de coleta no ponto ESTÁ implementado** | `chaveiro-painel/src/pages/MeuPonto.jsx:73` (`mostrarAviso`), `:303-330` (modal de 1ª vez), `:250-252` (texto permanente com link) | **Corrigiu o candidato C3**, pela mesma causa-raiz |
| **A Política de Privacidade publicada não menciona selfie, localização, geolocalização nem biometria** | `grep -i "selfie\|localiza\|geolocal\|biom"` em `chaveiro-painel/src/lib/legal.js` → **zero resultados**. A seção "8. Retenção e descarte" (`:70-75`) lista só Conta (12 meses), Clientes finais `[180 dias]`, Logs técnicos `[90 dias]` | O código retém e expurga a categoria mais sensível; o documento legal publicado silencia sobre ela |
| **Os textos legais servidos em produção têm 10 placeholders não preenchidos** | `grep -o "\[[A-Za-zÀ-ú0-9 ./@_-]\+\]"` em `legal.js` → `[NOME DA EMPRESA]`×3, `[NOME]`×2, `[valor]`, `[CNPJ]`, `[90 dias]`, `[180 dias]`, `[ ]` | Confirma C12 e agrava: dois dos placeholders são **prazos de retenção** |
| **Cinco padrões distintos de "funcionalidade indisponível" na UI** | `grep -i "breve\|indispon"` em `chaveiro-painel/src` | (1) `Documentos.jsx` degrada em estado; (2) `ConfiguracaoBot.jsx` tela "Em breve"; (3) `Configuracao.jsx` badge + toast; (4) `BotoesSociais.jsx` botão com título "— em breve"; (5) `avaliacoes/Google.jsx` toast de warning. Material direto para o Lote 12 |
| **Nenhuma referência a staging/preview em `.github/`** | `grep -i "staging\|homologa\|preview"` em `.github/` → zero | Sustenta **DEC-002** |
| **A passada mobile nunca foi feita de verdade** | `docs/TESTPLAN.md:148-175` declara: `resize_window` não derruba o viewport abaixo de `lg`; "não é possível uma passada visual mobile faithful aqui"; pendente render a 390px, fluxo de ponto nativo, PWA no Android | Sustenta o candidato C11 e a §27 |

### 6.2 Achados convergentes entre agentes independentes

Estes foram levantados por **mais de um agente**, com evidência compatível — o que eleva a confiança:

1. **`Tecnico.nivelAcesso` é um contrato quebrado.** O painel oferece `tecnico`/`gerente`/`admin` (`NovoTecnico.jsx:32-36`); o backend só reconhece a string `'gestor'` (`tecnicos.js:268-269`). Escolher "Administrador" cria um `funcionario`, silenciosamente. — `Repository-Mapper` P1, `Data-Architecture` C8, `Product-Discovery` P6.
2. **Dois vocabulários de autorização coexistem** (`Usuario.papel` e `Usuario.admin` legado), e o público de notificações depende exclusivamente do legado — o gestor nunca recebe alerta de estoque baixo. — `Repository-Mapper` P2, `Data-Architecture` P17, `Domain-Operations` P8.
3. **`AuditLog` tem 5 call sites, todos de gestão de usuário, e nenhum leitor.** Anonimização LGPD, exclusão de empresa, aprovação/rejeição de serviço e acesso a selfie não deixam rastro. — os três agentes de backend, independentemente.
4. **O `key={pathname}` em `App.jsx:371` remonta a árvore a cada navegação**, anulando qualquer preservação de estado que não esteja na URL ou em `localStorage`. — `Repository-Mapper` P4, `UX` P9/C6.
5. **`BackHeader` sem `para` empurra para `/configuracao`** em 13 telas, incluindo telas de topo de hierarquia; para o funcionário, `/configuracao` **não está no manifesto dele**. — `Repository-Mapper` P3, `UX` P6/P7/C10.
6. **Nenhuma retenção fora de três categorias.** Documentos do funcionário, foto de evidência, endereço do cliente, `AuditLog`, notificações, avaliações do Google e sessões crescem sem expurgo. — `Data-Architecture` §3.10, `Security-Privacy` §5.2.
7. **`Empresa.aprovacaoServico` é ignorado pelo caminho do bot** — serviço via WhatsApp nasce `ativo`, baixa estoque e gera comissão sem aprovação. — `Domain-Operations` C4, `Data-Architecture` P3.

### 6.3 Divergência entre agentes — registrada, não resolvida

`EOS-Domain-Operations` (P1) afirma que o cron de avaliação marca `status:'enviada'` **falsamente**, porque `enviarMensagem` retorna `null` sem lançar quando não há instância conectada (`gateway.js:86-89` + `avaliacao.js:91-95`). `EOS-Product-Discovery` (P4) descreve o mesmo caminho como "o job continua tentando enviar e **falha** na camada de gateway". As duas leituras são incompatíveis quanto ao resultado observável.

`[PENDENTE]` Nenhum dos dois executou o código. Não resolvi a divergência nesta rodada porque ela é matéria da rodada de Avaliações, não da constituição. Registrada aqui para não se perder.

---

## 7. Comportamento atual

Síntese consolidada. O detalhe com `arquivo:linha` está nos seis relatórios de `evidence/`.

**O produto que existe hoje é um painel web de gestão de equipe de campo, operado 100% por navegador.** O canal WhatsApp — apresentado como *o* diferencial no README e na landing — está inerte atrás de `WHATSAPP_HABILITADO` e sem superfície de religamento na UI *(achado preservado; canal `[ADIADO]` por COND-001)*. O trial de 14 dias existe, é testado, e **não expira na prática**: `Assinatura.status` nunca é lido para bloquear nada, e não há tela para assinar *(achado preservado em C13, `[ADIADO PARA RODADA FUTURA]`)*.

**Papéis.** O RBAC real tem exatamente três: `dono`, `gestor`, `funcionario` (`permissoes.js:55`), com 10 módulos × ações (27 pares) mais 5 capacidades `proprio`. **"Técnico" não é papel** — é uma entidade de operação/RH (`Tecnico`) ligada opcionalmente a um `Usuario`. Existem hoje **três vocabulários paralelos** para "o que a pessoa é": `Usuario.papel`, `Usuario.admin` (legado) e `Tecnico.nivelAcesso` (texto livre, praticamente morto).

**Identidade.** Uma pessoa = um `Usuario` global, ancorado em três chaves globais (`username`, `email`, `telefone` — todas `@unique` sem par por empresa). Mas uma pessoa = N `Tecnico`, um por empresa (`@@unique([empresaId, telefone])`). São dois modelos de identidade conflitantes no mesmo sistema, e o fluxo de desambiguação de login por empresa continua implementado embora o schema o proíba.

**Tenant.** Plano. `Empresa` tem 6 colunas de negócio e nenhuma noção de filial, unidade, loja ou equipe.

**Navegação.** `src/config/navigation.js` é fonte única real para BottomNav, Sidebar e "Mais", com guard por permissão e limite de 4 itens primários. Itens sem permissão **somem**. Mas 6 rotas autenticadas não constam de nenhum papel, e uma delas (`/configuracao/whatsapp`) não tem **nenhuma** entrada in-app.

**Autorização na UI.** Um único guard por permissão em 23 rotas (`/configuracao/usuarios`). O modelo é "o painel esconde, o backend impõe" — declarado em comentário no próprio código. O preço: todo 403 aparece como falha técnica, nunca como "você não tem acesso". O componente que diria isso (`FeedbackState state="permission-denied"`) existe e é código morto.

**Voltar.** Quatro padrões coexistem: rota fixa implícita `/configuracao` (13 telas), rota fixa explícita (8 telas), histórico real `navigate(-1)` (1 tela), e sem voltar (o resto).

**Estado.** Efêmero em quase tudo. Só o detalhe de `Servicos` e o filtro de `MeusServicos` vivem na URL. O `key={pathname}` garante que o resto seja descartado a cada navegação.

**Atualização.** Mount-only em quase tudo: 1 polling, 1 pull-to-refresh, 1 botão manual, 0 websockets, 0 indicadores de frescor em tela de negócio.

**Ciclo operacional.** O sistema **registra trabalho já executado; não despacha trabalho futuro.** `valorCobrado` é obrigatório na criação e a pergunta do bot é literalmente "O que foi feito?". Não existe cliente cadastrado, agendamento, orçamento, garantia, retrabalho vinculado, ordem de compra nem deslocamento. `status:'ativo'` é replicado em 8 pontos de agregação sem constante compartilhada.

**Dinheiro é congelado, tempo não.** A comissão vira snapshot em `Servico.comissaoGerada`; o banco de horas é **recalculado a cada leitura** com o `Tecnico` atual, o que faz mudar a modalidade contratual reescrever retroativamente meses já fechados.

**Dado pessoal.** Inventário completo em `ROUND-01-EOS-SECURITY-PRIVACY.md` §3.1: 8 categorias do dono, 13 do funcionário, 10 do cliente final. Retenção automática cobre 3 categorias; o resto cresce sem teto.

Sobre o bloco de RH do funcionário (CPF, data de nascimento, endereço, salário base, valor-hora), a afirmação precisa ser decomposta em três níveis — **e não colapsada em "coletado sem finalidade"**, que é conclusão, não observação:

- `[EVIDÊNCIA DO REPOSITÓRIO]` Os campos **são coletados** (`tecnicos.js:250-260`, wizard `NovoTecnico.jsx`). Têm **pouco ou nenhum consumo funcional identificado** — o cálculo de jornada usa apenas `modalidade` e `jornadaDiariaMin` (`services/ponto.js:42-44`); grep por cada nome de campo em `chaveiro-bot/src` encontra a gravação e não encontra leitura de regra de negócio. **Não são adequadamente exibidos nem editáveis em determinados fluxos**: o `PATCH /tecnicos/:id` (`tecnicos.js:511-518`) não aceita esses campos, o painel não os renderiza, e `SELECT_ME` (`account.js:44-59`) não os devolve ao próprio titular — embora `GET /tecnicos/:id/perfil` (`tecnicos.js:485`) os entregue inteiros a quem tem `tecnicos.ver`.
- `[PENDENTE]` **Finalidade atual, necessidade, quem deve acessar, retenção e uso futuro precisam ser decididos.** Ausência de consumo hoje não estabelece ausência de finalidade — pode haver finalidade legítima não implementada, obrigação legal de guarda, ou uso previsto para uma funcionalidade que não chegou.
- `[INFERÊNCIA]` **Pode existir coleta excessiva ou prematura**, sujeita a análise de finalidade e necessidade. É hipótese de trabalho para o Lote 10, não conclusão desta rodada.

**Formato de dados.** pt-BR / BRL / `America/Sao_Paulo` hardcoded em ~30 pontos; nenhuma biblioteca de i18n. Dinheiro em `Float` (12 colunas monetárias/percentuais), com arredondamento ad hoc espalhado — risco já registrado no ADR-002, "Aceito", não executado. Endereço é texto livre único. CPF sem validação de dígito.

**Mobile.** Tokens declaram 44px de alvo mínimo e safe areas, mas isso só vale para os primitives — há ~25 alvos de 16 a 40px, incluindo o botão Voltar de 13 telas. Viewport sem `interactive-widget`; o teclado virtual cobre o BottomNav fixo. Nenhum tratamento de landscape. A largura mínima suportada **nunca foi declarada nem testada**.

**Design system.** Duas camadas convivem: Tailwind legado (ciano) e tokens `--panel-*` "Aurora" (violeta), com `panel-rollout.css` remapeando por escopo. **Não existe regra escrita** de qual usar em código novo — busca em `CONTRIBUTING.md`, `CLAUDE.md`, `AGENTS.md` e `docs/` retorna nada. 22 das 40 telas estão 100% no legado; a tela mais migrada ainda mistura as duas.

**Identidade de marca.** `[EVIDÊNCIA DO REPOSITÓRIO]` Três identidades coexistem no produto
servido: "AdmAi", "CHAVEIROBOT" (`TrocarSenha.jsx:96`) e o domínio `barbers-flow.com` em suporte,
privacidade e remetente (`config/env.js:117-118`, `Ajuda.jsx:18,231`, `lib/legal.js:81`).
Consequência concreta: o titular que exercer direito de exclusão escreve para o domínio de outro
produto. Ver candidato **C14**.

### 7.1 Auditoria de marcadores epistemológicos — COND-005

Três afirmações que eu apresentei ao usuário como se fossem fato **não têm sustentação** e ficam
reclassificadas. Registro aqui porque o erro foi meu, na síntese, não dos agentes — os relatórios
de `evidence/` já traziam os marcadores corretos.

| Afirmação | Classificação correta | O que de fato está provado |
|---|---|---|
| "a base foi reaproveitada de outra vertical (barbearia)" | `[HIPÓTESE]` | Está provada a **inconsistência de marca** (três identidades, com `arquivo:linha`). A **história** de reaproveitamento não se prova pelo domínio. Confirmar a origem depende de resposta do usuário |
| "o dono provavelmente abre o painel algumas vezes por semana" | `[HIPÓTESE]` | Nada. Não há telemetria de uso no repositório. A frequência real de uso por papel é desconhecida |
| "a alternativa real do cliente é planilha, caderno e WhatsApp solto" | `[HIPÓTESE]` | Nada. Nenhum agente teve acesso à web; nenhuma pesquisa de mercado foi feita nesta frente |

**Regra derivada, permanente:** conclusão sobre mercado, comportamento de usuário real ou história
do produto **exige** pesquisa registrada ou resposta do usuário. Sem uma das duas, é `[HIPÓTESE]`
— nunca base de recomendação apresentada como leitura de evidência.

---

## 8. Usuários e papéis afetados

| Papel | O que é hoje | Trabalho que contrata o produto para fazer | Lacuna estrutural |
|---|---|---|---|
| **Dono** | `papel:'dono'`, `grantTotal()` imutável; único que assina, gerencia cobrança e edita configuração | Consolidar o resultado do período — quanto entrou, quanto é material, quanto é comissão de quem, e emitir a prova. `[INFERÊNCIA]` derivada das telas e endpoints que só ele acessa; a confirmação é do usuário (L1-Q4) | Não tem superfície para assinar *(C13, `[ADIADO]`)*; o canal que a landing anuncia não está ativo *(C4, `[ADIADO]`)*; o destinatário prometido do PDF (contador) não tem acesso |
| **Gestor** | Preset: vê/edita serviços, técnicos, estoque, avaliações, ponto e aprovações; **vê** financeiro sem editar; sem `usuarios` e sem `configuracao` | Manter o dia rodando — quem está em campo, o que precisa de aval, o que falta no estoque | Não há agenda/escala; não recebe alerta de estoque baixo (o filtro é `admin:true`); não pode criar acesso de gestor |
| **Funcionário** | Preset zerado em módulos de empresa; tudo `proprio` ligado; self-scope sempre via `req.user.tecnicoId` | Provar que trabalhou e conferir se vai receber certo | Vê `saldoPendente` mas não o extrato do que já recebeu; não vê nem exporta o próprio banco de horas; não vê nem corrige o próprio CPF/endereço/salário |
| **Técnico (entidade, não papel)** | `Tecnico` com ou sem `Usuario`; criado também implicitamente pelo bot, só com nome | — | `Tecnico.ativo` e `Usuario.ativo` são dois interruptores desconectados: desligar o técnico não corta o painel; desativar o usuário não corta o WhatsApp |
| **Cliente final** | Não tem conta, não tem login, não recebe aviso. Aparece em `Servico` (nome, telefone, endereço) e `Avaliacao` | Ser atendido; opcionalmente responder uma nota | É titular de dado pessoal sem nenhuma superfície própria; o direito de exclusão é exercido **pelo dono**, e a anonimização é parcial (não toca endereço) |
| **Papéis mencionados na documentação e na comunicação, inexistentes no produto** | `[EVIDÊNCIA DO REPOSITÓRIO]` contador (citado na landing e no roadmap), franqueado/multiunidade, supervisor, administrativo. `[PENDENTE]` **Não há, nesta rodada, evidência de demanda comercial validada** para nenhum deles — menção em documentação não é demanda | — | Introduzir papel novo toca o mecanismo que decide quem pode gerenciar e atribuir papel — **é mudança de segurança, não de UI**, e exige rodada com gate próprio. O detalhe técnico está em §23, não aqui (COND-004) |

---

## 9. Necessidades já identificadas

Derivadas de evidência, não de suposição. Cada uma é uma necessidade **estrutural** — sem ela, algum trabalho do §8 não se completa.

1. **O negócio precisa poder cobrar.** `[ADIADO PARA RODADA FUTURA]` por COND-001 — a necessidade fica registrada porque a evidência é sólida (backend pronto e testado, superfície zero), mas **não é discutida nesta sessão**. Preservada em C13.
2. **O produto precisa dizer a mesma coisa que faz.** README, landing e Ajuda descrevem um canal WhatsApp inerte e um fluxo de bot que não é o implementado.
3. **O funcionário precisa de saída quando algo dá errado.** Serviço rejeitado é terminal absoluto, sem motivo e sem notificação; batida esquecida vira −jornada inteira sem mecanismo de correção. Nos dois casos o RBAC **já prevê** a capacidade (`servicos.editar`, `ponto.editar`) e o backend não entrega.
4. **A pessoa precisa ser um conceito só.** Três vocabulários de papel, dois interruptores de desligamento, dois modelos de identidade.
5. **Toda tela precisa dizer a verdade sobre o próprio estado.** Erro e vazio renderizados juntos em 5 telas; uma aba que falha exibe "Nenhum aviso"; 403 rotulado como "recurso não ativado" e como "erro de rede".
6. **Dado pessoal precisa de prazo, finalidade declarada e caminho de exercício de direito.** `[EVIDÊNCIA DO REPOSITÓRIO]` A retenção automática cobre 3 de ~15 categorias, e o bloco de RH do funcionário tem pouco ou nenhum consumo funcional identificado, sem exibição nem edição adequadas em determinados fluxos. `[PENDENTE]` Finalidade, necessidade, acesso, retenção e uso futuro de cada campo são decisão do Lote 10 — não desta rodada, e não do orquestrador.
7. **A promessa legal precisa corresponder ao sistema.** A política publicada não descreve as duas categorias mais sensíveis coletadas e tem prazos como placeholder.
8. **Tela nova precisa de regra para nascer.** Sem decisão de camada de design system, cada tela aumenta a dívida de forma não rastreada.

---

## 10. Problemas e causas conhecidos

Os problemas estão catalogados por agente em `evidence/`. O que importa nesta seção são as **causas transversais** — os padrões que geram problema repetidamente:

| Causa raiz | Como se manifesta | Evidência |
|---|---|---|
| **Migração incompleta de `admin` → `papel`** | Os gates foram migrados; os consumidores não-gate ficaram. Notificação, exclusão de empresa e rótulo da Sidebar ainda dependem do legado | `notificacao.js:54`, `account.js:405-408`, `Sidebar.jsx:48` |
| **Catálogo de RBAC à frente da implementação** | `servicos.editar` e `ponto.editar` existem no catálogo, aparecem na matriz de permissões e **nenhuma rota os consome** | `permissoes.js:37,40` sem consumidor |
| **Decisão registrada e código divergiram** | `docs/decisions.md` afirma três coisas que o código já superou (estados de serviço, alcance da aprovação, `materiais=[]`). E o registro de 2026-06-21 sobre retenção/transparência do ponto está desatualizado — a funcionalidade foi implementada depois | `decisions.md:49,53-55,65-66,84-102` vs. código |
| **Correção caso a caso, sem varredura de classe** | O bug "erro vira estado vazio" foi identificado, comentado e corrigido numa aba, e mantido na aba irmã **do mesmo arquivo** | `Notificacoes.jsx:200-214` vs. `:88-95` |
| **Token de sistema sem regra que o imponha** | `--panel-target: 44px` existe e só se aplica a quem usa os primitives | `panel.css:27` vs. ~25 alvos menores |
| **Feature nasceu com o padrão da sua época** | Três padrões incompatíveis de flag desligada, correspondendo a três gerações de feature | 404-com-corpo / 200-mock / 200-inerte |
| **Efeito colateral não considerado de uma decisão de UI** | `key={pathname}` foi introduzido pela animação de rota e destrói estado e scroll em toda a aplicação | `App.jsx:369-372`, com o comentário reconhecendo só o trade-off do rodapé |
| **Retenção desenhada por caso de uso, não por inventário** | Três categorias cobertas; nunca houve o passo "listar toda categoria de PII e decidir prazo" | `agendador.js:160-210` |

---

## 11. Hipóteses iniciais

Todas `[HIPÓTESE]` — a confirmação depende das respostas do usuário.

| # | Hipótese | O que a confirmaria ou refutaria |
|---|---|---|
| H1 | O produto é hoje, de fato, um gestor de equipe de campo genérico com uma casca de chaveiro — a especialização são 8 strings, zero entidades | Resposta do usuário sobre posicionamento (Lote 1) |
| H2 | O módulo de RH (5 modalidades, banco de horas, 12x36, documentos) é o coração ou o peso morto do produto, dependendo de o cliente-alvo empregar CLT ou ser autônomo/MEI | Pergunta 6 do Lote 1 |
| H3 | A ausência de superfície de billing não é esquecimento, é sequenciamento — `T-BILL-04` está nomeado no código como futuro | Resposta do usuário sobre o modelo comercial |
| H4 | Fixar "uma pessoa = uma empresa" como invariante simplifica login, convite e criação de acesso — mas perde o caso do técnico multi-empresa que o bot já suporta | Lote 2 |
| H5 | "Tenant plano" pode ser fixado como invariante sem custo, desde que se registre o que mudaria se multiunidade vier | Lote 2 |
| H6 | O padrão correto para "o que é congelado e o que é recalculado" já existe no código (comissão) e o ponto e o preço de material estão fora dele por acidente, não por decisão | Lote 2/6 |
| H7 | Um único conceito de "desligar funcionário" (transacional, `Tecnico` + `Usuario`) resolve a assimetria sem introduzir soft delete | Lote 2 |
| H8 | Migrar filtros de lista para a URL resolve a maior parte da perda de contexto sem tocar no `key={pathname}` | Lote 4 |

---

## 12. Perguntas e respostas

### Regra de autoridade aplicável a todo lote — COND-002

> A decisão final pertence ao usuário. O EOS deverá, antes do registro final, apresentar
> consequências, incompatibilidades, alternativas e impactos sistêmicos. Se a escolha permanecer
> após essa análise, ela será registrada como decisão do usuário.

A recomendação inicial de cada pergunta **não é decisão** e nunca será registrada como tal. E o
EOS **não valida silenciosamente** escolha contraditória: se a resposta conflitar com decisão
anterior, com restrição do baseline ou com outra resposta do mesmo lote, o conflito é apresentado
**antes** do registro.

### Lote 1 — Identidade e direção do produto · **REVISADO, aguardando resposta**

Oito perguntas, cobrindo os 8 pontos exigidos pelo prompt de abertura. Entregues em texto
estruturado (contexto · por que importa · alternativas · prós · contras · recomendação inicial ·
campo livre).

| # | Pergunta | Ponto | Status da revisão |
|---|---|---|---|
| L1-Q1 | Chaveiro é a vertical definitiva ou o nicho de entrada? | 1 | **Recomendação corrigida** (COND-003, extensão declarada): o volume de código existente deixou de ser razão e virou consequência estimada |
| L1-Q2 | **Quem é o decisor de compra e quem percebe diariamente o valor do produto?** | 2 | **Substituída** por COND-001. A anterior perguntava sobre caminho de cobrança e paywall — matéria adiada. A nova investiga separadamente: quem paga · quem decide renovar · quem administra · quem usa diariamente · quem sofre o problema · **como priorizar conflitos entre esses interesses** |
| L1-Q3 | **Quais fluxos cada papel executa e com qual frequência?** | 3 | **Reformulada** por COND-006: a versão anterior ("quem usa diariamente") duplicava a L1-Q2. A nova investiga, por papel, as ações diárias/semanais/mensais/excepcionais, criticidade, duração, campo vs. escritório, necessidade de mobile e de desktop, e consequência de falha — para descobrir **quais fluxos** merecem prioridade de experiência |
| L1-Q4 | Qual problema o AdmAi precisa resolver melhor do que a alternativa que o cliente usa hoje? | 4 | Marcador corrigido: a alternativa ser "planilha/caderno/WhatsApp solto" é `[HIPÓTESE]`, não fato — passa a ser parte da pergunta, não da premissa |
| L1-Q5 | Ordem de prioridade entre operação, administração, finanças, equipe e automação | 5 | Sem alteração |
| L1-Q6 | Qual público real o produto quer atender — porte, regime e realidade operacional? | 6 | **Reescrita** por COND-003 (ordem de raciocínio explícita, módulo de RH em 5 dimensões neutras, neutralidade declarada) e ajustada por **COND-006**: o bloco de RH deixa de ser descrito como "coletado sem finalidade" e passa aos três níveis — evidência, pendência e inferência |
| L1-Q7 | Quais tipos de empresa ficam explicitamente fora do escopo atual | 7 | Sem alteração de método |
| L1-Q8 | O modelo atual (empresa única, três papéis) é definitivo ou provisório? | 8 | **Reescrita** por COND-004 (removido todo desenho técnico do enunciado e das alternativas; três alternativas funcionais fixadas pelo usuário) e ajustada por **COND-006**: "demanda evidenciada" vira `[EVIDÊNCIA DO REPOSITÓRIO]` de **menção** em documentação + `[PENDENTE]` de que não há demanda comercial validada |

*(O texto integral das 8 perguntas foi entregue ao usuário na conversa. As respostas serão
transcritas literalmente aqui quando chegarem, e cada decisão derivada irá para
`00_DECISION_LOG.md` com citação.)*

**Perguntas retiradas nesta correção:** a `L1-Q2` original (caminho de cobrança e paywall) —
retirada por COND-001, com toda a evidência preservada em C13 e a questão registrada como Q-023
em "Adiadas".

### Lotes previstos — registrados, **não enviados**

| Lote | Tema | Resolve as regras transversais de |
|---|---|---|
| 2 | Papéis, funções e capacidades | §14.1 (parcial), modelo de papéis, identidade/vínculo/cargo, quem cria/edita/vê quem |
| 3 | Navegação e arquitetura da informação | §14.1 — menu, limite de 4, links diretos, telas sem permissão, destino inicial, deep links |
| 4 | Política de Voltar e estado | §14.1 — histórico vs. rota pai, filtros, scroll, rascunho, refresh, sessão expirada |
| 5 | Atualização e sincronização | Frescor, polling vs. foco vs. evento, offline, conflito, dado obsoleto |
| 6 | Formulários e validação | §14.2 (parcial) — inline/blur/submit, bloqueio entre etapas, máscara, normalização, retry, rascunho |
| 7 | Design system, botões e acessibilidade | §14.6 (parcial) — Aurora vs. legado, contraste, foco, teclado, skip link, alvos de toque |
| 8 | Busca, filtros e listas | Busca livre, autocomplete, múltiplos filtros, estado persistido, paginação, ordenação, sem acento, vazio |
| 9 | Notificações | Central, preferências, categorias, prioridade, leitura, retenção, deep link |
| 10 | Dados, privacidade e retenção | §14.5 — finalidade, necessidade, retenção, acesso, auditoria, exclusão, anonimização |
| 11 | Requisitos não funcionais | Q-007 a Q-021 — volume, latência, disponibilidade, RPO/RTO, backup, storage, i18n |
| 12 | Feature flags e promoção | §16 do prompt — estados de funcionalidade, liberação por ambiente/empresa, rollout, rollback |

---

## 13. Alternativas iniciais

Alternativas levantadas pelos agentes, **nenhuma escolhida**. Cada uma tem o custo real registrado no relatório de origem.

| Tema | Alternativas | Origem |
|---|---|---|
| Identidade (pessoa × empresa) | A1 conta por empresa · A2 identidade global + entidade de vínculo · A3 fixar "uma pessoa = uma empresa" e remover a desambiguação · A4 manter e documentar | `Data-Architecture` §9.A |
| Multiunidade | B1 fixar tenant plano · B2 reservar o conceito sem implementar · B3 implementar agora | `Data-Architecture` §9.B |
| Desligamento de funcionário | C1 ato único transacional · C2 soft delete formal · C3 manter dois interruptores | `Data-Architecture` §9.C |
| Congelado vs. recalculado | D1 snapshot (padrão já usado na comissão) · D2 versionar com vigência · D3 documentar e aceitar | `Data-Architecture` §9.D |
| Flags por empresa | F1 coluna nova por flag · F2 `Empresa.recursos Json?` · F3 tabela de flags | `Data-Architecture` §9.F |
| Padrão de flag desligada | E1 404 genérico (não confirma existência) · E2 404 com corpo próprio · E3 200 inerte/mock | `Security-Privacy` §9 |
| Negação de acesso na UI | A estender `RequirePermissao` + `permission-denied` · B tratar 403 no interceptor · C só corrigir as mensagens erradas | `UX` §9 |
| Voltar | A `para` obrigatório (hierarquia explícita) · B `navigate(-1)` com fallback · C centralizar em `useVoltar()` | `Repository-Mapper` §9 |
| Preservação de contexto | A query string · B `sessionStorage` por rota · C remover `key={pathname}` + View Transitions | `UX` §9 |
| Alvos de toque | A regra CSS global · B migrar para `IconButton` · C expandir área clicável mantendo o visual (WCAG 2.5.8) | `UX` §9 |
| Camada de design system | A congelar o legado · B assumir Tailwind + tokens e deletar primitives redundantes · C status quo com regra escrita | `UX` §9 |
| Posicionamento | A fechar o loop de monetização · B religar o WhatsApp · C despecializar para prestador de serviço · D alinhar a comunicação ao produto real | `Product-Discovery` §9 |
| Auditoria | A middleware genérico em rotas marcadas · B chamadas explícitas + `GET /auditoria` paginado | `Repository-Mapper` §9 |
| Sessão | F1 unificar no refresh · F2 manter os dois e documentar | `Security-Privacy` §9 |

---

## 14. Pesquisa de referências

**Nenhuma pesquisa externa foi executada nesta passada.** `EOS-Official-Research` não foi acionado, e os agentes de produto e domínio operaram **sem acesso à web**, com instrução explícita de marcar `[INFERÊNCIA]` toda afirmação sobre o mundo real e nunca apresentá-la como fato.

**Motivo:** o Lote 1 trata de posicionamento, público e prioridade — matéria exclusiva do dono do produto. Nenhuma das 8 perguntas depende de fonte externa.

**Pesquisa prevista, por lote:**

| Lote | Fonte primária a consultar |
|---|---|
| 7 (a11y) | WCAG 2.2 (W3C) — critérios 2.4.1 (bypass blocks), 2.5.8 (target size minimum), 1.4.3 (contrast) |
| 10 (dados) | LGPD (Lei 13.709/2018) e orientações da ANPD — base legal por finalidade, término do tratamento, direitos do titular |
| 10/11 (ponto) | eSocial e normas do Ministério do Trabalho — prazo de guarda de registro de jornada |
| 11 (auth/RNF) | NIST SP 800-63B — sessão e reautenticação; OWASP Authentication Cheat Sheet |
| 6 (formulários) | GOV.UK Service Manual / Design System — padrões de erro e validação |

**Regra fixada:** matéria jurídica, contábil ou trabalhista **nunca** é concluída nesta frente. É marcada como exigindo validação profissional.

---

## 15. Decisões aprovadas

`[PENDENTE]` — nenhuma decisão de conteúdo foi tomada. As duas decisões existentes (DEC-001, DEC-002) são de **escopo e processo**, não de constituição funcional, e estão em `00_DECISION_LOG.md`.

**Destrava com:** respostas do Lote 1 em diante. Cada decisão aprovada gera registro em `00_DECISION_LOG.md` **com citação literal do usuário** e ao menos uma linha em `00_TRACEABILITY_MATRIX.md`.

---

## 16. Decisões substituídas

`[PENDENTE]` — nenhuma até o momento.

Registrado desde já, porque afeta esta rodada: `Q-005` foi **decomposta** em Q-007…Q-022 (`00_OPEN_QUESTIONS.md`). Decomposição de questão não é decisão substituída e por isso não gera registro no decision log.

---

## 17. Fluxos principais

`[PENDENTE]` — **destrava com o Lote 3** (navegação) e o Lote 4 (Voltar e estado).

Insumo já disponível: a tabela papel × destino × como se chega, em `ROUND-01-EOS-UX-MOBILE-ACCESSIBILITY.md` §3.1, e o diagrama de estados do serviço em `ROUND-01-EOS-DOMAIN-OPERATIONS.md` §3.2.

---

## 18. Estados da interface

`[PENDENTE]` — **destrava com os Lotes 3, 5 e 7.**

Insumo já disponível: inventário completo de carregando/vazio/erro/offline/sem-permissão por tela em `ROUND-01-EOS-UX-MOBILE-ACCESSIBILITY.md` §3.5, incluindo as cinco telas que renderizam erro e vazio simultaneamente e o estado `permission-denied` que existe e nunca é usado.

---

## 19. Casos extremos

`[PENDENTE]` — **destrava com os Lotes 4, 5, 6 e 8**, e será fechado com `EOS-QA-Acceptance`.

O checklist obrigatório do protocolo (§8 de `00_EOS_DISCOVERY_PROTOCOL.md`) já tem material levantado para vários itens: sessão expirada no meio de formulário (dois caminhos divergentes), navegação por Voltar (quatro padrões), link direto (6 rotas fora do manifesto), falha de rede (offline é só um aviso), dados incompletos (batida esquecida), permissões insuficientes (403 sem tratamento), duplicidade (duplo clique protegido em todos os formulários).

---

## 20. Regras de dados

`[PENDENTE]` — **destrava com os Lotes 6, 10 e 11.**

Insumo: §14.2 do prompt de abertura (moeda, separadores, datas, fuso, telefone, nomes, endereços, uploads, arquivos, valores, casas decimais) cruzado com o estado atual em `ROUND-01-EOS-REPOSITORY-MAPPER.md` §3.9 e §3.10.

---

## 21. Segurança e privacidade

`[PENDENTE]` — **destrava com o Lote 10.**

Insumo: o inventário de dado pessoal por titular (`ROUND-01-EOS-SECURITY-PRIVACY.md` §3.1) e as 8 restrições que o baseline já impõe a qualquer funcionalidade futura (§3.2 do mesmo relatório): Zod nos boundaries, `req.db` para dado de tenant, `requireAuth`/`requirePermissao`, self-scope via `req.user.tecnicoId` nunca via input, segredos cifrados em repouso, PII nunca logada.

**Pré-condição funcional já registrada, não decidida aqui:** o item 2 do `SECURITY_HARDENING_BACKLOG.md` exige resolver `/uploads` **antes** de reativar o WhatsApp — e o WhatsApp é o único caminho de coleta de `Servico.fotoEvidencia`.

---

## 22. Acessibilidade e mobile

`[PENDENTE]` — **destrava com o Lote 7.**

Insumo: `ROUND-01-EOS-UX-MOBILE-ACCESSIBILITY.md` §3.6 e §3.7 — ~25 alvos abaixo de 44px com arquivo:linha, viewport sem `interactive-widget`, grids monetários que estouram abaixo de ~390px, ausência de skip link, foco visível ausente nas 4 superfícies públicas, e o fato de que **nenhum contraste é verificado por máquina** (axe desliga `color-contrast`, não há `eslint-plugin-jsx-a11y`).

---

## 23. Dependências entre módulos

Atualiza e complementa `00_DEPENDENCY_MAP.md`. As dependências novas descobertas nesta rodada:

| Dependência | Efeito |
|---|---|
| **`status:'ativo'` replicado em 8 pontos de agregação sem constante compartilhada** | Qualquer estado novo de serviço (`agendado`, `orcamento`, `garantia`) precisa tocar os 8 — e o esquecimento é silencioso. Já aconteceu uma vez |
| **Introduzir papel novo toca a hierarquia de autoridade do RBAC** | O mecanismo que decide quem pode gerenciar e atribuir papel (`podeGerenciarUsuario`/`podeAtribuirPapel`) é exatamente o que fechou a escalada de privilégio do EV-060. **Papel novo é mudança de segurança, não de UI** — e por isso exige rodada com gate próprio. *Esta dependência foi movida para cá por COND-004: era enunciado de pergunta na `L1-Q8` e virou o que sempre deveria ter sido — consequência a considerar depois da decisão funcional* |
| **Comissão é snapshot no `create`; jornada é recalculada na leitura** | Orçamento→serviço, ou serviço que muda de valor, exige decidir *quando* congelar. Mudar modalidade contratual reescreve banco de horas de meses fechados |
| **`valorCobrado` obrigatório na criação** | Agendamento e orçamento são incompatíveis com o modelo atual sem mudança estrutural |
| **Cliente é texto livre em `Servico`** | Histórico do cliente, recorrência, garantia e reincidência dependem de um `Cliente` que não existe |
| **`Avaliacao` é 1:1 com `Servico`** | Retrabalho/garantia gerará avaliação duplicada ao mesmo cliente |
| **Gateway WhatsApp é o único canal de saída ao cliente** | Toda notificação futura ao cliente final herda a indisponibilidade do canal |
| **6 models com `empresaId` fora de `MODELOS_ESCOPADOS`** | Endpoint novo sobre `GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`, `Assinatura`, `ConviteUsuario` ou `AuditLog` precisa de `empresaId` explícito |
| **8 models com `empresaId` sem FK para `Empresa`** | Sem integridade referencial de tenant; a cascata de exclusão de empresa já deixa 2 tabelas órfãs com PII |
| **`AuthContext` degrada `permissoes` para `{}` em falha** | Estender guards de permissão à UI faria uma falha de `/me/permissoes` **bloquear tudo** para não-donos. Exige política de fallback antes |
| **`key={pathname}` em `App.jsx:371`** | Remover quebra a animação `.panel-route`; manter anula qualquer preservação de estado fora da URL |
| **Redação de PII no log é por nome de chave** | `cpf`, `endereco`, `clienteTelefone`, `lat`, `lng`, `selfieUrl` **não estão na lista** — log estruturado novo pode vazar PII sem violar regra escrita |
| **Staging não existe** | **DEC-002** — gate de toda promoção. Rastreado como T-001 |

---

## 24. Preparação para funcionalidades futuras

`[PENDENTE]` — **destrava com os Lotes 2, 11 e 12.**

O que já se sabe que precisa de **reserva conceitual** — o conceito, não a forma técnica de implementá-lo (COND-004): multiunidade · papéis futuros (contador, supervisor, franqueado) · possibilidade de ligar funcionalidade por empresa, que hoje não tem onde morar · e o par "o que é congelado e o que é recalculado" como decisão-mãe única.

**Como isso seria modelado não é matéria desta rodada** e não será decidido aqui. A pergunta funcional correspondente é a `L1-Q8`.

---

## 25. Critérios de aceite

`[PENDENTE]` — **destrava com `EOS-QA-Acceptance`**, que só entra depois de existirem decisões aprovadas.

Regra já fixada pelo protocolo: nenhuma decisão é aprovada sem critério objetivamente verificável, e nenhum critério é aceito sem teste planejado. "Deve ser rápido", "deve atualizar em tempo real", "deve funcionar bem no celular", "deve ser seguro" e "deve ser intuitivo" **não são critérios** — precisam virar limiar, frequência, tamanho de tela, quantidade de registros, tempo de retenção ou condição de rollout, com opções fundamentadas apresentadas ao usuário. **Nenhum valor será inventado.**

---

## 26. Estratégia de testes

`[PENDENTE]` — **destrava com `EOS-QA-Acceptance`.**

Restrições reais já confirmadas que qualquer estratégia terá de declarar:

| Nível | Estado | Limitação |
|---|---|---|
| Unitário backend | Vitest, pisos 27/22/28/27 | — |
| Integração backend | Vitest + Supertest, 28 arquivos | Exige PostgreSQL + Redis reais; `fileParallelism:false`; **não existe `prisma/seed`** — as únicas factories estão em `test/integration/helpers.js` |
| Unitário/componente painel | Vitest + Testing Library, pisos 30/31/29/29 | — |
| Acessibilidade | axe-core, **bloqueante** no CI | Cobre 5 arquivos; `color-contrast` e `region` **desligadas** por limitação do jsdom → nenhum contraste é medido |
| E2E | Harness CDP próprio (`e2e/run.mjs`) | `/api` **mockado**; papéis simulados por JWT falso; **não-bloqueante** no CI. Cobre M1 e M4 |
| Device Android real | **Não existe automação** | `docs/TESTPLAN.md:148-175` declara que a passada mobile nunca foi feita de verdade |
| Staging | **Não existe ambiente de aplicação** | DEC-002 |

---

## 27. Promoção local → staging → produção

Padrão comum fixado por **DEC-002** `[DECISÃO DO USUÁRIO]`. Toda funcionalidade futura segue esta cadeia, sem atalho:

```text
local → validação local → staging → validação em staging → produção → validação pós-produção
```

**Local** — toda especificação futura prevê, conforme aplicável: teste unitário · teste de componente · teste de integração · teste E2E · teste de acessibilidade · falhas simuladas · matriz de papéis · tamanhos de tela · dados descartáveis · integrações mockadas ou sandbox.

**Staging** — ambiente real de aplicação · banco de staging · integrações sandbox · matriz completa de papéis · dados isolados · **dispositivo mobile real** · observabilidade · rollback · aceite do usuário.

**Produção** — backup · rollout · feature flag quando necessário · smoke test não destrutivo · métricas · logs · rollback · limpeza de dados de teste · validação pós-produção.

**Nada executado nesta rodada.**

**Limitações declaradas, não contornadas:**

1. **Staging de aplicação não existe.** Confirmado por três fontes. Existe apenas o projeto Supabase `admai-staging` com kit nunca executado. Sua criação é dependência estrutural registrada — não bloqueia a descoberta documental, bloqueia a promoção.
2. **Validação em dispositivo real nunca foi feita.** `docs/TESTPLAN.md:148-175` é explícito: a automação não derruba o viewport abaixo de 1024px, e render a 390px, fluxo de ponto nativo (câmera/GPS), refresh via cookie no WebView e instalação PWA seguem **pendentes**. Toda especificação mobile-first herda essa limitação até que exista device real na matriz.
3. **Produção não tem backup.** Plano Supabase Free não inclui backup nem PITR, confirmado no painel em 2026-08-05. Enquanto isso valer, "backup antes do rollout" é um passo que **não pode ser cumprido** — e precisa ser declarado como tal, não presumido.

---

## 28. Itens adiados

| Item | Motivo | Volta quando |
|---|---|---|
| Divergência entre `Domain-Operations` P1 e `Product-Discovery` P4 sobre o envio de avaliação com canal off | Matéria da rodada de Avaliações; exige execução para resolver | Rodada de Avaliações |
| `Float` → `Decimal` (ADR-002, "Aceito", não executado) | Dívida com gatilho, não conceito transversal | Q-022 / decisão de priorização do usuário |
| FKs ausentes e órfãos da cascata de exclusão | Correção pontual de integridade, não conceito | Rodada própria |
| Outbox / eventos de domínio | Defensável no porte atual; gatilho natural é a decisão de auditoria | Lote 10 |
| Correção de `docs/decisions.md` (3 decisões superadas pelo código) | Fora do escopo de escrita desta sessão — só `docs/functionality-discovery/` é editável | Frente de implementação |
| **Canal WhatsApp (C4)** | `[ADIADO]` por **COND-001** — não tratado nesta sessão | Rodada futura dedicada · Q-003 |
| **Planos, assinatura, trial, cobrança e acesso comercial (C13)** | `[ADIADO]` por **COND-001** — não tratado nesta sessão. Toda a evidência preservada no candidato | Rodada futura dedicada · Q-023 |
| **Relatórios** (formato, destinatário, competência, exportação) | `[ADIADO]` por **COND-001** — não tratado nesta sessão | Rodada futura · Q-024 |
| Inconsistência de identidade de marca (C14) | Não é billing e **não** foi adiado junto com C13; depende de resposta do usuário sobre a origem | Rodada de identidade/comunicação, ou junto de C12 (textos legais) |

---

## 29. Questões abertas

Sincronizado com `00_OPEN_QUESTIONS.md`.

**Abertas antes desta rodada:** Q-002 (flags ligadas em produção — **`WHATSAPP_HABILITADO` retirado do escopo** por COND-001) e Q-004 (retenção e transparência do ponto — **agora refinada**, ver abaixo).

**Adiadas por COND-001** (adiar não é decidir; continuam abertas como questão): Q-003 (WhatsApp), Q-023 (planos/cobrança/trial/acesso comercial), Q-024 (relatórios).

**Q-005 decomposta** em Q-007…Q-022 (16 questões com dono, origem, estado atual do repositório e o que bloqueia).

**Correção material aplicada nesta rodada:** Q-004 e o candidato C2/C3 afirmavam que a retenção e o aviso de coleta do ponto **não** estavam implementados, com base em `docs/decisions.md:84-102`. **A afirmação era falsa** — ambos estão implementados. O erro foi do orquestrador, que usou um relatório como prova de comportamento atual, contrariando §3 do protocolo. Corrigido por leitura direta do código, com a correção registrada de forma visível em `00_CANDIDATE_BACKLOG.md`. O que **de fato** continua aberto é: (a) o prazo de 365 dias foi fixado no código sem aprovação registrada; (b) a Política de Privacidade não menciona selfie nem geolocalização; (c) documentos do funcionário e foto de evidência não têm retenção alguma.

**Novas questões que esta rodada levanta e que serão formalizadas conforme os lotes avançarem** — registradas aqui para não se perderem:

identidade pessoa × empresa · multiunidade no roadmap de 12 meses · o que acontece com o histórico no desligamento · mudança de modalidade contratual reescreve o passado? · aprovação vale para o bot? · quais ações precisam de `AuditLog` e quem lê a trilha · preço de material congelado no serviço? · flag por empresa vs. global · destino do seletor "Nível de acesso" · negação de acesso visível na UI · guard de permissão por rota · filtros na URL · largura mínima oficial · alvos de toque vs. densidade · regra de camada do design system · unificação das cores semânticas · contrato do Voltar · contraste medido por máquina · TTL de rascunho · landscape · duração do access token e comportamento na expiração · retenção de IP/user-agent · padrão único de flag desligada · exportação de dados pelo titular.

---

## 30. Parecer provisório de prontidão

**RODADA 1 INCOMPLETA — em andamento, sem bloqueio.**

O que foi concluído até aqui: investigação de seis frentes com evidência rastreável, consolidação, decomposição de Q-005, registro das duas decisões de escopo, entrega do Lote 1 e — nesta passada — **correção de condução da descoberta** (COND-001 a COND-005), com o Lote 1 revisado e reentregue.

**Correções de condução aplicadas, para o registro do processo:** escopo de sessão respeitado (WhatsApp, planos, cobrança e relatórios adiados, com evidência preservada); viés de custo afundado removido da formulação de perguntas; desenho técnico retirado do enunciado e movido para o mapa de dependências; regra de autoridade do usuário corrigida; três afirmações reclassificadas como `[HIPÓTESE]`. Nenhuma delas é decisão funcional do produto — estão em seção própria de `00_DECISION_LOG.md`.

O que falta, com a próxima ação objetiva:

| Falta | Dono | Bloqueia | Próxima ação |
|---|---|---|---|
| Respostas do Lote 1 (identidade e direção do produto) | USUÁRIO | §15 e todos os lotes seguintes | Aguardar |
| Lotes 2 a 12 | USUÁRIO, após cada consolidação | §17-§22, §24 | Enviar Lote 2 após o Lote 1 |
| Critérios de aceite objetivos | `EOS-QA-Acceptance` | §25, §26 | Acionar quando houver decisão aprovada |
| Revisão adversarial | `EOS-Adversarial-Reviewer` | Mudança de estado para `ESPECIFICAÇÃO EM REVISÃO` | Acionar quando a especificação parecer madura |
| Pesquisa em fonte oficial (WCAG 2.2, LGPD/ANPD, eSocial, NIST) | `EOS-Official-Research` | §14, e as decisões dos Lotes 7, 10 e 11 | Acionar no lote correspondente |

**Nenhuma decisão de conteúdo foi tomada. Nenhuma recomendação de agente foi convertida em decisão.** O estado permanece `AGUARDANDO RESPOSTA DO USUÁRIO`.
