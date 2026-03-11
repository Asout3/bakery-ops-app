import { clsx } from 'clsx';

const Table = ({ className, children, ...props }) => {
  return (
    <div className="table-responsive" style={{ border: '1px solid var(--accent-border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <table className={clsx('table', className)} style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'var(--card-bg)' }} {...props}>
        {children}
      </table>
    </div>
  );
};

const THead = ({ className, children, ...props }) => (
  <thead className={clsx(className)} style={{ backgroundColor: 'rgba(95, 58, 36, 0.04)' }} {...props}>
    {children}
  </thead>
);

const TBody = ({ className, children, ...props }) => (
  <tbody className={clsx(className)} {...props}>
    {children}
  </tbody>
);

const TR = ({ className, children, ...props }) => (
  <tr className={clsx(className)} style={{ borderBottom: '1px solid var(--accent-border)' }} {...props}>
    {children}
  </tr>
);

const TH = ({ className, children, ...props }) => (
  <th
    className={clsx(className)}
    style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}
    {...props}
  >
    {children}
  </th>
);

const TD = ({ className, children, ...props }) => (
  <td className={clsx(className)} style={{ padding: '1rem', color: 'var(--text-primary)' }} {...props}>
    {children}
  </td>
);

export { Table, THead, TBody, TR, TH, TD };
