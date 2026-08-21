/**
 * Exposição HTTP das métricas.  [Metric Foundation]
 *
 * UM ENDPOINT, NÃO UM POR MÉTRICA
 *   `GET /metricas/:metricId` serve as oito métricas implementáveis, e o REGISTRO escolhe tudo:
 *   qual cálculo roda, qual permissão exige, quais dimensões aceita, quem faz drilldown.
 *   Acrescentar métrica não toca este arquivo — se tocasse, o registro não seria autoridade, seria
 *   documentação de um `switch`.
 *
 * A FÓRMULA NÃO ESTÁ AQUI
 *   Nenhuma aritmética de métrica neste arquivo. Reimplementar "só a soma" na camada HTTP criaria
 *   uma segunda definição da métrica, e seria a não verificada que o usuário veria.
 *
 * ESCOPO DE TENANT
 *   Toda consulta por `req.db`, o client estendido de `db/tenant.js`. `empresaId` do cliente é
 *   rejeitado como parâmetro — o tenant vem do token.
 */

import { Router } from 'express';
import { z } from 'zod';
import { METRICAS } from '../services/metricas/registro.js';
import { CALCULADORES, agruparPorDimensao, serieTemporal } from '../services/metricas/calculo.js';
import { CONSULTAS, carregarTecnicos, carregarEmpresa } from '../services/metricas/consulta.js';
import {
  autorizarAgregado, autorizarDrilldown, compararValores, metricaPorId,
  montarResposta, permitidos, redigirRegistros, servivel, validarPedido
} from '../services/metricas/exposicao.js';
import { construirFiltroPeriodo, construirFiltroPeriodoAnterior } from '../services/periodo.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

const router = Router();

const consultaSchema = z.object({
  periodo: z.enum(['hoje', 'semana', 'mes', 'personalizado']).optional(),
  granularidade: z.string().optional(),
  inicio: z.string().optional(),
  fim: z.string().optional(),
  dimensao: z.string().optional(),
  comparar: z.enum(['true', 'false']).optional()
});

/** Catálogo do que existe e do que quem pede consegue ver. Não serve número nenhum. */
router.get('/metricas', (req, res) => {
  const catalogo = METRICAS.map((m) => {
    const auth = autorizarAgregado(req.user, m);
    return {
      metricId: m.metricId,
      name: m.name,
      familia: m.familia,
      servivel: servivel(m.metricId),
      autorizado: auth.autorizado,
      scope: auth.autorizado ? auth.escopo : null,
      dimensoes: permitidos(m).dimensoes
    };
  });
  res.json({ metricas: catalogo });
});

router.get('/metricas/:metricId', async (req, res) => {
  try {
    const metrica = metricaPorId(req.params.metricId);
    /* Métrica inexistente e métrica sem cálculo dão 404 as duas, mas com corpo distinto: a
       segunda existe no contrato e ainda não é servível, e esconder isso faria o consumidor
       tratar "ainda não implementada" como "não existe". */
    if (!metrica) return res.status(404).json({ erro: 'Métrica desconhecida' });
    if (!servivel(metrica.metricId)) {
      return res.status(404).json({
        erro: 'Métrica declarada e ainda não servível',
        status: 'NOT_APPLICABLE',
        metricId: metrica.metricId
      });
    }

    const auth = autorizarAgregado(req.user, metrica);
    if (!auth.autorizado) return res.status(403).json({ erro: 'Sem permissão para esta métrica' });

    const parsed = consultaSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ erro: 'Parâmetros inválidos' });

    const problemas = validarPedido(metrica, { ...parsed.data, ...req.query });
    if (problemas.length) return res.status(400).json({ erro: 'Pedido rejeitado', problemas });

    const { periodo = 'mes', inicio, fim, comparar } = parsed.data;
    const janela = construirFiltroPeriodo(periodo, inicio, fim);

    const linhas = await CONSULTAS[metrica.metricId].carregar(req.db, janela);
    const extra = await contextoExtra(metrica.metricId, req, auth);
    const resultado = CALCULADORES[metrica.metricId].calcular(recorte(linhas, auth), janela, extra);

    let comparacao = null;
    if (comparar === 'true') {
      const anterior = construirFiltroPeriodoAnterior(janela);
      const linhasAnteriores = await CONSULTAS[metrica.metricId].carregar(req.db, anterior);
      const antes = CALCULADORES[metrica.metricId].calcular(recorte(linhasAnteriores, auth), anterior, extra);
      comparacao = compararValores(
        typeof resultado.valor === 'number' ? resultado.valor : null,
        typeof antes.valor === 'number' ? antes.valor : null
      );
    }

    /* O agrupamento acontece de fato quando pedido. Antes o parâmetro era validado e ignorado, e a
       resposta trazia o total: o cliente pedia recorte por técnico, recebia o número da empresa e
       não tinha como perceber. */
    const { dimensao } = parsed.data;
    const breakdown = dimensao
      ? agruparPorDimensao(metrica.metricId, recorte(linhas, auth), janela, dimensao,
        await contextoDeRotulo(dimensao, req, auth, extra))
      : null;

    res.json({
      ...montarResposta({
        metrica,
        resultado,
        janela,
        escopo: auth.escopo,
        comparacao,
        podeDrilldown: autorizarDrilldown(req.user, metrica).autorizado
      }),
      breakdown
    });
  } catch (erro) {
    logger.error('Erro GET /metricas/:metricId', { erro: erro.message });
    /* `UNAVAILABLE` — falha de consulta NUNCA se disfarça de dado insuficiente. */
    res.status(500).json({ erro: 'Erro ao calcular métrica', status: 'UNAVAILABLE' });
  }
});

/**
 * Série temporal — a Timeline do Hub.
 *
 * A granularidade vem do CONTRATO, não do cliente: `servicos-concluidos` declara `dia`, então
 * `semana` e `mes` reprovam com 400 até existirem no contrato. Aceitar granularidade não declarada
 * seria a camada HTTP decidindo semântica temporal, que é o que `timeSemantics` fixa.
 */
router.get('/metricas/:metricId/serie', async (req, res) => {
  try {
    const metrica = metricaPorId(req.params.metricId);
    if (!metrica || !servivel(metrica.metricId)) return res.status(404).json({ erro: 'Métrica desconhecida' });

    const auth = autorizarAgregado(req.user, metrica);
    if (!auth.autorizado) return res.status(403).json({ erro: 'Sem permissão para esta métrica' });

    const parsed = consultaSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ erro: 'Parâmetros inválidos' });

    const granularidade = parsed.data.granularidade ?? 'dia';
    const problemas = validarPedido(metrica, { ...parsed.data, granularidade });
    if (problemas.length) return res.status(400).json({ erro: 'Pedido rejeitado', problemas });

    const { periodo = 'mes', inicio, fim } = parsed.data;
    const janela = construirFiltroPeriodo(periodo, inicio, fim);
    const linhas = await CONSULTAS[metrica.metricId].carregar(req.db, janela);
    const extra = await contextoExtra(metrica.metricId, req, auth);
    const serie = serieTemporal(metrica.metricId, recorte(linhas, auth), janela, { extra });

    res.json({
      metricId: metrica.metricId,
      window: { inicio: janela.gte.toISOString(), fim: janela.lte.toISOString() },
      scope: auth.escopo,
      timeSemantics: metrica.timeSemantics,
      ...serie
    });
  } catch (erro) {
    logger.error('Erro GET /metricas/:metricId/serie', { erro: erro.message });
    res.status(500).json({ erro: 'Erro ao montar série', status: 'UNAVAILABLE' });
  }
});

/**
 * Registros por trás do número.
 *
 * O contrato que dá sentido a isto: os MESMOS filtros do agregado. Um drilldown que reinterpreta a
 * métrica devolve uma lista que não soma o número exibido, e aí ou o total mente ou a lista mente —
 * o usuário não tem como saber qual.
 *
 * Implementado em `servicos-concluidos` como fatia vertical. As demais respondem 501 declarando
 * que o contrato existe e a implementação não: silenciar com 404 faria "não implementei" parecer
 * "não existe".
 */
router.get('/metricas/:metricId/registros', async (req, res) => {
  try {
    const metrica = metricaPorId(req.params.metricId);
    if (!metrica || !servivel(metrica.metricId)) return res.status(404).json({ erro: 'Métrica desconhecida' });

    const auth = autorizarDrilldown(req.user, metrica);
    if (!auth.autorizado) return res.status(403).json({ erro: 'Sem permissão para os registros desta métrica' });

    /* Genérico: o registro decide, não um `if` por métrica. Sem predicado de elegibilidade não há
       como garantir que a lista corresponde ao total, e prefiro dizer isso a servir uma lista que
       pode divergir do número. */
    const calc = CALCULADORES[metrica.metricId];
    if (typeof calc?.elegiveis !== 'function') {
      return res.status(501).json({
        erro: 'Drilldown declarado no contrato e ainda não implementado para esta métrica',
        contrato: metrica.drilldown
      });
    }

    const parsed = consultaSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ erro: 'Parâmetros inválidos' });
    const { periodo = 'mes', inicio, fim } = parsed.data;
    const janela = construirFiltroPeriodo(periodo, inicio, fim);

    const linhas = await CONSULTAS[metrica.metricId].carregar(req.db, janela);
    /* O MESMO predicado que o cálculo usa — não uma cópia dele. Antes este filtro era
       `status === 'ativo'` escrito à mão, o que serve a `servicos-concluidos` e estaria errado em
       `faturamento-liquido`, cuja regra de qualidade também descarta valor inválido: a lista
       mostraria registros que o total não somou. */
    /* Sem recorte PROPRIO aqui: `autorizarDrilldown` já exige a permissão de módulo, que é de
       escopo de empresa. Um usuário auto-escopado nem chega a esta linha. */
    const registros = calc.elegiveis(linhas, janela);

    /* Paginação NÃO muda `total`: o total é a contagem do agregado, e uma página menor não
       significa menos registros. Confundir os dois faria o drilldown contradizer o número. */
    const limite = Math.min(Number(req.query.limite) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const pagina = registros.slice(offset, offset + limite);

    res.json({
      metricId: metrica.metricId,
      window: { inicio: janela.gte.toISOString(), fim: janela.lte.toISOString() },
      total: registros.length,
      paginacao: { limite, offset, nestaPagina: pagina.length },
      /* Redação no SERVIDOR, dirigida pela `fieldPolicy` do registro. Mandar o campo e pedir que a
         UI esconda seria segurança por acordo de cavalheiros. */
      ...redigirRegistros(metrica, pagina.map((s) => ({
        id: s.id, tecnicoId: s.tecnicoId, local: s.local, criadoEm: s.criadoEm,
        valorCobrado: s.valorCobrado, valorMaterial: s.valorMaterial,
        valorLiquido: s.valorLiquido, comissaoGerada: s.comissaoGerada
      })), req.user),
      lineage: { formula: metrica.formula, appliedFilters: metrica.filters }
    });
  } catch (erro) {
    logger.error('Erro GET /metricas/:metricId/registros', { erro: erro.message });
    res.status(500).json({ erro: 'Erro ao listar registros', status: 'UNAVAILABLE' });
  }
});

/**
 * Recorte por escopo. `EMPRESA` vê tudo do tenant; `PROPRIO` vê só as próprias linhas.
 * O recorte acontece DEPOIS da consulta escopada por tenant — nunca no lugar dela.
 */
function recorte(linhas, auth) {
  if (auth.escopo !== 'PROPRIO') return linhas;
  return linhas.filter((l) => l.tecnicoId === auth.tecnicoId);
}

/**
 * Contexto usado para RESOLVER RÓTULO no breakdown — e que precisa respeitar o mesmo escopo das
 * linhas.
 *
 * `SECURITY_SCOPE_APPLIES_TO_FULL_CALCULATION_CONTEXT`: recortar as linhas e deixar o contexto
 * inteiro foi exatamente o defeito de `producao-por-tecnico`, onde o zero explícito virou
 * enumeração nominal da equipe. Aqui a lista de técnicos que resolve nome é recortada junto, e o
 * agrupador descarta grupo sem rótulo — então nem o nome nem o id de outro técnico chegam a um
 * usuário auto-escopado.
 */
async function contextoDeRotulo(dimensao, req, auth, extra) {
  /* Só a dimensão `tecnico` precisa resolver nome; carregar a lista para `local` ou `dia` seria
     consulta paga por nada. */
  if (dimensao !== 'tecnico') return { extra };
  const todos = Array.isArray(extra) ? extra : await carregarTecnicos(req.db);
  return {
    tecnicos: auth.escopo === 'PROPRIO' ? todos.filter((t) => t.id === auth.tecnicoId) : todos,
    extra
  };
}

/**
 * Contexto que algumas métricas exigem além das linhas — e que também precisa respeitar o escopo.
 *
 * O DEFEITO QUE ISTO CORRIGE, encontrado pelo teste de escopo PROPRIO
 *   `producao-por-tecnico` monta uma linha por técnico da empresa, com ZERO EXPLÍCITO para quem não
 *   produziu — de propósito: para o dono, "não produziu" e "não existe" são coisas diferentes.
 *   Só que o contexto vinha completo mesmo no escopo PROPRIO, e o zero explícito virava
 *   ENUMERAÇÃO DE COLEGAS: o funcionário recebia nome e id de toda a equipe num endpoint de
 *   métrica, sem valor nenhum, mas com a lista.
 *
 *   Recortar apenas as LINHAS não bastava — o vazamento estava no contexto. É o lembrete de que
 *   escopo precisa alcançar todo argumento do cálculo, não só o principal.
 */
async function contextoExtra(metricId, req, auth) {
  if (metricId === 'producao-por-tecnico') {
    const tecnicos = await carregarTecnicos(req.db);
    return auth.escopo === 'PROPRIO' ? tecnicos.filter((t) => t.id === auth.tecnicoId) : tecnicos;
  }
  if (metricId === 'taxa-aprovacao') return carregarEmpresa(prisma, req.user.empresaId);
  return {};
}

export default router;
