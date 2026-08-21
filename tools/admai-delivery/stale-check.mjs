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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';

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
export function registrar({ agora = new Date().toISOString(), estado = observarFrescor() } = {}) {
  const registro = {
    schema: 'admai.delivery.verification-record/1',
    registradoEm: agora,
    aviso: 'Capturado no momento da VERIFICACAO. O stale check compara isto com o estado no momento da INTEGRACAO.',
    ...estado
  };
  mkdirSync(dirname(REGISTRO), { recursive: true });
  writeFileSync(REGISTRO, `${JSON.stringify(registro, null, 2)}\n`);
  return registro;
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
export const FLAGS = Object.freeze([
  ...new Set([
    ...[...FONTE_DESTE_MODULO.matchAll(/modo === '(--[a-z-]+)'/g)].map((m) => m[1]),
    '--selftest', '--verificar'
  ])
].sort());

export function flagDesconhecida(argv = []) {
  const fora = argv.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0])
    .filter((a) => !FLAGS.includes(a));
  if (!fora.length) return null;
  console.log(`FLAG_DESCONHECIDA — ${fora.join(', ')}`);
  console.log(`  reconhecidas: ${FLAGS.join(', ') || '(nenhuma; este modulo nao aceita flag)'}`);
  return 2;
}

export function executar(modo) {
  const estado = observarFrescor();

  if (modo === '--registrar') {
    const r = registrar({ estado });
    console.log('AdmAi Delivery — registro de verificacao gravado  [Wave P0]');
    console.log(`  destino  : ${REGISTRO.replace(RAIZ, '')}`);
    console.log(`  base     : ${r.baseBranch} @ ${String(r.baseHead).slice(0, 12)}`);
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

  const instrumentoIntegro = negFalhos.length === 0 && positivo.veredito === 'FRESH';
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
  process.exit(flagDesconhecida(process.argv.slice(2)) ?? executar(process.argv[2]));
}
