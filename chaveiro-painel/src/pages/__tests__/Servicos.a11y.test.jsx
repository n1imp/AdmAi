import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Servicos from '../Servicos.jsx';
import api from '../../lib/api.js';

vi.mock('../../lib/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  formatarMoeda: (v) =>
    'R$ ' +
    Number(v ?? 0)
      .toFixed(2)
      .replace('.', ','),
  formatarData: () => '28/08/2026 12:00',
}));
vi.mock('../../components/Toast.jsx', () => ({ useToast: () => vi.fn() }));
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ pode: () => true }) }));

/** A11y estrutural do MASTER_DETAIL (DECISOR §i + MS Learn/OutSystems ADOPTED):
 *  regiões NOMEADAS (não dialog), foco MOVE ao título do detalhe ao selecionar, back interno
 *  devolve o foco à lista. O axe complementa em suite própria. */
const UM = {
  id: 5,
  descricao: 'Chave codificada',
  local: 'Oficina',
  status: 'pendente',
  valorCobrado: 260,
  tecnico: { id: 3, nome: 'Anderson' },
  criadoEm: '2026-08-28T10:00:00Z',
};

function montar(rota = '/servicos') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Servicos />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url) =>
    url === '/servicos/5'
      ? Promise.resolve({ data: UM })
      : Promise.resolve({ data: { data: [UM], total: 1, nextCursor: null } })
  );
});

describe('Servicos — a11y do master-detail', () => {
  it('SPLIT (xl+): regiões nomeadas "Lista de serviços" e "Detalhes do serviço" coexistem (sem dialog)', async () => {
    // jsdom não tem matchMedia: stub de viewport largo para a composição split renderizar.
    vi.stubGlobal('matchMedia', (q) => ({
      matches: true,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    try {
      montar('/servicos?servico=5');
      await screen.findAllByText('Chave codificada');
      expect(screen.getByRole('region', { name: 'Lista de serviços' })).toBeTruthy();
      expect(screen.getAllByLabelText('Detalhes do serviço').length).toBeGreaterThan(0);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('route-like (mobile): detalhe selecionado é a ÚNICA composição (lista não duplica no DOM)', async () => {
    montar('/servicos?servico=5');
    await screen.findByLabelText('Detalhes do serviço');
    expect(screen.queryByRole('region', { name: 'Lista de serviços' })).toBeNull();
    expect(screen.getAllByText('Chave codificada').length).toBe(1);
  });

  it('selecionar move o foco ao título do detalhe (h2 tabIndex=-1)', async () => {
    montar();
    fireEvent.click(await screen.findByText('Chave codificada'));
    await waitFor(() => {
      const foco = document.activeElement;
      expect(foco?.tagName).toBe('H2');
      expect(foco?.textContent).toBe('Chave codificada');
    });
  });

  it('back interno remove a seleção e devolve o foco ao título da lista', async () => {
    montar('/servicos?servico=5');
    const voltar = await screen.findByRole('button', { name: /Voltar para serviços/ });
    fireEvent.click(voltar);
    await waitFor(() => {
      const foco = document.activeElement;
      expect(foco?.tagName).toBe('H1');
      expect(foco?.textContent).toBe('Serviços');
    });
  });

  it('linhas são botões alcançáveis por teclado com nome acessível', async () => {
    montar();
    await screen.findByText('Chave codificada');
    const linha = screen
      .getAllByRole('button')
      .find((b) => b.textContent.includes('Chave codificada'));
    expect(linha).toBeTruthy();
    linha.focus();
    expect(document.activeElement).toBe(linha);
  });
});
