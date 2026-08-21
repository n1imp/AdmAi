# 00 — Matriz de Rastreabilidade

Cada linha liga uma **necessidade** verificada até o **teste** que a comprova. Uma rodada não
pode ser aprovada com linha incompleta: necessidade sem critério de aceite objetivo, ou critério
de aceite sem teste planejado, mantém o gate pendente.

**Legenda de marcadores:** `[DECISÃO DO USUÁRIO]` · `[EVIDÊNCIA DO REPOSITÓRIO]` ·
`[PESQUISA EXTERNA]` · `[INFERÊNCIA]` · `[HIPÓTESE]` · `[PENDENTE]` · `[ADIADO]` ·
`[FORA DE ESCOPO]` · `[DECISÃO SUBSTITUÍDA]`

---

## Formato

| ID | Necessidade (quem + o que + contexto) | Problema/causa | Decisão (`DEC-XXX`) | Especificação (rodada §) | Critério de aceite | Teste planejado (nível) | Ambiente de validação | Status |
|---|---|---|---|---|---|---|---|---|

**Níveis de teste disponíveis** `[EVIDÊNCIA DO REPOSITÓRIO]`:

| Nível | Onde | Observação |
|---|---|---|
| Unitário backend | `chaveiro-bot/src/**/__tests__`, Vitest | Pisos de cobertura: 27/22/28/27 |
| Integração backend | `chaveiro-bot/test/integration/`, Vitest + Supertest | Exige PostgreSQL + Redis reais; `fileParallelism: false`; factories em `helpers.js`; **não existe `prisma/seed`** |
| Unitário/componente painel | `chaveiro-painel/src/**/*.test.jsx`, Vitest + Testing Library | Pisos: 30/31/29/29 |
| Acessibilidade | `chaveiro-painel/src/**/*.axe.jsx`, axe-core | Suíte separada (`npm run test:a11y`), **bloqueante** no CI. `color-contrast` e `region` desligadas por limitação do jsdom |
| E2E | `chaveiro-painel/e2e/run.mjs` (Chrome headless via CDP) | `/api/*` **mockado**; papéis simulados por JWT falso; **não-bloqueante** no CI (`continue-on-error`). Cobre hoje M1 e M4 |
| Device real Android | — | **Não existe automação.** `docs/BUGLIST.md` L2 nunca foi reproduzido |
| Staging | — | **Não existe ambiente de aplicação.** Ver `00_EOS_DISCOVERY_PROTOCOL.md` §10 |
| Produção | smoke test não destrutivo | Precedente: `PROJECT_BASELINE_V1.md` §12 Gate 7 (conta identificada, autorizada explicitamente) |

---

## Linhas

### Rodada 1

| ID | Necessidade | Problema/causa | Decisão | Especificação | Critério de aceite | Teste planejado | Ambiente | Status |
|---|---|---|---|---|---|---|---|---|
| T-001 | O dono do produto precisa que nenhuma mudança funcional chegue a produção sem ter sido exercitada num ambiente equivalente ao real | Não existe staging de aplicação; hoje `master` vai direto a produção pelo `deploy.yml`, e o E2E do painel roda com `/api` mockado e é não-bloqueante no CI | **DEC-002** | Rodada 1 §27 | Toda especificação futura declara, na seção 26, quais validações rodam em local e quais **exigem** staging; nenhuma rodada recebe parecer de prontidão para produção com validação obrigatória de staging não executada; validação executada em local **nunca** é registrada como equivalente de staging | Verificação documental por rodada (checklist da seção 27) + `EOS-Adversarial-Reviewer` com mandato explícito de tentar provar que o gate foi contornado | Meta-processo — a própria criação do staging é dependência estrutural registrada em `00_DEPENDENCY_MAP.md` §6 | **Ativa** — vinculante a partir da Rodada 1 |

> As demais linhas desta rodada nascem das respostas do Lote 1 em diante. Decisão sem critério de
> aceite objetivo e sem teste planejado não é aprovada.

### O que NÃO entra nesta matriz

Os registros **`COND-XXX`** de `00_DECISION_LOG.md` são **correções de condução da descoberta** —
escopo de sessão, método de perguntar, rigor epistemológico, autoridade. Eles não descrevem
necessidade de usuário nem comportamento de produto e, por isso, **não geram linha
necessidade → decisão → aceite → teste**. Sua verificação é documental, no próprio decision log.

Itens **`[ADIADO PARA RODADA FUTURA]`** (C4 WhatsApp, C13 planos/cobrança, e os relatórios de C8)
também não geram linha aqui enquanto estiverem adiados. Quando a rodada correspondente abrir, a
evidência já preservada no catálogo entra na matriz junto com as decisões que ela produzir.

---

## Invariantes de verificação

Antes de aprovar qualquer rodada, conferir:

1. Toda necessidade tem `[EVIDÊNCIA DO REPOSITÓRIO]` ou `[DECISÃO DO USUÁRIO]` de origem — não
   basta `[HIPÓTESE]`.
2. Todo critério de aceite é objetivamente verificável (não "deve ser rápido", mas um limiar).
3. Todo critério de aceite tem pelo menos um teste planejado, com nível declarado.
4. Nível de teste indisponível (device real, staging) é declarado como **limitação**, nunca como
   teste aprovado.
5. Toda linha declara o impacto em RBAC, banco, navegação e notificações — ou declara
   explicitamente que não há.
