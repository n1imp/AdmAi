# Pipeline Orchestration — Idea Engineer
*Especificação de pré-execução, estado e fluxo de controle do Artifact*

---

## 1. Visão geral do fluxo

```
USUÁRIO
  ├── ideia (texto)
  ├── arquivos do projeto (opcional)
  └── contexto adicional (texto livre)
        ↓
[ PRÉ-FILTRO ]  ← responsabilidade do Artifact, antes de qualquer agente
        ↓
[ FASE 0 — Context Analyst ]
        ├── COMPLETE → segue
        └── NEEDS_INPUT → renderiza perguntas → resposta → reinvoca
        ↓
[ FASE 1 — Business Strategist ]
        ├── COMPLETE com verdict=proceed → segue
        ├── COMPLETE com verdict=proceed_with_pivot → aguarda decisão do usuário
        ├── COMPLETE com verdict=stop (halt_pipeline=true) → aguarda decisão do usuário
        └── NEEDS_INPUT → renderiza perguntas → resposta → reinvoca
        ↓
[ FASE 2 — Tech Architect ]
        └── COMPLETE → segue
        ↓
[ FASE 3 — Synthesis ]
        └── COMPLETE → entrega 2 prompts finais
```

Tudo entre [colchetes] é executado pelo Artifact (chamadas separadas à API do Claude). Tudo fora é interação com o usuário.

---

## 2. Pré-filtro de contexto antes da Fase 0

### 2.1 Por que filtrar

A Fase 0 não precisa do código inteiro. Precisa do que **revela decisões e estrutura** — manifests, configs, docs, e amostras de código de referência. Em projetos > 10k LOC, mandar tudo inline estoura contexto e degrada a qualidade da análise (o agente se afoga em ruído).

O pré-filtro é responsabilidade do **Artifact**, não do agente. Roda em JavaScript no cliente, antes de montar o input da Fase 0.

### 2.2 Orçamento de tokens

Meta: **~20.000 tokens** para o input completo da Fase 0 (system prompt + user message com arquivos).

| Categoria | Budget | Estratégia |
|---|---|---|
| Tree (estrutura de pastas) | 2k | Limitar a depth ≤ 4 e ≤ 200 linhas; ignorar dirs em blocklist |
| Manifests | 3k | Conteúdo completo de todos encontrados |
| Config files | 3k | Conteúdo completo (exceto `.env` real, nunca incluir) |
| READMEs e ADRs | 3k | README root completo; nested truncados a 50 linhas |
| Entry points | 2k | Conteúdo completo dos principais |
| Code samples | 5k | 3-5 arquivos source aleatórios, truncados a 100 linhas |
| Margem de segurança | 2k | Cabeçalho/instruções variáveis |

Se uma categoria estoura, trunca; se sobra, redistribui para code samples.

### 2.3 Listas explícitas

**Tier 1 — Sempre incluir, conteúdo completo:**

*Manifests:*
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `lerna.json`
- `requirements.txt`, `requirements-dev.txt`, `pyproject.toml`, `Pipfile`, `setup.py`
- `Gemfile`, `composer.json`, `go.mod`, `Cargo.toml`
- `pom.xml`, `build.gradle`, `build.gradle.kts`, `settings.gradle`
- `mix.exs`, `Project.toml`, `pubspec.yaml`

*Config / Infra:*
- `.env.example`, `.env.sample` (**NUNCA** `.env`, `.env.local`, `.env.production`)
- `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `.dockerignore`
- `next.config.{js,ts,mjs}`, `vite.config.{js,ts}`, `nuxt.config.ts`, `astro.config.mjs`, `svelte.config.js`, `remix.config.js`
- `tsconfig.json`, `jsconfig.json`, `tailwind.config.{js,ts}`
- `vercel.json`, `netlify.toml`, `fly.toml`, `railway.json`, `render.yaml`, `app.yaml`, `Procfile`, `serverless.yml`
- `prisma/schema.prisma`, `drizzle.config.ts`, `knexfile.js`, `sequelize.config.js`
- `terraform/*.tf` (até 5 primeiros), `pulumi/Pulumi.yaml`

*CI/CD:*
- `.github/workflows/*.yml` (até 3 primeiros)
- `.gitlab-ci.yml`, `.circleci/config.yml`, `bitbucket-pipelines.yml`, `azure-pipelines.yml`

*Docs estruturantes:*
- `README.md` (root)
- `ARCHITECTURE.md`, `CONTRIBUTING.md`
- `decisions/*.md`, `docs/adr/*.md`, `adr/*.md`

**Tier 2 — Incluir se houver budget, conteúdo completo:**

*Entry points por convenção:*
- `src/index.{js,ts,py,go,rb}`, `src/main.{js,ts,py,go,rb}`, `src/app.{js,ts}`
- `app/page.tsx`, `app/layout.tsx`, `pages/_app.{js,tsx}`, `pages/index.{js,tsx}`
- `app.py`, `main.py`, `manage.py`
- `Application.{java,kt}`, `Main.{java,kt}`

**Tier 3 — Sample aleatório, conteúdo truncado a 100 linhas:**

3-5 arquivos source dentro de:
- `src/`, `app/`, `lib/`, `components/`, `pages/`, `routes/`, `api/`
- `models/`, `controllers/`, `services/`, `handlers/`

Prioriza arquivos > 50 LOC (sinal de código real, não scaffold). Cada arquivo truncado leva flag `truncated: true` no payload.

**Nunca incluir:**

*Dependências e builds:*
- `node_modules/**`, `vendor/**`, `.venv/**`, `venv/**`, `__pycache__/**`
- `target/**`, `dist/**`, `build/**`, `out/**`, `.next/**`, `.nuxt/**`, `.svelte-kit/**`, `.turbo/**`, `.parcel-cache/**`
- `coverage/**`, `.nyc_output/**`

*Lock files (grandes e ruidosos):*
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`
- `Gemfile.lock`, `composer.lock`, `go.sum`, `Cargo.lock`, `poetry.lock`

*VCS e ambiente:*
- `.git/**`, `.svn/**`
- `.env`, `.env.local`, `.env.production`, `.env.development` (segredos)
- `.DS_Store`, `Thumbs.db`

*Binários:*
- Imagens (`.png`, `.jpg`, `.gif`, `.webp`, `.svg` > 5KB, `.ico`)
- Fontes (`.woff`, `.woff2`, `.ttf`, `.otf`)
- Vídeo/áudio, arquivos compactados, PDFs
- `.snap` (snapshots de teste), `*.log`, `*.tsbuildinfo`

### 2.4 Pseudo-código do pré-filtro

```typescript
function preFilter(uploaded: UploadedFile[]): PhaseZeroFiles {
  const BUDGET_TOKENS = 20_000;
  let used = 0;

  // Tree (sempre)
  const tree = buildTree(uploaded, {
    maxDepth: 4,
    maxLines: 200,
    ignoreDirs: BLOCKLIST_DIRS,
    ignoreFiles: BLOCKLIST_PATTERNS
  });
  used += tokenCount(tree);

  const files: PhaseZeroFile[] = [];

  // Tier 1 — manifests + configs + CI + docs estruturantes
  const tier1 = uploaded
    .filter(f => isTier1(f.path))
    .sort(tier1Priority);
  for (const f of tier1) {
    const tk = tokenCount(f.content);
    if (used + tk > BUDGET_TOKENS) break;
    files.push({ path: f.path, content: f.content });
    used += tk;
  }

  // Tier 2 — entry points
  const tier2 = uploaded.filter(f => isEntryPoint(f.path));
  for (const f of tier2) {
    const tk = tokenCount(f.content);
    if (used + tk > BUDGET_TOKENS) break;
    files.push({ path: f.path, content: f.content });
    used += tk;
  }

  // Tier 3 — samples truncados
  const tier3Candidates = uploaded
    .filter(f => isSourceFile(f.path) && !files.some(x => x.path === f.path))
    .filter(f => f.content.split('\n').length >= 50);
  const samples = pickRandom(tier3Candidates, 5);
  for (const f of samples) {
    const truncated = truncateLines(f.content, 100);
    const tk = tokenCount(truncated);
    if (used + tk > BUDGET_TOKENS) break;
    files.push({ path: f.path, content: truncated, truncated: true });
    used += tk;
  }

  return { tree, files, total_tokens: used };
}
```

Implementação em JS no Artifact. `tokenCount` pode usar `tiktoken` via CDN ou uma estimativa simples (`chars / 4`) — a estimativa simples é suficiente para o filtro, com margem de segurança no budget.

### 2.5 Quando o usuário não sobe arquivos

Pula o pré-filtro inteiro. Input da Fase 0:

```json
{
  "project_files": { "tree": null, "files": [] }
}
```

A Fase 0 vai detectar `n_files == 0` e provavelmente entrar em `NEEDS_INPUT` (ver Seção 3 do prompt da Fase 0).

---

## 3. Estado do pipeline

### 3.1 Schema do estado mantido pelo Artifact

```json
{
  "session_id": "uuid v4",
  "created_at": "ISO 8601",
  "user_idea": "string",
  "user_region": "BR | US | EU | ...",
  "additional_context": "string — texto livre que o usuário pode adicionar",
  "pre_filter_result": { "tree": "...", "files": [...], "total_tokens": 0 } ,

  "current_phase": "0 | 1 | 2 | 3 | done | aborted",
  "phase_status": "idle | running | awaiting_input | awaiting_decision | complete | error",

  "phases": {
    "0": {
      "input": { ... },
      "output": null | { "status": "COMPLETE", ... },
      "needs_input_state": null | { "questions": [...], "original_input": { ... } },
      "error": null | { "message": "string", "retries": 0 }
    },
    "1": { "input": null, "output": null, "needs_input_state": null, "error": null },
    "2": { "input": null, "output": null, "needs_input_state": null, "error": null },
    "3": { "input": null, "output": null, "needs_input_state": null, "error": null }
  },

  "halt_decision": null | "user_chose_proceed" | "user_chose_pivot" | "user_chose_abort",
  "pivot_decision": null | "use_original" | "use_pivot"
}
```

### 3.2 Tratamento de NEEDS_INPUT (vale para qualquer fase)

```
QUANDO agente retorna { status: "NEEDS_INPUT", questions: [...] }:

1. Artifact salva:
   phases[N].needs_input_state = {
     questions: response.questions,
     original_input: <o input exato que foi enviado ao agente>
   }
   phase_status = "awaiting_input"

2. Artifact renderiza:
   - Para cada pergunta: pills clicáveis (uma seleção por pergunta)
   - Abaixo das perguntas: campo "outras observações" (textarea livre, opcional)
   - Botão "Continuar análise"

3. QUANDO usuário clica "Continuar análise":
   new_input = {
     ...phases[N].needs_input_state.original_input,
     needs_input_answers: {
       <id>: <opção escolhida> para cada pergunta,
       additional_notes: <texto livre do textarea>
     }
   }
   
   Artifact chama agente novamente com new_input.

4. QUANDO agente retorna { status: "COMPLETE", ... }:
   phases[N].output = response
   phases[N].needs_input_state = null
   phase_status = "complete"
   Avança para fase N+1.
```

**Crítico:** o usuário **nunca** refaz nada. O Artifact preserva o input original e apenas adiciona as respostas. Se a chamada falhar por outro motivo, retentar usa o mesmo input enriquecido.

### 3.3 Tratamento de `verdict = "stop"` (Fase 1)

```
QUANDO Fase 1 retorna { verdict: "stop", halt_pipeline: true, scores: {...}, ... }:

1. Artifact NÃO chama Fase 2 automaticamente.
   phase_status = "awaiting_decision"

2. Artifact renderiza, em destaque:
   - Badge vermelho com "Análise recomenda PARAR"
   - Scores (visíveis)
   - Justificativa (das seções A-J da narrativa da Fase 1)
   - Hipóteses não verificadas (em destaque)
   - 3 botões:
     [ Encerrar análise ]      → halt_decision = "user_chose_abort"; current_phase = "aborted"
     [ Aceitar pivote sugerido ] → (ver 3.4)
     [ Prosseguir mesmo assim ]  → halt_decision = "user_chose_proceed"
                                    → Fase 2 é chamada com flag adicional:
                                       { ..., user_overrode_halt: true }

3. Se prosseguir mesmo assim, Fase 2 recebe a flag e adiciona no JSON de saída
   a propriedade { halt_was_overridden: true } para a Fase 3 mencionar no briefing.
```

### 3.4 Tratamento de `verdict = "proceed_with_pivot"` (Fase 1)

```
QUANDO Fase 1 retorna { verdict: "proceed_with_pivot", pivot_recommendation: "...", ... }:

1. Artifact NÃO chama Fase 2 automaticamente.
   phase_status = "awaiting_decision"

2. Artifact renderiza:
   - Badge amarelo com "Análise sugere pivote"
   - Pivot recommendation em destaque
   - Scores da ideia original
   - 2 botões:
     [ Manter ideia original ] → pivot_decision = "use_original"; chama Fase 2 normalmente
     [ Aceitar pivote ]         → pivot_decision = "use_pivot"

3. Se aceitar pivote:
   - user_idea é reescrita: original + "Pivote aceito: " + pivot_recommendation
   - REINICIA do início (mas pré-filtro é reusado — arquivos não mudaram)
   - Roda Fase 0 → Fase 1 → ... de novo com a ideia pivotada
   - Estado anterior é arquivado (sessão antiga preservada para histórico)
```

### 3.5 Tratamento de violação de schema

Antes de passar output de uma fase para a próxima, o Artifact **valida** contra o schema esperado (declarado nas Seções "Contrato com Fase N" de cada prompt).

```
SE output viola schema (campo ausente, tipo errado, enum inválido):
  1. phases[N].error = { message: "schema violation: <detalhe>", retries: 0 }
  2. phase_status = "error"
  3. Renderiza erro técnico ao usuário com 2 botões:
     [ Reexecutar ] → mesma chamada, mesmo input
     [ Reexecutar com seed diferente ] → mesma chamada, mas instrui o agente:
                                          "tentativa anterior gerou JSON inválido"
  4. Limite: 3 tentativas. Após isso, exibe erro permanente e oferece
     ao usuário copiar o estado para debug.
```

### 3.6 Tratamento de erros de API

```
- Timeout (> 60s): retry automático 1×. Se falhar, mostra erro com botão "Tentar novamente".
- Rate limit (429): backoff de 30s, depois retry automático 1×.
- Erro 4xx (não-429): trata como schema violation (Seção 3.5).
- Erro 5xx: retry automático 1×, depois erro com botão.
- Conexão perdida: aguarda reconexão; preserva estado completo no localStorage.
```

### 3.7 Persistência

Todo o estado do pipeline é serializado em `localStorage` a cada transição de fase. Permite ao usuário fechar e voltar sem perder progresso. Não é "share" — cada navegador tem sua própria sessão.

---

## 4. Concorrência e otimizações futuras

As fases são **sequenciais** por design (cada uma depende da anterior). Não há paralelismo a explorar entre fases.

Otimização possível, dentro de uma fase: a **pesquisa** das Fases 1 e 2 (queries do plano de pesquisa) pode ser disparada em paralelo. Isso reduz a latência percebida sem mudar o contrato.

Fora de escopo desta primeira versão: cache de respostas, A/B de prompts, métricas de qualidade do output, fine-tuning de prompts a partir de feedback.

---

**Fim da especificação de orquestração.**
