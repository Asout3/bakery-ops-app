import { clsx } from 'clsx';
import { AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

const Alert = ({ variant = 'info', title, children, className, ...props }) => {
  const icons = {
    info: <Info size={20} />,
    success: <CheckCircle size={20} />,
    warning: <AlertTriangle size={20} />,
    error: <AlertCircle size={20} />,
  };

  const variants = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-danger',
  };

  return (
    <div className={clsx('alert', variants[variant], className)} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }} {...props}>
      <div style={{ marginTop: '0.125rem' }}>{icons[variant]}</div>
      <div>
        {title && <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{title}</div>}
        <div style={{ fontSize: '0.9375rem' }}>{children}</div>
      </div>
    </div>
  );
};

export { Alert };
