// TourGuide — tour de onboarding interativo (estilo Intercom/Appcues) usando driver.js.
import { featureAtiva } from '../lib/featureFlags.js';
//
// NAVIGATION-AWARE: cada passo declara a `route` em que deve acontecer. Ao avançar
// (ou voltar), o tour NAVEGA para a aba correspondente via React Router, espera o
// elemento-alvo montar e só então destaca. Assim o card de "Serviços" é explicado
// DENTRO da aba Serviços, e não na tela inicial.
//
// Exporta `startTour({ force, navigate })` e `tourJaVisto()`. A CSS do driver.js é
// importada aqui (escopo do módulo), sem tocar em main.jsx/index.css.
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const STORAGE_KEY = 'admai_tour_done';
const STYLE_ID = 'admai-tour-style';

// Tema escuro do popover (paleta Industrial Técnico), injetado uma vez via <style>.
const TOUR_CSS = `
.driver-popover.admai-tour {
  background: #15181F;
  color: #E6E9EF;
  border: 1px solid #262B34;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
  font-family: inherit;
  max-width: 320px;
}
.driver-popover.admai-tour .driver-popover-title { color: #FFFFFF; font-size: 16px; font-weight: 700; }
.driver-popover.admai-tour .driver-popover-description { color: #9AA3B2; font-size: 13px; line-height: 1.5; }
.driver-popover.admai-tour .driver-popover-progress-text { color: #6B7280; font-size: 11px; letter-spacing: 0.04em; }
.driver-popover.admai-tour button.driver-popover-next-btn,
.driver-popover.admai-tour button.driver-popover-prev-btn {
  background: #1B1F27; color: #E6E9EF; border: 1px solid #2E343F; border-radius: 8px;
  text-shadow: none; font-weight: 600; font-size: 13px;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.driver-popover.admai-tour button.driver-popover-next-btn:hover,
.driver-popover.admai-tour button.driver-popover-prev-btn:hover { background: #232833; color: #FFFFFF; }
.driver-popover.admai-tour button.driver-popover-next-btn { background: #c4b5fd; color: #170b2e; border-color: transparent; }
.driver-popover.admai-tour button.driver-popover-next-btn:hover { background: #f8f9ff; color: #170b2e; }
.driver-popover.admai-tour button.driver-popover-close-btn { color: #6B7280; transition: color 0.15s; }
.driver-popover.admai-tour button.driver-popover-close-btn:hover { color: #FFFFFF; }
.driver-popover.admai-tour .driver-popover-arrow { border-color: #15181F; }
`;

function garantirEstilos() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = TOUR_CSS;
  document.head.appendChild(el);
}

// Passos do tour. `route` = aba onde o passo acontece (o tour navega até ela).
// `element` = seletor CSS a destacar (ausente = popover central). Passos cujo
// elemento não aparecer após a navegação caem para popover central (sem quebrar).
const PASSOS = [
  {
    route: '/',
    popover: {
      title: '👋 Bem-vindo ao AdmAi',
      description:
        'Vou te mostrar em poucos passos como acompanhar seus serviços e finanças, passando por cada aba. Leva menos de um minuto — pode sair quando quiser com Esc.',
    },
  },
  {
    route: '/',
    element: '[data-tour="periodos"]',
    popover: {
      title: 'Filtre por período',
      description:
        'Escolha Hoje, Semana, Mês ou um período personalizado. Todos os números do painel se ajustam.',
      side: 'bottom',
      align: 'start',
    },
  },
  {
    route: '/',
    element: '[data-tour="kpis"]',
    popover: {
      title: 'Seus números principais',
      description:
        'Receita, custo de material, comissões, serviços e ticket médio. As setinhas mostram a variação vs. o período anterior.',
      side: 'top',
      align: 'center',
    },
  },
  {
    route: '/servicos',
    element: 'a[href="/servicos"]',
    popover: {
      title: 'Aba Serviços',
      description:
        'Você está agora na aba de Serviços — aqui ficam todos os atendimentos registrados. É de onde sai a receita do painel. Use "Novo" para registrar um.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/materiais',
    element: 'a[href="/materiais"]',
    popover: {
      title: 'Aba Materiais',
      description:
        'Esta é a aba de Materiais/estoque. Cadastre o que usa nos serviços: o custo entra no cálculo do lucro e o estoque baixa automaticamente a cada serviço.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/configuracao/whatsapp',
    element: 'a[href="/configuracao/whatsapp"]',
    popover: {
      title: 'Conecte o WhatsApp',
      description:
        'O coração do AdmAi. Aqui você conecta o número da empresa (via QR Code) para registrar serviços e atender clientes direto pelo WhatsApp.',
      side: 'right',
      align: 'start',
    },
  },
  {
    route: '/',
    popover: {
      title: '🎉 Tudo pronto!',
      description:
        'Você já passeou pelas abas principais. Pode rever este tutorial quando quiser pelo botão "Ver tutorial" no cartão de boas-vindas.',
    },
  },
];

let instanciaAtiva = null; // evita dois tours simultâneos
let navegar = null; // função navigate() do React Router (injetada no startTour)
let transicionando = false; // trava enquanto navega/espera o próximo passo

export function tourJaVisto() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}
function marcarComoVisto() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* modo privado */
  }
}

const rotaAtual = () => (typeof window !== 'undefined' ? window.location.pathname : '/');
const normRota = (p) => (p || '/').replace(/\/+$/, '') || '/';
const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));
const prefereMovimentoReduzido = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Aguarda um seletor aparecer no DOM (até `timeout`). Resolve mesmo se não achar.
function esperarElemento(seletor, timeout = 2500) {
  return new Promise((resolve) => {
    if (!seletor) return resolve(false);
    const achar = () => {
      try {
        return document.querySelector(seletor);
      } catch {
        return null;
      }
    };
    if (achar()) return resolve(true);
    const inicio = Date.now();
    const id = setInterval(() => {
      if (achar()) {
        clearInterval(id);
        resolve(true);
      } else if (Date.now() - inicio > timeout) {
        clearInterval(id);
        resolve(false);
      }
    }, 80);
  });
}

// Transita para o passo `destino`: navega de aba (se preciso), espera o alvo e destaca.
function irPara(destino) {
  const drv = instanciaAtiva;
  if (!drv || transicionando) return;
  if (destino < 0) return;
  if (destino >= PASSOS.length) {
    drv.destroy();
    return;
  } // "Concluir" no último

  const passo = PASSOS[destino];
  const precisaNavegar = normRota(rotaAtual()) !== normRota(passo.route);
  if (precisaNavegar && navegar) {
    try {
      navegar(passo.route);
    } catch {
      /* router indisponível */
    }
  }

  transicionando = true;
  const espera = passo.element
    ? esperarElemento(passo.element, precisaNavegar ? 3500 : 800)
    : esperarMs(precisaNavegar ? 400 : 0);

  Promise.resolve(espera).then(() => {
    transicionando = false;
    if (instanciaAtiva && instanciaAtiva.isActive?.()) instanciaAtiva.moveTo(destino);
  });
}

/**
 * Inicia o tour de onboarding (navigation-aware).
 * @param {{ force?: boolean, navigate?: (path:string)=>void }} [opts]
 *   force=true ignora o flag "já visto" (botão "Ver tutorial").
 *   navigate = função do React Router para trocar de aba entre os passos.
 */
export function startTour({ force = false, navigate } = {}) {
  if (!force && tourJaVisto()) return;
  if (instanciaAtiva) return;
  if (navigate) navegar = navigate;

  garantirEstilos();
  transicionando = false;
  const movimentoReduzido = prefereMovimentoReduzido();

  const finalizar = () => {
    marcarComoVisto();
    instanciaAtiva = null;
    transicionando = false;
  };

  instanciaAtiva = driver({
    showProgress: true,
    allowClose: true,
    overlayColor: '#0A0C10',
    overlayOpacity: 0.72,
    stagePadding: 6,
    stageRadius: 10,
    animate: !movimentoReduzido,
    smoothScroll: !movimentoReduzido,
    popoverClass: 'admai-tour',
    progressText: '{{current}} de {{total}}',
    nextBtnText: 'Próximo',
    prevBtnText: 'Voltar',
    doneBtnText: 'Concluir',
    /* O primeiro passo não tem para onde voltar — renderizar "Voltar" habilitado ali é um
       botão que mente. driver.js aceita showButtons por passo. [SL-11] */
    // [D2 amendment] O passo do WhatsApp só entra com o flag: sem ele, o tour não mira um
    // elemento (a[href=/configuracao/whatsapp]) que o hub não renderiza no MVP.
    steps: PASSOS.filter(
      (p) => p.route !== '/configuracao/whatsapp' || featureAtiva('WHATSAPP')
    ).map((p, i) => ({
      element: p.element,
      popover: i === 0 ? { ...p.popover, showButtons: ['next', 'close'] } : p.popover,
    })),
    // Tomamos controle do avançar/voltar para sincronizar a navegação de abas.
    onNextClick: () => irPara((instanciaAtiva?.getActiveIndex() ?? 0) + 1),
    onPrevClick: () => irPara((instanciaAtiva?.getActiveIndex() ?? 0) - 1),
    onDestroyed: finalizar,
  });

  // Garante que o passo 0 começa na sua rota (normalmente '/').
  const precisaNavInicio = normRota(rotaAtual()) !== normRota(PASSOS[0].route);
  if (precisaNavInicio && navegar) {
    try {
      navegar(PASSOS[0].route);
    } catch {
      /* */
    }
  }
  setTimeout(
    () => {
      if (instanciaAtiva) instanciaAtiva.drive();
    },
    precisaNavInicio ? 450 : 0
  );
}

// Componente opcional sem render (auto-start declarativo fica no efeito do Dashboard).
export default function TourGuide() {
  return null;
}
