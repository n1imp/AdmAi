/**
 * AdmAi Delivery Harness — verificacao de frescor (stale check).  [Wave P0]
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *   Verificacao e integracao acontecem em momentos diferentes. Entre os dois, o candidato pode ter
 *   mudado, a base pode ter andado, ou os dois. Integrar com base numa verificacao obsoleta produz
 *   a pior categoria de evidencia: uma que existe, esta assinada, e nao e mais sobre o artefato.
 *
 * A REGRA QUE MOLDA O ARQUIVO INTEIRO
 *   Ausencia de registro significa STALE, nunca FRESH.
 *
 *   Um verificador de frescor que passa quando nao ha o que comparar e vacuo: ele daria PASS
 *   exatamente na situacao mais perigosa — ninguem registrou a verificacao e ninguem sabe sobre o
 *   que ela foi. Por isso `ST-01` exige o registro antes de qualquer outra checagem, e o avaliador
 *   nao tem caminho que devolva "sem falhas" com registro ausente.
 *
 * PROVENANCE
 *   `head`, `branch` e os sha256 sao OBSERVED. `frescor` e DERIVED. Nada e INFERRED.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

export const REGISTRO = `${RAIZ}docs/eos-v2/VERIFICATION_RECORD.json`;

/** Lane do Claude: onde o candidato do SL-A-01 vive antes da integracao. */
export const LANE_CLAUDE = 'C:/Users/n1iag/dev/admai-worktrees/EOS_BUILD_CLAUDE/';

/** Arquivos do candidato SL-A-01, relativos a lane. */
export const CANDIDATO_SL_A_01 = Object.freeze([
  'tools/eos/layout.mjs',
  'tools/eos/verify-layout.mjs',
  'tools/eos/layout-plan-anchor.json',
  'tools/eos/protocol/types/families.mjs',
  'tools/eos/protocol/types/distinctions.mjs',
  'tools/eos/protocol/types/index.mjs',
  'tools/eos/protocol/types/verify.mjs',
  'tools/eos/protocol/types/oracle/canonical-families.json',
  'tools/eos/protocol/types/oracle/plan-anchor.json',
  'tools/eos/protocol/types/oracle/sl-a-01-surface.json'
]);

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

function git(args, raiz) {
  try {
    return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Observa o estado atual do candidato e da base.
 * Arquivo ausente vira `null`, e nao string vazia: some do fingerprint e reprova, em vez de casar
 * com outro ausente.
 */
export function observarFrescor({ lane = LANE_CLAUDE, base = RAIZ, arquivos = CANDIDATO_SL_A_01 } = {}) {
  const fingerprints = {};
  for (const rel of arquivos) {
    const abs = `${lane}${rel}`;
    fingerprints[rel] = existsSync(abs) ? sha(abs) : null;
  }
  return {
    baseHead: git(['rev-parse', 'HEAD'], base),
    baseBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], base),
    fingerprints
  };
}

/**
 * Avalia frescor. PURA nos argumentos — as sabotagens percorrem este caminho.
 *
 * `registro` e o estado capturado NO MOMENTO DA VERIFICACAO; `agora`, o estado no momento em que se
 * pretende integrar.
 */
export function avaliarFrescor({ registro, agora }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  /* Sem registro nao ha frescor a provar. Isto reprova ANTES de tudo, e nao ha ramo que devolva
     sucesso a partir daqui — e o que impede o verificador de ser vacuamente verdadeiro. */
  const registroValido = registro != null && typeof registro === 'object' &&
    typeof registro.fingerprints === 'object' && registro.fingerprints != null;
  check('ST-01', registroValido,
    'registro de verificacao ausente ou ilegivel; sem ele o estado e STALE por definicao, nunca FRESH');
  if (!registroValido) return { falhas, passou, alterados: [], veredito: 'STALE' };

  check('ST-02', registro.baseHead != null && agora.baseHead != null,
    'HEAD indisponivel no registro ou agora; comparacao de base impossivel');

  check('ST-03', registro.baseHead === agora.baseHead,
    `a base andou desde a verificacao: registrado ${String(registro.baseHead).slice(0, 12)}, ` +
    `agora ${String(agora.baseHead).slice(0, 12)}`);

  check('ST-04', registro.baseBranch === agora.baseBranch,
    `branch mudou desde a verificacao: registrada '${registro.baseBranch}', agora '${agora.baseBranch}'`);

  /* O candidato precisa ser bit a bit o mesmo. Comparar os dois sentidos: arquivo que sumiu do
     registro e arquivo que apareceu depois sao ambos divergencia. */
  const chaves = [...new Set([...Object.keys(registro.fingerprints), ...Object.keys(agora.fingerprints)])];
  const alterados = chaves.filter((k) => registro.fingerprints[k] !== agora.fingerprints[k]);
  check('ST-05', alterados.length === 0,
    `arquivo do candidato mudou depois da verificacao: ${alterados.join(', ')}`);

  const ausentes = chaves.filter((k) => agora.fingerprints[k] == null);
  check('ST-06', ausentes.length === 0,
    `arquivo do candidato ausente no disco: ${ausentes.join(', ')}`);

  check('ST-07', chaves.length > 0,
    'conjunto de arquivos do candidato vazio; um registro sem arquivo nao prova frescor de nada');

  return {
    falhas, passou, alterados,
    veredito: falhas.length === 0 ? 'FRESH' : 'STALE'
  };
}

/** Grava o registro de verificacao. So deve ser chamado quando a verificacao acabou de passar. */
/**
 * Existe evidência de execução PARA O ESTADO ATUAL?  [H-01.8]
 *
 * Sem esta checagem, `--registrar` convertia `STALE` em `FRESH` só por ser chamado. Rodei o comando
 * como teste de fumaça duas vezes nesta sessão e nas duas ele reescreveu o registro para um estado
 * cujas baterias eu não acabara de rodar. Registro de verificação que não exige verificação mede a
 * invocação, não o estado.
 *
 * A ordem que isto impõe: `MUTAÇÃO → BATERIA → CAPTURA (Evidence Bundle) → REGISTRO → FRESCOR`.
 *
 * O bundle é lido como JSON, sem importar `evidence-bundle.mjs`: acoplar o registro ao módulo que
 * ESCREVE o bundle criaria dependência entre dois `MUTATING`, e ler o artefato basta.
 */
export function evidenciaDoEstadoAtual({ bundle, headAtual } = {}) {
  if (!bundle) return { ok: false, motivo: 'EVIDENCE_BUNDLE_AUSENTE_OU_ILEGIVEL' };

  const doBundle = bundle.ambiente?.head;
  if (!doBundle) return { ok: false, motivo: 'EVIDENCE_BUNDLE_SEM_HEAD' };
  if (doBundle !== headAtual) {
    return {
      ok: false,
      motivo: `EVIDENCE_DE_OUTRO_ESTADO — bundle em ${String(doBundle).slice(0, 12)}, repo em ${String(headAtual).slice(0, 12)}`
    };
  }

  const aprovadas = (bundle.execucoes ?? []).filter((e) => e.estado === 'PASS' && e.exitCode === 0);
  if (!aprovadas.length) return { ok: false, motivo: 'EVIDENCE_SEM_EXECUCAO_APROVADA' };

  return { ok: true, motivo: null, execucoesAprovadas: aprovadas.length };
}

/** Lê o bundle como dado. Ilegível é `null`, nunca objeto vazio que pareça um bundle vazio. */
export function lerBundle(caminho = `${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`) {
  if (!existsSync(caminho)) return null;
  try { return JSON.parse(readFileSync(caminho, 'utf8')); } catch { return null; }
}

export function registrar({ agora = new Date().toISOString(), estado = observarFrescor(),
  bundle, destino = REGISTRO } = {}) {
  /* `destino` existe para que CONTROLE nunca escreva o artefato de producao. A primeira versao do
     controle do H01-REV-02 chamava `registrar({ estado, evidencia: { ok: true } })` com o estado
     REAL: como `evidencia` deixou de ser honrada, ele caiu na checagem verdadeira, que passou — e
     gravou `VERIFICATION_RECORD.json` de verdade. Um controle escrito para impedir fabricacao de
     evidencia fabricou uma. E o `F-MAR-069` outra vez: instrumento que muta o que observa. */
  /* [H01-REV-02] A versão anterior aceitava um parâmetro `evidencia` que SUBSTITUÍA a checagem
     inteira: `registrar({ evidencia: { ok: true } })` gravava sem bundle, sem HEAD e sem execução —
     fabricava `FRESH` por chamada direta. Eu criei esse parâmetro como ponto de injeção para teste e
     ele virou o bypass do controle que a função existe para impor. E o meu controle só exercitava
     `ok: false`, então o caminho permissivo nunca era tocado.
     A injeção agora é do INSUMO (`bundle`), nunca do RESULTADO: o veredito é sempre calculado aqui. */
  const conferida = evidenciaDoEstadoAtual({
    bundle: bundle ?? lerBundle(), headAtual: estado.baseHead
  });
  if (!conferida.ok) return { gravado: false, motivo: conferida.motivo, registro: null };

  const registro = {
    schema: 'admai.delivery.verification-record/2',
    registradoEm: agora,
    aviso: 'Capturado no momento da VERIFICACAO. O stale check compara isto com o estado no momento da INTEGRACAO.',
    ...estado,
    evidenciaDeExecucao: {
      execucoesAprovadas: conferida.execucoesAprovadas,
      fonte: bundle ? 'BUNDLE_FORNECIDO_PELO_CHAMADOR' : 'docs/eos-v2/EVIDENCE_BUNDLE.json'
    }
  };
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, `${JSON.stringify(registro, null, 2)}\n`);
  return { gravado: true, motivo: null, registro, destino };
}

export function lerRegistro(caminho = REGISTRO) {
  if (!existsSync(caminho)) return null;
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

/**
 * Flags reconhecidas.  [R27-05]
 *
 * Irmao confirmado da classe "parametro aceito e nao aplicado": flag desconhecida saia com exit 0 e
 * a mesma saida do modo padrao, entao o chamador acreditava ter pedido outro modo. Corrigi essa
 * classe no `evidence-bundle`, depois no `write-set-gate` — e aqui ela seguia de pe.
 */
/* [R28-06] REGRESSAO QUE EU CAUSEI: montei esta allowlist a mao e omiti `--registrar`, que
   estava implementado e funcionando (linha 171). A correcao de "flag aceita e ignorada" tornou
   INALCANCAVEL uma capacidade real — troquei um defeito por outro pior, porque o primeiro so
   confundia e este remove funcao. Allowlist escrita a mao repete a classe que ela deveria fechar:
   uma lista literal que alguem precisa lembrar de manter. Agora e DERIVADA da fonte. */
const FONTE_DESTE_MODULO = readFileSync(new URL(import.meta.url), 'utf8');
/** [H-01.9] Acesso ao disco DECLARADO, nunca presumido pelo nome. Escreve VERIFICATION_RECORD.json em --registrar. */
export const MODO_DE_ACESSO = 'MUTATING';

/** [H-01.3] Derivado da fonte: allowlist literal ja removeu uma capacidade real. */
export const FLAGS = flagsDoModulo(import.meta.url);

export function executar(modo) {
  const estado = observarFrescor();

  if (modo === '--registrar') {
    const { gravado, motivo, registro: r } = registrar({ estado });
    if (!gravado) {
      console.log(`REGISTRO_RECUSADO — ${motivo}`);
      console.log('  A ordem exigida e: MUTACAO -> BATERIA -> CAPTURA no Evidence Bundle -> REGISTRO.');
      console.log('  Gravar sem evidencia do estado atual converteria STALE em FRESH por invocacao.');
      return 1;
    }
    console.log('AdmAi Delivery — registro de verificacao gravado  [Wave P0]');
    console.log(`  destino  : ${REGISTRO.replace(RAIZ, '')}`);
    console.log(`  base     : ${r.baseBranch} @ ${String(r.baseHead).slice(0, 12)}`);
    console.log(`  evidencia: ${r.evidenciaDeExecucao.execucoesAprovadas} execucao(oes) aprovada(s) neste HEAD`);
    console.log(`  arquivos : ${Object.keys(r.fingerprints).length}`);
    for (const [k, v] of Object.entries(r.fingerprints)) {
      console.log(`    ${v ? v.slice(0, 12) : 'AUSENTE     '}  ${k}`);
    }
    console.log('  REGISTRO_GRAVADO — isto NAO e verificacao; e a captura do que foi verificado.');
    return 0;
  }

  const registro = lerRegistro();
  const real = avaliarFrescor({ registro, agora: estado });

  /* Controles negativos. O primeiro e o que mais importa: registro ausente precisa dar STALE. */
  const registroBase = {
    baseHead: 'a'.repeat(40), baseBranch: 'main',
    fingerprints: { 'x.mjs': 'f'.repeat(64) }
  };
  const agoraBase = { baseHead: 'a'.repeat(40), baseBranch: 'main', fingerprints: { 'x.mjs': 'f'.repeat(64) } };
  const sabotagens = [
    ['ST-01', 'registro ausente', { registro: null, agora: agoraBase }],
    ['ST-01', 'registro sem fingerprints', { registro: { baseHead: 'a'.repeat(40) }, agora: agoraBase }],
    ['ST-02', 'HEAD indisponivel', { registro: { ...registroBase, baseHead: null }, agora: { ...agoraBase, baseHead: null } }],
    ['ST-03', 'base andou', { registro: registroBase, agora: { ...agoraBase, baseHead: 'b'.repeat(40) } }],
    ['ST-04', 'branch mudou', { registro: registroBase, agora: { ...agoraBase, baseBranch: 'outra' } }],
    ['ST-05', 'candidato alterado', { registro: registroBase, agora: { ...agoraBase, fingerprints: { 'x.mjs': '0'.repeat(64) } } }],
    ['ST-05', 'arquivo novo no candidato', { registro: registroBase, agora: { ...agoraBase, fingerprints: { 'x.mjs': 'f'.repeat(64), 'novo.mjs': '1'.repeat(64) } } }],
    ['ST-06', 'arquivo sumiu do disco', { registro: registroBase, agora: { ...agoraBase, fingerprints: { 'x.mjs': null } } }],
    ['ST-07', 'conjunto vazio', { registro: { ...registroBase, fingerprints: {} }, agora: { ...agoraBase, fingerprints: {} } }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , e]) => !avaliarFrescor(e).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: estado identico precisa ser aceito como FRESH. Sem ele, um avaliador que
     reprovasse sempre exibiria 9/9 sabotagens e pareceria correto. */
  const positivo = avaliarFrescor({ registro: registroBase, agora: agoraBase });

  /* ---- [H-01.8] O REGISTRO exige evidencia de execucao DESTE estado ----
   *
   * Todos os casos atravessam `evidenciaDoEstadoAtual`, que e pura: nenhum escreve em disco. O que
   * se prova aqui e a REGRA; que a recusa nao escreve e provado logo abaixo, com o sha do artefato.
   */
  /* Nenhum controle escreve em `REGISTRO`. Ver a nota em `registrar()`. */
  const DESTINO_DE_CONTROLE = join(mkdtempSync(join(tmpdir(), 'st-ctl-')), 'registro.json');

  const HEAD = 'a'.repeat(40);
  const passou1 = [{ id: 'x', estado: 'PASS', exitCode: 0 }];
  const bundleBom = { ambiente: { head: HEAD }, execucoes: passou1 };
  const ev = (bundle, headAtual = HEAD) => evidenciaDoEstadoAtual({ bundle, headAtual });

  const casosEvidencia = [
    ['bundle ausente RECUSA', ev(null).motivo === 'EVIDENCE_BUNDLE_AUSENTE_OU_ILEGIVEL'],
    ['bundle sem head RECUSA', ev({ execucoes: passou1 }).motivo === 'EVIDENCE_BUNDLE_SEM_HEAD'],
    ['bundle de OUTRO estado RECUSA',
      ev(bundleBom, 'b'.repeat(40)).motivo?.startsWith('EVIDENCE_DE_OUTRO_ESTADO') === true],
    ['bundle sem execucao aprovada RECUSA',
      ev({ ambiente: { head: HEAD }, execucoes: [] }).motivo === 'EVIDENCE_SEM_EXECUCAO_APROVADA'],
    ['execucao FAIL nao conta como aprovada',
      ev({ ambiente: { head: HEAD }, execucoes: [{ id: 'x', estado: 'FAIL', exitCode: 1 }] })
        .motivo === 'EVIDENCE_SEM_EXECUCAO_APROVADA'],
    ['NAO_EXECUTADA com exitCode 0 nao conta como aprovada',
      ev({ ambiente: { head: HEAD }, execucoes: [{ id: 'x', estado: 'NAO_EXECUTADA', exitCode: 0 }] })
        .motivo === 'EVIDENCE_SEM_EXECUCAO_APROVADA'],
    /* CONTRAPROVA: sem ela, "recusar sempre" passaria como rigor. */
    ['CONTRAPROVA: bundre deste estado com execucao aprovada e ACEITO',
      ev(bundleBom).ok === true && ev(bundleBom).execucoesAprovadas === 1],
    ['recusa NAO escreve o registro', (() => {
      const antes = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      const r = registrar({ estado, destino: DESTINO_DE_CONTROLE,
        bundle: { ambiente: { head: 'x'.repeat(40) }, execucoes: [] } });
      const depois = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      return r.gravado === false && antes === depois;
    })()],
    /* [H01-REV-02] O caso que faltava: o caminho PERMISSIVO. O controle anterior so exercitava a
       recusa, entao um veredito `{ ok: true }` injetado escreveria sem nada verificado e nada
       falharia. Nao ha mais como injetar veredito — so insumo. */
    ['nao existe caminho que injete o VEREDITO, so o insumo', (() => {
      const antes = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      /* Estado com HEAD impossivel: a checagem REAL tem de reprovar. Se `evidencia` ainda fosse
         honrada, o `{ ok: true }` abaixo gravaria assim mesmo. A primeira versao deste controle usou
         o estado corrente, cuja evidencia e valida — entao ele nao distinguia as duas situacoes. */
      const estadoImpossivel = { ...estado, baseHead: 'q'.repeat(40) };
      const r = registrar({ estado: estadoImpossivel, destino: DESTINO_DE_CONTROLE,
        evidencia: { ok: true, execucoesAprovadas: 99 } });
      const depois = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      /* `evidencia` nao e mais parametro: e ignorado, e o veredito real (bundle de outro HEAD ou
         ausente) manda. Se algum dia voltar a ser aceito, este controle quebra. */
      return r.gravado === false && antes === depois;
    })()],
    /* O caminho que ESCREVE, exercitado — e a prova de que `destino` e APLICADO, nao so aceito.
       Sem este controle, `destino` podia ser aceito e ignorado (a escrita indo para producao) e os
       dois controles acima passariam assim mesmo, porque ambos recusam antes de escrever. Foi
       exatamente o que aconteceu na primeira versao. */
    ['escrita bem-sucedida vai para o DESTINO pedido, nao para producao', (() => {
      const antes = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      const alvo = join(mkdtempSync(join(tmpdir(), 'st-dst-')), 'r.json');
      const bom = { ambiente: { head: estado.baseHead }, execucoes: [{ id: 'a', estado: 'PASS', exitCode: 0 }] };
      const r = registrar({ estado, bundle: bom, destino: alvo });
      const depois = existsSync(REGISTRO) ? sha(REGISTRO) : null;
      return r.gravado === true && existsSync(alvo) && antes === depois;
    })()],
    ['bundle fornecido com execucao aprovada e HEAD certo e ACEITO — mas calculado, nao declarado',
      evidenciaDoEstadoAtual({
        bundle: { ambiente: { head: 'z'.repeat(40) }, execucoes: [{ id: 'a', estado: 'PASS', exitCode: 0 }] },
        headAtual: 'z'.repeat(40)
      }).ok === true]
  ];
  const evFalhos = casosEvidencia.filter(([, ok]) => !ok).map(([r]) => r);

  console.log('AdmAi Delivery — stale check  [Wave P0]');
  console.log(`  registro : ${registro ? REGISTRO.replace(RAIZ, '') : 'AUSENTE'}`);
  console.log(`  base agora : ${estado.baseBranch} @ ${String(estado.baseHead).slice(0, 12)}`);
  console.log(`  veredito : ${real.veredito}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  checagens PASS : ${real.passou.length}`);
  console.log(`  checagens FAIL : ${real.falhas.length}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.veredito === 'FRESH' ? 'estado identico aceito como FRESH' : `REJEITOU: ${positivo.falhas.join('; ')}`}`);
  console.log(`  ST-EVID-01 (registro exige execucao DESTE estado): ${casosEvidencia.length - evFalhos.length}/${casosEvidencia.length}` +
    (evFalhos.length ? ` — falhou: ${evFalhos.join('; ')}` : ''));

  const instrumentoIntegro = negFalhos.length === 0 && positivo.veredito === 'FRESH' && evFalhos.length === 0;
  if (!instrumentoIntegro) {
    console.log('  INSTRUMENTO_COMPROMETIDO — nao use este resultado como evidencia');
    return 2;
  }

  console.log('  STALE_CHECK_EXECUTADO');
  console.log('    provado: registro ausente da STALE (nao FRESH), base que andou reprova, branch');
  console.log('      trocada reprova, e qualquer divergencia de fingerprint do candidato reprova');
  console.log('      nos dois sentidos — arquivo alterado, sumido ou surgido depois.');
  console.log('    NAO provado: que o candidato esta correto. Frescor e sobre IDENTIDADE entre o que');
  console.log('      foi verificado e o que sera integrado; a correcao e assunto do verificador.');
  return real.veredito === 'FRESH' ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(recusarDesconhecida(process.argv.slice(2), FLAGS) ?? executar(process.argv[2]));
}
