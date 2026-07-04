import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: <CheckCircle size={18} className="text-success shrink-0" />,
  error: <XCircle size={18} className="text-danger shrink-0" />,
  warning: <AlertTriangle size={18} className="text-warning shrink-0" />,
};

const BORDA = {
  success: 'border-l-success',
  error: 'border-l-danger',
  warning: 'border-l-warning',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const proximoId = useRef(0); // contador monotônico evita colisão de keys

  const toast = useCallback((mensagem, tipo = 'success') => {
    const id = proximoId.current++;
    setToasts((prev) => [...prev, { id, mensagem, tipo }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const remover = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Portal de toasts — posicionado no topo central */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 bg-dark-800 border border-dark-600 border-l-2 ${BORDA[t.tipo] ?? 'border-l-dark-500'} rounded-lg px-4 py-3 shadow-panel animate-slide-up`}
          >
            {ICONS[t.tipo]}
            <p className="flex-1 text-sm font-medium text-white">{t.mensagem}</p>
            <button onClick={() => remover(t.id)} className="text-muted hover:text-white">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
