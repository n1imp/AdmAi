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

/**
 * SONDA — mede o que é objetivo, para que o olho fique livre para o que é julgamento.
 *
 * POR QUE EXISTE
 *   28 superfícies × 4 viewports são ~112 capturas. Classificar tudo olhando imagem é caro e,
 *   pior, subjetivo: "parece apertado" não é achado, é impressão. Mas várias das perguntas da
 *   matriz têm resposta EXATA no runtime — o conteúdo transborda? o botão está coberto? o alvo
 *   tem 44px? o texto foi cortado? Essas o navegador responde melhor que eu.
 *
 * O QUE ELA NÃO SUBSTITUI
 *   Hierarquia, densidade e clareza continuam exigindo olhar a captura. A sonda diminui o volume
 *   de julgamento visual, não o elimina — e uma superfície com sonda limpa ainda pode ser REFINE.
 *
 * OCLUSÃO: HIT-TEST, NÃO GEOMETRIA
 *   Comparar retângulos daria falso positivo em tudo que se sobrepõe legitimamente (dropdown,
 *   modal, header sticky sobre conteúdo que rolou). O que importa é: clicando no centro deste
 *   botão, o clique chega nele? `elementFromPoint` responde isso do jeito que o usuário sofre.
 *   Foi assim que o banner de consentimento sobre "Esqueci minha senha" apareceu como medida, e
 *   não como suspeita.
 */
export const EXPRESSAO_SONDA = `(() => {
  const W = window.innerWidth, H = window.innerHeight;
  const doc = document.documentElement;
  const txt = (el) => (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70);

  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };

  const SEL = 'button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex="-1"])';
  const interativos = [...document.querySelectorAll(SEL)].filter(visivel);

  /* Elementos tirados do fluxo: são eles que podem cobrir conteúdo sem reservar espaço. */
  const fixos = [...document.querySelectorAll('*')].filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === 'fixed' || p === 'sticky') && visivel(el);
  });

  /* OCLUSÃO por hit-test. Só conta quando quem intercepta é um elemento fixo/sticky que NÃO é
     ancestral do alvo — sobreposição legítima (ícone dentro do próprio botão) não é defeito. */
  const ocluidos = [];
  const ocluidosPermanentes = [];
  const rolagemOriginal = window.scrollY;
  for (const el of interativos) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
    const topo = document.elementFromPoint(cx, cy);
    if (!topo || el.contains(topo) || topo.contains(el)) continue;
    const culpado = fixos.find((f) => f === topo || f.contains(topo));
    if (!culpado) continue;
    const registro = { alvo: txt(el) || el.tagName, por: txt(culpado).slice(0, 45) || culpado.className };
    ocluidos.push(registro);

    /* OCLUSAO PERMANENTE — a medida que o contrato de aceite realmente pede.
       Coberto na posicao inicial pode significar so "abaixo da dobra", que e normal em pagina
       longa. O defeito de verdade e o elemento que continua coberto DEPOIS de rolado ate a
       vista: ai nenhuma rolagem o alcanca, e a acao esta perdida. Foi essa a diferenca que
       apareceu no /login em 360px — o botao de submissao caia numa faixa de 246px que o curso
       de rolagem nao cobria.
       Medida MAIS severa, nao mais frouxa: um elemento so sai daqui se ficar de fato alcancavel. */
    el.scrollIntoView({ block: 'center' });
    const r2 = el.getBoundingClientRect();
    const topo2 = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    if (topo2 && !el.contains(topo2) && !topo2.contains(el)
        && fixos.some((f) => f === topo2 || f.contains(topo2))) {
      ocluidosPermanentes.push(registro);
    }
  }
  window.scrollTo(0, rolagemOriginal);

  /* ALVO DE TOQUE. 44px é o mínimo de WCAG 2.5.5 / HIG; só se mede no mobile, onde o dedo é o
     ponteiro. No desktop um link de 16px é normal e apontá-lo seria ruído. */
  const alvosPequenos = W <= 480
    ? interativos.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && (r.height < 40 || r.width < 40);
      }).map((el) => ({ alvo: txt(el) || el.tagName, h: Math.round(el.getBoundingClientRect().height) }))
    : [];

  /* TRUNCAMENTO real: o texto não coube na própria caixa. Distingue de quebra de linha. */
  const truncados = [...document.querySelectorAll('h1,h2,h3,h4,p,span,button,a,td,th,label,li')]
    .filter((el) => visivel(el) && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
    .map((el) => ({ el: el.tagName.toLowerCase(), texto: txt(el) }));

  /* ABAIXO DA DOBRA: ação que exige rolagem para ser descoberta. */
  const abaixoDaDobra = interativos
    .filter((el) => el.getBoundingClientRect().top > H)
    .map((el) => txt(el) || el.tagName);

  const corpo = (document.body.innerText || '').replace(/\s+/g, ' ');
  return {
    titulo: document.title,
    cabecalho: txt(document.querySelector('h1, h2') || document.createElement('i')),
    overflowX: doc.scrollWidth - W,
    alturaDoc: doc.scrollHeight,
    telas: +(doc.scrollHeight / H).toFixed(1),
    interativos: interativos.length,
    ocluidos,
    ocluidosPermanentes,
    alvosPequenos: alvosPequenos.slice(0, 8),
    qtdAlvosPequenos: alvosPequenos.length,
    truncados: truncados.slice(0, 6),
    abaixoDaDobra: abaixoDaDobra.slice(0, 6),
    fixos: fixos.map((f) => {
      const r = f.getBoundingClientRect();
      return { texto: txt(f).slice(0, 40), h: Math.round(r.height), bottom: Math.round(r.bottom) };
    }).slice(0, 6),
    /* Sinais de estado, para não confundir tela vazia com tela quebrada nem com tela carregando. */
    erro: [...document.querySelectorAll('[role=alert]')].filter(visivel).map(txt),
    carregando: /carregando|aguarde/i.test(corpo) || !!document.querySelector('.skeleton, [aria-busy=true]'),
    semDados: /nenhum|nada (aqui|encontrad)|sem (dados|resultado|registro)|vazio|comece/i.test(corpo),
    /* a11y barato e determinístico; o axe completo já roda em suíte própria. */
    imgSemAlt: [...document.querySelectorAll('img:not([alt])')].filter(visivel).length,
    botaoSemNome: interativos.filter((el) =>
      !txt(el) && !el.getAttribute('aria-label') && !el.getAttribute('title')).length,
    palavras: corpo.split(' ').filter(Boolean).length,
  };
})()`;

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
 * Repoe o PRIMEIRO ACESSO — e precisa ser POR VIEWPORT, nao uma vez por execucao.
 *
 * A primeira versao limpava so no inicio. Ai o consentimento respondido em 360x800 ficava
 * gravado no `localStorage` do perfil, e nos tres viewports seguintes o banner simplesmente
 * nao existia mais. O resultado nao era um erro visivel: era captura de "primeiro acesso" que
 * mostrava o estado de segundo acesso, com nome de arquivo dizendo o contrario.
 *
 * Limpar ANTES de cada navegacao resolve porque `CookieBanner` le `localStorage` uma unica vez,
 * na montagem (`useState(() => ...)` em CookieBanner.jsx:18) — entao a limpeza so tem efeito se
 * acontecer antes de a pagina montar.
 */
async function limparPrimeiroAcesso(cdp) {
  if (process.env.LIMPAR_PRIMEIRO_ACESSO !== '1') return;
  await cdp.send('Runtime.evaluate', {
    expression: `['admai_cookies_consent', 'admai_welcome_seen', 'admai_tour_done'].forEach((k) =>
      localStorage.removeItem(k)
    );`,
    returnByValue: true,
  });
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
    await limparPrimeiroAcesso(cdp);

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
    const medidas = [];
    for (const vp of VIEWPORTS) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.escala,
        mobile: vp.mobile,
      });
      for (const rota of rotas) {
        await limparPrimeiroAcesso(cdp);
        await navegar(cdp, `${BASE}${rota}`);
        /* Espera fixa em vez de `Page.loadEventFired`: o painel busca dados DEPOIS do load, e
           capturar no load pega esqueleto de carregamento em vez de conteúdo. */
        await espera(2600);

        /* CATALOGO_MODAIS nao tem rota: so existe depois de um clique dentro de `/materiais`.
           Sem este passo ela ficaria `NOT_INVENTORIED` por limitacao do instrumento — e "nao
           consegui abrir" nao e uma classificacao. Busca por TEXTO VISIVEL, e nao por seletor
           de classe, porque o texto e o que o usuario procura e nao muda quando o CSS muda. */
        /* Sequencia separada por `|`: chegar ao tour exige responder o consentimento E abrir o
           tutorial. Um clique so nao alcanca superficie que mora atras de dois passos. */
        for (const passo of (process.env.CLICAR_TEXTO ?? '').split('|').filter(Boolean)) {
          const alvo = JSON.stringify(passo);
          const clique = await cdp.send('Runtime.evaluate', {
            expression: `(() => {
              const q = ${alvo}.toLowerCase();
              const el = [...document.querySelectorAll('button, a[href], [role=button]')].find(
                (e) => (e.innerText || '').trim().toLowerCase().includes(q)
                  && e.getBoundingClientRect().width > 0
              );
              if (!el) return 'NAO_ENCONTRADO';
              el.click();
              return 'CLICADO';
            })()`,
            returnByValue: true,
          });
          /* Falha alto: capturar `/materiais` de novo e arquivar como se fosse o dialogo seria
             evidencia errada com aparencia de certa. */
          if (clique.result?.value !== 'CLICADO') {
            throw new Error(`CLICAR_TEXTO passo "${passo}" nao encontrado em ${rota}`);
          }
          await espera(1200);
        }

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

        /* A medida vai junto da imagem e com a MESMA origem: mesma navegação, mesmo instante,
           mesmo viewport. Sonda e captura separadas mediriam dois estados parecidos, e a
           divergência entre eles seria impossível de explicar depois. */
        const sonda = await cdp.send('Runtime.evaluate', {
          expression: EXPRESSAO_SONDA,
          returnByValue: true,
        });
        medidas.push({
          papel,
          rota,
          viewport: vp.nome,
          innerWidth: largura.result.value,
          arquivo: nome,
          ...(sonda.result?.value ?? {
            falhou: sonda.exceptionDetails?.text ?? 'sonda sem retorno',
          }),
        });
        feitas.push(`${nome}  (innerWidth=${largura.result.value})`);
      }
    }
    cdp.close();
    /* JSON ao lado das imagens: e o que a classificacao vai citar, e fica auditavel junto da
       evidencia visual que o originou. */
    writeFileSync(path.join(destino, `sonda-${papel}.json`), JSON.stringify(medidas, null, 2));
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
