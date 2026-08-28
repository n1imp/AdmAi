#!/usr/bin/env node
/**
 * react-doctor-summary.mjs — adapter determinístico do React Doctor para o EOS.
 *
 * O React Doctor (npx react-doctor@<pin> --json) emite um relatório grande (centenas de KB).
 * Despejar isso no contexto de um LLM viola a economia de tokens do EOS; este adapter reduz o
 * relatório a um ReactDoctorResult compacto e determinístico, e compara execuções contra um
 * baseline versionado por `id` estável de diagnóstico (filePath::line:col::plugin/rule::hash).
 *
 * PAPEL (autoridade): VERIFICADOR frontend especializado. REACT_DOCTOR_PASS != FEATURE_COMPLETE;
 * FAIL != falha automática de produto. O portão de política do EOS é:
 *   NO_NEW_BLOCKING_REACT_DOCTOR_DIAGNOSTIC + NO_UNEXPLAINED_SCORE_REGRESSION
 * (score NÃO é KPI soberano; nada de caçar 100/100).
 *
 * USO
 *   node tools/admai-delivery/react-doctor-summary.mjs resumo   <report.json>
 *   node tools/admai-delivery/react-doctor-summary.mjs baseline <report.json> <baseline-out.json>
 *   node tools/admai-delivery/react-doctor-summary.mjs diff     <baseline.json> <report.json>
 *   node tools/admai-delivery/react-doctor-summary.mjs --selftest
 *
 * `diff` sai com código 1 quando há diagnóstico NOVO de severidade `error` (classe bloqueante
 * inicial do piloto); warnings novos são reportados mas não bloqueiam. TOOL_UNAVAILABLE,
 * SCAN_CRASH e relatório ilegível NUNCA viram PASS: qualquer erro aqui sai com código 2.
 */
import fs from 'node:fs';

const SCHEMA_SUPORTADO = 3; // schemaVersion do relatório v0.9.x — valide ao subir a versão pinada.

function lerRelatorio(caminho) {
  const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  if (bruto.schemaVersion !== SCHEMA_SUPORTADO) {
    throw new Error(
      `schemaVersion ${bruto.schemaVersion} != ${SCHEMA_SUPORTADO} suportado — revalide o adapter antes de confiar no diff`
    );
  }
  if (bruto.error) throw new Error(`relatório carrega error: ${JSON.stringify(bruto.error).slice(0, 300)}`);
  if (bruto.ok !== true) throw new Error('relatório com ok!=true — SCAN_CRASH != PASS');
  if (!Array.isArray(bruto.diagnostics)) throw new Error('relatório sem diagnostics[]');
  return bruto;
}

function contar(mapa, chave) {
  mapa[chave] = (mapa[chave] || 0) + 1;
}

/** Relatório bruto -> ReactDoctorResult compacto (estrutura conceitual do EOS). */
export function resumir(bruto) {
  const porCategoria = {};
  const porRegra = {};
  const porSeveridade = {};
  const arquivos = new Set();
  for (const d of bruto.diagnostics) {
    contar(porCategoria, d.category || 'SemCategoria');
    contar(porRegra, `${d.plugin}/${d.rule}`);
    contar(porSeveridade, d.severity);
    arquivos.add(d.normalizedFilePath || d.filePath);
  }
  const projeto = Array.isArray(bruto.projects) ? bruto.projects[0] : undefined;
  return {
    ferramenta: 'react-doctor',
    versao: bruto.version,
    modo: bruto.mode,
    ok: bruto.ok,
    completo: projeto ? projeto.complete !== false : true,
    score: bruto.summary?.score ?? null,
    scoreLabel: bruto.summary?.scoreLabel ?? null,
    erros: bruto.summary?.errorCount ?? porSeveridade.error ?? 0,
    avisos: bruto.summary?.warningCount ?? porSeveridade.warning ?? 0,
    totalDiagnosticos: bruto.summary?.totalDiagnosticCount ?? bruto.diagnostics.length,
    arquivosAfetados: bruto.summary?.affectedFileCount ?? arquivos.size,
    arquivosAnalisados: projeto?.analyzedFileCount ?? null,
    duracaoMs: Math.round(bruto.elapsedMilliseconds ?? 0),
    checksPulados: projeto?.skippedChecks ?? [],
    porCategoria,
    porRegra,
  };
}

/** Baseline compacto versionável: resumo + ids estáveis (sustenta o diff NEW_DIAGNOSTIC). */
export function gerarBaseline(bruto, contexto = {}) {
  const errosIds = [];
  const avisosIds = [];
  for (const d of bruto.diagnostics) {
    (d.severity === 'error' ? errosIds : avisosIds).push(d.id);
  }
  errosIds.sort();
  avisosIds.sort();
  return { geradoEm: contexto.geradoEm ?? new Date().toISOString(), ...contexto, resumo: resumir(bruto), errosIds, avisosIds };
}

/**
 * Diff determinístico contra o baseline. NOVO = id presente agora e ausente do baseline.
 * Ids carregam linha/coluna: uma edição que desloca linhas RENOMEIA ids (aparece como novo+
 * resolvido da MESMA regra/arquivo) — o par é rotulado DESLOCAMENTO_PROVAVEL para triagem.
 */
export function diffContraBaseline(baseline, brutoAtual) {
  const antes = new Set([...baseline.errosIds, ...baseline.avisosIds]);
  const agoraIds = new Set();
  const novos = [];
  for (const d of brutoAtual.diagnostics) {
    agoraIds.add(d.id);
    if (!antes.has(d.id)) {
      novos.push({
        id: d.id,
        severidade: d.severity,
        regra: `${d.plugin}/${d.rule}`,
        categoria: d.category,
        arquivo: d.normalizedFilePath || d.filePath,
        linha: d.line,
        mensagem: String(d.message || '').slice(0, 200),
      });
    }
  }
  const resolvidos = [...antes].filter((id) => !agoraIds.has(id)).sort();
  const chaveRegraArquivo = (idOuDiag) => {
    const s = typeof idOuDiag === 'string' ? idOuDiag : idOuDiag.id;
    const partes = s.split('::'); // filePath::line:col::plugin/rule::hash
    return `${partes[0]}::${partes[2]}`;
  };
  const resolvidasPorChave = new Set(resolvidos.map(chaveRegraArquivo));
  for (const n of novos) {
    n.deslocamentoProvavel = resolvidasPorChave.has(chaveRegraArquivo(n));
  }
  const novosErros = novos.filter((n) => n.severidade === 'error');
  const resumoAtual = resumir(brutoAtual);
  const scoreBaseline = baseline.resumo?.score ?? null;
  return {
    novos,
    novosErros,
    novosAvisos: novos.filter((n) => n.severidade === 'warning'),
    resolvidos: resolvidos.length,
    score: { baseline: scoreBaseline, atual: resumoAtual.score, regrediu: scoreBaseline != null && resumoAtual.score != null && resumoAtual.score < scoreBaseline },
    resumoAtual,
    // Portão inicial do piloto: só ERRO NOVO bloqueia (legado/estilo/aviso novo não bloqueiam).
    bloqueia: novosErros.length > 0,
  };
}

function imprimirResumo(r) {
  const linhas = [
    `react-doctor v${r.versao} | modo=${r.modo} | ok=${r.ok} completo=${r.completo} | ${r.duracaoMs}ms`,
    `score=${r.score} (${r.scoreLabel}) | erros=${r.erros} avisos=${r.avisos} total=${r.totalDiagnosticos} | arquivosAfetados=${r.arquivosAfetados}/${r.arquivosAnalisados ?? '?'}`,
    `categorias: ${Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `top regras: ${Object.entries(r.porRegra).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' ')}`,
  ];
  if (r.checksPulados?.length) linhas.push(`checks pulados: ${JSON.stringify(r.checksPulados)}`);
  console.log(linhas.join('\n'));
}

function selftest() {
  const diag = (id, severity, extra = {}) => ({
    filePath: 'src/A.jsx', normalizedFilePath: 'src/A.jsx', plugin: 'react-doctor', rule: 'no-eval',
    severity, message: 'm', help: 'h', line: 1, column: 1, category: 'Security', id, tags: [], ...extra,
  });
  const bruto = (diags) => ({
    schemaVersion: 3, mode: 'full', reactDetected: true, version: '0.9.12', ok: true, directory: '.', diff: null,
    projects: [{ complete: true, analyzedFileCount: 10, skippedChecks: [] }],
    diagnostics: diags,
    summary: { errorCount: diags.filter((d) => d.severity === 'error').length, warningCount: diags.filter((d) => d.severity === 'warning').length, affectedFileCount: 1, totalDiagnosticCount: diags.length, score: 90, scoreLabel: 'great' },
    elapsedMilliseconds: 5, error: null,
  });
  let pass = 0; let fail = 0;
  const ok = (nome, cond) => { if (cond) { pass++; } else { fail++; console.error(`FALHOU: ${nome}`); } };

  const b0 = bruto([diag('src/A.jsx::1:1::react-doctor/no-eval::aaa', 'error'), diag('src/A.jsx::2:1::x/y::bbb', 'warning', { plugin: 'x', rule: 'y' })]);
  const r0 = resumir(b0);
  ok('resumo conta erros', r0.erros === 1 && r0.avisos === 1 && r0.totalDiagnosticos === 2);
  ok('resumo categorias', r0.porCategoria.Security === 2);
  const base = gerarBaseline(b0, { geradoEm: 't0' });
  ok('baseline separa ids', base.errosIds.length === 1 && base.avisosIds.length === 1);

  const d1 = diffContraBaseline(base, b0);
  ok('sem mudanças: nada novo, não bloqueia', d1.novos.length === 0 && d1.resolvidos === 0 && d1.bloqueia === false);

  const b2 = bruto([...b0.diagnostics, diag('src/B.jsx::9:9::react-doctor/no-secrets-in-client-code::ccc', 'error', { filePath: 'src/B.jsx', normalizedFilePath: 'src/B.jsx', rule: 'no-secrets-in-client-code' })]);
  const d2 = diffContraBaseline(base, b2);
  ok('erro novo detectado e bloqueia', d2.novosErros.length === 1 && d2.bloqueia === true && d2.novosErros[0].regra === 'react-doctor/no-secrets-in-client-code');

  const b3 = bruto([b0.diagnostics[1]]);
  const d3 = diffContraBaseline(base, b3);
  ok('resolvido contado, não bloqueia', d3.resolvidos === 1 && d3.bloqueia === false);

  const b4 = bruto([diag('src/A.jsx::5:1::react-doctor/no-eval::ddd', 'error'), b0.diagnostics[1]]);
  const d4 = diffContraBaseline(base, b4);
  ok('mesma regra/arquivo em linha nova = deslocamentoProvavel', d4.novosErros.length === 1 && d4.novosErros[0].deslocamentoProvavel === true);

  const b5 = bruto([]); b5.ok = false;
  let lancou = false;
  try { lerRelatorioDeObjeto(b5); } catch { lancou = true; }
  ok('ok!=true lança (SCAN_CRASH != PASS)', lancou);

  const b6 = bruto([]); b6.schemaVersion = 99;
  lancou = false;
  try { lerRelatorioDeObjeto(b6); } catch { lancou = true; }
  ok('schema desconhecido lança', lancou);

  console.log(`selftest: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

/** Mesmas validações de lerRelatorio, para objetos já parseados (selftest). */
function lerRelatorioDeObjeto(bruto) {
  if (bruto.schemaVersion !== SCHEMA_SUPORTADO) throw new Error('schema');
  if (bruto.error) throw new Error('error');
  if (bruto.ok !== true) throw new Error('ok');
  if (!Array.isArray(bruto.diagnostics)) throw new Error('diagnostics');
  return bruto;
}

const ehExecucaoDireta = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (ehExecucaoDireta) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === '--selftest') selftest();
    else if (cmd === 'resumo') imprimirResumo(resumir(lerRelatorio(a)));
    else if (cmd === 'baseline') {
      const baseline = gerarBaseline(lerRelatorio(a), { relatorioOrigem: a.replace(/\\/g, '/').split('/').pop() });
      fs.writeFileSync(b, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`baseline gravado em ${b}: erros=${baseline.errosIds.length} avisos=${baseline.avisosIds.length} score=${baseline.resumo.score}`);
    } else if (cmd === 'diff') {
      const d = diffContraBaseline(JSON.parse(fs.readFileSync(a, 'utf8')), lerRelatorio(b));
      console.log(`novos: ${d.novos.length} (erros=${d.novosErros.length} avisos=${d.novosAvisos.length}) | resolvidos: ${d.resolvidos} | score ${d.score.baseline} -> ${d.score.atual}${d.score.regrediu ? ' (REGREDIU — explique ou trate)' : ''}`);
      for (const n of d.novos.slice(0, 40)) {
        console.log(`  [${n.severidade}] ${n.regra} ${n.arquivo}:${n.linha}${n.deslocamentoProvavel ? ' (deslocamento provável)' : ''} — ${n.mensagem}`);
      }
      if (d.novos.length > 40) console.log(`  … +${d.novos.length - 40}`);
      process.exit(d.bloqueia ? 1 : 0);
    } else {
      console.error('uso: react-doctor-summary.mjs resumo <report.json> | baseline <report.json> <out.json> | diff <baseline.json> <report.json> | --selftest');
      process.exit(2);
    }
  } catch (e) {
    console.error(`ERRO (nunca interprete como PASS): ${e.message}`);
    process.exit(2);
  }
}
