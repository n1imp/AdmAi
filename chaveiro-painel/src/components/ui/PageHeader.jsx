import { ArrowLeft } from 'lucide-react';
import { IconButton } from './Button.jsx';

function Heading({ level, ...props }) {
  const safeLevel = Math.min(6, Math.max(1, Number(level) || 1));
  const Component = `h${safeLevel}`;
  return <Component {...props} />;
}

export default function PageHeader({
  actions,
  backLabel = 'Voltar',
  eyebrow,
  headingLevel = 1,
  onBack,
  subtitle,
  title,
}) {
  return (
    <header className="panel-page-header">
      <div className="panel-page-header__main">
        {onBack && (
          <IconButton label={backLabel} onClick={onBack} variant="ghost">
            <ArrowLeft size={20} />
          </IconButton>
        )}
        <div className="panel-page-header__copy">
          {eyebrow && <p className="panel-page-header__eyebrow">{eyebrow}</p>}
          <Heading level={headingLevel} className="panel-page-header__title">
            {title}
          </Heading>
          {subtitle && <p className="panel-page-header__subtitle">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="panel-page-header__actions">{actions}</div>}
    </header>
  );
}
