/**
 * Fixture do segundo repositorio — contrato.  [SL-BOOT-04 · Onda 0]
 *
 * Fonte: PLAN-F secao AN e PLAN-G secao AN. O contrato exige um repositorio B
 * genuinamente independente do AdmAi, e a validacao acontece muito depois, no
 * SL-AC-02 da onda 12. Por isso este Slice PREPARA e nao VALIDA: o entregavel e um
 * gerador deterministico, um manifesto e um verificador — nao um veredito de
 * portabilidade, que dependeria de um EOS que ainda nao existe.
 *
 * Por que a fixture nasce na onda 0 e so e consumida na onda 12: e o item de maior
 * lead time e menor custo do DAG (PLAN-G secao AZ), e portabilidade e PRECONDICAO
 * do Active, nunca pos-validacao (PLAN-F secao 82).
 *
 * O que a fixture PROVA agora: que existe um repositorio isolado, com identidade
 * diferente, sem premissa do launcher do AdmAi.
 * O que ela NAO prova agora: portabilidade do EOS — isso exige o EOS rodando nela,
 * que e o SL-AC-02. Manter os dois separados e exigencia do MAR-INV-025.
 */

/** Onde o repositorio B e materializado. Fora da worktree autoritativa, por definicao. */
export const CAMINHO_FIXTURE = 'C:/Users/n1iag/dev/admai-worktrees/EOS_FIXTURE_REPO_B';

/**
 * Criterios do PLAN-F secao 81, cada um com o estado que a onda 0 pode atingir.
 *
 * Os quatro estados sao mantidos DISTINTOS de proposito (amendment 002 secao 23):
 * colapsa-los foi a ambiguidade encontrada na onda 0 entre "declarado" e
 * "materializado".
 *   DECLARED    — o contrato exige
 *   MATERIALIZED— existe no filesystem
 *   OBSERVED    — foi medido nesta execucao
 *   VERIFIED    — provado contra oraculo positivo e negativo
 */
export const CRITERIOS = Object.freeze([
  {
    id: 'FIX-01',
    criterio: 'repositoryId diferente do AdmAi',
    alcancavelNaOnda0: 'VERIFIED',
    oraculoNegativo: 'um repositoryId igual ao do AdmAi deve reprovar'
  },
  {
    id: 'FIX-02',
    criterio: 'branch diferente da do AdmAi (politica de branch distinta)',
    alcancavelNaOnda0: 'VERIFIED',
    oraculoNegativo: 'branch igual a fix/seguranca-criticos deve reprovar'
  },
  {
    id: 'FIX-03',
    criterio: 'repositorio git independente: .git proprio, sem alternates',
    alcancavelNaOnda0: 'VERIFIED',
    oraculoNegativo: 'presenca de objects/info/alternates deve reprovar'
  },
  {
    id: 'FIX-04',
    criterio: 'nenhuma premissa do launcher do AdmAi',
    alcancavelNaOnda0: 'VERIFIED',
    oraculoNegativo: 'presenca de .claude/, .codex/ ou start-baseline.ps1 deve reprovar'
  },
  {
    id: 'FIX-05',
    criterio: 'stack diferente quando pratico',
    alcancavelNaOnda0: 'VERIFIED',
    oraculoNegativo: 'dependencia de Express, React, Vite ou Prisma deve reprovar'
  },
  {
    id: 'FIX-06',
    criterio: 'estado de provider isolado',
    alcancavelNaOnda0: 'DECLARED',
    razao: 'exige provider real rodando contra B; owner SL-CX-02 e SL-CL-06',
    oraculoNegativo: 'contexto do repositorio A visivel enquanto B roda deve reprovar'
  },
  {
    id: 'FIX-07',
    criterio: 'bootstrap, snapshot, Kernel, prova, namespace de recurso e lease em B',
    alcancavelNaOnda0: 'DECLARED',
    razao: 'exige o EOS existindo; owner SL-AC-02, onda 12',
    oraculoNegativo: 'qualquer um desses componentes lendo estado de A deve reprovar'
  }
]);

/** Identidade da fixture. Deliberadamente distinta do AdmAi em todos os eixos verificaveis. */
export const IDENTIDADE = Object.freeze({
  repositoryId: 'eos-fixture/repo-b',
  branch: 'fixture/portability-b',
  stack: 'node-plain',            // sem Express, React, Vite ou Prisma
  descricao: 'Fixture minima de portabilidade do EOS. Nao e produto e nao e o AdmAi.'
});

/** O que o AdmAi usa, e que a fixture NAO pode usar, para a stack ser de fato diferente. */
export const STACK_PROIBIDA = Object.freeze(['express', 'react', 'vite', '@prisma/client', 'prisma']);

/** Arquivos cuja simples presenca provaria premissa do launcher do AdmAi. */
export const ARTEFATOS_PROIBIDOS = Object.freeze([
  '.claude', '.codex', '.serena', 'start-baseline.ps1', 'expected-head.txt'
]);
