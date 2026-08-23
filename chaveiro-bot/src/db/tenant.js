import { prismaApp } from './prisma.js';
import { env } from '../config/env.js';

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
  'RegistroPonto',
  'DocumentoTecnico',
  /* [SEC-HB-06] Os seis que tinham empresaId mas viviam FORA do escopo automático — cada call
     site futuro dependia de disciplina manual. Único call site req.db atual verificado:
     assinatura.findUnique do paywall (idempotente sob o rewrite findUnique→findFirst; os 16
     testes da matriz 402 são a regressão). Webhooks/auditoria usam o prisma global de
     propósito (sem contexto de tenant) e não passam por aqui. */
  'GoogleConta',
  'AvaliacaoGoogle',
  'AnaliseAvaliacoes',
  'Assinatura',
  'ConviteUsuario',
  'AuditLog',
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
const OPS_WHERE = new Set(['updateMany', 'deleteMany']);

function mesclarWhere(where, empresaId) {
  // Sempre força empresaId, mesmo que o chamador já tenha passado um (segurança).
  return { ...(where ?? {}), empresaId };
}

// Defesa em profundidade no banco (RLS). Quando ligada, cada operação escopada roda
// dentro de uma transação que crava o GUC `app.empresa_id` (transaction-local, 3º arg
// `true`) ANTES da query — é esse valor que as policies de Row Level Security comparam
// com a coluna empresaId. `local=true` é essencial sob connection pooling: o setting
// morre no fim da transação e nunca vaza para a próxima requisição na mesma conexão.
const RLS_ATIVA = env.RLS_ENABLED === 'true';
const SQL_SET_EMPRESA = "SELECT set_config('app.empresa_id', $1, true)";

// Calcula a operação efetiva e os args com empresaId injetado. O único caso em que a
// operação muda é findUnique→findFirst (where não-único precisa de findFirst).
function escoparOperacao(operation, args, empresaId) {
  if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
    const op = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
    return { op, args: { ...args, where: mesclarWhere(args?.where, empresaId) } };
  }
  if (OPS_LEITURA_FILTRAVEIS.has(operation) || OPS_WHERE.has(operation)) {
    return { op: operation, args: { ...args, where: mesclarWhere(args?.where, empresaId) } };
  }
  if (operation === 'create') {
    return { op: operation, args: { ...args, data: { ...(args?.data ?? {}), empresaId } } };
  }
  if (operation === 'createMany') {
    const data = Array.isArray(args?.data) ? args.data : [args?.data];
    return { op: operation, args: { ...args, data: data.map((d) => ({ ...d, empresaId })) } };
  }
  return { op: operation, args };
}

// Cache LRU com teto: evita vazar um client estendido por empresaId para sempre.
// Ao exceder MAX_CACHE_CLIENTS, descarta o menos recentemente usado (1ª chave do Map,
// que preserva a ordem de inserção/uso). Reinserir uma chave a move para o fim (MRU).
const MAX_CACHE_CLIENTS = 100;
const cacheClients = new Map();

/**
 * Cria (ou reutiliza) um client Prisma escopado para a empresa informada.
 * @param {number} empresaId
 */
export function prismaParaEmpresa(empresaId) {
  if (!Number.isInteger(empresaId) || empresaId <= 0) {
    throw new Error('empresaId inválido para client escopado');
  }
  if (cacheClients.has(empresaId)) {
    // Toca a entrada para marcá-la como recém-usada (move para o fim do Map).
    const existente = cacheClients.get(empresaId);
    cacheClients.delete(empresaId);
    cacheClients.set(empresaId, existente);
    return existente;
  }

  const client = prismaApp.$extends({
    name: `tenant-${empresaId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!MODELOS_ESCOPADOS.has(model)) return query(args);

          const { op, args: finalArgs } = escoparOperacao(operation, args, empresaId);

          // RLS ligada: roda na transação que crava o GUC e despacha SEMPRE no `tx`
          // (rodar via `query` executaria fora da transação, sem o GUC aplicado).
          if (RLS_ATIVA) {
            return prismaApp.$transaction(async (tx) => {
              await tx.$executeRawUnsafe(SQL_SET_EMPRESA, String(empresaId));
              return tx[modelDelegate(model)][op](finalArgs);
            });
          }

          // RLS desligada (default): só o filtro app-level. Quando a operação não muda,
          // reusa `query` (caminho nativo); no rewrite findUnique→findFirst, despacha no
          // client estendido (reinjeta empresaId — idempotente — e cai no caminho nativo).
          if (op === operation) return query(finalArgs);
          return client[modelDelegate(model)][op](finalArgs);
        },
      },
    },
  });

  // Evicção LRU: se o cache está cheio, remove a entrada mais antiga antes de inserir.
  if (cacheClients.size >= MAX_CACHE_CLIENTS) {
    const maisAntiga = cacheClients.keys().next().value;
    cacheClients.delete(maisAntiga);
  }
  cacheClients.set(empresaId, client);
  return client;
}

// Mapeia o nome do model (PascalCase) para a propriedade delegate (camelCase).
function modelDelegate(model) {
  return model.charAt(0).toLowerCase() + model.slice(1);
}
