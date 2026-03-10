import React from 'react';
import './ui.css';

/**
 * Badge Component
 * 
 * @param {Object} props
 * @param {'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info'} props.variant - Badge style variant
 * @param {'sm' | 'md' | 'lg'} props.size - Badge size
 * @param {React.ReactNode} props.icon - Optional icon
 * @param {string} props.className - Additional CSS classes
 */
export function Badge({
  variant = 'default',
  size = 'md',
  icon,
  className = '',
  children,
  ...props
}) {
  const classNames = [
    'ui-badge',
    `ui-badge-${variant}`,
    size !== 'md' && `ui-badge-${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classNames} {...props}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Status Badge - Predefined status mappings
 */
export function StatusBadge({ status, className = '' }) {
  const statusMap = {
    // Order statuses
    pending: { variant: 'warning', label: 'Pending' },
    processing: { variant: 'info', label: 'Processing' },
    ready: { variant: 'primary', label: 'Ready' },
    completed: { variant: 'success', label: 'Completed' },
    cancelled: { variant: 'danger', label: 'Cancelled' },
    
    // General statuses
    active: { variant: 'success', label: 'Active' },
    inactive: { variant: 'default', label: 'Inactive' },
    approved: { variant: 'success', label: 'Approved' },
    rejected: { variant: 'danger', label: 'Rejected' },
    
    // Payment statuses
    paid: { variant: 'success', label: 'Paid' },
    unpaid: { variant: 'warning', label: 'Unpaid' },
    partial: { variant: 'info', label: 'Partial' },
    
    // Sync statuses
    synced: { variant: 'success', label: 'Synced' },
    unsynced: { variant: 'warning', label: 'Pending Sync' },
    failed: { variant: 'danger', label: 'Failed' },
  };

  const config = statusMap[status?.toLowerCase()] || { variant: 'default', label: status };

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}

export default Badge;
