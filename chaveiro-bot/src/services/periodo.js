// Helpers de período compartilhados por /dashboard (routes/servicos.js) e /me/metricas
// (routes/account.js). Extraídos de servicos.js com comportamento idêntico, para reuso sem
// duplicação. Datas em horário local do servidor (mesma convenção do /dashboard).

export function dataValida(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

// Constrói o filtro { gte, lte } de `criadoEm` para o período pedido
// (hoje | semana | mes | custom com inicio/fim). Custom sem datas válidas → último mês.
export function construirFiltroPeriodo(periodo, inicio, fim) {
  const agora = new Date();
  const hoje = new Date(agora);
  hoje.setHours(0, 0, 0, 0);
  if (periodo === 'hoje') {
    const fimHoje = new Date(hoje);
    fimHoje.setHours(23, 59, 59, 999);
    return { gte: hoje, lte: fimHoje };
  }
  if (periodo === 'semana') {
    const ini = new Date(hoje);
    ini.setDate(hoje.getDate() - hoje.getDay());
    return { gte: ini, lte: agora };
  }
  if (periodo === 'mes') {
    return { gte: new Date(hoje.getFullYear(), hoje.getMonth(), 1), lte: agora };
  }
  const dInicio = inicio ? new Date(inicio) : null;
  const dFim = fim ? new Date(fim + 'T23:59:59.999Z') : null;
  const inicioOk = dataValida(dInicio);
  const fimOk = dataValida(dFim);
  if (inicioOk && fimOk) return { gte: dInicio, lte: dFim };
  if (inicioOk) return { gte: dInicio, lte: agora };
  if (fimOk) return { gte: new Date('2000-01-01'), lte: dFim };
  const umMesAtras = new Date(hoje);
  umMesAtras.setMonth(hoje.getMonth() - 1);
  return { gte: umMesAtras, lte: agora };
}

// Janela imediatamente anterior, de mesma duração (para variação/comparativo).
export function construirFiltroPeriodoAnterior(filtroAtual) {
  const inicio = filtroAtual.gte instanceof Date ? filtroAtual.gte : new Date(filtroAtual.gte);
  const fim = filtroAtual.lte instanceof Date ? filtroAtual.lte : new Date(filtroAtual.lte);
  const duracaoMs = fim.getTime() - inicio.getTime();
  return { gte: new Date(inicio.getTime() - duracaoMs), lte: new Date(inicio.getTime() - 1) };
}

// Agrupa serviços por dia (YYYY-MM-DD) somando receita líquida e comissão. Usado na série
// diária pessoal de /me/metricas. Ordenado por data ascendente.
export function agruparReceitaPorDia(servicos) {
  const mapa = {};
  for (const s of servicos) {
    const dia = new Date(s.criadoEm).toISOString().split('T')[0];
    if (!mapa[dia]) mapa[dia] = { data: dia, receita: 0, comissao: 0, servicos: 0 };
    mapa[dia].receita += s.valorLiquido ?? 0;
    mapa[dia].comissao += s.comissaoGerada ?? 0;
    mapa[dia].servicos++;
  }
  return Object.values(mapa).sort((a, b) => a.data.localeCompare(b.data));
}
