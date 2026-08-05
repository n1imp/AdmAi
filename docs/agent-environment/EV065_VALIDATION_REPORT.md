# EV-065 Validation Report — O EV-065 existe na arquitetura real de produção?

**Missão:** "EV-065 — Confirmação da Vulnerabilidade na Arquitetura Real" — validação exclusiva, sem remediação, sem alteração de código, sem commit, sem push. **Branch:** `fix/seguranca-criticos` · **HEAD:** `f259496` (inalterado — nenhum commit criado nesta missão) · **Data:** 2026-08-04.

## Resposta direta

> **NÃO.** O EV-065, como descrito (spoofing de `req.ip` via `X-Forwarded-For` forjado, contornando `cadastroLimiter`/`authIpLimiter`/limiter geral), **não existe na arquitetura real de produção** deste projeto. Confirmado por teste direto contra a instância real e viva de produção (não simulação), autorizado explicitamente pelo usuário para esta validação.

## Gate 1 — Inventário da Topologia Real

A missão anterior (EV-065) baseou a reprodução em `chaveiro-bot/Caddyfile` + `docker-compose.prod.yml` + `chaveiro-painel/nginx.conf` — um deploy self-hosted em VPS. **Essa não é a arquitetura de produção real deste projeto.**

Evidência direta (repositório + teste ao vivo):

1. `README.md:402-405`: *"**Deploy:** a arquitetura de produção é **Railway** (backend, Docker + volume) + **Cloudflare Pages** (painel estático) + **Supabase** (Postgres)."*
2. `docs/CI_CD.md:3-13`: confirma o mesmo, com diagrama — deploy nativo (sem step de Actions) via integração GitHub→Railway ("Deploy on push" + "Wait for CI") e GitHub→Cloudflare Pages.
3. `docs/BUGLIST.md`, item B5 (bug conhecido, aberto, não relacionado a esta missão): confirma que a API real hoje é **`admai-production.up.railway.app`** (subdomínio padrão do Railway) — nenhum domínio customizado está propagado ainda (o rebrand ChaveiroBot→AdmAi deixou `VITE_API_URL` de produção apontando para um domínio stale, `api.barbers-flow.com`, que não é o que está de fato servindo).
4. **Teste direto contra a instância real** (`curl -i https://admai-production.up.railway.app/health`, autorizado nesta missão): respondeu `200 OK`, `Server: railway-hikari`, `x-railway-edge: atl1`, `access-control-allow-origin: https://admai-painel.pages.dev` — confirma ao vivo: (a) o backend está de fato rodando atrás da borda do Railway (`railway-hikari`/`x-railway-edge`, headers específicos da plataforma), (b) o painel está servido no subdomínio padrão do Cloudflare Pages (`*.pages.dev`), sem domínio customizado, (c) **nenhum Caddy, nenhum nginx, nenhuma camada própria do projeto está na frente do Express** — a borda é inteiramente gerenciada pelo Railway.

### Diagrama da topologia real confirmada

```
Navegador/App Android (painel React / Capacitor)
        │  chama VITE_API_URL absoluto (cross-origin)
        ▼
Borda do Railway (railway-hikari / x-railway-edge)  ← ÚNICO hop identificável
        │
        ▼
Express (chaveiro-bot), trust proxy = 2
```

Não há Caddy. Não há nginx. Não há Cloudflare na frente da API (só na frente do painel estático, via Cloudflare Pages — produto distinto, que não faz proxy da API). O caminho `CADDY_API_DOMAIN`/`Caddyfile` analisado na missão anterior pertence a `docs/DEPLOYMENT.md` — um guia alternativo de deploy self-hosted em VPS, **não é o que está rodando em produção hoje**.

## Gate 2 — Configuração Real

`app.set('trust proxy', 2)` (`app.js:41`) assume 2 hops. A topologia real (Railway) tem, na prática, uma borda gerenciada (não é "2 proxies encadeados" no sentido do Caddy→nginx original) — o valor `2` **não reflete literalmente** a infraestrutura do Railway. Isso por si só já é uma inconsistência de configuração (ver Gate 6). A pergunta decisiva, porém, não é "o número bate", é "isso é explorável" — respondida no Gate 3.

## Gate 3 — Reprodução na Topologia Real

Reprodução **na arquitetura real**, ao vivo, contra `https://admai-production.up.railway.app`, autorizada explicitamente pelo usuário (não invasiva: requisições `GET` equivalentes a tráfego de navegador comum, para um path inexistente sob `/api` — sem tentativa de autenticação, sem alteração de dado, sem força bruta). Sinal observado: os headers padrão do rate limiter (`ratelimit-remaining`, `express-rate-limit` com `standardHeaders:true`, chave = `req.ip` — confirmado por leitura direta de `app.js:97-110`, sem `keyGenerator` customizado no limiter geral) — se `req.ip` fosse influenciável pelo cliente, cada valor forjado diferente cairia num balde (bucket) diferente, resetando `ratelimit-remaining` a um valor próximo do teto (120); se `req.ip` for resolvido de forma estável e correta, todas as requisições caem no MESMO balde, decrementando sequencialmente.

| # | Cabeçalho enviado | `ratelimit-remaining` retornado |
|---|---|---|
| 1 | (nenhum `X-Forwarded-For`) | 119 |
| 2 | `X-Forwarded-For: 198.51.100.7` | 118 |
| 3 | `X-Forwarded-For: 203.0.113.55` (outro IP) | 117 |
| 4 | `X-Forwarded-For: 9.9.9.0, 9.9.9.1, 9.9.9.2` (cadeia múltipla, mesmo padrão do PoC da missão anterior) | 116 |
| 5 | `X-Forwarded-For: ,,,not-an-ip,,,` (malformado) | 115 |
| 6 | `X-Forwarded-For: 8.8.8.8` + `X-Real-IP: 1.1.1.1` (os 2 headers forjados juntos) | 114 |
| 7 | (nenhum header, de novo) | 113 |

**Decremento monotônico, exatamente -1 a cada requisição, do início ao fim (120→113 em 7 chamadas), independentemente do conteúdo do `X-Forwarded-For`/`X-Real-IP` enviado.** Nenhuma das 6 variações de cabeçalho conseguiu abrir um balde novo — todas caíram no mesmo balde da requisição 1. Isso demonstra diretamente, na infraestrutura real e viva, que **o cliente não tem nenhuma influência sobre o valor de `req.ip` usado pelo rate limiter**, com ou sem cabeçalho forjado, único ou múltiplo, bem-formado ou não.

Não foi necessário testar "ausência de topologia real" — a reprodução ocorreu diretamente contra a arquitetura real, não contra simulação.

## Gate 4 — Impacto

Não há spoofing possível na arquitetura real ⇒ não há bypass de `cadastroLimiter`, `authIpLimiter` nem do limiter geral `/api`. O achado da missão anterior tinha o mecanismo correto (Express com `trust proxy` incompatível com o número de hops É, em geral, uma classe real de vulnerabilidade), mas a premissa de que a borda real apenas *anexa* o `X-Forwarded-For` do cliente sem saneá-lo (comportamento do Caddy sem `trusted_proxies` configurado) **não se aplica à borda do Railway**, que — confirmado empiricamente agora, não só por relato de terceiros — descarta/ignora por completo qualquer valor de IP que o cliente tente injetar via `X-Forwarded-For` ou `X-Real-IP`.

## Gate 5 — Reavaliação do EV-057

O EV-057 (abuso de trial via criação ilimitada de contas) **não é reaberto** pelo mecanismo descrito no EV-065. A mitigação original (`cadastroLimiter` por IP + `Usuario.telefone @unique`, commits `3f0f049`/`27ce4a9`) permanece efetiva na arquitetura real: o IP que o limiter usa como chave é o IP real do cliente, resolvido corretamente e não manipulável pela borda do Railway. Quantificação: 0 dos 6 vetores de manipulação de cabeçalho testados (single spoof, spoof alternativo, cadeia múltipla, malformado, `X-Real-IP`, combinação) conseguiu abrir um balde de rate-limit novo — 0% de taxa de sucesso do mecanismo de bypass proposto, contra uma amostra de 6 tentativas diretas na infraestrutura real.

(O Vetor B do EV-057, sobre variantes do 9º dígito do telefone, é independente da topologia de rede — não é afetado por esta validação, continua registrado como item 4 do `SECURITY_HARDENING_BACKLOG.md`, Categoria C, risco de negócio já aceito.)

## Gate 6 — Contraprova

Tentativa deliberada de refutar a própria conclusão antes do parecer:

- **Existe alguma configuração atual que impeça a exploração?** Sim — a borda do Railway. Confirmado meramente por relato de funcionários da Railway em fóruns públicos ANTES do teste ao vivo (evidência de suporte, não decisiva sozinha); **confirmado de forma decisiva pelo teste direto contra produção real** (Gate 3), que é evidência de primeira mão desta execução, não de terceiros.
- **Existe algum componente que invalide a hipótese original?** Sim — a hipótese original (Caddy `reverse_proxy` sem `trusted_proxies`, que por padrão *anexa* sem sanear) descreve corretamente o comportamento do `Caddyfile` deste repositório, mas esse componente **não está na frente da API em produção real** — só existiria se o deploy self-hosted via VPS (`docs/DEPLOYMENT.md`) fosse o que está rodando, e não é (Gate 1).
- **Existe alguma diferença entre o ambiente testado anteriormente e a arquitetura real?** Sim, e é a diferença central desta missão: a missão anterior testou uma **simulação local fiel ao `Caddyfile`** (proxy Node que replica o "anexar sem sanear" do Caddy) — um comportamento real do Caddy, mas de um componente que não está em produção. A arquitetura real (Railway) tem uma borda que se comporta de forma **diferente e mais restritiva** — ela ignora entradas do cliente em vez de confiar nelas.
- **Poderia o teste desta missão estar enganoso por algum motivo?** Considerado e descartado: (a) o limiter usa `req.ip` diretamente, sem `keyGenerator` customizado — confirmado por leitura do código-fonte, não suposição; (b) o decremento foi limpo e monotônico em 7/7 requisições, sem nenhuma anomalia; (c) o path de teste (`/api/__ev065_probe__`) não existe, então nenhuma lógica de negócio foi exercida — o resultado reflete exclusivamente o comportamento do limiter/borda, não efeito colateral de alguma outra rota.

Nenhuma contraprova sobreviveu ao teste direto contra produção real.

## Conclusão

## Opção B — EV-065 REFUTADO

**Por que a hipótese anterior estava incorreta:** a missão anterior reproduziu o mecanismo de spoofing contra uma simulação fiel ao `Caddyfile`/`docker-compose.prod.yml` deste repositório — um deploy self-hosted em VPS documentado em `docs/DEPLOYMENT.md`. Essa reprodução era tecnicamente correta *para aquele componente*, mas esse componente **não é a arquitetura usada em produção**. A arquitetura real é Railway (backend) + Cloudflare Pages (painel) + Supabase (banco), confirmada por `README.md`, `docs/CI_CD.md`, `docs/BUGLIST.md` e por teste direto e ao vivo contra `https://admai-production.up.railway.app` nesta execução.

**Qual componente impede a exploração:** a borda de rede do Railway. Testado diretamente (Gate 3): 6 tentativas de manipular `req.ip` via `X-Forwarded-For`/`X-Real-IP` (valor único, valor alternativo, cadeia múltipla, header malformado, `X-Real-IP` isolado, combinação) — nenhuma conseguiu abrir um balde de rate-limit novo; todas caíram no mesmo balde da requisição real, sem cabeçalho forjado.

**Por que a Frente de Segurança pode voltar a considerar o EV-065 encerrado:** o único bloqueador Categoria A que impedia o encerramento na "Missão Final" era exatamente este mecanismo. Com ele refutado por evidência direta contra produção real, não resta nenhum item Categoria A conhecido — mas essa reavaliação formal do encerramento da frente **não é o objeto desta missão** (que é só confirmar/refutar o EV-065) e não deve ser feita aqui; ver "Próximo passo" abaixo.

### Nota residual (não bloqueia, registrar no backlog)

Duas observações que sobrevivem à refutação, nenhuma delas Categoria A/B:

1. **`trust proxy=2` continua tecnicamente desalinhado** com a topologia real do Railway (que não é "Caddy→nginx→backend"). Hoje isso é inofensivo porque a borda do Railway saneia o cabeçalho independentemente do valor de `trust proxy` — mas é uma configuração incorreta por sorte, não por design. Se o Railway mudar de comportamento no futuro, ou se o app for movido para uma borda que *não* saneie (ex.: o próprio deploy VPS/Caddy documentado em `docs/DEPLOYMENT.md`, caso venha a ser usado), a exploração volta a ser possível exatamente como descrito na missão anterior. Recomendo corrigir `trust proxy` para refletir a topologia real (ou usar uma função que valide a origem confiável em vez de contar hops) como item de **hardening preventivo**, não como correção de vulnerabilidade ativa.
2. **O caminho de deploy alternativo (VPS self-hosted via `docs/DEPLOYMENT.md`, `Caddyfile`, `docker-compose.prod.yml`) continua genuinamente vulnerável ao mecanismo original do EV-065**, caso algum dia seja o modo de deploy efetivamente usado (ex.: um cliente on-premise, ou uma migração de volta para self-host). Não bloqueia hoje porque não é a arquitetura em uso.

## Próximo passo

Conforme instrução desta missão, nenhuma correção foi implementada e nenhum documento de encerramento (`SECURITY_FINAL_REPORT.md`, `SECURITY_BASELINE_v1.md`) foi alterado. Fica para uma decisão explícita do usuário: (a) autorizar uma nova rodada da "Missão Final" (ou uma atualização direcionada) para formalizar a reabertura do parecer de encerramento à luz desta refutação, e (b) decidir se as 2 notas residuais acima entram no Security Hardening Backlog como itens Categoria C.
