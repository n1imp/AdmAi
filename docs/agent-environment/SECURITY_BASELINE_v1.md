# Security Baseline v1 — AdmAi / chaveiro-bot

**Status da Frente de Segurança: ATIVA — NÃO ENCERRADA.** Este documento consolida toda a Frente de Segurança executada nesta sessão (missões EV-060, Security Closure Final, EV-063, Missão Final de Encerramento, EV-065 Validation, Missão Final de Consolidação, EV-067 Remediação, e esta — "EV-069"). **EV-067 e EV-069 estão ambos resolvidos** (EV-067 corrigido, EV-069 refutado com EDE completo — ver Gate 6ter abaixo) — mas a investigação do EV-069 revelou, como efeito colateral do Gate 3 (análise de exploitabilidade), um achado novo e ainda não classificado: **EV-070**, `ipKeyGenerator(req, res)` chamado com assinatura errada em todos os 6 call sites deste projeto, fazendo `authIpLimiter`/`cadastroLimiter` (mitigação central do EV-057) operarem com um balde global em vez de por-IP. É esse o único motivo pelo qual este documento não declara encerramento. Ver parecer formal em `SECURITY_CLOSURE_FINAL_REPORT.md`.

## Referência

- **Commit de referência (código):** `fda01cc188b8f943a836353c8d3920193944802b` (correção final do EV-067)
- **Branch:** `fix/seguranca-criticos`
- **Data desta atualização:** 2026-08-04
- **Arquitetura de produção real (confirmada, não presumida):** Railway (backend, `admai-production.up.railway.app`) + Cloudflare Pages (painel, `admai-painel.pages.dev`) + Supabase (Postgres) — sem domínio customizado propagado, sem Caddy/nginx na frente da API. Confirmado por `README.md:402-405`, `docs/CI_CD.md` e teste HTTP direto contra a instância real (`EV065_VALIDATION_REPORT.md`).
- **CI/Security da remediação do EV-067:** todos os 5 commits da correção (`9dad8d5`→`fda01cc`) com `backend` verde (41/41 arquivos de teste unitários, 28/28 de integração, zero regressão); único step vermelho em todos eles é "Auditoria de dependências", por causa do EV-069 (sem relação com o código desta missão).

## Gate 1 — Reauditoria Final do Estado

- Nenhum commit de código entre `57f2427` (último CI validado) e `f259496` (HEAD atual) — confirmado via `git log`. As missões nesse intervalo (Missão Final de Encerramento, EV-065 Validation) só produziram/atualizaram documentação.
- Nenhum Categoria B pendente: billing/google validados por teste de integração real (`billing_google_auth.test.js`, 11 testes, CI real 132/132) desde a missão "Security Closure Final" — nada mudou desde então.
- Categoria A: o único item aberto ao final da "Missão Final de Encerramento" (EV-065) foi **refutado por teste direto contra produção real** na missão "EV-065 Validation" (ver `EV065_VALIDATION_REPORT.md`) — 7 requisições HTTP reais, decremento monotônico do rate-limit bucket (120→113) independente de 6 variações de `X-Forwarded-For`/`X-Real-IP` forjados.
- Nenhuma regressão: nenhum arquivo tocado pelas correções de EV-056/060/063 foi alterado por nenhum commit desde seus respectivos commits de correção (`7a644d8`, `c36c151`, `e062a45`/`0d6cd37`).

## Gate 2 — Painel Consolidado

| ID | Descrição | Status final | Evidência | Relatório |
|---|---|---|---|---|
| EV-056 | Race condition (TOCTOU) em `verificarCodigo` (recuperação de conta) | **Corrigido** | `updateMany` condicional (`count===1`), atômico sob Postgres READ COMMITTED; único ponto de consumo; CI real | commit `7a644d8`; reconfirmado em `SECURITY_FINAL_REPORT.md` Gate 2 |
| EV-057 | Abuso de trial via criação ilimitada de contas | **Documentado como risco residual aceito** (decisão de produto do usuário) | `cadastroLimiter` + `Usuario.telefone @unique`; bypass técnico via `trust proxy` investigado e **refutado** (EV-065) | `SECURITY_HARDENING_BACKLOG.md` item 4; `EV065_VALIDATION_REPORT.md` |
| EV-060 | Escalonamento lateral de privilégio em `admin.js` (4 rotas) | **Corrigido** | `podeAtribuirPapel`/`podeGerenciarUsuario` reusadas; ~22 testes de integração; CI real; revisão adversarial dedicada (2 rodadas) sem reabertura | `EV060_REMEDIATION_REPORT.md` |
| EV-063 | Vazamento de informação pré-autenticação em `POST /auth/login` (corpo/status + timing) | **Corrigido** | `autenticarCandidatos`, tempo constante até 3 candidatos; 19 testes novos; CI real; 2 rodadas de revisão adversarial independentes (Welch's t-test para o canal de timing) | `EV063_REMEDIATION_REPORT.md` |
| EV-065 | Bypass de rate-limit por IP via `trust proxy` desalinhado | **Refutado na arquitetura real** | Teste direto contra `https://admai-production.up.railway.app`: 7 requisições, 6 variações de header forjado, decremento monotônico do bucket em todas — borda do Railway sanitiza `X-Forwarded-For`/`X-Real-IP` | `EV065_VALIDATION_REPORT.md` |
| EV-067 | Ausência de rate limiter dedicado em `POST /me/2fa/ativar`/`POST /me/2fa/desativar` | **Corrigido** | `totpAtivarLimiter`/`totpDesativarLimiter` (rótulo fixo por rota); 4 rodadas de revisão adversarial (3 vetores achados e fechados, 4ª sem achado); 41/41+28/28 testes, zero regressão | `EOS_SECURITY_CLOSURE_V2_PLAN.md` (EV-067/EV-068) |
| EV-069 | CVE de severidade alta em `ip-address` (dependência transitiva de `express-rate-limit`) | **Refutado — Categoria C** | EDE completo: 2 das 3 CVEs afetam funções nunca chamadas por `ipKeyGenerator`; a 3ª (`Address4.correctForm()`) é bloqueada por 2 camadas reproduzidas diretamente (`net.isIPv6` rejeita, `Address6.parse4in6` lança `AddressError`) antes do parsing malicioso | `EOS_SECURITY_CLOSURE_V2_PLAN.md` (EV-069); `SECURITY_HARDENING_BACKLOG.md` item 14 |
| EV-070 | `ipKeyGenerator(req, res)` chamado com assinatura errada nos 6 call sites do projeto | **Aberto — não classificado, bloqueia o encerramento** | Reproduzido com Express real: retorna o objeto `req`, não o IP; `authIpLimiter`/`cadastroLimiter` (mitigação do EV-057) sempre afetados — balde global, não por-IP | `EOS_SECURITY_CLOSURE_V2_PLAN.md` (EV-070); `SECURITY_CLOSURE_FINAL_REPORT.md` (parecer) |

## Gate 3 — Revisão do Security Hardening Backlog (14 itens, todos Categoria C)

Todos os 14 itens (12 já existentes + item 13 `trust proxy` + item 14 `ip-address`/EV-069) foram reconfirmados como Categoria C — nenhuma implementação de correção realizada, nenhuma promoção a A/B sem evidência objetiva:

| # | Item | Categoria | Explorável hoje? | Depende de mudança arquitetural? | Depende de decisão de produto? |
|---|---|---|---|---|---|
| 1 | Corrida de aceite duplo em `POST /convite/:token/aceitar` | C | Não (exige convite válido + concorrência de 3º) | Não | Não |
| 2 | `/uploads` estático sem auth | C | Não (WhatsApp inbound desligado) | Sim — retorna ao escopo se WhatsApp for reativado | Não |
| 3 | TOCTOU `admin.js` (PATCH/DELETE) | C | Não (exige ação concorrente de 3º) | Não | Não |
| 4 | EV-057 residual (abuso de cadastro) | C | Parcialmente — mitigação reduz mas não elimina; bypass via trust proxy refutado (EV-065); bypass via variantes de telefone bounded (2x) | Não | **Sim** — decisão de produto já tomada (Opção A do usuário) |
| 5 | `react-router` desatualizado | C | Não (sem sink alcançável, confirmado 2x) | Não | Não (mas exige esforço de engenharia para upgrade major) |
| 6 | Modelos fora de `MODELOS_ESCOPADOS` | C | Não (todo call site atual usa `empresaId` explícito) | Não | Não |
| 7 | `credenciais.js` aceita `papel:'dono'` sem validar | C | Não (únicos 2 chamadores nunca passam `'dono'`) | Não | Não |
| 8 | CSP `style-src unsafe-inline` | C | Não (sem sumidouro de HTML não sanitizado) | Não | Não |
| 9 | Cobertura abaixo do piso `T-CI-01` | C | N/A (lacuna de verificação, não vulnerabilidade) | Não | **Sim** — retorna ao escopo se `T-CI-01` virar gate formal |
| 10 | 9/11 deps do painel (build-only) | C | Não (dev/build-only, confirmado) | Não | Não |
| 11 | Rate limit `skipSuccessfulRequests` em respostas não-finais | C | Não (vetor de amplificação — canal de timing — já fechado no EV-063) | Não | Não |
| 12 | Enumeração via `409` em `/auth/register` | C | Sim, mas trade-off de UX comum, sem vazamento de senha/papel/dado de outra empresa | Não | **Sim** — é decisão de UX de cadastro |
| 13 | `trust proxy=2` desalinhado com topologia real (Railway) | C | Não (borda do Railway sanitiza, testado ao vivo) | **Sim** — retorna ao escopo automaticamente antes de migração para VPS/Caddy | Não |

Nenhum item promovido a Categoria A/B — todos permanecem no backlog com condição explícita de retorno ao escopo.

## Gate 4 — `trust proxy`: Classificação Final

`app.set('trust proxy', 2)` (`app.js:41`) **não constitui vulnerabilidade na arquitetura atualmente implantada** (Railway + Cloudflare Pages + Supabase) — confirmado por teste direto contra produção real (`EV065_VALIDATION_REPORT.md`), não apenas por leitura de documentação de terceiros. Classificado como **melhoria preventiva (Hardening)**, registrado como item 13 do `SECURITY_HARDENING_BACKLOG.md`, com condição de retorno automático ao escopo de segurança: **antes de qualquer deploy que migre a arquitetura para VPS + Caddy (ou topologia equivalente com número de hops diferente do atual)**. Nenhuma alteração de código foi feita.

## Gate 5 — Checklist Final por Classe de Vulnerabilidade

Respondido individualmente, com evidência — não genérico:

| Classe | Existe hoje? | Evidência |
|---|---|---|
| Bypass de autenticação | **Não** | EV-063 corrigido e revalidado (2 rodadas de revisão adversarial); JWT sem confusão de algoritmo (HS256 fixo, `verificarJWT` com `algorithms:['HS256']` explícito); refresh token em cookie `httpOnly`+`sameSite:'strict'` (`routes/auth.js:70-71`) |
| Bypass de autorização | **Não** | EV-060 corrigido; revisão adversarial dedicada (2 rodadas) sem reabertura; `requireAuth`/`adminOnly`/`requirePermissao` testados via HTTP real em `billing_google_auth.test.js` |
| Escalonamento de privilégio | **Não** | EV-060 corrigido; `podeAtribuirPapel`/`podeGerenciarUsuario` com bypass dono/admin, ~22 testes de integração |
| IDOR cross-tenant | **Não** | Testado em `test/integration/idor.test.js` (4 testes) e `test/integration/rls.test.js`; todo acesso a dado de negócio via `req.db` escopado por `empresaId` (`db/tenant.js`); revisão adversarial da missão "Security Closure Final": "sem vazamento vivo — todo uso de `prisma` global fora de `req.db` tem `empresaId` explícito" |
| SQL Injection | **Não** | Prisma ORM parametrizado em toda a base; único `$queryRawUnsafe` é o `SET_EMPRESA` da RLS, parametrizado (`SECURITY_CLOSURE_FINAL_REPORT.md:42`) |
| RCE | **Não** | Nenhum achado em nenhuma das revisões adversariais desta sessão (`SECURITY_CLOSURE_FINAL_REPORT.md:42`) |
| SSRF explorável | **Não** | Nenhum achado confirmado (`SECURITY_CLOSURE_FINAL_REPORT.md:42`) |
| XSS explorável | **Não** | CSP com `script-src 'self'` sem `'unsafe-inline'` (bootstrap do Crisp externalizado); revisão adversarial: "sem XSS/CSRF explorável" |
| CSRF explorável | **Não** | Cookie de refresh `httpOnly`+`sameSite:'strict'` (não enviado cross-site); access token via `Authorization` header, não cookie — arquitetura imune a CSRF clássico por design |
| Replay de webhook | **Não** | Webhook Stripe: HMAC (`stripe.webhooks.constructEvent`) + idempotência (`marcarSeNovo`, `SET NX` no Redis) — "sem bypass encontrado por leitura direta" (`SECURITY_CLOSURE_REPORT.md:57`) |
| Enumeração crítica | **Não** | EV-063 fechou a enumeração pré-autenticação em `/auth/login` (corpo/status/timing); único resíduo conhecido é UX de cadastro (`409` em `/auth/register`, item 12 do backlog, Categoria C, decisão de produto) |
| Vazamento de credenciais | **Não** | Gitleaks "no leaks found" em todos os runs de CI desta sessão; regra de código "nunca logue senhas/tokens/segredos TOTP/apikeys" (`README.md`); Sentry sem captura de payload sensível |
| Vulnerabilidade Categoria A | **Não** | Última pendência conhecida (EV-065) refutada por teste direto contra produção real nesta sessão |
| Vulnerabilidade Categoria B | **SIM — EV-070 (não classificado)** | *(Atualizado após a missão "EV-069": o CVE em si foi refutado (Categoria C, ver Gate 6ter abaixo), mas a investigação do Gate 3 revelou **EV-070** — `ipKeyGenerator(req, res)` chamado com assinatura errada em todos os 6 call sites do projeto, afetando `authIpLimiter`/`cadastroLimiter` (mitigação central do EV-057). Ainda não classificado em A/B/C. Ver `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-070.)* |

## Riscos aceitos

| Risco | Motivo da aceitação | Condição de reavaliação |
|---|---|---|
| TOCTOU em `admin.js` PATCH/DELETE `/usuarios/:id` | Exige ação concorrente legítima de terceiro; não unilateralmente explorável | Evidência de amplificação/provocação unilateral da corrida |
| Canal de timing acima de N=3 candidatos em `/auth/login` | Cenário de uso raro (telefone com 4+ contas) | Evidência de exploração prática |
| `react-router` desatualizado (2 CVEs moderadas) | Sem sink alcançável (sem SSR) | Introdução de sink (`navigate`/`<Link to>` com dado de usuário não sanitizado) |
| 6 modelos multi-tenant fora de `MODELOS_ESCOPADOS` | Nenhum call site atual sem `empresaId` explícito | Novo endpoint tocando esses modelos sem filtro explícito |
| Variantes de telefone (9º dígito) permitem 2 contas/trials por número real | Bounded (2x), mesma classe de risco de negócio do EV-057 já aceita | Evidência de exploração além do bounded 2x |
| `trust proxy=2` desalinhado com a topologia real | Inofensivo hoje — borda do Railway sanitiza, testado ao vivo | Migração para VPS/Caddy ou topologia equivalente (retorno automático) |

## Security Hardening Backlog

14 itens Categoria C — ver `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` para o detalhamento completo. Nenhum bloqueia o encerramento.

## Gate 6bis — Remediação do EV-067 (missão "EV-067 Remediação")

Reprodução real via CI (`conta_2fa_bruteforce.test.js`, 3/7 testes falhando como esperado antes da correção). Corrigido com `totpAtivarLimiter`/`totpDesativarLimiter` (`rateLimiters.js`). **4 rodadas de revisão adversarial**, cada achado reproduzido de forma independente pelo orquestrador (Express real, requisições reais) antes de corrigir:

1. Chave compartilhada entre ativar/desativar (bug de design, achado pelo próprio CI, não por red-team) — corrigido separando por rota.
2. Caixa/barra final não normalizadas em `req.originalUrl` — 30/30 tentativas aceitas em 6 variantes de grafia, 0 bloqueios — corrigido com `normalizarCaminho`.
3. Barra dupla interna (teto 2x) + fragmento de URL cru (teto ilimitado, via cliente HTTP de baixo nível) — corrigido estendendo `normalizarCaminho`.
4. Request-target em forma absoluta do HTTP/1.1 (`POST http://<host arbitrário>/...`, RFC 7230 — `req.originalUrl` preserva o host arbitrário, teto ilimitado de novo) — corrigido abandonando `req.originalUrl` como fonte da chave: rótulo fixo por rota (`'ativar'`/`'desativar'`), decidido em tempo de definição, elimina a CLASSE inteira de bug.
5. (Rodada final, confirmatória) Tentativa de forjar `req.user.id`, rota alternativa sem limiter, colisão de rótulo, colisão/`id` inválido — **nenhum achado**. Convergência confirmada.

Detalhamento técnico completo: `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-068.

## Gate 6ter — Validação do EV-069 (missão "EV-069")

EDE completo (Gates 1-7 do CVE). Cadeia única: `express-rate-limit@8.6.0 → ip-address@10.2.0`, só consumida por `ipKeyGenerator`. Das 3 CVEs (`GHSA-mwp4-54f8-5fhr`/CVE-2026-69192 alta; `GHSA-4xrf-jv44-h6hh`/CVE-2026-69198 e `GHSA-22jq-vg5j-6vgg`/CVE-2026-54272 moderadas):
- As 2 moderadas afetam métodos de classificação (`isPrivate`/`isLoopback`/`isLinkLocal`/`isCGNAT`/`isMulticast`/`isUnspecified`/`isULA`/`isBroadcast`/`isInSubnet`/`isHostInSubnet`/`getType`) que `ipKeyGenerator` **nunca chama** — inalcançáveis por definição de uso.
- A alta (`Address4.correctForm()`, alcançável só via `Address6.to4()`) foi reproduzida como bug real em isolamento (`new Address4('012.0.0.1').correctForm()` → `'12.0.0.1'` decimal, deveria ser `'10.0.0.1'` octal) — mas o único caminho desta app até ela é bloqueado ANTES do parsing malicioso por 2 camadas, também reproduzidas diretamente: `node:net.isIPv6('::ffff:012.0.0.1')` retorna `false` (rejeitado antes de `ip-address` ser sequer chamado), e mesmo contornando isso, a própria `Address6.parse4in6` da versão instalada já lança `AddressError: "IPv4 addresses can't have leading zeroes"`.

**Classificação: Categoria C.** Nenhuma dependência atualizada (correto para C). Movido para `SECURITY_HARDENING_BACKLOG.md`, item 14.

## Achado Colateral Não Classificado — EV-070

| ID | Descrição | Categoria | Impacto |
|---|---|---|---|
| EV-070 | `ipKeyGenerator(req, res)` chamado com assinatura errada nos 6 call sites do projeto (`rateLimiters.js:145,164,179,192,226`, `app.js:146`) — deveria ser `ipKeyGenerator(req.ip, subnet)` | **Não classificado** | `authIpLimiter`/`cadastroLimiter` (mitigação central do EV-057) sempre afetados — reproduzido com Express real que a função retorna o objeto `req` inteiro, coagido para a string constante `"[object Object]"`: o balde deixa de ser por-IP e vira um único balde global compartilhado por toda a aplicação |

Detalhamento completo: `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-070. Descoberto como efeito colateral do Gate 3 (análise de exploitabilidade) do EV-069 — não relacionado à CVE em si. Não investigado a fundo nem corrigido nesta missão (fora do mandato) — requer missão dedicada mediante autorização do usuário.

## Critérios de encerramento — status final

- Nenhuma vulnerabilidade Categoria A permanece aberta — **satisfeito** (EV-065 refutado por teste real contra produção).
- Nenhuma pendência Categoria B permanece sem resolução — **NÃO satisfeito** — EV-067 corrigido e EV-069 refutado, mas **EV-070** (achado colateral, não classificado) permanece aberto.
- Toda correção tem reprodução prévia, causa raiz, teste dedicado, execução real em CI — **satisfeito para EV-056/060/063/067**; EV-069 refutado com reprodução completa (não é correção de código); EV-070 não investigado a fundo (fora do mandato desta missão).
- Revisão adversarial dedicada tenta e não consegue reabrir vulnerabilidades corrigidas — **satisfeito**: 4 rodadas sobre o EV-067, a última sem achado; nenhuma das correções anteriores (EV-056/060/063) foi reaberta.
- CI e Security verdes no commit de referência de código — **NÃO satisfeito**: todos os testes passam (zero regressão); a auditoria de dependências ainda mostra o achado do EV-069 no relatório do `npm audit` (a ferramenta não distingue "Categoria C confirmada" de "não corrigido") — nenhuma dependência foi atualizada, por ser a decisão correta para Categoria C.
- Itens Categoria C ficam exclusivamente no backlog, cada um com condição de retorno — **satisfeito** (14 itens; EV-067 já corrigido e EV-069 já refutado não entram; EV-070, não classificado, também não entra — só itens C confirmados vão para o backlog).

**Por causa de EV-070 (não mais EV-067 nem EV-069, ambos resolvidos), esta missão não pode concluir Opção A.** Ver parecer final em `SECURITY_CLOSURE_FINAL_REPORT.md`.

## Revisão Adversarial Final (Gate 7)

Um agente `red-team-attacker` fresco recebeu mandato estrito: encontrar um bloqueador Categoria A/B **ignorado** pelas revisões anteriores — não procurar melhorias, não abrir novas frentes. Tentou 9 vetores (IDOR cross-tenant, interação RBAC EV-060+EV-063, isolamento de tenant no Google Business, upload/path traversal, brute force de 2FA no login, SQL injection, replay de webhook, CSRF, spoofing de geolocalização) e **não encontrou nada** nesses 9 — todos verificados com evidência de código, sem achado.

**Encontrou 1 achado real, verificado de forma independente por mim antes de aceitar** (leitura direta de `account.js:1-38,443-501`, `app.js:141-151`, `rateLimiters.js:172-183`, `EOS_SECURITY_CLOSURE_V2_PLAN.md:129,379` — confirmando cada citação do agente linha por linha, não aceito por alegação):

**EV-067 — Ausência de rate limiter dedicado em `POST /me/2fa/ativar` e `POST /me/2fa/desativar`** (`chaveiro-bot/src/routes/account.js:443-501`). Confirmado:
- As 2 rotas verificam só um código TOTP de 6 dígitos (`verificarCodigo`), sem re-confirmação de senha.
- O router só aplica `requireAuth`+`senhaProvisoria` globalmente (`account.js:37-38`); o único limiter importado no arquivo inteiro é `exclusaoContaLimiter`, usado só em 2 outras rotas.
- `twoFactorLimiter` (`app.js:141-151`) cobre só `/api/auth/login/2fa` e `/api/auth/login/2fa-telefone` — prefixos diferentes, sem overlap com `/api/me/2fa/*`.
- **Não é achado inédito**: `EV-027` (já registrado em `EOS_SECURITY_CLOSURE_V2_PLAN.md:129`) cobria exatamente essas 3 rotas ("Confirmado, Alta confiança"). O fechamento (`item 5 da Discovery Queue, [RESOLVIDO → T-REC-02]`) só tratou `/me/2fa/recuperar` — `ativar`/`desativar` ficaram sem tarefa de fechamento, gap de rastreamento silencioso.
- **Precedente direto do próprio projeto**: `exclusaoContaLimiter` foi criado especificamente porque "o código de confirmação de exclusão de conta não tinha nenhum limite dedicado... insuficiente contra brute force de um espaço de 6 dígitos" (`rateLimiters.js:172-175`, achado F3) — mesma classe de ameaça, mesma superfície, sem o mesmo tratamento aqui.
- **Impacto**: atacante com sessão JWT válida roubada (não precisa do segredo TOTP) pode martelar `/me/2fa/desativar` limitado só pelo limiter genérico (120/min por IP, compartilhado com toda a API) — ao longo de dias, chance real de desativar permanentemente o 2FA da vítima, tornando permanente um comprometimento que era temporário.
- **Classificação**: Categoria B — "proteção que deveria estar ativa mas não está", por precedente direto do próprio projeto. Exige precondição (token roubado), não é bypass de privilégio zero.

**Conclusão do Gate 7: a revisão adversarial final NÃO conseguiu reabrir nenhuma das vulnerabilidades já corrigidas (EV-056/060/063) nem o EV-057 (fora o EV-065, já refutado), mas encontrou 1 bloqueador Categoria B genuíno e independente, não relacionado a nenhum dos alvos anteriores.** Isso muda o parecer desta missão de consolidação — ver "Critérios de encerramento" abaixo e `SECURITY_CLOSURE_FINAL_REPORT.md` para o parecer formal.

## Data desta atualização — frente ainda não encerrada

**2026-08-04**, commit de código de referência `fda01cc` (correção final do EV-067; nenhum código alterado na missão EV-069, que é só investigação/documentação). CI verde em todos os testes (41/41+28/28), sem regressão. A Frente de Segurança permanece **ATIVA** exclusivamente por causa do EV-070 (achado colateral não classificado); este baseline será atualizado (ou sucedido por uma v2) quando EV-070 for investigado, classificado e — se necessário — corrigido e revalidado.
