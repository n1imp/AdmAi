import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: <CheckCircle size={18} className="text-success shrink-0" aria-hidden="true" />,
  error: <XCircle size={18} className="text-danger shrink-0" aria-hidden="true" />,
  warning: <AlertTriangle size={18} className="text-warning shrink-0" aria-hidden="true" />,
};

const BORDA = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const proximoId = useRef(0); // contador monotônico evita colisão de keys
  const timers = useRef(new Set());

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    },
    []
  );

  const toast = useCallback((mensagem, tipo = 'success') => {
    const id = proximoId.current++;
    setToasts((prev) => [...prev, { id, mensagem, tipo }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(timer);
    }, 3500);
    timers.current.add(timer);
  }, []);

  const remover = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const viewport = (
    <div
      className="panel-ui fixed top-4 left-1/2 -translate-x-1/2 z-[110] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm"
      data-ui="panel"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tipo === 'error' ? 'alert' : 'status'}
          aria-atomic="true"
          className={`flex items-center gap-3 bg-dark-800 border border-dark-600 border-l-2 ${BORDA[t.tipo] ?? 'border-l-dark-500'} rounded-lg px-4 py-3 shadow-panel animate-slide-up`}
        >
          {ICONS[t.tipo]}
          <p className="flex-1 text-sm font-medium text-white">{t.mensagem}</p>
          <button
            type="button"
            aria-label="Fechar notificação"
            onClick={() => remover(t.id)}
            className="text-muted hover:text-white min-w-11 min-h-11 inline-flex items-center justify-center"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Fora de #root inert para continuar visível e anunciável sobre dialogs. */}
      {toasts.length > 0 && createPortal(viewport, document.body)}
    </ToastContext.Provider>
  );
}
