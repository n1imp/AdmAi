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

vi.mock('../prisma.js', () => ({ prismaApp: fakeBaseClient() }));

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

/**
 * Branch RLS (RLS_ENABLED=true): cada operação escopada deve rodar dentro de uma
 * transação que crava o GUC app.empresa_id (transaction-local) ANTES da query. Aqui
 * o client base expõe $transaction + delegates que registram o set_config e o despacho.
 */
describe('prismaParaEmpresa — RLS ligada (GUC por transação)', () => {
  const setConfigCalls = [];
  const txDispatch = [];

  function fakeBaseClientRls() {
    let handler;
    const txClient = {
      $executeRawUnsafe: (sql, ...vals) => {
        setConfigCalls.push({ sql, vals });
        return Promise.resolve(1);
      },
    };
    const makeTxDelegate = (model) => {
      const run = (operation) => (args) => {
        txDispatch.push({ model, operation, args });
        return Promise.resolve({ ok: true });
      };
      return { findFirst: run('findFirst'), findMany: run('findMany'), create: run('create') };
    };
    for (const m of ['tecnico', 'material'])
      txClient[m] = makeTxDelegate(m.charAt(0).toUpperCase() + m.slice(1));

    return {
      $transaction: async (fn) => fn(txClient),
      $extends: ({ query }) => {
        handler = query.$allModels.$allOperations;
        const ext = {};
        for (const m of ['tecnico', 'material']) {
          ext[m] = {
            findMany: (args) =>
              handler({
                model: m.charAt(0).toUpperCase() + m.slice(1),
                operation: 'findMany',
                args,
                query: async () => ({}),
              }),
            findUnique: (args) =>
              handler({
                model: m.charAt(0).toUpperCase() + m.slice(1),
                operation: 'findUnique',
                args,
                query: async () => ({}),
              }),
          };
        }
        return ext;
      },
    };
  }

  it('crava o GUC e despacha no tx (não em query)', async () => {
    vi.resetModules();
    setConfigCalls.length = 0;
    txDispatch.length = 0;
    vi.doMock('../prisma.js', () => ({ prismaApp: fakeBaseClientRls() }));
    vi.doMock('../../config/env.js', () => ({ env: { RLS_ENABLED: 'true' } }));
    const { prismaParaEmpresa: scoped } = await import('../tenant.js');

    await scoped(9).tecnico.findMany({ where: { ativo: true } });

    // setou o GUC com o empresaId como string, transaction-local
    expect(setConfigCalls).toHaveLength(1);
    expect(setConfigCalls[0].sql).toContain("set_config('app.empresa_id'");
    expect(setConfigCalls[0].vals).toEqual(['9']);
    // despachou findMany no tx com empresaId cravado no where
    expect(txDispatch).toHaveLength(1);
    expect(txDispatch[0]).toMatchObject({ model: 'Tecnico', operation: 'findMany' });
    expect(txDispatch[0].args.where).toMatchObject({ ativo: true, empresaId: 9 });

    vi.doUnmock('../prisma.js');
    vi.doUnmock('../../config/env.js');
    vi.resetModules();
  });
});
