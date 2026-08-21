# 00 — Mapa de Dependências

Dependências reais entre módulos, e os pontos onde uma mudança funcional **inevitavelmente**
atinge outro módulo. Serve para a seção 23 de cada rodada e para detectar risco de duplicar
funcionalidade ou criar dois conceitos para a mesma entidade.

Tudo abaixo é `[EVIDÊNCIA DO REPOSITÓRIO]`, verificado por leitura direta do código nesta
abertura de sessão (relatórios completos em `evidence/ROUND-00-*`), salvo onde marcado
diferente.

---

## 1. Pontos de acoplamento estrutural (mudar aqui atinge tudo)

| Ponto | Arquivo | Por que é transversal |
|---|---|---|
| **RBAC — definição** | `chaveiro-bot/src/services/permissoes.js` | Fonte única de `MODULOS` (10), `ACOES_POR_MODULO`, `CAPACIDADES_PROPRIO` (5) e `PAPEIS` (`dono`, `gestor`, `funcionario`). Todo módulo novo precisa entrar aqui **e** no preset de gestor/funcionário |
| **RBAC — imposição** | `chaveiro-bot/src/middlewares/auth.js` | `requireAuth` monta `req.user` com `permissoesEfetivas` e injeta `req.db`; `requirePermissao(modulo, acao)` é o gate por endpoint |
| **Navegação do painel** | `chaveiro-painel/src/config/navigation.js` | Manifesto por papel, fonte única de `BottomNav`, `Sidebar` e `Mais`. `MAX_PRIMARY = 4`; item sem permissão **some** (não fica desabilitado). Funcionalidade nova sem entrada aqui é inalcançável na navegação |
| **Escopo multi-tenant** | `chaveiro-bot/src/db/tenant.js` | `MODELOS_ESCOPADOS` (9 models) recebe `empresaId` automático e converte `findUnique`→`findFirst`. Model novo de negócio fora dessa lista não é escopado automaticamente |
| **Cliente HTTP do painel** | `chaveiro-painel/src/lib/api.js` | Instância axios única; interceptor trata 401 (refresh dedupado), 403 `senha_provisoria` e 403 `email_nao_verificado`. Todo novo código de erro do backend precisa ser previsto aqui |
| **Sessão do cliente** | `chaveiro-painel/src/contexts/AuthContext.jsx` | Token em `localStorage`, refresh em cookie HttpOnly, permissões via `GET /me/permissoes`. Não há renovação proativa — só reativa no 401 |
| **Agendador** | `chaveiro-bot/src/services/agendador.js` | Quatro crons com lock Redis (resumo semanal, avaliações, retenção LGPD, sync Google). Qualquer rotina periódica nova entra aqui |
| **Auditoria** | `chaveiro-bot/src/services/auditoria.js` + model `AuditLog` | Registro de ação privilegiada com `antes`/`depois`/`ip` |

---

## 2. Dependências funcionais confirmadas

### Serviço → Comissão → Estoque → Avaliação
`Servico.status` (`ativo` | `pendente` | `rejeitado` | `em_andamento`) governa efeitos colaterais:

- Agregações de dinheiro filtram `status:'ativo'` (dashboard, `/tecnicos`, perfil do técnico,
  relatório PDF) — `docs/decisions.md:61-64`.
- Serviço `pendente` **não** gera comissão nem baixa estoque; os efeitos ocorrem **na
  aprovação** (`Servico.aprovadoPor`/`aprovadoEm`).
- Baixa de estoque grava `MovimentacaoEstoque` com `saldoApos` (histórico auditável).
- Conclusão do serviço agenda `Avaliacao` (`servicoId @unique` — uma por serviço).
- O toggle por empresa é `Empresa.aprovacaoServico`.

**Consequência:** qualquer mudança em status de serviço atinge, no mínimo, dashboard, relatório
PDF, comissões, estoque, aprovações e avaliações.

### Ponto → Banco de horas → Dados pessoais
- `BatidaPonto` (prova por batida: `tipo`, `em`, `lat`/`lng`/`precisao`, `selfieUrl`, `origem`)
  agrega em `RegistroPonto` (`@@unique([tecnicoId, data])`).
- Funcionário vê **as batidas do dia**, não o banco de horas — `docs/decisions.md:40-41`.
- Selfie e geolocalização são dados pessoais de funcionário **sem política de retenção**
  (`docs/decisions.md:84-102`).
- Captura usa **APIs web** (`getUserMedia`, `navigator.geolocation`), não plugins Capacitor —
  não há `@capacitor/camera` nem `@capacitor/geolocation` no painel.

### Técnico ↔ Usuário
- `Tecnico.usuarioId @unique` — todo técnico vira usuário com papel `funcionario`.
- Login por telefone + PIN provisório, com troca forçada no 1º acesso (`senhaProvisoria` prende
  a navegação em `/trocar-senha`, tanto no backend quanto no `RequireAuth`).
- `@@unique([empresaId, telefone])` no técnico; `Usuario.telefone @unique` global.
- Self-scope do funcionário sempre derivado de `req.user.tecnicoId`, nunca de input do cliente.

### Empresa (tenant) → tudo
Todo dado de negócio referencia `empresaId`. `Empresa.ativo` e `Assinatura` (Stripe, trial de 14
dias) governam o acesso comercial.

---

## 3. Funcionalidades atrás de flag de ambiente

Não existe sistema de feature flags — são variáveis de ambiente comparadas à string `'true'`
(`chaveiro-bot/src/config/env.js`). Quando desligada, a rota responde **404**, e o painel
feature-detecta pelo 404/403.

| Flag | Efeito quando off | Consumo |
|---|---|---|
| `SERVICO_ANDAMENTO_ENABLED` | 404 em `/me/servico-atual`, `/servicos/:id/iniciar`, `/servicos/:id/concluir` | `routes/servicos.js:608` |
| `DOCUMENTOS_ENABLED` | 404 em todo `/me/documentos` | `routes/documentos.js:50` |
| `GOOGLE_REVIEWS_ENABLED` | cliente Google vira mock; cron de sync vira no-op | `services/google/businessClient.js:22`, `agendador.js:249` |
| `WHATSAPP_HABILITADO` | webhook responde 200 sem processar nada | `services/inbound.js:48` |
| `RLS_ENABLED` | Row Level Security do banco desligada (defesa em profundidade) | `db/tenant.js:64` |
| `REQUIRE_EMAIL_VERIFICATION` | gate de e-mail verificado desligado | `middlewares/auth.js:33` |
| `ROLE` | ausente = monolito; `web` não sobe workers nem cron | `server.js:28` |

`[PENDENTE]` O valor efetivo de cada flag **na produção real** (Railway) não é verificável a
partir do repositório — ver Q-002 em `00_OPEN_QUESTIONS.md`.

---

## 4. Integrações externas e o que quebra sem elas

| Integração | Módulos dependentes | Degradação |
|---|---|---|
| Stripe | Billing, `Assinatura`, acesso comercial | Checkout/portal indisponíveis; webhook com HMAC + idempotência |
| Supabase Storage | Documentos do técnico (bucket privado), selfies de ponto | `services/storage.js` tem fallback para disco; `STORAGE_STRICT` altera o comportamento |
| Redis | Rate limiters, filas BullMQ (e-mail, inbound), lock dos crons | Sem Redis, o rate limiter derruba toda `/api` (`docs/BUGLIST.md`, Nota A) |
| Resend | Verificação de e-mail, reset, magic link, convite, onboarding | Circuit breaker em `services/email.js` |
| Google (OAuth + Business Profile + IA) | Login social, avaliações Google, análise por IA | Duas flags separadas (`GOOGLE_REVIEWS_ENABLED`, `GOOGLE_BUSINESS_VALIDATE_ONLY`) |
| WhatsApp (Evolution ou Cloud API) | Bot de registro de serviço, OTP de telefone, solicitação de avaliação | Canal inteiro inerte com `WHATSAPP_HABILITADO` off |
| Sentry / Prometheus | Observabilidade | No-op sem DSN; `/metrics` exposto sem auth |

---

## 5. Assimetrias e riscos de duplicação já identificados

| Observação | Evidência | Por que importa numa frente de funcionalidades |
|---|---|---|
| Só `/configuracao/usuarios` tem guard por permissão no painel; todas as demais rotas internas são apenas autenticadas | `chaveiro-painel/src/App.jsx:329-340` vs. demais rotas | A segregação por papel na UI depende **inteiramente** do manifesto de navegação. Link direto alcança telas que o menu esconde (a autorização real é do backend, mas o estado de tela precisa ser especificado) |
| Duas camadas de design system convivendo | `styles/panel.css` (tokens `--panel-*`, violeta) e Tailwind legado (ciano/grafite), com `styles/panel-rollout.css` remapeando por escopo | Tela nova precisa declarar em qual camada nasce, senão a inconsistência visual cresce |
| Papel `tecnico` **não existe** no RBAC | `services/permissoes.js:55` — `PAPEIS = ['dono','gestor','funcionario']`; `Tecnico.nivelAcesso` é campo de RH livre, não usado no gate | Risco real de criar dois conceitos para a mesma entidade (técnico ≠ papel) |
| `adminOnly` (campo legado `Usuario.admin`) ainda usado em 3 pontos | `routes/billing.js:18`, `:29`, `routes/admin.js:451` | Convivem dois mecanismos de autorização; funcionalidade nova precisa escolher um |
| Inbox de notificações roda sem permissão de módulo (escopo só por `req.user.id`) | `routes/admin.js:44-148` | Notificação nova herda esse modelo por padrão |
| Não existe soft delete em nenhum model | 26 models, nenhum `deletedAt`/`excluidoEm` | Exclusão é real; funcionalidade que precise de histórico pós-exclusão exige decisão de dados |
| `routes/documentos.js` é o único router autenticado sem `senhaProvisoria` | `routes/documentos.js:32` | Assimetria de fluxo de primeiro acesso |

---

## 6. Dependências de processo (não de código)

- **Staging de aplicação não existe — dependência estrutural, agora vinculante.**
  `[DECISÃO DO USUÁRIO]` **DEC-002** tornou a criação e validação de um staging real de aplicação
  pré-requisito obrigatório de qualquer promoção funcional a produção, com a cadeia
  `local → validação local → staging → validação em staging → produção → validação pós-produção`.
  Local não substitui staging.

  Limites da própria decisão, declarados pelo usuário: não criar staging agora, não planejar sua
  implementação agora, **não bloquear a descoberta documental** por sua ausência. O que o gate
  bloqueia é a promoção a produção de qualquer onda de implementação futura — não a especificação.

  Estado atual: existe apenas o projeto Supabase de banco `admai-staging` com kit de validação
  não executado (`docs/db/STAGING_VALIDATION.md`); falta o usuário preencher `.env.staging`.
  Rastreado como linha T-001 em `00_TRACEABILITY_MATRIX.md`.
- **Backup do Supabase de produção não existe** — plano Free não inclui backup nem PITR;
  confirmado no painel do Supabase em 2026-08-05 (`PROJECT_BASELINE_V1.md` §12, Gate 8). Risco de
  perda de dados sem via de recuperação, relevante para qualquer funcionalidade que crie dado
  novo relevante.
- **Textos legais são modelo com `[placeholders]`** — `docs/legal/*`,
  `docs/GO_LIVE_CHECKLIST.md` FASE B. Funcionalidade que colete dado pessoal novo depende deles.
