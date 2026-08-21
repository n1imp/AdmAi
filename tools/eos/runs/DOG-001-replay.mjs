/**
 * EOS V2 — replay do DOG-001 apos a correcao de F-004.
 *
 * Run: EOS-RUN-20260808T030320Z
 *
 * O replay e sobre OWNERSHIP, nao sobre reexecutar a investigacao do produto.
 * Nenhum arquivo do AdmAi e tocado. A conclusao tecnica do DOG-001 permanece:
 * falso positivo para path traversal, com TEST_DEFECT por ausencia de prova.
 *
 * Criterio duro: o risco tem de continuar L2. Uma "correcao" de ownership que
 * rebaixasse o risco nao seria conserto — seria um segundo defeito.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { classify } from '../risk/classify.mjs';
import { route } from '../engineering/router.mjs';
import { validateLedger } from '../proof/validate.mjs';
import { LEDGER, FINDING, RUN } from './DOG-001-semgrep-sendfile.mjs';

// Mesmo pedido, mesma evidencia principal do DOG-001 original.
const REQUEST =
  'Investigar o achado Semgrep: res.sendFile monta caminho de arquivo a partir de ' +
  'doc.storageKey na rota de documentos do backend, com risco de path traversal entre tenants.';

/**
 * Vetor de responsabilidade do DOG-001, derivado da investigacao ja concluida:
 *  - a superficie alterada foi backend (routes/documentos.js);
 *  - o concern alterado foi logica de aplicacao (geracao da chave), NAO um
 *    controle de seguranca — autorizacao, tenant e self-scope ficaram intactos;
 *  - a intencao foi tornar a garantia verificavel, sem mudanca de comportamento;
 *  - o risco em seguranca e real e material -> seguranca REVISA.
 */
const VECTOR = {
  surface: 'backend',
  concern: 'applicationLogic',
  changeIntent: 'testability',
  riskDomains: ['security'],
  level: 'L2',
  outputDependency: false,
  apiContract: false,
  schemaContract: false,
  breakingChange: false
};

const ANTES = { primaryOwner: 'security', security: 'PRIMARY_OWNER', backend: 'COLLABORATOR' };

const invocadoDireto = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invocadoDireto) {
  const risk = classify(REQUEST);
  const r = route(REQUEST, { risk, responsibilityVector: VECTOR });

  console.log(`DOG-001 REPLAY — ${RUN}\n`);

  const checks = [];
  const check = (nome, ok, detalhe) => { checks.push({ nome, ok, detalhe }); };

  console.log('--- risco preservado ---');
  console.log(`  nivel: ${risk.level} (era L2)`);
  check('risco continua L2', risk.level === 'L2', `obtido ${risk.level}`);
  check('security ainda material', risk.vector.security >= 2, `security=${risk.vector.security}`);

  console.log('\n--- ownership ---');
  console.log(`  ANTES : primary=${ANTES.primaryOwner}  security=${ANTES.security}  backend=${ANTES.backend}`);
  console.log(`  DEPOIS: primary=${r.primaryOwner}  ` +
              Object.entries(r.participation).map(([e, p]) => `${e}=${p}`).join('  '));
  check('backend e PRIMARY_OWNER', r.participation.backend === 'PRIMARY_OWNER', `obtido ${r.participation.backend}`);
  check('security NAO e Primary', r.participation.security !== 'PRIMARY_OWNER', `obtido ${r.participation.security}`);
  check('security revisa ou colabora',
        ['REQUIRED_REVIEWER', 'COLLABORATOR'].includes(r.participation.security), `obtido ${r.participation.security}`);
  check('verification e VERIFICATION_OWNER', r.verificationOwner === 'verification', `obtido ${r.verificationOwner}`);
  check('exatamente um Primary',
        Object.values(r.participation).filter((p) => p === 'PRIMARY_OWNER').length === 1);

  console.log('\n--- contract bus ---');
  console.log(`  CONTRACT_REQ: ${r.contractRequests}  contractOwner: ${r.contractOwner}`);
  check('zero CONTRACT_REQ (sem contrato material)', r.contractRequests === 0, `obtido ${r.contractRequests}`);

  console.log('\n--- fallback ---');
  console.log(`  ${r.ownershipFallback ? r.ownershipFallback.code + ': ' + r.ownershipFallback.reason : 'nao usado — derivacao convergiu'}`);
  check('sem fallback: ownership foi derivado', r.ownershipFallback === null);

  console.log('\n--- Proof Ledger com Required Reviewer ---');
  const semReview = validateLedger(LEDGER, {
    openFindings: [{ ...FINDING, blocking: true, status: 'CLOSED' }],
    requiredReviewers: r.requiredReviewers
  });
  console.log(`  sem review registrado -> ${semReview.effectiveStatus}` +
              (semReview.blockers.length ? ` (${semReview.blockers[0]})` : ''));
  check('Required Reviewer pendente bloqueia VERIFIED',
        r.requiredReviewers.length === 0 || semReview.effectiveStatus === 'BLOCKED');

  const comReview = validateLedger(
    { ...LEDGER, reviews: r.requiredReviewers.map((rev) => ({
        reviewer: rev, result: 'REVIEW_PASS',
        evidenceRef: { kind: 'command', ref: 'leitura de documentos.js:111 — storageKey gerado no servidor', producedBy: 'revisao de codigo' } })) },
    { openFindings: [{ ...FINDING, blocking: true, status: 'CLOSED' }], requiredReviewers: r.requiredReviewers });
  console.log(`  com REVIEW_PASS      -> ${comReview.effectiveStatus}`);
  check('com REVIEW_PASS o Ledger sustenta VERIFIED', comReview.effectiveStatus === 'VERIFIED');

  console.log('\n--- resultado ---');
  let falhas = 0;
  for (const c of checks) {
    if (!c.ok) falhas++;
    console.log(`  [${c.ok ? 'PASS' : 'FAIL'}] ${c.nome}${c.ok || !c.detalhe ? '' : ' — ' + c.detalhe}`);
  }
  console.log(`\n  ${checks.length} verificacoes, ${falhas} falha(s)`);
  console.log(falhas === 0
    ? '\nREPLAY: PASS — ownership corrigido, risco preservado, produto intocado.'
    : '\nREPLAY: FAIL');
  process.exit(falhas === 0 ? 0 : 1);
}
