/**
 * Jornadas E2E contra o STAGING REAL — painel staging (Cloudflare) + backend staging
 * (Railway) + Supabase admai-staging.  [STG-APP-STAGING-01 · D1 thread 01a038e5]
 *
 * Por que um driver próprio: `run.mjs` mocka a API (painel isolado), `jornadas.mjs`
 * é o driver do STACK LOCAL (sobe pontes Prisma no chaveiro-bot local), `capturar.mjs`
 * é medição. Aqui o alvo é uma URL REMOTA de staging com fixtures próprias — mesmo
 * padrão de sessão CDP dos outros drivers (cdp.mjs é o núcleo comum).
 *
 * TARGET GUARD (fail-closed): exige ADMAI_URL (painel staging) e ADMAI_API_URL
 * (backend staging, terminando em /api) — https, nunca localhost, nunca produção.
 * Sem eles o runner NEM ABRE navegador. `LOCAL != STAGING`.
 *
 * Fixtures (seed-staging.mjs do chaveiro-bot): dono.a.stg / gestor.a.stg / func.a.stg
 * (Empresa A) — senha via STAGING_FIXTURE_SENHA (nunca impressa). O serviço PENDENTE
 * da Empresa A existe para ser aprovado AQUI (jornada MANAGER) — SEED != ACCEPTANCE.
 *
 * Contrato por papel: LOGIN → NAVIGATION → DOMAIN READ → DOMAIN WRITE →
 * RBAC NEGATIVE (request REAL negada pelo backend, 401/403) → PERSISTENCE →
 * RELOAD → LOGOUT. RBAC negativo NUNCA é só UI: usa fetch in-page com o token real.
 *
 * Uso (depois que as URLs de staging existirem):
 *   ADMAI_URL=https://staging.admai-painel.pages.dev \
 *   ADMAI_API_URL=https://<backend-staging>/api \
 *   STAGING_FIXTURE_SENHA=... node e2e/staging.mjs [--viewport=360|390|1440|1920]
 */
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acharChrome, conectar } from './cdp.mjs';

// ── TARGET GUARD ─────────────────────────────────────────────────────────────
const REF_PRODUCAO = 'disljhkypaxpyzvbooge';
const HOSTS_PRODUCAO = [
  'app.chaveirobot.com.br',
  'admai-painel.pages.dev', // produção do projeto Pages (staging usa staging.admai-painel.pages.dev)
  'api.chaveirobot.com.br',
  'admai-production.up.railway.app',
];
function urlStagingOuAborta(nome, valor, { exigePathApi = false } = {}) {
  if (!valor) {
    console.error(
      `❌ ${nome} ausente — este runner SÓ roda contra o staging real (LOCAL != STAGING).`
    );
    process.exit(2);
  }
  let u;
  try {
    u = new URL(valor);
  } catch {
    console.error(`❌ ${nome} não é URL absoluta.`);
    process.exit(2);
  }
  const erros = [];
  if (u.protocol !== 'https:') erros.push('exige https');
  if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) erros.push('localhost proibido');
  if (HOSTS_PRODUCAO.includes(u.hostname)) erros.push(`host de PRODUÇÃO (${u.hostname})`);
  if (valor.includes(REF_PRODUCAO)) erros.push('contém ref do Supabase de produção');
  if (exigePathApi && u.pathname !== '/api')
    erros.push(`path deve ser exatamente /api (recebido ${u.pathname})`);
  if (erros.length) {
    console.error(`❌ ${nome} inválida para staging: ${erros.join('; ')}.`);
    process.exit(2);
  }
  return u;
}

const BASE = urlStagingOuAborta('ADMAI_URL', process.env.ADMAI_URL).origin;
const API = (() => {
  const u = urlStagingOuAborta('ADMAI_API_URL', process.env.ADMAI_API_URL, { exigePathApi: true });
  return `${u.origin}/api`;
})();
const SENHA = process.env.STAGING_FIXTURE_SENHA;
if (!SENHA || SENHA.length < 8) {
  console.error(
    '❌ STAGING_FIXTURE_SENHA ausente/curta (senha sintética do seed-staging; nunca impressa).'
  );
  process.exit(2);
}

const VIEWPORT = Number(
  (process.argv.find((a) => a.startsWith('--viewport=')) ?? '').split('=')[1] || 1280
);
const ALTURA = VIEWPORT <= 500 ? 780 : 800;
const MOBILE = VIEWPORT <= 500;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Sessão CDP (mesmas lições do jornadas.mjs, incl. limpeza no Windows) ─────
async function abrirNavegador() {
  const perfil = path.join(
    tmpdir(),
    `stg-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  );
  mkdirSync(perfil, { recursive: true });
  const chrome = spawn(
    acharChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let porta;
  for (let i = 0; i < 100 && !porta; i++) {
    try {
      porta = readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
    } catch {
      await espera(100);
    }
  }
  const alvo = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());
  await espera(400);
  const cdp = await conectar(alvo.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT,
    height: ALTURA,
    deviceScaleFactor: MOBILE ? 2 : 1,
    mobile: MOBILE,
  });

  const aval = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? 'erro no evaluate');
    return r.result.value;
  };
  const ir = async (rota) => {
    await cdp.send('Page.navigate', { url: BASE + rota });
    await espera(1800);
  };
  const texto = () => aval(`document.body.innerText`);
  const esperarTexto = async (re, ms = 10000) => {
    const padrao = re instanceof RegExp ? re : new RegExp(re, 'i');
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (padrao.test(await texto())) return true;
      await espera(250);
    }
    throw new Error(
      `texto não apareceu: ${padrao} | tela: "${(await texto()).slice(0, 120).replace(/\s+/g, ' ')}"`
    );
  };
  /* Diagnóstico embutido nas falhas de seletor: URL + controles/campos VISÍVEIS no
     momento — sem isto cada "não encontrado" contra o staging real vira adivinhação
     (a primeira execução real do driver falhou nas 4 jornadas sem dizer onde estava). */
  const diagnostico = () =>
    aval(`(() => {
      const vis = (e) => e.getBoundingClientRect().height > 0;
      const ctr = [...document.querySelectorAll('button, a, [role="tab"], [role="menuitem"]')]
        .filter(vis).map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).filter(Boolean).slice(0, 40);
      const campos = [...document.querySelectorAll('input, textarea, select')].filter(vis)
        .map((e) => e.placeholder || e.name || e.tagName.toLowerCase()).slice(0, 20);
      return location.pathname + ' | controles=' + JSON.stringify(ctr) + ' | campos=' + JSON.stringify(campos);
    })()`);
  const esperarCampo = async (seletor, ms = 10000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await aval(`!!document.querySelector(${JSON.stringify(seletor)})`)) return;
      await espera(250);
    }
    throw new Error(`campo não encontrado: ${seletor} [${await diagnostico()}]`);
  };
  const digitar = async (seletor, valor) => {
    await esperarCampo(seletor);
    const r = await aval(`(() => {
      const el = document.querySelector(${JSON.stringify(seletor)});
      if (!el) return 'AUSENTE';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valor)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`);
    if (r !== 'ok') throw new Error(`campo não encontrado: ${seletor}`);
  };
  /* Com RETRY [primeira execução real contra o staging]: as listas/estados chegam por
     fetch — um clique one-shot corria contra o loading (Aprovar/Bater ponto ausentes
     por serem clicados ANTES da resposta da API). Espera até `ms` pelo controle. */
  const clicarTexto = async (padrao, seletor = 'button, a, [role="tab"]', ms = 10000) => {
    const tenta = () =>
      aval(`(() => {
      const re = new RegExp(${JSON.stringify(padrao)}, 'i');
      const el = [...document.querySelectorAll(${JSON.stringify(seletor)})]
        .find((e) => re.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().height > 0);
      if (!el) return 'AUSENTE';
      el.click();
      return 'ok';
    })()`);
    const fim = Date.now() + ms;
    let r = await tenta();
    while (r !== 'ok' && Date.now() < fim) {
      await espera(300);
      r = await tenta();
    }
    if (r !== 'ok') throw new Error(`controle não encontrado: ${padrao} [${await diagnostico()}]`);
  };
  const consentirNecessarios = async () => {
    try {
      await clicarTexto('^Apenas necessários$');
      await espera(300);
    } catch {
      /* banner já respondido */
    }
  };
  const loginUi = async (usuario) => {
    await ir('/login');
    await consentirNecessarios();
    await digitar('input[placeholder="seu_usuario"]', usuario);
    await digitar('input[placeholder="••••••••"]', SENHA);
    await clicarTexto('Entrar', 'button[type="submit"]');
    /* Prova REAL de sessão: token no storage — checar texto mascarava falha de login
       (o regex de dashboard casava "Acesse o painel..." da própria tela de login e o
       429 do rate-limit passava despercebido até quebrar adiante). */
    const fim = Date.now() + 10000;
    while (Date.now() < fim) {
      if (await aval(`!!localStorage.getItem('admai_token')`)) return;
      await espera(300);
    }
    throw new Error(
      `login de ${usuario} NÃO estabeleceu sessão (sem token) — tela: "` +
        `${(await texto()).slice(0, 100).replace(/\s+/g, ' ')}" (rate-limit 5/15min?)`
    );
  };
  /* RBAC NEGATIVE de verdade: fetch in-page à API de STAGING com o token REAL da
     sessão — a negação tem de vir do BACKEND (401/403), nunca só do roteamento do
     front. Devolve o status HTTP. */
  const apiStatus = (metodo, rota, corpo) =>
    aval(`(async () => {
      const t = localStorage.getItem('admai_token');
      const r = await fetch(${JSON.stringify(API)} + ${JSON.stringify(rota)}, {
        method: ${JSON.stringify(metodo)},
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },${
          corpo !== undefined ? `\n        body: ${JSON.stringify(JSON.stringify(corpo))},` : ''
        }
      });
      return r.status;
    })()`);
  const logoutUi = async () => {
    /* O DESKTOP não expõe logout (achado real desta 1ª execução: o único botão "Sair"
       vive em /mais, a aba do nav mobile — registrado no backlog). A rota funciona em
       qualquer viewport; o clique continua sendo um logout REAL de UI. */
    await ir('/mais');
    await clicarTexto('^Sair$', 'button, a, [role="menuitem"]');
    await espera(1500);
    const token = await aval(`localStorage.getItem('admai_token')`);
    if (token) throw new Error('logout não limpou o token');
  };

  return {
    aval,
    ir,
    texto,
    esperarTexto,
    digitar,
    clicarTexto,
    consentirNecessarios,
    loginUi,
    apiStatus,
    logoutUi,
    fechar: () =>
      new Promise((resolver) => {
        cdp.close();
        if (process.platform === 'win32') {
          execFile('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], () => {
            const alvoPerfil = perfil.replace(/'/g, "''");
            execFile(
              'powershell',
              [
                '-NoProfile',
                '-Command',
                `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${alvoPerfil}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
              ],
              () => resolver()
            );
          });
        } else {
          chrome.kill();
          resolver();
        }
      }),
  };
}

const negado = (s) => s === 401 || s === 403;
const unico = Date.now().toString().slice(-6);

// ── Jornadas por papel (fixtures do seed-staging) ────────────────────────────
const JORNADAS = [
  {
    nome: `OWNER (dono.a.stg) ${VIEWPORT}px: login → dashboard → serviços → wizard de serviço → persistência → reload → logout`,
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('dono.a.stg'); // LOGIN
        await n.esperarTexto(/lucro do período|receita|painel/i, 12000); // NAVIGATION
        await n.ir('/servicos'); // DOMAIN READ (fixture histórica visível)
        await n.esperarTexto(/STG — Rua Alfa|Troca de fechadura/i, 10000);
        // DOMAIN WRITE — wizard real de 4 etapas (fluxo provado no stack local):
        await n.ir('/servicos/novo');
        /* O passo 1 tem DOIS selects (Técnico e Local) — setar só o select[0] às cegas
           travava a validação do Continuar (visto na 1ª execução real). Técnico é achado
           pela OPÇÃO em qualquer select; selects restantes vazios recebem a 1ª opção
           válida; e o resultado é CHECADO (antes 'TECNICO_AUSENTE' era ignorado). */
        /* O label "Técnico" renderiza ANTES das options (fetch /tecnicos) — esperar a
           OPÇÃO real existir, não o rótulo (TECNICO_AUSENTE visto na rodada 360). */
        {
          const fim = Date.now() + 12000;
          let tem = false;
          while (!tem && Date.now() < fim) {
            tem = await n.aval(
              `[...document.querySelectorAll('select option')].some((o) => /Func A Staging/i.test(o.textContent))`
            );
            if (!tem) await new Promise((r) => setTimeout(r, 300));
          }
        }
        const selecao = await n.aval(`(() => {
          const sels = [...document.querySelectorAll('select')];
          const setar = (sel, op) => {
            Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, op.value);
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          };
          const comTecnico = sels.find((s) => [...s.options].some((o) => /Func A Staging/i.test(o.textContent)));
          if (!comTecnico) return 'TECNICO_AUSENTE';
          setar(comTecnico, [...comTecnico.options].find((o) => /Func A Staging/i.test(o.textContent)));
          for (const s of sels) {
            if (s !== comTecnico && !s.value) {
              const op = [...s.options].find((o) => o.value);
              if (op) setar(s, op);
            }
          }
          return 'ok';
        })()`);
        if (selecao !== 'ok') throw new Error(`wizard: ${selecao}`);
        await n.digitar('input[placeholder="Endereço completo ou N/A"]', `STG jornada ${unico}`);
        await n.digitar(
          'textarea[placeholder="Descreva o serviço realizado"]',
          `Servico staging ${unico}`
        );
        await n.clicarTexto('^Continuar$');
        await espera(600);
        await n.clicarTexto('^Continuar$'); // sem materiais
        await espera(600);
        await n.digitar('input[placeholder="0,00"]', '150');
        await n.clicarTexto('^Continuar$');
        await espera(600);
        await n.esperarTexto(new RegExp(`Servico staging ${unico}`), 8000);
        await n.clicarTexto('Salvar serviço');
        await espera(2500);
        // RBAC NEGATIVE (backend real): SEM token, a API nega (limpa e restaura o token).
        const semToken = await n.aval(`(async () => {
          const t = localStorage.getItem('admai_token');
          localStorage.removeItem('admai_token');
          const r = await fetch(${JSON.stringify(API)} + '/usuarios');
          localStorage.setItem('admai_token', t);
          return r.status;
        })()`);
        if (!negado(semToken))
          throw new Error(`API sem token respondeu ${semToken} (esperado 401/403)`);
        // PERSISTENCE + RELOAD: o serviço criado sobrevive a um reload real.
        await n.ir('/servicos');
        await n.esperarTexto(new RegExp(`Servico staging ${unico}`), 10000);
        await n.logoutUi(); // LOGOUT
        return `serviço "Servico staging ${unico}" criado, persistiu após reload; sem-token=${semToken}`;
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: `MANAGER (gestor.a.stg) ${VIEWPORT}px: login → aprovações → APROVA o pendente → RBAC negativo (config) → reload → logout`,
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('gestor.a.stg'); // LOGIN
        await espera(1000);
        await n.ir('/aprovacoes'); // NAVIGATION + DOMAIN READ
        await n.esperarTexto(/AGUARDA APROVAÇÃO|Instalação de cilindro|aprovaç/i, 12000);
        // DOMAIN WRITE — a transição que o seed deixou de propósito para o produto:
        await n.clicarTexto('^Aprovar$');
        await espera(2500);
        // RBAC NEGATIVE (backend real): gestor NÃO administra a empresa (PATCH config).
        const s = await n.apiStatus('PATCH', '/config/empresa', { nome: 'X' });
        if (!negado(s))
          throw new Error(`PATCH /config/empresa como gestor respondeu ${s} (esperado 401/403)`);
        // PERSISTENCE + RELOAD: o pendente aprovado não volta.
        await n.ir('/aprovacoes');
        await espera(1500);
        const t = await n.texto();
        if (/AGUARDA APROVAÇÃO/.test(t))
          throw new Error('pendente ainda listado após aprovar + reload');
        await n.logoutUi(); // LOGOUT
        return `pendente aprovado no produto; config negada ao gestor (HTTP ${s})`;
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: `EMPLOYEE (func.a.stg) ${VIEWPORT}px: login → meu ponto → BATE ponto → RBAC negativo (usuários) → reload → logout`,
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('func.a.stg'); // LOGIN
        await espera(1000);
        await n.ir('/meu-ponto'); // NAVIGATION + DOMAIN READ
        await n.esperarTexto(/ponto/i, 10000);
        const antes = await n.texto();
        await n.clicarTexto('Bater ponto'); // DOMAIN WRITE (transição real do dia)
        await espera(2500);
        const depois = await n.texto();
        if (antes === depois) throw new Error('nada mudou após bater ponto');
        // RBAC NEGATIVE (backend real): funcionário não lista usuários da empresa.
        const s = await n.apiStatus('GET', '/usuarios');
        if (!negado(s))
          throw new Error(`GET /usuarios como funcionário respondeu ${s} (esperado 401/403)`);
        // PERSISTENCE + RELOAD: a batida sobrevive ao reload.
        await n.ir('/meu-ponto');
        await espera(1500);
        const aposReload = await n.texto();
        if (aposReload === antes) throw new Error('estado do dia voltou ao de antes após reload');
        await n.logoutUi(); // LOGOUT
        return `batida registrada e persistiu; /usuarios negado ao funcionário (HTTP ${s})`;
      } finally {
        await n.fechar();
      }
    },
  },
];

// [REVISOR 01a038fc achado 5] TENANT-NEGATIVE materializado: A não lê nem muta B,
// provado no BACKEND real (status HTTP), com controles positivos das MESMAS rotas
// (B lê o próprio recurso; A lê o próprio) — a negação nunca é "rota inexistente".
JORNADAS.push({
  nome: `TENANT-NEGATIVE ${VIEWPORT}px: B expõe id → A lê o PRÓPRIO (200) mas NÃO lê/deleta o de B (403/404)`,
  async executar() {
    const lerLista = (n) =>
      n.aval(`(async () => {
        const t = localStorage.getItem('admai_token');
        const r = await fetch(${JSON.stringify(API)} + '/servicos', {
          headers: { Authorization: 'Bearer ' + t },
        });
        const j = r.status === 200 ? await r.json() : null;
        return { status: r.status, ids: j && Array.isArray(j.data) ? j.data.map((s) => s.id) : [] };
      })()`);

    // Sessão 1 — dono.b.stg: controle positivo do TENANT B + captura do id alvo.
    let idB;
    {
      const nb = await abrirNavegador();
      try {
        await nb.loginUi('dono.b.stg');
        await espera(1500);
        const lista = await lerLista(nb);
        if (lista.status !== 200 || !lista.ids.length) {
          throw new Error(
            `B não listou os próprios serviços (status ${lista.status}, ${lista.ids.length} ids)`
          );
        }
        idB = lista.ids[0];
      } finally {
        await nb.fechar();
      }
    }

    // Sessão 2 — dono.a.stg: positivo próprio nas MESMAS rotas + negativos contra idB.
    const na = await abrirNavegador();
    try {
      await na.loginUi('dono.a.stg');
      await espera(1500);
      const listaA = await lerLista(na);
      if (listaA.status !== 200 || !listaA.ids.length) {
        throw new Error(`A não listou os próprios serviços (status ${listaA.status})`);
      }
      if (listaA.ids.includes(idB)) {
        throw new Error(`VAZAMENTO: o serviço ${idB} do tenant B apareceu na lista do tenant A`);
      }
      const idA = listaA.ids[0];
      const proprio = await na.apiStatus('GET', `/servicos/${idA}`);
      if (proprio !== 200)
        throw new Error(`controle positivo falhou: GET próprio ${idA} → ${proprio}`);
      const leituraB = await na.apiStatus('GET', `/servicos/${idB}`);
      if (![403, 404].includes(leituraB)) {
        throw new Error(`A LEU o serviço ${idB} do tenant B (HTTP ${leituraB}; esperado 403/404)`);
      }
      const deleteB = await na.apiStatus('DELETE', `/servicos/${idB}`);
      if (![403, 404].includes(deleteB)) {
        throw new Error(
          `A MUTOU (DELETE) o serviço ${idB} do tenant B (HTTP ${deleteB}; esperado 403/404)`
        );
      }
      await na.logoutUi();
      return `A→A ok (GET ${idA}=200); A→B negado (read=${leituraB}, delete=${deleteB}); sem vazamento na listagem`;
    } finally {
      await na.fechar();
    }
  },
});

// ── Runner ───────────────────────────────────────────────────────────────────
console.log(
  `STG-E2E @ ${BASE} (API ${API}) — viewport ${VIEWPORT}×${ALTURA}${MOBILE ? ' mobile' : ''}`
);
let falhas = 0;
for (const j of JORNADAS) {
  try {
    const detalhe = await j.executar();
    console.log(`OK      ${j.nome}\n        ↳ ${detalhe}`);
  } catch (e) {
    falhas += 1;
    console.error(`FALHOU  ${j.nome}\n        ↳ ${e.message}`);
  }
}
console.log(falhas ? `\n${falhas} jornada(s) FALHARAM` : '\nTODAS as jornadas passaram');
process.exit(falhas ? 1 : 0);
