#!/usr/bin/env node
// =============================================================================
// surface-registry.mjs — `ADMAI_RELEASE_SURFACE_REGISTRY`
//
// O QUE ISTO RESPONDE
//   "Quais superfícies o AdmAi tem, e em que estado cada uma está para o release."
//
// POR QUE NÃO É UMA LISTA
//   Lista manual diverge do produto em silêncio: alguém acrescenta uma rota, ninguém acrescenta a
//   linha, e o inventário segue parecendo completo. Aqui as rotas são PARSEADAS de `App.jsx`. Rota
//   que existe no router e não está classificada REPROVA; classificação apontando para rota que
//   não existe também. As duas direções, porque só uma deixaria metade do erro passar.
//
// SUPERFÍCIE != ROTA, e essa distinção é o motivo de o registry existir
//   Cadastro não tem rota própria: é modo de `/login` (`?modo=cadastrar`, abas `entrar|cadastrar`).
//   Derivar só do router perderia uma das duas telas que o usuário mais vê — e foi exatamente a
//   tela que a instrução marcou como `MUST_REVIEW`. Diálogos e estados transversais também não são
//   rotas e continuam sendo superfície.
//
// CLASSIFICAÇÃO EXIGE RAZÃO
//   `KEEP` sem motivo escrito é "não olhei" com outro nome. Por isso `razao` é obrigatória em toda
//   classificação, inclusive — principalmente — em `KEEP`.
// =============================================================================
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const APP = path.join(RAIZ, 'chaveiro-painel/src/App.jsx');

export const CLASSIFICACOES = Object.freeze(['KEEP', 'REFINE', 'REDESIGN', 'NOT_INVENTORIED']);
export const OBSERVACOES = Object.freeze(['OBSERVED', 'NOT_OBSERVED', 'NA']);

/**
 * Lê as rotas REAIS do router.
 *
 * Regex e não AST de propósito: a forma dos blocos em `App.jsx` é regular e verificada por
 * controle (o total tem de bater com a contagem de `path=`). Um parser completo seria mais
 * ferramenta do que o problema pede — e a contagem cruzada pega justamente o caso em que a regex
 * erraria em silêncio.
 */
export function rotasDoRouter(arquivo = APP) {
  if (!existsSync(arquivo)) return [];
  const fonte = readFileSync(arquivo, 'utf8');

  /* DIVISÃO em segmentos, não uma regex só. Duas tentativas anteriores falharam por motivos
     opostos e ensinaram o formato certo:
       terminar em `/>`      — o elemento da página é auto-fechado (`<Servicos />`), então a janela
                               fechava cedo e o componente nunca era extraído;
       janela de 400 chars   — bloco com `RequirePermissao` e comentário passa disso, o casamento
                               falhava inteiro e CINCO rotas sumiam do inventário.
     Dividir pelo próprio marcador não perde rota: cada `path="` vira um segmento, e o segmento
     termina onde o próximo começa. O limite de inspeção fica DENTRO do segmento, então encurtá-lo
     nunca descarta uma rota — no pior caso deixa de extrair um campo, o que os controles pegam. */
  const partes = fonte.split('path="').slice(1);

  const rotas = partes.map((parte) => {
    const rota = parte.slice(0, parte.indexOf('"'));
    const corpo = parte.slice(rota.length + 1, rota.length + 1 + 400);
    return {
      rota,
      /* PRIMEIRO auto-fechado, com ou sem atributos. Guardas (`<RequireAuth>`, `<Layout>`) são
         tags de abertura, então o primeiro auto-fechado é sempre a página. Exigir ausência de
         atributos fazia `<Navigate to="/" replace />` não casar, e a rota curinga acabava
         atribuída ao `<Sidebar />` renderizado depois do `<Routes>`. */
      componente: corpo.match(/<([A-Z][A-Za-z0-9]*)[^>]*\/>/)?.[1] ?? null,
      exigeAuth: corpo.includes('<RequireAuth>'),
      permissao: corpo.match(/RequirePermissao\s+modulo="([a-z]+)"/)?.[1] ?? null,
    };
  });

  /* A flag envolve o `<Route>`, então fica ANTES do `path="` e fora do segmento. */
  const comFlag = new Map();
  const reFlag = /featureAtiva\('([A-Z_]+)'\)\s*&&\s*\(\s*<Route\s+path="([^"]+)"/g;
  let f;
  while ((f = reFlag.exec(fonte)) !== null) comFlag.set(f[2], f[1]);

  return rotas.map((r) => ({ ...r, flag: comFlag.get(r.rota) ?? null }));
}

/**
 * Superfícies que NÃO são rotas, declaradas porque o router não as revela.
 * Cada uma diz como se chega nela — sem isso viram folclore.
 */
export const SUPERFICIES_SEM_ROTA = Object.freeze([
  {
    surfaceId: 'AUTH_CADASTRO',
    featureId: 'ONBOARDING',
    rota: '/login?modo=cadastrar',
    entryPoint: 'aba "cadastrar" em Login.jsx:28, ou link da Landing',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'CATALOGO_MODAIS',
    featureId: 'ESTOQUE',
    rota: '/materiais (diálogo)',
    entryPoint: 'CatalogoModais.jsx, aberto de dentro de Materiais',
    papeis: ['dono', 'gestor'],
  },
  {
    surfaceId: 'PRIMEIRO_ACESSO',
    featureId: 'ONBOARDING',
    rota: '/ (sobreposição)',
    entryPoint: 'CookieBanner → WelcomeCard → tour opt-in, sequência de lib/primeiroAcesso.js',
    papeis: ['dono', 'gestor', 'funcionario'],
  },
  /* `/` NÃO é uma superfície: `App.jsx:52` despacha por papel para quatro telas completamente
     diferentes. Um registry derivado só do router contaria uma e perderia três — incluindo a
     Landing, que é a face pública do produto, e a home do gestor. É o caso mais forte de
     `superfície != rota` no AdmAi. */
  {
    surfaceId: 'HOME_LANDING',
    featureId: 'ONBOARDING',
    rota: '/ (sem sessão)',
    entryPoint: 'App.jsx:54 — `if (!user) return <Landing />`',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'HOME_DONO',
    featureId: 'METRIC_FOUNDATION',
    rota: '/ (papel dono)',
    entryPoint: 'App.jsx:60 — <Dashboard />',
    papeis: ['dono'],
  },
  {
    surfaceId: 'HOME_GESTOR',
    featureId: 'INDICADORES',
    rota: '/ (papel gestor)',
    entryPoint: 'App.jsx:58 — <GestorHome />',
    papeis: ['gestor'],
  },
  {
    surfaceId: 'HOME_FUNCIONARIO',
    featureId: 'PONTO',
    rota: '/ (papel funcionário)',
    entryPoint: 'App.jsx:56 — <MeuPainel />',
    papeis: ['funcionario'],
  },
]);

/**
 * Classificação declarada por superfície.
 *
 * `NOT_INVENTORIED` é o default honesto: significa "ainda não olhei", e o gate de fechamento de
 * escopo exige zero delas. Não confundir com `KEEP`, que afirma ter olhado e aprovado.
 */
export const CLASSIFICADAS = Object.freeze({
  /* ── Autenticação ─────────────────────────────────────────────────────── */
  '/login': {
    classificacao: 'REFINE',
    razao: 'Arquitetura correta e composição forte no desktop: painel de valor à esquerda, formulário à direita, abas ENTRAR/CRIAR CONTA, alternância usuário/telefone e login social. Dois defeitos observados em 390px: o banner de consentimento corta ao meio "Esqueci minha senha" e "Entrar sem senha" — quem perdeu a senha encontra a saída obscurecida — e o login social cai abaixo da dobra.',
    observado: 'OBSERVED',
  },
  AUTH_CADASTRO: {
    classificacao: 'REFINE',
    razao: 'Herda a composição e os dois defeitos do /login, por ser o mesmo componente em outro modo. Classificada à parte porque é a superfície de PRIMEIRO contato de todo cliente novo e a instrução a marcou MUST_REVIEW; tratá-la como detalhe do login foi o que a deixou fora do inventário até agora.',
    observado: 'OBSERVED',
  },
  '/recuperar-senha': {
    classificacao: 'REFINE',
    razao: 'Observada em 390 e 1440. Mesma família visual do login e mesma ocultação pelo banner de consentimento no mobile. Sem defeito próprio identificado.',
    observado: 'OBSERVED',
  },

  /* ── Home: quatro telas, uma rota ─────────────────────────────────────── */
  HOME_LANDING: {
    classificacao: 'NOT_INVENTORIED',
    razao: null,
    observado: 'NOT_OBSERVED',
  },
  HOME_DONO: {
    classificacao: 'REFINE',
    razao: 'Observada nos quatro viewports. Hierarquia e densidade boas em 1920: a grade de KPIs ocupa a largura, sem desperdício. Restam o banner de consentimento cobrindo o rodapé no mobile e a ausência de estado vazio guiado — com empresa nova tudo mostra R$ 0,00 sem dizer o que fazer em seguida.',
    observado: 'OBSERVED',
  },
  HOME_GESTOR: {
    classificacao: 'REFINE',
    razao: 'Observada em 390 e 1440. Boa tela: operação do dia, filtro de período, quatro KPIs, aprovações pendentes com atalho e presença do time ao vivo. O banner de consentimento cobre "Presença do time" em 390px — mesmo defeito sistêmico das demais.',
    observado: 'OBSERVED',
  },
  HOME_FUNCIONARIO: {
    classificacao: 'REFINE',
    razao: 'Observada em 360 e 390 antes e depois das correções GAP-UI-03 e GAP-UI-04. Rótulos e semântica corrigidos; permanece a oclusão pelo banner de consentimento e a duplicação visual entre "Comissão a receber" e "Total gerado", que hoje só se distinguem pelo texto de apoio.',
    observado: 'OBSERVED',
  },

  /* ── Serviços ─────────────────────────────────────────────────────────── */
  '/servicos': {
    classificacao: 'NOT_INVENTORIED',
    razao: null,
    observado: 'NOT_OBSERVED',
  },
  '/servicos/novo': {
    classificacao: 'REFINE',
    razao: 'Assistente de 4 etapas com ação primária única e obrigatórios marcados — a estrutura está certa. O defeito é densidade em desktop: em 1568px a coluna útil fica em ~520px e o restante do viewport vazio. Corrigir alargando seria trocar um desperdício por outro; as etapas podem conviver em paralelo em telas largas.',
    observado: 'OBSERVED',
  },
  '/meus-servicos/novo': {
    classificacao: 'REFINE',
    razao: 'Observada nos quatro viewports. Mesma densidade do formulário do gestor: em 1920px o formulário usa ~640px e deixa 60% da tela vazia. O fluxo em si é adequado ao uso em campo, que é mobile.',
    observado: 'OBSERVED',
  },

  /* ── Operação ─────────────────────────────────────────────────────────── */
  '/estoque': {
    classificacao: 'NOT_INVENTORIED',
    razao: null,
    observado: 'NOT_OBSERVED',
  },
  '/configuracao/usuarios': {
    classificacao: 'KEEP',
    razao: 'Observada em 1440 com três contas reais. Lista clara, papel e vínculo visíveis por linha, ações de acesso e remoção ao lado de cada conta, estado ativo explícito. Nenhum problema de hierarquia, densidade ou clareza identificado — e é a superfície que a decisão de escopo manteve no release por sustentar RBAC.',
    observado: 'OBSERVED',
  },

  /* ── Públicas ─────────────────────────────────────────────────────────── */
  '/privacidade': {
    classificacao: 'KEEP',
    razao: 'Observada em 390 e 1440. Documento legal servido por PaginaLegal; legível nos dois tamanhos, sem interação além da leitura. Refinar aqui não melhora resultado nenhum do usuário.',
    observado: 'OBSERVED',
  },

  /* ── Redirects: não são superfície ────────────────────────────────────── */
  '/configuracao/estoque': {
    classificacao: 'KEEP',
    razao: 'Não é tela: é <Navigate to="/estoque" replace /> em App.jsx:376. Não tem UI própria para refinar; existe para não quebrar link antigo.',
    observado: 'NA',
  },
  '/configuracao/catalogo': {
    classificacao: 'KEEP',
    razao: 'Não é tela: é <Navigate to="/materiais" replace /> em App.jsx:377. Mesma natureza do anterior.',
    observado: 'NA',
  },
  '*': {
    classificacao: 'KEEP',
    razao: 'Curinga que redireciona para "/". Sem UI. Observado indiretamente: deep-link em rota diferida cai no Painel por este caminho, que é o comportamento desejado.',
    observado: 'NA',
  },

  /* ── Diferidas: fora deste release ────────────────────────────────────── */
  '/avaliacoes': {
    classificacao: 'KEEP',
    razao: 'DIFERIDA (GOOGLE_REVIEWS). Verificado em runtime que a rota não existe com a flag desligada e o item sumiu da navegação. Não recebe trabalho de experiência neste release; quando voltar, será reclassificada.',
    observado: 'OBSERVED',
  },
  '/configuracao/notificacoes': {
    classificacao: 'KEEP',
    razao: 'DIFERIDA (NOTIFICACOES). Rota e item de entrada removidos por flag; deep-link não alcança. Fora do escopo de experiência deste release.',
    observado: 'OBSERVED',
  },
  '/metricas/faturamento-liquido': {
    classificacao: 'KEEP',
    razao: 'DIFERIDA (METRIC_HUBS). Rota sob flag desligada e hubEm removido do KpiCard, então nem o card do dashboard leva até ela.',
    observado: 'OBSERVED',
  },
  '/metricas/servicos-concluidos': {
    classificacao: 'KEEP',
    razao: 'DIFERIDA (METRIC_HUBS). Mesma condição da irmã acima.',
    observado: 'OBSERVED',
  },
});

/** Junta rotas e superfícies sem rota num inventário único. */
export function inventario(arquivo = APP) {
  const doRouter = rotasDoRouter(arquivo).map((r) => ({
    surfaceId: r.rota,
    featureId: null,
    ...r,
    origem: 'ROUTER',
  }));
  const semRota = SUPERFICIES_SEM_ROTA.map((s) => ({ ...s, origem: 'DECLARADA' }));
  return [...doRouter, ...semRota].map((s) => ({
    ...s,
    ...(CLASSIFICADAS[s.surfaceId] ?? {
      classificacao: 'NOT_INVENTORIED',
      razao: null,
      observado: 'NOT_OBSERVED',
    }),
  }));
}

export function controles(arquivo = APP) {
  const fonte = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '';
  const rotas = rotasDoRouter(arquivo);
  const inv = inventario(arquivo);
  const idsDoRouter = new Set(rotas.map((r) => r.rota));

  return [
    /* Se a regex perder um bloco, o inventário fica menor que o produto e ninguém nota. A
       contagem de `path=` é derivada de outra forma, então erra por outro motivo. */
    ['toda rota do router entra no inventário',
      rotas.length === (fonte.match(/path="/g) ?? []).length],
    ['nenhuma classificação aponta para rota inexistente',
      Object.keys(CLASSIFICADAS).every(
        (k) => idsDoRouter.has(k) || SUPERFICIES_SEM_ROTA.some((s) => s.surfaceId === k)
      )],
    ['Cadastro está no inventário, e não é rota',
      inv.some((s) => s.surfaceId === 'AUTH_CADASTRO' && s.origem === 'DECLARADA')],
    ['Login está no inventário',
      inv.some((s) => s.surfaceId === '/login')],
    ['toda classificação declarada pertence à taxonomia',
      inv.every((s) => CLASSIFICACOES.includes(s.classificacao))],
    /* A regra que impede `KEEP` de virar sinônimo de "não olhei". */
    ['classificação diferente de NOT_INVENTORIED exige razão escrita',
      inv.every((s) => s.classificacao === 'NOT_INVENTORIED' || (s.razao ?? '').trim().length > 10)],
    /* `NA` afirma que NÃO HÁ o que observar, e só se sustenta para redirect — que não tem UI.
       Aceitá-lo aqui é necessário; a defesa contra abuso é a `razao`, que precisa dizer por quê,
       e um humano lendo "não é tela" sobre uma página de verdade percebe na hora. */
    ['classificação decidida exige observação de runtime (ou NA justificado)',
      inv.every((s) => s.classificacao === 'NOT_INVENTORIED' || ['OBSERVED', 'NA'].includes(s.observado))],
    /* Contraparte: `NA` em superfície que declara componente de página é suspeito — redirect usa
       `<Navigate>`, e é o único caso legítimo. */
    ['NA só em superfície sem página própria',
      inv.filter((s) => s.observado === 'NA').every((s) => !s.componente || s.componente === 'Navigate')],
  ];
}

/**
 * Autoteste, no padrão das ferramentas vizinhas (`write-set-gate --selftest`).
 *
 * Não é suíte vitest: o `include` dos dois módulos cobre `src/**` e `scripts/**`, e `tools/` fica
 * de fora. Escrever teste que ninguém roda é pior que não escrever — dá a impressão de cobertura.
 *
 * Os casos usam um `App.jsx` sintético, então provam o PARSER, e não o `App.jsx` de hoje: um
 * controle que lesse o arquivo real passaria a medir o produto em vez do instrumento.
 */
export function autoteste() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'surf-'));
  const escrever = (nome, conteudo) => {
    const arq = path.join(tmp, nome);
    writeFileSync(arq, conteudo);
    return arq;
  };

  const simples = escrever('a.jsx', `
          <Route
            path="/servicos"
            element={<RequireAuth><Layout><Servicos /></Layout></RequireAuth>}
          />
`);
  const [r1] = rotasDoRouter(simples);

  const comPermissao = escrever('b.jsx', `
          <Route
            path="/reparticao"
            element={<RequireAuth><RequirePermissao modulo="financeiro" acao="ver"><Layout><Reparticao /></Layout></RequirePermissao></RequireAuth>}
          />
`);
  const [r2] = rotasDoRouter(comPermissao);

  const comFlag = escrever('c.jsx', `
          {featureAtiva('GOOGLE_REVIEWS') && (
            <Route
              path="/avaliacoes"
              element={<RequireAuth><Layout><Avaliacoes /></Layout></RequireAuth>}
            />
          )}
`);
  const [r3] = rotasDoRouter(comFlag);

  const publica = escrever('d.jsx', `
          <Route path="/privacidade" element={<PaginaLegal doc="privacidade" />} />
`);
  const [r4] = rotasDoRouter(publica);

  const duas = escrever('e.jsx', readFileSync(simples, 'utf8') + readFileSync(simples, 'utf8').replace('/servicos', '/nova-tela'));
  const invDuas = inventario(duas);

  return [
    ['parser lê caminho e componente', r1?.rota === '/servicos' && r1?.componente === 'Servicos'],
    ['parser lê a guarda de autenticação', r1?.exigeAuth === true],
    ['parser lê o módulo de RequirePermissao', r2?.permissao === 'financeiro'],
    /* Sem isto, rota diferida entraria no inventário como se fosse do release. */
    ['parser reconhece rota sob feature flag', r3?.flag === 'GOOGLE_REVIEWS'],
    ['CONTRAPROVA: rota pública não é marcada como autenticada', r4?.exigeAuth === false],
    /* A propriedade que lista manual não tem: o produto cresce e o inventário cresce junto. */
    ['rota nova aparece sem ninguém editar lista',
      invDuas.some((s) => s.surfaceId === '/nova-tela' && s.classificacao === 'NOT_INVENTORIED')],
    ['Cadastro entra no inventário mesmo NÃO sendo rota',
      invDuas.some((s) => s.surfaceId === 'AUTH_CADASTRO' && s.origem === 'DECLARADA')],
    ['NOT_INVENTORIED é estado da taxonomia, não ausência de campo',
      CLASSIFICACOES.includes('NOT_INVENTORIED')],
  ];
}

export function executar() {
  const inv = inventario();
  const casos = [...controles(), ...autoteste()];
  const falhos = casos.filter(([, ok]) => !ok).map(([x]) => x);
  const porClasse = {};
  for (const s of inv) porClasse[s.classificacao] = (porClasse[s.classificacao] ?? 0) + 1;

  console.log('AdmAi — Release Surface Registry  [SCOPE-F2]');
  console.log('');
  console.log(`  superfícies : ${inv.length}  (${inv.filter((s) => s.origem === 'ROUTER').length} do router, ${inv.filter((s) => s.origem === 'DECLARADA').length} declaradas)`);
  for (const [k, v] of Object.entries(porClasse)) console.log(`  ${k.padEnd(16)}: ${v}`);
  console.log('');
  console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
  for (const f of falhos) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log('  ZERO_UNCLASSIFIED_RUNTIME_SURFACES : ' +
    (porClasse.NOT_INVENTORIED ? `NÃO — ${porClasse.NOT_INVENTORIED} sem classificação` : 'sim'));
  return falhos.length === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('surface-registry.mjs')) {
  process.exit(executar());
}
