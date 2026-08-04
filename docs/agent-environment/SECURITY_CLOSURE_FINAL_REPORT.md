# Security Closure Final Report — Superfície Atualmente Exposta

**Branch:** `fix/seguranca-criticos` · **HEAD:** `3901335` · **Missão:** "Security Closure Final" (continuação de "Security Closure Operation" e "EV-060 Remediação").

Metodologia: Evidence Driven Execution. Nada abaixo se apoia em parecer anterior sem revalidação ou evidência nova produzida nesta execução.

---

## Gate 0 — Classificação Obrigatória das Pendências

| Pendência | Categoria | Exploração Atual | Superfície Ativa | Bloqueia Encerramento? | Justificativa |
|---|---|---|---|---|---|
| **Vazamento de dados não-autenticado em `POST /auth/login`** (desambiguação por telefone retorna nomes de empresa + `usuarioId` antes de verificar senha) | **A** | **Sim — confirmada por leitura direta nesta execução** (`auth.js:169-186`) | Sim (rota pública, sempre ativa) | **SIM** | Enumeração de usuário + vazamento de afiliação empresarial sem prova de credencial; não conta no rate limit (`skipSuccessfulRequests:true`) |
| Corrida de aceite duplo em `POST /convite/:token/aceitar` (`findFirst` de `aceitoEm:null` fora de transação) | C | Sim, mas impacto baixo (duplica conta, não escala privilégio — papel já vetado na criação do convite) | Sim (rota pública) | Não | Correção barata (mesmo padrão `updateMany` condicional do EV-056), mas sem urgência de segurança — movida ao backlog |
| `billing.js`/`google.js` sem teste HTTP de `requireAuth`/`adminOnly`/RBAC | B → **RESOLVIDO nesta execução** | N/A | Sim | Não (resolvido) | 11 testes novos (`billing_google_auth.test.js`), CI real: 132/132 |
| Cobertura de testes abaixo do piso de `T-CI-01` em módulos ativos | C (reclassificado) | N/A | Parcial | Não | Por instrução explícita: não perseguir percentual; comportamentos críticos da superfície ativa (auth/RBAC/billing/google) já ganharam teste nesta e nas 2 missões anteriores |
| `react-router`/`react-router-dom` com 2 CVEs conhecidas | C | Sink não alcançável confirmado 2x (auditorias independentes) | Sim (runtime), sem sink ativo | Não | Sem atualização segura disponível (6.30.4 é a última 6.x, ainda vulnerável; fix só via major 7.x, breaking change real) — documentado como risco residual |
| Migration `Usuario.telefone @unique` não validada contra dados reais | **Gate operacional de implantação** | N/A | N/A | Não (não é vulnerabilidade da aplicação) | Precisa da query de auditoria de duplicatas antes de aplicar em qualquer ambiente com dados existentes — já documentado no commit `27ce4a9` |
| TOCTOU em `PATCH`/`DELETE /usuarios/:id` (item 31) | C | **Reproduzida e medida nesta execução** — real, mas não explorável unilateralmente pelo atacante | Sim, mas não unilateral | Não | Depende de ação concorrente de terceiro numa janela de ~15-20ms; backlog |
| Abuso de cadastro em massa (EV-057) — `cadastroLimiter` reduz mas não fecha (~2.880 trials/dia/IP) | C | Já quantificada, decisão arquitetural já tomada pelo usuário (Opção A) | Sim | Não | Não reaberta — mitigação existente + risco residual já aceito (EV-058) |
| Modelos com `empresaId` fora de `MODELOS_ESCOPADOS` (`GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`, `Assinatura`, `ConviteUsuario`, `AuditLog`) | C | Nenhum exploit vivo encontrado em 2 auditorias independentes | Sim | Não | "Landmine" arquitetural — todos os call sites atuais usam `empresaId` explícito; backlog |
| `services/credenciais.js:criarAcessoTecnico` aceita `papel:'dono'` sem validar internamente | C | Não explorável hoje — os 2 únicos chamadores nunca passam `'dono'` | Sim, mas sem call site vulnerável | Não | Defesa em profundidade; backlog |
| `/uploads` estático sem autenticação nem escopo de tenant | C | Sem exploit ativo comprovado hoje; mitigado por nomes UUID não-enumeráveis | Parcial (diretório ativo; principal vetor sensível — fotos do WhatsApp — está com a flag desligada) | Não | Destino histórico/futuro de dado LGPD-sensível (selfies de ponto, fotos de evidência) sem controle de acesso real — backlog de hardening, priorizar se o WhatsApp for reativado |
| CSP `style-src` ainda com `'unsafe-inline'` | C | Sem sumidouro de HTML não sanitizado pra explorar via CSS-only | Sim | Não | Já documentado no próprio código como débito conhecido |
| 9 das 11 vulnerabilidades de dependência do painel (Capacitor/Android build toolchain) | C | Confirmado não exploráveis (rastreado até a chamada real, 2 auditorias) | Não (dev/build-only) | Não | Já classificado, aceitar-documentar |

---

## Superfície de Ataque — Verificação Final (Gate "Revisão Adversarial")

Agente `red-team-attacker` fresco, sem contexto das missões anteriores, atacou ativamente: login/auth/JWT/refresh, 2FA/TOTP/recuperação, as 4 rotas de RBAC do EV-060, isolamento multi-tenant, uploads/downloads, APIs públicas, frontend/CSP, tokens, dependências de runtime.

**Resultado:**
- **RBAC (EV-060)**: sem bypass novo. Percorreu auto-edição de papel, auto-escalada via `permissoes`, omissão do campo `papel` (cai no default do Zod, ainda validado), `admin:true` com `papel` inconsistente — todos bloqueados.
- **Multi-tenant**: sem vazamento vivo — todo uso de `prisma` global fora de `req.db` tem `empresaId` explícito no `where`.
- **2FA/TOTP/recuperação**: sem achado — confirmado empiricamente (não só leitura) que `twoFactorLimiter` cobre `/2fa/recuperar` via prefix-match.
- **Frontend/CSP/tokens**: sem XSS/CSRF explorável; JWT sem confusão de algoritmo; tokens de propósito único checam `tipo` corretamente.
- **APIs públicas**: OAuth (JWKS+aud+iss+nonce) e webhook Stripe (HMAC+idempotência) sólidos.
- **Achado Categoria A** (§ acima): vazamento de dados em `POST /auth/login`.
- **Achado Categoria C**: corrida de aceite duplo de convite; `/uploads` público.

Nenhum SQLi (`$queryRawUnsafe` só no `SET_EMPRESA` parametrizado), RCE, ou SSRF explorável encontrado.

---

## Detalhe do bloqueador Categoria A

**`chaveiro-bot/src/routes/auth.js:169-186`** (`POST /auth/login`, ramo de login por `telefone`):

```js
const candidatos = /* busca por telefone, sem checar senha ainda */;
if (candidatos.length > 1) {
  return res.json({
    desambiguacao: candidatos.map((c) => ({ usuarioId: c.id, empresa: c.empresa?.nome ?? '—' })),
  });
}
```

A checagem de senha (`bcrypt.compare`, linha 202) só roda **depois** deste `return`, e só quando há exatamente 1 candidato. Um atacante que apenas conheça/adivinhe um número de telefone com contas em 2+ empresas — enviando qualquer `password` (só exige `min(1)`) — recebe, **sem provar nenhuma credencial**: confirmação de que o telefone está cadastrado, o nome de todas as empresas associadas, e o `usuarioId` interno de cada uma. Como a resposta é `200` (sucesso), não conta contra `authLimiter`/`authIpLimiter` (`skipSuccessfulRequests:true`), permitindo varrer números sem o throttling agressivo que se aplica a tentativas de senha errada.

**Impacto**: enumeração de usuário + vazamento de afiliação empresarial (CWE-203/CWE-200, OWASP API4:2023/A07:2021). Não é escalonamento de privilégio nem acesso a dados de outra empresa além do nome — mas é informação que nenhum usuário não-autenticado deveria receber.

**Tarefa objetiva necessária** (não implementada nesta missão — decisão de fluxo de autenticação, material, requer aprovação antes de implementar): mover a decisão de desambiguação para **depois** de validar a senha contra os candidatos (ex.: tentar `bcrypt.compare` contra cada candidato; só then, se mais de um bater, ou se a UX exigir escolha prévia, desenhar uma resposta que não vaze nome de empresa sem prova de senha). Isso muda a lógica do fluxo de login multi-empresa por telefone — não é um ajuste de 1 linha, precisa de desenho cuidadoso para não quebrar o caso legítimo de 1 telefone em N empresas.

---

## Security Hardening Backlog

Ver documento separado: `docs/agent-environment/SECURITY_HARDENING_BACKLOG.md`.

---

## Parecer Final

## Opção B — Frente de Segurança NÃO ENCERRADA

**Pendência Categoria A** (bloqueia imediatamente):
- Vazamento de dados não-autenticado em `POST /auth/login` (desambiguação por telefone). Evidência: `auth.js:169-186`, leitura direta confirmada nesta execução. Impacto: enumeração de usuário + afiliação empresarial sem autenticação. Tarefa objetiva: redesenhar o fluxo de desambiguação para exigir prova de senha antes de revelar nomes de empresa/`usuarioId` — decisão de fluxo de auth, precisa de aprovação explícita antes de implementar (não é um ajuste trivial).

**Pendências Categoria B**: nenhuma restante — a única (billing/google) foi resolvida nesta execução com evidência real de CI (11 testes novos, 132/132 passando).

Todas as demais pendências (§Gate 0) pertencem à Categoria C e não bloqueiam — estão listadas no Security Hardening Backlog.

---

## Addendum de Encerramento — Missão "Missão Final — Consolidação e Encerramento Oficial" (2026-08-04)

O parecer acima (Opção B, bloqueado pelo vazamento em `POST /auth/login`) foi historicamente resolvido e depois reavaliado por 3 missões subsequentes nesta mesma sessão:

1. **"EV-063 Remediação"**: o vazamento acima foi corrigido (`autenticarCandidatos`, tempo constante), com 2 rodadas de revisão adversarial independentes. Ver `EV063_REMEDIATION_REPORT.md`.
2. **"Missão Final — Encerramento"**: revalidou EV-056/060/063, mas sua própria revisão adversarial final encontrou um NOVO bloqueador Categoria A — bypass de rate-limit via `trust proxy` (EV-065) — impedindo o encerramento outra vez.
3. **"EV-065 Validation"**: testou o EV-065 diretamente contra a arquitetura REAL de produção (Railway, não a simulação self-hosted usada originalmente) e o **refutou** — 7 requisições HTTP reais contra `https://admai-production.up.railway.app`, decremento monotônico do rate-limit bucket independente de 6 variações de header forjado. Ver `EV065_VALIDATION_REPORT.md`.
4. **Esta missão ("Missão Final — Consolidação e Encerramento Oficial")**: consolidou tudo acima e executou uma última revisão adversarial (Gate 7) com mandato de encontrar qualquer bloqueador Categoria A/B ignorado. Não encontrou nada nos 9 vetores tentados relacionados às correções existentes — **mas encontrou um bloqueador Categoria B novo e independente: EV-067**, ausência de rate limiter dedicado em `POST /me/2fa/ativar`/`POST /me/2fa/desativar` (`chaveiro-bot/src/routes/account.js:443-501`), corroborando um achado já registrado e incompletamente fechado (`EV-027`). Verificado de forma independente pelo orquestrador (leitura direta de `account.js`, `app.js`, `rateLimiters.js`, `EOS_SECURITY_CLOSURE_V2_PLAN.md`) antes de aceitar — não é alegação de sub-agente sem confirmação.

### Parecer Final Atualizado

## Opção B — Frente de Segurança NÃO ENCERRADA

**Pendência Categoria A**: nenhuma. EV-063 corrigido e revalidado; EV-065 refutado por teste direto contra produção real.

**Pendência Categoria B — EV-067** (bloqueia o encerramento):
- **Evidência**: `chaveiro-bot/src/routes/account.js:443-501` — `POST /me/2fa/ativar` e `POST /me/2fa/desativar` verificam só um código TOTP de 6 dígitos, sem rate limiter dedicado (router só aplica `requireAuth`+`senhaProvisoria` globalmente, `account.js:37-38`); `twoFactorLimiter` (`app.js:141-151`) não alcança essas rotas (prefixos diferentes).
- **Impacto**: atacante com sessão JWT válida roubada (não precisa do segredo TOTP) pode martelar `/me/2fa/desativar` limitado só pelo limiter genérico de `/api` (120/min por IP, compartilhado com toda a API) — ao longo de dias, chance real de desativar permanentemente o 2FA da vítima, convertendo um comprometimento temporário (token roubado, expira em 1h sem refresh) em permanente (2FA removido).
- **Causa raiz**: `EV-027` (já registrado, cobria as 3 rotas `/me/2fa/recuperar`+`ativar`+`desativar`) teve seu fechamento (`T-REC-02`) escopado só para `/me/2fa/recuperar` — as outras 2 rotas ficaram sem tarefa de fechamento, gap de rastreamento silencioso, não decisão deliberada. O próprio projeto já estabeleceu o padrão correto para essa classe de ameaça (`exclusaoContaLimiter`, achado F3: "código de 6 dígitos... insuficiente contra brute force" só com o limiter genérico) — esse padrão não foi replicado aqui.
- **Tarefa objetiva necessária para o encerramento**: criar um rate limiter dedicado (chave por `req.user.id`, mesmo padrão de `exclusaoContaLimiter`) e aplicá-lo a `POST /me/2fa/ativar` e `POST /me/2fa/desativar`. Correção pequena e de baixo risco (mesmo padrão já usado 2x no projeto), mas não implementada nesta missão (mandato de consolidação, não de remediação).

Todas as demais pendências (12 itens do Security Hardening Backlog + item 13, `trust proxy`) permanecem Categoria C, não bloqueiam, cada uma com condição de retorno explícita.

Não abro nova frente além desta pendência. Recomendo uma missão dedicada "EV-067 Remediação" (mesmo rigor: reprodução → correção → teste → revisão adversarial → CI real), aguardando autorização explícita do usuário.

---

## Addendum de Encerramento 2 — Missão "EV-067 Remediação" (2026-08-04)

A missão dedicada recomendada acima foi executada. Resultado:

### Verificação (5 critérios pedidos)

1. **EV-067 encerrado?** Sim. Reprodução real via CI (`chaveiro-bot/test/integration/conta_2fa_bruteforce.test.js`, 3 dos 7 testes iniciais falhando exatamente como esperado antes da correção). Corrigido com `totpAtivarLimiter`/`totpDesativarLimiter` (`chaveiro-bot/src/middlewares/rateLimiters.js`, fábrica `criarTotpContaLimiter`), aplicados exclusivamente às 2 rotas afetadas. **4 rodadas de revisão adversarial** (não 1) — as 3 primeiras encontraram vetores reais e progressivamente mais sutis de multiplicar baldes de rate-limit através de `req.originalUrl` (caixa/barra final → barra dupla/fragmento de URL → request-target em forma absoluta do HTTP/1.1), cada um verificado de forma independente pelo orquestrador (Express real, requisições reais — `fetch`, socket TCP cru, `http.request`) antes de corrigir. A correção final abandonou `req.originalUrl` como fonte da chave (rótulo fixo por rota, decidido em tempo de definição — não em nenhuma leitura da requisição), fechando a CLASSE de vulnerabilidade, não só os vetores encontrados. A 4ª rodada, independente, não encontrou nada. Ver `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-068.
2. **Zero Categoria A?** Sim — nenhuma pendência Categoria A restante (EV-063 corrigido; EV-065 refutado por teste real contra produção).
3. **Zero Categoria B?** **Não.** EV-067 (rate limiter) está corrigido, mas um achado NOVO e SEM RELAÇÃO CAUSAL com essa correção surgiu durante os próprios runs de CI: **EV-069** — CVE de severidade alta em `ip-address` (dependência transitiva de `express-rate-limit`, publicado depois do último CI verde desta sessão). Ver detalhamento abaixo.
4. **CI e Security verdes?** **Não totalmente.** Todos os testes (41/41 arquivos unitários, 28/28 de integração) passam em todos os commits da remediação — zero regressão. O único step vermelho, em todos os runs, é "Auditoria de dependências" (`npm audit --audit-level=high`), por causa do EV-069, sem relação com o código desta missão.
5. **Backlog contém só Categoria C?** Sim — 13 itens, todos Categoria C (`SECURITY_HARDENING_BACKLOG.md`). EV-069 **não** entra nesse backlog — não é Categoria C, é uma pendência Categoria B ativa que impede o encerramento.

### EV-069 — CVE em `ip-address` (novo, independente do EV-067)

- **Pacote afetado:** `ip-address`. **Versão instalada:** `10.2.0`. **Versão corrigida:** `10.4.0` (a faixa `<=10.3.0` do aviso de severidade alta não tem patch; corrigida só a partir de `10.3.1`).
- **Caminho transitivo:** `chaveiro-bot` → `express-rate-limit@8.6.2` → `ip-address@10.2.0` (já dentro do range `^10.2.0` que `express-rate-limit@8.6.2` declara — não precisa de bump do pacote direto).
- **Severidade:** Alta (`GHSA-mwp4-54f8-5fhr`, CWE-20/CWE-918) + 2 moderadas relacionadas.
- **Explorabilidade nesta aplicação:** investigada por leitura direta de `node_modules/express-rate-limit/dist/index.cjs:44-56` — `ip-address` é usado exclusivamente dentro de `ipKeyGenerator` (a mesma função usada por `cadastroLimiter`/`authIpLimiter`/fallback dos demais limiters deste projeto) para colapsar um IPv6 na subrede `/56`, fins de AGRUPAMENTO de chave — não para decisão de SSRF/fronteira de confiança, o uso que as CVEs descrevem. Risco residual plausível mas não confirmado: bug de parsing poderia, em tese, fazer endereços do mesmo `/56` gerarem chaves diferentes (evasão parcial de agrupamento por subnet) — não testado nesta missão.
- **Impacto real:** baixo a moderado, não confirmado como bypass ativo de nenhuma proteção desta aplicação — mas é o motivo formal de "Auditoria de dependências" (gate de CI) estar vermelho.
- **Estratégia recomendada:** bump mecânico de `ip-address` 10.2.0→10.4.0 via lockfile (confirmado com `npm audit fix --dry-run --json`: zero mudança em `package.json`, baixo risco, sem breaking change esperado).
- Não implementado nesta missão, por instrução explícita do usuário — requer missão dedicada de tratamento de dependências.

### Pareceres Finais Separados

## 1. EV-067 — ENCERRADO

Corrigido, testado (falha antes/passa depois), sem regressão, com 4 rodadas de revisão adversarial (a última sem achado). Ver `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-068, para a síntese técnica completa.

## 2. Frente de Segurança — NÃO ENCERRADA, pendente exclusivamente por causa do EV-069

Nenhuma pendência Categoria A. Nenhuma pendência Categoria B relacionada a qualquer correção anterior (EV-056/057/060/063/065/067 todos fechados ou refutados). A única razão pela qual esta missão não declara "Frente de Segurança OFICIALMENTE ENCERRADA" é o **EV-069** — um CVE novo, de origem externa (disclosure de terceiros), sem relação causal com nenhum código alterado nesta sessão, detectado como efeito colateral dos próprios runs de CI desta remediação. Recomendo uma missão dedicada de tratamento de dependências de segurança (EV-069 e qualquer outro achado correlato), preservando o modelo de Evidence Driven Execution, mediante autorização explícita do usuário.

---

## Addendum de Encerramento 3 — Missão "EV-069" (2026-08-04)

A missão dedicada recomendada acima foi executada com EDE completo (Gates 1-7 do CVE + Gate 3 revelando um achado colateral). Resultado:

### Parecer 1 — EV-069: **REFUTADO**

Investigação completa (não leitura de advisory, reprodução real em cada etapa):
- **Cadeia**: caminho único `express-rate-limit@8.6.0 → ip-address@10.2.0`, consumido só por `ipKeyGenerator`.
- **2 das 3 CVEs (moderadas)**: as funções que descrevem como vulneráveis (`isPrivate`/`isLoopback`/`isLinkLocal`/`isCGNAT`/`isMulticast`/`isUnspecified`/`isULA`/`isBroadcast`/`isInSubnet`/`isHostInSubnet`/`getType`) nunca são chamadas por `ipKeyGenerator` — inalcançáveis por definição de uso, não por sorte.
- **1 CVE (alta, `Address4.correctForm()`)**: reproduzido que a biblioteca TEM o bug em isolamento (`new Address4('012.0.0.1').correctForm()` → `'12.0.0.1'`, decimal, deveria ser octal `'10.0.0.1'`) — mas o único caminho desta app até essa função (`Address6.to4()`) é bloqueado ANTES do parsing malicioso por 2 camadas reproduzidas diretamente: `node:net.isIPv6()` rejeita o padrão de ataque, e a própria `Address6.parse4in6` (versão instalada) já lança `AddressError` para octetos com zero à esquerda.
- **Classificação**: Categoria C. Movido para `SECURITY_HARDENING_BACKLOG.md`, item 14. Nenhuma dependência atualizada — decisão correta para Categoria C, não decisão de deixar o CI vermelho sem motivo.

### Achado colateral — EV-070 (NOVO, não classificado)

Durante o Gate 3 (é preciso ler o código real de `ipKeyGenerator` para confirmar reachability — não bastava o advisory), descobri que **todos os 6 pontos de uso de `ipKeyGenerator` neste projeto chamam a função com a assinatura errada** (`ipKeyGenerator(req, res)` em vez de `ipKeyGenerator(req.ip, subnet)`). Reproduzido com uma instância real do Express: a função retorna o objeto `req` inteiro (nunca extrai o IP), que vira a string constante `"[object Object]"` quando usado como chave. **`authIpLimiter` e `cadastroLimiter` (a mitigação central do EV-057) sempre caem nesse caminho** — não são mais por-IP, viram um balde único compartilhado por toda a aplicação.

Isso é uma descoberta nova, sem relação com o EV-069 em si (é um bug de uso da API do `express-rate-limit`, não da dependência `ip-address`), e está fora do mandato desta missão ("não amplie o escopo"). Não corrigido, não classificado em Categoria A/B/C — a severidade aparente (mitigação central do EV-057 possivelmente inoperante como controle por-origem) é grande demais para eu simplesmente ignorar e declarar a frente encerrada. Ver `EOS_SECURITY_CLOSURE_V2_PLAN.md`, EV-070, para o detalhamento completo.

### Critério de Encerramento

**Existe algum item Categoria A ou B restante?** Tecnicamente, EV-070 ainda não foi classificado (isso exigiria investigação que estaria fora do escopo desta missão) — mas dado o padrão de severidade já observado (a mesma classe de "proteção que deveria estar ativa mas não está" do EV-067), a resposta prudente é **SIM, há uma pendência não resolvida**.

- **Evidência:** `chaveiro-bot/src/middlewares/rateLimiters.js:145,164,179,192,226`, `chaveiro-bot/src/app.js:146` — 6 call sites de `ipKeyGenerator(req, res)`, assinatura incompatível com a função exportada por `express-rate-limit`, reproduzido com Express real.
- **Impacto:** `authIpLimiter`/`cadastroLimiter` (mitigação do EV-057) operam com um balde único global em vez de por-IP — risco de abuso de trial não mais isolado por origem, e risco de disponibilidade (uma rajada legítima pode esgotar o balde compartilhado).
- **Causa raiz:** provável divergência entre a assinatura antiga e a atual de `ipKeyGenerator` ao longo de atualizações do `express-rate-limit` (`8.5.2`→`8.6.0` via dependabot, `cf81bca`), sem atualização correspondente nos call sites deste projeto.
- **Tarefa objetiva necessária:** investigação dedicada (Gate 1-4 do mesmo rigor EDE) para confirmar o comportamento exato em cada limiter, classificar Categoria A/B/C, e corrigir se confirmado — ex.: trocar todos os call sites para `ipKeyGenerator(req.ip, ...)` ou remover o `keyGenerator` customizado onde o default da biblioteca já basta.

Não abro uma nova frente automaticamente. Recomendo uma missão dedicada "EV-070 Validação e Remediação", mesmo rigor EDE, mediante autorização explícita do usuário.
