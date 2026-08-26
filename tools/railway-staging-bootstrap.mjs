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
 *  lição do run real: falha no meio deixava projeto órfão e um rerun cego duplicaria). */
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
  if (r.errors?.length) return null; // schema sem essa forma ⇒ sem adoção automática
  for (const ws of r.data?.me?.workspaces ?? []) {
    for (const e of ws.projects?.edges ?? []) {
      if (e.node?.name === NOME_PROJETO) return e.node;
    }
  }
  return null;
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

    // 1) Projeto DEDICADO: adota o existente por NOME (rerun idempotente) ou cria.
    if (!inv.projectId) {
      const existente = await acharProjetoExistente(gql);
      if (existente) {
        guardaProducao('projeto adotado', existente.name);
        inv.projectId = existente.id;
        const envs = (existente.environments?.edges ?? []).map((e) => e.node);
        inv.environmentId =
          envs.find((e) => /staging/i.test(e.name))?.id ?? (envs.length === 1 ? envs[0].id : null);
        const svc = (existente.services?.edges ?? [])
          .map((e) => e.node)
          .find((s) => s.name === NOME_SERVICE);
        if (svc) inv.serviceId = svc.id;
      } else {
        const wsId = await resolverWorkspace(gql, workspaceId);
        const r = await gql(
          `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { id name environments { edges { node { id name } } } } }`,
          { input: { name: NOME_PROJETO, description: 'AdmAi application STAGING (isolado; nunca producao)', workspaceId: wsId } }
        );
        const p = r.data?.projectCreate;
        if (!p?.id) falhar('projectCreate nao devolveu id.');
        guardaProducao('projeto criado', p.name);
        inv.projectId = p.id;
        const envs = (p.environments?.edges ?? []).map((e) => e.node);
        inv.environmentId =
          envs.find((e) => /staging/i.test(e.name))?.id ?? (envs.length === 1 ? envs[0].id : null);
      }
    }

    // 2) Environment explicitamente `staging` (D1) — cria se ainda não há alvo.
    if (!inv.environmentId) {
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
    {
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
  const SCHEMA_OK = {
    data: {
      __schema: {
        mutationType: {
          fields: ['projectCreate', 'environmentCreate', 'serviceCreate', 'serviceDomainCreate',
            'variableCollectionUpsert', 'templateDeployV2', 'serviceConnect', 'serviceInstanceUpdate']
            .map((name) => ({ name })),
        },
      },
    },
  };

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
    return inv.projectId === 'p1' && inv.serviceId === 's1' && inv.dominio?.includes('railway.app')
      && inv.environmentId === 'e1'; /* único env do projeto novo é aceito como alvo */
  });

  await caso('rerun com --project-id NAO chama projectCreate (idempotente)', async () => {
    let criouProjeto = false;
    const gql = criarCliente('t', async (_u, { body }) => {
      const { query } = JSON.parse(body);
      if (query.includes('projectCreate')) criouProjeto = true;
      const mapa = {
        __schema: SCHEMA_OK,
        environmentCreate: { data: { environmentCreate: { id: 'e2', name: 'staging' } } },
        serviceCreate: { data: { serviceCreate: { id: 's1', name: 'admai-staging' } } },
        templateDeployV2: { data: { templateDeployV2: { projectId: 'p9' } } },
        serviceDomainCreate: { data: { serviceDomainCreate: { domain: 'ok.up.railway.app' } } },
        variableCollectionUpsert: { data: { variableCollectionUpsert: true } },
      };
      for (const [k, v] of Object.entries(mapa)) if (query.includes(k)) return { status: 200, json: async () => v };
      return { status: 200, json: async () => ({ errors: [{ message: 'sem stub' }] }) };
    });
    const inv = await prepare(gql, { projectId: 'p9' });
    return criouProjeto === false && inv.projectId === 'p9';
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

  await caso('GUARD anti-producao morde (dominio que casa producao)', async () => {
    try {
      guardaProducao('teste', 'api.chaveirobot.com.br');
      return false;
    } catch (e) {
      return /PRODUCAO/.test(e.message);
    }
  });

  await caso('connect sem vars secretas falha listando NOMES (nunca valores)', async () => {
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
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

  await caso('connect feliz conecta repo/branch/root', async () => {
    const todas = Object.fromEntries(SECRETAS_OBRIGATORIAS.map((n) => [n, 'v']));
    const gql = criarCliente('t', respostas({
      __schema: SCHEMA_OK,
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
