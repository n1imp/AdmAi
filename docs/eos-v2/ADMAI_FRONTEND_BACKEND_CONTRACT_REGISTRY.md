# ADMAI_FRONTEND_BACKEND_CONTRACT_REGISTRY

**Data:** 2026-08-24 · **HEAD:** `0ce64e2` (worktree agent-environment, `fix/seguranca-criticos`)
**Workstream:** ADMAI-FE-STRUCTURAL-01 · **Método:** sweep determinístico (extração de todas as
chamadas `api.<m>('<path>')` do painel × todas as rotas `<router>.<m>('<path>')` do bot, com
normalização de path params e dos routers montados na raiz que declaram `/api/...` completo).

## Resultado agregado

| Métrica | Valor |
| --- | --- |
| Chamadas únicas do frontend (método+path) | **83** |
| `MATCH` (rota backend existente e compatível) | **83** |
| `MISMATCH` / `STALE_FRONTEND` / `STALE_BACKEND` | **0** |
| `UNKNOWN` em auth/core | **0** |
| `DEFERRED_SCOPE` | WhatsApp UI (flag `WHATSAPP` OFF — POST_MVP; rotas existem e casam, não são blocker) |

> Nota de método: 12 falsos-MISS iniciais do matcher foram resolvidos deterministicamente —
> `google.js`/`whatsapp.js` declaram caminho completo `/api/...` montados na raiz (app.js:165-171),
> e 2 templates eram sufixo de querystring (`/avaliacoes${params}`, `/google/reviews${qs...}`).

## Cadeia de autenticação (auditada a fundo — prova viva, não só estática)

| contractId | FE consumer | BE route | Estado | Evidência |
| --- | --- | --- | --- | --- |
| AUTH-LOGIN | `Login.jsx` → `api.post('/auth/login')` | `auth.js` POST `/login` (authIpLimiter+authLimiter) | **MATCH** | curl 200 `{token,nome,admin,papel,senhaProvisoria}` + cookie `refresh_token`; browser E2E completa |
| AUTH-2FA-DESAFIO | `Login.jsx` estado `desafio2fa` ← `{twoFactorRequerido, desafio, metodo}` | `responderSessao` (auth.js:101) | **MATCH** | probe: desafio JWT emitido; tela de desafio renderiza |
| AUTH-2FA-VERIFY | `Login.jsx` → `api.post('/auth/login/2fa'|'/2fa-telefone', {desafio, codigo})` | `auth.js` POST c/ `verificarDesafio2fa` (twoFactorLimiter) | **MATCH** | probe: código errado → 400 `{"erro":"Código inválido"}` → texto renderiza; sem sessão |
| AUTH-REFRESH | `api.js` `tentarRefresh()` single-flight, `withCredentials`, 401-de-`/auth/` NÃO dispara refresh | `auth.js` POST `/refresh` (rotação atômica + FOR UPDATE + corte `iatMs`) | **MATCH** | fixes F5 no client; Gate 6 no server; jornadas + integração |
| AUTH-SESSION-HYDRATE | `App.jsx` AuthProvider + `localStorage admai_token` + evento `admai:logout` | `account.js` GET `/me` | **MATCH** | probe sessão stale: token inválido → limpo → `/login` limpo → login novo OK (sem loop) |
| AUTH-ERROS-SEMANTICOS | `api.js` interceptor: 402→`/assinatura`; 403 `senha_provisoria`→`/trocar-senha`; 403 `email_nao_verificado`→`/verificar-email` | paywall 402 + códigos do backend | **MATCH** | probe 402: `/servicos` 402 → `/assinatura` renderiza "ASSINATURA CANCELADA + ASSINAR" |
| AUTH-REGISTER | `Login.jsx`/`api.register` → POST `/auth/register` | `auth.js` (cadastroLimiter) | **MATCH** | jornada onboarding cria empresa pela UI |
| AUTH-RECUPERAR | `RecuperarSenha.jsx` → `/auth/recuperar-senha`, `/auth/redefinir-senha` | `auth.js` (transacional + lockUsuario) | **MATCH** | sweep + suíte integração |
| AUTH-ALTERNATIVOS | magic-link / oauth (`/auth/magic-link`, `/auth/oauth/:provedor`) | `auth.js` via `responderSessao` (2FA imposto — Gate 6) | **MATCH** | Gate 6 fechou bypass; integração cobre |

Estados semânticos que o frontend entende (derivados do código, não inventados):
`twoFactorRequerido+desafio` · `senhaProvisoria` · 403 `senha_provisoria` · 403
`email_nao_verificado` · 402 (assinatura, com motivo em `/billing/status`) · 401 (credencial
errada em `/auth/*` ≠ sessão vencida fora dele) · logout global via evento.

## RBAC / guards

Backend = autoridade (`requireAuth` + `requirePermissao` + self-scope; paywall
`requireAssinaturaAtiva` na ordem de montagem `api.js:22-38`). Frontend `Guards.jsx` +
`/me/permissoes` = control-flow de UX (papéis dono/gestor/funcionário) — jornadas provam dono →
dashboard, técnica → MeuPainel/ponto, e negativa de papel na suíte de integração (348 testes).
`FRONTEND_GUARD != AUTHORIZATION_BOUNDARY` preservado.

## Core (1+ leitura por domínio — todos MATCH)

Dashboard (`/dashboard`, `/me/preferencias/dashboard`) · Serviços (`/servicos*`, aprovar/rejeitar/
iniciar/concluir) · Técnicos (`/tecnicos*`, perfil, ponto) · Financeiro (`/pagamentos`,
`/relatorio/pdf`) · Estoque (`/materiais*`, `/estoque`, movimentação, upload) · Ponto
(`/ponto/hoje`, `/ponto/bater`) · Configurações (`/config/empresa`, `/me*`, notificações) ·
Segurança (`/me/2fa/*`, `/me/sessoes`, `/me/telefone/otp/*`, `/me/logout-all`, LGPD) · Assinatura
(`/billing/status`, checkout/portal) · Documentos (`/me/documentos*`) · Avaliações/Google
(`/avaliacoes*`, `/google/*` — rotas completas montadas na raiz) · Métricas (`/metricas/:id*`) ·
Usuários/admin (`/usuarios*`, `/permissoes/catalogo`, convites).

Prova viva agregada: jornadas E2E no stack real (login, wizard de serviço, ponto, 402, 2FA,
deep-link, mobile 360, documentos) + 252 testes do painel + 348 de integração do bot.

## Achados reais do ciclo (e correções)

- **D-FE-STRUCT-LIMITER-2FA (PRODUTO, backend — decidido por Codex D1 thread `01a0346e`):**
  `app.use('/api/auth/login', authIpLimiter, authLimiter)` prefix-casava as rotas 2FA
  (`/login/2fa`, `/2fa-telefone`, `/2fa/recuperar`), onde o `authLimiter` sem identidade mapeada
  degradava para balde **por IP de 5 falhas/15min compartilhado** entre login e 2FA (prova viva:
  desafios distintos → 401,401,429×5). Cross-flow lockout via NAT, contra os dois designs
  documentados. Fix: mount exato `app.post(...)`; regressão `limiter_2fa_dedicado.test.js` (5
  casos; sabotagem morde: mount antigo → 3/5 falham); 36/36 nas suítes colaterais de auth.
- **HARNESS-2FA (testes, 3 defeitos):** click em botão `disabled` era no-op silencioso (race do
  flush do React) → `clicarQuandoHabilitado` + submissão por `requestSubmit`; timeout de
  `esperarTexto` sem contexto → linha do tempo (path+token+tela) no erro; `fechar()` vazava
  processos Chrome no Windows (`child.kill()` não mata a árvore; 704 zumbis acumulados
  degradando a máquina — a causa ambiental da flakiness) → taskkill /T + varredura por
  `user-data-dir` único.

## Visual intocado

`VISUAL_DIFF = ZERO`: nenhuma mudança em UI/UX; a única mudança de produto é a correção do mount
de limiters no backend (segurança/disponibilidade, sem efeito visual).
