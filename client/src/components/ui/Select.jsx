import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

const Select = forwardRef(({ className, label, options, error, ...props }, ref) => {
  return (
    <div className="form-group" style={{ position: 'relative' }}>
      {label && <label className="form-label">{label}</label>}
      <div style={{ position: 'relative' }}>
        <select
          ref={ref}
          className={clsx('input-field', error && 'error', className)}
          style={{ appearance: 'none', paddingRight: '2.5rem' }}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-muted)' }}>
          <ChevronDown size={18} />
        </div>
      </div>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
});

Select.displayName = 'Select';

export { Select };
