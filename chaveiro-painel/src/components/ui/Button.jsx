import { forwardRef } from 'react';

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export const Button = forwardRef(function Button(
  {
    children,
    className = '',
    disabled = false,
    loading = false,
    loadingLabel = 'Carregando',
    size = 'medium',
    type = 'button',
    variant = 'primary',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(
        'panel-button',
        `panel-button--${variant}`,
        size !== 'medium' && `panel-button--${size}`,
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {loading && <span className="panel-button__spinner" aria-hidden="true" />}
      <span>{children}</span>
      {loading && <span className="panel-sr-only"> — {loadingLabel}</span>}
    </button>
  );
});

Button.displayName = 'Button';

export const IconButton = forwardRef(function IconButton(
  { 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, label, children, ...props },
  ref
) {
  const accessibleLabel = ariaLabel ?? label;

  if (import.meta.env.DEV && !accessibleLabel && !ariaLabelledBy) {
    console.error('IconButton requer label, aria-label ou aria-labelledby.');
  }

  return (
    <Button
      {...props}
      ref={ref}
      size="icon"
      aria-label={accessibleLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
});

IconButton.displayName = 'IconButton';
