# EV-070 — Validação, Classificação e Remediação (`ipKeyGenerator` chamado com assinatura errada)

**Missão:** EV-070 — Validação, Classificação e Remediação
**Status final:** ✓ CONFIRMADO E REMEDIADO (Categoria A)
**Data:** 2026-08-04
**Metodologia:** Evidence Driven Execution (EDE) — Gates 1-9, nenhuma hipótese tratada como
fato antes de reproduzida nesta execução. A suspeita levantada lateralmente durante a missão
"EV-069" foi tratada apenas como ponto de partida, não como conclusão herdada.

---

## Objetivo da missão

Durante a missão "EV-069" (validação de um CVE em `ip-address`), ao confirmar se o código
vulnerável da dependência era alcançável, surgiu um achado tangencial e não investigado a
fundo: todos os pontos onde este projeto usa `ipKeyGenerator` (exportado por
`express-rate-limit`) chamam a função como `ipKeyGenerator(req, res)`, passando o objeto
inteiro da requisição em vez de uma string de IP.

Essa observação foi registrada como **EV-070** e propositalmente **não investigada nem
corrigida** na missão EV-069 (fora do mandato daquela missão). Esta missão existe para
responder, com evidência produzida nesta execução, uma única pergunta:

> **O EV-070 realmente existe na aplicação em execução?**

---

## Gate 1 — Inventário de todos os call sites de `ipKeyGenerator()`

Busca direta no código-fonte (`chaveiro-bot/src`) por toda ocorrência de `ipKeyGenerator(`:

| # | Arquivo:linha | Limiter | Rota(s) protegida(s) | Chamada (antes da correção) |
|---|---|---|---|---|
| 1 | `app.js:146` | limiter de desafio 2FA (`/auth/login/2fa`, `/auth/login/2fa-telefone`) | fallback quando `req.body.desafio` ausente | `ipKeyGenerator(req, res)` |
| 2 | `rateLimiters.js:145` | `authLimiter` (login/register/recuperar-senha/redefinir-senha/magic-link) | fallback quando `identidadeDaRequisicao` retorna `null` | `ipKeyGenerator(req, res)` |
| 3 | `rateLimiters.js:164` | `authIpLimiter` | mesmas rotas do `authLimiter`, **sempre** (sem condicional) | `` `authip:${ipKeyGenerator(req, res)}` `` |
| 4 | `rateLimiters.js:179` | `cadastroLimiter` (mitigação central do EV-057) | `/auth/register`, `/auth/oauth/:provedor` | `` `cadastro:${ipKeyGenerator(req, res)}` `` |
| 5 | `rateLimiters.js:192` | `exclusaoContaLimiter` | `/me/conta/codigo-exclusao`, `/me/conta` | fallback quando `req.user` ausente |
| 6 | `rateLimiters.js:226` | `totpAtivarLimiter`/`totpDesativarLimiter` (EV-067/068) | `/me/2fa/ativar`, `/me/2fa/desativar` | fallback quando `req.user` ausente |

Os itens 3 e 4 chamam `ipKeyGenerator(req, res)` **incondicionalmente** — se o bug for real,
afetam 100% do tráfego dessas rotas, não só uma borda.

---

## Gate 2 — Contrato oficial da API (não documentação online)

Fonte inspecionada nesta execução: o próprio arquivo de tipos bundlado com o pacote
**instalado** nesta worktree (`node_modules/express-rate-limit/dist/index.d.cts:9,20`,
`express-rate-limit@8.6.0` confirmado via `package.json`):

```ts
export declare function ipKeyGenerator(ip: string, ipv6Subnet?: number | false): string;
```

Com o JSDoc oficial explícito (mesmo arquivo):

> *"If you write a custom keyGenerator that allows a fallback to IP address for
> unauthenticated users, return `ipKeyGenerator(req.ip)` rather than just `req.ip`."*

Implementação real (`node_modules/express-rate-limit/dist/index.cjs:44-56`):

```js
function ipKeyGenerator(ip, ipv6Subnet) {
  const isIPv6 = net.isIPv6(ip);
  if (isIPv6 && ipv6Subnet !== false) {
    return new Address6(`${ip}/${ipv6Subnet ?? 56}`).mask(...).address; // simplificado
  }
  return ip;
}
```

A função espera **uma string de IP** no 1º argumento. Todo call site deste projeto passa o
objeto `req` inteiro. Fonte primária do próprio pacote, não de terceiros — Gate 2 resolvido
sem depender de documentação online.

---

## Gate 3 — Reprodução isolada, fresca (Express real, não mock manual)

Reproduzido nesta execução, sem reaproveitar a suspeita da missão EV-069: uma instância real
do Express, com `app.set('trust proxy', 1)`, recebendo uma requisição HTTP real com
`X-Forwarded-For` definido, comparando os dois modos de chamada dentro do mesmo handler.

**Resultado observado:**

| Chamada | Tipo de retorno | Valor coagido a string |
|---|---|---|
| `ipKeyGenerator(req, res)` | `object` (o próprio `req`) | `"[object Object]"` |
| `ipKeyGenerator(req.ip)` | `string` | `"203.0.113.9"` (IP real resolvido) |

Causa raiz confirmada por leitura da implementação: `net.isIPv6(req)` retorna `false` para um
objeto que não é string — a função cai direto no `return ip` sem nunca extrair `req.ip`.
`req.ip` estava corretamente resolvido ao lado (`trust proxy` funcionando), confirmando que o
defeito está exclusivamente na chamada, não na configuração de proxy (já investigada e
refutada separadamente em EV-065/066).

Confirmado também, por leitura de `node_modules/rate-limit-redis/dist/index.mjs` (`prefixKey`,
template literal), que a store Redis coage qualquer valor não-string da mesma forma — sem
lançar exceção. É uma degradação **silenciosa**, não um erro visível em log ou teste manual
superficial.

---

## Gate 4 — Aplicação real (o gate que a suspeita original não tinha)

A suspeita levantada em EV-069 usou apenas reprodução isolada (Gate 3). Este gate exige a
**aplicação real em execução**, não uma simulação isolada da função.

Usado `criarApp()` (a factory real de `chaveiro-bot/src/app.js`, a mesma usada por todos os
testes de integração deste projeto) com os limiters reais (`authIpLimiter`, `cadastroLimiter`)
montados nas rotas reais. Sem Redis disponível nesta worktree, reusado o padrão já
estabelecido em `chaveiro-bot/src/middlewares/__tests__/rateLimiters.test.js`
(`vi.mock('rate-limit-redis', ...)` com uma `FakeRedisStore` de mesma interface, backed por um
`Map` em memória) — não é uma simulação nova, é o mesmo mecanismo que os testes oficiais deste
projeto já usam para exercitar limiters reais sem Redis real.

Requisições HTTP reais enviadas via `supertest` a `POST /api/auth/register`
(`cadastroLimiter`) e `POST /api/auth/login` (`authIpLimiter`) de **IPs simulados diferentes**
(`X-Forwarded-For` + `trust proxy` configurado), inspecionando diretamente as chaves do `Map`
da store fake — não inferido pelo status HTTP, a chave real foi observada.

**Resultado medido:**

- `authIpLimiter`/`cadastroLimiter`: a chave observada no `Map` foi **idêntica**
  (`"authip:[object Object]"` / `"cadastro:[object Object]"`) para requisições de IPs
  simulados **diferentes** — uma única chave, não uma por IP.
- Limiter geral `/api` (sem `keyGenerator` customizado, usa o default correto da própria
  biblioteca): no **mesmo teste**, produziu 2 chaves **distintas**, uma por IP simulado —
  prova de controle (o mesmo ambiente, a mesma técnica de simulação, comportamento correto
  quando o call site é correto).

---

## Gate 5 — Impacto medido (não estimado)

A partir do `Map` observado no Gate 4: exatamente **1 chave** para `authIpLimiter` e **1
chave** para `cadastroLimiter`, compartilhada por **todos** os IPs simulados testados — um
balde global por limiter, não um balde por IP. Número exato, não estimativa.

---

## Gate 6 — Exploitabilidade quantificada (não deduzida)

Teste direto: IP-A esgota o teto de 30 requisições do `cadastroLimiter`; IP-B — um usuário
legítimo que **nunca fez nenhuma requisição antes** — tenta 1 única requisição de cadastro
logo em seguida.

**Resultado:** IP-B recebe `429` na **primeira tentativa**, apesar de nunca ter interagido com
a aplicação. DoS real e medido entre usuários sem qualquer relação entre si — não dedução a
partir do Gate 5, comportamento observado diretamente.

Efeito equivalente confirmado para `authIpLimiter`: o teto de força bruta de login deixa de
isolar por origem — atividade de um IP consome o mesmo orçamento de tentativas de todos os
outros.

---

## Gate 7 — Classificação

**Categoria A** — explorável na arquitetura **atual**, tal como está hoje, sem necessidade de
nenhuma mudança arquitetural para o impacto do Gate 6 se manifestar. Justificativa técnica:

- `authIpLimiter`/`cadastroLimiter` chamam `ipKeyGenerator(req, res)` **incondicionalmente**
  (itens 3 e 4 do Gate 1) — 100% do tráfego dessas rotas é afetado, não uma borda.
- `cadastroLimiter` é a mitigação central já aceita para o EV-057 (abuso de criação de
  contas) — o bug elimina o isolamento por IP que essa mitigação pressupõe.
- Impacto de disponibilidade demonstrado com tráfego real e simulação mínima (2 IPs), não um
  cenário artificial de laboratório.

Os itens 1, 2, 5 e 6 do Gate 1 (fallbacks condicionais) foram confirmados, por leitura de
código, como só alcançáveis em condições que na prática não ocorrem nas rotas reais
(`req.user` sempre populado por `requireAuth` antes desses limiters; `identidadeDaRequisicao`
só retorna `null` para corpos sem nenhum campo reconhecido) — não mudam a classificação
Categoria A já estabelecida pelos itens 3 e 4, mas foram corrigidos junto por serem a mesma
classe de defeito e por segurança de defesa em profundidade.

---

## Gate 8 — Remediação (API oficial, sem wrapper novo)

Correção mínima, reusando exatamente a API documentada no Gate 2: troca de
`ipKeyGenerator(req, res)` por `ipKeyGenerator(req.ip)` nos 6 call sites. Nenhum comportamento
não relacionado foi alterado (mensagens de erro, limites, janelas).

- `chaveiro-bot/src/app.js:146`
- `chaveiro-bot/src/middlewares/rateLimiters.js:145,164,179,192,226`

Commit: `84632d5` — *fix(seguranca): EV-070 - ipKeyGenerator(req.ip), nao ipKeyGenerator(req,res)*.

**Efeito colateral esperado e validado:** `authLimiter`/`authIpLimiter` são herdados por
prefix-match do Express em `/api/auth/login/2fa/recuperar`
(`app.use('/api/auth/login', authIpLimiter, authLimiter)`, mesmo mecanismo que já herda
`twoFactorLimiter` nessa mesma rota, documentado anteriormente). Antes da correção, esse
fallback por IP nunca colidia de verdade (o `Map` da `FakeRedisStore` preserva identidade de
objeto para chaves não-string — cada requisição virava uma chave "nova"), então
`authLimiter` estava montado ali mas **nunca bloqueava nada na prática**. Depois da correção,
a chave é o IP de verdade, e `authLimiter` passa a bloquear corretamente nessa rota também.

Isso não é uma regressão — é uma consequência direta e correta da correção. Os 2 testes
pré-existentes de `chaveiro-bot/src/__tests__/recuperacao2faRateLimit.test.js` foram ajustados
para variar o IP simulado a cada tentativa quando o objetivo é isolar o comportamento de
`twoFactorLimiter` (por `desafio`, não por IP); um 3º teste novo foi adicionado
(`'EV-070: authLimiter (herdado pelo mesmo prefix-match) agora bloqueia por IP de verdade
nesta rota'`) travando o comportamento corrigido. Nenhuma asserção foi enfraquecida.

**CI real após a correção:** `backend` — 41/41 arquivos de teste unitários (390 testes),
28/28 arquivos de integração, zero regressão. Único erro pré-existente e sem relação causal:
`npm audit --audit-level=high` continua sinalizando o CVE de `ip-address` já investigado e
classificado Categoria C em EV-069 (achado estruturalmente inalcançável nesta aplicação,
detalhes no registro EV-069).

---

## Gate 9 — Revisão adversarial

Agente `red-team-attacker` fresco, mandato: tentar quebrar a correção (bypass de rate
limiting, colisão de bucket entre usuários, DoS residual). Cada achado reproduzido de forma
independente pelo orquestrador antes de aceitar como não-regressão.

Vetores tentados:

1. **Re-exploração de `req.ip`/trust proxy** — sem superfície nova além do já investigado e
   refutado em EV-065/066 (produção real via Railway sanitiza `X-Forwarded-For`/`X-Real-IP`).
2. **Rotação de IPv6 dentro/fora do `/56`** — achado real (um atacante com um bloco IPv6
   maior aloca múltiplos `/56` e multiplica buckets), mas é comportamento **pré-existente da
   própria biblioteca** (`ipv6Subnet: 56` é o default do `express-rate-limit`), **idêntico**
   ao já aceito pelo limiter geral de `/api` (que sempre usou o keyGenerator default
   corretamente) — não é uma regressão introduzida por este fix. Registrado como Categoria C,
   backlog item 15.
3. **Colisão entre usuários legítimos atrás do mesmo IP em `/auth/login`** — não se sustentou;
   `identidadeDaRequisicao` mantém precedência correta sobre o fallback de IP quando o corpo
   contém um campo de identidade reconhecido.
4. **Disponibilidade em `/auth/login/2fa/recuperar`** — confirmado como o efeito colateral já
   descrito e testado no Gate 8 (`authLimiter` agora ativo nessa rota); não é um bypass, é uma
   proteção adicional correta. Efeito de disponibilidade documentado como Categoria C, backlog
   item 16 (uma rajada legítima de recuperação de 2FA do mesmo IP pode esbarrar no teto de
   `authLimiter` antes do de `twoFactorLimiter`).
5. **Código morto nos fallbacks de `exclusaoContaLimiter`/`totpAtivarLimiter`/
   `totpDesativarLimiter`** — confirmado sem caminho real de exploração; `requireAuth` sempre
   popula `req.user` antes desses limiters nas rotas reais.

Nenhum vetor novo reabriu o defeito original. Convergência real, não suposta.

---

## Gate 10 — Encerramento

**Opção B: CONFIRMADO E REMEDIADO.**

- Reprodução real e quantificada (Gates 3-6): sim.
- Causa raiz identificada (assinatura errada da API, não configuração de proxy): sim.
- Correção mínima usando exatamente a API oficial da biblioteca (Gate 8): sim.
- Revisão adversarial sem achado que reabra o bug original (Gate 9): sim.
- CI real verde para o job `backend` (41/41 unitários, 28/28 integração, zero regressão): sim.
- Ausência de regressão funcional (efeito colateral em `/auth/login/2fa/recuperar` testado e
  documentado, não uma quebra): sim.

### Critério final da missão

Com o EV-070 remediado, não resta nenhuma pendência Categoria A ou B conhecida em toda a
Frente de Segurança (EV-056, EV-057, EV-060, EV-063, EV-065, EV-067, EV-069, EV-070 — todos
corrigidos, refutados ou aceitos como decisão de produto). Os 16 itens residuais estão
confinados ao `SECURITY_HARDENING_BACKLOG.md`, todos Categoria C.

Conforme declarado em `docs/agent-environment/SECURITY_CLOSURE_FINAL_REPORT.md` (Addendum de
Encerramento 4) e `docs/agent-environment/SECURITY_BASELINE_v1.md`:

# A Frente de Segurança está oficialmente ENCERRADA para a arquitetura atualmente implantada.

---

## Rastreabilidade

- Registro-síntese no plano vivo: `docs/agent-environment/EOS_SECURITY_CLOSURE_V2_PLAN.md`,
  linhas EV-070 (achado) e EV-071 (remediação completa).
- Commits: `84632d5` (correção de código + testes), `6169394` (fechamento documental).
- Arquivos alterados: `chaveiro-bot/src/middlewares/rateLimiters.js`,
  `chaveiro-bot/src/app.js`, `chaveiro-bot/src/middlewares/__tests__/rateLimiters.test.js`,
  `chaveiro-bot/src/__tests__/recuperacao2faRateLimit.test.js`.
- Nenhuma dependência foi atualizada nesta missão (fora de escopo, conforme instrução
  explícita do usuário).
- Nenhum push além do já autorizado para a branch `fix/seguranca-criticos` foi realizado;
  nenhum merge, deploy ou migration.
