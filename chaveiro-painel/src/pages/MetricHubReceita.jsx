/**
 * Metric Hub — vertical de `faturamento-liquido` (Receita líquida).
 *
 * A CAPACIDADE QUE ESTA VERTICAL PROVA
 *   Segurança por CAMPO. Ver o total da empresa e ver quanto um técnico ganhou em cada serviço são
 *   direitos distintos: o backend redige `comissaoGerada` para quem tem `financeiro.ver` sem
 *   `tecnicos.ver`, e a coluna simplesmente não chega. A UI não esconde nada — não recebe.
 *
 * A RESSALVA NÃO É ENFEITE
 *   O número é `cobrado − material`. Comissão, impostos, aluguel e combustível NÃO entram. Sem
 *   dizer isso ao lado do valor, um Hub financeiro convida o dono a ler lucro onde não há — e
 *   decidir contratação em cima disso. A frase vem do contrato (`escopoDeCusto`), não daqui.
 */

import { formatarMoeda } from '../lib/api.js';
import { useMetricHub } from '../hooks/useMetricHub.js';
import MetricHubShell from './MetricHubShell.jsx';

/**
 * As colunas que esta métrica sabe exibir. A decomposição existe para EXPLICAR o número: cobrado
 * menos material dá o líquido, e ver só o resultado esconde a conta.
 *
 * Coluna cujo campo o backend redigiu não é renderizada — `MetricDrilldown` só desenha o que
 * chegou. Não há caminho para célula vazia parecendo zero.
 */
const COLUNAS = [
  { campo: 'criadoEm', rotulo: 'Data', formatar: (v) => new Date(v).toLocaleDateString('pt-BR') },
  { campo: 'local', rotulo: 'Local' },
  { campo: 'valorCobrado', rotulo: 'Cobrado', alinharDireita: true, formatar: formatarMoeda },
  { campo: 'valorMaterial', rotulo: 'Material', alinharDireita: true, formatar: formatarMoeda },
  { campo: 'valorLiquido', rotulo: 'Líquido', alinharDireita: true, formatar: formatarMoeda },
  { campo: 'comissaoGerada', rotulo: 'Comissão', alinharDireita: true, formatar: formatarMoeda }
];

const RESSALVA =
  'Considera apenas custos de material registrados no AdmAi. Não inclui comissão, impostos nem despesas fixas.';

export default function MetricHubReceita() {
  const hub = useMetricHub('faturamento-liquido');
  return (
    <MetricHubShell
      titulo="Receita líquida"
      tituloHero="Receita líquida no período"
      hub={hub}
      formatarValor={(v) => (typeof v === 'number' ? formatarMoeda(v) : v)}
      ressalva={RESSALVA}
      colunasDoDrilldown={COLUNAS}
      rotuloRegistros="Ver os serviços que compõem"
      acoes={[
        { para: '/servicos', rotulo: 'Ver serviços do período' },
        { para: '/reparticao', rotulo: 'Ver repartição' }
      ]}
    />
  );
}
