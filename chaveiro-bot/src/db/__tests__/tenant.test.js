import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock do client base. `$extends` devolve um objeto cujos delegates de modelo
 * chamam o handler `$allOperations` registrado, encaminhando para uma `query`
 * espiã. Assim conseguimos inspecionar o `args` final (com empresaId) sem banco.
 */
const queryEspia = vi.fn(async (args) => ({ __args: args }));

function fakeBaseClient() {
  let handler;
  const makeDelegate = (model) => {
    const run = (operation) => (args) =>
      handler({ model, operation, args, query: (a) => queryEspia(a) });
    return {
      findUnique: run('findUnique'),
      findFirst: run('findFirst'),
      findMany: run('findMany'),
      create: run('create'),
      updateMany: run('updateMany'),
      count: run('count'),
    };
  };
  const client = {
    tecnico: null,
    material: null,
    $extends: ({ query }) => {
      handler = query.$allModels.$allOperations;
      // devolve um client "estendido" com os mesmos delegates
      const ext = {};
      for (const m of ['tecnico', 'material', 'servico', 'usuario', 'empresa']) {
        ext[m] = makeDelegate(m.charAt(0).toUpperCase() + m.slice(1));
      }
      return ext;
    },
  };
  return client;
}

vi.mock('../prisma.js', () => ({ prisma: fakeBaseClient() }));

const { prismaParaEmpresa } = await import('../tenant.js');

beforeEach(() => queryEspia.mockClear());

describe('prismaParaEmpresa — validação', () => {
  it('lança para empresaId inválido', () => {
    expect(() => prismaParaEmpresa(0)).toThrow();
    expect(() => prismaParaEmpresa(-1)).toThrow();
    expect(() => prismaParaEmpresa('x')).toThrow();
  });

  it('aceita empresaId inteiro positivo', () => {
    expect(() => prismaParaEmpresa(1)).not.toThrow();
  });
});

describe('prismaParaEmpresa — isolamento (anti-IDOR)', () => {
  it('injeta empresaId no where de findMany em modelo escopado', async () => {
    const db = prismaParaEmpresa(7);
    await db.tecnico.findMany({ where: { ativo: true } });
    expect(queryEspia).toHaveBeenCalled();
    const args = queryEspia.mock.calls.at(-1)[0];
    expect(args.where).toMatchObject({ ativo: true, empresaId: 7 });
  });

  it('força empresaId mesmo se o chamador passar outro (segurança)', async () => {
    const db = prismaParaEmpresa(7);
    await db.tecnico.findMany({ where: { empresaId: 999 } });
    const args = queryEspia.mock.calls.at(-1)[0];
    expect(args.where.empresaId).toBe(7);
  });

  it('injeta empresaId nos dados de create', async () => {
    const db = prismaParaEmpresa(3);
    await db.material.create({ data: { nome: 'X' } });
    const args = queryEspia.mock.calls.at(-1)[0];
    expect(args.data).toMatchObject({ nome: 'X', empresaId: 3 });
  });

  it('reescreve findUnique→findFirst com empresaId (impede IDOR por id)', async () => {
    const db = prismaParaEmpresa(5);
    // findUnique não aceita campo não-único; a reescrita para findFirst permite cravar empresaId
    const r = await db.tecnico.findUnique({ where: { id: 42 } });
    const args = queryEspia.mock.calls.at(-1)[0];
    expect(args.where).toMatchObject({ id: 42, empresaId: 5 });
  });
});
