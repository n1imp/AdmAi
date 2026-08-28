import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button.jsx';

// Duração da animação de saída antes de desmontar (≥ --panel-motion-fast).
const EXIT_MS = 200;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let applicationLock = null;
let openOverlayCount = 0;

function acquireApplicationLock(root) {
  if (openOverlayCount === 0) {
    applicationLock = {
      root,
      overflow: document.body.style.overflow,
      rootHadInert: root?.hasAttribute('inert') ?? false,
      rootAriaHidden: root?.getAttribute('aria-hidden'),
    };
  }
  openOverlayCount += 1;
  document.body.style.overflow = 'hidden';
  root?.setAttribute('inert', '');
  root?.setAttribute('aria-hidden', 'true');
}

function releaseApplicationLock() {
  openOverlayCount = Math.max(0, openOverlayCount - 1);
  if (openOverlayCount > 0 || !applicationLock) return;

  const { root, overflow, rootHadInert, rootAriaHidden } = applicationLock;
  document.body.style.overflow = overflow;
  if (root) {
    if (!rootHadInert) root.removeAttribute('inert');
    if (rootAriaHidden === null) root.removeAttribute('aria-hidden');
    else root.setAttribute('aria-hidden', rootAriaHidden);
  }
  applicationLock = null;
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (element) =>
      !element.closest('[hidden], [aria-hidden="true"], [inert]') &&
      window.getComputedStyle(element).visibility !== 'hidden' &&
      window.getComputedStyle(element).display !== 'none'
  );
}

export default function Overlay({
  ariaLabel,
  children,
  className = '',
  closeLabel = 'Fechar',
  closeOnBackdrop = true,
  description,
  initialFocus = 'auto',
  initialFocusRef,
  onClose,
  open,
  showCloseButton = true,
  size = 'md',
  title,
  variant,
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  // "Latest ref" gravado pós-commit: o render precisa ficar puro (React pode reexecutar ou
  // descartar renders) e todos os leitores (handlers, backdrop, botão) só rodam após o commit.
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [closing, setClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Saída coreografada (F6/M3): mantém o nó montado durante a animação de saída e só
  // desmonta ao fim. Ajuste de estado no render (padrão React p/ derivar de props sem
  // atraso — evita que o dialogRef fique nulo ao abrir); o "anterior" é state, não ref,
  // para que um render descartado descarte a detecção da transição junto. Progressive
  // enhancement: sem matchMedia (ex.: jsdom) ou com prefers-reduced-motion, desmonta
  // imediatamente.
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      if (closing) setClosing(false);
    } else {
      const animar =
        typeof window.matchMedia === 'function' &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (animar) setClosing(true);
    }
  }

  // Ao entrar em "closing", agenda a desmontagem ao fim da animação de saída.
  useEffect(() => {
    if (!closing) return undefined;
    const timer = setTimeout(() => setClosing(false), EXIT_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    const applicationRoot = document.getElementById('root');
    const overlayRoot = dialogRef.current?.closest('[data-panel-overlay-root]');
    const overlayRoots = [...document.querySelectorAll('[data-panel-overlay-root]')];
    const overlayPosition = overlayRoots.indexOf(overlayRoot);
    const backgroundOverlays = overlayRoots.slice(0, Math.max(0, overlayPosition)).map((root) => ({
      root,
      hadInert: root.hasAttribute('inert'),
      ariaHidden: root.getAttribute('aria-hidden'),
    }));
    const controls = focusableElements(dialogRef.current);
    const requestedFocus = controls.includes(initialFocusRef?.current)
      ? initialFocusRef.current
      : null;
    const firstControl = controls[0];

    // initialFocus="dialog": foca o próprio diálogo (rotulado pelo título) em vez do
    // primeiro controle — melhor p/ painéis de leitura, onde o contexto deve ser
    // anunciado antes das ações. Default "auto" mantém o comportamento anterior.
    const preferido = initialFocus === 'dialog' ? dialogRef.current : firstControl;
    (requestedFocus ?? preferido ?? dialogRef.current)?.focus();

    acquireApplicationLock(applicationRoot);
    backgroundOverlays.forEach(({ root }) => {
      root.setAttribute('inert', '');
      root.setAttribute('aria-hidden', 'true');
    });

    const isTopmost = () =>
      [...document.querySelectorAll('[data-panel-overlay-root]')].at(-1) === overlayRoot;

    function handleKeyDown(event) {
      if (!isTopmost()) return;

      if (event.key === 'Escape' && !event.repeat) {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const controls = focusableElements(dialogRef.current);
      if (controls.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = controls[0];
      const last = controls.at(-1);
      const focusIsInside = dialogRef.current?.contains(document.activeElement);
      if (!focusIsInside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(event) {
      if (!isTopmost() || dialogRef.current?.contains(event.target)) return;
      (focusableElements(dialogRef.current)[0] ?? dialogRef.current)?.focus();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      releaseApplicationLock();
      backgroundOverlays.forEach(({ root, hadInert, ariaHidden }) => {
        if (!hadInert) root.removeAttribute('inert');
        if (ariaHidden === null) root.removeAttribute('aria-hidden');
        else root.setAttribute('aria-hidden', ariaHidden);
      });

      const previousFocus = previousFocusRef.current;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [initialFocus, initialFocusRef, open]);

  if (!open && !closing) return null;

  if (import.meta.env.DEV && !title && !ariaLabel) {
    console.error('Overlay requer title ou ariaLabel para possuir nome acessível.');
  }

  return createPortal(
    <div
      className="panel-ui panel-overlay-root"
      data-ui="panel"
      data-panel-overlay-root=""
      data-variant={variant || undefined}
      data-closing={closing ? 'true' : undefined}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current?.();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : ariaLabel}
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        data-size={size}
        data-variant={variant || undefined}
        data-closing={closing ? 'true' : undefined}
        className={`panel-overlay${className ? ` ${className}` : ''}`}
      >
        {(title || description || showCloseButton) && (
          <header className="panel-overlay__header">
            <div>
              {title && (
                <h2 id={titleId} className="panel-overlay__title">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="panel-overlay__description">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <IconButton label={closeLabel} onClick={() => onCloseRef.current?.()} variant="ghost">
                <X size={20} />
              </IconButton>
            )}
          </header>
        )}
        <div className="panel-overlay__body">{children}</div>
      </section>
    </div>,
    document.body
  );
}
