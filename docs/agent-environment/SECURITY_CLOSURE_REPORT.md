# Security Closure Report — AdmAi (chaveiro-bot + chaveiro-painel)

**Branch:** `fix/seguranca-criticos` · **HEAD nesta execução:** `f6ba6d1` · **Missão:** "Security Closure Operation" (continuação de "Security Closure Review", que concluiu Opção B).

Metodologia: Evidence Driven Execution. Nenhuma conclusão abaixo se apoia em relatório anterior sem revalidação nesta execução ou re-verificação direta do orquestrador. Codex esteve indisponível durante toda esta missão (limite de uso até 2026-08-08); decisões técnicas materiais foram resolvidas diretamente com o usuário.

---

## 1. Resumo executivo

Esta missão implementou 8 correções (Waves 0-2: fix de CI, EV-056, EV-057 + constraint de schema, cancelamento de T-REC-02, CSP, Android, `SECURITY.md`) que fechavam os itens deixados como risco residual pela missão anterior, e então rodou 5 auditorias independentes (qualidade de testes, cobertura, dependências, verificação de implementação, red team) para determinar se a frente pode ser encerrada.

**As correções implementadas foram verificadas como corretas** — pelo orquestrador diretamente e por um agente de verificação dedicado (Agente 4), com CI real confirmando cada wave.

**A auditoria encontrou 1 vulnerabilidade nova e real, não conhecida antes desta execução**: escalonamento de privilégio lateral em `POST /usuarios` e `POST /usuarios/convidar` (`chaveiro-bot/src/routes/admin.js`) — um `gestor` com a permissão `usuarios.editar` (concedida via override pelo dono; não é o preset padrão) pode criar ou convidar outros usuários `gestor` (papel igual ao seu, não superior), e propagar a mesma permissão `usuarios.editar` para essas novas contas. O próprio código já tem uma função (`podeAtribuirPapel`, em `services/permissoes.js`) desenhada exatamente para impedir isso — usada em `tecnicos.js`, mas nunca chamada em `admin.js`. Confirmado por leitura direta do código pelo orquestrador (não só pela alegação do Agente 5), incluindo confirmação de que nenhum teste existente cobre esse caso.

Além disso, a auditoria confirmou quantitativamente que a mitigação de EV-057 (`cadastroLimiter`, Opção A escolhida pelo usuário) **reduz mas não fecha** o abuso de cadastro em massa — cerca de 2.880 trials/dia continuam possíveis de um único IP, sem CAPTCHA. Isso é consistente com a decisão que o usuário tomou conscientemente (aceitar fricção parcial, não uma solução completa), mas precisa continuar registrado como risco aceito, não como "corrigido".

**Parecer final: Opção B — Frente de Segurança NÃO ENCERRADA.** Ver §12.

---

## 2. Inventário da superfície de ataque

Cobertura desta missão + herdada de missões anteriores (não re-auditado onde já não há mudança): autenticação/JWT, RBAC/hierarquia de papéis, isolamento multi-tenant, sessões, billing/Stripe/webhook, TOTP, recuperação por código de backup, credenciais de técnico, upload/storage, SQL/RCE/eval, SSRF, frontend (XSS/CSRF/CSP/config), Android, dependências (bot + painel), CI/CD, qualidade e cobertura de testes.

---

## 3. Vulnerabilidades encontradas

### 3.1 NOVA — Escalonamento de privilégio lateral em `admin.js` (não corrigida)

- **Onde:** `chaveiro-bot/src/routes/admin.js:220` (`POST /usuarios`) e `:379` (`POST /usuarios/convidar`).
- **Causa raiz:** o guard nas duas rotas só bloqueia `papel === 'dono'`:
  ```js
  if (papel === 'dono' && req.user.papel !== 'dono' && !req.user.admin) { ... 403 ... }
  ```
  Isso impede promoção ao topo da hierarquia, mas não usa `podeAtribuirPapel(ator, papelPretendido)` (`chaveiro-bot/src/services/permissoes.js:222-231`), que já existe no código, tem docstring explícita ("Fecha a escalada em que um ator com `usuarios.editar` cria uma conta de papel igual ou superior ao dele") e é usada em `chaveiro-bot/src/routes/tecnicos.js:306` — mas não em `admin.js`.
- **Pré-condição:** o `PRESET_GESTOR` (`services/permissoes.js:76-88`) tem `usuarios: { ver: false, editar: false }` por padrão — "só o dono gerencia contas". A vulnerabilidade só é alcançável se o dono já tiver concedido `usuarios.editar:true` a um `gestor` específico via override (`Usuario.permissoes`), uma decisão administrativa explícita, não o estado padrão de nenhuma conta.
- **Impacto, uma vez atingida a pré-condição:** esse `gestor` pode (a) criar/convidar quantas contas `gestor` (papel igual ao seu, não superior) quiser, sem limite; (b) propagar `usuarios.editar:true` para essas novas contas — confirmado lendo `limitarPermissoesAoAtor` (`permissoes.js:154-176`), que só impede exceder o teto do próprio ator, não impede replicar lateralmente. Isso cria uma cadeia não controlada de contas "quase-admin" que o dono nunca autorizou individualmente.
- **Severidade:** Média-Alta (CWE-269, escalonamento de privilégio horizontal). Não chega ao papel `dono`; exige uma concessão administrativa prévia não-padrão.
- **Confirmado por:** leitura direta do orquestrador de `admin.js` (as 2 rotas), `permissoes.js` (`podeAtribuirPapel`, `PRESET_GESTOR`, `limitarPermissoesAoAtor`), `tecnicos.js:306` (onde a função É usada corretamente), e `test/integration/rbac_privilege_escalation.test.js` (confirmado que só cobre "gestor tenta criar/convidar **dono**" — nunca "gestor cria/convida **gestor**"). PoC do Agente 5 (script Node usando as funções reais de `permissoes.js`, não uma reimplementação) reproduziu a lacuna lógica; não foi possível confirmar via HTTP real nesta worktree (sem Postgres).
- **Correção proposta (não implementada — fora do escopo autorizado desta missão):** chamar `podeAtribuirPapel(req.user, papel)` nas duas rotas, análogo ao já feito em `tecnicos.js`, retornando 403 quando falso.
- **Registrado no plano como:** EV-060, item 30 da Discovery Queue (ver `EOS_SECURITY_CLOSURE_V2_PLAN.md`).

### 3.2 Reconfirmadas do ciclo anterior (nenhuma corrigida nesta missão, ambas já aceitas como risco residual pelo usuário no fechamento do Gate 4 — EV-058)

- **EV-057 residual — abuso de cadastro em massa, quantificado:** mesmo com `cadastroLimiter` (Wave 1), um único IP ainda consegue **30 cadastros/15min → 2.880 trials/dia**, sem CAPTCHA em nenhum ponto do projeto (confirmado por grep). O limiter é mitigação parcial (Opção A, decisão consciente do usuário), não fechamento da lacuna — deve continuar rotulado como risco aceito, não como "corrigido". EV-056, por outro lado, **fecha de fato** a lacuna (ver §5).

---

## 4. Vulnerabilidades descartadas (investigadas e refutadas nesta execução)

- **Open redirect via `react-router-dom` em `Notificacoes.jsx:111`** (`navigate(aviso.link)`): o Agente 3 apontou como "vetor mais plausível". Investigação direta (orquestrador, depois reconfirmada independentemente pelo Agente 5): `Notificacao.link` só é gravado com 2 valores hardcoded em todo o backend — `'/estoque'` (`services/notificacao.js:98`) e `'/'` (`services/agendador.js:142`). Não há nenhum caminho de criação de `Notificacao` com `link` vindo de input de cliente. **Não explorável hoje** através deste sink específico — a CVE do pacote continua real (ver §9), só este caminho de exploração foi refutado.
- **"`billing.js`/`google.js` sem nenhum teste"** (alegação inicial do Agente 1): factualmente incorreta — existem arquivos de teste reais (`routes/__tests__/billing.test.js`, `services/__tests__/billing.test.js`, `services/google/__tests__/*`). Corrigido pelo Agente 5: os testes existem, mas mockam a validação HMAC e nunca montam o router real via HTTP — a preocupação de fundo (proteção de auth/webhook nunca exercitada empiricamente) continua válida, só a alegação literal "zero testes" era falsa.
- **EV-056 — tentativas adicionais de bypass**: colisão com `gerarCodigos` (protegida por rodar dentro de `$transaction`), side-channel de timing entre "código errado" e "perdeu a corrida" (sem diferença mensurável de operações, sob rate limit de 5/15min). Nenhuma quebrou o fix.
- **Billing/webhook Stripe**: HMAC (`stripe.webhooks.constructEvent`) e idempotência (`marcarSeNovo`, `SET NX` no Redis) sem bypass encontrado por leitura direta (Agente 5).

---

## 5. Riscos aceitos (pelo usuário, com evidência)

| Risco | Decisão | Onde registrado |
|---|---|---|
| Token de acesso em `localStorage` (painel) | Aceito, mitigado parcialmente por CSP + refresh `httpOnly` | `SECURITY.md` §"Riscos aceitos" (novo, Wave 2), D-05 |
| `cadastroLimiter` não fecha abuso de cadastro em escala (2.880/dia/IP) | Aceito (Opção A) | EV-058, EV-057, este relatório §3.2 |
| Migration `Usuario.telefone @unique` não validada contra dados reais | Aceito, com query de auditoria documentada pré-deploy | Commit `27ce4a9` |
| `react-router`/`react-router-dom` com 2 CVEs moderadas, upgrade major pendente (`T-DEPS-01`) | Aceito, não é must-fix urgente (sink real não encontrado) mas segue não executado | EV-030, D-06, T-DEPS-01 |
| 9 das 11 vulnerabilidades de dependência do painel (Capacitor/Android build toolchain) | Aceito — rastreadas até a chamada real, não exploráveis no pipeline atual | §9 abaixo |

---

## 6. Riscos mitigados nesta missão

- **EV-056** (race condition em `codigosRecuperacao.js`) — **fechada de verdade**, confirmada por revisão adversarial dedicada sem conseguir reabri-la.
- Job de CI `codex-policy` estruturalmente quebrado — corrigido.
- `T-REC-02` — confirmado redundante (proteção já existia via prefix-match), formalizado com teste de regressão.
- CSP `unsafe-inline` em `script-src` (painel) — removido.
- `android:allowBackup=true` — desabilitado.
- Token em `localStorage` — formalmente documentado como risco aceito (antes só decidido, não escrito).

---

## 7. Cobertura dos módulos críticos (Agente 2)

Medição real (`npx vitest run --coverage`, HEAD `f6ba6d1`). Piso já decidido em `T-CI-01`/D-07: **80% statements / 75% branches / 80% functions / 80% lines**.

| Módulo | Stmts | Branch | Funcs | Lines | Passa hoje? |
|---|---|---|---|---|---|
| `middlewares/rateLimiters.js` | 97.7% | 87.5% | 92.3% | 97.2% | ✅ único que passa |
| `services/auth.js` | 80.0% | 100% | 62.5% | 75.0% | ❌ (funcs e lines abaixo) |
| `services/codigosRecuperacao.js` | 52.6% | 71.4% | 16.7% | 55.6% | ❌ |
| `services/billing.js` | 55.0% | 38.9% | 50.0% | 66.7% | ❌ |
| `routes/billing.js` | 20.3% | 9.6% | 14.3% | 20.5% | ❌ |
| `middlewares/auth.js` | 5.0% | 0.0% | 16.7% | 5.9% | ❌ — praticamente sem cobertura unitária |

**Ressalva metodológica importante**: esta medição é só de testes unitários (`vitest run`, sem Postgres). Rotas/middlewares primariamente exercitados via `test/integration/*` (que exige Postgres, indisponível nesta worktree) aparecem artificialmente baixos aqui — não significa necessariamente "sem cobertura nenhuma", significa "sem cobertura unitária isolada". Ainda assim, é a mesma medição que o step "Testes unitários + cobertura" do CI usa — os números acima são o que o gate `T-CI-01`, se ativado hoje, veria.

Lacunas nomeadas mais graves: `routes/billing.js` — 4 dos 5 `case` do webhook Stripe (`customer.subscription.updated/deleted`, `invoice.payment_succeeded/failed`) 100% descobertos; `services/auth.js` — as 3 funções de refresh token 100% descobertas; `middlewares/auth.js` — `requireAuth` inteira não exercitada por teste unitário.

---

## 8. Auditoria de testes (Agente 1)

| Arquivo | Veredito |
|---|---|
| `test/integration/lgpd.test.js` | Parcialmente seguro — lógica de anonimização e isolamento de tenant bem testados; rota (`adminOnly`) nunca testada sem token/sem permissão |
| `test/integration/troca_email_confirmacao.test.js` | Seguro — inclui teste adversarial real (token forjado com `sub` de outro usuário, rejeitado) |
| `src/services/__tests__/auth.test.js` | Seguro — 100% das funções exportadas, JWT real em todos os testes, testes de confusão de tipo |
| `src/middlewares/__tests__/rateLimiters.test.js` | Parcialmente seguro — `cadastroLimiter` bem testado isoladamente, mas nenhum teste prova que está de fato montado no `app.js` real (só Express sintético) |

**Lista mestra — rotas protegidas sem par de teste 401 (sem token) + 403 (role/tenant insuficiente):**
- `routes/billing.js` — **nenhum teste, nem positivo nem negativo**
- `routes/google.js` — **nenhum teste, nem positivo nem negativo**
- `routes/whatsapp.js` — protegida, sem teste de negação
- `routes/estoque.js` — protegida, sem teste de negação
- `routes/admin.js:418` (`/lgpd/anonimizar-cliente`) — nunca testada sem token/permissão, apesar de `lgpd.test.js` exercitar a lógica de negócio

---

## 9. Auditoria de dependências (Agente 3, confirmado pelo orquestrador)

`chaveiro-painel`: 11 vulnerabilidades no `npm audit` completo (1 crítica, 6 altas, 4 moderadas).

| Classificação | Pacotes | Veredito |
|---|---|---|
| Nunca invocado no pipeline deste projeto (rastreado até a chamada real) | `tar`, `@capacitor/cli` (nested 5.7.8), `minimatch`/`replace`, `uuid`/`xcode` (caminho iOS, projeto é Android-only) | Aceitar-e-documentar |
| Dev-only, usado de fato mas só manualmente/local (`npm run cap:assets`, nunca em CI) | `sharp`, `@trapezedev/project`, `@capacitor/assets` | Aceitar-e-documentar |
| Runtime, chega ao bundle de produção | `react-router`, `react-router-dom` (6.30.4, faixa vulnerável) | **Must-fix** (upgrade major para 7.x, `T-DEPS-01`, ainda não executado — decisão material de escopo maior, fora desta missão) |

`chaveiro-bot`: 0 vulnerabilidades (confirmado, `npm audit` completo).

---

## 10. Verificação de implementação (Agente 4)

Todos os 8 itens (Waves 0-2) confirmados batendo exatamente com o spec técnico, sem desvio — commits revisados individualmente (`git show --stat`+conteúdo), testes rerodados isoladamente, builds reconfirmados. Ver `EOS_SECURITY_CLOSURE_V2_PLAN.md` EV-059 para o detalhe completo por commit.

---

## 11. Revisão adversarial (Agente 5 + orquestrador)

- Tentou reabrir EV-056: não conseguiu.
- Quantificou EV-057 como mitigação parcial (não fechamento) — 2.880 trials/dia/IP.
- Reatacou RBAC, multi-tenant, billing/webhook: encontrou o achado novo do §3.1; não encontrou vazamento vivo em multi-tenant (mas sinalizou 6 modelos com `empresaId` fora do `MODELOS_ESCOPADOS` como "landmine" arquitetural, sem exploit confirmado hoje); confirmou HMAC/idempotência de billing sem bypass.
- Invalidou parcialmente 2 alegações de outros agentes (ver §4) — processo de revisão cruzada funcionou como pretendido.

---

## 12. Métricas finais

- Testes unitários (`chaveiro-bot`): 368/368 verdes.
- Lint: 0 erros (`chaveiro-bot` 6 warnings pré-existentes; `chaveiro-painel` 12 warnings pré-existentes).
- Typecheck: limpo.
- Build painel: limpo.
- CI real: verde em todas as 3 waves (`c805792`, `b7f98d6`, `f6ba6d1`), incluindo `backend`, `frontend`, `codex-policy`, `docker-build`, testes de integração com Postgres real, drift de migration.
- Dependências `chaveiro-bot`: 0 vulnerabilidades. `chaveiro-painel`: 2 must-fix (runtime, não implementadas), 9 aceitas-documentadas.
- Vulnerabilidade nova encontrada nesta missão: 1 (média-alta, não corrigida).

---

## 13. Parecer Final

## Opção B — Frente de Segurança NÃO ENCERRADA

Evidências bloqueantes, cada uma com causa raiz e tarefa objetiva:

1. **Escalonamento de privilégio lateral em `admin.js`** (§3.1) — achado novo, não corrigido. Causa raiz: `POST /usuarios` e `POST /usuarios/convidar` não chamam `podeAtribuirPapel` (função já existe, já usada em `tecnicos.js`). Tarefa objetiva: adicionar a chamada nas 2 rotas + teste cobrindo "gestor cria/convida gestor" — decisão do usuário se entra numa próxima onda de correção ou é aceita como risco residual como EV-056/057 foram.
2. **`billing.js`/`google.js` sem nenhum teste, positivo ou negativo** (§8) — nenhuma rota protegida dessas 2 áreas tem prova empírica de que `requireAuth`/`adminOnly` funcionam em runtime real. Tarefa objetiva: pelo menos 1 teste de integração por rota confirmando 401 sem token.
3. **5 de 6 módulos prioritários falham o piso já decidido de `T-CI-01`** (§7), incluindo `middlewares/auth.js` com cobertura unitária praticamente zero. Tarefa objetiva: elevar cobertura ou formalizar que `T-CI-01` ainda não está em vigor (decisão do usuário sobre quando ativar o gate).
4. **`react-router`/`react-router-dom` com CVEs em runtime de produção, upgrade não executado** (§9, `T-DEPS-01`). Tarefa objetiva: executar o upgrade major (6.x→7.x) já planejado.
5. **`cadastroLimiter` reduz mas não fecha o abuso de cadastro** (§3.2, já aceito como risco pelo usuário, mas deve permanecer explicitamente rotulado como parcial, não resolvido).
6. **Migration de `Usuario.telefone` não validada contra dados reais** (ambiental, sem Postgres nesta worktree) — precisa rodar a query de auditoria de duplicatas antes de qualquer deploy com dados existentes.

Nenhuma dessas evidências foi descoberta como bug introduzido pelas correções desta missão — item 1 é uma lacuna pré-existente descoberta por revisão adversarial mais profunda; itens 2-6 são lacunas de verificação/dependência já conhecidas ou herdadas, agora quantificadas com mais precisão.
