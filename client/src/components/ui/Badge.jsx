import { clsx } from 'clsx';

const Badge = ({ variant = 'primary', className, children, ...props }) => {
  const variants = {
    primary: { bg: 'rgba(244, 162, 97, 0.1)', color: 'var(--text-secondary)', border: '1px solid rgba(244, 162, 97, 0.2)' },
    success: { bg: 'rgba(45, 122, 56, 0.1)', color: '#2d7a38', border: '1px solid rgba(45, 122, 56, 0.2)' },
    danger: { bg: 'rgba(139, 47, 31, 0.1)', color: '#8b2f1f', border: '1px solid rgba(139, 47, 31, 0.2)' },
    warning: { bg: 'rgba(141, 90, 59, 0.1)', color: '#8d5a3b', border: '1px solid rgba(141, 90, 59, 0.2)' },
    info: { bg: 'rgba(95, 58, 36, 0.05)', color: 'var(--text-muted)', border: '1px solid rgba(95, 58, 36, 0.1)' },
  };

  const style = variants[variant] || variants.primary;

  return (
    <span
      className={clsx('badge', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.625rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '600',
        backgroundColor: style.bg,
        color: style.color,
        border: style.border,
      }}
      {...props}
    >
      {children}
    </span>
  );
};

export { Badge };
