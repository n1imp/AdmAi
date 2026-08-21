# 00 — Log de Decisões da Descoberta Funcional

Registro cronológico e permanente. **Decisão substituída nunca é apagada** — recebe
`[DECISÃO SUBSTITUÍDA]` e um ponteiro para a decisão que a substituiu.

**Legenda de marcadores:** `[DECISÃO DO USUÁRIO]` · `[EVIDÊNCIA DO REPOSITÓRIO]` ·
`[PESQUISA EXTERNA]` · `[INFERÊNCIA]` · `[HIPÓTESE]` · `[PENDENTE]` · `[ADIADO]` ·
`[FORA DE ESCOPO]` · `[DECISÃO SUBSTITUÍDA]`

**Regra:** nunca atribuir ao usuário uma frase, aprovação ou decisão sem evidência literal
verificável na conversa.

---

## Formato de cada registro

```text
### DEC-XXX — <título>
- **Data:**
- **Rodada:**
- **Marcador:**
- **Decisão:**
- **Contexto/necessidade:**
- **Evidências consideradas:**
- **Alternativas avaliadas:**
- **Quem decidiu:** usuário | orquestrador (trivial/reversível) | revisão adversarial
- **Impacto:** módulos, papéis, banco, RBAC, testes, notificações
- **Testes exigidos:**
- **Substitui:** (ID ou —)
- **Substituída por:** (ID ou —)
```

---

## Registros

### DEC-000.1 — Catálogo de candidatos além da estrutura documental
- **Data:** 2026-08-05
- **Rodada:** 00 (bootstrap)
- **Marcador:** `[DECISÃO DO USUÁRIO]`
- **Decisão:** criar a estrutura documental **e** um catálogo de candidatos ancorado em
  evidência do repositório (`00_CANDIDATE_BACKLOG.md`), para que a escolha do tema da Rodada 1
  parta de evidência e não de memória.
- **Contexto/necessidade:** a constituição manda criar a estrutura e aguardar o prompt da
  Rodada 1; o usuário optou por receber junto o material de escolha.
- **Evidências consideradas:** leitura direta do repositório na abertura da sessão (ver
  `evidence/ROUND-00-*`).
- **Alternativas avaliadas:** (a) só a estrutura, aguardando as ideias do usuário;
  (b) estrutura + catálogo — **escolhida**.
- **Quem decidiu:** usuário
- **Impacto:** documental apenas. Os candidatos entram como `[HIPÓTESE]`/`[PENDENTE]`; nenhum é
  aprovado por este registro.
- **Testes exigidos:** nenhum (documental)
- **Substitui:** —
- **Substituída por:** —

### DEC-000.2 — Governança de revisão desta sessão
- **Data:** 2026-08-05
- **Rodada:** 00 (bootstrap)
- **Marcador:** `[DECISÃO DO USUÁRIO]`
- **Decisão:** a constituição EOS prevalece sobre o roteamento Codex do `CLAUDE.md`/`AGENTS.md`
  nesta sessão. O `EOS-Adversarial-Reviewer` é o gate de revisão obrigatório; o Codex **não** é
  gate desta sessão.
- **Contexto/necessidade:** o `CLAUDE.md` exige consultar `mcp__codex__codex` (DECISOR/REVISOR)
  em decisões técnicas materiais. Esta sessão é documental e a constituição definiu seu próprio
  mecanismo de revisão adversarial — havia conflito real a resolver antes de abrir a Rodada 1.
- **Evidências consideradas:**
  - `[EVIDÊNCIA DO REPOSITÓRIO]` `AGENTS.md` — a ordem de precedência declarada começa pela
    "instrução atual do usuário".
  - `[EVIDÊNCIA DO REPOSITÓRIO]` `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`
    (cabeçalho, EV-053) — o serviço Codex esteve indisponível por limite de uso até ~08/ago/2026,
    e o `AGENTS.md` determina que, indisponível o Codex, a decisão material fica bloqueada, sem
    fallback silencioso. Mantê-lo como gate provavelmente travaria a sessão.
- **Alternativas avaliadas:** (a) constituição EOS prevalece — **escolhida**; (b) Codex como
  Revisor obrigatório, com risco de bloquear a rodada; (c) Codex opcional com registro de
  indisponibilidade.
- **Quem decidiu:** usuário
- **Impacto:** processo desta frente. Não altera a governança de outras frentes nem concede
  permissão de escrita, commit, merge ou operação externa.
- **Testes exigidos:** nenhum (processo)
- **Substitui:** —
- **Substituída por:** —

### DEC-000.3 — Escopo da Frente de Funcionalidades
- **Data:** 2026-08-05
- **Rodada:** 00 (bootstrap)
- **Marcador:** `[DECISÃO DO USUÁRIO]`
- **Decisão:** o escopo da frente inclui **funcionalidades novas e amadurecimento das
  existentes**.
- **Contexto/necessidade:** várias funcionalidades foram entregues com pendências de produto
  conscientemente adiadas (ex.: `docs/decisions.md:84-102`), o que tornava ambíguo se a frente
  trataria só de capacidades inexistentes.
- **Evidências consideradas:** `docs/decisions.md`, `docs/GO_LIVE_CHECKLIST.md` ("Pendências de
  produto (decidir)"), `docs/agent-environment/FUNCTIONALITY_MATRIX_V1.md`.
- **Alternativas avaliadas:** (a) novas + amadurecer existentes — **escolhida**; (b) somente
  funcionalidades novas; (c) novas + existentes + reativação explícita do WhatsApp.
- **Quem decidiu:** usuário
- **Impacto:** define o filtro de admissão de candidatos ao backlog e aos temas de rodada.
- **Observação obrigatória:** a alternativa (c) **não** foi escolhida. Portanto a reativação do
  canal WhatsApp segue `[PENDENTE]` de decisão específica do usuário — ver candidato C4 em
  `00_CANDIDATE_BACKLOG.md`. Não interpretar "amadurecer existentes" como autorização implícita
  para reativar o WhatsApp.
- **Testes exigidos:** nenhum (escopo)
- **Substitui:** —
- **Substituída por:** —

### DEC-001 — Tema da Rodada 1
- **Data:** 2026-08-05
- **Rodada:** 01
- **Marcador:** `[DECISÃO DO USUÁRIO]`
- **Decisão:** citação literal do usuário — *"A Rodada 1 será dedicada à Constituição Funcional do
  Produto, Papéis, Navegação e Regras Transversais."*
- **Contexto/necessidade:** as rodadas seguintes (Login, Cadastro, Painel, Serviços, Equipe,
  Estoque, Relatórios, IA) precisam de regras estruturais comuns antes de serem especificadas;
  sem elas, produziriam soluções contraditórias entre si.
- **Evidências consideradas:** o usuário declarou que *"a escolha desta rodada decorre de
  dependências já verificadas no repositório"* — as dependências transversais levantadas no
  bootstrap (`00_DEPENDENCY_MAP.md`) e o catálogo `00_CANDIDATE_BACKLOG.md`.
- **Alternativas avaliadas:** os 12 candidatos do catálogo. O usuário não escolheu nenhum
  candidato isolado — escolheu a camada constitucional que os precede.
- **Quem decidiu:** usuário
- **Impacto:** define o escopo da Rodada 1. Torna as demais rodadas dependentes das decisões
  desta. Não autoriza implementação de nada.
- **Testes exigidos:** nenhum (escopo). Os critérios de aceite das decisões desta rodada serão
  definidos com o `EOS-QA-Acceptance` antes do parecer final.
- **Responde:** Q-001
- **Substitui:** —
- **Substituída por:** —

### DEC-002 — Staging real de aplicação como gate obrigatório de promoção
- **Data:** 2026-08-05
- **Rodada:** 01
- **Marcador:** `[DECISÃO DO USUÁRIO]`
- **Decisão:** citação literal do usuário — *"A criação e validação de um staging real de
  aplicação são pré-requisitos obrigatórios antes que qualquer mudança funcional possa ser
  promovida para produção. Local não substitui staging."*

  A cadeia obrigatória declarada pelo usuário é:

  ```text
  Ambiente local
  → validação local
  → staging
  → validação em staging
  → produção
  → validação pós-produção
  ```

- **Contexto/necessidade:** o repositório não possui ambiente de staging de aplicação, e o
  protocolo EOS proíbe tratar local como equivalente. Sem essa decisão, cada rodada teria de
  renegociar sua estratégia de promoção.
- **Evidências consideradas:** `[EVIDÊNCIA DO REPOSITÓRIO]` — `.github/workflows/deploy.yml`
  publica apenas `--project-name=admai-painel --branch=master`, sem `environment:` nem branch
  alternativa; zero ocorrência de staging/preview/homologação em `.github/workflows/`;
  `docs/CI_CD.md` lista só três destinos (Railway, Cloudflare Pages, `.aab`). Existe apenas um
  projeto Supabase de banco (`admai-staging`, ref `qsuufuulxfkkeasgxhcv`) cujo kit
  (`scripts/validate-staging.mjs`) nunca foi executado — falta o usuário preencher
  `chaveiro-bot/.env.staging` (`docs/db/STAGING_VALIDATION.md`).
- **Alternativas avaliadas:** nenhuma — o usuário estabeleceu a regra diretamente.
- **Quem decidiu:** usuário
- **Limites explícitos declarados pelo usuário nesta mesma decisão:**
  - não criar staging nesta sessão;
  - não planejar sua implementação detalhada agora;
  - registrar sua ausência como dependência estrutural;
  - incluir o staging como gate de todas as futuras ondas de implementação;
  - **não bloquear a descoberta documental** por ainda não existir staging.
- **Impacto:** a seção 27 (promoção) de toda rodada futura passa a ter forma fixa. A criação do
  staging vira dependência estrutural registrada em `00_DEPENDENCY_MAP.md`, não um tema
  concorrente de descoberta. Nenhuma especificação pode declarar-se pronta para produção sem
  passar por staging.
- **Testes exigidos:** toda especificação futura precisa declarar, na seção 26, quais validações
  rodam em local e quais **exigem** staging — declarando explicitamente as que ficam indisponíveis
  enquanto o staging não existir. Limitação ambiental nunca equivale a teste aprovado.
- **Responde:** Q-006
- **Substitui:** —
- **Substituída por:** —

---

## Correções de condução da descoberta

> Esta seção é **separada das decisões funcionais** por instrução explícita do usuário. Os
> registros `COND-XXX` corrigem **como a descoberta é conduzida** — escopo de sessão, método de
> perguntar, rigor epistemológico, autoridade. **Nenhum deles decide nada sobre o produto** e
> nenhum gera linha em `00_TRACEABILITY_MATRIX.md`.

### COND-001 — Escopo da sessão: WhatsApp, planos, cobrança e relatórios adiados
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (escopo de sessão, não de produto)
- **Declaração do usuário, literal:** *"WhatsApp não será tratado nesta sessão; planos não serão
  tratados nesta sessão; cobrança não será tratada nesta sessão; relatórios não serão tratados
  nesta sessão."*
- **O que motivou:** a pergunta `L1-Q2` que eu havia entregue (*"Quem é o usuário pagante, e o
  produto passa a ter caminho para cobrar?"*) conflitava com essa decisão. Eu transformei um
  **achado** — não existe superfície de billing no painel — numa **pergunta de implementação**,
  que é matéria de rodada futura.
- **Consequências aplicadas:**
  1. `L1-Q2` original **retirada**. Substituída por uma pergunta transversal sobre decisor de
     compra × usuário diário, que não toca em tela de cobrança nem paywall.
  2. Todos os achados de billing **preservados integralmente** e movidos para o candidato **C13**,
     marcado `[PENDENTE]` + `[ADIADO PARA RODADA FUTURA]`.
  3. `Q-003` (WhatsApp entra na frente?) sai de "Abertas" e vai para **"Adiadas"** — adiar não é
     decidir, então não vai para "Respondidas" e não gera decisão funcional.
  4. Candidato **C4** (WhatsApp) reclassificado de `[PENDENTE]` para `[ADIADO PARA RODADA FUTURA]`.
  5. Relatórios entram na lista de fora de escopo **da sessão**, não só da rodada.
- **O que NÃO muda:** nenhum achado é removido, minimizado ou reescrito. Adiar é decidir *quando*
  tratar, não *se* o achado é verdadeiro.
- **Registro:** correção de condução. **Não é decisão funcional do produto.**

### COND-002 — Autoridade do usuário e obrigação de apresentar consequências
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (método, não produto)
- **Texto fixado pelo usuário, literal:**
  > *"A decisão final pertence ao usuário. O EOS deverá, antes do registro final, apresentar
  > consequências, incompatibilidades, alternativas e impactos sistêmicos. Se a escolha permanecer
  > após essa análise, ela será registrada como decisão do usuário."*
- **O que motivou:** eu escrevi, no cabeçalho do Lote 1, que *"se você discordar, a sua resposta
  prevalece sem discussão"*. Essa formulação abdica da obrigação do EOS de apresentar
  consequências antes do registro — troca análise por deferência.
- **Regra derivada:** o EOS **não disputa autoridade** com o usuário e **não valida
  silenciosamente** decisão contraditória. Fixada como regra permanente em
  `00_EOS_DISCOVERY_PROTOCOL.md` §7, aplicável a todas as rodadas.
- **Registro:** correção de condução. **Não é decisão funcional do produto.**

### COND-003 — Viés de custo afundado na formulação de perguntas
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (método, não produto)
- **O que motivou:** na `L1-Q6` eu recomendei um porte/regime de empresa **porque o código já
  contém um módulo grande de RH**. Isso inverte a ordem de raciocínio: o público define o produto,
  não o contrário.
- **Ordem de raciocínio fixada pelo usuário:** (1) público que o usuário deseja atender →
  (2) realidade das empresas-alvo → (3) problema mais relevante → (4) disposição de pagamento →
  (5) frequência de uso → (6) complexidade aceitável → **(7) só depois**, impacto no código
  existente.
- **Como o código existente passa a aparecer:** capacidade existente · possível ativo · possível
  excesso · custo de manutenção · custo de adaptação. **Nunca como determinante da resposta.**
- **Extensão aplicada pelo orquestrador, declarada para ser reversível:** a mesma correção foi
  aplicada à `L1-Q1` (chaveiro vs. prestador genérico), onde eu havia usado "o código já está lá"
  como razão. O usuário não pediu esta extensão — se discordar dela, ela volta atrás.
- **Registro:** correção de condução. **Não é decisão funcional do produto.**

### COND-004 — Desenho técnico prematuro em pergunta de descoberta
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (método, não produto)
- **O que motivou:** a `L1-Q8` que eu entreguei carregava solução técnica no enunciado — nome de
  coluna nullable, posição de papel em array, desenho de hierarquia. Isso é decisão de schema numa
  rodada cujo tema é constituição **funcional**.
- **Regra derivada:** pergunta de descoberta funcional não carrega solução técnica no enunciado
  nem nas alternativas. Estrutura de dado e migration aparecem, quando muito, no mapa de
  dependências — como consequência a considerar **depois** da decisão funcional. Fixada em
  `00_EOS_DISCOVERY_PROTOCOL.md` §7.
- **O que foi preservado:** o fato de que introduzir papel novo toca as funções que fecharam a
  escalada de privilégio do EV-060 **continua registrado** — migrou da pergunta para
  `00_DEPENDENCY_MAP.md` e para a §23 do documento da rodada.
- **Registro:** correção de condução. **Não é decisão funcional do produto.**

### COND-005 — Auditoria de marcadores epistemológicos
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (método, não produto)
- **O que motivou:** três afirmações minhas apareceram como fato sem sustentação.

| Afirmação que eu apresentei | Classificação correta | O que de fato está provado |
|---|---|---|
| "a base foi reaproveitada de outra vertical" | `[HIPÓTESE]` | Está provada **inconsistência de marca**: `barbers-flow.com` em 4 arquivos, "CHAVEIROBOT" numa tela, "AdmAi" no resto. A história de reaproveitamento **não se prova por isso** |
| "o dono provavelmente abre o painel algumas vezes por semana" | `[HIPÓTESE]` | Nada. Não há telemetria de uso no repositório |
| "a alternativa real é planilha, caderno e WhatsApp solto" | `[HIPÓTESE]` | Nada. Nenhum agente teve acesso à web; nenhuma pesquisa de mercado foi feita nesta frente |

- **Regra derivada:** conclusão sobre mercado, comportamento de usuário real ou história do
  produto **exige** pesquisa registrada ou resposta do usuário. Sem uma das duas, é `[HIPÓTESE]`.
- **Registro:** correção de condução. **Não é decisão funcional do produto.**

### COND-006 — Ajustes finais do Lote 1: duplicidade, finalidade de dado e força da evidência
- **Data:** 2026-08-05 · **Rodada:** 01 · **Marcador:** `[DECISÃO DO USUÁRIO]` (método, não produto)
- **Classificação do usuário:** "ajustes finais **não bloqueantes**" — a versão revisada do Lote 1
  foi aprovada para continuidade, condicionada a estes três ajustes textuais.

**(a) Duplicidade entre `L1-Q2` e `L1-Q3`.** A `L1-Q2` já investiga quem usa diariamente. A
`L1-Q3` repetia isso. Reformulada para **"Quais fluxos cada papel executa e com qual
frequência?"**, investigando por papel: ações diárias · semanais · mensais · excepcionais ·
criticidade · duração esperada · uso em campo ou escritório · necessidade de mobile · necessidade
de desktop · consequência de falha. **Objetivo:** descobrir quais **fluxos** merecem prioridade de
experiência — não repetir quem usa o produto.

**(b) Finalidade dos dados de RH.** Eu afirmei que CPF, data de nascimento, endereço, salário e
valor-hora são "coletados sem finalidade" porque não são consumidos por regra atual. **Isso é
conclusão, não observação** — ausência de consumo hoje não estabelece ausência de finalidade.
Decomposto em três níveis:

| Nível | Conteúdo |
|---|---|
| `[EVIDÊNCIA DO REPOSITÓRIO]` | Os campos são coletados; têm pouco ou nenhum consumo funcional identificado; não são adequadamente exibidos nem editados em determinados fluxos |
| `[PENDENTE]` | Finalidade atual, necessidade, acesso, retenção e uso futuro **precisam ser decididos** — matéria do Lote 10 |
| `[INFERÊNCIA]` | Pode existir coleta excessiva ou prematura, sujeita a análise de finalidade e necessidade |

**(c) "Demanda evidenciada" na `L1-Q8`.** Menção em landing, roadmap ou documentação **não
comprova demanda comercial**. Substituído por: `[EVIDÊNCIA DO REPOSITÓRIO]` existem papéis futuros
mencionados ou sugeridos na documentação e na comunicação do produto (contador e outras funções
administrativas); `[PENDENTE]` não existe, nesta rodada, evidência de demanda comercial validada
para esses papéis. A pergunta sobre o modelo ser definitivo ou provisório **foi preservada**.

- **Registro:** correção de condução. **Não é decisão funcional do produto.** Não gera linha em
  `00_TRACEABILITY_MATRIX.md`.

---

## Decisões substituídas

Nenhuma até o momento.

> Nota: `Q-005` foi **decomposta** (não substituída por decisão) em Q-007…Q-022 — ver
> `00_OPEN_QUESTIONS.md`. Decomposição de questão não é decisão e por isso não gera registro
> aqui.
