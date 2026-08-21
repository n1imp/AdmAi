/**
 * AdmAi Delivery Harness — avaliacao de Gate.  [Wave P0]
 *
 * A DISTINCAO QUE ESTE MODULO EXISTE PARA IMPOR
 *
 *     EVIDENCE_BUNDLE_READY  ≠  GATE_VERIFIED
 *
 *   Um bundle pronto prova que alguem juntou evidencia. O gate pergunta outra coisa: essa
 *   evidencia satisfaz os criterios DECLARADOS ANTES? Sem separar os dois, "montei o bundle" vira
 *   "passei no gate" — e a diferenca some justamente quando importa, que e no relatorio final.
 *
 * OS CRITERIOS SAO DECLARADOS, NAO DERIVADOS DO RESULTADO
 *   `CRITERIOS_P0` e uma constante congelada. Se ela fosse montada a partir do que o bundle contem,
 *   o gate passaria sempre, por construcao: seria a lista se conferindo contra si mesma — o defeito
 *   autorreferencial que a R1 encontrou do lado EOS e que nao vou repetir aqui.
 *
 * CADA CRITERIO E UM PREDICADO EXECUTAVEL
 *   Nada de "harness completo: sim". Cada item recebe o estado observado e devolve booleano, com
 *   uma mensagem que diz o que faltou. `null` de observacao indisponivel NUNCA vira `true`.
 *
 * PROVENANCE
 *   Entradas sao OBSERVED (bundle gravado, filesystem, git). O veredito e DERIVED. Nada e INFERRED.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ, observarRepositorio } from './snapshot.mjs';

export const BUNDLE = `${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`;

/**
 * Criterios do gate P0 — DELIVERY_HARNESS_BOOTSTRAP.
 *
 * Derivados do contrato de entrega (secoes 6, 10, 17, 111) e do plano aprovado da wave, nao do que
 * o harness veio a produzir. Cada `avaliar` recebe `{bundle, estadoRepo, arquivos}`.
 */
export const CRITERIOS_P0 = Object.freeze([
  {
    id: 'GATE-P0-01',
    exigencia: 'Os cinco modulos do harness minimo existem e sao executaveis',
    avaliar: ({ arquivos }) => {
      const exigidos = ['snapshot.mjs', 'write-scope.mjs', 'test-orchestrator.mjs',
        'evidence-bundle.mjs', 'stale-check.mjs'];
      const faltando = exigidos.filter((m) => !arquivos.includes(m));
      return { ok: faltando.length === 0, detalhe: faltando.length ? `ausentes: ${faltando.join(', ')}` : `${exigidos.length}/5 presentes` };
    }
  },
  {
    id: 'GATE-P0-02',
    exigencia: 'Existe estado de execucao legivel por maquina, gerado e nao redigido',
    avaliar: () => {
      const p = `${RAIZ}docs/eos-v2/RUN_STATE.json`;
      if (!existsSync(p)) return { ok: false, detalhe: 'RUN_STATE.json ausente' };
      try {
        const s = JSON.parse(readFileSync(p, 'utf8'));
        /* Separar declarado de observado e o ponto: um estado que mistura os dois nao permite
           saber qual campo sustenta gate. */
        const ok = s.declarado != null && s.observado != null;
        return { ok, detalhe: ok ? 'declarado e observado separados' : 'RUN_STATE sem separacao declarado/observado' };
      } catch (e) {
        return { ok: false, detalhe: `RUN_STATE ilegivel: ${e.message}` };
      }
    }
  },
  {
    id: 'GATE-P0-03',
    exigencia: 'As suites exigidas executaram com exitCode 0 — lido, nao interpretado',
    avaliar: ({ bundle }) => {
      const exigidas = ['bot:unit', 'painel:unit'];
      const porId = new Map((bundle.execucoes ?? []).map((e) => [e.id, e]));
      const falhas = exigidas.filter((id) => porId.get(id)?.exitCode !== 0);
      return { ok: falhas.length === 0, detalhe: falhas.length ? `sem exitCode 0: ${falhas.join(', ')}` : exigidas.join(' + ') };
    }
  },
  {
    id: 'GATE-P0-04',
    exigencia: 'Nenhuma suite do bundle esta NAO_EXECUTADA disfarcada de aprovacao',
    avaliar: ({ bundle }) => {
      const ruins = (bundle.execucoes ?? []).filter((e) => e.estado === 'NAO_EXECUTADA' && e.exitCode === 0);
      return { ok: ruins.length === 0, detalhe: ruins.length ? ruins.map((e) => e.id).join(', ') : 'nenhuma' };
    }
  },
  {
    id: 'GATE-P0-05',
    exigencia: 'Toda afirmacao do bundle tem provenance, e nenhuma que feche gate e fraca',
    avaliar: ({ bundle }) => {
      const fracas = (bundle.afirmacoes ?? []).filter((a) => ['INFERRED', 'PROPOSED', 'UNKNOWN'].includes(a.provenance));
      const semMarca = (bundle.afirmacoes ?? []).filter((a) => a.provenance == null);
      const ok = fracas.length === 0 && semMarca.length === 0 && (bundle.afirmacoes ?? []).length > 0;
      return { ok, detalhe: ok ? `${bundle.afirmacoes.length} afirmacoes, todas OBSERVED/DERIVED` : `fracas=${fracas.length} sem marca=${semMarca.length}` };
    }
  },
  {
    id: 'GATE-P0-06',
    exigencia: 'O bundle nao carrega valor de configuracao sensivel, apenas rotulo',
    avaliar: ({ bundle }) => {
      const ROTULOS = ['PRESENT', 'ABSENT', 'CONFIGURED', 'VALIDATED'];
      const ruins = Object.entries(bundle.ambiente?.config ?? {}).filter(([, v]) => !ROTULOS.includes(v));
      return { ok: ruins.length === 0, detalhe: ruins.length ? ruins.map(([k]) => k).join(', ') : `config por rotulo (alvo ${bundle.ambiente?.databaseTarget ?? 'UNKNOWN'})` };
    }
  },
  {
    id: 'GATE-P0-07',
    exigencia: 'O repositorio esta integro: git responde e diff --check limpo',
    avaliar: ({ estadoRepo }) => {
      const ok = estadoRepo.git.branch != null && estadoRepo.git.head != null && estadoRepo.git.diffCheckLimpo === true;
      return { ok, detalhe: ok ? `${estadoRepo.git.branch} @ ${String(estadoRepo.git.head).slice(0, 12)}` : 'git mudo ou diff --check sujo' };
    }
  },
  {
    id: 'GATE-P0-08',
    exigencia: 'O bundle e sobre ESTE estado do repositorio, nao sobre um anterior',
    /* Sem isto, um bundle de ontem fecharia o gate de hoje: evidencia que existe, esta assinada,
       e nao e mais sobre o artefato. E a mesma propriedade que o stale-check impoe na integracao. */
    avaliar: ({ bundle, estadoRepo }) => {
      const ok = bundle.ambiente?.head === estadoRepo.git.head;
      return { ok, detalhe: ok ? 'HEAD do bundle == HEAD atual' : `bundle em ${String(bundle.ambiente?.head).slice(0, 12)}, repo em ${String(estadoRepo.git.head).slice(0, 12)}` };
    }
  },
  {
    id: 'GATE-P0-09',
    exigencia: 'O bundle referencia artefatos com fingerprint verificavel',
    avaliar: ({ bundle }) => {
      const arts = bundle.artefatos ?? [];
      const ruins = arts.filter((a) => !/^[0-9a-f]{64}$/.test(a.sha256 ?? ''));
      return { ok: arts.length > 0 && ruins.length === 0, detalhe: arts.length ? `${arts.length} artefatos com sha256` : 'nenhum artefato' };
    }
  }
]);

/**
 * Avalia um gate. PURA nos argumentos — as sabotagens percorrem este caminho.
 */
export function avaliarGate({ criterios, bundle, estadoRepo, arquivos }) {
  const resultados = [];
  for (const c of criterios) {
    let r;
    try {
      r = c.avaliar({ bundle: bundle ?? {}, estadoRepo, arquivos: arquivos ?? [] });
    } catch (e) {
      /* Criterio que explode nao passa. Um avaliador que engolisse a excecao transformaria
         defeito do proprio gate em aprovacao silenciosa. */
      r = { ok: false, detalhe: `criterio lancou: ${e.message}` };
    }
    resultados.push({ id: c.id, exigencia: c.exigencia, ...r });
  }

  const naoSatisfeitos = resultados.filter((r) => !r.ok);
  return {
    resultados,
    naoSatisfeitos,
    veredito: naoSatisfeitos.length === 0 ? 'VERIFIED' : 'NOT_VERIFIED'
  };
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

export function executar() {
  const estadoRepo = observarRepositorio();
  const arquivos = ['snapshot.mjs', 'write-scope.mjs', 'test-orchestrator.mjs',
    'evidence-bundle.mjs', 'stale-check.mjs', 'run-state.mjs', 'gate.mjs']
    .filter((m) => existsSync(`${RAIZ}tools/admai-delivery/${m}`));

  const bundle = existsSync(BUNDLE) ? JSON.parse(readFileSync(BUNDLE, 'utf8')) : null;

  /* Bundle ausente reprova ANTES de qualquer criterio: sem evidencia nao ha gate a avaliar. */
  if (!bundle) {
    console.log('AdmAi Delivery — Gate P0  [DELIVERY_HARNESS_BOOTSTRAP]');
    console.log('  EVIDENCE_BUNDLE ausente — NOT_VERIFIED. Gate sem evidencia nao e gate.');
    return 1;
  }

  const real = avaliarGate({ criterios: CRITERIOS_P0, bundle, estadoRepo, arquivos });

  /* Controles negativos: cada criterio precisa ser capaz de reprovar. Um gate que nunca reprova
     mede otimismo, nao entrega. Cada sabotagem ataca UM criterio, pelo caminho real. */
  const bomEstado = estadoRepo;
  const bomArquivos = arquivos;
  const sab = (patchBundle = {}, patchRepo = {}, arqs = bomArquivos) => ({
    criterios: CRITERIOS_P0,
    bundle: { ...bundle, ...patchBundle },
    estadoRepo: { ...bomEstado, ...patchRepo, git: { ...bomEstado.git, ...(patchRepo.git ?? {}) } },
    arquivos: arqs
  });

  const sabotagens = [
    ['GATE-P0-01', 'modulo do harness ausente', sab({}, {}, bomArquivos.filter((a) => a !== 'stale-check.mjs'))],
    ['GATE-P0-03', 'suite exigida com exitCode 1', sab({ execucoes: [{ id: 'bot:unit', estado: 'FAIL', exitCode: 1 }, { id: 'painel:unit', estado: 'PASS', exitCode: 0 }] })],
    ['GATE-P0-03', 'suite exigida ausente do bundle', sab({ execucoes: [] })],
    ['GATE-P0-04', 'NAO_EXECUTADA com exitCode 0', sab({ execucoes: [...bundle.execucoes, { id: 'x', estado: 'NAO_EXECUTADA', motivo: 'sem ambiente', exitCode: 0 }] })],
    ['GATE-P0-05', 'afirmacao INFERRED fechando gate', sab({ afirmacoes: [{ texto: 'acho que passou', provenance: 'INFERRED' }] })],
    ['GATE-P0-05', 'afirmacao sem provenance', sab({ afirmacoes: [{ texto: 'passou' }] })],
    ['GATE-P0-06', 'valor de config em vez de rotulo', sab({ ambiente: { ...bundle.ambiente, config: { DATABASE_URL: 'postgresql://u:p@h:5432/db' } } })],
    ['GATE-P0-07', 'diff --check sujo', sab({}, { git: { diffCheckLimpo: false } })],
    ['GATE-P0-07', 'git mudo', sab({}, { git: { branch: null, head: null } })],
    ['GATE-P0-08', 'bundle de outro HEAD', sab({ ambiente: { ...bundle.ambiente, head: '0'.repeat(40) } })],
    ['GATE-P0-09', 'artefato com sha invalido', sab({ artefatos: [{ caminho: 'a.mjs', sha256: 'nao-e-sha' }] })],
    ['GATE-P0-02', 'criterio que lanca excecao',
      { criterios: [{ id: 'GATE-P0-02', exigencia: 'x', avaliar: () => { throw new Error('boom'); } }], bundle, estadoRepo, arquivos }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , entrada]) => !avaliarGate(entrada).naoSatisfeitos.some((r) => r.id === id))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: o estado real e coerente precisa ser ACEITO. Sem ele, um gate que
     reprovasse tudo exibiria 12/12 sabotagens e pareceria rigoroso. */
  const positivo = avaliarGate({ criterios: CRITERIOS_P0, bundle, estadoRepo, arquivos });

  console.log('AdmAi Delivery — Gate P0  [DELIVERY_HARNESS_BOOTSTRAP]');
  console.log(`  bundle : ${BUNDLE.replace(RAIZ, '')} (fechaGate=${bundle.fechaGate})`);
  console.log('  criterios DECLARADOS antes, avaliados contra o estado observado:');
  for (const r of real.resultados) {
    console.log(`    ${r.ok ? 'OK  ' : 'FALHA'} ${r.id}  ${r.exigencia}`);
    console.log(`           ${r.detalhe}`);
  }
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.veredito === 'VERIFIED' ? 'estado real e coerente aceito' : 'REJEITOU o estado real'}`);

  if (negFalhos.length > 0) {
    console.log('  INSTRUMENTO_COMPROMETIDO — nao use este veredito');
    return 2;
  }

  console.log(`  VEREDITO : P0 = ${real.veredito}`);
  if (real.veredito !== 'VERIFIED') {
    for (const r of real.naoSatisfeitos) console.log(`    ! ${r.id}: ${r.detalhe}`);
    return 1;
  }

  console.log('    provado: os cinco modulos existem, o estado e gerado e separa declarado de');
  console.log('      observado, as suites exigidas terminaram em exitCode 0, nenhuma NAO_EXECUTADA');
  console.log('      se disfarca de aprovacao, toda afirmacao tem provenance forte, a config aparece');
  console.log('      por rotulo, o repositorio esta integro e o bundle e deste HEAD.');
  console.log('    NAO provado: que o produto esta correto. Este gate e sobre o HARNESS DE ENTREGA —');
  console.log('      P0 entrega o instrumento, nao funcionalidade de negocio. As waves seguintes usam');
  console.log('      este instrumento; a corretude delas e verificada por elas.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar());
}
