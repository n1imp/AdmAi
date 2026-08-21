/**
 * AdmAi Delivery Harness — snapshot do repositorio.  [Wave P0]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   A secao 27 do contrato de entrega e explicita: nao presumir que o baseline historico ainda
 *   representa o repositorio. E a secao 17 lista `branch`, `HEAD`, `git diff`, `migration status` e
 *   `schema validation` como fatos que devem sair de script, nao de interpretacao de modelo.
 *
 *   Este modulo produz esses fatos. Ele NAO decide nada sobre eles — quem decide e o gate, com o
 *   contrato na mao. Separar observacao de julgamento e o que impede um relatorio bonito de virar
 *   evidencia sem lastro.
 *
 * PROVENANCE
 *   Tudo que sai daqui e OBSERVED: veio de `git`, do filesystem ou do schema. Nada e INFERRED.
 *   Campos que nao puderam ser observados saem como `null` com motivo — nunca como zero, nunca
 *   como suposicao. `UNAVAILABLE` nao vira `0`.
 *
 * Este harness e TEMPORARIO por contrato (secao 18): quando o EOS real tiver Snapshot Model
 * equivalente (SL-A-07), esta camada e substituida, nao mantida em paralelo.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RAIZ = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** Executa git e devolve stdout, ou `null` quando o comando falhar. Nunca lanca. */
function git(args, raiz = RAIZ) {
  try {
    return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Observa o repositorio. PURA em relacao ao filesystem no sentido de que nao escreve nada;
 * o resultado e um objeto simples, para que o avaliador possa ser testado com estado injetado.
 */
export function observarRepositorio(raiz = RAIZ) {
  const status = git(['status', '--porcelain'], raiz);
  const linhasStatus = status === null ? null : status.split('\n').filter((l) => l.trim() !== '');

  /** Modificacoes de PRODUTO: os dois modulos Node reais, fora de docs/ e tools/. */
  const produto = linhasStatus === null ? null : linhasStatus.filter((l) => {
    const caminho = l.slice(3);
    return caminho.startsWith('chaveiro-bot/') || caminho.startsWith('chaveiro-painel/');
  });

  const schema = `${raiz}chaveiro-bot/prisma/schema.prisma`;
  const dirMigrations = `${raiz}chaveiro-bot/prisma/migrations`;

  return {
    observadoEm: null, // preenchido pelo chamador; manter determinismo do avaliador
    git: {
      branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], raiz),
      head: git(['rev-parse', 'HEAD'], raiz),
      status: linhasStatus,
      arquivosDeProduto: produto,
      diffCheckLimpo: git(['diff', '--check'], raiz) === ''
    },
    prisma: {
      schemaPresente: existsSync(schema),
      modelos: existsSync(schema)
        ? [...readFileSync(schema, 'utf8').matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])
        : null,
      migrations: existsSync(dirMigrations)
        ? readdirSync(dirMigrations, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
        : null
    },
    modulos: ['chaveiro-bot', 'chaveiro-painel'].map((m) => ({
      nome: m,
      presente: existsSync(`${raiz}${m}/package.json`),
      temNodeModules: existsSync(`${raiz}${m}/node_modules`)
    }))
  };
}

/**
 * Avalia um snapshot contra o baseline esperado.
 *
 * PURA em relacao a `estado` e `esperado`, para que os controles negativos atravessem exatamente
 * este caminho de codigo — a licao que custou cinco rodadas de revisao no lado EOS.
 */
export function avaliarSnapshot({ estado, esperado }) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  check('SNAP-01', estado.git.branch !== null && estado.git.head !== null,
    'git nao respondeu branch/HEAD; sem isso nenhum gate de entrega tem baseline');

  if (esperado.branch != null) {
    check('SNAP-02', estado.git.branch === esperado.branch,
      `branch observada '${estado.git.branch}' difere da esperada '${esperado.branch}'`);
  }
  if (esperado.head != null) {
    check('SNAP-03', estado.git.head === esperado.head,
      `HEAD observado '${String(estado.git.head).slice(0, 12)}' difere do esperado '${String(esperado.head).slice(0, 12)}'`);
  }

  check('SNAP-04', estado.git.diffCheckLimpo === true,
    'git diff --check acusou problema de whitespace/conflito');

  check('SNAP-05', estado.prisma.schemaPresente === true,
    'schema.prisma ausente; validacao de migration e modelagem ficam sem fonte');

  /* Modelos declarados como pre-requisito por uma feature precisam existir. Ausencia e um fato
     util, nao um erro: e o que distingue "wave greenfield" de "wave de evolucao". */
  if (esperado.modelosRequeridos?.length) {
    const faltando = esperado.modelosRequeridos.filter((m) => !(estado.prisma.modelos ?? []).includes(m));
    check('SNAP-06', faltando.length === 0, `modelo requerido ausente no schema: ${faltando.join(', ')}`);
  }

  check('SNAP-07', (estado.modulos ?? []).every((m) => m.presente),
    `modulo Node ausente: ${(estado.modulos ?? []).filter((m) => !m.presente).map((m) => m.nome).join(', ')}`);

  return { falhas, passou };
}

/* ------------------------------------------------------------------ *
 * Execucao — so quando este modulo e o ponto de entrada.
 * Mesmo contrato do F-MAR-069 no lado EOS: importar nao executa nem encerra o processo.
 * ------------------------------------------------------------------ */

/**
 * Flags reconhecidas.  [R27-05]
 *
 * Irmao confirmado da classe "parametro aceito e nao aplicado": flag desconhecida saia com exit 0 e
 * a mesma saida do modo padrao, entao o chamador acreditava ter pedido outro modo. Corrigi essa
 * classe no `evidence-bundle`, depois no `write-set-gate` — e aqui ela seguia de pe.
 */
export const FLAGS = Object.freeze([]);

export function flagDesconhecida(argv = []) {
  const fora = argv.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0])
    .filter((a) => !FLAGS.includes(a));
  if (!fora.length) return null;
  console.log(`FLAG_DESCONHECIDA — ${fora.join(', ')}`);
  console.log(`  reconhecidas: ${FLAGS.join(', ') || '(nenhuma; este modulo nao aceita flag)'}`);
  return 2;
}

export function executar() {
  const estado = observarRepositorio();
  const real = avaliarSnapshot({ estado, esperado: {} });

  /* Controles negativos: cada propriedade que o snapshot afirma precisa ser capaz de reprovar.
     Um harness de entrega que nunca falha nao mede entrega — mede otimismo. */
  const sabotagens = [
    ['SNAP-01', 'git mudo', { estado: { ...estado, git: { ...estado.git, branch: null, head: null } }, esperado: {} }],
    ['SNAP-02', 'branch divergente', { estado, esperado: { branch: '__branch_que_nao_existe__' } }],
    ['SNAP-03', 'HEAD divergente', { estado, esperado: { head: '0'.repeat(40) } }],
    ['SNAP-04', 'diff --check sujo', { estado: { ...estado, git: { ...estado.git, diffCheckLimpo: false } }, esperado: {} }],
    ['SNAP-05', 'schema ausente', { estado: { ...estado, prisma: { ...estado.prisma, schemaPresente: false } }, esperado: {} }],
    ['SNAP-06', 'modelo requerido ausente', { estado, esperado: { modelosRequeridos: ['ModeloQueNaoExiste'] } }],
    ['SNAP-07', 'modulo Node ausente', { estado: { ...estado, modulos: [{ nome: 'chaveiro-bot', presente: false }] }, esperado: {} }]
  ];
  const negFalhos = sabotagens
    .filter(([id, , entrada]) => !avaliarSnapshot(entrada).falhas.some((f) => f.startsWith(id)))
    .map(([id, d]) => `${id} (${d})`);

  /* Controle positivo: o estado real, com expectativa correta, precisa ser ACEITO. Sem isto um
     avaliador que reprovasse tudo continuaria com sabotagens 7/7. */
  const positivo = avaliarSnapshot({
    estado,
    esperado: { branch: estado.git.branch, head: estado.git.head, modelosRequeridos: ['Empresa', 'Servico'] }
  });

  console.log('AdmAi Delivery — snapshot do repositorio  [Wave P0]');
  console.log(`  branch : ${estado.git.branch}`);
  console.log(`  HEAD   : ${String(estado.git.head).slice(0, 12)}`);
  console.log(`  diff --check limpo : ${estado.git.diffCheckLimpo}`);
  console.log(`  arquivos de produto modificados : ${estado.git.arquivosDeProduto?.length ?? 'UNAVAILABLE'}`);
  for (const l of estado.git.arquivosDeProduto ?? []) console.log(`    ${l}`);
  console.log(`  modelos Prisma : ${estado.prisma.modelos?.length ?? 'UNAVAILABLE'}`);
  console.log(`  migrations     : ${estado.prisma.migrations?.length ?? 'UNAVAILABLE'}`);
  console.log(`  checagens PASS : ${real.passou.length}`);
  console.log(`  checagens FAIL : ${real.falhas.length}`);
  for (const f of real.falhas) console.log(`    ! ${f}`);
  console.log(`  controles negativos : ${sabotagens.length - negFalhos.length}/${sabotagens.length}` +
    (negFalhos.length ? ` — NAO detectou: ${negFalhos.join('; ')}` : ''));
  console.log(`  controle positivo   : ${positivo.falhas.length === 0 ? 'estado real aceito' : `REJEITOU indevidamente: ${positivo.falhas.join('; ')}`}`);

  const ok = real.falhas.length === 0 && negFalhos.length === 0 && positivo.falhas.length === 0;
  if (!ok) return 1;

  console.log('  SNAPSHOT_OBSERVADO');
  console.log('    provado: branch, HEAD, limpeza de whitespace, presenca de schema e modulos,');
  console.log('      e que cada uma dessas checagens e capaz de reprovar quando sabotada.');
  console.log('    NAO provado: que o codigo esta correto, que os testes passam ou que o');
  console.log('      comportamento em producao corresponde a este snapshot. Isto e observacao,');
  console.log('      nao verificacao — o gate e outro modulo.');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(flagDesconhecida(process.argv.slice(2)) ?? executar());
}
