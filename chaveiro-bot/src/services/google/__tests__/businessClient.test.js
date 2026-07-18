import { describe, it, expect } from 'vitest';

// Com GOOGLE_REVIEWS_ENABLED ausente (default nos testes), a integração roda em
// modo demonstração (mock) — sem tocar no banco nem na API do Google.
const { ehErroVerificacao, listarLocations } = await import('../businessClient.js');

describe('ehErroVerificacao', () => {
  it('401/403 → sem acesso / em verificação', () => {
    expect(ehErroVerificacao({ response: { status: 403 } })).toBe(true);
    expect(ehErroVerificacao({ response: { status: 401 } })).toBe(true);
  });
  it('detecta PERMISSION_DENIED / API não habilitada mesmo sem 401/403', () => {
    expect(
      ehErroVerificacao({
        response: { status: 500, data: { error: { status: 'PERMISSION_DENIED' } } },
      })
    ).toBe(true);
    expect(
      ehErroVerificacao({
        response: { status: 400, data: { error: { message: 'API has not been used' } } },
      })
    ).toBe(true);
  });
  it('erros comuns não são verificação', () => {
    expect(ehErroVerificacao({ response: { status: 500 } })).toBe(false);
    expect(ehErroVerificacao(new Error('network'))).toBe(false);
  });
});

describe('listarLocations (modo demonstração, sem credenciais)', () => {
  it('devolve loja de exemplo com accountId/locationId', async () => {
    const r = await listarLocations(1);
    expect(r.mock).toBe(true);
    expect(r.verificacaoPendente).toBe(false);
    expect(r.locations.length).toBeGreaterThan(0);
    expect(r.locations[0]).toHaveProperty('accountId');
    expect(r.locations[0]).toHaveProperty('locationId');
  });
});
