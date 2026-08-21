# 03 — Mapa de interfaces dos seis subsistemas

**Data:** 2026-08-07 · **Base:** documentos `01` e `02`

Cada subsistema é descrito por entradas, saídas, contrato, produtor, consumidor e — a coluna que
importa para a migração — **substrato real hoje**. A pergunta não é "o que o V2 quer", e sim
"sobre o que ele será construído".

**Legenda de substrato:** `VIVO` (existe e opera hoje) · `PARCIAL` (existe substrato, falta o
contrato) · `GREENFIELD` (nada existe).

---

## Visão geral

| Subsistema | Substrato hoje | Base existente | Falta |
|---|---|---|---|
| **Decisão** | `VIVO` | `AGENTS.md` + `CLAUDE.md` + launcher | Vetor de risco, níveis L0–L3, escalada |
| **Ambiente** | `VIVO` | Launcher pinado, `TOOL_ROUTING_MATRIX.md`, perfis operacionais | Sequenciamento formal local→staging→prod |
| **Engenharia** | `PARCIAL` | 12 skills legadas (inertes) + skill `admai-tool-router` (viva) | Roster ativo, ownership, Contract Bus |
| **Verificação** | `PARCIAL` | Codex REVISOR, CI, Semgrep, testes, harness E2E | Verification Engineer formal, Finding Router, Correction Loop |
| **Evidência** | `PARCIAL` | `docs/` versionado, relatórios, evidências verbatim do discovery | Proof Ledger consultável, prova determinística × inferência |
| **Conhecimento** | `GREENFIELD` | — (a tentativa legada morreu) | Tudo |

**Leitura:** o V2 não parte do zero. Dois subsistemas já operam e **não devem ser reescritos**; dois
têm substrato sólido esperando contrato; um é construção nova. Essa distribuição determina a ordem
da migração no documento 05.

---

## 1. Sistema de Decisão — `VIVO`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Pedido do usuário · classificação de materialidade · evidência do repositório |
| **Saídas** | Decisão registrada · rota (decidir sozinho / consultar Codex / perguntar ao usuário) · nível de profundidade |
| **Contrato hoje** | `AGENTS.md`: protocolo DECISOR/ÁRBITRO com campos obrigatórios e formato de resposta tipado |
| **Produz** | Claude (writer único) |
| **Consome** | Todos os demais subsistemas |
| **Autoridade** | Usuário: negócio, custo, risco, operações irreversíveis · Codex: decisão técnica material · Claude: trivial e reversível |

**O que já funciona.** O roteamento de três vias do `CLAUDE.md` (trivial → decide; material →
Codex; reservada → usuário) é uma implementação real do EOS Decision System, em uso nesta sessão.

**Lacuna.** A materialidade hoje é **binária** — material ou não. O V2 exige **vetor de risco** e
níveis L0–L3, com profundidade proporcional (P01). O tipo de mudança já é considerado (segurança,
auth, cobrança, dados, schema, API, contratos, arquitetura), mas não há graduação: uma alteração de
API trivial e uma reescrita de RBAC caem na mesma categoria.

---

## 2. Sistema de Ambiente — `VIVO`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Perfil operacional · ambiente alvo · ferramenta solicitada |
| **Saídas** | Ferramenta autorizada ou negada · ambiente confirmado · gate exigido |
| **Contrato hoje** | Launcher `start-baseline.ps1` (cadeia de hashes pinada, `--strict-mcp-config`, allowlist por ferramenta) + `TOOL_ROUTING_MATRIX.md` §2 e §3 |
| **Produz** | Launcher (imposição) · matriz (política) |
| **Consome** | Engenharia, Verificação |

**O que já funciona — e é mais forte que o previsto pelo V2.** A cadeia de integridade cobre
binário do Claude, Node, settings do perfil e do projeto, manifestos MCP, wrapper e política do
Codex, `.codex/config.toml`, branch e HEAD. A allowlist é **por ferramenta**, não por servidor.
Os quatro níveis de automação (`AUTO-ROUTE`, `AUTO-READ`, `CONTROLLED-WRITE`, `MANUAL-GATE`)
separam *rotear* de *executar efeito colateral* — distinção que o V2 precisa e não descreve.

**Lacuna.** P05 exige sequenciamento formal local → staging → produção. Hoje existem perfis
operacionais definidos, mas não uma máquina de estados que **impeça** pular etapa.

**Fragilidade conhecida.** O pin exato de versão disputa com o auto-update do Claude Code: duas
quebras em cinco dias (2.1.222→2.1.223, 2.1.223→2.1.224), a segunda deixando lock órfão e atestado
defasado. É dívida ativa do subsistema, registrada no documento 04, §4.

---

## 3. Sistema de Engenharia — `PARCIAL`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Tarefa classificada por nível e domínio · contratos de outros engenheiros |
| **Saídas** | Implementação · contrato publicado · evidência de execução |
| **Contrato hoje** | **Inexistente entre engenheiros.** Só a orientação individual das skills |
| **Produz** | Engenheiro de domínio |
| **Consome** | Verificação, Evidência |

**Substrato disponível.** As 12 skills legadas (`02`, item 4) cobrem quase integralmente o roster
V2. Mapeamento direto:

| Skill legada | Engineer V2 |
|---|---|
| `backend-api`, `queues-workers` | Backend Engineer |
| `frontend-ui` | Frontend Engineer |
| `data-prisma` | Data Engineer |
| `mobile-capacitor` | Mobile/Offline Engineer |
| `auth-security` | Security Engineer |
| `integrations` | External Integrations Engineer / Integration Engineer |
| `accessibility` | Accessibility Engineer |
| `tests-quality` | Verification Engineer *(ver §4 — pertence a outro subsistema)* |
| `ci-ops` | Release Engineer + Observability Engineer |
| `billing` | domínio de negócio, sem Engineer V2 correspondente |
| `docs-governance` | pertence a Conhecimento, não a Engenharia |

**Ausentes no legado:** Performance Engineer, AI/Automation Engineer. **`MISSING`.**

**Lacuna central — o Contract Bus.** As skills legadas são orientações isoladas: nenhuma publica
contrato, nenhuma consome contrato de outra. Um trabalho que atravessa backend e frontend não tem,
hoje, como transportar a decisão de um lado ao outro senão pela cabeça do Claude. É o componente
`MISSING` de maior impacto do V2.

---

## 4. Sistema de Verificação — `PARCIAL`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Implementação pronta · testes obrigatórios declarados · nível de risco |
| **Saídas** | Veredito tipado · achados · validações confirmadas · **validações não executadas** · risco residual |
| **Contrato hoje** | `AGENTS.md` §Protocolo do Revisor — formato tipado, sem aprovação condicional |
| **Produz** | Codex REVISOR (conversa nova, somente leitura) · CI · Semgrep · testes |
| **Consome** | Decisão (o veredito realimenta) |

**O que já funciona, e é notavelmente aderente ao V2.** O protocolo do Revisor já implementa P04
(implementador não se autocertifica): conversa nova, sem histórico do Decisor, inspeção direta de
commits e diff, e a regra explícita *"Não existe aprovação condicional. Teste obrigatório não
executado mantém `CORRECOES_NECESSARIAS`"*. O campo `VALIDACOES_NAO_EXECUTADAS` é um mecanismo
de honestidade que o V2 pede e que **já existe**.

Camadas automatizadas vivas: CI (`.github/workflows/ci.yml`), Semgrep (mesmos rulesets local e CI),
`npm test`, `npm run lint`, `format:check`, harness E2E, Playwright para o que o harness não alcança.

**Lacunas.**
- **Verification Engineer** como papel permanente — hoje a revisão é acionada por evento, não
  contínua, e não há graduação por nível (P01).
- **Finding Router** — achados não têm roteamento automático para o nível responsável (P06).
- **Correction Loop** — o retorno ao nível mais baixo responsável é manual.
- **Prioridade de prova determinística** (P08) — não há distinção formal entre "o teste passou" e
  "eu inferi que está correto".

---

## 5. Sistema de Evidência — `PARCIAL`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Saída de comando · resultado de teste · leitura de arquivo · relatório de agente |
| **Saídas** | Prova citável, com o comando que a produziu |
| **Contrato hoje** | Convenção, não mecanismo: `docs/` versionado; evidência verbatim em `docs/functionality-discovery/evidence/` |
| **Produz** | Todos |
| **Consome** | Decisão, Verificação |

**Substrato existente e melhor do que parece.** A sessão de discovery já pratica o padrão: 9
relatórios de agente preservados **verbatim**, sem resumo do Claude. Os ~30 relatórios B1/B2/B3 do
legado são o mesmo padrão. `TOKEN_EFFICIENCY_BASELINE.md` aplica a regra mais forte do subsistema:
*"só entram medidas observadas nesta execução; onde não houve como medir, está escrito que não
houve"*.

**Precedente registrado de falha.** Nesta frente ocorreu o erro que o subsistema existe para
impedir: usar um **relatório** como prova de **comportamento atual** (afirmações C2/C3 sobre
retenção de ponto, refutadas pela leitura direta do código em `agendador.js:168`). A lição é
estrutural: documento descreve o passado, código descreve o presente.

**Lacunas.** Não existe **Proof Ledger** — as provas estão espalhadas por documentos, sem índice
consultável nem vínculo formal decisão ↔ prova. E não há marcação de **frescor**: nada indica que
uma prova de 2026-07-30 possa estar obsoleta.

---

## 6. Sistema de Conhecimento — `GREENFIELD`

| Aspecto | Conteúdo |
|---|---|
| **Entradas** | Pesquisa concluída · decisão registrada · incidente resolvido · padrão descoberto |
| **Saídas** | Conhecimento recuperável, para não repesquisar (P03) |
| **Contrato hoje** | **Nenhum** |
| **Produz** | — |
| **Consome** | — |

**Estado.** É o único subsistema sem substrato. A tentativa legada (`admai-claude-mem-mcp` +
Chroma) foi desativada pelo próprio autor por incompatibilidade com Windows, e a política vigente
já rejeitou memory MCPs — `TOOL_ROUTING_MATRIX.md` §4: *"Estado durável do projeto vive em `docs/`,
versionado e auditável"*.

**Consequência de desenho, não acidente.** O Knowledge System V2 **não deve ser um MCP de memória**.
A decisão vigente é sólida e já foi tomada duas vezes de forma independente. O caminho é
conhecimento **versionado, textual e auditável** em `docs/` — o que o repositório já faz de fato,
sem chamar assim: `AGENT_DECISIONS.md`, `TOOL_ROUTING_MATRIX.md`, `TOKEN_EFFICIENCY_BASELINE.md`,
os documentos de incidente e as decisões registradas do discovery.

O trabalho do V2 aqui é **dar contrato ao que já existe** — índice, formato, critério de entrada e
regra de recuperação — não introduzir tecnologia nova.

---

## 7. Fluxo entre subsistemas

```
Pedido do usuário
      │
      ▼
┌─────────────┐  classifica risco (L0-L3) e domínio
│  DECISÃO    │◄──────────────────────────────┐
└─────┬───────┘                               │
      │ rota + nível                          │ veredito realimenta
      ▼                                       │
┌─────────────┐   autoriza ferramenta         │
│  AMBIENTE   │   e ambiente                  │
└─────┬───────┘                               │
      │                                       │
      ▼                                       │
┌─────────────┐  Contract Bus  ┌──────────────┴──┐
│ ENGENHARIA  │───────────────►│  VERIFICAÇÃO    │
└─────┬───────┘   (MISSING)    └────────┬────────┘
      │                                 │ achados
      │ evidência                       │ (Finding Router — MISSING)
      ▼                                 ▼
┌─────────────┐                ┌─────────────────┐
│  EVIDÊNCIA  │───────────────►│  CONHECIMENTO   │
│  (PARCIAL)  │                │  (GREENFIELD)   │
└─────────────┘                └─────────────────┘
```

As três arestas críticas ausentes: **Contract Bus** (Engenharia↔Engenharia e Engenharia→Verificação),
**Finding Router** (Verificação→nível responsável) e **Evidência→Conhecimento** (promoção de prova a
conhecimento reutilizável).
