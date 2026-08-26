#!/usr/bin/env node
/**
 * railway-staging-bootstrap.mjs — bootstrap BIFÁSICO do backend staging no Railway.
 * [STG-APP-DEPLOY-01 · D1 D-STG-APP-DEPLOY-EXEC-01 thread 01a03b55 · D2 do usuário:
 *  custo do serviço E do Redis AUTORIZADOS literalmente via AskUserQuestion]
 *
 * DESENHO VINCULANTE (D1):
 *  - Projeto Railway DEDICADO `admai-staging` — NUNCA localizar/reutilizar/tocar o
 *    projeto de produção. Guard: qualquer nome/domínio que case produção ⇒ recusa.
 *  - BIFÁSICO: `--phase=prepare` cria projeto/environment(staging)/service/Redis/
 *    domínio/vars NÃO-secretas SEM conectar source (nenhum deploy dispara);
 *    `--phase=connect` roda DEPOIS que o usuário preencher as vars SECRETAS —
 *    verifica presença por NOME (nunca imprime valor), conecta n1imp/AdmAi
 *    branch `staging` root `chaveiro-bot`, healthcheck /health.
 *  - Introspecção ANTES de qualquer mutation: se o schema/token não suportar um
 *    passo, FALHA com o passo manual exato (nunca degrade silencioso).
 *  - REDIS_URL entra como REFERÊNCIA interna (${{Redis.REDIS_URL}}), nunca valor.
 *  - Nada de rollback destrutivo automático; inventário de IDs sempre no output.
 *
 * Uso (o token vem do env; NUNCA é impresso):
 *   RAILWAY_TOKEN=... node tools/railway-staging-bootstrap.mjs --phase=prepare
 *   RAILWAY_TOKEN=... node tools/railway-staging-bootstrap.mjs --phase=prepare --project-id=<id>   # rerun idempotente
 *   RAILWAY_TOKEN=... node tools/railway-staging-bootstrap.mjs --phase=connect \
 *        --project-id=<id> --environment-id=<id> --service-id=<id>
 *   node tools/railway-staging-bootstrap.mjs --selftest
 */

const API = 'https://backboard.railway.com/graphql/v2';
const NOME_PROJETO = 'admai-staging';
const NOME_SERVICE = 'admai-staging';
const REPO = 'n1imp/AdmAi';
const BRANCH = 'staging';
const ROOT_DIR = 'chaveiro-bot';
const REF_STAGING = 'qsuufuulxfkkeasgxhcv';
/* Identificadores INEQUÍVOCOS de produção. "AdmAi" (nome do projeto Railway de
   produção) é checado por IGUALDADE EXATA em guardaProducao — word-boundary casaria
   o nosso próprio "admai-staging" (defeito pego pelo selftest). */
const PADRAO_PRODUCAO = /admai-production|api\.chaveirobot|app\.chaveirobot|disljhkypaxpyzvbooge/i;

const VARS_NAO_SECRETAS = (dominio) => ({
  APP_ENV: 'staging',
  NODE_ENV: 'production',
  STAGING_REF: REF_STAGING,
  PROD_REF_BLOCKLIST: 'disljhkypaxpyzvbooge',
  SUPABASE_URL: `https://${REF_STAGING}.supabase.co`,
  ALLOWED_ORIGIN: 'https://staging.admai-painel.pages.dev',
  FRONTEND_URL: 'https://staging.admai-painel.pages.dev',
  STORAGE_STRICT: 'true',
  ...(dominio ? { PUBLIC_URL: `https://${dominio}` } : {}),
  // Referência interna ao Redis gerenciado (Railway resolve; valor nunca passa por aqui):
  REDIS_URL: '${{Redis.REDIS_URL}}',
});

// Vars SECRETAS que o USUÁRIO preenche no dashboard antes do connect (só NOMES aqui):
export const SECRETAS_OBRIGATORIAS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'API_TOKEN',
  'RESEND_API_KEY',
];

const falhar = (msg, manual = null) => {
  const e = new Error(msg);
  e.manual = manual;
  throw e;
};

/** Cliente GraphQL. `fetchFn` injetável (selftest). Erros nunca ecoam o token. */
export function criarCliente(token, fetchFn = fetch) {
  return async function gql(query, variables = {}, { permitirErros = false } = {}) {
    const r = await fetchFn(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
    if (r.status === 401 || r.status === 403) {
      falhar(
        `RAILWAY_TOKEN sem autorizacao (HTTP ${r.status}).`,
        'Verifique o secret RAILWAY_TOKEN no repo: precisa ser um token de CONTA/TEAM (project-token de producao nao cria projetos). Crie em railway.com/account/tokens e atualize o secret.'
      );
    }
    const corpo = await r.json();
    if (corpo.errors?.length && !permitirErros) {
      const msgs = corpo.errors.map((e) => e.message).join(' | ');
      falhar(`GraphQL recusou: ${msgs}`);
    }
    return corpo;
  };
}

/** Introspecção: nomes das mutations disponíveis (fail-closed antes de mutar). */
export async function mutationsDisponiveis(gql) {
  const r = await gql(`query { __schema { mutationType { fields { name } } } }`);
  const nomes = (r.data?.__schema?.mutationType?.fields ?? []).map((f) => f.name);
  if (!nomes.length) falhar('Introspecao vazia — token/endpoint sem schema legivel.');
  return new Set(nomes);
}

function exigirMutations(disp, exigidas) {
  const faltam = exigidas.filter((m) => !disp.has(m));
  if (faltam.length) {
    falhar(
      `Schema/token nao expoe mutations obrigatorias: ${faltam.join(', ')}.`,
      `Execute manualmente no dashboard Railway: crie o projeto ${NOME_PROJETO}, environment staging, service ${NOME_SERVICE} (sem source), Redis gerenciado, dominio publico; depois rode --phase=connect.`
    );
  }
}

/** Guard anti-produção: qualquer identificador que case produção ⇒ recusa dura. */
export function guardaProducao(rotulo, valor) {
  const v = String(valor ?? '');
  if (v && (PADRAO_PRODUCAO.test(v) || v === 'AdmAi')) {
    falhar(`GUARD: ${rotulo} ("${v}") casa padrao de PRODUCAO — recusado, nada mutado.`);
  }
}

/** Resolve o workspace do token (projectCreate exige workspaceId — visto no run real).
 *  Único ⇒ usa; múltiplos/nenhum ⇒ falha explícita pedindo --workspace-id. */
export async function resolverWorkspace(gql, workspaceIdFlag = null) {
  if (workspaceIdFlag) return workspaceIdFlag;
  const r = await gql(`query { me { workspaces { id name } } }`, {}, { permitirErros: true });
  const ws = r.data?.me?.workspaces ?? [];
  if (r.errors?.length || !ws.length) {
    falhar(
      `Nao consegui listar workspaces do token${r.errors?.length ? `: ${r.errors.map((e) => e.message).join(' | ')}` : ' (lista vazia)'}.`,
      'Descubra o workspaceId no dashboard Railway (URL do workspace) e re-rode com --workspace-id=<id> (no dispatch: input workspace_id).'
    );
  }
  if (ws.length > 1) {
    falhar(
      `Token tem ${ws.length} workspaces: ${ws.map((w) => `${w.name}=${w.id}`).join(', ')}. Escolha explicitamente.`,
      'Re-rode com --workspace-id=<id> do workspace onde o staging deve viver (no dispatch: input workspace_id).'
    );
  }
  guardaProducao('workspace', ws[0].name);
  return ws[0].id;
}

/** Busca projeto `admai-staging` existente no workspace (idempotência por NOME —
 *  lição do run real: falha no meio deixava projeto órfão e um rerun cego duplicaria).
 *  [REVISOR 01a03bb9 achado 3] FAIL-CLOSED: erro na listagem NÃO é "ausente" — criar
 *  às cegas sob falha de schema/rede duplicaria projeto E custo. Sem prova de
 *  ausência, aborta pedindo --project-id. */
export async function acharProjetoExistente(gql) {
  const r = await gql(
    `query { me { workspaces { id name projects { edges { node {
        id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      } } } } } }`,
    {},
    { permitirErros: true }
  );
  if (r.errors?.length) {
    falhar(
      `Nao consegui PROVAR presenca/ausencia do projeto ${NOME_PROJETO} (listagem recusada: ${r.errors.map((e) => e.message).join(' | ')}).`,
      `Sem prova de ausencia NAO crio projeto (duplicata = custo novo). Descubra o projectId no dashboard Railway e re-rode com --project-id=<id>; ou corrija o token.`
    );
  }
  for (const ws of r.data?.me?.workspaces ?? []) {
    for (const e of ws.projects?.edges ?? []) {
      if (e.node?.name === NOME_PROJETO) return e.node;
    }
  }
  return null;
}

/** [REVISOR 01a03bb9 achado 2] Preflight READ-ONLY de identidade: prova, ANTES de
 *  qualquer mutation, que os IDs recebidos são MESMO o projeto dedicado de staging
 *  (nome exato), que environment/service PERTENCEM a ele, e que nada casa produção.
 *  Devolve o nó do projeto (com envs/services) para reuso. */
export async function verificarIdentidade(gql, { projectId, environmentId = null, serviceId = null }) {
  const r = await gql(
    `query($id: String!) { project(id: $id) { id name
        environments { edges { node { id name } } }
        services { edges { node { id name } } } } }`,
    { id: projectId }
  );
  const p = r.data?.project;
  if (!p?.id) falhar(`Preflight: projeto ${projectId} nao encontrado/ilegivel — abortado.`);
  if (p.name !== NOME_PROJETO) {
    falhar(
      `Preflight: projeto ${projectId} chama-se "${p.name}", nao "${NOME_PROJETO}" — IDs de OUTRO projeto recusados (nada mutado).`
    );
  }
  guardaProducao('projeto (preflight)', p.name);
  const envs = (p.environments?.edges ?? []).map((e) => e.node);
  const svcs = (p.services?.edges ?? []).map((e) => e.node);
  for (const s of svcs) guardaProducao('service (preflight)', s.name);
  // Nomes de environment NÃO passam pelo guard: "production" é o DEFAULT do Railway
  // dentro do projeto dedicado (achado 4 trata disso via rename/create de `staging`).
  if (environmentId) {
    const envAlvo = envs.find((e) => e.id === environmentId);
    if (!envAlvo) {
      falhar(`Preflight: environment ${environmentId} NAO pertence ao projeto ${NOME_PROJETO} — abortado.`);
    }
    // [REVISOR 01a03bb9 DELTA achado 1] Pertencimento NAO basta: o env antigo
    // "production" (default do Railway) pertence ao projeto e reteria as secrets —
    // o connect PRECISA do env chamado exatamente `staging` (rode o re-prepare
    // idempotente antes: ele renomeia ou cria).
    if (!/^staging$/i.test(envAlvo.name)) {
      falhar(
        `Preflight: environment ${environmentId} chama-se "${envAlvo.name}", nao "staging" — connect RECUSADO. Rode --phase=prepare --project-id=${projectId} (renomeia/cria o env staging) e use o environmentId do output.`
      );
    }
  }
  if (serviceId) {
    const svc = svcs.find((s) => s.id === serviceId);
    if (!svc) falhar(`Preflight: service ${serviceId} NAO pertence ao projeto ${NOME_PROJETO} — abortado.`);
    if (svc.name !== NOME_SERVICE) {
      falhar(`Preflight: service ${serviceId} chama-se "${svc.name}", nao "${NOME_SERVICE}" — abortado.`);
    }
  }
  return p;
}

/** [REVISOR 01a03bb9 achado 4] Garante environment chamado `staging` (contrato D1):
 *  rename do env alvo quando a mutation existir; senão cria um `staging` novo e o
 *  devolve (o chamador refaz domínio/vars nele e reporta o antigo para limpeza). */
export async function garantirEnvironmentStaging(gql, disp, { projectId, environmentId, nomeAtual }) {
  if (/^staging$/i.test(nomeAtual ?? '')) return { environmentId, renomeado: false, criado: false };
  if (disp.has('environmentRename')) {
    const r = await gql(
      `mutation($id: String!, $input: EnvironmentRenameInput!) { environmentRename(id: $id, input: $input) { id name } }`,
      { id: environmentId, input: { name: 'staging' } },
      { permitirErros: true }
    );
    if (!r.errors?.length && r.data?.environmentRename?.id) {
      return { environmentId, renomeado: true, criado: false };
    }
  }
  const r = await gql(
    `mutation($input: EnvironmentCreateInput!) { environmentCreate(input: $input) { id name } }`,
    { input: { projectId, name: 'staging' } }
  );
  const novo = r.data?.environmentCreate?.id ?? falhar('environmentCreate(staging) nao devolveu id.');
  return { environmentId: novo, renomeado: false, criado: true, environmentAntigo: environmentId };
}

// ── PREPARE ──────────────────────────────────────────────────────────────────
export async function prepare(gql, { projectId = null, workspaceId = null } = {}) {
  const inv = { projectId, environmentId: null, serviceId: null, redis: null, dominio: null };
  try {
    const disp = await mutationsDisponiveis(gql);
    exigirMutations(disp, [
      'projectCreate',
      'environmentCreate',
      'serviceCreate',
      'serviceDomainCreate',
      'variableCollectionUpsert',
    ]);

    // 1) Projeto DEDICADO. Três caminhos, todos com identidade PROVADA antes de mutar
    //    [REVISOR 01a03bb9 achado 2]: --project-id ⇒ preflight verificarIdentidade
    //    (nunca confiança cega); sem id ⇒ adoção por NOME fail-closed; ausência
    //    provada ⇒ criar.
    let nomeEnvAlvo = null;
    const adotarDoNo = (no) => {
      inv.projectId = no.id;
      const envs = (no.environments?.edges ?? []).map((e) => e.node);
      const alvo = envs.find((e) => /^staging$/i.test(e.name)) ?? (envs.length === 1 ? envs[0] : null);
      inv.environmentId = alvo?.id ?? null;
      nomeEnvAlvo = alvo?.name ?? null;
      const servicos = (no.services?.edges ?? []).map((e) => e.node);
      const svc = servicos.find((s) => s.name === NOME_SERVICE);
      if (svc) inv.serviceId = svc.id;
      // [REVISOR 01a03bb9 DELTA-3] Redis JÁ criado (pelo template de um run anterior
      // ou pelo usuário no passo 5) ⇒ o bloco de template NÃO roda de novo — um
      // segundo Redis seria recurso FATURÁVEL fora da autorização D2.
      const redis = servicos.find((s) => /^redis$/i.test(s.name));
      if (redis) inv.redis = `ja-existente (service ${redis.id})`;
    };
    if (inv.projectId) {
      adotarDoNo(await verificarIdentidade(gql, { projectId: inv.projectId }));
    } else {
      const existente = await acharProjetoExistente(gql); // fail-closed em erro de listagem
      if (existente) {
        guardaProducao('projeto adotado', existente.name);
        adotarDoNo(existente);
      } else {
        const wsId = await resolverWorkspace(gql, workspaceId);
        const r = await gql(
          `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id name environments { edges { node { id name } } } } }`,
          { input: { name: NOME_PROJETO, description: 'AdmAi application STAGING (isolado; nunca producao)', workspaceId: wsId } }
        );
        const p = r.data?.projectCreate;
        if (!p?.id) falhar('projectCreate nao devolveu id.');
        guardaProducao('projeto criado', p.name);
        adotarDoNo({ ...p, services: { edges: [] } });
      }
    }

    // 2) Environment `staging` DE VERDADE [REVISOR 01a03bb9 achado 4]: rename do env
    //    alvo quando a API permitir; senão cria `staging` novo (domínio/vars refeitos
    //    nele) e reporta o antigo para limpeza manual. Sem alvo nenhum ⇒ cria.
    if (inv.environmentId) {
      const g = await garantirEnvironmentStaging(gql, disp, {
        projectId: inv.projectId,
        environmentId: inv.environmentId,
        nomeAtual: nomeEnvAlvo,
      });
      inv.environmentId = g.environmentId;
      if (g.renomeado) inv.environmentNota = `env renomeado para staging (era "${nomeEnvAlvo}")`;
      if (g.criado)
        inv.environmentNota =
          `env staging CRIADO; o antigo ${g.environmentAntigo} ("${nomeEnvAlvo}") ficou sem uso — remova no dashboard. ` +
          `ATENCAO [user-gate NOVAMENTE]: as vars SECRETAS e o Redis do passo 5 valem POR ENVIRONMENT — refaca-os no env staging novo antes do connect (o proprio connect recusa fail-closed enquanto faltarem).`;
    } else {
      const r = await gql(
        `mutation($input: EnvironmentCreateInput!) { environmentCreate(input: $input) { id name } }`,
        { input: { projectId: inv.projectId, name: 'staging' } }
      );
      inv.environmentId = r.data?.environmentCreate?.id ?? falhar('environmentCreate nao devolveu id.');
    }

    // 3) Service SEM source (bifásico) — só cria se não foi adotado.
    if (!inv.serviceId) {
      const r = await gql(
        `mutation($input: ServiceCreateInput!) { serviceCreate(input: $input) { id name } }`,
        { input: { projectId: inv.projectId, name: NOME_SERVICE } }
      );
      const s = r.data?.serviceCreate;
      if (!s?.id) falhar('serviceCreate nao devolveu id.');
      guardaProducao('service criado', s.name);
      inv.serviceId = s.id;
    }

    // 4) Redis gerenciado (custo AUTORIZADO pelo D2 literal). O template API do
    //    Railway recusou o input simples no run real ("Problem processing request") —
    //    tentativa única; QUALQUER recusa vira PENDÊNCIA MANUAL BARULHENTA (nunca
    //    silenciosa) SEM abortar o resto do prepare: domínio+vars seguem, e a var
    //    REDIS_URL referencia o service "Redis" que o usuário criar no dashboard.
    if (!inv.redis) {
      const m = ['templateDeployV2', 'templateDeploy'].find((x) => disp.has(x));
      let criou = false;
      if (m) {
        const r = await gql(
          `mutation($input: ${m === 'templateDeployV2' ? 'TemplateDeployV2Input' : 'TemplateDeployInput'}!) { ${m}(input: $input) { projectId } }`,
          { input: { projectId: inv.projectId, environmentId: inv.environmentId, templateCode: 'redis' } },
          { permitirErros: true }
        );
        criou = !r.errors?.length;
      }
      inv.redis = criou
        ? 'via-template'
        : `MANUAL_PENDENTE: Dashboard Railway -> projeto ${NOME_PROJETO} -> environment staging -> Create -> Database -> Redis (nome do service DEVE ser "Redis" para a referencia \${{Redis.REDIS_URL}}).`;
    }

    // 5) Domínio público do service (necessário p/ PUBLIC_URL e VITE_API_URL_STAGING).
    {
      const r = await gql(
        `mutation($input: ServiceDomainCreateInput!) { serviceDomainCreate(input: $input) { domain } }`,
        { input: { environmentId: inv.environmentId, serviceId: inv.serviceId } },
        { permitirErros: true }
      );
      inv.dominio = r.data?.serviceDomainCreate?.domain ?? null;
      if (!inv.dominio) {
        // Rerun idempotente: domínio pode já existir — consultar.
        const q = await gql(
          `query($environmentId: String!, $serviceId: String!) { domains(environmentId: $environmentId, serviceId: $serviceId) { serviceDomains { domain } } }`,
          { environmentId: inv.environmentId, serviceId: inv.serviceId },
          { permitirErros: true }
        );
        inv.dominio = q.data?.domains?.serviceDomains?.[0]?.domain ?? null;
      }
      if (!inv.dominio) falhar('serviceDomainCreate/domains nao devolveu domain.');
      guardaProducao('dominio gerado', inv.dominio);
    }

    // 6) Vars NÃO-secretas (as SECRETAS são do usuário, via dashboard — lista no output).
    await gql(
      `mutation($input: VariableCollectionUpsertInput!) { variableCollectionUpsert(input: $input) }`,
      {
        input: {
          projectId: inv.projectId,
          environmentId: inv.environmentId,
          serviceId: inv.serviceId,
          variables: VARS_NAO_SECRETAS(inv.dominio),
        },
      }
    );

    return inv;
  } catch (e) {
    // Inventário PARCIAL sempre visível — rerun idempotente depende disso (D1).
    e.inventarioParcial = inv;
    throw e;
  }
}

// ── CONNECT ──────────────────────────────────────────────────────────────────
export async function connect(gql, { projectId, environmentId, serviceId }) {
  if (!projectId || !environmentId || !serviceId) {
    falhar('connect exige --project-id, --environment-id e --service-id (do output do prepare).');
  }
  const disp = await mutationsDisponiveis(gql);
  exigirMutations(disp, ['serviceConnect', 'serviceInstanceUpdate']);

  // 0) PREFLIGHT DE IDENTIDADE (read-only) [REVISOR 01a03bb9 achado 2]: prova que os
  //    3 IDs são o projeto dedicado, e que env/service pertencem a ele, ANTES de
  //    qualquer mutation — IDs colados de outro projeto são recusados aqui.
  await verificarIdentidade(gql, { projectId, environmentId, serviceId });

  // 1) Vars SECRETAS presentes por NOME (valores NUNCA tocados/impressos).
  {
    const r = await gql(
      `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
         variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`,
      { projectId, environmentId, serviceId }
    );
    const nomes = Object.keys(r.data?.variables ?? {});
    const faltam = SECRETAS_OBRIGATORIAS.filter((n) => !nomes.includes(n));
    if (faltam.length) {
      falhar(
        `Vars SECRETAS ausentes no service staging: ${faltam.join(', ')}.`,
        `Dashboard Railway → projeto ${NOME_PROJETO} → service ${NOME_SERVICE} → Variables: preencha os nomes acima (valores do admai-staging; gere JWT_SECRET/ENCRYPTION_KEY/API_TOKEN novos com openssl rand -hex 32; NUNCA os de producao). Depois re-rode --phase=connect.`
      );
    }
  }

  // 2) Conectar o source (dispara o primeiro deploy — os guards de boot assumem daqui).
  await gql(
    `mutation($id: String!, $input: ServiceConnectInput!) { serviceConnect(id: $id, input: $input) { id } }`,
    { id: serviceId, input: { repo: REPO, branch: BRANCH } }
  );

  // 3) rootDirectory + healthcheck (railway.json cobre health, mas fixamos explicitamente).
  await gql(
    `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
       serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }`,
    { serviceId, environmentId, input: { rootDirectory: ROOT_DIR, healthcheckPath: '/health' } }
  );

  return { projectId, environmentId, serviceId, conectado: `${REPO}#${BRANCH}:${ROOT_DIR}` };
}

// ── Selftest (fetch injetado; nunca toca a API real) ─────────────────────────
export async function autoteste() {
  const casos = [];
  const caso = async (rotulo, fn) => {
    try {
      casos.push([rotulo, Boolean(await fn())]);
    } catch (e) {
      casos.push([`${rotulo} — lancou: ${e.message}`, false]);
    }
  };
  const respostas = (mapa) => async (_url, { body }) => {
    const { query } = JSON.parse(body);
    for (const [chave, resp] of Object.entries(mapa)) {
      if (query.includes(chave)) return { status: 200, json: async () => resp };
    }
    return { status: 200, json: async () => ({ errors: [{ message: `sem stub p/ ${query.slice(0, 40)}` }] }) };
  };
  const schemaCom = (...extras) => ({
    data: {
      __schema: {
        mutationType: {
          fields: ['projectCreate', 'environmentCreate', 'serviceCreate', 'serviceDomainCreate',
            'variableCollectionUpsert', 'templateDeployV2', 'serviceConnect', 'serviceInstanceUpdate',
            ...extras]
            .map((name) => ({ name })),
        },
      },
    },
  });
  const SCHEMA_OK = schemaCom();
  const NO_PROJETO_OK = (envs, svcs) => ({
    data: { project: {
      id: 'p-ok', name: 'admai-staging',
      environments: { edges: envs.map((e) => ({ node: e })) },
      services: { edges: svcs.map((s) => ({ node: s })) },
    } },
  });

  await caso('token sem autorizacao falha EXPLICITO com passo manual', async () => {
    const gql = criarCliente('t', async () => ({ status: 401, json: async () => ({}) }));
    try {
      await mutationsDisponiveis(gql);
      return false;
    } catch (e) {
      return /sem autorizacao/.test(e.message) && /token de CONTA/.test(e.manual ?? '');
    }
  });

  await caso('mutation obrigatoria ausente no schema falha EXPLICITO', async () => {
    const soLeitura = {
      data: { __schema: { mutationType: { fields: [{ name: 'serviceConnect' }] } } },
    };
    const gql = criarCliente('t', respostas({ __schema: soLeitura }));
    try {
      await prepare(gql, {});
      return false;
    } catch (e) {
      return /nao expoe mutations obrigatorias/.test(e.message);
    }
  });

  await caso('multiplos workspaces sem --workspace-id falha EXPLICITO listando nomes', async () => {
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
      workspaces: { data: { me: { workspaces: [{ id: 'w1', name: 'Pessoal' }, { id: 'w2', name: 'Empresa' }] } } },
    }));
    try {
      await prepare(gql, {});
      return false;
    } catch (e) {
      return /2 workspaces/.test(e.message) && /workspace-id/.test(e.manual ?? '');
    }
  });

  await caso('prepare feliz devolve inventario completo (projeto dedicado, env staging, sem source)', async () => {
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
      workspaces: { data: { me: { workspaces: [{ id: 'w1', name: 'n1imp workspace' }] } } },
      projectCreate: { data: { projectCreate: { id: 'p1', name: 'admai-staging', environments: { edges: [{ node: { id: 'e1', name: 'production' } }] } } } },
      environmentCreate: { data: { environmentCreate: { id: 'e2', name: 'staging' } } },
      serviceCreate: { data: { serviceCreate: { id: 's1', name: 'admai-staging' } } },
      templateDeployV2: { data: { templateDeployV2: { projectId: 'p1' } } },
      serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'admai-staging-x.up.railway.app' } } },
      variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
    }));
    const inv = await prepare(gql, {});
    /* env default "production" do projeto novo NÃO satisfaz o contrato: sem
       environmentRename no schema, um env `staging` novo (e2) é criado. */
    return inv.projectId === 'p1' && inv.serviceId === 's1' && inv.dominio?.includes('railway.app')
      && inv.environmentId === 'e2' && /CRIADO/.test(inv.environmentNota ?? '');
  });

  await caso('rerun com --project-id: preflight de identidade ADOTA (sem projectCreate)', async () => {
    let criouProjeto = false;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (query.includes('projectCreate')) criouProjeto = true;
      const mapa = {
        __schema: SCHEMA_OK,
        'project(': NO_PROJETO_OK(
          [{ id: 'e-stg', name: 'staging' }],
          [{ id: 's1', name: 'admai-staging' }]
        ),
        templateDeployV2: { data: { templateDeployV2: { projectId: 'p-ok' } } },
        serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'ok.up.railway.app' } } },
        variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
      };
      for (const [k, v] of Object.entries(mapa)) if (query.includes(k)) return { status: 200, json: async () => v };
      return { status: 200, json: async () => ({ errors: [{ message: 'sem stub' }] }) };
    });
    const inv = await prepare(gql, { projectId: 'p-ok' });
    return criouProjeto === false && inv.projectId === 'p-ok' && inv.environmentId === 'e-stg'
      && inv.serviceId === 's1';
  });

  await caso('[01a03bb9-2] --project-id de OUTRO projeto (nome divergente) e RECUSADO antes de mutar', async () => {
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
      'project(': { data: { project: { id: 'p-x', name: 'outro-projeto', environments: { edges: [] }, services: { edges: [] } } } },
    }));
    try {
      await prepare(gql, { projectId: 'p-x' });
      return false;
    } catch (e) {
      return /OUTRO projeto/.test(e.message);
    }
  });

  await caso('[01a03bb9-3] adocao FAIL-CLOSED: erro na listagem NAO vira projectCreate', async () => {
    let criouProjeto = false;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (query.includes('projectCreate')) criouProjeto = true;
      if (query.includes('__schema')) return { status: 200, json: async () => SCHEMA_OK };
      return { status: 200, json: async () => ({ errors: [{ message: 'listagem indisponivel' }] }) };
    });
    try {
      await prepare(gql, {});
      return false;
    } catch (e) {
      return criouProjeto === false && /PROVAR presenca\/ausencia/.test(e.message)
        && /--project-id/.test(e.manual ?? '');
    }
  });

  await caso('[01a03bb9-4] env "production" com environmentRename no schema e RENOMEADO para staging', async () => {
    const gql = criarCliente('t', respostas({
      __schema: schemaCom('environmentRename'),
      'project(': NO_PROJETO_OK(
        [{ id: 'e-prod', name: 'production' }],
        [{ id: 's1', name: 'admai-staging' }]
      ),
      environmentRename: { data: { environmentRename: { id: 'e-prod', name: 'staging' } } },
      templateDeployV2: { data: { templateDeployV2: { projectId: 'p-ok' } } },
      serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'ok.up.railway.app' } } },
      variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
    }));
    const inv = await prepare(gql, { projectId: 'p-ok' });
    return inv.environmentId === 'e-prod' && /renomeado/.test(inv.environmentNota ?? '');
  });

  await caso('ADOCAO: projeto orfao existente e adotado por NOME (sem projectCreate/serviceCreate); Redis recusado vira MANUAL_PENDENTE sem abortar', async () => {
    let criouProjeto = false;
    let criouService = false;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (query.includes('projectCreate')) criouProjeto = true;
      if (query.includes('serviceCreate')) criouService = true;
      const mapa = {
        __schema: SCHEMA_OK,
        'projects { edges': {
          data: { me: { workspaces: [{ id: 'w1', name: 'ws', projects: { edges: [{ node: {
            id: 'p-orfao', name: 'admai-staging',
            environments: { edges: [{ node: { id: 'e-orfao', name: 'staging' } }] },
            services: { edges: [{ node: { id: 's-orfao', name: 'admai-staging' } }] },
          } }] } }] } },
        },
        templateDeployV2: { errors: [{ message: 'Problem processing request' }] },
        serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'orfao.up.railway.app' } } },
        variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
      };
      for (const [k, v] of Object.entries(mapa)) if (query.includes(k)) return { status: 200, json: async () => v };
      return { status: 200, json: async () => ({ errors: [{ message: 'sem stub' }] }) };
    });
    const inv = await prepare(gql, {});
    return criouProjeto === false && criouService === false && inv.projectId === 'p-orfao'
      && inv.serviceId === 's-orfao' && /MANUAL_PENDENTE/.test(inv.redis) && inv.dominio === 'orfao.up.railway.app';
  });

  await caso('[01a03bb9-DELTA3] re-prepare com service Redis JA EXISTENTE nao chama templateDeploy (sem 2o Redis faturavel)', async () => {
    let chamouTemplate = 0;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (/templateDeploy/.test(query)) chamouTemplate += 1;
      const mapa = {
        __schema: SCHEMA_OK,
        'project(': NO_PROJETO_OK(
          [{ id: 'e-stg', name: 'staging' }],
          [{ id: 's1', name: 'admai-staging' }, { id: 's-redis', name: 'Redis' }]
        ),
        serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'ok.up.railway.app' } } },
        variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
      };
      for (const [k, v] of Object.entries(mapa)) if (query.includes(k)) return { status: 200, json: async () => v };
      return { status: 200, json: async () => ({ errors: [{ message: 'sem stub' }] }) };
    });
    const inv = await prepare(gql, { projectId: 'p-ok' });
    return chamouTemplate === 0 && /ja-existente/.test(inv.redis ?? '');
  });

  await caso('GUARD anti-producao morde (dominio que casa producao)', async () => {
    try {
      guardaProducao('teste', 'api.chaveirobot.com.br');
      return false;
    } catch (e) {
      return /PRODUCAO/.test(e.message);
    }
  });

  await caso('[01a03bb9-DELTA] connect com env "production" DO PROJETO e recusado ANTES de variables/mutations', async () => {
    let tocouVariablesOuMutation = false;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (/variables\(|serviceConnect|serviceInstanceUpdate/.test(query)) tocouVariablesOuMutation = true;
      if (query.includes('__schema')) return { status: 200, json: async () => SCHEMA_OK };
      if (query.includes('project(')) {
        return {
          status: 200,
          json: async () => ({
            data: { project: { id: 'p-ok', name: 'admai-staging',
              environments: { edges: [{ node: { id: 'e-prod', name: 'production' } }, { node: { id: 'e-stg', name: 'staging' } }] },
              services: { edges: [{ node: { id: 's1', name: 'admai-staging' } }] } } },
          }),
        };
      }
      return { status: 200, json: async () => ({ errors: [{ message: 'sem stub' }] }) };
    });
    try {
      await connect(gql, { projectId: 'p-ok', environmentId: 'e-prod', serviceId: 's1' });
      return false;
    } catch (e) {
      return tocouVariablesOuMutation === false && /nao "staging" — connect RECUSADO/.test(e.message);
    }
  });

  await caso('connect sem vars secretas falha listando NOMES (nunca valores)', async () => {
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
      'project(': NO_PROJETO_OK([{ id: 'e', name: 'staging' }], [{ id: 's', name: 'admai-staging' }]),
      'variables(': { data: { variables: { APP_ENV: 'staging', DATABASE_URL: 'x' } } },
    }));
    try {
      await connect(gql, { projectId: 'p', environmentId: 'e', serviceId: 's' });
      return false;
    } catch (e) {
      return /SECRETAS ausentes/.test(e.message) && e.message.includes('DIRECT_URL')
        && !e.message.includes("'x'") && /Dashboard Railway/.test(e.manual ?? '');
    }
  });

  await caso('connect feliz conecta repo/branch/root (apos preflight de identidade)', async () => {
    const todas = Object.fromEntries(SECRETAS_OBRIGATORIAS.map((n) => [n, 'v']));
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
      'project(': NO_PROJETO_OK([{ id: 'e', name: 'staging' }], [{ id: 's', name: 'admai-staging' }]),
      'variables(': { data: { variables: { ...todas, APP_ENV: 'staging' } } },
      serviceConnect: { data: { serviceConnect: { id: 's' } } },
      serviceInstanceUpdate: { data: { serviceInstanceUpdate: true } },
    }));
    const r = await connect(gql, { projectId: 'p', environmentId: 'e', serviceId: 's' });
    return r.conectado === 'n1imp/AdmAi#staging:chaveiro-bot';
  });

  return casos;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => (argv.find((a) => a.startsWith(`--${n}=`)) ?? '').split('=')[1] || null;

if (argv.includes('--selftest')) {
  const casos = await autoteste();
  const falhos = casos.filter(([, ok]) => !ok);
  console.log(`railway-staging-bootstrap — selftest (fetch injetado; API real intocada)`);
  console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
  for (const [rotulo] of falhos) console.log(`    FAIL  ${rotulo}`);
  process.exit(falhos.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('railway-staging-bootstrap.mjs')) {
  const fase = flag('phase');
  if (!['prepare', 'connect'].includes(fase ?? '')) {
    console.error('uso: --phase=prepare [--project-id=..] | --phase=connect --project-id=.. --environment-id=.. --service-id=.. | --selftest');
    process.exit(2);
  }
  const token = process.env.RAILWAY_TOKEN;
  if (!token) {
    console.error('RAILWAY_TOKEN ausente no env.');
    process.exit(2);
  }
  const gql = criarCliente(token);
  try {
    if (fase === 'prepare') {
      const inv = await prepare(gql, { projectId: flag('project-id'), workspaceId: flag('workspace-id') });
      console.log('PREPARE_OK ' + JSON.stringify(inv));
      console.log(`\nPROXIMOS PASSOS:\n 1. Dashboard Railway -> projeto ${NOME_PROJETO} -> service ${NOME_SERVICE} -> Variables:`);
      console.log(`    preencher (valores do admai-staging; novos, nunca de producao): ${SECRETAS_OBRIGATORIAS.join(', ')}`);
      console.log(` 2. Re-rodar com --phase=connect --project-id=${inv.projectId} --environment-id=${inv.environmentId} --service-id=${inv.serviceId}`);
    } else {
      const r = await connect(gql, {
        projectId: flag('project-id'),
        environmentId: flag('environment-id'),
        serviceId: flag('service-id'),
      });
      console.log('CONNECT_OK ' + JSON.stringify(r));
    }
  } catch (e) {
    console.error(`\nFALHOU: ${e.message}`);
    if (e.inventarioParcial) console.error(`INVENTARIO_PARCIAL ${JSON.stringify(e.inventarioParcial)}`);
    if (e.manual) console.error(`\nPASSO MANUAL EXATO:\n${e.manual}`);
    process.exit(1);
  }
}
