import { prisma } from './prisma.js';

/**
 * Isolamento multi-tenant via Prisma Client Extensions.
 *
 * `prismaParaEmpresa(empresaId)` devolve um client cujas operações nos modelos
 * de negócio são automaticamente escopadas por `empresaId`. Isso garante que
 * NENHUMA query vaze dados entre empresas — inclusive `findUnique`/`findFirst`
 * por id, que sem isso permitiriam IDOR (acessar o id de outra empresa).
 *
 * Modelos escopados diretamente (possuem coluna empresaId):
 *   Tecnico, Servico, Material, Pagamento, EmpresaWhatsapp
 *
 * Modelos isolados pela RELAÇÃO com o pai (não recebem filtro aqui):
 *   MovimentacaoEstoque (→ Material), ServicoMaterial (→ Servico),
 *   Notificacao (→ Usuario). Sempre acesse-os a partir do pai escopado.
 *
 * Usuario e Empresa NÃO são escopados por este client (login/onboarding/admin
 * usam o `prisma` base com filtros explícitos).
 */

// Modelos que possuem a coluna empresaId e devem ser filtrados automaticamente.
const MODELOS_ESCOPADOS = new Set([
  'Tecnico',
  'Servico',
  'Material',
  'Pagamento',
  'EmpresaWhatsapp',
  'Avaliacao',
  'SessaoConversa',
]);

// Operações de LEITURA que aceitam `where` e devem receber o filtro empresaId.
const OPS_LEITURA_FILTRAVEIS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// Operações em LOTE que aceitam `where` não-único — seguras para injetar empresaId.
// `update`/`delete`/`upsert` (de registro único) NÃO entram aqui: exigem seletor
// único e empresaId quebraria o where. Nas rotas, use updateMany/deleteMany
// escopados (checando count) para mutações por id — evita IDOR sem query inválida.
const OPS_WHERE = new Set([
  'updateMany',
  'deleteMany',
]);

function mesclarWhere(where, empresaId) {
  // Sempre força empresaId, mesmo que o chamador já tenha passado um (segurança).
  return { ...(where ?? {}), empresaId };
}

const cacheClients = new Map();

/**
 * Cria (ou reutiliza) um client Prisma escopado para a empresa informada.
 * @param {number} empresaId
 */
export function prismaParaEmpresa(empresaId) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('empresaId inválido para client escopado');
  }
  if (cacheClients.has(empresaId)) return cacheClients.get(empresaId);

  const client = prisma.$extends({
    name: `tenant-${empresaId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELOS_ESCOPADOS.has(model)) return query(args);

          // findUnique/findUniqueOrThrow não aceitam campos não-únicos em `where`.
          // Reescrevemos para findFirst/findFirstOrThrow para poder cravar empresaId.
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const novoOp = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
            return client[modelDelegate(model)][novoOp]({
              ...args,
              where: mesclarWhere(args?.where, empresaId),
            });
          }

          if (OPS_LEITURA_FILTRAVEIS.has(operation) || OPS_WHERE.has(operation)) {
            args = { ...args, where: mesclarWhere(args?.where, empresaId) };
          }

          // create/createMany: injeta empresaId nos dados.
          if (operation === 'create') {
            args = { ...args, data: { ...(args?.data ?? {}), empresaId } };
          }
          if (operation === 'createMany') {
            const data = Array.isArray(args?.data) ? args.data : [args?.data];
            args = { ...args, data: data.map((d) => ({ ...d, empresaId })) };
          }

          return query(args);
        },
      },
    },
  });

  cacheClients.set(empresaId, client);
  return client;
}

// Mapeia o nome do model (PascalCase) para a propriedade delegate (camelCase).
function modelDelegate(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
