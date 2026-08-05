# EV063 Remediation Report — Vazamento de Informações em `POST /auth/login`

**Branch:** `fix/seguranca-criticos` · **Commits:** `3e88ef8`/`0405ab3` (Gate 1, reprodução), `e062a45` (Gate 3/4, correção do vazamento em corpo/status), `0d6cd37` (Gate 7, correção do canal lateral de timing) · **Missão:** continuação de "Security Closure Final", que concluiu Opção B bloqueada exclusivamente pelo EV-063.

## 1. Reprodução (Gate 1)

Construí um cenário reproduzível real (`test/integration/login_disambiguacao_leak.test.js`) contra o código **sem correção**, cobrindo os 8 casos exigidos. Não assumi o relatório anterior — reproduzi de novo e encontrei uma correção necessária na própria hipótese inicial: **a query do ramo telefone já filtrava `ativo:true`**, então um usuário inativo logando por telefone já caía no 401 genérico — o vazamento de mensagem distinta ("Usuário inativo", "Esta conta usa login social") só ocorria nos ramos `username`/`usuarioId` (confirmado via CI real, run que falhou exatamente onde a hipótese errada previa e revelou o padrão certo).

| Cenário | Status | Corpo | Senha verificada antes? |
|---|---|---|---|
| Telefone inexistente | 401 | `Credenciais inválidas` | — |
| Telefone existente, 1 conta, senha certa | 200 | token | Sim |
| Telefone existente, 1 conta, senha errada | 401 | `Credenciais inválidas` | Sim (falhou) |
| Telefone de conta inativa | 401 | `Credenciais inválidas` | — (query já filtrava) |
| **Username de conta inativa** | **401** | **`Usuário inativo`** | **NÃO — vazamento confirmado** |
| **Username de conta social** | **401** | **`Esta conta usa login social...`** | **NÃO — vazamento confirmado** |
| Telefone com 2+ empresas (candidatos > 1) | 200 | `{ desambiguacao: [{usuarioId, empresa}, ...] }` | **NÃO — vazamento original, confirmado por leitura de código (`auth.js:177-184`)** |
| Confirmação empírica: Postgres bloqueia 2 contas ativas c/ mesmo telefone | — | erro `P2002` | — |

Achado adicional de reprodutibilidade: `Usuario.telefone` ganhou `@unique` global na missão anterior (EV-057), aplicada no banco de teste do CI via `prisma migrate deploy`. Confirmei empiricamente que isso impede criar 2 contas ativas com o mesmo telefone **exato** via cadastro novo — mas (achado do Gate 7, ver §7) `variantesTelefone()` gera 2 strings distintas para o mesmo número lógico (com/sem 9º dígito), então o cenário de N candidatos continua estruturalmente possível mesmo com a constraint.

## 2. Causa raiz (Gate 2)

Em `chaveiro-bot/src/routes/auth.js`, `POST /auth/login`:
- Busca do usuário: 3 ramos (`usuarioId`/`username` via `findUnique`; `telefone` via `findMany`).
- Seleção de empresas: o ramo telefone decidia `desambiguacao` **imediatamente** ao achar >1 candidato — antes de `bcrypt.compare` (linha 202 do código original) sequer existir no fluxo desse ramo.
- Validação de senha: só acontecia depois de já ter resolvido `usuario` como um único registro — nunca era usada para decidir a desambiguação.
- Geração de sessão: inalterada, sempre operou sobre exatamente 1 `usuario` resolvido.

Causa raiz: o desenho original tratava "resolver o usuário" e "provar a senha" como etapas sequenciais e independentes, quando deveriam ser a mesma decisão atômica.

## 3. Arquitetura do novo fluxo (Gate 3)

Nova função pura `autenticarCandidatos(candidatos, password)` em `services/auth.js`: recebe os candidatos já resolvidos (0, 1 ou N) e só retorna os que estão **ativos**, **têm senha definida** e **cuja senha bateu**. `routes/auth.js` usa essa função uniformemente nos 3 ramos — a desambiguação só é revelada depois de a senha já ter sido comprovada em mais de uma conta (o caso legítimo real: mesma pessoa, mesmo telefone, mesma senha, empresas diferentes).

## 4. Justificativa técnica

- Prioridade 1 (nenhuma informação antes da autenticação): cumprida — todos os casos de falha (inexistente/inativo/social/senha errada) convergem para a mesma resposta.
- Prioridade 2 (compatibilidade): preservada — dono continua podendo logar em qualquer conta via `usuarioId`+senha após a desambiguação; o caso comum (mesma senha em 2 empresas) continua funcionando sem fricção nova.
- Prioridade 3 (menor alteração): 1 função nova + 3 ramos do handler reescritos para chamá-la, nada além disso.
- Prioridade 4 (reuso): reaproveita o padrão de hash dummy fixo já estabelecido no código.
- Prioridade 5 (sem duplicação): a lógica de comparação de senha existe em um único lugar agora, não replicada por ramo.

## 5. Arquivos modificados

- `chaveiro-bot/src/services/auth.js` — `autenticarCandidatos` (+ `HASH_DUMMY_TIMING`, `MAX_CANDIDATOS_TEMPO_CONSTANTE`).
- `chaveiro-bot/src/routes/auth.js` — `POST /auth/login` reescrito para usar `autenticarCandidatos`.
- `chaveiro-bot/src/services/__tests__/auth.test.js` — 11 testes novos (9 funcionais + 2 de tempo constante).
- `chaveiro-bot/test/integration/login_disambiguacao_leak.test.js` — reescrito: os casos que provavam o vazamento agora provam a correção, mais testes de rate limiter e seleção de empresa pós-autenticação.

## 6. Testes (antes/depois)

368→**379** testes unitários (backend), 132→**142** testes de integração — todos verdes via CI real (não local, sem Postgres nesta worktree). Ver §7 pros 2 testes deterministicos de tempo constante (contagem de chamadas via `vi.spyOn`, não wall-clock).

## 7. Revisão adversarial (Gate 7) — encontrou 1 vetor residual, corrigido no mesmo ciclo

Um agente `red-team-attacker` fresco (sem contexto desta conversa) tentou 6 vetores contra a correção do §3-6. Resultado:

| Vetor | Veredito |
|---|---|
| Enumeração por timing (N=0/1) | **ATACADO — achado real, ver abaixo** |
| Vazamento de 2FA pós-senha | Verificado sem achado (fora do escopo — 2FA só roda após senha provada) |
| Rate limiting (`skipSuccessfulRequests`) | Confirma comportamento pré-existente (não introduzido pelo EV-063); amplificava o achado de timing — mitigado ao fechar o timing (§ abaixo); registrado no backlog |
| `include:empresa` só no ramo telefone | Verificado sem achado (`findUnique` nunca retorna >1) |
| Vazamento de candidato entre empresas na sessão | Verificado sem achado |
| Vazamento por rota alternativa (`/auth/register`, `/auth/oauth`) | Achado novo e distinto, **fora do escopo do EV-063** (endpoint diferente) — registrado no backlog |

**Achado crítico do ciclo**: `bcryptjs` é JS puro (sem paralelismo real via thread nativa) — N chamadas de `bcrypt.compare` em `Promise.all` ainda serializam no mesmo thread. O tempo de resposta escalava quase linearmente com N (medido pelo red team e por mim, independentemente: N=1 ~370ms, N=2 ~745ms, N=3 ~1110ms) — vazando por **timing** exatamente a cardinalidade que a correção do §3 já tinha fechado no corpo/status. Retornei ao ciclo completo (hipótese → reprodução → causa raiz → correção → revalidação → nova revisão adversarial), conforme exigido pela missão.

**Correção** (commit `0d6cd37`): `autenticarCandidatos` sempre roda exatamente `MAX_CANDIDATOS_TEMPO_CONSTANTE=3` comparações bcrypt (reais + dummy até completar o piso) — tempo igual para N=0,1,2,3. Acima de 3 (cenário atípico, telefone com 4+ contas), o tempo volta a escalar — resíduo aceito, severidade muito baixa (só revela "mais de 3", não a contagem exata nem identidade).

**Segunda rodada de revisão adversarial** (agente fresco, validação estatística independente — 3 rodadas de medição, incluindo ordem intercalada para eliminar viés de aquecimento, teste t de Welch): confirmou que a diferença entre N=0,1,2,3 não é estatisticamente significativa em nenhum par (todos `|t|<2`), e que a magnitude do ruído (~20-60ms) é uma ordem de grandeza menor que o custo de um `bcrypt.compare` real (~370-400ms) — inexplorável via rede. Também descartou o vetor de cost-factor divergente entre hash real e dummy (todos os pontos de criação de senha usam `bcrypt.hash(senha, 12)`, igual ao dummy) e confirmou zero regressão funcional.

## 8. Regressão (Gate 6)

CI real, ambos os commits (`e062a45`, `0d6cd37`): `backend` (lint, typecheck, prettier, 379 testes unitários, 142 testes de integração com Postgres real, auditoria de dependências), `frontend` (inalterado, verde), `docker-build`, `codex-policy` — todos `success`. Workflow `Security` (Semgrep, gitleaks, `npm audit`) — `success` em ambos.

## 9. Impacto sobre a frente de segurança (Gate 8)

O EV-063 (único bloqueador Categoria A conhecido, per `SECURITY_CLOSURE_FINAL_REPORT.md`) está **completamente eliminado**: o vazamento original (corpo/status) e o vazamento residual descoberto na própria revisão adversarial desta missão (timing) foram ambos corrigidos, testados e revalidados por 2 rodadas independentes de revisão adversarial.

Dois novos itens Categoria C (não bloqueiam, movidos ao Security Hardening Backlog):
- Amplificação de rate-limit via respostas 200 não-finais (`skipSuccessfulRequests`) — pré-existente, seu principal vetor de exploração (o canal de timing) já foi fechado.
- Enumeração de username/e-mail via `409` em `POST /auth/register` — endpoint diferente, trade-off de UX comum, fora do escopo do EV-063.

Reavaliando toda a frente com as evidências já existentes + as desta missão: **nenhum item Categoria A permanece aberto.** Todos os itens Categoria B das missões anteriores já foram resolvidos (billing/google). Todos os itens Categoria C estão devidamente registrados no `SECURITY_HARDENING_BACKLOG.md`, com justificativa de por que não bloqueiam.

## 10. Parecer Final

## Opção A — EV-063 ENCERRADO

O EV-063 foi completamente eliminado — evidência: reprodução real (Gate 1), correção do vazamento em corpo/status (commit `e062a45`, CI real 132/132 testes de integração), revisão adversarial que encontrou e forçou a correção de um vetor residual de timing (commit `0d6cd37`), segunda revisão adversarial independente confirmando estatisticamente (teste de Welch, 3 rodadas) que o canal de timing está fechado dentro do piso de 3 candidatos, e CI completo verde nos dois commits.

# Frente de Segurança ENCERRADA

Justificativa, exclusivamente por evidências:
- Nenhum bloqueador Categoria A resta — o único conhecido (EV-063) está eliminado, incluindo o vetor residual descoberto durante a própria remediação.
- Todos os itens Categoria B das missões anteriores (billing/google) já foram resolvidos com evidência real de CI.
- Todos os itens Categoria C (TOCTOU de baixa severidade em `admin.js`, `react-router` sem sink alcançável, corrida de aceite duplo de convite, `/uploads` público, abuso de cadastro já mitigado/aceito, dependências de build não exploráveis, amplificação de rate-limit e enumeração via `/auth/register`) estão registrados e justificados no `SECURITY_HARDENING_BACKLOG.md` — nenhum deles é, por definição desta missão, motivo para não encerrar.
- CI, Semgrep e Gitleaks verdes em todos os commits desta e das 3 missões anteriores.
