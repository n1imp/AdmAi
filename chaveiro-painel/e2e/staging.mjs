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
    console.error(`❌ ${nome} ausente — este runner SÓ roda contra o staging real (LOCAL != STAGING).`);
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
  if (exigePathApi && u.pathname !== '/api') erros.push(`path deve ser exatamente /api (recebido ${u.pathname})`);
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
  console.error('❌ STAGING_FIXTURE_SENHA ausente/curta (senha sintética do seed-staging; nunca impressa).');
  process.exit(2);
}

const VIEWPORT = Number((process.argv.find((a) => a.startsWith('--viewport=')) ?? '').split('=')[1] || 1280);
const ALTURA = VIEWPORT <= 500 ? 780 : 800;
const MOBILE = VIEWPORT <= 500;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Sessão CDP (mesmas lições do jornadas.mjs, incl. limpeza no Windows) ─────
async function abrirNavegador() {
  const perfil = path.join(tmpdir(), `stg-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(perfil, { recursive: true });
  const chrome = spawn(
    acharChrome(),
    ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'],
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
  const alvo = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
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
    const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'erro no evaluate');
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
    throw new Error(`texto não apareceu: ${padrao} | tela: "${(await texto()).slice(0, 120).replace(/\s+/g, ' ')}"`);
  };
  const esperarCampo = async (seletor, ms = 10000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await aval(`!!document.querySelector(${JSON.stringify(seletor)})`)) return;
      await espera(250);
    }
    throw new Error(`campo não encontrado: ${seletor}`);
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
  const clicarTexto = async (padrao, seletor = 'button, a, [role="tab"]') => {
    const r = await aval(`(() => {
      const re = new RegExp(${JSON.stringify(padrao)}, 'i');
      const el = [...document.querySelectorAll(${JSON.stringify(seletor)})]
        .find((e) => re.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().height > 0);
      if (!el) return 'AUSENTE';
      el.click();
      return 'ok';
    })()`);
    if (r !== 'ok') throw new Error(`controle não encontrado: ${padrao}`);
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
    await espera(2500);
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
    await clicarTexto('Sair|Logout|Encerrar sessão', 'button, a, [role="menuitem"]');
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
              ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${alvoPerfil}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
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
        await n.aval(`(() => {
          const sel = [...document.querySelectorAll('select')][0];
          const op = [...sel.options].find((o) => /Func A Staging/i.test(o.textContent));
          if (!op) return 'TECNICO_AUSENTE';
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, op.value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()`);
        await n.digitar('input[placeholder="Endereço completo ou N/A"]', `STG jornada ${unico}`);
        await n.digitar('textarea[placeholder="Descreva o serviço realizado"]', `Servico staging ${unico}`);
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
        if (!negado(semToken)) throw new Error(`API sem token respondeu ${semToken} (esperado 401/403)`);
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
        if (!negado(s)) throw new Error(`PATCH /config/empresa como gestor respondeu ${s} (esperado 401/403)`);
        // PERSISTENCE + RELOAD: o pendente aprovado não volta.
        await n.ir('/aprovacoes');
        await espera(1500);
        const t = await n.texto();
        if (/AGUARDA APROVAÇÃO/.test(t)) throw new Error('pendente ainda listado após aprovar + reload');
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
        if (!negado(s)) throw new Error(`GET /usuarios como funcionário respondeu ${s} (esperado 401/403)`);
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

// ── Runner ───────────────────────────────────────────────────────────────────
console.log(`STG-E2E @ ${BASE} (API ${API}) — viewport ${VIEWPORT}×${ALTURA}${MOBILE ? ' mobile' : ''}`);
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
