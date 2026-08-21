/**
 * EOS V2 — Risk Classifier
 *
 * Transforma sinais deterministicos em Risk Vector e nivel L0-L3.
 *
 * REGRA CENTRAL, que o separa do roteador legado:
 *   sinais -> DIMENSOES -> composicao -> nivel
 * e nunca
 *   palavra-chave -> nivel
 *
 * Uma palavra-chave sozinha jamais decide profundidade (secao 24 do contrato).
 * Ela alimenta dimensoes; as dimensoes compoem por regra; a composicao decide.
 *
 * DIRECAO DE FALHA: na duvida, escala. Subclassificar entrega menos escrutinio
 * do que o risco exige e e falha grave. Superclassificar custa tokens e e falha
 * leve. Toda regra ambigua aqui resolve para MAIS profundidade.
 *
 * LIMITE DECLARADO: este classificador e lexico. Ele nao entende o codigo. Por
 * isso emite `requiresClarification` e `confidence` — o EOS Router deve
 * confirmar impacto real contra o Impact Graph antes de agir em L2+.
 */

export const DIMENSIONS = [
  'functional', 'security', 'data', 'ux', 'operational',
  'externalIntegration', 'environment', 'reversibility', 'uncertainty'
];

/** Dimensoes que saturam sozinhas: nota 3 em qualquer uma implica L3. */
const CRITICAL_DIMENSIONS = ['security', 'data', 'reversibility', 'environment'];

const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Trechos "apenas mencionados", nao "acionados":
 *   - dentro de aspas: 'autenticacao', "senha"
 *   - precedidos por "a palavra", "o termo", "a expressao"
 * Um dominio citado assim nao promove nivel.
 */
function mentionSpans(text) {
  const spans = [];
  const quoted = /['"“”']([^'"“”']{2,40})['"“”']/g;
  const namedAs = /\b(?:a palavra|o termo|a expressao|a string)\s+\S+/g;
  for (const re of [quoted, namedAs]) {
    let m;
    while ((m = re.exec(text)) !== null) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

const inSpan = (idx, spans) => spans.some(([a, b]) => idx >= a && idx < b);

/** Conta ocorrencias de um padrao fora dos trechos de mera mencao. */
function hits(text, pattern, spans) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let m, n = 0;
  while ((m = re.exec(text)) !== null) if (!inSpan(m.index, spans)) n++;
  return n;
}

/* ------------------------------------------------------------------ *
 * Catalogo de sinais. Cada sinal alimenta dimensoes com um piso.
 * ------------------------------------------------------------------ */

const SIGNALS = [
  // --- Dominios protegidos: saturam seguranca/dado ---
  { id: 'rbac', re: /\b(rbac|autoriza(c|ç)(a|ã)o|autorizacoes|permissao|permissoes|controle de acesso)\b/,
    floors: { security: 3, functional: 2 }, specialists: ['security', 'backend'], codex: true },
  { id: 'tenant', re: /\b(tenant|multi-?tenant|isolamento|filial|filiais|escopo de empresa)\b/,
    floors: { security: 3, data: 2 }, specialists: ['security', 'data', 'backend'], codex: true },
  { id: 'authn', re: /\b(autentica(c|ç)(a|ã)o|login|senha|2fa|oauth|oidc|sessao|sessoes|token|jwt|cookie)\b/,
    floors: { security: 3 }, specialists: ['security', 'backend'], codex: true },
  { id: 'secret', re: /\b(secret|credencial|credenciais|api ?key|service role|chave privada)\b/,
    floors: { security: 3, reversibility: 2 }, specialists: ['security'], codex: true },
  // Servir arquivo por caminho montado a partir de dado e a familia classica de
  // path traversal. Faltava vocabulario: o achado real do Semgrep em
  // routes/documentos.js:158 classificava L0. Finding F-003.
  { id: 'fileAccess', re: /\b(sendfile|send_file|caminho de arquivo|path traversal|storagekey|storage key|download de arquivo|upload de arquivo|servir arquivo)\b/,
    floors: { security: 2, functional: 2 }, specialists: ['security', 'backend'] },
  { id: 'personalData', re: /\b(dados? pessoa(l|is)|pii|lgpd|consentimento|cpf|biometri|geolocaliza|localizacao|gps)\b/,
    floors: { security: 2, data: 3 }, specialists: ['security', 'data'], codex: true, userDecision: true },
  { id: 'payments', re: /\b(pagamento|cobranca|billing|stripe|assinatura|trial|paywall|entitlement|comissao|comissoes)\b/,
    floors: { functional: 2, data: 2 }, specialists: ['backend'], userDecision: true },

  // --- Dado e schema ---
  { id: 'migration', re: /\b(migration|migracao de (banco|schema)|alter table|drop (table|column))\b/,
    floors: { data: 3, reversibility: 3 }, specialists: ['data'], codex: true },
  { id: 'schema', re: /\b(schema|prisma|coluna|tabela|indice|constraint|relacionamento)\b/,
    floors: { data: 2 }, specialists: ['data'] },
  { id: 'retention', re: /\b(retencao|expurgo|purga|anonimiza|excluir dados|apagar dados)\b/,
    floors: { data: 3, reversibility: 3 }, specialists: ['data'], codex: true },

  // --- Contratos e integracao ---
  { id: 'contract', re: /\b(contrato|payload|schema json|endpoint|rota da api|versionamento de api)\b/,
    floors: { functional: 2, operational: 1 }, specialists: ['integration', 'backend'] },
  { id: 'crossLayer', re: /\b(entre o painel e a api|frontend e backend|painel e a api|entre camadas)\b/,
    floors: { functional: 2 }, specialists: ['integration', 'backend', 'frontend'] },
  { id: 'externalProvider', re: /\b(provedor|whatsapp|evolution|meta|google|maps|sms|e-?mail transacional|webhook externo|api externa)\b/,
    floors: { externalIntegration: 2, operational: 1 }, specialists: ['externalIntegrations'] },

  // --- Mobile e offline ---
  // 'backend' entra porque sincronizacao e, por definicao, cliente<->servidor:
  // nao existe resolucao de conflito offline sem o lado que recebe. Detectado
  // por ENG-04, que exigia 4 Engineers e obtinha 3.
  { id: 'offline', re: /\b(offline|sincroniza|conflito de sincroniza|fila local|reconex)\b/,
    floors: { data: 3, reversibility: 2, functional: 2 },
    specialists: ['mobile', 'data', 'integration', 'backend'], codex: true },
  { id: 'mobile', re: /\b(capacitor|android|ios|app nativo|deep link|camera|gps|geolocaliza|localizacao)\b/,
    floors: { functional: 1 }, specialists: ['mobile'] },

  // --- Ambiente ---
  { id: 'production', re: /\b(producao|prod\b|ambiente real|banco de producao)\b/,
    floors: { environment: 3, reversibility: 3, operational: 3 }, userDecision: true, codex: true },
  { id: 'staging', re: /\b(staging|homologa)\b/, floors: { environment: 2, operational: 1 } },
  { id: 'deploy', re: /\b(deploy|release|rollout|feature flag|ci\b|pipeline)\b/,
    floors: { operational: 2, environment: 2 }, specialists: ['release'] },

  // --- Superficie de interface ---
  { id: 'ui', re: /\b(botao|tela|componente|formulario|pagina|lista|filtro|layout|interface|painel)\b/,
    floors: { ux: 1 }, specialists: ['frontend'] },
  { id: 'a11y', re: /\b(acessibilidade|aria|leitor de tela|contraste|foco|teclado)\b/,
    floors: { ux: 2 }, specialists: ['accessibility'] },
  { id: 'performance', re: /\b(performance|latencia|lentidao|n\+1|cache|bundle|throughput)\b/,
    floors: { operational: 2 }, specialists: ['performance'] }
];

/** Acoes cosmeticas: nao mudam comportamento, so apresentacao textual. */
const COSMETIC = /\b(erro de digitacao|typo|ortografi|acentuacao|renomear o (texto|rotulo|label)|troque o texto|altere o texto|corrigir o texto|texto do botao|label|rotulo|titulo)\b/;

/** Acoes destrutivas. */
const DESTRUCTIVE = /\b(remover|remova|excluir|exclua|apagar|apague|deletar|delete|dropar|truncar|zerar)\b/;

/** Superficies que sao documentacao, nao produto em execucao. */
const DOCS_SURFACE = /\b(pagina de ajuda|documentacao|readme|comentario|changelog|manual)\b/;

/** Marcadores de dominio protegido que sobrevivem mesmo a acao cosmetica. */
const PROTECTED_EVEN_IF_COSMETIC = /\b(consentimento|dados? pessoa(l|is)|lgpd|termos de uso|politica de privacidade|aviso legal|juridic)\b/;

/** Vagueza irredutivel. */
const VAGUE = /\b(aquele|aquilo|que (conversamos|falamos|discutimos)|do jeito que|como combinado|a mesma coisa|ajuste ali)\b/;

/** Escopo local declarado explicitamente. */
const SCOPED_LOCAL = /\b(sem alterar (a consulta|o backend|a api)|apenas visual|somente no (front|painel)|local\b)\b/;

/* ------------------------------------------------------------------ */

export function classify(request) {
  const text = norm(request);
  const spans = mentionSpans(text);

  const vector = Object.fromEntries(DIMENSIONS.map((d) => [d, 0]));
  const reasons = [];
  const specialists = new Set();
  let requiresCodex = false;
  let requiresUserDecision = false;

  const cosmetic = COSMETIC.test(text);
  const docsSurface = DOCS_SURFACE.test(text);
  const destructive = DESTRUCTIVE.test(text);
  const protectedCosmetic = PROTECTED_EVEN_IF_COSMETIC.test(text);
  const scopedLocal = SCOPED_LOCAL.test(text);

  // Acao cosmetica sobre superficie de documentacao neutraliza dominios
  // apenas CITADOS. Nao neutraliza dominio juridicamente protegido.
  const neutralize = cosmetic && docsSurface && !protectedCosmetic;

  for (const sig of SIGNALS) {
    if (hits(text, sig.re, spans) === 0) continue;
    if (neutralize && sig.floors.security !== undefined && !protectedCosmetic) {
      reasons.push(`sinal '${sig.id}' neutralizado: acao cosmetica em superficie de documentacao`);
      continue;
    }
    for (const [dim, val] of Object.entries(sig.floors)) {
      if (val > vector[dim]) vector[dim] = val;
    }
    (sig.specialists || []).forEach((s) => specialists.add(s));
    if (sig.codex) requiresCodex = true;
    if (sig.userDecision) requiresUserDecision = true;
    reasons.push(`sinal '${sig.id}' detectado`);
  }

  // Acao destrutiva eleva reversibilidade independentemente do alvo.
  if (destructive && (vector.data >= 2 || /\b(coluna|tabela|registro|dados)\b/.test(text))) {
    vector.reversibility = Math.max(vector.reversibility, 3);
    reasons.push('acao destrutiva sobre dado: reversibilidade saturada');
  }

  // Incerteza.
  if (VAGUE.test(text)) {
    vector.uncertainty = 3;
    reasons.push('referencia vaga e irredutivel: incerteza maxima');
  } else if (text.trim().split(/\s+/).length < 6) {
    vector.uncertainty = Math.max(vector.uncertainty, 2);
    reasons.push('pedido curto demais para determinar impacto');
  }

  // FINDING F-003, do dogfooding: ausencia de sinal reconhecido NAO e ausencia
  // de risco — e ausencia de conhecimento. O achado real do Semgrep sobre
  // res.sendFile classificava L0 porque nenhum sinal casava.
  //
  // Consequencia de desenho: L0 passa a ser CONQUISTADO, nunca herdado. Exige
  // prova positiva de trivialidade (acao cosmetica sem dominio protegido). Sem
  // essa prova, o classificador admite que nao entendeu e escala.
  const nenhumSinal = !reasons.some((r) => r.startsWith("sinal '"));
  if (nenhumSinal && !cosmetic) {
    vector.uncertainty = Math.max(vector.uncertainty, 2);
    vector.functional = Math.max(vector.functional, 1);
    reasons.push('nenhum sinal reconhecido e a acao nao e cosmetica: o classificador nao entendeu a tarefa');
  }

  // Escopo local declarado reduz alcance funcional, nunca seguranca nem dado.
  if (scopedLocal && vector.security === 0 && vector.data <= 1) {
    vector.functional = Math.min(vector.functional, 1);
    reasons.push('escopo local declarado explicitamente');
  }

  // Acao puramente cosmetica sem dominio protegido: nao muda comportamento.
  // Zera funcional e UX — a superficie e tocada, mas nada nela passa a agir
  // diferente. E o unico caminho legitimo para L0.
  if (cosmetic && vector.security === 0 && vector.data === 0 && !protectedCosmetic) {
    vector.functional = 0;
    vector.ux = 0;
    reasons.push('acao cosmetica sem dominio protegido: sem mudanca de comportamento');
  }

  // Dominio juridicamente protegido em acao cosmetica: piso de seguranca.
  if (protectedCosmetic) {
    vector.security = Math.max(vector.security, 1);
    vector.functional = Math.max(vector.functional, 2);
    requiresUserDecision = true;
    reasons.push('conteudo juridicamente protegido: texto nao e cosmetico aqui');
  }

  const level = composeLevel(vector, { requiresUserDecision });
  const requiresClarification = vector.uncertainty >= 3;

  return {
    request,
    vector,
    level,
    reasons,
    specialists: [...specialists],
    requiresCodex: requiresCodex || level === 'L3',
    requiresUserDecision,
    requiresClarification,
    confidence: confidenceOf(vector, reasons.length),
    affectedSurfaces: surfacesOf(text),
    evidenceDomains: evidenceOf(vector)
  };
}

/**
 * Composicao. NAO e soma simples — a soma permitiria que muitas dimensoes
 * baixas simulassem um risco alto, e que uma dimensao critica fosse diluida
 * por dimensoes irrelevantes.
 */
export function composeLevel(v, opts = {}) {
  // 1. Dimensao critica saturada decide sozinha.
  for (const d of CRITICAL_DIMENSIONS) if (v[d] >= 3) return 'L3';

  // 2. Duas dimensoes criticas em nivel alto tambem decidem.
  if (CRITICAL_DIMENSIONS.filter((d) => v[d] >= 2).length >= 2) return 'L3';

  // 3. Incerteza maxima nunca reduz: escala para revisao transversal.
  if (v.uncertainty >= 3) return 'L2';

  // 4. Materia reservada ao usuario exige, no minimo, tratamento transversal.
  if (opts.requiresUserDecision) return 'L2';

  // 5. Qualquer dimensao critica presente, ou alcance transversal.
  if (CRITICAL_DIMENSIONS.some((d) => v[d] >= 2)) return 'L2';
  if (v.functional >= 2 || v.externalIntegration >= 2 || v.operational >= 2) return 'L2';

  // 6. Impacto local.
  if (v.functional >= 1 || v.ux >= 1 || v.data >= 1 || v.operational >= 1) return 'L1';

  return 'L0';
}

function confidenceOf(v, signalCount) {
  if (v.uncertainty >= 3) return 'BAIXA';
  if (signalCount === 0) return 'BAIXA';
  if (v.uncertainty >= 2) return 'MEDIA';
  return 'ALTA';
}

function surfacesOf(text) {
  const map = {
    // 'eos' precisa existir como superficie propria. Sem ela, uma mudanca na
    // infraestrutura do EOS herda o dono errado — detectado no dogfooding
    // EOS-sobre-EOS: "filtro do Knowledge Loader" casava o sinal 'ui' e
    // recebia ownership de frontend. Finding F-002.
    eos: /\b(eos|risk (vector|classifier)|proof ledger|knowledge (loader|system)|execution router|contract bus|finding router|self-?test)\b/,
    // Infraestrutura de teste e superficie propria, distinta de `eos` (interno
    // do EOS) e de `infra` (CI/deploy). Sua ausencia foi uma das causas de F-005.
    testInfra: /\b(vitest|jest|jsdom|test runner|runner de teste|pool de workers|worker|fixtures?|harness|isolamento de teste|setup de teste|mock global|infraestrutura de (teste|verificacao))\b/,
    backend: /\b(api|rota|endpoint|service|middleware|backend)\b/,
    frontend: /\b(painel|tela|componente|react|formulario|interface)\b/,
    data: /\b(banco|schema|prisma|tabela|coluna|migration)\b/,
    mobile: /\b(app|android|capacitor|offline|mobile)\b/,
    infra: /\b(ci|deploy|docker|producao|staging)\b/
  };
  const found = Object.entries(map).filter(([, re]) => re.test(text)).map(([k]) => k);
  if (found.includes('testInfra') && !found.includes('eos')) return ['testInfra'];
  // Mudanca no proprio EOS nao e mudanca de produto: as superficies de produto
  // detectadas por sinal lexical fraco sao descartadas.
  return found.includes('eos') ? ['eos'] : found;
}

function evidenceOf(v) {
  const need = [];
  if (v.security >= 2) need.push('security');
  if (v.data >= 2) need.push('data');
  if (v.externalIntegration >= 2) need.push('externalDocs');
  if (v.environment >= 2) need.push('environment');
  if (v.functional >= 2) need.push('callers');
  return need;
}

// CLI: node classify.mjs "pedido"
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const req = process.argv.slice(2).join(' ');
  if (!req) { console.error('uso: node classify.mjs "<pedido>"'); process.exit(2); }
  console.log(JSON.stringify(classify(req), null, 2));
}
