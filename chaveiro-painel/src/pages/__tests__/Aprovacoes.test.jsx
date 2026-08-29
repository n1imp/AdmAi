import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Aprovacoes from '../Aprovacoes.jsx';
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

const FILA = [
  {
    id: 11,
    descricao: 'Troca de segredo',
    local: 'Oficina',
    status: 'pendente',
    valorCobrado: 380,
    tecnico: { id: 1, nome: 'Bruno' },
    criadoEm: '2026-08-28T10:00:00Z',
  },
  {
    id: 12,
    descricao: 'Chave codificada',
    local: 'Balcão',
    status: 'pendente',
    valorCobrado: 260,
    tecnico: { id: 2, nome: 'Anderson' },
    criadoEm: '2026-08-28T11:00:00Z',
  },
];

function montar(rota = '/aprovacoes') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <Aprovacoes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.pode = () => true;
  api.get.mockResolvedValue({ data: FILA });
  api.post.mockResolvedValue({ data: { ok: true } });
});

describe('Aprovações — fila nos patterns compartilhados (DECISOR §v)', () => {
  it('fila lista os pendentes SEM chamar GET /servicos/:id (dados da própria fila)', async () => {
    montar('/aprovacoes?servico=11');
    await screen.findAllByText('Troca de segredo');
    // detalhe alimentado por servicoDaFila — nenhuma chamada de detalhe individual
    expect(api.get.mock.calls.every(([u]) => u === '/servicos/pendentes')).toBe(true);
    expect(screen.getByLabelText('Decisão do serviço').textContent).toContain('R$ 380,00');
  });

  it('aprovar: confirmação inline → POST /aprovar → seleção limpa e foco na fila', async () => {
    montar('/aprovacoes?servico=11');
    fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, aprovar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/servicos/11/aprovar'));
    await waitFor(() => {
      expect(document.activeElement?.tagName).toBe('H1');
      expect(document.activeElement?.textContent).toBe('Aprovações');
    });
    // sem auto-seleção do próximo
    expect(screen.getByLabelText('Decisão do serviço').textContent).toContain(
      'Selecione um serviço'
    );
  });

  it('rejeitar exige confirmação e envia o endpoint correto', async () => {
    montar('/aprovacoes?servico=12');
    fireEvent.click(await screen.findByRole('button', { name: 'Rejeitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, rejeitar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/servicos/12/rejeitar'));
  });

  it('sem permissão de aprovar: fila visível, botões de decisão AUSENTES', async () => {
    auth.pode = (m, a) => !(m === 'aprovacoes' && a === 'aprovar');
    montar('/aprovacoes?servico=11');
    await screen.findAllByText('Troca de segredo');
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rejeitar' })).toBeNull();
  });

  it('deep-link obsoleto (serviço fora da fila) → mensagem amigável, sem 404 cru', async () => {
    montar('/aprovacoes?servico=999');
    await screen.findAllByText('Troca de segredo');
    expect(screen.getByRole('status').textContent).toContain('não está mais aguardando aprovação');
  });

  it('fila vazia explica o que significa', async () => {
    api.get.mockResolvedValue({ data: [] });
    montar();
    await screen.findByText(/Fila vazia/);
    expect(screen.getByText(/chegam aqui para decisão/)).toBeTruthy();
  });

  it('erro da fila é recuperável', async () => {
    api.get.mockRejectedValueOnce(new Error('net'));
    montar();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findAllByText('Troca de segredo');
  });
});
