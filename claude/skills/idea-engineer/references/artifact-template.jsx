import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Loader2, CheckCircle2, AlertCircle, XCircle, Copy, Upload,
  Brain, Target, Hammer, FileText, ChevronDown, ChevronRight,
  AlertTriangle, ArrowRight, RefreshCw, X, Lightbulb, Search,
  Settings, Play, Trash2, FileCode, MapPin, Check, BookOpen,
  ScrollText, Skull, Recycle, ExternalLink
} from 'lucide-react';

// ============================================================================
// SYSTEM PROMPTS — substitua pelos prompts completos de references/
// ============================================================================
// Cada constante deve receber o conteúdo BRUTO do .md correspondente.
// O artifact funciona com os 4 prompts presentes; sem eles, a API recebe um
// system prompt vazio e retorna lixo.

const SYSTEM_PROMPTS = {
  phase0: `[Cole aqui o conteúdo completo de references/context-analyst-prompt.md]`,
  phase1: `[Cole aqui o conteúdo completo de references/business-strategist-prompt.md]`,
  phase2: `[Cole aqui o conteúdo completo de references/tech-architect-prompt.md]`,
  phase3: `[Cole aqui o conteúdo completo de references/synthesis-prompt.md]`
};

// ============================================================================
// CONSTANTS
// ============================================================================

const MODEL = 'claude-sonnet-4-20250514';
const STORAGE_KEY = 'idea-engineer-session-v1';
const MAX_TOKENS = 16000;

const PHASE_INFO = {
  0: { name: 'CONTEXT ANALYST',     icon: Brain,    desc: 'Extrai realidade do contexto', websearch: false },
  1: { name: 'BUSINESS STRATEGIST', icon: Target,   desc: 'Estressa viabilidade comercial', websearch: true },
  2: { name: 'TECH ARCHITECT',      icon: Hammer,   desc: 'Projeta arquitetura técnica', websearch: true },
  3: { name: 'SYNTHESIS',           icon: FileText, desc: 'Compõe prompts master finais', websearch: false }
};

// ============================================================================
// HELPER FUNCTIONS — pré-filtro, validação, API call
// ============================================================================

const approxTokens = (s) => Math.ceil(String(s ?? '').length / 4);

const TIER1_PATTERNS = [
  /package\.json$/, /pnpm-workspace\.yaml$/, /turbo\.json$/, /lerna\.json$/,
  /requirements(-dev)?\.txt$/, /pyproject\.toml$/, /Pipfile$/, /setup\.py$/,
  /Gemfile$/, /composer\.json$/, /go\.mod$/, /Cargo\.toml$/,
  /pom\.xml$/, /build\.gradle(\.kts)?$/,
  /\.env\.example$/, /\.env\.sample$/,
  /Dockerfile$/, /docker-compose\.ya?ml$/,
  /next\.config\.[jmtc]?[jt]sx?$/, /vite\.config\.[jt]s$/, /nuxt\.config\.ts$/,
  /astro\.config\.mjs$/, /svelte\.config\.js$/, /remix\.config\.js$/,
  /tsconfig\.json$/, /jsconfig\.json$/, /tailwind\.config\.[jt]s$/,
  /vercel\.json$/, /netlify\.toml$/, /fly\.toml$/, /railway\.json$/,
  /render\.yaml$/, /app\.yaml$/, /Procfile$/, /serverless\.yml$/,
  /schema\.prisma$/, /drizzle\.config\.[jt]s$/, /knexfile\.js$/,
  /README\.md$/i, /ARCHITECTURE\.md$/i, /CONTRIBUTING\.md$/i,
  /decisions\/.*\.md$/i, /docs\/adr\/.*\.md$/i, /adr\/.*\.md$/i,
  /\.github\/workflows\/.*\.ya?ml$/,
  /\.gitlab-ci\.yml$/, /\.circleci\/config\.yml$/
];

const BLOCKLIST_PATTERNS = [
  /(^|\/)node_modules\//, /(^|\/)vendor\//, /(^|\/)\.venv\//,
  /(^|\/)venv\//, /(^|\/)__pycache__\//,
  /(^|\/)target\//, /(^|\/)dist\//, /(^|\/)build\//, /(^|\/)out\//,
  /(^|\/)\.next\//, /(^|\/)\.nuxt\//, /(^|\/)\.svelte-kit\//, /(^|\/)\.turbo\//,
  /(^|\/)coverage\//, /(^|\/)\.nyc_output\//,
  /(^|\/)\.git\//, /(^|\/)\.svn\//,
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/, /bun\.lockb$/,
  /Gemfile\.lock$/, /composer\.lock$/, /go\.sum$/, /Cargo\.lock$/, /poetry\.lock$/,
  /^\.env$/, /\.env\.local$/, /\.env\.production$/, /\.env\.development$/,
  /\.DS_Store$/, /Thumbs\.db$/,
  /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|eot|mp4|mp3|wav|zip|tar|gz|pdf|tsbuildinfo|log|snap)$/i
];

const SOURCE_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.php', '.swift', '.cs', '.elm', '.ex', '.exs'
];

const isBlocked = (p) => BLOCKLIST_PATTERNS.some(r => r.test(p));
const isTier1 = (p) => TIER1_PATTERNS.some(r => r.test(p));
const isSourceFile = (p) => SOURCE_EXTENSIONS.some(ext => p.toLowerCase().endsWith(ext));

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTree(files, maxDepth = 4, maxLines = 200) {
  const paths = files
    .map(f => f.path)
    .filter(p => !isBlocked(p))
    .sort();
  const lines = [];
  for (const path of paths) {
    const depth = path.split('/').length;
    if (depth > maxDepth) continue;
    lines.push(path);
    if (lines.length >= maxLines) break;
  }
  return lines.join('\n');
}

function preFilter(uploadedFiles) {
  if (!uploadedFiles || uploadedFiles.length === 0) {
    return { tree: '', files: [], total_tokens: 0 };
  }
  const BUDGET = 20000;
  let used = 0;
  const out = [];
  const tree = buildTree(uploadedFiles);
  used += approxTokens(tree);
  const eligible = uploadedFiles.filter(f => !isBlocked(f.path));
  const tier1 = eligible.filter(f => isTier1(f.path));
  for (const f of tier1) {
    const tk = approxTokens(f.content);
    if (used + tk > BUDGET) break;
    out.push({ path: f.path, content: f.content });
    used += tk;
  }
  const tier3 = eligible
    .filter(f => isSourceFile(f.path))
    .filter(f => !out.some(x => x.path === f.path))
    .filter(f => f.content.split('\n').length >= 50);
  for (const f of shuffleArray(tier3).slice(0, 5)) {
    const truncated = f.content.split('\n').slice(0, 100).join('\n');
    const tk = approxTokens(truncated);
    if (used + tk > BUDGET) break;
    out.push({ path: f.path, content: truncated, truncated: true });
    used += tk;
  }
  return { tree, files: out, total_tokens: used };
}

function extractJson(text) {
  if (!text) throw new Error('Resposta vazia da API');
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlock) {
    try { return JSON.parse(jsonBlock[1].trim()); } catch (e) {}
  }
  const genericBlock = text.match(/```\s*\n([\s\S]*?)\n```/);
  if (genericBlock) {
    try { return JSON.parse(genericBlock[1].trim()); } catch (e) {}
  }
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Nenhum JSON encontrado na resposta');
  let depth = 0, end = -1, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('JSON malformado: chaves não balanceadas');
  return JSON.parse(text.substring(start, end + 1));
}

function validatePhaseOutput(phaseNum, data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, errors: ['Resposta não é um objeto JSON'] };
  }
  if (!data.status) {
    return { ok: false, errors: ['Campo "status" ausente'] };
  }
  if (data.status === 'NEEDS_INPUT') {
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      return { ok: false, errors: ['NEEDS_INPUT sem perguntas'] };
    }
    return { ok: true, data };
  }
  if (data.status === 'ERROR') return { ok: true, data };
  if (data.status !== 'COMPLETE') {
    return { ok: false, errors: [`Status desconhecido: ${data.status}`] };
  }
  const errors = [];
  if (phaseNum === 0) {
    if (!data.project_stage) errors.push('project_stage ausente');
    if (!data.existing_stack) errors.push('existing_stack ausente');
    if (!data.constraints) errors.push('constraints ausente');
    if (typeof data.summary !== 'string') errors.push('summary ausente');
  } else if (phaseNum === 1) {
    if (!data.verdict) errors.push('verdict ausente');
    if (typeof data.halt_pipeline !== 'boolean') errors.push('halt_pipeline ausente');
    if (!data.scores) errors.push('scores ausente');
    if (!data.unit_economics?.scenario_base) errors.push('unit_economics.scenario_base ausente');
    if (!Array.isArray(data.required_integrations)) errors.push('required_integrations ausente');
    if (!Array.isArray(data.mvp_features_business_constrained)) errors.push('mvp_features_business_constrained ausente');
    if (!Array.isArray(data.critical_hypotheses)) errors.push('critical_hypotheses ausente');
    if (!Array.isArray(data.kill_criteria)) errors.push('kill_criteria ausente');
  } else if (phaseNum === 2) {
    if (!data.final_stack) errors.push('final_stack ausente');
    if (!data.mvp_features) errors.push('mvp_features ausente');
    if (!Array.isArray(data.integrations)) errors.push('integrations ausente');
    if (!data.infrastructure?.monthly_cost_brl) errors.push('infrastructure.monthly_cost_brl ausente');
    if (!Array.isArray(data.measurement_infrastructure)) errors.push('measurement_infrastructure ausente');
  } else if (phaseNum === 3) {
    if (!data.prompts?.for_ai?.content) errors.push('prompts.for_ai.content ausente');
    if (!data.prompts?.for_human?.content) errors.push('prompts.for_human.content ausente');
  }
  return errors.length === 0 ? { ok: true, data } : { ok: false, errors };
}

function buildUserMessageForPhase(phaseNum, ctx) {
  if (phaseNum === 0) {
    return JSON.stringify({
      user_idea: ctx.userIdea,
      project_files: ctx.preFiltered,
      conversation_history: ctx.additionalContext
        ? [{ role: 'user', content: ctx.additionalContext }]
        : [],
      user_region: ctx.userRegion,
      needs_input_answers: ctx.needsInputAnswers?.[0] || null
    }, null, 2);
  }
  if (phaseNum === 1) {
    return JSON.stringify({
      user_idea: ctx.userIdea,
      context_analyst_output: ctx.phases[0].output,
      user_region: ctx.userRegion,
      user_profile_notes: ctx.additionalContext || '',
      needs_input_answers: ctx.needsInputAnswers?.[1] || null
    }, null, 2);
  }
  if (phaseNum === 2) {
    return JSON.stringify({
      phase_0_output: ctx.phases[0].output,
      phase_1_output: ctx.phases[1].output,
      user_overrode_halt: !!ctx.userOverrodeHalt
    }, null, 2);
  }
  if (phaseNum === 3) {
    return JSON.stringify({
      user_idea: ctx.userIdea,
      phase_0_output: ctx.phases[0].output,
      phase_1_output: ctx.phases[1].output,
      phase_2_output: ctx.phases[2].output
    }, null, 2);
  }
  throw new Error(`Fase inválida: ${phaseNum}`);
}

async function callClaude({ systemPrompt, userMessage, enableWebSearch = false }) {
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };
  if (enableWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API ${res.status}: ${errText.substring(0, 200)}`);
  }
  const data = await res.json();
  const textParts = (data.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text);
  return textParts.join('\n');
}

async function persistState(state) {
  if (typeof window === 'undefined' || !window.storage) return;
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
async function loadPersistedState() {
  if (typeof window === 'undefined' || !window.storage) return null;
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : null;
  } catch (e) { return null; }
}
async function clearPersistedState() {
  if (typeof window === 'undefined' || !window.storage) return;
  try { await window.storage.delete(STORAGE_KEY); } catch (e) {}
}

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

function StatusGlyph({ status, size = 16 }) {
  const props = { size, strokeWidth: 1.5 };
  if (status === 'running') return <Loader2 {...props} className="animate-spin text-amber-400" />;
  if (status === 'complete') return <CheckCircle2 {...props} className="text-emerald-400" />;
  if (status === 'error') return <XCircle {...props} className="text-rose-400" />;
  if (status === 'awaiting_input') return <AlertCircle {...props} className="text-sky-400" />;
  if (status === 'awaiting_decision') return <AlertTriangle {...props} className="text-amber-400" />;
  return <div className="w-[14px] h-[14px] rounded-full border border-zinc-700" />;
}

function Pill({ children, variant = 'default', className = '' }) {
  const variants = {
    default: 'border-zinc-700 text-zinc-400',
    success: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5',
    warning: 'border-amber-500/30 text-amber-400 bg-amber-500/5',
    danger: 'border-rose-500/30 text-rose-400 bg-rose-500/5',
    info: 'border-sky-500/30 text-sky-400 bg-sky-500/5',
    accent: 'border-amber-400/40 text-amber-300 bg-amber-400/5'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border text-[10px] font-mono uppercase tracking-wider ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

function CopyButton({ text, label = 'COPIAR' }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {}
  };
  return (
    <button onClick={onClick} className="font-mono text-[10px] uppercase tracking-wider inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-700 hover:border-amber-400/60 hover:text-amber-300 transition-colors text-zinc-300 rounded-sm">
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'COPIADO' : label}
    </button>
  );
}

function Divider({ label }) {
  if (!label) return <div className="h-px bg-zinc-800 my-6" />;
  return (
    <div className="flex items-center gap-3 my-6">
      <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">{label}</div>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

// ============================================================================
// SETUP VIEW — coleta de inputs
// ============================================================================

function SetupView({ onStart, hasPersisted, onResume, onClearPersisted }) {
  const [idea, setIdea] = useState('');
  const [context, setContext] = useState('');
  const [region, setRegion] = useState('BR');
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const fileList = Array.from(e.target.files || []);
    const promises = fileList.map(f => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        path: f.webkitRelativePath || f.name,
        content: reader.result || ''
      });
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    }));
    Promise.all(promises).then(results => {
      setFiles(prev => [...prev, ...results.filter(Boolean)]);
    });
  };

  const filtered = useMemo(() => preFilter(files), [files]);
  const canStart = idea.trim().length >= 10;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <header className="mb-12">
        <div className="font-mono text-[10px] tracking-[0.25em] text-amber-400/80 mb-3">
          [ IDEA ENGINEER / v1.0 ]
        </div>
        <h1 className="text-4xl font-light tracking-tight text-zinc-100 mb-3">
          Pipeline de análise para ideias de produto
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed max-w-2xl">
          4 agentes especializados produzem um veredicto comercial honesto, uma arquitetura técnica condizente com restrições reais, e dois prompts master finais — um para IA, outro para desenvolvedor humano.
        </p>
      </header>

      {hasPersisted && (
        <div className="mb-8 border border-amber-400/30 bg-amber-400/5 rounded-sm p-4">
          <div className="flex items-start gap-3">
            <Recycle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-mono text-[10px] tracking-wider text-amber-300 uppercase mb-1">Sessão Anterior Encontrada</div>
              <p className="text-sm text-zinc-300 mb-3">Existe um pipeline em andamento ou completado. Pode retomar de onde parou ou descartar.</p>
              <div className="flex gap-2">
                <button onClick={onResume} className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 bg-amber-400 text-zinc-950 hover:bg-amber-300 rounded-sm">Retomar</button>
                <button onClick={onClearPersisted} className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-zinc-700 text-zinc-400 hover:border-zinc-500 rounded-sm">Descartar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        <div>
          <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-2 block">[ IDEIA / OBRIGATÓRIO ]</label>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Descreva a ideia. Quanto mais específica (problema, público, modelo), melhor a análise. Ex.: 'plataforma de assinatura mensal para lojistas de dropshipping brasileiros gerenciarem catálogo de fornecedores diretos, focada em redução de tempo de cadastro de produtos.'"
            className="w-full min-h-[140px] bg-zinc-900/50 border border-zinc-800 focus:border-amber-400/60 focus:bg-zinc-900 outline-none rounded-sm p-4 text-zinc-100 placeholder:text-zinc-600 text-sm leading-relaxed font-light resize-y"
          />
          <div className="font-mono text-[10px] text-zinc-600 mt-1">{idea.length} caracteres / mínimo recomendado: 50</div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-2 block">[ CONTEXTO ADICIONAL / OPCIONAL ]</label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Decisões já tomadas, restrições de orçamento/prazo/equipe, stack que pretende usar, nível técnico. Ex.: 'Sou iniciante em código, R$ 5k de orçamento, 6 meses, sozinho, já decidi que vai ser Next.js.'"
            className="w-full min-h-[100px] bg-zinc-900/50 border border-zinc-800 focus:border-amber-400/60 focus:bg-zinc-900 outline-none rounded-sm p-4 text-zinc-100 placeholder:text-zinc-600 text-sm leading-relaxed font-light resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-2 block">[ REGIÃO ]</label>
            <div className="flex gap-2">
              {['BR', 'US', 'EU'].map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  className={`font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-sm border transition-colors ${region === r ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}
                >{r}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase mb-2 block">[ ARQUIVOS DO PROJETO / OPCIONAL ]</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              webkitdirectory=""
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full font-mono text-xs uppercase tracking-wider px-4 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300 rounded-sm flex items-center justify-center gap-2"
            >
              <Upload size={12} />
              {files.length === 0 ? 'Selecionar pasta' : `${files.length} arquivos / ${filtered.files.length} relevantes / ~${filtered.total_tokens.toLocaleString()} tokens`}
            </button>
          </div>
        </div>

        {files.length > 0 && (
          <div className="border border-zinc-800 rounded-sm">
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Pré-filtro selecionou</span>
              <button onClick={() => setFiles([])} className="font-mono text-[10px] uppercase text-zinc-600 hover:text-rose-400">Limpar</button>
            </div>
            <div className="p-4 max-h-40 overflow-y-auto font-mono text-[11px] text-zinc-400 space-y-0.5">
              {filtered.files.map(f => (
                <div key={f.path}>
                  <span className="text-zinc-500">{f.truncated ? '◐' : '●'}</span> {f.path}
                  {f.truncated && <span className="text-zinc-600"> (truncado)</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex items-center justify-between">
          <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
            Pipeline executa 4 fases sequenciais. Pode levar 2-5 minutos.
          </div>
          <button
            onClick={() => onStart({ idea, context, region, files })}
            disabled={!canStart}
            className="font-mono text-xs uppercase tracking-[0.15em] px-6 py-3 bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-sm flex items-center gap-2 transition-colors"
          >
            Iniciar análise <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PHASE CARD — pílula de status de uma fase
// ============================================================================

function PhaseCard({ phaseNum, status, active, onClick }) {
  const Icon = PHASE_INFO[phaseNum].icon;
  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-sm p-4 transition-colors ${active ? 'border-amber-400/60 bg-amber-400/5' : 'border-zinc-800 hover:border-zinc-700'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className={active ? 'text-amber-300' : 'text-zinc-500'} strokeWidth={1.5} />
          <span className="font-mono text-[10px] tracking-[0.15em] text-zinc-500">PHASE_{String(phaseNum).padStart(2, '0')}</span>
        </div>
        <StatusGlyph status={status} size={14} />
      </div>
      <div className={`font-mono text-sm tracking-wide mb-1 ${active ? 'text-amber-100' : 'text-zinc-300'}`}>{PHASE_INFO[phaseNum].name}</div>
      <div className="text-[11px] text-zinc-500 leading-relaxed">{PHASE_INFO[phaseNum].desc}</div>
    </button>
  );
}

// ============================================================================
// PHASE 0 RENDERING
// ============================================================================

function Phase0Detail({ output }) {
  if (!output) return null;
  const stack = output.existing_stack || {};
  return (
    <div className="space-y-6">
      <div>
        <Divider label="Resumo Executivo" />
        <p className="text-sm text-zinc-200 leading-relaxed">{output.summary}</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase mb-2">Estágio</div>
          <Pill variant="info">{output.project_stage}</Pill>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase mb-2">Nível Técnico</div>
          <Pill variant="info">{output.constraints?.technical_skill_level || '—'}</Pill>
        </div>
      </div>
      <div>
        <Divider label="Stack Existente" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {['frontend', 'backend', 'database', 'auth', 'hosting'].map(slot => (
            <div key={slot} className="flex justify-between border-b border-zinc-900 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{slot}</span>
              <span className={`font-mono text-xs ${stack[slot] ? 'text-zinc-200' : 'text-zinc-600'}`}>{stack[slot] || 'não identificado'}</span>
            </div>
          ))}
        </div>
      </div>
      {output.constraints && (
        <div>
          <Divider label="Restrições" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div className="flex justify-between border-b border-zinc-900 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Orçamento</span>
              <span className="font-mono text-xs text-zinc-200">{output.constraints.budget_brl ? `R$ ${output.constraints.budget_brl.toLocaleString()}` : '—'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Prazo</span>
              <span className="font-mono text-xs text-zinc-200">{output.constraints.timeline_months ? `${output.constraints.timeline_months} meses` : '—'}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-900 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Equipe</span>
              <span className="font-mono text-xs text-zinc-200">{output.constraints.team_size || '—'}</span>
            </div>
          </div>
        </div>
      )}
      {output.decisions_made?.length > 0 && (
        <div>
          <Divider label="Decisões Imutáveis" />
          <ul className="space-y-1.5 text-sm">
            {output.decisions_made.map((d, i) => (
              <li key={i} className="flex gap-2 text-zinc-300"><span className="text-zinc-600 font-mono">{String(i+1).padStart(2,'0')}.</span>{d}</li>
            ))}
          </ul>
        </div>
      )}
      {output.open_questions?.length > 0 && (
        <div>
          <Divider label="Questões em Aberto" />
          <ul className="space-y-1.5 text-sm">
            {output.open_questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-zinc-400"><span className="text-amber-400/60">?</span>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {output._inconsistencies?.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-4">
          <div className="font-mono text-[10px] tracking-wider text-amber-300 uppercase mb-2">⚠ Inconsistências Detectadas</div>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {output._inconsistencies.map((inc, i) => (
              <li key={i}><span className="font-mono text-xs text-amber-400">{inc.field}:</span> {inc.resolution}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PHASE 1 RENDERING
// ============================================================================

function Phase1Detail({ output }) {
  if (!output) return null;
  const verdictVariant = output.verdict === 'proceed' ? 'success' : output.verdict === 'stop' ? 'danger' : 'warning';
  const verdictLabel = output.verdict === 'proceed' ? 'PROSSEGUIR' : output.verdict === 'stop' ? 'PARAR' : 'PIVOTAR';
  const ue = output.unit_economics?.scenario_base || {};
  const ltvcacBad = ue.ltv_cac_ratio < 3;

  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 rounded-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">[ Veredicto ]</span>
          <Pill variant={verdictVariant} className="text-sm py-1 px-3">{verdictLabel}</Pill>
        </div>
        {output.pivot_recommendation && (
          <p className="text-sm text-amber-200/90 leading-relaxed mb-3">
            <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400/70 block mb-1">Pivote sugerido:</span>
            {output.pivot_recommendation}
          </p>
        )}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {output.scores && Object.entries(output.scores).map(([k, v]) => (
            <div key={k} className="border border-zinc-800 rounded-sm p-2.5">
              <div className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase mb-1">{k}</div>
              <div className={`font-mono text-2xl ${v >= 7 ? 'text-emerald-400' : v >= 4 ? 'text-amber-400' : 'text-rose-400'}`}>{v}<span className="text-xs text-zinc-600">/10</span></div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Divider label="Modelo de Negócio" />
        <div className="text-sm text-zinc-300 mb-2">
          <Pill variant="info">{output.business_model?.type}</Pill>
          {output.pricing?.recommended_range_brl && (
            <span className="ml-3 font-mono text-xs text-zinc-400">R$ {output.pricing.recommended_range_brl[0]} – {output.pricing.recommended_range_brl[1]}</span>
          )}
        </div>
        <p className="text-sm text-zinc-400 leading-relaxed">{output.business_model?.details}</p>
      </div>

      <div>
        <Divider label="Unit Economics — Cenário Base" />
        <div className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
          {[
            ['Ticket médio', `R$ ${ue.avg_ticket_brl?.toFixed(2) || '—'}`],
            ['Margem bruta', `${ue.gross_margin_pct || '—'}%`],
            ['CAC', `R$ ${ue.cac_brl?.toFixed(2) || '—'}`],
            ['LTV', `R$ ${ue.ltv_brl?.toFixed(2) || '—'}`],
            ['LTV/CAC', `${ue.ltv_cac_ratio?.toFixed(2) || '—'}`],
            ['Payback', `${ue.payback_months?.toFixed(1) || '—'}m`]
          ].map(([label, val], i) => (
            <div key={i} className={`flex justify-between border-b py-1.5 ${(label==='LTV/CAC' && ltvcacBad) ? 'border-rose-500/30' : 'border-zinc-900'}`}>
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
              <span className={`font-mono text-xs ${(label==='LTV/CAC' && ltvcacBad) ? 'text-rose-400' : 'text-zinc-200'}`}>{val}</span>
            </div>
          ))}
        </div>
        {ltvcacBad && (
          <div className="mt-3 font-mono text-[10px] text-rose-400/80 uppercase tracking-wider">⚠ LTV/CAC abaixo de 3 — modelo financeiramente frágil</div>
        )}
      </div>

      {output.critical_hypotheses?.length > 0 && (
        <div>
          <Divider label="Hipóteses Críticas a Validar" />
          <div className="space-y-2.5">
            {output.critical_hypotheses.map((h, i) => (
              <div key={i} className="border border-zinc-800 rounded-sm p-3">
                <div className="text-sm text-zinc-200 mb-2">{h.hypothesis}</div>
                <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500 uppercase">
                  <span>{h.test_method}</span>
                  <span className="text-zinc-700">/</span>
                  <span>R$ {h.test_cost_brl}</span>
                  <span className="text-zinc-700">/</span>
                  <span>{h.test_duration_days}d</span>
                </div>
                <div className="text-xs text-emerald-400/80 mt-2 font-mono">→ {h.success_criterion}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.kill_criteria?.length > 0 && (
        <div>
          <Divider label="Critérios de Kill" />
          <ul className="space-y-1.5 text-sm">
            {output.kill_criteria.map((k, i) => (
              <li key={i} className="flex gap-2 text-zinc-300"><Skull size={12} className="text-rose-400/60 mt-1 flex-shrink-0" />{k}</li>
            ))}
          </ul>
        </div>
      )}

      {output.unverified_assumptions?.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-4">
          <div className="font-mono text-[10px] tracking-wider text-amber-300 uppercase mb-2">⚠ Hipóteses Não Verificadas</div>
          <ul className="space-y-1 text-xs text-zinc-300">
            {output.unverified_assumptions.map((a, i) => <li key={i}>— {a}</li>)}
          </ul>
        </div>
      )}

      {output.sources?.length > 0 && (
        <details className="border border-zinc-800 rounded-sm">
          <summary className="px-4 py-2.5 cursor-pointer font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:text-zinc-200">
            Fontes Citadas ({output.sources.length})
          </summary>
          <div className="p-4 space-y-2 text-xs">
            {output.sources.map((s, i) => (
              <div key={i} className="text-zinc-400">
                <a href={s.url} target="_blank" rel="noopener" className="text-sky-400 hover:underline inline-flex items-center gap-1">{s.publisher} <ExternalLink size={10} /></a>
                <span className="text-zinc-600"> · {s.year}</span>
                <div className="text-zinc-500 mt-0.5">{s.claim}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ============================================================================
// PHASE 2 RENDERING
// ============================================================================

function Phase2Detail({ output }) {
  if (!output) return null;
  const stack = output.final_stack || {};
  const infra = output.infrastructure?.monthly_cost_brl || {};
  const marginPass = output.infrastructure?.margin_validation?.passes_margin_check;

  return (
    <div className="space-y-6">
      <div>
        <Divider label="Arquitetura" />
        <Pill variant="accent" className="mb-2">{output.architecture_pattern}</Pill>
        <p className="text-sm text-zinc-300 leading-relaxed mt-2">{output.architecture_rationale}</p>
      </div>

      <div>
        <Divider label="Stack Final" />
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {Object.entries(stack).filter(([k, v]) => v && k !== 'other').map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-zinc-900 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{k}</span>
              <span className="font-mono text-xs text-zinc-200 text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Divider label="Infraestrutura — Custo Mensal" />
        <div className="grid grid-cols-3 gap-3">
          {[
            ['Pessimista', infra.pessimistic],
            ['Base', infra.base],
            ['Otimista', infra.optimistic]
          ].map(([label, val], i) => (
            <div key={i} className="border border-zinc-800 rounded-sm p-3">
              <div className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase mb-1">{label}</div>
              <div className="font-mono text-xl text-zinc-200">R$ {val?.toLocaleString() || '—'}</div>
            </div>
          ))}
        </div>
        <div className={`mt-3 font-mono text-[10px] uppercase tracking-wider ${marginPass ? 'text-emerald-400' : 'text-rose-400'}`}>
          {marginPass ? '✓ Dentro da margem permitida' : '✗ Estoura margem — trade-off declarado'}
        </div>
      </div>

      {output.integrations?.length > 0 && (
        <div>
          <Divider label="Integrações" />
          <div className="space-y-2">
            {output.integrations.map((i, idx) => (
              <div key={idx} className="flex items-center justify-between border-b border-zinc-900 py-2">
                <div>
                  <div className="font-mono text-xs text-zinc-200">{i.name}</div>
                  <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{i.provider} via {i.sdk_or_api}</div>
                </div>
                <div className="font-mono text-[10px] text-zinc-400 text-right">
                  {i.pricing_brl_month > 0 && <>R$ {i.pricing_brl_month}/m</>}
                  {i.fee_pct > 0 && <span className="ml-2">{i.fee_pct}%</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.development_estimate && (
        <div>
          <Divider label="Estimativa" />
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase mb-1">Setup</div>
              <div className="font-mono text-xl text-zinc-200">{output.development_estimate.setup_hours}h</div>
            </div>
            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase mb-1">MVP Total</div>
              <div className="font-mono text-xl text-zinc-200">{output.development_estimate.mvp_total_hours}h</div>
            </div>
            <div className="border border-zinc-800 rounded-sm p-3">
              <div className="font-mono text-[9px] tracking-wider text-zinc-500 uppercase mb-1">Semanas</div>
              <div className="font-mono text-xl text-amber-300">{output.development_estimate.mvp_total_weeks?.toFixed(1)}</div>
            </div>
          </div>
        </div>
      )}

      {output.technical_debts?.length > 0 && (
        <div>
          <Divider label="Débitos Técnicos Aceitos" />
          <ul className="space-y-2 text-sm">
            {output.technical_debts.map((d, i) => (
              <li key={i} className="flex gap-3">
                <Pill variant={d.severity === 'high' ? 'danger' : d.severity === 'medium' ? 'warning' : 'default'}>{d.severity}</Pill>
                <div className="flex-1">
                  <div className="text-zinc-300">{d.item}</div>
                  <div className="text-zinc-500 text-xs mt-0.5">cobra em: {d.comes_due_at}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {output.validation_failures_explained?.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-sm p-4">
          <div className="font-mono text-[10px] tracking-wider text-amber-300 uppercase mb-2">⚠ Validações com Trade-off</div>
          <div className="space-y-2 text-sm">
            {output.validation_failures_explained.map((v, i) => (
              <div key={i}>
                <div className="text-zinc-200">{v.validation}: {v.reason}</div>
                <div className="text-zinc-400 text-xs mt-0.5">→ {v.tradeoff_proposed}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FINAL PROMPTS VIEW
// ============================================================================

function FinalView({ phase3Output, onReset }) {
  if (!phase3Output) return null;
  const promptA = phase3Output.prompts?.for_ai?.content || '';
  const promptB = phase3Output.prompts?.for_human?.content || '';
  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <header className="mb-12">
        <div className="font-mono text-[10px] tracking-[0.25em] text-emerald-400 mb-3 flex items-center gap-2">
          <CheckCircle2 size={12} /> [ PIPELINE COMPLETO ]
        </div>
        <h2 className="text-3xl font-light tracking-tight text-zinc-100 mb-2">Prompts finais gerados</h2>
        <p className="text-zinc-400 text-sm">Dois prompts auto-contidos prontos para uso. Copie o relevante para sua sessão de IA ou para o briefing do desenvolvedor.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-zinc-800 rounded-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-amber-400 uppercase">[ PROMPT_A / PARA IA ]</div>
              <div className="text-xs text-zinc-500 mt-1">{phase3Output.prompts.for_ai.word_count} palavras</div>
            </div>
            <CopyButton text={promptA} />
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto">
            <pre className="font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{promptA}</pre>
          </div>
        </div>

        <div className="border border-zinc-800 rounded-sm">
          <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-sky-400 uppercase">[ PROMPT_B / PARA DEV HUMANO ]</div>
              <div className="text-xs text-zinc-500 mt-1">{phase3Output.prompts.for_human.word_count} palavras</div>
            </div>
            <CopyButton text={promptB} />
          </div>
          <div className="p-5 max-h-[600px] overflow-y-auto">
            <pre className="font-sans text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{promptB}</pre>
          </div>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <div className="font-mono text-[10px] text-zinc-600 uppercase tracking-wider">
          {phase3Output.halt_was_overridden && '⚠ Análise comercial recomendou parar — usuário forçou prosseguir'}
        </div>
        <button onClick={onReset} className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 rounded-sm flex items-center gap-2">
          <RefreshCw size={11} /> Nova análise
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// NEEDS_INPUT MODAL
// ============================================================================

function NeedsInputModal({ phaseNum, questions, onSubmit, onCancel }) {
  const [answers, setAnswers] = useState({});
  const [notes, setNotes] = useState('');
  const allAnswered = questions.every(q => answers[q.id]);
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <div className="bg-zinc-950 border border-amber-400/40 rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-amber-300 uppercase">[ PHASE_{String(phaseNum).padStart(2,'0')} / INPUT NECESSÁRIO ]</div>
            <div className="text-sm text-zinc-300 mt-1">Para continuar, precisa de algumas respostas:</div>
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-6">
          {questions.map((q) => (
            <div key={q.id}>
              <label className="text-sm text-zinc-200 mb-3 block">{q.label}</label>
              <div className="flex flex-wrap gap-2">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                    className={`text-xs px-3 py-2 rounded-sm border transition-colors ${answers[q.id] === opt ? 'border-amber-400/60 bg-amber-400/10 text-amber-200' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
                  >{opt}</button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <label className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase mb-2 block">[ Observações Adicionais / Opcional ]</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Qualquer contexto extra que ajude o agente a entender..."
              className="w-full min-h-[80px] bg-zinc-900/50 border border-zinc-800 focus:border-amber-400/60 outline-none rounded-sm p-3 text-zinc-200 text-sm resize-y"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button onClick={onCancel} className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 text-zinc-500 hover:text-zinc-300">Cancelar</button>
          <button
            onClick={() => onSubmit({ ...answers, additional_notes: notes })}
            disabled={!allAnswered}
            className="font-mono text-[10px] uppercase tracking-wider px-5 py-2 bg-amber-400 text-zinc-950 hover:bg-amber-300 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-sm"
          >Continuar análise</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DECISION MODAL (halt / pivot)
// ============================================================================

function DecisionModal({ phase1Output, onProceed, onPivot, onAbort, onCancel }) {
  const isStop = phase1Output.verdict === 'stop';
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <div className="bg-zinc-950 border border-zinc-800 rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className={`px-6 py-4 border-b ${isStop ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className={`font-mono text-[10px] tracking-[0.2em] uppercase mb-1 ${isStop ? 'text-rose-400' : 'text-amber-400'}`}>
            {isStop ? '[ ANÁLISE RECOMENDA PARAR ]' : '[ ANÁLISE SUGERE PIVOTE ]'}
          </div>
          <div className="text-sm text-zinc-200 mt-1">
            {isStop
              ? 'Os números não fecham na configuração proposta. Revise antes de prosseguir.'
              : 'A ideia funciona com um ajuste. Aceitar o pivote ou seguir com a original?'}
          </div>
        </div>
        <div className="p-6 space-y-4">
          {phase1Output.pivot_recommendation && (
            <div className="border border-amber-500/20 rounded-sm p-3 bg-amber-500/5">
              <div className="font-mono text-[10px] tracking-wider text-amber-400 uppercase mb-1">Pivote sugerido</div>
              <p className="text-sm text-zinc-200">{phase1Output.pivot_recommendation}</p>
            </div>
          )}
          <div>
            <div className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase mb-2">Scores</div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(phase1Output.scores).map(([k, v]) => (
                <div key={k} className="border border-zinc-800 rounded-sm p-2 text-center">
                  <div className="font-mono text-[9px] text-zinc-500 uppercase">{k}</div>
                  <div className={`font-mono text-xl ${v >= 7 ? 'text-emerald-400' : v >= 4 ? 'text-amber-400' : 'text-rose-400'}`}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          {phase1Output.kill_criteria?.length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase mb-2">Critérios de kill a monitorar</div>
              <ul className="space-y-1 text-xs text-zinc-300">
                {phase1Output.kill_criteria.map((k, i) => <li key={i}>— {k}</li>)}
              </ul>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-zinc-800 flex flex-wrap items-center justify-end gap-2">
          <button onClick={onAbort} className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-zinc-800 text-zinc-400 hover:border-rose-500/40 hover:text-rose-400 rounded-sm">Encerrar</button>
          {phase1Output.pivot_recommendation && (
            <button onClick={onPivot} className="font-mono text-[10px] uppercase tracking-wider px-4 py-2 border border-amber-400/40 text-amber-300 hover:bg-amber-400/10 rounded-sm">Aceitar pivote</button>
          )}
          <button onClick={onProceed} className={`font-mono text-[10px] uppercase tracking-wider px-4 py-2 rounded-sm ${isStop ? 'border border-rose-500/40 text-rose-300 hover:bg-rose-500/10' : 'bg-amber-400 text-zinc-950 hover:bg-amber-300'}`}>
            {isStop ? 'Prosseguir mesmo assim' : 'Manter ideia original'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function IdeaEngineer() {
  const [view, setView] = useState('setup'); // setup | pipeline | final
  const [pipelineCtx, setPipelineCtx] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [phases, setPhases] = useState({
    0: { status: 'idle', output: null, error: null, needsInputState: null },
    1: { status: 'idle', output: null, error: null, needsInputState: null },
    2: { status: 'idle', output: null, error: null, needsInputState: null },
    3: { status: 'idle', output: null, error: null, needsInputState: null }
  });
  const [showNeedsInput, setShowNeedsInput] = useState(null);
  const [showDecision, setShowDecision] = useState(false);
  const [hasPersisted, setHasPersisted] = useState(false);
  const [userOverrodeHalt, setUserOverrodeHalt] = useState(false);

  useEffect(() => {
    loadPersistedState().then(state => {
      if (state) setHasPersisted(true);
    });
  }, []);

  const handleResume = useCallback(async () => {
    const state = await loadPersistedState();
    if (!state) return;
    setPipelineCtx(state.pipelineCtx);
    setPhases(state.phases);
    setUserOverrodeHalt(state.userOverrodeHalt || false);
    if (state.phases[3]?.status === 'complete') {
      setView('final');
    } else {
      setView('pipeline');
      const inProgress = Object.entries(state.phases).find(([k, v]) => v.status === 'running' || v.status === 'awaiting_input' || v.status === 'idle');
      if (inProgress) setActiveTab(parseInt(inProgress[0]));
    }
    setHasPersisted(false);
  }, []);

  const handleClearPersisted = useCallback(async () => {
    await clearPersistedState();
    setHasPersisted(false);
  }, []);

  const handleReset = useCallback(async () => {
    await clearPersistedState();
    setView('setup');
    setPipelineCtx(null);
    setUserOverrodeHalt(false);
    setPhases({
      0: { status: 'idle', output: null, error: null, needsInputState: null },
      1: { status: 'idle', output: null, error: null, needsInputState: null },
      2: { status: 'idle', output: null, error: null, needsInputState: null },
      3: { status: 'idle', output: null, error: null, needsInputState: null }
    });
    setShowNeedsInput(null);
    setShowDecision(false);
  }, []);

  // Execute one phase
  const executePhase = useCallback(async (phaseNum, ctx, needsInputAnswers) => {
    setPhases(prev => ({ ...prev, [phaseNum]: { ...prev[phaseNum], status: 'running', error: null } }));
    setActiveTab(phaseNum);
    try {
      const sysPrompt = SYSTEM_PROMPTS[`phase${phaseNum}`];
      if (!sysPrompt || sysPrompt.startsWith('[Cole aqui')) {
        throw new Error(`System prompt da Fase ${phaseNum} não foi configurado. Edite SYSTEM_PROMPTS no código do artifact.`);
      }
      const fullCtx = {
        ...ctx,
        needsInputAnswers: needsInputAnswers
          ? { ...(ctx.needsInputAnswers || {}), [phaseNum]: needsInputAnswers }
          : (ctx.needsInputAnswers || null),
        userOverrodeHalt
      };
      const userMsg = buildUserMessageForPhase(phaseNum, fullCtx);
      const enableWebSearch = PHASE_INFO[phaseNum].websearch;
      const responseText = await callClaude({ systemPrompt: sysPrompt, userMessage: userMsg, enableWebSearch });
      const json = extractJson(responseText);
      const validation = validatePhaseOutput(phaseNum, json);
      if (!validation.ok) {
        throw new Error('Schema violation: ' + validation.errors.join(', '));
      }
      if (validation.data.status === 'NEEDS_INPUT') {
        setPhases(prev => ({ ...prev, [phaseNum]: { ...prev[phaseNum], status: 'awaiting_input', needsInputState: validation.data } }));
        setShowNeedsInput({ phaseNum, questions: validation.data.questions });
        return;
      }
      if (validation.data.status === 'ERROR') {
        throw new Error(validation.data.reason);
      }
      // COMPLETE
      const updatedPhases = (prev) => ({ ...prev, [phaseNum]: { status: 'complete', output: validation.data, error: null, needsInputState: null } });
      setPhases(updatedPhases);
      // Persistir
      persistState({ pipelineCtx: ctx, phases: updatedPhases(phases), userOverrodeHalt });

      // Fase 1: tratar halt/pivot
      if (phaseNum === 1) {
        if (validation.data.verdict === 'stop' && validation.data.halt_pipeline) {
          setShowDecision(true);
          return;
        }
        if (validation.data.verdict === 'proceed_with_pivot') {
          setShowDecision(true);
          return;
        }
      }
      // Próxima fase
      if (phaseNum < 3) {
        const nextCtx = { ...ctx, phases: { ...ctx.phases, [phaseNum]: { output: validation.data } } };
        setPipelineCtx(nextCtx);
        await executePhase(phaseNum + 1, nextCtx);
      } else {
        setView('final');
      }
    } catch (err) {
      console.error(`Phase ${phaseNum} error:`, err);
      setPhases(prev => ({ ...prev, [phaseNum]: { ...prev[phaseNum], status: 'error', error: err.message } }));
    }
  }, [phases, userOverrodeHalt]);

  const handleStart = useCallback(async ({ idea, context, region, files }) => {
    const preFiltered = preFilter(files);
    const ctx = {
      userIdea: idea,
      additionalContext: context,
      userRegion: region,
      preFiltered,
      phases: {
        0: { output: null }, 1: { output: null }, 2: { output: null }, 3: { output: null }
      }
    };
    setPipelineCtx(ctx);
    setView('pipeline');
    await executePhase(0, ctx);
  }, [executePhase]);

  const handleNeedsInputSubmit = useCallback(async (answers) => {
    const { phaseNum } = showNeedsInput;
    setShowNeedsInput(null);
    await executePhase(phaseNum, pipelineCtx, answers);
  }, [showNeedsInput, pipelineCtx, executePhase]);

  const handleDecisionProceed = useCallback(async () => {
    setShowDecision(false);
    const phase1Output = phases[1].output;
    if (phase1Output.verdict === 'stop') {
      setUserOverrodeHalt(true);
    }
    const nextCtx = { ...pipelineCtx, phases: { ...pipelineCtx.phases, 1: { output: phase1Output } } };
    setPipelineCtx(nextCtx);
    await executePhase(2, nextCtx);
  }, [phases, pipelineCtx, executePhase]);

  const handleDecisionPivot = useCallback(async () => {
    setShowDecision(false);
    const phase1Output = phases[1].output;
    const newIdea = `${pipelineCtx.userIdea}\n\nPivote aceito: ${phase1Output.pivot_recommendation}`;
    await handleReset();
    await handleStart({ idea: newIdea, context: pipelineCtx.additionalContext, region: pipelineCtx.userRegion, files: [] });
  }, [phases, pipelineCtx, handleReset, handleStart]);

  const handleDecisionAbort = useCallback(() => {
    setShowDecision(false);
    handleReset();
  }, [handleReset]);

  const retryPhase = useCallback(async (phaseNum) => {
    await executePhase(phaseNum, pipelineCtx);
  }, [pipelineCtx, executePhase]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-mono { font-family: 'JetBrains Mono', 'IBM Plex Mono', monospace; }
        .font-sans { font-family: 'IBM Plex Sans', system-ui, sans-serif; }
        body { background: #09090b; }
        textarea, input { font-family: inherit; }
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #18181b; }
        ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #52525b; }
      `}</style>

      {view === 'setup' && (
        <SetupView
          onStart={handleStart}
          hasPersisted={hasPersisted}
          onResume={handleResume}
          onClearPersisted={handleClearPersisted}
        />
      )}

      {view === 'pipeline' && pipelineCtx && (
        <div className="max-w-5xl mx-auto px-6 py-8">
          <header className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="font-mono text-[10px] tracking-[0.25em] text-amber-400/80">[ IDEA ENGINEER / EXECUTANDO ]</div>
              <button onClick={handleReset} className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-rose-400 flex items-center gap-1">
                <Trash2 size={11} /> Cancelar
              </button>
            </div>
            <div className="text-sm text-zinc-300 leading-relaxed border-l-2 border-amber-400/40 pl-4 italic">
              "{pipelineCtx.userIdea.substring(0, 200)}{pipelineCtx.userIdea.length > 200 ? '...' : ''}"
            </div>
          </header>

          <div className="grid grid-cols-4 gap-3 mb-8">
            {[0, 1, 2, 3].map(n => (
              <PhaseCard
                key={n}
                phaseNum={n}
                status={phases[n].status}
                active={activeTab === n}
                onClick={() => setActiveTab(n)}
              />
            ))}
          </div>

          <div className="border border-zinc-800 rounded-sm bg-zinc-950/50">
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">[ Phase_{String(activeTab).padStart(2, '0')} / {PHASE_INFO[activeTab].name} ]</div>
                <div className="text-xs text-zinc-500 mt-1">{PHASE_INFO[activeTab].desc}</div>
              </div>
              <StatusGlyph status={phases[activeTab].status} size={18} />
            </div>
            <div className="p-6">
              {phases[activeTab].status === 'idle' && (
                <div className="font-mono text-xs text-zinc-600 uppercase tracking-wider">Aguardando fases anteriores...</div>
              )}
              {phases[activeTab].status === 'running' && (
                <div className="flex items-center gap-3 text-zinc-400 font-mono text-xs uppercase tracking-wider">
                  <Loader2 size={14} className="animate-spin text-amber-400" />
                  Executando agente...
                  {PHASE_INFO[activeTab].websearch && <Pill variant="info">Web Search ativa</Pill>}
                </div>
              )}
              {phases[activeTab].status === 'error' && (
                <div className="space-y-3">
                  <div className="font-mono text-xs uppercase tracking-wider text-rose-400 flex items-center gap-2">
                    <XCircle size={14} /> Erro na execução
                  </div>
                  <div className="text-sm text-zinc-300 bg-rose-500/5 border border-rose-500/20 rounded-sm p-3 font-mono text-xs">{phases[activeTab].error}</div>
                  <button onClick={() => retryPhase(activeTab)} className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 border border-zinc-700 hover:border-amber-400/60 text-zinc-300 hover:text-amber-300 rounded-sm flex items-center gap-1.5">
                    <RefreshCw size={11} /> Tentar novamente
                  </button>
                </div>
              )}
              {phases[activeTab].status === 'awaiting_input' && (
                <div className="space-y-3">
                  <div className="font-mono text-xs uppercase tracking-wider text-sky-400 flex items-center gap-2">
                    <AlertCircle size={14} /> Aguardando suas respostas
                  </div>
                  <button onClick={() => setShowNeedsInput({ phaseNum: activeTab, questions: phases[activeTab].needsInputState.questions })} className="font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 bg-sky-500/10 border border-sky-500/30 text-sky-300 hover:bg-sky-500/20 rounded-sm">
                    Responder perguntas
                  </button>
                </div>
              )}
              {phases[activeTab].status === 'complete' && (
                <>
                  {activeTab === 0 && <Phase0Detail output={phases[0].output} />}
                  {activeTab === 1 && <Phase1Detail output={phases[1].output} />}
                  {activeTab === 2 && <Phase2Detail output={phases[2].output} />}
                  {activeTab === 3 && (
                    <button onClick={() => setView('final')} className="font-mono text-xs uppercase tracking-wider px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 rounded-sm flex items-center gap-2">
                      <CheckCircle2 size={14} /> Ver prompts finais
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'final' && phases[3].output && (
        <FinalView phase3Output={phases[3].output} onReset={handleReset} />
      )}

      {showNeedsInput && (
        <NeedsInputModal
          phaseNum={showNeedsInput.phaseNum}
          questions={showNeedsInput.questions}
          onSubmit={handleNeedsInputSubmit}
          onCancel={() => setShowNeedsInput(null)}
        />
      )}

      {showDecision && phases[1].output && (
        <DecisionModal
          phase1Output={phases[1].output}
          onProceed={handleDecisionProceed}
          onPivot={handleDecisionPivot}
          onAbort={handleDecisionAbort}
        />
      )}
    </div>
  );
}
