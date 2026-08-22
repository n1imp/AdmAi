/**
 * Teste de integração: o erro que ninguém tratou vira sinal.  [GAP-OBS-02]
 *
 * O QUE FALTAVA, e é mais estreito do que eu tinha escrito no gap
 *   `src/config/__tests__/sentry.test.js` e `sentryTransport.test.js` já provavam bastante coisa:
 *   ativação condicionada ao DSN, idempotência do init, `capturarErro` no-op quando inativo,
 *   enriquecimento por tenant, e as quatro regras do transporte winston→Sentry. O `beforeSend`
 *   ficou de fora e foi coberto lá agora.
 *
 *   O que continuava sem prova nenhuma é ISTO: que um erro real, atravessando o Express, chega ao
 *   handler global de `app.js:201` e produz log + captura. Todas as provas acima chamam as funções
 *   diretamente. Nenhuma passa pelo servidor. Entre "a função de captura funciona" e "o erro chega
 *   até ela" há um encadeamento inteiro — e é ele que decide se alguém fica sabendo.
 *
 * COMO SE PRODUZ UM ERRO NÃO TRATADO SEM MOCKAR AS ENTRANHAS DO APP
 *   Quase toda rota tem `try/catch` próprio e responde 500 sozinha, sem nunca alcançar o handler
 *   global. Forçar uma exceção mockando um serviço interno provaria o meu mock.
 *
 *   JSON malformado é um erro genuíno, de fora para dentro: `express.json()` (app.js:75) lança
 *   `SyntaxError` antes de qualquer rota existir, e o Express encaminha ao handler de erro. É o
 *   caminho real, disparado do jeito que um cliente quebrado dispararia.
 *
 * O ACHADO QUE ESTE ARQUIVO PRODUZIU, e que foi corrigido  [GAP-OBS-03 / D-OBS-03]
 *   Corpo inválido é erro do CLIENTE e saía como `500`, porque o handler global nunca olhava o
 *   status que a exceção já carregava. Cliente quebrado — app Android desatualizado, proxy que
 *   corrompe corpo, robô de varredura — inflava a taxa de 500 e enchia a captura de eventos que
 *   não são defeito do produto. O sinal que deveria dizer "o AdmAi quebrou" passava a dizer
 *   "alguém mandou lixo".
 *
 * POR QUE `expose` E NÃO `status`, que é a parte que eu tinha errado
 *   Minha proposta era ler `erro.status`. O Codex Decisor discordou, e verifiquei que estava certo:
 *   três lugares deste repositório copiam status ALHEIO para a exceção —
 *   `whatsapp/evolution-client.js:33`, `whatsapp/cloud-client.js:35` e `oauth.js:22`. Com `status`
 *   sozinho, um 403 vindo do provedor do WhatsApp seria devolvido ao cliente como erro dele E
 *   sumiria da captura: uma falha de integração real desaparecendo exatamente de onde se procura
 *   falha. `expose: true` é posto pelo `http-errors`, que é quem o body-parser usa; ninguém o põe
 *   à mão aqui. Por isso ele discrimina e `status` não.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import request from 'supertest';

/* Espia a captura preservando o resto do módulo — `JA_ENVIADO_AO_SENTRY` é `Symbol.for`, e o
   handler global depende dele para não duplicar evento com o transporte do winston. */
vi.mock('../../src/config/sentry.js', async (orig) => ({
  ...(await orig()),
  capturarErro: vi.fn(),
}));

/* O logger NÃO é mockado por módulo, e a primeira versão deste arquivo errou exatamente aí:
   trocá-lo por `{ ...real.logger, error: vi.fn() }` produz um objeto simples e descarta o
   protótipo do winston. `logger.debug`/`logger.add` somem, qualquer rota que logue estoura, e
   TODA requisição vira 500 — inclusive `GET` em rota inexistente. O teste que eu escrevi para
   medir o handler de erro passou a fabricar os erros que media. Espião sobre a instância real
   mantém o winston inteiro. */
import { capturarErro, JA_ENVIADO_AO_SENTRY } from '../../src/config/sentry.js';
import { logger } from '../../src/utils/logger.js';
import { criarApp } from '../../src/app.js';
import { limparBanco, criarEmpresaComAdmin, prisma } from './helpers.js';

let app;
let erroLogado;

beforeAll(() => {
  ({ app } = criarApp());
});

beforeEach(async () => {
  await limparBanco();
  capturarErro.mockClear();
  erroLogado = vi.spyOn(logger, 'error').mockImplementation(() => logger);
});

afterEach(() => {
  erroLogado.mockRestore();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Envia um corpo que NÃO é JSON válido, com o content-type que faz o parser tentar lê-lo. */
const corpoQuebrado = (rota) =>
  request(app).post(rota).set('Content-Type', 'application/json').send('{"isto": nao fecha');

/**
 * Invoca o handler global de erro diretamente, com o contrato de 4 argumentos do Express.
 *
 * POR QUE OS DOIS RAMOS SÃO PROVADOS DE FORMAS DIFERENTES, e isso é deliberado
 *   O ramo 4xx tem um gatilho natural de fora para dentro: corpo malformado. Ele é exercitado por
 *   HTTP real, atravessando o Express inteiro, que é o que prova que o erro CHEGA ao handler.
 *
 *   O ramo 500 não tem gatilho equivalente: praticamente toda rota tem `try/catch` e responde 500
 *   sozinha, sem alcançar o handler global. Produzir um por HTTP exigiria mockar um serviço
 *   interno — e aí o teste provaria o meu mock, não o produto. Aqui o handler é chamado com uma
 *   exceção da forma exata que `evolution-client.js:33` e `oauth.js:22` produzem.
 *
 *   O que isto NÃO prova: que exista hoje uma rota capaz de escapar sem tratamento. Prova o que o
 *   handler faz quando recebe uma — que é a propriedade em questão.
 */
function invocarHandler(erro) {
  const camadas = app._router.stack.filter((c) => c.handle && c.handle.length === 4);
  const handler = camadas[camadas.length - 1].handle;
  let status = null;
  let corpo = null;
  const res = {
    status(c) {
      status = c;
      return this;
    },
    json(b) {
      corpo = b;
      return this;
    },
  };
  handler(
    erro,
    { path: '/api/interno', method: 'POST', user: { id: 9, empresaId: 7 } },
    res,
    () => {}
  );
  return { status, corpo };
}

describe('Erro não tratado vira sinal [GAP-OBS-02]', () => {
  it('CONTROLE POSITIVO: com corpo válido a mesma rota responde normalmente e NÃO captura erro', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ninguem', password: 'errada' });

    /* 401 é resposta de negócio, não falha. Sem este caso, "capturou erro" seria satisfeito por
       um app que captura tudo — e captura em toda requisição é o mesmo que captura em nenhuma. */
    expect(res.status).toBe(401);
    expect(capturarErro).not.toHaveBeenCalled();
    expect(erroLogado).not.toHaveBeenCalled();
  });

  it('falha da APLICAÇÃO é capturada com o contexto que a torna diagnosticável', async () => {
    invocarHandler(new Error('coluna inexistente na consulta'));

    expect(capturarErro).toHaveBeenCalledTimes(1);
    const [erro, contexto] = capturarErro.mock.calls[0];
    expect(erro).toBeInstanceOf(Error);
    /* Sem rota, método e tenant, o painel mostra uma pilha sem dizer o que o usuário estava
       fazendo nem de quem era a empresa afetada — e o evento vira estatística, não diagnóstico. */
    expect(contexto.feature).toBe('http');
    expect(contexto.extra.path).toBe('/api/interno');
    expect(contexto.extra.method).toBe('POST');
    expect(contexto.userId).toBe(9);
    expect(contexto.empresaId).toBe(7);
  });

  it('o log do handler vem MARCADO, para o transporte não duplicar o evento', async () => {
    invocarHandler(new Error('falha interna qualquer'));

    expect(erroLogado).toHaveBeenCalledTimes(1);
    const [mensagem, meta] = erroLogado.mock.calls[0];
    expect(mensagem).toBe('Erro não tratado');
    /* Sem a marca, o mesmo erro sairia duas vezes: uma por `capturarErro` (com stack e tags) e
       outra pelo SentryTransport espelhando o `logger.error`. Evento dobrado corrompe contagem —
       e contagem é o que decide se alguém é acordado de madrugada. */
    expect(meta[JA_ENVIADO_AO_SENTRY]).toBe(true);
  });

  it('a resposta de 500 não carrega stack, mensagem interna nem caminho de arquivo', async () => {
    const erro = new Error('SELECT falhou em /app/src/db/prisma.js: coluna "senhaHash" ausente');
    const { status, corpo } = invocarHandler(erro);

    expect(status).toBe(500);
    expect(corpo).toEqual({ erro: 'Erro interno do servidor' });
    /* A mensagem interna descreve schema e caminho de arquivo — mapa do servidor para quem
       souber ler. O corpo genérico é o que impede que uma falha vire reconhecimento. */
    const texto = JSON.stringify(corpo);
    expect(texto).not.toContain('senhaHash');
    expect(texto).not.toContain('/app/src');
    expect(texto).not.toContain('SELECT');
  });

  it('erro do CLIENTE responde 4xx, sem captura e sem log de erro', async () => {
    const res = await corpoQuebrado('/api/auth/login');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ erro: 'Requisição inválida' });
    /* As duas asserções abaixo são o ponto todo da correção: o evento não pode existir. Responder
       400 e continuar capturando manteria o painel poluído — o status mudaria e o ruído ficaria. */
    expect(capturarErro).not.toHaveBeenCalled();
    expect(erroLogado).not.toHaveBeenCalled();
  });

  it('a resposta 4xx não devolve a mensagem do parser, que carrega trecho do corpo recebido', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"senha": "MinhaSenhaSecreta123 <- lixo nao fecha');

    /* `erro.message` do body-parser inclui o pedaço do JSON onde a análise falhou. Ecoar isso
       devolveria ao cliente — e a qualquer proxy ou log intermediário — o conteúdo que ele
       acabou de mandar, que pode ser exatamente uma senha. */
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('MinhaSenhaSecreta123');
    expect(texto).not.toContain('JSON');
    expect(texto).not.toContain('position');
  });

  it('CORPO GRANDE DEMAIS: 413 e sem captura — mesma família, outro status', async () => {
    const gigante = { campo: 'x'.repeat(11 * 1024 * 1024) };

    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(gigante));

    /* Prova que a correção é por CLASSE e não um remendo para JSON malformado: o limite de 10mb
       produz outro status, pela mesma via, e também não é defeito do AdmAi. */
    expect(res.status).toBe(413);
    expect(capturarErro).not.toHaveBeenCalled();
  });

  it('CONTRAPROVA CRÍTICA: status 4xx SEM `expose` continua sendo 500 e é capturado', async () => {
    /* Este é o caso que separa a decisão do Codex da minha proposta original, e ele não pode ser
       exercitado por HTTP: precisa de uma exceção com a forma que `evolution-client.js:33`,
       `cloud-client.js:35` e `oauth.js:22` produzem — `status` numérico copiado de terceiro, sem
       `expose`. Aqui o handler é invocado diretamente, com o mesmo contrato do Express. */
    const erroDeIntegracao = new Error('WhatsApp Cloud API falhou: enviarMensagem');
    erroDeIntegracao.status = 403; // status DO PROVEDOR, não do nosso cliente
    // repare: nenhum `expose` — é isso que separa esta exceção das do body-parser

    const { status: statusRespondido } = invocarHandler(erroDeIntegracao);

    /* Se isto virasse 403 silencioso, uma queda do provedor de WhatsApp sumiria do rastreador e
       apareceria para o usuário como "requisição inválida" — culpando quem não tem culpa e
       escondendo a única pista do incidente. */
    expect(statusRespondido).toBe(500);
    expect(capturarErro).toHaveBeenCalledTimes(1);
  });

  it('rota inexistente NÃO é capturada como erro — nem sem sessão, nem com ela', async () => {
    const semSessao = await request(app).get('/api/rota-que-nunca-existiu');
    const { token } = await criarEmpresaComAdmin(request, app, 'ER0');
    const comSessao = await request(app)
      .get('/api/rota-que-nunca-existiu')
      .set('Authorization', `Bearer ${token}`);

    /* Sem sessão dá 401, não 404, e eu tinha assumido 404 — errado. `accountRouter` monta
       `requireAuth` e tudo montado depois dele passa por ali, então um caminho desconhecido
       esbarra na autenticação antes de chegar ao 404 final. É o comportamento melhor, aliás:
       responder 404 para anônimo diria quais rotas existem e quais não. Com sessão válida o
       caminho segue até o `app.use((req,res)=>…)` e aí sim é 404. */
    expect(semSessao.status).toBe(401);
    expect(comSessao.status).toBe(404);
    /* O que importa para observabilidade é o mesmo nos dois: nenhum deles é falha da aplicação.
       Se caíssem na captura, todo robô de varredura viraria uma tempestade de eventos e o
       painel de erros deixaria de servir para achar defeito. */
    expect(capturarErro).not.toHaveBeenCalled();
  });

  it('a aplicação SEGUE ATENDENDO depois do erro não tratado', async () => {
    await criarEmpresaComAdmin(request, app, 'ER1');
    await corpoQuebrado('/api/auth/login');

    const depois = await request(app).get('/health');

    /* Um handler de erro que responde e derruba o processo produziria o mesmo 500 do caso acima —
       e a diferença entre "erro tratado" e "aplicação morta" é exatamente o que se quer saber. */
    expect(depois.status).toBe(200);
    expect(depois.body.checks.database).toBe('ok');
  });
});
