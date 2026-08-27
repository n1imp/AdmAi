# Security Hardening Backlog

Itens Categoria C da missão "Security Closure Final" — não bloqueiam o encerramento da frente de segurança. Cada um lista componente, motivo, impacto, prioridade e a condição que o traria de volta ao escopo de uma frente de segurança.

---

### 1. Corrida de aceite duplo em `POST /convite/:token/aceitar`
- **Componente:** `chaveiro-bot/src/routes/auth.js` (rota de aceite de convite).
- **Motivo:** `findFirst` de `aceitoEm:null` roda fora de transação; duas requisições concorrentes com o mesmo token podem ambas passar a checagem antes que o `update` do convite seja visto pela outra.
- **Impacto:** duplicação de conta (2 usuários criados a partir de 1 convite). Não escala privilégio (o `papel` já foi vetado na criação do convite, EV-060) nem vaza dado de outro tenant. Baixo.
- **Prioridade:** P3.
- **Correção sugerida:** mesmo padrão do EV-056 — trocar a checagem+update do convite por um `updateMany` condicional em `aceitoEm:null`, aceitando a criação do usuário só se `count===1`.
- **Retorna ao escopo de segurança se:** houver evidência de exploração real, ou se a correção barata for priorizada numa limpeza geral de TOCTOUs (junto com o item 3 abaixo).

### 2. `/uploads` estático sem autenticação nem escopo de tenant
- **Componente:** `chaveiro-bot/src/app.js:79` (`express.static('./uploads')`).
- **Motivo:** qualquer um com o nome do arquivo (UUID v4, não enumerável) baixa o conteúdo, sem checar tenant nem autenticação. `services/inbound.js` (fotos de evidência de serviço via WhatsApp) e selfies de ponto legadas gravam/gravaram nesse mesmo diretório.
- **Impacto:** hoje, exposição só de fotos de produto de estoque (não-sensíveis, público por design) — o vetor sensível (fotos do WhatsApp) está com a feature desligada. Se reativado, passaria a expor dado LGPD-sensível (fotos de evidência, possivelmente selfies legadas ainda em disco) publicamente, sem mudança de código.
- **Prioridade:** P2 — priorizar ANTES de reativar o WhatsApp, não depois.
- **Correção sugerida:** mover fotos de evidência/selfies para um bucket privado com URL assinada (padrão já usado em `documentos.js`/selfies de ponto novas), ou pelo menos separar o diretório estático público (produto) do diretório de fotos potencialmente sensíveis.
- **Retorna ao escopo de segurança se:** a flag do WhatsApp for reativada — condição explícita de retorno.

### 3. TOCTOU em `PATCH`/`DELETE /usuarios/:id` (item 31 da Discovery Queue)
- **Componente:** `chaveiro-bot/src/routes/admin.js` (guard `podeGerenciarUsuario` lido antes da mutação, `where` do `updateMany`/`deleteMany` não revalida nível).
- **Motivo:** reproduzido e medido nesta missão (PoC descartável) — a corrida é real, mas exige uma ação legítima concorrente de terceiro (ex. o dono promovendo o alvo) na janela exata entre leitura e escrita; o atacante não a controla nem a provoca sozinho.
- **Impacto:** baixo (CWE-367, ~CVSS 3.1) — não reabre o escalonamento do EV-060.
- **Prioridade:** P3.
- **Correção sugerida:** condicionar o `where` da mutação também ao nível do alvo (ex.: `updateMany({ where: { id, empresaId, papel: { in: [...] } } })` recalculado), ou envolver leitura+escrita numa transação serializável.
- **Retorna ao escopo:** se uma auditoria futura encontrar um caminho de amplificar/provocar a janela de corrida unilateralmente.

### 4. Abuso de cadastro em massa (EV-057) — risco residual já aceito
- **Componente:** `chaveiro-bot/src/middlewares/rateLimiters.js` (`cadastroLimiter`), `POST /auth/register`, `POST /auth/oauth/:provedor`.
- **Motivo:** decisão arquitetural do usuário (Opção A) — limiter simples por IP, não CAPTCHA nem verificação de posse de e-mail/telefone antes do trial.
- **Impacto:** quantificado — ~2.880 trials/dia possíveis de um único IP. Risco de negócio (abuso de trial), não vulnerabilidade de dados.
- **Prioridade:** P2 (impacto de negócio, não de segurança).
- **Correção sugerida (se decidido no futuro):** CAPTCHA, verificação de e-mail/telefone antes de conceder o trial, ou limiar mais agressivo.
- **Retorna ao escopo:** decisão do usuário — já não é item de segurança, é de produto/negócio.
- **Refinamento (missão "Missão Final — Encerramento", item 39 da Discovery Queue):** a constraint `Usuario.telefone @unique` bloqueia só a string canônica exata; `canonizarTelefone` (`services/parser.js`) não resolve a ambiguidade do 9º dígito no cadastro (só `variantesTelefone`, usada em login, conhece as 2 formas) — permite 2 contas/trials pro mesmo telefone real, uma por variante. Ainda bounded (2x, não ilimitado), ainda mesma classificação (risco de negócio aceito), mas registra que a garantia "1 telefone = 1 conta" não é absoluta como o texto original deste item sugeria.

### 5. `react-router`/`react-router-dom` desatualizado (`T-DEPS-01`)
- **Componente:** `chaveiro-painel/package.json` (`react-router-dom@^6.22.3`, resolvido em `6.30.4`).
- **Motivo:** 2 CVEs moderadas conhecidas; confirmado 2x (auditorias independentes) que nenhum sink alcançável existe no código atual (sem SSR; único `navigate(dado)` dinâmico usa valores hardcoded no backend).
- **Impacto:** baixo hoje (sem exploit ativo), mas dependência desatualizada em runtime de produção.
- **Prioridade:** P2.
- **Correção sugerida:** upgrade major para a linha 7.x — mudança de API real (não é patch), precisa de esforço de engenharia dedicado, não um comando de atualização.
- **Retorna ao escopo:** se um sink novo for introduzido (qualquer `navigate`/`<Link to>` com dado de usuário não sanitizado).

### 6. Modelos com `empresaId` fora de `MODELOS_ESCOPADOS`
- **Componente:** `chaveiro-bot/src/db/tenant.js` (`GoogleConta`, `AvaliacaoGoogle`, `AnaliseAvaliacoes`, `Assinatura`, `ConviteUsuario`, `AuditLog`).
- **Motivo:** esses 6 modelos têm `empresaId` mas não recebem filtro automático do Prisma Client Extension — dependem de disciplina manual em cada call site.
- **Impacto:** nenhum exploit vivo encontrado em 2 auditorias independentes (todo call site atual usa `empresaId` explícito). "Landmine" arquitetural para código futuro.
- **Prioridade:** P3.
- **Correção sugerida:** adicionar os 6 modelos a `MODELOS_ESCOPADOS` (requer confirmar que nenhum call site atual quebra com o filtro automático).
- **Retorna ao escopo:** se um novo endpoint tocar esses modelos sem `empresaId` explícito.

### 7. `services/credenciais.js:criarAcessoTecnico` aceita `papel:'dono'` sem validar internamente
- **Componente:** `chaveiro-bot/src/services/credenciais.js`.
- **Motivo:** a função confia no chamador para nunca passar `'dono'`; os 2 únicos chamadores (`tecnicos.js`) de fato nunca passam. Falta de validação interna é uma armadilha para um futuro terceiro chamador.
- **Impacto:** nenhum hoje.
- **Prioridade:** P3.
- **Correção sugerida:** validar `papel` internamente na função (`assert(papel !== 'dono')` ou similar), não confiar só nos chamadores atuais.
- **Retorna ao escopo:** se um novo call site passar `papel` de forma menos controlada.

### 8. CSP `style-src` com `'unsafe-inline'`
- **Componente:** `chaveiro-painel/nginx.conf`, `chaveiro-painel/scripts/gerar-headers.mjs`.
- **Motivo:** débito conhecido, já documentado no próprio código (Tailwind/CSS-in-JS).
- **Impacto:** baixo — sem sumidouro de HTML não sanitizado para explorar via CSS-only.
- **Prioridade:** P3.
- **Correção sugerida:** avaliar hash-based CSP para `style-src` ou migração de padrão de estilização, mesmo espírito da correção já feita em `script-src`.
- **Retorna ao escopo:** se um XSS futuro for encontrado (eleva a severidade de ter `style-src` solto).

### 9. Cobertura de testes abaixo do piso de `T-CI-01` em módulos não cobertos por esta missão
- **Componente:** `middlewares/auth.js`, `services/codigosRecuperacao.js` (funções além de `verificarCodigo`), `services/auth.js` (funções de refresh token).
- **Motivo:** por instrução explícita desta missão, não perseguir percentual — os comportamentos críticos da superfície ativa (auth, RBAC, billing, google) já ganharam teste real nesta e nas 2 missões anteriores.
- **Impacto:** nenhum confirmado — é lacuna de verificação, não vulnerabilidade.
- **Prioridade:** P3.
- **Retorna ao escopo:** se `T-CI-01` for formalmente ativado como gate obrigatório de CI.

### 10. 9 das 11 vulnerabilidades de dependência do painel (Capacitor/Android build toolchain)
- **Componente:** `tar`, `sharp`, `minimatch`, `@trapezedev/project`, `@capacitor/cli` (nested), `@capacitor/assets`, `replace`, `uuid`, `xcode`.
- **Motivo:** já classificadas como não-exploráveis (dev/build-only, rastreadas até a chamada real) em 2 auditorias.
- **Impacto:** nenhum confirmado.
- **Prioridade:** P4.
- **Retorna ao escopo:** se alguma dessas dependências passar a ser invocada em um pipeline automatizado (hoje só rodam manualmente, sob demanda do desenvolvedor).

### 11. Rate limit não conta respostas 200 não-finais em `POST /auth/login` (`skipSuccessfulRequests`)
- **Componente:** `chaveiro-bot/src/middlewares/rateLimiters.js` (`authLimiter`/`authIpLimiter`), `chaveiro-bot/src/routes/auth.js`.
- **Motivo:** achado da revisão adversarial da remediação do EV-063. Respostas `200` de `POST /auth/login` (`desambiguacao`, `twoFactorRequerido`) não contam para o teto de tentativas (`skipSuccessfulRequests:true`) — comportamento pré-existente, não introduzido pelo EV-063. Era o amplificador do canal de timing (item que motivou o achado do §7 do `EV063_REMEDIATION_REPORT.md`); com o canal de timing já fechado (tempo constante até N=3), o valor prático de martelar esse ramo caiu bastante, mas o rate limit em si continua permissivo para respostas não-finais.
- **Impacto:** baixo hoje (o principal vetor que isso amplificava já foi fechado); resíduo é mais sobre robustez geral do rate limiting do que uma vulnerabilidade ativa.
- **Prioridade:** P3.
- **Correção sugerida:** considerar não aplicar `skipSuccessfulRequests` a respostas que não completam autenticação de fato (`desambiguacao`, `twoFactorRequerido` são intermediárias, não uma sessão completa).
- **Retorna ao escopo:** se um novo canal lateral (timing, tamanho de resposta, etc.) for encontrado que dependa de repetição sem limite nesse endpoint.

### 12. Enumeração de username/e-mail via `409` em `POST /auth/register`
- **Componente:** `chaveiro-bot/src/routes/auth.js` (tratamento de erro `P2002`, "Username já em uso"/"E-mail já em uso").
- **Motivo:** achado da revisão adversarial da remediação do EV-063 — endpoint diferente de `POST /auth/login`, fora do escopo do EV-063. Revela pré-autenticação que um username/e-mail já está cadastrado.
- **Impacto:** baixo — é um trade-off de UX comum em fluxos de cadastro (o usuário precisa saber que o identificador está ocupado antes de tentar de novo). Não revela senha, papel, nem dado de outra empresa.
- **Prioridade:** P4.
- **Retorna ao escopo:** se uma decisão de produto futura priorizar UX de cadastro sem confirmação de disponibilidade (ex.: sempre aceitar e enviar e-mail de "conta já existe" em vez de erro imediato).

### 13. `app.set('trust proxy', 2)` desalinhado com a topologia real do Railway
- **Componente:** `chaveiro-bot/src/app.js:37-41`.
- **Motivo:** achado da missão "EV-065" — o comentário do código descreve uma topologia (Caddy → nginx → backend, 2 hops) que corresponde ao guia de deploy self-hosted (`docs/DEPLOYMENT.md`), não à arquitetura real em produção (Railway + Cloudflare Pages + Supabase, confirmada por `README.md:402-405`, `docs/CI_CD.md` e teste direto contra `https://admai-production.up.railway.app`). Testado ao vivo (6 variações de `X-Forwarded-For`/`X-Real-IP` forjados, ver `EV065_VALIDATION_REPORT.md`): a borda do Railway sanitiza esses headers, então o desalinhamento numérico é **hoje inofensivo por comportamento da plataforma, não por configuração correta da aplicação**.
- **Impacto:** nenhum hoje (bypass de `req.ip` refutado por teste direto em produção). Risco latente: se a borda gerenciada mudar de comportamento, ou se o app migrar para uma borda que não sanitize (ex.: o próprio deploy VPS/Caddy de `docs/DEPLOYMENT.md`), o mecanismo do EV-065 volta a ser explorável exatamente como descrito.
- **Prioridade:** P3 (melhoria preventiva, não vulnerabilidade ativa).
- **Correção sugerida:** alinhar `trust proxy` à topologia real (ex.: `1` para uma borda gerenciada de hop único, com validação adicional se possível) ou documentar explicitamente por que `2` é intencional; revisar sempre que a infraestrutura de deploy mudar.
- **Retorna ao escopo:** automaticamente, **antes de qualquer deploy** que migre a arquitetura de produção para um modelo self-hosted (VPS + Caddy/nginx) ou qualquer topologia com número de hops diferente do atual — condição de retorno obrigatória, não opcional.

### 14. CVE em `ip-address` (dependência transitiva de `express-rate-limit`) — refutado, Categoria C
- **Componente:** `chaveiro-bot/package-lock.json` (`ip-address@10.2.0`), consumido só por `express-rate-limit@8.6.0` via `ipKeyGenerator`.
- **Motivo:** missão "EV-069", EDE completo (Gates 1-7). 3 avisos (`GHSA-mwp4-54f8-5fhr`/CVE-2026-69192 alta; `GHSA-4xrf-jv44-h6hh`/CVE-2026-69198 e `GHSA-22jq-vg5j-6vgg`/CVE-2026-54272 moderadas) sobre misclassificação de endereços IP para fins de SSRF/fronteira de confiança. Reproduzido que: (a) as 2 CVEs moderadas afetam métodos (`isPrivate`/`isLoopback`/`isLinkLocal`/`isCGNAT`/`isMulticast`/`isUnspecified`/`isULA`/`isBroadcast`/`isInSubnet`/`isHostInSubnet`/`getType`) que `ipKeyGenerator` NUNCA chama; (b) a CVE alta (`Address4.correctForm()`, alcançável só via `Address6.to4()`) é bloqueada antes do parsing malicioso por 2 camadas: `node:net.isIPv6()` rejeita o padrão de ataque (`::ffff:012.0.0.1`), e mesmo contornando isso, `Address6.parse4in6` da versão instalada já lança `AddressError: "IPv4 addresses can't have leading zeroes"` — reproduzido diretamente, não deduzido.
- **Impacto:** nenhum — risco teórico do advisory (SSRF via misclassificação) não é alcançável nesta aplicação, que só usa a biblioteca para agrupar chaves de rate-limit por subnet IPv6, nunca para decisão de confiança/acesso.
- **Prioridade:** P4 (nenhuma exploração possível confirmada; atualização é só housekeeping).
- **Correção sugerida (não implementada, sem urgência):** bump mecânico de `ip-address` 10.2.0→10.4.0 via lockfile — já dentro do range `^10.2.0` declarado por `express-rate-limit@8.6.0`/`8.6.2`, sem mudança em `package.json`.
- **Retorna ao escopo:** se `ipKeyGenerator` (ou qualquer código futuro) passar a chamar algum dos métodos de classificação (`isPrivate`/`isLoopback`/etc.) para uma decisão de segurança/acesso, ou se uma versão futura da biblioteca reduzir as camadas de validação que hoje bloqueiam o padrão de ataque.

### 15. Rotação de endereço IPv6 dentro/fora do `/56` ainda multiplica baldes de rate-limit
- **Componente:** `ipKeyGenerator` (`express-rate-limit`), usado por todos os limiters de `chaveiro-bot/src/middlewares/rateLimiters.js` e pelo limiter geral de `/api` (`app.js`).
- **Motivo:** achado da revisão adversarial (Gate 9) da missão "EV-070". Reproduzido: um atacante que controle um bloco IPv6 maior que `/56` (ex.: `/48`, comum em alocações residenciais/ISP) pode rotacionar entre sub-redes `/56` distintas e obter um balde de rate-limit novo a cada rotação — o `ipv6Subnet=56` (default da biblioteca) só agrupa DENTRO da mesma sub-rede.
- **Impacto:** baixo/aceito — é o comportamento padrão e já presente da própria biblioteca desde antes do EV-070 (o limiter geral de `/api`, que nunca teve o bug do EV-070, já usa exatamente o mesmo mecanismo). Não é uma regressão introduzida por nenhuma correção desta sessão.
- **Prioridade:** P3.
- **Correção sugerida:** avaliar um `ipv6Subnet` mais amplo (ex. `48`) se o perfil de ameaça justificar, ciente do trade-off de agrupar mais usuários legítimos no mesmo balde.
- **Retorna ao escopo:** se houver evidência de abuso real via rotação de bloco IPv6.

### 16. `authLimiter` (5/15min por IP) agora ativo em `/api/auth/login/2fa/recuperar` pode afetar múltiplos usuários legítimos atrás do mesmo NAT
- **Componente:** `chaveiro-bot/src/middlewares/rateLimiters.js` (`authLimiter`), herdado por prefix-match de `app.use('/api/auth/login', authIpLimiter, authLimiter)` (`app.js:128`) na rota `/api/auth/login/2fa/recuperar`.
- **Motivo:** efeito colateral intencional da correção do EV-070 — antes, o fallback por IP de `authLimiter` nunca colidia de verdade (bug do EV-070), então esse limiter estava efetivamente inerte nesta rota; agora funciona corretamente. Como a rota não está mapeada em `CAMPOS_POR_ROTA`, `identidadeDaRequisicao` sempre retorna `null` aqui, e o teto aplicado é sempre o de IP (5/15min, mais apertado que o de `authIpLimiter`, 30/15min).
- **Impacto:** disponibilidade — vários usuários legítimos recuperando 2FA atrás do mesmo IP corporativo/NAT na mesma janela de 15 min podem se bloquear mutuamente, mesmo usando desafios diferentes. Não é um bypass de segurança (é a proteção funcionando), mas o teto pode ser mais apertado do que o desejável para este cenário específico.
- **Prioridade:** P3.
- **Correção sugerida:** considerar uma extração de identidade própria para `/api/auth/login/2fa/recuperar` (ex.: hash do `desafio`) em vez de cair sempre no fallback por IP, ou avaliar se o teto de 5/15min é apropriado para essa rota especificamente.
- **Retorna ao escopo:** se houver relato real de usuários legítimos bloqueados nesse cenário.

## STG-INTEGRATION-FIXTURE-DESTRUCTION (backlog técnico — robustez, não vulnerabilidade)

`test/integration/helpers.js` TRUNCATE CASCADE sobre o banco apontado por DATABASE_URL; quando
apontado ao staging de aceitação, destrói fixtures E2E (provado 2026-08-27 no run real).
Correção: lifecycle isolado (schema/banco dedicado de integração, ou guard que recuse rodar a
suíte destrutiva quando `APP_ENV=staging` sem flag explícita `ALLOW_DESTRUCTIVE_INTEGRATION`).
Prioridade: antes do próximo ciclo de aceitação que reutilize staging.
