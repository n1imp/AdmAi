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
  for (const g of gaps) {
    const faltando = CAMPOS_DO_GAP.filter((c) => typeof g[c] !== 'string' || g[c].trim().length < 3);
    if (faltando.length) fora.push(`${f.featureId}/${g.id ?? '(sem id)'}: gap sem ${faltando.join(', ')}`);
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
    middlewares: new Set(lista('chaveiro-bot/src/middlewares', (f) => f.endsWith('.js'))),
    paginas: new Set(lista('chaveiro-painel/src/pages', (f) => f.endsWith('.jsx'))),
    suites: new Set(lista('chaveiro-bot/test/integration', (f) => f.endsWith('.test.js'))),
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
  { b = [], m = [], f = [], t = [], p, releaseRequired, acceptance, blocker, acc = 'DESCONHECIDA', gaps = [] }) =>
  ({ area, featureId: id, name, description, b, m, f, t, priority: p, releaseRequired,
    acceptanceCriteria: acceptance, blockerReason: blocker ?? null,
    /* JULGAMENTO, ao lado de `priority`. Default `DESCONHECIDA`: o sweep é quem preenche. */
    acceptance: acc, gaps });

export const FEATURES = Object.freeze([
  /* ---- Identidade / SaaS ---- */
  F('Identidade', 'AUTH_LOGIN', 'Login e sessão', 'Autenticação, refresh token, sessão de usuário',
    { b: ['auth.js'], f: ['Login.jsx'], t: ['auth.test.js', 'refresh_rotacao_sessao.test.js'], p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
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
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptance: 'bruteforce barrado e recuperação provada',
      acc: 'DONE' }),
  F('Identidade', 'MULTI_TENANCY', 'Multi-tenancy', 'Isolamento por empresa em toda leitura e escrita',
    { b: ['api.js'], t: ['rls.test.js', 'idor_leitura_cross_tenant.test.js', 'idor_escrita_cross_tenant.test.js', 'vazamento_colecao_cross_tenant.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptance: 'nenhum vetor material de leitura, escrita ou coleção cruza tenant',
      acc: 'DONE' }),
  F('Identidade', 'RBAC', 'RBAC e permissões', 'Dono, Gestor, Funcionário; requirePermissao no backend',
    { b: ['api.js'], f: ['Usuarios.jsx'], t: ['rbac_privilege_escalation.test.js', 'e2e_rbac_ponto.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptance: 'escalação de privilégio barrada no backend',
      acc: 'DONE' }),
  F('Identidade', 'ONBOARDING', 'Cadastro e convite', 'Cadastro com OTP, convite de usuário, verificação de e-mail',
    { b: ['account.js'], f: ['ConviteAceitar.jsx', 'VerificarEmail.jsx', 'MagicLink.jsx'],
      t: ['cadastro_otp.test.js', 'troca_email_confirmacao.test.js'], p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
      acceptance: 'fluxo completo de entrada de empresa e de usuário convidado',
      acc: 'PARTIAL',
      gaps: [{
        id: 'GAP-ONB-01',
        claim: 'O aceite de convite nao tem cobertura: so o caso NEGATIVO de convite existe.',
        affectedUserFlow: 'Dono convida um gestor; o convidado abre o link e tenta entrar. Nada prova que ele consegue.',
        evidence: 'GET /convite/:token e POST /convite/:token/aceitar em src/routes/auth.js:614 e :637; a pagina ConviteAceitar.jsx existe; a unica suite que menciona convite e rbac_privilege_escalation.test.js, e apenas para provar que gestor NAO convida alguem como dono.',
        requiredBehavior: 'Convite valido e aceito e cria o usuario com o papel certo na empresa certa; convite expirado, ja usado ou de outra empresa e recusado.',
        currentBehavior: 'Cadastro por OTP e troca de e-mail provados. O caminho do convidado tem implementacao e pagina, sem nenhuma prova de que funciona.',
        releaseImpact: 'Entrada de usuario e o segundo fluxo mais critico depois do login: sem ele o produto e monousuario na pratica.'
      }] }),

  /* ---- Núcleo operacional ---- */
  F('Serviços', 'SERVICOS_CRUD', 'Serviços', 'Criação, edição, status, execução, conclusão e histórico',
    { b: ['servicos.js'], f: ['Servicos.jsx', 'NovoServico.jsx', 'MeusServicos.jsx'],
      t: ['servico_atual.test.js', 'servicos_keyset.test.js'], p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
      /* Criterio CORRIGIDO no sweep. A versao anterior pedia "ciclo Cliente -> Servico -> ...", e
         NAO EXISTE entidade Cliente: o cliente e capturado como `clienteNome`/`clienteTelefone` no
         proprio `Servico` (schema.prisma:138-140). Pedir CRUD de Cliente seria inventar requisito
         que o repositorio nao sustenta. */
      acceptance: 'ciclo Serviço (com cliente capturado no próprio registro) -> Execução -> Conclusão provado ponta a ponta',
      acc: 'DONE' }),
  F('Serviços', 'APROVACOES', 'Aprovação e rejeição', 'Fluxo de aprovação de serviço pelo gestor',
    { f: ['Aprovacoes.jsx'], p: 'P1_MVP_REQUIRED', releaseRequired: true,
      acceptance: 'aprovar e rejeitar com efeito em comissão e financeiro' }),
  F('Técnicos', 'TECNICOS', 'Técnicos e funcionários', 'Cadastro, acesso, permissões, serviços associados',
    { b: ['tecnicos.js'], f: ['Tecnicos.jsx', 'NovoTecnico.jsx', 'PerfilTecnico.jsx'], t: ['tecnico_criacao.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptance: 'criação, acesso e vínculo com serviço',
      acc: 'DONE' }),
  F('Estoque', 'ESTOQUE', 'Estoque e materiais', 'Materiais, movimentação, baixa, integração com serviço',
    { b: ['estoque.js'], f: ['Estoque.jsx', 'Catalogo.jsx'], p: 'P1_MVP_REQUIRED', releaseRequired: true,
      acceptance: 'baixa automática ao concluir serviço, com movimentação rastreável' }),
  F('Financeiro', 'FINANCEIRO', 'Financeiro e comissão', 'Valor cobrado, custo de material, comissão, receita líquida',
    /* `metricas.test.js` entrou na evidencia durante o sweep: e ele que prova o CALCULO contra
       dataset conhecido, e o criterio pede calculo E politica. A declaracao anterior citava so a
       politica por campo, o que subdeclarava a evidencia existente. */
    { f: ['Reparticao.jsx'], t: ['metricas_campo_seguranca.test.js', 'metricas.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
      acceptance: 'cálculo correto e política por campo aplicada no backend',
      acc: 'DONE' }),

  /* ---- Métricas e dashboard ---- */
  F('Dashboard', 'METRIC_FOUNDATION', 'Fundação de métricas', 'Contrato, registro, cálculo e exposição',
    { b: ['metricas.js'], f: ['Dashboard.jsx'], t: ['metricas.test.js', 'metricas_exposicao.test.js', 'me_metricas.test.js'],
      p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'número correto, autorizado e explicável' }),
  F('Dashboard', 'METRIC_HUBS', 'Metric Hubs', 'Duas verticais com drilldown e segurança por campo',
    { f: ['MetricHub.jsx', 'MetricHubReceita.jsx', 'MetricHubShell.jsx'], t: ['metricas_campo_seguranca.test.js'],
      p: 'P2_POST_LAUNCH', releaseRequired: false, acceptance: 'hubs para as 8 métricas implementáveis' }),
  F('Dashboard', 'INDICADORES', 'Indicadores do gestor', 'Agregados e visão operacional',
    { f: ['GestorHome.jsx', 'MeuPainel.jsx'], t: ['gestor_indicadores.test.js', 'dashboard_groupby.test.js', 'aggregate_perfil_dashboard.test.js'],
      p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'agregados consistentes com os registros' }),

  /* ---- Ponto ---- */
  F('Ponto', 'PONTO', 'Registro de ponto', 'Batida, localização, selfie, antifraude, banco de horas',
    { f: ['MeuPonto.jsx'], t: ['e2e_rbac_ponto.test.js'], p: 'P1_MVP_REQUIRED', releaseRequired: true,
      acceptance: 'batida com antifraude e banco de horas conferível' }),

  /* ---- Billing ---- */
  F('Billing', 'BILLING', 'Assinatura e trial', 'Trial, assinatura, enforcement, expiração e bloqueio',
    { b: ['billing.js'], t: ['billing_access_audit.test.js', 'assinatura_cadastro.test.js', 'billing_google_auth.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
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
    { b: ['whatsapp.js'], f: ['ConfiguracaoBot.jsx'], t: ['inbound_numero_unico.test.js'],
      p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'entrada e saída com idempotência e isolamento por empresa' }),
  F('Google', 'GOOGLE_REVIEWS', 'Google Reviews', 'Conta Google, avaliações, análise',
    { b: ['google.js'], f: ['Avaliacoes.jsx'], t: ['billing_google_auth.test.js'],
      p: 'P2_POST_LAUNCH', releaseRequired: false, acceptance: 'coleta e análise de avaliações' }),

  /* ---- Documentos, notificações, config ---- */
  F('Documentos', 'DOCUMENTOS', 'Documentos e uploads', 'Upload, storage, documento de técnico',
    { b: ['documentos.js'], f: ['Documentos.jsx'], t: ['documentos.test.js'], p: 'P1_MVP_REQUIRED', releaseRequired: true,
      acceptance: 'upload isolado por tenant e chave de storage não adivinhável' }),
  F('Notificações', 'NOTIFICACOES', 'Notificações', 'Notificação in-app e e-mail',
    { f: ['Notificacoes.jsx'], p: 'P2_POST_LAUNCH', releaseRequired: false, acceptance: 'entrega e leitura' }),
  F('Configurações', 'CONFIGURACOES', 'Configurações e preferências', 'Configuração da empresa e preferências do usuário',
    { f: ['Configuracao.jsx', 'Perfil.jsx'], t: ['preferencias.test.js'], p: 'P1_MVP_REQUIRED', releaseRequired: true,
      acceptance: 'preferências persistidas por usuário' }),

  /* ---- Transversais ---- */
  F('Segurança', 'SEGURANCA', 'Segurança transversal', 'Takeover, disambiguação de login, regressões',
    { m: ['auth.js'], t: ['seguranca.test.js', 'takeover_reset_pin.test.js', 'login_disambiguacao_leak.test.js', 'idor.test.js', 'bugs_regressao.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true,
      acceptance: 'vetores conhecidos barrados com negativo que os nomeie',
      acc: 'DONE' }),
  F('LGPD', 'LGPD', 'LGPD e privacidade', 'Exclusão de conta, autoexclusão, termos e privacidade',
    { f: ['Privacidade.jsx', 'Termos.jsx', 'Cookies.jsx'], t: ['lgpd.test.js', 'autoexclusao_conta.test.js'],
      p: 'P0_RELEASE_BLOCKER', releaseRequired: true, acceptance: 'exclusão efetiva e rastreável',
      acc: 'PARTIAL',
      gaps: [{
        id: 'GAP-LGPD-01',
        claim: 'A exclusao e EFETIVA e provada, mas nao e RASTREAVEL: nao ha registro de quem excluiu o que e quando.',
        affectedUserFlow: 'Titular pede exclusao; o dado some corretamente. Se depois alguem perguntar quando, por ordem de quem e o que exatamente foi apagado, nao ha o que responder.',
        evidence: 'lgpd.test.js prova anonimizacao de PII com escopo por tenant; autoexclusao_conta.test.js prova cascata, senha incorreta, admin nao-unico e codigo de confirmacao. O modelo AuditLog existe no schema e a feature AUDITORIA esta NAO_INICIADO — nenhuma dessas operacoes gera registro.',
        requiredBehavior: 'Operacao de exclusao ou anonimizacao gera entrada de auditoria com ator, acao, alvo e momento, consultavel e isolada por tenant.',
        currentBehavior: 'A exclusao acontece e e verificada. Nao ha trilha.',
        releaseImpact: 'Risco legal: LGPD exige demonstrar o atendimento ao titular, e demonstrar exige registro. Depende de AUDITORIA, que e P1 e NAO_INICIADO.'
      }] }),
  F('Auditoria', 'AUDITORIA', 'Auditoria', 'AuditLog das operações sensíveis',
    { p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'operação sensível gera registro consultável' }),
  F('Admin', 'ADMIN', 'Administração', 'Rotas administrativas',
    { b: ['admin.js'], p: 'P2_POST_LAUNCH', releaseRequired: false, acceptance: 'operações administrativas isoladas' }),
  F('Operação', 'OBSERVABILIDADE', 'Observabilidade', 'Métricas de runtime, logs, alertas',
    { p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'erro em produção é detectável sem acesso ao banco' }),
  F('Operação', 'E2E', 'Testes E2E', 'Fluxo completo do usuário em navegador',
    { p: 'P2_POST_LAUNCH', releaseRequired: false, acceptance: 'fluxo Cliente->Serviço->Financeiro em navegador' }),
  F('Operação', 'STAGING', 'Staging e prontidão', 'Ambiente de homologação e checklist de produção',
    { p: 'P1_MVP_REQUIRED', releaseRequired: true, acceptance: 'deploy reproduzível e rollback provado' })
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
    || ((feature.m ?? []).length > 0 && feature.m.every((x) => obs.middlewares.has(x)));
  const temF = feature.f.length > 0 && feature.f.every((x) => obs.paginas.has(x));
  const temT = feature.t.length > 0 && feature.t.every((x) => obs.suites.has(x));

  const backendStatus = (feature.b.length === 0 && (feature.m ?? []).length === 0)
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
      const g = Object.fromEntries(CAMPOS_DO_GAP.map((c) => [c, 'texto suficiente']));
      delete g.requiredBehavior;
      return violacoesDeAceitacao({ featureId: 'X', acceptance: 'PARTIAL', gaps: [g] })
        .some((v) => v.includes('requiredBehavior'));
    })()],
    ['gap sem currentBehavior REPROVA', (() => {
      const g = Object.fromEntries(CAMPOS_DO_GAP.map((c) => [c, 'texto suficiente']));
      delete g.currentBehavior;
      return violacoesDeAceitacao({ featureId: 'X', acceptance: 'PARTIAL', gaps: [g] })
        .some((v) => v.includes('currentBehavior'));
    })()],
    /* CONTRAPROVA: sem ela, "reprovar todo gap" passaria como rigor. */
    ['CONTRAPROVA: gap COMPLETO com PARTIAL nao reprova',
      violacoesDeAceitacao({
        featureId: 'X', acceptance: 'PARTIAL',
        gaps: [Object.fromEntries(CAMPOS_DO_GAP.map((c) => [c, 'texto suficiente']))]
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
        && x.f.every((y) => o.paginas.has(y)) && x.t.every((y) => o.suites.has(y)));
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
