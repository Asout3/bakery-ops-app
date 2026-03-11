import { forwardRef } from 'react';
import { clsx } from 'clsx';

const Input = forwardRef(({ className, label, error, icon, ...props }, ref) => {
  return (
    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {label && <label className="form-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        {icon && (
          <div style={{ position: 'absolute', left: '0.875rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
            {icon}
          </div>
        )}
        <input
          ref={ref}
          className={clsx('input-field', error && 'error', className)}
          style={{ paddingLeft: icon ? '2.75rem' : '1rem' }}
          {...props}
        />
      </div>
      {error && <p className="error-message" style={{ margin: 0 }}>{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
