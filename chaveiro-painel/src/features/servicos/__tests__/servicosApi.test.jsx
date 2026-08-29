import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  chaves,
  classificarErro,
  useServicos,
  useCriarServico,
  useDeletarServico,
  useAprovarServico,
} from '../servicosApi.js';
import api from '../../../lib/api.js';

vi.mock('../../../lib/api.js', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

function clienteDeTeste() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: (n, e) => !e?.response && n < 2, gcTime: Infinity },
      mutations: { retry: 0 },
    },
  });
}

const wrapperCom = (qc) =>
  function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

beforeEach(() => vi.clearAllMocks());

describe('query keys — convenção mínima estável (§17)', () => {
  it('prefixo da capability + recorte + contexto', () => {
    expect(chaves.lista({ busca: 'x' })).toEqual(['servicos', 'lista', { busca: 'x' }]);
    expect(chaves.detalhe(7)).toEqual(['servicos', 'detalhe', 7]);
    expect(chaves.pendentes()).toEqual(['servicos', 'pendentes']);
  });
});

describe('grafo de invalidação (§19): mutação → lista+detalhe+pendentes, nada além', () => {
  it('criar serviço invalida o prefixo da capability', async () => {
    const qc = clienteDeTeste();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    api.post.mockResolvedValue({ data: { id: 99 } });

    const { result } = renderHook(() => useCriarServico(), { wrapper: wrapperCom(qc) });
    await result.current.mutateAsync({ local: 'X', descricao: 'ABC', valorCobrado: 10 });

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['servicos'] });
    expect(invalidar).toHaveBeenCalledTimes(1); // nada de invalidate-everything
  });

  it('deletar invalida o grafo E remove o detalhe do cache', async () => {
    const qc = clienteDeTeste();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    const remover = vi.spyOn(qc, 'removeQueries');
    api.delete.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() => useDeletarServico(), { wrapper: wrapperCom(qc) });
    await result.current.mutateAsync(42);

    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['servicos'] });
    expect(remover).toHaveBeenCalledWith({ queryKey: ['servicos', 'detalhe', 42] });
  });

  it('aprovar invalida o grafo (fila de pendentes coberta pelo prefixo)', async () => {
    const qc = clienteDeTeste();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    api.post.mockResolvedValue({ data: { ok: true } });

    const { result } = renderHook(() => useAprovarServico(), { wrapper: wrapperCom(qc) });
    await result.current.mutateAsync(7);

    expect(api.post).toHaveBeenCalledWith('/servicos/7/aprovar');
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ['servicos'] });
  });
});

describe('retry policy (DDR-4): 4xx NUNCA re-tenta; mutation não repete sozinha', () => {
  it('query com 400 falha direto (1 chamada só)', async () => {
    const qc = clienteDeTeste();
    api.get.mockRejectedValue({ response: { status: 400, data: { erro: 'inválido' } } });

    const { result } = renderHook(() => useServicos({}), { wrapper: wrapperCom(qc) });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('mutation que falha NÃO invalida nada (sem fake success)', async () => {
    const qc = clienteDeTeste();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    api.post.mockRejectedValue({ response: { status: 409, data: { erro: 'mudou de estado' } } });

    const { result } = renderHook(() => useAprovarServico(), { wrapper: wrapperCom(qc) });
    await expect(result.current.mutateAsync(7)).rejects.toBeTruthy();
    expect(invalidar).not.toHaveBeenCalled();
  });
});

describe('classificarErro — taxonomia segura (§79)', () => {
  it('sem response → NETWORK_ERROR com mensagem do glossário', () => {
    expect(classificarErro({}).classe).toBe('NETWORK_ERROR');
  });
  it('403/404/409 traduzidos; mensagem do servidor aproveitada quando é texto de negócio', () => {
    expect(classificarErro({ response: { status: 403, data: {} } }).classe).toBe(
      'PERMISSION_DENIED'
    );
    expect(classificarErro({ response: { status: 409, data: { erro: 'Já decidido' } } })).toEqual({
      classe: 'CONFLICT',
      mensagem: 'Já decidido',
    });
    expect(
      classificarErro({ response: { status: 500, data: { stack: 'x' } } }).mensagem
    ).not.toContain('stack');
  });
});
