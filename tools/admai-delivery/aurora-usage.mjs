#!/usr/bin/env node
/**
 * aurora-usage.mjs — medidor determinístico do design system LEGADO (Aurora) no chaveiro-painel.
 *
 * A refundação de frontend (EOS FRONTEND REFOUNDATION) migra o produto para um design system
 * novo; Aurora é LEGACY e sua remoção é acompanhada por número, não por impressão. Este medidor
 * extrai o vocabulário Aurora DOS PRÓPRIOS ARQUIVOS FONTE do sistema — nada de lista hardcoded
 * que envelhece:
 *
 *   - tokens: toda CSS var `--panel-*` definida nos styles Aurora;
 *   - classes remapeadas: todo seletor `.panel-ui .x` / `.panel-ui.x` dos CSS de rollout;
 *   - escopo: usos de `panel-ui`/`PanelScope` no src;
 *   - imports: imports diretos dos CSS Aurora.
 *
 * e conta ocorrências em `src/**` (jsx/js/css). Saída compacta + baseline versionável.
 *
 * INVARIANTE REGISTRADO: `AURORA_USAGE_ZERO != PRODUCT_ACCEPTED` — zerar o número não é o gate
 * de aceitação do produto; é só a condição FR-LEGACY.
 *
 * USO
 *   node tools/admai-delivery/aurora-usage.mjs medir [raizPainel]
 *   node tools/admai-delivery/aurora-usage.mjs baseline <saida.json> [raizPainel]
 *   node tools/admai-delivery/aurora-usage.mjs --selftest
 */
import fs from 'node:fs';
import path from 'node:path';

const CSS_AURORA = [
  'src/styles/panel.css',
  'src/styles/panel-primitives.css',
  'src/styles/panel-rollout.css',
  'src/styles/panel-overlay.css',
];

function listarArquivos(dir, exts, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listarArquivos(p, exts, acc);
    else if (exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

/** Extrai o vocabulário Aurora dos CSS fonte. */
export function extrairVocabulario(conteudosCss) {
  const tokens = new Set();
  const classes = new Set();
  for (const css of conteudosCss) {
    for (const m of css.matchAll(/--panel-[a-z0-9-]+/gi)) tokens.add(m[0]);
    // seletores `.panel-ui .x`, `.panel-ui.x`, `.panel-ui .x:hover` etc. — captura a classe alvo
    for (const m of css.matchAll(/\.panel-ui\s*\.([a-zA-Z][\w-]*)/g)) {
      if (m[1] !== 'panel-ui') classes.add(m[1]);
    }
  }
  return { tokens: [...tokens].sort(), classes: [...classes].sort() };
}

/** Conta ocorrências do vocabulário nos fontes do app. */
export function medirUso(arquivos, vocab) {
  const porCategoria = { tokens: 0, classesRemapeadas: 0, escopoPanelUi: 0, importsCssAurora: 0 };
  const porArquivo = {};
  const reTokens = vocab.tokens.length
    ? new RegExp(vocab.tokens.map((t) => t.replace(/[-]/g, '\\-')).join('|'), 'g')
    : null;
  // classes em className/strings: fronteira de palavra basta (classes têm nomes distintivos)
  const reClasses = vocab.classes.length
    ? new RegExp(`\\b(${vocab.classes.map((c) => c.replace(/[-]/g, '\\-')).join('|')})\\b`, 'g')
    : null;
  const reEscopo = /panel-ui|PanelScope/g;
  const reImport = /import\s+['"].*styles\/panel[^'"]*\.css['"]/g;

  for (const arq of arquivos) {
    const s = fs.readFileSync(arq, 'utf8');
    let n = 0;
    if (reTokens) {
      const c = (s.match(reTokens) || []).length;
      porCategoria.tokens += c;
      n += c;
    }
    if (reClasses) {
      const c = (s.match(reClasses) || []).length;
      porCategoria.classesRemapeadas += c;
      n += c;
    }
    const esc = (s.match(reEscopo) || []).length;
    porCategoria.escopoPanelUi += esc;
    n += esc;
    const imp = (s.match(reImport) || []).length;
    porCategoria.importsCssAurora += imp;
    n += imp;
    if (n) porArquivo[path.relative(process.cwd(), arq).replace(/\\/g, '/')] = n;
  }
  const total = Object.values(porCategoria).reduce((a, b) => a + b, 0);
  const top = Object.entries(porArquivo)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  return { total, porCategoria, arquivosComUso: Object.keys(porArquivo).length, top };
}

export function medirPainel(raiz) {
  const conteudos = CSS_AURORA.map((c) => {
    const p = path.join(raiz, c);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  });
  const vocab = extrairVocabulario(conteudos);
  // Mede o SRC do app; os próprios arquivos CSS do Aurora não contam como "uso" (são a fonte).
  const arquivos = listarArquivos(path.join(raiz, 'src'), ['.jsx', '.js', '.css']).filter(
    (a) => !CSS_AURORA.some((c) => a.replace(/\\/g, '/').endsWith(c))
  );
  const uso = medirUso(arquivos, vocab);
  return {
    vocabulario: { tokens: vocab.tokens.length, classesRemapeadas: vocab.classes.length },
    ...uso,
  };
}

function selftest() {
  let pass = 0;
  let fail = 0;
  const ok = (nome, cond) => {
    if (cond) pass++;
    else {
      fail++;
      console.error(`FALHOU: ${nome}`);
    }
  };
  const css = `.panel-ui .card { background: var(--panel-surface); }
.panel-ui .btn-primary:hover { color: var(--panel-accent); }
.panel-ui.panel-canvas { background: var(--panel-canvas); }`;
  const v = extrairVocabulario([css]);
  ok('tokens extraidos', v.tokens.includes('--panel-surface') && v.tokens.includes('--panel-canvas'));
  ok('classes extraidas', v.classes.includes('card') && v.classes.includes('btn-primary') && v.classes.includes('panel-canvas'));

  const tmp = path.join(process.env.TEMP || '/tmp', `aurora-self-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'A.jsx'), `<div className="card btn-primary">x</div> // var(--panel-surface)`);
  fs.writeFileSync(path.join(tmp, 'B.jsx'), `import '../styles/panel-rollout.css';\n<PanelScope/>`);
  fs.writeFileSync(path.join(tmp, 'C.jsx'), `<div className="cardigan">apenas cardigan — sem vocabulario Aurora</div>`);
  const uso = medirUso(
    [path.join(tmp, 'A.jsx'), path.join(tmp, 'B.jsx'), path.join(tmp, 'C.jsx')],
    v
  );
  ok('conta classes e token', uso.porCategoria.classesRemapeadas === 2 && uso.porCategoria.tokens === 1);
  ok('conta escopo e import', uso.porCategoria.escopoPanelUi === 1 && uso.porCategoria.importsCssAurora === 1);
  ok('word boundary evita falso positivo', !JSON.stringify(uso.top).includes('C.jsx'));
  ok('total coerente', uso.total === 5 && uso.arquivosComUso === 2);
  console.log(`selftest: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

const ehExecucaoDireta =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (ehExecucaoDireta) {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === '--selftest') selftest();
  else if (cmd === 'medir' || cmd === 'baseline') {
    const raiz = (cmd === 'medir' ? a : b) || 'chaveiro-painel';
    const r = medirPainel(raiz);
    if (cmd === 'baseline') {
      const baseline = {
        geradoEm: new Date().toISOString(),
        invariante: 'AURORA_USAGE_ZERO != PRODUCT_ACCEPTED',
        AURORA_USAGE: r.total,
        ...r,
      };
      fs.writeFileSync(a, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`baseline gravado em ${a}: AURORA_USAGE=${r.total}`);
    } else {
      console.log(
        `AURORA_USAGE=${r.total} | vocab: ${r.vocabulario.tokens} tokens, ${r.vocabulario.classesRemapeadas} classes | categorias: ${JSON.stringify(r.porCategoria)} | arquivos com uso: ${r.arquivosComUso}`
      );
      for (const [f, n] of r.top) console.log(`  ${n}\t${f}`);
    }
  } else {
    console.error('uso: aurora-usage.mjs medir [raiz] | baseline <saida.json> [raiz] | --selftest');
    process.exit(2);
  }
}
