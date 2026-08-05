/**
 * Lógica pura do gate de `npm audit` com exceções explícitas e auditáveis.
 *
 * Separado de `audit-gate.mjs` (que tem I/O e é o CLI) pelo mesmo motivo de
 * `backfill-uploads-helpers.mjs`: mantém a lógica testável sem shebang nem I/O.
 *
 * Regra: qualquer advisory High/Critical bloqueia, A MENOS que exista uma entrada
 * na allowlist com o MESMO ghsaId E o MESMO package, e essa entrada ainda não
 * tenha passado da data `reviewBy`. Moderate/Low/Info nunca bloqueiam aqui —
 * mesmo comportamento do `--audit-level=high` que este gate substitui.
 */

const GHSA_URL_RE = /(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4})/i;
const NIVEIS_BLOQUEANTES = new Set(['high', 'critical']);

/** Extrai cada advisory individual (não por pacote) da saída de `npm audit --json`. */
function extrairAdvisories(auditJson) {
  const advisories = [];
  const vulnerabilities = auditJson?.vulnerabilities ?? {};
  for (const [pacote, entry] of Object.entries(vulnerabilities)) {
    const via = Array.isArray(entry?.via) ? entry.via : [];
    for (const item of via) {
      // `via` pode conter strings (nome de outro pacote, referência indireta em
      // cadeia) em vez de objetos de advisory — não são um advisory em si, pular.
      if (typeof item !== 'object' || item === null) continue;
      const match = typeof item.url === 'string' ? item.url.match(GHSA_URL_RE) : null;
      if (!match) continue;
      advisories.push({
        pacote,
        ghsaId: match[1].toUpperCase(),
        severity: item.severity,
        title: item.title,
        url: item.url,
      });
    }
  }
  return advisories;
}

/** Indexa a allowlist por `GHSAID::pacote`, marcando entradas já expiradas. */
function carregarAllowlist(allowlistJson, hoje = new Date()) {
  const entries = Array.isArray(allowlistJson?.entries) ? allowlistJson.entries : [];
  const mapa = new Map();
  for (const entrada of entries) {
    const reviewBy = new Date(`${entrada.reviewBy}T00:00:00Z`);
    const expirada = hoje.getTime() > reviewBy.getTime();
    mapa.set(`${entrada.ghsaId.toUpperCase()}::${entrada.package}`, { ...entrada, expirada });
  }
  return mapa;
}

/**
 * Avalia o gate. Retorna `{ ok, bloqueantes, dispensados, ignorados }`.
 * `ok === false` deve reprovar o step de CI que chamou este gate.
 */
function avaliarGate(auditJson, allowlistJson, hoje = new Date()) {
  const advisories = extrairAdvisories(auditJson);
  const allowlist = carregarAllowlist(allowlistJson, hoje);

  const bloqueantes = [];
  const dispensados = [];
  const ignorados = [];

  for (const adv of advisories) {
    if (!NIVEIS_BLOQUEANTES.has(adv.severity)) {
      ignorados.push(adv);
      continue;
    }
    const chave = `${adv.ghsaId}::${adv.pacote}`;
    const entradaAllowlist = allowlist.get(chave);
    if (entradaAllowlist && !entradaAllowlist.expirada) {
      dispensados.push({ ...adv, allowlist: entradaAllowlist });
    } else if (entradaAllowlist && entradaAllowlist.expirada) {
      bloqueantes.push({
        ...adv,
        motivo: 'excecao expirada (reviewBy vencido) — precisa de nova revisão',
      });
    } else {
      bloqueantes.push({ ...adv, motivo: 'não consta na allowlist' });
    }
  }

  return { ok: bloqueantes.length === 0, bloqueantes, dispensados, ignorados };
}

export { extrairAdvisories, carregarAllowlist, avaliarGate };
