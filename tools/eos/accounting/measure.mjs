/**
 * EOS V2 — Resource Accounting: medicao com proveniencia.
 *
 * PRINCIPIO FUNDAMENTAL: token, credito, custo monetario, bytes de contexto,
 * chamadas de ferramenta e wall time sao grandezas DIFERENTES. Nenhuma se deriva
 * da outra quando o provedor nao expoe a relacao.
 *
 * A distincao que mais importa aqui: `UNAVAILABLE` nao e zero. Zero e um valor
 * medido — significa "aconteceu, e foi nenhum". Ausencia significa "nao sei".
 * Trata-las como iguais produziria relatorios falsamente precisos.
 *
 * CUSTO E OBJETIVO SECUNDARIO: este modulo observa. Ele nao autoriza reduzir
 * evidencia, verificacao, seguranca ou invariante para melhorar numero.
 */

import { createHash } from 'node:crypto';

export const MEASUREMENT_STATUSES = ['MEASURED', 'ESTIMATED', 'UNAVAILABLE', 'NOT_APPLICABLE'];

/** Valor observado diretamente. */
export const measured = (name, value) => ({ name, value, status: 'MEASURED' });

/** Valor calculado — carrega o metodo, e nunca se apresenta como medido. */
export const estimated = (name, value, method) => {
  if (!method) throw new Error(`estimativa de '${name}' sem metodo declarado`);
  return { name, value, status: 'ESTIMATED', method };
};

/** Fonte nao fornece o valor. `value` fica null — jamais 0. */
export const unavailable = (name, reason = 'fonte nao expoe o valor') =>
  ({ name, value: null, status: 'UNAVAILABLE', reason });

export const notApplicable = (name, reason = 'metrica nao se aplica') =>
  ({ name, value: null, status: 'NOT_APPLICABLE', reason });

/**
 * Metrica a partir de observacao. Se nao foi observada, e UNAVAILABLE —
 * o caminho para "0 por engano" nao existe.
 */
export function metric({ name, value, observed, estimated: isEst, method, reason }) {
  if (isEst) return estimated(name, value, method);
  if (observed === false || value === undefined || value === null) return unavailable(name, reason);
  return measured(name, value);
}

/* ------------------------------------------------------------------ *
 * Redacao de segredos (secao 35).
 * Accounting guarda ID, hash e contagem — nunca payload cru.
 * ------------------------------------------------------------------ */

const SECRET_PATTERNS = [
  /\bghp_[A-Za-z0-9]{20,}/g, /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bsbp_[A-Za-z0-9]{20,}/g, /\bsk-[A-Za-z0-9]{20,}/g,
  /\b(token|secret|api[_-]?key|password|senha)\s*[:=]\s*\S+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

export function redact(text = '') {
  let out = String(text);
  for (const re of SECRET_PATTERNS) out = out.replace(re, '<REDACTED>');
  return out;
}

/**
 * Referencia seguras a uma saida de ferramenta: hash e contagem de bytes,
 * sem o conteudo. Se o texto continha segredo, ele nunca chega ao registro.
 */
export function toolOutputRef(tool, raw = '') {
  const safe = redact(raw);
  return {
    tool,
    bytes: Buffer.byteLength(raw, 'utf8'),
    hash: createHash('sha256').update(raw).digest('hex').slice(0, 16),
    redacted: safe !== raw,
    // Amostra ja redigida, curta, so para diagnostico.
    sample: safe.slice(0, 80)
  };
}

/** Alvos herdados entram como orientacao, nunca como gate (secao 32). */
export function advisoryTarget({ level, advisoryTargetBytes, observedBytes }) {
  return {
    kind: 'ADVISORY_TARGET',
    level,
    target: advisoryTargetBytes,
    observed: observedBytes,
    exceeded: observedBytes > advisoryTargetBytes,
    // Consultivo: excedeu nao bloqueia nada.
    blocks: false,
    note: 'meta conceitual sem base empirica suficiente; serve para observacao'
  };
}
