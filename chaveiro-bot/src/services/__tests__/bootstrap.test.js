import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T-BILL-06 (correção pós-revisão) — `bootstrapAdmin()` cria a empresa/admin
 * de conveniência na subida do servidor pelo MESMO caminho de
 * `POST /auth/register`/`POST /setup` (empresa → empresaWhatsapp → usuario).
 * A revisão independente apontou que esse caminho tinha ficado de fora da
 * correção original — sem a Assinatura, a 1ª empresa de qualquer instância
 * nova (a do próprio bootstrap) ficaria em estado "indeterminado" assim que
 * o paywall (T-BILL-04, futuro) entrar no ar.
 */
const { empresaCreateMock, assinaturaCreateMock, usuarioCreateMock, usuarioCountMock } = vi.hoisted(
  () => ({
    empresaCreateMock: vi.fn(async () => ({ id: 9, nome: 'Empresa Dev' })),
    assinaturaCreateMock: vi.fn(),
    usuarioCreateMock: vi.fn(),
    usuarioCountMock: vi.fn(),
  })
);

let envMock = {};
vi.mock('../../config/env.js', () => ({
  get env() {
    return envMock;
  },
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    usuario: { count: usuarioCountMock },
    empresa: { findUnique: vi.fn(async () => null) },
    $transaction: async (fn) =>
      fn({
        empresa: { create: empresaCreateMock },
        empresaWhatsapp: { create: vi.fn() },
        assinatura: { create: assinaturaCreateMock },
        usuario: { create: usuarioCreateMock },
      }),
  },
}));

async function carregar() {
  vi.resetModules();
  return import('../bootstrap.js');
}

beforeEach(() => {
  empresaCreateMock.mockClear();
  assinaturaCreateMock.mockReset();
  usuarioCreateMock.mockReset();
  usuarioCountMock.mockReset();
  envMock = {
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: 'senha-forte-123',
    ADMIN_NOME: 'Admin',
    ADMIN_EMPRESA: 'Empresa Dev',
  };
});

describe('bootstrapAdmin', () => {
  it('cria a Assinatura(trialing, +14d) junto com a empresa de bootstrap', async () => {
    usuarioCountMock.mockResolvedValue(0);
    const { bootstrapAdmin } = await carregar();

    const antes = Date.now();
    await bootstrapAdmin();

    expect(assinaturaCreateMock).toHaveBeenCalledTimes(1);
    const args = assinaturaCreateMock.mock.calls[0][0];
    expect(args.data.empresaId).toBe(9);
    expect(args.data.status).toBe('trialing');
    const dias = (new Date(args.data.trialFimEm) - antes) / (24 * 60 * 60 * 1000);
    expect(dias).toBeGreaterThan(13.999);
    expect(dias).toBeLessThan(14.01);
  });

  it('não faz nada se já existe usuário no banco (idempotência)', async () => {
    usuarioCountMock.mockResolvedValue(1);
    const { bootstrapAdmin } = await carregar();
    await bootstrapAdmin();

    expect(empresaCreateMock).not.toHaveBeenCalled();
    expect(assinaturaCreateMock).not.toHaveBeenCalled();
  });

  it('não faz nada sem ADMIN_USERNAME/ADMIN_PASSWORD configurados', async () => {
    envMock = {};
    const { bootstrapAdmin } = await carregar();
    await bootstrapAdmin();

    expect(usuarioCountMock).not.toHaveBeenCalled();
    expect(assinaturaCreateMock).not.toHaveBeenCalled();
  });
});
