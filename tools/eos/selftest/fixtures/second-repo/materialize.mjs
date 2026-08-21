/**
 * Fixture do segundo repositorio — gerador deterministico.  [SL-BOOT-04]
 *
 * Materializa o repositorio B fora da worktree autoritativa. E deterministico de
 * proposito: o SL-AC-02, doze ondas adiante, precisa poder recriar exatamente esta
 * fixture sem depender de estado que sobreviveu por acaso no disco.
 *
 * NAO clona o AdmAi. Um clone herdaria historia, stack e identidade — exatamente o
 * contrario do que o criterio pede. O repositorio B nasce vazio e recebe conteudo
 * minimo proprio.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { CAMINHO_FIXTURE, IDENTIDADE } from './contract.mjs';

const raiz = CAMINHO_FIXTURE;
const git = (...args) => execFileSync('git', ['-C', raiz, ...args], { encoding: 'utf8' }).trim();

if (existsSync(`${raiz}/.git`)) {
  console.log(`  fixture ja materializada em ${raiz} — nada a fazer`);
  process.exit(0);
}

mkdirSync(raiz, { recursive: true });
execFileSync('git', ['init', '--quiet', '--initial-branch', IDENTIDADE.branch, raiz], { encoding: 'utf8' });

/** Identidade do repositorio, lida pelo verificador e, futuramente, pelo bootstrap do EOS. */
writeFileSync(`${raiz}/.eos-repo.json`, `${JSON.stringify({
  repositoryId: IDENTIDADE.repositoryId,
  descricao: IDENTIDADE.descricao,
  stack: IDENTIDADE.stack,
  criadoPor: 'SL-BOOT-04',
  consumidoPor: 'SL-AC-02',
  observacao: 'Fixture de portabilidade. Sem relacao de historia com o AdmAi.'
}, null, 2)}\n`);

/** Stack deliberadamente diferente: Node puro, sem Express, React, Vite ou Prisma. */
writeFileSync(`${raiz}/package.json`, `${JSON.stringify({
  name: 'eos-fixture-repo-b',
  version: '0.0.0',
  private: true,
  type: 'module',
  description: 'Fixture minima de portabilidade do EOS',
  scripts: { test: 'node --test' }
}, null, 2)}\n`);

/** Um modulo e um teste, para que o repositorio tenha trabalho real e verificavel. */
mkdirSync(`${raiz}/src`, { recursive: true });
writeFileSync(`${raiz}/src/soma.mjs`,
  '/** Modulo trivial: a fixture precisa de trabalho real para o EOS ter o que governar. */\n' +
  'export const soma = (a, b) => a + b;\n');
mkdirSync(`${raiz}/test`, { recursive: true });
writeFileSync(`${raiz}/test/soma.test.mjs`,
  "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n" +
  "import { soma } from '../src/soma.mjs';\n\n" +
  "test('soma', () => { assert.equal(soma(2, 3), 5); });\n");

writeFileSync(`${raiz}/README.md`,
  `# ${IDENTIDADE.repositoryId}\n\n${IDENTIDADE.descricao}\n\n` +
  'Criado por `SL-BOOT-04` na onda 0; consumido por `SL-AC-02` na onda 12.\n\n' +
  'Este repositorio existe para provar que o EOS funciona fora do AdmAi. Ele nao\n' +
  'compartilha historia, stack, branch, identidade nem launcher com o AdmAi.\n');

writeFileSync(`${raiz}/.gitignore`, 'node_modules/\n');

git('add', '-A');
git('-c', 'user.name=eos-fixture', '-c', 'user.email=fixture@local', 'commit', '--quiet', '-m',
  'chore(fixture): repositorio B de portabilidade do EOS (SL-BOOT-04)');

console.log(`  fixture materializada: ${raiz}`);
console.log(`  repositoryId: ${IDENTIDADE.repositoryId}`);
console.log(`  branch: ${git('branch', '--show-current')}`);
console.log(`  HEAD: ${git('rev-parse', 'HEAD').slice(0, 12)}`);
