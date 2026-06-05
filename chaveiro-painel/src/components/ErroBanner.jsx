import { WifiOff, RefreshCw } from 'lucide-react';

export default function ErroBanner({ mensagem = 'Sem conexão com a API', onRetry, acao, onAcao }) {
  return (
    <div role="alert" className="mx-4 mt-4 rounded-lg bg-danger/10 border border-danger/30 p-4 flex items-center gap-3">
      <WifiOff size={20} className="text-danger shrink-0" />
      <span className="flex-1 text-sm text-danger">{mensagem}</span>
      {acao && onAcao && (
        <button onClick={onAcao} className="ml-3 underline font-medium min-h-[44px] px-2 text-sm text-danger hover:text-red-300">
          {acao}
        </button>
      )}
      {onRetry && (
        <button onClick={onRetry} className="text-danger hover:text-red-300 min-h-[44px] flex items-center">
          <RefreshCw size={18} />
        </button>
      )}
    </div>
  );
}
