/**
 * Ordem das superfícies de primeiro acesso.  [GAP-UI-02]
 *
 * O QUE ESTAVA ERRADO
 *   Três superfícies decidiam sozinhas se apareciam, cada uma lendo a própria chave:
 *     `CookieBanner`  (App.jsx)        — enquanto `admai_cookies_consent` for null
 *     `WelcomeCard`   (Dashboard.jsx)  — enquanto `admai_welcome_seen` for null
 *     tour            (Dashboard.jsx)  — auto-start após 600ms, se `admai_tour_done` for null
 *
 *   Na primeira visita ao Painel as três condições são verdadeiras ao mesmo tempo, e ninguém
 *   coordena. Em 390px o produto ficava inteiramente coberto; em 1920 o modal do tour caía em
 *   cima dos KPIs que ele estava tentando explicar.
 *
 *   Não é problema de empilhamento. Subir o z-index de uma escolhe qual das três vence — todas
 *   continuam disparando, e o usuário segue com três coisas para fechar antes de usar o produto.
 *
 * A DUPLICAÇÃO, que é o achado mais interessante
 *   O botão principal do `WelcomeCard` é "VER TUTORIAL", que inicia o tour. E o tour já estava se
 *   iniciando sozinho. O card oferecia uma ação que acontecia de qualquer jeito — então ou o
 *   botão era inútil, ou o auto-start era. São o mesmo propósito em duas embalagens.
 *
 * A SEQUÊNCIA ADOTADA
 *   1. CONSENTIMENTO primeiro, sozinho. É a única das três que tem peso legal, e decidir sobre
 *      rastreamento no meio de um tour guiado não é decidir — é clicar para o pop-up sair.
 *   2. BOAS-VINDAS depois, e só depois. Inline, dispensável, não bloqueia leitura.
 *   3. TOUR só por pedido explícito. Sem auto-start: quem dispensou as boas-vindas já disse que
 *      não quer onboarding agora, e abrir o tour em seguida seria ignorar a resposta.
 *
 *   O tour continua alcançável pelo card e por Ajuda. O que sai é a interrupção, não o recurso.
 *
 * Este módulo é a ÚNICA fonte da ordem. Espalhar a regra pelos componentes foi o que produziu o
 * defeito: cada um estava certo isoladamente e o conjunto não.
 */

export const CHAVE_CONSENTIMENTO = 'admai_cookies_consent';
export const CHAVE_BOAS_VINDAS = 'admai_welcome_seen';
export const CHAVE_TOUR = 'admai_tour_done';

/** Evento disparado quando o consentimento muda, para as demais superfícies reavaliarem. */
export const EVENTO_MUDOU = 'admai:primeiro-acesso';

function lido(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    /* Modo privado: sem storage, trata como "já visto" para não insistir a cada carga. */
    return '1';
  }
}

/**
 * Qual superfície pode aparecer AGORA — no máximo uma.
 *
 * @returns {'consentimento'|'boas-vindas'|'nenhuma'}
 */
export function superficieAtual() {
  if (lido(CHAVE_CONSENTIMENTO) === null) return 'consentimento';
  if (lido(CHAVE_BOAS_VINDAS) === null) return 'boas-vindas';
  return 'nenhuma';
}

/** O tour nunca é automático. Existe para quem pedir. */
export function tourPodeAutoIniciar() {
  return false;
}

/** Notifica as superfícies montadas de que o estado mudou (consentimento dado, card dispensado). */
export function avisarMudanca() {
  try {
    window.dispatchEvent(new Event(EVENTO_MUDOU));
  } catch {
    /* Ambiente sem window (SSR/teste de nó): nada a notificar. */
  }
}
