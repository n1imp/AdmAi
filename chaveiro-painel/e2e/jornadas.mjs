/**
 * Jornadas E2E contra o STACK REAL — bot (:3000) + painel (:5173) + Postgres + Redis.  [F5]
 *
 * Por que um driver NOVO: `run.mjs` mocka a API por design (testa o painel isolado) e
 * `capturar.mjs` é instrumento de MEDIÇÃO congelado — jornada não é medição nem mock.
 * Aqui o clique atravessa o React, a API, o banco e volta.
 *
 * Uso:  node e2e/jornadas.mjs   (exige stack no ar; ADMAI_URL e CAPTURA_SENHA opcionais)
 * Saída: uma linha por jornada (OK/FALHOU + detalhe); exit code 1 se qualquer uma falhar.
 *
 * As pontes com o banco (matar assinatura, ativar 2FA) rodam `node` DENTRO de chaveiro-bot,
 * com o Prisma e o .env de lá — este driver nunca importa nada do bot nem lê credenciais.
 */
import { spawn, execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acharChrome, conectar } from './cdp.mjs';

const BASE = process.env.ADMAI_URL ?? 'http://127.0.0.1:5173';
const SENHA_DEMO = process.env.CAPTURA_SENHA ?? 'DemoLocal1!';
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BOT = path.join(RAIZ, 'chaveiro-bot');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Executa um script node DENTRO do chaveiro-bot (Prisma + .env de lá). Devolve o stdout. */
function noBot(script) {
  return new Promise((resolver, rejeitar) => {
    execFile(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: BOT, timeout: 30000 },
      (erro, stdout, stderr) =>
        erro ? rejeitar(new Error(stderr || erro.message)) : resolver(stdout.trim())
    );
  });
}

// ── Sessão de navegador ──────────────────────────────────────────────────────
async function abrirNavegador({ largura = 1280, altura = 800, mobile = false } = {}) {
  const perfil = path.join(
    tmpdir(),
    `jornada-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
    width: largura,
    height: altura,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
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
  const esperarTexto = async (re, ms = 8000) => {
    const padrao = re instanceof RegExp ? re : new RegExp(re, 'i');
    const fim = Date.now() + ms;
    /* Diagnóstico no próprio erro: sem isto, um timeout dizia só "não apareceu" e o estado real
       da tela se perdia. A LINHA DO TEMPO de (path + início do texto) captura navegações no meio
       da espera — foi o que revelou a página saltando para a Landing durante a caça ao 2FA. */
    const linhaDoTempo = [];
    let ultimoMarco = '';
    while (Date.now() < fim) {
      const amostra = await aval(
        `JSON.stringify({ p: location.pathname, k: !!localStorage.getItem('admai_token'), t: document.body.innerText.slice(0, 60).replace(/\\s+/g, ' ') })`
      );
      const { p, k, t } = JSON.parse(amostra);
      if (padrao.test(await texto())) return true;
      const marco = `${p}|${t.slice(0, 30)}`;
      if (marco !== ultimoMarco) {
        linhaDoTempo.push(`${Date.now() % 100000} ${p} token:${k} "${t}"`);
        ultimoMarco = marco;
      }
      await espera(250);
    }
    throw new Error(
      `texto não apareceu: ${padrao} | linha do tempo: ${linhaDoTempo.slice(-6).join(' >> ')}`
    );
  };
  const esperarCampo = async (seletor, ms = 8000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await aval(`!!document.querySelector(${JSON.stringify(seletor)})`)) return;
      await espera(250);
    }
    throw new Error(`campo não encontrado: ${seletor}`);
  };
  /* React ignora atribuição direta de .value — o setter nativo + evento input é o caminho. */
  const digitarSem = (seletor, valor) =>
    aval(`(() => {
      const el = document.querySelector(${JSON.stringify(seletor)});
      if (!el) return 'AUSENTE';
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valor)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    })()`).then((r) => {
      if (r !== 'ok') throw new Error(`campo não encontrado: ${seletor}`);
    });
  const digitar = async (seletor, valor) => {
    await esperarCampo(seletor);
    await digitarSem(seletor, valor);
  };
  const clicarTexto = (padrao, seletor = 'button, a, [role="tab"]') =>
    aval(`(() => {
      const re = new RegExp(${JSON.stringify(padrao)}, 'i');
      const el = [...document.querySelectorAll(${JSON.stringify(seletor)})]
        .find((e) => re.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().height > 0);
      if (!el) return 'AUSENTE';
      el.click();
      return 'ok';
    })()`).then((r) => {
      if (r !== 'ok') throw new Error(`controle não encontrado: ${padrao}`);
    });
  /* Race real medida (2 execuções seguidas): botões gateados por estado (ex.: Verificar do 2FA,
     disabled até codigo.length===6) podem receber o click ANTES do React flush que os habilita —
     click em botão disabled é um no-op SILENCIOSO e o teste morre no timeout sem request algum.
     Este helper espera o alvo existir E estar habilitado antes de clicar. */
  const clicarQuandoHabilitado = async (padrao, seletor = 'button', ms = 5000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const r = await aval(`(() => {
        const re = new RegExp(${JSON.stringify(padrao)}, 'i');
        const el = [...document.querySelectorAll(${JSON.stringify(seletor)})]
          .find((e) => re.test(e.textContent.replace(/\\s+/g, ' ').trim()) && e.getBoundingClientRect().height > 0);
        if (!el) return 'AUSENTE';
        if (el.disabled) return 'DESABILITADO';
        el.click();
        return 'ok';
      })()`);
      if (r === 'ok') return;
      await espera(150);
    }
    throw new Error(`controle não habilitou a tempo: ${padrao}`);
  };
  const consentirNecessarios = async () => {
    try {
      await clicarTexto('^Apenas necessários$');
      await espera(300);
    } catch {
      /* banner já respondido */
    }
  };
  const loginUi = async (usuario, senha = SENHA_DEMO) => {
    await ir('/login');
    await consentirNecessarios();
    await digitar('input[placeholder="seu_usuario"]', usuario);
    await digitar('input[placeholder="••••••••"]', senha);
    await clicarTexto('Entrar', 'button[type="submit"]');
    await espera(2200);
  };

  return {
    cdp,
    aval,
    ir,
    texto,
    esperarTexto,
    esperarCampo,
    digitar,
    clicarTexto,
    clicarQuandoHabilitado,
    consentirNecessarios,
    loginUi,
    /* AWAITABLE de proposito: o runner precisa ESPERAR a limpeza — fire-and-forget deixava as
       varreduras das ultimas jornadas orfas quando o processo da suite saia (process.exit),
       vazando ~2-3 chrome.exe por browser mesmo com a varredura correta. */
    fechar: () =>
      new Promise((resolver) => {
        cdp.close();
        /* Windows: child.kill() termina SO o processo raiz — os filhos do Chrome (renderer/GPU)
           NAO morrem com o pai e viram zumbis (medimos 704 chrome.exe acumulados em 2 dias de
           jornadas/capturas, degradando a maquina ate as proprias jornadas flakarem por timeout).
           taskkill /T tem corrida na propria arvore ("nao ha ocorrencia da tarefa") e ainda vaza
           2-3 filhos por browser — por isso a varredura FINAL e pelo user-data-dir, que e unico
           por instancia: mata exatamente os processos desta sessao, nunca o Chrome real do usuario. */
        if (process.platform === 'win32') {
          execFile('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], () => {
            /* -like do PowerShell trata \ literalmente (escape e com crase) — dobrar barras
               quebrava o match e a varredura nao achava nada. So a aspa simples precisa escapar. */
            const alvo = perfil.replace(/'/g, "''");
            execFile(
              'powershell',
              [
                '-NoProfile',
                '-Command',
                `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${alvo}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
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

// ── Jornadas ─────────────────────────────────────────────────────────────────
const unico = Date.now().toString().slice(-6);

const JORNADAS = [
  {
    nome: 'onboarding: cadastro pela UI → OTP "verificar depois" → painel + consentimento',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.ir('/login?modo=cadastrar');
        await n.digitar('input[placeholder="João da Silva"]', 'Dona Jornada');
        await n.digitar('input[placeholder="Chaveiro Express"]', `Jornada E2E ${unico}`);
        await n.digitar('input[placeholder="voce@empresa.com"]', `jornada${unico}@teste.com`);
        await n.digitar('input[placeholder="11999990000"]', `11955${unico}`);
        await n.digitar('input[placeholder="seu_usuario"]', `jornada${unico}`);
        await n.digitar('input[placeholder="••••••••"]', 'SenhaForte1!');
        await n.clicarTexto('Criar conta', 'button[type="submit"]');
        await n.esperarTexto(/confirmar seu número|código/i, 12000);
        await n.clicarTexto('Verificar depois');
        await n.esperarTexto(/painel|lucro do período|nenhum serviço/i, 12000);
        // Consentimento: escolher "apenas necessários" e o banner sai sem recarregar.
        await n.clicarTexto('^Apenas necessários$');
        await espera(500);
        const t = await n.texto();
        if (/Apenas necessários/.test(t)) throw new Error('banner não saiu após a escolha');
        return `empresa Jornada E2E ${unico} criada e dentro do painel`;
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'negativo: senha errada mostra erro e NÃO cria sessão',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('dono.demo', 'senha-errada-123');
        await n.esperarTexto(/inválid|incorret|não foi possível|erro|falhou|credenc/i, 8000);
        const token = await n.aval(`localStorage.getItem('admai_token')`);
        if (token) throw new Error('token gravado com senha errada');
        return 'erro visível, storage limpo';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'núcleo (dono): login UI → form de serviço single-page → aparece na lista',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('dono.demo');
        await n.esperarTexto(/lucro do período|receita/i, 10000);
        await n.ir('/servicos/novo');
        /* Form por seções (FR-14/DECISOR 01a04bfb): tudo numa página, CTA único. O select de
           técnico só renderiza depois do GET /tecnicos — esperar por ele antes de setar. */
        await n.esperarCampo('select#sf-tecnico');
        await n.aval(`(() => {
          const sel = document.querySelector('select#sf-tecnico');
          const op = [...sel.options].find((o) => /Ana Técnica/i.test(o.textContent));
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, op.value);
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()`);
        await n.digitar('input[placeholder="Endereço completo ou N/A"]', 'Rua da Jornada, 42');
        await n.digitar(
          'textarea[placeholder="Descreva o serviço realizado"]',
          `Servico jornada ${unico}`
        );
        await n.digitar('#sf-valorCobrado', '15000'); // máscara de centavos → 150,00
        await n.esperarTexto(/R\$\s*150,00/, 4000); // resumo financeiro AO VIVO reagiu
        await n.clicarTexto('^Registrar serviço$');
        await espera(2000);
        await n.ir('/servicos');
        await n.esperarTexto(new RegExp(`Servico jornada ${unico}`), 10000);
        return 'serviço criado pela UI (single-page) e listado';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'técnico em campo: login UI → bater ponto → estado do dia muda',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('ana.tecnica');
        await espera(1000);
        await n.ir('/meu-ponto');
        await n.esperarTexto(/ponto/i, 8000);
        const antes = await n.texto();
        await n.clicarTexto('Bater ponto');
        await espera(2000);
        const depois = await n.texto();
        if (antes === depois) throw new Error('nada mudou após bater ponto');
        return 'batida registrada, tela refletiu';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'MVP sem paywall: assinatura morta no banco → produto segue INTEIRO; /assinatura não existe',
    async executar() {
      /* [D2 Refoundation] Assinaturas saíram do MVP: o backend em free mode (default) não emite
         402 e a rota /assinatura vive atrás de SUBSCRIPTIONS_BILLING (off). A ponte com o banco
         fica: ela prova que o produto NÃO depende do estado da assinatura no free mode. */
      await noBot(`
        import { prisma } from './src/db/prisma.js';
        const e = await prisma.empresa.findFirst({ where: { nome: 'Jornada E2E ${unico}' } });
        if (!e) throw new Error('empresa da jornada não achada');
        await prisma.assinatura.update({ where: { empresaId: e.id }, data: { status: 'canceled', periodoFimEm: null, trialFimEm: null } });
        console.log('assinatura morta para', e.id);
        process.exit(0);
      `);
      const n = await abrirNavegador();
      try {
        await n.loginUi(`jornada${unico}`, 'SenhaForte1!');
        await espera(1500);
        // Produto inteiro: a coleção de serviços renderiza de verdade (sem 402, sem tela vazia).
        await n.ir('/servicos');
        await n.esperarTexto(/serviço/i, 8000);
        const t = await n.texto();
        if (t.replace(/\s+/g, '').length < 40)
          throw new Error('tela em branco com assinatura morta');
        if (/assinatura necessária|renove a assinatura/i.test(t))
          throw new Error('paywall apareceu no MVP free mode');
        // Deep-link antigo: /assinatura cai no catch-all → volta para / sem quebrar.
        await n.ir('/assinatura');
        const rota = await n.aval('location.pathname');
        if (rota === '/assinatura') throw new Error('rota /assinatura ainda existe com a flag off');
        await n.esperarTexto(/lucro do período|receita|painel/i, 8000);
        return 'free mode ignora assinatura morta; /assinatura redireciona para o painel';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'negativo: 2FA com código errado NÃO fecha sessão (tela de desafio real)',
    async executar() {
      // Ativa 2FA para um usuário novo por DENTRO do bot (otplib de lá; segredo nunca sai do processo).
      await noBot(`
        import { prisma } from './src/db/prisma.js';
        import { generate } from 'otplib';
        import { gerarSegredoTotp, cifrarSegredo } from './src/services/totp.js';
        const e = await prisma.empresa.findFirst({ where: { nome: 'Jornada E2E ${unico}' } });
        const u = await prisma.usuario.findFirst({ where: { empresaId: e.id } });
        const secret = gerarSegredoTotp();
        await prisma.usuario.update({ where: { id: u.id }, data: { totpSecret: cifrarSegredo(secret), twoFactorAtivo: true } });
        console.log('2fa ativado para', u.username);
        process.exit(0);
      `);
      const n = await abrirNavegador();
      try {
        await n.loginUi(`jornada${unico}`, 'SenhaForte1!');
        await n.esperarTexto(/verificação|código|duas etapas|autenticador/i, 8000);
        await n.digitar('input[placeholder="000000"]', '000000');
        const aposDigitar = await n.aval(
          `JSON.stringify({ campo: !!document.querySelector('input[placeholder="000000"]'), tela: document.body.innerText.slice(0,50).replace(/\\s+/g,' ') })`
        );
        /* Submissao por requestSubmit (evento submit via root handler do React) — elimina a
           corrida do click no botao disabled->enabled. O retorno E VERIFICADO: 'SEM_FORM'
           significa que o desafio sumiu ANTES da submissao (estado resetado). */
        const rSubmit = await n.aval(`(() => {
          const campo = document.querySelector('input[placeholder="000000"]');
          const form = campo && campo.closest('form');
          if (!form) return 'SEM_FORM';
          form.requestSubmit();
          return 'ok';
        })()`);
        if (rSubmit !== 'ok')
          throw new Error(
            `desafio sumiu antes da submissao: ${rSubmit} | aposDigitar: ${aposDigitar}`
          );
        await n.esperarTexto(/inválid|incorret/i, 8000);
        const token = await n.aval(`localStorage.getItem('admai_token')`);
        if (token) throw new Error('sessão criada com código 2FA errado');
        return 'desafio renderizou, código errado rejeitado, sem sessão';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'deep-link diferido: /aprovacoes sem sessão → login → volta para /aprovacoes',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.ir('/aprovacoes');
        await n.esperarTexto(/entrar|criar conta/i, 8000); // redirecionado ao login
        await n.consentirNecessarios();
        await n.digitar('input[placeholder="seu_usuario"]', 'dono.demo');
        await n.digitar('input[placeholder="••••••••"]', SENHA_DEMO);
        await n.clicarTexto('Entrar', 'button[type="submit"]');
        await espera(2500);
        await n.esperarTexto(/aprova/i, 10000);
        const rota = await n.aval('location.pathname');
        if (rota !== '/aprovacoes') throw new Error(`caiu em ${rota}, não em /aprovacoes`);
        return 'destino preservado através do login';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'mobile 360: login UI → painel → navegação inferior → equipe',
    async executar() {
      const n = await abrirNavegador({ largura: 360, altura: 800, mobile: true });
      try {
        await n.loginUi('dono.demo');
        await n.esperarTexto(/lucro do período|receita/i, 10000);
        await n.clicarTexto('^Equipe$', 'a, button');
        await espera(1500);
        await n.esperarTexto(/técnicos|cadastrados/i, 8000);
        return 'núcleo navegável em 360px';
      } finally {
        await n.fechar();
      }
    },
  },
  {
    nome: 'documentos (técnico): página renderiza estado real (upload coberto em integração)',
    async executar() {
      const n = await abrirNavegador();
      try {
        await n.loginUi('ana.tecnica');
        await espera(800);
        await n.ir('/meus-documentos');
        await n.esperarTexto(/documento/i, 8000);
        const t = await n.texto();
        if (t.replace(/\s+/g, '').length < 40) throw new Error('página vazia');
        return 'superfície viva com a sessão real';
      } finally {
        await n.fechar();
      }
    },
  },
];

// ── Execução ─────────────────────────────────────────────────────────────────
let falhas = 0;
for (const j of JORNADAS) {
  const inicio = Date.now();
  try {
    const detalhe = await j.executar();
    console.log(`OK      ${j.nome} — ${detalhe} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU  ${j.nome} — ${e.message} (${((Date.now() - inicio) / 1000).toFixed(1)}s)`);
  }
}
console.log(
  falhas === 0
    ? `\n${JORNADAS.length} jornadas: todas OK`
    : `\n${falhas} de ${JORNADAS.length} jornadas FALHARAM`
);

/* Cinturao final de higiene (Windows): mesmo com taskkill /T + varredura por perfil AWAITADAS,
   o shutdown do Chrome tem corridas que deixam ~1 processo por browser (root ou crashpad/gpu).
   Esta varredura unica de fim de suite mata qualquer chrome.exe com perfil `jornada-` —
   os perfis sao exclusivos deste driver, nunca o Chrome real do usuario. */
if (process.platform === 'win32') {
  await new Promise((resolver) => {
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'jornada-' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      () => resolver()
    );
  });
}
process.exit(falhas === 0 ? 0 : 1);
