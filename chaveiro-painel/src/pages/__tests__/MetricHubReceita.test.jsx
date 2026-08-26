/**
 * Metric Hub #2 — Receita líquida.
 *
 * O QUE ESTES TESTES PROVAM, E QUE O HUB #1 NÃO PROVOU
 *   Segurança por CAMPO chegando até o pixel. O backend redige `comissaoGerada` para quem não tem
 *   `tecnicos.ver`, e a interface precisa fazer duas coisas com isso: não renderizar a coluna, e
 *   DIZER que ela foi omitida. Renderizar célula vazia seria pior que não mostrar — o usuário
 *   leria zero onde há dado que ele não pode ver.
 *
 *   E a ressalva de escopo de custo: sem ela, um Hub financeiro convida a ler lucro num número que
 *   não desconta comissão, imposto nem aluguel. É a asserção mais importante deste arquivo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import MetricHubReceita from '../MetricHubReceita.jsx';
import api from '../../lib/api.js';

vi.mock('../../lib/api.js', async () => {
  const actual = await vi.importActual('../../lib/api.js');
  return {
    ...actual,
    default: { get: vi.fn() },
    formatarMoeda: (v) => `R$ ${Number(v ?? 0).toFixed(2)}`,
  };
});

const AGREGADO = {
  metricId: 'faturamento-liquido',
  name: 'Receita líquida',
  version: '1.0.0',
  window: { inicio: '2026-04-01T00:00:00.000Z', fim: '2026-04-30T23:59:59.000Z' },
  scope: 'EMPRESA',
  status: 'VALUE',
  value: 12400,
  reason: null,
  comparison: {
    valorAnterior: 11000,
    variacaoAbsoluta: 1400,
    variacaoPercentual: 12.7,
    direcao: 'SUBIU',
  },
  quality: { state: 'HIGH', recordCount: 42, incomplete: null, warnings: [] },
  lineage: {
    formula: 'SUM(Servico.valorLiquido)',
    grain: 'empresa × período',
    sourceEntities: ['Servico'],
    appliedFilters: ['status = ativo'],
    timeSemantics: 'criadoEm',
  },
  permissions: { canDrillDown: true },
  allowed: {
    dimensoes: ['tecnico', 'local', 'dia'],
    comparacoes: [],
    periodos: [],
    granularidades: ['dia'],
  },
  breakdown: null,
};

const SERIE = {
  granularidade: 'dia',
  timeSemantics: 'criadoEm',
  pontos: [{ dia: '2026-04-01', valor: 300 }],
};

const REGISTRO_COMPLETO = {
  id: 1,
  tecnicoId: 2,
  local: 'Centro',
  criadoEm: '2026-04-02T10:00:00Z',
  valorCobrado: 300,
  valorMaterial: 100,
  valorLiquido: 200,
  comissaoGerada: 24,
};

const PAGINA_COMPLETA = {
  total: 42,
  paginacao: { limite: 100, offset: 0, nestaPagina: 1 },
  camposOmitidos: [],
  registros: [REGISTRO_COMPLETO],
};

function responder({ agregado = AGREGADO, registros = PAGINA_COMPLETA } = {}) {
  api.get.mockImplementation((url) => {
    if (url.endsWith('/serie')) return Promise.resolve({ data: SERIE });
    if (url.endsWith('/registros')) return Promise.resolve({ data: registros });
    return Promise.resolve({ data: agregado });
  });
}

const montar = () =>
  render(
    <MemoryRouter>
      <MetricHubReceita />
    </MemoryRouter>
  );

const heroi = async () =>
  within(await screen.findByRole('region', { name: /Receita líquida no período/ })).getByText(
    'R$ 12400.00'
  );

const abrirRegistros = () =>
  userEvent.click(screen.getByRole('button', { name: /Ver os serviços que compõem/ }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Metric Hub — receita líquida', () => {
  it('apresenta o valor em moeda, com variação e confiança do contrato', async () => {
    responder();
    montar();
    expect(await heroi()).toBeInTheDocument();
    expect(screen.getByText(/12\.7% de aumento/)).toBeInTheDocument();
  });

  /* A asserção que impede o Hub de mentir por omissão. */
  it('mostra a ressalva de escopo de custo junto do número', async () => {
    responder();
    montar();
    await heroi();
    const ressalva = screen.getAllByText(/Considera apenas custos de material/);
    expect(ressalva.length).toBeGreaterThan(0);
    expect(ressalva[0].textContent).toMatch(/Não inclui comissão, impostos nem despesas fixas/);
  });

  it('com permissão completa, a decomposição financeira aparece', async () => {
    responder();
    montar();
    await heroi();
    await abrirRegistros();
    expect(await screen.findByRole('columnheader', { name: 'Cobrado' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Material' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Líquido' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Comissão' })).toBeInTheDocument();
    expect(screen.getByText('R$ 24.00')).toBeInTheDocument();
  });

  /**
   * O caso que justifica a vertical: o backend não mandou `comissaoGerada`. A coluna não pode
   * existir, e a omissão precisa ser dita — "não há valor" e "você não pode ver" são coisas
   * diferentes, e só a segunda tem solução.
   */
  it('campo redigido pelo backend não vira coluna, e a omissão é declarada', async () => {
    const semComissao = { ...REGISTRO_COMPLETO };
    delete semComissao.comissaoGerada;
    responder({
      registros: {
        ...PAGINA_COMPLETA,
        camposOmitidos: ['comissaoGerada'],
        registros: [semComissao],
      },
    });
    montar();
    await heroi();
    await abrirRegistros();

    expect(await screen.findByRole('columnheader', { name: 'Líquido' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Comissão' })).not.toBeInTheDocument();
    expect(screen.getByText(/Coluna "Comissão" omitida/)).toBeInTheDocument();
    /* E o valor não pode ter sobrevivido em lugar nenhum da tela. */
    expect(screen.queryByText('R$ 24.00')).not.toBeInTheDocument();
  });

  it('o total do drilldown é o do backend, não o tamanho da página', async () => {
    responder();
    montar();
    await heroi();
    await abrirRegistros();
    expect(await screen.findByText(/42/, { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/exibindo 1–1/)).toBeInTheDocument();
  });

  it('INSUFFICIENT_DATA não vira zero em moeda', async () => {
    responder({
      agregado: {
        ...AGREGADO,
        status: 'INSUFFICIENT_DATA',
        value: null,
        reason: 'sem serviço no período',
      },
    });
    montar();
    expect(await screen.findByText(/Dados insuficientes para medir/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0\.00/)).not.toBeInTheDocument();
  });

  it('403 vira FORBIDDEN, e o Hub não é oferecido como quebrado', async () => {
    api.get.mockRejectedValue({ response: { status: 403 } });
    montar();
    expect(await screen.findByText(/Sem acesso a esta métrica/)).toBeInTheDocument();
  });

  it('a procedência declara o limite da definição', async () => {
    responder();
    montar();
    await heroi();
    expect(screen.getByText('faturamento-liquido · v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Limite da definição/)).toBeInTheDocument();
  });

  it('carrega com duas requisições; o recorte só é buscado quando pedido', async () => {
    responder();
    montar();
    await heroi();
    expect(api.get).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'local' }));
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});
