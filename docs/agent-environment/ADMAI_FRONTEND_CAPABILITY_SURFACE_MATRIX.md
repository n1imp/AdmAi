# ADMAI_FRONTEND_CAPABILITY_SURFACE_MATRIX

Ponte autoritativa entre o **functional baseline** (audit ledger, `FUNCTIONAL_AUDIT_COMPLETE`)
e o **novo frontend** (Refoundation). Fonte: router real (`App.jsx`), routers do bot
(`chaveiro-bot/src/routes/*`), navegação real (`Sidebar.jsx`/`BottomNav.jsx` — manifesto único),
evidência do ledger (tours 0-13). Estados de UI: todos os itens `FEATURE_COMPLETE` provaram
loading/empty/error/persistência nos ciclos 1-3 — ponteiros no ledger; não repetido aqui.

Papéis: `D`=Dono `G`=Gestor `F`=Funcionário. Modo = surface mode ALVO da repaginação
(STANDARD/WIDE/MASTER_DETAIL/WORKSPACE/ANALYTICAL — decisão DDR pendente de Codex, ver
ADMAI_DESIGN_DECISIONS).

## Capabilities × superfícies (MVP 20, scope freeze 1.1.0)

| capability (tipo) | contratos backend (router) | superfícies atuais (rotas) | papéis | job primário do usuário | ação primária | modo alvo |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH_LOGIN (END_USER) | `auth.js`: /auth/login, /auth/refresh, /auth/logout, /auth/magic-link, /auth/recuperar | /login, /magic-link, /recuperar-senha, /redefinir-senha, /trocar-senha | todos | entrar com segurança e recuperar acesso | Entrar | STANDARD (público) |
| AUTH_2FA (END_USER) | `auth.js`+`account.js`: /me/2fa/*, desafio TOTP, recovery codes | etapa 2FA do /login; /configuracao/seguranca | todos | proteger a conta | Verificar código | STANDARD |
| ONBOARDING (END_USER) | `auth.js`: /auth/register, /auth/email/verificar; /convite/:token(+aceitar) | /login (criar conta), /verificar-email, /convite/:token | novo dono; convidado | criar a empresa e começar | Criar conta | STANDARD |
| MULTI_TENANCY (FOUNDATIONAL) | `db/tenant.js` req.db escopado (transversal) | (transversal — sem superfície própria) | — | isolamento invisível e correto | — | — |
| RBAC (ADMIN) | `account.js`: /me/permissoes; matriz/overrides em admin.js | matriz dentro de /configuracao/usuarios | D | dar a cada pessoa o acesso certo | Salvar permissões | STANDARD |
| ADMIN (ADMIN) | `admin.js`: /usuarios (CRUD), /usuarios/convidar, /permissoes/catalogo, config empresa | /configuracao, /configuracao/usuarios, /configuracao/perfil | D | administrar contas e a empresa | Adicionar usuário | STANDARD |
| SERVICOS_CRUD (END_USER) | `servicos.js`: /servicos CRUD+keyset, evidência privada | /servicos, /servicos/novo (D/G); /meus-servicos(+/novo) (F) | D,G,F | registrar e acompanhar serviços | Registrar serviço | WIDE + drawer detalhe |
| APROVACOES (END_USER) | `servicos.js`: fluxo aguardando/aprovar/rejeitar | /aprovacoes | D,G | decidir os serviços pendentes | Aprovar | MASTER_DETAIL (alvo) |
| TECNICOS (END_USER) | `tecnicos.js`: CRUD, /tecnicos/:id(+/ponto) | /tecnicos, /tecnicos/novo, /tecnicos/:id | D,G | gerir a equipe técnica e ver desempenho | Adicionar técnico | WIDE + detail |
| PONTO (END_USER) | `tecnicos.js`/account: /ponto/bater (selfie+geo), visão /tecnicos/:id/ponto | /meu-ponto (F); ponto no perfil do técnico (D,G) | F (bate), D,G (vê) | bater ponto com prova e conferir jornada | Bater ponto | STANDARD mobile-first |
| ESTOQUE (END_USER) | `estoque.js`: materiais, movimentação, mínimos | /materiais, /estoque | D,G | controlar materiais e alertas | Registrar movimentação | WIDE |
| FINANCEIRO (END_USER) | `servicos.js`+`metricas`: repartição, PDF | /reparticao | D | fechar o período e repartir | Calcular / Exportar PDF | WIDE/ANALYTICAL-lite |
| INDICADORES (END_USER) | `metricas.js` consumido por dashboards | / (dashboard D/G), /metricas/* (2 drilldowns), /meu-painel (F) | D,G,F | entender o desempenho agora | (leitura + drill) | ANALYTICAL-lite |
| METRIC_FOUNDATION (FOUNDATIONAL) | `metricas.js`: catálogo/agregado/série/registros (semântica provada R1-R5) | (consumida por INDICADORES/FINANCEIRO) | — | verdade semântica única | — | — |
| APROVACOES já acima · CONFIGURACOES (END_USER) | `admin.js` config empresa; account perfil | /configuracao(+perfil, +estoque→redirect, +catalogo→redirect) | D,(G) | ajustar a empresa e o próprio perfil | Salvar | STANDARD |
| SEGURANCA (END_USER) | `account.js`: senha, sessões, logout-all, exclusão de conta, 2FA | /configuracao/seguranca | todos | proteger e controlar a própria conta | (ação por seção) | STANDARD |
| DOCUMENTOS (END_USER) | `documentos.js`: /me/documentos CRUD (bucket privado, URL assinada) | /meus-documentos (F); /tecnicos/:id docs (D,G) | F,D,G | guardar e abrir documentos | Enviar documento | STANDARD |
| AUDITORIA (ADMIN) | `admin.js`: GET /auditoria keyset + DTO allowlist (fronteira PII ACEITA — não expandir) | /configuracao/auditoria | D | ver quem fez o quê e quando | (consulta + carregar mais) | STANDARD denso |
| OBSERVABILIDADE (OPERATIONAL) | /health, logger estruturado, Sentry, metricsMiddleware | (operador; sem UI de produto) | ops | operar com visibilidade | — | — |
| STAGING (OPERATIONAL) | bootstrap Railway/CF + fixtures | (infra) | ops | ambiente de prova real | — | — |
| SEGURANCA transversal (SEC-HB) | middlewares auth/requirePermissao/rate-limit | (transversal) | — | — | — | — |

Superfícies públicas/legais: `/` Landing (claims só do MVP), `/ajuda`, `/privacidade`, `/termos`,
`/cookies` (conteúdo jurídico = D6/LGPD intocável), `/mais` (hub mobile). `/avaliacoes` e
`/configuracao/whatsapp` e `/configuracao/notificacoes` ficam atrás de flags (diferidas/POST_MVP).
`/assinatura` atrás de `SUBSCRIPTIONS_BILLING` (1.1.0).

## Prioridades por papel (produto real; validado nos tours)

- **Dono**: negócio primeiro — dashboard/indicadores, repartição/financeiro, aprovações, equipe,
  administração (usuários/permissões/auditoria), segurança. Densidade maior aceitável.
- **Gestor**: operação — serviços, aprovações, equipe, estoque, indicadores permitidos (sem
  financeiro sensível conforme matriz). Sem administração.
- **Funcionário**: o dia de trabalho — meu-ponto (mobile-first, uma mão), meus-serviços (+novo),
  meus-documentos, meu-painel. Mínimo de navegação; ações grandes; zero ruído administrativo.

## Journeys transversais (reais, provadas)

1. **Serviço → decisão → dinheiro → métrica**: criar (wizard D/G ou F) → APROVACOES
   (aguardando→aprovado/rejeitado) → FINANCEIRO (repartição do período) → INDICADORES/métricas
   (faturamento-liquido etc.). Invalidação de dados encadeada: mutação de serviço/aprovação
   invalida serviços, aprovações, dashboard, métricas, repartição.
2. **Jornada do funcionário**: login → meu-ponto (consent → selfie → batida) → meus-serviços →
   registrar → acompanhar status próprio.
3. **Administração de pessoas**: criar usuário/convidar → matriz de permissões → efeito real
   de override → auditoria registra → consulta na AUDITORIA.
4. **Documentos**: enviar (F) → armazenar privado → abrir assinado → gestor vê no perfil.

## Grafo de dependência de dados (invalidação para o application layer)

```
create/patch/delete Servico  → servicos, aprovacoes(se status), dashboard, metricas, reparticao
aprovar/rejeitar Servico     → aprovacoes, servicos, dashboard, metricas, reparticao
bater Ponto                  → meu-ponto, tecnicos/:id/ponto, presencaHoje(dashboard G)
movimentar Estoque           → estoque, materiais(saldo), alertas(dashboard)
CRUD Usuario/permissoes      → usuarios, permissoes(self se próprio), auditoria
CRUD Tecnico                 → tecnicos, servicos(nomes), reparticao
config Empresa               → configuracao, (auditoria: nota AUD-NOTE-CONFIG-EMPRESA-SEM-AUDIT)
```
