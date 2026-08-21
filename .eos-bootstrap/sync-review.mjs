/**
 * Preparacao do snapshot de REVISAO para a lane do Codex.  [F-MAR-068]
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *   O `sync.mjs` copia da integration lane para as duas lanes de trabalho. Ele serve
 *   para distribuir o baseline, e NAO serve para revisao: o candidato do Claude ainda
 *   nao esta na integration lane quando a revisao acontece — por desenho, a revisao
 *   vem antes da integracao.
 *
 *   Sem este script, a lane do Codex analisa o baseline antigo e devolve um parecer
 *   que se LE como evidencia sobre o candidato sem ser sobre o candidato. Foi
 *   exatamente o que aconteceu na analise D1 do F-MAR-067: o Codex declarou, na
 *   propria resposta, que estava lendo um `verify-layout.mjs` de 80 linhas, sem
 *   LAY-06 nem LAY-08. O parecer sobreviveu porque ele foi honesto sobre a limitacao,
 *   nao porque o processo o protegeu. Isso e F-MAR-068.
 *
 *   Rodar `sync.mjs` aqui seria pior que inutil: ele sobrescreveria `layout.mjs` e
 *   `verify-layout.mjs` na lane do Claude com a versao antiga da integration lane,
 *   destruindo o trabalho em revisao.
 *
 * O QUE ESTE SCRIPT MONTA
 *   docs/      <- integration lane   (contratos autoritativos: planos A-G, EXECUTION_STATE)
 *   tools/eos/ <- lane do Claude     (o candidato sob revisao)
 *
 *   Ou seja: o Codex revisa o CANDIDATO contra os CONTRATOS ATUAIS. E imprime o
 *   fingerprint do que foi montado, para que o parecer possa ser amarrado ao que foi
 *   de fato lido.
 *
 * NUNCA copia `.claude/`, `.codex/`, `.serena/`, credenciais ou `.env`.
 */

import { readdirSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

const INTEGRACAO = 'C:/Users/n1iag/dev/admai-worktrees/agent-environment';
const CLAUDE = 'C:/Users/n1iag/dev/admai-worktrees/EOS_BUILD_CLAUDE';
const CODEX = 'C:/Users/n1iag/dev/admai-worktrees/EOS_BUILD_CODEX';

/** origem -> diretorios que ela fornece ao snapshot de revisao. */
const ORIGENS = [
  [INTEGRACAO, ['docs/eos-v2', 'docs/agent-environment']],
  [CLAUDE, ['tools/eos']]
];

const FORBIDDEN = ['.claude', '.codex', '.serena', '.credentials.json', '.env'];

const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
};

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

const plano = [];
for (const [src, dirs] of ORIGENS) {
  for (const d of dirs) {
    if (!existsSync(`${src}/${d}`)) continue;
    for (const f of walk(`${src}/${d}`)) plano.push([src, f.slice(src.length + 1)]);
  }
}

const leaks = plano.filter(([, r]) => FORBIDDEN.some((x) => r.split('/').includes(x) || r.endsWith(x)));
if (leaks.length) {
  console.error(`  ABORTADO: caminho proibido na lista de copia: ${leaks.map(([, r]) => r).join(', ')}`);
  process.exit(1);
}

for (const [src, r] of plano) {
  const dst = `${CODEX}/${r}`;
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(`${src}/${r}`, dst);
}

let divergencias = 0;
for (const [src, r] of plano) {
  const alvo = existsSync(`${CODEX}/${r}`) ? sha(`${CODEX}/${r}`) : 'AUSENTE';
  if (alvo !== sha(`${src}/${r}`)) { divergencias++; console.log(`    ! ${r}`); }
}

console.log(`  snapshot de revisao montado na lane do Codex: ${plano.length} arquivos`);
console.log(`    docs/      <- integration lane`);
console.log(`    tools/eos/ <- lane do Claude (candidato)`);
console.log(`  divergencias de fingerprint : ${divergencias}`);
if (divergencias) process.exit(1);

let presentes = 0;
for (const f of FORBIDDEN) if (existsSync(`${CODEX}/${f}`)) { console.log(`  ! ${f} PRESENTE em ${CODEX}`); presentes++; }
console.log(`  artefatos proibidos na lane do Codex : ${presentes}`);

/** Fingerprint do que foi montado, para amarrar o parecer ao que foi lido. */
const alvos = [
  'tools/eos/layout.mjs',
  'tools/eos/verify-layout.mjs',
  'tools/eos/protocol/types/families.mjs',
  'tools/eos/protocol/types/distinctions.mjs',
  'tools/eos/protocol/types/index.mjs',
  'tools/eos/protocol/types/verify.mjs',
  'tools/eos/protocol/types/oracle/canonical-families.json',
  'docs/eos-v2/plans/PLAN_A_FOUNDATIONS.md',
  'docs/eos-v2/plans/PLAN_G_INTEGRATION_MASTER_PLAN.md'
];
console.log('  fingerprints do snapshot de revisao:');
for (const a of alvos) {
  console.log(`    ${existsSync(`${CODEX}/${a}`) ? sha(`${CODEX}/${a}`).slice(0, 12) : 'AUSENTE     '}  ${a}`);
}
