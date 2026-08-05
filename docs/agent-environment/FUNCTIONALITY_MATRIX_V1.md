# Functionality Matrix v1 — AdmAi

**Data:** 2026-08-04 · **Commit-base:** `e98425a` (branch `fix/seguranca-criticos`)
**Propósito:** inventário funcional da plataforma, produzido na missão "Project Baseline v1"
como ponto de partida da próxima frente (Funcionalidades). Não é uma auditoria de bugs nova —
cruza o que já existe em `docs/BUGLIST.md` (diagnóstico de 2026-07-07, majoritariamente
resolvido) e no `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md` (16 itens Categoria C)
com o inventário real de rotas/páginas lido diretamente do código nesta execução. Nenhuma
funcionalidade nova foi implementada ou modificada para produzir este documento.

**Legenda de cobertura de teste:** Sim = arquivo de teste dedicado encontrado · Parcial = teste
indireto/parcial encontrado · Não = nenhum teste dedicado encontrado (não significa
necessariamente sem cobertura de integração ponta-a-ponta, que testa vários módulos juntos).

**Legenda de criticidade:** avaliação técnica objetiva pela superfície tocada (autenticação,
dinheiro, dados pessoais, isolamento multi-tenant), não uma decisão de produto/priorização de
roadmap — essa cabe ao usuário na próxima frente.

---

## Matriz por módulo

| Módulo | Rotas backend | Páginas frontend | Cobertura de teste | Bugs/leads conhecidos | Criticidade |
|---|---|---|---|---|---|
| Auth / Login / 2FA / Recuperação | `routes/auth.js` | `Login.jsx`, `MagicLink.jsx`, `RecuperarSenha.jsx`, `TrocarSenha.jsx`, `VerificarEmail.jsx`, `ConviteAceitar.jsx` | Sim (`services/auth.test.js`, `otp.test.js`, `totp.test.js`; integração `auth.test.js`, `conta_2fa_bruteforce.test.js`, `recuperacao_2fa.test.js`) | BUGLIST L1: OTP de telefone é soft/opcional — decisão de produto já aceita, documentada, não é bug. Backlog Categoria C item 11 (rate limit não conta 200 não-finais) e item 12 (enumeração via 409 em `/auth/register`) tocam este módulo | Crítico |
| Conta / Perfil / Exclusão | `routes/account.js` | `Perfil.jsx`, `PerfilTecnico.jsx`, `Seguranca.jsx`, `MeuPainel.jsx` | Parcial (`services/senha.test.js`, `confirmacaoExclusaoConta.test.js`; integração `autoexclusao_conta.test.js`, `troca_email_confirmacao.test.js`) | Nenhum aberto conhecido | Alto (exclusão de conta é irreversível, dados pessoais) |
| Ordens de Serviço | `routes/servicos.js` | `Servicos.jsx`, `NovoServico.jsx`, `NovoServicoFuncionario.jsx`, `MeusServicos.jsx` | Parcial (sem teste unitário dedicado de `services/servico.js` encontrado; integração `servicos_keyset.test.js`, `servico_atual.test.js`) | BUGLIST L4 (perf): paginação com `take:10000` em JS em vez de no banco — ainda marcado "a verificar", não confirmado corrigido nesta missão | Alto (núcleo do negócio) |
| Técnicos / Funcionários / Ponto | `routes/tecnicos.js` | `Tecnicos.jsx`, `NovoTecnico.jsx`, `MeuPonto.jsx` | Sim (`services/ponto.test.js`; integração `e2e_rbac_ponto.test.js`, `tecnico_criacao.test.js`) | BUGLIST L3: selfie/geo no ponto são evidenciais (opcionais), não obrigatórios — decisão de produto já aceita. Backlog Categoria C item 2 (`/uploads` estático sem auth/escopo de tenant — selfies do ponto) e item 7 (`credenciais.js` aceita papel `dono` sem validar) tocam este módulo | Alto (geolocalização/selfie = dados pessoais sensíveis) |
| Estoque / Catálogo | `routes/estoque.js` | `Estoque.jsx`, `Catalogo.jsx`, `CatalogoModais.jsx` | Sim (`services/estoque.test.js`, `services/catalogo.test.js`) | Nenhum aberto conhecido | Médio |
| Financeiro / Billing (Stripe) | `routes/billing.js` | (sem página dedicada — surfaced via `Configuracao.jsx`/`Mais.jsx`) | Sim (`routes/__tests__/billing.test.js`, `services/billing.test.js`; integração `billing_google_auth.test.js`) | Backlog Categoria C item 4 (abuso de cadastro em massa, EV-057, risco residual aceito) | Crítico (pagamento) |
| Documentos | `routes/documentos.js` | `Documentos.jsx` | Sim (`pages/__tests__/Documentos.test.jsx` + `.axe.jsx`; integração `documentos.test.js`) | Backlog Categoria C item 2 (`/uploads` sem auth/escopo — se aplicável a uploads de documentos, não só selfies) | Alto (arquivos de cliente/tenant) |
| WhatsApp / Chatbot | `routes/whatsapp.js` | `ConfiguracaoBot.jsx` | Parcial (`services/parser.test.js`; integração `inbound_numero_unico.test.js`; sem teste dedicado de rota) | 1 TODO real (`services/whatsapp/cloud-gateway.js:127`, migração para Cloud API pendente, só texto tratado). `ConfiguracaoBotLegado` em `ConfiguracaoBot.jsx:82` **não é código morto** — feature "Em breve" parqueada de propósito (confirmado em `docs/BUGLIST.md` item L8), apesar do aviso do ESLint | Médio |
| Google Integration (OAuth/Reviews) | `routes/google.js` | (usado dentro de `Configuracao.jsx`/fluxo de login) | Parcial (`services/oauth.test.js`; integração `billing_google_auth.test.js`) | BUGLIST B1/B3 (prefixo de rota duplicado, RBAC ausente) — marcados corrigidos em 2026-07 (`78bf6b3`/`62e023b`), não re-verificados nesta missão (fora do escopo de segurança) | Médio |
| Admin: Usuários / Permissões (RBAC) | `routes/admin.js` | `Usuarios.jsx` | Sim (`services/permissoes.test.js`; integração `rbac_privilege_escalation.test.js`, `idor.test.js`) | Nenhum aberto conhecido (EV-060/061 corrigidos) | Crítico |
| Admin: Notificações | `routes/admin.js` (sub-rotas) | `Notificacoes.jsx` | Não (nenhum teste dedicado encontrado na amostra) | Nenhum conhecido | Baixo |
| Configurações (empresa) | `routes/admin.js` (`/config/empresa`) | `Configuracao.jsx` | Parcial (sem teste de rota dedicado confirmado) | Nenhum conhecido | Médio |
| Dashboard / Relatórios / Repartição | `routes/servicos.js` (`/dashboard`, `/gestor/indicadores`), `routes/estoque.js:261` (`/relatorio/pdf`) | `Dashboard.jsx`, `DashboardParts.jsx`, `DashboardWidgets.jsx`, `DashboardWidgetsOps.jsx`, `GestorHome.jsx`, `Reparticao.jsx` | Parcial (`pages/__tests__/Dashboard*.test.jsx`; integração `dashboard_groupby.test.js`, `gestor_indicadores.test.js`; **sem teste dedicado encontrado para `services/relatorio.js`**, que serve o PDF de repartição) | BUGLIST L4 (perf de agregação, mesma raiz do módulo Ordens de Serviço) | Alto (dados financeiros agregados) |
| Aprovações | `routes/servicos.js` (`/servicos/pendentes`) | `Aprovacoes.jsx` | Sim (`pages/__tests__/Aprovacoes.test.jsx`) | BUGLIST L6: fluxo de mutação já confirmado pessimista (não otimista) — refutado como bug | Médio |
| Avaliações | `routes/servicos.js` (`/avaliacoes*`), `routes/google.js` | `Avaliacoes.jsx` | Sim (`services/avaliacao.test.js`) | BUGLIST L4: `/avaliacoes` sem `take` no banco — mesma pendência de performance, "a verificar" | Baixo |
| LGPD / Privacidade / Compliance | `routes/admin.js` (`/lgpd/anonimizar-cliente`) | `Privacidade.jsx`, `Cookies.jsx`, `Termos.jsx` | Sim (integração `lgpd.test.js`) | `docs/GO_LIVE_CHECKLIST.md` FASE B: textos legais ainda são placeholders/modelo, pendente revisão jurídica antes do lançamento — decisão de produto, não bug técnico | Alto (compliance legal) |
| Mobile (Capacitor/Android) | n/a (consome a mesma API) | app inteiro via `capacitor.config.json` | Não | BUGLIST L2: captura mobile (câmera/geolocalização via WebView, cookie de refresh) só testável em device real Android — nunca confirmado nesta linha de diagnóstico nem nesta missão | Médio |
| Marketing / Público | n/a | `Landing.jsx`, `Ajuda.jsx` | Não | Nenhum conhecido | Baixo |
| Observabilidade/Resiliência (transversal) | `config/sentry.js`, `config/metrics.js`, `utils/` (retry) | n/a | Parcial | BUGLIST L5 (Sentry DSN vazio em cenário observado, sem handler global `unhandledrejection`) e Nota A (Redis indisponível trava toda `/api` em vez de degradar) — ambos "a verificar", não confirmados nesta missão | Médio (afeta diagnóstico de incidentes, não é uma falha funcional direta) |

---

## Observações gerais

- **`docs/BUGLIST.md`** é um diagnóstico datado de 2026-07-07 ("Fase 0"), anterior a toda a
  Frente de Segurança desta sessão. Os 8 bugs P1/P2 nomeados (B1-B8) estão todos marcados
  "🔧 corrigido" com commit próprio — não foram reabertos ou re-verificados nesta missão
  (fora do mandato: esta é uma missão de consolidação, não uma nova auditoria). As 8 "leads
  estáticas" (L1-L8) têm status misto: 2 corrigidas, 2 refutadas/aceitas como decisão de
  produto, 3 ainda "a verificar" (L2 mobile, L4 perf, L5 observabilidade) — nenhuma
  investigada a fundo nesta execução.
- Curiosidade encontrada ao cruzar evidências: a linha de reconciliação do próprio
  `BUGLIST.md` (item 1) marca `ipKeyGenerator(req,res)` como "🟢 já aplicado" (considerado
  correto) em 2026-07 — a Frente de Segurança desta sessão (EV-070) provou, com reprodução
  real, que essa exata chamada estava incorreta e a corrigiu em 2026-08-04. Isso não é uma
  falha de processo grave (o diagnóstico original só confirmou que a app subia sem warning,
  não que a chave de rate-limit funcionava por IP) — mas é uma evidência concreta de que
  `BUGLIST.md` deve ser lido como registro histórico, não como verdade atual.
- Nenhuma prioridade de roadmap foi atribuída — a coluna "Criticidade" é técnica (superfície
  de risco), não substitui a priorização de produto que o usuário fará ao abrir a Frente de
  Funcionalidades.
