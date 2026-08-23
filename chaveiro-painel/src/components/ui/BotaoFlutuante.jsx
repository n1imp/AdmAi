/**
 * Botão de ação flutuante — e o dono comum que ele não tinha.  [GAP-UX-CONSENT-01]
 *
 * POR QUE EXISTE
 *   `Tecnicos.jsx`, `Catalogo.jsx` e `Usuarios.jsx` traziam a MESMA string de classe, byte a
 *   byte, cada uma na sua página. Enquanto foi só duplicação, ninguém sentiu. Quando o banner de
 *   consentimento passou a ocupar a base da viewport, virou um defeito em três telas ao mesmo
 *   tempo — e sem lugar único para consertar. Extrair o componente não é arrumação: é criar o
 *   dono compartilhado que a correção precisa ter.
 *
 * A PILHA DE ELEMENTOS FIXOS
 *   Três coisas disputam o rodapé da viewport: a navegação inferior (mobile), o consentimento
 *   (enquanto não respondido) e este botão. Todas são `fixed`, então **rolar a página não move
 *   nenhuma delas** — foi por isso que a varredura marcou este botão como oclusão PERMANENTE nos
 *   quatro viewports, e não como "abaixo da dobra".
 *
 *   A ordem é: navegação encostada na base, consentimento acima dela, este botão acima dos dois.
 *   Cada um se desloca pela altura MEDIDA dos que estão abaixo, nunca por um número escolhido a
 *   dedo: a altura do banner muda com viewport, quebra de linha, escala de fonte e tradução.
 *
 * O `1.5rem` NÃO é offset de layout
 *   É o respiro entre o botão e o que está embaixo dele, equivalente ao `bottom-24`/`bottom-8`
 *   originais depois de descontada a navegação. Some quando não há nada empilhado.
 */
export default function BotaoFlutuante({ onClick, rotulo, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rotulo}
      title={rotulo}
      style={{
        bottom: 'calc(var(--admai-nav-h, 0px) + var(--admai-consent-h, 0px) + 1.5rem)',
      }}
      className="fixed right-4 lg:right-8 w-14 h-14 rounded-lg bg-accent-400 flex items-center justify-center shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)] text-dark-950 hover:bg-accent-300 transition-colors z-30 text-2xl font-light disabled:opacity-40"
    >
      {children}
    </button>
  );
}
