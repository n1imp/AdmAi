#!/usr/bin/env node
/**
 * CLI do gate de `npm audit`. Lê o JSON de `npm audit --json` (arquivo passado
 * como argumento, ou stdin) e a allowlist versionada em `audit-allowlist.json`,
 * e reprova (exit 1) qualquer advisory High/Critical não coberto por uma
 * exceção válida e não-expirada. Uso em CI:
 *
 *   npm audit --json > audit-report.json || true
 *   node scripts/audit-gate.mjs audit-report.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avaliarGate } from './audit-gate-helpers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function lerEntrada() {
  const argFile = process.argv[2];
  if (argFile) return readFileSync(argFile, 'utf8');
  return readFileSync(0, 'utf8');
}

function main() {
  let auditJson;
  try {
    auditJson = JSON.parse(lerEntrada());
  } catch (erro) {
    console.error('Falha ao ler/parsear a saída de `npm audit --json`:', erro.message);
    process.exitCode = 1;
    return;
  }

  const allowlistPath = path.join(__dirname, 'audit-allowlist.json');
  const allowlistJson = JSON.parse(readFileSync(allowlistPath, 'utf8'));

  const resultado = avaliarGate(auditJson, allowlistJson);

  if (resultado.dispensados.length > 0) {
    console.log('⚠ Advisories dispensados por exceção documentada (scripts/audit-allowlist.json):');
    for (const d of resultado.dispensados) {
      console.log(`  - ${d.ghsaId} (${d.severity}) em ${d.pacote}: ${d.title}`);
      console.log(`    referência: ${d.allowlist.reference}`);
      console.log(`    revisar até: ${d.allowlist.reviewBy}`);
    }
  }

  if (resultado.ignorados.length > 0) {
    console.log(
      `ℹ ${resultado.ignorados.length} advisory(ies) abaixo de high (moderate/low/info) — fora do escopo deste gate.`
    );
  }

  if (resultado.bloqueantes.length > 0) {
    console.error('✗ Advisories High/Critical SEM exceção válida (reprovam o CI):');
    for (const b of resultado.bloqueantes) {
      console.error(`  - ${b.ghsaId} (${b.severity}) em ${b.pacote}: ${b.title} [${b.motivo}]`);
      console.error(`    ${b.url}`);
    }
    console.error(
      `\nAuditoria de dependências REPROVADA: ${resultado.bloqueantes.length} advisory(ies) High/Critical sem exceção válida.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nAuditoria de dependências APROVADA (${resultado.dispensados.length} exceção(ões) documentada(s) aplicada(s), 0 advisory bloqueante).`
  );
  process.exitCode = 0;
}

main();
