import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatarMoeda, formatarData, formatarDataCurta } from '../api.js';

describe('formatarMoeda', () => {
  it('formata em BRL', () => {
    // NBSP entre R$ e o número — normalizamos para comparar de forma estável.
    expect(formatarMoeda(1234.5).replace(/ /g, ' ')).toBe('R$ 1.234,50');
  });
  it('trata null/undefined como zero', () => {
    expect(formatarMoeda(null).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatarMoeda(undefined).replace(/ /g, ' ')).toBe('R$ 0,00');
  });
});

describe('formatarData / formatarDataCurta', () => {
  it('retorna travessão para data ausente', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarDataCurta('')).toBe('—');
  });
  it('formata data curta como dd/mm', () => {
    expect(formatarDataCurta('2026-06-05T12:00:00Z')).toMatch(/^\d{2}\/\d{2}$/);
  });
  it('formata data completa com hora', () => {
    expect(formatarData('2026-06-05T12:00:00Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

/**
 * Interceptors — os dois contratos que as jornadas F5 fixaram no cliente HTTP:
 *   401 de /auth/* é CREDENCIAL errada (propaga; nunca refresh/reload — era o defeito que
 *   engolia a mensagem de senha errada); 401 de produto tenta refresh e, falhando, volta ao
 *   login; 402 leva para /assinatura (a superfície de SL-10), sem loop quando já lá.
 */
import api from '../api.js';

describe('interceptor de resposta', () => {
  let chamadas;
  let localFalso;

  beforeEach(() => {
    chamadas = [];
    localFalso = { pathname: '/servicos', search: '', href: 'http://x/servicos' };
    vi.stubGlobal('location', localFalso);
    api.defaults.adapter = (config) => {
      chamadas.push(config.url);
      const status = config.__status ?? (config.url.startsWith('/auth/refresh') ? 401 : 200);
      if (status >= 400) {
        const erro = new Error(`HTTP ${status}`);
        erro.config = config;
        erro.response = { status, data: {}, config };
        return Promise.reject(erro);
      }
      return Promise.resolve({ data: {}, status, statusText: 'OK', headers: {}, config });
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete api.defaults.adapter;
  });

  it('401 de /auth/login propaga SEM refresh e sem navegar — a tela mostra o erro', async () => {
    await expect(api.post('/auth/login', {}, { __status: 401 })).rejects.toThrow();
    expect(chamadas).toEqual(['/auth/login']); // nenhum /auth/refresh
    expect(localFalso.href).toBe('http://x/servicos'); // nenhum reload
  });

  it('401 de rota de PRODUTO tenta refresh; falhando, volta ao login', async () => {
    // O refresh usa o axios CRU (nao a instancia api) — em jsdom ele falha por rede, que e
    // exatamente o caminho de refresh-invalido: o efeito observavel e voltar ao login.
    await expect(api.get('/servicos', { __status: 401 })).rejects.toBeDefined();
    expect(chamadas[0]).toBe('/servicos');
    expect(localFalso.href).toBe('/login');
  });

  it('402 redireciona para /assinatura — pagina de produto nunca fica em branco', async () => {
    await expect(api.get('/servicos', { __status: 402 })).rejects.toBeDefined();
    expect(localFalso.href).toBe('/assinatura');
  });

  it('402 estando JÁ em /assinatura não redireciona (sem loop)', async () => {
    localFalso.pathname = '/assinatura';
    localFalso.href = 'http://x/assinatura';
    await expect(api.get('/servicos', { __status: 402 })).rejects.toBeDefined();
    expect(localFalso.href).toBe('http://x/assinatura');
  });
});
