// Helpers de período compartilhados por /dashboard (routes/servicos.js) e /me/metricas
// (routes/account.js). Extraídos de servicos.js com comportamento idêntico, para reuso sem
// duplicação. Datas em horário local do servidor (mesma convenção do /dashboard).

export function dataValida(d) {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

// 'YYYY-MM-DD' → 00:00:00.000 do dia, em horário LOCAL do servidor (mesma convenção dos
// presets hoje/semana/mes). Qualquer outro formato devolve null em vez de Invalid Date,
// para o chamador cair no fallback em vez de montar um filtro silenciosamente quebrado.
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function diaLocalInicio(texto) {
  if (!texto || !SO_DATA.test(texto)) return null;
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0);
}

/** Idem, mas no último milissegundo do dia — o `lte` precisa incluir o dia inteiro. */
export function diaLocalFim(texto) {
  if (!texto || !SO_DATA.test(texto)) return null;
  const [ano, mes, dia] = texto.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999);
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
  // `inicio`/`fim` chegam como 'YYYY-MM-DD' do painel e precisam virar dia LOCAL, igual
  // aos presets acima. Antes: `new Date('2026-07-01')` era interpretado como UTC e
  // `fim + 'T23:59:59.999Z'` fixava UTC explicitamente — em BRT (UTC-3) o intervalo saía
  // deslocado 3h, incluindo a noite de 30/06 e EXCLUINDO tudo entre 21h e 23h59 de 31/07.
  // Isso alterava o dinheiro do PDF de fechamento, não só a listagem.
  const dInicio = diaLocalInicio(inicio);
  const dFim = diaLocalFim(fim);
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
