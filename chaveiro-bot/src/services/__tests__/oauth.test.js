import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Testes unitários do serviço de login social (OIDC).
 *
 * Mockamos a lib `jose` (jwtVerify) e o `env` para exercitar a lógica de:
 *  - habilitação por provedor (client id presente),
 *  - verificação/normalização da identidade (sub, email, email_verified, nome),
 *  - validações de segurança (audience desligada, issuer Microsoft multi-tenant,
 *    nonce anti-replay, token inválido).
 * Nenhuma chamada de rede é feita: o JWKS é um stub e o jwtVerify é controlado.
 */

// jwtVerify controlável por teste (hoisted para casar com vi.mock).
const { jwtVerifyMock } = vi.hoisted(() => ({ jwtVerifyMock: vi.fn() }));
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => () => ({})),
  jwtVerify: jwtVerifyMock,
}));

// env mutável — cada teste ajusta `envMock` antes de importar o serviço.
let envMock = {};
vi.mock('../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

async function carregar() {
  vi.resetModules();
  return import('../oauth.js');
}

beforeEach(() => {
  jwtVerifyMock.mockReset();
  envMock = {
    GOOGLE_CLIENT_ID: 'google-aud',
    MICROSOFT_CLIENT_ID: 'ms-aud',
    MICROSOFT_TENANT: 'common',
    APPLE_CLIENT_ID: 'apple-aud',
  };
});

describe('provedoresHabilitados', () => {
  it('reflete quais client ids estão presentes', async () => {
    envMock = { GOOGLE_CLIENT_ID: 'x' };
    const { provedoresHabilitados } = await carregar();
    expect(provedoresHabilitados()).toEqual({ google: true, microsoft: false, apple: false });
  });
});

describe('configProvedor', () => {
  it('monta config do Google', async () => {
    const { configProvedor } = await carregar();
    const cfg = configProvedor('google');
    expect(cfg.audience).toBe('google-aud');
    expect(cfg.issuer).toContain('https://accounts.google.com');
    expect(cfg.jwksUri).toContain('googleapis.com');
  });

  it('Microsoft common usa validação por regex de issuer (não valor fixo)', async () => {
    const { configProvedor } = await carregar();
    const cfg = configProvedor('microsoft');
    expect(cfg.issuer).toBeNull();
    expect(cfg.issuerRegex).toBeInstanceOf(RegExp);
    expect(cfg.jwksUri).toContain('/common/discovery/v2.0/keys');
  });

  it('Microsoft com tenant específico fixa o issuer', async () => {
    envMock.MICROSOFT_TENANT = 'tenant-123';
    const { configProvedor } = await carregar();
    const cfg = configProvedor('microsoft');
    expect(cfg.issuer).toBe('https://login.microsoftonline.com/tenant-123/v2.0');
    expect(cfg.issuerRegex).toBeNull();
  });

  it('provedor desconhecido retorna null', async () => {
    const { configProvedor } = await carregar();
    expect(configProvedor('facebook')).toBeNull();
  });
});

describe('verificarIdToken', () => {
  it('Google: retorna identidade normalizada com email verificado', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'g-1', email: 'joao@gmail.com', email_verified: true, name: 'João', nonce: 'n1' },
    });
    const { verificarIdToken } = await carregar();
    const id = await verificarIdToken('google', 'token-valido', 'n1');
    expect(id).toEqual({ sub: 'g-1', email: 'joao@gmail.com', emailVerificado: true, nome: 'João' });
  });

  it('Apple: email_verified como string "true" é normalizado para boolean', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'a-1', email: 'priv@privaterelay.appleid.com', email_verified: 'true', nonce: 'n1' },
    });
    const { verificarIdToken } = await carregar();
    const id = await verificarIdToken('apple', 'tok', 'n1');
    expect(id.emailVerificado).toBe(true);
    // nome cai para a parte local do e-mail quando o provedor não envia name.
    expect(id.nome).toBe('priv');
  });

  it('Microsoft: usa preferred_username como email e xms_edov como verificação', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: {
        sub: 'm-1', preferred_username: 'ana@empresa.com', xms_edov: true,
        iss: 'https://login.microsoftonline.com/tenant-abc/v2.0', given_name: 'Ana', family_name: 'Lima',
      },
    });
    const { verificarIdToken } = await carregar();
    const id = await verificarIdToken('microsoft', 'tok');
    expect(id).toEqual({ sub: 'm-1', email: 'ana@empresa.com', emailVerificado: true, nome: 'Ana Lima' });
  });

  it('Microsoft: issuer fora do padrão multi-tenant é rejeitado', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'm-2', iss: 'https://evil.example.com/v2.0' },
    });
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('microsoft', 'tok')).rejects.toMatchObject({ codigo: 'issuer_invalido' });
  });

  it('provedor desabilitado (sem client id) é recusado com 404', async () => {
    envMock.GOOGLE_CLIENT_ID = undefined;
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', 'tok')).rejects.toMatchObject({ codigo: 'provedor_desabilitado', status: 404 });
  });

  it('provedor desconhecido é recusado com 404', async () => {
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('facebook', 'tok')).rejects.toMatchObject({ codigo: 'provedor_desconhecido', status: 404 });
  });

  it('token sem idToken é recusado', async () => {
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', '')).rejects.toMatchObject({ codigo: 'token_ausente' });
  });

  it('assinatura/aud inválidos (jwtVerify lança) viram token_invalido', async () => {
    jwtVerifyMock.mockRejectedValue(new Error('bad signature'));
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', 'tok')).rejects.toMatchObject({ codigo: 'token_invalido', status: 401 });
  });

  it('nonce divergente é rejeitado (anti-replay)', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'g-9', nonce: 'do-token' } });
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', 'tok', 'do-cliente')).rejects.toMatchObject({ codigo: 'nonce_invalido' });
  });

  it('Google sem nonce do cliente é rejeitado (nonce obrigatório)', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'g-9', nonce: 'do-token' } });
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', 'tok')).rejects.toMatchObject({ codigo: 'nonce_ausente', status: 400 });
  });

  it('Microsoft não exige nonce (validado pelo MSAL no cliente)', async () => {
    jwtVerifyMock.mockResolvedValue({
      payload: { sub: 'm-3', preferred_username: 'bob@empresa.com', xms_edov: true,
        iss: 'https://login.microsoftonline.com/tenant-x/v2.0' },
    });
    const { verificarIdToken } = await carregar();
    const id = await verificarIdToken('microsoft', 'tok');
    expect(id.sub).toBe('m-3');
  });

  it('nonce correspondente passa', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { sub: 'g-9', email: 'a@b.com', email_verified: true, nonce: 'n1' } });
    const { verificarIdToken } = await carregar();
    const id = await verificarIdToken('google', 'tok', 'n1');
    expect(id.sub).toBe('g-9');
  });

  it('payload sem sub é rejeitado', async () => {
    jwtVerifyMock.mockResolvedValue({ payload: { email: 'a@b.com', nonce: 'n1' } });
    const { verificarIdToken } = await carregar();
    await expect(verificarIdToken('google', 'tok', 'n1')).rejects.toMatchObject({ codigo: 'sub_ausente' });
  });
});
