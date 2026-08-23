import { useEffect } from 'react';

/**
 * Título/descrição/robots por rota, sem dependência nova (react-helmet ficou de fora por
 * decisão do guia: um efeito resolve).  [F6-02]
 *
 * `noindex` é o default HONESTO: o painel é privado, e página privada indexada é vazamento.
 * Só a face pública (Landing, login, legais) declara `indexavel: true`.
 */
const TITULO_BASE = 'AdmAi — Gestão para chaveiros';
const DESCRICAO_BASE =
  'Registre serviços pelo WhatsApp e acompanhe receita, comissões, estoque e avaliações num painel só.';

export function useDocumentHead({ titulo, descricao, indexavel = false } = {}) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · AdmAi` : TITULO_BASE;

    let meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', descricao ?? DESCRICAO_BASE);

    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    robots.setAttribute('content', indexavel ? 'index,follow' : 'noindex,nofollow');

    return () => {
      document.title = TITULO_BASE;
    };
  }, [titulo, descricao, indexavel]);
}
