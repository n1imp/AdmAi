# ROUND-00 — EOS-Repository-Mapper (backend)

| Campo | Valor |
|---|---|
| Rodada | 00 (bootstrap, pré-Rodada 1) |
| Agente EOS | `EOS-Repository-Mapper` |
| Tipo de subagente usado | `Explore` (somente leitura, busca "very thorough") |
| Data | 2026-08-05 |
| Commit-base | `30bf545` (código idêntico à tag `project-baseline-v1`) |
| Mandato | Inventário factual do backend `chaveiro-bot`: rotas × middleware de auth, RBAC, models Prisma, `req.db`/multi-tenant, serviços, integrações externas, feature flags, migrations, nomes de variáveis de ambiente |
| Restrições impostas | Não ler `.env` reais; não expor nenhum valor de secret |
| Grau de confiança | ALTA (tudo com `arquivo:linha`) |

> Relatório persistido **verbatim** pelo orquestrador. Não é verdade estabelecida — é evidência
> de agente. Onde o comportamento atual puder ser reverificado no código, o código prevalece.

---

# Inventário factual — backend `chaveiro-bot`

Base: `chaveiro-bot`
Stack: Node ESM + Express 4 + Prisma 7 (postgres, driver adapter `pg`) + BullMQ/Redis + Zod. `package.json` confirma deps: `stripe`, `resend`, `@supabase/supabase-js`, `@sentry/node`, `@anthropic-ai/sdk`, `google-auth-library`, `jose`, `otplib`, `node-cron`, `prom-client`, `pdfkit`.

---

## 1. Rotas

### Montagem (quem entra sob `/api` e quem entra na raiz)
`src/app.js`
- `:158` `app.use(stripeWebhookRouter)` — **raiz** (path completo declarado no arquivo)
- `:162` `app.use(whatsappRouter)` — **raiz**
- `:167` `app.use(googleRouter)` — **raiz**
- `:169` `app.use('/api', apiRouter)`
- `:154` `app.get('/metrics', metricsHandler)` — **sem auth**
- `:173` `app.get('/health', …)` — **sem auth**
- `:79` `app.use('/uploads', express.static('./uploads'))` — **estático sem auth**

`src/routes/api.js:12-19` — todos os sub-routers montados em `'/'` sob `/api`: auth, account, servicos, tecnicos, estoque, documentos, admin, billing.

Rate limits em `app.js`: `:110` `/api` (120/min), `:120` `/webhook` (600/min), `:128` login, `:132` register, `:135` `/api/auth/oauth`, `:150`/`:151` 2FA.

---

### `src/routes/auth.js` — **PÚBLICO (nenhum `router.use(requireAuth)`; o arquivo nem importa `requireAuth`)**
| Método + path (efetivo) | Linha | Auth/middleware |
|---|---|---|
| POST `/api/auth/login` | 148 | público (+ `authIpLimiter`, `authLimiter` em app.js:128) |
| POST `/api/auth/login/2fa` | 239 | público (+ `twoFactorLimiter` app.js:150) |
| POST `/api/auth/login/2fa-telefone` | 271 | público (+ limiter app.js:151) |
| POST `/api/auth/login/2fa/recuperar` | 310 | público (valida `desafio`; comentário em `:304` diz que antes vivia atrás de `requireAuth`) |
| POST `/api/setup` | 343 | público, **auto-trancado**: `prisma.usuario.count() > 0 → 409` (`:345`) |
| POST `/api/auth/register` | 391 | público (+ `cadastroLimiter` app.js:132) |
| POST `/api/auth/recuperar-senha` | 467 | público + `authLimiter` inline |
| POST `/api/auth/redefinir-senha` | 487 | público + `authLimiter` inline |
| GET `/api/auth/email/verificar` | 530 | público (token na query) |
| GET `/api/auth/email/confirmar-mudanca` | 559 | público (token) |
| POST `/api/auth/email/reenviar` | 594 | público |
| GET `/api/convite/:token` | 614 | público |
| POST `/api/convite/:token/aceitar` | 637 | público |
| POST `/api/auth/refresh` | 697 | cookie `refresh_token` (HttpOnly), sem JWT |
| POST `/api/auth/logout` | 726 | público (limpa cookie) |
| POST `/api/auth/magic-link` | 736 | público + `authLimiter` |
| GET `/api/auth/magic-link/verificar` | 755 | público |
| GET `/api/auth/providers` | 781 | público |
| POST `/api/auth/oauth/:provedor` | 785 | público + `cadastroLimiter` (app.js:135) |

### `src/routes/account.js` — `router.use(requireAuth)` `:41` + `router.use(senhaProvisoria)` `:42`
`/api/me` GET `:106` · `/api/me/permissoes` GET `:120` · `/api/me/metricas` GET `:134` (checa `podeProprio(req.user,'ver_metricas')` em `:136`) · `/api/me/servicos` GET `:225` (`:227` `ver_metricas` OU `registrar_servico`) · PATCH `/api/me` `:244` · PATCH `/api/me/senha` `:299` · POST `/api/me/conta/codigo-exclusao` `:333` (+`exclusaoContaLimiter`) · DELETE `/api/me/conta` `:372` (+`exclusaoContaLimiter`) · PATCH `/api/me/2fa` `:427` (**410 Gone**) · POST `/api/me/2fa/setup` `:431` · POST `/api/me/2fa/ativar` `:447` (+`totpAtivarLimiter`) · POST `/api/me/2fa/desativar` `:483` (+`totpDesativarLimiter`) · POST `/api/me/telefone/otp/enviar` `:507` · `/verificar` `:522` · POST `/api/me/telefone/2fa/ativar` `:587` · `/desativar` `:606` · GET `/api/me/sessoes` `:617` · POST `/api/me/logout-all` `:632` · GET `/api/me/preferencias/dashboard` `:658` · PUT `/api/me/preferencias/dashboard` `:680`.

### `src/routes/servicos.js` — `requireAuth` `:17`, `senhaProvisoria` `:18`
| Endpoint | Linha | Permissão |
|---|---|---|
| GET `/api/servicos` | 66 | `requirePermissao('servicos','ver')` |
| GET `/api/servicos/pendentes` | 128 | `requirePermissao('aprovacoes','ver')` |
| GET `/api/servicos/:id` | 143 | `requirePermissao('servicos','ver')` |
| POST `/api/servicos` | 156 | `podeRegistrarServico` (custom, def. `:43`: `servicos.criar` **OU** `proprio.registrar_servico`) |
| POST `/api/servicos/:id/aprovar` | 250-253 | `requirePermissao('aprovacoes','aprovar')` |
| POST `/api/servicos/:id/rejeitar` | 295-298 | `requirePermissao('aprovacoes','aprovar')` |
| DELETE `/api/servicos/:id` | 323 | `requirePermissao('servicos','deletar')` |
| GET `/api/avaliacoes` | 337 | `avaliacoes.ver` |
| GET `/api/avaliacoes/config` | 365 | `avaliacoes.ver` |
| PATCH `/api/avaliacoes/config` | 383 | `avaliacoes.editar` |
| GET `/api/dashboard` | 414 | `dashboard.ver` |
| GET `/api/gestor/indicadores` | 540 | `dashboard.ver` |
| GET `/api/me/servico-atual` | 619 | `recursoServicoAtual` (flag, def. `:607`) |
| POST `/api/servicos/:id/iniciar` | 641 | `recursoServicoAtual` |
| POST `/api/servicos/:id/concluir` | 685 | `recursoServicoAtual` |

`recursoServicoAtual` (`:607-612`): 404 se `env.SERVICO_ANDAMENTO_ENABLED !== 'true'`; 403 se `!req.user.tecnicoId || !podeProprio(req.user,'registrar_servico')`.

### `src/routes/tecnicos.js` — `requireAuth` `:28`, `senhaProvisoria` `:29`
GET `/api/tecnicos` `:188` (`tecnicos.ver`) · POST `/api/tecnicos` `:230` (`tecnicos.editar`) · POST `/api/tecnicos/:id/acesso` `:294` (`tecnicos.editar`) · POST `/api/tecnicos/:id/acesso/reset` `:333-336` (`tecnicos.editar` + `podeGerenciarUsuario` no handler) · GET `/api/tecnicos/:id/ponto` `:378` (`ponto.ver`) · GET `/api/tecnicos/:id/ponto/relatorio` `:405` (`ponto.ver`) · GET `/api/tecnicos/:id/perfil` `:432` (`tecnicos.ver`) · PATCH `/api/tecnicos/:id` `:507` (`tecnicos.editar`) · POST `/api/pagamentos` `:543` (`financeiro.editar`) · POST `/api/ponto/bater` `:571` (**sem `requirePermissao`**; checa `podeProprio(req.user,'bater_ponto')` no handler `:573`) · GET `/api/ponto/hoje` `:626` (idem `:628`) · GET `/api/ponto/selfie/:arquivo` `:639` (**só `requireAuth`**; tenant + `ehProprio || pode(req.user,'ponto','ver')` no handler `:650`).

### `src/routes/estoque.js` — `requireAuth` `:14`, `senhaProvisoria` `:15`
GET `/api/materiais` `:33` (`estoque.ver`) · POST `/api/materiais/upload` `:60` (`estoque.editar`) · POST `/api/materiais` `:89` · PATCH `/api/materiais/:id` `:115` · DELETE `/api/materiais/:id` `:144` (todos `estoque.editar`) · GET `/api/estoque` `:162` (`estoque.ver`) · POST `/api/materiais/:id/movimentacao` `:202-205` (`estoque.editar`) · GET `/api/materiais/:id/movimentacoes` `:243` (`estoque.ver`) · GET `/api/relatorio/pdf` `:261` (**`financeiro.ver`**).

### `src/routes/documentos.js` — **só `router.use(requireAuth)` `:32` (sem `senhaProvisoria`)**
GET `/api/me/documentos` `:72` · POST `:90` · GET `/api/me/documentos/:id/arquivo` `:136` · DELETE `/api/me/documentos/:id` `:174` — todos com `recursoDocumentos` (`:49-57`: 404 se `DOCUMENTOS_ENABLED !== 'true'`; 403 se `!req.user.tecnicoId || !podeProprio(req.user,'documentos')`).

### `src/routes/admin.js` — `requireAuth` `:27`, `senhaProvisoria` `:28`
GET `/api/me/notificacoes` `:44` · PATCH `:57` · GET `/api/notificacoes` `:80` · GET `/api/notificacoes/nao-lidas` `:97` · PATCH `/api/notificacoes/:id/lida` `:109` · POST `/api/notificacoes/ler-todas` `:125` · DELETE `/api/notificacoes/:id` `:138` — **sem permissão granular** (escopo = `req.user.id`).
GET `/api/config/empresa` `:151` (`configuracao.ver`) · PATCH `:164` (`configuracao.editar`) · GET `/api/permissoes/catalogo` `:180` (`usuarios.ver`) · GET `/api/usuarios` `:190` (`usuarios.ver`) · POST `/api/usuarios` `:204` · PATCH `/api/usuarios/:id` `:259` · DELETE `/api/usuarios/:id` `:365` · POST `/api/usuarios/convidar` `:400` (todos `usuarios.editar` + `podeAtribuirPapel`/`podeGerenciarUsuario`/`limitarPermissoesAoAtor` no handler) · POST `/api/lgpd/anonimizar-cliente` `:451` (**`adminOnly`**).

### `src/routes/billing.js`
POST `/api/billing/checkout` `:18` — `requireAuth, adminOnly`
POST `/api/billing/portal` `:29` — `requireAuth, adminOnly`
GET `/api/billing/status` `:46` — `requireAuth`
POST `/webhook/stripe` `:71-74` — **público**, `express.raw({type:'application/json'})`, assinatura HMAC validada em `services/billing.js`.

### `src/routes/google.js` (paths completos, montado na raiz — `googleRouter`)
GET `/api/google/status` `:37-41` · POST `/api/google/place-id` `:86-90` · GET `/api/google/locations` `:114-118` · POST `/api/google/location` `:130-134` · GET `/api/google/oauth/iniciar` `:160-164` · POST `/api/google/desconectar` `:198-202` · GET `/api/google/reviews` `:215-219` · POST `/api/google/reviews/:reviewId/responder` `:278-282` — todos `requireAuth` + `requirePermissao('avaliacoes','ver'|'editar')`.
**GET `/api/google/oauth/callback` `:179` — PÚBLICO** (valida o `state` JWT).

### `src/routes/whatsapp.js` (paths completos, raiz)
POST `/api/whatsapp/cloud/credenciais` `:56-60` — `requireAuth` + `requirePermissao('configuracao','editar')`
GET `/api/bot/whatsapp/status` `:93` — `requireAuth` (QR só para super-admin, `:96`)
POST `/api/bot/whatsapp/conectar` `:108-111` — `requireAuth, requireSuperAdmin`
POST `/api/bot/whatsapp/desconectar` `:125-128` — `requireAuth, requireSuperAdmin`
POST `/webhook/whatsapp` `:153` — público, `raw`, autenticado por `webhookSecret`/HMAC
GET `/webhook/whatsapp/cloud/:empresaId` `:202` — público (handshake `hub.verify_token`)
POST `/webhook/whatsapp/cloud/:empresaId` `:218-221` — público, `raw`, `X-Hub-Signature-256`

`requireSuperAdmin` é definido **localmente** em `whatsapp.js:83-88` e compara `req.user.username === env.SUPER_ADMIN_USERNAME` (não é RBAC de banco).

---

## 2. RBAC

**Definição única:** `src/services/permissoes.js`
- `MODULOS` `:19-30` — `dashboard, servicos, tecnicos, estoque, financeiro, avaliacoes, ponto, aprovacoes, usuarios, configuracao`
- `ACOES_POR_MODULO` `:33-44` — dashboard[ver]; servicos[ver,criar,editar,deletar]; tecnicos[ver,editar]; estoque[ver,editar]; financeiro[ver,editar]; avaliacoes[ver,editar]; ponto[ver,editar]; aprovacoes[ver,aprovar]; usuarios[ver,editar]; configuracao[ver,editar]
- `CAPACIDADES_PROPRIO` `:47-53` — `bater_ponto, ver_metricas, editar_perfil, registrar_servico, documentos`
- `PAPEIS` `:55` — **`['dono', 'gestor', 'funcionario']`** (ordenado por privilégio; **não existe papel `tecnico`** no RBAC — `Tecnico.nivelAcesso` (schema `:79`) é um campo de RH livre, não usado no gate)
- `PRESET_GESTOR` `:76-88`; `PRESET_FUNCIONARIO` `:90-94` (tudo false + `proprio` todo true); `dono` = `grantTotal()` `:67-71`, imutável (`:124`)
- Funções: `presetDoPapel` `:102`, `permissoesEfetivas` `:122`, `pode` `:132`, `podeProprio` `:139`, `limitarPermissoesAoAtor` `:154`, `nivelDoPapel` `:189`, `podeGerenciarUsuario` `:213`, `podeAtribuirPapel` `:229`, `sanitizarPermissoes` `:236`

**Enforcement:** `src/middlewares/auth.js`
- `requireAuth` `:17` — JWT Bearer → carrega `Usuario` + `tecnico.id`, checa `ativo` `:27`, `tokenAindaValido` `:29`, gate de e-mail `:33` (bypass list `:8-15`), popula `req.user` `:41-51` com `permissoesEfetivas`, e `req.db` `:53`. 401 só para erro de token; erro de infra → 503 (`:77-84`).
- `adminOnly` `:88` (usa `req.user.admin`), `requirePermissao(modulo, acao)` `:93`, `senhaProvisoria` `:100`.

**Persistência:** `Usuario.papel` (default `"funcionario"`) e `Usuario.permissoes Json?` (overrides) — `prisma/schema.prisma:235` e `:238`. `Usuario.admin Boolean` `:232` é legado ≡ `papel == "dono"`.

---

## 3. Models Prisma (`prisma/schema.prisma`, 544 linhas, 26 models)

Campo de tenant = **`empresaId`**.

| Model | Linha | Tenant | Campos-chave / relações | Timestamps |
|---|---|---|---|---|
| `Empresa` | 20 | (raiz) | `slug @unique`, `ativo`, `aprovacaoServico`; 1-N usuarios/tecnicos/servicos/materiais/pagamentos/documentos; 1-1 whatsapp, assinatura | `criadoEm` |
| `EmpresaWhatsapp` | 42 | `empresaId @unique` | `grupoJid`, `reviewDelayHoras/Link/Ativo/Template`, `provider` ('evolution'\|'cloud'), `phoneNumberId`, `wabaId`, `accessTokenEnc` | só `atualizadoEm @updatedAt` |
| `Tecnico` | 61 | `empresaId` | `telefone`, `telefoneDisplay`, `comissao`, `metaMensal`, `usuarioId @unique`, bloco RH (cpf, modalidade, salarioBase, jornada…); `@@unique([empresaId,telefone])` `:97` | `criadoEm` |
| `DocumentoTecnico` | 107 | `empresaId` | `tecnicoId`, `tipo`, `mime`, `tamanho`, `storageKey` | `criadoEm` |
| `Servico` | 123 | `empresaId` | `tecnicoId`, `valorCobrado/Material/Liquido`, `comissaoGerada`, `fotoEvidencia`, `status` (`ativo\|pendente\|rejeitado\|em_andamento`, `:147`), **`aprovadoPor`/`aprovadoEm` `:148-149` (auditoria)**, `iniciadoEm`/`finalizadoEm` | `criadoEm` |
| `Material` | 172 | `empresaId` | `quantidadeAtual`, `precoUnit/Venda`, `estoqueMinimo`; `@@unique([empresaId,nome])` | `criadoEm` |
| `MovimentacaoEstoque` | 194 | via `Material` | **histórico/auditoria de estoque**: `tipo`, `quantidade`, `saldoApos`, `origem`, `servicoId` | `criadoEm` |
| `ServicoMaterial` | 211 | via `Servico` | join `servicoId+materialId @@unique` | **nenhum** |
| `Usuario` | 223 | `empresaId` | `username/email/telefone @unique`, `senhaHash?`, `admin`, `papel`, `permissoes Json?`, `preferencias Json?`, `senhaProvisoria`, `ativo`, 2FA (`totpSecret`, `totpPendente`, `phone2faAtivo`, `telefoneOtpHash`), `tokenValidoApos`, `notificacoes Json?` | `criadoEm`, `senhaAlteradaEm` |
| `ContaSocial` | 275 | via `Usuario` | `provedor+provedorSub @@unique` | `criadoEm` |
| `Notificacao` | 289 | via `Usuario` | `tipo`, `lida`, `link` | `criadoEm` |
| `Pagamento` | 305 | `empresaId` | `tecnicoId`, `valor` | `criadoEm` |
| `SessaoConversa` | 321 | `empresaId?` (nulo na desambiguação) | `jid @unique`, `fluxo`, `estadoAtual`, `dadosParciais Json` | `criadoEm` + `atualizadoEm @updatedAt` |
| `Avaliacao` | 338 | `empresaId` | `servicoId @unique`, `nota`, `status`, `agendadoPara`, `enviadoEm`, `respondidoEm` | `criadoEm` |
| `ConexaoBot` | 359 | **global (singleton id=1)** | `instanceName`, `estadoConexao`, `qrCode`, `webhookSecret` | `atualizadoEm` |
| `RegistroPonto` | 372 | `empresaId` | `tecnicoId`, `data @db.Date`, entrada/almoço/saída, `totalMinutos`, `horaExtraMinutos`; `@@unique([tecnicoId,data])` | `criadoEm` |
| `BatidaPonto` | 394 | via `RegistroPonto` | **prova anti-fraude**: `tipo`, `em`, `lat/lng/precisao`, `selfieUrl`, `origem` | `criadoEm` |
| `GoogleConta` | 412 | `empresaId @unique` | `placeId`, `accountId`, `locationId`, `accessTokenEnc`, `refreshTokenEnc`, `tokenExpira` | `conectadoEm`, `atualizadoEm` |
| `AvaliacaoGoogle` | 427 | `empresaId` | `reviewId @unique`, `nota`, `respondida`, `analiseJson` | `sincronizadoEm` |
| `AnaliseAvaliacoes` | 446 | `empresaId @unique` | resumos IA, `ultimoReviewAnalisado` | `atualizadoEm` |
| `CodigoRecuperacaoTotp` | 456 | via `Usuario` | `codigoHash`, `usado` | `criadoEm` |
| `Assinatura` | 468 | `empresaId @unique` | `stripeCustomerId/SubId/PriceId @unique`, `status`, `trialFimEm`, `periodoFimEm`, `canceladoEm` | `criadoEm`+`atualizadoEm` |
| `ConviteUsuario` | 485 | `empresaId` | `email`, `papel`, `tokenHash`, `expiraEm`, `aceitoEm` | `criadoEm` |
| `SessaoUsuario` | 502 | via `Usuario` | `jwtIat` + `@@unique([usuarioId,jwtIat])`, `ip`, `userAgent` | `criadoEm`+`ultimaAtividadeEm @updatedAt` |
| `RefreshToken` | 518 | via `Usuario` | `tokenHash @unique`, `expiraEm` | `criadoEm` |
| `AuditLog` | 530 | `empresaId` | **auditoria imutável**: `acao`, `entidade`, `entidadeId`, `antes Json`, `depois Json`, `ip` | `criadoEm` |

**Soft delete:** **não existe** — nenhum model tem `deletedAt`/`excluidoEm`. O que há são flags de desativação lógica: `Empresa.ativo` `:24`, `Tecnico.ativo` `:71`, `Usuario.ativo` `:244`. Exclusões são `delete`/`deleteMany` reais (ver `DELETE /usuarios/:id` admin.js:365, `DELETE /me/conta` account.js:372) + anonimização LGPD (`/api/lgpd/anonimizar-cliente`, admin.js:451, e o cron `limparDadosAntigos`).

**Auditoria/histórico:** `AuditLog` (+ `src/services/auditoria.js` → `registrar()`), `MovimentacaoEstoque.saldoApos`, `BatidaPonto`, `Servico.aprovadoPor/aprovadoEm`, `SessaoUsuario`.

---

## 4. Multi-tenant (`req.db`)

- **Injeção:** `src/middlewares/auth.js:53` → `req.db = prismaParaEmpresa(usuario.empresaId)`.
- **Implementação:** `src/db/tenant.js` — Prisma Client Extension (`$extends` `:109-135`) sobre `prismaApp`.
  - `MODELOS_ESCOPADOS` `:24-34`: `Tecnico, Servico, Material, Pagamento, EmpresaWhatsapp, Avaliacao, SessaoConversa, RegistroPonto, DocumentoTecnico`.
  - `escoparOperacao` `:69-85`: injeta `empresaId` no `where` de leituras (`:37-46`), reescreve **`findUnique` → `findFirst`** (`:70-73`, anti-IDOR), injeta em `updateMany`/`deleteMany` (`:52`) e em `create`/`createMany` (`:77-83`). `update`/`delete`/`upsert` unitários **não** são escopados (comentário `:48-51`).
  - Cache LRU de clients por empresa, teto 100 (`:90-91`, evicção `:138-141`).
- **RLS (defesa em profundidade, OFF por default):** `src/db/tenant.js:64` `RLS_ATIVA = env.RLS_ENABLED === 'true'`; quando ligada, cada operação escopada roda em `$transaction` que executa `SELECT set_config('app.empresa_id', $1, true)` (`:65`, `:120-125`).
- **Separação de conexões:** `src/db/prisma.js:37-39` — `prismaApp` usa `DATABASE_URL_APP` (role `app_rw`, sem BYPASSRLS) se definido; senão reusa o `prisma` privilegiado. Jobs/auth cross-tenant usam `prisma` (privilegiado).
- **Policies SQL:** `prisma/rls/enable_rls.sql` — `ENABLE + FORCE ROW LEVEL SECURITY` + policy `tenant_isolation` em `Tecnico, Servico, Material, Pagamento, EmpresaWhatsapp, Avaliacao, RegistroPonto, DocumentoTecnico` (`:36-53`) e, via `EXISTS` no pai, em `BatidaPonto` `:59`, `MovimentacaoEstoque` `:73`, `ServicoMaterial` `:87`, `Notificacao` `:101`. Fail-closed (GUC ausente = NULL = zero linhas).
- **Nota factual:** muitas rotas usam `prisma` (base, não escopado) diretamente com filtro manual — ex.: `admin.js:46`, `tecnicos.js:643`, `billing.js:31`, `google.js:44`.

---

## 5. Serviços (`src/services/`, 31 arquivos + 2 subpastas)

| Arquivo | O que faz |
|---|---|
| `agendador.js` | Cron (node-cron) com lock Redis por tick: resumo semanal, avaliações pendentes, sync Google, retenção LGPD. |
| `auditoria.js` | `registrar()` — grava `AuditLog` de ações privilegiadas. |
| `auth.js` | JWT (gerar/verificar), refresh tokens (hash SHA-256), desafios 2FA, `autenticarCandidatos` com timing-safe dummy bcrypt. |
| `avaliacao.js` | Agenda/dispara solicitação de avaliação ao cliente por WhatsApp e captura a resposta. |
| `billing.js` | Stripe: `criarCheckoutSession`, `criarPortalSession`, `processarEvento`, `sincronizarAssinatura`; `TRIAL_DIAS = 14`. |
| `bootstrap.js` | Cria admin+empresa de dev a partir de `ADMIN_*` se o banco estiver vazio (idempotente). |
| `catalogo.js` | Resolução fuzzy de materiais informados no WhatsApp contra o catálogo. |
| `codigosRecuperacao.js` | 10 códigos de recuperação TOTP one-time (bcrypt). |
| `confirmacaoExclusaoConta.js` | Código HMAC stateless por e-mail para exclusão de conta. |
| `conversa.js` | Máquina de estados da conversa privada de registro de serviço. |
| `credenciais.js` | Acesso de funcionário: telefone + PIN provisório, `resetarPin`. |
| `email.js` | Resend + circuit breaker: verificação, boas-vindas, reset, magic link, convite, recibo, falha de pagamento, onboarding D0/1/3/7. |
| `estoque.js` | `movimentarEstoque`/`darBaixaPorServico` transacional, saldo nunca negativo. |
| `idempotencia.js` | `marcarSeNovo` via Redis `SET NX EX` (fail-open) para webhooks. |
| `identidade.js` | Resolve quem enviou a mensagem no número único (por telefone, N empresas). |
| `inbound.js` | Roteia mensagem inbound do WhatsApp (gate `WHATSAPP_HABILITADO` em `:48`). |
| `notificacao.js` | Preferências padrão + `notificarAdmins`/`alertarEstoqueBaixo` (inbox `Notificacao`). |
| `oauth.js` | Login social OIDC (Google/Microsoft/Apple) — verifica ID token via JWKS (`jose`). |
| `onboarding.js` | Enfileira a sequência de e-mails de onboarding (BullMQ, delays D0/1/3/7). |
| `otp.js` | OTP de telefone por WhatsApp, cifrado em repouso. |
| `parser.js` | Normalização de telefone/valores monetários. |
| `periodo.js` | Helpers de filtro de período compartilhados por dashboard/métricas. |
| `permissoes.js` | RBAC (ver §2). |
| `ponto.js` | Ponto eletrônico/banco de horas (timestamps do servidor). |
| `relatorio.js` | Geração de PDF (pdfkit) de serviços e CSV/PDF de ponto. |
| `senha.js` | `avaliarForcaSenha` (score/nível/requisitos). |
| `servico.js` | `buscarOuCriarTecnico` + criação de serviço a partir do bot. |
| `storage.js` | Supabase Storage: `uploadComFallback`, `uploadPrivado`, `urlAssinada`, `removerImagem`, `inspecionarBucket`; fallback para disco. |
| `totp.js` | TOTP RFC 6238 (otplib), segredo cifrado AES-256-GCM. |
| `google/analise.js` | Análise de reviews por IA (Anthropic SDK) com breaker. |
| `google/businessClient.js` | Google Business Profile API (listar/responder reviews, locations); mock quando flag off. |
| `google/oauth.js` | OAuth2 authorization-code do Google + refresh, tokens cifrados. |
| `whatsapp/cloud-client.js` | REST da Cloud API (Graph API da Meta). |
| `whatsapp/cloud-gateway.js` | Gateway por empresa sobre a Cloud API; normaliza inbound; salva credenciais cifradas. |
| `whatsapp/crypto.js` | AES-256-GCM (`encrypt`/`decrypt`/`gerarSegredo`) derivado de `ENCRYPTION_KEY`; `verificarHmac`, `compararToken`. |
| `whatsapp/evolution-client.js` | REST da Evolution API v2 (apikey global). |
| `whatsapp/gateway.js` | Switch de provider (`WHATSAPP_PROVIDER`, `:15`), envio, QR/estado do bot de número único. |

---

## 6. Integrações externas

| Integração | Onde |
|---|---|
| **Stripe** | `src/services/billing.js` (client lazy `_stripe`), `src/routes/billing.js` (checkout/portal/status + `POST /webhook/stripe` `:71`), model `Assinatura` (schema `:468`). Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`. |
| **Google OAuth (login social)** | `src/services/oauth.js` (JWKS via `jose`), `POST /api/auth/oauth/:provedor` (auth.js:785). Também Microsoft e Apple. Env: `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT`, `APPLE_CLIENT_ID`. |
| **Google Business Profile (Reviews)** | `src/services/google/oauth.js` + `businessClient.js` + `analise.js`; rotas `src/routes/google.js`; models `GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`. Cron de sync a cada 6h (`agendador.js:379`). **Places API não aparece** — só `placeId` armazenado (`POST /api/google/place-id`, google.js:86). |
| **WhatsApp — Evolution (não-oficial, número único)** | `src/services/whatsapp/evolution-client.js` + `gateway.js`; rotas de pareamento `whatsapp.js:108/125`; webhook `whatsapp.js:153`; model `ConexaoBot`. |
| **WhatsApp — Cloud API (Meta oficial)** | `src/services/whatsapp/cloud-client.js` + `cloud-gateway.js`; `POST /api/whatsapp/cloud/credenciais` (whatsapp.js:56); webhooks `whatsapp.js:202/218` com `X-Hub-Signature-256`. |
| **E-mail (Resend)** | `src/services/email.js` + fila `emails` + `src/workers/email-worker.js`. Env: `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL`, `FRONTEND_URL`. |
| **Sentry** | `src/instrument.js` (primeiro import do server), `src/config/sentry.js` (`iniciarSentry`, `capturarErro`, `SentryTransport` winston→Sentry, `JA_ENVIADO_AO_SENTRY`). No-op sem `SENTRY_DSN`. |
| **Prometheus** | `src/config/metrics.js`; `GET /metrics` (app.js:154, sem auth); `atualizarMetricasFila` a cada 30s (server.js:87). `monitoring/` + `docker-compose.monitoring.yml`. |
| **Redis / filas / workers** | `ioredis` em `src/middlewares/rateLimiters.js:18` (rate limit store), `src/queues/email.js` (fila `emails`), `src/queues/mensagens.js` (fila `mensagens-inbound`), `src/workers/email-worker.js` (conc. 3), `src/workers/inbound-worker.js` (conc. 5), lock de cron `agendador.js` `comLock`. Env `REDIS_URL`. |
| **Cron** | `agendador.js:355-398` — `0 18 * * 0` resumo semanal; `*/5 * * * *` avaliações; `30 3 * * *` retenção LGPD; `0 */6 * * *` sync Google (todos com `comLock`, TZ São Paulo). |
| **Supabase Storage** | `src/services/storage.js`; buckets `documentos-tecnico` (privado) e `selfies-ponto`. Provisão via `scripts/provision-bucket-documentos.mjs`. |
| **Anthropic (IA)** | `src/services/google/analise.js` (`@anthropic-ai/sdk`). Env `ANTHROPIC_API_KEY`, `AI_REVIEWS_MODEL` (default `claude-haiku-4-5`). |

---

## 7. Feature flags

**Não há sistema de flags em banco nem SDK de flags.** Tudo é **env var string comparada a `'true'`/`'false'`**, validado em `src/config/env.js` (Zod, `z.string().optional()`).

| Flag | Default | Consumo |
|---|---|---|
| `SERVICO_ANDAMENTO_ENABLED` | off | `routes/servicos.js:608` → 404 nos 3 endpoints de serviço atual |
| `DOCUMENTOS_ENABLED` | off | `routes/documentos.js:50` → 404; diagnóstico de bucket em `server.js:55` |
| `GOOGLE_REVIEWS_ENABLED` | off (mock) | `services/google/businessClient.js:22` (`integracaoLigada()`), `agendador.js:249` (no-op no cron) |
| `GOOGLE_BUSINESS_VALIDATE_ONLY` | `'false'` para publicar de verdade | `businessClient.js:42` (`publicarDeVerdade()`) |
| `WHATSAPP_HABILITADO` | off | `services/inbound.js:48` — webhook responde 200 mas nada é processado |
| `WHATSAPP_PROVIDER` | `'evolution'` | `services/whatsapp/gateway.js:15` |
| `RLS_ENABLED` | off | `db/tenant.js:64` |
| `STORAGE_STRICT` | off | `services/storage.js:29` |
| `REQUIRE_EMAIL_VERIFICATION` | off | `middlewares/auth.js:33` |
| `ROLE` (`web`\|`worker`\|`all`) | ausente = monolito | `server.js:28` — `ROLE=web` não sobe workers nem cron |
| `SUPER_ADMIN_USERNAME` | ausente = ninguém | gate de super-admin `routes/whatsapp.js:84` |

Flags implícitas por presença de credencial: Sentry (`SENTRY_DSN`), Storage (`SUPABASE_URL`+`SUPABASE_SERVICE_ROLE_KEY`), IA (`ANTHROPIC_API_KEY`), Stripe (`STRIPE_SECRET_KEY`), Evolution (`EVOLUTION_HOST`), provedores OIDC (client ids).

**Toggle em banco (único):** `Empresa.aprovacaoServico` (schema `:27`) — não é feature flag global, é configuração por tenant.

---

## 8. Migrations (`prisma/migrations/`, ordem cronológica — 27)

1. `20260524204642_`
2. `20260531124110_evolucao_v2`
3. `20260531144326_add_telefone_display`
4. `20260604021146_new`
5. `20260604132207_estoque_saldo_real`
6. `20260604141232_conta_usuario`
7. `20260604142936_notificacoes_inbox`
8. `20260605000000_multitenant_empresa`
9. `20260606000000_conversa_cliente`
10. `20260607000000_avaliacao`
11. `20260611000000_whatsapp_qr`
12. `20260611000100_totp_2fa`
13. `20260612000000_login_social`
14. `20260613000000_whatsapp_cloud`
15. `20260613100000_numero_unico_fase1`
16. `20260614000000_numero_unico_fase3`
17. `20260615000000_rh_ponto_google_reviews`
18. `20260616000000_remove_whatsapp_legado`
19. `20260620000000_rbac_ponto_painel`
20. `20260621000000_fix_tecnico_telefone_unique`
21. `20260705000000_session_auth_tables`
22. `20260707000000_add_codigo_recuperacao_totp`
23. `20260707000001_drop_material_nome_unique_global`
24. `20260717000000_servico_em_andamento`
25. `20260717000001_documentos_tecnico`
26. `20260718000000_usuario_preferencias`
27. `20260803000000_usuario_telefone_unique`

(+ `migration_lock.toml`)

---

## 9. Variáveis de ambiente (somente nomes de chave)

### `.env.example` (52 chaves ativas)
`NODE_ENV`, `PORT`, `DATABASE_URL`, `DIRECT_URL`, `API_TOKEN`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ALLOWED_ORIGIN`, `PUBLIC_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, `SUPPORT_EMAIL`, `FRONTEND_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_PRO`, `REQUIRE_EMAIL_VERIFICATION`, `RLS_ENABLED`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_STRICT`, `SERVICO_ANDAMENTO_ENABLED`, `DOCUMENTOS_ENABLED`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NOME`, `ADMIN_EMPRESA`, `SENTRY_DSN`, `LOG_LEVEL`, `APP_VERSION`, `GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_TENANT`, `APPLE_CLIENT_ID`, `WHATSAPP_PROVIDER`, `BOT_INSTANCE_NAME`, `SUPER_ADMIN_USERNAME`, `EVOLUTION_HOST`, `EVOLUTION_API_KEY`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_API_VERSION`, `GOOGLE_REVIEWS_ENABLED`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_BUSINESS_VALIDATE_ONLY`, `ANTHROPIC_API_KEY`, `AI_REVIEWS_MODEL`, `REDIS_URL`
Comentada (linha 108): `# WHATSAPP_HABILITADO`

### Chaves no schema Zod (`src/config/env.js`) **ausentes** do `.env.example`
`DATABASE_URL_APP` (`:18`), `EVOLUTION_INSTANCE` (`:50`, legado), `ROLE` (`:100`)

### `.env.staging.example`
`ALLOW_STAGING_WRITES`, `STAGING_REF`, `PROD_HOST_BLOCKLIST`, `DATABASE_URL`, `DIRECT_URL`, `NODE_ENV`, `API_TOKEN`, `JWT_SECRET`, `ENCRYPTION_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `RLS_ENABLED`

### `.env.test.example`
`DATABASE_URL`, `NODE_ENV`, `API_TOKEN`, `JWT_SECRET`

Nenhum arquivo `.env` real foi lido; nenhum valor/secret foi exposto.

---

## Observações factuais notáveis (sem juízo de valor)

- `routes/documentos.js` é o único router autenticado **sem** `senhaProvisoria` (`:32`).
- `GET /api/ponto/selfie/:arquivo` (tecnicos.js:639) e `POST/GET /api/ponto/*` (`:571`, `:626`) não usam `requirePermissao` no pipeline — a checagem é dentro do handler.
- Todo o inbox de notificações (`admin.js:44-148`) roda sem permissão de módulo, escopado só por `req.user.id`.
- `adminOnly` (baseado em `Usuario.admin`, campo legado) ainda é usado em 3 pontos: `billing.js:18`, `billing.js:29`, `admin.js:451`.
- Existe um segundo schema Prisma para dev SQLite: `prisma/schema.sqlite.prisma` (gerado por `prisma/sqlite-schema.mjs`).
