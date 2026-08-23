import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { avisarMudanca } from '../lib/primeiroAcesso.js';
import { sincronizarCrisp } from '../lib/crispBootstrap.js';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

const CHAVE = 'admai_cookies_consent';

/**
 * Revogação prometida na Política de Cookies §3 ("Preferências de cookies" no rodapé).
 * Remover a escolha reabre o banner — a nova decisão é EXPLÍCITA, nunca herdada — e, sem
 * consentimento vigente, o Crisp esconde já e nem carrega no próximo boot (fail-closed).
 * Este módulo é o dono único da semântica; o rodapé apenas chama o helper.
 */
export const EVENTO_PREFERENCIAS_COOKIES = 'admai:cookies-preferencias';

export function abrirPreferenciasDeCookies() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* storage bloqueado: o evento ainda reabre o banner; sem escolha gravável, tudo segue fail-closed */
  }
  sincronizarCrisp();
  window.dispatchEvent(new Event(EVENTO_PREFERENCIAS_COOKIES));
}

export function useCookieConsent() {
  const valor = localStorage.getItem(CHAVE); // null | 'all' | 'necessary'
  return {
    consentimento: valor,
    aceitouTodos: valor === 'all',
    definido: valor !== null,
  };
}

export default function CookieBanner() {
  const [oculto, setOculto] = useState(() => localStorage.getItem(CHAVE) !== null);

  function aceitar(opcao) {
    localStorage.setItem(CHAVE, opcao);
    setOculto(true);
    sincronizarCrisp();
    /* Libera a próxima superfície da sequência sem exigir recarga. [GAP-UI-02] */
    avisarMudanca();
  }

  /**
   * ESPAÇO RESERVADO — a correção de GAP-UX-CONSENT-01.
   *
   * O banner é `fixed` e nada reservava altura equivalente, então ele deitava por cima do que já
   * estava na tela. Medido em 35 superfícies: em 360px cortava o botão ENTRAR do login ao meio,
   * cobria o campo E o botão da troca de senha OBRIGATÓRIA, escondia o "INICIAR SERVIÇO" do
   * técnico em campo, e tapava a navegação inferior inteira em quase toda tela autenticada.
   *
   * POR QUE MEDIR EM VEZ DE FIXAR UM OFFSET
   *   A altura muda com o viewport (o texto quebra em mais linhas em 360 que em 1440), com a
   *   escala de fonte do sistema, com tradução futura e com o próprio conteúdo. Um `padding-bottom`
   *   constante acerta num tamanho e erra em todos os outros — e erraria calado.
   *
   * `useLayoutEffect` porque a variável precisa existir ANTES da primeira pintura: com
   * `useEffect` o usuário veria um quadro com o conteúdo na posição errada.
   */
  useEffect(() => {
    const reabrir = () => setOculto(localStorage.getItem(CHAVE) !== null);
    window.addEventListener(EVENTO_PREFERENCIAS_COOKIES, reabrir);
    return () => window.removeEventListener(EVENTO_PREFERENCIAS_COOKIES, reabrir);
  }, []);

  const caixa = useRef(null);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const publicar = () =>
      document.documentElement.style.setProperty(
        '--admai-consent-h',
        `${Math.ceil(el.getBoundingClientRect().height)}px`
      );
    publicar();
    /* jsdom não implementa ResizeObserver; a medição inicial já cobre o caso de teste. */
    const RO = globalThis.ResizeObserver;
    const obs = RO ? new RO(publicar) : null;
    obs?.observe(el);
    return () => {
      obs?.disconnect();
      /* Devolver o espaço ao sair é parte da correção: banner dispensado que continuasse
         reservando altura deixaria uma faixa morta no rodapé de todas as telas. */
      document.documentElement.style.removeProperty('--admai-consent-h');
    };
  }, [oculto]);

  if (oculto) return null;

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-label="Preferências de cookies"
      /* Senta ACIMA da navegação inferior em vez de sobre ela. As duas são `fixed` no mesmo
         canto; sem isto, a de maior z-index simplesmente apaga a outra. */
      style={{ bottom: 'var(--admai-nav-h, 0px)' }}
      className="fixed left-0 right-0 z-50 pb-safe"
    >
      <div className="max-w-3xl mx-auto m-3 bg-dark-800/95 backdrop-blur-sm border border-dark-600 rounded-xl p-4 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-md bg-accent-400/15 border border-accent-400/20 flex items-center justify-center shrink-0 mt-0.5">
            <Cookie size={17} className="text-accent-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium">
              Usamos cookies para manter sua sessão e melhorar o produto.
            </p>
            <p className="text-muted text-xs mt-0.5">
              Cookies necessários são essenciais para o funcionamento do painel. Os demais
              (analíticos e suporte) são opcionais.{' '}
              <Link
                to="/cookies"
                className="inline-flex items-center min-h-[44px] -my-3 px-1 text-accent-300 hover:text-accent-200 transition-colors"
              >
                Saiba mais
              </Link>
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <button
            onClick={() => aceitar('all')}
            className="btn-primary flex-1 min-w-[120px] text-sm min-h-[44px]"
          >
            Aceitar todos
          </button>
          <button
            onClick={() => aceitar('necessary')}
            className="btn-secondary flex-1 min-w-[120px] text-sm min-h-[44px]"
          >
            Apenas necessários
          </button>
        </div>
      </div>
    </div>
  );
}
