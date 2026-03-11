import { forwardRef } from 'react';
import { clsx } from 'clsx';

const Textarea = forwardRef(({ className, label, error, ...props }, ref) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <textarea
        ref={ref}
        className={clsx('input-field', error && 'error', className)}
        style={{ minHeight: '120px', resize: 'vertical' }}
        {...props}
      />
      {error && <p className="error-message">{error}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';

export { Textarea };
