import { AlertTriangle, CheckCircle, Inbox, LockKeyhole, RefreshCw, WifiOff } from 'lucide-react';

const DEFAULTS = {
  loading: { title: 'Carregando', description: 'Aguarde enquanto buscamos as informações.' },
  updating: { title: 'Atualizando', description: 'Salvando as informações mais recentes.' },
  empty: { title: 'Nada por aqui', description: 'Ainda não há informações para mostrar.' },
  error: {
    title: 'Não foi possível concluir',
    description: 'Tente novamente em alguns instantes.',
  },
  success: { title: 'Tudo certo', description: 'A operação foi concluída.' },
  offline: {
    title: 'Você está sem conexão',
    description: 'Alguns dados podem estar desatualizados.',
  },
  'permission-denied': {
    title: 'Acesso não permitido',
    description: 'Seu perfil não possui acesso a esta área.',
  },
};

const ICONS = {
  empty: Inbox,
  error: AlertTriangle,
  success: CheckCircle,
  offline: WifiOff,
  'permission-denied': LockKeyhole,
};

const ANNOUNCEMENT = {
  loading: { role: 'status', busy: true },
  updating: { role: 'status', busy: true },
  error: { role: 'alert' },
  success: { role: 'status' },
  offline: { role: 'status' },
};

export default function FeedbackState({
  action,
  announce = false,
  className = '',
  compact = false,
  description,
  icon,
  state = 'empty',
  title,
}) {
  const fallback = DEFAULTS[state] ?? DEFAULTS.empty;
  const semantics = ANNOUNCEMENT[state] ?? (announce ? { role: 'status' } : {});
  const Icon = ICONS[state];
  const isBusy = state === 'loading' || state === 'updating';

  return (
    <div
      className={`panel-feedback${compact ? ' panel-feedback--compact' : ''}${className ? ` ${className}` : ''}`}
      data-state={state}
      role={semantics.role}
      aria-busy={semantics.busy || undefined}
      aria-atomic={semantics.role ? 'true' : undefined}
    >
      <div className="panel-feedback__icon" aria-hidden="true">
        {icon ??
          (isBusy ? (
            <span className="panel-feedback__spinner" />
          ) : Icon ? (
            <Icon size={26} />
          ) : (
            <RefreshCw size={26} />
          ))}
      </div>
      <p className="panel-feedback__title">{title ?? fallback.title}</p>
      {(description ?? fallback.description) && (
        <p className="panel-feedback__description">{description ?? fallback.description}</p>
      )}
      {action && <div className="panel-feedback__action">{action}</div>}
    </div>
  );
}
