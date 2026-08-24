# ADMAI_FRONTEND_BACKEND_STRUCTURAL_RECONCILIATION — relatório do ciclo

**Data:** 2026-08-24 · **HEAD de partida:** `0ce64e2` · **Branch:** `fix/seguranca-criticos`
**Workstream:** ADMAI-FE-STRUCTURAL-01 · **Restrição soberana:** `NO_VISUAL_CHANGE` (cumprida:
zero arquivos de produto alterados).

## EXECUTIVE RESULT

**Os contratos frontend↔backend estão alinhados** (83/83 MATCH, zero UNKNOWN em auth/core) e o
login local funciona de ponta a ponta — provado em 4 camadas independentes (API, browser real,
sessão stale, build stale). O problema relatado pelo usuário é **`LOCAL_RUNTIME_DIVERGENCE`**
(processos-sobra de ciclos anteriores + assimetria IPv4/IPv6 de portas + estado de
browser/credencial), não quebra de contrato.

A investigação achou e corrigiu **um defeito REAL de produto no backend** —
**D-FE-STRUCT-LIMITER-2FA**: `app.use('/api/auth/login', authIpLimiter, authLimiter)` casava por
prefixo também as rotas 2FA (`/login/2fa`, `/2fa-telefone`, `/2fa/recuperar`), onde o
`authLimiter` sem identidade mapeada degradava para um balde **por IP de 5 falhas/15min
compartilhado entre login e 2FA** — a falha de senha de uma pessoa bloqueava o 2FA do IP/NAT
inteiro, contra os dois designs documentados. Corrigido com mount exato (decisão D1 Codex thread
`01a0346e`), teste de regressão que **morde** (sabotagem: 3/5 falham com o mount antigo) e 36/36
nas suítes colaterais. E **3 defeitos de harness** E2E corrigidos (test-only).

## LOCAL RUNTIME IDENTITY (provada)

- Worktree correto: `agent-environment` @ `0ce64e2` (árvore limpa). Vite dev :5173 (PID com path
  completo do worktree) e backend :3000 (`/health` 200, database ok) — identidade por cmdline+probe.
- **Sobras encontradas e mortas:** cadeia backend morta de 12:05 (npm 3408 → watch 13212, sem
  filho ouvindo); **`vite preview` :4173** (13:06, `dist/` stale de 13:18, bound **só `[::1]`**).
  `dist/` stale removido (regenerável). Docker (pg/redis) intocado.
- **Assimetria IPv6 (foot-gun):** dev 5173 escuta só `127.0.0.1`; o preview 4173 escutava só
  `[::1]`. Um browser resolvendo `localhost`→IPv6 achava exatamente o alvo errado "funcionando".
- Worktree alheia `C:/Program Files/dev/AdmAi` (branch antiga) existe mas NÃO servia nada.

## LOGIN ROOT CAUSE (LOCAL-AUTH-BLOCKER-01 — fechado)

Reproduzi o fluxo em browser real (CDP), 4 cenários:

| Cenário | Resultado |
| --- | --- |
| `127.0.0.1:5173` (canônico), perfil novo | **login OK**: POST 200 → token → `/` → dashboard renderizado, APIs 200 |
| `[::1]:4173` (preview stale) | login OK (proxy do preview herda `server.proxy`); render pós-login OK com espera maior — transiente de timing |
| Sessão stale (token inválido plantado + refresh revogado pós-Gate-6) | hidratação limpa → `/login` → login novo OK — **sem loop** |
| API direta (curl, via proxy e direto) | 200 `{token,nome,admin,papel,senhaProvisoria}` + cookie `refresh_token` |

Conclusão: o backend/contrato/fluxo estão corretos. As causas prováveis do sintoma do usuário,
por evidência: (1) porta/aba errada (4173 stale ou `localhost` resolvendo IPv6 onde 5173 não
escuta); (2) credenciais que não existem no banco local `admai_dev` (que só tem as fixtures demo
`dono.demo`/`gestor.demo`/`ana.tecnica`, senha em `DEMO_SENHA`); (3) estado de browser antigo
(sessão pré-hardening — que o app recupera sozinho, provado). **Receita:** `http://127.0.0.1:5173`
+ conta demo (ou cadastro novo pela UI, provado pela jornada de onboarding).

## AUTH CONTRACT (BEFORE = AFTER — nada precisou mudar)

Login → `{token,...}` ou `{twoFactorRequerido, desafio, metodo}`; 2FA verify com `{desafio,codigo}`
(TOTP e telefone); refresh por cookie HttpOnly com rotação atômica (FOR UPDATE + corte `iatMs`);
sessão hidratada por `/me` + `localStorage admai_token` + evento `admai:logout`; erros semânticos
402/403 roteados pelo interceptor central. Detalhe por contrato:
`ADMAI_FRONTEND_BACKEND_CONTRACT_REGISTRY.md`.

## SESSION / 2FA / REFRESH / RBAC / ROUTE GUARDS

- **Sessão:** hidratação limpa inclusive partindo de estado stale (provado). Sem race `/me`×login.
- **2FA:** desafio JWT opaco; código errado → 400 "Código inválido" renderizado; sem sessão sem o
  fator; caminhos alternativos (magic-link/OAuth/telefone) exigem o fator (Gate 6).
- **Refresh:** single-flight no client (`_refreshPromise`); 401 de `/auth/*` não dispara refresh;
  rotação/revogação/cutoff no server (Gate 6, 13/13 regressões).
- **RBAC/guards:** backend autoridade (`requireAuth`/`requirePermissao`/self-scope/paywall na
  ordem de montagem); frontend Guards+`/me/permissoes` só UX. Papéis provados nas jornadas.

## API CONTRACT MISMATCHES FOUND

**Zero.** 83/83 MATCH (12 falsos-MISS do matcher resolvidos: routers montados na raiz com path
`/api/...` completo + templates de querystring). WhatsApp = DEFERRED_SCOPE (flag OFF, POST_MVP).

## FIXES APPLIED / FILES CHANGED

| Tipo | Arquivo | Mudança |
| --- | --- | --- |
| Runtime (não-repo) | — | mortos: preview 4173 + cadeias backend zumbis; `dist/` stale removido; **704→12 chrome.exe** (zumbis de headless acumulados em 2 dias — a real causa da flakiness das jornadas) |
| **Produto (backend)** | `chaveiro-bot/src/app.js` | **D-FE-STRUCT-LIMITER-2FA** (D1 Codex `01a0346e`): mount EXATO `app.post('/api/auth/login', authIpLimiter, authLimiter)` — as etapas 2FA deixam de herdar os limiters de credencial por prefix-match (ficam só com o `twoFactorLimiter` dedicado por desafio + global) |
| Teste (produto) | `chaveiro-bot/test/integration/limiter_2fa_dedicado.test.js` (novo) | 5 casos obrigatórios do D1; **sabotagem morde** (mount antigo → 3/5 falham) |
| Teste (harness) | `chaveiro-painel/e2e/jornadas.mjs` | `clicarQuandoHabilitado`; submissão 2FA por `requestSubmit` (mata a corrida do submit nativo); `esperarTexto` com linha do tempo (path+token+tela) no erro; `fechar()` à prova de vazamento no Windows (taskkill /T + varredura por `user-data-dir`; `-like` do PS trata `\` literal) |
| Docs | registry (novo), este relatório, ledger, AGENT_DECISIONS | registro |

**Zero mudança visual; zero mudança em 2FA/refresh/rotação/UI.** A única mudança de produto é a
correção do mount de limiters — restaura o design documentado, decidida por Codex D1.

## TESTS / NEGATIVE CONTROLS

- Jornadas E2E no stack real: 1ª rodada 7/9 (dois FALHOU); investigação isolada provou o caminho
  402 correto (transiente de timing) e achou a **race real do harness** no 2FA (2 falhas
  consecutivas; sonda isolada passa; click em disabled é no-op silencioso). Pós-fix: ver rodada
  final registrada no ledger (FE-STRUCT-10).
- Negative controls vivos: senha errada (erro visível + storage limpo), 402 (produto degrada com
  explicação, `/assinatura` renderiza status+ação), 2FA errado (400 + "Código inválido", sem
  sessão), deep-link sem sessão (redirect + retorno).
- Suites existentes: painel 252 · integração bot 348+ · Gate 6 13/13 — inalteradas (nenhum
  produto tocado).

## VISUAL PRESERVATION

`VISUAL_DIFF = ZERO` **por construção**: nenhum arquivo de produto foi alterado. As sondas
renderizaram Login/desafio 2FA/dashboard/assinatura reais durante as provas (nenhum empty-render
não-explicado; o guard de página vazia segue ativo nas jornadas).

## OPEN BLOCKERS (deste ciclo)

Nenhum estrutural. Residual de qualidade-de-teste: as jornadas 402/2FA eram sensíveis a timing —
a do 2FA foi endurecida; a do 402 passou na re-execução (transiente registrado).

## STAGING RELATION (inalterada)

`STG-SEC-RLS-01 = READY_FOR_EXTERNAL_APPLY` (handoff congelado: `lockdown_public_access.sql`
SHA-256 `1a195f36…`, `verify_lockdown.sql` `9fb63780…`, alvo exclusivo `qsuufuulxfkkeasgxhcv`);
cadeia de staging BLOCKED_CAPABILITY; produção intocada (`PRODUCTION_RLS_STATE = UNKNOWN`);
terminal global `ADMAI_RELEASE_CANDIDATE_READY`.

## NEXT FRONTIER

1. Apply externo do lockdown no staging (handoff pronto) → fechar STG-SEC-RLS-01 → migração →
   storage → aceitação real. 2. Local: nada estrutural pendente.
