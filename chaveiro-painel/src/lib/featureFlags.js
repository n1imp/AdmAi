/**
 * Quais capacidades entram NESTE release.  [SCOPE-F3]
 *
 * POR QUE EXISTE
 *   Três features classificadas POST_MVP estavam totalmente alcançáveis: `/metricas/*`,
 *   `/avaliacoes` e `/configuracao/notificacoes` tinham apenas guarda de autenticação e permissão,
 *   nenhuma flag. Qualquer usuário com o papel certo chegava nelas.
 *
 *   A regra do escopo é literal: `POST_MVP + USER_REACHABLE = INVALID_RELEASE_STATE`. Não basta
 *   sumir com o link — precisa cobrir navegação, rota, ponto de entrada e deep-link. Um item de
 *   menu escondido com a rota viva continua a um `Ctrl+L` de distância.
 *
 * O QUE ESTE MÓDULO NÃO É
 *   Não é remoção. O código das três continua no repositório, testado, pronto para voltar virando
 *   uma variável. Apagar implementação para "tirar do release" trocaria uma decisão reversível por
 *   uma irreversível — e a decisão foi adiar, não descartar.
 *
 *   Também não é segurança. Autorização continua no backend; isto decide o que o produto OFERECE,
 *   não o que ele permite.
 *
 * PADRÃO DE LEITURA
 *   `import.meta.env.VITE_*`, como `monitoring.js` e `crispBootstrap.js` já fazem. O Vite substitui
 *   no build, então a flag desligada some do bundle em vez de virar um `if` em tempo de execução.
 *
 * DEFAULT FECHADO
 *   Ausência de variável = desligado. O contrário faria uma feature diferida voltar ao ar por
 *   esquecimento de configuração — exatamente o estado inválido que este módulo existe para
 *   impedir, e sem ninguém perceber.
 */

/** Lê uma flag tratando só `'true'` como ligado. Qualquer outra coisa, inclusive ausência, é não. */
function ligada(valor) {
  return valor === 'true';
}

export const FLAGS = Object.freeze({
  /* Diferidas por decisão de escopo. Runtime PASS não promove P2 a MVP. */
  METRIC_HUBS: ligada(import.meta.env.VITE_FEATURE_METRIC_HUBS),
  GOOGLE_REVIEWS: ligada(import.meta.env.VITE_FEATURE_GOOGLE_REVIEWS),
  NOTIFICACOES: ligada(import.meta.env.VITE_FEATURE_NOTIFICACOES),
  /* [D2 amendment] WhatsApp e SUPERINTEGRATION POST_MVP: fora dos acceptance requirements do
     release. OFF por padrao — a implementacao existe atras deste flag. */
  WHATSAPP: ligada(import.meta.env.VITE_FEATURE_WHATSAPP),
  /* [D2 Refoundation Cycle 1, 2026-08-28] Assinaturas pagas/Stripe SAIRAM do MVP. A pagina,
     o card de Plano e o redirect 402 vivem atras desta flag; a implementacao (frontend e
     backend) fica preservada intacta para o futuro ciclo comercial. */
  SUBSCRIPTIONS_BILLING: ligada(import.meta.env.VITE_FEATURE_SUBSCRIPTIONS_BILLING),
});

/** @param {keyof typeof FLAGS} nome */
export function featureAtiva(nome) {
  /* Nome desconhecido devolve `true`: só quem foi DIFERIDO precisa de flag, e tratar o resto como
     desligado apagaria o produto inteiro ao primeiro erro de digitação. */
  return nome in FLAGS ? FLAGS[nome] : true;
}
