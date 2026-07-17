import { forwardRef, useId } from 'react';

function classes(...values) {
  return values.filter(Boolean).join(' ');
}

export const Field = forwardRef(function Field(
  {
    as = 'input',
    announceError = false,
    children,
    className = '',
    controlClassName = '',
    error,
    hint,
    id: providedId,
    label,
    required = false,
    visuallyHiddenLabel = false,
    ...controlProps
  },
  ref
) {
  const generatedId = useId().replaceAll(':', '');
  const id = providedId ?? `panel-field-${generatedId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy =
    [controlProps['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  const Control = as;
  const sharedControlProps = {
    ...controlProps,
    ref,
    id,
    required,
    className: classes('panel-field__control', controlClassName),
    'aria-describedby': describedBy,
    'aria-invalid': error ? 'true' : undefined,
  };

  return (
    <div className={classes('panel-field', className)} data-invalid={Boolean(error) || undefined}>
      <label
        htmlFor={id}
        className={classes('panel-field__label', visuallyHiddenLabel && 'panel-sr-only')}
      >
        {label}
        {required && (
          <span className="panel-field__required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      {as === 'input' ? (
        <input {...sharedControlProps} />
      ) : (
        <Control {...sharedControlProps}>{children}</Control>
      )}

      {hint && (
        <p id={hintId} className="panel-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="panel-field__error" role={announceError ? 'alert' : undefined}>
          {error}
        </p>
      )}
    </div>
  );
});

Field.displayName = 'Field';
