import { WifiOff, RefreshCw } from 'lucide-react';
import { Button, IconButton } from './ui/Button.jsx';
import FeedbackState from './ui/FeedbackState.jsx';

export default function ErroBanner({ mensagem = 'Sem conexão com a API', onRetry, acao, onAcao }) {
  const action =
    (acao && onAcao) || onRetry ? (
      <div className="flex flex-wrap gap-2">
        {acao && onAcao && (
          <Button onClick={onAcao} size="small" variant="danger">
            {acao}
          </Button>
        )}
        {onRetry && (
          <IconButton label="Tentar novamente" onClick={onRetry} variant="ghost">
            <RefreshCw size={18} />
          </IconButton>
        )}
      </div>
    ) : null;

  return (
    <FeedbackState
      state="error"
      title={mensagem}
      description=""
      icon={<WifiOff size={22} />}
      action={action}
      compact
      className="mx-4 mt-4 panel-surface"
    />
  );
}
