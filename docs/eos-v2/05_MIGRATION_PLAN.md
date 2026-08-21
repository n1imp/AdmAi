# 05 — Plano de migração para o EOS V2

**Data:** 2026-08-07 · **Base:** documentos `01` a `04`
**Status:** proposta. **Nenhuma fase autorizada.** Cada fronteira exige autorização explícita.

---

## 0. Premissas que a arqueologia estabeleceu

Três fatos mudam o formato do plano e devem ser lidos antes das fases:

1. **Não há sistema legado em execução** (`01` §2). Logo: **sem fase de desativação, quarentena ou
   coexistência.** O plano é de construção, não de substituição.
2. **Dois subsistemas já operam** — Decisão e Ambiente (`03`). Não serão reescritos; ganham
   extensão.
3. **O caminho crítico tem duas raízes independentes** — vetor de risco (G-01) e Proof Ledger
   (G-03) (`04` §1). Podem correr em paralelo.

**Escopo permanente do EOS V2:** ele governa **como o trabalho de engenharia é conduzido**. Não
altera o produto AdmAi. Nenhuma fase deste plano toca `chaveiro-bot/` ou `chaveiro-painel/`.

---

## 1. O problema do bootstrap

O EOS V2 precisa ser construído por um agente que ainda não é governado por ele. Sem tratar isso,
a primeira fase viola os próprios princípios que instala.

**Solução: bootstrap em três estágios, com o sistema vigente como andaime.**

| Estágio | Quem governa | O que se constrói |
|---|---|---|
| **B0 — Andaime** | `AGENTS.md` vigente (writer único, Codex REVISOR, gates) | Fases 1 e 2 |
| **B1 — Autogoverno parcial** | EOS V2 governa a si mesmo para o que já existe dele | Fases 3 a 5, já classificadas por L0–L3 |
| **B2 — Autogoverno pleno** | EOS V2 governa o trabalho de engenharia do AdmAi | Após a Fase 6 passar no self-test |

O `AGENTS.md` vigente é andaime **legítimo**, não provisório: ele já implementa P04 e o protocolo
tipado de revisão (`03` §4). O V2 o estende; não o substitui.

**Regra de bootstrap:** nenhuma fase pode ser verificada pelo mecanismo que ela mesma introduz.
A Fase 1 (vetor de risco) é verificada pelo Codex REVISOR, não pelo vetor de risco.

---

## 2. Fases

Toda fase declara: dependências · nível · critério de pronto · quem verifica · gate de saída.
**Nenhuma fase começa sem autorização explícita do usuário.**

### Fase 0 — Fechar as dívidas do ambiente

| | |
|---|---|
| **Depende de** | — |
| **Nível** | L2 |
| **Entrega** | T-01 resolvida (pin durável por proveniência); T-02 resolvida (Serena exercitado ou removido) |
| **Pronto quando** | Launcher inicia com preflight e diagnose em código zero, sem intervenção manual após auto-update; teste positivo e negativo de MCP executados |
| **Verifica** | Execução real do launcher — prova determinística, não inferência |
| **Gate** | Autorização para alterar o launcher além de hash e versão |

Primeira porque as demais fases dependem de um ambiente que **inicia de forma reprodutível**. T-02
exige janela com zero sessões ativas — só o usuário pode criá-la.

### Fase 1 — Vetor de risco e níveis L0–L3 · raiz A

| | |
|---|---|
| **Depende de** | — (pode correr em paralelo à Fase 2) |
| **Nível** | L2 |
| **Entrega** | Classificador de risco documentado: sinais de entrada, regra de composição, mapeamento para L0–L3, e o que cada nível **exige e dispensa** |
| **Pronto quando** | 20 tarefas reais do histórico do repositório são classificadas, e a classificação é **reproduzível por terceiro** a partir do documento |
| **Verifica** | Codex REVISOR (bootstrap B0) |
| **Gate** | Aprovação do mapeamento nível → profundidade |

Resolve G-01, destrava G-02, G-04, G-06. Sinais de entrada, herdados do que já existe: tipo de
mudança (`AGENTS.md` já lista segurança, auth, cobrança, dados, schema, API, contratos,
arquitetura), nº de chamadores reais, ambiente alvo, reversibilidade, e — como **um** sinal entre
outros, nunca decisivo — a regex de domínio herdada do roteador legado (`04` §2).

### Fase 2 — Proof Ledger · raiz B

| | |
|---|---|
| **Depende de** | — |
| **Nível** | L2 |
| **Entrega** | Formato de prova (o que é, quem produziu, **qual comando a gerou**, quando, frescor); índice consultável; regra de vínculo decisão ↔ prova |
| **Pronto quando** | As provas já existentes desta frente estão no ledger e são recuperáveis por decisão |
| **Verifica** | Codex REVISOR |
| **Gate** | Aprovação do formato antes de popular |

Resolve G-03, destrava G-05, G-07, G-11. **Não introduz tecnologia:** Markdown versionado em
`docs/`, coerente com a decisão já tomada duas vezes de forma independente (`03` §6).

Deve incorporar, como regra de primeira classe, a lição registrada em `03` §5: **documento descreve
o passado, código descreve o presente.** Prova sobre comportamento atual exige leitura do código ou
execução, nunca citação de relatório.

### Fase 3 — Roster de engenheiros + Contract Bus

| | |
|---|---|
| **Depende de** | Fases 1 e 2 |
| **Nível** | L2 |
| **Entrega** | 12 engenheiros migrados das skills legadas (`03` §3) + Performance e AI/Automation (G-10); ownership (G-09); **Contract Bus** (G-02) |
| **Pronto quando** | Uma tarefa que atravessa dois domínios transporta contrato entre eles sem intervenção manual |
| **Verifica** | Codex REVISOR |
| **Gate** | Aprovação do roster e do formato de contrato |

Reaproveita conteúdo verificado (`02` item 4) — os invariantes reais do repositório. **Muda o
acionamento:** de skill obrigatória por palavra-chave para papel acionado por risco e domínio.

**Restrição de custo, herdada de medição real:** cada skill soma sua `description` ao custo
permanente de **toda** sessão. 12–14 skills separadas seriam ordem de grandeza acima do orçamento
legado medido (`measuredAlwaysOnTokens: 880`, teto 1.000). O roster deve nascer sob teto de custo
declarado — provavelmente como conteúdo carregado sob demanda por um roteador único, que é o padrão
já validado por `admai-tool-router` (500 B permanentes / 4.407 B sob demanda).

### Fase 4 — Verification Engineer, Finding Router e Correction Loop

| | |
|---|---|
| **Depende de** | Fases 1 e 3 |
| **Nível** | **L3** |
| **Entrega** | Verificação graduada por nível (G-06); roteamento de achados (G-04); loop de correção que retorna ao nível mais baixo responsável (P06) |
| **Pronto quando** | Um achado injetado propositalmente é roteado ao nível correto e o loop fecha |
| **Verifica** | **Codex REVISOR obrigatório** — L3 |
| **Gate** | Aprovação explícita; toca a fronteira de segurança |

L3 porque redefine quem certifica o trabalho. Estende o protocolo do Revisor vigente, que já
implementa P04 — **não o substitui**.

### Fase 5 — Knowledge System

| | |
|---|---|
| **Depende de** | Fase 2 |
| **Nível** | L2 |
| **Entrega** | Contrato de entrada, formato, critério de promoção prova→conhecimento, regra de recuperação (G-05) |
| **Pronto quando** | Uma pesquisa concluída é recuperada por outra tarefa sem repesquisa (P03) |
| **Verifica** | Codex REVISOR |
| **Gate** | Aprovação do critério de promoção |

**Restrição vinculante:** não é MCP de memória. Decisão já tomada duas vezes (`03` §6).

### Fase 6 — Tool Router V2 + sequenciamento de ambiente

| | |
|---|---|
| **Depende de** | Fases 1, 3 e 5 |
| **Nível** | L2 |
| **Entrega** | Roteador que decide por risco (`04` §2), absorvendo `admai-tool-router`; sequenciamento local→staging→produção (G-08) |
| **Pronto quando** | Roteamento determinístico e reproduzível **e** profundidade proporcional ao risco, demonstrado nos dois extremos |
| **Verifica** | Self-test (Fase 7) |
| **Gate** | Aprovação antes de substituir o roteador vigente |

### Fase 7 — Self-test e dogfooding

| | |
|---|---|
| **Depende de** | Fases 1 a 6 |
| **Nível** | L2 |
| **Entrega** | Bateria automatizada que verifica **comportamento**, não configuração |
| **Pronto quando** | A bateria roda sozinha e falha quando deve falhar |
| **Verifica** | Execução real |
| **Gate** | Fim do bootstrap: passagem para B2 |

**Reaproveitar `domain-routing-smoke.mjs`** (`02` item 12): ele já instancia `claude.exe` em perfil
isolado e inspeciona **quais skills foram de fato invocadas**. É o padrão correto — verifica o que
aconteceu, não o que está escrito.

Casos mínimos, derivados dos conflitos e princípios documentados:

| # | Caso | Verifica |
|---|---|---|
| 1 | Tarefa trivial (L0) | Nenhum engenheiro carregado; nenhuma ferramenta externa — P01 |
| 2 | Tarefa crítica (L3) | Verificação obrigatória acionada; Codex exigido — P01, P04 |
| 3 | Tarefa de dois domínios | Contrato transportado — G-02 |
| 4 | **Teste negativo:** achado injetado | Roteado ao nível correto; loop fecha — P06 |
| 5 | **Teste negativo:** prova ausente | Sistema recusa concluir e declara validação não executada — P08 |
| 6 | Pesquisa repetida | Recuperada do Knowledge System, sem repesquisa — P03 |
| 7 | Escalada | L1 que revela risco maior escala para L2 sem reinício — P09 |
| 8 | Custo de contexto | Custo permanente do roster sob o teto declarado |

Casos 4 e 5 são **testes negativos** e são os que mais importam: um sistema que só passa nos casos
felizes não foi verificado.

---

## 3. Ordem e paralelismo

```
Fase 0 ─── ambiente estável (pré-requisito de tudo)
   │
   ├── Fase 1 (raiz A: risco) ──┬── Fase 3 (roster + bus) ──┬── Fase 4 (verificação, L3)
   │                            │                          │
   └── Fase 2 (raiz B: provas) ─┴── Fase 5 (conhecimento) ──┴── Fase 6 (router) ── Fase 7 (self-test)
```

Fases 1 e 2 em paralelo. As demais, sequenciais — cada uma consome a saída da anterior.
`AGENTS.md` exige trabalho sequencial e writer único: **uma fase por vez em execução**, mesmo
quando o grafo permite paralelismo lógico.

---

## 4. Estratégia de eficiência de contexto

Regras vinculantes, derivadas de medição real (`TOKEN_EFFICIENCY_BASELINE.md`, `plugin-lock.json`):

1. **Teto declarado de custo permanente.** Todo componente sempre-carregado declara seu custo em
   bytes medidos. Precedente: 880 B medidos contra teto de 1.000 B.
2. **Um roteador, não N skills.** Cada skill soma `description` a toda sessão. Padrão validado:
   500 B permanentes / 4.407 B sob demanda.
3. **Carregar sob demanda, por risco.** L0 não carrega engenheiro algum.
4. **Ferramenta externa só com lacuna medida** — critério que o legado e a matriz vigente já
   compartilham (`02` §4.1).
5. **Resumir saída de ferramenta, nunca despejar.** Precedente: screenshot de 265 KB gerado em
   memória e nunca inserido no contexto.
6. **Contexto mínimo ao Codex.** Uma decisão por consulta; nunca o histórico da rodada.

---

## 5. Riscos do próprio plano

| Risco | Mitigação |
|---|---|
| O V2 vira burocracia que encarece tudo | P01 é o antídoto e precisa ser testado primeiro: caso 1 do self-test verifica que L0 **não** aciona nada |
| Roster de 14 engenheiros estoura o orçamento de contexto | Teto declarado na Fase 3; caso 8 do self-test |
| Fases 1 e 2 nunca terminam por serem abstratas | Ambas exigem aplicação a material **já existente** — 20 tarefas reais, provas já produzidas |
| O bootstrap se autocertifica | Regra explícita: nenhuma fase é verificada pelo mecanismo que introduz |
| A migração retoma a maquinaria de plugins por custo afundado | `01` §4 documenta que a remoção foi deliberada; retomá-la exige decisão nova e explícita |
| O plano cresce e toca o produto | Escopo permanente declarado em §0: o EOS não altera o AdmAi |

---

## 6. O que este plano **não** propõe

- Mesclar `ai/codex/TASK-023`, `ai/claude/TASK-024` ou `ai/claude/TASK-025`. Permanecem intactas
  como evidência histórica (`02` §1).
- Reintroduzir plugins, hooks ou MCP de memória.
- Alterar `chaveiro-bot/` ou `chaveiro-painel/`.
- Alterar CI, schema, migrations, dependências ou lockfiles.
- Retomar o discovery funcional do AdmAi — frente distinta, com Lote 1 ainda aguardando resposta.
