/**
 * A coreografia compartilhada dos Metric Hubs.
 *
 * O QUE DUAS VERTICAIS PROVARAM COMPARTILHADO
 *   Não o layout — a SEQUÊNCIA. Agregado e série no load, breakdown quando o usuário escolhe uma
 *   dimensão, registros quando ele pede, e o mapeamento de falha para `FORBIDDEN`/`UNAVAILABLE`.
 *   Isso é idêntico em `servicos-concluidos` e em `faturamento-liquido`, e seria idêntico nos seis
 *   Hubs seguintes.
 *
 * O QUE NÃO ENTRA AQUI
 *   Formatação (contagem vs moeda), a ressalva de escopo de custo, e as colunas do drilldown —
 *   isso é de cada métrica. Empurrar essas diferenças para dentro do hook produziria o
 *   `<UniversalMetricComponent config={300Campos} />` que deixa todo Hub ilegível.
 *
 *   `shared analytical primitives + metric-specific composition`. O hook é a primitiva; a
 *   composição fica na página.
 *
 * CUSTO MEDIDO
 *   Duas requisições no load. A terceira só se o usuário abrir um recorte; a quarta só se ele
 *   pedir os registros. Nada de buscar o que ninguém olhou.
 */

import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api.js';

/** 403 é FORBIDDEN; o resto é falha de medição, e as duas coisas não se confundem. */
function estadoDoErro(erro) {
  return erro?.response?.status === 403 ? 'FORBIDDEN' : 'UNAVAILABLE';
}

export function useMetricHub(metricId) {
  const [periodo, setPeriodo] = useState('mes');
  const [estado, setEstado] = useState('LOADING');
  const [metrica, setMetrica] = useState(null);
  const [serie, setSerie] = useState(null);

  const [dimensao, setDimensao] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [carregandoBreakdown, setCarregandoBreakdown] = useState(false);

  const [mostrarRegistros, setMostrarRegistros] = useState(false);
  const [registros, setRegistros] = useState(null);
  const [carregandoRegistros, setCarregandoRegistros] = useState(false);
  const [erroRegistros, setErroRegistros] = useState(false);

  const carregar = useCallback(async () => {
    setEstado('LOADING');
    setBreakdown(null);
    setDimensao(null);
    setRegistros(null);
    setMostrarRegistros(false);
    try {
      const [agregado, linha] = await Promise.all([
        api.get(`/metricas/${metricId}`, { params: { periodo, comparar: 'true' } }),
        api.get(`/metricas/${metricId}/serie`, { params: { periodo, granularidade: 'dia' } }),
      ]);
      setMetrica(agregado.data);
      setSerie(linha.data);
      /* O estado vem do CONTRATO. `VALUE` com zero é zero de verdade; `INSUFFICIENT_DATA` é outra
         coisa, e nunca vira zero pelo caminho. */
      setEstado(
        agregado.data.value === 0 && agregado.data.status === 'VALUE'
          ? 'EMPTY'
          : agregado.data.status
      );
    } catch (erro) {
      setEstado(estadoDoErro(erro));
    }
  }, [metricId, periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const trocarDimensao = useCallback(
    async (nova) => {
      setDimensao(nova);
      if (!nova) {
        setBreakdown(null);
        return;
      }
      setCarregandoBreakdown(true);
      try {
        const { data } = await api.get(`/metricas/${metricId}`, {
          params: { periodo, dimensao: nova },
        });
        setBreakdown(data.breakdown);
      } catch {
        setBreakdown({ grupos: [] });
      } finally {
        setCarregandoBreakdown(false);
      }
    },
    [metricId, periodo]
  );

  const abrirRegistros = useCallback(async () => {
    setMostrarRegistros(true);
    if (registros) return;
    setCarregandoRegistros(true);
    setErroRegistros(false);
    try {
      const { data } = await api.get(`/metricas/${metricId}/registros`, { params: { periodo } });
      setRegistros(data);
    } catch {
      setErroRegistros(true);
    } finally {
      setCarregandoRegistros(false);
    }
  }, [metricId, periodo, registros]);

  const janelaTexto = metrica?.window?.inicio
    ? `${new Date(metrica.window.inicio).toLocaleDateString('pt-BR')} – ${new Date(metrica.window.fim).toLocaleDateString('pt-BR')}`
    : '';

  return {
    periodo,
    setPeriodo,
    estado,
    metrica,
    serie,
    janelaTexto,
    recarregar: carregar,
    dimensao,
    breakdown,
    carregandoBreakdown,
    trocarDimensao,
    mostrarRegistros,
    registros,
    carregandoRegistros,
    erroRegistros,
    abrirRegistros,
  };
}
