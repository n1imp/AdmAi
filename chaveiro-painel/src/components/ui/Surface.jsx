import { forwardRef } from 'react';

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export const Surface = forwardRef(function Surface(
  { as: Component = 'section', className = '', elevation = 'base', ...props },
  ref
) {
  return (
    <Component
      ref={ref}
      className={classes(
        'panel-surface',
        elevation !== 'base' && `panel-surface--${elevation}`,
        className
      )}
      {...props}
    />
  );
});

Surface.displayName = 'Surface';

export const Row = forwardRef(function Row(
  { as, className = '', disabled = false, href, onClick, type = 'button', ...props },
  ref
) {
  const Component = as ?? (href ? 'a' : onClick ? 'button' : 'div');
  const isButton = Component === 'button';
  const isLink = Component === 'a';

  function handleClick(event) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <Component
      ref={ref}
      className={classes('panel-row', className)}
      href={isLink ? href : undefined}
      type={isButton ? type : undefined}
      disabled={isButton ? disabled : undefined}
      aria-disabled={!isButton && disabled ? 'true' : undefined}
      tabIndex={!isButton && disabled ? -1 : undefined}
      onClick={onClick || disabled ? handleClick : undefined}
      {...props}
    />
  );
});

Row.displayName = 'Row';
