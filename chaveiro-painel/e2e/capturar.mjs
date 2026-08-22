#!/usr/bin/env node
// =============================================================================
// capturar.mjs — captura o AdmAi REAL em vários viewports e papéis, por CDP.
//
// PARA QUE SERVE, e como difere de `run.mjs`
//   `run.mjs` é e2e: sobe servidor próprio, mocka `/api`, forja JWT e afirma comportamento.
//   Este aqui não afirma nada — ele OBSERVA o produto rodando de verdade, com backend de
//   verdade e dados de verdade, e grava o que a tela mostra.
//
//   Existe porque `NO_UI_ACCEPTANCE_WITHOUT_RUNTIME_OBSERVATION` e
//   `NO_VISUAL_CHANGE_CLAIM_WITHOUT_BEFORE_AFTER` só são cumpríveis com imagem do runtime.
//   Ler JSX e CSS não responde se a tela funciona no telefone de alguém.
//
// POR QUE CDP E NÃO PLAYWRIGHT
//   O repositório decidiu CDP em `.ai/decisions/DEC-20260719-E2E-CDP.md`. O que bloqueava a
//   captura mobile não era a ferramenta: era o Vite subindo só em `[::1]`, sem `host` no
//   config. Com `--host 127.0.0.1` o caminho existente funciona. Trocar de ferramenta para
//   contornar um bind de rede seria dependência nova para um problema já resolvido.
//
// A SESSÃO É OBTIDA PELA API, não digitada no formulário
//   O alvo da observação são as telas internas. Exercitar o login em cada captura acrescenta
//   um passo que já tem suíte própria e uma fonte de instabilidade que não interessa aqui.
//
// Uso:
//   ADMAI_URL=http://127.0.0.1:5173 \
//   CAPTURA_SENHA=... node e2e/capturar.mjs <destino> <papel:usuario> <rota> [<rota> ...]
//
//   node e2e/capturar.mjs ./telas/before dono:dono.demo / /servicos /estoque
// =============================================================================
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acharChrome, conectar } from './cdp.mjs';

const BASE = process.env.ADMAI_URL || 'http://127.0.0.1:5173';

/* Os quatro exigidos. 360x800 é o Android mediano e o mais apertado que importa; 1920 é onde o
   desperdício de viewport aparece. Os dois do meio pegam o que quebra entre um e outro. */
export const VIEWPORTS = Object.freeze([
  { nome: '360x800', width: 360, height: 800, mobile: true, escala: 3 },
  { nome: '390x844', width: 390, height: 844, mobile: true, escala: 3 },
  { nome: '1440x900', width: 1440, height: 900, mobile: false, escala: 1 },
  { nome: '1920x1080', width: 1920, height: 1080, mobile: false, escala: 1 },
]);

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Navega com UMA repetição: a primeira navegação de um alvo recém-criado ainda pode recusar. */
async function navegar(cdp, url) {
  try {
    return await cdp.send('Page.navigate', { url });
  } catch {
    await espera(900);
    return cdp.send('Page.navigate', { url });
  }
}

/**
 * Descobre a porta que ESTE Chrome publicou, em vez de fixar uma.
 *
 * A primeira versão fixava 9333 e todo `Page.navigate` falhava com "Cannot navigate to invalid
 * URL" — URL válida, alvo errado. Duas instâncias órfãs de tentativas anteriores ainda seguravam
 * a porta; o Chrome novo não conseguia bindar e eu acabava conversando com o zumbi, cujo alvo
 * não navega. Porta fixa transforma sobra de processo em bug misterioso.
 *
 * Com `--remote-debugging-port=0` o Chrome escolhe uma porta livre e a escreve em
 * `DevToolsActivePort` DENTRO DO PERFIL — que é único por execução. Assim é impossível falar com
 * outra instância. Mesmo mecanismo de `run.mjs`, pelo mesmo motivo.
 */
async function alvoDaPagina(perfil) {
  let porta;
  for (let i = 0; i < 100 && !porta; i++) {
    try {
      /* Sem regex de propósito: a primeira linha do arquivo basta, e escapes de
         quebra de linha vinham sendo corrompidos no caminho até aqui. */
      const bruto = readFileSync(path.join(perfil, 'DevToolsActivePort'), 'utf8');
      porta = bruto.split(String.fromCharCode(10))[0].trim();
    } catch {
      await espera(100);
    }
  }
  if (!porta) throw new Error('Chrome não publicou a porta DevTools.');
  const alvo = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, {
    method: 'PUT',
  }).then((r) => r.json());
  if (!alvo?.webSocketDebuggerUrl) throw new Error('CDP não devolveu alvo navegável.');
  /* `DevToolsActivePort` aparece ANTES de o navegador terminar de subir. Criar o alvo e navegar
     em seguida faz a primeira navegação falhar com "Cannot navigate to invalid URL" — mensagem
     que descreve o alvo, não a URL, e por isso mandou-me caçar problema em rede e em IPv6 por um
     bom tempo. */
  await espera(800);
  return alvo.webSocketDebuggerUrl;
}

/**
 * Recusa rota que o shell corrompeu, em vez de capturar a tela errada.
 *
 * O Git Bash (MSYS) converte um argumento que seja apenas `/` no caminho da instalação do Git:
 * `node e2e/capturar.mjs ... /` chega ao Node como `C:/Program Files/Git/`. A URL montada vira
 * `http://127.0.0.1:5173C:/Program Files/Git/`, e o CDP responde "Cannot navigate to invalid
 * URL" — mensagem que aponta para o alvo e não para o argumento, o que me fez caçar o problema
 * em porta, IPv6 e temporização antes de olhar para o valor que chegou.
 *
 * Contornar a conversão silenciosamente seria pior: o chamador acharia que pediu `/`. Aqui
 * falha alto e diz como invocar.
 */
export function exigirRotaValida(rota) {
  const pareceCaminhoDeDisco = typeof rota === 'string' && rota.includes(':');
  if (typeof rota !== 'string' || !rota.startsWith('/') || pareceCaminhoDeDisco) {
    throw new Error(
      [
        `rota inválida: ${JSON.stringify(rota)}`,
        '   No Git Bash, a conversão de caminho do MSYS transforma o argumento antes do Node.',
        '   Invoque com:  MSYS_NO_PATHCONV=1 node e2e/capturar.mjs ...',
      ].join(String.fromCharCode(10))
    );
  }
  return rota;
}

/** Nome de arquivo estável: mesma rota e mesmo viewport sempre geram o mesmo nome. */
export function nomeDoArquivo(papel, viewport, rota) {
  const r = rota === '/' ? 'home' : rota.replace(/^\//, '').replace(/[/?=&]/g, '-');
  return `${papel}__${r}__${viewport}.jpg`;
}

export async function capturar({ destino, papel, usuario, senha, rotas }) {
  rotas.forEach(exigirRotaValida);
  mkdirSync(destino, { recursive: true });
  const perfil = path.join(tmpdir(), `admai-cap-${Date.now()}`);
  mkdirSync(perfil, { recursive: true });

  const chrome = spawn(
    acharChrome(),
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${perfil}`,
      '--no-first-run',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    const cdp = await conectar(await alvoDaPagina(perfil));
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    await navegar(cdp, `${BASE}/login`);
    await espera(2500);

    /* PRIMEIRO ACESSO de verdade quando `LIMPAR_PRIMEIRO_ACESSO=1`: sem isto, a segunda captura
       já não vê banner nem card, e comparar BEFORE com AFTER mediria o estado do localStorage
       em vez da mudança na interface. [GAP-UI-02] */
    if (process.env.LIMPAR_PRIMEIRO_ACESSO === '1') {
      await cdp.send('Runtime.evaluate', {
        expression: `['admai_cookies_consent','admai_welcome_seen','admai_tour_done']
          .forEach((k) => localStorage.removeItem(k));`,
        returnByValue: true,
      });
    }

    /* Superfície pública não tem sessão. Login, Cadastro e as páginas legais são exatamente as
       telas que o usuário vê ANTES de existir conta — exigir login para observá-las impediria de
       observar as duas marcadas MUST_REVIEW. [SCOPE-F2B] */
    const anonimo = usuario === 'anonimo';
    const login = anonimo
      ? { result: { value: 200 } }
      : await cdp.send('Runtime.evaluate', {
          expression: `(async () => {
        const r = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: ${JSON.stringify(JSON.stringify({ username: usuario, password: senha }))}
        });
        const d = await r.json().catch(() => ({}));
        if (d.token) localStorage.setItem('admai_token', d.token);
        return r.status;
      })()`,
          awaitPromise: true,
          returnByValue: true,
        });
    if (login.result?.value !== 200) {
      /* Falhar aqui é melhor que capturar 12 telas de login: uma sessão ausente produz imagens
         que parecem válidas e não mostram nada do que se queria ver. */
      throw new Error(
        `login de ${usuario} falhou (${login.result?.value ?? 'sem status'}) — ` +
          `confira ADMAI_URL, CAPTURA_SENHA e se o backend está no ar`
      );
    }

    const feitas = [];
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.escala,
        mobile: vp.mobile,
      });
      for (const rota of rotas) {
        await navegar(cdp, `${BASE}${rota}`);
        /* Espera fixa em vez de `Page.loadEventFired`: o painel busca dados DEPOIS do load, e
           capturar no load pega esqueleto de carregamento em vez de conteúdo. */
        await espera(2600);

        const largura = await cdp.send('Runtime.evaluate', {
          expression: 'window.innerWidth',
          returnByValue: true,
        });
        /* Registrar a largura observada, e não a pedida: se a emulação não pegar, o arquivo sai
           com o número errado no log e a discrepância aparece — em vez de virar uma captura
           desktop arquivada como se fosse mobile. */
        const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
        const nome = nomeDoArquivo(papel, vp.nome, rota);
        writeFileSync(path.join(destino, nome), Buffer.from(shot.data, 'base64'));
        feitas.push(`${nome}  (innerWidth=${largura.result.value})`);
      }
    }
    cdp.close();
    return feitas;
  } finally {
    chrome.kill();
  }
}

if (process.argv[1] && process.argv[1].endsWith('capturar.mjs')) {
  const [destino, papelArg, ...rotas] = process.argv.slice(2);
  const senha = process.env.CAPTURA_SENHA;
  if (!destino || !papelArg || rotas.length === 0 || !senha) {
    console.error(
      'uso: CAPTURA_SENHA=... node e2e/capturar.mjs <destino> <papel:usuario> <rota> [...]'
    );
    process.exit(2);
  }
  const [papel, usuario] = papelArg.includes(':') ? papelArg.split(':') : [papelArg, papelArg];
  capturar({ destino, papel, usuario, senha, rotas })
    .then((f) => {
      console.log(f.join('\n'));
      process.exit(0);
    })
    .catch((e) => {
      console.error(`\n❌ ${e.message}\n`);
      process.exit(1);
    });
}
