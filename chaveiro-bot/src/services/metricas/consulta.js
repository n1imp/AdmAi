/**
 * Busca das linhas que alimentam cada cálculo.  [Metric Foundation · exposição]
 *
 * A ÚNICA COISA QUE ESTE MÓDULO FAZ
 *   Traduz uma métrica do registro na consulta que traz suas linhas, sempre por `req.db`. Ele NÃO
 *   calcula, não decide permissão e não formata resposta. Cálculo é `calculo.js`, permissão é
 *   `exposicao.js` — e essa separação é o que permite provar cada um sem os outros.
 *
 * ESCOPO DE TENANT — estrutural, não por disciplina
 *   `req.db` é o client estendido de `db/tenant.js`, que injeta `empresaId` em `$allOperations`
 *   para os modelos escopados, incluindo `findMany`, `count`, `aggregate` e `groupBy`. Nenhuma
 *   consulta aqui escreve `empresaId` à mão: escrever à mão seria a versão frágil da mesma coisa,
 *   e esqueceria em algum lugar.
 *
 * A ARMADILHA QUE ISTO EVITA — `BatidaPonto` NÃO é modelo escopado
 *   `MODELOS_ESCOPADOS` em `db/tenant.js` lista `RegistroPonto`, e não `BatidaPonto`. Uma consulta
 *   direta a `req.db.batidaPonto.findMany(...)` NÃO receberia filtro de empresa e devolveria
 *   batidas de todos os tenants — vazamento cross-tenant silencioso, num modelo que carrega
 *   geolocalização e selfie. Por isso as batidas vêm SEMPRE por `include` a partir de
 *   `RegistroPonto`, que é escopado, e um controle proíbe a forma direta.
 *
 * `empresaId` do cliente é ignorado em qualquer lugar: o tenant vem do token, nunca do pedido.
 */

/** Modelos que NÃO podem ser consultados direto — só por relação a partir de um modelo escopado. */
export const PROIBIDOS_DIRETO = Object.freeze(['batidaPonto']);

/**
 * Como cada métrica busca suas linhas. `carregar` recebe o client já escopado e a janela.
 * PURA em relação ao client: os testes passam um duplo e observam a chamada.
 */
export const CONSULTAS = Object.freeze({
  'faturamento-liquido': {
    modelo: 'servico',
    carregar: (db, janela) => servicosDaJanela(db, janela),
  },
  'ticket-medio': { modelo: 'servico', carregar: (db, janela) => servicosDaJanela(db, janela) },
  'comissao-total': { modelo: 'servico', carregar: (db, janela) => servicosDaJanela(db, janela) },
  'servicos-concluidos': {
    modelo: 'servico',
    carregar: (db, janela) => servicosDaJanela(db, janela),
  },
  'taxa-aprovacao': { modelo: 'servico', carregar: (db, janela) => servicosDaJanela(db, janela) },
  'producao-por-tecnico': {
    modelo: 'servico',
    carregar: (db, janela) => servicosDaJanela(db, janela),
  },
  'nota-media-avaliacao': {
    modelo: 'avaliacao',
    carregar: (db, janela) =>
      db.avaliacao.findMany({
        where: { criadoEm: janela },
        select: { id: true, nota: true, criadoEm: true },
      }),
  },
  'horas-trabalhadas': {
    modelo: 'registroPonto',
    /* Batidas por RELAÇÃO. Ver o bloco do cabeçalho: a forma direta vazaria entre tenants. */
    carregar: (db, janela) =>
      db.registroPonto.findMany({
        where: { data: janela },
        select: {
          id: true,
          tecnicoId: true,
          data: true,
          batidas: { select: { tipo: true, em: true } },
        },
      }),
  },
});

/**
 * O recorte de serviço usado por seis métricas. `status` NÃO entra no `where`: cada cálculo aplica
 * o próprio filtro, e `taxa-aprovacao` precisa justamente dos `pendente` e `rejeitado` que as
 * outras descartam. Filtrar aqui roubaria do denominador dela sem que nada acusasse.
 */
function servicosDaJanela(db, janela) {
  return db.servico.findMany({
    where: { criadoEm: janela },
    select: {
      id: true,
      tecnicoId: true,
      status: true,
      local: true,
      /* `valorCobrado` e `valorMaterial` entram para o drilldown financeiro EXPLICAR o número:
         líquido é cobrado menos material, e sem as parcelas o usuário vê o resultado sem ver a
         conta. Estar no `select` não os torna visíveis — `fieldPolicy` decide isso na saída. */
      valorCobrado: true,
      valorMaterial: true,
      valorLiquido: true,
      comissaoGerada: true,
      criadoEm: true,
      aprovadoEm: true,
    },
    orderBy: { criadoEm: 'asc' },
  });
}

/** Técnicos da empresa — `producao-por-tecnico` precisa deles para o zero explícito. */
export function carregarTecnicos(db) {
  return db.tecnico.findMany({ select: { id: true, nome: true } });
}

/** A empresa do token. `taxa-aprovacao` depende de `aprovacaoServico`, que é config da empresa. */
export function carregarEmpresa(prismaGlobal, empresaId) {
  return prismaGlobal.empresa.findUnique({
    where: { id: empresaId },
    select: { id: true, aprovacaoServico: true },
  });
}

/** Uma métrica é servível quando existe consulta declarada para ela. */
export function temConsulta(metricId) {
  return Object.prototype.hasOwnProperty.call(CONSULTAS, metricId);
}
