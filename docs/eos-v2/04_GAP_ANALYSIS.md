# 04 — Análise de lacunas e conflitos

**Data:** 2026-08-07 · **Base:** documentos `01`, `02` e `03`

---

## 1. Lacunas — o que o V2 exige e não existe

Ordenadas por impacto sobre a migração, não por subsistema.

| ID | Lacuna | Subsistema | Nível | Impacto | Depende de |
|---|---|---|---|---|---|
| **G-01** | **Vetor de risco e níveis L0–L3** | Decisão | L2 | **Bloqueante.** Sem graduação de risco, P01 e P09 não são implementáveis, e o Tool Router V2 não tem como decidir profundidade | — |
| **G-02** | **Contract Bus** entre engenheiros | Engenharia | L2 | Alto. Sem ele, o roster é um conjunto de orientações isoladas, não um grafo | G-01 |
| **G-03** | **Proof Ledger** — índice consultável de provas, vinculado a decisões | Evidência | L2 | Alto. Sem ele, P02 e P08 dependem de disciplina humana | — |
| **G-04** | **Finding Router** + Correction Loop | Verificação | L2 | Alto. P06 (falha retorna ao nível mais baixo responsável) hoje é manual | G-01 |
| **G-05** | **Knowledge System** com contrato de entrada e recuperação | Conhecimento | L2 | Médio-alto. P03 (*research once, reuse many*) não existe hoje | G-03 |
| **G-06** | **Verification Engineer** como papel graduado por nível | Verificação | L3 | Médio. O Codex REVISOR cobre parte, mas é acionado por evento e não gradua | G-01 |
| **G-07** | Distinção formal prova determinística × inferência | Evidência | L2 | Médio. P08. Hoje é convenção de escrita | G-03 |
| **G-08** | Sequenciamento imposto local → staging → produção | Ambiente | L2 | Médio. P05. Há perfis definidos, não máquina de estados | — |
| **G-09** | **Ownership** explícito por engenheiro | Engenharia | L1 | Baixo-médio | G-02 |
| **G-10** | Performance Engineer e AI/Automation Engineer | Engenharia | L1 | Baixo. Papéis sem precursor legado | G-02 |
| **G-11** | Imutabilidade progressiva (P10) | Evidência | L2 | Baixo hoje, alto depois. Sem ela, um registro antigo pode ser reescrito sem rastro | G-03 |

**Caminho crítico:** `G-01 → G-02/G-04` e `G-03 → G-05/G-07/G-11`. São **duas raízes
independentes** — o vetor de risco e o ledger de provas. Podem ser construídas em paralelo, e
tudo o mais depende de uma das duas. Isso determina a ordem do documento 05.

---

## 2. O conflito central — P01 × roteador legado

**O único conflito arquitetural real encontrado.**

O roteador legado (`route-prompt.mjs`) injeta, a cada prompt que case com sua regex:

```
REGRA OBRIGATORIA: sua primeira acao deve ser invocar com a ferramenta Skill: <lista>.
Nao analise nem responda antes dessas chamadas.
```

| Dimensão | Roteador legado | EOS V2 |
|---|---|---|
| Critério de acionamento | Palavra-chave no texto do prompt | Vetor de risco |
| Profundidade | **Fixa** — sempre a mesma | **Proporcional ao risco** (P01) |
| Escalada | Inexistente — já entra no máximo | Progressiva (P09) |
| Custo de contexto | Cresce com o nº de regex que casam | Proporcional ao necessário |
| Ordem | Impõe a primeira ação, proíbe analisar antes | Análise decide a rota |

**Falha concreta.** Um pedido trivial — "corrija o texto deste botão" — casa `/\bui\b/` e
`/componente/`, carrega `frontend-ui` e proíbe o modelo de raciocinar antes. Um pedido crítico —
"migre o isolamento multi-tenant" — casa `/multi-tenant/` e carrega **uma** skill, exatamente como o
caso trivial. **A profundidade não distingue os dois.** É a inversão exata de P01.

Pior: várias regras casam simultaneamente. "Ajuste a validação da rota de assinatura no painel"
casa `backend-api`, `billing` e `frontend-ui` — três skills empilhadas para uma tarefa.

**Resolução.** Preservar a **propriedade** — roteamento determinístico, auditável, reproduzível, que
é o mérito real do desenho legado — e substituir o **gatilho**: de "palavra-chave presente" para
"nível de risco calculado". A regex vira **um dos sinais** de entrada do classificador de risco, não
a decisão final. Registrado em `02` como `REUSE_WITH_MODIFICATION` da ideia (item 5) e `DEPRECATE`
do mecanismo (item 6).

---

## 3. Conflitos verificados que **não** se materializam

Registrados porque foram levantados como risco e a evidência os refutou. Descartar um risco com
prova é resultado, não omissão.

| Conflito previsto | Veredito | Evidência |
|---|---|---|
| **Memória antiga duplicando o Knowledge System** | **Não se materializa** | O subsistema nunca executou: Chroma desativado pelo próprio autor (`45bdc1d`), plugin não instalado, e a allowlist por ferramenta do launcher o bloquearia. Não há dado a migrar nem runtime a desligar |
| **Roteador antigo brigando com o EOS Router** | **Não se materializa em execução** | `disableAllHooks: true` no `settings.local.json` **pinado**. O conflito é de **desenho** (§2), não de runtime |
| **Dois orquestradores concorrentes** | **Não se materializa** | O legado já proibia segundo orquestrador (`TOOL_DECISIONS.md`), e a proibição segue vigente |
| **`forbiddenPlugins` contradizendo a matriz vigente** | **Não se materializa** | As proibições eram condicionais; cada condição foi satisfeita ou evitada. Ver `02` §4.1 |
| **Múltiplos writers** | **Não se materializa** | `AGENTS.md` impõe writer único; o legado impunha o mesmo |
| **Codex com permissão ampliada** | **Não se materializa** | Read-only imposto por política pinada no launcher, não só por documento |

**Consequência.** Nenhum conflito de execução existe. A migração V2 **não precisa de fase de
desativação, quarentena ou coexistência** — a classe inteira de risco "sistema antigo brigando com
o novo" está vazia. Essa é a principal simplificação que a arqueologia produziu.

---

## 4. Dívidas ativas do ambiente

Não são lacunas do V2; são problemas reais e presentes que o afetam.

| ID | Dívida | Gravidade | Situação |
|---|---|---|---|
| **T-01** | **Pin exato disputa com o auto-update do Claude Code** | Alta | Duas quebras em 5 dias (2.1.222→223→224). A segunda deixou lock órfão (PID 6008 morto) e atestado defasado, bloqueando o preflight. Re-baseline aplicado com proveniência verificada; **correção estrutural pendente de decisão do usuário** |
| **T-02** | Serena instalado, allowlist configurada, **nunca exercitado** | Média | Testes positivo e negativo exigem reinício do launcher com zero sessões ativas — estruturalmente impossível de dentro de uma sessão. O lado Serena da comparação com `Grep` segue `NÃO MEDIDO` |
| **T-03** | Supabase MCP preparado sem credencial | Baixa | `AGUARDANDO CREDENCIAL DO USUÁRIO`. Não bloqueia |
| **T-04** | 52 documentos de ambiente fora da linha principal | Baixa | Ver `01` §5. Risco é de confusão futura, não operacional |

**T-01 merece nota de desenho.** O pin de hash exato do binário é excelente contra adulteração e
péssimo contra atualização legítima e frequente — ele não distingue as duas. A correção não é
afrouxar: é **verificar proveniência** (integridade npm + identidade bit a bit com o publicado)
em vez de comparar contra uma constante congelada. Essa é a verificação que já foi feita à mão nas
duas re-baselines; automatizá-la eliminaria a classe inteira de quebra sem reduzir a proteção.

---

## 5. O que existe hoje e o V2 não previu — preservar

| Item | Por que preservar |
|---|---|
| Cadeia de integridade do launcher | Mais forte que qualquer coisa que o V2 descreve para o Ambiente. Remover seria perda líquida de segurança |
| `AUTO-ROUTE` / `AUTO-READ` / `CONTROLLED-WRITE` / `MANUAL-GATE` | Separa *rotear* de *executar efeito colateral* — distinção que o V2 precisa e não formaliza |
| `VALIDACOES_NAO_EXECUTADAS` no protocolo do Revisor | Mecanismo de honestidade já em uso; é P08 aplicado |
| Regra "só entram medidas observadas nesta execução" | Já vigente em `TOKEN_EFFICIENCY_BASELINE.md`; é o contrato do Sistema de Evidência escrito antes de existir o subsistema |
| Evidência verbatim de agentes | Padrão já praticado no discovery e no legado |

---

## 6. Veredito da análise de lacunas

| Pergunta | Resposta |
|---|---|
| Há conflito de execução entre legado e V2? | **Não.** Nenhum. Verificado em §3 |
| Há conflito de desenho? | **Sim, um:** P01 × roteador por palavra-chave (§2). Resolvido por classificação |
| Quantos subsistemas partem do zero? | **Um** — Conhecimento |
| Quantos já operam? | **Dois** — Decisão e Ambiente |
| Qual o caminho crítico? | Duas raízes paralelas: **G-01** (vetor de risco) e **G-03** (Proof Ledger) |
| Há bloqueador impeditivo do desenho? | **Não.** Os bloqueadores (T-01, T-02) são ambientais e não afetam a arquitetura |
