/**
 * BOOTSTRAP_SOURCE_SNAPSHOT — Amendment 001, secao 4.
 *
 * Os planos A-G e o tools/eos/ inteiro estao UNTRACKED. Um `git clone` nao os
 * captura. Este script fingerprinta o que precisa ser copiado explicitamente
 * para os workspaces dos workers, e serve de oraculo para a comparacao de
 * fingerprint exigida pela secao 6.
 */

import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
};

const GROUPS = {
  planning: ['docs/eos-v2', 'docs/agent-environment', 'docs/functionality-discovery'],
  baseline: ['tools/eos', 'tools/codex-policy']
};

const files = {};
let total = 0;
for (const [group, dirs] of Object.entries(GROUPS)) {
  files[group] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of walk(dir)) {
      files[group].push({
        path: f,
        sha256: createHash('sha256').update(readFileSync(f)).digest('hex'),
        bytes: statSync(f).size
      });
      total++;
    }
  }
}

const snapshot = {
  bootstrapSnapshotId: 'BSS-001',
  createdAt: process.argv[2] || 'unset',
  baseCommit: '30bf5453d847c17d88197b11c93da965406be53c',
  branch: 'fix/seguranca-criticos',
  masterPlanVersion: '1.1.0',
  amendment: 'BOOTSTRAP_EXECUTION_AMENDMENT_001',
  counts: { planning: files.planning.length, baseline: files.baseline.length, total },
  files
};

mkdirSync('.eos-bootstrap', { recursive: true });
writeFileSync('.eos-bootstrap/BOOTSTRAP_SOURCE_SNAPSHOT.json', JSON.stringify(snapshot, null, 2));

console.log(`  planning artifacts : ${files.planning.length}`);
console.log(`  baseline artifacts : ${files.baseline.length}`);
console.log(`  total              : ${total}`);
const g = files.planning.find((x) => x.path.includes('PLAN_G'));
console.log(`  PLAN-G sha256      : ${g.sha256.slice(0, 24)}...`);
