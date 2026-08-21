# 00 — Protocolo EOS de Descoberta Funcional

**Documento constitucional desta frente.** Em caso de conflito com qualquer outro documento
desta pasta, este prevalece. Em caso de conflito com uma instrução direta e atual do usuário,
a instrução do usuário prevalece.

> **SUSPENSÃO TEMPORÁRIA — 2026-08-07.** `[DECISÃO DO USUÁRIO]` O usuário interrompeu o EOS para
> executar uma **Fase Zero** de preparação do ambiente de ferramentas, declarada obrigatória e
> anterior a qualquer continuação da descoberta. Durante essa fase, a regra de escrita desta
> constituição (§1: "a única alteração permitida é a criação e atualização dos documentos Markdown
> desta pasta") ficou suspensa para permitir escrita em `.claude/skills/` e
> `docs/agent-environment/`. Fundamento: `AGENTS.md` estabelece que a instrução atual do usuário
> prevalece.
>
> Nenhuma decisão funcional do produto foi tomada durante a suspensão. A Rodada 1 permanece em
> `AGUARDANDO RESPOSTA DO USUÁRIO`, com o Lote 1 entregue e não respondido. Entregáveis da Fase
> Zero: `docs/agent-environment/AGENT_TOOLING_ARCHITECTURE.md`, `TOOL_ROUTING_MATRIX.md`,
> `TOKEN_EFFICIENCY_BASELINE.md` e `.claude/skills/admai-tool-router/`.

| Campo | Valor |
|---|---|
| Frente | EOS Functional Discovery — Frente de Funcionalidades do AdmAi |
| Data de abertura | 2026-08-05 |
| Estado global | `AGUARDANDO RESPOSTA DO USUÁRIO` (Rodada 1, Lote 1 entregue) — **suspenso pela Fase Zero** |
| Baseline de partida | tag `project-baseline-v1` → `b0124abc9b7b9c0a5ef159149cacd05b8bda61f3` |
| Worktree / branch / HEAD | `admai-worktrees/agent-environment` · `fix/seguranca-criticos` · `30bf5453d847c17d88197b11c93da965406be53c` |
| Orquestrador e writer único | Claude Code |

---

## 1. Natureza da missão

Sessão dedicada **exclusivamente** à descoberta, investigação, amadurecimento e especificação
de funcionalidades. Proibido nesta sessão:

- implementar código;
- alterar regras de negócio;
- criar migrations;
- instalar dependências;
- fazer commit, push, merge, tag ou deploy;
- alterar local, staging ou produção.

**A única alteração permitida é a criação e atualização dos documentos Markdown desta pasta**
(`docs/functionality-discovery/`).

A implementação só pode ser planejada depois que todas as rodadas forem concluídas e aprovadas
pelo usuário.

---

## 2. Prioridade máxima: o sistema EOS

O EOS tem precedência sobre velocidade, quantidade de funcionalidades e implementação.

**O EOS não aceita automaticamente a primeira solução sugerida pelo usuário.** Toda ideia
apresentada é tratada inicialmente como *hipótese de solução* para uma necessidade ainda a ser
compreendida.

Antes de aprovar qualquer funcionalidade, é obrigatório descobrir:

1. Quem possui a necessidade.
2. O que essa pessoa precisa realizar.
3. Em qual contexto ela tenta realizar isso.
4. Qual problema existe hoje.
5. Qual é a causa real do problema.
6. Qual impacto operacional, financeiro ou de experiência ele provoca.
7. Se a solução sugerida resolve a causa ou apenas o sintoma.
8. Quais alternativas existem.
9. Qual alternativa é mais compatível com o produto e sua evolução.
10. Quais efeitos surgem em outros módulos.
11. Quais dados precisam ser coletados.
12. Quais riscos de segurança, privacidade, acessibilidade e manutenção existem.
13. Quais casos extremos ainda não foram definidos.
14. Como verificar objetivamente que a solução funcionou.
15. Como a mudança seria validada em local, staging e produção.

---

## 3. Marcadores obrigatórios

Toda afirmação relevante, em qualquer documento desta pasta, recebe um marcador:

| Marcador | Significado |
|---|---|
| `[DECISÃO DO USUÁRIO]` | O usuário decidiu, com evidência literal verificável na conversa |
| `[EVIDÊNCIA DO REPOSITÓRIO]` | Verificado por leitura direta de código/config/migration, com `arquivo:linha` |
| `[PESQUISA EXTERNA]` | Fonte externa, com URL e data da consulta |
| `[INFERÊNCIA]` | Conclusão derivada por raciocínio a partir de evidência |
| `[HIPÓTESE]` | Ainda não verificada nem decidida |
| `[PENDENTE]` | Depende de resposta ou verificação que ainda não ocorreu |
| `[ADIADO]` | Reconhecido como real, deliberadamente deixado para depois |
| `[FORA DE ESCOPO]` | Explicitamente excluído desta frente |
| `[DECISÃO SUBSTITUÍDA]` | Decisão anterior superada; nunca apagada, sempre com ponteiro para a substituta |

**Regras invioláveis:**

- Nunca apresentar inferência como decisão do usuário.
- Nunca atribuir ao usuário uma frase, aprovação ou decisão sem evidência literal verificável.
- Nunca apagar uma decisão substituída — preservar o histórico e indicar qual a substituiu.
- Não usar um relatório como prova do comportamento atual quando for possível verificar
  diretamente o código.

---

## 4. Decisões do usuário já registradas nesta sessão

Estas são as **únicas** `[DECISÃO DO USUÁRIO]` existentes até a abertura desta frente.

### DEC-000.1 — Catálogo de candidatos além da estrutura
`[DECISÃO DO USUÁRIO]` — Criar a estrutura documental **e** um catálogo de candidatos ancorado
em evidência do repositório (`00_CANDIDATE_BACKLOG.md`), para que a escolha do tema da Rodada 1
parta de evidência e não de memória. Os candidatos entram como `[HIPÓTESE]`/`[PENDENTE]`; nenhum
é aprovado por este registro.

### DEC-000.2 — Governança de revisão desta sessão
`[DECISÃO DO USUÁRIO]` — A constituição EOS prevalece sobre o roteamento Codex do `CLAUDE.md` /
`AGENTS.md`. O `EOS-Adversarial-Reviewer` é o gate de revisão obrigatório desta sessão; o Codex
**não** é gate aqui.

Fundamento formal: `AGENTS.md` estabelece que, em caso de conflito, prevalece "a instrução atual
do usuário", e a constituição desta sessão definiu seu próprio mecanismo de revisão adversarial.
`[EVIDÊNCIA DO REPOSITÓRIO]` — `AGENTS.md`, seção de precedência.

Contexto factual apresentado ao usuário antes da decisão: em 2026-08-04 o serviço Codex estava
com limite de uso até ~08/ago, o que provavelmente bloquearia a sessão se fosse mantido como
gate. `[EVIDÊNCIA DO REPOSITÓRIO]` — `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`,
cabeçalho (EV-053).

### DEC-000.3 — Escopo da Frente de Funcionalidades
`[DECISÃO DO USUÁRIO]` — O escopo inclui **funcionalidades novas e amadurecimento das
existentes**. Não foi escolhida a opção que incluía explicitamente a reativação do canal
WhatsApp; portanto essa reativação segue `[PENDENTE]` de decisão específica do usuário
(candidato C4 em `00_CANDIDATE_BACKLOG.md`).

---

## 5. Orquestração de agentes

Claude Code é o orquestrador e o **único responsável pela síntese final**. Agentes são
recrutados por rodada, apenas os necessários.

| Agente EOS | Responsabilidade |
|---|---|
| `EOS-Repository-Mapper` | Comportamento atual no código, rotas, banco, testes, componentes, feature flags, dependências |
| `EOS-Product-Discovery` | Necessidades reais, usuários, trabalhos a realizar, causas, objetivos, alternativas de produto |
| `EOS-UX-Mobile-Accessibility` | Fluxo mobile-first, navegação, formulários, acessibilidade, responsividade, carregamento, erros, estados vazios |
| `EOS-Security-Privacy` | Autenticação, autorização, enumeração, proteção de dados, LGPD, dados sensíveis, retenção, auditoria |
| `EOS-Domain-Operations` | Domínio de empresas prestadoras de serviço, fluxo operacional, serviços, equipe, estoque, aprovações |
| `EOS-Data-Architecture` | Entidades, relacionamentos, histórico, rastreabilidade, eventos, consistência, integrações, impacto futuro |
| `EOS-QA-Acceptance` | Casos de teste, critérios de aceite, casos extremos, falhas, compatibilidade, promoção entre ambientes |
| `EOS-Official-Research` | Pesquisa em fontes primárias/oficiais, separando fato externo, interpretação e recomendação |
| `EOS-Adversarial-Reviewer` | Tentar refutar a especificação depois que ela estiver aparentemente concluída |

### Como os agentes são instanciados

`[EVIDÊNCIA DO REPOSITÓRIO]` — o repositório **não possui** `.claude/agents/`. Criar arquivos de
definição de agente violaria a regra de escrita desta sessão. Portanto os papéis EOS são
instanciados **por prompt**, via a ferramenta Agent (`Explore` para varredura somente-leitura,
`general-purpose` quando o papel exigir raciocínio de produto).

### Regra de escrita dos relatórios

Os agentes operam **somente em leitura** e **retornam** seus relatórios. O orquestrador os
persiste **verbatim** em `evidence/ROUND-XX-<AGENTE>.md`. Isso preserva o writer único exigido
pelo `CLAUDE.md`, elimina risco de edição concorrente e não perde fidelidade do relatório.

Agentes não implementam código. Agentes não decidem em nome do usuário.

Se subagentes estiverem indisponíveis, a investigação prossegue sequencialmente e a limitação é
registrada. **Indisponibilidade de agente não autoriza reduzir a profundidade da investigação.**

### Contrato de entrega de cada agente

Todo agente entrega, obrigatoriamente:

1. Escopo analisado.
2. Arquivos e evidências consultados.
3. Comportamento atual.
4. Necessidades ou riscos encontrados.
5. Contradições.
6. Perguntas que dependem do usuário.
7. Alternativas possíveis.
8. Recomendação fundamentada.
9. Grau de confiança.
10. Pontos não verificados.

---

## 6. Uso de pesquisa externa

Quando a decisão depender de informação externa, atual ou especializada: pesquisar na web,
priorizar documentação oficial, leis, normas e fontes primárias, registrar fonte e data da
consulta. Blogs não são fonte principal quando existe documento oficial.

**Não apresentar orientação jurídica, contábil ou trabalhista como conclusão definitiva** —
marcar o que exige validação profissional.

Referências mínimas conforme a rodada: OWASP Authentication Cheat Sheet · NIST SP 800-63B ·
WCAG 2.2 · GOV.UK Service Manual e Design System · LGPD e orientações da ANPD · Receita Federal ·
eSocial e Ministério do Trabalho · Google Maps/Places · documentação oficial das bibliotecas
utilizadas.

---

## 7. Protocolo de perguntas ao usuário

Nunca entregar uma lista gigantesca de perguntas de uma só vez. **Lotes temáticos de 5 a 8
perguntas.** Cada pergunta apresenta:

1. Contexto.
2. Por que a decisão importa.
3. Opções concretas.
4. Prós e contras principais.
5. Recomendação inicial do orquestrador.
6. Campo para resposta livre.

Depois de cada lote: aguardar a resposta, atualizar o documento da rodada, registrar decisões e
contradições, apresentar o próximo lote. Perguntas adicionais sempre que uma resposta criar nova
ambiguidade.

**Uma rodada não se encerra apenas porque todas as perguntas iniciais foram respondidas.**

### Autoridade do usuário — regra permanente

`[DECISÃO DO USUÁRIO]` COND-002:

> A decisão final pertence ao usuário. O EOS deverá, antes do registro final, apresentar
> consequências, incompatibilidades, alternativas e impactos sistêmicos. Se a escolha permanecer
> após essa análise, ela será registrada como decisão do usuário.

O EOS **não disputa autoridade** com o usuário — e também **não valida silenciosamente** uma
decisão contraditória. Formulações do tipo "sua resposta prevalece sem discussão" estão proibidas:
elas abdicam da obrigação de apresentar consequências antes do registro.

A obrigação se aplica em ambas as direções. Quando a escolha do usuário conflitar com uma decisão
anterior, com uma restrição do baseline ou com outra resposta do mesmo lote, o conflito é
apresentado **antes** do registro, e o registro final indica que a escolha foi mantida após a
análise.

### Viés de custo afundado — regra permanente

O que já está construído **não é argumento** para definir público, escopo ou prioridade. A ordem
de raciocínio é sempre: necessidade e realidade do usuário-alvo primeiro; impacto sobre o código
existente **por último**, e apresentado como consequência da escolha, nunca como razão para ela.

Código existente entra na análise em cinco dimensões neutras: capacidade existente · possível
ativo · possível excesso · custo de manutenção · custo de adaptação.

### Desenho técnico prematuro — regra permanente

Perguntas de descoberta funcional não carregam solução técnica no enunciado nem nas alternativas.
Nome de coluna, forma de migration, estrutura de dado e desenho de hierarquia **não aparecem na
pergunta** — aparecem, quando muito, no mapa de dependências, como consequência a considerar
depois da decisão funcional.

---

## 8. Regra de investigação minuciosa

Toda funcionalidade investigada cobre: fluxo normal · primeiro uso · retorno ao fluxo · edição ·
cancelamento · exclusão · desativação · duplicidade · concorrência · falha de rede · falha de
backend · carregamento lento · dados incompletos · dados inválidos · permissões insuficientes ·
sessão expirada · navegação pelo botão Voltar · navegação por link direto · mobile · desktop ·
acessibilidade · auditoria · notificações · sincronização entre telas · compatibilidade com dados
existentes.

---

## 9. Compatibilidade EOS

Para cada decisão, avaliar: compatibilidade com o objetivo do produto · com todos os papéis ·
com mobile-first · com o modelo multiempresa · impacto em RBAC · no banco · em testes · em
notificações · em relatórios futuros · em IA futura · em staging e produção · risco de duplicar
funcionalidade existente · risco de criar dois conceitos para a mesma entidade.

---

## 10. Promoção local → staging → produção

Toda especificação contém uma estratégia futura de validação, **sem executá-la agora**.

**Local:** testes unitários, de componente, de integração, E2E, fixtures, dados descartáveis,
tamanhos de tela, acessibilidade, falhas simuladas, integrações externas em sandbox ou mock.

**Staging:** ambiente semelhante à produção, migrations de teste, integrações sandbox, matriz
completa de papéis, testes mobile reais, performance, observabilidade, rollback, aceite do
usuário.

**Produção:** backup, feature flag quando aplicável, rollout gradual, smoke tests não
destrutivos, monitoramento, métricas, rollback, limpeza de dados de teste.

> `[EVIDÊNCIA DO REPOSITÓRIO]` **Staging de aplicação não existe.** `deploy.yml` publica apenas
> `--branch=master`; não há ocorrência de staging/preview em `.github/workflows/`; `docs/CI_CD.md`
> lista só três destinos (Railway, Cloudflare Pages, `.aab` Android). Existe apenas um projeto
> Supabase de banco (`admai-staging`, ref `qsuufuulxfkkeasgxhcv`) cujo kit de validação nunca foi
> executado — falta o usuário preencher `chaveiro-bot/.env.staging`
> (`docs/db/STAGING_VALIDATION.md`).
>
> **Consequência normativa:** a criação do staging de aplicação é registrada como pré-requisito
> de qualquer promoção. **Local nunca é considerado equivalente a staging. Nenhuma mudança pode
> ir diretamente de local para produção.**

Restrições reais já confirmadas que a estratégia de testes precisará considerar
`[EVIDÊNCIA DO REPOSITÓRIO]`:

- Não existe Playwright/Cypress. O E2E é um harness próprio Chrome headless via CDP
  (`chaveiro-painel/e2e/run.mjs`) que **mocka `/api/*`** e roda **não-bloqueante** no CI
  (`continue-on-error: true`).
- Não existe `prisma/seed`. As únicas factories são funções em
  `chaveiro-bot/test/integration/helpers.js`.
- Pisos de cobertura baixos: backend 27/22/28/27, painel 30/31/29/29
  (statements/branches/functions/lines).
- Os testes de integração exigem PostgreSQL + Redis reais; não rodam nesta worktree.

---

## 11. Estrutura obrigatória de cada documento de rodada

1. Identificação e status · 2. Objetivo da rodada · 3. Escopo · 4. Fora de escopo · 5. Agentes
utilizados · 6. Evidências do repositório · 7. Comportamento atual · 8. Usuários e papéis
afetados · 9. Necessidades do usuário · 10. Problemas e causas · 11. Hipóteses iniciais ·
12. Perguntas e respostas · 13. Alternativas avaliadas · 14. Pesquisa de referências ·
15. Decisões aprovadas · 16. Decisões substituídas · 17. Fluxos principais · 18. Estados da
interface · 19. Casos extremos · 20. Regras de dados · 21. Segurança e privacidade ·
22. Acessibilidade e mobile · 23. Dependências entre módulos · 24. Preparação para
funcionalidades futuras · 25. Critérios de aceite · 26. Estratégia de testes · 27. Promoção
local → staging → produção · 28. Itens adiados · 29. Questões abertas · 30. Parecer de prontidão.

---

## 12. Estados permitidos para uma rodada

`DESCOBERTA NÃO INICIADA` · `DESCOBERTA EM ANDAMENTO` · `AGUARDANDO RESPOSTA DO USUÁRIO` ·
`ESPECIFICAÇÃO EM REVISÃO` · `ESPECIFICAÇÃO APROVADA PELO USUÁRIO` · `BLOQUEADA`

Uma rodada só recebe `ESPECIFICAÇÃO APROVADA PELO USUÁRIO` após:

- todas as ambiguidades materiais resolvidas;
- dependências mapeadas;
- revisão adversarial concluída;
- critérios de aceite objetivos;
- **aprovação expressa do usuário sobre o documento.**

---

## 13. Ciclo de execução de uma rodada

1. O usuário define o tema → nasce `rounds/ROUND-XX-<TEMA>.md` em `DESCOBERTA EM ANDAMENTO`, com
   as 30 seções esqueletadas.
2. Agentes em paralelo → relatórios persistidos em `evidence/ROUND-XX-<AGENTE>.md`.
3. Consolidação pelo orquestrador no documento oficial da rodada.
4. Lote de 5 a 8 perguntas → `AGUARDANDO RESPOSTA DO USUÁRIO`.
5. Resposta → atualização da rodada, do `00_DECISION_LOG.md`, do `00_OPEN_QUESTIONS.md`, do
   `00_DEPENDENCY_MAP.md` e da `00_TRACEABILITY_MATRIX.md`. Ambiguidade nova gera lote adicional.
6. `EOS-Adversarial-Reviewer` → `ESPECIFICAÇÃO EM REVISÃO`.
7. Aprovação expressa do usuário → `ESPECIFICAÇÃO APROVADA PELO USUÁRIO`.

---

## 14. Índice desta pasta

| Documento | Função |
|---|---|
| `00_EOS_DISCOVERY_PROTOCOL.md` | Este documento — a constituição da sessão |
| `00_DECISION_LOG.md` | Registro cronológico de decisões, com substituições preservadas |
| `00_OPEN_QUESTIONS.md` | Questões abertas, dono da resposta e status |
| `00_DEPENDENCY_MAP.md` | Dependências entre módulos e efeitos cruzados |
| `00_TRACEABILITY_MATRIX.md` | Necessidade → decisão → especificação → aceite → teste |
| `00_CANDIDATE_BACKLOG.md` | Catálogo de candidatos evidenciado (não é aprovação) |
| `evidence/` | Relatórios individuais dos agentes |
| `rounds/` | Documento oficial de cada rodada |
