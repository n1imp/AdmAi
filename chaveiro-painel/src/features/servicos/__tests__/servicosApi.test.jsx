import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  chaves,
  classificarErro,
  useServicos,
  useCriarServico,
  useDeletarServico,
  useAprovarServico,
  useTecnicosAtivos,
  useContextoDeMateriais,
  useEvidenciaAutenticada,
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

describe('query keys — convenção mínima estável (§17) + escopo de identidade', () => {
  it('prefixo da capability + escopo + recorte', () => {
    expect(chaves.lista({ busca: 'x' })).toEqual(['servicos', 'anon', 'lista', { busca: 'x' }]);
    expect(chaves.detalhe(7)).toEqual(['servicos', 'anon', 'detalhe', 7]);
    expect(chaves.pendentes()).toEqual(['servicos', 'anon', 'pendentes']);
  });

  /* Revisor 01a04c56 (ALTA): sem o escopo, a sessão seguinte lia o cache da anterior. */
  it('identidades diferentes produzem keys diferentes', () => {
    const jwt = (p) =>
      `e30.${btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(p))))}.s`;
    localStorage.setItem('admai_token', jwt({ id: 1, empresaId: 1, exp: 4102444800 }));
    const deA = chaves.lista({});
    localStorage.setItem('admai_token', jwt({ id: 2, empresaId: 2, exp: 4102444800 }));
    const deB = chaves.lista({});
    localStorage.removeItem('admai_token');

    expect(deA).not.toEqual(deB);
    expect(deA[0]).toBe('servicos'); // prefixo preservado: invalidação da capability segue igual
    expect(deB[0]).toBe('servicos');
  });
});

describe('grafo de invalidação (§19): mutação → lista+detalhe+pendentes, nada além', () => {
  it('criar serviço invalida o prefixo da capability e devolve o STATUS ao chamador', async () => {
    const qc = clienteDeTeste();
    const invalidar = vi.spyOn(qc, 'invalidateQueries');
    api.post.mockResolvedValue({ status: 201, data: { id: 99 } });

    const { result } = renderHook(() => useCriarServico(), { wrapper: wrapperCom(qc) });
    const resposta = await result.current.mutateAsync({
      local: 'X',
      descricao: 'ABC',
      valorCobrado: 10,
    });

    /* O status vem junto: só o 201 literal do contrato autoriza limpar rascunho e
       anunciar sucesso na superfície (Revisor 01a04c56). */
    expect(resposta).toEqual({ status: 201, data: { id: 99 } });
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
    expect(remover).toHaveBeenCalledWith({ queryKey: chaves.detalhe(42) });
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

describe('cancelamento: o AbortSignal do TanStack chega ao axios', () => {
  /* Sem encaminhar o signal, a resposta de um filtro abandonado ainda aterrissava
     (Revisor 01a04c56): a request continuava viva depois de desmontar/trocar de key. */
  it('a query passa signal ao transporte', async () => {
    const qc = clienteDeTeste();
    api.get.mockResolvedValue({ data: { data: [], total: 0 } });

    const { result } = renderHook(() => useServicos({ local: 'Casa' }), {
      wrapper: wrapperCom(qc),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [, opcoes] = api.get.mock.calls[0];
    expect(opcoes?.signal).toBeInstanceOf(AbortSignal);
  });
});

/* Revisor 01a04c56 (rodada 2): componente NOVO da slice não faz fetch cru — o que o
   formulário precisa do servidor entra na layer, com key própria e cancelamento. */
describe('consultas de apoio das superfícies (boundary da application layer)', () => {
  it('técnicos ativos: filtra inativos, passa signal e sinaliza indisponibilidade', async () => {
    const qc = clienteDeTeste();
    api.get.mockResolvedValue({
      data: [
        { id: 1, nome: 'Ana', ativo: true },
        { id: 2, nome: 'Ex-técnico', ativo: false },
      ],
    });

    const { result } = renderHook(() => useTecnicosAtivos(), { wrapper: wrapperCom(qc) });
    await waitFor(() => expect(result.current.tecnicos).toHaveLength(1));
    expect(result.current.tecnicos[0].nome).toBe('Ana');
    expect(result.current.indisponivel).toBe(false);
    expect(api.get.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('técnicos: falha vira indisponibilidade explícita (a superfície avisa, não inventa lista)', async () => {
    const qc = clienteDeTeste();
    api.get.mockRejectedValue({ response: { status: 500, data: {} } });

    const { result } = renderHook(() => useTecnicosAtivos(), { wrapper: wrapperCom(qc) });
    await waitFor(() => expect(result.current.indisponivel).toBe(true));
    expect(result.current.tecnicos).toEqual([]);
  });

  it('contexto de materiais: null enquanto não sabe, boolean do regime, false em falha', async () => {
    const qc = clienteDeTeste();
    api.get.mockResolvedValue({ data: { aprovacaoServico: true } });

    const { result } = renderHook(() => useContextoDeMateriais(), { wrapper: wrapperCom(qc) });
    expect(result.current.permiteCatalogo).toBeNull(); // sem flash antes da resposta
    await waitFor(() => expect(result.current.permiteCatalogo).toBe(true));

    const qc2 = clienteDeTeste();
    api.get.mockRejectedValue({ response: { status: 500, data: {} } });
    const erro = renderHook(() => useContextoDeMateriais(), { wrapper: wrapperCom(qc2) });
    /* Falha ESCONDE: oferecer o seletor no escuro trocaria campo ausente por submissão
       recusada pelo backend. */
    await waitFor(() => expect(erro.result.current.permiteCatalogo).toBe(false));
  });

  it('desabilitado não consulta (variante que não precisa do contexto)', async () => {
    const qc = clienteDeTeste();
    renderHook(() => useContextoDeMateriais({ enabled: false }), { wrapper: wrapperCom(qc) });
    renderHook(() => useTecnicosAtivos({ enabled: false }), { wrapper: wrapperCom(qc) });
    expect(api.get).not.toHaveBeenCalled();
  });
});

/* [SEC-HB-02] Evidência autenticada: Bearer + blob + revoke, fora do cache de propósito.
   Revisor 01a04c56 (rodada 3): o estado precisa estar VINCULADO à url pedida — sem isso a
   troca de serviço mostrava a foto do atendimento anterior. */
describe('evidência autenticada — ciclo de vida do blob', () => {
  let criadas;
  let revogadas;
  beforeEach(() => {
    criadas = 0;
    revogadas = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => `blob:objeto-${++criadas}`,
      revokeObjectURL: (u) => revogadas.push(u),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('url pública legada renderiza direto (sem download autenticado)', () => {
    const { result } = renderHook(() => useEvidenciaAutenticada('https://cdn/x.jpg'));
    expect(result.current).toBe('https://cdn/x.jpg');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('url protegida baixa com signal e vira blob', async () => {
    api.get.mockResolvedValue({ data: new Blob(['a']) });
    const { result } = renderHook(() => useEvidenciaAutenticada('/api/servicos/1/foto'));

    expect(result.current).toBeNull(); // nada na tela antes do download
    await waitFor(() => expect(result.current).toBe('blob:objeto-1'));
    const [caminho, opcoes] = api.get.mock.calls[0];
    expect(caminho).toBe('/servicos/1/foto'); // prefixo /api removido: o transporte já o põe
    expect(opcoes.responseType).toBe('blob');
    expect(opcoes.signal).toBeInstanceOf(AbortSignal);
  });

  it('troca A→B: a evidência de A SOME antes de B resolver, e o blob de A é revogado', async () => {
    let resolverB;
    api.get
      .mockResolvedValueOnce({ data: new Blob(['a']) })
      .mockImplementationOnce(() => new Promise((r) => (resolverB = r)));

    const { result, rerender } = renderHook(({ url }) => useEvidenciaAutenticada(url), {
      initialProps: { url: '/api/servicos/1/foto' },
    });
    await waitFor(() => expect(result.current).toBe('blob:objeto-1'));

    rerender({ url: '/api/servicos/2/foto' });
    // enquanto B não chega: SEM imagem — nunca a foto do serviço 1 no detalhe do 2
    expect(result.current).toBeNull();
    expect(revogadas).toContain('blob:objeto-1');

    resolverB({ data: new Blob(['b']) });
    await waitFor(() => expect(result.current).toBe('blob:objeto-2'));
  });

  /* Revisor 01a04c56 (rodada 4): comparar a string da url deixava passar este ciclo — ao
     voltar para A o estado ainda dizia "sou de A", servindo um blob JÁ REVOGADO. */
  it('A→B(pendente)→A: nada na tela até o download NOVO de A chegar (blob revogado não volta)', async () => {
    let resolverA2;
    api.get
      .mockResolvedValueOnce({ data: new Blob(['a']) })
      .mockImplementationOnce(() => new Promise(() => {})) // B fica pendente de propósito
      .mockImplementationOnce(() => new Promise((r) => (resolverA2 = r)));

    const A = '/api/servicos/1/foto';
    const { result, rerender } = renderHook(({ url }) => useEvidenciaAutenticada(url), {
      initialProps: { url: A },
    });
    await waitFor(() => expect(result.current).toBe('blob:objeto-1'));

    rerender({ url: '/api/servicos/2/foto' }); // B ainda pendente; blob de A revogado
    expect(revogadas).toContain('blob:objeto-1');

    rerender({ url: A }); // volta para A antes de B resolver
    expect(result.current).toBeNull(); // NUNCA o blob revogado

    /* O download de B foi ABORTADO de verdade (o signal prova; a promise pendente sozinha
       não provaria nada) — B nunca vira imagem no detalhe de A. */
    expect(api.get.mock.calls[1][1].signal.aborted).toBe(true);

    resolverA2({ data: new Blob(['a2']) });
    await waitFor(() => expect(result.current).toBe('blob:objeto-2'));
  });

  it('desmontar aborta o download em voo e revoga o blob', async () => {
    api.get.mockResolvedValue({ data: new Blob(['a']) });
    const { result, unmount } = renderHook(() => useEvidenciaAutenticada('/api/servicos/1/foto'));
    await waitFor(() => expect(result.current).toBe('blob:objeto-1'));

    const { signal } = api.get.mock.calls[0][1];
    unmount();
    expect(signal.aborted).toBe(true);
    expect(revogadas).toContain('blob:objeto-1');
  });

  it('falha no download não deixa evidência de ninguém na tela', async () => {
    api.get.mockRejectedValue({ response: { status: 403, data: {} } });
    const { result } = renderHook(() => useEvidenciaAutenticada('/api/servicos/9/foto'));
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(result.current).toBeNull();
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
