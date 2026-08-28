# ADMAI_SCOPE_FREEZE

`ADMAI_SCOPE_CLOSED != ADMAI_RELEASE_READY`. Este documento congela **o que o AdmAi é** e **o que
vai ao ar**. Ele não afirma que está pronto para ir.

## Identidade do escopo

| campo | valor |
| --- | --- |
| `scopeVersion` | `1.1.0` |
| `repositoryId` | `AdmAi` — worktree `agent-environment`, branch `fix/seguranca-criticos` |
| `baseCommit` | `633a37f` (1.0.0) · amendment 1.1.0 sobre `1e27957` |
| `congeladoEm` | 2026-08-22 (1.0.0) · 2026-08-28 (1.1.0) |
| derivação | números lidos de `feature-registry.mjs` e `surface-registry.mjs`, não digitados |
| EOS | `FROZEN` — nenhuma slice nova despachada nesta sessão |

### Changelog 1.1.0 — 2026-08-28 (decisão soberana D2, FRONTEND REFOUNDATION Cycle 1)

```text
REMOVED_FROM_MVP: PAID_SUBSCRIPTIONS / STRIPE_BILLING
AUTHORITY: decisão D2 explícita do usuário (diretiva do ciclo, seção 0/3 — não requer reconfirmação)
```

Assinaturas pagas, Stripe checkout/portal, ciclo de webhook, renovação, planos pagos e o
enforcement por trial/paywall **saem do escopo do MVP**. `STRIPE_KEY_STAGING` deixa de ser
blocker de MVP. A implementação (frontend `Assinatura.jsx`, backend `middlewares/assinatura.js`,
rotas `/billing/*`, webhook) fica **preservada intacta e dormente** atrás de fronteira explícita:

- painel: flag `VITE_FEATURE_SUBSCRIPTIONS_BILLING` (default OFF) gate rota `/assinatura`,
  card "Plano e cobrança" e o redirect 402 do interceptor (commit `1e27957`);
- backend: `ASSINATURA_ENFORCEMENT_ENABLED` (só `'true'` liga) — paywall inerte por padrão;
  matriz completa do gate segue provada nos testes com a flag ligada (commit `4ac3df7`).

Nenhuma outra decisão de escopo foi reaberta. `scopeStatus = ADMAI_SCOPE_CLOSED` (abaixo).

---

## Features incluídas no MVP — 20 (1.1.0: `BILLING` movida para diferidas)

| feature | prioridade | funcional |
| --- | --- | --- |
| `AUTH_LOGIN` | P0 | DONE |
| `AUTH_2FA` | P0 | DONE |
| `MULTI_TENANCY` | P0 | DONE |
| `RBAC` | P0 | DONE |
| `ONBOARDING` | P0 | DONE |
| `SERVICOS_CRUD` | P0 | DONE |
| `TECNICOS` | P0 | DONE |
| `FINANCEIRO` | P0 | DONE |
| `SEGURANCA` | P0 | DONE |
| `LGPD` | P0 | DONE |
| `APROVACOES` | P1 | DONE |
| `ESTOQUE` | P1 | DONE |
| `METRIC_FOUNDATION` | P1 | DONE |
| `INDICADORES` | P1 | DONE |
| `PONTO` | P1 | DONE |
| `WHATSAPP` | P1 | DONE |
| `CONFIGURACOES` | P1 | DONE |
| `AUDITORIA` | P1 | DONE |
| `OBSERVABILIDADE` | P1 | DONE |
| `ADMIN` | P2 | DONE — **mantida no release por decisão explícita do usuário**, por sustentar RBAC |

## Features diferidas — 5 (1.1.0)

Todas sob flag com **default desligado**: ausência de variável significa fora do ar, para que
esquecer de configurar não recoloque uma feature diferida em produção.

| feature | mecanismo |
| --- | --- |
| `METRIC_HUBS` | `VITE_FEATURE_METRIC_HUBS` — rota, item de menu e `hubEm` do KpiCard removidos |
| `GOOGLE_REVIEWS` | `VITE_FEATURE_GOOGLE_REVIEWS` — rota e as duas entradas de navegação |
| `NOTIFICACOES` | `VITE_FEATURE_NOTIFICACOES` — rota e entrada de navegação (**corrigida nesta sessão**) |
| `SUBSCRIPTIONS_BILLING` | **(1.1.0, D2)** `VITE_FEATURE_SUBSCRIPTIONS_BILLING` (rota `/assinatura`, card Plano, redirect 402) + backend `ASSINATURA_ENFORCEMENT_ENABLED` (paywall inerte); implementação preservada dormente |
| `E2E` | não implementado; fora do release |

`POST_MVP + USER_REACHABLE = INVALID_RELEASE_STATE` — verificado em runtime nos três papéis.
Nenhuma implementação foi apagada: as três voltam virando uma variável.

## Bloqueadas por dependência externa — 2

| feature | bloqueio |
| --- | --- |
| `DOCUMENTOS` | `PRODUCTION_BUCKET_MISSING`. Mitigação instruída: `DOCUMENTOS_ENABLED=false` no Railway. Desligar a flag **não** é acceptance e **não** remove o blocker enquanto `releaseRequired=true` |
| `STAGING` | credenciais Railway/Supabase ausentes |

---

## Superfícies de release — 49

38 derivadas do router · 11 declaradas com evidência de ponto de entrada.

| classificação | quantas |
| --- | --- |
| `KEEP` | 16 |
| `REFINE` | 33 (inclui `/tecnicos` — ver amendment 2026-08-27) |
| `REDESIGN` | 0 — `/tecnicos` reclassificada (PREVIOUS_ASSUMPTION_REFUTED_BY_RUNTIME_EVIDENCE) |
| `NOT_INVENTORIED` | **0** |

Cobertura: quatro viewports (360×800 · 390×844 · 1440×900 · 1920×1080) e quatro papéis
(anônimo · dono · gestor · funcionário). `NOT_OBSERVED = 0` em todos os viewports.

**AMENDMENT 2026-08-27 (Cycle 2 closure, decisão do usuário · Fase B):** `/tecnicos`
**REDESIGN → REFINE** — `PREVIOUS_ASSUMPTION_REFUTED_BY_RUNTIME_EVIDENCE`. O achado que
sustentava o REDESIGN ("em 1440px os nomes colapsam para 'An…' / 'Br…'") foi **refutado em
staging real** na ADMAI_FUNCTIONAL_PRODUCT_AUDIT: com 3 técnicos de nomes reais de até 52
caracteres em 1440px, `scrollWidth == clientWidth` (350px) e `white-space: normal` — zero
truncamento; o `CardTecnico` já aplica a "Direção B (D-SL15)" (quebra integral de linha em lg+),
e o perfil `/tecnicos/:id` renderiza conteúdo completo. Evidência:
`docs/eos-v2/AUDIT_EVIDENCE_TOURS_2026-08-27/resultado-tour8-onboarding.json` (passo "TECNICOS:
criar 3 tecnicos com nomes LONGOS"). A capability é `USER_REAL_CAN_USE` no audit ledger.
Nenhum redesenho foi executado — esta é uma reconciliação documental de estado com evidência.

*Registro original (histórico, hoje refutado):* `/tecnicos` permanecia `REDESIGN` porque em
1440px os nomes colapsavam para "An…" / "Br…" com ~55% da largura vazia — corrigido entre o
freeze e a auditoria pela Direção B (D-SL15); `BUG_FIX != VISUAL_REDESIGN` valia à época.

---

## Achados abertos — 8 de 10

| achado | severidade | superfícies | natureza |
| --- | --- | --- | --- |
| `GAP-LEGAL-MODELO-01` | ALTA | 2 | **`USER_DECISION_REQUIRED` · RELEASE BLOCKER** |
| `GAP-UX-CONFIG-PROMESSA-01` | ALTA | 3 | WhatsApp e cobrança anunciados como "em breve" |
| `GAP-UX-DESKTOP-LARGURA-01` | ALTA | 6 | card de largura fixa trunca o identificador |
| `GAP-UX-IDENTIDADE-01` | MÉDIA | 11 | duas paletas na mesma jornada sem sessão |
| `GAP-UX-A11Y-NOME-01` | MÉDIA | 13 | controles sem nome acessível |
| `GAP-UX-ALVO-01` | MÉDIA | 23 | alvos de toque abaixo de 44px no mobile |
| `GAP-UX-CABECALHO-01` | MÉDIA | 7 | superfícies de auth sem `h1` |
| `GAP-UX-RODAPE-01` | BAIXA | 7 | rodapé flutua no meio da página curta |

Mais **17 achados locais**, registrados na `razao` de cada superfície.

### Fechados nesta sessão — 2

| achado | prova |
| --- | --- |
| `GAP-UX-CONSENT-01` | 152 capturas · `CONSENT_VISIBLE` 152/152 · `CONSENT_USABLE` 152/152 · 0 oclusões permanentes. Contraprova: sem as regras, o `/login` volta a acusar 6/6/3/0 |
| `GAP-UX-NAV-DIFERIDA-01` | negativo nos três papéis · positivo com flag ligada · duas sabotagens que reprovam · controle derivado das rotas sob flag · runtime |

### `GAP-LEGAL-MODELO-01` — o que exige decisão sua

`/termos` e `/privacidade` servem ao público, em produção, um aviso de que são **modelo não
validado por advogado**, com sete campos entre colchetes por preencher e **seis ocorrências de
`privacidade@barbers-flow.com`** — domínio de outro produto — como contato de privacidade e do
encarregado. Sob LGPD isso identifica errado o controlador e o DPO.

Não é matéria de experiência visual e não é minha para resolver: razão social, CNPJ, encarregado,
prazos de retenção e limite de responsabilidade são conteúdo jurídico. **Nada disso foi inventado.**

Este gap **não impede `ADMAI_SCOPE_CLOSED`** — o escopo está conhecido e congelado. Ele **impede
`ADMAI_RELEASE_READY`**.

---

## Bloqueadores de release remanescentes

| bloqueador | tipo | dono |
| --- | --- | --- |
| conteúdo jurídico de Termos e Privacidade | `USER_DECISION_REQUIRED` | usuário |
| bucket de produção do `DOCUMENTOS` | `BLOCKED_EXTERNAL` | usuário |
| credenciais de staging (Railway/Supabase) | `BLOCKED_EXTERNAL` | usuário |
| aceitação de runtime do WhatsApp | `EXTERNAL_RUNTIME_ACCEPTANCE_PENDING` | provedor |
| Release Experience: 33 REFINE (REDESIGN zerado no amendment 2026-08-27) | trabalho de produto | próxima sessão |
| runtime não observado: `AUTH_2FA`, `WHATSAPP`, `AUDITORIA` | evidência ausente | próxima sessão |
| E2E | não implementado | próxima sessão |

---

## Gates no congelamento

```
registry de superfícies : 28/28
write-set-gate selftest : 109/109
registry de features    :  29/29
painel                  : 202/202
bloqueios de integração : nenhum
Write Set               : MATCH
```

## Critérios de `ADMAI_SCOPE_CLOSED`

| critério | estado |
| --- | --- |
| `ALL_RUNTIME_SURFACES_INVENTORIED` | sim — 49 |
| `NOT_INVENTORIED = 0` | sim |
| `ALL_SURFACES_CLASSIFIED` | sim — 16/33/0 (amendment 2026-08-27: `/tecnicos` REDESIGN→REFINE por evidência) |
| `VISIBLE_P2_RELEASE_DECISION_RECONCILED` | sim — 3 diferidas por flag, `ADMIN` mantida |
| `MVP_FEATURE_SET_EXPLICIT` | sim — 20 (1.1.0) |
| `DEFERRED_FEATURE_SET_EXPLICIT` | sim — 5 (1.1.0) |
| `ALL_SURFACES_MAPPED` | sim — proveniência declarada por superfície |
| `ALL_BLOCKERS_EXPLICIT` | sim |
| `ALL_OPEN_GAPS_EXPLICIT` | sim — 8 compartilhados + 17 locais |
| `ADMAI_SCOPE_FREEZE_MATERIALIZED` | este documento |

**`ADMAI_SCOPE_CLOSED`.**

Não exige gap de release fechado — isso seria `ADMAI_RELEASE_READY`, e não é o que este documento
declara.

## Não reabrir sem D2

`DO_NOT_REOPEN_ADMAI_SCOPE_WITHOUT_D2`. Feature nova, superfície nova ou promoção de P2 a MVP
mudam o escopo congelado e exigem decisão do usuário registrada.
