#!/usr/bin/env node
// =============================================================================
// e2e/run.mjs — e2e dos fluxos F9 (M1–M4) do painel, via Chrome headless + CDP.
// Ver DEC-20260719-E2E-CDP.
//
// Arquitetura (self-contained): o próprio harness sobe um servidor HTTP que serve o
// build (`dist/`, com SPA fallback) E responde às rotas `/api/*` com mocks determinísticos.
// Assim o axios (XHR) recebe respostas HTTP REAIS (mais fiel e sem a flakiness de mockar
// XHR por CDP Fetch). Os papéis são simulados por um JWT falso em localStorage. Sem backend.
//
// Uso:  npm run build && npm run e2e     (Env: CHROME_PATH p/ override do binário)
// =============================================================================
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const DIST = join(RAIZ, '..', 'dist');
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];

function assert(nome, cond, evidencia) {
  checks.push({ nome, ok: !!cond });
  console.log(
    `${cond ? 'OK  ' : 'FALHOU'} ${nome}${cond ? '' : ' — ' + JSON.stringify(evidencia)}`
  );
  if (!cond) throw new Error(`${nome}: ${JSON.stringify(evidencia)}`);
}

// ── Respostas mockadas do backend ────────────────────────────────────────────
const METRICAS = {
  tecnico: { id: 1, nome: 'Carlos Silva', comissao: 20, metaMensal: 5000, fotoPerfil: null },
  totalServicos: 12,
  comissaoGanha: 800,
  totalRecebido: 500,
  saldoPendente: 300,
  servicosPendentes: 0,
  mesAtual: { receitaLiquida: 2000, comissao: 400, meta: 5000, progressoMeta: 40 },
  periodo: { chave: 'mes', servicos: 8, receitaLiquida: 1600, comissao: 320 },
  serie: [
    { data: '2026-07-01', receita: 900 },
    { data: '2026-07-02', receita: 700 },
  ],
};
const DOC = {
  id: 1,
  tipo: 'contrato',
  nome: 'contrato.pdf',
  mime: 'application/pdf',
  tamanho: 2048,
  criadoEm: '2026-07-01T10:00:00Z',
  url: '/api/me/documentos/1/arquivo',
};
const PERMISSOES = { papel: 'funcionario', admin: false, permissoes: {} };
const ME = { id: 1, nome: 'Carlos Silva', papel: 'funcionario', admin: false, tecnicoId: 1 };

// Estado dos cenários (flags): as asserções mudam `cenario.docs404` p/ provar a degradação.
const cenario = { docs404: false };

// Resolve uma rota /api/* → { status, body }.
function mockApi(path) {
  if (path.includes('/me/permissoes')) return { status: 200, body: PERMISSOES };
  if (path.includes('/me/metricas')) return { status: 200, body: METRICAS };
  if (path.includes('/me/servico-atual')) return { status: 404, body: { erro: 'off' } };
  if (path.includes('/me/servicos')) return { status: 200, body: [] };
  if (path.includes('/me/documentos'))
    return cenario.docs404
      ? { status: 404, body: { erro: 'off' } }
      : { status: 200, body: { documentos: [DOC] } };
  if (path === '/api/me' || path.startsWith('/api/me?')) return { status: 200, body: ME };
  return { status: 200, body: {} };
}

const CT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Servidor: /api/* → mock; arquivo existente em dist → serve; senão → index.html (SPA).
function subirServidor() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (process.env.E2E_DEBUG) console.error('[srv]', req.method, path + url.search);
      // Bloqueia o service worker no e2e: se registrado, ele intercepta /api e as chamadas
      // nunca chegam ao mock. 404 aqui faz o register() falhar (app trata) → sem SW.
      if (path === '/sw.js') {
        res.writeHead(404).end('no sw in e2e');
        return;
      }
      if (path.startsWith('/api/')) {
        const { status, body } = mockApi(path + url.search);
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(body));
      }
      // Static: bloqueia path traversal, cai no index.html se o arquivo não existir.
      const rel = normalize(path).replace(/^(\.\.[/\\])+/, '');
      let arquivo = join(DIST, rel);
      if (!existsSync(arquivo) || extname(arquivo) === '') arquivo = join(DIST, 'index.html');
      try {
        const conteudo = await readFile(arquivo);
        res.writeHead(200, { 'Content-Type': CT[extname(arquivo)] || 'application/octet-stream' });
        res.end(conteudo);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, porta: server.address().port }));
  });
}

// ── Chrome cross-plataforma ──────────────────────────────────────────────────
function acharChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH))
    return process.env.CHROME_PATH;
  const c = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
  if (!c) throw new Error('Chrome não encontrado. Defina CHROME_PATH.');
  return c;
}

async function conectar(url) {
  const socket = new WebSocket(url);
  const pend = new Map();
  let seq = 0;
  await new Promise((ok, err) => {
    socket.addEventListener('open', ok, { once: true });
    socket.addEventListener('error', err, { once: true });
  });
  const ouvintes = new Map();
  socket.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id);
      pend.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method && ouvintes.has(m.method)) {
      ouvintes.get(m.method).forEach((fn) => fn(m.params));
    }
  });
  return {
    send(method, params = {}) {
      const id = ++seq;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((ok, err) => pend.set(id, { resolve: ok, reject: err }));
    },
    on(method, fn) {
      if (!ouvintes.has(method)) ouvintes.set(method, []);
      ouvintes.get(method).push(fn);
    },
    close: () => socket.close(),
  };
}

const fakeToken = (p) => `e30.${Buffer.from(JSON.stringify(p)).toString('base64')}.e2e`;

async function main() {
  if (!existsSync(join(DIST, 'index.html')))
    throw new Error('dist/ ausente — rode `npm run build` antes do e2e.');
  const chrome = acharChrome();
  const { server, porta } = await subirServidor();
  const BASE = `http://127.0.0.1:${porta}`;
  const profile = await mkdtemp(join(tmpdir(), 'admai-e2e-'));
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore', windowsHide: true }
  );

  let client;
  try {
    let dvPorta;
    for (let i = 0; i < 100 && !dvPorta; i++) {
      try {
        dvPorta = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8'))
          .trim()
          .split(/\r?\n/)[0];
      } catch {
        await delay(100);
      }
    }
    if (!dvPorta) throw new Error('Chrome não publicou a porta DevTools.');
    const alvo = await (
      await fetch(`http://127.0.0.1:${dvPorta}/json/new?about:blank`, { method: 'PUT' })
    ).json();
    client = await conectar(alvo.webSocketDebuggerUrl);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    // O painel é PWA: um service worker intercepta /api. Força o bypass no nível de rede
    // para que as chamadas cheguem ao servidor de mock.
    await client.send('Network.enable').catch(() => {});
    await client.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
    if (process.env.E2E_DEBUG)
      client.on('Network.requestWillBeSent', (p) => {
        if (p.request?.url.includes('/api/'))
          console.error('[req]', p.request.method, p.request.url);
      });

    const evaluate = async (expr) => {
      const { result, exceptionDetails } = await client.send('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (exceptionDetails)
        throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
      return result.value;
    };
    const irPara = async (rota) => {
      await client.send('Page.navigate', { url: `${BASE}${rota}` });
      for (let i = 0; i < 200; i++) {
        try {
          if (
            await evaluate(`document.readyState==='complete' && document.body?.childElementCount>0`)
          )
            return;
        } catch {
          /* contexto troca */
        }
        await delay(50);
      }
      throw new Error(`Rota não ficou pronta: ${rota}`);
    };
    const esperarTexto = async (txt, ms = 6000) => {
      for (let i = 0; i < ms / 100; i++) {
        if (await evaluate(`document.body.innerText.includes(${JSON.stringify(txt)})`)) return true;
        await delay(100);
      }
      return false;
    };

    // Sessão: token falso (papel funcionário) + consentimento + tour.
    await irPara('/login');
    await evaluate(`(() => {
      localStorage.setItem('admai_token', ${JSON.stringify(fakeToken({ id: 1, nome: 'Carlos Silva', admin: false, papel: 'funcionario', empresaId: 1, tecnicoId: 1, exp: 4102444800 }))});
      localStorage.setItem('admai_cookies_consent', 'necessary');
      localStorage.setItem('admai_tour_done', '1');
    })()`);

    // ── M1: MeuPainel — período + KPIs (após /me/metricas) ────────────────────
    await irPara('/');
    assert(
      'M1 · MeuPainel monta a home do funcionário',
      await esperarTexto('MEU DESEMPENHO'),
      await evaluate('document.title')
    );
    // "Receita líquida" só existe no card de KPI do período (que renderiza junto com os
    // irmãos Serviços/Comissão quando /me/metricas resolve) → prova o M1 ponta a ponta.
    assert(
      'M1 · KPIs do período renderizam após /me/metricas',
      await esperarTexto('Receita líquida'),
      'sem KPIs do período'
    );

    // ── M4: Documentos (flag on) — lista o próprio documento ──────────────────
    cenario.docs404 = false;
    await irPara('/meus-documentos');
    assert(
      'M4 · lista o documento do funcionário (flag on)',
      await esperarTexto('contrato.pdf'),
      'sem contrato.pdf'
    );
    // "Escolher arquivo" é o rótulo do seletor de arquivo do formulário de envio (sem
    // text-transform, ao contrário dos rótulos kpi-label que o innerText devolve em caixa alta).
    assert(
      'M4 · formulário de envio presente',
      await esperarTexto('Escolher arquivo'),
      'sem form de envio'
    );

    // ── M4: Documentos (flag off = 404) — degrada p/ "indisponível" ───────────
    cenario.docs404 = true;
    await irPara('/meus-documentos');
    assert(
      'M4 · degrada p/ "indisponível" com a flag off (404)',
      await esperarTexto('Documentos indisponíveis'),
      'sem estado indisponível'
    );

    console.log(
      `\nRESULTADO e2e: ${checks.filter((c) => c.ok).length}/${checks.length} checks aprovados`
    );
  } catch (erro) {
    try {
      const shot = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(RAIZ, 'e2e-falha.png'), Buffer.from(shot.data, 'base64'));
      console.error('Screenshot da falha em e2e/e2e-falha.png');
    } catch {
      /* sem screenshot */
    }
    console.error('E2E FALHOU:', erro.message);
    process.exitCode = 1;
  } finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise((r) => child.once('exit', r)), delay(1500)]);
    server.close();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main();
