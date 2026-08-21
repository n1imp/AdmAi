/**
 * Metric Hub — vertical de `servicos-concluidos`.
 *
 * A PERGUNTA QUE ESTA PÁGINA RESPONDE
 *   Quantos serviços · está subindo ou caindo · quando aconteceu · quem contribuiu · quais
 *   registros formam o número · dá para confiar · como foi calculado.
 *
 * O QUE SOBROU AQUI DEPOIS DA SEGUNDA VERTICAL
 *   Quase nada, e isso é o ponto. A coreografia foi para `useMetricHub` e a moldura para
 *   `MetricHubShell` quando um segundo Hub provou que as duas eram compartilhadas. O que fica é o
 *   que é DESTA métrica: contagem simples, sem ressalva de custo, e um drilldown de três colunas.
 *
 *   A extração veio depois da repetição, não antes dela.
 */

import { useMetricHub } from '../hooks/useMetricHub.js';
import MetricHubShell from './MetricHubShell.jsx';

const COLUNAS = [
  { campo: 'criadoEm', rotulo: 'Data', formatar: (v) => new Date(v).toLocaleDateString('pt-BR') },
  { campo: 'local', rotulo: 'Local' }
];

export default function MetricHub() {
  const hub = useMetricHub('servicos-concluidos');
  return (
    <MetricHubShell
      titulo="Serviços concluídos"
      tituloHero="Serviços concluídos no período"
      hub={hub}
      colunasDoDrilldown={COLUNAS}
      rotuloRegistros={`Ver os ${hub.metrica?.value ?? ''} registros`.replace('  ', ' ')}
      acoes={[
        { para: '/servicos', rotulo: 'Ver serviços' },
        { para: '/tecnicos', rotulo: 'Ver técnicos' }
      ]}
    />
  );
}
