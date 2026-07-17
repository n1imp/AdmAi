import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import FeedbackState from './ui/FeedbackState.jsx';

export default function EstadoVazio({ mensagem = 'Nenhum dado encontrado', sub = '', cta = null }) {
  const action = cta ? (
    cta.to ? (
      <Link to={cta.to} className="panel-button panel-button--primary">
        {cta.label}
      </Link>
    ) : (
      <button type="button" onClick={cta.onClick} className="panel-button panel-button--primary">
        {cta.label}
      </button>
    )
  ) : null;

  return (
    <FeedbackState
      state="empty"
      title={mensagem}
      description={sub}
      icon={<Inbox size={28} />}
      action={action}
    />
  );
}
