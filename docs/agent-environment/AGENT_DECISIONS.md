# Registro de decisoes dos agentes

Use este ledger somente quando uma missao nao possuir plano ou contrato ativo. Decisoes registradas no documento ativo nao devem ser duplicadas aqui.

## Campos obrigatorios

| Campo | Conteudo |
| --- | --- |
| `DECISAO_ID` | Identificador unico e estavel. |
| `MISSAO` | Missao previamente autorizada pelo usuario. |
| `EVIDENCIAS` | Referencias verificaveis a codigo, testes ou documentos. |
| `POSICAO_CLAUDE` | Solucao proposta pelo writer. |
| `POSICAO_CODEX` | Parecer do Decisor. |
| `DECISAO_FINAL` | Consenso ou veredito arbitral aplicado. |
| `THREAD` | Identificador da conversa do Decisor ou Arbitro. |
| `IMPACTO` | Arquivos, contratos ou riscos afetados. |
| `TESTES` | Validacoes obrigatorias e respectivos resultados. |

## Registros

### D-F05-REV-01 — revisao do runway V2 · 2026-08-23

| Campo | Conteudo |
| --- | --- |
| `DECISAO_ID` | D-F05-REV-01 |
| `MISSAO` | F0.5 do programa aprovado: dossie de runway com PREPARE_NOW/DEFER sob a regra das 7 condicoes; revisao Codex obrigatoria antes do gate. |
| `EVIDENCIAS` | docs/eos-v2/ADMAI_V2_RUNWAY_DOSSIER.md @ 4a3ff2e; verificacoes linha a linha dos tres achados ANTES de aceitar (idempotencia marca-antes-de-processar; toFixed(2)+Float na comissao; piso stale no estoque com sabotagem reproduzindo -11). |
| `POSICAO_CLAUDE` | Zero fundacoes; area 2 como invariante documentada; #8 defer com recuperacao por divisao; #10 'ja feito'. Na rodada de evidencia: remedio menor para a idempotencia (desmarcar-na-falha) em vez de tabela duravel. |
| `POSICAO_CODEX` | CORRECOES_NECESSARIAS: 3 ALTA (perda de evento por marca-antes; divisao nao reconstitui taxa + Float monetario e ARCHITECTURAL_RISK; ledger de estoque prometia atomicidade que nao entregava) + 2 MEDIA (numeros 12/4; availability e pre-requisito nominal; multiunidade sem fail-closed real). Na rodada de evidencia: CONCORDO com o remedio menor, corrigindo minha invariante (flush FAVORECE retry) e exigindo timeouts para o fail-open ser declaravel + testes obrigatorios. |
| `DECISAO_FINAL` | Tres correcoes de produto implementadas como fatias proprias fora de F0.5 (FIX-IDEMP-PERDA, FIX-COMISSAO-SNAPSHOT, FIX-ESTOQUE-CORRIDA), cada uma com sabotagem provando que o teste morde; dossie absorve as MEDIA; recepcao duravel e conversao decimal ficam como preparacao V2 com gatilho registrado no ledger. |
| `THREAD` | Codex REVISOR 01a02cf7-842a-7e10-941e-3a7322620802 (+ rodada unica de evidencia na mesma thread) |
| `IMPACTO` | services/idempotencia.js (+desmarcar, timeouts), routes/billing.js, services/inbound.js, services/estoque.js (FOR UPDATE), schema+migracao comissaoTaxaAplicada, dossie. Dois defeitos MEUS pegos pelas sabotagens no caminho: enableOfflineQueue:false anulava a primeira marca de cada processo; assert =4 no teste de rajada sobre-especificava a ordem do escalonador. |
| `TESTES` | webhook_idempotencia_perda 6/6 com dupla sabotagem; estoque_concorrencia 3/3 x6 execucoes com sabotagem -11; servico_comissao_snapshot 2/2 com o caso aritmetico exato; vizinhos: inbound_idempotencia 7/7, billing 7/7, aprovacao_rejeicao 12/12, idor_escrita 7/7. |

### D-F0-02-RUNTIME-SIDE-EFFECT — 2026-08-23

| Campo | Conteudo |
| --- | --- |
| `DECISAO_ID` | D-F0-02-RUNTIME-SIDE-EFFECT |
| `MISSAO` | F0-02 do programa de release aprovado pelo usuario em 2026-08-23 (plano fora do repo; este ledger e o fallback designado). Gate distingue efeito de runtime da aplicacao de escrita de engenharia na dimensao de artefatos ignorados. |
| `EVIDENCIAS` | uploads-docs=107 / uploads-ponto=68 gravados pela aplicacao nas suites de integracao; produtores server-side com randomUUID(): documentos.js:54-56, tecnicos.js:110-142, inbound.js:321 e estoque.js:128 (este ultimo OMITIDO na minha evidencia e apontado pelo Decisor — verificado antes de implementar). Licao docs/eos-v2/CONTROLE_ARTEFATO.md: allowlist invisivel cega o detector. |
| `POSICAO_CLAUDE` | Opcao B: raiz + forma de nome, classe propria nao-bloqueante sempre visivel. |
| `POSICAO_CODEX` | RESULTADO: CONCORDO (confianca ALTA), com restricoes: UUID v4 ESTRITO (nao o permissivo [0-9a-f-]{36}); somente filhos diretos das raizes; criacao/alteracao/remocao pela mesma regra; listas estruturadas completas preservadas; precedencia bloqueante mantida em resultado misto; limite registrado (nome uuid forjado passa — modelo nao-adversarial ja aceito). Rejeitou A (larga demais, .gitignore 2.0 com relatorio) e C (acoplamento invertido: mudar a aplicacao para servir o instrumento). |
| `DECISAO_FINAL` | B com as restricoes do Decisor, integralmente aplicadas. |
| `THREAD` | Codex DECISOR 01a02cd7-85be-7ca1-9d9e-684815fe10cd |
| `IMPACTO` | tools/admai-delivery/write-set-gate.mjs: FORMAS_DE_RUNTIME + ehEfeitoDeRuntime() + particao em compararRodada + campo efeitosDeRuntime no resultado e no relatorio. Nenhuma mudanca em chaveiro-bot/src (call sites sao proveniencia somente leitura). |
| `TESTES` | 12 controles novos no selftest (121/121): 4 formas validas nao bloqueiam e aparecem na lista; manual.txt/near-misses (versao, variante, extensao, subdiretorio) bloqueiam; caso misto reporta ambos com classe bloqueante prevalecendo; misto com UNDECLARED_WRITE de fonte preserva a classe de fonte; alteracao e remocao cobertas; nome runtime-shaped fora da raiz sem isencao; controle explicito de produto-<uuid>. |

## D-SL15-TECNICOS-DIRECAO (2026-08-23)

- **Missão**: SL-15 do programa de release — /tecnicos, única REDESIGN do inventário ("por medida, não por gosto").
- **Evidências**: sonda com "Ana Técnica"→"An…" e COMISSÃO/PENDENTE truncando em 1440 E 1920; anatomia do card (uma linha disputada por avatar+nome+2 badges+2 ações; 4 mini-KPIs truncando); grade lg:2/xl:3 com célula ~430px; mobile medindo limpo.
- **Posição Claude**: direção B (reflow do card, grade 2 colunas, clamp nos KPIs) — menor diff que atende os critérios medidos; A (tabela) = peso sem ganho para equipes 1-15; C muda mobile limpo.
- **Posição Codex (DECISOR, thread 01a02e86)**: CONCORDO, confiança ALTA, com correção factual (shell max-w-6xl limita células; morre a trilha xl) e bateria obrigatória (sonda 1440/1920 zero, geometria computada, capturas 4 vp, axe, suíte/lint/format/diff, REVISOR delta).
- **Decisão final**: B, implementada com dois desvios da restrição "exclusivamente desktop", ambos por defeito MEDIDO no mobile: (a) KPI 2×2 abaixo de sm ("COMISSÃO" é palavra única e truncava em ~70px); (b) flex-wrap em todos os viewports — a versão fiel à restrição media card de 456px num viewport de 360 (conteúdo clipado inalcançável, botões em 389/439px); com wrap: 344/360 e 374/390.
- **Revisão (REVISOR delta, thread 01a02e93)**: APROVADO; desvios "locais, reversíveis e sustentados por medições", sem retorno ao DECISOR; pediu registrar que "exclusivamente desktop" deixou de ser literal — feito aqui.
- **Impacto**: /tecnicos zera truncamento nos 4 viewports; geometria @1920 = 2 trilhas de 440px sem trilha vazia; GAP-UX-DESKTOP-LARGURA-01 fecha 6/6.
- **Testes**: suíte 247/247; axe 14/14 (caso novo com nome longo); sonda 4 vp zeros; contenção mobile por CDP; eslint/prettier/diff-check limpos.
- **Risco residual (do revisor)**: axe/jsdom não valida geometria; reforço futuro não bloqueante = caso CDP com nome longo em 1024/1440.

## D-GATE6-CODEX-UNAVAILABLE (2026-08-23)

- **Contexto**: Gate 6 adversarial (thread 01a02fb6). Rodada 1 achou 3 bloqueantes + 1 P2; rodada 2 confirmou paywall e emissores de sessão FECHADOS no código, mas apontou revogação-após-credencial incompleta (bloqueante mais fundo) + testes que não mordiam + P2 residual.
- **Correções aplicadas e auto-verificadas** (commits 2f39055, f78d947): revogação de refresh na RAIZ (/auth/refresh rejeita refresh anterior a tokenValidoApos — cobre os 4 fluxos de credencial), reset transacional, /usuarios/:id-senha avança o corte, testes com rota real (sabotagem confirma que mordem), ramo phone2fa coberto, paused em ESTADOS_VIVOS. 8/8 + 39 de regressão verdes.
- **Indisponibilidade**: a rodada 3 (chancela da correção de raiz) NÃO foi obtida — Codex retornou "You've hit your usage limit ... try again at Aug 27th, 2026". Evidência objetiva, não fallback silencioso.
- **Decisão**: Gate 6 NÃO é auto-aprovado (gate adversarial existe para um segundo par de olhos hostil; auto-aprovar violaria a governança). Fica `VERIFICATION_REQUIRED` com revisita "Codex disponível (limite reseta 2026-08-27)". As correções em si estão feitas, verificadas contra o código e provadas por testes que mordem — o que falta é a chancela externa da rodada final.
- **Impacto no terminal**: o proposal `USER_DECISION_PROPOSAL` lista o Gate 6 como "2 rodadas adversariais fecharam paywall+emissores; correção de raiz da revogação aplicada e testada; rodada 3 de chancela pendente por quota". Não altera os 7 bloqueios D2 nem o veredito condicional.

## D-STG-SEC-RLS-01 (2026-08-24)

- **Missão**: amendment STAGING SECURITY — reconciliar o Finding BLOQUEANTE `STG-SEC-RLS-01` (26 tabelas `public` do admai-staging com RLS DISABLED + grants full de `anon`/`authenticated`; Advisor `rls_disabled_in_public` ERROR/EXTERNAL). Definir o boundary de acesso e produzir artefato versionado reproduzível. Produção intocada; `PRODUCTION_RLS_STATE = UNKNOWN`.
- **Evidências**: ADMAI_DATABASE_ACCESS_MODEL (auditoria determinística do repo) — as 26 são PRISMA_ONLY; Storage via service-role server-side (só `.storage.from`); frontend sem `@supabase/*`; `env.js` sem `SUPABASE_ANON_KEY`; zero `supabase.from`/`.rpc`/`/rest/v1`. `anon`/`authenticated` NÃO usados ⇒ revogar tem risco de compat ZERO. `enable_rls.sql` existente cobre só 12 tabelas (isolamento inter-tenant) e não revoga anon/authenticated ⇒ não fecha este finding.
- **Posição Claude**: opção C ancorada em B — REVOKE integral de anon/authenticated/PUBLIC + ENABLE RLS (NO FORCE, sem policy) nas 26.
- **Posição Codex (DECISOR, thread 01a03164)**: RESULTADO CONCORDO, confiança ALTA. Precisões vinculantes: REVOKE alcança tabelas/views/colunas/sequences/**routines** (EXECUTE herdado por PUBLIC) + `REVOKE ALL ON SCHEMA public FROM anon, authenticated` + `REVOKE CREATE ON SCHEMA public FROM PUBLIC` (NÃO revogar USAGE de PUBLIC — blast radius) + `ALTER DEFAULT PRIVILEGES FOR ROLE` (por criador de DDL, não sem FOR ROLE); RLS `NO FORCE`, sem policy, com guard de zero policies preexistentes (senão PARA); não tocar owner/`service_role`/roles Supabase; `enable_rls.sql` intacto; **gate**: não trocar `DATABASE_URL_APP` p/ role NOBYPASSRLS sem matriz completa de policies. 7 grupos de testes obrigatórios (preflight, pós-condições, defaults, negative controls SQL, negative controls PostgREST com anon key, positive controls, closure via Advisor).
- **Decisão final**: C ancorada em B, integralmente. Artefato: `chaveiro-bot/prisma/rls/lockdown_public_access.sql` + `verify_lockdown.sql` + `scripts/staging-rls-negative-control.mjs` + `RUNBOOK_lockdown.md`.
- **Validação local determinística** (Docker admai-pg-test, Postgres 16.15 — NÃO staging/prod): reproduziu o buraco (defaults injetados p/ anon/authenticated + anon SELECT Usuario=true), aplicou o lockdown e verify A–E **todos PASS** numa transação revertida. Ambiente devolvido pristino. Bugs achados e corrigidos no processo: `||` com literal cru (array ambíguo) em B2; Part E precisava de USAGE de schema temporário; Part C reescrita para checar grant EXPLÍCITO a anon/authenticated (o built-in PUBLIC de function-execute NÃO é suprimível por ADP em PG15/16 — residual aceito, app não cria functions em public); exception handler do ADP restrito a `insufficient_privilege` (não mascarar bug).
- **Impacto**: fecha a parte NO_REPOSITORY do amendment. Aplicação no admai-staging + negative-control com anon key + re-run do Advisor + Codex REVISOR = BLOCKED_CAPABILITY (credenciais de staging ausentes). Finding permanece ABERTO até proteção existir + negative control morder + fluxo backend funcionar no staging real.
- **Testes**: verify A–E PASS local; completion-ledger 4/4 (84 itens); prefixo de finding `STG-SEC-` registrado.
- **Revisão (Codex REVISOR, thread 01a03185, VEREDITO CORRECOES_NECESSARIAS)**: 6 achados, todos endereçados e re-validados contra PG16 local. **F1** grants por coluna — `REVOKE ALL` já os remove (verificado true→false); verify agora prova com `has_any_column_privilege`. **F2** residual PUBLIC-execute NÃO era inevitável — ADP **global** (sem `IN SCHEMA`) `REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` suprime o built-in (verificado: proacl `{owner=X/owner}`); residual **FECHADO**; Part C/D provam EXECUTE negado. **F3** cobertura de criadores de DDL ampliada (owners de todas relkinds+sequences+routines + `defaclrole`) + check de catálogo escopado. **F4** guard vinculado à conexão real: `scripts/apply-rls-lockdown.mjs` reusa as travas de `validate-staging.mjs` (ALLOW_STAGING_WRITES + STAGING_REF==ref + PROD_HOST_BLOCKLIST + porta). **F5** negative-control de mutação exige 401/403/404 (não qualquer não-2xx). **F6** B2 checa grant direto de schema + A2 zero-policies pós-condição + rollback executável com as 26. Re-validação local A/A2/B/B2/C/D/E todos PASS. Pendente: **Codex DELTA REVIEW** das correções; depois aplicação no staging (BLOCKED_CAPABILITY).
- **Trade-off registrado (F2)**: o ADP global remove o default de EXECUTE a anon/authenticated/PUBLIC para functions futuras dos roles criadores em qualquer schema (nunca do owner/`service_role`). Aceitável: AdmAi é PRISMA_ONLY e não depende de EXECUTE por PUBLIC/anon.
- **DELTA 2 (thread 01a03185)**: escopo do conjunto de criadores — DELTA apontou que incluir todo `defaclrole` puxava roles internos de Auth/Storage (blast radius). Restringido a owners de `public`; fail-open→**FATAL**; sets de apply/verify alinhados; catálogo filtrado a global/`public`. DELTA-2 então apontou que o conjunto ficou incompleto (perdia role com default global/`public` expondo anon sem objeto atual) → conjunto final = owners de `public` + `current_user` + `defaclrole` FILTRADO a namespace global(0)/`public`, idêntico em apply e verify. Ledger F3 corrigido.
- **VEREDITO FINAL (Codex REVISOR, thread 01a03185): APROVADO**. Sem achados remanescentes no artefato/repo; `enable_rls.sql` intacto. O finding `STG-SEC-RLS-01` permanece **ABERTO** (BLOCKED_CAPABILITY) — fecha apenas após os gates REAIS no `admai-staging`: aplicação (`scripts/apply-rls-lockdown.mjs`) + verify + negative control com anon key + positive control do backend + re-run do Security Advisor. Total: DECISOR + REVISOR + 3 deltas.

## D-FE-STRUCT-LIMITER-2FA (2026-08-24)

- **Missão**: workstream ADMAI-FE-STRUCTURAL-01. Achado REAL de produto durante a caça a uma falha intermitente da jornada E2E de 2FA (5 rodadas de investigação instrumentada).
- **Evidências**: `app.use('/api/auth/login', authIpLimiter, authLimiter)` (app.js:132) casava por prefixo também `/login/2fa`, `/login/2fa-telefone` e `/login/2fa/recuperar`; nessas subrotas `identidadeDaRequisicao` não mapeia campos (CAMPOS_POR_ROTA) ⇒ authLimiter degradava para balde POR IP de 5 falhas/15min COMPARTILHADO entre login e 2FA. Prova viva: 7 POSTs com desafios DISTINTOS → 401,401,429×5. Consequência real: falha de senha de uma pessoa bloqueava o 2FA do IP inteiro (cross-flow lockout via NAT) — contra os DOIS designs documentados (twoFactorLimiter por DESAFIO; authIpLimiter "folgado de propósito" p/ não bloquear escritório). Era a causa raiz das falhas intermitentes da jornada (o texto era "Muitas tentativas", não "Código inválido"; o painel de marketing do próprio Login mascarava a tela no diagnóstico).
- **Posição Claude**: opção A — mount EXATO (`app.post('/api/auth/login', authIpLimiter, authLimiter)` sem handler terminal); 2FA fica só com o twoFactorLimiter dedicado + limiter global de /api. Não enfraquece nada: mint de desafio novo continua atrás dos limiters na porta de credenciais; desafio expira em 5min; brute force de OTP segue 5/desafio/15min.
- **Posição Codex (DECISOR, thread `01a0346e`)**: RESULTADO CONCORDO, confiança ALTA. Precisões: incluir `/2fa/recuperar` na análise (continua sob twoFactorLimiter por prefixo de `/login/2fa`); não alterar configs/chaves/mensagens dos limiters; NÃO mudar o E2E para aceitar 429; bateria de testes obrigatórios (desafios distintos sem 429; mesmo desafio 429 na 6ª com a mensagem do twoFactorLimiter; falhas de senha não contaminam 2FA; /login exato segue 429 por identidade; recuperar coberto).
- **Decisão final**: A, implementada. `chaveiro-bot/src/app.js` (1 linha + comentário) + teste novo `test/integration/limiter_2fa_dedicado.test.js` (5 casos, todos os obrigatórios).
- **Sabotagem (o teste morde)**: revertendo o mount para `app.use` (prefixo), 3 dos 5 casos FALHAM (429 em desafios distintos); restaurado → 5/5.
- **Testes**: 5/5 novo + 36/36 nas 6 suítes de auth colaterais (auth, recuperacao_2fa, conta_2fa_fluxo_completo, login_disambiguacao_leak, seguranca_baratos). E2E 9/9 na validação final.
- **Impacto**: remove o cross-flow lockout (disponibilidade em NAT) e restaura o design documentado; nenhuma mudança em 2FA/refresh/rotação/UI.

## D-STG-MIG-EXTERNAL-APPLY (2026-08-24)

- **Missão**: STG-MIG-RECON — evidência externa real refutou a hipótese de history vazia: `admai-staging` tem 23/28 migrations aplicadas (nomes/ordem idênticos ao repo; última `20260707000001`, 2026-07-10) e `DocumentoTecnico` ausente ⇒ `STAGING_SCHEMA_BEHIND_REPOSITORY`, finding `STG-MIG-SCHEMA-LAG-01`. Decidir como o executor externo (SQL puro via integração Supabase, sem Prisma CLI) aplica as 5 pendentes preservando `_prisma_migrations` reconhecível pelo Prisma.
- **Evidências**: inventário determinístico dos 28 diretórios + leitura integral dos 5 SQLs pendentes (todas aditivas, DDL transacional, zero DML/drop; `usuario_telefone_unique` com pré-condição de dados); estrutura real da `_prisma_migrations` do staging fornecida externamente; SHA-256 canônicos (blob git LF) computados — 4 dos 5 arquivos estão CRLF no checkout Windows (hash on-disk ≠ canônico).
- **Posição Claude**: opção A — transação única por migration (SQL integral + INSERT na history), fail-closed em cadeia.
- **Posição Codex (DECISOR, thread `01a034d7`)**: **DISCORDO na justificativa, mesma direção** → decisão vinculante **A-prime**: a premissa "é exatamente o deploy, atômico" era incorreta (Prisma no PostgreSQL NÃO garante transação do script inteiro); o protocolo externo é MAIS atômico que o nativo. Precisões vinculantes: advisory lock `pg_try_advisory_xact_lock(72707369)` por transação; preflight das 23 (nomes/ordem/checksums/sem linhas falhas ou rolled-back); pré-condição de telefones duplicados bloqueia a cadeia inteira; um único batch por migration (`BEGIN→lock→precondições→SQL→INSERT→COMMIT`); INSERT só pós-sucesso com `id`=UUID v4 novo, `checksum`=SHA-256 hex dos bytes **LF canônicos** (validou os 5 valores — conferidos deterministicamente por mim contra os blobs git, batem 5/5), `applied_steps_count=1`, `started_at` estritamente crescente, `finished_at>=started_at`; `BEGIN/COMMIT/lock/INSERT` fora do checksum; failure recovery por inspeção history+catálogo (nunca history isolada, nunca replay cego); `migrate status`/`migrate diff --exit-code` como prova final quando houver CLI; lockdown RLS só depois.
- **Decisão final**: A-prime, integralmente, materializada em `docs/eos-v2/STG_MIG_RECON_EXTERNAL_APPLY_PACKAGE.md` (checksums canônicos das 28 + análise por migration + protocolo + recovery). Arquivos canônicos LF exportados do blob git para anexo (byte-exatos, conferidos).
- **Impacto**: STG-MIG-RECON → IN_PROGRESS/EXTERNAL_RECON_REQUIRED; STG-SEC-RLS-01 → BLOCKED_DEPENDENCY(STG-MIG-RECON) além de READY_FOR_EXTERNAL_APPLY; lockdown congelado (NÃO fazer variante 25 tabelas). Nenhuma aplicação por Claude; produção intocada.
- **Testes**: verificação determinística dos 5 checksums do Decisor contra os blobs (5/5); ledger 4/4 (97 itens); prefixo `STG-MIG-` registrado (selftest 11/11).
