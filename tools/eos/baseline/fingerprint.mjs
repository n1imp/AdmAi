/**
 * EOS V2 — Failure Fingerprint.
 *
 * Reconhece "a mesma falha" entre duas execucoes.
 *
 * Duas maneiras de errar, ambas cobertas por teste negativo:
 *   FROUXO DEMAIS -> falhas distintas colidem, e uma regressao nova se disfarca
 *                    de falha antiga. (BASE-NEG-02)
 *   ESTRITO DEMAIS -> valores volateis (duracoes, PIDs, caminhos temporarios)
 *                    fazem a MESMA falha parecer nova a cada execucao. (BASE-NEG-03)
 *
 * A normalizacao existe so para o segundo caso: apaga o que varia entre
 * execucoes sem alterar a identidade do defeito.
 */

import { createHash } from 'node:crypto';

/** Substitui o que varia entre execucoes por marcadores estaveis. */
export function normalizeMessage(msg = '') {
  return String(msg)
    .replace(/\b\d+(\.\d+)?\s?ms\b/gi, '<DUR>')          // 5123ms
    .replace(/\b\d+(\.\d+)?\s?s\b/gi, '<DUR>')           // 4.1s
    .replace(/[A-Za-z]:[\\/][^\s'")]+/g, '<PATH>')       // C:\tmp\x\run-8891
    .replace(/\/(?:[\w.-]+\/)+[\w.-]+/g, '<PATH>')       // /home/x/y.js
    .replace(/\b[0-9a-f]{7,40}\b/gi, '<HASH>')           // sha/commit
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, '<TS>') // ISO timestamp
    .replace(/:\d+:\d+/g, ':<LINE>')                     // file:12:34
    .replace(/\bpid\s*\d+/gi, 'pid <PID>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Assinatura de stack: so os frames de codigo do projeto, sem numeros de linha.
 * Frames de node_modules e internos sao ruido de versao.
 */
export function stackSignature(stack = '') {
  return String(stack)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('at ') && !l.includes('node_modules') && !l.includes('node:internal'))
    .slice(0, 5)
    .map((l) => l.replace(/:\d+:\d+/g, '').replace(/[A-Za-z]:[\\/][^\s()]+[\\/]/g, ''))
    .join(' | ');
}

/**
 * Identidade da falha.
 *
 * `test` entra: duas falhas no mesmo arquivo, em testes diferentes, sao falhas
 * diferentes (BASE-NEG-02).
 * `errorType` entra: mesmo teste com erro de tipo diferente e outro defeito,
 * e precisa de reclassificacao (BASE-04).
 *
 * `environment` e `toolVersion` sao registrados mas NAO entram no hash: a mesma
 * falha continua a mesma falha ao trocar de maquina. Entram como contexto para
 * o classificador decidir ENVIRONMENT_FAILURE.
 */
export function fingerprint(f = {}) {
  const parts = [
    f.file ?? '',
    f.test ?? '',
    f.errorType ?? '',
    normalizeMessage(f.message),
    f.assertion ? normalizeMessage(f.assertion) : '',
    f.stack ? stackSignature(f.stack) : ''
  ];
  const hash = createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16);
  return {
    id: hash,
    key: `${f.file ?? '?'}::${f.test ?? '?'}`,
    file: f.file,
    test: f.test,
    errorType: f.errorType,
    normalizedMessage: normalizeMessage(f.message),
    stackSignature: f.stack ? stackSignature(f.stack) : null,
    environment: f.environment ?? null,
    toolVersion: f.toolVersion ?? null
  };
}

export const sameFailure = (a, b) => fingerprint(a).id === fingerprint(b).id;

/**
 * Mesmo teste, defeito diferente. Este e o caso que exige REQUIRES_RECLASSIFICATION:
 * reaproveitar o Finding antigo aqui esconderia um defeito novo atras de um
 * conhecido.
 */
export const sameTestDifferentFailure = (a, b) =>
  fingerprint(a).key === fingerprint(b).key && fingerprint(a).id !== fingerprint(b).id;
