import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

const auth = { pode: () => true };
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => auth }));

const SERVICOS = [
  {
    id: 1,
    descricao: 'Troca de segredo',
    local: 'Oficina',
    status: 'pendente',
    valorCobrado: 380,
    tecnico: { id: 9, nome: 'Bruno' },
    criadoEm: '2026-08-28T12:00:00Z',
  },
  {
    id: 2,
    descricao: 'Abertura residencial',
    local: 'Casa do cliente',
    status: 'ativo',
    valorCobrado: 120,
    tecnico: { id: 8, nome: 'Anderson' },
    criadoEm: '2026-08-27T12:00:00Z',
  },
];

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
  auth.pode = () => true;
  api.get.mockImplementation((url) => {
    if (url.startsWith('/servicos/') && !url.includes('?')) {
      const id = Number(url.split('/')[2]);
      const achado = SERVICOS.find((s) => s.id === id);
      return achado
        ? Promise.resolve({ data: achado })
        : Promise.resolve({
            data: {
              id,
              descricao: 'Fora da página',
              local: 'X',
              status: 'rejeitado',
              valorCobrado: 45,
              tecnico: null,
              criadoEm: '2026-08-01T09:00:00Z',
            },
          });
    }
    return Promise.resolve({ data: { data: SERVICOS, total: 2, nextCursor: 'CUR2' } });
  });
});

describe('Servicos — keyset preservado (invariante da superfície anterior)', () => {
  it('carga inicial vai SEM cursor e "Carregar mais" envia o nextCursor da resposta', async () => {
    montar();
    await screen.findByText('Troca de segredo');
    expect(api.get.mock.calls[0][0]).toBe('/servicos');
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
    await waitFor(() =>
      expect(api.get.mock.calls.some(([u]) => u.includes('cursor=CUR2'))).toBe(true)
    );
  });
});

describe('estados completos (§26) — sem flash-of-empty', () => {
  it('durante o loading NUNCA mostra "0 registros" nem vazio', async () => {
    let resolver;
    api.get.mockImplementation(() => new Promise((r) => (resolver = r)));
    montar();
    expect(screen.queryByText(/0 registros/)).toBeNull();
    expect(screen.queryByText(/Nenhum serviço/)).toBeNull();
    expect(screen.getByText('Carregando…')).toBeTruthy();
    resolver({ data: { data: [], total: 0, nextCursor: null } });
    await screen.findByText('Nenhum serviço encontrado');
  });

  it('erro de rede → estado recuperável; Tentar novamente refaz e recupera', async () => {
    api.get.mockRejectedValueOnce(new Error('net'));
    montar();
    await screen.findByText('Não foi possível carregar os serviços.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByText('Troca de segredo');
  });

  it('vazio SEM filtro oferece CTA quando pode criar; SEM permissão o CTA não existe', async () => {
    api.get.mockResolvedValue({ data: { data: [], total: 0, nextCursor: null } });
    auth.pode = (m, a) => !(m === 'servicos' && a === 'criar');
    montar();
    await screen.findByText('Nenhum serviço encontrado');
    expect(screen.queryByRole('button', { name: /Registrar serviço/ })).toBeNull();
  });
});

describe('seleção canônica ?servico= (DECISOR §i)', () => {
  it('clicar numa linha abre o detalhe (query própria carrega o serviço)', async () => {
    montar();
    fireEvent.click(await screen.findByText('Troca de segredo'));
    // split (xl) + route-like coexistem no DOM de teste; o detail busca por id próprio
    await waitFor(() => expect(api.get.mock.calls.some(([u]) => u === '/servicos/1')).toBe(true));
    expect(await screen.findAllByText('Aguardando aprovação')).toBeTruthy();
  });

  it('deep-link para serviço FORA da página carregada resolve pelo GET /servicos/:id', async () => {
    montar('/servicos?servico=77');
    await waitFor(() => expect(api.get.mock.calls.some(([u]) => u === '/servicos/77')).toBe(true));
    await screen.findByText('Fora da página');
  });
});
