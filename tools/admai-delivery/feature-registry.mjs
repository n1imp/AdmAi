/**
 * AdmAi — `ADMAI_MASTER_FEATURE_REGISTRY`.
 *
 * A REGRA QUE MOLDA ESTE ARQUIVO
 *   O inventário é DERIVADO do repositório real — rota que existe, modelo que existe no schema,
 *   página que existe, suíte que existe — e nunca da conversa ou da memória. Cada linha é uma
 *   pergunta que este script responde olhando o disco.
 *
 * O TETO DO QUE ESTE SCRIPT PODE CONCEDER
 *   Arquivo existir não é funcionalidade pronta. Teste existir não é teste executado. E teste
 *   executado não é funcionalidade aceita. Este harness já foi pego publicando `6/6 PASS` porque um
 *   arquivo de teste estava no diretório; o `INFLACAO-01` do `feature-graph` existe por causa disso.
 *
 *     backend presente + frontend presente (quando aplicável)
 *     + suíte dirigida existente
 *     + execução APROVADA no Evidence Bundle que a inclui
 *       -> SUITE_APROVADA        <- o TETO derivável
 *
 *   `DONE` fica FORA deste script. Ver a nota longa em `ESTADOS`: conceder `DONE` por suíte
 *   aprovada produziu 17 de 22 e zero bloqueador P0 aberto, o que se lê como "quase pronto para
 *   vender" e não é o que a evidência diz.
 *
 * O QUE ISTO NÃO PROVA
 *   Que a funcionalidade está CORRETA ou COMPLETA para o usuário final. Prova que as peças existem e
 *   que as propriedades COBERTAS PELA SUÍTE se sustentam. O que a suíte cobre e o que o
 *   `acceptanceCriteria` pede são coisas diferentes, e a diferença é justamente o trabalho restante.
 *
 * PRIORIDADE É JULGAMENTO
 *   `P0_RELEASE_BLOCKER`..`P3_FUTURE` não é derivável do código. Sai marcada como
 *   `provenance: 'JULGAMENTO'` em cada linha, para que ninguém a leia como observação.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { RAIZ } from './snapshot.mjs';
import { flagsDoModulo, recusarDesconhecida } from './cli.mjs';

/** [H-01.9] Não escreve: observa o repositório e imprime. */
export const MODO_DE_ACESSO = 'READ_ONLY';

/** [H-01.3] Derivado da fonte deste módulo. */
export const FLAGS = flagsDoModulo(import.meta.url);

/**
 * Estados. `DONE` NAO e derivavel — e por isso que ele esta separado dos outros.
 *
 * A primeira versao concedia `DONE` quando as pecas existiam e a suite dirigida passava. O resultado
 * foi 17 `DONE` de 22 e zero bloqueador P0 aberto, o que se le como "quase pronto para vender". Mas
 * `SERVICOS_CRUD` ganhou `DONE` porque duas suites especificas passam — servico atual e paginacao
 * keyset —, nao porque o ciclo `Cliente -> Servico -> Execucao -> Conclusao -> Financeiro` foi
 * aceito. E `BILLING` ganhou `DONE` enquanto o proprio criterio exige o veredito do gate comercial
 * definido, e o veredito conhecido e `BILLING_GATE_ABSENT_WITH_TESTED_SCOPE`.
 *
 * Suite dirigida provar suas PROPRIEDADES nao e a funcionalidade estar PRONTA. Confundir os dois e a
 * mesma inflacao que o `INFLACAO-01` policia no `feature-graph`, um nivel acima. Entao o estado mais
 * forte que este script concede diz exatamente o que ele observou, e `DONE` exige um julgamento de
 * aceitacao que nenhum script deriva.
 */
export const ESTADOS = Object.freeze([
  'SUITE_APROVADA',      // pecas presentes + suite dirigida EXECUTADA e aprovada. O teto derivavel.
  'IMPLEMENTADO',        // pecas presentes, sem suite dirigida ou sem execucao aprovada
  'PARCIAL',             // alguma peca presente
  'NAO_INICIADO',
  'BLOQUEADO',
  'DEFERIDO'
]);

/** Estado que exige julgamento humano de aceitacao. Nunca sai da DERIVACAO. */
export const EXIGE_JULGAMENTO = Object.freeze(['DONE']);

/**
 * Aceitação — dimensão DECLARADA, não derivada.
 *
 * `status` responde "o que existe no repositório?" e é observação. `acceptance` responde "isto serve
 * para release?" e é julgamento, exatamente como `priority`. Misturar os dois foi o que produziu a
 * primeira versão inflada deste arquivo.
 *
 * `DESCONHECIDA` é o default, e é o único estado que o milestone `ADMAI_P0_ACCEPTANCE_COMPLETE` não
 * admite ao final: desconhecido não é aprovado nem reprovado, e deixá-lo passar seria a mesma
 * omissão que `UNKNOWN_DIFFERENCE` virando "nenhum bloqueio".
 */
export const ACEITACOES = Object.freeze(['DONE', 'PARTIAL', 'BLOCKED', 'DESCONHECIDA']);

/** Campos obrigatórios de um gap. Gap sem eles não diz o que falta — diz que algo falta. */
export const CAMPOS_DO_GAP = Object.freeze([
  'id', 'claim', 'affectedUserFlow', 'evidence', 'requiredBehavior', 'currentBehavior', 'releaseImpact'
]);

/**
 * Coerência entre aceitação e gaps. PURA — as sabotagens atravessam aqui.
 *
 * `PARTIAL` sem gap é exatamente a frase que a diretiva proíbe: *"precisa de melhorias"*. `DONE` com
 * gap aberto é contradição. E gap sem `requiredBehavior`/`currentBehavior` não permite agir — diz
 * que algo falta sem dizer o quê.
 */
/* Classes de impacto de release. Enumeracao fechada: um gap cujo impacto nao pertence a esta lista
   nao e classificavel, e nao classificavel nao entra em fila de priorizacao. */
/**
 * Observação de RUNTIME, ao lado de `acceptance`. Terceira dimensão, e ela existe por um motivo
 * concreto: todo `DONE` deste Registry foi concedido sobre suíte de integração, e o critério de
 * release exige `implementação + testes + runtime correto + fluxo observável`. Sem um campo para
 * isso, o instrumento não conseguia nem EXPRESSAR a diferença — então afirmava aceitação numa
 * dimensão que ninguém tinha medido.
 *
 *   PASS        observado no produto rodando, com o fluxo exercitado de verdade
 *   FAIL        observado e não funciona
 *   NA          não tem superfície observável (contrato transversal, política)
 *   NOT_TESTED  ainda não olhado — e isto NÃO é PASS
 */
export const RUNTIMES = Object.freeze(['PASS', 'FAIL', 'NA', 'NOT_TESTED']);

export const IMPACTOS = Object.freeze([
  'FUNCTIONAL', 'SECURITY', 'COMMERCIAL', 'VERIFICATION', 'OPERATIONAL', 'UX', 'EXTERNAL_BLOCKER'
]);

export function violacoesDeAceitacao(f) {
  const fora = [];
  const acc = f.acceptance ?? 'DESCONHECIDA';
  if (!ACEITACOES.includes(acc)) {
    fora.push(`${f.featureId}: aceitacao fora da taxonomia (${acc})`);
    return fora;
  }

  const gaps = f.gaps ?? [];
  if ((acc === 'PARTIAL' || acc === 'BLOCKED') && gaps.length === 0) {
    fora.push(`${f.featureId}: ${acc} sem gap nomeado — "precisa de melhorias" nao e diagnostico`);
  }
  if (acc === 'DONE' && gaps.length > 0) {
    fora.push(`${f.featureId}: DONE com ${gaps.length} gap(s) aberto(s)`);
  }
  /* A regra que fecha o buraco: feature com tela NÃO chega a DONE sem ter sido vista rodando.
     `f.length > 0` é o que distingue user-facing de contrato transversal — quem tem página tem
     como ser observado, e por isso deve ser. [RUNTIME-RECONCILIACAO] */
  const temTela = (f.f ?? []).length > 0;
  if (acc === 'DONE' && temTela && f.runtime !== 'PASS') {
    fora.push(`${f.featureId}: DONE com tela mas runtime=${f.runtime ?? 'ausente'} — SUITE_APROVADA != DONE`);
  }
  if (f.runtime && !RUNTIMES.includes(f.runtime)) {
    fora.push(`${f.featureId}: runtime fora da taxonomia (${f.runtime})`);
  }

  for (const g of gaps) {
    /* `releaseImpact` sai da heuristica de comprimento e passa a ser validado contra a taxonomia.
       O piso de 3 caracteres reprovava `UX`, que e classe legitima, e ao mesmo tempo deixava passar
       qualquer palavra inventada de 3 letras. Comprimento nunca foi o criterio certo para um campo
       enumerado — so para os campos em prosa, onde continua valendo. */
    const prosa = CAMPOS_DO_GAP.filter((c) => c !== 'releaseImpact');
    const faltando = prosa.filter((c) => typeof g[c] !== 'string' || g[c].trim().length < 3);
    if (faltando.length) fora.push(`${f.featureId}/${g.id ?? '(sem id)'}: gap sem ${faltando.join(', ')}`);
    if (!IMPACTOS.includes(g.releaseImpact)) {
      fora.push(`${f.featureId}/${g.id ?? '(sem id)'}: releaseImpact fora da taxonomia (${g.releaseImpact})`);
    }
  }
  return fora;
}
export const PRIORIDADES = Object.freeze([
  'P0_RELEASE_BLOCKER', 'P1_MVP_REQUIRED', 'P2_POST_LAUNCH', 'P3_FUTURE'
]);

/* ------------------------------------------------------------------ *
 * Observação do repositório
 * ------------------------------------------------------------------ */

const lista = (dir, filtro) =>
  (existsSync(`${RAIZ}${dir}`) ? readdirSync(`${RAIZ}${dir}`).filter(filtro) : []);

export function observarProduto() {
  const schema = existsSync(`${RAIZ}chaveiro-bot/prisma/schema.prisma`)
    ? readFileSync(`${RAIZ}chaveiro-bot/prisma/schema.prisma`, 'utf8') : '';

  const bundlePath = `${RAIZ}docs/eos-v2/EVIDENCE_BUNDLE.json`;
  let bundle = null;
  try { bundle = existsSync(bundlePath) ? JSON.parse(readFileSync(bundlePath, 'utf8')) : null; } catch { bundle = null; }

  /* A suíte `bot:integration` roda TODAS as suítes do diretório numa execução. Quando ela sai
     `PASS` com `exitCode 0`, cada suíte presente foi executada e passou — essa é a evidência que
     `DONE` consome. Se a execução não existir ou não for aprovada, nenhuma feature alcança `DONE`,
     e isso aparece explicitamente em vez de degradar em silêncio. */
  const integracaoAprovada = (bundle?.execucoes ?? [])
    .some((e) => e.id === 'bot:integration' && e.estado === 'PASS' && e.exitCode === 0);

  return {
    modelos: new Set([...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1])),
    rotas: new Set(lista('chaveiro-bot/src/routes', (f) => f.endsWith('.js'))),
    services: new Set(lista('chaveiro-bot/src/services', () => true)),
    /* Backend nem sempre e rota ou middleware. `OBSERVABILIDADE` lia como NAO_INICIADO tendo
       `/health`, logger com redacao e Sentry no repo — o status deriva do que a entrada DECLARA, e
       nao havia campo capaz de declarar modulo de `utils`/`config`. Feature subdeclarada lendo
       como nao iniciada e observacao falsa, nao conservadorismo. */
    modulos: new Set([
      ...lista('chaveiro-bot/src/services', (f) => f.endsWith('.js')),
      ...lista('chaveiro-bot/src/utils', (f) => f.endsWith('.js')),
      ...lista('chaveiro-bot/src/config', (f) => f.endsWith('.js'))
    ]),
    middlewares: new Set(lista('chaveiro-bot/src/middlewares', (f) => f.endsWith('.js'))),
    paginas: new Set(lista('chaveiro-painel/src/pages', (f) => f.endsWith('.jsx'))),
    suites: new Set(lista('chaveiro-bot/test/integration', (f) => f.endsWith('.test.js'))),
    /* Conjunto SEPARADO de proposito. Juntar unidade com integracao faria uma prova com client
       mockado satisfazer um criterio sobre comportamento de sistema — e e exatamente essa
       diferenca que GAP-EST-01 e GAP-WPP-01 afirmam. Separado, o registry consegue citar a
       evidencia de unidade que realmente existe sem deixa-la passar por integracao. */
    suitesUnidade: new Set([
      ...lista('chaveiro-bot/src/services/__tests__', (f) => f.endsWith('.test.js')),
      ...lista('chaveiro-bot/src/routes/__tests__', (f) => f.endsWith('.test.js')),
      ...lista('chaveiro-bot/src/utils/__tests__', (f) => f.endsWith('.test.js')),
      ...lista('chaveiro-bot/src/config/__tests__', (f) => f.endsWith('.test.js'))
    ]),
    integracaoAprovada,
    headDoBundle: bundle?.ambiente?.head ?? null
  };
}

/* ------------------------------------------------------------------ *
 * As features, com dependências como PREDICADOS sobre o observado
 * ------------------------------------------------------------------ */

/**
 * `b` rota · `m` middleware · `f` página · `t` suíte de integração · `p` prioridade (JULGAMENTO)
 *
 * `m` existe porque feature TRANSVERSAL não tem rota nem página próprias: a implementação de
 * `SEGURANCA` mora no middleware que todas as rotas atravessam. Sem essa dimensão ela caía em
 * `PARCIAL` por não ter âncora — e a alternativa seria apontá-la para uma rota qualquer, que é
 * forjar a âncora em vez de nomeá-la.
 */
const F = (area, id, name, description,
  { b = [], m = [], f = [], t = [], u = [], s = [], p, releaseRequired, acceptance, blocker,
    acc = 'DESCONHECIDA', gaps = [], runtime = 'NOT_TESTED', papeis = [] }) =>
  ({ area, featureId: id, name, description, b, m, f, t, u, s, priority: p, releaseRequired,
    runtime, papeis,
    acceptanceCriteria: acceptance, blockerReason: blocker ?? null,
    /* JULGAMENTO, ao lado de `priority`. Default `DESCONHECIDA`: o sweep é quem preenche. */
    acceptance: acc, gaps });

export const FEATURES = Object.freeze([
  /* ---- Identidade / SaaS ---- */
  F('Identidade', 'AUTH_LOGIN', 'Login e sessão', 'Autenticação, refresh token, sessão de usuário',
    { b: ['auth.js'], f: ['Login.jsx'], t: ['auth.test.js', 'refresh_rotacao_sessao.test.js'], p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true,
      acceptance: 'login, refresh e expiração de sessão provados por suíte dirigida',
      /* GAP-AUTH-01 FECHADO. `refresh_rotacao_sessao.test.js`: 12 casos, com controle POSITIVO
         primeiro (renovacao legitima funciona e o token renovado autentica), depois rotacao
         (token usado morre, cookie novo difere, um registro sai e um entra sem derrubar as outras
         sessoes), expiracao, usuario inativo, cookie ausente, cookie inexistente, logout e
         isolamento entre usuarios. Provado que MORDE: removida a linha da rotacao, falham
         exatamente os dois casos de rotacao. */
      acc: 'DONE' }),
  F('Identidade', 'AUTH_2FA', '2FA e recuperação', 'TOTP, códigos de recuperação, anti-bruteforce',
    { b: ['auth.js'], f: ['Seguranca.jsx', 'RecuperarSenha.jsx'], t: ['conta_2fa_bruteforce.test.js', 'recuperacao_2fa.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'NOT_TESTED', papeis: [], releaseRequired: true,
      acceptance: 'bruteforce barrado e recuperação provada',
      /* REBAIXADO pela reconciliacao de runtime. `POST /me/2fa/setup` foi observado devolvendo
         segredo e otpauthUrl, mas ATIVAR e depois LOGAR com o codigo nao foi exercitado — e e o
         login com 2FA que decide se a feature serve. Observar meio fluxo e observar meio fluxo. */
      acc: 'PARTIAL',
      gaps: [{
        id: 'GAP-2FA-RT',
        claim: 'ativação do 2FA e login com código nunca foram exercitados no produto',
        affectedUserFlow: 'dono ativa 2FA e volta a entrar na conta no dia seguinte',
        evidence: 'runtime: POST /me/2fa/setup devolve 200 com secret e otpauthUrl; nenhuma observação de ativação nem de login subsequente com TOTP',
        requiredBehavior: 'ativar 2FA, sair, e entrar de novo usando o código do autenticador',
        currentBehavior: 'a suíte cobre bruteforce e recuperação; o caminho feliz completo não foi visto rodando',
        releaseImpact: 'VERIFICATION'
      }] }),
  F('Identidade', 'MULTI_TENANCY', 'Multi-tenancy', 'Isolamento por empresa em toda leitura e escrita',
    { b: ['api.js'], t: ['rls.test.js', 'idor_leitura_cross_tenant.test.js', 'idor_escrita_cross_tenant.test.js', 'vazamento_colecao_cross_tenant.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true, acceptance: 'nenhum vetor material de leitura, escrita ou coleção cruza tenant',
      acc: 'DONE' }),
  F('Identidade', 'RBAC', 'RBAC e permissões', 'Dono, Gestor, Funcionário; requirePermissao no backend',
    { b: ['api.js'], f: ['Usuarios.jsx'], t: ['rbac_privilege_escalation.test.js', 'e2e_rbac_ponto.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true, acceptance: 'escalação de privilégio barrada no backend',
      acc: 'DONE' }),
  F('Identidade', 'ONBOARDING', 'Cadastro e convite', 'Cadastro com OTP, convite de usuário, verificação de e-mail',
    { b: ['account.js'], f: ['ConviteAceitar.jsx', 'VerificarEmail.jsx', 'MagicLink.jsx'],
      t: ['cadastro_otp.test.js', 'troca_email_confirmacao.test.js', 'convite_aceite.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono'], releaseRequired: true,
      acceptance: 'fluxo completo de entrada de empresa e de usuário convidado',
      /* GAP-ONB-01 FECHADO. `convite_aceite.test.js`: 10 casos exercitando o endpoint REAL de
         criacao e capturando o token do e-mail mockado — ler o hash do banco e forjar um token
         provaria a minha reimplementacao do hash, nao o produto.
         Controle POSITIVO primeiro (descreve, aceita, sessao serve), depois empresa e papel
         corretos, consumo unico, expirado, token inventado, senha fraca que NAO consome o convite,
         e isolamento entre empresas. Provado que MORDE: removida a marcacao de `aceitoEm`, falha
         exatamente o caso de consumo unico. */
      acc: 'DONE' }),

  /* ---- Núcleo operacional ---- */
  F('Serviços', 'SERVICOS_CRUD', 'Serviços', 'Criação, edição, status, execução, conclusão e histórico',
    { b: ['servicos.js'], f: ['Servicos.jsx', 'NovoServico.jsx', 'MeusServicos.jsx'],
      t: ['servico_atual.test.js', 'servicos_keyset.test.js'], p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true,
      /* Criterio CORRIGIDO no sweep. A versao anterior pedia "ciclo Cliente -> Servico -> ...", e
         NAO EXISTE entidade Cliente: o cliente e capturado como `clienteNome`/`clienteTelefone` no
         proprio `Servico` (schema.prisma:138-140). Pedir CRUD de Cliente seria inventar requisito
         que o repositorio nao sustenta. */
      acceptance: 'ciclo Serviço (com cliente capturado no próprio registro) -> Execução -> Conclusão provado ponta a ponta',
      acc: 'DONE' }),
  F('Serviços', 'APROVACOES', 'Aprovação e rejeição', 'Fluxo de aprovação de serviço pelo gestor',
    { f: ['Aprovacoes.jsx'],
      t: ['e2e_rbac_ponto.test.js', 'idor_escrita_cross_tenant.test.js', 'aprovacao_rejeicao_estoque.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['gestor'], releaseRequired: true,
      acceptance: 'aprovar e rejeitar com efeito em comissão e financeiro',
      /* APROVAR esta provado ponta a ponta: `e2e_rbac_ponto` percorre funcionario -> servico
         pendente -> aprovacao contabilizando comissao, e a rota (servicos.js:250) faz a transicao
         pendente->ativo com `aprovadoPor`/`aprovadoEm` e dispara a baixa de estoque.
         REJEITAR nao. A unica cobertura de `/servicos/:id/rejeitar` e o negativo cross-tenant
         (idor_escrita_cross_tenant.test.js:171): prova que a empresa B NAO rejeita servico da A.
         Controle negativo sem positivo e exatamente o padrao que o paragrafo 12 proibe — um
         endpoint que recusasse TODA rejeicao passaria nesse teste.
         GAP-APV-01 FECHADO. `aprovacao_rejeicao_estoque.test.js` da o positivo que faltava:
         rejeicao legitima devolve 200, grava `rejeitado` e `aprovadoPor`; rejeitar de novo devolve
         409 e id inexistente devolve 404 (a rota distingue "outra pessoa ja resolveu" de "nao
         existe", e o teste impede o colapso dos dois em 404 de voltar); e servico rejeitado nao
         pode ser aprovado depois.
         O efeito em comissao ja estava decidido na camada de calculo: `metricas/calculo.js` carrega
         no fixture um servico `rejeitado` com comissao, justamente para provar que ele nao entra no
         agregado. */
      acc: 'DONE' }),
  F('Técnicos', 'TECNICOS', 'Técnicos e funcionários', 'Cadastro, acesso, permissões, serviços associados',
    { b: ['tecnicos.js'], f: ['Tecnicos.jsx', 'NovoTecnico.jsx', 'PerfilTecnico.jsx'], t: ['tecnico_criacao.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'funcionario'], releaseRequired: true, acceptance: 'criação, acesso e vínculo com serviço',
      acc: 'DONE' }),
  F('Estoque', 'ESTOQUE', 'Estoque e materiais', 'Materiais, movimentação, baixa, integração com serviço',
    { b: ['estoque.js'], f: ['Estoque.jsx', 'Catalogo.jsx', 'NovoServicoFuncionario.jsx'],
      u: ['estoque.test.js'],
      t: ['aprovacao_rejeicao_estoque.test.js', 'materiais_servico_funcionario.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true,
      /* CRITERIO CORRIGIDO. A versao anterior dizia "ao concluir servico" e o gatilho real nao e a
         conclusao: `darBaixaPorServico` roda no REGISTRO com materiais (servicos.js:232,
         servico.js:59) e na APROVACAO do servico pendente (servicos.js:270). Descrever o gatilho
         errado faria o criterio medir um caminho que nao existe. */
      acceptance: 'baixa automática ao registrar/aprovar serviço com material, com movimentação rastreável',
      /* Implementado e coberto em UNIDADE com o client mockado: delta atomico que nao zera o que
         outro gravou, saldo nunca negativo, material de outro tenant tratado como inexistente,
         tolerancia a falha por item. A movimentacao fica em `MovimentacaoEstoque` e e listavel em
         `GET /estoque/movimentacoes` (estoque.js:249).
         GAP-EST-01 FECHADO no que era verificacao: `aprovacao_rejeicao_estoque.test.js` prova
         contra PostgreSQL real que registrar servico com material decrementa o saldo (10 -> 7),
         grava o vinculo `ServicoMaterial`, deixa a movimentacao de SAIDA rastreavel com
         `saldoApos` e `servicoId`, e recusa material de outra empresa sem mexer no saldo dela.
         E ABRIU o que a verificacao escondia: o ramo de baixa na APROVACAO nunca rodava. A suite
         de unidade passava porque testa a funcao, e a funcao esta certa; errado era o caminho que
         deveria chama-la — distincao que so integracao faz.

         GAP-EST-02 FECHADO sob a decisao material D-EST-02, em consenso com o Codex Decisor
         (thread 01a0278a-aae2-7bd1-bb35-13c67519170d). O funcionario passa a DECLARAR material; a
         baixa continua sendo da aprovacao. Duas restricoes vieram do Decisor contra a posicao
         inicial do Claude, e as duas fechavam furo real:
           1. materiais do funcionario SO com `aprovacaoServico` ligada — sem ela o servico nasce
              `ativo` e a baixa sairia por acao do proprio funcionario, sem gestor no caminho; a
              versao incondicional REDUZIA protecao em vez de fechar buraco;
           2. transicao `pendente -> ativo` por reivindicacao atomica (`updateMany` filtrando
              `{ id, empresaId, status }`), porque tornar o ramo alcancavel expunha uma corrida de
              dupla aprovacao que daria duas baixas do mesmo material.
         15 casos, os 7 exigidos pelo Decisor inclusos. A atomicidade tem sonda de mutacao: com
         `update` cego no lugar do `updateMany` filtrado, as duas aprovacoes concorrentes voltam
         200 e o caso falha.

         NAO fechado, e nao alegado como fechado: `NovoServicoFuncionario.jsx` nao envia
         `materiais`. Isto fecha a alcancabilidade pela API, que era o escopo autorizado; o fluxo
         do painel continua aberto.

         GAP-EST-03 FECHADO, e o caminho para fecha-lo revelou um segundo bloqueio que eu nao
         tinha visto. Poe o seletor na tela do funcionario nao bastava: `MaterialPicker` consome
         `GET /materiais`, protegido por `estoque:ver`, e `PRESET_FUNCIONARIO` zera todos os
         modulos de empresa. O seletor renderizaria e tomaria 403 — capacidade provada no backend,
         inalcancavel por quem precisa dela. Quem apontou foi o Codex Decisor (D-EST-03).

         Conceder a permissao resolveria o 403 e criaria coisa pior: aquele payload leva
         `precoUnit`, `precoVenda`, `estoqueMinimo`, `quantidadeAtual` e contagem de uso — custo,
         margem e inventario para quem so precisa escolher um item.

         O usuario autorizou o corte por NECESSIDADE: `GET /me/materiais-servico`, sob assinatura
         ativa e `podeProprio(registrar_servico)`, tenant-scoped, devolvendo id, nome e unidade.
         `GET /materiais` segue 403 para funcionario, e ha caso dedicado que reprova se alguem
         "resolver" isso concedendo a permissao. A assercao do payload compara CONJUNTO DE CHAVES,
         nao ausencia campo a campo: campo novo no modelo reprova ate ser incluido de proposito.

         `aprovacaoServico` passou a sair em `GET /me/permissoes` (D-EST-03 opcao A), lido do banco
         a cada requisicao — do JWT, um token emitido antes da virada carregaria o regime errado
         ate expirar. Isso NAO e autorizacao: quem decide continua sendo `servicos.js`, e ha dois
         casos mandando `materialId` de outro tenant e inexistente direto no POST para provar que
         a defesa que conta roda no servidor.

         14 casos de integracao mais 6 no painel, incluindo o fluxo inteiro: contexto -> catalogo
         -> registro `pendente` com vinculo e estoque INTACTO -> aprovacao -> baixa unica com
         `servicoId`. O seletor fica escondido sem aprovacao e tambem quando o contexto falha —
         campo ausente e frustracao, campo que aceita entrada e depois derruba o registro e
         trabalho perdido em campo. */
      acc: 'DONE' }),
  F('Financeiro', 'FINANCEIRO', 'Financeiro e comissão', 'Valor cobrado, custo de material, comissão, receita líquida',
    /* `metricas.test.js` entrou na evidencia durante o sweep: e ele que prova o CALCULO contra
       dataset conhecido, e o criterio pede calculo E politica. A declaracao anterior citava so a
       politica por campo, o que subdeclarava a evidencia existente. */
    { f: ['Reparticao.jsx'], t: ['metricas_campo_seguranca.test.js', 'metricas.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor'], releaseRequired: true,
      acceptance: 'cálculo correto e política por campo aplicada no backend',
      acc: 'DONE' }),

  /* ---- Métricas e dashboard ---- */
  F('Dashboard', 'METRIC_FOUNDATION', 'Fundação de métricas', 'Contrato, registro, cálculo e exposição',
    { b: ['metricas.js'], f: ['Dashboard.jsx'], t: ['metricas.test.js', 'metricas_exposicao.test.js', 'me_metricas.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['dono', 'funcionario'], releaseRequired: true, acceptance: 'número correto, autorizado e explicável',
      /* Os tres termos do criterio tem suite dirigida propria, e nenhuma delas prova o mesmo:
         CORRETO    `metricas.test.js` calcula contra dataset conhecido;
         AUTORIZADO `metricas_exposicao.test.js` prova que o campo sensivel nao sai para quem nao pode;
         EXPLICAVEL `me_metricas.test.js` fixa o contrato de resposta e o filtro de periodo, com
                    periodo invalido recusado e isolamento multi-tenant. */
      acc: 'DONE' }),
  F('Dashboard', 'METRIC_HUBS', 'Metric Hubs', 'Duas verticais com drilldown e segurança por campo',
    { f: ['MetricHub.jsx', 'MetricHubReceita.jsx', 'MetricHubShell.jsx'], t: ['metricas_campo_seguranca.test.js'],
      p: 'P2_POST_LAUNCH', runtime: 'NOT_TESTED', papeis: [], releaseRequired: false, acceptance: 'hubs para as 8 métricas implementáveis' }),
  F('Dashboard', 'INDICADORES', 'Indicadores do gestor', 'Agregados e visão operacional',
    { f: ['GestorHome.jsx', 'MeuPainel.jsx'], t: ['gestor_indicadores.test.js', 'dashboard_groupby.test.js', 'aggregate_perfil_dashboard.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['dono', 'funcionario'], releaseRequired: true, acceptance: 'agregados consistentes com os registros',
      /* `dashboard_groupby.test.js` monta dataset conhecido e confere escalares e os tres
         agrupamentos (porTecnico, porLocal, evolucaoDiaria) contra ele, incluindo periodo vazio —
         que e onde agregado costuma inventar linha. `gestor_indicadores` cobre resposta unica,
         403 para funcionario e isolamento entre empresas. Consistencia com os registros e
         exatamente o que a comparacao contra dataset conhecido decide. */
      acc: 'DONE' }),

  /* ---- Ponto ---- */
  F('Ponto', 'PONTO', 'Registro de ponto', 'Batida, localização, selfie, antifraude, banco de horas',
    { f: ['MeuPonto.jsx'], t: ['e2e_rbac_ponto.test.js'], u: ['ponto.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['funcionario'], releaseRequired: true,
      /* CRITERIO PRECISADO, nao afrouxado. "Antifraude" ficava vago o bastante para ser lido como
         rejeicao automatica de batida — que o repositorio nao implementa e que exigir seria
         inventar requisito (paragrafo 10). O antifraude real e do desenho: `BatidaPonto.em` e
         timestamp do SERVIDOR, entao o funcionario nao forja o horario, e lat/lng/precisao/selfieUrl
         ficam gravados como prova para conferencia humana.
         "Banco de horas" existe — nao com esse nome de campo, e sim como `calcularDia`/`resumoMes`
         em services/ponto.js, gravando `totalMinutos`/`horaExtraMinutos`. */
      acceptance: 'batida com horário do servidor e prova capturada (geo/selfie), banco de horas calculado por modalidade e conferível pelo gestor',
      /* `ponto.test.js` cobre 17 casos: a maquina do dia nos quatro estados com timestamp do
         servidor, dia ja completo sem regravar, e HE/saldo por modalidade (CLT 8h, meio periodo 6h,
         12x36 12h, autonomo sem banco). `e2e_rbac_ponto` percorre o fluxo com selfie e geo.
         Conferivel: `GET /tecnicos/:id/ponto/relatorio` sob `requirePermissao('ponto','ver')`, com
         isolamento cross-tenant provado em `idor_leitura_cross_tenant`. */
      acc: 'DONE' }),

  /* ---- Billing ---- */
  F('Billing', 'BILLING', 'Assinatura e trial', 'Trial, assinatura, enforcement, expiração e bloqueio',
    { b: ['billing.js'], t: ['billing_access_audit.test.js', 'assinatura_cadastro.test.js', 'billing_google_auth.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true,
      acceptance: 'veredito BILLING_GATE definido e enforcement provado nas rotas que ele deve barrar',
      /* GAP-BILL-01 FECHADO. Decisao do usuario: trial -> paywall. `middlewares/assinatura.js`
         implementa o enforcement, montado em `api.js` numa posicao FAIL-CLOSED: depois de auth,
         account e billing (que atendem e retornam antes), e antes de tudo que e produto. Router
         novo nasce protegido.
         O audit inverteu: onde exigia "nenhuma rota bloqueou", exige "nenhuma rota de produto
         passou" — e ganhou a familia PAYWALL_EXCESSIVO, que prova que pagar, ver-se e sair
         continuam funcionando. Veredito agora: BILLING_GATE_PRESENT.
         Suite completa: 35 arquivos, 225 testes, nenhuma regressao. */
      acc: 'DONE' }),

  /* ---- Integrações ---- */
  F('WhatsApp', 'WHATSAPP', 'WhatsApp', 'Provider, webhooks, entrada, saída, filas, feature flags',
    { b: ['whatsapp.js'], f: ['ConfiguracaoBot.jsx'],
      t: ['inbound_numero_unico.test.js', 'inbound_idempotencia.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'NOT_TESTED', papeis: [], releaseRequired: true,
      acceptance: 'entrada e saída com idempotência e isolamento por empresa',
      /* ENTRADA e SAIDA provadas juntas: `inbound_numero_unico` entra pelo webhook e verifica a
         mensagem que SAI — saudacao com nome do tecnico, menu de desambiguacao com os nomes das
         empresas, e a resposta "1" transicionando a sessao para a 1a empresa. Isolamento por
         empresa e o proprio menu de desambiguacao: o mesmo numero em duas empresas precisa
         escolher antes de registrar.
         GAP-WPP-01 FECHADO. `inbound_idempotencia.test.js` reentrega o mesmo `key.id` e prova que
         a segunda volta `duplicado: true`, nao chama o gateway de novo e nao avanca a sessao; que
         id diferente com o mesmo texto PASSA (a guarda e por evento, nao por conteudo); e que a
         chave `wa:<id>` e global, sem o jid.
         Duas coisas ficaram registradas porque nao dava para prova-las sem expor:
         a guarda e FAIL-OPEN — sem Redis, `marcarSeNovo` devolve true e a mensagem e processada;
         a assercao central e `duplicado: true` justamente para o teste FALHAR nesse cenario em vez
         de passar sem que exista idempotencia. E evento sem `key.id` pula a guarda inteira: e o
         controle de sensibilidade do arquivo e, ao mesmo tempo, o limite real da protecao. */
      acc: 'PARTIAL',
      gaps: [{
        id: 'GAP-WPP-RT',
        claim: 'o fluxo de WhatsApp nunca foi observado no produto rodando',
        affectedUserFlow: 'técnico manda mensagem no WhatsApp e o serviço aparece no painel',
        evidence: 'a suíte chama rotearMensagemInbound direto, sem passar por webhook; no runtime local o robô fica inerte e não há provider conectado para exercitar a ponta',
        requiredBehavior: 'mensagem real entra pelo webhook e vira serviço visível no painel',
        currentBehavior: 'coberto por suíte, não observado em runtime — o gateway depende de provider externo indisponível localmente',
        releaseImpact: 'VERIFICATION'
      }] }),
  F('Google', 'GOOGLE_REVIEWS', 'Google Reviews', 'Conta Google, avaliações, análise',
    { b: ['google.js'], f: ['Avaliacoes.jsx'], t: ['billing_google_auth.test.js'],
      p: 'P2_POST_LAUNCH', runtime: 'NOT_TESTED', papeis: [], releaseRequired: false, acceptance: 'coleta e análise de avaliações' }),

  /* ---- Documentos, notificações, config ---- */
  F('Documentos', 'DOCUMENTOS', 'Documentos e uploads', 'Upload, storage, documento de técnico',
    { b: ['documentos.js'], f: ['Documentos.jsx'],
      t: ['documentos.test.js', 'documentos_storage.test.js'], u: ['documentos-storage-key.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'FAIL', papeis: ['dono', 'funcionario'], releaseRequired: true,
      acceptance: 'upload isolado por tenant e chave de storage não adivinhável',
      /* Os dois termos tem prova separada, e essa separacao importa: `documentos.test.js` cobre o
         ciclo CRUD, a validacao de MIME contra o conteudo real (data URI invalida e tipo
         desconhecido recusados), posse e isolamento multi-tenant; a chave nao adivinhavel e
         decidida por `documentos-storage-key.test.js`, porque isolamento por tenant no banco nao
         protege objeto cujo caminho de storage seja derivavel.

         ACEITACAO REVERTIDA de DONE para PARTIAL sobre evidencia nova, nao sobre mudanca de
         criterio. `docs/GO_LIVE_CHECKLIST.md` A9 registra, do smoke test real de 2026-08-05,
         `POST /me/documentos` respondendo 500 em PRODUCAO — o caminho principal de escrita da
         feature. Declarar DONE com isso registrado no proprio repositorio seria exatamente a
         aceitacao inferida que o milestone proibe.

         A causa estava escrita aqui desde sempre: `server.js:53-58` avisa no boot que, com
         `DOCUMENTOS_ENABLED=true` e storage configurado, bucket ausente faz o upload responder
         500 — `uploadPrivado` lanca e nao ha fallback pro disco. O codigo esta CORRETO; o bucket
         `documentos-tecnico` nao existe no projeto Supabase de producao.

         E a razao de ninguem ter visto: `documentos.js:129` bifurca em `storageHabilitado()`, que
         e falso em teste. Toda a suite entrava pelo disco. `documentos_storage.test.js` (10 casos)
         fecha esse ramo — inclusive o caso exato do bucket ausente, a ausencia de linha orfa
         quando o upload falha, e a recusa de fallback silencioso pro disco. Terceira ocorrencia
         nesta frente da mesma classe: estrutura presente, caminho real nao exercitado. */
      acc: 'PARTIAL',
      gaps: [{
        id: 'GAP-DOC-01',
        claim: 'o bucket de documentos não existe em produção e o upload responde 500',
        affectedUserFlow: 'funcionário anexa contrato ou documento pessoal pelo app',
        evidence: 'docs/GO_LIVE_CHECKLIST.md A9 — smoke test real de 2026-08-05, POST /me/documentos → 500, reproduzível. Causa antecipada por server.js:53-58, que loga o aviso no boot. Nada no código cria o bucket; a provisão é a ferramenta já existente `npm run bucket:provision`',
        requiredBehavior: 'o funcionário anexa um documento e ele sobe, fica listado e volta a abrir',
        currentBehavior: 'o upload responde 500 em produção enquanto o bucket documentos-tecnico não for provisionado; em dev/test grava em disco e passa, o que escondeu o problema',
        releaseImpact: 'FUNCTIONAL'
      }] }),
  F('Notificações', 'NOTIFICACOES', 'Notificações', 'Notificação in-app e e-mail',
    { f: ['Notificacoes.jsx'], p: 'P2_POST_LAUNCH', runtime: 'PASS', papeis: ['dono', 'funcionario'], releaseRequired: false, acceptance: 'entrega e leitura' }),
  F('Configurações', 'CONFIGURACOES', 'Configurações e preferências', 'Configuração da empresa e preferências do usuário',
    { f: ['Configuracao.jsx', 'Perfil.jsx'], t: ['preferencias.test.js'], p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: ['dono', 'gestor'], releaseRequired: true,
      acceptance: 'preferências persistidas por usuário',
      /* `preferencias.test.js`: round-trip, merge que preserva namespace vizinho (o defeito classico
         e a gravacao de um namespace apagar o outro), isolamento por usuario e 401 sem sessao.
         O criterio cobre a preferencia do USUARIO. A configuracao da EMPRESA aparece em
         `Configuracao.jsx` mas nao tem criterio proprio declarado aqui — e nao invento um agora
         (paragrafo 10); se for requisito de release, entra como feature com criterio proprio. */
      acc: 'DONE' }),

  /* ---- Transversais ---- */
  F('Segurança', 'SEGURANCA', 'Segurança transversal', 'Takeover, disambiguação de login, regressões',
    { m: ['auth.js'], t: ['seguranca.test.js', 'takeover_reset_pin.test.js', 'login_disambiguacao_leak.test.js', 'idor.test.js', 'bugs_regressao.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono', 'gestor', 'funcionario'], releaseRequired: true,
      acceptance: 'vetores conhecidos barrados com negativo que os nomeie',
      acc: 'DONE' }),
  F('LGPD', 'LGPD', 'LGPD e privacidade', 'Exclusão de conta, autoexclusão, termos e privacidade',
    { f: ['Privacidade.jsx', 'Termos.jsx', 'Cookies.jsx'],
      t: ['lgpd.test.js', 'autoexclusao_conta.test.js', 'auditoria_dado_pessoal.test.js'],
      p: 'P0_RELEASE_BLOCKER', runtime: 'PASS', papeis: ['dono'], releaseRequired: true, acceptance: 'exclusão efetiva e rastreável',
      /* GAP-LGPD-01 FECHADO por GAP-AUD-01. A exclusao ja era EFETIVA e provada; o que faltava era
         ser RASTREAVEL. Agora as operacoes sobre dado pessoal deixam trilha com ator, acao, escopo
         e momento — sem preservar o dado. */
      acc: 'DONE' }),
  /* CORRECAO de uma afirmacao minha. Esta linha saia como `NAO_INICIADO` porque nao declarava
     ancora nenhuma — e a feature TEM implementacao: `services/auditoria.js`, o modelo `AuditLog` e
     cinco chamadas de `registrarAudit` cobrindo o ciclo de vida de usuario (`convite.enviado`,
     `usuario.criado`, `usuario.desativado`, `usuario.excluido`, `usuario.permissoes_alteradas`).
     "Nao declarei ancora" nao e "nao existe": o registry mede o que a linha aponta, e a linha
     estava incompleta. */
  F('Auditoria', 'AUDITORIA', 'Auditoria', 'AuditLog das operações sensíveis',
    { b: ['admin.js'], t: ['auditoria_dado_pessoal.test.js'], p: 'P1_MVP_REQUIRED', runtime: 'NOT_TESTED', papeis: [], releaseRequired: true,
      acceptance: 'operação sensível gera registro consultável, com ator, ação, alvo e momento',
      /* GAP-AUD-01 FECHADO. A trilha ja cobria ciclo de vida de usuario; foi estendida as duas
         operacoes de dado pessoal que faltavam — DELETE /me/conta (nos dois desfechos) e
         /lgpd/anonimizar-cliente.
         A restricao que decidiu o desenho: o registro NAO carrega o dado que a operacao apagou.
         Guardar o e-mail excluido ou o telefone anonimizado faria a trilha preservar exatamente o
         que a operacao existe para remover — o sistema ficaria MENOS conforme por ter auditoria.
         Registra-se ator, acao, escopo, momento e contagem.
         7 casos, e provado que morde: incluir o telefone no registro reprova o caso da ausencia de
         PII. Tambem provado que o registro SOBREVIVE a cascata que apaga a empresa — se morresse
         junto, a demonstracao morreria com o que precisa demonstrar. */
      acc: 'DONE' }),
  F('Admin', 'ADMIN', 'Administração', 'Rotas administrativas',
    { b: ['admin.js'], p: 'P2_POST_LAUNCH', runtime: 'NOT_TESTED', papeis: [], releaseRequired: false, acceptance: 'operações administrativas isoladas' }),
  F('Operação', 'OBSERVABILIDADE', 'Observabilidade', 'Health check, logs estruturados com redação, captura de erro',
    /* ENTRADA CORRIGIDA. Estava vazia e por isso o registry derivava NAO_INICIADO. O repositorio
       tem, e sempre teve nesta frente:
         `GET /health` (app.js:173) — SELECT 1 no banco, estado de shutdown, uptime e estado da
            conexao do WhatsApp; 200 quando ok, 503 quando degradado ou desligando;
         `utils/logger.js` — winston com `redigirSensiveis`, que redige chave sensivel em objeto
            aninhado e nao redige `codigo` (a contraprova esta na suite);
         `config/sentry.js` — captura opcional, so ativa com `SENTRY_DSN`, com scrub de
            `event.user` e de headers, e o simbolo `JA_ENVIADO_AO_SENTRY` evitando evento dobrado;
         `HEALTHCHECK` no Dockerfile e no compose, apontando para `/health`. */
    { s: ['logger.js', 'sentry.js'],
      u: ['logger.test.js', 'sentry.test.js', 'sentryTransport.test.js'],
      t: ['health_operacional.test.js', 'erro_nao_tratado.test.js'],
      p: 'P1_MVP_REQUIRED', runtime: 'PASS', papeis: [], releaseRequired: true,
      acceptance: 'erro em produção é detectável sem acesso ao banco',
    /* GAP-OBS-01 FECHADO. `health_operacional.test.js` cobre os tres estados e prova que sao
       DISTINGUIVEIS: 200 `ok`, 503 `degraded` com `database: error` (forcando o `$queryRaw` a
       falhar, porque em teste o banco esta sempre de pe e o ramo degradado nunca rodaria sozinho)
       e 503 `shutting_down` sem tocar no banco. Cobre tambem que `/health` nao exige autenticacao —
       401 ali faria o HEALTHCHECK reiniciar em laco uma aplicacao saudavel. */
      /* GAP-OBS-02 FECHADO, e o enunciado dele estava LARGO DEMAIS. Eu declarei que a captura
         "nunca foi executada"; na verdade `sentry.test.js` e `sentryTransport.test.js` ja provavam
         ativacao por DSN, idempotencia, no-op inativo, enriquecimento por tenant e as quatro regras
         do transporte. A entrada e que nao declarava essas suites — mesmo defeito de subdeclaracao
         que fazia esta feature ler NAO_INICIADO.

         O que realmente faltava, e agora existe:
           `beforeSend` — 4 casos, com controle positivo primeiro (o evento CONTINUA saindo; um
              scrub que devolvesse `null` daria privacidade perfeita e observabilidade zero), e
              verificacao pelo TEXTO INTEIRO do evento, porque apagar a chave do cabecalho e deixar
              o valor em outro campo passaria numa assercao por chave;
           `erro_nao_tratado.test.js` — 7 casos ponta a ponta pelo Express: JSON malformado alcanca
              o handler global, o log sai MARCADO (senao o mesmo erro vira dois eventos e a contagem
              que decide plantao fica corrompida), o contexto carrega rota e metodo, a resposta nao
              vaza stack, e a aplicacao segue atendendo depois.

         ACHADO AO ESCREVER: rota desconhecida devolve 401, nao 404, porque `requireAuth` do
         accountRouter vem antes do 404 final. Melhor assim — 404 para anonimo revelaria quais
         rotas existem. Eu tinha assumido 404 e estava errado.

         NAO fechado e NAO alegado: presenca de `SENTRY_DSN` em producao (GO_LIVE A8). Isso e
         configuracao de ambiente, nao aceitacao de feature — pela mesma regra, AUTH_LOGIN nao fica
         refem de "o JWT_SECRET esta setado no Railway". Vai para o checklist operacional.

         GAP-OBS-03 FECHADO sob a decisao material D-OBS-03, em consenso com o Codex Decisor
         (thread 01a029bc-f42a-7c23-bd23-bb9b0d8903c9). O handler global passou a distinguir erro
         do CLIENTE de falha da APLICACAO: 4xx responde generico, sem log de erro e sem captura;
         todo o resto segue 500 com log marcado e captura.

         O discriminador NAO e `status`, e essa foi a correcao do Decisor sobre a minha proposta.
         Verifiquei de forma independente: `whatsapp/evolution-client.js:33`,
         `whatsapp/cloud-client.js:35` e `oauth.js:22` copiam status ALHEIO para a excecao. Com
         `status` sozinho, um 403 do provedor de WhatsApp seria devolvido como erro do cliente E
         sumiria do rastreador — falha de integracao real desaparecendo de onde se procura falha.
         `expose: true` vem do `http-errors`, que e o que o body-parser usa, e ninguem o poe a mao
         neste repositorio. Sonda de mutacao: removida a exigencia de `expose`, a contraprova falha
         com 403 no lugar de 500.

         NAO alegado: presenca de `SENTRY_DSN` em producao (GO_LIVE A8). Configuracao de ambiente
         nao e aceitacao de feature — pela mesma regra, AUTH_LOGIN nao ficaria refem de "o
         JWT_SECRET esta setado no Railway". Segue no checklist operacional. */
      acc: 'DONE' }),
  F('Operação', 'E2E', 'Testes E2E', 'Fluxo completo do usuário em navegador',
    { p: 'P2_POST_LAUNCH', runtime: 'NA', papeis: [], releaseRequired: false, acceptance: 'fluxo Cliente->Serviço->Financeiro em navegador' }),
  F('Operação', 'STAGING', 'Staging e prontidão', 'Ambiente de homologação e checklist de produção',
    { p: 'P1_MVP_REQUIRED', runtime: 'NA', papeis: [], releaseRequired: true, acceptance: 'deploy reproduzível e rollback provado',
      /* BLOCKED por AUTORIDADE, nao por dificuldade tecnica — e a distincao importa, porque
         blocker tecnico eu resolveria sozinho. "Deploy reproduzivel" e "rollback provado" exigem
         executar deploy e promocao de ambiente, e a instrucao vigente diz textualmente que push,
         merge remoto, deploy e promocao de ambiente NAO estao autorizados.
         Nao dividi a feature para arrancar dela um pedaco executavel: o criterio e sobre o deploy
         acontecer e ser desfeito, e um checklist escrito sem execucao seria documento, nao prova. */
      blocker: 'exige deploy e promoção de ambiente, ambos fora da autorização vigente (D2 do usuário)',
      acc: 'BLOCKED',
      gaps: [{
        id: 'GAP-STG-01',
        claim: 'não existe ambiente de homologação nem rollback executado',
        affectedUserFlow: 'colocar uma versão no ar e conseguir voltar atrás quando ela quebra',
        evidence: 'Dockerfile e docker-compose.yml descrevem o runtime, mas nenhum deploy foi executado nesta frente e não há registro de rollback; a instrução vigente não autoriza push, merge remoto, deploy nem promoção de ambiente',
        requiredBehavior: 'subir a versão em homologação de forma reproduzível e provar que o rollback devolve o estado anterior',
        currentBehavior: 'a imagem builda localmente; o deploy nunca aconteceu e o rollback nunca foi exercitado',
        releaseImpact: 'EXTERNAL_BLOCKER'
      }] })
]);

/* ------------------------------------------------------------------ *
 * Derivação
 * ------------------------------------------------------------------ */

/**
 * Estado de uma feature. PURA — as sabotagens atravessam aqui.
 *
 * `DONE` exige as três pernas E evidência de execução. Sem a execução aprovada, o melhor alcançável
 * é `PARTIAL`, mesmo com tudo presente — porque "arquivo existe" não é "teste passou".
 */
export function estadoDe(feature, obs) {
  const temB = (feature.b.length > 0 && feature.b.every((x) => obs.rotas.has(x)))
    || ((feature.m ?? []).length > 0 && feature.m.every((x) => obs.middlewares.has(x)))
    || ((feature.s ?? []).length > 0 && feature.s.every((x) => obs.modulos.has(x)));
  const temF = feature.f.length > 0 && feature.f.every((x) => obs.paginas.has(x));
  const temT = feature.t.length > 0 && feature.t.every((x) => obs.suites.has(x));

  const backendStatus = (feature.b.length === 0 && (feature.m ?? []).length === 0 && (feature.s ?? []).length === 0)
    ? 'NAO_APLICAVEL' : (temB ? 'PRESENTE' : 'AUSENTE');
  const frontendStatus = feature.f.length === 0 ? 'NAO_APLICAVEL' : (temF ? 'PRESENTE' : 'AUSENTE');
  const testStatus = feature.t.length === 0
    ? 'SEM_SUITE_DIRIGIDA'
    : (temT ? (obs.integracaoAprovada ? 'EXECUTADA_APROVADA' : 'PRESENTE_NAO_EXECUTADA') : 'AUSENTE');

  /* `[].every()` e verdadeiro: uma feature que nao declara peca NENHUMA — `AUDITORIA`,
     `OBSERVABILIDADE`, `STAGING` — passava por "todas as pernas presentes" e caia em `IMPLEMENTADO`,
     o estado mais forte disponivel sem suite. Ausencia total de evidencia virando quase-pronto e
     fail-open: exige-se ao menos UMA perna aplicavel E presente. */
  const aplicaveis = [backendStatus, frontendStatus].filter((x) => x !== 'NAO_APLICAVEL');
  const pernasPresentes = aplicaveis.length > 0 && aplicaveis.every((x) => x === 'PRESENTE');
  const algumaPeca = backendStatus === 'PRESENTE' || frontendStatus === 'PRESENTE' || temT;

  /* O teto derivavel e `SUITE_APROVADA`. `DONE` exige julgamento de aceitacao e nao e concedido
     aqui — ver a nota em `ESTADOS`. */
  let status;
  if (testStatus === 'EXECUTADA_APROVADA' && pernasPresentes) status = 'SUITE_APROVADA';
  else if (pernasPresentes) status = 'IMPLEMENTADO';
  else if (algumaPeca) status = 'PARCIAL';
  else status = 'NAO_INICIADO';

  return {
    ...feature, status, backendStatus, frontendStatus, testStatus,
    provaDe: testStatus === 'EXECUTADA_APROVADA' ? 'EXECUCAO' : 'PRESENCA',
    execucaoRef: testStatus === 'EXECUTADA_APROVADA' ? 'bot:integration' : null,
    prioridadeProvenance: 'JULGAMENTO',
    acceptanceProvenance: 'JULGAMENTO',
    evidenceRefs: [
      ...feature.t.filter((x) => obs.suites.has(x)).map((x) => `chaveiro-bot/test/integration/${x}`),
      ...(testStatus === 'EXECUTADA_APROVADA' ? ['docs/eos-v2/EVIDENCE_BUNDLE.json#bot:integration'] : [])
    ]
  };
}

export function derivarRegistry(obs = observarProduto(), features = FEATURES) {
  const linhas = features.map((f) => estadoDe(f, obs));
  const mvp = linhas.filter((l) => l.releaseRequired);
  const conta = (e) => mvp.filter((l) => l.status === e).length;
  return {
    linhas, mvp,
    total: mvp.length,
    suiteAprovada: conta('SUITE_APROVADA'), implementado: conta('IMPLEMENTADO'),
    parcial: conta('PARCIAL'), naoIniciado: conta('NAO_INICIADO'), bloqueado: conta('BLOQUEADO'),
    /* Nenhum P0 esta FECHADO: o teto derivavel nao fecha nada. Os "abertos" sao TODOS os P0 —
       o que muda entre eles e quanta evidencia ja existe, nao se estao prontos. */
    p0: mvp.filter((l) => l.priority === 'P0_RELEASE_BLOCKER'),
    p0SemSuiteAprovada: mvp.filter((l) => l.priority === 'P0_RELEASE_BLOCKER' && l.status !== 'SUITE_APROVADA'),
    /* Gate do milestone: DESCONHECIDA entre os P0 e o unico estado inadmissivel ao final. */
    p0Desconhecidos: mvp.filter((l) => l.priority === 'P0_RELEASE_BLOCKER'
      && (l.acceptance ?? 'DESCONHECIDA') === 'DESCONHECIDA'),
    aceitacao: Object.fromEntries(ACEITACOES.map((a) =>
      [a, mvp.filter((l) => (l.acceptance ?? 'DESCONHECIDA') === a).length])),
    violacoesDeAceitacao: linhas.flatMap((l) => violacoesDeAceitacao(l)),
    todosOsGaps: linhas.flatMap((l) => (l.gaps ?? []).map((g) => ({ ...g, featureId: l.featureId, area: l.area }))),
    integracaoAprovada: obs.integracaoAprovada
  };
}

/* ------------------------------------------------------------------ *
 * Controles
 * ------------------------------------------------------------------ */

/* Fixture de gap valido para as contraprovas. Era montado inline com 'texto suficiente' em TODOS
   os campos — inclusive `releaseImpact`, que agora e enumerado. Um fixture que nao satisfaz as
   proprias regras faz a contraprova reprovar por defeito dela mesma, e nao do que ela mede. */
const gapCompleto = () => ({
  ...Object.fromEntries(CAMPOS_DO_GAP.map((c) => [c, 'texto suficiente'])),
  releaseImpact: 'FUNCTIONAL'
});

export function controlesDoRegistry() {
  const base = {
    rotas: new Set(['x.js']), paginas: new Set(['X.jsx']), suites: new Set(['x.test.js']),
    modelos: new Set(), services: new Set(), middlewares: new Set(), integracaoAprovada: true
  };
  const f = { area: 'A', featureId: 'F', name: 'n', description: 'd', b: ['x.js'], f: ['X.jsx'],
    t: ['x.test.js'], priority: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptanceCriteria: 'a' };

  return [
    ['tudo presente + integracao aprovada -> SUITE_APROVADA', estadoDe(f, base).status === 'SUITE_APROVADA'],
    /* A propriedade central: `DONE` nao e alcancavel por derivacao, em nenhuma combinacao. */
    ['NENHUMA combinacao de observacao produz DONE', (() => {
      const combos = [
        base, { ...base, integracaoAprovada: false }, { ...base, rotas: new Set() },
        { ...base, paginas: new Set() }, { ...base, suites: new Set() },
        { ...base, rotas: new Set(), paginas: new Set(), suites: new Set() }
      ];
      const fs = [f, { ...f, t: [] }, { ...f, b: [] }, { ...f, f: [] }];
      return combos.every((o) => fs.every((x) => !EXIGE_JULGAMENTO.includes(estadoDe(x, o).status)));
    })()],
    ['suite presente mas integracao NAO aprovada -> IMPLEMENTADO, nunca SUITE_APROVADA',
      estadoDe(f, { ...base, integracaoAprovada: false }).status === 'IMPLEMENTADO'],
    ['... e o testStatus diz exatamente isso',
      estadoDe(f, { ...base, integracaoAprovada: false }).testStatus === 'PRESENTE_NAO_EXECUTADA'],
    ['sem suite dirigida NAO alcanca SUITE_APROVADA',
      estadoDe({ ...f, t: [] }, base).status === 'IMPLEMENTADO'],
    ['backend ausente derruba para PARCIAL',
      estadoDe(f, { ...base, rotas: new Set() }).status === 'PARCIAL'],
    ['frontend ausente derruba para PARCIAL',
      estadoDe(f, { ...base, paginas: new Set() }).status === 'PARCIAL'],
    ['nenhuma peca -> NAO_INICIADO',
      estadoDe(f, { ...base, rotas: new Set(), paginas: new Set(), suites: new Set() }).status === 'NAO_INICIADO'],
    /* Feature que nao DECLARA peca alguma: `[].every()` e verdadeiro e ela virava IMPLEMENTADO. */
    ['feature sem NENHUMA peca declarada -> NAO_INICIADO, nao IMPLEMENTADO',
      estadoDe({ ...f, b: [], f: [], t: [] }, base).status === 'NAO_INICIADO'],
    ['CONTRAPROVA: feature com so backend aplicavel e presente alcanca IMPLEMENTADO',
      estadoDe({ ...f, f: [], t: [] }, base).status === 'IMPLEMENTADO'],
    ['SUITE_APROVADA carrega provaDe EXECUCAO com execucaoRef',
      estadoDe(f, base).provaDe === 'EXECUCAO' && estadoDe(f, base).execucaoRef === 'bot:integration'],
    ['sem execucao, provaDe cai para PRESENCA',
      estadoDe(f, { ...base, integracaoAprovada: false }).provaDe === 'PRESENCA'],
    ['prioridade sai marcada como JULGAMENTO, nao observacao',
      estadoDe(f, base).prioridadeProvenance === 'JULGAMENTO'],
    ['aceitacao tambem sai marcada como JULGAMENTO',
      estadoDe(f, base).acceptanceProvenance === 'JULGAMENTO'],
    /* ---- Coerencia entre aceitacao e gaps ---- */
    ['PARTIAL sem gap REPROVA — "precisa de melhorias" nao e diagnostico',
      violacoesDeAceitacao({ featureId: 'X', acceptance: 'PARTIAL', gaps: [] }).length > 0],
    ['BLOCKED sem gap REPROVA',
      violacoesDeAceitacao({ featureId: 'X', acceptance: 'BLOCKED', gaps: [] }).length > 0],
    ['DONE com gap aberto REPROVA',
      violacoesDeAceitacao({ featureId: 'X', acceptance: 'DONE', gaps: [{ id: 'G' }] }).length > 0],
    ['aceitacao fora da taxonomia REPROVA',
      violacoesDeAceitacao({ featureId: 'X', acceptance: 'QUASE' }).length > 0],
    ['gap sem requiredBehavior REPROVA', (() => {
      const g = gapCompleto();
      delete g.requiredBehavior;
      return violacoesDeAceitacao({ featureId: 'X', acceptance: 'PARTIAL', gaps: [g] })
        .some((v) => v.includes('requiredBehavior'));
    })()],
    ['gap sem currentBehavior REPROVA', (() => {
      const g = gapCompleto();
      delete g.currentBehavior;
      return violacoesDeAceitacao({ featureId: 'X', acceptance: 'PARTIAL', gaps: [g] })
        .some((v) => v.includes('currentBehavior'));
    })()],
    /* CONTRAPROVA: sem ela, "reprovar todo gap" passaria como rigor. */
    ['CONTRAPROVA: gap COMPLETO com PARTIAL nao reprova',
      violacoesDeAceitacao({
        featureId: 'X', acceptance: 'PARTIAL',
        gaps: [gapCompleto()]
      }).length === 0],
    ['releaseImpact fora da taxonomia reprova',
      violacoesDeAceitacao({
        featureId: 'X', acceptance: 'PARTIAL',
        gaps: [{ ...gapCompleto(), releaseImpact: 'INVENTADO' }]
      }).some((v) => v.includes('releaseImpact'))],
    /* A regressao que originou o controle: `UX` tem 2 caracteres e era reprovado pelo piso de
       comprimento, que nunca foi criterio para campo enumerado. */
    ['CONTRAPROVA: UX, com duas letras, e aceito',
      violacoesDeAceitacao({
        featureId: 'X', acceptance: 'PARTIAL',
        gaps: [{ ...gapCompleto(), releaseImpact: 'UX' }]
      }).length === 0],
    ['CONTRAPROVA: DONE sem gap nao reprova',
      violacoesDeAceitacao({ featureId: 'X', acceptance: 'DONE', gaps: [] }).length === 0],
    ['DESCONHECIDA e o default de toda feature nao avaliada',
      estadoDe({ ...f, acceptance: undefined }, base).acceptance === undefined
      || ACEITACOES.includes(estadoDe(f, base).acceptance ?? 'DESCONHECIDA')],
    ['todo estado emitido pertence a taxonomia derivavel',
      ESTADOS.includes(estadoDe(f, base).status)],
    ['`DONE` nao pertence a taxonomia derivavel', !ESTADOS.includes('DONE')],
    ['toda prioridade declarada pertence a taxonomia',
      FEATURES.every((x) => PRIORIDADES.includes(x.priority))],
    /* Sem isto, uma feature poderia apontar para suite inexistente e ninguem notaria. */
    ['nenhuma feature aponta para artefato inexistente no repo real', (() => {
      const o = observarProduto();
      return FEATURES.every((x) =>
        x.b.every((y) => o.rotas.has(y)) && (x.m ?? []).every((y) => o.middlewares.has(y))
        && x.f.every((y) => o.paginas.has(y)) && x.t.every((y) => o.suites.has(y))
        && (x.u ?? []).every((y) => o.suitesUnidade.has(y))
        && (x.s ?? []).every((y) => o.modulos.has(y)));
    })()]
  ];
}

export function executar(argv = []) {
  const recusa = recusarDesconhecida(argv, FLAGS);
  if (recusa !== null) return recusa;

  const obs = observarProduto();
  const r = derivarRegistry(obs);
  const casos = controlesDoRegistry();
  const falhos = casos.filter(([, ok]) => !ok).map(([x]) => x);

  console.log('ADMAI DELIVERY STATUS');
  console.log('');
  console.log(`MVP FEATURES TOTAL: ${r.total}`);
  console.log(`  SUITE_APROVADA : ${r.suiteAprovada}   (teto derivavel: pecas + suite dirigida executada e aprovada)`);
  console.log(`  IMPLEMENTADO   : ${r.implementado}   (pecas presentes, sem suite dirigida aprovada)`);
  console.log(`  PARCIAL        : ${r.parcial}`);
  console.log(`  NAO_INICIADO   : ${r.naoIniciado}`);
  console.log(`  BLOQUEADO      : ${r.bloqueado}`);
  console.log(`  DONE           : 0   — nao derivavel; exige julgamento de aceitacao`);
  console.log('');
  console.log('ACEITACAO (JULGAMENTO declarado, nao observacao):');
  for (const a of ACEITACOES) console.log(`  ${a.padEnd(14)} : ${r.aceitacao[a]}`);
  console.log(`  P0 com aceitacao DESCONHECIDA : ${r.p0Desconhecidos.length}` +
    (r.p0Desconhecidos.length ? ` (${r.p0Desconhecidos.map((l) => l.featureId).join(', ')})` : ''));
  console.log(`  ADMAI_P0_ACCEPTANCE_COMPLETE  : ${r.p0Desconhecidos.length === 0 ? 'ALCANCADO' : 'NAO — desconhecido nao e aprovado nem reprovado'}`);
  if (r.todosOsGaps.length) {
    console.log('');
    console.log(`GAPS NOMEADOS (${r.todosOsGaps.length}):`);
    for (const g of r.todosOsGaps) {
      console.log(`  ${g.id.padEnd(14)} [${g.featureId}] ${g.claim}`);
      console.log(`    fluxo afetado : ${g.affectedUserFlow}`);
      console.log(`    deveria       : ${g.requiredBehavior}`);
      console.log(`    hoje          : ${g.currentBehavior}`);
      console.log(`    impacto       : ${g.releaseImpact}`);
      console.log(`    evidencia     : ${g.evidence}`);
    }
  }
  console.log('');
  console.log(`P0 RELEASE BLOCKERS: ${r.p0.length} no total, ${r.p0SemSuiteAprovada.length} sem sequer suite aprovada`);
  for (const l of r.p0) {
    console.log(`  ${l.featureId.padEnd(18)} ${l.status.padEnd(15)} b=${String(l.backendStatus).padEnd(13)} f=${String(l.frontendStatus).padEnd(13)} t=${l.testStatus}`);
    console.log(`    aceitacao pendente: ${l.acceptanceCriteria}`);
  }
  console.log('');
  console.log('POR AREA:');
  for (const l of r.linhas) {
    console.log(`  ${l.area.padEnd(14)} ${l.featureId.padEnd(18)} ${l.status.padEnd(15)} ${l.priority.padEnd(20)} ${l.provaDe}`);
  }
  console.log('');
  console.log(`  evidencia de execucao : ${r.integracaoAprovada ? 'bot:integration APROVADA' : 'AUSENTE — nada alcanca SUITE_APROVADA'}`);
  console.log(`  controles do registry : ${casos.length - falhos.length}/${casos.length}`);
  for (const x of falhos) console.log(`    FAIL  ${x}`);
  if (r.violacoesDeAceitacao.length) {
    console.log(`  COERENCIA DE ACEITACAO: ${r.violacoesDeAceitacao.length} violacao(oes)`);
    for (const v of r.violacoesDeAceitacao) console.log(`    ! ${v}`);
  }
  console.log('');
  console.log('  LEITURA CORRETA DESTE QUADRO:');
  console.log('    SUITE_APROVADA = as pecas existem e as propriedades COBERTAS PELA SUITE se sustentam.');
  console.log('    NAO significa que a funcionalidade esta pronta para o usuario. A diferenca entre o');
  console.log('    que a suite cobre e o que o acceptanceCriteria pede E o trabalho restante.');
  console.log('    Prioridade e JULGAMENTO declarado, nao derivacao do codigo.');

  if (falhos.length || r.violacoesDeAceitacao.length) {
    console.log('  INSTRUMENTO_COMPROMETIDO — o registry nao se sustenta');
    return 2;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(executar(process.argv.slice(2)));
}
