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
 * De onde a superfície veio. Sem isto, uma lista manual e uma derivação do router ficam
 * indistinguíveis — e a manual é a que envelhece em silêncio quando o produto muda.
 */
export const PROVENIENCIAS = Object.freeze([
  'ROUTER_DERIVED', // saiu de um `path=` em App.jsx
  'ROLE_DERIVED', // mesma rota, papel diferente, tela diferente
  'MODE_DERIVED', // mesma rota, modo diferente (`?modo=cadastrar`)
  'STATE_DERIVED', // mesma rota, estado diferente (`?token=`, diálogo, sobreposição)
  'DECLARED_WITH_EVIDENCE', // declarada à mão, com arquivo e linha que provam que existe
]);

/** Estado por viewport. `NOT_OBSERVED` é diferente de `PASS`, e essa diferença é o ponto. */
export const ESTADOS_VIEWPORT = Object.freeze(['PASS', 'ISSUE', 'NOT_APPLICABLE', 'NOT_OBSERVED']);

/**
 * QUE TIPO DE OLHAR sustentou a classificação.
 *
 * A sonda mede o objetivo (oclusão por hit-test, transbordo, truncamento, alvo de toque); a
 * captura sustenta o subjetivo (hierarquia, densidade, clareza). Registrar os dois separados
 * impede a frase mais fácil e mais falsa deste trabalho: "analisei" quando só medi.
 */
export const EVIDENCIAS = Object.freeze(['SONDA', 'SONDA_E_CAPTURA']);

export const VIEWPORTS_OBSERVADOS = Object.freeze(['360x800', '390x844', '1440x900', '1920x1080']);

/** Açúcar para não repetir quatro chaves em cinquenta superfícies. */
function vp(a, b, c, d) {
  return Object.freeze({
    '360x800': a,
    '390x844': b,
    '1440x900': c,
    '1920x1080': d,
  });
}
const TODOS_NA = vp('NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE', 'NOT_APPLICABLE');

/**
 * ACHADOS COMPARTILHADOS — uma causa, um registro, muitas superfícies.
 *
 * A regra que estes objetos existem para cumprir: `REPEATED_CROSS_SURFACE_DEFECT →
 * ONE_SHARED_FINDING → AFFECTED_SURFACE_SET → ONE_SYSTEMIC_CORRECTION LATER`. Sem eles o
 * inventário produziria GAP-X-LOGIN, GAP-X-ESTOQUE, GAP-X-PONTO para o mesmo `position: fixed`,
 * e a correção seria feita quarenta vezes — ou, mais provavelmente, três vezes e esquecida.
 */
export const ACHADOS_COMPARTILHADOS = Object.freeze([
  {
    id: 'GAP-UX-CONSENT-01',
    titulo: 'Banner de consentimento cobre conteúdo: é fixo e não reserva espaço no layout',
    causa:
      'CookieBanner.jsx:31 usa `fixed bottom-0 left-0 right-0 z-50` e nenhum contêiner reserva ' +
      'altura equivalente. O banner não empurra nada: ele deita por cima do que já estava lá.',
    /* Medido por hit-test, não por sobreposição de retângulos: conta como oclusão só quando o
       clique no centro do elemento chega no banner em vez de chegar no alvo. */
    evidencia:
      'sonda em 4 viewports × 4 papéis. Em 360x800 o botão ENTRAR de /login sai cortado ao meio; ' +
      'em /trocar-senha o campo de senha e "DEFINIR SENHA E ENTRAR" ficam inalcançáveis; em ' +
      '/meus-servicos o "INICIAR SERVIÇO" do técnico some; em quase toda tela autenticada a ' +
      'navegação inferior inteira (Painel/Equipe/Relatórios/Mais) fica coberta. Em 1440 e 1920 ' +
      'ainda cobre o "+" de /tecnicos e o "CRIAR CONTA" do cadastro.',
    contraprova:
      'telas/inventario-boasvindas: com o consentimento respondido, a mesma tela mostra a ' +
      'navegação inferior inteira e desobstruída. O banner é a causa, e não o sintoma.',
    severidade: 'ALTA',
    superficiesAfetadas: [
      '/login',
      'AUTH_CADASTRO',
      '/recuperar-senha',
      '/redefinir-senha',
      '/magic-link',
      '/verificar-email',
      '/convite/:token',
      '/trocar-senha',
      'HOME_LANDING',
      'HOME_DONO',
      'HOME_GESTOR',
      'HOME_FUNCIONARIO',
      '/servicos',
      '/servicos/novo',
      '/reparticao',
      '/tecnicos',
      '/tecnicos/novo',
      '/tecnicos/:id',
      '/aprovacoes',
      '/materiais',
      '/estoque',
      '/mais',
      '/ajuda',
      '/configuracao',
      '/configuracao/perfil',
      '/configuracao/seguranca',
      '/configuracao/whatsapp',
      '/configuracao/usuarios',
      '/meu-ponto',
      '/meus-servicos',
      '/meus-servicos/novo',
      '/meus-documentos',
      '/termos',
      '/cookies',
      '/privacidade',
    ],
    /* As quatro condições valem JUNTAS. Separadas, cada uma tem uma solução preguiçosa que
       satisfaz a letra e destrói o propósito: esconder o banner satisfaz as duas últimas e
       quebra o consentimento; deixá-lo cobrindo tudo satisfaz as duas primeiras. */
    criterioDeAceite: Object.freeze([
      'CONSENT_VISIBLE — o banner aparece para quem ainda não respondeu',
      'CONSENT_USABLE — os dois botões de escolha são clicáveis por hit-test',
      'PAGE_CRITICAL_ACTIONS_VISIBLE — a ação primária da página está inteira na viewport',
      'PAGE_CRITICAL_ACTIONS_INTERACTABLE — o hit-test no centro dela chega nela, não no banner',
    ]),
    naoSatisfaz: 'esconder, atrasar, encolher ou mover o banner sem reservar espaço equivalente',
  },
  {
    id: 'GAP-UX-IDENTIDADE-01',
    titulo: 'Duas identidades visuais dentro da mesma jornada, por lista de exceções incompleta',
    causa:
      'App.jsx:78 — `PUBLIC_SURFACES` tem TRÊS rotas (/privacidade, /termos, /cookies) e mais a ' +
      'Landing sem sessão. Tudo o que sobra entra em `PanelScope` e recebe o violeta Aurora de ' +
      'panel-rollout.css. Só que existem SETE superfícies públicas de autenticação, e nenhuma ' +
      'está na lista: elas herdam a identidade do painel autenticado.',
    evidencia:
      'Landing em ciano (telas/inventario/anonimo__home__1920x1080.jpg) e /login em violeta ' +
      '(telas/inventario-estados/anonimo__login__360x800.jpg), na mesma sessão sem login. O ' +
      'comentário em panel-rollout.css:9 descreve a fronteira pretendida — "a landing e as ' +
      'páginas legais" — e a implementação por lista de rotas não a alcança.',
    severidade: 'MEDIA',
    superficiesAfetadas: [
      '/login',
      'AUTH_CADASTRO',
      '/recuperar-senha',
      '/redefinir-senha',
      '/magic-link',
      '/verificar-email',
      '/convite/:token',
      'HOME_LANDING',
      '/termos',
      '/cookies',
      '/privacidade',
    ],
    criterioDeAceite: Object.freeze([
      'a fronteira é derivada de uma propriedade da superfície (tem sessão? é pública?), e não ' +
        'de uma lista de caminhos que precisa ser lembrada a cada rota nova',
      'atravessar Landing → login → recuperar senha → termos não troca de paleta',
    ]),
  },
  {
    id: 'GAP-UX-NAV-DIFERIDA-01',
    titulo: 'NOTIFICACOES: feature diferida continua alcançável pela navegação',
    causa:
      'config/navigation.js:318 — a entrada de `/configuracao/notificacoes` ficou com ' +
      '`guard: { sempre: true }`, sem `feature: "NOTIFICACOES"`. As duas entradas de /avaliacoes ' +
      'receberam o guard de flag; esta passou batido.',
    evidencia:
      'telas/inventario-func/funcionario__mais__390x844.jpg mostra "Notificações · Alertas e ' +
      'avisos" com chevron no hub do funcionário. A rota está removida por flag em App.jsx, ' +
      'então o toque cai no curinga `*` e leva ao Painel — sem explicação nenhuma.',
    severidade: 'ALTA',
    superficiesAfetadas: ['/mais', '/configuracao/notificacoes'],
    criterioDeAceite: Object.freeze([
      'com a flag desligada, nenhuma entrada de navegação para a feature é renderizada, em ' +
        'nenhum papel e em nenhum viewport',
      'um controle deriva a checagem das rotas diferidas em vez de depender de revisão manual — ' +
        'o furo existiu justamente porque a cobertura foi conferida item a item',
    ]),
    nota:
      'É violação literal de `POST_MVP + USER_REACHABLE = INVALID_RELEASE_STATE`, que é decisão ' +
      'registrada do usuário. Não é matéria de gosto visual e não espera pelo Release Experience.',
  },
  {
    id: 'GAP-UX-A11Y-NOME-01',
    titulo: 'Controles interativos sem nome acessível, em todos os viewports',
    causa:
      'botões de ícone puro (mostrar/ocultar senha, revogar sessão, ações de linha) sem ' +
      '`aria-label` nem texto. Não é problema de layout: aparece igual nos quatro viewports.',
    evidencia:
      'sonda `botaoSemNome`: /configuracao/seguranca 7 · /tecnicos/novo 5 · /trocar-senha 5 · ' +
      'AUTH_CADASTRO 6 · /configuracao/perfil 3 · /materiais 3 · /servicos 2 · /reparticao 2 · ' +
      '/meus-documentos 1 · /magic-link 1.',
    severidade: 'MEDIA',
    superficiesAfetadas: [
      '/configuracao/seguranca',
      '/tecnicos/novo',
      '/trocar-senha',
      'AUTH_CADASTRO',
      '/configuracao/perfil',
      '/materiais',
      '/servicos',
      '/reparticao',
      '/meus-documentos',
      '/magic-link',
      '/redefinir-senha',
      '/recuperar-senha',
      'HOME_DONO',
    ],
    criterioDeAceite: Object.freeze([
      'todo elemento interativo tem nome acessível por texto, aria-label ou title',
      'a sonda reporta `botaoSemNome: 0` nas superfícies do conjunto afetado',
    ]),
  },
  {
    id: 'GAP-UX-ALVO-01',
    titulo: 'Alvos de toque abaixo do mínimo no mobile',
    causa:
      'ícones de ação em 36px e links de rodapé em 16px de altura. O padrão WCAG 2.5.5 e o HIG ' +
      'pedem 44px; abaixo de 40 o erro de toque deixa de ser exceção.',
    evidencia:
      'sonda em 360x800 e 390x844: /materiais 29 · /tecnicos/:id 11 · /login 11 · /tecnicos 10 · ' +
      '/servicos 10 · /meus-servicos 10 · HOME_DONO 9 · /configuracao/seguranca 9 · /estoque 8 · ' +
      'HOME_LANDING 8. Os reincidentes são os mesmos: "Saiba mais" do banner e os links ' +
      'Privacidade/Termos/Cookies do rodapé, presentes em toda tela.',
    severidade: 'MEDIA',
    superficiesAfetadas: [
      '/materiais',
      '/tecnicos/:id',
      '/login',
      '/tecnicos',
      '/servicos',
      '/meus-servicos',
      'HOME_DONO',
      'HOME_FUNCIONARIO',
      '/configuracao/seguranca',
      '/estoque',
      'HOME_LANDING',
      '/meu-ponto',
      '/mais',
      '/ajuda',
      '/configuracao',
      '/configuracao/perfil',
      '/reparticao',
      '/aprovacoes',
      '/tecnicos/novo',
      '/trocar-senha',
      '/meus-documentos',
      '/termos',
      '/cookies',
    ],
    criterioDeAceite: Object.freeze([
      'em 360x800 e 390x844 nenhum elemento interativo mede menos de 44px na menor dimensão',
      'o rodapé legal e o "Saiba mais" do banner entram na correção — são a maior parte da conta',
    ]),
  },
  {
    id: 'GAP-UX-DESKTOP-LARGURA-01',
    titulo: 'Cards de largura fixa truncam o dado principal enquanto sobra metade da tela',
    causa:
      'grades de card com largura fixa que não crescem com a viewport, e dentro do card o nome ' +
      'compete por espaço com badges e botões de ícone — e perde.',
    evidencia:
      'telas/inventario-dono/dono__tecnicos__1440x900.jpg: "Ana Técnica" e "Bruno Campo" viram ' +
      '"An…" e "Br…" em 1440px, com ~55% da viewport vazia. A sonda confirma truncamento em ' +
      '1440 E 1920 para nome, COMISSÃO, PENDENTE, RECEITA LÍQUIDA e COMISSÃO GERADA.',
    severidade: 'ALTA',
    superficiesAfetadas: [
      '/tecnicos',
      '/tecnicos/:id',
      '/servicos/novo',
      '/meus-servicos/novo',
      '/configuracao/seguranca',
      '/reparticao',
    ],
    criterioDeAceite: Object.freeze([
      'em 1440 e 1920 a sonda não reporta truncamento de identificador nem de rótulo de KPI',
      'a largura útil cresce com a viewport, em vez de reservar vazio à direita',
      'alargar não pode ser trocar um desperdício por outro: linha longa demais também é defeito',
    ]),
  },
  {
    id: 'GAP-UX-RODAPE-01',
    titulo: 'Rodapé legal flutua no meio da página quando o conteúdo é curto',
    causa: 'o rodapé segue o fluxo do conteúdo e não é empurrado para a base da viewport.',
    evidencia:
      'visível em /aprovacoes (390), /tecnicos (1440), /reparticao (1440) e /servicos (1440): o ' +
      '"© 2026 AdmAi · Privacidade · Termos · Cookies" aparece logo abaixo do conteúdo e deixa ' +
      'centenas de pixels vazios sob si, o que faz a página parecer inacabada.',
    severidade: 'BAIXA',
    superficiesAfetadas: [
      '/aprovacoes',
      '/tecnicos',
      '/reparticao',
      '/servicos',
      '/estoque',
      '/configuracao',
      '/mais',
    ],
    criterioDeAceite: Object.freeze([
      'com conteúdo curto, o rodapé encosta na base da viewport, sem vazio abaixo dele',
      'com conteúdo longo, o rodapé continua no fim do conteúdo e não vira barra fixa',
    ]),
  },
  {
    id: 'GAP-UX-CONFIG-PROMESSA-01',
    titulo: '/configuracao anuncia "em breve" duas capacidades que já existem',
    causa:
      'Configuracao.jsx:58 e :71 marcam WhatsApp e "Plano e cobrança" com `breve: true` e sem ' +
      '`to`; o clique cai em `toast("Em breve disponível")` (:204). Só que os cards mantêm o ' +
      'chevron ">", ou seja, prometem navegação e depois recusam.',
    evidencia:
      'telas/inventario-dono/dono__configuracao__390x844.jpg mostra o card com chevron. ' +
      '/configuracao/whatsapp existe no router (App.jsx:366), renderiza (h1 "WHATSAPP", 93 ' +
      'palavras) e só é alcançável digitando a URL. `GET /api/billing/status` responde 200 e ' +
      'não há nenhuma tela de cobrança no painel. O TourGuide (:110) mira ' +
      '`a[href="/configuracao/whatsapp"]`, que este hub não renderiza.',
    severidade: 'ALTA',
    superficiesAfetadas: ['/configuracao', '/configuracao/whatsapp', 'TOUR_GUIADO'],
    criterioDeAceite: Object.freeze([
      'WhatsApp deixa de dizer "em breve" e leva a /configuracao/whatsapp',
      'o passo do tour encontra o elemento que ele mira',
      'BILLING: decidir entre construir a superfície ou remover a promessa — as duas exigem ' +
        'decisão de produto, e nenhuma delas é trabalho de experiência visual',
    ]),
    nota:
      'BILLING tem backend montado e verificado em runtime, e ZERO superfície. Isso não é ' +
      '`REFINE` nem `REDESIGN`: é superfície ausente, e por isso vira pergunta de escopo em vez ' +
      'de item de fila de UI.',
  },
  {
    id: 'GAP-UX-CABECALHO-01',
    titulo: 'Superfícies de autenticação sem cabeçalho semântico',
    /* Promovido de cinco achados locais para um compartilhado. Eu os tinha escrito tela a tela,
       o que é exatamente o `REPEATED_CROSS_SURFACE_DEFECT` que este inventário existe para não
       produzir: cinco itens de fila para uma causa e uma correção. */
    causa:
      'os cards de auth compõem o título com classe de tipografia em vez de `<h1>`. O texto ' +
      'aparece grande na tela e não existe na estrutura do documento.',
    evidencia:
      'sonda `cabecalho` vazio em /recuperar-senha, /redefinir-senha, /magic-link, ' +
      '/verificar-email e /convite/:token, nos quatro viewports — enquanto /login, a Landing e ' +
      'todas as telas do painel autenticado devolvem cabeçalho.',
    severidade: 'MEDIA',
    superficiesAfetadas: [
      '/recuperar-senha',
      'AUTH_REDEFINIR_SENHA',
      '/redefinir-senha',
      '/magic-link',
      'AUTH_MAGIC_VERIFICAR',
      '/verificar-email',
      '/convite/:token',
    ],
    criterioDeAceite: Object.freeze([
      'cada uma dessas superfícies tem exatamente um `h1` que nomeia a tarefa da tela',
      'a sonda devolve `cabecalho` não vazio nas sete, nos quatro viewports',
      'não basta trocar a tag: o texto precisa dizer o que a tela faz, e não a marca',
    ]),
  },
  {
    id: 'GAP-LEGAL-MODELO-01',
    titulo:
      'Documentos legais públicos anunciam-se como modelo não validado, com dados de outro produto',
    causa:
      'src/lib/legal.js:7 define `AVISO_MODELO` e o aplica a `politicaPrivacidade` (:12) e a ' +
      '`termosDeUso` (:109). O texto dos dois documentos ainda traz sete campos por preencher — ' +
      '[NOME DA EMPRESA], [CNPJ], [NOME] do encarregado, [180 dias], [90 dias], [valor] e ' +
      '[Detalhe cobrança, cancelamento e reembolso.] — e SEIS ocorrências de ' +
      '`privacidade@barbers-flow.com`, domínio de outro produto, oferecido como o contato de ' +
      'privacidade e do DPO.',
    evidencia:
      'telas/inventario/anonimo__termos__390x844.jpg mostra o aviso em destaque, acima da ' +
      'cláusula 1, para qualquer visitante. A /cookies NÃO é afetada: é página própria ' +
      '(Cookies.jsx), sem aviso e sem o domínio alheio.',
    severidade: 'ALTA',
    superficiesAfetadas: ['/termos', '/privacidade'],
    criterioDeAceite: Object.freeze([
      'nenhum aviso de rascunho interno é renderizado ao público em superfície legal',
      'zero ocorrências de `[` de placeholder e zero de domínio que não seja do AdmAi',
      'controle automático falha se `legal.js` voltar a conter placeholder ou domínio externo',
    ]),
    /* NÃO é trabalho de experiência visual, e não é meu para resolver: nome empresarial, CNPJ, ' +
       encarregado de dados, prazos de retenção e limite de responsabilidade são conteúdo ' +
       jurídico e decisão do usuário. Inventar qualquer um deles seria fabricar dado legal. */
    bloqueio: 'USER_DECISION_REQUIRED',
    nota:
      'O produto está publicado em produção. Enquanto isso durar, a Política de Privacidade ' +
      'aponta o titular dos dados para o e-mail de outro produto, o que sob a LGPD é ' +
      'identificação incorreta de controlador e de encarregado.',
  },
]);

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
    proveniencia: 'MODE_DERIVED',
    featureId: 'ONBOARDING',
    rota: '/login?modo=cadastrar',
    entryPoint: 'aba "cadastrar" em Login.jsx:28, ou link da Landing',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'CATALOGO_MODAIS',
    proveniencia: 'STATE_DERIVED',
    featureId: 'ESTOQUE',
    rota: '/materiais (diálogo)',
    entryPoint: 'CatalogoModais.jsx, aberto de dentro de Materiais',
    papeis: ['dono', 'gestor'],
  },
  {
    surfaceId: 'PRIMEIRO_ACESSO',
    proveniencia: 'STATE_DERIVED',
    featureId: 'ONBOARDING',
    rota: '/ (sobreposição)',
    entryPoint: 'CookieBanner.jsx — primeiro passo de lib/primeiroAcesso.js#superficieAtual',
    papeis: ['dono', 'gestor', 'funcionario'],
  },
  /* `/` NÃO é uma superfície: `App.jsx:52` despacha por papel para quatro telas completamente
     diferentes. Um registry derivado só do router contaria uma e perderia três — incluindo a
     Landing, que é a face pública do produto, e a home do gestor. É o caso mais forte de
     `superfície != rota` no AdmAi. */
  {
    surfaceId: 'HOME_LANDING',
    proveniencia: 'ROLE_DERIVED',
    featureId: 'ONBOARDING',
    rota: '/ (sem sessão)',
    entryPoint: 'App.jsx:54 — `if (!user) return <Landing />`',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'HOME_DONO',
    proveniencia: 'ROLE_DERIVED',
    featureId: 'METRIC_FOUNDATION',
    rota: '/ (papel dono)',
    entryPoint: 'App.jsx:60 — <Dashboard />',
    papeis: ['dono'],
  },
  {
    surfaceId: 'HOME_GESTOR',
    proveniencia: 'ROLE_DERIVED',
    featureId: 'INDICADORES',
    rota: '/ (papel gestor)',
    entryPoint: 'App.jsx:58 — <GestorHome />',
    papeis: ['gestor'],
  },
  {
    surfaceId: 'HOME_FUNCIONARIO',
    proveniencia: 'ROLE_DERIVED',
    featureId: 'PONTO',
    rota: '/ (papel funcionário)',
    entryPoint: 'App.jsx:56 — <MeuPainel />',
    papeis: ['funcionario'],
  },
  /* ── DESCOBERTAS DURANTE A OBSERVAÇÃO, e não antes dela ──────────────────
     As quatro abaixo não estavam em lista nenhuma. Apareceram porque observar exige abrir a
     tela, e abrir revelou que o componente serve mais de uma UI. É o argumento inteiro de
     `SURFACE_IDENTITY != ROUTE_IDENTITY`, e a razão de o inventário não poder ser derivado só
     do router: o router conhece caminhos, não estados. [SCOPE-F2C] */
  {
    surfaceId: 'AUTH_REDEFINIR_SENHA',
    featureId: 'AUTH_LOGIN',
    rota: '/redefinir-senha?token=…',
    entryPoint: 'RecuperarSenha.jsx:19 — `return token ? <TelaRedefinir/> : <TelaRecuperar/>`',
    proveniencia: 'STATE_DERIVED',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'AUTH_MAGIC_VERIFICAR',
    featureId: 'AUTH_LOGIN',
    rota: '/magic-link?token=…',
    entryPoint: 'MagicLink.jsx:10 — `return token ? <TelaVerificar/> : <TelaSolicitar/>`',
    proveniencia: 'STATE_DERIVED',
    papeis: ['anonimo'],
  },
  {
    surfaceId: 'PRIMEIRO_ACESSO_BOAS_VINDAS',
    featureId: 'ONBOARDING',
    rota: '/ (sobreposição, após o consentimento)',
    entryPoint: 'WelcomeCard — segundo passo de lib/primeiroAcesso.js#superficieAtual',
    proveniencia: 'STATE_DERIVED',
    papeis: ['dono', 'gestor', 'funcionario'],
  },
  {
    surfaceId: 'TOUR_GUIADO',
    featureId: 'ONBOARDING',
    rota: '/ (sobreposição, opt-in)',
    entryPoint: 'TourGuide.jsx — aberto por "VER TUTORIAL" na boas-vindas; nunca automático',
    proveniencia: 'STATE_DERIVED',
    papeis: ['dono', 'gestor', 'funcionario'],
  },
]);

/**
 * Classificação declarada por superfície.
 *
 * `NOT_INVENTORIED` é o default honesto: significa "ainda não olhei", e o gate de fechamento de
 * escopo exige zero delas. Não confundir com `KEEP`, que afirma ter olhado e aprovado.
 */
export const CLASSIFICADAS = Object.freeze({
  /* ── Autenticação pública ─────────────────────────────────────────────── */
  '/login': {
    classificacao: 'REFINE',
    razao:
      'Arquitetura correta e composição forte no desktop: painel de valor à esquerda, formulário ' +
      'à direita, abas ENTRAR/CRIAR CONTA, alternância usuário/telefone e login social. Em ' +
      '360x800 o banner corta o botão ENTRAR ao meio e esconde "Esqueci minha senha" e "Entrar ' +
      'sem senha" — quem perdeu a senha encontra a saída obscurecida na porta de entrada do ' +
      'produto. Estrutura permanece; o que muda é reserva de espaço, alvo de toque e a paleta.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'PASS'),
  },
  AUTH_CADASTRO: {
    classificacao: 'REFINE',
    razao:
      'Mesmo componente do login em outro modo, e a primeira tela de todo cliente novo. Em 360 e ' +
      '390 TRÊS campos do formulário e o botão ficam sob o banner; em 1440 o "CRIAR CONTA" ' +
      'também. Seis controles sem nome acessível. Nada disso é problema de concepção: o fluxo ' +
      'está certo e a hierarquia funciona.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'PASS'),
  },
  '/recuperar-senha': {
    classificacao: 'REFINE',
    razao:
      'Card enxuto e objetivo: título, uma frase de explicação, um campo, uma ação, uma saída. ' +
      'Defeito próprio: ~30% do topo em branco antes de o conteúdo começar, num viewport de ' +
      '844px. O cabeçalho ausente virou GAP-UX-CABECALHO-01, compartilhado com outras seis.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  AUTH_REDEFINIR_SENHA: {
    classificacao: 'REFINE',
    razao:
      'Superfície distinta da irmã acima — outro formulário, outro objetivo, mesma rota. O defeito ' +
      'próprio é de transição: /redefinir-senha SEM token cai calado no formulário de PEDIDO, ' +
      'então quem chega por link expirado vê "Recuperar senha" e conclui que errou alguma coisa. ' +
      'Cabeçalho e nome de controle entram nos achados compartilhados.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/redefinir-senha': {
    classificacao: 'REFINE',
    razao:
      'A rota sem token. Renderiza o pedido de link, e é aí que mora o defeito: ela não diz que ' +
      'o token faltou ou expirou. Fora isso, mesma família e mesmos achados compartilhados.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/magic-link': {
    classificacao: 'REFINE',
    razao:
      'Pedido de link mágico. 52 palavras, uma ação, estrutura adequada ao propósito e nenhum ' +
      'defeito próprio: tudo o que tem está em GAP-UX-CABECALHO-01 e GAP-UX-A11Y-NOME-01.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  AUTH_MAGIC_VERIFICAR: {
    classificacao: 'REFINE',
    razao:
      'Estado de verificação do link mágico — tela de espera que vira sucesso ou erro. Observada ' +
      'com token sintético, então o que se viu foi o caminho de falha: 48 palavras, 4 controles. ' +
      'Defeito próprio: falta uma saída explícita para quem chega com link que não vale mais.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/verificar-email': {
    classificacao: 'REFINE',
    razao:
      'Três estados num componente (verificando/ok/erro). 60 palavras, 4 controles, sem defeito de ' +
      'layout. O que a tira de KEEP é a estrutura de documento ausente, registrada em ' +
      'GAP-UX-CABECALHO-01 junto das outras seis telas de auth que têm a mesma causa.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/convite/:token': {
    classificacao: 'REFINE',
    razao:
      'Observada com token inválido — o estado que um convite expirado produz de verdade. 41 ' +
      'palavras e 3 controles. É a porta de entrada de todo funcionário convidado, e o defeito ' +
      'próprio é de conteúdo: não diz com clareza o que aconteceu nem o que fazer em seguida.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/trocar-senha': {
    classificacao: 'REFINE',
    razao:
      'Troca de senha obrigatória, com medidor de força e requisitos marcados — a estrutura está ' +
      'certa. Dois defeitos sérios: em 360 e 390 o campo de senha E o botão "DEFINIR SENHA E ' +
      'ENTRAR" ficam sob o banner, o que trava um passo que o produto torna obrigatório; e cinco ' +
      'controles sem nome acessível.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },

  /* ── Páginas legais ───────────────────────────────────────────────────── */
  '/privacidade': {
    classificacao: 'REFINE',
    razao:
      'CORREÇÃO DE CLASSIFICAÇÃO ANTERIOR. Estava KEEP por legibilidade, que continua verdadeira ' +
      '— e a legibilidade não era a pergunta certa. O documento carrega o mesmo aviso de modelo ' +
      'dos Termos (legal.js:12), sete campos entre colchetes por preencher e seis ocorrências de ' +
      '`privacidade@barbers-flow.com` como contato de privacidade e do encarregado. Numa ' +
      'Política de Privacidade sob LGPD, isso identifica errado o controlador e o DPO. ' +
      'GAP-LEGAL-MODELO-01, bloqueado em decisão do usuário.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/termos': {
    classificacao: 'REFINE',
    razao:
      'A forma está correta: 538 palavras bem tipografadas, seções numeradas, sem truncamento e ' +
      'sem transbordo nos quatro viewports. O que a tira de KEEP é o CONTEÚDO, e só apareceu ' +
      'quando abri a captura em vez de confiar na medida: logo acima da cláusula 1, num quadro ' +
      'de destaque, o produto avisa ao próprio usuário que aquele documento é um modelo não ' +
      'validado por advogado. Registrado em GAP-LEGAL-MODELO-01; depende de decisão do usuário.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/cookies': {
    classificacao: 'KEEP',
    razao:
      'Página própria (Cookies.jsx), e não o template de legal.js — por isso escapa do ' +
      'GAP-LEGAL-MODELO-01. É específica onde as outras são genéricas: nomeia os fornecedores ' +
      'reais (PostHog para analítico, Crisp para suporte), explica cada categoria em uma linha e ' +
      'diz onde mudar a preferência depois. Nada a refinar que altere o que o usuário consegue ' +
      'fazer ou entender.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },

  /* ── Home: uma rota, quatro telas, um despachante ─────────────────────── */
  '/': {
    classificacao: 'KEEP',
    razao:
      'NÃO é uma tela: é o despachante de App.jsx:52, que escolhe entre Landing, Dashboard, ' +
      'GestorHome e MeuPainel conforme sessão e papel. Observado nos quatro papéis, e nos quatro ' +
      'levou à superfície certa. O que há para classificar está nos quatro destinos, cada um ' +
      'inventariado à parte — e é justamente por isso que a rota sozinha não serve como unidade.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('PASS', 'PASS', 'PASS', 'PASS'),
  },
  HOME_LANDING: {
    classificacao: 'REFINE',
    razao:
      'A face pública do produto, e ela se sustenta: herói legível, promessa concreta ("registre ' +
      'serviços pelo WhatsApp"), CTA primário acima da dobra nos QUATRO viewports, secundário ' +
      '"Já tenho conta" ao lado, e blocos de recurso abaixo. A sonda apontou "CRIAR MINHA CONTA" ' +
      'sob a dobra — a captura mostrou que é o CTA de rodapé, e não o principal; medida sozinha ' +
      'teria produzido um achado falso. O que resta é real e menor: 8 alvos abaixo de 40px em ' +
      '390 e o banner cobrindo a primeira fileira de cards.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'PASS'),
  },
  HOME_DONO: {
    classificacao: 'REFINE',
    razao:
      'Observada nos quatro viewports. Hierarquia boa: lucro do período em destaque com margem, ' +
      'depois a grade de KPIs. Três defeitos: rótulos de KPI que quebram em duas linhas ' +
      '("RECEITA LÍQUIDA", "CUSTO MATERIAL") desalinham a base dos valores na mesma fileira; ' +
      'endereços truncados na lista de serviços recentes; e ausência de estado vazio guiado — ' +
      'com empresa nova tudo mostra R$ 0,00 sem dizer o que fazer em seguida.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  HOME_GESTOR: {
    classificacao: 'REFINE',
    razao:
      'Boa tela: operação do dia, filtro de período, quatro KPIs, aprovações pendentes com ' +
      'atalho e presença do time ao vivo. O banner cobre "Presença do time" em 390px — mesmo ' +
      'defeito sistêmico das demais.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  HOME_FUNCIONARIO: {
    classificacao: 'REFINE',
    razao:
      'Observada em 360 e 390 antes e depois das correções GAP-UI-03 e GAP-UI-04. Rótulos e ' +
      'semântica corrigidos; permanece a oclusão pelo banner e a duplicação visual entre ' +
      '"Comissão a receber" e "Total gerado", que hoje só se distinguem pelo texto de apoio.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },

  /* ── Primeiro acesso: três superfícies em sequência ───────────────────── */
  PRIMEIRO_ACESSO: {
    classificacao: 'REFINE',
    razao:
      'O passo de consentimento. Ele funciona: aparece, é legível, tem as duas escolhas ' +
      'separadas e um link para saber mais. É também a causa única do achado mais espalhado do ' +
      'inventário — cobre conteúdo em 35 superfícies porque é fixo e não reserva espaço. REFINE, ' +
      'e não REDESIGN: o que precisa mudar é o encaixe no layout, não a tela.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  PRIMEIRO_ACESSO_BOAS_VINDAS: {
    classificacao: 'KEEP',
    razao:
      'Card de boas-vindas com três passos nomeados, ação primária ("VER TUTORIAL") e saída ' +
      'clara ("Dispensar" e X). Só aparece depois de o consentimento ser respondido — a ' +
      'sequência de primeiroAcesso.js está correta e não empilha duas sobreposições. Com o ' +
      'banner fora do caminho, a navegação inferior fica inteira: esta tela é a contraprova de ' +
      'que a oclusão vem do consentimento e não do layout.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('PASS', 'PASS', 'PASS', 'PASS'),
  },
  TOUR_GUIADO: {
    classificacao: 'REFINE',
    razao:
      'Passo 1 de 7 observado: título, explicação, contador de progresso, Voltar/Próximo, X e ' +
      'fundo escurecido. Nunca inicia sozinho, o que preserva a correção de GAP-UI-02. Dois ' +
      'defeitos: "Voltar" fica habilitado no primeiro passo, e um passo mira ' +
      '`a[href="/configuracao/whatsapp"]` (TourGuide.jsx:111) — link que /configuracao não ' +
      'renderiza, porque marca WhatsApp como "em breve".',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },

  /* ── Serviços ─────────────────────────────────────────────────────────── */
  '/servicos': {
    classificacao: 'REFINE',
    razao:
      'Tela-carro-chefe e das melhores: título com contagem, ação primária no canto superior ' +
      'direito, dois campos de busca, filtros por local em chips e uma lista limpa com técnico, ' +
      'endereço, estado, descrição, data e valor líquido. Dois defeitos próprios: os dois campos ' +
      'de busca empilhados em largura total consomem ~200px verticais acima de uma lista de três ' +
      'itens, e a descrição trunca no mobile. Observação registrada sem conclusão: o cabeçalho ' +
      'diz "3 registros" e o seed criou cinco — pode ser filtro padrão legítimo, e não foi ' +
      'investigado por estar fora do escopo do inventário.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/servicos/novo': {
    classificacao: 'REFINE',
    razao:
      'Assistente de 4 etapas com ação primária única e obrigatórios marcados — a estrutura está ' +
      'certa. O defeito é densidade em desktop: em 1568px a coluna útil fica em ~520px e o ' +
      'restante do viewport vazio. Corrigir alargando seria trocar um desperdício por outro; as ' +
      'etapas podem conviver em paralelo em telas largas.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/meus-servicos': {
    classificacao: 'REFINE',
    razao:
      'Lista do técnico. Em 360 o "INICIAR SERVIÇO" — a ação que ele executa em campo, de pé, ' +
      'com uma mão — fica sob o banner. Em 1440 e 1920 as descrições truncam. Dez alvos abaixo ' +
      'de 40px no mobile, que é o único lugar onde esta tela é usada de verdade.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/meus-servicos/novo': {
    classificacao: 'REFINE',
    razao:
      'Observada nos quatro viewports. Mesma densidade do formulário do gestor: em 1920px o ' +
      'formulário usa ~640px e deixa 60% da tela vazia. O fluxo em si é adequado ao uso em ' +
      'campo, que é mobile.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/aprovacoes': {
    classificacao: 'KEEP',
    razao:
      'Estado vazio exemplar: ícone, "Nenhum serviço aguardando aprovação" e a frase que explica ' +
      'quando algo vai aparecer ali. Título, subtítulo e volta. Observada como dono e como ' +
      'gestor, nos quatro viewports. Os defeitos que tem são todos compartilhados; nenhuma ' +
      'mudança específica desta tela melhoraria o resultado de alguém.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },

  /* ── Equipe ───────────────────────────────────────────────────────────── */
  '/tecnicos': {
    classificacao: 'REDESIGN',
    razao:
      'A única REDESIGN do inventário, e por medida, não por gosto. Em 1440px os nomes aparecem ' +
      'como "An…" e "Br…" com ~55% da viewport vazia: o card tem largura fixa e, dentro dele, o ' +
      'nome perde espaço para dois badges e dois botões de ícone. Os rótulos COMISSÃO e PENDENTE ' +
      'truncam junto, em 1440 E 1920. Numa tela cuja função é identificar pessoas, o ' +
      'identificador é o que se perde primeiro — isso é arranjo errado, e mexer em espaçamento ' +
      'não conserta. Some-se o "+" coberto pelo banner nos quatro viewports.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/tecnicos/novo': {
    classificacao: 'REFINE',
    razao:
      'Formulário de cadastro em etapas. Em 360 "Cancelar" e "PRÓXIMO" ficam sob o banner, o que ' +
      'interrompe o fluxo no ponto de avançar. Cinco controles sem nome acessível. A estrutura ' +
      'do formulário está adequada.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/tecnicos/:id': {
    classificacao: 'REFINE',
    razao:
      'Perfil com período (SEMANA/MÊS/CUSTOM), KPIs e histórico. Observada com técnico real ' +
      '(id 7). "REGISTRAR PAGAMENTO" — a ação financeira da tela — fica sob o banner em 360 e ' +
      '390. RECEITA LÍQUIDA e COMISSÃO GERADA truncam. Onze alvos abaixo de 40px no mobile.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'ISSUE'),
  },
  '/reparticao': {
    classificacao: 'KEEP',
    razao:
      'Fechamento por técnico. Datas já preenchidas, uma ação ("CALCULAR") e um estado vazio que ' +
      'ensina em vez de só informar: "Selecione o período — defina as datas de início e fim e ' +
      'clique em Calcular". A crítica possível é de eixo (o card do formulário alinha à esquerda ' +
      'e o estado vazio centraliza no espaço total), pequena demais para justificar retrabalho.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },

  /* ── Recursos ─────────────────────────────────────────────────────────── */
  '/materiais': {
    classificacao: 'REFINE',
    razao:
      'Catálogo bem resolvido: um card por material com nome, unidade, preço, saldo (em vermelho ' +
      'quando baixo), editar/excluir e a fileira Entrada/Saída/Ajuste/histórico. O defeito ' +
      'visível e repetido é o glifo de IMAGEM QUEBRADA em cada linha — o slot de miniatura sem ' +
      'imagem exibe o ícone de erro do navegador em vez de um espaço neutro. Some-se o maior ' +
      'número de alvos pequenos do inventário (29 no mobile), consequência de 37 controles numa ' +
      'tela de telefone.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  CATALOGO_MODAIS: {
    classificacao: 'KEEP',
    razao:
      'Observada abrindo o diálogo de Entrada pelo produto. Título que diz o que vai acontecer, ' +
      'linha de contexto com o saldo atual ("Chave Codificada · saldo atual 8 un"), campos ' +
      'rotulados com o opcional marcado como opcional, Cancelar e ADICIONAR com ênfase correta, ' +
      'X para sair. Vira folha inferior no mobile e caixa central no desktop. Empilha acima do ' +
      'banner, então não sofre a oclusão que atinge o resto.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('PASS', 'PASS', 'PASS', 'PASS'),
  },
  '/estoque': {
    classificacao: 'KEEP',
    razao:
      'Alerta de reposição no topo ("1 material com alerta de reposição"), depois cards com ' +
      'saldo, consumo e estado explícito (Repor / OK · mín N un). Grade de três colunas que usa ' +
      'a largura do desktop — contraste direto com /tecnicos, que não usa. Legível nos quatro ' +
      'viewports, sem truncamento.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },

  /* ── Ponto e documentos ───────────────────────────────────────────────── */
  '/meu-ponto': {
    classificacao: 'KEEP',
    razao:
      'A melhor superfície observada no inventário. Diz o estado atual ("Próximo: Saída para o ' +
      'almoço"), mostra a jornada como linha do tempo com concluído/próximo/pendente, oferece ' +
      'UMA ação que nomeia exatamente a próxima batida, avisa sobre selfie e localização com ' +
      'link para a política, e lista as batidas do dia. Alvo de toque generoso, pensada para o ' +
      'telefone. A duplicação de "Entrada 14:30" em dois blocos é o único reparo possível.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/meus-documentos': {
    classificacao: 'REFINE',
    razao:
      'Envio de documentos do técnico, com estado vazio presente. "Escolher arquivo" trunca em ' +
      '360 e há um controle sem nome acessível nos quatro viewports. Vale registrar que a ' +
      'feature está BLOCKED_EXTERNAL por bucket ausente em produção: a superfície foi observada ' +
      'em ambiente local, e isso não altera o bloqueio nem o antecipa.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },

  /* ── Navegação e ajuda ────────────────────────────────────────────────── */
  '/mais': {
    classificacao: 'REFINE',
    razao:
      'Hub de navegação do mobile, agrupado por seção, com ícone, título, descrição e chevron em ' +
      'cada item — legível e previsível. Mas é onde o inventário achou o vazamento de release: ' +
      'renderiza "Notificações · Alertas e avisos" para o funcionário, e NOTIFICACOES está ' +
      'diferida por decisão do usuário. O toque não abre nada: a rota está removida por flag e o ' +
      'curinga devolve o usuário ao Painel, calado. REFINE pela correção do guard, não por ' +
      'aparência — a tela em si está bem construída.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/ajuda': {
    classificacao: 'REFINE',
    razao:
      'Guia "COMO USAR" com 196 palavras e cartões por tema, mais canais de contato. Único caso ' +
      'do inventário em que o banner cobre conteúdo TAMBÉM em 1440 e 1920 (os cartões de ' +
      'Notificações e o botão CHAT), porque a página é longa o bastante para haver conteúdo sob ' +
      'ele no desktop. Conteúdo e organização estão adequados.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },

  /* ── Configurações: sete superfícies, sete julgamentos ────────────────── */
  '/configuracao': {
    classificacao: 'REFINE',
    razao:
      'Hub bem organizado — OPERAÇÃO (com o interruptor de exigir aprovação, que comanda o fluxo ' +
      'inteiro de aprovações), CONTA, INTEGRAÇÕES, PLANO. O defeito é de promessa: WhatsApp e ' +
      '"Plano e cobrança" exibem chevron de navegação, dizem "em breve" e respondem ao toque com ' +
      'um aviso. WhatsApp existe, renderiza e só é alcançável digitando a URL; cobrança tem API ' +
      'respondendo 200 e nenhuma tela. Convidar o clique para depois recusá-lo é pior que não ' +
      'convidar.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/configuracao/perfil': {
    classificacao: 'REFINE',
    razao:
      'Dados da conta: nome, e-mail, telefone. 56 palavras, 15 controles, uma tela em todos os ' +
      'viewports. Três controles sem nome acessível. Sem defeito de estrutura.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/configuracao/seguranca': {
    classificacao: 'REFINE',
    razao:
      'Três blocos corretos — troca de senha, 2FA com interruptor, sessões ativas. Dois defeitos ' +
      'próprios. (1) A lista de sessões mostra strings técnicas cruas: "curl/8.19.0", "::1", ' +
      '"::ffff:127.0.0.1". Numa tela em que o usuário precisa decidir "esta sessão é minha?", ' +
      'user-agent e IPv6 sem tradução não permitem decidir. (2) Em 1440 a coluna útil fica em ' +
      '~540px de 1185 disponíveis, com os três blocos empilhados e metade da tela vazia. Sete ' +
      'controles sem nome acessível, o maior número do inventário. Nota de método: as entradas ' +
      '"curl" são artefato das MINHAS chamadas de verificação, não sujeira do produto.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'ISSUE', 'ISSUE'),
  },
  '/configuracao/whatsapp': {
    classificacao: 'REFINE',
    razao:
      'A tela existe e funciona (93 palavras, 11 controles, uma tela em todos os viewports), e ' +
      'está órfã: nada na navegação leva até ela, porque o hub a anuncia como "em breve". Foi ' +
      'alcançada por URL direta. O reparo é de ligação, não de layout — a superfície em si não ' +
      'apresentou defeito próprio além dos compartilhados.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/configuracao/usuarios': {
    classificacao: 'KEEP',
    razao:
      'Observada em 1440 com três contas reais. Lista clara, papel e vínculo visíveis por linha, ' +
      'ações de acesso e remoção ao lado de cada conta, estado ativo explícito. Nenhum problema ' +
      'de hierarquia, densidade ou clareza identificado — e é a superfície que a decisão de ' +
      'escopo manteve no release por sustentar RBAC.',
    observado: 'OBSERVED',
    evidencia: 'SONDA_E_CAPTURA',
    viewports: vp('ISSUE', 'ISSUE', 'PASS', 'PASS'),
  },
  '/configuracao/estoque': {
    classificacao: 'KEEP',
    razao:
      'Não é tela: é <Navigate to="/estoque" replace /> em App.jsx:376. Não tem UI própria para ' +
      'refinar; existe para não quebrar link antigo.',
    observado: 'NA',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },
  '/configuracao/catalogo': {
    classificacao: 'KEEP',
    razao: 'Não é tela: é <Navigate to="/materiais" replace /> em App.jsx:377. Mesma natureza.',
    observado: 'NA',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },
  '/configuracao/notificacoes': {
    classificacao: 'KEEP',
    razao:
      'DIFERIDA (NOTIFICACOES). A rota está removida por flag e o deep-link não alcança. Fora do ' +
      'escopo de experiência deste release — mas o ponto de entrada NÃO foi removido junto, e ' +
      'isso está registrado em GAP-UX-NAV-DIFERIDA-01. KEEP aqui significa "não recebe trabalho ' +
      'de UI"; não significa que o estado de release esteja correto.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },

  /* ── Diferidas: fora deste release ────────────────────────────────────── */
  '/avaliacoes': {
    classificacao: 'KEEP',
    razao:
      'DIFERIDA (GOOGLE_REVIEWS). Verificado em runtime que a rota não existe com a flag ' +
      'desligada e que o item sumiu da navegação. Não recebe trabalho de experiência neste ' +
      'release; quando voltar, será reclassificada.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },
  '/metricas/faturamento-liquido': {
    classificacao: 'KEEP',
    razao:
      'DIFERIDA (METRIC_HUBS). Rota sob flag desligada e `hubEm` removido do KpiCard, então nem ' +
      'o card do dashboard leva até ela.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },
  '/metricas/servicos-concluidos': {
    classificacao: 'KEEP',
    razao: 'DIFERIDA (METRIC_HUBS). Mesma condição da irmã acima.',
    observado: 'OBSERVED',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },

  /* ── Curinga ──────────────────────────────────────────────────────────── */
  '*': {
    classificacao: 'KEEP',
    razao:
      'Curinga que redireciona para "/". Sem UI. Observado indiretamente, e o inventário mostrou ' +
      'que ele tem efeito colateral: é por aqui que o toque em "Notificações" no /mais termina ' +
      'no Painel sem explicação. O reparo pertence ao guard da navegação, não ao curinga.',
    observado: 'NA',
    evidencia: 'SONDA',
    viewports: TODOS_NA,
  },
});

/** Junta rotas e superfícies sem rota num inventário único. */
export function inventario(arquivo = APP) {
  const doRouter = rotasDoRouter(arquivo).map((r) => ({
    surfaceId: r.rota,
    featureId: null,
    ...r,
    origem: 'ROUTER',
    /* Derivada, não declarada: saiu de um `path=` que o parser leu de App.jsx agora. */
    proveniencia: 'ROUTER_DERIVED',
  }));
  const semRota = SUPERFICIES_SEM_ROTA.map((s) => ({
    ...s,
    origem: 'DECLARADA',
  }));
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
    [
      'toda rota do router entra no inventário',
      rotas.length === (fonte.match(/path="/g) ?? []).length,
    ],
    [
      'nenhuma classificação aponta para rota inexistente',
      Object.keys(CLASSIFICADAS).every(
        (k) => idsDoRouter.has(k) || SUPERFICIES_SEM_ROTA.some((s) => s.surfaceId === k)
      ),
    ],
    [
      'Cadastro está no inventário, e não é rota',
      inv.some((s) => s.surfaceId === 'AUTH_CADASTRO' && s.origem === 'DECLARADA'),
    ],
    ['Login está no inventário', inv.some((s) => s.surfaceId === '/login')],
    [
      'toda classificação declarada pertence à taxonomia',
      inv.every((s) => CLASSIFICACOES.includes(s.classificacao)),
    ],
    /* A regra que impede `KEEP` de virar sinônimo de "não olhei". */
    [
      'classificação diferente de NOT_INVENTORIED exige razão escrita',
      inv.every((s) => s.classificacao === 'NOT_INVENTORIED' || (s.razao ?? '').trim().length > 10),
    ],
    /* `NA` afirma que NÃO HÁ o que observar, e só se sustenta para redirect — que não tem UI.
       Aceitá-lo aqui é necessário; a defesa contra abuso é a `razao`, que precisa dizer por quê,
       e um humano lendo "não é tela" sobre uma página de verdade percebe na hora. */
    [
      'classificação decidida exige observação de runtime (ou NA justificado)',
      inv.every(
        (s) => s.classificacao === 'NOT_INVENTORIED' || ['OBSERVED', 'NA'].includes(s.observado)
      ),
    ],
    /* Contraparte: `NA` em superfície que declara componente de página é suspeito — redirect usa
       `<Navigate>`, e é o único caso legítimo. */
    [
      'NA só em superfície sem página própria',
      inv
        .filter((s) => s.observado === 'NA')
        .every((s) => !s.componente || s.componente === 'Navigate'),
    ],

    /* ── Proveniência: separa o que foi derivado do que foi afirmado ─────── */
    [
      'toda superfície declara proveniência da taxonomia',
      inv.every((s) => PROVENIENCIAS.includes(s.proveniencia)),
    ],
    /* Superfície declarada à mão sem `entryPoint` é folclore: ninguém consegue conferir depois
       se ela existe mesmo, e o registry começa a divergir do produto em silêncio. */
    [
      'superfície declarada aponta arquivo ou linha que prova que existe',
      inv.filter((s) => s.origem === 'DECLARADA').every((s) => (s.entryPoint ?? '').length > 12),
    ],

    /* ── Cobertura por viewport: PASS e NOT_OBSERVED não são a mesma coisa ─ */
    [
      'toda classificação cobre os quatro viewports com estado válido',
      inv
        .filter((s) => s.classificacao !== 'NOT_INVENTORIED')
        .every(
          (s) =>
            s.viewports &&
            VIEWPORTS_OBSERVADOS.every((v) => ESTADOS_VIEWPORT.includes(s.viewports[v]))
        ),
    ],
    [
      'nenhuma superfície classificada tem viewport NOT_OBSERVED',
      inv
        .filter((s) => s.classificacao !== 'NOT_INVENTORIED')
        .every((s) => VIEWPORTS_OBSERVADOS.every((v) => s.viewports?.[v] !== 'NOT_OBSERVED')),
    ],

    /* ── O controle que me obriga a olhar, e não só a medir ──────────────
       `KEEP` afirma "analisei e nada muda". A sonda mede oclusão, transbordo e alvo de toque;
       ela não vê hierarquia, densidade nem clareza — que é onde mora quase todo motivo real de
       refinar. Então `KEEP` sobre superfície que existe de verdade exige captura VISTA.
       Este controle já pagou: /termos e /privacidade estavam KEEP só com medida, e a captura
       mostrou um aviso de "modelo não validado por advogado" servido ao público. */
    [
      'KEEP sobre superfície real exige captura vista, não só sonda',
      inv
        .filter(
          (s) =>
            s.classificacao === 'KEEP' &&
            VIEWPORTS_OBSERVADOS.some((v) => s.viewports?.[v] !== 'NOT_APPLICABLE')
        )
        .every((s) => s.evidencia === 'SONDA_E_CAPTURA'),
    ],
    [
      'toda classificação declara o tipo de evidência',
      inv
        .filter((s) => s.classificacao !== 'NOT_INVENTORIED')
        .every((s) => EVIDENCIAS.includes(s.evidencia)),
    ],

    /* ── Achados compartilhados ──────────────────────────────────────────
       Verificação BIDIRECIONAL: achado que aponta para superfície inexistente é registro
       envelhecido, e é o jeito mais comum de um inventário virar ficção. */
    [
      'todo achado compartilhado aponta só para superfícies do inventário',
      ACHADOS_COMPARTILHADOS.every((a) =>
        a.superficiesAfetadas.every((id) => inv.some((s) => s.surfaceId === id))
      ),
    ],
    /* Causa que atinge uma superfície só é achado LOCAL. Promovê-la a compartilhada inflaria o
       número que deveria medir sistemicidade. */
    [
      'achado compartilhado afeta duas ou mais superfícies',
      ACHADOS_COMPARTILHADOS.every((a) => a.superficiesAfetadas.length >= 2),
    ],
    [
      'todo achado compartilhado tem critério de aceite escrito',
      ACHADOS_COMPARTILHADOS.every((a) => (a.criterioDeAceite ?? []).length > 0),
    ],
    /* As quatro condições de GAP-UX-CONSENT-01 valem JUNTAS. Separadas, cada uma tem uma saída
       preguiçosa: esconder o banner satisfaz as duas de baixo e destrói o consentimento. */
    [
      'GAP-UX-CONSENT-01 exige consentimento E ação da página, simultâneos',
      (() => {
        const a = ACHADOS_COMPARTILHADOS.find((x) => x.id === 'GAP-UX-CONSENT-01');
        const t = (a?.criterioDeAceite ?? []).join(' ');
        return [
          'CONSENT_VISIBLE',
          'CONSENT_USABLE',
          'PAGE_CRITICAL_ACTIONS_VISIBLE',
          'PAGE_CRITICAL_ACTIONS_INTERACTABLE',
        ].every((c) => t.includes(c));
      })(),
    ],
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

  const simples = escrever(
    'a.jsx',
    `
          <Route
            path="/servicos"
            element={<RequireAuth><Layout><Servicos /></Layout></RequireAuth>}
          />
`
  );
  const [r1] = rotasDoRouter(simples);

  const comPermissao = escrever(
    'b.jsx',
    `
          <Route
            path="/reparticao"
            element={<RequireAuth><RequirePermissao modulo="financeiro" acao="ver"><Layout><Reparticao /></Layout></RequirePermissao></RequireAuth>}
          />
`
  );
  const [r2] = rotasDoRouter(comPermissao);

  const comFlag = escrever(
    'c.jsx',
    `
          {featureAtiva('GOOGLE_REVIEWS') && (
            <Route
              path="/avaliacoes"
              element={<RequireAuth><Layout><Avaliacoes /></Layout></RequireAuth>}
            />
          )}
`
  );
  const [r3] = rotasDoRouter(comFlag);

  const publica = escrever(
    'd.jsx',
    `
          <Route path="/privacidade" element={<PaginaLegal doc="privacidade" />} />
`
  );
  const [r4] = rotasDoRouter(publica);

  const duas = escrever(
    'e.jsx',
    readFileSync(simples, 'utf8') + readFileSync(simples, 'utf8').replace('/servicos', '/nova-tela')
  );
  const invDuas = inventario(duas);

  return [
    ['parser lê caminho e componente', r1?.rota === '/servicos' && r1?.componente === 'Servicos'],
    ['parser lê a guarda de autenticação', r1?.exigeAuth === true],
    ['parser lê o módulo de RequirePermissao', r2?.permissao === 'financeiro'],
    /* Sem isto, rota diferida entraria no inventário como se fosse do release. */
    ['parser reconhece rota sob feature flag', r3?.flag === 'GOOGLE_REVIEWS'],
    ['CONTRAPROVA: rota pública não é marcada como autenticada', r4?.exigeAuth === false],
    /* A propriedade que lista manual não tem: o produto cresce e o inventário cresce junto. */
    [
      'rota nova aparece sem ninguém editar lista',
      invDuas.some((s) => s.surfaceId === '/nova-tela' && s.classificacao === 'NOT_INVENTORIED'),
    ],
    [
      'Cadastro entra no inventário mesmo NÃO sendo rota',
      invDuas.some((s) => s.surfaceId === 'AUTH_CADASTRO' && s.origem === 'DECLARADA'),
    ],
    [
      'NOT_INVENTORIED é estado da taxonomia, não ausência de campo',
      CLASSIFICACOES.includes('NOT_INVENTORIED'),
    ],
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
  console.log(
    `  superfícies : ${inv.length}  (${inv.filter((s) => s.origem === 'ROUTER').length} do router, ${inv.filter((s) => s.origem === 'DECLARADA').length} declaradas)`
  );
  for (const [k, v] of Object.entries(porClasse)) console.log(`  ${k.padEnd(16)}: ${v}`);
  console.log('');

  /* PROVENIÊNCIA. Um inventário derivado e um inventário decorado têm a mesma aparência num
     relatório que só conta superfícies — e envelhecem de maneiras opostas. */
  const porProv = {};
  for (const s of inv) porProv[s.proveniencia] = (porProv[s.proveniencia] ?? 0) + 1;
  console.log('  proveniência :');
  for (const [k, v] of Object.entries(porProv)) console.log(`    ${k.padEnd(24)} ${v}`);

  /* COBERTURA POR VIEWPORT. O que importa aqui não é a taxa de PASS — é a de NOT_OBSERVED, que
     precisa ser zero. ISSUE é conhecimento; NOT_OBSERVED é ignorância registrada. */
  console.log('');
  console.log('  cobertura por viewport :');
  for (const v of VIEWPORTS_OBSERVADOS) {
    const c = { PASS: 0, ISSUE: 0, NOT_APPLICABLE: 0, NOT_OBSERVED: 0 };
    for (const s of inv) c[s.viewports?.[v] ?? 'NOT_OBSERVED']++;
    console.log(
      `    ${v.padEnd(11)} PASS ${String(c.PASS).padStart(2)} · ISSUE ${String(c.ISSUE).padStart(2)} · NA ${String(c.NOT_APPLICABLE).padStart(2)} · NÃO OBSERVADO ${c.NOT_OBSERVED}`
    );
  }

  /* PAPÉIS. `SURFACE_IDENTITY != ROUTE_IDENTITY` só é verdade se os papéis forem contados. */
  console.log('');
  const papeis = ['anonimo', 'dono', 'gestor', 'funcionario'];
  console.log('  papéis observados : ' + papeis.join(' · '));

  /* EVIDÊNCIA. Quantas classificações têm olho por trás, e não só medida. */
  const comCaptura = inv.filter((s) => s.evidencia === 'SONDA_E_CAPTURA').length;
  console.log(
    `  evidência : ${comCaptura} com captura vista · ${inv.length - comCaptura} só com sonda`
  );

  /* ACHADOS. Um por causa, com o conjunto de superfícies que a causa atinge. */
  console.log('');
  console.log(`  achados compartilhados : ${ACHADOS_COMPARTILHADOS.length}`);
  for (const a of ACHADOS_COMPARTILHADOS) {
    const bloq = a.bloqueio ? `  [${a.bloqueio}]` : '';
    console.log(
      `    ${a.severidade.padEnd(6)} ${a.id.padEnd(26)} ${String(a.superficiesAfetadas.length).padStart(2)} superfícies${bloq}`
    );
  }

  console.log('');
  console.log(`  controles : ${casos.length - falhos.length}/${casos.length}`);
  for (const f of falhos) console.log(`    FAIL  ${f}`);
  console.log('');
  console.log(
    '  ZERO_UNCLASSIFIED_RUNTIME_SURFACES : ' +
      (porClasse.NOT_INVENTORIED ? `NÃO — ${porClasse.NOT_INVENTORIED} sem classificação` : 'sim')
  );
  return falhos.length === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1].endsWith('surface-registry.mjs')) {
  process.exit(executar());
}
