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
