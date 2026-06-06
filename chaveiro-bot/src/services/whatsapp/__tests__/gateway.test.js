import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes unitários do gateway WhatsApp (Evolution).
 *
 * Cobrimos as duas funções PURAS expostas para o painel:
 *  - mapearEstado: tradução do state da Evolution para o vocabulário do painel,
 *    incluindo o novo 'aguardando_qr' quando há QR mas a conexão não está 'open'.
 *  - configWhatsappFaltando: diagnóstico que lista os NOMES (nunca valores) das
 *    vars de ambiente ausentes.
 *
 * O `env` é mockado por teste para exercitar o diagnóstico sem depender do
 * ambiente real. Importamos o módulo dinamicamente após configurar o mock.
 */

// Mock mutável do env — cada teste ajusta `envMock` antes de importar o gateway.
let envMock = {};
vi.mock('../../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

async function carregarGateway() {
  vi.resetModules();
  return import('../gateway.js');
}

describe('mapearEstado', () => {
  let mapearEstado;
  beforeEach(async () => {
    envMock = {};
    ({ mapearEstado } = await carregarGateway());
  });

  it("mapeia 'open' para 'conectado'", () => {
    expect(mapearEstado('open')).toBe('conectado');
    // QR é irrelevante quando já está conectado.
    expect(mapearEstado('open', true)).toBe('conectado');
  });

  it("mapeia 'connecting' para 'conectando'", () => {
    expect(mapearEstado('connecting')).toBe('conectando');
    expect(mapearEstado('connecting', true)).toBe('conectando');
  });

  it("mapeia 'close' sem QR para 'desconectado'", () => {
    expect(mapearEstado('close')).toBe('desconectado');
    expect(mapearEstado('close', false)).toBe('desconectado');
  });

  it("mapeia estado fechado COM QR para 'aguardando_qr'", () => {
    expect(mapearEstado('close', true)).toBe('aguardando_qr');
    expect(mapearEstado(undefined, true)).toBe('aguardando_qr');
    expect(mapearEstado(null, true)).toBe('aguardando_qr');
  });

  it("trata undefined/null sem QR como 'desconectado'", () => {
    expect(mapearEstado(undefined)).toBe('desconectado');
    expect(mapearEstado(null)).toBe('desconectado');
  });
});

describe('configWhatsappFaltando', () => {
  let configWhatsappFaltando;

  async function comEnv(env) {
    envMock = env;
    ({ configWhatsappFaltando } = await carregarGateway());
    return configWhatsappFaltando();
  }

  it('reporta todas as vars faltando quando o env está vazio', async () => {
    const r = await comEnv({});
    expect(r.configIncompleta).toBe(true);
    expect(r.faltando).toEqual(
      expect.arrayContaining(['EVOLUTION_HOST', 'EVOLUTION_API_KEY', 'ENCRYPTION_KEY', 'PUBLIC_URL'])
    );
  });

  it('marca configIncompleta=true se faltar QUALQUER var obrigatória', async () => {
    const r = await comEnv({
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'k',
      PUBLIC_URL: 'https://app.exemplo.com',
      // ENCRYPTION_KEY ausente
    });
    expect(r.configIncompleta).toBe(true);
    expect(r.faltando).toContain('ENCRYPTION_KEY');
    expect(r.faltando).not.toContain('EVOLUTION_HOST');
  });

  it('configIncompleta=false quando todas as obrigatórias estão presentes', async () => {
    const r = await comEnv({
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'k',
      ENCRYPTION_KEY: 'chave-suficientemente-longa-1234',
      PUBLIC_URL: 'https://app.exemplo.com',
    });
    expect(r.configIncompleta).toBe(false);
    expect(r.faltando).toEqual([]);
  });

  it('inclui PUBLIC_URL em faltando (recomendada) sem torná-la obrigatória', async () => {
    const r = await comEnv({
      EVOLUTION_HOST: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'k',
      ENCRYPTION_KEY: 'chave-suficientemente-longa-1234',
      // PUBLIC_URL ausente
    });
    // Obrigatórias OK → não bloqueia a conexão...
    expect(r.configIncompleta).toBe(false);
    // ...mas a recomendação ausente é reportada para o painel orientar o admin.
    expect(r.faltando).toEqual(['PUBLIC_URL']);
  });

  it('nunca expõe VALORES, apenas NOMES de vars', async () => {
    const r = await comEnv({ EVOLUTION_API_KEY: 'segredo-super-secreto' });
    // O valor secreto jamais aparece na lista de faltando.
    expect(r.faltando.join(',')).not.toContain('segredo-super-secreto');
    expect(r.faltando).not.toContain('EVOLUTION_API_KEY'); // presente, logo não falta
  });
});
