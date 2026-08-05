# Security Final Report — Encerramento Oficial da Frente de Segurança

**Branch:** `fix/seguranca-criticos` · **HEAD auditado:** `57f2427b26a2f1aee79fd3b7dbacebe64d11967e` · **Data:** 2026-08-04 · **Missão:** "Missão Final — Encerramento Oficial da Frente de Segurança" (auditoria de encerramento, não nova auditoria de segurança).

Esta missão não corrige nada. Ela valida, com evidência reproduzida nesta execução, se a conclusão "Frente de Segurança ENCERRADA" (declarada ao final da missão EV-063, commit `57f2427`) continua de pé no HEAD atual.

## Gate 1 — Auditoria do Estado

| Item | Evidência |
|---|---|
| Branch | `fix/seguranca-criticos` |
| HEAD | `57f2427` ("docs(seguranca): EV-063 encerrado - Frente de Seguranca ENCERRADA") |
| Worktree | Limpa — `git status --short` só mostra `.codex/` não-rastreado (pré-existente, não relacionado, nunca tocado nesta ou em missões anteriores) |
| Commits desde o último fechamento | **Zero.** `git log` confirma que `57f2427` é o commit mais recente da branch — nada foi alterado desde a declaração de encerramento anterior |
| CI no HEAD | Run `30837466343` — `success` (jobs: `changes`, `frontend`, `codex-policy`, `docker-build`, `backend`, `ci-ok`, todos `success`) |
| Security no HEAD | Run `30837466328` — `success` (jobs: `gitleaks`, `semgrep`, `audit (chaveiro-bot)`, `audit (chaveiro-painel)`, todos `success`) |
| Artefatos oficiais presentes | `EV060_REMEDIATION_REPORT.md`, `SECURITY_CLOSURE_REPORT.md`, `SECURITY_CLOSURE_FINAL_REPORT.md`, `EV063_REMEDIATION_REPORT.md`, `SECURITY_HARDENING_BACKLOG.md`, `EOS_SECURITY_CLOSURE_V2_PLAN.md` — todos em `docs/agent-environment/` |

Confirmado por `git log <commit-de-correção>..HEAD -- <arquivo>` (todos retornam vazio — nenhum commit novo toca esses arquivos):

| Correção | Arquivo(s) | Commit de correção | Alterado depois? |
|---|---|---|---|
| EV-056 | `services/codigosRecuperacao.js` | `7a644d8` | Não |
| EV-057 | `prisma/schema.prisma`, `middlewares/rateLimiters.js` | `27ce4a9` / `3f0f049` | Não |
| EV-060 | `routes/admin.js`, `services/permissoes.js` | `c36c151` | Não |
| EV-063 | `services/auth.js`, `routes/auth.js` | `e062a45` / `0d6cd37` | Não |

**Conclusão do Gate 1:** nenhuma alteração posterior reabriu qualquer vulnerabilidade corrigida — não há alteração posterior, ponto final.

## Gate 2 — Revalidação das Correções

Sem reimplementar nada. Evidência extraída diretamente do log do job `backend` do run `30837466343` (mesmo commit do HEAD atual — não uma re-execução, mas a execução real e mais recente deste código exato).

Resumo agregado do job `backend`: **41 arquivos de teste / 379 testes unitários** (`Testes unitários + cobertura`) e **27 arquivos de teste / 142 testes de integração** (`Testes de integração`) — todos `passed`, zero falhas (busca por `✗`/`FAIL` no log completo: 0 ocorrências reais de falha).

| EV | Teste(s) que travam a correção | Confirmado no log do CI (HEAD atual)? |
|---|---|---|
| EV-056 | `src/services/__tests__/codigosRecuperacao.test.js` (3 testes) | ✓ `✓ src/services/__tests__/codigosRecuperacao.test.js (3 tests) 71ms` |
| EV-057 | `test/integration/assinatura_cadastro.test.js`, `test/integration/cadastro_otp.test.js` + constraint `Usuario.telefone @unique` | ✓ arquivos presentes na suíte de integração (27 arquivos, 142 testes, todos verdes); constraint inalterada no schema |
| EV-060 | `test/integration/rbac_privilege_escalation.test.js` (~22 asserções, 4 rotas) | ✓ confirmado nome-a-nome no log: `POST /usuarios: gestor não pode criar outro gestor`, `POST /usuarios/convidar: ...`, `PATCH /usuarios/:id: gestor não pode gerenciar par nem dono`, `DELETE /usuarios/:id: gestor não pode remover par nem dono (rota sem NENHUM teste antes)` — inclusive "gestor NÃO consegue deletar o dono" e "gestor NÃO consegue deletar outro gestor (par)" |
| EV-063 | `test/integration/login_disambiguacao_leak.test.js` (10 testes) + `src/services/__tests__/auth.test.js` (`autenticarCandidatos`, incl. 2 testes de tempo constante) | ✓ confirmado nome-a-nome: telefone inexistente, senha correta/incorreta, inativo via telefone/username, social, username inexistente, seleção de empresa pós-auth, rate limiter, constraint de telefone — todos com resultado `401 "Credenciais inválidas"` genérico onde esperado |

**Conclusão do Gate 2:** as 4 correções permanecem corrigidas, protegidas por teste, e nenhuma regressão foi introduzida — confirmado por execução real de CI no commit atual, não por memória de sessão.

## Gate 3 — Validação do Security Hardening Backlog (12 itens)

Como não há commits novos desde que o backlog foi escrito, a maioria das respostas é "sem mudança" — mas cada item foi confirmado com leitura direta do código atual (grep/Read), não apenas inferido pela ausência de commits.

| # | Item | Continua Cat. C? | Fora da superfície ativa? | Sink novo? | Ficou explorável? | Severidade mudou? | Evidência p/ promover a A/B? |
|---|---|---|---|---|---|---|---|
| 1 | Corrida de aceite duplo em `POST /convite/:token/aceitar` | Sim | Sim (exige convite válido + concorrência de 3º) | Não — `findFirst({aceitoEm:null})` ainda fora de transação (`routes/auth.js:617-618,652-653`), confirmado nesta execução | Não | Não | Não |
| 2 | `/uploads` estático sem auth | Sim | Sim — WhatsApp confirmado desligado (`server.js:78-82`, gate por `EVOLUTION_HOST` ausente) | Não — `express.static('./uploads')` ainda em `app.js:79`, sem middleware de auth antes | Não | Não | Não |
| 3 | TOCTOU `admin.js` (PATCH/DELETE) | Sim | Sim | Não — arquivo inalterado desde `c36c151` | Não | Não | Não |
| 4 | EV-057 residual (abuso de cadastro) | Sim | Sim — decisão de produto já aceita pelo usuário | Não | Não | Não | Não |
| 5 | `react-router` desatualizado | Sim | Sim | Não | Não — confirmado via `npm audit --omit=dev` no CI atual: só **2 vulnerabilidades moderadas** (open redirect, deserializeErrors SSR — SSR não é usado neste app) | Não | Não |
| 6 | Modelos fora de `MODELOS_ESCOPADOS` | Sim | Sim | Não — set atual (`db/tenant.js:24-34`) tem só 9 modelos (`Tecnico`, `Servico`, `Material`, `Pagamento`, `EmpresaWhatsapp`, `Avaliacao`, `SessaoConversa`, `RegistroPonto`, `DocumentoTecnico`); os 6 citados (`GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`, `Assinatura`, `ConviteUsuario`, `AuditLog`) seguem fora, sem novo call site | Não | Não | Não |
| 7 | `credenciais.js` aceita `papel:'dono'` sem validar | Sim | Sim | Não — arquivo inalterado, comentário na linha 40 confirma "papel é decidido pelo chamador" | Não | Não | Não |
| 8 | CSP `style-src unsafe-inline` | Sim | Sim | Não — confirmado ainda presente em `gerar-headers.mjs:77` e `nginx.conf:15` | Não | Não | Não |
| 9 | Cobertura abaixo do piso `T-CI-01` | Sim | Sim | Não — `ci.yml` roda `test:coverage` com thresholds nominais (statements 27%/branches 22%/functions 28%/lines 27%) já configurados em `vitest.config`, mas são pisos low-bar pré-existentes, não um gate elevado formalmente ativado | Não | Não | Não |
| 10 | 9/11 vulnerabilidades de dependência do painel (build-only) | Sim | Sim | Não — confirmado via mesmo log do CI: com `--omit=dev` só 2 vulnerabilidades moderadas aparecem (item 5); as 9 restantes (`tar`, `sharp`, `minimatch`, etc.) são dev-only, fora do `--omit=dev` que já é o gate real de produção | Não | Não | Não |
| 11 | Rate limit `skipSuccessfulRequests` em respostas não-finais | Sim | Sim — vetor de amplificação (timing) que motivou o achado já foi fechado no EV-063 (Gate 7) | Não — confirmado `skipSuccessfulRequests: true` ainda presente em `authLimiter`/`authIpLimiter` (`rateLimiters.js:131,150`) | Não — impacto prático já reduzido pela correção de tempo constante | Não | Não |
| 12 | Enumeração via `409` em `POST /auth/register` | Sim | Sim — endpoint diferente do EV-063, fora da regra arquitetural (que é só para o fluxo de autenticação) | Não — confirmados 5 handlers de `P2002` em `routes/auth.js` (linhas 385, 458, 587, 690, 868), mensagens ainda distintas por campo | Não | Não | Não |

**Conclusão do Gate 3:** todos os 12 itens permanecem Categoria C, sem evidência reproduzível de promoção a A ou B. Nenhuma implementação foi realizada.

## Gate 4 — Regressão Geral

Runs de referência (mesmo commit do HEAD, `57f2427`):

**CI (`30837466343`, `success`):**
- `backend`: lint (ESLint), typecheck (`tsc --noEmit`), Prettier (`format:check`), 379 testes unitários + cobertura, 142 testes de integração (Supertest + Postgres real), `npm audit --audit-level=high` (0 vulnerabilidades) — todos `success`.
- `frontend`: lint, typecheck, Prettier, 130 testes (Vitest+RTL) + 6 testes de acessibilidade (axe-core), build de produção — `success`.
- `docker-build`: build da imagem de produção do backend — `success`.
- `codex-policy`: 56 testes de política — `success`.
- `ci-ok`: gate agregado — `success`.

**Security (`30837466328`, `success`):**
- `gitleaks`: "no leaks found".
- `semgrep`: "Ran 25 rules on 232 files: 0 findings".
- `audit (chaveiro-bot)`: "found 0 vulnerabilities".
- `audit (chaveiro-painel)`: 2 vulnerabilidades moderadas (react-router, item 5 do backlog), abaixo do piso `--audit-level=high` — `success`.

Não houve re-disparo de CI para este HEAD: não há mudança de código a validar (Gate 1), e o run existente já é a execução real e mais recente deste exato commit — reuso de evidência explicitamente autorizado pela missão ("reutilize evidências anteriores, confirmando que continuam válidas no HEAD atual").

**Conclusão do Gate 4:** nenhuma regressão, nenhuma credencial exposta, nenhum bypass reaberto, nenhuma alteração global, nenhum processo residual.

## Gate 5 — Revisão Adversarial Final

Um agente `red-team-attacker` fresco (sem contexto desta ou de missões anteriores) foi instruído a tentar reabrir exclusivamente EV-056, EV-057, EV-060 e EV-063 — nada além disso, sem procurar vulnerabilidades novas fora desses 4 alvos e sem corrigir nada.

| Alvo | Resultado do agente |
|---|---|
| EV-056 (TOCTOU códigos de recuperação) | NÃO conseguiu reabrir |
| EV-057 (abuso de trial) | **CONSEGUIU reabrir** — 2 vetores |
| EV-060 (RBAC `admin.js`) | NÃO conseguiu reabrir |
| EV-063 (enumeração pré-auth) | NÃO conseguiu reabrir |

**Verificação independente (obrigatória por esta metodologia — não aceito achado de sub-agente sem reproduzir eu mesmo):**

- **EV-056, EV-060, EV-063**: revisei as tentativas do agente linha a linha contra o código atual. Para EV-056, confirmei por leitura direta que `verificarCodigo` usa `updateMany({where:{id,usado:false}})` com `count===1` como condição de vitória — atômico sob Postgres READ COMMITTED, único ponto de consumo (`routes/auth.js:327`), sem padrão residual do bug antigo em nenhum outro arquivo (`grep` confirmando). Para EV-060, confirmei que `limitarPermissoesAoAtor` recalcula permissões a partir de uma leitura fresca do banco a cada request (não é possível auto-conceder), que os 4 pontos de escrita usam `podeAtribuirPapel`/`podeGerenciarUsuario` consistentemente, que o schema Zod do `PATCH` não aceita o campo `admin`, e que o aceite de convite não permite o aceitante escolher o próprio `papel`. Para EV-063, o comentário do próprio código (`services/auth.js:97-101`) já documentava o resíduo acima de N=3 como aceito; o agente só tornou mais precisa a caracterização desse resíduo (permite inferir a contagem aproximada, não só "mais de 3") — não é uma reabertura, é uma nota que já estava dentro do risco aceito.
- **EV-057 — Vetor A (bypass de `trust proxy`), CONFIRMADO por mim de forma independente**: o agente alegou que `app.set('trust proxy', 2)` (`app.js:41`) não bate com a topologia real do caminho `CADDY_API_DOMAIN` (`Caddyfile:10-13`, que roteia direto pro backend sem passar pelo nginx do painel — só 1 hop real, não 2). Não aceitei essa alegação sem reproduzir: montei uma instância REAL do Express da própria aplicação (`app.set('trust proxy', 2)`, idêntico ao `app.js`) atrás de um proxy Node minimalista que replica o comportamento documentado do Caddy `reverse_proxy` (anexa seu próprio IP observado ao `X-Forwarded-For` já existente, sem strip — comportamento padrão do Caddy, o `Caddyfile` não configura `trusted_proxies`). Resultado da minha própria execução: com exatamente 1 hop real, um único header `X-Forwarded-For: <qualquer-valor>` enviado pelo cliente é refletido **integralmente e sem exceção** em `req.ip` (testei com `6.6.6.6` e `1.2.3.4`, ambos aceitos tal qual). Confirmei também que `chaveiro-painel/.env.example:15` (`VITE_API_URL=https://api.chaveirobot.com.br/api`) documenta esse mesmo domínio (`CADDY_API_DOMAIN`) como a URL de API usada pelo app Android/Capacitor e por deploys estáticos (Cloudflare Pages) — não é um caminho teórico, é a configuração real de um cliente que o próprio AGENTS.md lista como parte do projeto ("aplicativo Android via Capacitor"). Confirmei ainda que `cadastroLimiter`, `authIpLimiter` (`app.js:128,132`, aplicados a `/api/auth/login` e `/api/auth/register`) e o limiter geral `/api` (`app.js:110`) são todos chaveados por IP (`ipKeyGenerator`/`req.ip`) — todos contornáveis por esse caminho.
- **EV-057 — Vetor B (variantes de telefone), CONFIRMADO por leitura direta**: `canonizarTelefone` (`services/parser.js:41-47`) não resolve a ambiguidade do 9º dígito; `variantesTelefone` (que conhece as 2 formas) só é usada no login/lookup, não no `INSERT` de `POST /auth/register` (`routes/auth.js:400,421`, usa `canonizarTelefone` puro). A constraint `@unique` bloqueia só a string exata, então o mesmo telefone real cadastra 2 contas/trials (uma por variante) — bounded (2x), não ilimitado.

**Triagem obrigatória dos achados (Gate 5):**

| Vetor | Categoria A? | Categoria B? | Regressão desta sessão? | Dentro do escopo desta frente? | Só backlog? |
|---|---|---|---|---|---|
| EV-057 Vetor A (`trust proxy`) | **Sim** — bypass de controle de segurança (rate limit de autenticação/registro), sem exigir privilégio, em caminho de produção real e ativo | — | Não — `app.js`/`Caddyfile`/`nginx.conf` não foram tocados por nenhum commit desta sessão (pré-existente) | Sim — é bypass da própria mitigação técnica do EV-057, que o mandato deste Gate autorizou explicitamente investigar | **Não** — bloqueia o encerramento, não é hardening opcional |
| EV-057 Vetor B (variantes de telefone) | Não — bounded (2x), sem vazamento de dado, sem escalonamento, sem cross-tenant; mesma classe de risco de negócio já aceita pelo usuário (item 4 do backlog) | Não | Não — pré-existente | Sim, mas dentro do risco já formalmente aceito | Sim — refina o item 4 do backlog, não bloqueia |

**Conclusão do Gate 5: a revisão adversarial final reabriu EV-057 por um vetor não considerado nas mitigações anteriores (Vetor A, Categoria A) — confirmado por reprodução independente do orquestrador, não apenas aceito da alegação do sub-agente.** Isso muda o parecer final desta missão — ver Gate 7 e Parecer Final abaixo. O Vetor B é registrado como refinamento do backlog (item 39 da Discovery Queue, item 4 do `SECURITY_HARDENING_BACKLOG.md`), sem bloquear.

## Gate 6 — Auditoria da Superfície Ativa

Escopo desta e das missões anteriores cobriu só componentes atualmente ligados:
- **WhatsApp (inbound)**: confirmado desligado — `server.js:78-82` só ativa a camada se `env.EVOLUTION_HOST` estiver definido; sem essa var, só loga aviso. Não faz parte da superfície ativa (sustenta a classificação Categoria C do item 2 do backlog).
- **Feature flags do backend** (`config/env.js`): `GOOGLE_REVIEWS_ENABLED`, `RLS_ENABLED`, `SERVICO_ANDAMENTO_ENABLED`, `DOCUMENTOS_ENABLED` — nenhuma delas gate um dos 4 alvos desta auditoria (login, RBAC de admin, recuperação de 2FA, cadastro); são flags de features de produto não relacionadas.
- Nenhum componente novo, experimental ou previsto para versão futura foi introduzido — zero commits desde o último fechamento (Gate 1).

## Gate 7 — Teste de Reabertura

> Se eu nunca tivesse visto este projeto antes, classificaria algum item atual como Categoria A ou Categoria B?

**Sim.** O Gate 5 desta própria missão produziu essa evidência: **EV-065** — bypass de `cadastroLimiter`/`authIpLimiter`/limiter geral via configuração assimétrica de `trust proxy` no caminho `CADDY_API_DOMAIN` (usado pelo app Android/Capacitor e por deploys estáticos). É um bypass de controle de segurança (não uma redução de superfície teórica), sem exigir privilégio nenhum, num caminho de produção real hoje ativo — não se enquadra em nenhuma das justificativas que mantêm os 12 itens do backlog em Categoria C (nenhum deles é "bypass" de um controle ativo; este é).

Isso muda a resposta deste Gate em relação ao estado no início desta missão: partindo só do que já estava registrado antes do Gate 5 (EV-056/057/060/063 corrigidos, 12 itens Categoria C), a resposta seria "Não". Com a evidência produzida NESTA execução (o próprio propósito do Gate 5), a resposta é "Sim" — e é exatamente para isso que este Gate existe.

- As 3 vulnerabilidades Categoria A efetivamente fechadas (EV-056, EV-060, EV-063) continuam corrigidas — nenhuma delas foi reaberta pelo Gate 5.
- EV-057 tem correção original (rate limit + constraint de telefone) que continua no lugar, mas o Gate 5 encontrou um mecanismo NOVO (assimetria de `trust proxy`) que contorna a própria mitigação — não uma falha na lógica de negócio que o usuário já aceitou, mas um defeito técnico na camada de identificação de IP que ninguém tinha avaliado antes.
- Os 12 itens do Security Hardening Backlog (Gate 3) permanecem corretamente Categoria C — nenhum deles é reclassificado por esta descoberta.
- Não há pendência Categoria B: billing/google seguem validados e fora do escopo.

## Gate 8 — Consolidação

### Vulnerabilidades corrigidas

| ID | Descrição | Commit(s) de correção | Evidência |
|---|---|---|---|
| EV-056 | Race condition (TOCTOU) em `verificarCodigo` (recuperação de conta) permitia reuso concorrente do mesmo código | `7a644d8` | `codigosRecuperacao.test.js`, CI verde |
| EV-060 | Escalonamento lateral de privilégio em `admin.js` (4 rotas: criar/editar/deletar/convidar usuário) | `c36c151` | `rbac_privilege_escalation.test.js` (~22 testes), CI verde |
| EV-063 | Vazamento de informação pré-autenticação em `POST /auth/login` (corpo/status + canal de timing) | `e062a45`, `0d6cd37` | `login_disambiguacao_leak.test.js` + `auth.test.js`, CI verde, 2 rodadas de revisão adversarial independentes |

**EV-057 NÃO entra nesta lista** — a mitigação original (`cadastroLimiter` + `Usuario.telefone @unique`, commits `3f0f049`/`27ce4a9`) segue implementada e ainda reduz o abuso quando o IP resolvido é real, mas o Gate 5 desta missão confirmou que ela é integralmente contornável no caminho `CADDY_API_DOMAIN` (ver EV-065 abaixo). Continua **aberta**, não corrigida.

### Riscos aceitos

- **TOCTOU em `admin.js` (PATCH/DELETE `/usuarios/:id`)**: exige ação legítima concorrente de terceiro na janela exata; não é unilateralmente explorável pelo atacante.
- **Canal de timing acima de N=3 candidatos** (EV-063): revela só "mais de 3", não a contagem exata nem identidade; cenário de uso raro (telefone compartilhado por 4+ contas).
- **`react-router` desatualizado**: 2 CVEs moderadas sem sink alcançável (sem SSR no app).
- **6 modelos multi-tenant fora de `MODELOS_ESCOPADOS`**: nenhum call site atual os usa sem `empresaId` explícito.

### Security Hardening Backlog

12 itens, todos Categoria C, revalidados no Gate 3 acima — ver `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` para o detalhamento completo (componente, motivo, impacto, prioridade, correção sugerida, condição de retorno ao escopo).

### Categoria A — Itens restantes

| ID | Descrição | Evidência |
|---|---|---|
| EV-065 | Bypass de `cadastroLimiter`/`authIpLimiter`/limiter geral `/api` via `trust proxy=2` incompatível com a topologia real de 1 hop do caminho `CADDY_API_DOMAIN` (usado pelo app Android/Capacitor e por deploys estáticos) | Reproduzido pelo orquestrador com instância real do Express da aplicação + proxy simulando fielmente o comportamento do Caddy; `req.ip` totalmente controlável por um único header `X-Forwarded-For` |

### Categoria B — Itens restantes

**Nenhum.**

### Categoria C — Itens restantes

12 (Security Hardening Backlog), mais o refinamento do item 4 (variantes de telefone, Vetor B do Gate 5) — nenhum promovido a A/B.

---

## Parecer Final

## Opção B — Frente de Segurança NÃO ENCERRADA

A auditoria desta missão (Gates 1-4, 6-7) confirmou que EV-056, EV-060 e EV-063 seguem corrigidos, que os 12 itens do backlog seguem Categoria C, e que o CI/Security seguem verdes no HEAD atual. **Mas o Gate 5 — cujo próprio propósito é tentar reabrir as correções antes de declarar encerramento — encontrou e eu confirmei de forma independente um bypass real da mitigação técnica do EV-057.** Por regra explícita desta missão, essa é exatamente a evidência que impede o encerramento: "Somente evidências reproduzíveis classificadas como Categoria A ou Categoria B poderão impedir o encerramento" — e "a existência de itens no Security Hardening Backlog NÃO constitui motivo suficiente" não se aplica aqui, porque este não é um item de backlog: é um bypass de controle ativo.

### Evidência bloqueante

**EV-065** — `chaveiro-bot/src/app.js:41` (`app.set('trust proxy', 2)`) assume sempre 2 hops reais (Caddy → nginx do painel → backend), mas `chaveiro-bot/Caddyfile:10-13` roteia o domínio `CADDY_API_DOMAIN` **diretamente** para `backend:3000` — apenas 1 hop real. `chaveiro-painel/.env.example:15` confirma que esse é o domínio configurado como base de API (`VITE_API_URL`) para o app Android/Capacitor e para deploys estáticos (Cloudflare Pages). Reproduzido nesta execução com uma instância real do Express da própria aplicação, atrás de um proxy Node que replica fielmente o comportamento padrão do Caddy `reverse_proxy` (anexa seu IP observado ao `X-Forwarded-For` já existente, sem strip, já que o `Caddyfile` não configura `trusted_proxies`): um único header `X-Forwarded-For: <valor-arbitrário>` enviado pelo cliente é refletido integralmente em `req.ip`, sem exceção.

### Impacto

`cadastroLimiter` (`/api/auth/register`), `authIpLimiter` (`/api/auth/login` e `/api/auth/register`) e o limiter geral `/api` são todos chaveados por IP (`ipKeyGenerator`/`req.ip`, `app.js:110,128,132`) — todos contornáveis por esse caminho, sem exigir credencial nenhuma. Isso reabre, por um mecanismo técnico diferente do já mitigado, o núcleo do EV-057 (criação ilimitada de contas/trials) e adicionalmente remove a proteção de força bruta de login por IP. Não é hipotético: o caminho vulnerável (`CADDY_API_DOMAIN`) é a configuração documentada e em uso pelo cliente Android/Capacitor do próprio projeto.

### Causa raiz

`trust proxy` é configurado uma única vez, globalmente, para o app Express inteiro (`app.js:41`), assumindo implicitamente que TODO tráfego chega pelo caminho de 2 hops do painel (Caddy → nginx → backend). O caminho alternativo, de 1 hop (Caddy → backend direto, usado pela API pública/mobile), nunca foi considerado nessa configuração — o próprio comentário do código (linhas 37-40) só descreve "o caminho do painel".

### Tarefa objetiva necessária para o encerramento

Corrigir a resolução de `req.ip` para que reflita corretamente o número de hops reais em CADA caminho de entrada (ex.: middleware que aplica `trust proxy` diferenciado por domínio/rota, ou normalizar a topologia real para que ambos os caminhos tenham o mesmo número de hops confiáveis, ou passar a autenticar/validar a origem do `X-Forwarded-For` na borda em vez de confiar por contagem). Requer decisão técnica material (mudança de configuração de rede/proxy que afeta todo rate limiting por IP da aplicação) — não implementada nesta missão, que é de auditoria, não de correção. Recomendo uma missão dedicada "EV-065 Remediação", com o mesmo rigor (reprodução → correção → teste → revisão adversarial → CI real) das 3 anteriores.

Não abro nova frente além desta pendência. Não inicio a próxima fase. O Vetor B (variantes de telefone) e os 12 itens do backlog permanecem exclusivamente como registrado — nenhum deles bloqueia, e nenhum precisa de ação nesta missão.

`docs/agent-environment/SECURITY_BASELINE_v1.md` foi atualizado para refletir honestamente este estado (frente ATIVA, não encerrada) em vez de declarar um baseline de encerramento que a evidência não sustenta.
