/**
 * Metric Hub — comportamento, não pixel.
 *
 * O QUE ESTES TESTES PROVAM
 *   Que a página APRESENTA o contrato em vez de reinterpretá-lo. O risco desta camada não é errar
 *   a conta — a conta vem pronta e verificada. O risco é a interface contradizer o contrato:
 *   transformar `INSUFFICIENT_DATA` em zero, mostrar o botão de registros para quem não pode,
 *   exibir uma coluna que o backend omitiu por permissão, ou inventar direção de variação sem base.
 *
 *   Cada um desses seria uma mentira que o usuário não teria como detectar — e nenhum aparece
 *   como bug de cálculo, porque o cálculo está certo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MetricHub from '../MetricHub.jsx';
import api from '../../lib/api.js';

vi.mock('../../lib/api.js', async () => {
  const actual = await vi.importActual('../../lib/api.js');
  return { ...actual, default: { get: vi.fn() }, formatarMoeda: (v) => `R$ ${v}` };
});

const AGREGADO = {
  metricId: 'servicos-concluidos',
  name: 'Serviços concluídos',
  version: '1.0.0',
  window: { inicio: '2026-04-01T00:00:00.000Z', fim: '2026-04-30T23:59:59.000Z' },
  scope: 'EMPRESA',
  status: 'VALUE',
  value: 142,
  reason: null,
  comparison: { valorAnterior: 126, variacaoAbsoluta: 16, variacaoPercentual: 12.7, direcao: 'SUBIU' },
  quality: { state: 'HIGH', recordCount: 142, incomplete: null, warnings: [] },
  lineage: {
    formula: 'COUNT(Servico) WHERE status = "ativo"',
    grain: 'empresa × período',
    sourceEntities: ['Servico'],
    appliedFilters: ['status = ativo'],
    timeSemantics: 'criadoEm'
  },
  permissions: { canDrillDown: true },
  allowed: { dimensoes: ['tecnico', 'local', 'dia'], comparacoes: [], periodos: [], granularidades: ['dia'] },
  breakdown: null
};

const SERIE = {
  metricId: 'servicos-concluidos',
  granularidade: 'dia',
  timeSemantics: 'criadoEm',
  pontos: [{ dia: '2026-04-01', valor: 3 }, { dia: '2026-04-02', valor: 0 }]
};

function responder({ agregado = AGREGADO, serie = SERIE } = {}) {
  api.get.mockImplementation((url, cfg) => {
    if (url.endsWith('/serie')) return Promise.resolve({ data: serie });
    if (url.endsWith('/registros')) {
      return Promise.resolve({
        data: {
          total: 142,
          paginacao: { limite: 100, offset: 0, nestaPagina: 2 },
          camposOmitidos: [],
          registros: [
            { id: 1, tecnicoId: 1, local: 'Centro', criadoEm: '2026-04-02T10:00:00Z', valorLiquido: 100 },
            { id: 2, tecnicoId: 2, local: 'Norte', criadoEm: '2026-04-03T10:00:00Z', valorLiquido: 200 }
          ]
        }
      });
    }
    if (cfg?.params?.dimensao) {
      return Promise.resolve({
        data: { ...agregado, breakdown: { dimensao: cfg.params.dimensao, grupos: [{ chave: '1', rotulo: 'Ana', valor: 80 }] } }
      });
    }
    return Promise.resolve({ data: agregado });
  });
}

const montar = () => render(<MemoryRouter><MetricHub /></MemoryRouter>);

/* O valor aparece no Hero E no Pulso — de propósito. A consulta precisa dizer QUAL. */
const esperarHero = async () =>
  within(await screen.findByRole('region', { name: /Serviços concluídos no período/ })).getByText('142');

beforeEach(() => { vi.clearAllMocks(); });

describe('Metric Hub — servicos-concluidos', () => {
  it('apresenta o valor, a variação e a confiança que vieram do contrato', async () => {
    responder();
    montar();
    expect(await esperarHero()).toBeInTheDocument();
    expect(screen.getByText(/12\.7% de aumento/)).toBeInTheDocument();
    expect(screen.getAllByText(/Confiança Alta/).length).toBeGreaterThan(0);
  });

  it('carrega o Hub com DUAS requisições — agregado e série, nada além', async () => {
    responder();
    montar();
    await esperarHero();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  /* A regra que atravessa a Foundation inteira, até o pixel. */
  it('INSUFFICIENT_DATA não vira zero, e mostra o motivo', async () => {
    responder({
      agregado: { ...AGREGADO, status: 'INSUFFICIENT_DATA', value: null, reason: 'nenhum serviço no fluxo' }
    });
    montar();
    expect(await screen.findByText(/Dados insuficientes para medir/)).toBeInTheDocument();
    expect(screen.getByText(/nenhum serviço no fluxo/)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('sem base de comparação não inventa direção', async () => {
    responder({
      agregado: {
        ...AGREGADO,
        comparison: { valorAnterior: 0, variacaoAbsoluta: 142, variacaoPercentual: null, direcao: 'SEM_BASE' }
      }
    });
    montar();
    expect(await screen.findByText(/Sem base de comparação/)).toBeInTheDocument();
  });

  it('falha de rede vira estado de erro, não "sem dados"', async () => {
    api.get.mockRejectedValue(new Error('rede'));
    montar();
    expect(await screen.findByText(/Não foi possível calcular agora/)).toBeInTheDocument();
    expect(screen.getByText(/falha ao buscar o dado, não ausência de dado/)).toBeInTheDocument();
  });

  it('403 vira FORBIDDEN e não erro genérico', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    montar();
    expect(await screen.findByText(/Sem acesso a esta métrica/)).toBeInTheDocument();
  });

  /* A UI reflete a permissão; o backend continua sendo quem impõe. */
  it('sem canDrillDown, o acesso aos registros não é oferecido como disponível', async () => {
    responder({ agregado: { ...AGREGADO, permissions: { canDrillDown: false } } });
    montar();
    await esperarHero();
    expect(screen.getByRole('button', { name: /Ver os 142 registros/ })).toBeDisabled();
    expect(screen.getByText(/permissões diferentes/)).toBeInTheDocument();
  });

  it('o total do drilldown é o do backend, não o tamanho da página', async () => {
    responder();
    montar();
    await esperarHero();
    await userEvent.click(screen.getByRole('button', { name: /Ver os 142 registros/ }));
    /* 2 registros nesta página, 142 no conjunto: exibir 2 contradiria o herói. */
    expect(await screen.findByText(/142/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/exibindo 1–2/)).toBeInTheDocument();
  });

  /* Este Hub declara apenas Data e Local — o valor não faz parte da pergunta "quantos serviços".
     A redação de campo continua acontecendo no servidor (provada na bateria de exposição); aqui o
     que se prova é que a tabela renderiza só as colunas que a métrica declarou. */
  it('renderiza apenas as colunas que esta métrica declara', async () => {
    responder();
    montar();
    await esperarHero();
    await userEvent.click(screen.getByRole('button', { name: /Ver os 142 registros/ }));
    expect(await screen.findByRole('columnheader', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Local' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Comissão' })).not.toBeInTheDocument();
  });

  it('breakdown só é buscado quando o usuário escolhe a dimensão', async () => {
    responder();
    montar();
    await esperarHero();
    expect(api.get).toHaveBeenCalledTimes(2);

    await userEvent.click(screen.getByRole('button', { name: 'tecnico' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Ana')).toBeInTheDocument();
  });

  /* As dimensões vêm do contrato: uma lista escrita no frontend divergiria do registro. */
  it('as dimensões oferecidas são as que o contrato declarou', async () => {
    responder({ agregado: { ...AGREGADO, allowed: { ...AGREGADO.allowed, dimensoes: ['local'] } } });
    montar();
    await esperarHero();
    expect(screen.getByRole('button', { name: 'local' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'tecnico' })).not.toBeInTheDocument();
  });

  it('a série tem alternativa textual — o gráfico não é a única representação', async () => {
    responder();
    montar();
    await esperarHero();
    expect(screen.getByText(/Ver os valores da série em tabela/)).toBeInTheDocument();
    expect(screen.getByText('2026-04-01')).toBeInTheDocument();
  });

  it('a procedência do número está visível', async () => {
    responder();
    montar();
    await esperarHero();
    expect(screen.getByText(/COMO ESTE NÚMERO FOI CALCULADO/)).toBeInTheDocument();
    expect(screen.getByText('COUNT(Servico) WHERE status = "ativo"')).toBeInTheDocument();
    expect(screen.getByText('servicos-concluidos · v1.0.0')).toBeInTheDocument();
  });
});
