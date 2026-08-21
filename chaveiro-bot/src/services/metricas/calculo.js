/**
 * Camada de CÁLCULO das métricas.  [Metric Foundation · P7]
 *
 * O QUE ESTE MÓDULO ENTREGA
 *   Os oito cálculos das métricas hoje classificadas `AVAILABLE_NOW` por `availability.mjs`.
 *   Funções PURAS sobre linhas simples: recebem dados, devolvem resultado. Sem Prisma, sem rede,
 *   sem relógio — as mesmas linhas produzem sempre o mesmo número, e é isso que torna os testes
 *   determinísticos em vez de aproximados.
 *
 * O REGISTRO É A AUTORIDADE, E ISSO É VERIFICADO — NÃO PROMETIDO
 *   Seria fácil escrever oito funções corretas e afirmar que seguem o contrato. A afirmação não
 *   vale nada sozinha: `verificarAncoragem` confere, métrica a métrica, que a agregação declarada
 *   pelo calculador aparece na `formula` do registro, que as entidades batem com `sourceEntities`,
 *   e que cada campo lido está escrito na fórmula. Mudar a fórmula no contrato e não mudar o
 *   cálculo REPROVA — que é a única forma de "o contrato manda" significar alguma coisa.
 *
 * A PROPRIEDADE MAIS CARA: FILTRO DECLARADO ≠ FILTRO APLICADO
 *   Um calculador pode declarar `status = ativo` e nunca aplicá-lo. O número sai plausível, ninguém
 *   percebe, e a métrica mente para sempre. Por isso cada fixture contém, de propósito, linhas que
 *   o filtro precisa EXCLUIR — e o controle de não-vacuidade prova que removê-las MUDA o resultado.
 *   Fixture sem linha excluível faria o teste passar por ausência de alvo, que é a forma silenciosa
 *   de um teste mentir.
 *
 * `INSUFFICIENT` É RESULTADO, NÃO FALHA
 *   Metade das `qualityRules` do registro existe para impedir um número que engana: média de nada
 *   não é zero, empresa sem aprovação ligada não tem 100% de aprovação, e média de três avaliações
 *   não é reputação. Nesses casos o cálculo devolve `{ estado: 'INSUFFICIENT', motivo }` — nunca um
 *   número. Devolver zero ali seria a métrica descrevendo como fato algo que não mediu.
 *
 * FRONTEIRA DECLARADA
 *   Este módulo NÃO consulta o banco. Recebe linhas e devolve resultado. Quem busca as linhas com
 *   escopo de empresa é `consulta.js`, e quem monta a resposta autorizada é `exposicao.js`. A
 *   separação é o que mantém o cálculo testável sem banco e sem relógio.
 *
 * ONDE ISTO VIVE, E POR QUÊ
 *   Nasceu em `tools/admai-delivery/metric/`. Mudou para cá porque o Dockerfile copia apenas
 *   `chaveiro-bot/` — código de runtime que importasse de `tools/` quebraria o build. Este arquivo
 *   é a ÚNICA autoridade do cálculo; a bateria de verificação vive no harness e importa DAQUI, em
 *   vez de manter um contrato paralelo. Duas cópias do mesmo contrato foi exatamente o defeito
 *   R18-04, e não se repete aqui.
 */

import { METRICAS } from './registro.js';

/** Resultado insuficiente. Motivo obrigatório: `INSUFFICIENT` sem razão é só um buraco. */
export function insuficiente(motivo) {
  return Object.freeze({ estado: 'INSUFFICIENT', motivo, valor: null });
}

export function valor(v, extras = {}) {
  return Object.freeze({ estado: 'OK', valor: v, ...extras });
}

/** Amostra mínima para uma média de nota significar reputação. Vem da `qualityRule` do registro. */
export const MINIMO_DE_AVALIACOES = 5;

const noPeriodo = (data, { inicio, fim }) => {
  if (!inicio && !fim) return true;
  const t = data instanceof Date ? data.getTime() : new Date(data).getTime();
  if (Number.isNaN(t)) return false;
  if (inicio && t < new Date(inicio).getTime()) return false;
  if (fim && t > new Date(fim).getTime()) return false;
  return true;
};

/** `valorLiquido` ausente ou negativo é dado inválido — não entra, e não vira zero. */
const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/* ------------------------------------------------------------------ *
 * Os oito cálculos
 * ------------------------------------------------------------------ */

export const CALCULADORES = Object.freeze({
  'faturamento-liquido': {
    agregacao: 'SUM',
    entidades: ['Servico'],
    campos: ['valorLiquido', 'status', 'criadoEm'],
    /* UM predicado, DOIS consumidores: o cálculo soma exatamente o que o drilldown lista.
       Antes o handler do drilldown filtrava por `status === 'ativo'` e nada mais — o que serve a
       `servicos-concluidos` e ESTARIA ERRADO aqui, porque a regra de qualidade desta métrica
       também descarta `valorLiquido` ausente ou negativo. A lista mostraria registros que o total
       não somou, e nenhum dos dois números estaria errado sozinho. */
    elegiveis: (servicos, periodo = {}) => servicos
      .filter((s) => s.status === 'ativo')
      .filter((s) => noPeriodo(s.criadoEm, periodo))
      .filter((s) => numeroValido(s.valorLiquido)),
    calcular(servicos, periodo = {}) {
      const elegiveis = this.elegiveis(servicos, periodo);
      return valor(round2(elegiveis.reduce((t, s) => t + s.valorLiquido, 0)), { registros: elegiveis.length });
    }
  },

  'ticket-medio': {
    agregacao: 'SUM/COUNT',
    entidades: ['Servico'],
    campos: ['valorLiquido', 'status'],
    calcular(servicos, periodo = {}) {
      const elegiveis = servicos
        .filter((s) => s.status === 'ativo')
        .filter((s) => noPeriodo(s.criadoEm, periodo))
        .filter((s) => numeroValido(s.valorLiquido));
      /* Média de nada não é zero — é ausência de medida. */
      if (elegiveis.length === 0) return insuficiente('nenhum serviço ativo no período: média sem denominador');
      const soma = elegiveis.reduce((t, s) => t + s.valorLiquido, 0);
      return valor(round2(soma / elegiveis.length), { registros: elegiveis.length });
    }
  },

  'comissao-total': {
    agregacao: 'SUM',
    entidades: ['Servico', 'Pagamento'],
    campos: ['comissaoGerada', 'status', 'criadoEm'],
    calcular(servicos, periodo = {}) {
      const elegiveis = servicos
        .filter((s) => s.status === 'ativo')
        .filter((s) => noPeriodo(s.criadoEm, periodo));
      /* Comissão ausente é dado INCOMPLETO, e a contagem disso viaja junto com o número: somar
         como zero calaria a diferença entre "não gerou comissão" e "ninguém configurou o percentual". */
      const semPercentual = elegiveis.filter((s) => !numeroValido(s.comissaoGerada)).length;
      const total = elegiveis
        .filter((s) => numeroValido(s.comissaoGerada))
        .reduce((t, s) => t + s.comissaoGerada, 0);
      return valor(round2(total), { registros: elegiveis.length, incompletos: semPercentual });
    }
  },

  'servicos-concluidos': {
    agregacao: 'COUNT',
    entidades: ['Servico'],
    campos: ['status', 'criadoEm'],
    elegiveis: (servicos, periodo = {}) => servicos
      .filter((s) => s.status === 'ativo')
      .filter((s) => noPeriodo(s.criadoEm, periodo)),
    calcular(servicos, periodo = {}) {
      const elegiveis = this.elegiveis(servicos, periodo);
      return valor(elegiveis.length, { registros: elegiveis.length });
    }
  },

  'taxa-aprovacao': {
    agregacao: 'COUNT/COUNT',
    entidades: ['Servico', 'Empresa'],
    campos: ['status', 'aprovadoEm', 'criadoEm', 'aprovacaoServico'],
    /* Não existe campo `registradoPorFuncionario` no schema — a primeira versão deste cálculo o
       inventou, e a checagem de ancoragem reprovou. O fluxo real é observável: funcionário em
       empresa com `aprovacaoServico` cria como `pendente`; aprovar leva a `ativo`+`aprovadoEm`,
       rejeitar leva a `rejeitado`+`aprovadoEm`. O denominador é quem ENTROU no fluxo. */
    calcular(servicos, periodo = {}, empresa = {}) {
      /* Empresa sem aprovação ligada não tem 100% de aprovação: não tem taxa nenhuma. Devolver
         100% aqui seria inventar um número a partir da ausência do processo. */
      if (empresa.aprovacaoServico !== true) {
        return insuficiente('empresa não usa aprovação de serviço: não há taxa a medir');
      }
      const doPeriodo = servicos.filter((s) => noPeriodo(s.criadoEm, periodo));
      const aprovados = doPeriodo.filter((s) => s.status === 'ativo' && s.aprovadoEm != null);
      const noFluxo = doPeriodo.filter((s) =>
        s.status === 'pendente' || s.status === 'rejeitado' ||
        (s.status === 'ativo' && s.aprovadoEm != null));
      if (noFluxo.length === 0) {
        return insuficiente('nenhum serviço entrou no fluxo de aprovação no período: denominador zero não é taxa');
      }
      return valor(round4(aprovados.length / noFluxo.length), {
        aprovados: aprovados.length, noFluxo: noFluxo.length
      });
    }
  },

  'producao-por-tecnico': {
    agregacao: 'GROUP BY',
    entidades: ['Servico', 'Tecnico'],
    campos: ['tecnicoId', 'valorLiquido', 'comissaoGerada', 'status'],
    /* `tecnicos` entra por inteiro de propósito: quem não produziu precisa aparecer com zero
       EXPLÍCITO. Sumir da lista faria "não produziu" ser indistinguível de "não existe", e é
       justamente sobre essa diferença que a decisão do dono acontece. */
    calcular(servicos, periodo = {}, tecnicos = []) {
      const elegiveis = servicos
        .filter((s) => s.status === 'ativo')
        .filter((s) => noPeriodo(s.criadoEm, periodo));
      const porTecnico = new Map(tecnicos.map((t) => [t.id, {
        tecnicoId: t.id, nome: t.nome, servicos: 0, valorLiquido: 0, comissaoGerada: 0
      }]));
      for (const s of elegiveis) {
        if (!porTecnico.has(s.tecnicoId)) continue;   // técnico fora do tenant não entra
        const linha = porTecnico.get(s.tecnicoId);
        linha.servicos += 1;
        if (numeroValido(s.valorLiquido)) linha.valorLiquido += s.valorLiquido;
        if (numeroValido(s.comissaoGerada)) linha.comissaoGerada += s.comissaoGerada;
      }
      const linhas = [...porTecnico.values()]
        .map((l) => ({ ...l, valorLiquido: round2(l.valorLiquido), comissaoGerada: round2(l.comissaoGerada) }))
        .sort((a, b) => b.valorLiquido - a.valorLiquido || a.tecnicoId - b.tecnicoId);
      return valor(linhas, { registros: elegiveis.length });
    }
  },

  'horas-trabalhadas': {
    agregacao: 'SUM',
    entidades: ['RegistroPonto', 'BatidaPonto', 'Tecnico'],
    campos: ['tipo', 'em', 'registroId', 'data'],
    /* Registro com entrada e sem saída é INCOMPLETO e não entra na soma. Fechar o intervalo com
       "agora" produziria hora trabalhada que ninguém trabalhou, e cresceria sozinha com o relógio. */
    calcular(registros, periodo = {}) {
      let minutos = 0;
      let incompletos = 0;
      const noEscopo = registros.filter((r) => noPeriodo(r.data, periodo));
      for (const r of noEscopo) {
        const batidas = [...(r.batidas ?? [])].sort((a, b) => new Date(a.em) - new Date(b.em));
        const entrada = batidas.find((b) => b.tipo === 'entrada');
        const saida = batidas.find((b) => b.tipo === 'saida');
        if (!entrada || !saida) { incompletos += 1; continue; }
        let bruto = (new Date(saida.em) - new Date(entrada.em)) / 60000;
        const almocoSaida = batidas.find((b) => b.tipo === 'almoco_saida');
        const almocoVolta = batidas.find((b) => b.tipo === 'almoco_volta');
        if (almocoSaida && almocoVolta) {
          bruto -= (new Date(almocoVolta.em) - new Date(almocoSaida.em)) / 60000;
        }
        if (bruto > 0) minutos += bruto;
      }
      return valor(round2(minutos / 60), { registros: noEscopo.length, incompletos });
    }
  },

  'nota-media-avaliacao': {
    agregacao: 'AVG',
    entidades: ['Avaliacao', 'Servico'],
    campos: ['nota', 'criadoEm'],
    calcular(avaliacoes, periodo = {}) {
      /* `nota` é opcional no schema: avaliação enviada e não respondida não tem nota, e contá-la
         como zero rebaixaria a média por silêncio. */
      const respondidas = avaliacoes
        .filter((a) => noPeriodo(a.criadoEm, periodo))
        .filter((a) => typeof a.nota === 'number' && a.nota >= 1 && a.nota <= 5);
      if (respondidas.length < MINIMO_DE_AVALIACOES) {
        return insuficiente(`${respondidas.length} avaliações respondidas: abaixo do mínimo de ${MINIMO_DE_AVALIACOES} para média significar reputação`);
      }
      const soma = respondidas.reduce((t, a) => t + a.nota, 0);
      return valor(round2(soma / respondidas.length), { registros: respondidas.length });
    }
  }
});

const round2 = (n) => Math.round(n * 100) / 100;
const round4 = (n) => Math.round(n * 10000) / 10000;

/* ------------------------------------------------------------------ *
 * Agrupamento e série — genéricos, dirigidos pelo contrato
 * ------------------------------------------------------------------ */

/**
 * Como extrair a chave de cada dimensão declarada. Fechado de propósito: dimensão que o contrato
 * declara e este mapa não conhece REPROVA, em vez de agrupar por `undefined` e devolver um balde
 * só com aparência de resposta.
 *
 * `rotulo` é o que o usuário vê. Ele é resolvido pelo CONTEXTO (nomes de técnico), nunca por um
 * campo que a linha carregue — e é por isso que ele respeita escopo: se o contexto foi recortado,
 * o rótulo some junto. Foi o defeito de `producao-por-tecnico`: recortar a linha e não o rótulo.
 */
export const CHAVES_DE_DIMENSAO = Object.freeze({
  tecnico: { campo: (l) => l.tecnicoId, rotulo: (k, ctx) => ctx?.tecnicos?.find((t) => t.id === k)?.nome ?? null },
  local: { campo: (l) => l.local ?? null, rotulo: (k) => k },
  dia: { campo: (l) => diaDe(l.criadoEm), rotulo: (k) => k }
});

/** `YYYY-MM-DD` no fuso do servidor — mesma convenção de `services/periodo.js`. */
export function diaDe(data) {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Agrupa as linhas ELEGÍVEIS de uma métrica por uma dimensão declarada.
 *
 * O DEFEITO QUE ISTO CORRIGE
 *   `?dimensao=tecnico` era validado pela allowlist e depois **ignorado**: o cálculo rodava sem
 *   agrupar e a resposta trazia o total. O parâmetro certo produzindo a resposta errada — pior que
 *   rejeitar, porque o cliente pediu recorte, recebeu um número plausível e não tinha como saber.
 *
 * Reusa o MESMO calculador da métrica em cada balde. Reimplementar a contagem por grupo criaria
 * uma segunda definição, e os grupos poderiam não somar o total.
 */
export function agruparPorDimensao(metricId, linhas, periodo = {}, dimensao, contexto = {}) {
  const calc = CALCULADORES[metricId];
  const chave = CHAVES_DE_DIMENSAO[dimensao];
  if (!calc || !chave) return null;

  const baldes = new Map();
  for (const linha of linhas) {
    const k = chave.campo(linha);
    if (k === null || k === undefined) continue;
    if (!baldes.has(k)) baldes.set(k, []);
    baldes.get(k).push(linha);
  }

  const grupos = [];
  for (const [k, doGrupo] of baldes) {
    const rotulo = chave.rotulo(k, contexto);
    /* Escopo: sem rótulo resolvível, a chave crua NÃO vira rótulo. Para um usuário auto-escopado o
       contexto vem recortado, e expor `tecnicoId: 31` seria vazar por identificador o que o nome
       já não podia vazar. */
    if (rotulo === null && dimensao === 'tecnico') continue;
    const r = calc.calcular(doGrupo, periodo, contexto.extra ?? contexto);
    if (r.estado !== 'OK') continue;
    grupos.push({ chave: String(k), rotulo: String(rotulo), valor: r.valor, registros: r.registros ?? null });
  }

  grupos.sort((a, b) => (b.valor - a.valor) || String(a.rotulo).localeCompare(String(b.rotulo)));
  return { dimensao, grupos };
}

/**
 * Série temporal. Usa a MESMA semântica de tempo do contrato — o dia sai de `criadoEm`, que é a
 * data de REGISTRO e não de execução, e a distinção está declarada em `timeSemantics`.
 *
 * Preenche os dias vazios com zero DENTRO da janela pedida: uma série que pula o dia sem serviço
 * desenha uma linha contínua onde houve queda a zero, o que é mentir por omissão no eixo x.
 */
export function serieTemporal(metricId, linhas, janela, contexto = {}) {
  const calc = CALCULADORES[metricId];
  if (!calc || !janela?.gte || !janela?.lte) return null;

  const porDia = new Map();
  for (const linha of linhas) {
    const d = diaDe(linha.criadoEm ?? linha.data);
    if (!d) continue;
    if (!porDia.has(d)) porDia.set(d, []);
    porDia.get(d).push(linha);
  }

  const pontos = [];
  const fim = new Date(janela.lte);
  for (const cursor = new Date(janela.gte); cursor <= fim; cursor.setDate(cursor.getDate() + 1)) {
    const d = diaDe(cursor);
    const doDia = porDia.get(d) ?? [];
    const r = calc.calcular(doDia, {}, contexto.extra ?? contexto);
    pontos.push({ dia: d, valor: r.estado === 'OK' ? r.valor : null });
  }
  return { granularidade: 'dia', pontos };
}

/* ------------------------------------------------------------------ *
 * Segurança — lida do contrato, nunca embutida aqui
 * ------------------------------------------------------------------ */

/**
 * Permissão de AGREGADO não implica permissão de DRILLDOWN. As duas listas vêm do `securityScope`
 * da métrica no registro; este módulo não tem opinião própria sobre quem vê o quê, e mudar o
 * contrato muda o comportamento sem tocar aqui.
 */
export function podeVer(metricId, papel, nivel) {
  const m = METRICAS.find((x) => x.metricId === metricId);
  if (!m) return false;
  if (nivel !== 'agregado' && nivel !== 'drilldown') return false;
  return (m.securityScope?.[nivel] ?? []).includes(papel);
}

/* ------------------------------------------------------------------ *
 * Ancoragem no contrato
 * ------------------------------------------------------------------ */

/** Tokens de agregação que a fórmula do contrato pode declarar. */
export const TOKENS_DE_AGREGACAO = Object.freeze(['SUM', 'COUNT', 'AVG', 'GROUP BY']);

/**
 * O calculador corresponde ao que o contrato manda?  Documento → cálculo, e não o contrário.
 *
 * Confere três coisas por métrica: a agregação declarada aparece na `formula`; as entidades são
 * exatamente as `sourceEntities`; e cada campo lido está escrito na fórmula OU nos filtros. O
 * terceiro item é o que impede um calculador de ler um campo que o contrato nunca mencionou.
 */
export function verificarAncoragem(metricId, calc, metrica) {
  const problemas = [];
  if (!metrica) return [`${metricId}: não existe no registro`];

  const formula = String(metrica.formula ?? '');
  for (const token of calc.agregacao.split('/')) {
    if (!formula.includes(token.trim())) {
      problemas.push(`${metricId}: agregação "${token.trim()}" não aparece na fórmula do contrato`);
    }
  }

  const esperadas = [...(metrica.sourceEntities ?? [])].sort();
  const declaradas = [...calc.entidades].sort();
  if (JSON.stringify(esperadas) !== JSON.stringify(declaradas)) {
    problemas.push(`${metricId}: entidades divergem — contrato=[${esperadas}] cálculo=[${declaradas}]`);
  }

  const textoDoContrato = `${formula} ${(metrica.filters ?? []).join(' ')} ${(metrica.qualityRules ?? []).join(' ')} ${metrica.grain ?? ''}`;
  for (const campo of calc.campos) {
    if (!textoDoContrato.includes(campo)) {
      problemas.push(`${metricId}: campo "${campo}" é lido pelo cálculo e não aparece no contrato`);
    }
  }
  return problemas;
}

/* ------------------------------------------------------------------ *
 * Fixtures determinísticas — datas fixas, nunca `Date.now()`
 * ------------------------------------------------------------------ */

const PERIODO = { inicio: '2026-03-01T00:00:00Z', fim: '2026-03-31T23:59:59Z' };
const DENTRO = '2026-03-15T12:00:00Z';
const FORA = '2026-02-15T12:00:00Z';

/**
 * Cada fixture carrega, de propósito, linhas que os filtros precisam EXCLUIR: serviço cancelado,
 * serviço fora do período, valor inválido. São o alvo dos controles de não-vacuidade — sem elas o
 * teste passaria mesmo que o filtro nunca fosse aplicado.
 */
export const FIXTURES = Object.freeze({
  servicos: Object.freeze([
    /* aprovado: entra no numerador E no denominador da taxa */
    { id: 1, tecnicoId: 10, status: 'ativo', valorLiquido: 100, comissaoGerada: 12, criadoEm: DENTRO, aprovadoEm: DENTRO },
    /* registrado direto pelo dono: nunca passou pelo fluxo, fica FORA do denominador */
    { id: 2, tecnicoId: 10, status: 'ativo', valorLiquido: 300, comissaoGerada: 36, criadoEm: DENTRO, aprovadoEm: null },
    { id: 3, tecnicoId: 11, status: 'ativo', valorLiquido: 200, comissaoGerada: 24, criadoEm: DENTRO, aprovadoEm: DENTRO },
    /* excluído por status */
    { id: 4, tecnicoId: 10, status: 'cancelado', valorLiquido: 999, comissaoGerada: 99, criadoEm: DENTRO, aprovadoEm: null },
    /* excluído por período */
    { id: 5, tecnicoId: 11, status: 'ativo', valorLiquido: 500, comissaoGerada: 60, criadoEm: FORA, aprovadoEm: null },
    /* excluído por valor inválido — negativo é dado ruim, não desconto */
    { id: 6, tecnicoId: 11, status: 'ativo', valorLiquido: -50, comissaoGerada: 0, criadoEm: DENTRO, aprovadoEm: null },
    /* no fluxo e ainda não decidido: denominador, não numerador */
    { id: 7, tecnicoId: 10, status: 'pendente', valorLiquido: 150, comissaoGerada: 18, criadoEm: DENTRO, aprovadoEm: null },
    /* rejeitado: denominador, não numerador — some da taxa se alguém esquecer o status */
    { id: 8, tecnicoId: 11, status: 'rejeitado', valorLiquido: 80, comissaoGerada: 9, criadoEm: DENTRO, aprovadoEm: DENTRO }
  ]),
  tecnicos: Object.freeze([
    { id: 10, nome: 'Ana' },
    { id: 11, nome: 'Bruno' },
    /* não produziu no período: precisa aparecer com zero explícito */
    { id: 12, nome: 'Carla' }
  ]),
  avaliacoes: Object.freeze([
    { id: 1, nota: 5, criadoEm: DENTRO }, { id: 2, nota: 4, criadoEm: DENTRO },
    { id: 3, nota: 5, criadoEm: DENTRO }, { id: 4, nota: 3, criadoEm: DENTRO },
    { id: 5, nota: 3, criadoEm: DENTRO },
    { id: 6, nota: null, criadoEm: DENTRO },        // enviada e não respondida
    { id: 7, nota: 1, criadoEm: FORA }              // fora do período
  ]),
  registrosDePonto: Object.freeze([
    { id: 1, tecnicoId: 10, data: DENTRO, batidas: [
      { tipo: 'entrada', em: '2026-03-15T08:00:00Z' },
      { tipo: 'almoco_saida', em: '2026-03-15T12:00:00Z' },
      { tipo: 'almoco_volta', em: '2026-03-15T13:00:00Z' },
      { tipo: 'saida', em: '2026-03-15T17:00:00Z' }
    ] },
    /* incompleto: entrou e não saiu — não entra na soma */
    { id: 2, tecnicoId: 11, data: DENTRO, batidas: [{ tipo: 'entrada', em: '2026-03-16T08:00:00Z' }] },
    /* fora do período */
    { id: 3, tecnicoId: 10, data: FORA, batidas: [
      { tipo: 'entrada', em: '2026-02-15T08:00:00Z' }, { tipo: 'saida', em: '2026-02-15T18:00:00Z' }
    ] }
  ]),
  empresaComAprovacao: Object.freeze({ aprovacaoServico: true }),
  empresaSemAprovacao: Object.freeze({ aprovacaoServico: false }),
  periodo: PERIODO
});
