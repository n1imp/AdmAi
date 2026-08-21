/**
 * Fixture do segundo repositorio — verificador.  [SL-BOOT-04 · BOOTSTRAP_PROOF]
 *
 * Verifica os criterios do PLAN-F secao 81 que a onda 0 pode atingir, e recusa-se a
 * afirmar os que ela nao pode. Um verificador que dissesse "portabilidade OK" aqui
 * estaria violando MAR-INV-025: portabilidade exige o EOS rodando em B, o que e o
 * SL-AC-02 da onda 12.
 *
 * Controle negativo NAO VACUO, pela regra do amendment 002 secao 21: cada criterio
 * verificavel roda a MESMA funcao de avaliacao contra uma fixture adulterada em
 * memoria, e o teste exige que ela reprove. Um controle que nao pode falhar nao
 * mede nada — foi o defeito que o Codex encontrou no SL-BOOT-02.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CAMINHO_FIXTURE, CRITERIOS, IDENTIDADE, STACK_PROIBIDA, ARTEFATOS_PROIBIDOS } from './contract.mjs';

/**
 * Avalia uma fixture. PURA em relacao a `estado`, para que o controle negativo
 * possa injetar um estado adulterado no MESMO caminho de codigo.
 */
export function avaliarFixture(estado) {
  const falhas = [];
  const passou = [];
  const check = (id, cond, msg) => (cond ? passou.push(id) : falhas.push(`${id}: ${msg}`));

  check('FIX-01', estado.repositoryId === IDENTIDADE.repositoryId && estado.repositoryId !== 'admai/agent-environment',
    `repositoryId invalido ou igual ao do AdmAi: ${estado.repositoryId}`);

  check('FIX-02', estado.branch === IDENTIDADE.branch && estado.branch !== 'fix/seguranca-criticos',
    `branch invalida ou igual a do AdmAi: ${estado.branch}`);

  check('FIX-03a', estado.gitDirProprio, '.git nao e diretorio proprio (worktree vinculada ou ausente)');
  check('FIX-03b', !estado.temAlternates, 'objects/info/alternates presente: object database compartilhado');

  const proibidosPresentes = estado.artefatos.filter((a) => ARTEFATOS_PROIBIDOS.includes(a));
  check('FIX-04', proibidosPresentes.length === 0,
    `artefato de launcher do AdmAi presente: ${proibidosPresentes.join(', ')}`);

  const stackProibida = (estado.dependencias || []).filter((d) => STACK_PROIBIDA.includes(d));
  check('FIX-05', stackProibida.length === 0,
    `dependencia da stack do AdmAi presente: ${stackProibida.join(', ')}`);

  return { falhas, passou };
}

/** Observa a fixture real no filesystem. */
export function observarFixture(raiz) {
  if (!existsSync(raiz)) return null;
  const git = (args) => {
    try { return execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' }).trim(); }
    catch { return ''; }
  };
  const pkg = existsSync(`${raiz}/package.json`) ? JSON.parse(readFileSync(`${raiz}/package.json`, 'utf8')) : {};
  const manifesto = existsSync(`${raiz}/.eos-repo.json`) ? JSON.parse(readFileSync(`${raiz}/.eos-repo.json`, 'utf8')) : {};
  return {
    repositoryId: manifesto.repositoryId,
    branch: git(['branch', '--show-current']),
    gitDirProprio: existsSync(`${raiz}/.git`) && readdirSync(`${raiz}/.git`).length > 0,
    temAlternates: existsSync(`${raiz}/.git/objects/info/alternates`),
    artefatos: readdirSync(raiz),
    dependencias: Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })
  };
}

/* ------------------------------------------------------------------ *
 * Execucao
 * ------------------------------------------------------------------ */

const estado = observarFixture(CAMINHO_FIXTURE);

console.log('Fixture do segundo repositorio — verificacao  [BOOTSTRAP_PROOF]');

if (!estado) {
  console.log(`  fixture AUSENTE em ${CAMINHO_FIXTURE}`);
  console.log('  execute tools/eos/selftest/fixtures/second-repo/materialize.mjs');
  process.exit(1);
}

const real = avaliarFixture(estado);

/* Controle negativo: cada criterio verificavel e sabotado individualmente, no MESMO
   caminho de codigo, e precisa reprovar. Se algum nao reprovar, o criterio e teatro. */
const sabotagens = [
  ['FIX-01', { ...estado, repositoryId: 'admai/agent-environment' }],
  ['FIX-02', { ...estado, branch: 'fix/seguranca-criticos' }],
  ['FIX-03b', { ...estado, temAlternates: true }],
  ['FIX-04', { ...estado, artefatos: [...estado.artefatos, '.claude'] }],
  ['FIX-05', { ...estado, dependencias: [...estado.dependencias, 'express'] }]
];
const negFalhos = [];
for (const [id, adulterado] of sabotagens) {
  const r = avaliarFixture(adulterado);
  if (!r.falhas.some((f) => f.startsWith(id))) negFalhos.push(id);
}

console.log(`  criterios PASS: ${real.passou.length}`);
console.log(`  criterios FAIL: ${real.falhas.length}`);
for (const f of real.falhas) console.log(`    ! ${f}`);
console.log(`  controle negativo: ${sabotagens.length - negFalhos.length}/${sabotagens.length} sabotagens detectadas` +
  (negFalhos.length ? ` — NAO detectou: ${negFalhos.join(', ')}` : ''));

const declarados = CRITERIOS.filter((c) => c.alcancavelNaOnda0 === 'DECLARED');
console.log(`  criterios DECLARED (nao verificaveis nesta onda): ${declarados.map((c) => c.id).join(', ')}`);
for (const c of declarados) console.log(`    - ${c.id}: ${c.razao}`);

if (real.falhas.length > 0 || negFalhos.length > 0) process.exit(1);

console.log('  FIXTURE_SEGUNDO_REPOSITORIO_PREPARADA');
console.log('    provado: identidade distinta, branch distinta, git independente, sem launcher do AdmAi, stack distinta');
console.log('    nao provado: portabilidade do EOS — exige o EOS rodando em B (SL-AC-02, onda 12)');
